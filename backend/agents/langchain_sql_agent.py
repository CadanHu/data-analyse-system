"""
LangChain SQL Agent 核心模块
使用 LangChain 替代手写的 SQL Agent
LangChain 1.0+ 版本
"""
import json
import re
from typing import Dict, Any, Optional, List, AsyncGenerator
from pathlib import Path

from langchain_community.utilities import SQLDatabase
from langchain_community.agent_toolkits.sql.base import create_sql_agent
from langchain_openai import ChatOpenAI
from langchain_core.prompts import PromptTemplate

from config import (
    API_KEY,
    API_BASE_URL,
    MODEL_NAME,
    MAX_RETRY_COUNT,
    LANGCHAIN_TRACING_V2,
    LANGCHAIN_API_KEY,
    LANGCHAIN_PROJECT
)
from utils.prompt_templates import SQL_GENERATION_PROMPT


class LangChainSQLAgent:
    def __init__(self, db_path: Path):
        """
        初始化 LangChain SQL Agent
        
        Args:
            db_path: SQLite 数据库文件路径
        """
        self.db_path = db_path
        
        # 初始化数据库连接
        db_uri = f"sqlite:///{db_path}"
        self.db = SQLDatabase.from_uri(db_uri)
        
        # 初始化 LLM
        self.llm = ChatOpenAI(
            model=MODEL_NAME,
            base_url=API_BASE_URL,
            api_key=API_KEY,
            temperature=0.1,
            streaming=True
        )
        
        # 创建 SQL Agent (LangChain 1.0+ 版本)
        self.agent_executor = create_sql_agent(
            llm=self.llm,
            db=self.db,
            agent_type="openai-tools",
            verbose=True,
            agent_executor_kwargs={
                "max_iterations": 3,
                "early_stopping_method": "generate"
            }
        )
        
        print(f"✅ LangChainSQLAgent 初始化完成 (LangChain 1.0+): db_path={db_path}")
    
    async def generate_sql(
        self,
        question: str,
        schema: str,
        history: str = "",
        database_name: str = "业务数据库"
    ) -> Dict[str, Any]:
        """
        生成 SQL 查询（非流式）
        
        Args:
            question: 用户问题
            schema: 数据库 schema
            history: 对话历史
            database_name: 数据库名称
            
        Returns:
            包含 sql、chart_type、reasoning 的字典
        """
        try:
            # 构建提示词
            prompt = self._build_prompt(question, schema, history, database_name)
            
            # 调用 Agent
            response = await self.agent_executor.ainvoke({
                "input": prompt
            })
            
            # 解析响应
            result = self._parse_response(response["output"])
            
            return result
        except Exception as e:
            print(f"❌ LangChainSQLAgent 生成 SQL 失败: {str(e)}")
            import traceback
            traceback.print_exc()
            return {
                "sql": "",
                "chart_type": "table",
                "reasoning": f"生成失败: {str(e)}"
            }
    
    async def generate_sql_stream(
        self,
        question: str,
        schema: str,
        history: str = "",
        enable_thinking: bool = False,
        database_name: str = "业务数据库"
    ) -> AsyncGenerator[Dict[str, Any], None]:
        """
        生成 SQL 查询（流式输出）
        
        Args:
            question: 用户问题
            schema: 数据库 schema
            history: 对话历史
            enable_thinking: 是否启用思考模式
            database_name: 数据库名称
            
        Yields:
            流式事件:
            - {"type": "reasoning", "content": "..."}
            - {"type": "content", "content": "..."}
            - {"type": "done", "result": {...}}
        """
        try:
            # 构建提示词
            prompt = self._build_prompt(question, schema, history, database_name)
            
            print(f"📤 发送到 LangChain Agent 的提示词: {prompt[:200]}...")
            
            # 使用流式调用
            full_content = ""
            full_reasoning = ""
            
            # 注意：LangChain 1.0+ 的 AgentExecutor 使用不同的事件格式
            # 我们先使用非流式调用，然后模拟流式输出
            # 这样可以确保兼容性
            response = await self.agent_executor.ainvoke({
                "input": prompt
            })
            
            full_content = response["output"]
            
            # 模拟流式输出
            for i in range(0, len(full_content), 10):
                chunk = full_content[i:i+10]
                yield {"type": "content", "content": chunk}
            
            # 解析最终结果
            result = self._parse_response(full_content)
            
            yield {"type": "done", "result": result}
            
        except Exception as e:
            print(f"❌ LangChainSQLAgent 流式生成 SQL 失败: {str(e)}")
            import traceback
            traceback.print_exc()
            yield {"type": "done", "result": {
                "sql": "",
                "chart_type": "table",
                "reasoning": f"生成失败: {str(e)}"
            }}
    
    def _build_prompt(
        self,
        question: str,
        schema: str,
        history: str,
        database_name: str
    ) -> str:
        """
        构建提示词
        """
        prompt = SQL_GENERATION_PROMPT.format(
            database_name=database_name,
            schema=schema,
            history=history,
            question=question
        )
        return prompt
    
    def _parse_response(self, content: str) -> Dict[str, Any]:
        """
        解析 Agent 响应，提取 SQL 和图表类型
        
        Args:
            content: Agent 输出内容
            
        Returns:
            包含 sql、chart_type、reasoning 的字典
        """
        try:
            # 尝试从内容中提取 JSON
            json_match = re.search(r'\{[\s\S]*\}', content)
            if json_match:
                json_str = json_match.group(0)
                return json.loads(json_str)
            
            # 如果没有找到 JSON，尝试直接解析
            return json.loads(content)
        except Exception:
            # 如果解析失败，尝试从内容中提取 SQL
            sql = self._extract_sql(content)
            
            # 尝试确定图表类型
            chart_type = self._determine_chart_type(content)
            
            return {
                "sql": sql,
                "chart_type": chart_type,
                "reasoning": content
            }
    
    def _extract_sql(self, content: str) -> str:
        """
        从文本中提取 SQL
        """
        # 查找 ```sql ... ``` 格式
        sql_match = re.search(r'```sql\s*([\s\S]*?)\s*```', content)
        if sql_match:
            return sql_match.group(1).strip()
        
        # 查找 SELECT 开头的语句
        select_match = re.search(r'(SELECT[\s\S]*?);?\s*$', content, re.IGNORECASE)
        if select_match:
            return select_match.group(1).strip()
        
        return ""
    
    def _determine_chart_type(self, content: str) -> str:
        """
        根据内容确定图表类型
        """
        content_lower = content.lower()
        
        if any(keyword in content_lower for keyword in ["饼图", "pie", "占比", "构成"]):
            return "pie"
        elif any(keyword in content_lower for keyword in ["折线", "line", "趋势", "变化"]):
            return "line"
        elif any(keyword in content_lower for keyword in ["柱状", "bar", "对比", "排名"]):
            return "bar"
        else:
            return "table"


# 全局 Agent 实例缓存（按数据库路径）
_agent_cache: Dict[str, LangChainSQLAgent] = {}


def get_langchain_sql_agent(db_path: Path) -> LangChainSQLAgent:
    """
    获取 LangChain SQL Agent 实例（带缓存）
    
    Args:
        db_path: 数据库文件路径
        
    Returns:
        LangChainSQLAgent 实例
    """
    db_path_str = str(db_path)
    
    if db_path_str not in _agent_cache:
        _agent_cache[db_path_str] = LangChainSQLAgent(db_path)
    
    return _agent_cache[db_path_str]
