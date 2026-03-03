import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath, URL } from 'node:url'
import os from 'node:os'

// 自动检测局域网 IPv4 地址
function getLocalIP() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name] || []) {
      // 忽略 IPv6 和 回环地址
      if (iface.family === 'IPv4' && !iface.internal) {
        // 返回找到的第一个有效的局域网 IP
        return iface.address;
      }
    }
  }
  return 'localhost';
}

const currentIP = getLocalIP();
console.log(`📡 [Vite] 自动探测到局域网 IP: ${currentIP}`);

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // 加载现有的环境变量
  const env = loadEnv(mode, process.cwd(), '');
  
  // 如果 .env 文件中没有硬编码 VITE_API_BASE_URL，则自动注入探测到的 IP
  const apiBaseUrl = env.VITE_API_BASE_URL || `http://${currentIP}:8000/api`;

  return {
    plugins: [react()],
    define: {
      // 注入到 window 对象上，这是最安全、兼容性最好的全局注入方案
      'window.__DEV_API_URL__': JSON.stringify(apiBaseUrl)
    },
    build: {
      target: 'es2015',
    },
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
    server: {
      port: 5173,
      host: true, // 允许局域网访问
      proxy: {
        '/api': {
          target: 'http://localhost:8000',
          changeOrigin: true,
        },
      },
    }
  }
})
