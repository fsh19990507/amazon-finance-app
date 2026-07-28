// 云数据库层 —— 使用 Supabase PostgreSQL 替代 IndexedDB，实现多设备实时同步
// 自动处理 camelCase (JS) ↔ snake_case (PostgreSQL) 字段名转换
import { supabase } from './supabase.js';

// ============== 字段名转换 ==============

function toCamelCase(str) {
  return str.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
}

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

const toCamel = (obj) => transformKeys(obj, toCamelCase);
const toSnake = (obj) => transformKeys(obj, toSnakeCase);

// ============== Supabase 查询包装器 ==============

class SupabaseQuery {
  constructor(tableName) {
    this.tableName = tableName;
    this._filters = [];
    this._orderBy = null;
    this._orderAsc = true;
    this._limit = null;
  }

  _clone() {
    const q = new SupabaseQuery(this.tableName);
    q._filters = [...this._filters];
    q._orderBy = this._orderBy;
    q._orderAsc = this._orderAsc;
    q._limit = this._limit;
    return q;
  }

  where(field) {
    const q = this._clone();
    // 处理复合字段: [page+accountId] → ['page', 'accountId']
    if (field.startsWith('[') && field.endsWith(']')) {
      q._compoundFields = field.slice(1, -1).split('+').map(toSnakeCase);
    } else {
      q._currentField = toSnakeCase(field);
    }
    return q;
  }

  equals(value) {
    if (this._compoundFields) {
      // 复合字段: where('[page+accountId]').equals([page, accountId])
      const vals = Array.isArray(value) ? value : [value];
      this._compoundFields.forEach((f, i) => {
        this._filters.push({ field: f, op: 'eq', value: vals[i] !== undefined ? vals[i] : null });
      });
      this._compoundFields = null;
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
    this._orderBy = toSnakeCase(field);
    return this;
  }

  _buildQuery() {
    let query = supabase.from(this.tableName).select('*');
    for (const f of this._filters) {
      // 使用 Supabase 原生过滤方法，兼容性更好
      switch (f.op) {
        case 'eq': query = query.eq(f.field, f.value); break;
        case 'neq': query = query.neq(f.field, f.value); break;
        default: query = query.filter(f.field, f.op, f.value);
      }
    }
    if (this._orderBy) {
      query = query.order(this._orderBy, { ascending: this._orderAsc });
    }
    if (this._limit) {
      query = query.limit(this._limit);
    }
    return query;
  }

  async toArray() {
    const { data, error } = await this._buildQuery();
    if (error) throw error;
    return (data || []).map(toCamel);
  }

  async first() {
    this._limit = 1;
    const arr = await this.toArray();
    return arr[0] || null;
  }

  async count() {
    let query = supabase.from(this.tableName).select('*', { count: 'exact', head: true });
    for (const f of this._filters) {
      switch (f.op) {
        case 'eq': query = query.eq(f.field, f.value); break;
        case 'neq': query = query.neq(f.field, f.value); break;
        default: query = query.filter(f.field, f.op, f.value);
      }
    }
    const { count, error } = await query;
    if (error) throw error;
    return count || 0;
  }

  async modify(changes) {
    let query = supabase.from(this.tableName).update(toSnake(changes));
    for (const f of this._filters) {
      query = query.filter(f.field, f.op, f.value);
    }
    const { error } = await query;
    if (error) throw error;
  }

  async delete() {
    let query = supabase.from(this.tableName).delete();
    for (const f of this._filters) {
      query = query.filter(f.field, f.op, f.value);
    }
    const { error } = await query;
    if (error) throw error;
  }
}

// ============== Supabase 表包装器 ==============

// 缓存：每个表已知的列集合（启动时探测）
const TABLE_COLUMNS_CACHE = new Map();

// 从错误消息中提取缺失的列名
function extractMissingColumn(error) {
  if (!error?.message) return null;
  const m = String(error.message).match(/Could not find the '([^']+)' column/);
  return m ? m[1] : null;
}

/**
 * 探测表的列结构
 * 通过尝试 select 一个不存在的字段来获取所有列的"已知缺失集"
 * 同时用一个一次性查询返回已有的字段
 */
