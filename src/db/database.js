// 数据层 —— GitHub 云端存储（替代 Supabase，免费、国内可访问、读取更快）
// 架构：
//   1. 内存层：页面查询直接读内存（毫秒级秒开，不等待网络）
//   2. 缓存层：localStorage 持久化（刷新页面/重启不丢数据）
//   3. 云端层：GitHub 私有仓库 data/db.json（Token 认证，双向同步，跨设备）
//   4. 待同步队列：离线写入先落本地，云端恢复后自动补传
// 对外接口与旧版完全兼容：db.表名.toArray/count/add/put/bulkAdd/update/delete/clear/get
//   + where(f).equals(v)/first + orderBy(f).reverse().limit(n) 链式查询
import { githubFallback, getGithubConfig, hasGithubConfig, checkGithubStatus,
  subscribeGithubStatus, readCachedDb, cacheDb, refreshFromCloud,
  markTableDirty, flushPending, pushFullDb, createEmptyDb, bumpDbWriteSeq } from './githubStore.js';

// ============== 导出兼容（旧版 checkCloudStatus 语义保留） ==============

// 离线降级标记：最近一次读取是否走了本地缓存（供顶栏/登录页提示）
export const offlineFallback = githubFallback;

/**
 * 检测云端连通性（GitHub 版）
 * @returns {Promise<{status: 'online'|'unauthorized'|'not_found'|'network_error'|'dns_fail'|'timeout', detail: string}>}
 * 未配置 GitHub 时视为"本地模式"，返回 online（不影响登录/导入流程）
 */
export async function checkCloudStatus() {
  if (!hasGithubConfig()) {
    return { status: 'online', detail: '本地模式（未配置 GitHub 云端，数据仅存本机）' };
  }
  return checkGithubStatus();
}

/**
 * 订阅云端状态变化（兼容旧接口）
 */
export function subscribeCloudStatus(cb) {
  return subscribeGithubStatus(cb);
}

/**
 * 重置离线降级标记（兼容旧接口）
 */
export function resetOfflineFallback() {
  githubFallback.active = false;
}

// ============== 密码哈希 ==============

export function hashPassword(pwd) {
  let hash = 0;
  const s = String(pwd || '');
  for (let i = 0; i < s.length; i++) {
    hash = ((hash << 5) - hash) + s.charCodeAt(i);
    hash |= 0;
  }
  return 'h_' + Math.abs(hash).toString(36);
}

// ============== 内存数据源 ==============

// 内存中的全量 db（页面查询直接读这里，秒开）
// 结构：{ version, updatedAt, tables: { 表名: [行...] } }
let memoryDb = null;

/**
 * 获取内存 db（首次调用时从 localStorage 缓存初始化，无缓存则用空结构）
 */
function getMemoryDb() {
  if (memoryDb) return memoryDb;
  const cached = readCachedDb();
  memoryDb = cached || createEmptyDb();
  return memoryDb;
}

// 表数据变更事件名（useLiveQuery 监听，云端刷新/本地写入后触发页面重新查询）
const DB_CHANGED_EVENT = 'amz-db-changed';

/**
 * 通知页面数据已变化（防抖：合并 100ms 内的多次写操作）
 */
let _changeTimer = null;
function notifyDbChanged() {
  if (_changeTimer) return;
  _changeTimer = setTimeout(() => {
    _changeTimer = null;
    window.dispatchEvent(new CustomEvent(DB_CHANGED_EVENT));
  }, 100);
}

/**
 * 读取某张表的全部行（同步，内存秒开）
 */
function getTableRows(tableName) {
  const dbObj = getMemoryDb();
  return dbObj.tables[tableName] || [];
}

/**
 * 写某张表的全部行：更新内存 + localStorage 缓存 + 标记云端待同步 + 通知页面
 */
