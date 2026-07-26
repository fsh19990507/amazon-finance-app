// 数据迁移：从本地 IndexedDB (Dexie) → Supabase 云数据库
// 在应用启动时自动检测并执行，确保多设备数据一致
import Dexie from 'dexie';
import { supabase } from './supabase.js';

// 旧数据库名（Dexie 的 IndexedDB）
const OLD_DB_NAME = 'amazonFinanceDB';

// ============== 字段名转换 ==============

function toSnakeCase(str) {
  return str.replace(/[A-Z]/g, (c) => '_' + c.toLowerCase());
}

function transformKeys(obj, keyFn) {
  if (!obj || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map((v) => transformKeys(v, keyFn));
  const result = {};
  for (const [key, value] of Object.entries(obj)) {
    result[keyFn(key)] = value;
  }
  return result;
}

const toSnake = (obj) => transformKeys(obj, toSnakeCase);

// ============== 迁移逻辑 ==============

/**
 * 打开旧 IndexedDB 并读取所有数据
 */
async function readOldData() {
  try {
    const oldDb = new Dexie(OLD_DB_NAME);
    oldDb.version(1).stores({
      transactions: 'id,date,month,type,status,orderId,dedupKey,storeId',
      profitReports: 'id,month,dedupKey,storeId',
      importLogs: 'id,importedAt',
      accounts: 'id,username',
      roles: 'id',
      stores: 'id',
      savedViews: 'id,page,accountId,createdAt',
      operationLogs: 'id,createdAt',
      exchangeRate: 'currencyPair',
      translations: 'id,originalText'
    });

    await oldDb.open();
    console.log('[迁移] 旧IndexedDB已打开，开始读取数据...');

    const data = {};
    const tables = ['transactions', 'profitReports', 'importLogs', 'accounts', 'roles', 'stores', 'savedViews', 'operationLogs', 'exchangeRate', 'translations'];

    for (const table of tables) {
      try {
        data[table] = await oldDb.table(table).toArray();
        console.log(`[迁移] ${table}: ${data[table].length} 条`);
      } catch (e) {
        console.warn(`[迁移] 读取 ${table} 失败:`, e.message);
        data[table] = [];
      }
    }

    oldDb.close();
    return data;
  } catch (e) {
    console.warn('[迁移] 无法打开旧IndexedDB（可能不存在）:', e.message);
    return null;
  }
}

/**
 * 将数据写入 Supabase
 */
async function writeToSupabase(tableName, rows) {
  if (!rows || rows.length === 0) return { success: 0, error: 0 };

  const snakeRows = rows.map(toSnake);
  let success = 0;
  let error = 0;

  // 分批插入，每批最多500条
  const BATCH_SIZE = 500;
  for (let i = 0; i < snakeRows.length; i += BATCH_SIZE) {
    const batch = snakeRows.slice(i, i + BATCH_SIZE);
    try {
      const { error: err } = await supabase.from(tableName).upsert(batch, { onConflict: 'id' });
      if (err) {
        console.error(`[迁移] ${tableName} 批次${i}写入失败:`, err.message);
        // 逐条重试
        for (const row of batch) {
          try {
            const { error: e2 } = await supabase.from(tableName).upsert([row], { onConflict: 'id' });
            if (e2) {
              error++;
              console.error(`[迁移] ${tableName} 单条写入失败:`, e2.message);
            } else {
              success++;
            }
          } catch {
            error++;
          }
        }
      } else {
        success += batch.length;
      }
    } catch (e) {
      console.error(`[迁移] ${tableName} 批次写入异常:`, e.message);
      error += batch.length;
    }
  }

  console.log(`[迁移] ${tableName}: 成功 ${success}, 失败 ${error}`);
  return { success, error };
}

/**
 * 执行完整迁移
 * @returns {Promise<{migrated: boolean, stats: object}>}
 */
export async function runMigration() {
  try {
    console.log('========================================');
    console.log('[迁移] 开始检查是否需要数据迁移...');
    console.log('========================================');

    // 1. 检查 Supabase 是否已有数据
    const { count: txCount } = await supabase.from('transactions').select('*', { count: 'exact', head: true });
    const { count: prCount } = await supabase.from('profit_reports').select('*', { count: 'exact', head: true });

    if ((txCount || 0) > 0 || (prCount || 0) > 0) {
      console.log(`[迁移] Supabase已有数据 (transactions:${txCount}, profit_reports:${prCount})，跳过迁移`);
      return { migrated: false, stats: { reason: 'supabase_has_data' } };
    }

    // 2. 读取旧 IndexedDB 数据
    const oldData = await readOldData();
    if (!oldData) {
      console.log('[迁移] 未找到旧IndexedDB数据，跳过迁移');
      return { migrated: false, stats: { reason: 'no_old_data' } };
    }

    const totalOldRows = Object.values(oldData).reduce((s, arr) => s + arr.length, 0);
    if (totalOldRows === 0) {
      console.log('[迁移] 旧IndexedDB无数据，跳过迁移');
      return { migrated: false, stats: { reason: 'old_data_empty' } };
    }

    console.log(`[迁移] 发现 ${totalOldRows} 条旧数据，开始迁移到Supabase...`);

    // 3. 写入 Supabase（按依赖顺序：先基础表，后数据表）
    const writeOrder = ['roles', 'stores', 'accounts', 'exchangeRate', 'translations', 'profitReports', 'transactions', 'importLogs', 'savedViews', 'operationLogs'];

    const stats = {};
    let totalSuccess = 0;
    let totalError = 0;

    for (const table of writeOrder) {
      const rows = oldData[table] || [];
      if (rows.length > 0) {
        const result = await writeToSupabase(table, rows);
        stats[table] = result;
        totalSuccess += result.success;
        totalError += result.error;
      }
    }

    console.log('========================================');
    console.log(`[迁移] 完成! 成功: ${totalSuccess}, 失败: ${totalError}`);
    console.log('========================================');

    return {
      migrated: true,
      stats: { ...stats, totalSuccess, totalError }
    };
  } catch (e) {
    console.error('[迁移] 迁移过程出错:', e);
    return { migrated: false, stats: { error: e.message } };
  }
}

/**
 * 检查并显示迁移状态（用于UI提示）
 */
export async function checkMigrationStatus() {
  try {
    const { count: txCount } = await supabase.from('transactions').select('*', { count: 'exact', head: true });
    const { count: prCount } = await supabase.from('profit_reports').select('*', { count: 'exact', head: true });
    return {
      hasData: (txCount || 0) > 0 || (prCount || 0) > 0,
      transactionsCount: txCount || 0,
      profitReportsCount: prCount || 0
    };
  } catch {
    return { hasData: false, transactionsCount: 0, profitReportsCount: 0 };
  }
}