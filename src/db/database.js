// 云数据库层 —— 使用 Supabase PostgreSQL 替代 IndexedDB，实现多设备实时同步
// 自动处理 camelCase (JS) ↔ snake_case (PostgreSQL) 字段名转换
// 支持云端不可达时自动降级到 localStorage 缓存（只读降级）+ 离线写队列
import { supabase, supabaseUrl, getSupabaseHeaders } from './supabase.js';

// 云端查询超时（毫秒）：DNS 失败/网络不可达时首次请求可能长时间挂起，
// 超过该时间直接走缓存回退，保证页面 6 秒内出数据
const CLOUD_QUERY_TIMEOUT = 6000;

// 全局兜底：withCloudTimeout 超时后，原 Supabase 查询仍在后台运行，
// 其 rejection 可能绕过 wrapped 的 catch 直接触发 unhandledrejection（控制台红字）。
// cloud_timeout 是系统预期的超时信号（已由调用方走缓存回退），这里统一静默吸收，
// 避免离线/网络异常时控制台刷错误。
if (typeof window !== 'undefined') {
  window.addEventListener('unhandledrejection', (ev) => {
    const msg = String(ev?.reason?.message || ev?.reason || '');
    if (msg.includes('cloud_timeout')) {
      ev.preventDefault();
    }
  });
}

// ============== 云端连通性检测 ==============

// 最近一次云端检测结果缓存（5 秒内不重复检测，避免频繁请求）
let lastCloudCheck = { result: null, at: 0 };

// 全局云端状态订阅者（登录页 / 顶栏提示条监听用）
const cloudStatusListeners = new Set();

// 离线降级标记：最近一次读取是否走了本地缓存
export const offlineFallback = { active: false, tables: [] };

function notifyCloudListeners(result) {
  cloudStatusListeners.forEach((cb) => {
    try { cb(result); } catch (e) { /* 忽略监听器错误 */ }
  });
}

/**
 * 检测 Supabase 云端连通性
 * @returns {Promise<{status: 'online'|'dns_fail'|'timeout'|'network_error', detail: string}>}
 */
export async function checkCloudStatus() {
  // 5 秒内复用上次结果
  if (lastCloudCheck.result && Date.now() - lastCloudCheck.at < 5000) {
    return lastCloudCheck.result;
  }

  const result = { status: 'online', detail: '' };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);

  try {
    // 用最轻量的查询探测可达性（roles 表通常最小）
    const res = await fetch(`${supabaseUrl}/rest/v1/roles?select=id&limit=1`, {
      method: 'GET',
      headers: getSupabaseHeaders(),
      signal: controller.signal
    });
    clearTimeout(timer);
    // 只要服务端有响应（含 4xx 权限错误）都视为"可达"
    result.status = 'online';
  } catch (e) {
    clearTimeout(timer);
    const msg = String(e?.message || e?.name || '');
    if (e?.name === 'AbortError' || msg.includes('abort')) {
      result.status = 'timeout';
      result.detail = '连接超时（5秒无响应）';
    } else if (msg.includes('resolve') || msg.includes('ENOTFOUND') || msg.includes('getaddrinfo') || msg.includes('DNS')) {
      result.status = 'dns_fail';
      result.detail = '域名解析失败（多为网络环境限制，如国内网络访问 supabase.co）';
    } else {
      result.status = 'network_error';
      result.detail = msg || '网络异常';
    }
  }

  lastCloudCheck = { result, at: Date.now() };
  notifyCloudListeners(result);
  return result;
}

/**
 * 订阅云端状态变化
 * @param {(result: object) => void} cb 回调
 * @returns {() => void} 取消订阅函数
 */
export function subscribeCloudStatus(cb) {
  cloudStatusListeners.add(cb);
  return () => cloudStatusListeners.delete(cb);
}

/**
 * 标记一次读取走了本地缓存
 */
function markOfflineFallback(tableName) {
  offlineFallback.active = true;
  if (!offlineFallback.tables.includes(tableName)) {
    offlineFallback.tables.push(tableName);
  }
}

/**
 * 重置离线降级标记（云端恢复后调用）
 */
export function resetOfflineFallback() {
  offlineFallback.active = false;
  offlineFallback.tables = [];
}

// ============== 字段名转换 ==============

