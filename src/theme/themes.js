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
// 6. 中国风 · 故宫朱砂（浅色）
// 视觉身份：朱砂红 + 鎏金，庄重大气，古典中国风
// ============================================================
const chinaRed = buildTheme({
  id: 'china-red',
  name: '中国风·故宫朱砂',
  isDark: false,
  token: {
    colorPrimary: '#9e2b25',
    colorInfo: '#9e2b25',
    colorSuccess: '#3f8600',
    colorWarning: '#d48806',
    colorError: '#cf1322',
    colorLink: '#9e2b25',
    colorBgLayout: '#faf3f1',
    colorBgContainer: '#ffffff',
    colorBgElevated: '#ffffff',
    colorText: '#262626',
    colorTextSecondary: '#595959',
    colorTextTertiary: '#8c8c8c',
    colorBorder: '#e5d5d0',
    colorBorderSecondary: '#f6ece9'
  },
  components: {
    Menu: {
      darkItemBg: 'transparent',
      darkItemColor: 'rgba(255,255,255,0.72)',
      darkItemHoverColor: '#ffffff',
      darkItemSelectedBg: '#9e2b25',
      darkItemSelectedColor: '#ffffff',
      darkSubMenuItemBg: 'rgba(0,0,0,0.18)',
      itemSelectedBg: '#f7e6e3',
      itemSelectedColor: '#9e2b25',
      activeBarBorderWidth: 3
    },
    Layout: {
      siderBg: '#7d1f1a',
      headerBg: '#ffffff',
      bodyBg: '#faf3f1',
      triggerBg: '#7d1f1a',
      headerHeight: 56
    },
    Button: { primaryColor: '#ffffff', primaryShadow: '0 2px 0 rgba(0,0,0,0.06)' },
    Table: {
      headerBg: '#faf1ef',
      headerColor: '#8c2f28',
      headerSplitColor: '#f6ece9',
      rowHoverBg: '#fdf6f4'
    },
    Tabs: { inkBarColor: '#9e2b25', itemSelectedColor: '#9e2b25', itemHoverColor: '#c0392b' },
    Card: { headerBg: '#ffffff' }
  },
  extended: {
    sidebarGradient: 'linear-gradient(180deg, #6b1a16 0%, #7d1f1a 55%, #9e2b25 100%)',
    loginGradient: 'linear-gradient(135deg, #7d1f1a 0%, #c0392b 100%)',
    contentBg: '#ffffff',
    headerTextColor: '#7d1f1a',
    siderLogoTextColor: '#ffffff',
    headerBorderColor: '#f6ece9'
  },
  chartColors: ['#9e2b25', '#d4a72c', '#2e7d6e', '#3f8600', '#5b2d90', '#c0392b']
});

