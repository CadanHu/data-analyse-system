# LangChain 1.x 新功能指南

**升级日期**: 2026-02-23  
**版本**: langchain==1.2.10, langchain-core==1.2.14

---

## 一、升级总结

### ✅ 成功完成的升级

| 组件 | 旧版本 | 新版本 |
|------|--------|--------|
| Python | 3.9.2 | **3.12.9** |
| langchain | 0.3.27 | **1.2.10** |
| langchain-core | 0.3.83 | **1.2.14** |
| langchain-community | 0.3.27 | **0.4.1** |
| langchain-openai | 0.3.35 | **1.1.10** |
| LangGraph | - | **1.0.9** |

### 🎉 关键发现

**SQL Agent API 完全向后兼容！** 我们的代码 **无需任何修改**即可在 LangChain 1.x 上运行！

---

## 二、LangChain 1.x 新功能

### 1. LangGraph - 构建复杂 Agent 的新方式

LangGraph 是 LangChain 1.x 中最重要的新功能，用于构建复杂的、有状态的 Agent 工作流。

#### 示例代码：

```python
from langgraph.graph import StateGraph, MessagesState
from langgraph.prebuilt import ToolNode
from langchain_core.tools import tool
from langchain_openai import ChatOpenAI

# 1. 定义工具
@tool
def search_web(query: str) -> str:
    """Search the web for information."""
    return f"搜索结果: {query}"

@tool
def calculate(a: int, b: int, op: str) -> int:
    """Calculate math operations."""
    if op == "+":
        return a + b
    elif op == "-":
        return a - b
    elif op == "*":
        return a * b
    return 0

# 2. 初始化模型和工具
llm = ChatOpenAI(model="gpt-4o")
tools = [search_web, calculate]
llm_with_tools = llm.bind_tools(tools)

# 3. 定义状态图
def agent_node(state: MessagesState):
    return {"messages": [llm_with_tools.invoke(state["messages"])]}

graph_builder = StateGraph(MessagesState)
graph_builder.add_node("agent", agent_node)
graph_builder.add_node("tools", ToolNode(tools))

graph_builder.set_entry_point("agent")
graph_builder.add_conditional_edges(
    "agent",
    lambda x: "tools" if x["messages"][-1].tool_calls else "__end__"
)
graph_builder.add_edge("tools", "agent")

# 4. 编译并运行
graph = graph_builder.compile()

result = graph.invoke({
    "messages": [("human", "搜索北京的天气，然后计算 5 + 3")]
})

print(result["messages"][-1].content)
```

---

### 2. 新的工具装饰器 @tool

更简洁、更强大的工具定义方式：

```python
from langchain_core.tools import tool

@tool
def add(a: int, b: int) -> int:
    """Add two numbers together."""
    return a + b

@tool
def multiply(a: int, b: int) -> int:
    """Multiply two numbers together."""
    return a * b

# 使用工具
result = add.invoke({"a": 5, "b": 3})
print(result)  # 8
```

---

### 3. 新的消息格式

```python
from langchain_core.messages import (
    HumanMessage,
    AIMessage,
    SystemMessage,
    ToolMessage,
)

# 创建消息
human_msg = HumanMessage(content="你好！")
ai_msg = AIMessage(content="你好，有什么可以帮你的？")
system_msg = SystemMessage(content="你是一个有用的助手")
```

---

### 4. LCEL (LangChain Expression Language) 增强

```python
from langchain_core.output_parsers import StrOutputParser
from langchain_core.prompts import ChatPromptTemplate
from langchain_openai import ChatOpenAI

# 创建链
prompt = ChatPromptTemplate.from_template("告诉我一个关于{topic}的笑话")
llm = ChatOpenAI(model="gpt-4o")
output_parser = StrOutputParser()

# 使用管道语法组合
chain = prompt | llm | output_parser

# 调用
result = chain.invoke({"topic": "程序员"})
print(result)
```

---

### 5. 新的提示词模板

```python
from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder

# 创建带历史记录的提示词
prompt = ChatPromptTemplate.from_messages([
    ("system", "你是一个有用的助手"),
    MessagesPlaceholder(variable_name="history"),
    ("human", "{input}")
])
```

---

## 三、我们的系统如何利用这些新功能

### Phase 2: 多数据库支持
- 可以使用 LangGraph 管理多个数据库连接
- 更优雅的工具系统

### Phase 3: 复杂 Agent 能力
- **LangGraph** 是实现多步推理的完美选择！
- 可以构建更复杂的 Agent 工作流

### Phase 4: 向量检索与 RAG
- 新的工具系统更容易集成向量检索
- LangChain 1.x 对 RAG 有更好的支持

### Phase 5: 可观测性
- LangSmith 集成更完善
- 更好的调试和追踪能力

---

## 四、当前系统状态

### ✅ 已测试的功能

| 功能 | 状态 |
|------|------|
| SQL Agent | ✅ 完全兼容，无需修改 |
| LangGraph | ✅ 可用，待集成 |
| 新工具系统 | ✅ 可用 |
| 消息格式 | ✅ 可用 |
| LCEL | ✅ 可用 |

### 🌐 服务状态

| 服务 | 端口 | 状态 |
|------|------|------|
| 后端 | 8001 | ✅ 运行中 |
| 前端 | 5173 | ✅ 运行中 |

---

## 五、下一步建议

### 立即可以做的：
1. ✅ **继续使用现有系统** - SQL Agent 完全兼容
2. 📚 **学习 LangGraph** - 为 Phase 3 做准备
3. 🧪 **测试新功能** - 在开发环境中尝试

### Phase 2-6 可以利用的新功能：
- **Phase 3**: 使用 LangGraph 实现多步推理 Agent
- **Phase 4**: 使用新工具系统集成向量检索
- **Phase 5**: 利用增强的 LangSmith 追踪

---

## 六、如何使用新环境

```bash
# 激活 Python 3.12 虚拟环境
cd /Users/huyitao/trae/data-analyse-system/backend
source venv312/bin/activate

# 启动服务器（如果需要）
python3 -m uvicorn main:app --host 0.0.0.0 --port 8001 --reload

# 运行测试脚本
python3 test_langchain1x.py
```

---

## 七、Git 分支信息

| 分支 | 用途 |
|------|------|
| `main` | 稳定版本（Python 3.9 + LangChain 0.3.27） |
| `feature/python312-langchain1x` | **当前分支**（Python 3.12 + LangChain 1.x） |

---

**文档创建者**: AI Assistant  
**最后更新**: 2026-02-23
