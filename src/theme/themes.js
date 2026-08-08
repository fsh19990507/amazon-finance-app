// ============================================================
// 5 套完整主题定义（不是简单换色，是包含菜单选中态、按钮、
// 图标、图表配色的全套主题体系）
//
// 每套主题包含 4 层配置：
//   1. token        —— antd 设计令牌（主色/背景/文字/边框/圆角）
//   2. components   —— antd 组件级令牌（Menu 选中态、Table 表头、Tabs 等）
//   3. extended     —— 系统扩展样式（侧边栏渐变、登录页背景等）
//   4. chartColors  —— ECharts 图表配色（随主题协调）
// ============================================================

// 财务语义色（数据含义优先，所有主题保持一致，不随主题变）
export const SEMANTIC_COLORS = {
  up: '#3f8600',     // 涨/盈利（绿）
  down: '#cf1322',   // 跌/亏损（红）
  warn: '#fa8c16'    // 警告（橙）
};

// 通用圆角/字号（各主题可覆盖）
const COMMON_TOKEN = {
  borderRadius: 6,
  borderRadiusLG: 8,
  fontSize: 14
};

const buildTheme = ({ id, name, isDark, token, components, extended, chartColors }) => ({
  id,
  name,
  isDark,
  token: { ...COMMON_TOKEN, ...token },
  components,
  extended,
  chartColors
});

// ============================================================
// 1. 经典商务蓝（默认主题，与现有 #1e3a5f 风格一致）
// ============================================================
const corporate = buildTheme({
  id: 'corporate',
  name: '经典商务蓝',
  isDark: false,
  token: {
    colorPrimary: '#1e3a5f',
    colorInfo: '#1e3a5f',
    colorSuccess: '#3f8600',
    colorWarning: '#fa8c16',
    colorError: '#cf1322',
    colorLink: '#1e3a5f',
    colorBgLayout: '#f0f2f5',
    colorBgContainer: '#ffffff',
    colorBgElevated: '#ffffff',
    colorText: '#262626',
    colorTextSecondary: '#595959',
    colorTextTertiary: '#8c8c8c',
    colorBorder: '#d9d9d9',
    colorBorderSecondary: '#f0f0f0'
  },
  components: {
    Menu: {
      darkItemBg: 'transparent',
      darkItemColor: 'rgba(255,255,255,0.72)',
      darkItemHoverColor: '#ffffff',
      darkItemSelectedBg: '#2d5a87',
      darkItemSelectedColor: '#ffffff',
      darkSubMenuItemBg: 'rgba(0,0,0,0.18)',
      itemSelectedBg: '#e6f0fa',
      itemSelectedColor: '#1e3a5f',
      activeBarBorderWidth: 3
    },
    Layout: {
      siderBg: '#1e3a5f',
      headerBg: '#ffffff',
      bodyBg: '#f0f2f5',
      triggerBg: '#1e3a5f',
      headerHeight: 56
    },
    Button: {
      primaryColor: '#ffffff',
      primaryShadow: '0 2px 0 rgba(0,0,0,0.06)'
    },
    Table: {
      headerBg: '#fafafa',
      headerColor: '#595959',
      headerSplitColor: '#f0f0f0',
      rowHoverBg: '#f7fafd'
    },
    Tabs: {
      inkBarColor: '#1e3a5f',
      itemSelectedColor: '#1e3a5f',
      itemHoverColor: '#2d5a87'
    },
    Card: { headerBg: '#ffffff' }
  },
  extended: {
    sidebarGradient: 'linear-gradient(180deg, #16304f 0%, #1e3a5f 55%, #26476f 100%)',
    loginGradient: 'linear-gradient(135deg, #1e3a5f 0%, #2d5a87 100%)',
    contentBg: '#ffffff',
    headerTextColor: '#1e3a5f',
    siderLogoTextColor: '#ffffff',
    headerBorderColor: '#f0f0f0'
  },
  chartColors: ['#1e3a5f', '#3f8600', '#cf1322', '#fa8c16', '#722ed1', '#13c2c2']
});