// ============================================================
// 7. 中国风 · 水墨江南（浅色）
// 视觉身份：墨色 + 宣纸白 + 青黛，淡雅文人水墨
// ============================================================
const inkWash = buildTheme({
  id: 'ink-wash',
  name: '中国风·水墨江南',
  isDark: false,
  token: {
    colorPrimary: '#3a3f4b',
    colorInfo: '#3a3f4b',
    colorSuccess: '#3f8600',
    colorWarning: '#b07a2e',
    colorError: '#cf1322',
    colorLink: '#3a3f4b',
    colorBgLayout: '#f4f2ed',
    colorBgContainer: '#ffffff',
    colorBgElevated: '#ffffff',
    colorText: '#262626',
    colorTextSecondary: '#595959',
    colorTextTertiary: '#8c8c8c',
    colorBorder: '#ded9cf',
    colorBorderSecondary: '#f0ede6'
  },
  components: {
    Menu: {
      darkItemBg: 'transparent',
      darkItemColor: 'rgba(255,255,255,0.72)',
      darkItemHoverColor: '#ffffff',
      darkItemSelectedBg: '#3a3f4b',
      darkItemSelectedColor: '#ffffff',
      darkSubMenuItemBg: 'rgba(0,0,0,0.18)',
      itemSelectedBg: '#e9e7e2',
      itemSelectedColor: '#3a3f4b',
      activeBarBorderWidth: 3
    },
    Layout: {
      siderBg: '#2f343f',
      headerBg: '#ffffff',
      bodyBg: '#f4f2ed',
      triggerBg: '#2f343f',
      headerHeight: 56
    },
    Button: { primaryColor: '#ffffff', primaryShadow: '0 2px 0 rgba(0,0,0,0.06)' },
    Table: {
      headerBg: '#f6f4ef',
      headerColor: '#5a5f6b',
      headerSplitColor: '#f0ede6',
      rowHoverBg: '#faf9f5'
    },
    Tabs: { inkBarColor: '#3a3f4b', itemSelectedColor: '#3a3f4b', itemHoverColor: '#5b7a9d' },
    Card: { headerBg: '#ffffff' }
  },
  extended: {
    sidebarGradient: 'linear-gradient(180deg, #262a33 0%, #2f343f 55%, #454b5a 100%)',
    loginGradient: 'linear-gradient(135deg, #2f343f 0%, #5b7a9d 100%)',
    contentBg: '#ffffff',
    headerTextColor: '#2f343f',
    siderLogoTextColor: '#ffffff',
    headerBorderColor: '#f0ede6'
  },
  chartColors: ['#3a3f4b', '#5b7a9d', '#8a6d3b', '#2e7d6e', '#cf1322', '#5b2d90']
});

// ============================================================
// 8. 中国风 · 敦煌金碧（浅色）
// 视觉身份：鎏金 + 赭石 + 青绿，丝路敦煌华彩
// ============================================================
const dunhuang = buildTheme({
  id: 'dunhuang',
  name: '中国风·敦煌金碧',
  isDark: false,
  token: {
    colorPrimary: '#b07a2e',
    colorInfo: '#b07a2e',
    colorSuccess: '#3f8600',
    colorWarning: '#d48806',
    colorError: '#cf1322',
    colorLink: '#b07a2e',
    colorBgLayout: '#f7f0e4',
    colorBgContainer: '#ffffff',
    colorBgElevated: '#ffffff',
    colorText: '#262626',
    colorTextSecondary: '#595959',
    colorTextTertiary: '#8c8c8c',
    colorBorder: '#e2d3b8',
    colorBorderSecondary: '#f3ead9'
  },
  components: {
    Menu: {
      darkItemBg: 'transparent',
      darkItemColor: 'rgba(255,255,255,0.72)',
      darkItemHoverColor: '#ffffff',
      darkItemSelectedBg: '#b07a2e',
      darkItemSelectedColor: '#ffffff',
      darkSubMenuItemBg: 'rgba(0,0,0,0.18)',
      itemSelectedBg: '#f6e9d2',
      itemSelectedColor: '#8a5a1e',
      activeBarBorderWidth: 3
    },
    Layout: {
      siderBg: '#8a5a1e',
      headerBg: '#ffffff',
      bodyBg: '#f7f0e4',
      triggerBg: '#8a5a1e',
      headerHeight: 56
    },
    Button: { primaryColor: '#ffffff', primaryShadow: '0 2px 0 rgba(0,0,0,0.06)' },
    Table: {
      headerBg: '#f8f1e3',
      headerColor: '#8a5a1e',
      headerSplitColor: '#f3ead9',
      rowHoverBg: '#fbf6ec'
    },
    Tabs: { inkBarColor: '#b07a2e', itemSelectedColor: '#b07a2e', itemHoverColor: '#c1853b' },
    Card: { headerBg: '#ffffff' }
  },
  extended: {
    sidebarGradient: 'linear-gradient(180deg, #6f4817 0%, #8a5a1e 55%, #b07a2e 100%)',
    loginGradient: 'linear-gradient(135deg, #8a5a1e 0%, #2e7d6e 100%)',
    contentBg: '#ffffff',
    headerTextColor: '#8a5a1e',
    siderLogoTextColor: '#ffffff',
    headerBorderColor: '#f3ead9'
  },
  chartColors: ['#b07a2e', '#2e7d6e', '#9a4e2e', '#c1853b', '#3f8600', '#5b2d90']
});

