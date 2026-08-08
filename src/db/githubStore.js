// GitHub 云端数据存储层 —— 用 GitHub 仓库替代 Supabase，作为免费云端数据库
// 核心设计：
//   1. 所有表合并存到仓库的单个文件 data/db.json（一次请求拉全部数据，读取最快）
//   2. 本地 localStorage 缓存秒开：页面先显示缓存，后台静默拉取云端刷新
//   3. Token 认证写回 GitHub（GitHub Contents API + sha 乐观锁）
//   4. 待同步队列：离线写入先落本地，云端恢复后自动合并上传
// 依赖说明：无第三方依赖，直接用 fetch 调 GitHub REST API

// ============== 配置管理 ==============

const CONFIG_KEY = 'amz_github_config';
const CACHE_KEY = 'amz_gh_db';
const SHA_KEY = 'amz_gh_db_sha';
const DB_PATH = 'data/db.json';

// 云端状态订阅者（顶栏/设置页提示用）
const githubStatusListeners = new Set();
let lastGitHubCheck = { result: null, at: 0 };

// 当前配置（启动时从 localStorage 读取）
let currentConfig = null;
try {
  const raw = localStorage.getItem(CONFIG_KEY);
  if (raw) currentConfig = JSON.parse(raw);
} catch (e) { currentConfig = null; }

export const githubFallback = { active: false };

// 本地缓存写入失败状态（供 UI 显示警告，避免"导入成功但刷新即丢"）
export const localCacheState = { error: null };

// 数据库写入序列号：每次内存/缓存写入 +1，用于上传竞态检测（详见 flushPending）
let dbWriteSeq = 0;
export function bumpDbWriteSeq() { dbWriteSeq++; }
export function getDbWriteSeq() { return dbWriteSeq; }

// 本地缓存写入失败时通知页面（顶栏/数据导入页显示警告横幅）
function reportCacheError(err, op) {
  const msg = String(err?.message || err?.name || err || '未知错误');
  localCacheState.error = `本地数据保存失败（${op}）：${msg}。浏览器存储空间可能已满，刷新页面将丢失最近数据，请先清理浏览器缓存或减少数据量。`;
  try {
    window.dispatchEvent(new CustomEvent('amz-local-cache-error', { detail: localCacheState.error }));
  } catch (e) { /* ignore */ }
}

/**
 * 获取 GitHub 云端配置
 * @returns {{owner:string, repo:string, branch:string, token:string}|null}
 */
export function getGithubConfig() {
  return currentConfig;
}

/**
 * 保存 GitHub 云端配置（写 localStorage）
 * 注意：不再清空本地数据缓存（amz_gh_db）—— 缓存里的业务数据与仓库无关，清空会导致
 * 首次同步把空库推上云、覆盖云端已有数据（曾导致数据丢失）。仅重置离线降级标记。
 */
export function saveGithubConfig(cfg) {
  currentConfig = { owner: '', repo: '', branch: 'main', token: '', ...(cfg || {}) };
  try {
    localStorage.setItem(CONFIG_KEY, JSON.stringify(currentConfig));
  } catch (e) {
    reportCacheError(e, '保存云端配置');
  }
  githubFallback.active = false;
}

/**
 * 仅用于「测试连接」：用临时配置探测连通性，不改动已保存配置、不清任何缓存
 * @returns {Promise<{status:string, detail:string}>}
 */
export async function testGithubConnection(owner, repo, branch, token) {
  const prevConfig = currentConfig;
  currentConfig = { owner, repo, branch: branch || 'main', token };
  try {
    return await checkGithubStatus();
  } finally {
    currentConfig = prevConfig;
  }
}

/**
 * 是否已配置 GitHub 云端（owner/repo/token 齐全）
 */
export function hasGithubConfig() {
  return !!(currentConfig?.owner && currentConfig?.repo && currentConfig?.token);
}

// ============== base64 编解码（处理中文/UTF-8） ==============

// 文本 → base64（UTF-8 安全）
function utf8ToBase64(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  bytes.forEach((b) => { bin += String.fromCharCode(b); });
  return btoa(bin);
}

