# DataPulse - 智能数据分析助手

DataPulse 是一款基于 AI 的全栈数据分析系统，旨在通过自然语言与多种文档输入（PDF, 图片, Markdown）实现深度的知识提取、结构化分析与商业级可视化报表。

## 🌟 核心新特性 (v1.9.0)

### 1. 💎 深度知识提取 (Deep Extraction)
- **多引擎支持**：集成 MinerU (云端) 与 Baidu Qianfan DeepSeek-OCR，支持扫描版 PDF 与复杂表格的高精度识别。
- **标题感知分块**：引入 `TitleBasedMarkdownSplitter`，保留文档层级结构，实现毫秒级的精准 RAG 溯源。
- **高并发分析**：利用异步线程池并行分析文档章节，大幅提升处理速度。

### 2. 📊 智能报告工厂
- **炫酷大屏看板**：生成基于 ECharts 的深色极客风可视化看板，支持 Grid 响应式布局。
- **离线 PDF 导出**：集成 WeasyPrint 引擎，支持生成带封面、页码、专业排版的离线商业报告（已修复 macOS 字体兼容性）。
- **按需生成**：支持手动触发深度洞察，节省 Token 消耗并提供进度感知。

### 3. 🧠 交互与反馈闭环
- **对话分支管理**：支持“重新生成”答案，自动处理对话分叉并持久化多个版本。
- **反馈评价系统**：支持对 AI 回答点赞/点踩，并可提交详细的问题报告。
- **Token 精准统计**：在数据库层面记录每一条消息的提示与回答消耗，成本一目了然。

### 4. 🛠️ 系统可观测性
- **实时日志流**：新增可拖拽、三态切换的系统终端窗口，实时监控后端任务。
- **多数据库记忆**：支持跨会话的数据库选择自动持久化。

---

## 🏗️ 技术架构

- **后端**: FastAPI (Python 3.12) + SQLAlchemy + PostgreSQL/MySQL
- **AI 编排**: LangChain + DeepSeek-V3/R1 + Baidu Qianfan API
- **文档处理**: MinerU + WeasyPrint (PDF 渲染)
- **前端**: React + Vite + Tailwind CSS + Zustand
- **移动端**: Capacitor (iOS/Android 适配中)

## 🗄️ 仿真数据库环境 (Enterprise Simulation)

本项目内置了四个**企业级仿真数据库**，专为测试 AI 的复杂 SQL 生成、大数据量分析及多维可视化能力而设计。

### 核心特性
- **数据规模**：包含 **16万+** 真实订单记录及 **50万+** 用户行为点击流日志。
- **业务复杂度**：支持**多租户架构**（5个全球分公司）、**多币种自动换算**、**价格变动历史追踪**。
- **真实噪声**：模拟了真实世界的**离群值**、**数据空缺**、**双11爆发式增长**及**非结构化客户投诉文本**。
- **数据库对齐**：
  - `classic_business`: 核心 ERP/CRM 供应链，含 1800+ 条情感分析反馈。
  - `global_analysis`: 包含 AI 预测模型（Sales Forecast）及 15+ 种可视化专用表。
  - `test`: 财务审计专用，含部门预算与实绩对比。
  - `postgres`: 演示 PG 特性，含 JSONB 审计日志与地理信息节点。

---

## 🚀 快速启动

### 方案 A：Docker 一键启动 (推荐)
克隆项目后，在根目录执行：
```bash
docker-compose up --build
```
系统会自动启动 MySQL、PostgreSQL，并由 `db-seed` 服务**自动填充所有仿真数据**。

### 方案 B：本地手动启动
1. **环境配置**: 复制 `.env.example` 为 `.env` 并配置数据库连接。
2. **初始化数据**:
   ```bash
   # 安装依赖
   cd backend && pip install -r requirements.txt
   # 执行一键数据构建脚本 (需确保本地 MySQL/PG 已启动)
   python ../scripts/setup_all_data.py
   ```
3. **运行后端**: `python3 main.py`
4. **运行前端**: `cd ../frontend && npm run dev`


---

## 📝 架构演进 (History)

- **v1.9.0 (2026-03-08)**: 
    - 集成 MinerU 与百度 OCR 深度提取；
    - 实现专业离线 PDF 报告引擎与 Token 成本精准核算；
    - 增加消息反馈系统与对话分支管理；
    - 修复全屏渲染与 macOS 字体显示问题。
- **v1.7.0 (2026-02-27)**: 扩展 15+ 种进阶可视化图表（雷达图、漏斗图等）；引入 AI 驱动的 ECharts 动态配置生成引擎。
- **v1.6.0**: 彻底废除 SQLite，全面转向 SQLAlchemy (MySQL/PG)；标准化 SSE 流式协议。
- **v1.5.0**: 实现 Android/iOS 移动端适配，引入思考可视化方案。
- **v1.4.0**: 集成 RAG 知识库功能，支持 MinerU 与 PyMuPDF 解析。

---

## ⚠️ 已知问题
详见 `docs/KNOWN_BUGS.md`。