function setTableRows(tableName, rows, enqueue = true) {
  const dbObj = getMemoryDb();
  dbObj.tables[tableName] = rows;
  dbObj.updatedAt = new Date().toISOString();
  cacheDb(dbObj);
  // 递增写入序列号（flushPending 据此检测上传期间的并发写入，避免旧快照覆盖新数据）
  bumpDbWriteSeq();
  if (enqueue) {
    // 标记该表有改动（上传时合并覆盖云端该表）
    markTableDirty(tableName);
    // 后台静默上传（失败不阻塞，稍后自动重试）
    scheduleUpload();
  }
  notifyDbChanged();
}

/**
 * 防抖触发云端上传（合并 2 秒内多次写操作，一次上传）
 */
let _uploadTimer = null;
let _uploadRunning = false;
function scheduleUpload() {
  if (!hasGithubConfig()) return;
  if (_uploadTimer) clearTimeout(_uploadTimer);
  _uploadTimer = setTimeout(() => {
    _uploadTimer = null;
    if (_uploadRunning) {
      // 上一轮上传还没结束：先标记待重传，结束后立即补跑，避免写入被丢弃
      _pendingUpload = true;
      return;
    }
    runUpload();
  }, 2000);
}

// 上传期间又有新写入时置 true，待当前上传结束后立即补传
let _pendingUpload = false;
function runUpload() {
  _uploadRunning = true;
  flushPending(getMemoryDb()).finally(() => {
    _uploadRunning = false;
    if (_pendingUpload) {
      _pendingUpload = false;
      scheduleUpload();
    }
  });
}

// 网络恢复后自动补传离线期间的待同步数据
function setupOnlineResync() {
  if (typeof window === 'undefined') return;
  window.addEventListener('online', () => {
    if (!hasGithubConfig()) return;
    if (_uploadRunning) { _pendingUpload = true; return; }
    scheduleUpload();
  });
}
setupOnlineResync();

/**
 * 串行化一次云端上传（与 scheduleUpload 共用同一把锁 _uploadRunning，
 * 避免 startCloudSync 的 flushPending 与 2 秒定时上传并发 PUT 导致 409 冲突）
 */
function enqueueUploadOnce() {
  if (!hasGithubConfig()) return Promise.resolve();
  if (_uploadRunning) {
    _pendingUpload = true;
    return Promise.resolve();
  }
  _uploadRunning = true;
  return flushPending(getMemoryDb()).finally(() => {
    _uploadRunning = false;
    if (_pendingUpload) {
      _pendingUpload = false;
      scheduleUpload();
    }
  });
}

/**
 * 根据现有行生成自增数字 id（与旧 Supabase 数字 id 兼容）
 */
function nextId(tableName) {
  const rows = getTableRows(tableName);
  let max = 0;
  rows.forEach((r) => {
    const n = Number(r.id);
    if (Number.isFinite(n) && n > max) max = n;
  });
  return max + 1;
}

/**
 * 启动时后台刷新云端数据（不阻塞渲染）
 * 拉取 GitHub db.json，若有更新则合并本地待同步改动后写内存+缓存，并通知页面
 */
export function startCloudSync() {
  if (!hasGithubConfig()) return;
  // 首次先尝试拉云端（含本地待同步合并）
  refreshFromCloud().then((res) => {
    if (res.changed && res.db) {
      memoryDb = res.db;
      notifyDbChanged();
    }
    // 随后尝试补传待同步队列（走串行上传队列，避免与定时上传并发 PUT 导致 409）
    enqueueUploadOnce().then((r) => {
      if (r && r.ok) {
        // 补传成功：刷新内存数据并通知
        refreshFromCloud().then((r2) => {
          if (r2.changed && r2.db) {
            memoryDb = r2.db;
            notifyDbChanged();
          }
        });
      }
    });
  });
}

/**
 * 手动从云端拉取并应用到内存 + UI（与 startCloudSync 的静默拉取不同，本次立即生效）
 * @returns {Promise<{changed:boolean, db:Object|null}>}
 */
