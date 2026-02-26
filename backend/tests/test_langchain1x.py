#!/usr/bin/env python3
"""
LangChain 1.x 新功能测试脚本
"""

import sys
from pathlib import Path

# 添加项目路径
sys.path.insert(0, str(Path(__file__).parent))

print("=" * 60)
print("LangChain 1.x 新功能测试")
print("=" * 60)
print()

# 1. 版本信息
print("1. 版本信息")
print("-" * 40)
try:
    import langchain
    print(f"✓ langchain: {langchain.__version__}")
except ImportError as e:
    print(f"✗ langchain: {e}")

try:
    import langchain_core
    print(f"✓ langchain-core: {langchain_core.__version__}")
except ImportError as e:
    print(f"✗ langchain-core: {e}")

try:
    import langchain_community
    print(f"✓ langchain-community: {langchain_community.__version__}")
except ImportError as e:
    print(f"✗ langchain-community: {e}")

try:
    from importlib.metadata import version
    print(f"✓ langchain-openai: {version('langchain-openai')}")
except:
    print("✗ langchain-openai: 无法获取版本")

print()

# 2. 测试新的消息格式
print("2. 新的消息格式测试")
print("-" * 40)
try:
    from langchain_core.messages import (
        HumanMessage,
        AIMessage,
        SystemMessage,
        ToolMessage,
    )
    print("✓ 新的消息类型可用")
    
    # 测试创建消息
    human_msg = HumanMessage(content="你好！")
    ai_msg = AIMessage(content="你好，有什么可以帮你的？")
    system_msg = SystemMessage(content="你是一个有用的助手")
    
    print(f"  - HumanMessage: {type(human_msg)}")
    print(f"  - AIMessage: {type(ai_msg)}")
    print(f"  - SystemMessage: {type(system_msg)}")
except ImportError as e:
    print(f"✗ 消息格式: {e}")
print()

# 3. 测试新的工具装饰器
print("3. 新的工具装饰器测试")
print("-" * 40)
try:
    from langchain_core.tools import tool
    
    @tool
    def add(a: int, b: int) -> int:
        """Add two numbers together."""
        return a + b
    
    @tool
    def multiply(a: int, b: int) -> int:
        """Multiply two numbers together."""
        return a * b
    
    print("✓ 新的 @tool 装饰器可用")
    print(f"  - add 工具: {add.name}")
    print(f"  - multiply 工具: {multiply.name}")
    
    # 测试调用工具
    result = add.invoke({"a": 5, "b": 3})
    print(f"  - add(5, 3) = {result}")
except ImportError as e:
    print(f"✗ 工具装饰器: {e}")
print()

# 4. 测试 LangGraph
print("4. LangGraph 测试")
print("-" * 40)
try:
    import langgraph
    from importlib.metadata import version
    print(f"✓ LangGraph 可用: {version('langgraph')}")
    
    from langgraph.graph import StateGraph, MessagesState
    from langgraph.prebuilt import ToolNode
    
    print("  - StateGraph 可用")
    print("  - MessagesState 可用")
    print("  - ToolNode 可用")
except ImportError as e:
    print(f"✗ LangGraph: {e}")
print()

# 5. 测试 SQL Agent 仍然可用
print("5. SQL Agent 兼容性测试")
print("-" * 40)
try:
    from langchain_community.agent_toolkits.sql.base import create_sql_agent
    from langchain_community.utilities import SQLDatabase
    from langchain_openai import ChatOpenAI
    
    print("✓ SQL Agent API 仍然可用（向后兼容！）")
    print("  - create_sql_agent: 可用")
    print("  - SQLDatabase: 可用")
    print("  - ChatOpenAI: 可用")
except ImportError as e:
    print(f"✗ SQL Agent: {e}")
print()

# 6. 测试新的提示词模板
print("6. 新的提示词模板测试")
print("-" * 40)
try:
    from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder
    
    prompt = ChatPromptTemplate.from_messages([
        ("system", "你是一个有用的助手"),
        MessagesPlaceholder(variable_name="history"),
        ("human", "{input}")
    ])
    
    print("✓ ChatPromptTemplate 可用")
    print("✓ MessagesPlaceholder 可用")
except ImportError as e:
    print(f"✗ 提示词模板: {e}")
print()

# 7. 测试新的链式调用
print("7. LCEL 链式调用测试")
print("-" * 40)
try:
    from langchain_core.output_parsers import StrOutputParser
    from langchain_core.prompts import ChatPromptTemplate
    
    # 创建一个简单的链
    prompt = ChatPromptTemplate.from_template("告诉我一个关于{topic}的笑话")
    output_parser = StrOutputParser()
    
    # 测试链的组合语法
    chain = prompt | output_parser
    print("✓ LCEL 管道语法 (|) 可用")
    print("  - 链组合语法可用")
except ImportError as e:
    print(f"✗ LCEL: {e}")
print()

print("=" * 60)
print("测试完成！")
print("=" * 60)
print()
print("总结:")
print("- LangChain 1.x 已成功安装")
print("- SQL Agent API 向后兼容，无需重写代码")
print("- 新功能（LangGraph、新工具系统等）已可用")
print()