async function detectTableColumns(tableName) {
  // 使用 OpenAPI 不需要 service_role，但需要"探测"列
  // 简化方案：用 1 行查询拿回所有列名
  const known = new Set();
  const missing = new Set();
  try {
    const { data, error } = await supabase.from(tableName).select('*').limit(1);
    if (data && data[0]) {
      Object.keys(data[0]).forEach((k) => known.add(k));
    }
  } catch (e) {
    // ignore
  }
  return { known, missing };
}

class SupabaseTable {
  constructor(tableName, primaryKey = 'id') {
    this.tableName = tableName;
    this.primaryKey = primaryKey;
    this._knownColumns = null;
  }

  /**
   * 探测并缓存表结构
   * 已知字段保留在写入中，未知字段会被尝试写入
   */
  async _detectColumns() {
    if (this._knownColumns !== null) return this._knownColumns;
    const { known, missing } = await detectTableColumns(this.tableName);
    this._knownColumns = { known, missing };
    return this._knownColumns;
  }

  /**
   * 过滤掉已确认缺失的列
   */
  _filterMissingCols(item) {
    if (!this._knownColumns?.missing?.size) return item;
    const filtered = { ...item };
    for (const col of this._knownColumns.missing) {
      delete filtered[col];
    }
    return filtered;
  }

  /**
   * 写入容错：如果遇到列不存在错误，记录并自动剥离该列重试
   */
  async _safeInsert(rows, useUpsert = false) {
    let attemptRows = rows.map((r) => ({ ...r }));

    // 自动剥离已知缺失列
    if (this._knownColumns?.missing?.size) {
      attemptRows = attemptRows.map((r) => this._filterMissingCols(r));
    }

    for (let i = 0; i < 3 && attemptRows.length > 0; i++) {
      const { data, error } = useUpsert
        ? await supabase.from(this.tableName).upsert(attemptRows, { ignoreDuplicates: false }).select()
        : await supabase.from(this.tableName).insert(attemptRows).select();

      if (!error) {
        return data;
      }

      // 尝试识别缺失列并剥离重试
      const missingCol = extractMissingColumn(error);
      if (missingCol) {
        console.warn(`[${this.tableName}] 列 ${missingCol} 不存在，自动剥离重试`);
        if (!this._knownColumns) this._knownColumns = { known: new Set(), missing: new Set() };
        this._knownColumns.missing.add(missingCol);
        attemptRows = attemptRows.map((r) => {
          const copy = { ...r };
          delete copy[missingCol];
          return copy;
        });
        continue;
      }

      throw error;
    }

    throw new Error(`[${this.tableName}] 写入失败：多次重试后仍无法解决`);
  }

  where(field) {
    return new SupabaseQuery(this.tableName).where(field);
  }

  orderBy(field) {
    return new SupabaseQuery(this.tableName).sortBy(field);
  }

  reverse() {
    return new SupabaseQuery(this.tableName).sortBy(this.primaryKey).reverse();
  }

  limit(n) {
    return new SupabaseQuery(this.tableName).limit(n);
  }

  async toArray() {
    const { data, error } = await supabase.from(this.tableName).select('*');
    if (error) throw error;
    // 顺便缓存已知列
    if (data?.[0]) {
      this._knownColumns = this._knownColumns || { known: new Set(), missing: new Set() };
      Object.keys(data[0]).forEach((k) => this._knownColumns.known.add(k));
    }
    return (data || []).map(toCamel);
  }

  async get(id) {
    const { data, error } = await supabase.from(this.tableName).select('*').eq(this.primaryKey, id).single();
    if (error) return null;
    return data ? toCamel(data) : null;
  }

  async add(item) {
    const snakeItem = toSnake(item);
    const { [this.primaryKey]: pkVal, ...rest } = snakeItem;
    const data = await this._safeInsert([rest], true);
    return data?.[0]?.[this.primaryKey];
  }

  async put(item) {
    const snakeItem = toSnake(item);
    const pkVal = snakeItem[this.primaryKey];
    if (pkVal !== undefined && pkVal !== null) {
      const { data: existing } = await supabase.from(this.tableName).select(this.primaryKey).eq(this.primaryKey, pkVal).maybeSingle();
      if (existing) {
        // update 同样使用容错机制
        const changes = this._filterMissingCols(snakeItem);
        const { error } = await supabase.from(this.tableName).update(changes).eq(this.primaryKey, pkVal);
        if (error) {
          const missingCol = extractMissingColumn(error);
          if (missingCol) {
            this._knownColumns.missing.add(missingCol);
            return this.put(item);
          }
          throw error;
        }
        return pkVal;
      }
    }
    return this.add(item);
  }

