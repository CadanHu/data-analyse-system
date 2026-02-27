// 国际化翻译文件
export type Language = 'zh' | 'en'

export type TranslationKey = 
  // Navigation
  | 'nav.features' | 'nav.tutorial' | 'nav.about' | 'nav.enterApp' | 'nav.home'
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
  | 'login.backToHome' | 'register.title' | 'register.username' | 'register.confirmPassword'
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
  | 'common.yes' | 'common.no' | 'common.startUsing'

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
    
    // Welcome Page
    'welcome.version': 'V1.7.0 · 进阶多维可视化与 AI 自动适配已就绪',
    'welcome.title1': '对话即',
    'welcome.title2': '洞察',
    'welcome.description': '基于 DeepSeek R1 深度思考能力，通过自然语言轻松驾驭 MySQL 与 PostgreSQL。15+ 种进阶图表、AI 自动适配展示方案、RAG 知识库增强，让数据决策从未如此简单。',
    'welcome.startFree': '开始免费使用',
    'welcome.viewArchitecture': '查看技术架构',
    'welcome.dashboardTitle': 'DATAPULSE 智能分析中心',
    
    // Features
    'features.title': '功能特性',
    'features.subtitle': '强大能力',
    'features.description': '探索 DataPulse v1.7.0 的全场景分析能力，让 AI 成为您的首席数据官',
    'features.enterApp': '进入应用',
    'features.afterRead': '了解所有功能后，点击',
    
    // Tutorial
    'tutorial.title1': '快速上手',
    'tutorial.title2': '指南',
    'tutorial.description': '只需五步，开启您的 AI 驱动数据洞察之旅',
    'tutorial.ready': '准备好大显身手了吗？',
    'tutorial.startDesc': '立即登录并选择示例数据库，体验 v1.7.0 的强大分析能力。',
    'tutorial.start': '立即开始分析',
    'tutorial.step1': '连接与切换数据库',
    'tutorial.step1Desc': '在进入对话后，点击右上角的数据库按钮，选择您想要分析的数据源（如：全场景商业分析库）。',
    'tutorial.step2': '发起自然语言查询',
    'tutorial.step2Desc': '像平时聊天一样提问，例如："分析去年每个月的营收增长情况"，AI 会自动生成 SQL 并执行。',
    'tutorial.step3': '开启深度思考模式',
    'tutorial.step3Desc': '如果您的问题很复杂（涉及多表关联），建议开启"思考模式"，查看 DeepSeek R1 的完整分析逻辑。',
    'tutorial.step4': '交互式可视化探索',
    'tutorial.step4Desc': '分析结果生成后，点击"查看可视化图表"。您可以在右侧面板手动切换雷达图、漏斗图等 15+ 种类型。',
    'tutorial.step5': 'RAG 知识库增强分析',
    'tutorial.step5Desc': '上传业务 PDF 或 Excel，AI 将结合文档内容进行指标解读，确保分析口径与业务文档一致。',
    
    // About
    'about.title': '关于',
    'about.enterApp': '进入应用',
    'about.mission': '我们的使命',
    'about.missionDesc': 'DataPulse v1.7.0 致力于通过最前沿的 AI 推理技术与工业级数据库架构，重新定义企业级数据分析体验。我们通过 DeepSeek R1 的深度思考能力，将复杂的业务语言精准转化为高性能 SQL，并结合 15+ 种进阶可视化方案，让数据洞察不再是专家的特权，而是每一位决策者的得力助手。',
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
    'feature.thinking.desc': 'DeepSeek R1 推理模型，展示 AI 的分析思路，确保分析过程透明可见。',
    'feature.preview.title': '智能方案预判',
    'feature.preview.desc': '在执行查询前，AI 会先给出专业的分析建议，与用户确认业务口径。',
    'feature.database.title': '全场景数据库支持',
    'feature.database.desc': '原生兼容 MySQL 与 PostgreSQL，支持复杂业务逻辑查询。',
    'feature.schema.title': '动态 Schema 感知',
    'feature.schema.desc': '自动提取并同步最新的数据库元数据，确保 AI 始终掌握最新的数据结构。',
    'feature.file.title': '文件上传与分析',
    'feature.file.desc': '支持上传业务文档，AI 将结合私有文档内容进行专业口径解读。',
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
  },
  
  en: {
    // Navigation
    'nav.features': 'Features',
    'nav.tutorial': 'Tutorial',
    'nav.about': 'About',
    'nav.enterApp': 'Enter App',
    'nav.home': 'Home',
    
    // Welcome Page
    'welcome.version': 'V1.7.0 · Advanced Multi-dimensional Visualization & AI Auto-Adaptation Ready',
    'welcome.title1': 'Conversation is',
    'welcome.title2': 'Insight',
    'welcome.description': 'Powered by DeepSeek R1 deep thinking capabilities, easily master MySQL and PostgreSQL through natural language. 15+ advanced charts, AI automatic display adaptation, RAG knowledge base enhancement - data decision making has never been simpler.',
    'welcome.startFree': 'Start Free',
    'welcome.viewArchitecture': 'View Architecture',
    'welcome.dashboardTitle': 'DATAPULSE INTELLIGENT ANALYTICS HUB',
    
    // Features
    'features.title': 'Features',
    'features.subtitle': 'Powerful Capabilities',
    'features.description': 'Explore DataPulse v1.7.0 full-scenario analytics capabilities, let AI become your Chief Data Officer',
    'features.enterApp': 'Enter App',
    'features.afterRead': 'After exploring all features, click',
    
    // Tutorial
    'tutorial.title1': 'Quick Start',
    'tutorial.title2': 'Guide',
    'tutorial.description': 'Just five steps to begin your AI-driven data insight journey',
    'tutorial.ready': 'Ready to Get Started?',
    'tutorial.startDesc': 'Login now and select a sample database to experience the powerful analytics capabilities of v1.7.0.',
    'tutorial.start': 'Start Analyzing Now',
    'tutorial.step1': 'Connect & Switch Database',
    'tutorial.step1Desc': 'After entering a conversation, click the database button in the top right corner and select the data source you want to analyze (e.g., Global Business Analysis).',
    'tutorial.step2': 'Natural Language Query',
    'tutorial.step2Desc': 'Ask questions like regular chat, e.g., "Analyze monthly revenue growth last year", AI will automatically generate and execute SQL.',
    'tutorial.step3': 'Enable Deep Thinking Mode',
    'tutorial.step3Desc': 'If your question is complex (involving multi-table joins), enable "Thinking Mode" to view DeepSeek R1 complete analysis logic.',
    'tutorial.step4': 'Interactive Visualization',
    'tutorial.step4Desc': 'After analysis results are generated, click "View Visualization Charts". You can manually switch between 15+ chart types like radar charts, funnel charts on the right panel.',
    'tutorial.step5': 'RAG Knowledge Base Enhancement',
    'tutorial.step5Desc': 'Upload business PDF or Excel, AI will interpret metrics based on document content, ensuring analysis aligns with business definitions.',
    
    // About
    'about.title': 'About',
    'about.enterApp': 'Enter App',
    'about.mission': 'Our Mission',
    'about.missionDesc': 'DataPulse v1.7.0 is committed to redefining enterprise data analytics experience through cutting-edge AI reasoning technology and industrial-grade database architecture. Through DeepSeek R1 deep thinking capabilities, we precisely transform complex business language into high-performance SQL, combined with 15+ advanced visualization solutions, making data insight not just an expert privilege, but a powerful assistant for every decision maker.',
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
    'feature.thinking.desc': 'DeepSeek R1 reasoning model, displays AI analysis thought process, ensuring transparent and visible analysis.',
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
