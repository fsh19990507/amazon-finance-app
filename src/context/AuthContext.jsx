// 认证上下文 —— 登录状态、当前账户、登录/登出/权限检查
import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import db, { hashPassword, checkCloudStatus } from '../db/database.js';
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
  // 加入 3 秒超时保护：超时则先让用户看到登录页，避免长时间空白
  useEffect(() => {
    let cancelled = false;
    let timedOut = false;

    const timeoutId = setTimeout(() => {
      timedOut = true;
      if (!cancelled) setLoading(false);
    }, 3000);

    (async () => {
      const session = loadSession();
      if (session && session.id) {
        try {
          const acc = await db.accounts.get(session.id);
          if (cancelled || timedOut) return;
          if (acc) {
            setCurrentAccount(acc);
          } else {
            localStorage.removeItem(SESSION_KEY);
          }
        } catch {
          localStorage.removeItem(SESSION_KEY);
        }
      }
      if (!cancelled) {
        clearTimeout(timeoutId);
        setLoading(false);
      }
    })();
    return () => { cancelled = true; clearTimeout(timeoutId); };
  }, []);

  const login = useCallback(async (username, password) => {
    const isDefaultAdmin = username === 'admin' && hashPassword(password) === hashPassword('admin');

    // 云端连通性预检（5秒超时）：不可达时优先走离线种子账户，避免 db 查询挂起
    try {
      const cloud = await checkCloudStatus();
      if (cloud.status !== 'online') {
        // 云端不可达：尝试缓存账户，无缓存则用内置种子账户兜底
        try {
          const cachedAccounts = localStorage.getItem('amz_finance_cache_accounts');
          if (cachedAccounts) {
            const list = JSON.parse(cachedAccounts);
            const acc = list.find((a) => a.username === username);
            if (acc) {
              if (acc.passwordHash !== hashPassword(password)) return { ok: false, msg: '密码错误' };
              setCurrentAccount(acc);
              saveSession(acc);
              return { ok: true, account: acc, offline: true };
            }
          }
        } catch (e2) { /* ignore */ }

        // 内置种子账户兜底：默认 admin/admin 无需联网即可登录
        if (isDefaultAdmin) {
          const fallbackAccount = {
            id: 1,
            username: 'admin',
            nickname: '管理员',
            level: 4,
            passwordHash: hashPassword('admin'),
            mustChangePassword: false
          };
          console.warn('[登录] 云端不可达，使用离线种子账户（admin）登录');
          setCurrentAccount(fallbackAccount);
          saveSession(fallbackAccount);
          return { ok: true, account: fallbackAccount, offline: true };
        }
        return { ok: false, msg: '无法连接云端，且本地无此账户缓存。请检查网络后重试', network: true };
      }
    } catch (e) {
      // 预检异常：继续走正常 db 查询，由下方 try/catch 兜底
      console.warn('[登录] 云端预检异常，继续正常登录流程:', String(e?.message || e));
    }

    try {
      const acc = await db.accounts.where('username').equals(username).first();
      if (!acc) return { ok: false, msg: '账户不存在' };
      const pwdHash = hashPassword(password);
      if (acc.passwordHash !== pwdHash) return { ok: false, msg: '密码错误' };
      setCurrentAccount(acc);
      saveSession(acc);
      return { ok: true, account: acc, offline: false };
    } catch (e) {
      // 云端不可达：先尝试缓存验证，若本地无缓存则用内置种子账户兜底
      const msg = String(e?.message || e?.name || '');
      const isNetworkError = msg.includes('resolve') || msg.includes('ENOTFOUND')
        || msg.includes('getaddrinfo') || msg.includes('abort')
        || msg.includes('timeout') || msg.includes('Failed to fetch')
        || msg.includes('NetworkError') || msg.includes('fetch');

      // 离线种子账户兜底：默认 admin/admin 无需联网即可登录
      if (isNetworkError && isDefaultAdmin) {
        const fallbackAccount = {
          id: 1,
          username: 'admin',
          nickname: '管理员',
          level: 4,
          passwordHash: hashPassword('admin'),
          mustChangePassword: false
        };
        console.warn('[登录] 云端不可达，使用离线种子账户（admin）登录');
        setCurrentAccount(fallbackAccount);
        saveSession(fallbackAccount);
        return { ok: true, account: fallbackAccount, offline: true };
      }

      if (msg.includes('resolve') || msg.includes('ENOTFOUND') || msg.includes('getaddrinfo')) {
        return { ok: false, msg: '无法连接云端（域名解析失败），请检查网络后重试', network: true };
      }
      if (msg.includes('abort') || msg.includes('timeout')) {
        return { ok: false, msg: '连接云端超时，请检查网络后重试', network: true };
      }
      return { ok: false, msg: '登录失败：' + msg, network: true };
    }
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
