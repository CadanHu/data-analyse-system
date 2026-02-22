import { useState } from 'react'
import { Link } from 'react-router-dom'

interface TutorialStep {
  id: number
  title: string
  description: string
  icon: React.ReactNode
  code?: string
  tips?: string[]
}

const tutorialSteps: TutorialStep[] = [
  {
    id: 1,
    title: '开始您的第一个对话',
    description: '在输入框中输入您的问题，AI 会自动分析并生成相应的 SQL 查询。',
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
      </svg>
    ),
    tips: [
      '使用清晰、具体的问题会得到更好的结果',
      '可以询问数据的统计信息、趋势分析等',
      '支持多轮对话，可以基于之前的回答继续追问'
    ]
  },
  {
    id: 2,
    title: '理解 AI 的思考过程',
    description: '点击灯泡图标可以查看 AI 的思考过程，了解它是如何分析您的问题并生成 SQL 的。',
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
      </svg>
    ),
    tips: [
      '思考过程展示了 AI 的分析逻辑',
      '可以帮助您理解数据查询的思路',
      '默认折叠，点击灯泡图标展开'
    ]
  },
  {
    id: 3,
    title: '查看和复制 SQL 语句',
    description: 'AI 生成的 SQL 查询语句会显示在回答中，您可以查看、复制或进一步优化。',
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
      </svg>
    ),
    code: 'SELECT * FROM orders WHERE created_at >= datetime("now", "-30 days")',
    tips: [
      '点击 SQL 代码块可以展开/折叠',
      '点击复制按钮可以复制 SQL 语句',
      '可以在其他数据库工具中使用这些 SQL'
    ]
  },
  {
    id: 4,
    title: '探索数据可视化',
    description: 'AI 会自动选择合适的图表类型来展示数据，您也可以手动切换图表类型。',
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
      </svg>
    ),
    tips: [
      '支持柱状图、折线图、饼图、表格等多种类型',
      '点击图表类型标签可以切换',
      '图表会根据数据自动调整'
    ]
  },
  {
    id: 5,
    title: '管理您的会话',
    description: '左侧面板显示所有历史会话，您可以创建新会话、切换会话或删除不需要的会话。',
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
      </svg>
    ),
    tips: [
      '每个会话独立保存对话历史',
      '会话标题会自动根据内容生成',
      '可以随时切换到之前的会话继续分析'
    ]
  },
  {
    id: 6,
    title: '切换数据库',
    description: '系统支持多个数据库，您可以在不同数据库之间切换进行分析。',
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" />
      </svg>
    ),
    tips: [
      '支持业务数据库、Chinook 音乐数据库、Northwind 商业数据库',
      '每个会话会记住选择的数据库',
      '切换数据库后可以查询不同的数据源'
    ]
  }
]

export default function Tutorial() {
  const [activeStep, setActiveStep] = useState(1)
  const [expandedStep, setExpandedStep] = useState<number | null>(null)

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
            <Link to="/tutorial" className="text-sm text-white font-medium">教程</Link>
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
              使用教程
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#3b82f6] to-[#06d6a0]">
                快速上手
              </span>
            </h1>
            <p className="text-gray-400 text-lg max-w-2xl mx-auto">
              通过以下步骤，快速掌握 DataPulse 的核心功能，开始您的数据分析之旅
            </p>
          </div>

          <div className="space-y-6">
            {tutorialSteps.map((step, index) => (
              <div
                key={step.id}
                className={`bg-[#0a0f1a] border border-white/10 rounded-xl overflow-hidden transition-all duration-300 ${
                  activeStep === step.id ? 'border-[#06d6a0]/50 shadow-lg shadow-[#06d6a0]/10' : ''
                }`}
              >
                <button
                  onClick={() => {
                    setActiveStep(step.id)
                    setExpandedStep(expandedStep === step.id ? null : step.id)
                  }}
                  className="w-full px-6 py-5 flex items-center gap-4 hover:bg-white/5 transition-colors"
                >
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${
                    activeStep === step.id
                      ? 'bg-gradient-to-br from-[#3b82f6] to-[#06d6a0]'
                      : 'bg-white/10'
                  }`}>
                    {step.icon}
                  </div>
                  <div className="flex-1 text-left">
                    <div className="flex items-center gap-3 mb-1">
                      <span className="text-sm font-mono text-gray-500">STEP {step.id.toString().padStart(2, '0')}</span>
                      <h3 className="text-lg font-semibold">{step.title}</h3>
                    </div>
                    <p className="text-gray-400 text-sm">{step.description}</p>
                  </div>
                  <svg
                    className={`w-5 h-5 text-gray-400 transition-transform ${
                      expandedStep === step.id ? 'rotate-180' : ''
                    }`}
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>

                {expandedStep === step.id && (
                  <div className="px-6 pb-6 border-t border-white/10 pt-4">
                    {step.code && (
                      <div className="mb-4">
                        <h4 className="text-sm text-gray-400 mb-2 font-mono">示例 SQL</h4>
                        <div className="bg-[#050810] border border-white/10 rounded-lg p-4 overflow-x-auto">
                          <pre className="text-sm text-[#06d6a0] font-mono">
                            <code>{step.code}</code>
                          </pre>
                        </div>
                      </div>
                    )}

                    {step.tips && step.tips.length > 0 && (
                      <div>
                        <h4 className="text-sm text-gray-400 mb-3 font-mono">使用技巧</h4>
                        <ul className="space-y-2">
                          {step.tips.map((tip, tipIndex) => (
                            <li key={tipIndex} className="flex items-start gap-2 text-sm text-gray-300">
                              <svg className="w-5 h-5 text-[#06d6a0] flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                              </svg>
                              {tip}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>

          <div className="mt-16 text-center">
            <div className="inline-flex items-center gap-2 px-6 py-3 bg-[#0a0f1a] border border-white/10 rounded-xl">
              <svg className="w-5 h-5 text-[#06d6a0]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className="text-sm text-gray-300">
                完成教程后，点击{' '}
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
