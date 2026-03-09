import { useState, useEffect } from 'react'
import { Capacitor } from '@capacitor/core'
import { getMobileBaseURL } from './api'
import axios from 'axios'
import { X, Wifi, AlertCircle, HelpCircle, Save, RefreshCw, Trash2 } from 'lucide-react'

export default function MobileDebugPanel() {
  const [show, setShow] = useState(false)
  const [ip, setIp] = useState(localStorage.getItem('MOBILE_DEBUG_IP') || '')
  const [status, setStatus] = useState<'idle' | 'testing' | 'success' | 'fail'>('idle')
  const [errorMsg, setErrorMsg] = useState('')

  // 仅在移动端原生平台显示
  if (!Capacitor.isNativePlatform()) return null;

  const testConnection = async () => {
    setStatus('testing');
    setErrorMsg('');
    const testUrl = `${getMobileBaseURL()}/auth/me`;
    
    try {
      console.log(`🔍 [Debug] 开始测试连通性: ${testUrl}`);
      await axios.get(testUrl, { timeout: 4000 });
      setStatus('success');
    } catch (err: any) {
      console.error(`❌ [Debug] 连通性测试失败:`, err.message);
      setStatus('fail');
      setErrorMsg(err.message + (err.response ? ` (状态码: ${err.response.status})` : ''));
    }
  }

  const saveIp = () => {
    const formattedIp = ip.trim();
    if (formattedIp) {
      // 检查格式，防止小白填错
      if (formattedIp.startsWith('http') || formattedIp.includes(':')) {
        alert('❌ 格式错误：请只填写 IP 地址（例如 192.168.1.5），不要包含 http:// 或端口号！');
        return;
      }
      localStorage.setItem('MOBILE_DEBUG_IP', formattedIp);
      alert('✅ IP 已保存！应用将立即重启以连接新地址。');
      window.location.reload();
    } else {
      localStorage.removeItem('MOBILE_DEBUG_IP');
      alert('已恢复为“系统自动探测”模式');
      window.location.reload();
    }
  }

  return (
    <>
      {/* 隐秘的调试按钮 - 提升辨识度与样式 */}
      {!show && (
        <button 
          onClick={() => setShow(true)}
          className="fixed bottom-24 right-4 z-[9999] w-12 h-12 bg-gray-900 border-2 border-green-500/50 rounded-full flex flex-col items-center justify-center text-green-500 shadow-lg active:scale-95 transition-all"
        >
          <Wifi size={16} />
          <span className="text-[8px] font-bold">DEBUG</span>
        </button>
      )}

      {show && (
        <div className="fixed inset-0 z-[10000] bg-gray-50 flex flex-col">
          {/* Header */}
          <div className="bg-gray-900 text-white p-6 pt-12 flex justify-between items-center shadow-lg">
            <div>
              <h2 className="text-xl font-bold flex items-center gap-2">
                <Wifi className="text-green-400" /> 移动端调试连接器
              </h2>
              <p className="text-gray-400 text-xs mt-1">解决手机无法连接电脑后端的问题</p>
            </div>
            <button onClick={() => setShow(false)} className="p-2 bg-white/10 rounded-full">
              <X size={20} />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            
            {/* 📖 小白使用说明书 */}
            <div className="bg-blue-50 border border-blue-100 rounded-2xl p-4">
              <h3 className="text-blue-800 font-bold text-sm flex items-center gap-1.5 mb-2">
                <HelpCircle size={16} /> 小白使用指南
              </h3>
              <div className="text-blue-700/80 text-xs space-y-2 leading-relaxed">
                <p><b>1. 为什么用它？</b> 手机运行应用时，无法直接找到电脑里的后端服务（localhost 在手机上是无效的）。</p>
                <p><b>2. 怎么操作？</b> 请在下方输入框填入你电脑的<b>真实局域网 IP</b>。你可以在电脑终端输入 <code className="bg-blue-100 px-1 rounded">ifconfig</code> 或查看 Vite 启动日志获取。</p>
                <p><b>3. 关键点：</b> 手机和电脑必须连接同一个 WiFi！</p>
              </div>
            </div>

            {/* 当前状态展示 */}
            <div className="bg-white border border-gray-200 rounded-2xl p-4 shadow-sm space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-gray-500 text-xs">当前连接地址:</span>
                <span className="bg-gray-100 text-gray-700 px-2 py-0.5 rounded text-[10px] font-mono">{getMobileBaseURL()}</span>
              </div>
              <div className="flex justify-between items-center border-t border-gray-50 pt-2 text-[10px]">
                <span className="text-gray-400 font-mono">平台: {Capacitor.getPlatform()}</span>
                <span className="text-gray-400 font-mono">检测 IP: {(window as any).__DEV_API_URL__?.replace('http://', '').replace(':8000/api', '') || '无'}</span>
              </div>
            </div>

            {/* IP 设置区域 */}
            <div className="space-y-3">
              <label className="text-sm font-bold text-gray-700 flex items-center gap-2">
                <Save size={16} className="text-blue-500" /> 手动指定电脑 IP
              </label>
              <div className="flex gap-2">
                <input 
                  type="text" 
                  value={ip}
                  onChange={(e) => setIp(e.target.value)}
                  placeholder="例如: 192.168.1.10"
                  className="flex-1 bg-white border-2 border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-800 focus:outline-none focus:border-blue-500 transition-all shadow-inner"
                />
                <button 
                  onClick={saveIp}
                  className="bg-blue-600 text-white px-6 py-3 rounded-xl font-bold shadow-md active:bg-blue-700 transition-all"
                >
                  保存
                </button>
              </div>
              <p className="text-[10px] text-gray-400 pl-1 italic">提示：只需填数字，如 10.0.0.5。我们将自动补全 8000 端口。</p>
            </div>

            {/* 连通性测试 */}
            <div className="pt-4">
              <button 
                onClick={testConnection}
                disabled={status === 'testing'}
                className={`w-full py-4 rounded-2xl font-bold flex items-center justify-center gap-2 transition-all shadow-lg ${
                  status === 'testing' ? 'bg-gray-300 text-gray-500 cursor-not-allowed' : 
                  status === 'success' ? 'bg-green-500 text-white ring-4 ring-green-100' : 
                  status === 'fail' ? 'bg-red-500 text-white ring-4 ring-red-100' : 'bg-gray-800 text-white'
                }`}
              >
                {status === 'testing' ? <RefreshCw className="animate-spin" size={18} /> : <Wifi size={18} />}
                {status === 'testing' ? '正在连接后端...' : 
                 status === 'success' ? '连接成功！' : 
                 status === 'fail' ? '连接失败，请检查 IP' : '一键测试 API 连通性'}
              </button>

              {errorMsg && (
                <div className="mt-4 p-4 bg-red-50 border border-red-100 rounded-xl flex items-start gap-3">
                  <AlertCircle className="text-red-500 shrink-0 mt-0.5" size={16} />
                  <div className="space-y-1">
                    <p className="text-red-800 text-[11px] font-bold">无法触达后端服务</p>
                    <p className="text-red-600 text-[10px] leading-relaxed italic">{errorMsg}</p>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Footer */}
          <div className="p-6 bg-white border-t border-gray-100">
             <button 
               onClick={() => { if(confirm('确定要清除所有缓存吗？')) { localStorage.clear(); window.location.reload(); } }}
               className="w-full py-3 flex items-center justify-center gap-2 text-gray-400 text-xs font-medium border border-gray-200 rounded-xl hover:bg-gray-50 transition-all"
             >
               <Trash2 size={14} /> 恢复默认设置并重载
             </button>
          </div>
        </div>
      )}
    </>
  )
}
