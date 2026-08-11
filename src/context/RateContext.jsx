// 汇率上下文 —— 联网获取最新 USD/CNY 汇率，缓存到 IndexedDB，断网用缓存
import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import db from '../db/database.js';
import { formatMoney } from '../utils/parsers.js';
import { useAuth } from './AuthContext.jsx';

const RateContext = createContext(null);
const PAIR = 'USDCNY';
// 缓存有效期：6 小时（毫秒）
const CACHE_TTL = 6 * 60 * 60 * 1000;
// 后台自动刷新间隔：60 分钟
const AUTO_REFRESH_INTERVAL = 60 * 60 * 1000;
// 页面重新可见时，缓存超过该时间则刷新：30 分钟
const VISIBLE_REFRESH_THRESHOLD = 30 * 60 * 1000;

// 免费汇率 API（无需 API key）
// exchangerate.host 免费额度：基础够用
const API_URL = 'https://api.exchangerate.host/latest?base=USD&symbols=CNY';
// 备用 API
const BACKUP_API = 'https://open.er-api.com/v6/latest/USD';

async function fetchRateFromAPI() {
  const urls = [API_URL, BACKUP_API];
  for (const url of urls) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
      if (!res.ok) continue;
      const data = await res.json();
      let rate = null;
      // exchangerate.host 格式
      if (data.rates && data.rates.CNY) rate = data.rates.CNY;
      // open.er-api.com 格式
      if (data.rates && data.rates.CNY && !rate) rate = data.rates.CNY;
      if (rate && typeof rate === 'number' && rate > 0) {
        return { rate, source: url, updatedAt: Date.now(), offline: false };
      }
    } catch {
      // 试下一个
    }
  }
  return null;
}

async function getCachedRate() {
  const cached = await db.exchangeRate.get(PAIR);
  if (!cached) return null;
  const age = Date.now() - cached.updatedAt;
  return { ...cached, stale: age > CACHE_TTL };
}

