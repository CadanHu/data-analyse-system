import { Link } from 'react-router-dom'

interface ChangeItem {
  type: 'new' | 'improved' | 'fixed' | 'removed'
  description: string
}

interface Release {
  version: string
  date: string
  status: 'latest' | 'stable' | 'beta'
  changes: ChangeItem[]
  highlights?: string[]
}

const releases: Release[] = [
  {
    version: '1.2.0',
    date: '2024-02-20',
    status: 'latest',
    highlights: [
      '新增 DeepSeek 推理模型支持',
      '添加文件上传功能',
      '集成 Chinook 和 Northwind 数据库'
    ],
    changes: [
      { type: 'new', description: '新增 DeepSeek 推理模型，支持普通模式和思考模式' },
      { type: 'new', description: '添加思考模式切换开关，默认关闭' },
      { type: 'new', description: '新增文件上传功能，支持图片和文档上传' },
      { type: 'new', description: '集成 Chinook 音乐数据库和 Northwind 商业数据库' },
      { type: 'new', description: '添加数据库切换功能，每个会话独立选择数据库' },
      { type: 'new', description: '新增 SQL 语句显示/折叠按钮' },
      { type: 'new', description: '添加教程页面，帮助用户快速上手' },
      { type: 'improved', description: '优化 AI 思考过程展示，默认折叠' },
      { type: 'improved', description: '改进流式响应性能，提升用户体验' },
      { type: 'improved', description: '优化会话管理，修复切换会话时的显示问题' },
      { type: 'fixed', description: '修复新建会话后对话栏未清空的问题' },
      { type: 'fixed', description: '修复删除会话后聊天区仍显示旧消息的问题' },
      { type: 'fixed', description: '修复切换会话时聊天内容不更新的问题' },
      { type: 'fixed', description: '修复 SQL 关键字表名导致语法错误的问题' },
      { type: 'fixed', description: '修复 HTML 实体编码问题' },
      { type: 'fixed', description: '修复重复 key 导致的 React 警告' }
    ]
  },
  {
    version: '1.1.0',
    date: '2024-02-10',
    status: 'stable',
    highlights: [
      '引入 Streamable HTTP 替代 SSE',
      '优化 AI 提示词',
      '新增多个系统测试问题'
    ],
    changes: [
      { type: 'new', description: '将 SSE 更换为 Streamable HTTP，提高兼容性' },
      { type: 'new', description: '添加多个复杂系统测试问题' },
      { type: 'improved', description: '优化 AI 提示词，提升 SQL 生成质量' },
      { type: 'improved', description: '改进错误处理机制，提供更友好的错误提示' },
      { type: 'improved', description: '优化数据库连接池管理' },
      { type: 'fixed', description: '修复 Northwind 数据库 token 超限问题' },
      { type: 'fixed', description: '修复流式输出重复创建消息的问题' },
      { type: 'fixed', description: '修复数据库连接失败时的错误处理' }
    ]
  },
  {
    version: '1.0.0',
    date: '2024-01-20',
    status: 'stable',
    highlights: [
      'DataPulse 首次发布',
      '支持自然语言查询数据库',
      '实时数据可视化'
    ],
    changes: [
      { type: 'new', description: '发布 DataPulse 智能数据分析系统' },
      { type: 'new', description: '支持通过自然语言查询数据库' },
      { type: 'new', description: '集成 OpenAI GPT 模型进行智能分析' },
      { type: 'new', description: '实现实时数据可视化功能' },
      { type: 'new', description: '支持多种图表类型展示' },
      { type: 'new', description: '添加会话管理功能' },
      { type: 'new', description: '实现智能会话标题生成' },
      { type: 'new', description: '支持多轮对话和上下文记忆' },
      { type: 'new', description: '添加 SQL 代码查看和复制功能' },
      { type: 'new', description: '实现响应式设计，支持移动端' },
      { type: 'new', description: '添加欢迎页面和关于页面' },
      { type: 'improved', description: '优化用户界面设计' },
      { type: 'improved', description: '提升系统整体性能' }
    ]
  }
]

const changeTypeConfig = {
  new: {
    label: '新增',
    bgColor: 'bg-green-500/10',
    textColor: 'text-green-400',
    borderColor: 'border-green-500/20'
  },
  improved: {
    label: '改进',
    bgColor: 'bg-blue-500/10',
    textColor: 'text-blue-400',
    borderColor: 'border-blue-500/20'
  },
  fixed: {
    label: '修复',
    bgColor: 'bg-yellow-500/10',
    textColor: 'text-yellow-400',
    borderColor: 'border-yellow-500/20'
  },
  removed: {
    label: '移除',
    bgColor: 'bg-red-500/10',
    textColor: 'text-red-400',
    borderColor: 'border-red-500/20'
  }
}

const statusConfig = {
  latest: {
    label: '最新版本',
    bgColor: 'bg-gradient-to-r from-[#3b82f6] to-[#06d6a0]',
    textColor: 'text-white'
  },
  stable: {
    label: '稳定版本',
    bgColor: 'bg-white/10',
    textColor: 'text-gray-300'
  },
  beta: {
    label: '测试版本',
    bgColor: 'bg-purple-500/20',
    textColor: 'text-purple-400'
  }
}

