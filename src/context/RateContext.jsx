// 汇率上下文 —— 联网获取最新 USD/CNY 汇率，缓存到 IndexedDB，断网用缓存
import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import db from '../db/database.js';
import { formatMoney } from '../utils/parsers.js';

const RateContext = createContext(null);
const PAIR = 'USDCNY';
// 缓存有效期：12 小时（毫秒）
const CACHE_TTL = 12 * 60 * 60 * 1000;

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

async function saveRate(rate, source, updatedAt, offline = false) {
  await db.exchangeRate.put({
    currencyPair: PAIR,
    rate,
    source,
    updatedAt,
    offline
  });
}

export function RateProvider({ children }) {
  const [rate, setRate] = useState(null);
  const [loading, setLoading] = useState(true);
  const [offline, setOffline] = useState(false);
  const [displayMode, setDisplayMode] = useState(() =>
    localStorage.getItem('amz_finance_currency_mode') || 'dual'
  ); // 'usd' | 'cny' | 'dual'

  // 加载汇率
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      // 先读缓存
      const cached = await getCachedRate();
      if (cached) {
        setRate(cached.rate);
        setOffline(!!cached.offline);
      }

      // 如果缓存过期或没有缓存，尝试联网刷新
      if (!cached || cached.stale) {
        const result = await fetchRateFromAPI();
        if (result && !cancelled) {
          setRate(result.rate);
          setOffline(false);
          await saveRate(result.rate, result.source, result.updatedAt, false);
        } else if (cached && !cancelled) {
          // 联网失败，继续用缓存并标记离线
          setOffline(true);
        }
      }
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  const refreshRate = useCallback(async () => {
    setLoading(true);
    const result = await fetchRateFromAPI();
    if (result) {
      setRate(result.rate);
      setOffline(false);
      await saveRate(result.rate, result.source, result.updatedAt, false);
    } else {
      setOffline(true);
    }
    setLoading(false);
    return !!result;
  }, []);

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
      displayMode,
      setDisplayMode: setMode,
      refreshRate,
      format: fmt,
      formatDual: fmtDual
    }),
    [rate, loading, offline, displayMode, setMode, refreshRate, fmt, fmtDual]
  );

  return <RateContext.Provider value={value}>{children}</RateContext.Provider>;
}

export function useRate() {
  const ctx = useContext(RateContext);
  if (!ctx) throw new Error('useRate must be used within RateProvider');
  return ctx;
}
