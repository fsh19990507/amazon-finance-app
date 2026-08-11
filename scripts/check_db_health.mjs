// 云端数据库健康检查：从环境变量读取 GitHub Token → 拉取 db.json → 全量体检
// 运行：$env:GH_TOKEN='<token>'; node scripts/check_db_health.mjs
// 或默认使用固定的 owner/repo（由命令行参数传入 token）
const EXPECTED_TABLES = ['transactions', 'profit_reports', 'settlements', 'business_reports',
  'ad_reports', 'inventory_records', 'import_logs', 'operation_logs',
  'accounts', 'roles', 'stores', 'saved_views', 'exchange_rate', 'translations'];

const OWNER = 'fsh19990507';
const REPO = 'amazon-finance-data';
const BRANCH = 'main';
const token = process.env.GH_TOKEN;
if (!token) {
  console.log('ERROR: 请设置 GH_TOKEN 环境变量');
  process.exit(1);
}
console.log(`配置: ${OWNER}/${REPO} @ ${BRANCH} (token 尾号 ${String(token).slice(-4)})`);

// 拉取 db.json
const url = `https://api.github.com/repos/${OWNER}/${REPO}/contents/data/db.json?ref=${BRANCH}`;
const res = await fetch(url, {
  headers: {
    'Authorization': `Bearer ${token}`,
    'Accept': 'application/vnd.github+json',
    'User-Agent': 'health-check'
  }
});
if (!res.ok) {
  console.log(`ERROR: 拉取 db.json 失败 HTTP ${res.status} ${res.statusText}`);
  process.exit(1);
}
const meta = await res.json();
const content = Buffer.from(meta.content, 'base64').toString('utf-8');
const db = JSON.parse(content);
const sha = meta.sha;

console.log(`db.json sha=${sha.slice(0, 8)} updatedAt=${db.updatedAt}`);
console.log(`version=${db.version} 表数=${Object.keys(db.tables || {}).length}`);

const problems = [];
console.log('\n=== 各表行数与体检 ===');
for (const t of EXPECTED_TABLES) {
  const rows = db.tables?.[t];
  if (!Array.isArray(rows)) {
    problems.push(`缺少表: ${t}`);
    console.log(`  ${t}: 表不存在!`);
    continue;
  }
  console.log(`  ${t}: ${rows.length} 行`);

  // id 检查
  const ids = rows.filter(r => r && typeof r === 'object').map(r => r.id);
  const seen = new Set();
  const dupIds = new Set();
  ids.forEach(x => { if (x === undefined || x === null) return; if (seen.has(x)) dupIds.add(x); seen.add(x); });
  if (dupIds.size) {
    problems.push(`${t} id 重复 ${dupIds.size} 个`);
    console.log(`    ❌ id 重复: ${[...dupIds].slice(0, 5).join(', ')}`);
  }

  // dedupKey 检查
  const dks = rows.filter(r => r && typeof r === 'object' && r.dedupKey != null).map(r => r.dedupKey);
  if (dks.length) {
    const seenDk = new Set();
    let dupDk = 0;
    dks.forEach(x => { if (seenDk.has(x)) dupDk++; seenDk.add(x); });
    if (dupDk) {
      problems.push(`${t} dedupKey 重复 ${dupDk} 个`);
      console.log(`    ❌ dedupKey 重复 ${dupDk} 个`);
    } else {
      console.log(`    ✓ dedupKey 无重复 (${dks.length} 个)`);
    }
  }

  // storeId 检查（业务表必须有）
  if (['transactions', 'profit_reports', 'settlements', 'business_reports', 'ad_reports', 'inventory_records'].includes(t)) {
    const noStore = rows.filter(r => r && typeof r === 'object' && r.storeId == null).length;
    if (noStore) {
      problems.push(`${t} 有 ${noStore} 行缺 storeId`);
      console.log(`    ❌ ${noStore} 行缺 storeId`);
    }
  }
}

// 日期范围
console.log('\n=== 数据日期范围 ===');
for (const t of ['transactions', 'profit_reports', 'settlements', 'business_reports', 'ad_reports']) {
  const rows = db.tables?.[t] || [];
  const dates = rows.filter(r => r && typeof r === 'object').map(r => r.date || r.month).filter(Boolean);
  if (dates.length) {
    console.log(`  ${t}: 最早=${dates.reduce((a, b) => a < b ? a : b)} 最晚=${dates.reduce((a, b) => a > b ? a : b)} 行数=${rows.length}`);
  }
}

// 总量
const total = EXPECTED_TABLES.reduce((s, t) => s + (db.tables?.[t]?.length || 0), 0);
const size = Buffer.byteLength(content, 'utf-8');
console.log(`\n总行数=${total} 文件大小=${(size / 1024).toFixed(0)}KB`);
console.log(`⚠ GitHub API 单文件限 100MB，当前 ${(size / 1024 / 1024).toFixed(2)}MB 无风险`);
console.log(`⚠ 序列化到 localStorage：${(size / 1024).toFixed(0)}KB，5MB 配额占 ${(size / 1024 / 1024 / 5 * 100).toFixed(1)}%`);

console.log('\n' + '='.repeat(40));
if (problems.length) {
  console.log(`发现 ${problems.length} 个问题:`);
  problems.forEach(p => console.log(`  ❌ ${p}`));
  process.exit(1);
} else {
  console.log('✅ 数据库体检通过，无结构性问题');
  process.exit(0);
}