  async bulkPut(items) {
    const ids = [];
    for (const item of items) {
      ids.push(await this.put(item));
    }
    return ids;
  }

  async bulkAdd(items) {
    if (!items?.length) return [];
    const snakeItems = items.map((it) => {
      const s = toSnake(it);
      const { [this.primaryKey]: _, ...rest } = s;
      return rest;
    });
    const data = await this._safeInsert(snakeItems, false);
    return (data || []).map((d) => d[this.primaryKey]);
  }

  async update(id, changes) {
    const snakeChanges = toSnake(changes);
    const filtered = this._filterMissingCols(snakeChanges);
    const { error } = await supabase.from(this.tableName).update(filtered).eq(this.primaryKey, id);
    if (error) {
      const missingCol = extractMissingColumn(error);
      if (missingCol) {
        this._knownColumns.missing.add(missingCol);
        return this.update(id, changes);
      }
      throw error;
    }
  }

  async delete(id) {
    const { error } = await supabase.from(this.tableName).delete().eq(this.primaryKey, id);
    if (error) throw error;
  }

  async clear() {
    const { error } = await supabase.from(this.tableName).delete().neq(this.primaryKey, 0);
    if (error) throw error;
  }

  async count() {
    const { count, error } = await supabase.from(this.tableName).select('*', { count: 'exact', head: true });
    if (error) {
      console.warn(`[count] ${this.tableName} 查询失败:`, error.message);
      return 0;
    }
    return count || 0;
  }
}

// ============== 数据库实例 ==============

const db = {
  transactions: new SupabaseTable('transactions'),
  profitReports: new SupabaseTable('profit_reports'),
  importLogs: new SupabaseTable('import_logs'),
  accounts: new SupabaseTable('accounts'),
  roles: new SupabaseTable('roles'),
  stores: new SupabaseTable('stores'),
  savedViews: new SupabaseTable('saved_views'),
  operationLogs: new SupabaseTable('operation_logs'),
  exchangeRate: new SupabaseTable('exchange_rate', 'currency_pair'),
  translations: new SupabaseTable('translations', 'key'),

  async cleanAll() {
    await Promise.all([
      this.transactions.clear(),
      this.profitReports.clear(),
      this.importLogs.clear(),
      this.operationLogs.clear()
    ]);
  },

  async factoryReset() {
    await this.cleanAll();
    await Promise.all([
      this.accounts.clear(),
      this.roles.clear(),
      this.stores.clear(),
      this.savedViews.clear(),
      this.exchangeRate.clear(),
      this.translations.clear()
    ]);
    await ensureInitialized();
  }
};

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
    console.warn('[初始化] 角色数据初始化失败（可能已存在）:', e.message);
  }

  try {
    const storeCount = await db.stores.count();
    if (storeCount === 0) {
      await db.stores.bulkPut(STORE_DEFAULTS);
    }
  } catch (e) {
    console.warn('[初始化] 店铺数据初始化失败（可能已存在）:', e.message);
  }

  try {
    const { data: existingAdmin, error: adminErr } = await supabase
      .from('accounts')
      .select('id')
      .eq('username', 'admin')
      .maybeSingle();
    if (adminErr && adminErr.code !== 'PGRST116') {
      console.warn('[初始化] 查询管理员失败:', adminErr.message);
    } else if (!existingAdmin) {
      const adminHash = hashPassword('admin');
      const { error: insertErr } = await supabase.from('accounts').insert({
        username: 'admin',
        password_hash: adminHash,
        nickname: '管理员',
        level: 4,
        must_change_password: false
      });
      if (insertErr && !String(insertErr.message || '').includes('duplicate')) {
        console.warn('[初始化] 管理员账户创建失败:', insertErr.message);
      }
    }
  } catch (e) {
    console.warn('[初始化] 管理员账户初始化失败:', e.message);
  }
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

export default db;