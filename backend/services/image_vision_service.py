"""
图片视觉理解服务 — 将 MinerU 提取的图表转换为文字描述，增强 RAG 检索质量

流程：
  markdown 中的 ![alt](/api/uploads/parsed/stem/images/xxx.jpg)
    ↓ 读取本地图片 → base64 → 调用视觉 LLM
    ↓
  【图表描述】alt：折线图，X轴为时间（2023-2026），Y轴单位元/吨，最高点...

配置（.env）：
  ENABLE_IMAGE_VISION=true          # 开关，默认 true（有可用 key 则自动启用）
  VISION_LLM_PROVIDER=zhipu        # 强制指定 provider，留空则按用户 Key 自动选择
  VISION_LLM_MODEL=glm-4.6         # 可选，留空用各 provider 默认视觉模型
  VISION_LLM_API_KEY=xxx            # 可选，留空则从用户数据库 Key 读取
  VISION_LLM_BASE_URL=https://...   # 可选，OpenAI 兼容接口地址（支持自建中转）

自动检测优先级（国内优先）：
  zhipu (glm-4.6) → qwen (qwen-vl-plus) → openai (gpt-4o) → gemini → claude
"""

import asyncio
import base64
import os
import re
from pathlib import Path
from typing import Optional
from utils.logger import logger
from config import (
    OPENAI_API_KEY, OPENAI_BASE_URL,
    GEMINI_API_KEY, GEMINI_MODEL,
    CLAUDE_API_KEY, CLAUDE_MODEL,
    UPLOAD_DIR,
)

# 匹配 MinerU 生成的绝对 API 路径图片链接
_IMG_RE = re.compile(r'!\[([^\]]*)\]\((/api/uploads/parsed/[^\)]+\.(?:jpg|jpeg|png|webp|gif))\)', re.IGNORECASE)

# 图注特征：图X / Figure X / 表X / 注: / 说明: / Source: 等（出现在图片前后则认为有信息量）
_CAPTION_RE = re.compile(
    r'(图\s*\d+|图\s*[一二三四五六七八九十百]+|figure\s*\d+|fig\.?\s*\d+'
    r'|表\s*\d+|table\s*\d+'
    r'|注[：:。]|说明[：:]|资料来源|数据来源|来源[：:]'
    r'|source\s*[：:/]|chart\s+of|graph\s+of|exhibit\s*\d*'
    r'|bloomberg|reuters|wind|ifinD)',
    re.IGNORECASE,
)
# 检测窗口：图片前后各 300 字符
_CAPTION_WINDOW = 300

_VISION_PROMPT = """请仔细分析这张图表或图片，用中文详细描述以下内容：
1. 图表类型（折线图/柱状图/散点图/热力图/表格等）
2. 标题、坐标轴标签及其含义
3. 关键数据点、趋势方向和变化规律
4. 数据的时间范围、数值区间、单位
5. 极值（最高/最低）及出现时间
6. 图表传达的核心结论或市场信号

请直接输出描述，不要开场白，语言简洁精准，保留具体数字。"""

