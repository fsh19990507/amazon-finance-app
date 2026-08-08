import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // 使用相对路径构建，本地预览与 GitHub Pages 子路径均可正常加载
  base: './',
  server: {
    port: 5173,
    strictPort: true,
    host: '127.0.0.1'
  },
  build: {
    target: 'es2015',
    outDir: 'dist',
    // 手动分包：react 核心、antd、echarts 分别独立，便于浏览器缓存与并行加载
    rollupOptions: {
      output: {
        manualChunks: {
          'react-vendor': ['react', 'react-dom', 'react-router-dom'],
          'antd-vendor': ['antd', '@ant-design/icons'],
          'echarts-vendor': ['echarts/core', 'echarts/charts', 'echarts/components', 'echarts/renderers']
        }
      }
    }
  }
});