export async function pullFromCloud() {
  const res = await refreshFromCloud();
  if (res.changed && res.db) {
    memoryDb = res.db;
    notifyDbChanged();
  }
  return res;
}

// ============== 链式查询 ==============

class GitHubQuery {
  constructor(table, field) {
    this.table = table;
    this._filters = [];
    this._orderBy = null;
    this._orderAsc = true;
    this._limit = null;
    // 复合字段: [page+accountId]
    if (field && field.startsWith('[') && field.endsWith(']')) {
      this._compoundFields = field.slice(1, -1).split('+');
    } else {
      this._currentField = field;
    }
  }

  equals(value) {
    if (this._compoundFields) {
      const vals = Array.isArray(value) ? value : [value];
      this._compoundFields.forEach((f, i) => {
        this._filters.push({ field: f, op: 'eq', value: vals[i] });
      });
    } else {
      this._filters.push({ field: this._currentField, op: 'eq', value });
    }
    return this;
  }

  notEqual(value) {
    this._filters.push({ field: this._currentField, op: 'neq', value });
    return this;
  }

  reverse() {
    this._orderAsc = false;
    return this;
  }

  limit(n) {
    this._limit = n;
    return this;
  }

  sortBy(field) {
    this._orderBy = field;
    return this;
  }

  _apply() {
    let rows = [...getTableRows(this.table.tableName)];
    for (const f of this._filters) {
      if (f.op === 'eq') {
        rows = rows.filter((r) => String(r?.[f.field]) === String(f.value));
      } else if (f.op === 'neq') {
        rows = rows.filter((r) => String(r?.[f.field]) !== String(f.value));
      }
    }
    if (this._orderBy) {
      const field = this._orderBy;
      rows.sort((a, b) => {
        const av = a?.[field];
        const bv = b?.[field];
        if (av === undefined || av === null) return 1;
        if (bv === undefined || bv === null) return -1;
        let cmp;
        if (typeof av === 'number' && typeof bv === 'number') {
          cmp = av - bv;
        } else {
          cmp = String(av).localeCompare(String(bv));
        }
        return this._orderAsc ? cmp : -cmp;
      });
    }
    if (this._limit !== null) rows = rows.slice(0, this._limit);
    return rows;
  }

  async toArray() {
    return this._apply();
  }

  async first() {
    return this._apply()[0] || null;
  }

  async count() {
    return this._apply().length;
  }

  async modify(changes) {
    const matches = this._apply();
    const rows = getTableRows(this.table.tableName);
    const updated = rows.map((r) => {
      const hit = matches.some((m) => String(m.id) === String(r.id));
      return hit ? { ...r, ...changes } : r;
    });
    setTableRows(this.table.tableName, updated);
  }

  async delete() {
    const matches = this._apply();
    const rows = getTableRows(this.table.tableName);
    const kept = rows.filter((r) => !matches.some((m) => String(m.id) === String(r.id)));
    setTableRows(this.table.tableName, kept);
  }
}

// ============== 表对象 ==============

class GitHubTable {
  constructor(tableName, primaryKey = 'id') {
    this.tableName = tableName;
    this.primaryKey = primaryKey;
  }

  where(field) {
    return new GitHubQuery(this, field);
  }

  orderBy(field) {
    return new GitHubQuery(this).sortBy(field);
  }

  // 表级 reverse：按主键倒序（与旧版语义一致）
  reverse() {
    return new GitHubQuery(this).sortBy(this.primaryKey).reverse();
  }

  limit(n) {
    return new GitHubQuery(this).limit(n);
  }

  async toArray() {
    return getTableRows(this.tableName);
  }

  async get(id) {
    if (id === undefined || id === null) return null;
    const rows = getTableRows(this.tableName);
    return rows.find((r) => String(r[this.primaryKey]) === String(id)) || null;
  }

  async add(item) {
    const rows = getTableRows(this.tableName);
    const row = { ...item };
    if (row.id === undefined || row.id === null) {
      row.id = nextId(this.tableName);
    }
    rows.push(row);
    setTableRows(this.tableName, rows);
    return row.id;
  }

