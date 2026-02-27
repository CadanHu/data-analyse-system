import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import './index.css'

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
