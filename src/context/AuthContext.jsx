// 认证上下文 —— 登录状态、当前账户、登录/登出/权限检查
import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import db, { hashPassword } from '../db/database.js';
import { hasPermission } from '../utils/permissions.js';

const AuthContext = createContext(null);

const SESSION_KEY = 'amz_finance_session';

// 会话存 localStorage（只存账户 id 和 level，不存密码）
function saveSession(account) {
  if (!account) {
    localStorage.removeItem(SESSION_KEY);
    return;
  }
  localStorage.setItem(
    SESSION_KEY,
    JSON.stringify({ id: account.id, username: account.username, level: account.level, loginAt: Date.now() })
  );
}

function loadSession() {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function AuthProvider({ children }) {
  const [currentAccount, setCurrentAccount] = useState(null);
  const [loading, setLoading] = useState(true);

  // 启动时从 localStorage 恢复会话，并从 db 读取完整账户信息
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const session = loadSession();
      if (session && session.id) {
        try {
          const acc = await db.accounts.get(session.id);
          if (acc && !cancelled) {
            setCurrentAccount(acc);
          } else if (!cancelled) {
            localStorage.removeItem(SESSION_KEY);
          }
        } catch {
          localStorage.removeItem(SESSION_KEY);
        }
      }
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  const login = useCallback(async (username, password) => {
    const acc = await db.accounts.where('username').equals(username).first();
    if (!acc) return { ok: false, msg: '账户不存在' };
    const pwdHash = hashPassword(password);
    if (acc.passwordHash !== pwdHash) return { ok: false, msg: '密码错误' };
    setCurrentAccount(acc);
    saveSession(acc);
    return { ok: true, account: acc };
  }, []);

  const logout = useCallback(() => {
    setCurrentAccount(null);
    saveSession(null);
  }, []);

  const can = useCallback(
    (permLevel) => hasPermission(currentAccount?.level, permLevel),
    [currentAccount]
  );

  const value = useMemo(
    () => ({ currentAccount, loading, login, logout, can }),
    [currentAccount, loading, login, logout, can]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
