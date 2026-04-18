/**
 * 数据源管理面板
 * 展示系统数据源（只读）+ 用户自建数据源（增删改 + 连接测试）
 */
import { useState, useEffect, useCallback } from 'react'
import {
  Database, Plus, Trash2, Pencil, Check, X, Loader2,
  CircleCheck, CircleAlert, TestTube
} from 'lucide-react'
import { datasourceApi } from '@/api'

interface Datasource {
  id?: string
  key?: string          // user_ds_{id} or system key
  name: string
  type: string          // mysql | postgresql
  host?: string
  port?: number
  db_name?: string
  username?: string
  password?: string
  description?: string
  source?: 'system' | 'user'
  is_current?: boolean
}

interface FormState {
  name: string
  type: string
  host: string
  port: string
  db_name: string
  username: string
  password: string
  description: string
}

const EMPTY_FORM: FormState = {
  name: '', type: 'mysql', host: '', port: '3306',
  db_name: '', username: '', password: '', description: ''
}

const TYPE_DEFAULTS: Record<string, string> = { mysql: '3306', postgresql: '5432' }

// ── 单条数据源卡片 ────────────────────────────────────────────────────────────

function DatasourceCard({
  ds,
  onEdit,
  onDelete,
}: {
  ds: Datasource
  onEdit: (ds: Datasource) => void
  onDelete: (ds: Datasource) => void
}) {
  const isSystem = ds.source === 'system'
  const typeLabel = ds.type === 'postgresql' ? 'PostgreSQL' : 'MySQL'
  const typeColor = ds.type === 'postgresql' ? 'text-blue-600 bg-blue-50' : 'text-orange-600 bg-orange-50'

  return (
    <div className="flex items-center gap-3 px-4 py-3 bg-white/60 backdrop-blur-sm rounded-xl border border-white/60 shadow-sm hover:shadow-md transition-shadow">
      <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-gray-100 to-gray-200 flex items-center justify-center flex-shrink-0">
        <Database className="w-4 h-4 text-gray-500" />
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium text-gray-800 truncate">{ds.name}</span>
          <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${typeColor}`}>
            {typeLabel}
          </span>
          {isSystem && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-500">系统</span>
          )}
        </div>
        {ds.host && (
          <p className="text-xs text-gray-400 truncate mt-0.5">
            {ds.host}:{ds.port} / {ds.db_name}
          </p>
        )}
      </div>

      {!isSystem && (
        <div className="flex items-center gap-1 flex-shrink-0">
          <button
            onClick={() => onEdit(ds)}
            className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-blue-50 text-gray-400 hover:text-blue-500 transition-colors"
            title="编辑"
          >
            <Pencil className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => onDelete(ds)}
            className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors"
            title="删除"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>
  )
}

// ── 新增 / 编辑表单 ───────────────────────────────────────────────────────────

function DatasourceForm({
  initial,
  onCancel,
  onSaved,
}: {
  initial?: Datasource | null
  onCancel: () => void
  onSaved: () => void
}) {
  const isEdit = !!initial?.id
  const [form, setForm] = useState<FormState>(() =>
    initial
      ? {
          name:        initial.name ?? '',
          type:        initial.type ?? 'mysql',
          host:        initial.host ?? '',
          port:        String(initial.port ?? '3306'),
          db_name:     initial.db_name ?? '',
          username:    initial.username ?? '',
          password:    '',            // 编辑时不回显密码
          description: initial.description ?? '',
        }
      : { ...EMPTY_FORM }
  )
  const [testing, setTesting]   = useState(false)
  const [tested, setTested]     = useState<boolean | null>(null)   // null=未测试
  const [testMsg, setTestMsg]   = useState('')
  const [saving, setSaving]     = useState(false)
  const [error, setError]       = useState('')

  const set = (k: keyof FormState, v: string) => {
    setForm(f => ({ ...f, [k]: v }))
    setTested(null)  // 参数变了，测试结果作废
    setError('')
  }

  const handleTypeChange = (t: string) => {
    setForm(f => ({ ...f, type: t, port: TYPE_DEFAULTS[t] || '3306' }))
    setTested(null)
  }

  const handleTest = async () => {
    if (!form.host || !form.db_name || !form.username) {
      setError('请先填写 Host、数据库名和用户名')
      return
    }
    if (!isEdit && !form.password) {
      setError('请填写密码')
      return
    }
    setTesting(true)
    setTested(null)
    setTestMsg('')
    try {
      await datasourceApi.test({
        type:     form.type,
        host:     form.host,
        port:     Number(form.port),
        db_name:  form.db_name,
        username: form.username,
        password: form.password || (isEdit ? '***' : ''),
      })
      setTested(true)
      setTestMsg('连接成功')
    } catch (e: any) {
      setTested(false)
      setTestMsg(e?.response?.data?.detail || '连接失败，请检查参数')
    } finally {
      setTesting(false)
    }
  }

  const handleSave = async () => {
    if (!form.name) { setError('请填写显示名称'); return }
    if (!form.host)  { setError('请填写 Host');  return }
    if (!form.db_name) { setError('请填写数据库名'); return }
    if (!form.username) { setError('请填写用户名'); return }
    if (!isEdit && !form.password) { setError('请填写密码'); return }

    setSaving(true)
    setError('')
    try {
      const payload = {
        name:        form.name,
        type:        form.type,
        host:        form.host,
        port:        Number(form.port),
        db_name:     form.db_name,
        username:    form.username,
        password:    form.password || undefined,
        description: form.description || undefined,
      }
      if (isEdit) {
        await datasourceApi.update(initial!.id!, payload)
      } else {
        await datasourceApi.create(payload)
      }
      onSaved()
    } catch (e: any) {
      setError(e?.response?.data?.detail || '保存失败')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold text-gray-700">
        {isEdit ? '编辑数据源' : '添加数据源'}
      </h3>

      {/* 名称 + 类型 */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-gray-500 mb-1 block">显示名称 *</label>
          <input
            value={form.name}
            onChange={e => set('name', e.target.value)}
            placeholder="生产环境 MySQL"
            className="w-full text-sm bg-white/80 border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-300/50"
          />
        </div>
        <div>
          <label className="text-xs text-gray-500 mb-1 block">数据库类型 *</label>
          <select
            value={form.type}
            onChange={e => handleTypeChange(e.target.value)}
            className="w-full text-sm bg-white/80 border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-300/50"
          >
            <option value="mysql">MySQL</option>
            <option value="postgresql">PostgreSQL</option>
          </select>
        </div>
      </div>

      {/* Host + Port */}
      <div className="grid grid-cols-3 gap-3">
        <div className="col-span-2">
          <label className="text-xs text-gray-500 mb-1 block">Host *</label>
          <input
            value={form.host}
            onChange={e => set('host', e.target.value)}
            placeholder="127.0.0.1 或 db.example.com"
            className="w-full text-sm bg-white/80 border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-300/50"
          />
        </div>
        <div>
          <label className="text-xs text-gray-500 mb-1 block">Port *</label>
          <input
            value={form.port}
            onChange={e => set('port', e.target.value)}
            className="w-full text-sm bg-white/80 border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-300/50"
          />
        </div>
      </div>

      {/* 数据库名 */}
      <div>
        <label className="text-xs text-gray-500 mb-1 block">数据库名 *</label>
        <input
          value={form.db_name}
          onChange={e => set('db_name', e.target.value)}
          placeholder="mydb"
          className="w-full text-sm bg-white/80 border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-300/50"
        />
      </div>

      {/* 用户名 + 密码 */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-gray-500 mb-1 block">用户名 *</label>
          <input
            value={form.username}
            onChange={e => set('username', e.target.value)}
            placeholder="root"
            className="w-full text-sm bg-white/80 border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-300/50"
          />
        </div>
        <div>
          <label className="text-xs text-gray-500 mb-1 block">
            密码 {isEdit ? '（留空则不修改）' : '*'}
          </label>
          <input
            type="password"
            value={form.password}
            onChange={e => set('password', e.target.value)}
            placeholder={isEdit ? '••••••••' : '输入密码'}
            className="w-full text-sm bg-white/80 border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-300/50"
          />
        </div>
      </div>

      {/* 备注 */}
      <div>
        <label className="text-xs text-gray-500 mb-1 block">备注（可选）</label>
        <input
          value={form.description}
          onChange={e => set('description', e.target.value)}
          placeholder="用途说明"
          className="w-full text-sm bg-white/80 border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-300/50"
        />
      </div>

      {/* 错误提示 */}
      {error && (
        <p className="text-xs text-red-500 flex items-center gap-1">
          <CircleAlert className="w-3.5 h-3.5" /> {error}
        </p>
      )}

      {/* 测试结果 */}
      {tested !== null && (
        <p className={`text-xs flex items-center gap-1 ${tested ? 'text-green-600' : 'text-red-500'}`}>
          {tested ? <CircleCheck className="w-3.5 h-3.5" /> : <CircleAlert className="w-3.5 h-3.5" />}
          {testMsg}
        </p>
      )}

      {/* 操作按钮 */}
      <div className="flex items-center gap-2 pt-1">
        <button
          onClick={handleTest}
          disabled={testing}
          className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-xl border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-50 transition-colors"
        >
          {testing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <TestTube className="w-3.5 h-3.5" />}
          {testing ? '测试中...' : '测试连接'}
        </button>

        <div className="flex-1" />

        <button
          onClick={onCancel}
          className="px-3 py-2 text-xs font-medium rounded-xl border border-gray-200 text-gray-500 hover:bg-gray-50 transition-colors"
        >
          取消
        </button>
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-1.5 px-4 py-2 text-xs font-medium rounded-xl bg-blue-500 text-white hover:bg-blue-600 disabled:opacity-50 transition-colors"
        >
          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
          {saving ? '保存中...' : '保存'}
        </button>
      </div>
    </div>
  )
}

// ── 主面板 ────────────────────────────────────────────────────────────────────

export default function DataSourcePanel() {
  const [systemDbs, setSystemDbs]     = useState<Datasource[]>([])
  const [userDbs, setUserDbs]         = useState<Datasource[]>([])
  const [loading, setLoading]         = useState(false)
  const [showForm, setShowForm]       = useState(false)
  const [editTarget, setEditTarget]   = useState<Datasource | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<Datasource | null>(null)
  const [deleting, setDeleting]       = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [dbRes, dsRes] = await Promise.all([
        fetch('/api/databases', {
          headers: { Authorization: `Bearer ${JSON.parse(localStorage.getItem('auth-storage') || '{}')?.state?.token}` }
        }).then(r => r.json()),
        datasourceApi.list(),
      ])
      const allDbs: Datasource[] = dbRes.databases || []
      setSystemDbs(allDbs.filter(d => d.source === 'system' || !d.source))
      setUserDbs(dsRes.datasources || [])
    } catch (e) {
      console.error('[DataSource] load error', e)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const handleEdit = (ds: Datasource) => {
    setEditTarget(ds)
    setShowForm(true)
  }

  const handleDelete = async () => {
    if (!confirmDelete?.id) return
    setDeleting(true)
    try {
      await datasourceApi.delete(confirmDelete.id)
      setConfirmDelete(null)
      load()
    } catch (e) {
      console.error('[DataSource] delete error', e)
    } finally {
      setDeleting(false)
    }
  }

  const handleFormSaved = () => {
    setShowForm(false)
    setEditTarget(null)
    load()
  }

  return (
    <div className="max-w-2xl mx-auto p-6 sm:p-10 space-y-8">
      {/* 系统数据源 */}
      <section>
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">系统数据源</h2>
        {loading ? (
          <div className="flex items-center justify-center py-6 text-gray-400">
            <Loader2 className="w-5 h-5 animate-spin mr-2" /> 加载中...
          </div>
        ) : systemDbs.length === 0 ? (
          <p className="text-sm text-gray-400 py-4 text-center">暂无系统数据源</p>
        ) : (
          <div className="space-y-2">
            {systemDbs.map(ds => (
              <DatasourceCard key={ds.key || ds.name} ds={ds} onEdit={handleEdit} onDelete={setConfirmDelete} />
            ))}
          </div>
        )}
      </section>

      {/* 用户数据源 */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">我的数据源</h2>
          {!showForm && (
            <button
              onClick={() => { setEditTarget(null); setShowForm(true) }}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-xl bg-blue-500 text-white hover:bg-blue-600 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" /> 添加数据源
            </button>
          )}
        </div>

        {/* 表单 */}
        {showForm && (
          <div className="mb-4 p-4 bg-white/60 backdrop-blur-sm rounded-2xl border border-white/60 shadow-sm">
            <DatasourceForm
              initial={editTarget}
              onCancel={() => { setShowForm(false); setEditTarget(null) }}
              onSaved={handleFormSaved}
            />
          </div>
        )}

        {userDbs.length === 0 && !showForm ? (
          <p className="text-sm text-gray-400 py-4 text-center">还没有添加数据源，点击右上角"添加数据源"开始接入</p>
        ) : (
          <div className="space-y-2">
            {userDbs.map(ds => (
              <DatasourceCard
                key={ds.id}
                ds={{ ...ds, source: 'user' }}
                onEdit={handleEdit}
                onDelete={setConfirmDelete}
              />
            ))}
          </div>
        )}
      </section>

      {/* 删除确认弹层 */}
      {confirmDelete && (
        <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/30 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl p-6 w-80 space-y-4">
            <h3 className="text-base font-semibold text-gray-800">确认删除</h3>
            <p className="text-sm text-gray-500">
              将删除数据源 <span className="font-medium text-gray-800">"{confirmDelete.name}"</span>，
              已关联此数据源的会话将无法继续查询。
            </p>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setConfirmDelete(null)}
                className="px-4 py-2 text-sm rounded-xl border border-gray-200 text-gray-500 hover:bg-gray-50"
              >取消</button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="flex items-center gap-1.5 px-4 py-2 text-sm rounded-xl bg-red-500 text-white hover:bg-red-600 disabled:opacity-50"
              >
                {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                {deleting ? '删除中...' : '确认删除'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
