/**
 * 📱 本地日志捕获器 - 仅用于移动端
 * 拦截 console.log/warn/error，存入 localStorage，最多保留 MAX_LOGS 条
 */

const STORAGE_KEY = 'dp_local_logs'
const MAX_LOGS = 500

export interface LocalLogEntry {
  ts: number      // timestamp ms
  level: 'log' | 'warn' | 'error'
  msg: string
}

// 供 LogViewer 订阅新日志事件
export const LOCAL_LOG_EVENT = 'dp:local-log'

function getLogs(): LocalLogEntry[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]')
  } catch {
    return []
  }
}

function appendLog(entry: LocalLogEntry) {
  const logs = getLogs()
  logs.push(entry)
  if (logs.length > MAX_LOGS) logs.splice(0, logs.length - MAX_LOGS)
  localStorage.setItem(STORAGE_KEY, JSON.stringify(logs))
  window.dispatchEvent(new CustomEvent(LOCAL_LOG_EVENT, { detail: entry }))
}

function formatArgs(args: unknown[]): string {
  return args
    .map(a => {
      if (typeof a === 'string') return a
      try { return JSON.stringify(a) } catch { return String(a) }
    })
    .join(' ')
}

let _initialized = false

export function initLocalLogger() {
  if (_initialized) return
  _initialized = true

  const _log = console.log.bind(console)
  const _warn = console.warn.bind(console)
  const _error = console.error.bind(console)

  console.log = (...args: unknown[]) => {
    _log(...args)
    appendLog({ ts: Date.now(), level: 'log', msg: formatArgs(args) })
  }
  console.warn = (...args: unknown[]) => {
    _warn(...args)
    appendLog({ ts: Date.now(), level: 'warn', msg: formatArgs(args) })
  }
  console.error = (...args: unknown[]) => {
    _error(...args)
    appendLog({ ts: Date.now(), level: 'error', msg: formatArgs(args) })
  }

  // 捕获未处理异常
  window.addEventListener('error', (e) => {
    appendLog({ ts: Date.now(), level: 'error', msg: `[UncaughtError] ${e.message} @ ${e.filename}:${e.lineno}` })
  })
  window.addEventListener('unhandledrejection', (e) => {
    appendLog({ ts: Date.now(), level: 'error', msg: `[UnhandledPromise] ${String(e.reason)}` })
  })

  appendLog({ ts: Date.now(), level: 'log', msg: '📱 [LocalLogger] 本地日志捕获已启动' })
}

export function getLocalLogs(): LocalLogEntry[] {
  return getLogs()
}

export function clearLocalLogs() {
  localStorage.removeItem(STORAGE_KEY)
}
