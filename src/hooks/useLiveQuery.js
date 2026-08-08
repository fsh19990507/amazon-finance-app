// Supabase 实时查询 Hook —— 替代 dexie-react-hooks 的 useLiveQuery
import { useState, useEffect } from 'react';

/**
 * 响应式查询 Hook（兼容 useLiveQuery API）
 * @param {Function} queryFn 返回 Promise 的查询函数
 * @param {Array} deps 依赖项
 * @param {*} defaultVal 默认值（加载中返回）
 * @returns {*} 查询结果
 */
export function useLiveQuery(queryFn, deps = [], defaultVal = undefined) {
  const [result, setResult] = useState(defaultVal);

  useEffect(() => {
    let cancelled = false;
    let retryCount = 0;
    const maxRetries = 2;

    const executeQuery = async () => {
      try {
        const data = await queryFn();
        if (!cancelled) {
          setResult(data);
        }
      } catch (e) {
        // 静默忽略 AbortError（组件卸载导致的请求中断）
        if (e?.name === 'AbortError' || String(e?.message || '').includes('aborted')) {
          return;
        }
        if (cancelled) return;
        if (retryCount < maxRetries) {
          retryCount++;
          console.warn(`useLiveQuery 失败，${retryCount}/${maxRetries} 次重试...`, e?.message);
          setTimeout(executeQuery, 1000 * retryCount);
        } else {
          console.error('useLiveQuery error (retries exhausted):', e);
          if (!cancelled) setResult(defaultVal);
        }
      }
    };

    executeQuery();

    return () => {
      cancelled = true;
    };
  }, deps);

  return result;
}