function toCamelCase(str) {
  return str.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
}

// Supabase 端的时间戳列（如 updated_at / created_at）需要 ISO 8601 字符串，
// 而前端很多地方写入的是 Date.now() 这种数字。这里在序列化阶段做一次智能转换。
function normalizeTimestampFields(snakeObj) {
  if (!snakeObj || typeof snakeObj !== 'object') return snakeObj;
  const out = { ...snakeObj };
  for (const k of Object.keys(out)) {
    if (/_at$|_time$|time$/i.test(k) && typeof out[k] === 'number' && Number.isFinite(out[k])) {
      // 仅在数值看起来像毫秒时间戳时才转换（> 1973 年）
      if (out[k] > 100000) {
        out[k] = new Date(out[k]).toISOString();
      }
    }
  }
  return out;
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

// ============== 云端查询超时包装 ==============

// 给 Supabase 查询加超时：超时抛错，调用方据此走缓存回退
// （原查询仍在后台运行，其结果会被忽略，无副作用）
function withCloudTimeout(promise) {
  // 注意：Supabase 的 builder 是 thenable（有 then 无 catch），且 .then() 会触发实际请求。
  // 这里用"手动挂回调"的方式：原查询的结果只做 resolve 转发，其 rejection 在回调里被消费
  // （不会产生 unhandled rejection）；超时则由外层 promise 单独 reject，调用方 await 捕获。
  // 若原查询先 settle，timeout 稍后的 reject 因 promise 已 settle 而成为 no-op，无副作用。
  let timer;
  const wrapped = new Promise((resolve, reject) => {
    const p = Promise.resolve(promise);
    p.then(
      (val) => { if (timer) { clearTimeout(timer); timer = null; } resolve(val); },
      () => { /* 原查询失败：忽略（走超时或已被外层处理） */ }
    );
    timer = setTimeout(() => reject(new Error('cloud_timeout')), CLOUD_QUERY_TIMEOUT);
  });
  // 兜底：即使个别调用方因组件卸载/竞态没来得及 await，rejection 也不会变成 unhandled rejection。
  // （.catch 返回的新 promise 被丢弃，不影响 await 方正常捕获；原 wrapped 的 await 捕获不受影响）
  wrapped.catch(() => {});
  return wrapped;
}

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
    try {
      const { data, error } = await this._buildQuery();
      if (error) throw error;
      const camel = (data || []).map(toCamel);
      // 云端成功：写入缓存（供离线降级）
      try {
        localStorage.setItem(`amz_finance_cache_${this.tableName}`, JSON.stringify(camel));
      } catch (e) { /* ignore */ }
      return camel;
    } catch (e) {
      // 云端失败：回退本地缓存
      try {
        const raw = localStorage.getItem(`amz_finance_cache_${this.tableName}`);
        if (raw !== null) {
          const cached = JSON.parse(raw);
          if (Array.isArray(cached)) {
            markOfflineFallback(this.tableName);
            return cached;
          }
        }
      } catch (e2) { /* ignore */ }
      throw e;
    }
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

  // ===== localStorage 缓存层（云端不可达时的只读降级） =====
  _cacheKey() {
    return `amz_finance_cache_${this.tableName}`;
  }

  // 待同步队列：离线写入的数据先落本地，云端恢复后自动补传
  _pendingKey() {
    return `amz_finance_pending_${this.tableName}`;
  }

  _readCache() {
    try {
      const raw = localStorage.getItem(this._cacheKey());
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }

  _writeCache(data) {
    try {
      if (data === null || data === undefined) return;
      localStorage.setItem(this._cacheKey(), JSON.stringify(data));
    } catch (e) {
      // localStorage 满或不可用，忽略
    }
  }

  _clearCache() {
    try {
      localStorage.removeItem(this._cacheKey());
    } catch (e) { /* ignore */ }
  }

  _readPending() {
    try {
      return JSON.parse(localStorage.getItem(this._pendingKey())) || [];
    } catch (e) {
      return [];
    }
  }

  _writePending(rows) {
    try {
      localStorage.setItem(this._pendingKey(), JSON.stringify(rows));
    } catch (e) { /* ignore */ }
  }

  _clearPending() {
    try {
      localStorage.removeItem(this._pendingKey());
    } catch (e) { /* ignore */ }
  }

  // 是否处于离线状态：最近读走过缓存，或云端检测不可达
  async _isOffline() {
    if (offlineFallback.active) return true;
    try {
      const s = await checkCloudStatus();
      return s.status !== 'online';
    } catch (e) {
      return true;
    }
  }

  // 云端恢复后，把待同步队列补传到云端（成功则清空队列）
  async _flushPending() {
    const pending = this._readPending();
    if (!pending.length) return;
    try {
      const snake = pending.map((p) => normalizeTimestampFields(toSnake(p)));
      const { error } = await supabase.from(this.tableName).upsert(snake, { ignoreDuplicates: false });
      if (!error) {
        console.log(`[${this.tableName}] 离线数据已同步到云端 ${pending.length} 条`);
        this._clearPending();
        // 云端数据已更新，下次读取直接拉云端（清缓存避免旧数据覆盖）
        this._clearCache();
      }
    } catch (e) {
      console.warn(`[${this.tableName}] 待同步队列补传失败（仍离线），稍后自动重试:`, e.message);
    }
  }

  // 离线写入：落本地缓存 + 待同步队列，保证导入/修改立即可见
  // mergeKey 提供时按该键覆盖（upsert 语义，用于 put/update 场景）
  _writeOffline(items, mergeKey = null) {
    const cached = this._readCache() || [];
    const pending = this._readPending();
    const written = [];
    for (const item of items) {
      const withId = { ...item };
      if (withId.id === undefined || withId.id === null) {
        withId.id = Date.now() + Math.floor(Math.random() * 100000);
      }
      if (mergeKey && withId[mergeKey] !== undefined && withId[mergeKey] !== null) {
        const k = withId[mergeKey];
        const pi = pending.findIndex((p) => p[mergeKey] === k);
        if (pi >= 0) pending[pi] = withId; else pending.push(withId);
        const ci = cached.findIndex((c) => c[mergeKey] === k);
        if (ci >= 0) cached[ci] = withId; else cached.push(withId);
      } else {
        pending.push(withId);
        cached.push(withId);
      }
      written.push(withId);
    }
    this._writePending(pending);
    this._writeCache(cached);
    markOfflineFallback(this.tableName);
    return written;
  }

  // 云端失败时回退缓存（只读降级），返回 null 表示无缓存
  _fallbackToCache() {
    const cached = this._readCache();
    if (cached !== null) {
      markOfflineFallback(this.tableName);
      return cached;
    }
    return null;
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

    // 最多剥离 50 个缺失列（足够处理利润报表的所有列）
    for (let i = 0; i < 50 && attemptRows.length > 0; i++) {
      const { data, error } = useUpsert
        ? await supabase.from(this.tableName).upsert(attemptRows, { ignoreDuplicates: false }).select()
        : await supabase.from(this.tableName).insert(attemptRows).select();

      if (!error) {
        if (i > 0) console.log(`[${this.tableName}] 写入成功（剥离了 ${i} 个缺失列）`);
        return data;
      }

      // 尝试识别缺失列并剥离重试
      const missingCol = extractMissingColumn(error);
      if (missingCol) {
        console.warn(`[${this.tableName}] 列 ${missingCol} 不存在，自动剥离重试 (${i + 1}/50)`);
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

    throw new Error(`[${this.tableName}] 写入失败：剥离 50 个缺失列后仍无法解决`);
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
    try {
      const { data, error } = await withCloudTimeout(supabase.from(this.tableName).select('*'));
      if (error) throw error;
      const camel = (data || []).map(toCamel);
      // 云端成功：写入缓存，供离线降级使用
      this._writeCache(camel);
      // 云端恢复：尝试补传待同步队列（不阻塞返回）
      this._flushPending();
      // 顺便缓存已知列
      if (data?.[0]) {
        this._knownColumns = this._knownColumns || { known: new Set(), missing: new Set() };
        Object.keys(data[0]).forEach((k) => this._knownColumns.known.add(k));
      }
      return camel;
    } catch (e) {
      // 云端失败：回退本地缓存（只读降级）
      const cached = this._fallbackToCache();
      if (cached !== null) {
        console.warn(`[${this.tableName}] 云端不可用，使用本地缓存(${cached.length}条)`);
        return cached;
      }
      throw e;
    }
  }

  async get(id) {
    if (id === undefined || id === null) return null;
    // URL 安全处理：主键值可能包含特殊字符（空格、&、+、% 等），
    // 直接用 .eq() 会导致 Supabase REST 返回 400。这里手工拼 query string 并做 URI 编码。
    const encodedKey = encodeURIComponent(this.primaryKey);
    const encodedVal = encodeURIComponent(String(id));
    const url = `${supabaseUrl}/rest/v1/${this.tableName}?select=*&${encodedKey}=eq.${encodedVal}&limit=1`;
    try {
      const res = await fetch(url, {
        headers: getSupabaseHeaders(),
        method: 'GET'
      });
      if (!res.ok) {
        // 400 多为主键值含特殊字符导致，作为"未命中"处理
        if (res.status === 400) return null;
        return null;
      }
      const arr = await res.json();
      if (!arr || arr.length === 0) return null;
      const item = toCamel(arr[0]);
      // 写入缓存
      const cached = this._readCache() || [];
      const idx = cached.findIndex((c) => String(c[this.primaryKey]) === String(id));
      if (idx >= 0) cached[idx] = item; else cached.push(item);
      this._writeCache(cached);
      return item;
    } catch {
      // 云端失败：回退缓存中匹配主键的记录
      const cached = this._readCache();
      if (cached && Array.isArray(cached)) {
        const hit = cached.find((c) => String(c[this.primaryKey]) === String(id));
        if (hit) {
          markOfflineFallback(this.tableName);
          return hit;
        }
      }
      return null;
    }
  }

  async add(item) {
    // 离线：写入本地缓存 + 待同步队列（存 camelCase 保持缓存格式一致）
    if (await this._isOffline()) {
      const written = this._writeOffline([item]);
      return written[0][this.primaryKey];
    }
    const snakeItem = normalizeTimestampFields(toSnake(item));
    // 仅当主键为自增 id 且未提供值时才剔除；对于业务主键（如 original / currency_pair）必须保留
    const pkVal = snakeItem[this.primaryKey];
    const insertData = (pkVal === undefined || pkVal === null)
      ? (() => { const { [this.primaryKey]: _, ...rest } = snakeItem; return rest; })()
      : snakeItem;
    const data = await this._safeInsert([insertData], true);
    // 写成功：清除缓存，下次读取重新拉取云端
    this._clearCache();
    this._flushPending();
    return data?.[0]?.[this.primaryKey];
  }

  async put(item) {
    const pkVal = item?.[this.primaryKey];
    // 离线：本地写入（按主键覆盖）
    if (await this._isOffline()) {
      const written = this._writeOffline([item], this.primaryKey);
      return pkVal !== undefined && pkVal !== null ? pkVal : written[0][this.primaryKey];
    }
    const snakeItem = normalizeTimestampFields(toSnake(item));
    if (pkVal !== undefined && pkVal !== null) {
      const { data: existing } = await supabase.from(this.tableName).select(this.primaryKey).eq(this.primaryKey, pkVal).maybeSingle();
      if (existing) {
        // update 时剔除主键本身，避免将主键作为普通字段写入（部分表主键有 NOT NULL 约束或自增属性）
        const { [this.primaryKey]: _pk, ...restChanges } = snakeItem;
        const changes = this._filterMissingCols(restChanges);
        const { error } = await supabase.from(this.tableName).update(changes).eq(this.primaryKey, pkVal);
        if (error) {
          const missingCol = extractMissingColumn(error);
          if (missingCol) {
            // 必须先确保 _knownColumns 已初始化，否则访问 .missing 会抛 null 异常
            if (!this._knownColumns) this._knownColumns = { known: new Set(), missing: new Set() };
            this._knownColumns.missing.add(missingCol);
            return this.put(item);
          }
          throw error;
        }
        this._clearCache();
        this._flushPending();
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
    // 离线：全部落本地缓存 + 待同步队列（导入数据立即可见）
    if (await this._isOffline()) {
      const written = this._writeOffline(items);
      return written.map((w) => w[this.primaryKey]);
    }
    const snakeItems = items.map((it) => {
      const s = normalizeTimestampFields(toSnake(it));
      const pkVal = s[this.primaryKey];
      // 仅当主键未提供值时才剔除（自增 id 场景）；业务主键需保留
      if (pkVal === undefined || pkVal === null) {
        const { [this.primaryKey]: _, ...rest } = s;
        return rest;
      }
      return s;
    });
    const data = await this._safeInsert(snakeItems, false);
    this._clearCache();
    this._flushPending();
    return (data || []).map((d) => d[this.primaryKey]);
  }

  async update(id, changes) {
    // 离线：直接改本地缓存 + 待同步队列（若该行在队列中）
    if (await this._isOffline()) {
      const cached = this._readCache();
      if (cached && Array.isArray(cached)) {
        const idx = cached.findIndex((c) => String(c[this.primaryKey]) === String(id));
        if (idx >= 0) cached[idx] = { ...cached[idx], ...changes };
        this._writeCache(cached);
      }
      const pending = this._readPending();
      const pi = pending.findIndex((p) => String(p[this.primaryKey]) === String(id));
      if (pi >= 0) {
        pending[pi] = { ...pending[pi], ...changes };
        this._writePending(pending);
      }
      markOfflineFallback(this.tableName);
      return;
    }
    const snakeChanges = normalizeTimestampFields(toSnake(changes));
    // update 时剔除主键本身，避免主键被当作普通字段更新
    const { [this.primaryKey]: _pk, ...restChanges } = snakeChanges;
    const filtered = this._filterMissingCols(restChanges);
    const { error } = await supabase.from(this.tableName).update(filtered).eq(this.primaryKey, id);
    if (error) {
      const missingCol = extractMissingColumn(error);
      if (missingCol) {
        // 必须先确保 _knownColumns 已初始化，否则访问 .missing 会抛 null 异常
        if (!this._knownColumns) this._knownColumns = { known: new Set(), missing: new Set() };
        this._knownColumns.missing.add(missingCol);
        return this.update(id, changes);
      }
      throw error;
    }
    this._clearCache();
    this._flushPending();
  }

  async delete(id) {
    // 离线：从本地缓存 + 待同步队列移除
    if (await this._isOffline()) {
      const cached = this._readCache();
      if (cached && Array.isArray(cached)) {
        this._writeCache(cached.filter((c) => String(c[this.primaryKey]) !== String(id)));
      }
      const pending = this._readPending();
      this._writePending(pending.filter((p) => String(p[this.primaryKey]) !== String(id)));
      markOfflineFallback(this.tableName);
      return;
    }
    const { error } = await supabase.from(this.tableName).delete().eq(this.primaryKey, id);
    if (error) throw error;
    this._clearCache();
    this._flushPending();
  }

  async clear() {
    // 离线：直接清本地
    if (await this._isOffline()) {
      this._clearCache();
      this._clearPending();
      return;
    }
    const { error } = await supabase.from(this.tableName).delete().neq(this.primaryKey, 0);
    if (error) throw error;
    this._clearCache();
    this._clearPending();
  }

  async count() {
    try {
      const { count, error } = await withCloudTimeout(
        supabase.from(this.tableName).select('*', { count: 'exact', head: true })
      );
      if (error) {
        console.warn(`[count] ${this.tableName} 查询失败:`, error.message);
        return 0;
      }
      return count || 0;
    } catch (e) {
      // 云端不可达（超时/网络失败）：回退本地缓存条数，避免统计卡片报错
      const cached = this._readCache();
      if (Array.isArray(cached)) {
        markOfflineFallback(this.tableName);
        return cached.length;
      }
      console.warn(`[count] ${this.tableName} 云端不可用且无缓存，返回 0:`, e?.message);
      return 0;
    }
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
  translations: new SupabaseTable('translations', 'original'),
  // ===== 新增：亚马逊报表全面解读（结算/业务/广告/库存） =====
  settlements: new SupabaseTable('settlements'),
  businessReports: new SupabaseTable('business_reports'),
  adReports: new SupabaseTable('ad_reports'),
  inventoryRecords: new SupabaseTable('inventory_records'),

  async cleanAll() {
    await Promise.all([
      this.transactions.clear(),
      this.profitReports.clear(),
      this.importLogs.clear(),
      this.operationLogs.clear(),
      this.settlements.clear(),
      this.businessReports.clear(),
      this.adReports.clear(),
      this.inventoryRecords.clear()
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