export function RateProvider({ children }) {
  const [rate, setRate] = useState(null);
  const [loading, setLoading] = useState(true);
  const [offline, setOffline] = useState(false);
  // 最近一次成功获取汇率的时间（毫秒时间戳），用于展示"更新于 xx:xx"
  const [lastUpdated, setLastUpdated] = useState(null);
  const [displayMode, setDisplayMode] = useState(() =>
    localStorage.getItem('amz_finance_currency_mode') || 'dual'
  ); // 'usd' | 'cny' | 'dual'
  const { currentAccount } = useAuth();

  // 写库权限：汇率是全局共享数据，仅普通用户及以上（Lv.2+）落库；
  // 只读用户（Lv.1）仅内存展示，不写库、不触发云端待同步上传（避免只读用户产生写入）
  const canWriteRate = useCallback(() => Number(currentAccount?.level || 0) >= 2, [currentAccount?.level]);

  const saveRate = useCallback(async (rate, source, updatedAt, offline = false) => {
    if (!canWriteRate()) return;
    await db.exchangeRate.put({
      currencyPair: PAIR,
      rate,
      source,
      updatedAt,
      offline
    });
  }, [canWriteRate]);

  const refreshRate = useCallback(async () => {
    setLoading(true);
    const result = await fetchRateFromAPI();
    if (result) {
      setRate(result.rate);
      setLastUpdated(result.updatedAt);
      setOffline(false);
      await saveRate(result.rate, result.source, result.updatedAt, false);
    } else {
      setOffline(true);
    }
    setLoading(false);
    return !!result;
  }, [saveRate]);

  // 加载汇率 + 自动定时刷新
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      // 先读缓存
      const cached = await getCachedRate();
      if (cached) {
        setRate(cached.rate);
        setLastUpdated(cached.updatedAt);
        setOffline(!!cached.offline);
      }

      // 如果缓存过期或没有缓存，尝试联网刷新
      if (!cached || cached.stale) {
        const result = await fetchRateFromAPI();
        if (result && !cancelled) {
          setRate(result.rate);
          setLastUpdated(result.updatedAt);
          setOffline(false);
          await saveRate(result.rate, result.source, result.updatedAt, false);
        } else if (cached && !cancelled) {
          // 联网失败，继续用缓存并标记离线
          setOffline(true);
        }
      }
      if (!cancelled) setLoading(false);
    })();

    // 后台定时自动刷新（每 60 分钟）
    const autoRefreshTimer = setInterval(() => {
      refreshRate();
    }, AUTO_REFRESH_INTERVAL);

    // 页面重新可见时：仅当缓存超过 30 分钟才刷新（避免频繁请求）
    const handleVisibilityChange = async () => {
      if (document.visibilityState !== 'visible') return;
      try {
        const cached = await getCachedRate();
        if (!cached || Date.now() - cached.updatedAt > VISIBLE_REFRESH_THRESHOLD) {
          const ok = await refreshRate();
          if (ok) console.log('[汇率] 页面重新可见，已自动刷新汇率');
        }
      } catch (e) {
        console.warn('[汇率] 可见性刷新异常:', e.message);
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    // 网络从离线恢复为在线时立即刷新（云端/汇率 API 恢复后自动更新）
    const handleOnline = () => {
      refreshRate().then((ok) => {
        if (ok) console.log('[汇率] 网络恢复，已自动刷新汇率');
      });
    };
    window.addEventListener('online', handleOnline);

    return () => {
      cancelled = true;
      clearInterval(autoRefreshTimer);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('online', handleOnline);
    };
  }, [refreshRate]);

  // 切换显示模式
  const setMode = useCallback((mode) => {
    setDisplayMode(mode);
    localStorage.setItem('amz_finance_currency_mode', mode);
  }, []);

  /**
   * 格式化金额，根据当前显示模式
   * @param {number} usdAmount 美元金额
   * @param {object} opts
   * @param {boolean} opts.color 是否显示正负颜色
   * @returns {string} 格式化后的金额字符串
   */
  const fmt = useCallback(
    (usdAmount, opts = {}) => {
      const r = rate || 7.2; // 默认回退汇率
      const cny = usdAmount * r;
      const usdStr = formatMoney(usdAmount, '$');
      const cnyStr = formatMoney(cny, '¥');
      const colorClass = opts.color
        ? (usdAmount < 0 ? 'color: #cf1322' : usdAmount > 0 ? 'color: #3f8600' : '')
        : '';

      if (displayMode === 'usd') return usdStr;
      if (displayMode === 'cny') return cnyStr;
      // dual：美元为主，下面小字人民币
      return `${usdStr}`;
    },
    [rate, displayMode]
  );

  /**
   * 返回双币 JSX 元素（用于 React 渲染，同时显示美元和人民币）
   */
  const fmtDual = useCallback(
    (usdAmount, opts = {}) => {
      const r = rate || 7.2;
      const cny = usdAmount * r;
      const usdStr = formatMoney(usdAmount, '$');
      const cnyStr = formatMoney(cny, '¥');
      const color = opts.color
        ? (usdAmount < 0 ? '#cf1322' : usdAmount > 0 ? '#3f8600' : 'inherit')
        : 'inherit';

      if (displayMode === 'usd') {
        return <span style={{ color }}>{usdStr}</span>;
      }
      if (displayMode === 'cny') {
        return <span style={{ color }}>{cnyStr}</span>;
      }
      // dual
      return (
        <span style={{ color, lineHeight: 1.2 }}>
          <div style={{ fontWeight: 600 }}>{usdStr}</div>
          <div style={{ fontSize: 11, opacity: 0.6, marginTop: 2 }}>≈ {cnyStr}</div>
        </span>
      );
    },
    [rate, displayMode]
  );

  const value = useMemo(
    () => ({
      rate,
      loading,
      offline,
      lastUpdated,
      displayMode,
      setDisplayMode: setMode,
      refreshRate,
      format: fmt,
      formatDual: fmtDual
    }),
    [rate, loading, offline, lastUpdated, displayMode, setMode, refreshRate, fmt, fmtDual]
  );

  return <RateContext.Provider value={value}>{children}</RateContext.Provider>;
}

export function useRate() {
  const ctx = useContext(RateContext);
  if (!ctx) throw new Error('useRate must be used within RateProvider');
  return ctx;
}
