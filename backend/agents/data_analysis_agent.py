"""
基于 LangGraph 的数据分析 Agent
支持多步推理、工具调用
"""
from typing import Annotated, TypedDict, List, Dict, Any, Optional
from langchain_core.tools import tool
from langchain_core.messages import HumanMessage, AIMessage, SystemMessage
from langchain_openai import ChatOpenAI
from langgraph.graph import StateGraph, END, START
from langgraph.graph.message import add_messages
from langgraph.prebuilt import ToolNode
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from config import API_KEY, API_BASE_URL, MODEL_NAME
from databases.database_manager import DatabaseManager
from services.sql_executor import SQLExecutor


class AgentState(TypedDict):
    """Agent 状态"""
    messages: Annotated[List, add_messages]
    database_key: str
    sql_result: Optional[List[Dict[str, Any]]]
    chart_config: Optional[Dict[str, Any]]
    final_answer: Optional[str]


@tool
def sql_query_tool(query: str) -> str:
    """
    执行 SQL 查询并返回结果
    
    Args:
        query: 要执行的 SQL 查询语句（只允许 SELECT）
        
    Returns:
        查询结果的 JSON 字符串
    """
    import json
    try:
        from config import DATABASE_DIR
        db_path = DATABASE_DIR / "business.db"
        executor = SQLExecutor(str(db_path))
        results = executor.execute(query)
        return json.dumps(results, ensure_ascii=False, default=str)
    except Exception as e:
        return f"查询错误: {str(e)}"


@tool
def get_database_schema() -> str:
    """
    获取当前数据库的表结构信息
    
    Returns:
        数据库表结构的描述
    """
    from services.schema_service import SchemaService
    from config import DATABASE_DIR
    db_path = DATABASE_DIR / "business.db"
    schema_service = SchemaService(str(db_path))
    tables = schema_service.get_tables()
    
    schema_info = []
    for table in tables:
        columns = schema_service.get_table_schema(table)
        col_info = ", ".join([f"{col['name']}({col['type']})" for col in columns])
        schema_info.append(f"表 {table}: {col_info}")
    
    return "\n".join(schema_info)


class DataAnalysisAgent:
    """基于 LangGraph 的数据分析 Agent"""

    def __init__(self, db_key: str = "business"):
        self.db_key = db_key
        self.tools = [sql_query_tool, get_database_schema]
        
        self.llm = ChatOpenAI(
            model=MODEL_NAME,
            base_url=API_BASE_URL,
            api_key=API_KEY,
            temperature=0.1
        )
        
        self.llm_with_tools = self.llm.bind_tools(self.tools)
        self.graph = self._build_graph()

    def _build_graph(self) -> StateGraph:
        """构建 LangGraph 状态图"""
        
        def agent_node(state: AgentState):
            """Agent 决策节点"""
            messages = state["messages"]
            
            system_prompt = SystemMessage(content="""你是一个专业的数据分析助手。请按照以下步骤工作：
1. 首先使用 get_database_schema 工具了解数据库结构
2. 根据用户问题，使用 sql_query_tool 执行 SQL 查询（只允许 SELECT 语句）
3. 基于查询结果，生成最终的数据分析报告

注意事项：
- 只执行 SELECT 查询，禁止修改数据
- 如果查询失败，尝试调整查询语句
- 最终答案要包含数据洞察和建议""")
            
            all_messages = [system_prompt] + messages
            response = self.llm_with_tools.invoke(all_messages)
            return {"messages": [response]}

        def should_continue(state: AgentState):
            """判断是否继续执行工具"""
            messages = state["messages"]
            last_message = messages[-1]
            if hasattr(last_message, "tool_calls") and last_message.tool_calls:
                return "tools"
            return END

        tool_node = ToolNode(self.tools)
        
        workflow = StateGraph(AgentState)
        
        workflow.add_node("agent", agent_node)
        workflow.add_node("tools", tool_node)
        
        workflow.add_edge(START, "agent")
        workflow.add_conditional_edges("agent", should_continue)
        workflow.add_edge("tools", "agent")
        
        return workflow.compile()

    async def analyze(self, question: str) -> Dict[str, Any]:
        """
        执行数据分析
        
        Args:
            question: 用户的问题
            
        Returns:
            分析结果
        """
        initial_state: AgentState = {
            "messages": [HumanMessage(content=question)],
            "database_key": self.db_key,
            "sql_result": None,
            "chart_config": None,
            "final_answer": None
        }
        
        result = await self.graph.ainvoke(initial_state)
        
        final_message = result["messages"][-1]
        return {
            "success": True,
            "answer": final_message.content if hasattr(final_message, "content") else str(final_message),
            "messages": [
                {"role": "user" if isinstance(m, HumanMessage) else "assistant", "content": m.content}
                for m in result["messages"]
            ]
        }
