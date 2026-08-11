// 清洗云端 db.json：统一重写 transactions 行 dedupKey 为新格式
// 新格式：orderId|type|date|productName|storeId（含商品名，避免同单多费用误判重复）
// 运行：$env:GH_TOKEN='<token>'; node scripts/fix_dedup_keys.mjs
import fs from 'node:fs';

const OWNER = 'fsh19990507';
const REPO = 'amazon-finance-data';
const BRANCH = 'main';
const token = process.env.GH_TOKEN;
if (!token) { console.log('ERROR: 请设置 GH_TOKEN'); process.exit(1); }

const api = `https://api.github.com/repos/${OWNER}/${REPO}/contents/data/db.json?ref=${BRANCH}`;
const headers = {
  'Authorization': `Bearer ${token}`,
  'Accept': 'application/vnd.github+json',
  'User-Agent': 'fix-dedup'
};

// 1. 拉取当前 db.json
const res = await fetch(api, { headers });
if (!res.ok) { console.log('ERROR: 拉取失败', res.status); process.exit(1); }
const meta = await res.json();
const db = JSON.parse(Buffer.from(meta.content, 'base64').toString('utf-8'));
console.log('当前 sha:', meta.sha.slice(0, 8), 'transactions 行数:', db.tables.transactions.length);

// 2. 重写 dedupKey
let changed = 0;
const newKeys = new Set();
let dupAfter = 0;
const before = db.tables.transactions.length;
db.tables.transactions = db.tables.transactions.map((r) => {
  if (!r || typeof r !== 'object') return r;
  const oldKey = r.dedupKey;
  const newKey = `${r.orderId || ''}|${r.type || ''}|${r.date || ''}|${r.productName || ''}|${r.storeId || ''}`;
  if (newKeys.has(newKey)) dupAfter++;
  newKeys.add(newKey);
  r.dedupKey = newKey;
  if (oldKey !== newKey) changed++;
  return r;
});
console.log('重写行数:', changed, '清洗后重复 dedupKey 数:', dupAfter);

// 3. 推送
db.updatedAt = new Date().toISOString();
const content = Buffer.from(JSON.stringify(db, null, 2)).toString('base64');
const body = { message: '数据清洗：dedupKey 增加商品名，修复同单多费用误判重复', content, branch: BRANCH };
if (meta.sha) body.sha = meta.sha;

const push = await fetch(`https://api.github.com/repos/${OWNER}/${REPO}/contents/data/db.json`, {
  method: 'PUT', headers, body: JSON.stringify(body)
});
if (push.ok) {
  const pm = await push.json();
  console.log('✅ 推送成功, 新 sha:', (pm.content?.sha || '').slice(0, 8));
  process.exit(0);
} else {
  const err = await push.text();
  console.log('❌ 推送失败:', push.status, err.slice(0, 300));
  process.exit(1);
}
