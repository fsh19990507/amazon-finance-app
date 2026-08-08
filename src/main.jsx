import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import { runMigration } from './db/migrate.js';
import { ensureInitialized } from './db/database.js';
import 'antd/dist/reset.css';

// 启动策略：先渲染应用（UI 立即响应），后台异步执行迁移与种子数据初始化
// 这样用户能立刻看到登录页面，不用等 Supabase 多次网络请求完成
async function bootstrap() {
  console.log('[启动] 渲染应用...');

  // 1. 立即渲染应用，让用户先看到界面
  ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );

  // 2. 后台异步执行数据迁移（不阻塞 UI）
  (async () => {
    try {
      const result = await runMigration();
      if (result.migrated) {
        console.log('[启动] 数据迁移完成!', result.stats);
      } else {
        console.log('[启动] 无需迁移:', result.stats?.reason || '已同步');
      }
    } catch (e) {
      console.warn('[启动] 迁移检查失败:', e.message);
    }
  })();

  // 3. 后台异步确保种子数据存在（角色、店铺、管理员账户）
  // 登录时会再次校验管理员是否存在，这里失败不影响登录流程
  (async () => {
    try {
      await ensureInitialized();
      console.log('[启动] 种子数据检查完成');
    } catch (e) {
      console.warn('[启动] 种子数据初始化失败:', e.message);
    }
  })();
}

bootstrap();
