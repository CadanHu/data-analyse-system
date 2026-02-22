import { Link } from 'react-router-dom'

interface Feature {
  id: number
  title: string
  description: string
  icon: React.ReactNode
  details: string[]
  category: string
}

const features: Feature[] = [
  {
    id: 1,
    title: '智能 SQL 生成',
    description: '通过自然语言对话，自动生成优化的 SQL 查询语句，无需手动编写复杂代码。',
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
      </svg>
    ),
    category: '核心功能',
    details: [
      '支持复杂查询：JOIN、子查询、聚合函数等',
      '自动优化：AI 会根据数据结构优化查询性能',
      '错误修复：自动检测并修复 SQL 语法错误',
      '多数据库支持：MySQL、PostgreSQL、SQLite 等'
    ]
  },
  {
    id: 2,
    title: '实时数据可视化',
    description: '支持多种图表类型，实时展示数据分析结果，让数据洞察一目了然。',
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
      </svg>
    ),
    category: '核心功能',
    details: [
      '多种图表类型：柱状图、折线图、饼图、散点图、表格等',
      '智能推荐：AI 根据数据类型自动推荐最佳图表',
      '交互式操作：支持缩放、筛选、排序等交互',
      '导出功能：支持导出为 PNG、SVG、CSV 等格式'
    ]
  },
  {
    id: 3,
    title: 'AI 思考模式',
    description: 'DeepSeek 推理模型，展示 AI 的分析思路，帮助您理解数据查询逻辑。',
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
      </svg>
    ),
    category: 'AI 能力',
    details: [
      '推理过程展示：完整展示 AI 的分析思路',
      '深度思考：支持复杂问题的多步推理',
      '可折叠显示：默认折叠，点击展开查看',
      '学习辅助：帮助用户学习 SQL 和数据分析'
    ]
  },
  {
    id: 4,
    title: '多数据源支持',
    description: '支持多种数据库类型，灵活接入您的数据资产，实现统一的数据分析平台。',
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" />
      </svg>
    ),
    category: '数据管理',
    details: [
      '多种数据库：MySQL、PostgreSQL、SQLite、SQL Server 等',
      '预置数据集：Chinook 音乐数据库、Northwind 商业数据库',
      '灵活切换：每个会话独立选择数据库',
      '安全连接：支持加密连接和权限管理'
    ]
  },
  {
    id: 5,
    title: '文件上传与分析',
    description: '支持上传图片和文档文件，AI 可以分析文件内容并生成相应的数据查询。',
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
      </svg>
    ),
    category: '增强功能',
    details: [
      '图片识别：支持上传图片进行数据识别',
      '文档解析：支持 PDF、Excel、CSV 等格式',
      '智能分析：AI 自动提取关键信息',
      '批量上传：支持一次上传多个文件'
    ]
  },
  {
    id: 6,
    title: '会话管理',
    description: '保存历史对话记录，随时回顾和继续之前的分析工作，提高工作效率。',
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
      </svg>
    ),
    category: '用户体验',
    details: [
      '历史记录：自动保存所有对话历史',
      '智能标题：AI 自动生成有意义的会话标题',
      '快速切换：轻松切换到任意历史会话',
      '会话删除：支持删除不需要的会话'
    ]
  },
  {
    id: 7,
    title: '流式响应',
    description: '采用 Streamable HTTP 技术，实现实时流式输出，提升用户体验。',
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
      </svg>
    ),
    category: '技术特性',
    details: [
      '实时输出：AI 回答实时流式显示',
      '高性能：优化的流式传输协议',
      '稳定性：自动处理网络中断和重连',
      '兼容性：支持所有现代浏览器'
    ]
  },
  {
    id: 8,
    title: '响应式设计',
    description: '完美适配桌面端和移动端，随时随地访问您的数据分析平台。',
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
      </svg>
    ),
    category: '用户体验',
    details: [
      '多设备支持：桌面、平板、手机全覆盖',
      '自适应布局：根据屏幕尺寸自动调整',
      '触控优化：移动端友好的触控交互',
      '离线支持：支持离线查看历史会话'
    ]
  },
  {
    id: 9,
    title: 'SQL 代码管理',
    description: '查看、复制、折叠 SQL 查询语句，方便在其他工具中使用或进一步优化。',
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
      </svg>
    ),
    category: '开发者工具',
    details: [
      '语法高亮：SQL 代码语法高亮显示',
      '一键复制：快速复制 SQL 语句',
      '折叠显示：默认折叠，点击展开',
      '格式化：自动格式化 SQL 代码'
    ]
  },
  {
    id: 10,
    title: '智能总结',
    description: '自动总结对话内容，为每个会话生成有意义的标题，便于快速识别和查找。',
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    ),
    category: 'AI 能力',
    details: [
      '自动生成：AI 自动分析对话内容生成标题',
      '智能识别：识别对话的核心主题',
      '可编辑：支持手动编辑会话标题',
      '快速搜索：通过标题快速查找会话'
    ]
  },
  {
    id: 11,
    title: '多轮对话',
    description: '支持多轮对话，可以基于之前的回答继续追问，深入分析数据。',
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
      </svg>
    ),
    category: 'AI 能力',
    details: [
      '上下文记忆：AI 记住之前的对话内容',
      '追问支持：可以基于回答继续提问',
      '深入分析：支持多层次的深度分析',
      '逻辑连贯：保持对话的逻辑连贯性'
    ]
  },
  {
    id: 12,
    title: '数据安全',
    description: '采用多层安全机制，保护您的数据安全和隐私。',
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
      </svg>
    ),
    category: '安全特性',
    details: [
      '数据加密：传输和存储全程加密',
      '权限管理：细粒度的权限控制',
      '审计日志：记录所有操作日志',
      '隐私保护：符合数据隐私保护法规'
    ]
  }
]