# 视觉 LLM provider 优先级表（国内优先，型号与 ModelKeyModal.tsx 中 vision:true 对齐）
# call_type: "openai" = OpenAI 兼容接口，"claude" = Anthropic SDK
# 不含 deepseek（无视觉模型）和 minimax（API 无独立视觉模型）
_VISION_PROVIDER_TABLE = [
    # ── 国内直连（按可用性和速度排序）──────────────────────────────────────
    {
        "provider": "zhipu",
        "base_url": "https://open.bigmodel.cn/api/paas/v4",
        "vision_model": "glm-4.6v",              # GLM-4.6V 视觉推理（免费 600万 tokens）
        "call_type": "openai",
    },
    {
        "provider": "qwen",
        "base_url": "https://dashscope.aliyuncs.com/compatible-mode/v1",
        "vision_model": "qwen3-vl-plus",          # Qwen3-VL-Plus API ID（2026-01）
        "call_type": "openai",
    },
    {
        "provider": "doubao",
        "base_url": "https://ark.volcengineapi.com/api/v3",
        "vision_model": "doubao-seed-2.0-lite",   # Seed 2.0 Lite 视觉（UI: doubao-seed-2.0-lite）
        "call_type": "openai",
    },
    {
        "provider": "hunyuan",
        "base_url": "https://api.hunyuan.cloud.tencent.com/v1",
        "vision_model": "hunyuan-vision",         # 混元视觉版（UI: hunyuan-vision）
        "call_type": "openai",
    },
    {
        "provider": "baidu",
        "base_url": "https://aistudio.baidu.com/llm/lmapi/v3",
        "vision_model": "ERNIE-4.5-VL",          # 文心 4.5 视觉版（UI: ERNIE-4.5-VL）
        "call_type": "openai",
    },
    {
        "provider": "kimi",
        "base_url": "https://api.moonshot.cn/v1",
        "vision_model": "kimi-k2.5",             # Kimi K2.5 多模态（UI: kimi-k2.5）
        "call_type": "openai",
    },

    {
        "provider": "sensenova",
        "base_url": "https://api.sensenova.cn/v1",
        "vision_model": "SenseNova-V6.5-Turbo",  # 商汤 V6.5 Turbo 视觉（UI: SenseNova-V6.5-Turbo）
        "call_type": "openai",
    },
    # ── 海外（需要 VPN）────────────────────────────────────────────────────
    {
        "provider": "openai",
        "base_url": "https://api.openai.com/v1",
        "vision_model": "gpt-4o",               # GPT-4o 视觉（UI: gpt-4o）
        "call_type": "openai",
    },
    {
        "provider": "gemini",
        "base_url": "https://generativelanguage.googleapis.com/v1beta/openai/",
        "vision_model": "gemini-3.1-flash-lite-preview",  # 500 RPD 免费（UI: gemini-3.1-flash-lite-preview）
        "call_type": "openai",
    },
    {
        "provider": "claude",
        "base_url": None,
        "vision_model": "claude-sonnet-4-6",     # Claude Sonnet 4.6 视觉（UI: claude-sonnet-4-6）
        "call_type": "claude",
    },
    {
        "provider": "xai",
        "base_url": "https://api.x.ai/v1",
        "vision_model": "grok-4.1-fast",         # Grok-4.1 Fast 视觉（UI: grok-4.1-fast）
        "call_type": "openai",
    },
    {
        "provider": "mistral",
        "base_url": "https://api.mistral.ai/v1",
        "vision_model": "pixtral-large-latest",  # Pixtral Large 视觉（UI: pixtral-large-latest）
        "call_type": "openai",
    },
]


def _is_vision_enabled() -> bool:
    return os.getenv("ENABLE_IMAGE_VISION", "true").lower() not in ("false", "0", "no")


async def _read_image_as_base64(path: Path) -> Optional[str]:
    try:
        with open(path, "rb") as f:
            raw = f.read()
        ext = path.suffix.lower().lstrip(".")
        if ext == "jpg":
            ext = "jpeg"
        b64 = base64.b64encode(raw).decode("utf-8")
        return f"data:image/{ext};base64,{b64}"
    except Exception as e:
        logger.warning(f"[Vision] 读取图片失败 {path}: {e}")
        return None


def _url_to_local_path(api_url: str) -> Optional[Path]:
    """将 /api/uploads/parsed/stem/images/xxx.jpg 转为本地路径"""
    prefix = "/api/uploads/parsed/"
    if api_url.startswith(prefix):
        rel = api_url[len(prefix):]   # stem/images/xxx.jpg
        return UPLOAD_DIR / "parsed" / rel
    return None