// ============================================================
// 9. 日式风 · 樱花和风（浅色）
// 视觉身份：樱粉 + 雾灰 + 浅木，温柔和风
// ============================================================
const sakura = buildTheme({
  id: 'sakura',
  name: '日式·樱花和风',
  isDark: false,
  token: {
    colorPrimary: '#d97b9d',
    colorInfo: '#d97b9d',
    colorSuccess: '#3f8600',
    colorWarning: '#d48806',
    colorError: '#cf1322',
    colorLink: '#d97b9d',
    colorBgLayout: '#faf5f7',
    colorBgContainer: '#ffffff',
    colorBgElevated: '#ffffff',
    colorText: '#262626',
    colorTextSecondary: '#595959',
    colorTextTertiary: '#8c8c8c',
    colorBorder: '#ecd8e0',
    colorBorderSecondary: '#f7eef2'
  },
  components: {
    Menu: {
      darkItemBg: 'transparent',
      darkItemColor: 'rgba(255,255,255,0.72)',
      darkItemHoverColor: '#ffffff',
      darkItemSelectedBg: '#d97b9d',
      darkItemSelectedColor: '#ffffff',
      darkSubMenuItemBg: 'rgba(0,0,0,0.18)',
      itemSelectedBg: '#f9e9ef',
      itemSelectedColor: '#b95f83',
      activeBarBorderWidth: 3
    },
    Layout: {
      siderBg: '#b95f83',
      headerBg: '#ffffff',
      bodyBg: '#faf5f7',
      triggerBg: '#b95f83',
      headerHeight: 56
    },
    Button: { primaryColor: '#ffffff', primaryShadow: '0 2px 0 rgba(0,0,0,0.06)' },
    Table: {
      headerBg: '#faf2f5',
      headerColor: '#a85a78',
      headerSplitColor: '#f7eef2',
      rowHoverBg: '#fdf7f9'
    },
    Tabs: { inkBarColor: '#d97b9d', itemSelectedColor: '#d97b9d', itemHoverColor: '#e88fb0' },
    Card: { headerBg: '#ffffff' }
  },
  extended: {
    sidebarGradient: 'linear-gradient(180deg, #a44e70 0%, #b95f83 55%, #d97b9d 100%)',
    loginGradient: 'linear-gradient(135deg, #b95f83 0%, #e88fb0 100%)',
    contentBg: '#ffffff',
    headerTextColor: '#b95f83',
    siderLogoTextColor: '#ffffff',
    headerBorderColor: '#f7eef2'
  },
  chartColors: ['#d97b9d', '#4a6fa5', '#2e7d6e', '#b07a2e', '#8a5cf5', '#3f8600']
});