// ============================================================
// 2. 深空暗黑（暗色主题）
// ============================================================
const midnight = buildTheme({
  id: 'midnight',
  name: '深空暗黑',
  isDark: true,
  token: {
    colorPrimary: '#1668dc',
    colorInfo: '#1668dc',
    colorSuccess: '#49aa19',
    colorWarning: '#d89614',
    colorError: '#dc4446',
    colorLink: '#3c9ae8',
    colorBgLayout: '#0d1117',
    colorBgContainer: '#161b22',
    colorBgElevated: '#1c232d',
    colorText: 'rgba(255,255,255,0.88)',
    colorTextSecondary: 'rgba(255,255,255,0.65)',
    colorTextTertiary: 'rgba(255,255,255,0.45)',
    colorBorder: '#30363d',
    colorBorderSecondary: '#21262d'
  },
  components: {
    Menu: {
      darkItemBg: 'transparent',
      darkItemColor: 'rgba(255,255,255,0.65)',
      darkItemHoverColor: '#ffffff',
      darkItemSelectedBg: '#1668dc',
      darkItemSelectedColor: '#ffffff',
      darkSubMenuItemBg: 'rgba(0,0,0,0.25)',
      itemSelectedBg: '#1c2a3d',
      itemSelectedColor: '#3c9ae8',
      activeBarBorderWidth: 3
    },
    Layout: {
      siderBg: '#0d1117',
      headerBg: '#161b22',
      bodyBg: '#0d1117',
      triggerBg: '#0d1117',
      headerHeight: 56
    },
    Button: {
      primaryColor: '#ffffff',
      primaryShadow: '0 2px 0 rgba(0,0,0,0.3)'
    },
    Table: {
      headerBg: '#1c232d',
      headerColor: 'rgba(255,255,255,0.72)',
      headerSplitColor: '#30363d',
      rowHoverBg: 'rgba(255,255,255,0.06)'
    },
    Tabs: {
      inkBarColor: '#1668dc',
      itemSelectedColor: '#3c9ae8',
      itemHoverColor: '#3c9ae8'
    },
    Card: { headerBg: '#161b22' }
  },
  extended: {
    sidebarGradient: 'linear-gradient(180deg, #0a0e13 0%, #0d1117 55%, #131a23 100%)',
    loginGradient: 'linear-gradient(135deg, #0d1117 0%, #1c2836 100%)',
    contentBg: '#161b22',
    headerTextColor: 'rgba(255,255,255,0.88)',
    siderLogoTextColor: '#ffffff',
    headerBorderColor: '#30363d'
  },
  chartColors: ['#1668dc', '#49aa19', '#dc4446', '#d89614', '#b37feb', '#13c2c2']
});

// ============================================================
// 3. 翡翠商务绿（浅色）
// ============================================================
const emerald = buildTheme({
  id: 'emerald',
  name: '翡翠商务绿',
  isDark: false,
  token: {
    colorPrimary: '#0e7a4d',
    colorInfo: '#0e7a4d',
    colorSuccess: '#389e0d',
    colorWarning: '#d48806',
    colorError: '#cf1322',
    colorLink: '#0e7a4d',
    colorBgLayout: '#f2f7f4',
    colorBgContainer: '#ffffff',
    colorBgElevated: '#ffffff',
    colorText: '#262626',
    colorTextSecondary: '#595959',
    colorTextTertiary: '#8c8c8c',
    colorBorder: '#d9e6df',
    colorBorderSecondary: '#eef4f0'
  },
  components: {
    Menu: {
      darkItemBg: 'transparent',
      darkItemColor: 'rgba(255,255,255,0.72)',
      darkItemHoverColor: '#ffffff',
      darkItemSelectedBg: '#0e7a4d',
      darkItemSelectedColor: '#ffffff',
      darkSubMenuItemBg: 'rgba(0,0,0,0.18)',
      itemSelectedBg: '#e4f3ec',
      itemSelectedColor: '#0e7a4d',
      activeBarBorderWidth: 3
    },
    Layout: {
      siderBg: '#0b5e3c',
      headerBg: '#ffffff',
      bodyBg: '#f2f7f4',
      triggerBg: '#0b5e3c',
      headerHeight: 56
    },
    Button: {
      primaryColor: '#ffffff',
      primaryShadow: '0 2px 0 rgba(0,0,0,0.06)'
    },
    Table: {
      headerBg: '#f5faf7',
      headerColor: '#3d7a5c',
      headerSplitColor: '#eef4f0',
      rowHoverBg: '#f2faf6'
    },
    Tabs: {
      inkBarColor: '#0e7a4d',
      itemSelectedColor: '#0e7a4d',
      itemHoverColor: '#179660'
    },
    Card: { headerBg: '#ffffff' }
  },
  extended: {
    sidebarGradient: 'linear-gradient(180deg, #0a5334 0%, #0b5e3c 55%, #0f7a4f 100%)',
    loginGradient: 'linear-gradient(135deg, #0b5e3c 0%, #179660 100%)',
    contentBg: '#ffffff',
    headerTextColor: '#0b5e3c',
    siderLogoTextColor: '#ffffff',
    headerBorderColor: '#eef4f0'
  },
  chartColors: ['#0e7a4d', '#389e0d', '#cf1322', '#d48806', '#1668dc', '#13c2c2']
});

