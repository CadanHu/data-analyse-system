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
      '多数据库支持：MySQL、PostgreSQL 原生适配'
    ]
  },
  {
    id: 2,
    title: '进阶多维可视化',
    description: '支持 15+ 种专业图表类型，系统根据数据特征自动选择最佳展示方案。',
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
      </svg>
    ),
    category: '核心功能',
    details: [
      '丰富图表库：雷达图、漏斗图、桑基图、热力图、甘特图等',
      '自动适配引擎：AI 识别数据意图，秒级生成 ECharts 动态配置',
      '交互式深度分析：支持多指标对比、趋势预测与相关性分析',
      '全屏展示模式：一键开启全屏画布，沉浸式洞察数据'
    ]
  },
  {
    id: 3,
    title: 'AI 思考模式',
    description: 'DeepSeek R1 推理模型，展示 AI 的分析思路，确保分析过程透明可见。',
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
      </svg>
    ),
    category: 'AI 能力',
    details: [
      '思维链展示：完整呈现 R1 模型的每一步推理逻辑',
      '深度思考：支持复杂业务问题的多步拆解',
      '逻辑纠错：自动感知并修正潜在的分析偏差',
      '学习辅助：帮助业务人员理解数据背后的关联'
    ]
  },
  {
    id: 13,
    title: '智能方案预判',
    description: '在执行查询前，AI 会先给出专业的分析建议，与用户确认业务口径。',
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01m-.01 4h.01" />
      </svg>
    ),
    category: 'AI 能力',
    details: [
      'HITL 机制：人类在回路，确保分析方向不偏离',
      '口径确认：先建议再执行，避免无效 SQL 运行',
      '风险提示：提前预判大数据量查询可能带来的延迟',
      '指标建议：主动推荐相关的业务观察指标'
    ]
  },
  {
    id: 4,
    title: '全场景数据库支持',
    description: '原生兼容 MySQL 与 PostgreSQL，支持复杂业务逻辑查询。',
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" />
      </svg>
    ),
    category: '数据管理',
    details: [
      '生产级支持：MySQL 8.0+ / PostgreSQL 14+',
      'SQLAlchemy 架构：基于异步 ORM 实现高性能执行',
      '安全沙箱：多层 SQL 注入拦截与只读权限控制',
      '多库并存：支持一键切换不同业务环境的数据库'
    ]
  },
  {
    id: 14,
    title: '动态 Schema 感知',
    description: '自动提取并同步最新的数据库元数据，确保 AI 始终掌握最新的数据结构。',
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
      </svg>
    ),
    category: '数据管理',
    details: [
      '自动刷新：实时扫描表结构变更与字段注释',
      '样本数据采样：AI 自动读取前 3 行数据以理解内容',
      '索引感知：优先利用索引字段进行 SQL 优化',
      '元数据增强：自动识别主外键关系以准确 JOIN'
    ]
  },
  {
    id: 5,
    title: '文件上传与分析',
    description: '支持上传业务文档，AI 将结合私有文档内容进行专业口径解读。',
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
      </svg>
    ),
    category: '增强功能',
    details: [
      '多格式支持：PDF (PyMuPDF/MinerU)、Excel、CSV',
      '语义搜索：基于向量数据库的精准内容检索',
      '口径对齐：确保 AI 生成的指标符合业务定义',
      '长文档处理：支持海量文本的切片与上下文注入'
    ]
  },
  {
    id: 15,
    title: 'Streamable HTTP 协议',
    description: '采用流式 HTTP 响应技术，支持 POST 请求下的高性能异步数据传输。',
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.111 16.404a5.5 5.5 0 017.778 0M12 20h.01m-7.08-7.071c3.904-3.905 10.236-3.905 14.141 0M1.394 9.393c5.857-5.857 15.355-5.857 21.213 0" />
      </svg>
    ),
    category: '增强功能',
    details: [
      '异步流式：实时传输思维链与分析结果',
      '无缓冲传输：X-Accel-Buffering 优化，防止内容卡顿',
      'POST 支持：完美处理复杂参数的流式交互',
      '移动端优化：专为移动端调优的无感重连体验'
    ]
  },
  {
    id: 6,
    title: '会话管理与同步',
    description: '保存历史对话记录，支持多端状态实时同步，提高协作效率。',
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
      </svg>
    ),
    category: '用户体验',
    details: [
      '历史记录：自动持久化至 MySQL 数据库',
      '智能标题：AI 自动总结生成精准的会话名称',
      '快速检索：支持按标题关键词实时搜索会话',
      '状态回溯：切换会话即可瞬间恢复图表与 SQL'
    ]
  },
  {
    id: 8,
    title: '跨平台响应式设计',
    description: '完美适配桌面端、iOS 与 Android 移动端，随时随地开启分析。',
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
      </svg>
    ),
    category: '用户体验',
    details: [
      '原生体验：基于 Capacitor 6 构建的移动 App',
      '横屏优化：极致压缩 Header 与布局，最大化画布',
      '触控友好：针对移动设备优化的图表交互',
      '离线查看：无需重连即可浏览已加载的历史记录'
    ]
  }
]

