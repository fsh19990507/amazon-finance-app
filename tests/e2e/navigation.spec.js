// @ts-check
import { test, expect } from '@playwright/test';

const menuPages = [
  { key: '/transactions', label: '交易明细' },
  { key: '/expense', label: '费用分析' },
  { key: '/product', label: '商品分析' },
  { key: '/import', label: '数据导入' },
  { key: '/settings', label: '系统设置' },
];

test.describe('登录后页面导航测试', () => {
  let consoleErrors = [];

  test.beforeEach(async ({ page }) => {
    consoleErrors = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });

    // 导航到应用并等待
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.waitForSelector('.ant-form', { timeout: 30000 });

    // 登录 - 表单已有默认值 admin/admin，直接提交
    const loginBtn = page.locator('form button[type="submit"]');
    await loginBtn.click();

    // 等待登录成功
    await page.waitForTimeout(3000);
  });

  for (const { key, label } of menuPages) {
    test(`导航到${label}页面`, async ({ page }) => {
      // 点击菜单项
      const menuItem = page.locator('.ant-menu-item').filter({ hasText: label });
      await menuItem.click();

      // 等待URL变化
      await page.waitForURL(`**#${key}`, { timeout: 10000 });

      // 验证URL
      expect(page.url()).toContain(`#${key}`);

      // 验证内容区域不为空
      const contentArea = page.locator('.ant-layout-content');
      await expect(contentArea).toBeVisible({ timeout: 5000 });
      const box = await contentArea.boundingBox();
      expect(box).not.toBeNull();
      expect(box.height).toBeGreaterThan(0);
    });
  }

  test('返回 Dashboard', async ({ page }) => {
    // 导航到交易明细
    await page.locator('.ant-menu-item').filter({ hasText: '交易明细' }).click();
    await page.waitForURL('**#/transactions');

    // 返回 Dashboard
    await page.locator('.ant-menu-item').filter({ hasText: '财务总览' }).click();
    await page.waitForURL('**#/');

    // 验证 Dashboard 菜单项被选中
    await expect(
      page.locator('.ant-menu-item-selected').filter({ hasText: '财务总览' })
    ).toBeVisible();
  });
});
