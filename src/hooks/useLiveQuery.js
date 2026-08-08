// 响应式查询 Hook —— 数据变化时自动重新查询（替代 dexie-react-hooks 的 useLiveQuery）
// 与旧版兼容：useLiveQuery(queryFn, deps, defaultVal)
// 新增能力：监听 db 数据变更事件（amz-db-changed），本地写入 / 云端同步完成后自动刷新页面
import { useState, useEffect } from 'react';

const DB_CHANGED_EVENT = 'amz-db-changed';

/**
 * 响应式查询 Hook（兼容 useLiveQuery API）
 * @param {Function} queryFn 返回 Promise 的查询函数
 * @param {Array} deps 依赖项（变化时重新查询）
 * @param {*} defaultVal 默认值（加载中/失败时返回）
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

    // 监听数据变更事件：本地写入或云端同步完成后重新查询（页面自动刷新）
    const onChange = () => {
      retryCount = 0;
      executeQuery();
    };
    window.addEventListener(DB_CHANGED_EVENT, onChange);

    return () => {
      cancelled = true;
      window.removeEventListener(DB_CHANGED_EVENT, onChange);
    };
  }, deps); // eslint-disable-line react-hooks/exhaustive-deps

  return result;
}
