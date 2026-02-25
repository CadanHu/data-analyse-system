# Version Snapshot - v1.3.0

**快照日期**: 2026-02-23  
**当前版本**: v1.3.0  
**下一个目标版本**: v2.0.0 (全面 LangGraph 增强)  
**当前进度**: 多数据库持久化与商业分析增强已完成 🎉

---

## 一、当前系统状态

### 1.1 开发进度 (2026-02-23 突破性进展)

| 模块 | 状态 | 完成内容 |
|---------|------|-----------|
| **会话持久化** | ✅ 已完成 | 支持 MySQL 存储，解决 8 小时时区偏差 |
| **多数据库支持** | ✅ 已完成 | 集成 MySQL 适配器，支持动态切换 |
| **商业分析数据集** | ✅ 已完成 | 预置经典商业分析库与全场景模拟库 |
| **系统稳定性** | ✅ 已完成 | 修复 JSON 序列化日期报错，优化端口代理 |
| **UI/UX 优化** | ✅ 已完成 | 精简冗余功能，修复删除会话后的状态同步 |

---

### 1.2 版本更新历史

#### v1.3.0 (2026-02-23) - 商业化与持久化增强
- ✅ **MySQL 会话持久化**: 支持将所有聊天记录、会话状态存储在 MySQL 中。
- ✅ **CST 时区优化**: 统一使用 `+08:00` 偏移量，彻底解决“8小时前”的时间显示 Bug。
- ✅ **商业数据集集成**: 
    - 预置 `classic_business` (产品、订单、明细)。
    - 预置 `global_analysis` (零售、订阅、人力、KPI绩效)。
- ✅ **JSON 序列化修复**: 自定义 `CustomJSONEncoder`，完美支持 MySQL 的 Date/DateTime/Decimal 类型。
- ✅ **端口代理优化**: 修正前端硬编码端口，统一走 Vite 代理，增强部署灵活性。
- ✅ **SQL 执行器加固**: 解决 MySQL 下 `LIKE` 模糊查询包含 `%` 字符时的参数格式化报错。
- ✅ **UI 精简**: 删除了冗余的“清空上下文”功能，保持界面清爽。

#### v1.2.0 (2026-02-20)
- ✅ DeepSeek 推理模型支持
- ✅ 思考模式切换开关
- ✅ 文件上传功能
- ✅ 集成 Chinook 和 Northwind 数据库

---

### 1.3 当前技术栈

#### 后端
- **框架**: FastAPI 0.109.0
- **AI 模型**: DeepSeek (deepseek-chat / deepseek-reasoner)
- **数据库**: 
    - 会话存储: MySQL 8.0 / SQLite
    - 业务查询: MySQL, PostgreSQL, SQLite
- **核心库**: LangChain (已集成), aiomysql, aiosqlite, httpx

#### 前端
- **框架**: React 18 + TypeScript + Vite 5
- **UI 框架**: Tailwind CSS
- **图表库**: ECharts 5
- **状态管理**: Zustand

---

### 1.4 项目结构 (关键更新)

```
data-analyse-system/
├── backend/
│   ├── database/
│   │   └── session_db.py      # 双引擎会话存储 (MySQL/SQLite)
│   ├── utils/
│   │   └── json_utils.py      # 核心：处理复杂类型序列化
│   ├── init_global_analysis.py # 商业数据集生成器
│   └── ...
├── optimization_requirements/
│   └── 004-session-deletion-issues.md # 已解决的 UI 问题记录
├── GEMINI.md                  # 项目开发规范 (Rules)
└── VERSION_SNAPSHOT_v1.3.0.md # 本文件
```

---

## 二、关键决策记录 (2026-02-23)

### 2.1 时区处理
- **决策**: 不再依赖数据库默认时间，在 Python 层显式生成带偏移量的 ISO 字符串。
- **原因**: 消除前端、后端、数据库三方时区配置不一致带来的 8 小时偏差。

### 2.2 序列化方案
- **决策**: 引入 `CustomJSONEncoder` 全局拦截无法序列化的对象。
- **原因**: MySQL 商业分析场景中大量存在日期和高精度小数，原生 `json` 库无法处理。

### 2.3 开发规范
- **决策**: 启用 `GEMINI.md` 强制约束 AI 开发行为。
- **内容**: 强制要求中文 Debug 日志、统一使用自定义 JSON 序列化、多库兼容。

---

## 三、已知问题与后续规划

### 3.1 后续目标
1. **RAG 增强**: 结合向量数据库，支持基于文档的私有知识库分析。
2. **多步 Agent**: 实现能够自动执行多条 SQL 并汇总结果的复杂链路。
3. **性能监控**: 集成 LangSmith 监控 Agent 推理链路。

---

**快照创建者**: AI Assistant (Gemini CLI)  
**最后更新**: 2026-02-23  
**状态**: v1.3.0 稳定版已发布
