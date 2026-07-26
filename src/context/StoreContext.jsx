// 店铺上下文 —— 当前选中店铺、店铺列表、切换店铺
import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { useLiveQuery } from '../hooks/useLiveQuery.js';
import db from '../db/database.js';

const StoreContext = createContext(null);
const CURRENT_STORE_KEY = 'amz_finance_current_store';

export function StoreProvider({ children }) {
  const stores = useLiveQuery(() => db.stores.toArray(), [], []);
  const [currentStoreId, setCurrentStoreId] = useState(() =>
    localStorage.getItem(CURRENT_STORE_KEY) || 'all'
  );
  // 对比模式：选中的店铺 id 数组
  const [compareStoreIds, setCompareStoreIds] = useState([]);
  const [compareMode, setCompareMode] = useState(false);

  useEffect(() => {
    localStorage.setItem(CURRENT_STORE_KEY, currentStoreId);
  }, [currentStoreId]);

  const currentStore = useMemo(() => {
    if (!stores) return null;
    if (currentStoreId === 'all') return { id: 'all', name: '全部店铺', site: '', currency: 'USD' };
    return stores.find((s) => s.id === currentStoreId) || null;
  }, [stores, currentStoreId]);

  const switchStore = useCallback((storeId) => {
    setCurrentStoreId(storeId);
    setCompareMode(false);
    setCompareStoreIds([]);
  }, []);

  const value = useMemo(
    () => ({
      stores: stores || [],
      currentStoreId,
      currentStore,
      switchStore,
      compareMode,
      setCompareMode,
      compareStoreIds,
      setCompareStoreIds
    }),
    [stores, currentStoreId, currentStore, switchStore, compareMode, compareStoreIds]
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore() {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error('useStore must be used within StoreProvider');
  return ctx;
}
