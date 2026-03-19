# DataPulse: AI-Powered Smart Data Analytics Assistant (v3.0)

[中文](./README_CN.md) | English

An AI-driven intelligent data analysis system, a multi-engine commercial platform that enables structured data query (SQL), professional data science modeling (Python), and unstructured document analysis (RAG) through natural language conversation.

---

## 📸 Interface Preview

### 🖥️ Web Dashboard
![Web Dashboard](./assets/web_mockup.svg)
*Three-column layout · Real-time streaming · Python Sandbox · Multi-chart switching · SQL preview*

### 📱 Mobile Native
| Portrait Mode | Landscape Mode |
| :---: | :---: |
| ![Mobile Portrait](./assets/mobile_mockup.svg) | ![iOS Landscape](./assets/ios_mockup.svg) |
*Capacitor 6 native adaptation · Notch screen compatible · Touch-optimized · Safe Area support*

---

## 🎯 Core Capabilities (v3.0)

### 🧪 AI Data Scientist Engine
- 🐍 **Secure Python Sandbox**: Executes AI-generated Python code in a secure environment with AST auditing. Supports **Pandas, Numpy, Matplotlib, and Seaborn**.
- 📈 **High-Definition Plotting**: Automatically captures Matplotlib/Seaborn figures and renders them as high-quality images with dedicated "View Original" controls.
- 🔗 **Multi-Table Join Awareness**: Automatically detects database schemas and performs complex cross-table joins and statistical modeling in memory.

### 🤖 Multi-Provider AI Model Support
- 🔑 **Bring Your Own API Key**: Configure API keys for any supported provider directly inside the app — no `.env` changes required.
- 🧠 **Extended Thinking Models**: First-class support for reasoning/thinking chains from DeepSeek R1, Claude Opus/Sonnet, and Gemini Pro.
- 🌐 **Supported Providers & Models**:

| Provider | Models | Notes |
|----------|--------|-------|
| **DeepSeek** | deepseek-chat (V3), deepseek-reasoner (R1) | Custom Base URL supported |
| **OpenAI** | gpt-5.3, gpt-5.2 | Custom Base URL supported |
| **Google Gemini** | gemini-3.1-pro-preview, gemini-3.1-flash-lite-preview, gemini-3.1-flash-image-preview, gemini-3-flash-preview | — |
| **Anthropic Claude** | claude-opus-4-6, claude-sonnet-4-6, claude-haiku-4-5, claude-opus-4-5, claude-sonnet-4-5, claude-3-7-sonnet | — |

### 📊 Professional Visualization (16+ Chart Types)
- 🗺️ **Map Chart**: Geographic data distribution with province/city-level heatmaps.
- 📉 **Dynamic ECharts Dashboard**: Bar, line, pie, scatter, radar, sankey, gantt, boxplot, and more — all AI-configured dynamically.
- 🎨 **High-Contrast Geek Theme**: Dark mode optimized for data-dense dashboards.

### 📡 Agentic Interoperability
- 📥 **Bring Your Own Data (BYOD)**: Supports receiving `external_data` via API. Other AI agents can provide their own datasets for DataPulse to analyze and visualize.
- ⚡ **Streamed Insights**: Provides real-time streaming of analysis strategies, reasoning chains, and final business summaries.

### 📱 Offline-First Mobile Experience
- 💾 **Local SQLite Persistence**: All sessions, messages, and API keys are stored locally on-device for instant access without a network connection.
- 🔄 **Background Sync**: Automatically syncs local data to the remote server when connectivity is restored, with conflict resolution.
- 🔐 **Encrypted Key Storage**: API keys are stored securely in the local database and synced only to the authenticated user's account.

### 🏗️ Enterprise Architecture
- ✅ **Dual-Engine Logic**: Seamlessly switch between **SQL Query mode** (for massive datasets) and **Scientist mode** (for deep modeling).
- ✅ **RAG Knowledge Base**: Integrates **MinerU** and **OCR** for high-precision parsing of complex PDFs/images, combined with **ChromaDB** for terminology alignment.
- ✅ **Mobile-First Design**: Precision viewport optimization (`dvh`) and real-time SSE log streaming for remote debugging.

---

## 🚀 Future Exploration: The Agentic Ecosystem

We are actively expanding DataPulse from a standalone tool into a core component of the AI Agent ecosystem:

### 🛠️ External Tool Support (MCP)
We are exploring integration with the **Model Context Protocol (MCP)**. This will allow DataPulse to:
- Act as an MCP Server, providing data analysis "capabilities" to other LLM clients (like Claude Desktop or custom agents).
- Consume external MCP tools to fetch live web data, weather, or financial markets into the analysis loop.

### 🌐 Agent-as-a-Service (External Calls)
DataPulse is evolving into an "Analysis Middle-End." External agents can call our endpoints to:
- Offload complex data cleaning and visualization tasks.
- Obtain structured JSON insights and Base64-encoded professional charts from private datasets.
- Leverage our secure Python execution sandbox without building their own.

---

## 📦 Project Structure

```
data-analyse-system/
├── backend/            # FastAPI, LangChain, Python Sandbox
│   ├── agents/        # Advanced Data Scientist & SQL Agents
│   ├── services/      # Python Executor, Document Processing, Vector Store
│   └── routers/       # External Agent & Chat Stream API
├── frontend/           # React (TS), Vite, Tailwind, Capacitor 6
│   └── src/
│       ├── services/  # Local SQLite store, file cache, sync manager
│       └── components/ # ModelKeyModal, InputBar, Charts
├── scripts/            # Simulation & External Agent Testing scripts
└── docs/               # Technical Guides & Roadmap
```

---

## 📝 Architecture Evolution

- **v3.0.6 (Current)**: Added **multi-provider AI model support** (DeepSeek / OpenAI / Gemini / Claude) with in-app API key management; Added **Map chart type**; Implemented **offline-first mobile sync** with local SQLite and background server sync.
- **v3.0**: Launched **AI Data Scientist Mode**; Added **External Data Ingestion (BYOD)**; Fixed JSON serialization for complex Pandas types; Implemented high-contrast UI & code folding.
- **v1.7.0**: Expanded to 15+ chart types; introduced AI-driven ECharts dynamic configuration.
- **v1.6.0**: Deprecated SQLite for SQLAlchemy (MySQL/PG); standardized SSE protocol.
- **v1.5.0**: Mobile adaptation via Capacitor 6; Reasoning chain visualization.
- **v1.4.0**: MinerU integration for professional PDF/Image knowledge extraction.

---

## 🚀 Quick Start

Refer to [Local Installation Guide](./LOCAL_INSTALLATION.md) for detailed setup or use Docker:
```bash
# 1. Copy environment config (no AI API key needed in .env)
cp .env.example .env

# 2. Start the full stack (auto-initializes MySQL/PostgreSQL + 160k+ simulation records)
docker-compose up --build
```

> **AI API Keys**: Configure your provider keys (DeepSeek, OpenAI, Gemini, Claude) directly inside the app via the **Model/Key** settings panel — no restart required.