const categories = Array.from(new Set(features.map(f => f.category)))

export default function Features() {
  return (
    <div className="min-h-screen bg-[#050810] text-white">
      <nav className="fixed top-0 left-0 right-0 z-[100] px-6 py-4 backdrop-blur-xl border-b border-white/10 bg-[#050810]/95" style={{ paddingTop: 'calc(env(safe-area-inset-top) + 1rem)' }}>
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
          <div className="flex items-center gap-4">
            <Link to="/" className="text-xs text-gray-400 hover:text-white transition-colors">首页</Link>
            <Link
              to="/app"
              className="px-4 py-2 text-sm font-medium text-white bg-gradient-to-r from-[#3b82f6] to-[#06d6a0] rounded-lg hover:shadow-lg transition-all pointer-events-auto z-[110]"
            >
              进入应用
            </Link>
          </div>
        </div>
      </nav>

      <main className="relative z-10 pt-48 pb-20 px-6">
        <div className="max-w-7xl mx-auto flex flex-col items-center">
          <div className="text-center mb-24 max-w-3xl">
            <h1 className="text-4xl md:text-6xl font-black mb-8">
              功能特性
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#3b82f6] to-[#06d6a0]">
                强大能力
              </span>
            </h1>
            <p className="text-xl text-gray-400 leading-relaxed">
              探索 DataPulse v1.7.0 的全场景分析能力，让 AI 成为您的首席数据官
            </p>
          </div>

          <div className="w-full space-y-24">
            {categories.map((category) => (
              <div key={category} className="w-full">
                <div className="flex items-center gap-6 mb-12">
                  <div className="h-px flex-1 bg-gradient-to-r from-transparent via-white/10 to-transparent" />
                  <h2 className="text-2xl md:text-3xl font-bold text-[#06d6a0] tracking-tight">{category}</h2>
                  <div className="h-px flex-1 bg-gradient-to-r from-transparent via-white/10 to-transparent" />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 gap-8 justify-items-center max-w-4xl mx-auto">
                  {features.filter(f => f.category === category).map((feature) => (
                    <div
                      key={feature.id}
                      className="w-full max-w-sm bg-[#0a0f1a]/50 border border-white/10 rounded-[2rem] p-8 hover:border-[#06d6a0]/50 hover:bg-[#0a0f1a]/80 hover:shadow-2xl hover:shadow-[#06d6a0]/5 transition-all duration-500 group flex flex-col"
                    >
                      <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[#3b82f6]/20 to-[#06d6a0]/10 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform duration-500">
                        <div className="text-[#3b82f6] group-hover:text-[#06d6a0] transition-colors">
                          {feature.icon}
                        </div>
                      </div>

                      <h3 className="text-xl font-bold mb-3 text-white">{feature.title}</h3>
                      <p className="text-gray-400 text-sm mb-6 leading-relaxed flex-1">{feature.description}</p>

                      <ul className="space-y-3 pt-6 border-t border-white/5">
                        {feature.details.map((detail, index) => (
                          <li key={index} className="flex items-start gap-3 text-xs text-gray-400">
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
          </div>

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
            © 2026 DataPulse. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  )
}
