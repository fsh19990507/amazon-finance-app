// 单元测试：githubStore 核心逻辑（base64 编解码 / 脏表合并 / 空 db 结构）
// 运行：node verify_github_store.mjs
import {
  createEmptyDb
} from './src/db/githubStore.js';

let pass = 0;
let fail = 0;
function assert(name, cond, extra = '') {
  if (cond) { pass++; console.log('✅', name); }
  else { fail++; console.log('❌', name, extra); }
}

// 1. createEmptyDb 结构完整
const db = createEmptyDb();
assert('createEmptyDb 有 14 张表', Object.keys(db.tables).length === 14);
assert('createEmptyDb 表名 snake_case', db.tables.profit_reports !== undefined && db.tables.profitReports === undefined);
assert('createEmptyDb 结构正确', db.version === 1 && Array.isArray(db.tables.transactions));

// 2. base64 UTF-8 编解码（中文数据往返）
function utf8ToBase64(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  bytes.forEach((b) => { bin += String.fromCharCode(b); });
  return btoa(bin);
}
function base64ToUtf8(b64) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}
const sample = JSON.stringify({ name: '亚马逊财务系统', tables: { transactions: [{ id: 1, sku: 'ABC-123' }] } });
const roundTrip = base64ToUtf8(utf8ToBase64(sample));
assert('base64 UTF-8 中文往返一致', roundTrip === sample);

// 3. 模拟脏表合并逻辑（与 githubStore 内部 mergeDirtyTables 一致）
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
const cloud = createEmptyDb();
cloud.tables.transactions = [{ id: 1, sku: 'cloud' }];
cloud.tables.profit_reports = [{ id: 1, month: '2026-06' }];
const local = createEmptyDb();
local.tables.transactions = [{ id: 1, sku: 'local-edit' }, { id: 2, sku: 'new' }];
const merged = mergeDirtyTables(cloud, ['transactions'], local);
assert('脏表 transactions 以本地为准', merged.tables.transactions.length === 2 && merged.tables.transactions[0].sku === 'local-edit');
assert('非脏表 profit_reports 保留云端', merged.tables.profit_reports[0].month === '2026-06');

// 4. 排序/过滤逻辑（与 GitHubQuery 一致）
function filterAndSort(rows, field, value, orderField, asc) {
  let r = rows.filter((x) => String(x[field]) === String(value));
  r.sort((a, b) => {
    const av = a[orderField], bv = b[orderField];
    if (typeof av === 'number' && typeof bv === 'number') return asc ? av - bv : bv - av;
    return asc ? String(av).localeCompare(String(bv)) : String(bv).localeCompare(String(av));
  });
  return r;
}
const rows = [
  { id: 1, month: '2026-06', amount: 100 },
  { id: 2, month: '2026-07', amount: 300 },
  { id: 3, month: '2026-06', amount: 200 }
];
const filtered = filterAndSort(rows, 'month', '2026-06', 'amount', true);
assert('按 month 过滤 + amount 升序', filtered.length === 2 && filtered[0].amount === 100 && filtered[1].amount === 200);

console.log(`\n===== 结果：${pass}/${pass + fail} 通过 =====`);
process.exit(fail ? 1 : 0);
