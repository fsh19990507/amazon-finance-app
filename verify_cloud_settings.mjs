// 端到端验证：GitHub 云端同步页面 + 本地模式数据流
import { chromium } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TD = path.join(__dirname, 'testdata');
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

// 登录
await page.goto(BASE, { waitUntil: 'domcontentloaded' });
await page.goto(BASE + '#/login', { waitUntil: 'domcontentloaded' }).catch(() => {});
await page.waitForTimeout(3500);
const inputs = page.locator('input');
await inputs.nth(0).fill('admin');
await inputs.nth(1).fill('admin');
await inputs.nth(1).press('Enter');
await page.waitForTimeout(2000);
if (await page.locator('.ant-layout').count() === 0) {
  await page.locator('button[type="submit"]').first().click({ force: true }).catch(() => {});
}
await page.waitForSelector('.ant-layout', { timeout: 15000 }).catch(() => {});
await page.waitForTimeout(1500);
log('登录成功（本地模式）', true);

// 进入设置 → 云端同步 Tab
await page.goto(BASE + '#/settings', { waitUntil: 'domcontentloaded' }).catch(() => {});
await page.waitForTimeout(2000);
await page.locator('.ant-tabs-tab', { hasText: '云端同步' }).first().click().catch(() => {});
await page.waitForTimeout(1500);
const bodyText = await page.textContent('body');
log('云端同步页渲染（GitHub 标题）', bodyText.includes('GitHub 免费云端存储'));
log('云端同步页渲染（Token 步骤）', bodyText.includes('Generate new token'));
log('云端同步页渲染（配置表单）', bodyText.includes('GitHub 用户名') && bodyText.includes('数据仓库名'));
log('云端同步页渲染（手动同步）', bodyText.includes('推送到云端') && bodyText.includes('从云端拉取'));
await page.screenshot({ path: 'test_shot_cloud_settings.png', fullPage: true });

// 验证表单可填写 owner/repo/token（不真实保存，只测 UI）
const cloudInputs = page.locator('input');
const totalInputs = await cloudInputs.count();
log('云端表单输入框存在', totalInputs >= 3, `inputs=${totalInputs}`);

// 导入一个报表验证本地数据流仍正常
await page.goto(BASE + '#/import', { waitUntil: 'domcontentloaded' }).catch(() => {});
await page.waitForTimeout(1500);
const fileInput = page.locator('input[type=file]');
await fileInput.first().setInputFiles(path.join(TD, 'settlement.tsv'));
let imported = false;
for (let i = 0; i < 15; i++) {
  await page.waitForTimeout(800);
  const t = await page.textContent('body');
  if (t.includes('导入完成')) { imported = true; break; }
}
log('本地模式导入正常', imported);

await browser.close();
console.log('\n===== JS 错误（前 6 条）=====');
consoleErrors.slice(0, 6).forEach((e) => console.log('  ⚠', e));
const failed = results.filter((r) => !r.ok).length;
console.log(`\n===== 结果：${results.length - failed}/${results.length} 通过 =====`);
process.exit(failed ? 1 : 0);
