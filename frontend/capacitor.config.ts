import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.cadanhu.datapulse',
  appName: 'DataPulse',
  webDir: 'dist',
  server: {
    // 强制使用 http 协议，避免 Mixed Content 拦截对后端 API 的请求
    androidScheme: 'http',
    allowNavigation: ['10.0.2.2', 'localhost'],
    cleartext: true
  }
};

export default config;
