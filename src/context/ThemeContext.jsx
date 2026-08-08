// 主题上下文 —— 5 套完整主题（经典蓝/深空暗黑/翡翠绿/紫罗兰/暖阳橙）
// 每个主题包含 antd token + 组件级 token + 扩展样式 + 图表配色
import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import {
  THEMES,
  THEME_MAP,
  DEFAULT_THEME_ID,
  getThemeConfig,
  isDarkTheme
} from '../theme/themes.js';

const ThemeContext = createContext(null);
const THEME_KEY = 'amz_finance_theme';

export function ThemeProvider({ children }) {
  // 主题 ID（localStorage 持久化，非法值回退默认主题）
  const [themeId, setThemeId] = useState(() => {
    const saved = localStorage.getItem(THEME_KEY);
    return THEME_MAP[saved] ? saved : DEFAULT_THEME_ID;
  });

  const themeConfig = useMemo(() => getThemeConfig(themeId), [themeId]);
  const isDark = themeConfig.isDark;

  useEffect(() => {
    localStorage.setItem(THEME_KEY, themeId);
    // 兼容旧样式：暗色主题时给 body 加类
    if (isDark) {
      document.body.classList.add('amz-theme-dark');
    } else {
      document.body.classList.remove('amz-theme-dark');
    }
  }, [themeId, isDark]);

  const setTheme = useCallback((id) => {
    if (THEME_MAP[id]) setThemeId(id);
  }, []);

  // 快捷切换：亮色主题 ↔ 深空暗黑
  const toggleTheme = useCallback(() => {
    setThemeId((prev) => (isDarkTheme(prev) ? DEFAULT_THEME_ID : 'midnight'));
  }, []);

  const value = useMemo(
    () => ({
      theme: themeId, // 兼容旧 API：当前主题 ID
      themeId,
      setTheme,
      toggleTheme,
      isDark,
      themes: THEMES, // 主题列表（设置页用）
      themeConfig // 当前主题完整配置（App/登录页用）
    }),
    [themeId, themeConfig, isDark, setTheme, toggleTheme]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}
