import os
import traceback
from typing import Optional, Any
import httpx
from langchain_openai import ChatOpenAI
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_anthropic import ChatAnthropic
from openai import AsyncOpenAI

# 流式请求超时：connect 5s，read 1800s（30分钟）
_STREAM_TIMEOUT = httpx.Timeout(1800.0, connect=5.0)

from config import (
    API_KEY, API_BASE_URL, CHAT_MODEL,
    OPENAI_API_KEY, OPENAI_BASE_URL, OPENAI_MODEL,
    GEMINI_API_KEY, GEMINI_MODEL,
    CLAUDE_API_KEY, CLAUDE_MODEL,
    ModelProvider, DEFAULT_PROVIDER
)
from services.user_context import get_user_api_key, get_user_base_url

class LLMFactory:
    """
    LLM 实例工厂类 (单例 + 延迟加载)
    支持 LangChain 实例和原生 OpenAI 异步客户端
    """
    _instances = {}
    _openai_clients = {}

    @classmethod
    def get_langchain_model(
        cls, 
        provider: str = None, 
        model_name: str = None, 
        temperature: float = 0.1,
        streaming: bool = False
    ) -> Any:
        """
        获取 LangChain 兼容的 LLM 实例
        """
        provider = provider or DEFAULT_PROVIDER

        # 🔑 优先使用用户在当前请求中设置的 API Key (通过 ContextVar 传入)
        user_api_key = get_user_api_key(provider)
        user_base_url = get_user_base_url(provider)

        # 如果用户提供了自定义 Key，不走缓存，每次新建实例
        if user_api_key:
            return cls._build_langchain_model(
                provider, model_name, temperature, streaming,
                api_key=user_api_key, base_url=user_base_url
            )

        instance_key = f"lc_{provider}_{model_name}_{temperature}_{streaming}"

        if instance_key not in cls._instances:
            cls._instances[instance_key] = cls._build_langchain_model(
                provider, model_name, temperature, streaming
            )

        return cls._instances[instance_key]

    @classmethod
    def _build_langchain_model(
        cls,
        provider: str,
        model_name: str = None,
        temperature: float = 0.1,
        streaming: bool = False,
        api_key: str = None,
        base_url: str = None,
    ) -> Any:
        """实际构建 LangChain 模型实例 (内部方法)"""
        print(f"📡 [LLMFactory] 正在初始化 {provider} 模型 (model={model_name}, custom_key={bool(api_key)})...")
        try:
            if provider == ModelProvider.DEEPSEEK:
                return ChatOpenAI(
                    model=model_name or CHAT_MODEL,
                    openai_api_key=api_key or API_KEY,
                    openai_api_base=base_url or API_BASE_URL,
                    temperature=temperature,
                    streaming=streaming
                )
            elif provider == ModelProvider.OPENAI:
                return ChatOpenAI(
                    model=model_name or OPENAI_MODEL,
                    openai_api_key=api_key or OPENAI_API_KEY,
                    openai_api_base=base_url or OPENAI_BASE_URL,
                    temperature=temperature,
                    streaming=streaming
                )
            elif provider == ModelProvider.GEMINI:
                return ChatGoogleGenerativeAI(
                    model=model_name or GEMINI_MODEL,
                    google_api_key=api_key or GEMINI_API_KEY,
                    temperature=temperature,
                    streaming=streaming
                )
            elif provider == ModelProvider.CLAUDE:
                return ChatAnthropic(
                    model=model_name or CLAUDE_MODEL,
                    anthropic_api_key=api_key or CLAUDE_API_KEY,
                    temperature=temperature,
                    streaming=streaming
                )
            else:
                # 通用 OpenAI 兼容 provider
                _DEFAULT_BASE_URLS = {
                    # 国内直连
                    "zhipu":     "https://open.bigmodel.cn/api/paas/v4",
                    "qwen":      "https://dashscope.aliyuncs.com/compatible-mode/v1",
                    "minimax":   "https://api.minimax.chat/v1",
                    "kimi":      "https://api.moonshot.cn/v1",
                    "doubao":    "https://ark.volcengineapi.com/api/v3",
                    "hunyuan":   "https://api.hunyuan.cloud.tencent.com/v1",
                    "baidu":     "https://aistudio.baidu.com/llm/lmapi/v3",
                    "sensenova": "https://api.sensenova.cn/v1",
                    # 需要VPN
                    "xai":       "https://api.x.ai/v1",
                    "mistral":   "https://api.mistral.ai/v1",
                }
                _DEFAULT_MODELS = {
                    "zhipu":     "glm-4-flash",
                    "qwen":      "qwen3-max",
                    "minimax":   "MiniMax-M2.5",
                    "kimi":      "moonshot-v1-128k",
                    "doubao":    "doubao-seed-2.0-lite",
                    "hunyuan":   "hunyuan-standard",
                    "baidu":     "ERNIE-4.5",
                    "sensenova": "SenseNova-V6.5-Turbo",
                    "xai":       "grok-4.1-fast",
                    "mistral":   "mistral-large-latest",
                }
                resolved_base_url = base_url or _DEFAULT_BASE_URLS.get(provider)
                if api_key and resolved_base_url:
                    return ChatOpenAI(
                        model=model_name or _DEFAULT_MODELS.get(provider, "unknown"),
                        openai_api_key=api_key,
                        openai_api_base=resolved_base_url,
                        temperature=temperature,
                        streaming=streaming
                    )
                raise ValueError(f"不支持的供应商: {provider}")
        except Exception as e:
            print(f"❌ [LLMFactory] 初始化 {provider} 失败: {str(e)}")
            traceback.print_exc()
            # 容错：回退到 DeepSeek
            if provider != ModelProvider.DEEPSEEK:
                return cls.get_langchain_model(ModelProvider.DEEPSEEK, temperature=temperature, streaming=streaming)
            raise e

    @classmethod
    def get_openai_client(cls, provider: str = None) -> AsyncOpenAI:
        """
        获取 AsyncOpenAI 兼容的原生客户端
        优先使用用户自定义 API Key (通过 ContextVar 传入)
        """
        provider = provider or DEFAULT_PROVIDER
        user_api_key = get_user_api_key(provider)
        user_base_url = get_user_base_url(provider)

        # 所有 OpenAI 兼容供应商的默认 base URL
        _OAI_COMPAT_URLS = {
            ModelProvider.DEEPSEEK: API_BASE_URL,
            ModelProvider.OPENAI:   OPENAI_BASE_URL or "https://api.openai.com/v1",
            "zhipu":     "https://open.bigmodel.cn/api/paas/v4",
            "qwen":      "https://dashscope.aliyuncs.com/compatible-mode/v1",
            "minimax":   "https://api.minimax.chat/v1",
            "kimi":      "https://api.moonshot.cn/v1",
            "doubao":    "https://ark.volcengineapi.com/api/v3",
            "hunyuan":   "https://api.hunyuan.cloud.tencent.com/v1",
            "baidu":     "https://aistudio.baidu.com/llm/lmapi/v3",

            "sensenova": "https://api.sensenova.cn/v1",
            "xai":       "https://api.x.ai/v1",
            "mistral":   "https://api.mistral.ai/v1",
        }

        # 用户自定义 Key：不走缓存，直接构建
        if user_api_key:
            resolved_url = user_base_url or _OAI_COMPAT_URLS.get(provider)
            if resolved_url:
                return AsyncOpenAI(api_key=user_api_key, base_url=resolved_url, timeout=_STREAM_TIMEOUT)
            raise ValueError(f"供应商 {provider} 不支持原生 OpenAI 客户端调用")

        if provider not in cls._openai_clients:
            if provider == ModelProvider.DEEPSEEK:
                cls._openai_clients[provider] = AsyncOpenAI(
                    api_key=API_KEY,
                    base_url=API_BASE_URL,
                    timeout=_STREAM_TIMEOUT
                )
            elif provider == ModelProvider.OPENAI:
                cls._openai_clients[provider] = AsyncOpenAI(
                    api_key=OPENAI_API_KEY,
                    base_url=OPENAI_BASE_URL,
                    timeout=_STREAM_TIMEOUT
                )
            else:
                raise ValueError(f"供应商 {provider} 未配置系统级 API Key，请用户自行配置")

        return cls._openai_clients[provider]

    @classmethod
    def get_model_params(cls, provider: str, is_reasoning: bool = False) -> dict:
        """
        根据供应商获取默认模型参数
        """
        if provider == ModelProvider.DEEPSEEK:
            from config import REASONER_MODEL
            return {"model": REASONER_MODEL if is_reasoning else CHAT_MODEL}
        elif provider == ModelProvider.OPENAI:
            return {"model": OPENAI_MODEL}
        elif provider == ModelProvider.GEMINI:
            return {"model": GEMINI_MODEL}
        elif provider == ModelProvider.CLAUDE:
            return {"model": CLAUDE_MODEL}
        _PROVIDER_DEFAULTS = {
            "zhipu":     "glm-4-flash",
            "qwen":      "qwen3-max",
            "minimax":   "MiniMax-M2.5",
            "kimi":      "moonshot-v1-128k",
            "doubao":    "doubao-seed-2.0-lite",
            "hunyuan":   "hunyuan-standard",
            "baidu":     "ERNIE-4.5",

            "sensenova": "SenseNova-V6.5-Turbo",
            "xai":       "grok-4.1-fast",
            "mistral":   "mistral-large-latest",
        }
        if provider in _PROVIDER_DEFAULTS:
            return {"model": _PROVIDER_DEFAULTS[provider]}
        return {"model": CHAT_MODEL}

llm_factory = LLMFactory()
