# 本地应用全量验证脚本
# 覆盖：登录页连接状态、5大页面加载、热力图渲染、手机响应式、控制台错误
from playwright.sync_api import sync_playwright
import json, time

BASE = "http://127.0.0.1:5173"
results = []

def log(name, ok, detail=""):
    results.append({"name": name, "ok": ok, "detail": detail})
    print(f"{'PASS' if ok else 'FAIL'} | {name} | {detail}")

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True, executable_path="C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe")
    ctx = browser.new_context(viewport={"width": 1440, "height": 900})

    # ========== 电脑端测试 ==========
    page = ctx.new_page()
    console_errors = []
    page.on("console", lambda m: console_errors.append(m.text) if m.type == "error" else None)
    page.on("pageerror", lambda e: console_errors.append(str(e)))

    # 1. 登录页加载
    t0 = time.time()
    page.goto(BASE, wait_until="networkidle", timeout=30000)
    load_time = time.time() - t0
    page.wait_for_selector("text=亚马逊财务系统", timeout=15000)
    log("登录页加载", True, f"耗时{load_time:.1f}s")

    # 检查云端状态条
    page.wait_for_timeout(3000)
    body_text = page.inner_text("body")
    if "云端已连接" in body_text or "无法连接云端" in body_text or "正在检测云端连接" in body_text:
        log("云端状态条显示", True, "已检测到状态条")
    else:
        log("云端状态条显示", False, "未找到状态条")

    # 2. 登录
    page.fill('input[placeholder="请输入用户名"]', "admin")
    page.fill('input[placeholder="请输入密码"]', "admin")
    # 点击登录按钮（antd 按钮文字可能含空格）
    btn = page.locator("button").filter(has_text="登录").first
    btn.click()
    page.wait_for_timeout(5000)
    body_after_login = page.inner_text("body")
    login_ok = "财务总览" in body_after_login or "交易明细" in body_after_login or "费用分析" in body_after_login
    log("登录成功", login_ok, "URL=" + page.url + " 含菜单=" + str(login_ok))

    # 3. 财务总览（含热力图）
    page.goto(BASE + "/#/", wait_until="networkidle", timeout=30000)
    page.wait_for_timeout(3000)
    body_text = page.inner_text("body")
    has_heatmap = "每日销售热力图" in body_text or "销售热力图" in body_text
    has_kpi = "毛利润" in body_text or "销售额" in body_text
    log("财务总览加载", has_kpi, "KPI=" + str(has_kpi) + " 热力图卡片=" + str(has_heatmap))
    page.screenshot(path="d:/GAME/ymx2/amazon-finance-app/test_shot_dashboard.png", full_page=True)

    # 4. 交易明细
    page.goto(BASE + "/#/transactions", wait_until="networkidle", timeout=30000)
    page.wait_for_timeout(2500)
    log("交易明细加载", len(page.inner_text("body").strip()) > 50, "页面非空")
    page.screenshot(path="d:/GAME/ymx2/amazon-finance-app/test_shot_transactions.png", full_page=True)

    # 5. 费用分析
    page.goto(BASE + "/#/expense", wait_until="networkidle", timeout=30000)
    page.wait_for_timeout(2500)
    log("费用分析加载", len(page.inner_text("body").strip()) > 50, "页面非空")
    page.screenshot(path="d:/GAME/ymx2/amazon-finance-app/test_shot_expense.png", full_page=True)

    # 6. 商品分析
    page.goto(BASE + "/#/product", wait_until="networkidle", timeout=30000)
    page.wait_for_timeout(2500)
    log("商品分析加载", len(page.inner_text("body").strip()) > 50, "页面非空")
    page.screenshot(path="d:/GAME/ymx2/amazon-finance-app/test_shot_product.png", full_page=True)

    # 7. 系统设置
    page.goto(BASE + "/#/settings", wait_until="networkidle", timeout=30000)
    page.wait_for_timeout(2500)
    log("系统设置加载", len(page.inner_text("body").strip()) > 50, "页面非空")
    page.screenshot(path="d:/GAME/ymx2/amazon-finance-app/test_shot_settings.png", full_page=True)

    # 8. 严重控制台错误检查
    fatal = [e for e in console_errors if "TypeError" in e or "is not a function" in e or "Cannot read" in e]
    log("无严重JS错误", len(fatal) == 0, f"严重错误数={len(fatal)}")
    if fatal:
        for f in fatal[:5]:
            print("  严重错误:", f[:200])

    page.close()

    # ========== 手机端测试（375px） ==========
    mobile_ctx = browser.new_context(viewport={"width": 375, "height": 812}, is_mobile=True)
    mpage = mobile_ctx.new_page()
    mpage.goto(BASE, wait_until="networkidle", timeout=30000)
    mpage.wait_for_selector("text=亚马逊财务系统", timeout=15000)
    mpage.fill('input[placeholder="请输入用户名"]', "admin")
    mpage.fill('input[placeholder="请输入密码"]', "admin")
    mpage.locator("button").filter(has_text="登录").first.click()
    mpage.wait_for_timeout(5000)
    m_body = mpage.inner_text("body")
    m_login_ok = "财务总览" in m_body or "交易明细" in m_body
    log("手机端登录成功", m_login_ok, "")

    # 手机端抽屉菜单按钮
    has_menu_btn = mpage.locator('button:has(.anticon-menu)').count() > 0 or mpage.locator(".anticon-menu").count() > 0
    log("手机端汉堡菜单按钮", has_menu_btn, "")

    # 手机端财务总览无水平溢出
    overflow = mpage.evaluate("document.documentElement.scrollWidth > window.innerWidth + 20")
    log("手机端财务总览无溢出", not overflow, f"scrollWidth溢出={overflow}")
    mpage.screenshot(path="d:/GAME/ymx2/amazon-finance-app/test_shot_mobile_dashboard.png", full_page=True)

    # 手机端交易明细
    mpage.goto(BASE + "/#/transactions", wait_until="networkidle", timeout=30000)
    mpage.wait_for_timeout(2500)
    overflow2 = mpage.evaluate("document.documentElement.scrollWidth > window.innerWidth + 20")
    log("手机端交易明细无溢出", not overflow2, f"scrollWidth溢出={overflow2}")
    mpage.screenshot(path="d:/GAME/ymx2/amazon-finance-app/test_shot_mobile_transactions.png", full_page=True)

    mobile_ctx.close()
    browser.close()

# 汇总
failed = [r for r in results if not r["ok"]]
print(f"\n===== 汇总：{len(results) - len(failed)}/{len(results)} 通过 =====")
if failed:
    for f in failed:
        print("  FAIL:", f["name"], "|", f["detail"])
    exit(1)
else:
    print("全部通过")
    exit(0)