const categories = Array.from(new Set(features.map(f => f.category)))

export default function Features() {
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
            <Link to="/features" className="text-sm text-white font-medium">功能特性</Link>
            <Link to="/tutorial" className="text-sm text-gray-400 hover:text-white transition-colors">教程</Link>
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
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <h1 className="text-4xl md:text-5xl font-bold mb-6">
              功能特性
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#3b82f6] to-[#06d6a0]">
                强大能力
              </span>
            </h1>
            <p className="text-gray-400 text-lg max-w-2xl mx-auto">
              探索 DataPulse 的强大功能，了解如何利用 AI 技术提升您的数据分析效率
            </p>
          </div>

          {categories.map((category) => (
            <div key={category} className="mb-16">
              <div className="flex items-center gap-3 mb-8">
                <div className="h-px flex-1 bg-gradient-to-r from-transparent via-white/20 to-transparent" />
                <h2 className="text-2xl font-bold text-[#06d6a0]">{category}</h2>
                <div className="h-px flex-1 bg-gradient-to-r from-transparent via-white/20 to-transparent" />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {features.filter(f => f.category === category).map((feature) => (
                  <div
                    key={feature.id}
                    className="bg-[#0a0f1a] border border-white/10 rounded-xl p-6 hover:border-[#06d6a0]/50 hover:shadow-lg hover:shadow-[#06d6a0]/10 transition-all duration-300 group"
                  >
                    <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-[#3b82f6]/20 to-[#06d6a0]/10 flex items-center justify-center mb-4 group-hover:from-[#3b82f6]/30 group-hover:to-[#06d6a0]/20 transition-all">
                      <div className="text-[#3b82f6] group-hover:text-[#06d6a0] transition-colors">
                        {feature.icon}
                      </div>
                    </div>

                    <h3 className="text-lg font-semibold mb-2">{feature.title}</h3>
                    <p className="text-gray-400 text-sm mb-4 leading-relaxed">{feature.description}</p>

                    <ul className="space-y-2">
                      {feature.details.map((detail, index) => (
                        <li key={index} className="flex items-start gap-2 text-xs text-gray-300">
                          <svg className="w-4 h-4 text-[#06d6a0] flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                          {detail}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </div>
          ))}

          <div className="mt-16 text-center">
            <div className="inline-flex items-center gap-2 px-6 py-3 bg-[#0a0f1a] border border-white/10 rounded-xl">
              <svg className="w-5 h-5 text-[#06d6a0]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className="text-sm text-gray-300">
                了解所有功能后，点击{' '}
                <Link to="/app" className="text-[#06d6a0] hover:underline font-medium">
                  进入应用
                </Link>{' '}
                开始使用
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
