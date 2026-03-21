import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { Capacitor } from '@capacitor/core'
import App from './App'
import './index.css'

// 手机端启用本地日志捕获（必须最先初始化，确保能捕获后续所有日志）
if (Capacitor.isNativePlatform()) {
  import('./services/localLogger').then(({ initLocalLogger }) => initLocalLogger())
}

// 手机端启用 Eruda 调试面板（右下角浮动按钮 → Console/Network/Elements）
if (Capacitor.isNativePlatform()) {
  import('eruda').then(({ default: eruda }) => eruda.init())
}

// 兼容性补丁：针对旧版本 Android WebView (修复 Object.hasOwn 缺失问题)
if (typeof Object.hasOwn !== 'function') {
  (Object as any).hasOwn = (obj: object, prop: string | symbol) => Object.prototype.hasOwnProperty.call(obj, prop);
  console.log('[Compatibility] Polyfill for Object.hasOwn applied');
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>,
)
