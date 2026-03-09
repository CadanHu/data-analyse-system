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

export default mobileApi;