// ============================================================
// 4. 优雅紫罗兰（浅色）
// ============================================================
const violet = buildTheme({
  id: 'violet',
  name: '优雅紫罗兰',
  isDark: false,
  token: {
    colorPrimary: '#5b2d90',
    colorInfo: '#5b2d90',
    colorSuccess: '#389e0d',
    colorWarning: '#d48806',
    colorError: '#cf1322',
    colorLink: '#5b2d90',
    colorBgLayout: '#f5f2f9',
    colorBgContainer: '#ffffff',
    colorBgElevated: '#ffffff',
    colorText: '#262626',
    colorTextSecondary: '#595959',
    colorTextTertiary: '#8c8c8c',
    colorBorder: '#e0d8ec',
    colorBorderSecondary: '#f1edf6'
  },
  components: {
    Menu: {
      darkItemBg: 'transparent',
      darkItemColor: 'rgba(255,255,255,0.72)',
      darkItemHoverColor: '#ffffff',
      darkItemSelectedBg: '#5b2d90',
      darkItemSelectedColor: '#ffffff',
      darkSubMenuItemBg: 'rgba(0,0,0,0.18)',
      itemSelectedBg: '#f0e8f8',
      itemSelectedColor: '#5b2d90',
      activeBarBorderWidth: 3
    },
    Layout: {
      siderBg: '#47226f',
      headerBg: '#ffffff',
      bodyBg: '#f5f2f9',
      triggerBg: '#47226f',
      headerHeight: 56
    },
    Button: {
      primaryColor: '#ffffff',
      primaryShadow: '0 2px 0 rgba(0,0,0,0.06)'
    },
    Table: {
      headerBg: '#f7f3fb',
      headerColor: '#6a3f9e',
      headerSplitColor: '#f1edf6',
      rowHoverBg: '#f8f4fc'
    },
    Tabs: {
      inkBarColor: '#5b2d90',
      itemSelectedColor: '#5b2d90',
      itemHoverColor: '#7a44bd'
    },
    Card: { headerBg: '#ffffff' }
  },
  extended: {
    sidebarGradient: 'linear-gradient(180deg, #3c1d5e 0%, #47226f 55%, #5b2d90 100%)',
    loginGradient: 'linear-gradient(135deg, #47226f 0%, #7a44bd 100%)',
    contentBg: '#ffffff',
    headerTextColor: '#47226f',
    siderLogoTextColor: '#ffffff',
    headerBorderColor: '#f1edf6'
  },
  chartColors: ['#5b2d90', '#722ed1', '#cf1322', '#d48806', '#0e7a4d', '#13c2c2']
});

// ============================================================
// 5. 暖阳橙（浅色）
// ============================================================
const sunset = buildTheme({
  id: 'sunset',
  name: '暖阳橙',
  isDark: false,
  token: {
    colorPrimary: '#d46b08',
    colorInfo: '#d46b08',
    colorSuccess: '#389e0d',
    colorWarning: '#d48806',
    colorError: '#cf1322',
    colorLink: '#d46b08',
    colorBgLayout: '#faf5f0',
    colorBgContainer: '#ffffff',
    colorBgElevated: '#ffffff',
    colorText: '#262626',
    colorTextSecondary: '#595959',
    colorTextTertiary: '#8c8c8c',
    colorBorder: '#ecdccb',
    colorBorderSecondary: '#f6eee4'
  },
  components: {
    Menu: {
      darkItemBg: 'transparent',
      darkItemColor: 'rgba(255,255,255,0.72)',
      darkItemHoverColor: '#ffffff',
      darkItemSelectedBg: '#d46b08',
      darkItemSelectedColor: '#ffffff',
      darkSubMenuItemBg: 'rgba(0,0,0,0.18)',
      itemSelectedBg: '#fdf0e3',
      itemSelectedColor: '#d46b08',
      activeBarBorderWidth: 3
    },
    Layout: {
      siderBg: '#a8560a',
      headerBg: '#ffffff',
      bodyBg: '#faf5f0',
      triggerBg: '#a8560a',
      headerHeight: 56
    },
    Button: {
      primaryColor: '#ffffff',
      primaryShadow: '0 2px 0 rgba(0,0,0,0.06)'
    },
    Table: {
      headerBg: '#fbf3ea',
      headerColor: '#a65d1d',
      headerSplitColor: '#f6eee4',
      rowHoverBg: '#fdf6ee'
    },
    Tabs: {
      inkBarColor: '#d46b08',
      itemSelectedColor: '#d46b08',
      itemHoverColor: '#e87914'
    },
    Card: { headerBg: '#ffffff' }
  },
  extended: {
    sidebarGradient: 'linear-gradient(180deg, #8f4a08 0%, #a8560a 55%, #c96609 100%)',
    loginGradient: 'linear-gradient(135deg, #a8560a 0%, #e87914 100%)',
    contentBg: '#ffffff',
    headerTextColor: '#a8560a',
    siderLogoTextColor: '#ffffff',
    headerBorderColor: '#f6eee4'
  },
  chartColors: ['#d46b08', '#fa8c16', '#cf1322', '#0e7a4d', '#5b2d90', '#13c2c2']
});

// ============================================================
// 导出
// ============================================================

// 全部主题（按展示顺序）
export const THEMES = [corporate, midnight, emerald, violet, sunset];

// 主题 ID → 配置 映射（快速查找）
export const THEME_MAP = Object.fromEntries(THEMES.map((t) => [t.id, t]));

// 默认主题 ID
export const DEFAULT_THEME_ID = 'corporate';

// 获取主题图表配色（供各页面 useECharts 使用）
export function chartColorsFor(themeId) {
  return THEME_MAP[themeId]?.chartColors || corporate.chartColors;
}

// 获取完整主题配置（ThemeContext 使用）
export function getThemeConfig(themeId) {
  return THEME_MAP[themeId] || corporate;
}

// 是否暗色主题
export function isDarkTheme(themeId) {
  return THEME_MAP[themeId]?.isDark || false;
}
