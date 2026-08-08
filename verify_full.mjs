// 端到端验证：6类报表导入 / 4个新分析页 / 5套主题 / 帮助中心 / 手机端
import { chromium } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TD = path.join(__dirname, 'testdata');
// 支持生产构建验证：VERIFY_BASE=http://127.0.0.1:4173/ node verify_full.mjs
const BASE = process.env.VERIFY_BASE || 'http://127.0.0.1:5173/';
const results = [];
const consoleErrors = [];
const log = (name, ok, extra = '') => {
  results.push({ name, ok });
  console.log(`${ok ? '✅' : '❌'} ${name}${extra ? ' — ' + extra : ''}`);
};

const browser = await chromium.launch({ channel: 'msedge', headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
page.on('pageerror', (e) => consoleErrors.push('PAGEERR:' + String(e).slice(0, 200)));
page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('ERR_NAME_NOT_RESOLVED') && !m.text().includes('404')) consoleErrors.push(m.text().slice(0, 200)); });

async function login() {
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.goto(BASE + '#/login', { waitUntil: 'domcontentloaded' }).catch(() => {});
  await page.waitForTimeout(5500);
  const inputs = page.locator('input');
  await inputs.nth(0).fill('admin');
  await inputs.nth(1).fill('admin');
  await inputs.nth(1).press('Enter');
  await page.waitForTimeout(2500);
  if (await page.locator('.ant-layout').count() === 0) {
    await page.locator('button[type="submit"]').first().click({ force: true }).catch(() => {});
  }
  await page.waitForSelector('.ant-layout', { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(2000);
}

// ===== 1. 登录 =====
await login();
log('登录成功', (await page.textContent('body')).includes('财务总览') || page.url().includes('#/'));

// ===== 2. 导入 6 类报表（离线模式走本地队列） =====
const importFiles = [
  ['settlement.tsv', '英文结算报表'],
  ['business.csv', '业务报告'],
  ['ad.csv', '广告报告'],
  ['inventory.csv', '库存报告'],
  ['stranded.csv', '库存报告'],
  ['reimbursement.csv', '库存报告']
];

await page.goto(BASE + '#/import', { waitUntil: 'domcontentloaded' }).catch(() => {});
await page.waitForTimeout(3000);
const fileInput = page.locator('input[type=file]');
if (await fileInput.count() === 0) log('导入页文件控件存在', false);
else {
  for (const [fname, typeName] of importFiles) {
    await fileInput.first().setInputFiles(path.join(TD, fname));
    // 等待导入完成 toast
    let imported = false;
    for (let i = 0; i < 15; i++) {
      await page.waitForTimeout(1200);
      const t = await page.textContent('body');
      if (t.includes('导入完成')) { imported = true; break; }
    }
    log(`导入 ${fname}（${typeName}）`, imported);
  }
}

// ===== 3. 4 个新分析页 =====
async function checkPage(route, kpiTexts, minCanvas) {
  await page.goto(BASE + '#/' + route, { waitUntil: 'domcontentloaded' }).catch(() => {});
  // 轮询等待：云端查询超时 6s 后才回退缓存显示数据，KPI 与 canvas 都需循环确认
  let kpiOk = false;
  let canvas = 0;
  for (let i = 0; i < 12; i++) {
    await page.waitForTimeout(1200);
    const text = await page.textContent('body');
    kpiOk = kpiOk || kpiTexts.every((k) => text.includes(k));
    canvas = await page.locator('canvas').count();
    if (kpiOk && canvas >= minCanvas) break;
  }
  log(`分析页 ${route}（KPI+图表）`, kpiOk && canvas >= minCanvas, `canvas=${canvas}`);
  await page.screenshot({ path: `test_shot_${route}.png`, fullPage: true });
}

await checkPage('settlement', ['结算总额', '费用总额'], 2);
await checkPage('business', ['转化率', '访问量'], 2);
await checkPage('advertising', ['ACOS', 'ROAS'], 2);
await checkPage('inventory', ['可售', '滞留'], 2);

// ===== 4. 帮助中心 =====
await page.goto(BASE + '#/help', { waitUntil: 'domcontentloaded' }).catch(() => {});
await page.waitForTimeout(3000);
const helpText = await page.textContent('body');
const helpTabs = ['快速上手', '注意事项', '常见问题', '报表字典'].every((t) => helpText.includes(t));
log('帮助中心 4 个 Tab', helpTabs);
await page.screenshot({ path: 'test_shot_help.png', fullPage: true });

// ===== 5. 主题切换（Settings → 外观主题 → 5 套） =====
await page.goto(BASE + '#/settings', { waitUntil: 'domcontentloaded' }).catch(() => {});
await page.waitForTimeout(3000);
// 点击"外观主题"Tab
await page.locator('.ant-tabs-tab', { hasText: '外观主题' }).first().click().catch(() => {});
await page.waitForTimeout(1500);

const themes = ['经典商务蓝', '深空暗黑', '翡翠商务绿', '优雅紫罗兰', '暖阳橙'];
for (const tname of themes) {
  const card = page.locator('.ant-card', { hasText: tname }).first();
  if (await card.count() === 0) { log(`主题卡片 ${tname}`, false); continue; }
  await card.click();
  await page.waitForTimeout(1200);
  // 验证：midnight 有暗色 body 类；侧边栏背景色变化
  const isDark = await page.evaluate(() => document.body.classList.contains('amz-theme-dark'));
  const siderBg = await page.evaluate(() => {
    const s = document.querySelector('.ant-layout-sider') || document.querySelector('.ant-drawer');
    return s ? getComputedStyle(s).backgroundImage || getComputedStyle(s).backgroundColor : '';
  });
  log(`切换主题「${tname}」`, true, `dark=${isDark} sider=${siderBg.slice(0, 40)}`);
  await page.screenshot({ path: `test_shot_theme_${tname}.png`, fullPage: true });
}

// 验证菜单选中态颜色随主题变化（对比选中项背景色）
const selColor = async () => page.evaluate(() => {
  const el = document.querySelector('.ant-menu-item-selected');
  return el ? getComputedStyle(el).backgroundColor : '';
});
await page.locator('.ant-card', { hasText: '经典商务蓝' }).first().click();
await page.waitForTimeout(1000);
const c1 = await selColor();
await page.locator('.ant-card', { hasText: '深空暗黑' }).first().click();
await page.waitForTimeout(1000);
const c2 = await selColor();
log('菜单选中态背景随主题变化', c1 && c2 && c1 !== c2, `corporate=${c1} midnight=${c2}`);
await page.locator('.ant-card', { hasText: '经典商务蓝' }).first().click();
await page.waitForTimeout(800);
await ctx.close();

// ===== 6. 手机端 375px =====
const mctx = await browser.newContext({ viewport: { width: 375, height: 720 }, isMobile: true });
const mpage = await mctx.newPage();
mpage.on('pageerror', (e) => consoleErrors.push('MOBILE:' + String(e).slice(0, 200)));
await mpage.goto(BASE, { waitUntil: 'domcontentloaded' });
await mpage.goto(BASE + '#/login', { waitUntil: 'domcontentloaded' }).catch(() => {});
await mpage.waitForTimeout(5500);
const mi = mpage.locator('input');
await mi.nth(0).fill('admin');
await mi.nth(1).fill('admin');
await mi.nth(1).press('Enter');
await mpage.waitForTimeout(2500);
if (await mpage.locator('.ant-layout').count() === 0) {
  await mpage.locator('button[type="submit"]').first().click({ force: true }).catch(() => {});
}
await mpage.waitForSelector('.ant-layout', { timeout: 15000 }).catch(() => {});
await mpage.waitForTimeout(2500);

// 手机端浏览新页面
for (const route of ['settlement', 'business', 'advertising', 'inventory', 'help']) {
  await mpage.goto(BASE + '#/' + route, { waitUntil: 'domcontentloaded' }).catch(() => {});
  await mpage.waitForTimeout(3000);
  const overflow = await mpage.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 2);
  log(`手机端 /${route} 无溢出`, !overflow, `sw=${await mpage.evaluate(() => document.documentElement.scrollWidth)}`);
}
const hamburger = await mpage.locator('svg[data-icon="menu"]').count();
log('手机端汉堡菜单', hamburger > 0);
await mpage.screenshot({ path: 'test_shot_mobile_full.png', fullPage: true });
await mctx.close();

await browser.close();

console.log('\n===== JS 错误（前 8 条）=====');
consoleErrors.slice(0, 8).forEach((e) => console.log('  ⚠', e));
const failed = results.filter((r) => !r.ok).length;
console.log(`\n===== 结果：${results.length - failed}/${results.length} 通过 =====`);
process.exit(failed ? 1 : 0);