// ============================================================
// 10. 日式风 · 浮世绘靛蓝（浅色）
// 视觉身份：葛饰蓝靛 + 和纸米白，海浪浮世绘
// ============================================================
const ukiyoe = buildTheme({
  id: 'ukiyoe',
  name: '日式·浮世绘靛蓝',
  isDark: false,
  token: {
    colorPrimary: '#2a4a8f',
    colorInfo: '#2a4a8f',
    colorSuccess: '#3f8600',
    colorWarning: '#d48806',
    colorError: '#cf1322',
    colorLink: '#2a4a8f',
    colorBgLayout: '#f5f0e6',
    colorBgContainer: '#ffffff',
    colorBgElevated: '#ffffff',
    colorText: '#262626',
    colorTextSecondary: '#595959',
    colorTextTertiary: '#8c8c8c',
    colorBorder: '#e0d8c6',
    colorBorderSecondary: '#f0eadf'
  },
  components: {
    Menu: {
      darkItemBg: 'transparent',
      darkItemColor: 'rgba(255,255,255,0.72)',
      darkItemHoverColor: '#ffffff',
      darkItemSelectedBg: '#2a4a8f',
      darkItemSelectedColor: '#ffffff',
      darkSubMenuItemBg: 'rgba(0,0,0,0.18)',
      itemSelectedBg: '#e6edf8',
      itemSelectedColor: '#2a4a8f',
      activeBarBorderWidth: 3
    },
    Layout: {
      siderBg: '#1f3a70',
      headerBg: '#ffffff',
      bodyBg: '#f5f0e6',
      triggerBg: '#1f3a70',
      headerHeight: 56
    },
    Button: { primaryColor: '#ffffff', primaryShadow: '0 2px 0 rgba(0,0,0,0.06)' },
    Table: {
      headerBg: '#f2ecdf',
      headerColor: '#2a4a8f',
      headerSplitColor: '#f0eadf',
      rowHoverBg: '#f8f4ec'
    },
    Tabs: { inkBarColor: '#2a4a8f', itemSelectedColor: '#2a4a8f', itemHoverColor: '#3d66b8' },
    Card: { headerBg: '#ffffff' }
  },
  extended: {
    sidebarGradient: 'linear-gradient(180deg, #182e59 0%, #1f3a70 55%, #2a4a8f 100%)',
    loginGradient: 'linear-gradient(135deg, #1f3a70 0%, #c9502b 100%)',
    contentBg: '#ffffff',
    headerTextColor: '#1f3a70',
    siderLogoTextColor: '#ffffff',
    headerBorderColor: '#f0eadf'
  },
  chartColors: ['#2a4a8f', '#0e7a4d', '#c9502b', '#d4a72c', '#5b2d90', '#13c2c2']
});

// ============================================================
// 11. 日式风 · 京都抹茶（浅色）
// 视觉身份：抹茶绿 + 原木米，茶道侘寂
// ============================================================
const matcha = buildTheme({
  id: 'matcha',
  name: '日式·京都抹茶',
  isDark: false,
  token: {
    colorPrimary: '#557a3d',
    colorInfo: '#557a3d',
    colorSuccess: '#3f8600',
    colorWarning: '#d48806',
    colorError: '#cf1322',
    colorLink: '#557a3d',
    colorBgLayout: '#f3f1e8',
    colorBgContainer: '#ffffff',
    colorBgElevated: '#ffffff',
    colorText: '#262626',
    colorTextSecondary: '#595959',
    colorTextTertiary: '#8c8c8c',
    colorBorder: '#dde3d4',
    colorBorderSecondary: '#efefe6'
  },
  components: {
    Menu: {
      darkItemBg: 'transparent',
      darkItemColor: 'rgba(255,255,255,0.72)',
      darkItemHoverColor: '#ffffff',
      darkItemSelectedBg: '#557a3d',
      darkItemSelectedColor: '#ffffff',
      darkSubMenuItemBg: 'rgba(0,0,0,0.18)',
      itemSelectedBg: '#e8efe2',
      itemSelectedColor: '#3f5c2c',
      activeBarBorderWidth: 3
    },
    Layout: {
      siderBg: '#3f5c2c',
      headerBg: '#ffffff',
      bodyBg: '#f3f1e8',
      triggerBg: '#3f5c2c',
      headerHeight: 56
    },
    Button: { primaryColor: '#ffffff', primaryShadow: '0 2px 0 rgba(0,0,0,0.06)' },
    Table: {
      headerBg: '#f1f0e7',
      headerColor: '#4c6d3a',
      headerSplitColor: '#efefe6',
      rowHoverBg: '#f8f7f0'
    },
    Tabs: { inkBarColor: '#557a3d', itemSelectedColor: '#557a3d', itemHoverColor: '#6d974e' },
    Card: { headerBg: '#ffffff' }
  },
  extended: {
    sidebarGradient: 'linear-gradient(180deg, #334a24 0%, #3f5c2c 55%, #557a3d 100%)',
    loginGradient: 'linear-gradient(135deg, #3f5c2c 0%, #6d974e 100%)',
    contentBg: '#ffffff',
    headerTextColor: '#3f5c2c',
    siderLogoTextColor: '#ffffff',
    headerBorderColor: '#efefe6'
  },
  chartColors: ['#557a3d', '#c1853b', '#2a4a8f', '#cf1322', '#8a5cf5', '#13c2c2']
});

