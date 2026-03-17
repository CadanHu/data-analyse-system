// 国际化翻译文件
export type Language = 'zh' | 'en'

export type TranslationKey = 
  // Navigation
  | 'nav.features' | 'nav.tutorial' | 'nav.about' | 'nav.enterApp' | 'nav.home'
  | 'nav.sessions' | 'nav.chat' | 'nav.charts'
  // Welcome Page
  | 'welcome.version' | 'welcome.title1' | 'welcome.title2' | 'welcome.description'
  | 'welcome.startFree' | 'welcome.viewArchitecture' | 'welcome.dashboardTitle'
  // Features
  | 'features.title' | 'features.subtitle' | 'features.description' | 'features.enterApp' | 'features.afterRead'
  // Tutorial
  | 'tutorial.title1' | 'tutorial.title2' | 'tutorial.description' | 'tutorial.ready' | 'tutorial.start'
  | 'tutorial.step1' | 'tutorial.step1Desc' | 'tutorial.step2' | 'tutorial.step2Desc'
  | 'tutorial.step3' | 'tutorial.step3Desc' | 'tutorial.step4' | 'tutorial.step4Desc'
  | 'tutorial.step5' | 'tutorial.step5Desc' | 'tutorial.startDesc'
  // About
  | 'about.title' | 'about.enterApp' | 'about.mission' | 'about.missionDesc'
  | 'about.techStack' | 'about.team' | 'about.teamDesc' | 'about.contact'
  | 'about.teamMembers' | 'about.experience' | 'about.clients' | 'about.queries'
  // Login/Register
  | 'login.welcome' | 'login.subtitle' | 'login.email' | 'login.password'
  | 'login.submit' | 'login.loading' | 'login.noAccount' | 'login.register'
  | 'login.backToHome' | 'login.failed' | 'login.formatError'
  | 'register.title' | 'register.username' | 'register.confirmPassword'
  | 'register.submit' | 'register.loading' | 'register.haveAccount' | 'register.login'
  // Session List
  | 'session.listTitle' | 'session.new' | 'session.search' | 'session.notFound'
  | 'session.empty' | 'session.delete' | 'session.deleteConfirm' | 'session.logout' | 'session.logoutConfirm'
  | 'session.justNow' | 'session.minutesAgo' | 'session.hoursAgo' | 'session.daysAgo'
  // Chat Area
  | 'chat.placeholder' | 'chat.noSession' | 'chat.upload' | 'chat.send'
  | 'chat.thinkingMode' | 'chat.ragMode' | 'chat.lightMode' | 'chat.proMode'
  | 'chat.pdfModeTitle' | 'chat.pdfModeDesc'
  // Right Panel
  | 'panel.dataPivot' | 'panel.chartType' | 'panel.sqlQuery' | 'panel.viewChart'
  | 'panel.copySQL' | 'panel.fullscreen' | 'panel.exitFullscreen'
  | 'panel.auto' | 'panel.line' | 'panel.area' | 'panel.bar' | 'panel.pie' | 'panel.scatter' | 'panel.radar'
  | 'panel.funnel' | 'panel.gauge' | 'panel.candlestick' | 'panel.heatmap' | 'panel.treemap' | 'panel.sankey'
  | 'panel.boxplot' | 'panel.waterfall' | 'panel.map' | 'panel.gantt' | 'panel.table'
  | 'panel.noData' | 'panel.unsupported' | 'panel.executedSql' | 'panel.export' | 'panel.filter'
  // Features Categories
  | 'feature.core' | 'feature.ai' | 'feature.data' | 'feature.enhanced' | 'feature.ux'
  // Feature Items
  | 'feature.sql.title' | 'feature.sql.desc'
  | 'feature.viz.title' | 'feature.viz.desc'
  | 'feature.thinking.title' | 'feature.thinking.desc'
  | 'feature.preview.title' | 'feature.preview.desc'
  | 'feature.database.title' | 'feature.database.desc'
  | 'feature.schema.title' | 'feature.schema.desc'
  | 'feature.file.title' | 'feature.file.desc'
  | 'feature.stream.title' | 'feature.stream.desc'
  | 'feature.session.title' | 'feature.session.desc'
  | 'feature.mobile.title' | 'feature.mobile.desc'
  // Database Names
  | 'db.business' | 'db.chinook' | 'db.northwind' | 'db.classicBusiness' | 'db.globalAnalysis'
  // Common
  | 'common.appName' | 'common.loading' | 'common.error' | 'common.success' | 'common.cancel' | 'common.confirm'
  | 'common.back' | 'common.save' | 'common.delete' | 'common.edit' | 'common.close' | 'common.open'
  | 'common.yes' | 'common.no' | 'common.startUsing' | 'common.copySuccess' | 'common.refresh'
  | 'common.errorTitle' | 'common.errorDesc'
  // Alerts & Messages
  | 'alert.analysisFailed' | 'alert.selectSessionFirst' | 'alert.processing' | 'alert.fileTypeNotSupported'
  | 'alert.sessionIdMissing' | 'alert.filePreprocessingFailed' | 'alert.exception' | 'alert.parseFailed'
  | 'alert.mobileProcessFailed' | 'alert.fetchFileFailed' | 'alert.scientistModeHint'
  // Reports & Dashboards
  | 'report.deepInsight' | 'report.generating' | 'report.fullScreen' | 'report.offline' | 'report.deepAnalyzing'
  | 'report.genBtn' | 'report.processingHint' | 'report.deepInsightHint'
  | 'report.exportPdfFailed' | 'report.success' | 'report.failed' | 'report.regenerateFailed' | 'report.started'
  // Feedback
  | 'feedback.thanks' | 'feedback.failed'
  // Debug Panel
  | 'debug.ipFormatError' | 'debug.ipSaved' | 'debug.resetAuto'
  | 'debug.title' | 'debug.subtitle' | 'debug.guideTitle' | 'debug.guide1' | 'debug.guide2' | 'debug.guide3'
  | 'debug.currentAddr' | 'debug.platform' | 'debug.detectIp' | 'debug.manualIp' | 'debug.ipPlaceholder'
  | 'debug.ipHint' | 'debug.testBtn' | 'debug.testing' | 'debug.success' | 'debug.failed' | 'debug.unreachable'
  | 'debug.resetBtn' | 'debug.resetConfirm'
  // Register
  | 'register.codeSuccess' | 'register.enterEmailFirst' | 'register.sendCode' | 'register.verifCode'
  | 'register.codePlaceholder' | 'register.passwordMismatch' | 'register.enterCode' | 'register.success'
  | 'register.failed' | 'register.sendFailed'
  // Chat Message Items
  | 'chat.thinkingView' | 'chat.thinkingHide' | 'chat.codeExpand' | 'chat.codeCollapse' | 'chat.codeClickExpand'
  | 'chat.fullTextHide' | 'chat.fullTextView' | 'chat.scientistModeChartBtn' | 'chat.dataInsightThumb'
  | 'chat.editQuestion' | 'chat.showSQL' | 'chat.hideSQL' | 'chat.vizBoard' | 'chat.copyContent' | 'chat.sideBySideView'
  // Previews
  | 'preview.sideBySide' | 'preview.original' | 'preview.markdown' | 'preview.copyResult'
  // Session List Extra
  | 'session.export' | 'session.exportTxt' | 'session.exportMd' | 'session.exportPdf'
  | 'session.syncing' | 'session.wait' | 'session.viewLogs' | 'session.preparingFile'
  | 'session.shareTitle' | 'session.unnamed'
  // New welcome screen and assistant titles
  | 'welcome.assistantTitle' | 'chat.welcomeMessage' | 'chat.featureViz' | 'chat.featureVizDesc'
  | 'chat.featureThinking' | 'chat.featureThinkingDesc' | 'chat.tryAsking' | 'chat.selectDb'
  | 'chat.example1' | 'chat.example2' | 'chat.example3' | 'chat.example4'
  | 'chat.example5' | 'chat.example6' | 'chat.example7' | 'chat.example8' | 'chat.example9' | 'chat.example10'
  // Data Scientist Guide
  | 'guide.scientist.title' | 'guide.scientist.sandbox' | 'guide.scientist.sandboxDesc'
  | 'guide.scientist.charts' | 'guide.scientist.chartsDesc' | 'guide.scientist.reports'
  | 'guide.scientist.reportsDesc' | 'guide.scientist.quickStart' | 'guide.scientist.step1'
  | 'guide.scientist.step2' | 'guide.scientist.step3' | 'guide.scientist.more'
  // Standard Mode Guide
  | 'guide.standard.title' | 'guide.standard.sql' | 'guide.standard.sqlDesc'
  | 'guide.standard.viz' | 'guide.standard.vizDesc' | 'guide.standard.multiDb'
  | 'guide.standard.multiDbDesc' | 'guide.standard.quickStart' | 'guide.standard.step1'
  | 'guide.standard.step2' | 'guide.standard.step3'
  // Deep Mode Guide
  | 'guide.deep.title' | 'guide.deep.mineru' | 'guide.deep.mineruDesc'
  | 'guide.deep.rag' | 'guide.deep.ragDesc' | 'guide.deep.ocr'
  | 'guide.deep.ocrDesc' | 'guide.deep.quickStart' | 'guide.deep.step1'
  | 'guide.deep.step2' | 'guide.deep.step3'

