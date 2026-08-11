// 备份云端 db.json 到本地(固化最终真源，防止误操作清空云端后无法恢复)
// 运行：$env:GH_TOKEN='<token>'; node scripts/backup_cloud_db.mjs
import fs from 'node:fs';

const OWNER = 'fsh19990507';
const REPO = 'amazon-finance-data';
const token = process.env.GH_TOKEN;
if (!token) { console.log('ERROR: 请设置 GH_TOKEN'); process.exit(1); }

const res = await fetch(`https://api.github.com/repos/${OWNER}/${REPO}/contents/data/db.json?ref=main`, {
  headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/vnd.github+json', 'User-Agent': 'backup' }
});
if (!res.ok) { console.log('ERROR: 拉取失败', res.status); process.exit(1); }
const meta = await res.json();
const db = JSON.parse(Buffer.from(meta.content, 'base64').toString('utf-8'));

const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const file = `backups/cloud_db_${stamp}.json`;
fs.mkdirSync('backups', { recursive: true });
fs.writeFileSync(file, JSON.stringify(db, null, 2));
console.log(`✅ 已备份到 ${file}`);
console.log(`   sha=${meta.sha.slice(0, 8)} updatedAt=${db.updatedAt}`);
const total = Object.values(db.tables).reduce((s, a) => s + (Array.isArray(a) ? a.length : 0), 0);
console.log(`   总行数=${total}`);