// base64 → 文本（UTF-8 安全）
function base64ToUtf8(b64) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

// ============== 本地缓存（秒开） ==============

function clearLocalDbCache() {
  try {
    localStorage.removeItem(CACHE_KEY);
    localStorage.removeItem(SHA_KEY);
  } catch (e) { /* ignore */ }
}

/**
 * 读本地缓存 db 对象
 * @returns {{version:number, updatedAt:string|null, tables:Object}|null}
 */
function readLocalCache() {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}

function writeLocalCache(dbObj) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(dbObj));
    // 写入成功时清除历史告警（仅当错误源于配额类失败时清除，避免误报反复）
    if (localCacheState.error && localCacheState.error.includes('存储空间')) {
      localCacheState.error = null;
    }
  } catch (e) {
    reportCacheError(e, '写入本地缓存');
  }
}

function readLocalSha() {
  try {
    return localStorage.getItem(SHA_KEY);
  } catch (e) {
    return null;
  }
}

function writeLocalSha(sha) {
  try {
    localStorage.setItem(SHA_KEY, sha || '');
  } catch (e) {
    reportCacheError(e, '写入同步标记');
  }
}

// ============== 脏表标记（待同步） ==============

const DIRTY_KEY = 'amz_gh_dirty';

// 脏表集合：哪些表有本地改动待上传（localStorage 持久化，刷新不丢）
function readDirty() {
  try {
    return JSON.parse(localStorage.getItem(DIRTY_KEY)) || [];
  } catch (e) {
    return [];
  }
}

function writeDirty(list) {
  try {
    localStorage.setItem(DIRTY_KEY, JSON.stringify(list));
  } catch (e) {
    reportCacheError(e, '写入待同步标记');
  }
}

/**
 * 标记某张表有本地改动（待上传云端）
 */
export function markTableDirty(tableName) {
  const list = readDirty();
  if (!list.includes(tableName)) {
    list.push(tableName);
    writeDirty(list);
  }
}

function clearDirty() {
  try {
    localStorage.removeItem(DIRTY_KEY);
  } catch (e) { /* ignore */ }
}

// ============== GitHub API 调用 ==============

function ghHeaders() {
  return {
    'Accept': 'application/vnd.github+json',
    'Authorization': `Bearer ${currentConfig.token}`,
    'X-GitHub-Api-Version': '2022-11-28'
  };
}

/**
 * 探测 GitHub 云端连通性
 * @returns {Promise<{status:'online'|'unauthorized'|'not_found'|'network_error', detail:string}>}
 */
export async function checkGithubStatus() {
  // 3 秒内复用上次结果
  if (lastGitHubCheck.result && Date.now() - lastGitHubCheck.at < 3000) {
    return lastGitHubCheck.result;
  }
  const result = { status: 'online', detail: '' };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4000);
  try {
    const url = `https://api.github.com/repos/${currentConfig.owner}/${currentConfig.repo}?ref=${currentConfig.branch}`;
    const res = await fetch(url, { headers: ghHeaders(), signal: controller.signal });
    clearTimeout(timer);
    if (res.ok) {
      result.status = 'online';
    } else if (res.status === 401 || res.status === 403) {
      result.status = 'unauthorized';
      result.detail = 'Token 无效或无权限（请检查 Token 是否勾选了 repo 权限）';
    } else if (res.status === 404) {
      result.status = 'not_found';
      result.detail = '仓库不存在（请检查 owner/repo 名称）';
    } else {
      result.status = 'network_error';
      result.detail = `GitHub 返回 ${res.status}`;
    }
  } catch (e) {
    clearTimeout(timer);
    const msg = String(e?.message || e?.name || '');
    if (e?.name === 'AbortError') {
      result.status = 'network_error';
      result.detail = '连接超时（4秒无响应）';
    } else if (msg.includes('resolve') || msg.includes('ENOTFOUND') || msg.includes('DNS')) {
      result.status = 'network_error';
      result.detail = '域名解析失败（网络环境限制）';
    } else {
      result.status = 'network_error';
      result.detail = msg || '网络异常';
    }
  }
  lastGitHubCheck = { result, at: Date.now() };
  githubStatusListeners.forEach((cb) => {
    try { cb(result); } catch (e) { /* ignore */ }
  });
  return result;
}

