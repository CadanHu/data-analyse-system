// 大模型、Embedding、特殊工具供应商目录
// 从 ModelKeyModal.tsx 抽出，供 InputBar / modelPicker 等共享，避免重复定义

export interface ProviderModelInfo {
  value: string
  label: string
  thinking?: boolean
  vision?: boolean
}

export interface ProviderSpec {
  label: string
  vpn: boolean
  baseUrlHint?: string
  getKeyUrl: string
  models: ProviderModelInfo[]
}

export const PROVIDER_MODELS: Record<string, ProviderSpec> = {
  // ── 国内直连 ──────────────────────────────────────────────────────────────
  deepseek: {
    label: 'DeepSeek',
    vpn: false,
    baseUrlHint: 'https://api.deepseek.com',
    getKeyUrl: 'https://platform.deepseek.com/api_keys',
    models: [
      { value: 'deepseek-chat', label: 'DeepSeek V3 (标准)' },
      { value: 'deepseek-reasoner', label: 'DeepSeek R1 (推理)', thinking: true },
    ],
  },
  qwen: {
    label: '通义千问 Qwen',
    vpn: false,
    baseUrlHint: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    getKeyUrl: 'https://bailian.console.aliyun.com/',
    models: [
      { value: 'qwen3-max', label: 'Qwen3-Max 旗舰' },
      { value: 'qwen3-thinking', label: 'Qwen3-Thinking (深度推理)', thinking: true },
      { value: 'qwen3-coder', label: 'Qwen3-Coder (代码专用)' },
      { value: 'qwen3.5-plus', label: 'Qwen3.5-Plus 主力' },
      { value: 'qwen3.5-flash', label: 'Qwen3.5-Flash 极速 (低成本)' },
      { value: 'qwen3-vl', label: 'Qwen3-VL (多模态)', vision: true },
      { value: 'qwen-vl-max', label: 'Qwen-VL-Max (视觉)', vision: true },
    ],
  },
  zhipu: {
    label: '智谱 AI (GLM)',
    vpn: false,
    baseUrlHint: 'https://open.bigmodel.cn/api/paas/v4',
    getKeyUrl: 'https://open.bigmodel.cn/usercenter/apikeys',
    models: [
      { value: 'glm-5', label: 'GLM-5 旗舰基座 (2026)' },
      { value: 'glm-5-turbo', label: 'GLM-5 Turbo (深度推理+Agent)', thinking: true },
      { value: 'glm-4.7', label: 'GLM-4.7 (推理+Agent)', thinking: true },
      { value: 'glm-4.7-flashx', label: 'GLM-4.7 FlashX 30B 轻量推理', thinking: true },
      { value: 'glm-4.6', label: 'GLM-4.6 (200K 长文本)' },
      { value: 'glm-4.5', label: 'GLM-4.5 (Agent推理)', thinking: true },
      { value: 'glm-4.5-air', label: 'GLM-4.5 Air (高性价比 免费额度)' },
      { value: 'glm-4.7-flash', label: 'GLM-4.7 Flash (免费)' },
      { value: 'glm-4.6v', label: 'GLM-4.6V 视觉旗舰 (128K)', vision: true },
      { value: 'glm-4.6v-flashx', label: 'GLM-4.6V FlashX 轻量视觉', vision: true },
      { value: 'glm-4.6v-flash', label: 'GLM-4.6V Flash (免费视觉)', vision: true },
      { value: 'glm-4.5v', label: 'GLM-4.5V 视觉推理 (可开关思考)', vision: true },
      { value: 'glm-4.1v-thinking-flashx', label: 'GLM-4.1V Thinking FlashX 小尺寸视觉', vision: true },
      { value: 'glm-ocr', label: 'GLM-OCR (文档精准解析)', vision: true },
      { value: 'glm-4-flash-250414', label: 'GLM-4 Flash 250414 (免费最新版)' },
      { value: 'glm-4-flash', label: 'GLM-4 Flash (免费)' },
    ],
  },
  minimax: {
    label: 'MiniMax',
    vpn: false,
    baseUrlHint: 'https://api.minimax.chat/v1',
    getKeyUrl: 'https://platform.minimaxi.com/user-center/basic-information/interface-key',
    models: [
      { value: 'MiniMax-M2.7', label: 'M2.7 文本最新版' },
      { value: 'MiniMax-M2.5', label: 'M2.5 文本主力' },
      { value: 'MiniMax-M1', label: 'M1 开源推理', thinking: true },
      { value: 'hailuo-02', label: 'Hailuo 02 视频最新版' },
      { value: 'hailuo-2.3', label: 'Hailuo 2.3 视频 (API)' },
      { value: 'speech-02-hd', label: 'Speech 2.6 语音合成' },
      { value: 'music-01', label: 'Music 2.5 音乐生成' },
    ],
  },
  kimi: {
    label: '月之暗面 Kimi',
    vpn: false,
    baseUrlHint: 'https://api.moonshot.cn/v1',
    getKeyUrl: 'https://platform.moonshot.cn/console/api-keys',
    models: [
      { value: 'kimi-k2.5', label: 'Kimi K2.5 旗舰 (多模态+推理)', thinking: true, vision: true },
      { value: 'kimi-k2-thinking', label: 'Kimi K2 Thinking (深度推理)', thinking: true },
      { value: 'moonshot-kimi-k2-instruct', label: 'Kimi K2 Instruct (极速直答)' },
      { value: 'kimi-k2-turbo-preview', label: 'Kimi K2 Turbo (Agent开发)' },
      { value: 'moonshot-v1-128k', label: 'Moonshot v1 128K (长文本稳定版)' },
    ],
  },
  doubao: {
    label: '豆包 Doubao (字节)',
    vpn: false,
    baseUrlHint: 'https://ark.volcengineapi.com/api/v3',
    getKeyUrl: 'https://console.volcengine.com/ark/region:ark+cn-beijing/apiKey',
    models: [
      { value: 'doubao-seed-2.0-pro', label: 'Seed 2.0 Pro 旗舰 (推理+视觉)', vision: true },
      { value: 'doubao-seed-2.0-lite', label: 'Seed 2.0 Lite 性价比 (视觉)', vision: true },
      { value: 'doubao-seed-2.0-mini', label: 'Seed 2.0 Mini 高并发低成本' },
      { value: 'doubao-seed-1.8', label: 'Seed 1.8 多模态 Agent (视觉)', vision: true },
      { value: 'doubao-seed-1.6', label: 'Seed 1.6 (支持 reasoning effort)' },
      { value: 'seedream-5.0', label: 'Seedream 5.0 文生图/图编辑' },
      { value: 'seedream-5.0-lite', label: 'Seedream 5.0 Lite 图像轻量版' },
      { value: 'seedance-2.0', label: 'Seedance 2.0 文生/图生视频' },
    ],
  },
  hunyuan: {
    label: '腾讯混元 Hunyuan',
    vpn: false,
    baseUrlHint: 'https://api.hunyuan.cloud.tencent.com/v1',
    getKeyUrl: 'https://console.cloud.tencent.com/hunyuan/start',
    models: [
      { value: 'hunyuan-pro', label: 'Hunyuan Pro 旗舰' },
      { value: 'hunyuan-standard', label: 'Hunyuan Standard' },
      { value: 'hunyuan-lite', label: 'Hunyuan Lite (免费)' },
      { value: 'hunyuan-vision', label: 'Hunyuan Vision (视觉)', vision: true },
    ],
  },
  baidu: {
    label: '百度文心 ERNIE',
    vpn: false,
    baseUrlHint: 'https://aistudio.baidu.com/llm/lmapi/v3',
    getKeyUrl: 'https://aistudio.baidu.com/index/accessToken',
    models: [
      { value: 'ERNIE-5.0', label: 'ERNIE 5.0 旗舰 (全模态 2.4T)', vision: true },
      { value: 'ERNIE-4.5', label: 'ERNIE 4.5 通用文本' },
      { value: 'ERNIE-4.5-VL', label: 'ERNIE 4.5 VL (图文多模态)', vision: true },
      { value: 'ERNIE-4.5-Think', label: 'ERNIE 4.5 Think (深度推理)', thinking: true },
      { value: 'ERNIE-4.0-8K', label: 'ERNIE 4.0 8K (赠 100万 tokens)' },
      { value: 'ERNIE-3.5-8K', label: 'ERNIE 3.5 8K (永久免费)' },
      { value: 'ERNIE-Speed-8K', label: 'ERNIE Speed 8K (免费极速)' },
      { value: 'ERNIE-Lite', label: 'ERNIE Lite (轻量高并发)' },
    ],
  },
  sensenova: {
    label: '商汤日日新 SenseNova',
    vpn: false,
    baseUrlHint: 'https://api.sensenova.cn/v1',
    getKeyUrl: 'https://platform.sensenova.cn/product/APIService/pricing/',
    models: [
      { value: 'SenseNova-V6.5-Pro', label: 'V6.5 Pro 旗舰多模态 (图文交错推理)', thinking: true, vision: true },
      { value: 'SenseNova-V6.5-Turbo', label: 'V6.5 Turbo 轻量多模态 (图/文/视频)', vision: true },
      { value: 'SenseNova-V6-Pro', label: 'V6 Pro 通用多模态 (视觉)', vision: true },
      { value: 'SenseNova-V6-Reasoner', label: 'V6 Reasoner 深度推理 (图文思维链)', thinking: true, vision: true },
      { value: 'SenseNova-V6-Turbo', label: 'V6 Turbo 轻量快速' },
      { value: 'SenseNova-V6-Omni', label: 'V6 Omni 实时音视频对话', vision: true },
    ],
  },
  // ── 需要 VPN ──────────────────────────────────────────────────────────────
  openai: {
    label: 'OpenAI',
    vpn: true,
    baseUrlHint: 'https://api.openai.com/v1',
    getKeyUrl: 'https://platform.openai.com/api-keys',
    models: [
      { value: 'gpt-5.3', label: 'GPT-5.3 主力通用 (最推荐)' },
      { value: 'gpt-5.2', label: 'GPT-5.2 Fallback' },
      { value: 'o4-mini', label: 'o4-mini 推理性价比', thinking: true },
      { value: 'o3', label: 'o3 强推理', thinking: true },
      { value: 'gpt-4o', label: 'GPT-4o 兼容 Fallback', vision: true },
    ],
  },
  gemini: {
    label: 'Google Gemini',
    vpn: true,
    getKeyUrl: 'https://aistudio.google.com/apikey',
    models: [
      { value: 'gemini-3.1-pro-preview', label: 'Gemini 3.1 Pro (推理+视觉)', thinking: true, vision: true },
      { value: 'gemini-3.1-flash-preview', label: 'Gemini 3.1 Flash (视觉)', vision: true },
      { value: 'gemini-3.1-flash-lite-preview', label: 'Gemini 3.1 Flash Lite (视觉)', vision: true },
      { value: 'gemini-3-flash-preview', label: 'Gemini 3 Flash (视觉)', vision: true },
      { value: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro (视觉)', vision: true },
      { value: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash (视觉)', vision: true },
    ],
  },
  claude: {
    label: 'Anthropic Claude',
    vpn: true,
    getKeyUrl: 'https://console.anthropic.com/settings/keys',
    models: [
      { value: 'claude-opus-4-6', label: 'Claude Opus 4.6 (推理+视觉)', thinking: true, vision: true },
      { value: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6 (推理+视觉)', thinking: true, vision: true },
      { value: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5 (视觉)', vision: true },
      { value: 'claude-opus-4-5', label: 'Claude Opus 4.5 (推理+视觉)', thinking: true, vision: true },
      { value: 'claude-sonnet-4-5', label: 'Claude Sonnet 4.5 (推理+视觉)', thinking: true, vision: true },
      { value: 'claude-3-7-sonnet-20250219', label: 'Claude 3.7 Sonnet (推理+视觉)', thinking: true, vision: true },
    ],
  },
  xai: {
    label: 'xAI Grok',
    vpn: true,
    baseUrlHint: 'https://api.x.ai/v1',
    getKeyUrl: 'https://console.x.ai/',
    models: [
      { value: 'grok-4', label: 'Grok-4 旗舰 (视觉)', vision: true },
      { value: 'grok-4.1-fast', label: 'Grok-4.1 Fast 主力 (视觉)', vision: true },
      { value: 'grok-4.20', label: 'Grok-4.20 Multi-Agent (Beta)', vision: true },
      { value: 'grok-3', label: 'Grok-3 (旧版)' },
    ],
  },
  mistral: {
    label: 'Mistral AI',
    vpn: true,
    baseUrlHint: 'https://api.mistral.ai/v1',
    getKeyUrl: 'https://console.mistral.ai/api-keys/',
    models: [
      { value: 'mistral-large-latest', label: 'Mistral Large 旗舰' },
      { value: 'mistral-medium-latest', label: 'Mistral Medium' },
      { value: 'mistral-small-latest', label: 'Mistral Small 轻量' },
      { value: 'codestral-latest', label: 'Codestral 代码旗舰' },
      { value: 'devstral-latest', label: 'Devstral Agent开发 (2026)' },
      { value: 'pixtral-large-latest', label: 'Pixtral Large (视觉)', vision: true },
    ],
  },
}

// ─── Embedding 供应商（向量搜索，用于知识抽取 RAG）────────────────────────────
export const EMBEDDING_PROVIDERS: Record<string, {
  label: string
  vpn: boolean
  getKeyUrl: string
  description: string
}> = {
  qwen_embedding: {
    label: 'Qwen Embedding',
    vpn: false,
    getKeyUrl: 'https://bailian.console.aliyun.com/',
    description: '与通义千问同一个 Key，无需额外申请',
  },
  zhipu_embedding: {
    label: '智谱 Embedding',
    vpn: false,
    getKeyUrl: 'https://open.bigmodel.cn/usercenter/apikeys',
    description: '支持中文语义，效果优秀',
  },
  jina_embedding: {
    label: 'Jina AI Embedding',
    vpn: false,
    getKeyUrl: 'https://jina.ai/',
    description: '国内通常可直连，无需 VPN',
  },
  google_embedding: {
    label: 'Google Embedding',
    vpn: true,
    getKeyUrl: 'https://aistudio.google.com/apikey',
    description: '与 Gemini 同一个 Key，质量高',
  },
  mistral_embedding: {
    label: 'Mistral Embedding',
    vpn: true,
    getKeyUrl: 'https://console.mistral.ai/api-keys/',
    description: '与 Mistral 同一个 Key，适合多语言 RAG',
  },
}

// ─── 特殊工具 Key ──────────────────────────────────────────────────────────────
export const SPECIAL_PROVIDERS: Record<string, {
  label: string
  vpn: boolean
  getKeyUrl: string
  description: string
  placeholder: string
}> = {
  mineru: {
    label: 'MinerU PDF 解析',
    vpn: false,
    getKeyUrl: 'https://mineru.net/',
    description: '用于深度模式和知识抽取，免费注册即可',
    placeholder: 'MinerU API Key（个人中心 → API Key）',
  },
}