async def _get_all_vision_configs(user_id: int = None) -> list:
    """
    收集所有可用的视觉 LLM 配置，按优先级排列，供逐个尝试使用。
    返回 [{api_key, base_url, model, call_type, provider}, ...] 列表（可能为空）。

    优先级：
      1. env 显式配置（最高，放列表首位）
      2. 用户数据库 Key（按 _VISION_PROVIDER_TABLE 顺序）
      3. 全局 env Key（OPENAI / CLAUDE / GEMINI）
    """
    configs = []
    seen_providers = set()

    # 1. env 显式配置
    env_cfg = _get_vision_config_from_env()
    if env_cfg:
        configs.append(env_cfg)
        seen_providers.add(env_cfg["provider"])

    # 2. 数据库 Key（全部扫描）
    if user_id is not None:
        try:
            from database.session_db import session_db
            all_keys = await session_db.get_all_api_keys(user_id)
            key_map = {k["provider"]: k for k in all_keys}
            for entry in _VISION_PROVIDER_TABLE:
                provider = entry["provider"]
                if provider in seen_providers or provider not in key_map:
                    continue
                rec = key_map[provider]
                api_key = (rec.get("api_key") or "").strip()
                if not api_key:
                    continue
                user_base = (rec.get("base_url") or "").rstrip("/")
                configs.append({
                    "api_key": api_key,
                    "base_url": user_base or entry["base_url"],
                    "model": entry["vision_model"],
                    "call_type": entry["call_type"],
                    "provider": provider,
                })
                seen_providers.add(provider)
        except Exception as e:
            logger.warning(f"[Vision] 读取数据库 Key 失败: {e}")

    return configs


def _get_vision_config_from_env() -> Optional[dict]:
    """从环境变量读取视觉 LLM 配置（兼容旧行为 + 全局 env 配置）"""
    explicit_provider = os.getenv("VISION_LLM_PROVIDER", "").lower()
    explicit_key = os.getenv("VISION_LLM_API_KEY", "")
    explicit_url = os.getenv("VISION_LLM_BASE_URL", "")
    explicit_model = os.getenv("VISION_LLM_MODEL", "")

    # 有显式 key 或 provider 配置时，直接组装
    if explicit_key or explicit_provider:
        provider = explicit_provider or "openai"
        # 找到对应 provider 的默认配置
        default_entry = next((e for e in _VISION_PROVIDER_TABLE if e["provider"] == provider), _VISION_PROVIDER_TABLE[2])
        call_type = default_entry["call_type"]
        base_url = explicit_url or default_entry["base_url"] or ""
        model = explicit_model or default_entry["vision_model"]
        api_key = explicit_key
        if not api_key:
            # 从对应的全局 env key 获取
            _ENV_KEY_MAP = {
                "openai": OPENAI_API_KEY,
                "gemini": GEMINI_API_KEY,
                "claude": CLAUDE_API_KEY,
            }
            api_key = _ENV_KEY_MAP.get(provider, "")
        if api_key:
            return {"api_key": api_key, "base_url": base_url, "model": model, "call_type": call_type, "provider": provider}

    # 无显式配置时，按优先级检查全局 key
    if OPENAI_API_KEY:
        return {
            "api_key": OPENAI_API_KEY,
            "base_url": OPENAI_BASE_URL or "https://api.openai.com/v1",
            "model": explicit_model or "gpt-4o",
            "call_type": "openai",
            "provider": "openai",
        }
    if CLAUDE_API_KEY:
        return {
            "api_key": CLAUDE_API_KEY,
            "base_url": None,
            "model": explicit_model or CLAUDE_MODEL or "claude-3-5-sonnet-20241022",
            "call_type": "claude",
            "provider": "claude",
        }
    if GEMINI_API_KEY:
        return {
            "api_key": GEMINI_API_KEY,
            "base_url": "https://generativelanguage.googleapis.com/v1beta/openai/",
            "model": explicit_model or GEMINI_MODEL or "gemini-1.5-flash",
            "call_type": "openai",
            "provider": "gemini",
        }
    return None


