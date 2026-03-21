import React, { useEffect, useState, useRef } from 'react';
import { X, Terminal, RefreshCw, Maximize2, Minimize2, Move, Minus, ChevronUp, Trash2 } from 'lucide-react';
import { Capacitor } from '@capacitor/core';
import { getBaseURL } from '../api';
import { getLocalLogs, clearLocalLogs, LOCAL_LOG_EVENT, type LocalLogEntry } from '../services/localLogger';

interface LogViewerProps {
  onClose: () => void;
}

type ViewMode = 'normal' | 'maximized' | 'mini';

// ─── 原生移动端：读本地日志 ───────────────────────────────────────────────────

const MobileLogViewer: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const [logs, setLogs] = useState<LocalLogEntry[]>(() => getLocalLogs().slice(-200));
  const [viewMode, setViewMode] = useState<ViewMode>('normal');
  const [position, setPosition] = useState({ x: window.innerWidth - 420, y: window.innerHeight - 400 });
  const [isDragging, setIsDragging] = useState(false);
  const dragOffset = useRef({ x: 0, y: 0 });
  const logEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = () => setLogs(getLocalLogs().slice(-200));
    window.addEventListener(LOCAL_LOG_EVENT, handler);
    return () => window.removeEventListener(LOCAL_LOG_EVENT, handler);
  }, []);

  useEffect(() => {
    if (viewMode !== 'mini') logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs, viewMode]);

  const handleMouseDown = (e: React.MouseEvent) => {
    if (viewMode === 'maximized') return;
    setIsDragging(true);
    dragOffset.current = { x: e.clientX - position.x, y: e.clientY - position.y };
  };

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!isDragging) return;
      setPosition({
        x: Math.max(0, Math.min(window.innerWidth - 100, e.clientX - dragOffset.current.x)),
        y: Math.max(0, Math.min(window.innerHeight - 40, e.clientY - dragOffset.current.y)),
      });
    };
    const onUp = () => setIsDragging(false);
    if (isDragging) { window.addEventListener('mousemove', onMove); window.addEventListener('mouseup', onUp); }
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
  }, [isDragging]);

  const getContainerStyles = (): React.CSSProperties => {
    if (viewMode === 'maximized') return { top: '10vh', left: '10vw', width: '80vw', height: '80vh' };
    if (viewMode === 'mini') return { top: position.y, left: position.x, width: '350px', height: '40px' };
    return { top: position.y, left: position.x, width: '400px', height: '350px' };
  };

  const formatTime = (ts: number) => new Date(ts).toTimeString().slice(0, 8);

  return (
    <div
      style={getContainerStyles()}
      className={`fixed z-[9999] flex flex-col transition-all duration-200 shadow-2xl border border-white/20 rounded-xl overflow-hidden backdrop-blur-2xl bg-black/90 ${isDragging ? 'opacity-60 scale-[0.98]' : 'opacity-100'}`}
    >
      {/* Header */}
      <div
        onMouseDown={handleMouseDown}
        className={`flex items-center justify-between px-3 py-2 bg-white/5 border-b border-white/5 ${viewMode === 'maximized' ? 'cursor-default' : 'cursor-move active:bg-white/10'}`}
      >
        <div className="flex items-center gap-2 text-white/90 pointer-events-none min-w-0 flex-1">
          <Terminal size={14} className="text-green-400" />
          <span className="font-mono text-[10px] font-bold tracking-tight shrink-0">DEVICE LOGS</span>
          <span className="text-[10px] text-white/30 shrink-0">{logs.length} 条</span>
          {viewMode === 'mini' && logs.length > 0 && (
            <span className="text-[10px] text-green-400/80 truncate italic ml-2">
              ➜ {logs[logs.length - 1].msg.slice(0, 40)}...
            </span>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={(e) => { e.stopPropagation(); clearLocalLogs(); setLogs([]); }}
            className="p-1 hover:bg-red-500/20 rounded text-white/30 hover:text-red-400 transition-colors"
            title="清空日志"
          >
            <Trash2 size={13} />
          </button>
          <button onClick={(e) => { e.stopPropagation(); setLogs(getLocalLogs().slice(-200)); }} className="p-1 hover:bg-white/10 rounded text-white/50 hover:text-white transition-colors">
            <RefreshCw size={13} />
          </button>
          <button onClick={(e) => { e.stopPropagation(); setViewMode(viewMode === 'mini' ? 'normal' : 'mini'); }} className="p-1 hover:bg-white/10 rounded text-white/50 hover:text-white transition-colors">
            {viewMode === 'mini' ? <ChevronUp size={14} /> : <Minus size={14} />}
          </button>
          <button onClick={(e) => { e.stopPropagation(); setViewMode(viewMode === 'maximized' ? 'normal' : 'maximized'); }} className="p-1 hover:bg-white/10 rounded text-white/50 hover:text-white transition-colors">
            {viewMode === 'maximized' ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
          </button>
          <button onClick={(e) => { e.stopPropagation(); onClose(); }} className="p-1.5 hover:bg-red-500/20 rounded-lg text-white/30 hover:text-red-400 transition-all">
            <X size={16} strokeWidth={2.5} />
          </button>
        </div>
      </div>

      {/* Log Content */}
      {viewMode !== 'mini' && (
        <div className="flex-1 overflow-y-auto p-3 font-mono text-[11px] leading-relaxed select-text bg-black/40">
          {logs.length === 0 ? (
            <div className="h-full flex items-center justify-center text-white/10 italic select-none">
              暂无日志...
            </div>
          ) : (
            <div className="space-y-1">
              {logs.map((entry, i) => (
                <div key={i} className="flex gap-2 border-b border-white/5 pb-0.5 group">
                  <span className="text-white/20 select-none shrink-0 text-[9px] pt-0.5">{formatTime(entry.ts)}</span>
                  <span className={`break-all ${
                    entry.level === 'error' ? 'text-red-400 font-bold' :
                    entry.level === 'warn' ? 'text-yellow-400' :
                    entry.msg.includes('✅') ? 'text-green-400' : 'text-white/70'
                  }`}>
                    {entry.msg}
                  </span>
                </div>
              ))}
              <div ref={logEndRef} />
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// ─── 网页端：SSE 流（原逻辑不变）────────────────────────────────────────────

const WebLogViewer: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const [logs, setLogs] = useState<string[]>([]);
  const [status, setStatus] = useState<'connecting' | 'live' | 'error'>('connecting');
  const [viewMode, setViewMode] = useState<ViewMode>('normal');
  const [position, setPosition] = useState({ x: window.innerWidth - 420, y: window.innerHeight - 400 });
  const [isDragging, setIsDragging] = useState(false);
  const dragOffset = useRef({ x: 0, y: 0 });
  const logEndRef = useRef<HTMLDivElement>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  const connect = () => {
    if (eventSourceRef.current) { eventSourceRef.current.close(); eventSourceRef.current = null; }
    setStatus('connecting');
    const url = `${getBaseURL()}/observability/logs/stream`;
    console.log(`📡 [LogViewer] 尝试连接日志流: ${url}`);
    try {
      const es = new EventSource(url);
      eventSourceRef.current = es;
      es.onopen = () => setStatus('live');
      es.onmessage = (event) => setLogs(prev => [...prev, event.data].slice(-20));
      es.onerror = () => {
        setStatus('error');
        if (eventSourceRef.current) { eventSourceRef.current.close(); eventSourceRef.current = null; }
      };
    } catch (err) {
      console.error("SSE Connection failed:", err);
      setStatus('error');
    }
  };

  useEffect(() => { connect(); return () => { eventSourceRef.current?.close(); eventSourceRef.current = null; }; }, []);
  useEffect(() => { if (viewMode !== 'mini') logEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [logs, viewMode]);

  const handleMouseDown = (e: React.MouseEvent) => {
    if (viewMode === 'maximized') return;
    setIsDragging(true);
    dragOffset.current = { x: e.clientX - position.x, y: e.clientY - position.y };
  };

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!isDragging) return;
      setPosition({ x: Math.max(0, Math.min(window.innerWidth - 100, e.clientX - dragOffset.current.x)), y: Math.max(0, Math.min(window.innerHeight - 40, e.clientY - dragOffset.current.y)) });
    };
    const onUp = () => setIsDragging(false);
    if (isDragging) { window.addEventListener('mousemove', onMove); window.addEventListener('mouseup', onUp); }
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
  }, [isDragging]);

  const getContainerStyles = (): React.CSSProperties => {
    if (viewMode === 'maximized') return { top: '10vh', left: '10vw', width: '80vw', height: '80vh' };
    if (viewMode === 'mini') return { top: position.y, left: position.x, width: '350px', height: '40px' };
    return { top: position.y, left: position.x, width: '400px', height: '350px' };
  };

  return (
    <div
      style={getContainerStyles()}
      className={`fixed z-[9999] flex flex-col transition-all duration-200 shadow-2xl border border-white/20 rounded-xl overflow-hidden backdrop-blur-2xl bg-black/90 ${isDragging ? 'opacity-60 scale-[0.98]' : 'opacity-100'}`}
    >
      <div
        onMouseDown={handleMouseDown}
        className={`flex items-center justify-between px-3 py-2 bg-white/5 border-b border-white/5 ${viewMode === 'maximized' ? 'cursor-default' : 'cursor-move active:bg-white/10'}`}
      >
        <div className="flex items-center gap-2 text-white/90 pointer-events-none min-w-0 flex-1">
          <Terminal size={14} className={status === 'live' ? 'text-green-400' : 'text-yellow-400'} />
          <span className="font-mono text-[10px] font-bold tracking-tight shrink-0">LOGS</span>
          {viewMode === 'mini' && logs.length > 0 && (
            <span className="text-[10px] text-green-400/80 truncate italic ml-2 animate-in fade-in slide-in-from-left-2 duration-300">
              ➜ {logs[logs.length - 1].slice(0, 40)}...
            </span>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button onClick={(e) => { e.stopPropagation(); connect(); }} className="p-1 hover:bg-white/10 rounded text-white/50 hover:text-white transition-colors">
            <RefreshCw size={13} />
          </button>
          <button onClick={(e) => { e.stopPropagation(); setViewMode(viewMode === 'mini' ? 'normal' : 'mini'); }} className="p-1 hover:bg-white/10 rounded text-white/50 hover:text-white transition-colors">
            {viewMode === 'mini' ? <ChevronUp size={14} /> : <Minus size={14} />}
          </button>
          <button onClick={(e) => { e.stopPropagation(); setViewMode(viewMode === 'maximized' ? 'normal' : 'maximized'); }} className="p-1 hover:bg-white/10 rounded text-white/50 hover:text-white transition-colors">
            {viewMode === 'maximized' ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
          </button>
          <button onClick={(e) => { e.stopPropagation(); onClose(); }} className="p-1.5 hover:bg-red-500/20 rounded-lg text-white/30 hover:text-red-400 transition-all">
            <X size={16} strokeWidth={2.5} />
          </button>
        </div>
      </div>
      {viewMode !== 'mini' && (
        <div className="flex-1 overflow-y-auto p-3 font-mono text-[11px] leading-relaxed select-text bg-black/40">
          {logs.length === 0 ? (
            <div className="h-full flex items-center justify-center text-white/10 italic select-none">
              Connecting to kernel...
            </div>
          ) : (
            <div className="space-y-1">
              {logs.map((log, i) => (
                <div key={i} className="flex gap-2 border-b border-white/5 pb-0.5 group">
                  <span className="text-white/10 select-none w-5 text-right shrink-0 group-hover:text-white/30 transition-colors">[{i}]</span>
                  <span className={`break-all ${
                    log.includes('ERROR') || log.includes('❌') ? 'text-red-400 font-bold' :
                    log.includes('INFO') ? 'text-blue-300' :
                    log.includes('✅') ? 'text-green-400' : 'text-white/70'
                  }`}>{log}</span>
                </div>
              ))}
              <div ref={logEndRef} />
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// ─── 入口：根据平台自动选择 ─────────────────────────────────────────────────

const LogViewer: React.FC<LogViewerProps> = ({ onClose }) => {
  if (Capacitor.isNativePlatform()) {
    return <MobileLogViewer onClose={onClose} />;
  }
  return <WebLogViewer onClose={onClose} />;
};

export default LogViewer;
