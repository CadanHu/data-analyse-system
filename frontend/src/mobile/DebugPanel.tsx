import { useState, useEffect } from 'react'
import { Capacitor } from '@capacitor/core'
import { getMobileBaseURL } from './api'
import axios from 'axios'
import { X, Wifi, AlertCircle, HelpCircle, Save, RefreshCw, Trash2 } from 'lucide-react'
import { useTranslation } from '../hooks/useTranslation'
import { useChatStore } from '../stores/chatStore'

export default function MobileDebugPanel() {
  const [show, setShow] = useState(false)
  const [ip, setIp] = useState(localStorage.getItem('MOBILE_DEBUG_IP') || '')
  const [status, setStatus] = useState<'idle' | 'testing' | 'success' | 'fail'>('idle')
  const [errorMsg, setErrorMsg] = useState('')
  const { t } = useTranslation()
  const { isMobile, orientation } = useChatStore()

  if (!Capacitor.isNativePlatform()) return null;

  const testConnection = async () => {
    setStatus('testing');
    setErrorMsg('');
    const testUrl = `${getMobileBaseURL()}/auth/me`;
    
    try {
      console.log(`🔍 [Debug] Testing connectivity: ${testUrl}`);
      await axios.get(testUrl, { timeout: 4000 });
      setStatus('success');
    } catch (err: any) {
      console.error(`❌ [Debug] Connection test failed:`, err.message);
      setStatus('fail');
      setErrorMsg(err.message + (err.response ? ` (Status: ${err.response.status})` : ''));
    }
  }

  const saveIp = () => {
    const formattedIp = ip.trim();
    if (formattedIp) {
      if (formattedIp.startsWith('http') || formattedIp.includes(':')) {
        alert(t('debug.ipFormatError'));
        return;
      }
      localStorage.setItem('MOBILE_DEBUG_IP', formattedIp);
      alert(t('debug.ipSaved'));
      window.location.reload();
    } else {
      localStorage.removeItem('MOBILE_DEBUG_IP');
      alert(t('debug.resetAuto'));
      window.location.reload();
    }
  }

  return (
    <>
      {!show && !(isMobile && orientation === 'portrait') && (
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
          <div className="bg-gray-900 text-white p-6 pt-12 flex justify-between items-center shadow-lg">
            <div>
              <h2 className="text-xl font-bold flex items-center gap-2">
                <Wifi className="text-green-400" /> {t('debug.title')}
              </h2>
              <p className="text-gray-400 text-xs mt-1">{t('debug.subtitle')}</p>
            </div>
            <button onClick={() => setShow(false)} className="p-2 bg-white/10 rounded-full">
              <X size={20} />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            <div className="bg-blue-50 border border-blue-100 rounded-2xl p-4">
              <h3 className="text-blue-800 font-bold text-sm flex items-center gap-1.5 mb-2">
                <HelpCircle size={16} /> {t('debug.guideTitle')}
              </h3>
              <div className="text-blue-700/80 text-xs space-y-2 leading-relaxed">
                <p><b>1. </b> {t('debug.guide1')}</p>
                <p><b>2. </b> {t('debug.guide2')}</p>
                <p><b>3. </b> {t('debug.guide3')}</p>
              </div>
            </div>

            <div className="bg-white border border-gray-200 rounded-2xl p-4 shadow-sm space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-gray-500 text-xs">{t('debug.currentAddr')}:</span>
                <span className="bg-gray-100 text-gray-700 px-2 py-0.5 rounded text-[10px] font-mono select-text">{getMobileBaseURL()}</span>
              </div>
              <div className="flex justify-between items-center border-t border-gray-50 pt-2 text-[10px]">
                <span className="text-gray-400 font-mono">{t('debug.platform')}: {Capacitor.getPlatform()}</span>
                <span className="text-gray-400 font-mono">{t('debug.detectIp')}: {(window as any).__DEV_API_URL__?.replace('http://', '').replace(':8000/api', '') || 'N/A'}</span>
              </div>
            </div>

            <div className="space-y-3">
              <label className="text-sm font-bold text-gray-700 flex items-center gap-2">
                <Save size={16} className="text-blue-500" /> {t('debug.manualIp')}
              </label>
              <div className="flex gap-2">
                <input 
                  type="text" 
                  value={ip}
                  onChange={(e) => setIp(e.target.value)}
                  placeholder={t('debug.ipPlaceholder')}
                  className="flex-1 bg-white border-2 border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-800 focus:outline-none focus:border-blue-500 transition-all shadow-inner"
                />
                <button 
                  onClick={saveIp}
                  className="bg-blue-600 text-white px-6 py-3 rounded-xl font-bold shadow-md active:bg-blue-700 transition-all"
                >
                  {t('common.save')}
                </button>
              </div>
              <p className="text-[10px] text-gray-400 pl-1 italic">{t('debug.ipHint')}</p>
            </div>

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
                {status === 'testing' ? t('debug.testing') : 
                 status === 'success' ? t('debug.success') : 
                 status === 'fail' ? t('debug.failed') : t('debug.testBtn')}
              </button>

              {errorMsg && (
                <div className="mt-4 p-4 bg-red-50 border border-red-100 rounded-xl flex items-start gap-3">
                  <AlertCircle className="text-red-500 shrink-0 mt-0.5" size={16} />
                  <div className="space-y-1">
                    <p className="text-red-800 text-[11px] font-bold">{t('debug.unreachable')}</p>
                    <p className="text-red-600 text-[10px] leading-relaxed italic select-text">{errorMsg}</p>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="p-6 bg-white border-t border-gray-100">
             <button 
               onClick={() => { if(confirm(t('debug.resetConfirm'))) { localStorage.clear(); window.location.reload(); } }}
               className="w-full py-3 flex items-center justify-center gap-2 text-gray-400 text-xs font-medium border border-gray-200 rounded-xl hover:bg-gray-50 transition-all"
             >
               <Trash2 size={14} /> {t('debug.resetBtn')}
             </button>
          </div>
        </div>
      )}
    </>
  )
}
