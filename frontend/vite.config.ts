import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath, URL } from 'node:url'
import os from 'node:os'

// 自动检测所有局域网 IPv4 地址
function getAllLocalIPs() {
  const interfaces = os.networkInterfaces();
  const ips = [];
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name] || []) {
      if (iface.family === 'IPv4' && !iface.internal) {
        ips.push(iface.address);
      }
    }
  }
  return ips;
}

const allIPs = getAllLocalIPs();
const currentIP = allIPs[0] || 'localhost';
console.log(`📡 [Vite] 探测到局域网 IP 列表: ${allIPs.join(', ')}`);
console.log(`📡 [Vite] 默认选择首个 IP: ${currentIP}`);

// Patch iOS-incompatible regex in mdast-util-gfm-autolink-literal.
// iOS Safari < 16.4 does not support lookbehind assertions (?<=...) or
// unicode property escapes \p{P}/\p{S} inside RegExp.
// Remove the lookbehind at build time — capture groups are unchanged
// so findEmail(_, atext, label, match) still receives the correct groups.
function patchGfmAutolinkForIOS() {
  return {
    name: 'patch-gfm-autolink-ios',
    transform(code: string, id: string) {
      if (!id.includes('mdast-util-gfm-autolink-literal')) return null
      // Original: /(?<=^|\s|\p{P}|\p{S})([-.\w+]+)@([-\w]+(?:\.[-\w]+)+)/gu
      // Patched:  /([-.\\w+]+)@([-\w]+(?:\.[-\w]+)+)/g  (removes lookbehind)
      const original = '/(?<=^|\\s|\\p{P}|\\p{S})([-.\\w+]+)@([-\\w]+(?:\\.[-\\w]+)+)/gu'
      const patched  = '/([-.\\w+]+)@([-\\w]+(?:\\.[-\\w]+)+)/g'
      if (!code.includes(original)) return null
      return code.replace(original, patched)
    }
  }
}

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // 加载现有的环境变量
  const env = loadEnv(mode, process.cwd(), '');

  // 如果 .env 文件中没有硬编码 VITE_API_BASE_URL，则自动注入探测到的 IP
  const apiBaseUrl = env.VITE_API_BASE_URL || `http://${currentIP}:8000/api`;

  return {
    plugins: [react(), patchGfmAutolinkForIOS()],
    define: {
      // 注入到 window 对象上，这是最安全、兼容性最好的全局注入方案
      'window.__DEV_API_URL__': JSON.stringify(apiBaseUrl)
    },
    build: {
      // es2020：iOS 14+ WKWebView（Safari 14）原生支持，无需 esbuild 把
      // generator/for-of 编译成依赖 Symbol.iterator polyfill 的 ES2015 辅助函数。
      // pdfjs-dist v5 内部大量使用 generator，必须原生执行，否则在 iOS JavaScriptCore
      // 中报 "t[Symbol.iterator] is not a function"。
      target: 'es2020',
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
