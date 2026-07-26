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
    const { count, error } = await this._buildQuery().select('*', { count: 'exact', head: true });
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

class SupabaseTable {
  constructor(tableName) {
    this.tableName = tableName;
  }

  where(field) {
    return new SupabaseQuery(this.tableName).where(field);
  }

  orderBy(field) {
    return new SupabaseQuery(this.tableName).sortBy(field);
  }

  reverse() {
    return new SupabaseQuery(this.tableName).sortBy('id').reverse();
  }

  limit(n) {
    return new SupabaseQuery(this.tableName).limit(n);
  }

  async toArray() {
    const { data, error } = await supabase.from(this.tableName).select('*');
    if (error) throw error;
    return (data || []).map(toCamel);
  }

  async get(id) {
    const { data, error } = await supabase.from(this.tableName).select('*').eq('id', id).single();
    if (error) return null;
    return data ? toCamel(data) : null;
  }

  async add(item) {
    const { id, ...rest } = toSnake(item);
    // 使用 upsert 避免唯一键冲突（如 username）
    const { data, error } = await supabase.from(this.tableName)
      .upsert([rest], { onConflict: 'id', ignoreDuplicates: false })
      .select();
    if (error) {
      // 如果 id 冲突，尝试不带 id 插入让数据库自动生成
      const { data: d2, error: e2 } = await supabase.from(this.tableName)
        .insert([rest])
        .select();
      if (e2) throw e2;
      return d2?.[0]?.id;
    }
    return data?.[0]?.id;
  }

  async put(item) {
    const snakeItem = toSnake(item);
    if (snakeItem.id) {
      const { data: existing } = await supabase.from(this.tableName).select('id').eq('id', snakeItem.id).single();
      if (existing) {
        const { error } = await supabase.from(this.tableName).update(snakeItem).eq('id', snakeItem.id);
        if (error) throw error;
        return snakeItem.id;
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
    const ids = [];
    for (const item of items) {
      ids.push(await this.add(item));
    }
    return ids;
  }

  async update(id, changes) {
    const snakeChanges = toSnake(changes);
    const { error } = await supabase.from(this.tableName).update(snakeChanges).eq('id', id);
    if (error) throw error;
  }

  async delete(id) {
    const { error } = await supabase.from(this.tableName).delete().eq('id', id);
    if (error) throw error;
  }

  async clear() {
    const { error } = await supabase.from(this.tableName).delete().neq('id', 0);
    if (error) throw error;
  }

  async count() {
    const { count, error } = await supabase.from(this.tableName).select('*', { count: 'exact', head: true });
    if (error) throw error;
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
  exchangeRate: new SupabaseTable('exchange_rate'),
  translations: new SupabaseTable('translations'),

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
    const adminCount = await db.accounts.where('username').equals('admin').count();
    if (adminCount === 0) {
      const adminHash = hashPassword('admin123');
      await db.accounts.add({
        username: 'admin',
        passwordHash: adminHash,
        nickname: '管理员',
        level: 4,
        mustChangePassword: true
      });
    }
  } catch (e) {
    // 唯一键冲突说明管理员已存在，忽略
    if (e.code === '23505' || (e.message && e.message.includes('duplicate'))) {
      console.log('[初始化] 管理员账户已存在，跳过创建');
    } else {
      console.warn('[初始化] 管理员账户初始化失败:', e.message);
    }
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