/**
 * 订阅 GitHub 云端状态变化
 */
export function subscribeGithubStatus(cb) {
  githubStatusListeners.add(cb);
  return () => githubStatusListeners.delete(cb);
}

/**
 * 从 GitHub 拉取 data/db.json
 * @returns {Promise<{sha:string, db:Object}|null>} 失败返回 null（不抛错）
 */
export async function fetchCloudDb() {
  if (!hasGithubConfig()) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4000);
  try {
    const url = `https://api.github.com/repos/${currentConfig.owner}/${currentConfig.repo}/contents/${DB_PATH}?ref=${currentConfig.branch}`;
    const res = await fetch(url, { headers: ghHeaders(), signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) return null;
    const meta = await res.json();
    const content = base64ToUtf8(meta.content);
    const db = JSON.parse(content);
    return { sha: meta.sha, db };
  } catch (e) {
    clearTimeout(timer);
    return null;
  }
}

/**
 * 将整个 db 对象写回 GitHub（PUT Contents API，sha 乐观锁）
 * 409 冲突时自动重试：重新拉取最新 sha 后再 PUT（最多 2 次），避免并发写入互相冲突
 * @returns {Promise<{ok:boolean, sha?:string, message?:string}>}
 */
export async function pushCloudDb(dbObj) {
  if (!hasGithubConfig()) return { ok: false, message: '未配置 GitHub 云端' };
  // 409 冲突时重试最多 2 次（重新拿 sha）
  for (let attempt = 0; attempt < 3; attempt++) {
    // 先拿当前 sha（防止覆盖他人改动）
    const current = await fetchCloudDb();
    const baseSha = current?.sha || '';
    const content = utf8ToBase64(JSON.stringify(dbObj, null, 2));
    const body = {
      message: `数据更新 ${new Date().toLocaleString('zh-CN')}`,
      content,
      branch: currentConfig.branch
    };
    if (baseSha) body.sha = baseSha;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    try {
      const url = `https://api.github.com/repos/${currentConfig.owner}/${currentConfig.repo}/contents/${DB_PATH}`;
      const res = await fetch(url, {
        method: 'PUT',
        headers: ghHeaders(),
        body: JSON.stringify(body),
        signal: controller.signal
      });
      clearTimeout(timer);
      if (res.status === 409 && attempt < 2) {
        // 云端数据刚被其他设备/并发写入修改，重试前稍等并重新拉取 sha
        await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
        continue;
      }
      if (!res.ok) {
        let detail = `GitHub 返回 ${res.status}`;
        if (res.status === 409) detail = '云端数据刚被其他设备修改（冲突），已重试仍失败，请稍后手动点「推送到云端」';
        if (res.status === 401 || res.status === 403) detail = 'Token 无效或无权限';
        return { ok: false, message: detail };
      }
      const meta = await res.json();
      return { ok: true, sha: meta?.content?.sha || '' };
    } catch (e) {
      clearTimeout(timer);
      return { ok: false, message: String(e?.message || '网络异常') };
    }
  }
  return { ok: false, message: '云端数据冲突，重试失败' };
}

// ============== 云端状态 / 缓存管理（供 database.js 使用） ==============

/**
 * 全量数据对象工厂：生成空的 db 结构（表名与 database.js 一致，snake_case）
 */
export function createEmptyDb() {
  return {
    version: 1,
    updatedAt: null,
    tables: {
      transactions: [],
      profit_reports: [],
      settlements: [],
      business_reports: [],
      ad_reports: [],
      inventory_records: [],
      import_logs: [],
      operation_logs: [],
      accounts: [],
      roles: [],
      stores: [],
      saved_views: [],
      exchange_rate: [],
      translations: []
    }
  };
}

/**
 * 同步读本地缓存（秒开）—— 无缓存返回 null
 */
export function readCachedDb() {
  const cached = readLocalCache();
  if (cached && cached.tables) return cached;
  return null;
}

