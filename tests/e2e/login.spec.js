// @ts-check
import { test, expect } from '@playwright/test';

test.describe('登录功能测试', () => {
  /**
   * 等待登录表单可用。处理数据库连接超时等异常。
   */
  async function waitForLoginForm(page) {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    // 表单已有 initialValues (admin/admin123)，等表单出现即可
    await page.waitForSelector('.ant-form', { timeout: 30000 });
  }

  test('登录成功 - 使用默认账户', async ({ page }) => {
    await waitForLoginForm(page);
    
    // 表单已有默认值 admin/admin123，直接提交
    const loginBtn = page.locator('form button[type="submit"]');
    await loginBtn.click();
    
    // 等待登录成功后的跳转
    await page.waitForTimeout(3000);
    
    // 验证已离开登录页
    const url = page.url();
    expect(url).not.toContain('/login');
  });

  test('登录失败 - 错误密码', async ({ page }) => {
    await waitForLoginForm(page);
    
    // 清除默认密码，填入错误密码
    const passwordInput = page.getByRole('textbox', { name: /密码/ });
    await passwordInput.clear();
    await passwordInput.fill('wrongpassword');
    
    const loginBtn = page.locator('form button[type="submit"]');
    await loginBtn.click();
    
    await page.waitForTimeout(2000);
    
    const url = page.url();
    expect(url).toContain('/login');
  });

  test('表单验证 - 空用户名提交', async ({ page }) => {
    await waitForLoginForm(page);
    
    // 清空用户名
    const usernameInput = page.getByRole('textbox', { name: /用户名/ });
    await usernameInput.clear();
    // 清空密码
    const passwordInput = page.getByRole('textbox', { name: /密码/ });
    await passwordInput.clear();
    
    const loginBtn = page.locator('form button[type="submit"]');
    await loginBtn.click();
    
    await page.waitForTimeout(1000);
    
    const url = page.url();
    expect(url).toContain('/login');
  });
});
