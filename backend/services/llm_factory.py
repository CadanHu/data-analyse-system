import os
import traceback
from typing import Optional, Any
from langchain_openai import ChatOpenAI
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_anthropic import ChatAnthropic
from openai import AsyncOpenAI

from config import (
    API_KEY, API_BASE_URL, CHAT_MODEL, 
    OPENAI_API_KEY, OPENAI_BASE_URL, OPENAI_MODEL,
    GEMINI_API_KEY, GEMINI_MODEL,
    CLAUDE_API_KEY, CLAUDE_MODEL,
    ModelProvider, DEFAULT_PROVIDER
)

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
        instance_key = f"lc_{provider}_{model_name}_{temperature}_{streaming}"
        
        if instance_key not in cls._instances:
            print(f"📡 [LLMFactory] 正在初始化 {provider} 模型 (model={model_name})...")
            try:
                if provider == ModelProvider.DEEPSEEK:
                    cls._instances[instance_key] = ChatOpenAI(
                        model=model_name or CHAT_MODEL,
                        openai_api_key=API_KEY,
                        openai_api_base=API_BASE_URL,
                        temperature=temperature,
                        streaming=streaming
                    )
                elif provider == ModelProvider.OPENAI:
                    cls._instances[instance_key] = ChatOpenAI(
                        model=model_name or OPENAI_MODEL,
                        openai_api_key=OPENAI_API_KEY,
                        openai_api_base=OPENAI_BASE_URL,
                        temperature=temperature,
                        streaming=streaming
                    )
                elif provider == ModelProvider.GEMINI:
                    cls._instances[instance_key] = ChatGoogleGenerativeAI(
                        model=model_name or GEMINI_MODEL,
                        google_api_key=GEMINI_API_KEY,
                        temperature=temperature,
                        streaming=streaming
                    )
                elif provider == ModelProvider.CLAUDE:
                    cls._instances[instance_key] = ChatAnthropic(
                        model=model_name or CLAUDE_MODEL,
                        anthropic_api_key=CLAUDE_API_KEY,
                        temperature=temperature,
                        streaming=streaming
                    )
                else:
                    raise ValueError(f"不支持的供应商: {provider}")
                
                print(f"✅ [LLMFactory] {provider} 实例创建成功")
            except Exception as e:
                print(f"❌ [LLMFactory] 初始化 {provider} 失败: {str(e)}")
                traceback.print_exc()
                # 容错：回退到 DeepSeek
                if provider != ModelProvider.DEEPSEEK:
                    return cls.get_langchain_model(ModelProvider.DEEPSEEK, temperature=temperature, streaming=streaming)
                raise e
        
        return cls._instances[instance_key]

    @classmethod
    def get_openai_client(cls, provider: str = None) -> AsyncOpenAI:
        """
        获取 AsyncOpenAI 兼容的原生客户端
        """
        provider = provider or DEFAULT_PROVIDER
        if provider not in cls._openai_clients:
            if provider == ModelProvider.DEEPSEEK:
                cls._openai_clients[provider] = AsyncOpenAI(
                    api_key=API_KEY,
                    base_url=API_BASE_URL
                )
            elif provider == ModelProvider.OPENAI:
                cls._openai_clients[provider] = AsyncOpenAI(
                    api_key=OPENAI_API_KEY,
                    base_url=OPENAI_BASE_URL
                )
            else:
                # 其他供应商暂时不支持直接使用 OpenAI 客户端
                # 如果需要支持，可以根据其 API 协议进行封装
                raise ValueError(f"供应商 {provider} 不支持原生 OpenAI 客户端调用")
        
        return cls._openai_clients[provider]

    @classmethod
    def get_model_params(cls, provider: str, is_reasoning: bool = False) -> dict:
        """
        根据供应商获取默认模型参数
        """
        if provider == ModelProvider.DEEPSEEK:
            from config import REASONER_MODEL, CHAT_MODEL
            return {"model": REASONER_MODEL if is_reasoning else CHAT_MODEL}
        elif provider == ModelProvider.OPENAI:
            return {"model": OPENAI_MODEL}
        elif provider == ModelProvider.GEMINI:
            return {"model": GEMINI_MODEL}
        elif provider == ModelProvider.CLAUDE:
            return {"model": CLAUDE_MODEL}
        return {"model": CHAT_MODEL}

llm_factory = LLMFactory()