  async put(item) {
    const rows = getTableRows(this.tableName);
    const pkVal = item?.[this.primaryKey];
    const idx = pkVal !== undefined && pkVal !== null
      ? rows.findIndex((r) => String(r[this.primaryKey]) === String(pkVal))
      : -1;
    if (idx >= 0) {
      rows[idx] = item;
    } else {
      rows.push(item);
    }
    setTableRows(this.tableName, rows);
    return pkVal ?? item.id;
  }

  async bulkPut(items) {
    const rows = getTableRows(this.tableName);
    for (const item of items) {
      const pkVal = item?.[this.primaryKey];
      const idx = pkVal !== undefined && pkVal !== null
        ? rows.findIndex((r) => String(r[this.primaryKey]) === String(pkVal))
        : -1;
      if (idx >= 0) rows[idx] = item; else rows.push(item);
    }
    setTableRows(this.tableName, rows);
    return items.map((i) => i[this.primaryKey] ?? i.id);
  }

  async bulkAdd(items) {
    if (!items?.length) return [];
    const rows = getTableRows(this.tableName);
    const ids = [];
    for (const item of items) {
      const row = { ...item };
      if (row.id === undefined || row.id === null) {
        row.id = nextId(this.tableName);
      }
      rows.push(row);
      ids.push(row.id);
    }
    setTableRows(this.tableName, rows);
    return ids;
  }

  async update(id, changes) {
    const rows = getTableRows(this.tableName);
    const idx = rows.findIndex((r) => String(r[this.primaryKey]) === String(id));
    if (idx >= 0) {
      rows[idx] = { ...rows[idx], ...changes };
      setTableRows(this.tableName, rows);
    }
  }

  async delete(id) {
    const rows = getTableRows(this.tableName);
    const kept = rows.filter((r) => String(r[this.primaryKey]) !== String(id));
    setTableRows(this.tableName, kept);
  }

  async clear() {
    setTableRows(this.tableName, []);
  }

  async count() {
    return getTableRows(this.tableName).length;
  }
}

// ============== 数据库实例 ==============