export interface Translation {
  [key: string]: string
}

export const translations: Record<Language, Record<TranslationKey, string>> = {
  zh: {
    // Navigation
    'nav.features': '功能',
    'nav.tutorial': '教程',
    'nav.about': '关于',
    'nav.enterApp': '进入应用',
    'nav.home': '首页',
    'nav.sessions': '会话',
    'nav.chat': '对话',
    'nav.charts': '图表',
    
    // Welcome Page
    'welcome.version': '进阶多维可视化与 AI 自动适配已就绪',
    'welcome.title1': '对话即',
    'welcome.title2': '洞察',
    'welcome.description': '融合 AI 深度推理与 Python 科学计算，让数据分析更智能。三大模式——自然语言 SQL 对话、数据科学代码执行、RAG 文档解析——覆盖从日常业务查询到深度研究的全场景需求，15+ 种交互图表让洞察一目了然。',
    'welcome.startFree': '开始免费使用',
    'welcome.viewArchitecture': '查看技术架构',
    'welcome.dashboardTitle': 'DATAPULSE 智能分析中心',
    
    // Features
    'features.title': '功能特性',
    'features.subtitle': '强大能力',
    'features.description': '探索 DataPulse 的全场景分析能力，让 AI 成为您的首席数据官',
    'features.enterApp': '进入应用',
    'features.afterRead': '了解所有功能后，点击',
    
    // Tutorial
    'tutorial.title1': '快速上手',
    'tutorial.title2': '指南',
    'tutorial.description': '只需五步，开启您的 AI 驱动数据洞察之旅',
    'tutorial.ready': '准备好大显身手了吗？',
    'tutorial.startDesc': '立即登录并选择示例数据库，体验 DataPulse 的强大分析能力。',
    'tutorial.start': '立即开始分析',
    'tutorial.step1': '连接与切换数据库',
    'tutorial.step1Desc': '在进入对话后，点击右上角的数据库按钮，选择您想要分析的数据源（如：全场景商业分析库）。',
    'tutorial.step2': '发起自然语言查询',
    'tutorial.step2Desc': '像平时聊天一样提问，例如："分析去年每个月的营收增长情况"，AI 会自动生成 SQL 并执行。',
    'tutorial.step3': '开启深度思考模式',
    'tutorial.step3Desc': '如果您的问题很复杂（涉及多表关联），建议开启"思考模式"，查看 AI 模型的完整分析逻辑。',
    'tutorial.step4': '交互式可视化探索',
    'tutorial.step4Desc': '分析结果生成后，点击"查看可视化图表"。您可以在右侧面板手动切换雷达图、漏斗图等 15+ 种类型。',
    'tutorial.step5': 'RAG 知识库增强分析',
    'tutorial.step5Desc': '上传业务 PDF 或 Excel，AI 将结合文档内容进行指标解读，确保分析口径与业务文档一致。',
    
    // About
    'about.title': '关于',
    'about.enterApp': '进入应用',
    'about.mission': '我们的使命',
    'about.missionDesc': 'DataPulse 致力于通过最前沿的 AI 推理技术与工业级数据库架构，重新定义企业级数据分析体验。我们通过顶尖 AI 模型的深度思考能力，将复杂的业务语言精准转化为高性能 SQL，并结合 15+ 种进阶可视化方案，让数据洞察不再是专家的特权，而是每一位决策者的得力助手。',
    'about.techStack': '核心技术栈',
    'about.team': '团队介绍',
    'about.teamDesc': 'DataPulse 由一群热爱技术的开发者、数据科学家和产品专家组成。我们来自全球顶尖科技公司，拥有丰富的数据分析、人工智能和产品开发经验。我们的目标是打造最易用的数据分析平台，让数据驱动决策成为每个人的能力。',
    'about.contact': '联系我们',
    'about.teamMembers': '团队成员',
    'about.experience': '年行业经验',
    'about.clients': '企业客户',
    'about.queries': '查询次数',
    
    // Login/Register
    'login.welcome': '欢迎回来',
    'login.subtitle': '智能驱动数据价值 · DataPulse AI',
    'login.email': '邮箱地址',
    'login.password': '密码',
    'login.submit': '立即登录',
    'login.loading': '登录中...',
    'login.noAccount': '还没有账号？',
    'login.register': '立即注册',
    'login.backToHome': '返回首页',
    'login.failed': '登录失败，请检查邮箱和密码',
    'login.formatError': '登录响应格式错误',
    'register.title': '创建账号',
    'register.username': '用户名',
    'register.confirmPassword': '确认密码',
    'register.submit': '立即注册',
    'register.loading': '注册中...',
    'register.haveAccount': '已有账号？',
    'register.login': '立即登录',
    
    // Session List
    'session.listTitle': '会话列表',
    'session.new': '+ 新建',
    'session.search': '搜索会话...',
    'session.notFound': '没有找到匹配的会话',
    'session.empty': '暂无会话',
    'session.delete': '删除会话',
    'session.deleteConfirm': '确定要删除这个会话吗？',
    'session.logout': '退出登录',
    'session.logoutConfirm': '确定要退出登录吗？',
    'session.justNow': '刚刚',
    'session.minutesAgo': '分钟前',
    'session.hoursAgo': '小时前',
    'session.daysAgo': '天前',
    
    // Chat Area
    'chat.placeholder': '输入你的问题...',
    'chat.noSession': '请先选择一个会话',
    'chat.upload': '上传文件',
    'chat.send': '发送',
    'chat.thinkingMode': '思考模式',
    'chat.ragMode': 'RAG 模式',
    'chat.lightMode': '标准模式',
    'chat.proMode': '深度模式',
    'chat.pdfModeTitle': '选择 PDF 解析模式',
    'chat.pdfModeDesc': '快速、适合纯文字',
    
    // Right Panel
    'panel.dataPivot': '数据透视',
    'panel.chartType': '图表类型',
    'panel.sqlQuery': 'SQL 查询',
    'panel.viewChart': '查看图表',
    'panel.copySQL': '复制 SQL',
    'panel.fullscreen': '全屏',
    'panel.exitFullscreen': '退出全屏',
    'panel.auto': '智能推荐',
    'panel.line': '折线图',
    'panel.area': '面积图',
    'panel.bar': '柱状/条形',
    'panel.pie': '饼图/环形',
    'panel.scatter': '散点/气泡',
    'panel.radar': '雷达图',
    'panel.funnel': '漏斗图',
    'panel.gauge': '仪表盘',
    'panel.candlestick': '蜡烛图',
    'panel.heatmap': '热力图',
    'panel.treemap': '树状图',
    'panel.sankey': '桑基图',
    'panel.boxplot': '箱线图',
    'panel.waterfall': '瀑布图',
    'panel.map': '地理地图',
    'panel.gantt': '甘特图',
    'panel.table': '原始表格',
    'panel.noData': '暂无分析数据',
    'panel.unsupported': '该数据格式不适合展示为',
    'panel.executedSql': '执行的 SQL',
    'panel.export': '导出',
    'panel.filter': '过滤数据...',
    
    // Features Categories
    'feature.core': '核心功能',
    'feature.ai': 'AI 能力',
    'feature.data': '数据管理',
    'feature.enhanced': '增强功能',
    'feature.ux': '用户体验',
    
    // Feature Items
    'feature.sql.title': '智能 SQL 生成',
    'feature.sql.desc': '通过自然语言对话，自动生成优化的 SQL 查询语句，无需手动编写复杂代码。',
    'feature.viz.title': '进阶多维可视化',
    'feature.viz.desc': '支持 15+ 种专业图表类型，系统根据数据特征自动选择最佳展示方案。',
    'feature.thinking.title': 'AI 思考模式',
    'feature.thinking.desc': 'AI 推理模型深度思考，展示完整分析思路，确保分析过程透明可见。',
    'feature.preview.title': '智能方案预判',
    'feature.preview.desc': '在执行查询前，AI 会先给出专业的分析建议，与用户确认业务口径。',
    'feature.database.title': '全场景数据库支持',
    'feature.database.desc': '原生兼容 MySQL 与 PostgreSQL，支持复杂业务逻辑查询。',
    'feature.schema.title': '动态 Schema 感知',
    'feature.schema.desc': '自动提取并同步最新的数据库元数据，确保 AI 始终掌握最新的数据结构。',
    'feature.file.title': '文件上传与分析',
    'feature.file.desc': '支持上传业务文档， AI 将结合私有文档内容进行专业口径解读。',
    'feature.stream.title': 'Streamable HTTP 协议',
    'feature.stream.desc': '采用流式 HTTP 响应技术，支持 POST 请求下的高性能异步数据传输。',
    'feature.session.title': '会话管理与同步',
    'feature.session.desc': '保存历史对话记录，支持多端状态实时同步，提高协作效率。',
    'feature.mobile.title': '跨平台响应式设计',
    'feature.mobile.desc': '完美适配桌面端、iOS 与 Android 移动端，随时随地开启分析。',
    
    // Database Names
    'db.business': 'Business DB',
    'db.chinook': 'Chinook 音乐',
    'db.northwind': 'Northwind 贸易',
    'db.classicBusiness': '经典商业分析',
    'db.globalAnalysis': '全场景商业分析',
    
    // Common
    'common.appName': 'DataPulse',
    'common.loading': '加载中...',
    'common.error': '错误',
    'common.success': '成功',
    'common.cancel': '取消',
    'common.confirm': '确认',
    'common.back': '返回',
    'common.save': '保存',
    'common.delete': '删除',
    'common.edit': '编辑',
    'common.close': '关闭',
    'common.open': '打开',
    'common.yes': '是',
    'common.no': '否',
    'common.startUsing': '开始使用',
    'common.copySuccess': '内容已复制',
    'common.refresh': '刷新页面',
    'common.errorTitle': '出错了',
    'common.errorDesc': '页面加载失败，请刷新重试',
    
    // Alerts & Messages
    'alert.analysisFailed': '分析失败',
    'alert.selectSessionFirst': '请先选择或创建一个会话',
    'alert.processing': '正在处理中，请稍候再试',
    'alert.fileTypeNotSupported': '该文件类型暂不支持深度知识抽取',
    'alert.sessionIdMissing': '错误：会话 ID 丢失，请刷新页面或重新创建会话',
    'alert.filePreprocessingFailed': '文件预处理失败',
    'alert.exception': '处理异常',
    'alert.parseFailed': '解析失败',
    'alert.mobileProcessFailed': '手机端处理失败',
    'alert.fetchFileFailed': '从服务器获取文件失败',
    'alert.scientistModeHint': '💡 当前为“科学家模式”，分析结论与图表已在对话框中直接展示。如需使用“传统可视化看板”，请切换至普通 SQL 模式。',
    
    // Reports & Dashboards
    'report.deepInsight': '深度分析看板',
    'report.generating': '生成中...',
    'report.fullScreen': '全屏查看',
    'report.offline': '导出离线报告',
    'report.deepAnalyzing': '系统正在深度建模分析中 (约需1分钟)...',
    'report.genBtn': '✨ 生成深度洞察看板 (耗时约1分钟)',
    'report.processingHint': '提示：正在蒸馏数据并构建 ECharts 看板，请耐心等待...',
    'report.deepInsightHint': '提示：深度看板将为您自动总结业务洞察、推断隐藏趋势并生成全屏报表。',
    'report.exportPdfFailed': 'PDF 导出失败，请重试',
    'report.success': '✨ 深度分析看板已生成成功，内容已永久保存！',
    'report.started': '🚀 深度分析任务已启动，请在下方观察进度。',
    'report.failed': '看板生成失败，可能由于数据量过大或超时，请重试。',
    'report.regenerateFailed': '重新生成失败',
    
    // Feedback
    'feedback.thanks': '感谢您的反馈，我们会尽快优化！',
    'feedback.failed': '提交失败，请稍后重试',
    
    // Debug Panel
    'debug.ipFormatError': '❌ 格式错误：请只填写 IP 地址（例如 192.168.1.5），不要包含 http:// 或端口号！',
    'debug.ipSaved': '✅ IP 已保存！应用将立即重启以连接新地址。',
    'debug.resetAuto': '已恢复为“系统自动探测”模式',
    'debug.title': '移动端调试连接器',
    'debug.subtitle': '解决手机无法连接电脑后端的问题',
    'debug.guideTitle': '小白使用指南',
    'debug.guide1': '为什么用它？ 手机运行应用时，无法直接找到电脑里的后端服务（localhost 在手机上是无效的）。',
    'debug.guide2': '怎么操作？ 请在下方输入框填入你电脑的真实局域网 IP。',
    'debug.guide3': '关键点： 手机和电脑必须连接同一个 WiFi！',
    'debug.currentAddr': '当前连接地址',
    'debug.platform': '平台',
    'debug.detectIp': '检测 IP',
    'debug.manualIp': '手动指定电脑 IP',
    'debug.ipPlaceholder': '例如: 192.168.1.10',
    'debug.ipHint': '提示：只需填数字，我们将自动补全 8000 端口。',
    'debug.testBtn': '一键测试 API 连通性',
    'debug.testing': '正在连接后端...',
    'debug.success': '连接成功！',
    'debug.failed': '连接失败，请检查 IP',
    'debug.unreachable': '无法触达后端服务',
    'debug.resetBtn': '恢复默认设置并重载',
    'debug.resetConfirm': '确定要清除所有缓存吗？',
    
    // Register
    'register.codeSuccess': '验证码请求成功！如果没收到邮件，请查看后端控制台输出。',
    'register.enterEmailFirst': '请先输入邮箱地址',
    'register.sendCode': '获取验证码',
    'register.verifCode': '验证码',
    'register.codePlaceholder': '6位数字验证码',
    'register.passwordMismatch': '两次输入的密码不一致',
    'register.enterCode': '请输入验证码',
    'register.success': '注册成功，请登录',
    'register.failed': '注册失败，请检查填写内容',
    'register.sendFailed': '验证码发送失败',

    // Chat Message Items
    'chat.thinkingView': '查看 AI 思考过程',
    'chat.thinkingHide': '收起思考过程',
    'chat.codeExpand': '展开代码',
    'chat.codeCollapse': '收起代码',
    'chat.codeClickExpand': '点击展开全部代码',
    'chat.fullTextHide': '收起全文',
    'chat.fullTextView': '查看完整解析结果',
    'chat.scientistModeChartBtn': '点击查看 AI 生成的高清分析图表',
    'chat.dataInsightThumb': '数据洞察缩略图 (点击放大)',
    'chat.editQuestion': '修改问题',
    'chat.showSQL': '显示 SQL',
    'chat.hideSQL': '隐藏 SQL',
    'chat.vizBoard': '可视看板',
    'chat.copyContent': '复制内容',
    'chat.sideBySideView': '对照预览',
    
    // Previews
    'preview.sideBySide': '深度解析结果对照',
    'preview.original': 'PDF 原文',
    'preview.markdown': 'Markdown 解析结果 (MinerU)',
    'preview.copyResult': '复制解析结果',

    // Session List Extra
    'session.export': '导出对话',
    'session.exportTxt': '📄 TXT 文本',
    'session.exportMd': '📝 Markdown',
    'session.exportPdf': '📕 高清 PDF',
    'session.syncing': '正在同步...',
    'session.wait': '请稍候',
    'session.viewLogs': '查看系统日志',
    'session.preparingFile': '正在准备文件...',
    'session.shareTitle': '请选择保存或分享方式',
    'session.unnamed': '未命名会话',

    // New welcome screen and assistant titles
    'welcome.assistantTitle': '智能数据分析助理',
    'chat.welcomeMessage': '我已经准备好为您深度分析数据，并自动适配 15+ 种进阶可视化方案。',
    'chat.featureViz': '进阶可视化',
    'chat.featureVizDesc': '自动适配雷达图、漏斗图、热力图等，让数据洞察更直观。',
    'chat.featureThinking': '深度推理模式',
    'chat.featureThinkingDesc': '实时展示推理思维链，让 AI 的分析逻辑透明可见、专业可靠。',
    'chat.tryAsking': '您可以试着这样问我：',
    'chat.selectDb': '⚠️ 请选择数据库',
    'chat.example1': '分析去年的销售额趋势并生成面积图',
    'chat.example2': '对比核心产品的多维性能 (雷达图)',
    'chat.example3': '分析用户从首页到下单的转化漏斗',
    'chat.example4': '展示各地区销售密度的热力图',
    'chat.example5': '按季度汇总各产品线利润率并生成瀑布图',
    'chat.example6': '找出销售额最高的前10名客户及其购买频次',
    'chat.example7': '分析库存周转率与缺货率的相关性',
    'chat.example8': '展示过去12个月的客户留存率趋势',
    'chat.example9': '对比不同城市的人均消费金额（地理地图）',
    'chat.example10': '预测下季度各品类的销售额增长趋势',
    // Data Scientist Guide
    'guide.scientist.title': '科学家模式 (Data Scientist Mode)',
    'guide.scientist.sandbox': '安全沙箱',
    'guide.scientist.sandboxDesc': 'AI 生成的代码在独立的 PythonExecutor 安全沙箱中执行，确保系统安全的同时提供强大的计算能力。',
    'guide.scientist.charts': '动态图表',
    'guide.scientist.chartsDesc': '自动捕获 Matplotlib 生成的图像并实时渲染 ECharts 交互式图表，让数据洞察一目了然。',
    'guide.scientist.reports': '异步报告',
    'guide.scientist.reportsDesc': '针对复杂的数据处理任务，系统采用 BackgroundTasks 异步生成深度报告，无需长时间等待。',
    'guide.scientist.quickStart': '快速开始',
    'guide.scientist.step1': '在侧边栏或对话设置中开启 “科学家模式” 开关。',
    'guide.scientist.step2': '直接描述您的分析需求，例如：“分析去年第四季度的销售额增长趋势，并绘制柱状图”。',
    'guide.scientist.step3': 'AI 将自动编写 Python 代码，从数据库提取数据，并在对话框中展示分析结果和图表。',
    'guide.scientist.more': '了解更多',
    // Standard Mode Guide
    'guide.standard.title': '标准模式 (Standard Mode)',
    'guide.standard.sql': '智能 SQL 生成',
    'guide.standard.sqlDesc': '基于 AI 引擎，将自然语言精准转化为 SQL 语句，无需编写任何代码即可查询数据库。',
    'guide.standard.viz': '多维可视化',
    'guide.standard.vizDesc': '自动分析查询结果并适配最佳图表方案（折线图、柱状图、饼图等），直观展示数据趋势。',
    'guide.standard.multiDb': '多数据库支持',
    'guide.standard.multiDbDesc': '完美兼容 MySQL, PostgreSQL 和 SQLite，支持多源数据统一分析与跨表关联查询。',
    'guide.standard.quickStart': '快速开始',
    'guide.standard.step1': '选择需要分析的目标数据库。',
    'guide.standard.step2': '在输入框中输入您的问题，如：“查询上个月销售额排名前五的城市”。',
    'guide.standard.step3': '查看自动生成的 SQL、数据表格及可视化分析图表。',
    // Deep Mode Guide
    'guide.deep.title': '深度解析模式 (Deep Mode / RAG)',
    'guide.deep.mineru': 'MinerU 深度提取',
    'guide.deep.mineruDesc': '集成 MinerU 高精度解析引擎，能够完美还原复杂 PDF 中的表格、公式和布局，实现结构化知识提取。',
    'guide.deep.rag': 'RAG 知识增强',
    'guide.deep.ragDesc': '基于上传的文档构建本地知识库，AI 在回答时会优先检索文档内容，确保分析结果符合业务背景。',
    'guide.deep.ocr': '智能 OCR 识别',
    'guide.deep.ocrDesc': '支持图片和扫描件的文字识别，即使是手写或低清晰度的文档也能精准转化为可分析的文本数据。',
    'guide.deep.quickStart': '快速开始',
    'guide.deep.step1': '点击对话框旁边的 “+” 号按钮上传您的 PDF 或图片文件。',
    'guide.deep.step2': '在弹出的选项中选择 “深度模式 (Deep)” 或开启 “RAG 模式”。',
    'guide.deep.step3': '等待系统完成解析后，您可以就文档内容进行深度提问和数据分析。',
  },
  
  en: {
    // Navigation
    'nav.features': 'Features',
    'nav.tutorial': 'Tutorial',
    'nav.about': 'About',
    'nav.enterApp': 'Enter App',
    'nav.home': 'Home',
    'nav.sessions': 'Sessions',
    'nav.chat': 'Chat',
    'nav.charts': 'Charts',
    
    // Welcome Page
    'welcome.version': 'Advanced Multi-dimensional Visualization & AI Auto-Adaptation Ready',
    'welcome.title1': 'Conversation is',
    'welcome.title2': 'Insight',
    'welcome.description': 'AI-powered data analysis combining deep reasoning with Python scientific computing. Three modes — Natural Language SQL Chat, Data Scientist Code Execution, and RAG Document Parsing — cover everything from everyday business queries to in-depth research, with 15+ interactive charts for instant insight.',
    'welcome.startFree': 'Start Free',
    'welcome.viewArchitecture': 'View Architecture',
    'welcome.dashboardTitle': 'DATAPULSE INTELLIGENT ANALYTICS HUB',
    
    // Features
    'features.title': 'Features',
    'features.subtitle': 'Powerful Capabilities',
    'features.description': 'Explore DataPulse full-scenario analytics capabilities, let AI become your Chief Data Officer',
    'features.enterApp': 'Enter App',
    'features.afterRead': 'After exploring all features, click',
    
    // Tutorial
    'tutorial.title1': 'Quick Start',
    'tutorial.title2': 'Guide',
    'tutorial.description': 'Just five steps to begin your AI-driven data insight journey',
    'tutorial.ready': 'Ready to Get Started?',
    'tutorial.startDesc': 'Login now and select a sample database to experience the powerful analytics capabilities of DataPulse.',
    'tutorial.start': 'Start Analyzing Now',
    'tutorial.step1': 'Connect & Switch Database',
    'tutorial.step1Desc': 'After entering a conversation, click the database button in the top right corner and select the data source you want to analyze (e.g., Global Business Analysis).',
    'tutorial.step2': 'Natural Language Query',
    'tutorial.step2Desc': 'Ask questions like regular chat, e.g., "Analyze monthly revenue growth last year", AI will automatically generate and execute SQL.',
    'tutorial.step3': 'Enable Deep Thinking Mode',
    'tutorial.step3Desc': 'If your question is complex (involving multi-table joins), enable "Thinking Mode" to view the AI model\'s complete analysis logic.',
    'tutorial.step4': 'Interactive Visualization',
    'tutorial.step4Desc': 'After analysis results are generated, click "View Visualization Charts". You can manually switch between 15+ chart types like radar charts, funnel charts on the right panel.',
    'tutorial.step5': 'RAG Knowledge Base Enhancement',
    'tutorial.step5Desc': 'Upload business PDF or Excel, AI will interpret metrics based on document content, ensuring analysis aligns with business definitions.',
    
    // About
    'about.title': 'About',
    'about.enterApp': 'Enter App',
    'about.mission': 'Our Mission',
    'about.missionDesc': 'DataPulse is committed to redefining enterprise data analytics experience through cutting-edge AI reasoning technology and industrial-grade database architecture. Through state-of-the-art AI models, we precisely transform complex business language into high-performance SQL, combined with 15+ advanced visualization solutions, making data insight not just an expert privilege, but a powerful assistant for every decision maker.',
    'about.techStack': 'Core Tech Stack',
    'about.team': 'Our Team',
    'about.teamDesc': 'DataPulse is built by a team of passionate developers, data scientists, and product experts. We come from top global tech companies with rich experience in data analytics, AI, and product development. Our goal is to create the most user-friendly data analytics platform, making data-driven decision making accessible to everyone.',
    'about.contact': 'Contact Us',
    'about.teamMembers': 'Team Members',
    'about.experience': 'Years Experience',
    'about.clients': 'Enterprise Clients',
    'about.queries': 'Queries',
    
    // Login/Register
    'login.welcome': 'Welcome Back',
    'login.subtitle': 'Intelligence Drives Data Value · DataPulse AI',
    'login.email': 'Email Address',
    'login.password': 'Password',
    'login.submit': 'Sign In',
    'login.loading': 'Signing in...',
    'login.noAccount': "Don't have an account?",
    'login.register': 'Sign Up',
    'login.backToHome': 'Back to Home',
    'login.failed': 'Login failed, please check your email and password',
    'login.formatError': 'Login response format error',
    'register.title': 'Create Account',
    'register.username': 'Username',
    'register.confirmPassword': 'Confirm Password',
    'register.submit': 'Sign Up',
    'register.loading': 'Registering...',
    'register.haveAccount': 'Already have an account?',
    'register.login': 'Sign In',
    
    // Session List
    'session.listTitle': 'Sessions',
    'session.new': '+ New',
    'session.search': 'Search sessions...',
    'session.notFound': 'No matching sessions found',
    'session.empty': 'No sessions yet',
    'session.delete': 'Delete Session',
    'session.deleteConfirm': 'Are you sure you want to delete this session?',
    'session.logout': 'Logout',
    'session.logoutConfirm': 'Are you sure you want to logout?',
    'session.justNow': 'Just now',
    'session.minutesAgo': 'min ago',
    'session.hoursAgo': 'hr ago',
    'session.daysAgo': 'days ago',
    
    // Chat Area
    'chat.placeholder': 'Type your question...',
    'chat.noSession': 'Please select a session first',
    'chat.upload': 'Upload File',
    'chat.send': 'Send',
    'chat.thinkingMode': 'Thinking Mode',
    'chat.ragMode': 'RAG Mode',
    'chat.lightMode': 'Standard',
    'chat.proMode': 'Deep',
    'chat.pdfModeTitle': 'Select PDF Parsing Mode',
    'chat.pdfModeDesc': 'Fast, suitable for plain text',
    
    // Right Panel
    'panel.dataPivot': 'Data Pivot',
    'panel.chartType': 'Chart Type',
    'panel.sqlQuery': 'SQL Query',
    'panel.viewChart': 'View Chart',
    'panel.copySQL': 'Copy SQL',
    'panel.fullscreen': 'Fullscreen',
    'panel.exitFullscreen': 'Exit Fullscreen',
    'panel.auto': 'Auto Recommend',
    'panel.line': 'Line Chart',
    'panel.area': 'Area Chart',
    'panel.bar': 'Bar Chart',
    'panel.pie': 'Pie Chart',
    'panel.scatter': 'Scatter Chart',
    'panel.radar': 'Radar Chart',
    'panel.funnel': 'Funnel Chart',
    'panel.gauge': 'Gauge Chart',
    'panel.candlestick': 'Candlestick',
    'panel.heatmap': 'Heatmap',
    'panel.treemap': 'Treemap',
    'panel.sankey': 'Sankey Diagram',
    'panel.boxplot': 'Box Plot',
    'panel.waterfall': 'Waterfall Chart',
    'panel.map': 'Geographic Map',
    'panel.gantt': 'Gantt Chart',
    'panel.table': 'Raw Table',
    'panel.noData': 'No analysis data',
    'panel.unsupported': 'Data format not suitable for',
    'panel.executedSql': 'Executed SQL',
    'panel.export': 'Export',
    'panel.filter': 'Filter data...',
    
    // Features Categories
    'feature.core': 'Core Features',
    'feature.ai': 'AI Capabilities',
    'feature.data': 'Data Management',
    'feature.enhanced': 'Enhanced Features',
    'feature.ux': 'User Experience',
    
    // Feature Items
    'feature.sql.title': 'Smart SQL Generation',
    'feature.sql.desc': 'Automatically generate optimized SQL queries through natural language conversation, no need to manually write complex code.',
    'feature.viz.title': 'Advanced Multi-dimensional Visualization',
    'feature.viz.desc': 'Support 15+ professional chart types, system automatically selects best display solution based on data characteristics.',
    'feature.thinking.title': 'AI Thinking Mode',
    'feature.thinking.desc': 'AI reasoning model with deep thinking, displays the full analysis thought process, ensuring transparent and visible analysis.',
    'feature.preview.title': 'Intelligent Preview',
    'feature.preview.desc': 'Before executing queries, AI provides professional analysis suggestions and confirms business metrics with users.',
    'feature.database.title': 'Full-Scenario Database Support',
    'feature.database.desc': 'Native MySQL and PostgreSQL compatibility, supports complex business logic queries.',
    'feature.schema.title': 'Dynamic Schema Awareness',
    'feature.schema.desc': 'Automatically extract and sync latest database metadata, ensuring AI always has latest data structure.',
    'feature.file.title': 'File Upload & Analysis',
    'feature.file.desc': 'Support uploading business documents, AI interprets based on private document content for professional metric analysis.',
    'feature.stream.title': 'Streamable HTTP Protocol',
    'feature.stream.desc': 'Uses streaming HTTP response technology, supports high-performance async data transmission under POST requests.',
    'feature.session.title': 'Session Management & Sync',
    'feature.session.desc': 'Save conversation history, supports real-time multi-device state sync, improving collaboration efficiency.',
    'feature.mobile.title': 'Cross-Platform Responsive Design',
    'feature.mobile.desc': 'Perfect adaptation for desktop, iOS and Android mobile, start analyzing anytime, anywhere.',
    
    // Database Names
    'db.business': 'Business DB',
    'db.chinook': 'Chinook Music',
    'db.northwind': 'Northwind Trade',
    'db.classicBusiness': 'Classic Business Analysis',
    'db.globalAnalysis': 'Global Business Analysis',
    
    // Common
    'common.appName': 'DataPulse',
    'common.loading': 'Loading...',
    'common.error': 'Error',
    'common.success': 'Success',
    'common.cancel': 'Cancel',
    'common.confirm': 'Confirm',
    'common.back': 'Back',
    'common.save': 'Save',
    'common.delete': 'Delete',
    'common.edit': 'Edit',
    'common.close': 'Close',
    'common.open': 'Open',
    'common.yes': 'Yes',
    'common.no': 'No',
    'common.startUsing': 'Start Using',
    'common.copySuccess': 'Content Copied',
    'common.refresh': 'Refresh Page',
    'common.errorTitle': 'Oops, something went wrong',
    'common.errorDesc': 'Page failed to load, please refresh and try again',
    
    // Alerts & Messages
    'alert.analysisFailed': 'Analysis Failed',
    'alert.selectSessionFirst': 'Please select or create a session first',
    'alert.processing': 'Processing, please wait...',
    'alert.fileTypeNotSupported': 'This file type does not support deep knowledge extraction',
    'alert.sessionIdMissing': 'Error: Session ID missing, please refresh or recreate session',
    'alert.filePreprocessingFailed': 'File preprocessing failed',
    'alert.exception': 'Processing exception',
    'alert.parseFailed': 'Parsing failed',
    'alert.mobileProcessFailed': 'Mobile processing failed',
    'alert.fetchFileFailed': 'Failed to fetch file from server',
    'alert.scientistModeHint': '💡 "Scientist Mode" is active. Analysis and charts are shown directly in chat. Switch to SQL Mode for classic dashboards.',
    
    // Reports & Dashboards
    'report.deepInsight': 'Deep Insights Dashboard',
    'report.generating': 'Generating...',
    'report.fullScreen': 'Full Screen',
    'report.offline': 'Export Offline Report',
    'report.deepAnalyzing': 'System is deep modeling (approx. 1 min)...',
    'report.genBtn': '✨ Generate Deep Insights (approx. 1 min)',
    'report.processingHint': 'Hint: Distilling data and building ECharts dashboard, please wait...',
    'report.deepInsightHint': 'Hint: Deep dashboard will summarize insights, infer trends, and generate reports.',
    'report.exportPdfFailed': 'PDF export failed, please try again',
    'report.success': '✨ Deep analysis dashboard generated and saved successfully!',
    'report.started': '🚀 Deep analysis task started. Please watch the progress below.',
    'report.failed': 'Dashboard generation failed due to size or timeout, please retry.',
    'report.regenerateFailed': 'Regeneration failed',
    
    // Feedback
    'feedback.thanks': 'Thanks for your feedback! We will optimize as soon as possible.',
    'feedback.failed': 'Submission failed, please try again later',
    
    // Debug Panel
    'debug.ipFormatError': '❌ Format Error: Please enter IP address only (e.g., 192.168.1.5), without http:// or port!',
    'debug.ipSaved': '✅ IP saved! App will restart to connect to the new address.',
    'debug.resetAuto': 'Restored to "System Auto-detect" mode',
    'debug.title': 'Mobile Debug Connector',
    'debug.subtitle': 'Resolve connection issues between mobile and desktop',
    'debug.guideTitle': 'Beginner Guide',
    'debug.guide1': 'Why use it? Mobile apps cannot find backend services on localhost.',
    'debug.guide2': 'How to use? Enter your computers local IP address.',
    'debug.guide3': 'Key point: Mobile and computer must be on the same WiFi!',
    'debug.currentAddr': 'Current Address',
    'debug.platform': 'Platform',
    'debug.detectIp': 'Detected IP',
    'debug.manualIp': 'Manually Set Computer IP',
    'debug.ipPlaceholder': 'Example: 192.168.1.10',
    'debug.ipHint': 'Hint: Enter digits only. We will auto-append port 8000.',
    'debug.testBtn': 'Test API Connection',
    'debug.testing': 'Connecting to backend...',
    'debug.success': 'Connected successfully!',
    'debug.failed': 'Connection failed, check IP',
    'debug.unreachable': 'Cannot reach backend service',
    'debug.resetBtn': 'Reset Defaults and Reload',
    'debug.resetConfirm': 'Are you sure you want to clear all cache?',
    
    // Register
    'register.codeSuccess': 'Verification code requested! If not received, please check backend logs.',
    'register.enterEmailFirst': 'Please enter email address first',
    'register.sendCode': 'Send Code',
    'register.verifCode': 'Verification Code',
    'register.codePlaceholder': '6-digit code',
    'register.passwordMismatch': 'Passwords do not match',
    'register.enterCode': 'Please enter verification code',
    'register.success': 'Registration successful, please login',
    'register.failed': 'Registration failed, please check your input',
    'register.sendFailed': 'Failed to send verification code',

    // Chat Message Items
    'chat.thinkingView': 'View AI Thought Process',
    'chat.thinkingHide': 'Hide Thought Process',
    'chat.codeExpand': 'Expand Code',
    'chat.codeCollapse': 'Collapse Code',
    'chat.codeClickExpand': 'Click to expand all code',
    'chat.fullTextHide': 'Collapse Full Text',
    'chat.fullTextView': 'View Full Analysis Result',
    'chat.scientistModeChartBtn': 'View AI-generated High-Res Chart',
    'chat.dataInsightThumb': 'Data Insight Thumbnail (Click to enlarge)',
    'chat.editQuestion': 'Edit Question',
    'chat.showSQL': 'Show SQL',
    'chat.hideSQL': 'Hide SQL',
    'chat.vizBoard': 'Viz Board',
    'chat.copyContent': 'Copy Content',
    'chat.sideBySideView': 'Preview',
    
    // Previews
    'preview.sideBySide': 'Analysis Comparison',
    'preview.original': 'Original PDF',
    'preview.markdown': 'Markdown Result (MinerU)',
    'preview.copyResult': 'Copy Result',

    // Session List Extra
    'session.export': 'Export Chat',
    'session.exportTxt': '📄 TXT Text',
    'session.exportMd': '📝 Markdown',
    'session.exportPdf': '📕 High-Res PDF',
    'session.syncing': 'Syncing...',
    'session.wait': 'Please wait',
    'session.viewLogs': 'View System Logs',
    'session.preparingFile': 'Preparing file...',
    'session.shareTitle': 'Choose Save or Share Method',
    'session.unnamed': 'Unnamed Session',

    // New welcome screen and assistant titles
    'welcome.assistantTitle': 'Intelligent Data Analysis Assistant',
    'chat.welcomeMessage': 'I am ready to perform deep data analysis for you, automatically adapting to 15+ advanced visualization schemes.',
    'chat.featureViz': 'Advanced Visualization',
    'chat.featureVizDesc': 'Automatically adapt to radar charts, funnel charts, heatmaps, etc., making data insights more intuitive.',
    'chat.featureThinking': 'Deep Reasoning Mode',
    'chat.featureThinkingDesc': 'Real-time display of reasoning chain of thought, making AI analysis logic transparent, visible, professional, and reliable.',
    'chat.tryAsking': 'You can try asking me like this:',
    'chat.selectDb': '⚠️ Please select a database',
    'chat.example1': 'Analyze last year\'s sales trends and generate an area chart',
    'chat.example2': 'Compare multi-dimensional performance of core products (Radar chart)',
    'chat.example3': 'Analyze user conversion funnel from home page to order',
    'chat.example4': 'Display heatmap of sales density in various regions',
    'chat.example5': 'Summarize profit margins by product line per quarter (waterfall chart)',
    'chat.example6': 'Find top 10 customers by revenue and their purchase frequency',
    'chat.example7': 'Analyze correlation between inventory turnover and stockout rate',
    'chat.example8': 'Show customer retention rate trends over the past 12 months',
    'chat.example9': 'Compare per-capita spending across cities (geographic map)',
    'chat.example10': 'Forecast next quarter\'s sales growth trend by category',
    // Data Scientist Guide
    'guide.scientist.title': 'Data Scientist Mode',
    'guide.scientist.sandbox': 'Secure Sandboxing',
    'guide.scientist.sandboxDesc': 'AI-generated code is executed in an isolated PythonExecutor sandbox, ensuring system security while providing powerful computing capabilities.',
    'guide.scientist.charts': 'Dynamic Charts',
    'guide.scientist.chartsDesc': 'Automatically capture Matplotlib-generated images and render interactive ECharts in real-time for instant insights.',
    'guide.scientist.reports': 'Async Reporting',
    'guide.scientist.reportsDesc': 'For complex data processing, the system uses BackgroundTasks to generate deep reports asynchronously without long waits.',
    'guide.scientist.quickStart': 'Quick Start',
    'guide.scientist.step1': 'Enable the "Data Scientist Mode" switch in the sidebar or session settings.',
    'guide.scientist.step2': 'Describe your needs, e.g., "Analyze Q4 sales growth trends and draw a bar chart."',
    'guide.scientist.step3': 'AI will write Python code, extract data, and display results and charts in the chat.',
    'guide.scientist.more': 'Learn More',
    // Standard Mode Guide
    'guide.standard.title': 'Standard Mode',
    'guide.standard.sql': 'Smart SQL Generation',
    'guide.standard.sqlDesc': 'Powered by AI engine, accurately converts natural language into SQL queries, no coding required.',
    'guide.standard.viz': 'Multi-dim Visualization',
    'guide.standard.vizDesc': 'Automatically adapts best chart schemes (Line, Bar, Pie, etc.) based on results to show trends.',
    'guide.standard.multiDb': 'Multi-DB Support',
    'guide.standard.multiDbDesc': 'Fully compatible with MySQL, PostgreSQL, and SQLite for unified analysis and cross-table queries.',
    'guide.standard.quickStart': 'Quick Start',
    'guide.standard.step1': 'Select the target database for analysis.',
    'guide.standard.step2': 'Enter your question, e.g., "Show top 5 cities by sales last month."',
    'guide.standard.step3': 'View generated SQL, data tables, and interactive visualizations.',
    // Deep Mode Guide
    'guide.deep.title': 'Deep Analysis Mode (Deep Mode / RAG)',
    'guide.deep.mineru': 'MinerU Extraction',
    'guide.deep.mineruDesc': 'Integrated MinerU high-precision engine, perfectly restoring tables and formulas from complex PDFs for structured knowledge extraction.',
    'guide.deep.rag': 'RAG Knowledge',
    'guide.deep.ragDesc': 'Build a local knowledge base from uploaded docs. AI prioritizes document content for answers to ensure business context.',
    'guide.deep.ocr': 'Intelligent OCR',
    'guide.deep.ocrDesc': 'Support image and scan recognition, accurately converting handwritten or low-res docs into analyzable text data.',
    'guide.deep.quickStart': 'Quick Start',
    'guide.deep.step1': 'Click the "+" button next to the input bar to upload your PDF or image.',
    'guide.deep.step2': 'Select "Deep Mode" or enable "RAG Mode" from the popup options.',
    'guide.deep.step3': 'Once parsing is complete, you can ask deep questions and perform data analysis on the document.',
  },
}

// 默认语言
export const defaultLanguage: Language = 'zh'

// 从 localStorage 获取语言设置
export const getStoredLanguage = (): Language => {
  if (typeof window === 'undefined') return defaultLanguage
  const stored = localStorage.getItem('datapulse_language')
  return (stored === 'zh' || stored === 'en') ? stored : defaultLanguage
}

// 存储语言设置
export const setStoredLanguage = (lang: Language): void => {
  if (typeof window === 'undefined') return
  localStorage.setItem('datapulse_language', lang)
}
