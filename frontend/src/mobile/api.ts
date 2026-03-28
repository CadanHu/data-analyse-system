import axios from 'axios'
import { Capacitor } from '@capacitor/core'
import { useAuthStore } from '../stores/authStore'

/**
 * 📱 移动端专属：获取 API 地址
 */
export const getMobileBaseURL = () => {
  // 1. 优先级最高：检查用户是否通过调试面板手动设置了 IP
  const manualIP = localStorage.getItem('MOBILE_DEBUG_IP');
  if (manualIP) {
    console.log(`🚀 [Mobile-API] 使用手动设置的 IP: ${manualIP}`);
    return `http://${manualIP}:8000/api`;
  }

  // 2. 检查 Vite 注入的变量
  const injectedUrl = (window as any).__DEV_API_URL__;
  if (injectedUrl && typeof injectedUrl === 'string' && injectedUrl.startsWith('http')) {
    // 过滤掉 localhost，因为手机上 localhost 无效
    if (!injectedUrl.includes('localhost') && !injectedUrl.includes('127.0.0.1')) {
      return injectedUrl;
    }
  }

  // 3. Android 模拟器特有：访问宿主机 IP 为 10.0.2.2
  if (Capacitor.getPlatform() === 'android') {
    console.log('🤖 [Mobile-API] 检测到 Android，尝试模拟器默认回环 IP: 10.0.2.2');
    return 'http://10.0.2.2:8000/api';
  }

  // 4. 兜底
  return 'http://localhost:8000/api';
}

const mobileApi = axios.create({
  baseURL: getMobileBaseURL(),
  timeout: 30000,
});

// 拦截器逻辑保持不变...
mobileApi.interceptors.request.use(config => {
  // 每次请求动态更新 baseURL，防止手动修改 IP 后不生效
  config.baseURL = getMobileBaseURL();
  const token = useAuthStore.getState().token;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  console.log(`📡 [Mobile-Request] ${config.method?.toUpperCase()} ${config.baseURL}${config.url}`);
  return config;
});

mobileApi.interceptors.response.use(
  response => {
    if (typeof response.data === 'string' && response.data.trim().startsWith('<!doctype html>')) {
      return Promise.reject(new Error('撞到了 5173 端口，请检查 IP 设置。'));
    }
    return response;
  },
  error => {
    console.error('❌ [Mobile-Response-Error]', error.message);
    return Promise.reject(error);
  }
);

/**
 * 局域网自动发现后端 IP
 * 扫描常见子网的 1-20，找到第一个响应 /sync/ping 的地址，保存到 localStorage
 */
const SCAN_SUBNETS = [
  '172.20.10',    // iPhone 个人热点
  '192.168.137',  // Android 热点
  '192.168.1',    // 家用路由器
  '192.168.0',    // 家用路由器
  '10.0.0',       // 企业/VPN
]
const SCAN_TIMEOUT_MS = 2000

let _discovering = false  // 防止并发多次扫描

export async function autoDiscoverBackendIP(): Promise<string | null> {
  if (_discovering) return null
  _discovering = true
  console.log('[AutoDiscover] 开始扫描局域网后端...')

  const candidates: string[] = []
  for (const subnet of SCAN_SUBNETS) {
    for (let i = 1; i <= 20; i++) {
      candidates.push(`${subnet}.${i}`)
    }
  }

  try {
    // 所有候选地址并行 ping，取最快响应的那个
    const found = await new Promise<string | null>((resolve) => {
      let settled = 0
      let resolved = false
      candidates.forEach(ip => {
        axios.get(`http://${ip}:8000/api/sync/ping`, { timeout: SCAN_TIMEOUT_MS })
          .then(() => {
            if (!resolved) {
              resolved = true
              resolve(ip)
            }
          })
          .catch(() => {
            settled++
            if (settled === candidates.length && !resolved) resolve(null)
          })
      })
    })

    if (found) {
      localStorage.setItem('MOBILE_DEBUG_IP', found)
      console.log(`[AutoDiscover] ✅ 发现后端: ${found}，已自动保存`)
    } else {
      console.warn('[AutoDiscover] ❌ 未找到后端，请确认电脑和手机在同一网络')
    }
    return found
  } finally {
    _discovering = false
  }
}

export default mobileApi;