// ============================================================
// 12. 欧美游戏 · 赛博朋克霓虹（暗色）
// 视觉身份：霓虹青 + 品红，暗夜赛博都市
// ============================================================
const cyberpunk = buildTheme({
  id: 'cyberpunk',
  name: '游戏·赛博朋克霓虹',
  isDark: true,
  token: {
    colorPrimary: '#00e5ff',
    colorInfo: '#00e5ff',
    colorSuccess: '#49aa19',
    colorWarning: '#ff9f1c',
    colorError: '#ff2e88',
    colorLink: '#00e5ff',
    colorBgLayout: '#0a0a14',
    colorBgContainer: '#12121f',
    colorBgElevated: '#1a1a2e',
    colorText: 'rgba(255,255,255,0.88)',
    colorTextSecondary: 'rgba(255,255,255,0.65)',
    colorTextTertiary: 'rgba(255,255,255,0.45)',
    colorBorder: '#2a2a44',
    colorBorderSecondary: '#1e1e33'
  },
  components: {
    Menu: {
      darkItemBg: 'transparent',
      darkItemColor: 'rgba(255,255,255,0.65)',
      darkItemHoverColor: '#ffffff',
      darkItemSelectedBg: 'rgba(0,229,255,0.25)',
      darkItemSelectedColor: '#00e5ff',
      darkSubMenuItemBg: 'rgba(0,0,0,0.25)',
      itemSelectedBg: '#132433',
      itemSelectedColor: '#00e5ff',
      activeBarBorderWidth: 3
    },
    Layout: {
      siderBg: '#0a0a14',
      headerBg: '#12121f',
      bodyBg: '#0a0a14',
      triggerBg: '#0a0a14',
      headerHeight: 56
    },
    Button: { primaryColor: '#001318', primaryShadow: '0 2px 0 rgba(0,0,0,0.3)' },
    Table: {
      headerBg: '#1a1a2e',
      headerColor: 'rgba(255,255,255,0.72)',
      headerSplitColor: '#2a2a44',
      rowHoverBg: 'rgba(0,229,255,0.06)'
    },
    Tabs: { inkBarColor: '#00e5ff', itemSelectedColor: '#00e5ff', itemHoverColor: '#00e5ff' },
    Card: { headerBg: '#12121f' }
  },
  extended: {
    sidebarGradient: 'linear-gradient(180deg, #07070f 0%, #0a0a14 55%, #10101e 100%)',
    loginGradient: 'linear-gradient(135deg, #0a0a14 0%, #2a0f2e 100%)',
    contentBg: '#12121f',
    headerTextColor: '#00e5ff',
    siderLogoTextColor: '#00e5ff',
    headerBorderColor: '#2a2a44'
  },
  chartColors: ['#00e5ff', '#ff2e88', '#c8f542', '#ff9f1c', '#9b59f6', '#13c2c2']
});