export default function Changelog() {
  return (
    <div className="min-h-screen bg-[#050810] text-white">
      <nav className="fixed top-0 left-0 right-0 z-50 px-6 py-4 backdrop-blur-xl border-b border-white/10 bg-[#050810]/95">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <Link to="/" className="flex items-center gap-3">
            <div className="flex items-end gap-1 h-6">
              <div className="w-1.5 bg-gradient-to-b from-[#3b82f6] to-[#06d6a0] rounded-sm" style={{ height: '40%' }} />
              <div className="w-1.5 bg-gradient-to-b from-[#3b82f6] to-[#06d6a0] rounded-sm" style={{ height: '70%' }} />
              <div className="w-1.5 bg-gradient-to-b from-[#3b82f6] to-[#06d6a0] rounded-sm" style={{ height: '100%' }} />
              <div className="w-1.5 bg-gradient-to-b from-[#3b82f6] to-[#06d6a0] rounded-sm" style={{ height: '60%' }} />
            </div>
            <span className="text-xl font-bold tracking-tight">DataPulse</span>
          </Link>
          <div className="flex items-center gap-6">
            <Link to="/" className="text-sm text-gray-400 hover:text-white transition-colors">首页</Link>
            <Link to="/features" className="text-sm text-gray-400 hover:text-white transition-colors">功能特性</Link>
            <Link to="/tutorial" className="text-sm text-gray-400 hover:text-white transition-colors">教程</Link>
            <Link to="/changelog" className="text-sm text-white font-medium">更新日志</Link>
            <Link to="/about" className="text-sm text-gray-400 hover:text-white transition-colors">关于</Link>
            <Link
              to="/app"
              className="px-4 py-2 text-sm font-medium text-white bg-gradient-to-r from-[#3b82f6] to-[#06d6a0] rounded-lg hover:shadow-lg hover:shadow-[#3b82f6]/30 transition-all"
            >
              进入应用
            </Link>
          </div>
        </div>
      </nav>

      <main className="relative z-10 pt-24 pb-20 px-6">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-16">
            <h1 className="text-4xl md:text-5xl font-bold mb-6">
              更新日志
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#3b82f6] to-[#06d6a0]">
                持续进化
              </span>
            </h1>
            <p className="text-gray-400 text-lg max-w-2xl mx-auto">
              了解 DataPulse 的最新更新和改进，追踪我们的发展历程
            </p>
          </div>

          <div className="space-y-8">
            {releases.map((release) => (
              <div
                key={release.version}
                className="bg-[#0a0f1a] border border-white/10 rounded-xl overflow-hidden"
              >
                <div className="px-6 py-5 border-b border-white/10 flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-3">
                      <span className="text-2xl font-bold">v{release.version}</span>
                      <span
                        className={`px-3 py-1 rounded-full text-xs font-medium ${statusConfig[release.status].bgColor} ${statusConfig[release.status].textColor}`}
                      >
                        {statusConfig[release.status].label}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-gray-400">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    {release.date}
                  </div>
                </div>

                {release.highlights && release.highlights.length > 0 && (
                  <div className="px-6 py-4 bg-gradient-to-r from-[#3b82f6]/5 to-[#06d6a0]/5 border-b border-white/10">
                    <h3 className="text-sm font-semibold text-[#06d6a0] mb-3 font-mono">版本亮点</h3>
                    <ul className="space-y-2">
                      {release.highlights.map((highlight, index) => (
                        <li key={index} className="flex items-start gap-2 text-sm text-gray-300">
                          <svg className="w-5 h-5 text-[#06d6a0] flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                          {highlight}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                <div className="p-6">
                  <h3 className="text-sm font-semibold text-gray-400 mb-4 font-mono">详细更新</h3>
                  <div className="space-y-3">
                    {release.changes.map((change, index) => {
                      const config = changeTypeConfig[change.type]
                      return (
                        <div
                          key={index}
                          className={`flex items-start gap-3 p-3 rounded-lg ${config.bgColor} border ${config.borderColor}`}
                        >
                          <span
                            className={`px-2 py-0.5 rounded text-xs font-medium ${config.bgColor} ${config.textColor} border ${config.borderColor} flex-shrink-0`}
                          >
                            {config.label}
                          </span>
                          <span className="text-sm text-gray-300">{change.description}</span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-16 text-center">
            <div className="inline-flex items-center gap-2 px-6 py-3 bg-[#0a0f1a] border border-white/10 rounded-xl">
              <svg className="w-5 h-5 text-[#06d6a0]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className="text-sm text-gray-300">
                了解最新更新后，点击{' '}
                <Link to="/app" className="text-[#06d6a0] hover:underline font-medium">
                  进入应用
                </Link>{' '}
                体验新功能
              </span>
            </div>
          </div>
        </div>
      </main>

      <footer className="border-t border-white/10 bg-[#050810]/50 py-8 px-6">
        <div className="max-w-7xl mx-auto text-center">
          <p className="text-sm text-gray-500">
            © 2024 DataPulse. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  )
}
