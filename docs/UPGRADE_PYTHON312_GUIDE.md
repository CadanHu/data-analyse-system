# Python 3.12 + LangChain 1.x 升级指南

**当前分支**: `feature/python312-langchain1x`  
**创建日期**: 2026-02-23

---

## 一、当前状态

- ✅ 已创建新分支：`feature/python312-langchain1x`
- ❌ 验证：LangChain 1.x **确实需要 Python 3.10+**
- 📝 当前 Python 版本：3.9.2

---

## 二、升级步骤

### 步骤 1：安装 Python 3.12

#### 方式 A：使用 Homebrew（推荐）

```bash
# 1. 安装 Homebrew（如果尚未安装）
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# 2. 安装 Python 3.12
brew install python@3.12

# 3. 验证安装
python3.12 --version
```

#### 方式 B：使用 pyenv（更好的版本管理）

```bash
# 1. 安装 pyenv
brew install pyenv

# 2. 添加到 shell 配置文件（~/.zshrc 或 ~/.bash_profile）
echo 'export PYENV_ROOT="$HOME/.pyenv"' >> ~/.zshrc
echo 'command -v pyenv >/dev/null || export PATH="$PYENV_ROOT/bin:$PATH"' >> ~/.zshrc
echo 'eval "$(pyenv init -)"' >> ~/.zshrc

# 3. 重新加载配置
source ~/.zshrc

# 4. 安装 Python 3.12
pyenv install 3.12.0

# 5. 在项目目录设置本地版本
cd /Users/huyitao/trae/data-analyse-system
pyenv local 3.12.0

# 6. 验证
python --version  # 应该显示 3.12.x
```

---

### 步骤 2：创建 Python 3.12 虚拟环境

```bash
cd /Users/huyitao/trae/data-analyse-system/backend

# 使用 Python 3.12 创建虚拟环境
python3.12 -m venv venv312

# 激活虚拟环境
source venv312/bin/activate

# 验证 Python 版本
python --version  # 应该显示 3.12.x
```

---

### 步骤 3：安装依赖

```bash
# 确保在虚拟环境中
cd /Users/huyitao/trae/data-analyse-system/backend
source venv312/bin/activate

# 安装依赖（requirements.txt 已更新为支持 1.x）
pip install -r requirements.txt
```

---

### 步骤 4：适配代码（预计 4-8 小时）

LangChain 1.x 有重大 API 变更，需要重写 `langchain_sql_agent.py`：

#### 主要变更：

| 旧版 (0.3.x) | 新版 (1.x) |
|-------------|-----------|
| `create_sql_agent` from `langchain_community` | `create_agent` from `langchain.agents` |
| 内置 SQL 工具 | 需要手动创建和配置 SQL 工具 |
| `agent_executor` | 新的调用方式 |

#### 代码示例（新版）：

```python
from langchain.agents import create_agent
from langchain_community.utilities import SQLDatabase
from langchain_community.tools.sql_database.tool import (
    QuerySQLDataBaseTool,
    InfoSQLDatabaseTool,
    ListSQLDatabaseTool,
    QuerySQLCheckerTool
)

# 1. 创建 SQL 工具
tools = [
    QuerySQLDataBaseTool(db=self.db),
    InfoSQLDatabaseTool(db=self.db),
    ListSQLDatabaseTool(db=self.db),
    QuerySQLCheckerTool(db=self.db, llm=self.llm)
]

# 2. 创建 Agent
self.agent = create_agent(
    model=self.llm,
    tools=tools,
    system_prompt="You are a helpful SQL assistant..."
)

# 3. 调用
response = await self.agent.ainvoke({"messages": [("user", prompt)]})
```

---

### 步骤 5：测试

```bash
# 启动服务器
cd /Users/huyitao/trae/data-analyse-system/backend
source venv312/bin/activate
python -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload

# 测试功能
# - 打开前端 http://localhost:5173
# - 测试数据库查询
# - 验证所有功能正常
```

---

## 三、回滚方案

如果升级遇到问题，可以轻松回滚：

```bash
# 1. 切换回 main 分支
git checkout main

# 2. 恢复旧的虚拟环境
cd /Users/huyitao/trae/data-analyse-system/backend
source venv/bin/activate  # 旧的虚拟环境

# 3. 重启服务器
python -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

---

## 四、预计时间

| 步骤 | 预计时间 | 说明 |
|------|---------|------|
| 安装 Python 3.12 | 15-30 分钟 | 使用 Homebrew 或 pyenv |
| 创建虚拟环境 + 安装依赖 | 15-30 分钟 | |
| 代码适配 | 4-8 小时 | 最耗时的部分 |
| 测试 | 2-4 小时 | 全面测试 |
| **总计** | **7-13 小时** | **约 1-2 个工作日** |

---

## 五、当前分支状态

✅ 已创建并切换到：`feature/python312-langchain1x`  
✅ 已提交 Phase 1 完成状态到 main 分支  
✅ 已更新 `requirements.txt` 为 1.x 版本要求  
⏳ 等待 Python 3.12 安装和代码适配

---

## 六、下一步行动

**选项 A：现在升级**
1. 按照上述步骤安装 Python 3.12
2. 创建虚拟环境
3. 开始代码适配

**选项 B：暂不升级**
1. 切换回 main 分支
2. 继续使用 LangChain 0.3.27（当前已足够强大）
3. 完成 Phase 2-6 后再考虑升级

---

**文档创建者**: AI Assistant  
**最后更新**: 2026-02-23