// ============================================================
// 13. 欧美游戏 · 中世纪奇幻（暗色）
// 视觉身份：古金 + 森林绿 + 紫，暗黑奇幻史诗
// ============================================================
const fantasy = buildTheme({
  id: 'fantasy',
  name: '游戏·中世纪奇幻',
  isDark: true,
  token: {
    colorPrimary: '#c9a24b',
    colorInfo: '#c9a24b',
    colorSuccess: '#4d8a5a',
    colorWarning: '#d48806',
    colorError: '#d1666b',
    colorLink: '#c9a24b',
    colorBgLayout: '#12101c',
    colorBgContainer: '#1a1726',
    colorBgElevated: '#221e33',
    colorText: 'rgba(255,255,255,0.88)',
    colorTextSecondary: 'rgba(255,255,255,0.65)',
    colorTextTertiary: 'rgba(255,255,255,0.45)',
    colorBorder: '#36304a',
    colorBorderSecondary: '#262236'
  },
  components: {
    Menu: {
      darkItemBg: 'transparent',
      darkItemColor: 'rgba(255,255,255,0.65)',
      darkItemHoverColor: '#ffffff',
      darkItemSelectedBg: 'rgba(201,162,75,0.22)',
      darkItemSelectedColor: '#e2b93b',
      darkSubMenuItemBg: 'rgba(0,0,0,0.25)',
      itemSelectedBg: '#2a2440',
      itemSelectedColor: '#e2b93b',
      activeBarBorderWidth: 3
    },
    Layout: {
      siderBg: '#12101c',
      headerBg: '#1a1726',
      bodyBg: '#12101c',
      triggerBg: '#12101c',
      headerHeight: 56
    },
    Button: { primaryColor: '#241d08', primaryShadow: '0 2px 0 rgba(0,0,0,0.3)' },
    Table: {
      headerBg: '#221e33',
      headerColor: 'rgba(255,255,255,0.72)',
      headerSplitColor: '#36304a',
      rowHoverBg: 'rgba(201,162,75,0.06)'
    },
    Tabs: { inkBarColor: '#c9a24b', itemSelectedColor: '#e2b93b', itemHoverColor: '#e2b93b' },
    Card: { headerBg: '#1a1726' }
  },
  extended: {
    sidebarGradient: 'linear-gradient(180deg, #0d0b15 0%, #12101c 55%, #1a1526 100%)',
    loginGradient: 'linear-gradient(135deg, #12101c 0%, #2a2440 100%)',
    contentBg: '#1a1726',
    headerTextColor: '#e2b93b',
    siderLogoTextColor: '#e2b93b',
    headerBorderColor: '#36304a'
  },
  chartColors: ['#c9a24b', '#4d8a5a', '#7b5fc7', '#d1666b', '#5fa8d3', '#e2b93b']
});

// ============================================================
// 14. 动漫风 · 元气动漫（浅色）
// 视觉身份：活力粉 + 天蓝 + 明黄，元气二次元
// ============================================================
const animePop = buildTheme({
  id: 'anime-pop',
  name: '动漫·元气二次元',
  isDark: false,
  token: {
    colorPrimary: '#ff4d8d',
    colorInfo: '#ff4d8d',
    colorSuccess: '#3f8600',
    colorWarning: '#ffc53d',
    colorError: '#cf1322',
    colorLink: '#ff4d8d',
    colorBgLayout: '#fbf5f8',
    colorBgContainer: '#ffffff',
    colorBgElevated: '#ffffff',
    colorText: '#262626',
    colorTextSecondary: '#595959',
    colorTextTertiary: '#8c8c8c',
    colorBorder: '#f0dbe4',
    colorBorderSecondary: '#f9eef2'
  },
  components: {
    Menu: {
      darkItemBg: 'transparent',
      darkItemColor: 'rgba(255,255,255,0.72)',
      darkItemHoverColor: '#ffffff',
      darkItemSelectedBg: '#ff4d8d',
      darkItemSelectedColor: '#ffffff',
      darkSubMenuItemBg: 'rgba(0,0,0,0.18)',
      itemSelectedBg: '#ffe8f0',
      itemSelectedColor: '#e6396f',
      activeBarBorderWidth: 3
    },
    Layout: {
      siderBg: '#e6396f',
      headerBg: '#ffffff',
      bodyBg: '#fbf5f8',
      triggerBg: '#e6396f',
      headerHeight: 56
    },
    Button: { primaryColor: '#ffffff', primaryShadow: '0 2px 0 rgba(0,0,0,0.06)' },
    Table: {
      headerBg: '#fdf2f5',
      headerColor: '#c74a77',
      headerSplitColor: '#f9eef2',
      rowHoverBg: '#fff7f9'
    },
    Tabs: { inkBarColor: '#ff4d8d', itemSelectedColor: '#ff4d8d', itemHoverColor: '#ff6ba3' },
    Card: { headerBg: '#ffffff' }
  },
  extended: {
    sidebarGradient: 'linear-gradient(180deg, #c72e5e 0%, #e6396f 55%, #ff5a8e 100%)',
    loginGradient: 'linear-gradient(135deg, #e6396f 0%, #38a1ff 100%)',
    contentBg: '#ffffff',
    headerTextColor: '#e6396f',
    siderLogoTextColor: '#ffffff',
    headerBorderColor: '#f9eef2'
  },
  chartColors: ['#ff4d8d', '#38a1ff', '#ffc53d', '#36cfc9', '#722ed1', '#3f8600']
});

