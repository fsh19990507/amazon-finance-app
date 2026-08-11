import React, { useState, useMemo, useEffect, Suspense, lazy } from 'react';
import { HashRouter, Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import {
  Layout, Menu, ConfigProvider, theme, Dropdown, Avatar, Button, Select, Tooltip,
  Badge, Space, Input, Modal, message, Drawer, Alert, Spin
} from 'antd';
import {
  DashboardOutlined, FileExcelOutlined, UnorderedListOutlined, PieChartOutlined,
  BarChartOutlined, SettingOutlined, LogoutOutlined, UserOutlined,
  BulbOutlined, SearchOutlined, ShopOutlined, DollarOutlined,
  ReloadOutlined, EyeOutlined, ExclamationCircleOutlined, StarOutlined,
  MenuOutlined, DisconnectOutlined,
  FileDoneOutlined, LineChartOutlined, ThunderboltOutlined,
  DatabaseOutlined, QuestionCircleOutlined
} from '@ant-design/icons';

import { AuthProvider, useAuth } from './context/AuthContext.jsx';
import { ThemeProvider, useTheme } from './context/ThemeContext.jsx';
import { StoreProvider, useStore } from './context/StoreContext.jsx';
import { RateProvider, useRate } from './context/RateContext.jsx';
import { PERM, permLevelName } from './utils/permissions.js';
import { subscribeCloudStatus } from './db/database.js';
import { localCacheState } from './db/githubStore.js';

import Login from './pages/Login.jsx';
import ErrorBoundary from './components/ErrorBoundary.jsx';

// ===== 路由懒加载：业务页面按需加载，首屏只加载登录页 =====
const Dashboard = lazy(() => import('./pages/Dashboard.jsx'));
const DataImport = lazy(() => import('./pages/DataImport.jsx'));
const TransactionList = lazy(() => import('./pages/TransactionList.jsx'));
const ExpenseAnalysis = lazy(() => import('./pages/ExpenseAnalysis.jsx'));
const ProductAnalysis = lazy(() => import('./pages/ProductAnalysis.jsx'));
const Settings = lazy(() => import('./pages/Settings.jsx'));
// 新增报表类页面：懒加载，页面文件由对应任务创建
const SettlementAnalysis = lazy(() => import('./pages/SettlementAnalysis.jsx'));
const BusinessAnalysis = lazy(() => import('./pages/BusinessAnalysis.jsx'));
const AdvertisingAnalysis = lazy(() => import('./pages/AdvertisingAnalysis.jsx'));
const InventoryAnalysis = lazy(() => import('./pages/InventoryAnalysis.jsx'));
const HelpCenter = lazy(() => import('./pages/HelpCenter.jsx'));

const { Header, Sider, Content } = Layout;
const { Option } = Select;

const menuItems = [
  { key: '/', icon: <DashboardOutlined />, label: '财务总览' },
  { key: '/import', icon: <FileExcelOutlined />, label: '数据导入' },
  { key: '/transactions', icon: <UnorderedListOutlined />, label: '交易明细' },
  { key: '/expense', icon: <PieChartOutlined />, label: '费用分析' },
  { key: '/product', icon: <BarChartOutlined />, label: '商品分析' },
  { key: '/settings', icon: <SettingOutlined />, label: '系统设置' },
  { key: '/settlement', icon: <FileDoneOutlined />, label: '结算报表' },
  { key: '/business', icon: <LineChartOutlined />, label: '业务报表' },
  { key: '/advertising', icon: <ThunderboltOutlined />, label: '广告报表' },
  { key: '/inventory', icon: <DatabaseOutlined />, label: '库存报表' },
  { key: '/help', icon: <QuestionCircleOutlined />, label: '帮助中心' }
];

function StoreSelector({ isMobile }) {
  const { stores, currentStoreId, switchStore, compareMode, setCompareMode, compareStoreIds, setCompareStoreIds } = useStore();
  const { can } = useAuth();

  const options = useMemo(() => {
    const list = [{ value: 'all', label: '全部店铺' }];
    (stores || []).forEach((s) => {
      list.push({ value: s.id, label: `${s.name}${s.site ? `（${s.site}）` : ''}` });
    });
    return list;
  }, [stores]);

  if (compareMode) {
    return (
      <Select
        mode="multiple"
        value={compareStoreIds}
        onChange={setCompareStoreIds}
        style={{ width: isMobile ? 150 : 260 }}
        placeholder="选择对比店铺（2-3个）"
        maxTagCount={2}
        options={options.filter((o) => o.value !== 'all')}
        size="small"
      />
    );
  }

  return (
    <Space.Compact size="small">
      <Select
        value={currentStoreId}
        onChange={switchStore}
        // 手机端压缩宽度，防止与右侧按钮重叠溢出
        style={{ width: isMobile ? 120 : 170 }}
        options={options}
      />
      {can(PERM.USE_STORE_COMPARE) && (
        <Tooltip title={compareMode ? '退出对比' : '店铺对比模式'}>
          <Button size="small" type={compareMode ? 'primary' : 'default'} onClick={() => setCompareMode(!compareMode)}>
            {isMobile ? (compareMode ? '退出' : '对比') : (compareMode ? '对比中' : '对比')}
          </Button>
        </Tooltip>
      )}
    </Space.Compact>
  );
}

function RateDisplay() {
  const { rate, loading, offline, lastUpdated, displayMode, setDisplayMode, refreshRate } = useRate();
  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = async () => {
    setRefreshing(true);
    const ok = await refreshRate();
    if (!ok) message.warning('联网获取汇率失败，使用缓存汇率');
    setRefreshing(false);
  };

  const modeItems = [
    { key: 'usd', label: '仅美元' },
    { key: 'cny', label: '仅人民币' },
    { key: 'dual', label: '双币同显' }
  ];

  // 格式化"更新于 HH:mm"
  const updatedLabel = lastUpdated
    ? `更新于 ${new Date(lastUpdated).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}`
    : '';

  return (
    <Space size={4}>
      <Dropdown menu={{ items: modeItems, onClick: ({ key }) => setDisplayMode(key), selectedKeys: [displayMode] }}>
        <Button
          size="small"
          icon={<DollarOutlined />}
          style={offline ? { color: '#fa8c16' } : undefined}
        >
          {rate ? `${rate.toFixed(2)}` : '--'}
          {offline && <Badge status="warning" size="small" style={{ marginLeft: 4 }} />}
        </Button>
      </Dropdown>
      <Tooltip
        title={
          offline
            ? `离线汇率（${updatedLabel || '历史缓存'}），点击刷新`
            : (updatedLabel ? `${updatedLabel}（每 60 分钟自动更新）` : '刷新汇率')
        }
      >
        <Button size="small" icon={<ReloadOutlined spin={refreshing || loading} />} onClick={handleRefresh} />
      </Tooltip>
    </Space>
  );
}

function ThemeToggle() {
  const { toggleTheme, isDark } = useTheme();
  return (
    <Tooltip title={isDark ? '切换亮色' : '切换暗色'}>
      <Button size="small" icon={<BulbOutlined />} onClick={toggleTheme} />
    </Tooltip>
  );
}

function GlobalSearch() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [keyword, setKeyword] = useState('');

  useEffect(() => {
    const handler = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        setOpen(true);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const handleSearch = () => {
    const kw = keyword.trim();
    if (!kw) return;
    // 简单规则：订单号（长且带横杠）→ 交易明细；其余 → 商品分析
    // 统一用 keyword 参数名（目标页面按此读取）
    if (/^\d{3}-\d{7}-\d{7}$/.test(kw) || kw.length > 10 && /[A-Z0-9-]/.test(kw)) {
      navigate(`/transactions?keyword=${encodeURIComponent(kw)}`);
    } else {
      navigate(`/product?keyword=${encodeURIComponent(kw)}`);
    }
    setOpen(false);
    setKeyword('');
  };

  return (
    <>
      <Tooltip title="全局搜索（Ctrl+K）">
        <Input
          size="small"
          prefix={<SearchOutlined />}
          placeholder="搜索订单/商品..."
          style={{ width: 200 }}
          onFocus={() => setOpen(true)}
        />
      </Tooltip>
      <Modal
        title="全局搜索"
        open={open}
        onCancel={() => setOpen(false)}
        onOk={handleSearch}
        okText="搜索"
        cancelText="取消"
      >
        <Input
          autoFocus
          size="large"
          prefix={<SearchOutlined />}
          placeholder="输入订单号或商品名称..."
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          onPressEnter={handleSearch}
        />
        <div style={{ marginTop: 8, fontSize: 12, color: '#8c8c8c' }}>
          提示：订单号跳转到交易明细，商品名跳转到商品分析
        </div>
      </Modal>
    </>
  );
}

function UserMenu({ isMobile }) {
  const { currentAccount, logout } = useAuth();
  const navigate = useNavigate();

  const items = [
    { key: 'settings', icon: <SettingOutlined />, label: '系统设置', onClick: () => navigate('/settings') },
    { type: 'divider' },
    { key: 'logout', icon: <LogoutOutlined />, label: '退出登录', onClick: () => { logout(); navigate('/login'); } }
  ];

  const nickname = currentAccount?.nickname || currentAccount?.username || '用户';
  const level = currentAccount?.level || 1;

  return (
    <Dropdown menu={{ items }} placement="bottomRight">
      <Space style={{ cursor: 'pointer' }}>
        <Avatar size="small" icon={<UserOutlined />} style={{ backgroundColor: '#1e3a5f' }} />
        {/* 手机端空间有限，只显示头像，昵称放菜单里 */}
        {!isMobile && (
          <span style={{ fontSize: 13 }}>
            {nickname}
            <span style={{ color: '#8c8c8c', marginLeft: 4, fontSize: 11 }}>
              Lv.{level} {permLevelName(level)}
            </span>
          </span>
        )}
      </Space>
    </Dropdown>
  );
}

function AppLayout() {
  const navigate = useNavigate();
  // 设置页路由守卫：设置页全部为管理功能，只读用户（Lv.1）无任何可操作项，
  // 直接重定向首页，避免无权限用户进入管理界面
  const { can } = useAuth();
  const location = useLocation();
  // 主题配置：布局配色全部取自当前主题（随主题联动）
  const { themeConfig } = useTheme();
  const [isMobile, setIsMobile] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  // 离线模式状态（数据来自本地缓存）
  const [cloudOffline, setCloudOffline] = useState(false);

  // 监听云端状态变化，离线时显示提示条
  useEffect(() => {
    const unsubscribe = subscribeCloudStatus((result) => {
      setCloudOffline(result.status !== 'online');
    });
    return unsubscribe;
  }, []);

  // 本地缓存写入失败告警（存储空间不足时数据无法持久化，刷新会丢失）
  const [cacheError, setCacheError] = useState(() => localCacheState?.error || null);
  useEffect(() => {
    const handler = (e) => setCacheError(e?.detail || '本地数据保存失败');
    window.addEventListener('amz-local-cache-error', handler);
    return () => window.removeEventListener('amz-local-cache-error', handler);
  }, []);

  // 响应式：监听窗口宽度，<768px 视为手机
  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const selectedKey = (() => {
    const p = location.pathname;
    if (p === '/') return '/';
    const hit = menuItems.find((m) => m.key !== '/' && p.startsWith(m.key));
    return hit ? hit.key : '/';
  })();

  // 主题化配色（全部映射到当前主题配置，随主题切换联动）
  const bgColor = themeConfig.token.colorBgContainer;
  const textColor = themeConfig.extended.headerTextColor;
  const subTextColor = themeConfig.token.colorTextTertiary;
  const contentBg = themeConfig.extended.contentBg;
  const siderBg = themeConfig.extended.sidebarGradient;
  const headerBorderColor = themeConfig.extended.headerBorderColor;

  const menu = (
    <Menu
      theme="dark"
      mode="inline"
      selectedKeys={[selectedKey]}
      items={menuItems}
      onClick={(info) => { navigate(info.key); setDrawerOpen(false); }}
      style={{ background: 'transparent', borderRight: 0, marginTop: 16 }}
    />
  );

  const sidebarLogo = (
    <div
      style={{
        height: 64,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: themeConfig.extended.siderLogoTextColor,
        fontSize: 16,
        fontWeight: 'bold',
        borderBottom: '1px solid rgba(255,255,255,0.1)',
        letterSpacing: 1
      }}
    >
      亚马逊财务系统
    </div>
  );

  return (
    <Layout style={{ minHeight: '100vh', background: themeConfig.token.colorBgLayout }}>
      {/* 电脑端：固定侧边栏 */}
      {!isMobile && (
        <Sider width={220} style={{ background: siderBg }} theme="dark">
          {sidebarLogo}
          {menu}
        </Sider>
      )}

      {/* 手机端：抽屉菜单 */}
      {isMobile && (
        <Drawer
          placement="left"
          width={220}
          open={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          styles={{ body: { padding: 0, background: siderBg } }}
          closable={false}
        >
          {sidebarLogo}
          {menu}
        </Drawer>
      )}

      <Layout>
        <Header
          style={{
            background: bgColor,
            color: textColor,
            padding: '0 12px',
            boxShadow: '0 1px 4px rgba(0,21,41,.08)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            borderBottom: `1px solid ${headerBorderColor}`,
            height: 56,
            lineHeight: '56px'
          }}
        >
          <Space size={8} wrap style={{ flex: 1, minWidth: 0 }}>
            {isMobile && (
              <Button
                type="text"
                icon={<MenuOutlined style={{ fontSize: 18 }} />}
                onClick={() => setDrawerOpen(true)}
                style={{ color: textColor }}
              />
            )}
            <StoreSelector isMobile={isMobile} />
          </Space>
          <Space size={isMobile ? 4 : 8} style={{ flexShrink: 0 }}>
            {!isMobile && <GlobalSearch />}
            <RateDisplay />
            <ThemeToggle />
            <UserMenu isMobile={isMobile} />
          </Space>
        </Header>

        {/* 离线模式提示条 */}
        {cloudOffline && (
          <Alert
            banner
            type="warning"
            showIcon
            icon={<DisconnectOutlined />}
            message="云端暂不可用，数据来自本地缓存；网络恢复后自动同步。可到「设置 → 云端同步」配置 GitHub 免费云端"
            style={{ borderRadius: 0 }}
          />
        )}

        {/* 本地缓存写入失败告警（存储空间不足时刷新会丢数据） */}
        {cacheError && (
          <Alert
            banner
            type="error"
            showIcon
            icon={<ExclamationCircleOutlined />}
            message={cacheError}
            closable
            onClose={() => { setCacheError(null); localCacheState.error = null; }}
            style={{ borderRadius: 0 }}
          />
        )}

        <Content
          style={{
            margin: isMobile ? 8 : 16,
            padding: isMobile ? 12 : 20,
            background: contentBg,
            color: textColor,
            borderRadius: 8,
            minHeight: 'calc(100vh - 56px - 32px)',
            boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
            overflowX: 'auto'
          }}
        >
          <Suspense
            fallback={
              <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}>
                <Spin tip="页面加载中...">
                  <div style={{ width: 120, height: 30 }} />
                </Spin>
              </div>
            }
          >
            <Routes>
              <Route path="/" element={<ErrorBoundary><Dashboard /></ErrorBoundary>} />
              <Route path="/import" element={<ErrorBoundary><DataImport /></ErrorBoundary>} />
              <Route path="/transactions" element={<ErrorBoundary><TransactionList /></ErrorBoundary>} />
              <Route path="/expense" element={<ErrorBoundary><ExpenseAnalysis /></ErrorBoundary>} />
              <Route path="/product" element={<ErrorBoundary><ProductAnalysis /></ErrorBoundary>} />
              <Route path="/settings" element={<ErrorBoundary>{can(PERM.IMPORT_DATA) ? <Settings /> : <Navigate to="/" replace />}</ErrorBoundary>} />
              <Route path="/settlement" element={<ErrorBoundary><SettlementAnalysis /></ErrorBoundary>} />
              <Route path="/business" element={<ErrorBoundary><BusinessAnalysis /></ErrorBoundary>} />
              <Route path="/advertising" element={<ErrorBoundary><AdvertisingAnalysis /></ErrorBoundary>} />
              <Route path="/inventory" element={<ErrorBoundary><InventoryAnalysis /></ErrorBoundary>} />
              <Route path="/help" element={<ErrorBoundary><HelpCenter /></ErrorBoundary>} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Suspense>
        </Content>
      </Layout>
    </Layout>
  );
}

function AppContent() {
  const { currentAccount, loading } = useAuth();
  const location = useLocation();
  // 主题配置：登录前加载页背景也随主题
  const { themeConfig } = useTheme();

  if (loading) {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        minHeight: '100vh', background: themeConfig.token.colorBgLayout
      }}>
        加载中...
      </div>
    );
  }

  if (!currentAccount) {
    if (location.pathname === '/login') return <Login />;
    return <Navigate to="/login" replace />;
  }

  if (currentAccount.mustChangePassword) {
    return <Login />;
  }

  return <AppLayout />;
}

// 主题化应用容器：位于 ThemeProvider 内，读取当前主题配置注入 antd ConfigProvider
function ThemedApp() {
  const { themeConfig, isDark } = useTheme();
  const { defaultAlgorithm, darkAlgorithm } = theme;

  return (
    <ConfigProvider
      theme={{
        token: themeConfig.token,
        components: themeConfig.components,
        algorithm: isDark ? darkAlgorithm : defaultAlgorithm
      }}
    >
      <AuthProvider>
        <HashRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <StoreProvider>
            <RateProvider>
              <AppContent />
            </RateProvider>
          </StoreProvider>
        </HashRouter>
      </AuthProvider>
    </ConfigProvider>
  );
}

export default function App() {
  // ThemeProvider 在最外层，保证内部所有组件都能使用 useTheme 读取主题
  return (
    <ThemeProvider>
      <ThemedApp />
    </ThemeProvider>
  );
}
