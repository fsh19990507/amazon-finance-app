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

    (async () => {
      try {
        const data = await queryFn();
        if (!cancelled) {
          setResult(data);
        }
      } catch (e) {
        console.error('useLiveQuery error:', e);
        if (!cancelled) {
          setResult(defaultVal);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, deps);

  return result;
}