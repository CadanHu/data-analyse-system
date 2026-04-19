import { PROVIDER_MODELS } from './providerCatalog'

export interface SavedKeyLike {
  provider: string
  model_name?: string | null
  has_key?: boolean
}

export interface PickedModel {
  provider: string
  model: string
}

// 判断某个 provider+model 是否"思考模型"
export function isThinkingModel(provider: string | null | undefined, model: string | null | undefined): boolean {
  if (!provider || !model) return false
  const spec = PROVIDER_MODELS[provider]
  if (!spec) return false
  const m = spec.models.find(x => x.value === model)
  return !!m?.thinking
}

// 有无该 provider 的 key
function hasKey(savedKeys: SavedKeyLike[], provider: string): boolean {
  return savedKeys.some(k => k.provider === provider && (k.has_key !== false))
}

// 在某个 provider 内部找 thinking === wantsThinking 的首个模型
function firstModelInProvider(provider: string, wantsThinking: boolean): string | null {
  const spec = PROVIDER_MODELS[provider]
  if (!spec) return null
  // 排除纯视频/图像/音频/embedding 类模型（它们不适合当聊天主力）
  const chatish = spec.models.filter(m => !/^(hailuo|speech|music|seedream|seedance|glm-ocr)/i.test(m.value))
  const hit = chatish.find(m => !!m.thinking === wantsThinking)
  return hit?.value ?? null
}

/**
 * 根据"是否需要思考 + 已配 key"自动挑选模型。
 *
 * 规则：
 * 1. 当前 provider 已有 key，且当前模型本身就满足要求 → 不动
 * 2. 当前 provider 已有 key，但模型不对 → 同 provider 内换首个匹配模型
 * 3. 跨 provider：国内直连优先（vpn=false），再 vpn=true，找首个能提供匹配模型的 provider
 * 4. 全失败 → 返回 null（调用方应提示用户）
 */
export function pickModelForMode(
  savedKeys: SavedKeyLike[],
  currentProvider: string | null | undefined,
  currentModel: string | null | undefined,
  wantsThinking: boolean
): PickedModel | null {
  // 1 & 2：留在当前 provider
  if (currentProvider && hasKey(savedKeys, currentProvider) && PROVIDER_MODELS[currentProvider]) {
    if (currentModel && isThinkingModel(currentProvider, currentModel) === wantsThinking) {
      return { provider: currentProvider, model: currentModel }
    }
    const alt = firstModelInProvider(currentProvider, wantsThinking)
    if (alt) return { provider: currentProvider, model: alt }
  }

  // 3：跨 provider，国内优先
  const ordered = Object.entries(PROVIDER_MODELS).sort(([, a], [, b]) => Number(a.vpn) - Number(b.vpn))
  for (const [prov] of ordered) {
    if (!hasKey(savedKeys, prov)) continue
    const m = firstModelInProvider(prov, wantsThinking)
    if (m) return { provider: prov, model: m }
  }

  return null
}
