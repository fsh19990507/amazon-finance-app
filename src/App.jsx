import React, { useState, useMemo, useEffect } from 'react';
import { HashRouter, Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import {
  Layout, Menu, ConfigProvider, theme, Dropdown, Avatar, Button, Select, Tooltip,
  Badge, Space, Input, Modal, message
} from 'antd';
import {
  DashboardOutlined, FileExcelOutlined, UnorderedListOutlined, PieChartOutlined,
  BarChartOutlined, SettingOutlined, LogoutOutlined, UserOutlined,
  BulbOutlined, SearchOutlined, ShopOutlined, DollarOutlined,
  ReloadOutlined, EyeOutlined, ExclamationCircleOutlined, StarOutlined
} from '@ant-design/icons';

import { AuthProvider, useAuth } from './context/AuthContext.jsx';
import { ThemeProvider, useTheme } from './context/ThemeContext.jsx';
import { StoreProvider, useStore } from './context/StoreContext.jsx';
import { RateProvider, useRate } from './context/RateContext.jsx';
import { permLevelName } from './utils/permissions.js';

import Login from './pages/Login.jsx';
import Dashboard from './pages/Dashboard.jsx';
import DataImport from './pages/DataImport.jsx';
import TransactionList from './pages/TransactionList.jsx';
import ExpenseAnalysis from './pages/ExpenseAnalysis.jsx';
import ProductAnalysis from './pages/ProductAnalysis.jsx';
import Settings from './pages/Settings.jsx';

const { Header, Sider, Content } = Layout;
const { Option } = Select;

const menuItems = [
  { key: '/', icon: <DashboardOutlined />, label: '财务总览' },
  { key: '/import', icon: <FileExcelOutlined />, label: '数据导入' },
  { key: '/transactions', icon: <UnorderedListOutlined />, label: '交易明细' },
  { key: '/expense', icon: <PieChartOutlined />, label: '费用分析' },
  { key: '/product', icon: <BarChartOutlined />, label: '商品分析' },
  { key: '/settings', icon: <SettingOutlined />, label: '系统设置' }
];

function StoreSelector() {
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
        style={{ width: 260 }}
        placeholder="选择对比店铺（2-3个）"
        maxTagCount={3}
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
        style={{ width: 170 }}
        options={options}
      />
      {can(4) && (
        <Tooltip title={compareMode ? '退出对比' : '店铺对比模式'}>
          <Button size="small" type={compareMode ? 'primary' : 'default'} onClick={() => setCompareMode(!compareMode)}>
            {compareMode ? '对比中' : '对比'}
          </Button>
        </Tooltip>
      )}
    </Space.Compact>
  );
}

function RateDisplay() {
  const { rate, loading, offline, displayMode, setDisplayMode, refreshRate } = useRate();
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

  return (
    <Space size={4}>
      <Dropdown menu={{ items: modeItems, onClick: ({ key }) => setDisplayMode(key), selectedKeys: [displayMode] }}>
        <Button size="small" icon={<DollarOutlined />}>
          {rate ? `${rate.toFixed(2)}` : '--'}
          {offline && <Badge status="warning" size="small" style={{ marginLeft: 4 }} />}
        </Button>
      </Dropdown>
      <Tooltip title={offline ? '离线汇率，点击刷新' : '刷新汇率'}>
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
    if (/^\d{3}-\d{7}-\d{7}$/.test(kw) || kw.length > 10 && /[A-Z0-9-]/.test(kw)) {
      navigate(`/transactions?search=${encodeURIComponent(kw)}`);
    } else {
      navigate(`/product?search=${encodeURIComponent(kw)}`);
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

function UserMenu() {
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
        <span style={{ fontSize: 13 }}>
          {nickname}
          <span style={{ color: '#8c8c8c', marginLeft: 4, fontSize: 11 }}>
            Lv.{level} {permLevelName(level)}
          </span>
        </span>
      </Space>
    </Dropdown>
  );
}

function AppLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const { isDark } = useTheme();
  const { algorithm } = theme;

  const selectedKey = (() => {
    const p = location.pathname;
    if (p === '/') return '/';
    const hit = menuItems.find((m) => m.key !== '/' && p.startsWith(m.key));
    return hit ? hit.key : '/';
  })();

  const bgColor = isDark ? '#141414' : '#fff';
  const textColor = isDark ? '#fff' : '#1e3a5f';
  const subTextColor = isDark ? '#bfbfbf' : '#8c8c8c';
  const contentBg = isDark ? '#1f1f1f' : '#fff';
  const siderBg = isDark ? '#0a0a0a' : '#1e3a5f';

  return (
    <Layout style={{ minHeight: '100vh', background: isDark ? '#000' : '#f0f2f5' }}>
      <Sider width={220} style={{ background: siderBg }} breakpoint={null} theme={isDark ? 'dark' : 'dark'}>
        <div
          style={{
            height: 64,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#fff',
            fontSize: 16,
            fontWeight: 'bold',
            borderBottom: '1px solid rgba(255,255,255,0.1)',
            letterSpacing: 1
          }}
        >
          亚马逊财务系统
        </div>
        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={[selectedKey]}
          items={menuItems}
          onClick={(info) => navigate(info.key)}
          style={{ background: 'transparent', borderRight: 0, marginTop: 16 }}
        />
      </Sider>
      <Layout>
        <Header
          style={{
            background: bgColor,
            color: textColor,
            padding: '0 16px',
            boxShadow: '0 1px 4px rgba(0,21,41,.08)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            borderBottom: isDark ? '1px solid #303030' : '1px solid #f0f0f0',
            height: 56,
            lineHeight: '56px'
          }}
        >
          <Space size={16}>
            <StoreSelector />
          </Space>
          <Space size={12}>
            <GlobalSearch />
            <RateDisplay />
            <ThemeToggle />
            <UserMenu />
          </Space>
        </Header>
        <Content
          style={{
            margin: 16,
            padding: 20,
            background: contentBg,
            color: textColor,
            borderRadius: 8,
            minHeight: 'calc(100vh - 56px - 32px)',
            boxShadow: '0 2px 8px rgba(0,0,0,0.06)'
          }}
        >
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/import" element={<DataImport />} />
            <Route path="/transactions" element={<TransactionList />} />
            <Route path="/expense" element={<ExpenseAnalysis />} />
            <Route path="/product" element={<ProductAnalysis />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Content>
      </Layout>
    </Layout>
  );
}

function AppContent() {
  const { currentAccount, loading } = useAuth();
  const location = useLocation();
  const { isDark } = useTheme();
  const { algorithm } = theme;

  if (loading) {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        minHeight: '100vh', background: isDark ? '#000' : '#f0f2f5'
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

export default function App() {
  return (
    <ConfigProvider
      theme={{
        token: {
          colorPrimary: '#1e3a5f',
          borderRadius: 6,
          fontSize: 14
        },
        algorithm: theme.defaultAlgorithm
      }}
    >
      <AuthProvider>
        <ThemeProvider>
          <HashRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
            <StoreProvider>
              <RateProvider>
                <AppContent />
              </RateProvider>
            </StoreProvider>
          </HashRouter>
        </ThemeProvider>
      </AuthProvider>
    </ConfigProvider>
  );
}