async def _call_openai_compat_vision(image_b64: str, alt_text: str, api_key: str, base_url: str, model: str) -> str:
    """调用 OpenAI 兼容接口进行图片理解（支持 OpenAI / 智谱 / 通义 / Gemini 等）"""
    from openai import AsyncOpenAI
    client = AsyncOpenAI(api_key=api_key, base_url=base_url, timeout=90.0)
    prompt = (f"图片标题参考：{alt_text}\n\n" if alt_text else "") + _VISION_PROMPT
    resp = await client.chat.completions.create(
        model=model,
        messages=[{
            "role": "user",
            "content": [
                {"type": "text", "text": prompt},
                {"type": "image_url", "image_url": {"url": image_b64, "detail": "high"}},
            ],
        }],
        max_tokens=700,
    )
    content = resp.choices[0].message.content.strip()
    if not content:
        raise ValueError(f"模型返回空内容 (model={model})")
    return content


async def _call_claude_vision(image_b64: str, alt_text: str, api_key: str, model: str) -> str:
    """调用 Claude API 进行图片理解"""
    import anthropic
    media_type = image_b64.split(";")[0].split(":")[1]  # image/jpeg
    b64_data = image_b64.split(",", 1)[1]
    client = anthropic.AsyncAnthropic(api_key=api_key)
    prompt = (f"图片标题参考：{alt_text}\n\n" if alt_text else "") + _VISION_PROMPT
    resp = await client.messages.create(
        model=model,
        max_tokens=700,
        messages=[{
            "role": "user",
            "content": [
                {"type": "image", "source": {"type": "base64", "media_type": media_type, "data": b64_data}},
                {"type": "text", "text": prompt},
            ],
        }],
    )
    content = resp.content[0].text.strip()
    if not content:
        raise ValueError(f"模型返回空内容 (model={model})")
    return content


async def _describe_image(image_path: Path, alt_text: str, configs: list) -> Optional[str]:
    """
    对单张图片调用视觉 LLM，自动降级重试。
    按 configs 顺序逐个尝试，某个 provider 失败则记录日志并换下一个。
    全部失败返回 None。
    """
    image_b64 = await _read_image_as_base64(image_path)
    if not image_b64:
        return None

    for config in configs:
        provider = config.get("provider", "unknown")
        try:
            if config["call_type"] == "claude":
                result = await _call_claude_vision(image_b64, alt_text, config["api_key"], config["model"])
            else:
                result = await _call_openai_compat_vision(
                    image_b64, alt_text, config["api_key"], config["base_url"], config["model"]
                )
            logger.info(f"[Vision] ✅ {provider}/{config['model']} 调用成功")
            return result
        except Exception as e:
            logger.warning(
                f"[Vision] ❌ {provider}/{config['model']} 调用失败: {e}"
                + (f" → 尝试下一个 provider: {configs[configs.index(config)+1]['provider']}"
                   if configs.index(config) + 1 < len(configs) else " → 已无可用 provider")
            )
    return None