// ============================================================
// 15. 动漫风 · 暗黑奇幻动漫（暗色）
// 视觉身份：紫罗兰霓虹 + 青 + 品红，暗夜二次元
// ============================================================
const animeDark = buildTheme({
  id: 'anime-dark',
  name: '动漫·暗黑奇幻',
  isDark: true,
  token: {
    colorPrimary: '#a78bfa',
    colorInfo: '#a78bfa',
    colorSuccess: '#49aa19',
    colorWarning: '#ffc53d',
    colorError: '#ff4d8d',
    colorLink: '#a78bfa',
    colorBgLayout: '#13101c',
    colorBgContainer: '#1b1730',
    colorBgElevated: '#241e3f',
    colorText: 'rgba(255,255,255,0.88)',
    colorTextSecondary: 'rgba(255,255,255,0.65)',
    colorTextTertiary: 'rgba(255,255,255,0.45)',
    colorBorder: '#3a2f5c',
    colorBorderSecondary: '#282046'
  },
  components: {
    Menu: {
      darkItemBg: 'transparent',
      darkItemColor: 'rgba(255,255,255,0.65)',
      darkItemHoverColor: '#ffffff',
      darkItemSelectedBg: 'rgba(167,139,250,0.25)',
      darkItemSelectedColor: '#c4b5fd',
      darkSubMenuItemBg: 'rgba(0,0,0,0.25)',
      itemSelectedBg: '#2b2350',
      itemSelectedColor: '#c4b5fd',
      activeBarBorderWidth: 3
    },
    Layout: {
      siderBg: '#13101c',
      headerBg: '#1b1730',
      bodyBg: '#13101c',
      triggerBg: '#13101c',
      headerHeight: 56
    },
    Button: { primaryColor: '#1a1230', primaryShadow: '0 2px 0 rgba(0,0,0,0.3)' },
    Table: {
      headerBg: '#241e3f',
      headerColor: 'rgba(255,255,255,0.72)',
      headerSplitColor: '#3a2f5c',
      rowHoverBg: 'rgba(167,139,250,0.08)'
    },
    Tabs: { inkBarColor: '#a78bfa', itemSelectedColor: '#c4b5fd', itemHoverColor: '#c4b5fd' },
    Card: { headerBg: '#1b1730' }
  },
  extended: {
    sidebarGradient: 'linear-gradient(180deg, #0e0b16 0%, #13101c 55%, #1a1528 100%)',
    loginGradient: 'linear-gradient(135deg, #13101c 0%, #2b2350 100%)',
    contentBg: '#1b1730',
    headerTextColor: '#c4b5fd',
    siderLogoTextColor: '#c4b5fd',
    headerBorderColor: '#3a2f5c'
  },
  chartColors: ['#a78bfa', '#00d4ff', '#ff4d8d', '#ffc53d', '#6ee7b7', '#f472b6']
});

// ============================================================
// 导出
// ============================================================

// 全部主题（按展示顺序）
export const THEMES = [corporate, midnight, emerald, violet, sunset, chinaRed, inkWash, dunhuang, sakura, ukiyoe, matcha, cyberpunk, fantasy, animePop, animeDark];

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