/**
 * 同步写本地缓存
 */
export function cacheDb(dbObj) {
  writeLocalCache(dbObj);
}

/**
 * 异步刷新云端数据：拉取 db.json，若有更新则合并本地脏表改动后写缓存
 * @returns {Promise<{changed:boolean, db:Object|null}>}
 */
export async function refreshFromCloud() {
  if (!hasGithubConfig()) return { changed: false, db: readLocalCache() };
  const cloud = await fetchCloudDb();
  if (!cloud) {
    githubFallback.active = true;
    return { changed: false, db: readLocalCache() };
  }
  // 云端与本地 sha 相同 → 无变化
  if (cloud.sha === readLocalSha()) {
    return { changed: false, db: readLocalCache() };
  }
  // 合并：本地脏表以本地数据为准，其余表以云端为准
  const merged = mergeLocalDirty(cloud.db);
  writeLocalCache(merged);
  writeLocalSha(cloud.sha);
  githubFallback.active = false;
  return { changed: true, db: merged };
}

/**
 * 合并本地脏表到云端数据（本地改动优先覆盖对应表，其余保留云端）
 */
function mergeLocalDirty(cloudDb) {
  const dirty = readDirty();
  if (!dirty.length) return cloudDb;
  const result = { ...cloudDb, tables: { ...cloudDb.tables } };
  for (const tableName of dirty) {
    try {
      const local = JSON.parse(localStorage.getItem(CACHE_KEY));
      const rows = local?.tables?.[tableName];
      if (Array.isArray(rows)) {
        result.tables[tableName] = rows;
      }
    } catch (e) { /* ignore */ }
  }
  return result;
}

/**
 * 尝试把脏表推送到云端（基于云端最新数据合并后整体上传，成功则清空脏表）
 * @param {Object} [localDb] 可选：直接传入当前内存 db（用于导入后立即上传）
 * @returns {Promise<{ok:boolean, message?:string, raced?:boolean}>}
 */
export async function flushPending(localDb = null) {
  const dirty = readDirty();
  if (!dirty.length) return { ok: true };
  if (!hasGithubConfig()) return { ok: false, message: '未配置 GitHub 云端' };
  // 记录上传开始时的写入序列号，用于检测上传期间是否有新写入（防竞态覆盖）
  const startSeq = getDbWriteSeq();
  // 拉取云端最新数据
  const cloud = await fetchCloudDb();
  if (!cloud) return { ok: false, message: '云端暂不可达，稍后自动重试' };
  // 合并：脏表以本地（内存或缓存）为准
  const source = localDb || readLocalCache();
  const merged = mergeDirtyTables(cloud.db, dirty, source);
  merged.updatedAt = new Date().toISOString();
  const res = await pushCloudDb(merged);
  if (res.ok) {
    writeLocalSha(res.sha);
    // 上传期间有新写入：不能用旧快照覆盖本地缓存，且脏标记必须保留，
    // 否则新数据 B 只在内存里，刷新即丢（云端也未收到 B）
    if (getDbWriteSeq() !== startSeq) {
      return { ok: true, raced: true, message: '上传期间有新数据写入，已保留待同步，稍后自动补传' };
    }
    writeLocalCache(merged);
    clearDirty();
    return { ok: true };
  }
  return { ok: false, message: res.message };
}

/**
 * 把指定脏表用本地数据覆盖到云端 db 上
 */
function mergeDirtyTables(cloudDb, dirtyTables, localSource) {
  const result = { ...cloudDb, tables: { ...cloudDb.tables } };
  for (const tableName of dirtyTables) {
    const rows = localSource?.tables?.[tableName];
    if (Array.isArray(rows)) {
      result.tables[tableName] = rows;
    }
  }
  return result;
}

/**
 * 全量上传：把当前本地 db 直接覆盖上传（用于一键迁移/首次同步）
 */
export async function pushFullDb(dbObj) {
  const res = await pushCloudDb(dbObj);
  if (res.ok) {
    writeLocalSha(res.sha);
    writeLocalCache(dbObj);
    clearDirty();
  }
  return res;
}
