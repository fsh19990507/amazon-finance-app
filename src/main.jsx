import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import { runMigration } from './db/migrate.js';
import { ensureInitialized } from './db/database.js';
import 'antd/dist/reset.css';

// 启动时：数据迁移 → 初始化种子数据 → 渲染应用
async function bootstrap() {
  console.log('[启动] 正在初始化云数据库...');

  // 1. 从本地IndexedDB迁移数据到Supabase云数据库
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

  // 2. 确保种子数据存在（角色、店铺、管理员账户）
  try {
    await ensureInitialized();
    console.log('[启动] 种子数据检查完成');
  } catch (e) {
    console.warn('[启动] 种子数据初始化失败:', e.message);
  }

  // 3. 渲染应用
  ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
}

bootstrap();