const db = {
  transactions: new GitHubTable('transactions'),
  profitReports: new GitHubTable('profit_reports'),
  importLogs: new GitHubTable('import_logs'),
  accounts: new GitHubTable('accounts'),
  roles: new GitHubTable('roles'),
  stores: new GitHubTable('stores'),
  savedViews: new GitHubTable('saved_views'),
  operationLogs: new GitHubTable('operation_logs'),
  exchangeRate: new GitHubTable('exchange_rate', 'currency_pair'),
  translations: new GitHubTable('translations', 'original'),
  settlements: new GitHubTable('settlements'),
  businessReports: new GitHubTable('business_reports'),
  adReports: new GitHubTable('ad_reports'),
  inventoryRecords: new GitHubTable('inventory_records'),

  async cleanAll() {
    for (const t of ['transactions', 'profit_reports', 'import_logs', 'operation_logs',
      'settlements', 'business_reports', 'ad_reports', 'inventory_records']) {
      await this[t].clear();
    }
  },

  /**
   * 存量数据店铺归属迁移（一次性，幂等）
   * 旧版本导入的数据没有 storeId，导致按店铺过滤时全部不可见。
   * 规则：利润报表优先按 Excel「店铺」名称匹配 stores 表；
   *       匹配不到或无名称列的表（交易/结算/业务/广告/库存）统一归入默认店铺。
   * v2：同时给所有存量行统一补写 dedupKey 店铺后缀（|storeId），
   *     保证与新导入数据格式一致，避免重复导入被误判为新数据。
   * 用 localStorage 标记 amz_store_migrated_v2 防止重复执行。
   */
  async migrateStoreIds() {
    try {
      if (localStorage.getItem('amz_store_migrated_v2')) return;
      const stores = await this.stores.toArray();
      const nameToId = new Map(stores.map((s) => [String(s.name || '').trim(), s.id]));
      // 给行补写去重键店铺后缀（dedupKey 原不含店铺），已带后缀则跳过
      const withStoreSuffix = (row) => {
        if (row.dedupKey && !row.dedupKey.endsWith(`|${row.storeId}`)) {
          row.dedupKey = `${row.dedupKey}|${row.storeId}`;
        }
        return row;
      };

      // 利润报表：按店铺名称匹配
      const profits = await this.profitReports.toArray();
      let profitChanged = false;
      for (const p of profits) {
        if (!p.storeId) {
          const matched = p.store && nameToId.get(String(p.store).trim());
          p.storeId = matched || 'default';
        }
        if (!p.dedupKey || !p.dedupKey.endsWith(`|${p.storeId}`)) {
          withStoreSuffix(p);
          profitChanged = true;
        }
      }
      if (profitChanged) await this.profitReports.bulkPut(profits);

      // 交易/结算/业务/广告/库存：无名称列，统一归入默认店铺；存量有 storeId 的行仅补 dedupKey 后缀
      // 注意：db 表属性是 camelCase（businessReports/adReports/inventoryRecords），不能用 snake_case 字符串索引
      const migrateTables = [
        this.transactions,
        this.settlements,
        this.businessReports,
        this.adReports,
        this.inventoryRecords
      ];
      for (const table of migrateTables) {
        const rows = await table.toArray();
        let changed = false;
        for (const r of rows) {
          if (!r.storeId) r.storeId = 'default';
          if (r.dedupKey && !r.dedupKey.endsWith(`|${r.storeId}`)) {
            withStoreSuffix(r);
            changed = true;
          }
        }
        if (changed) await table.bulkPut(rows);
      }

      localStorage.setItem('amz_store_migrated_v2', '1');
      localStorage.removeItem('amz_store_migrated'); // 清理旧标记
      console.log('[数据迁移] 店铺归属迁移 v2 完成');
    } catch (e) {
      // 迁移失败不阻塞启动，下次启动会重试
      console.warn('[数据迁移] 店铺归属迁移失败:', e?.message || e);
    }
  },

  async factoryReset() {
    await this.cleanAll();
    for (const t of ['accounts', 'roles', 'stores', 'saved_views', 'exchange_rate', 'translations']) {
      await this[t].clear();
    }
    await ensureInitialized();
  }
};

export default db;

// ============== 初始化 ==============

const ROLE_DEFAULTS = [
  { level: 4, name: '管理员', description: '全部权限' },
  { level: 3, name: '高级用户', description: '批量删除、导出PDF、视图管理' },
  { level: 2, name: '普通用户', description: '导入数据、单条删除、导出Excel' },
  { level: 1, name: '只读用户', description: '仅查看数据' }
];

const STORE_DEFAULTS = [
  { id: 'default', name: '默认店铺', site: '美国', currency: 'USD' }
];

export async function ensureInitialized() {
  try {
    const roleCount = await db.roles.count();
    if (roleCount === 0) {
      await db.roles.bulkPut(ROLE_DEFAULTS);
    }
  } catch (e) {
    console.warn('[初始化] 角色数据初始化失败:', e.message);
  }

  try {
    const storeCount = await db.stores.count();
    if (storeCount === 0) {
      await db.stores.bulkPut(STORE_DEFAULTS);
    }
  } catch (e) {
    console.warn('[初始化] 店铺数据初始化失败:', e.message);
  }

  try {
    const existingAdmin = await db.accounts.where('username').equals('admin').first();
    if (!existingAdmin) {
      await db.accounts.add({
        username: 'admin',
        passwordHash: hashPassword('admin'),
        nickname: '管理员',
        level: 4,
        mustChangePassword: false
      });
    }
  } catch (e) {
    console.warn('[初始化] 管理员账户初始化失败:', e.message);
  }

  // 启动后台云端同步（不阻塞）
  startCloudSync();
}