async def enrich_markdown_with_vision(markdown: str, stem: str, user_id: int = None, max_concurrent: int = 3) -> str:
    """
    将 MinerU markdown 中的图片链接替换为视觉 LLM 描述（用于 RAG 索引）。

    优先级：
      1. env VISION_LLM_* 显式配置
      2. 用户数据库中配置的 API Key（按 zhipu→qwen→openai→gemini→claude 顺序）
      3. 全局 env OPENAI_API_KEY / CLAUDE_API_KEY / GEMINI_API_KEY

    若 ENABLE_IMAGE_VISION=false，或找不到任何可用 key，则回退到保留 alt text（去掉无效 URL）。
    """
    matches = list(_IMG_RE.finditer(markdown))
    if not matches:
        return markdown

    def _fallback_alt(md: str) -> str:
        """无 vision 时：去掉 URL，保留 alt text 供 RAG 语义检索"""
        def _keep_alt(m: re.Match) -> str:
            alt = m.group(1).strip()
            return f"【图表】{alt}" if alt else ""
        return _IMG_RE.sub(_keep_alt, md)

    if not _is_vision_enabled():
        return _fallback_alt(markdown)

    # 收集所有可用配置（env 优先 → DB 按优先级排列）
    configs = await _get_all_vision_configs(user_id)
    if not configs:
        logger.warning("[Vision] 未找到任何可用的视觉 LLM Key，回退到保留 alt text（RAG 仍可检索图表标题）")
        return _fallback_alt(markdown)

    provider_list = " → ".join(f"{c['provider']}/{c['model']}" for c in configs)
    logger.info(f"🖼️ [Vision] 开始处理 {len(matches)} 张图片 | stem={stem}")
    logger.info(f"🖼️ [Vision] 可用 provider 链: {provider_list}")
    semaphore = asyncio.Semaphore(max_concurrent)

    min_size_kb = float(os.getenv("VISION_MIN_FILE_SIZE_KB", "15"))
    min_size_bytes = min_size_kb * 1024

    def _extract_context(m: re.Match) -> str:
        """
        从图片前后 ±300 字符窗口提取标题、来源等上下文文字。
        去掉 markdown 标记（#、![]()、** 等），合并连续空白，返回纯文本。
        """
        start = max(0, m.start() - _CAPTION_WINDOW)
        end = min(len(markdown), m.end() + _CAPTION_WINDOW)
        window = markdown[start:end]
        # 去掉当前图片自身的 markdown 标记，避免把 URL 带进去
        window = markdown[start:m.start()] + markdown[m.end():end]
        # 去掉其他图片链接
        window = _IMG_RE.sub("", window)
        # 去掉 markdown 标题符号、加粗等
        window = re.sub(r'[#*`>]+', '', window)
        # 合并空白
        window = re.sub(r'\s+', ' ', window).strip()
        return window[:400]  # 最多 400 字符送给模型

    async def process_one(m: re.Match) -> tuple:
        alt, url = m.group(1).strip(), m.group(2)
        async with semaphore:
            local_path = _url_to_local_path(url)
            if local_path is None:
                logger.warning(f"[Vision] ⚠️ 无法解析图片路径，跳过: {url[:80]}")
                return m.start(), m.end(), f"【图表】{alt}" if alt else ""
            if not local_path.exists():
                logger.warning(f"[Vision] ⚠️ 图片文件不存在（MinerU 未保存该图）: {local_path.name}")
                return m.start(), m.end(), f"【图表】{alt}" if alt else ""
            # 过滤：文件太小，跳过（通常为 logo / 图标 / 装饰图）
            file_size = local_path.stat().st_size
            if file_size < min_size_bytes:
                logger.info(f"[Vision] ⏭️ 跳过小图片 ({file_size/1024:.1f} KB < {min_size_kb} KB): {local_path.name}")
                return m.start(), m.end(), f"【图表】{alt}" if alt else ""
            # 提取周围上下文（标题、来源等）拼入 alt_text 送给模型
            surrounding = _extract_context(m)
            context_for_model = " | ".join(filter(None, [alt, surrounding])) if surrounding else alt
            desc = await _describe_image(local_path, context_for_model, configs)
            if desc:
                label = alt or surrounding[:60] or ""
                replacement = f"【图表描述】{label}：{desc}" if label else f"【图表描述】{desc}"
                return m.start(), m.end(), replacement
            # 所有 provider 均返回空内容
            logger.warning(f"[Vision] ⚠️ 所有 provider 均返回空描述，降级保留标题: {local_path.name} | alt={alt[:40]!r}")
            return m.start(), m.end(), f"【图表】{alt}" if alt else ""

    results = await asyncio.gather(*[process_one(m) for m in matches])

    # 从后往前替换（避免偏移量变化）
    parts = list(markdown)
    for start, end, replacement in sorted(results, key=lambda x: x[0], reverse=True):
        parts[start:end] = list(replacement)

    enriched = "".join(parts)
    logger.info(f"✅ [Vision] 图表视觉理解完成: {stem}")
    return enriched
