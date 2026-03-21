# DataPulse AI Data Analysis System (v3.1)

DataPulse is an open-source, full-stack AI data analysis platform designed for building automated data pipelines, professional visualization workflows, and intelligent business insights.

[![GitHub Topics](https://img.shields.io/badge/topics-data--analysis%20%7C%20python%20%7C%20automation%20%7C%20ai--tools-blue)](https://github.com/CadanHu/data-analyse-system)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

---

## 📖 Documentation / 文档中心

Choose your language:

- **[English Documentation](./docs/README_EN.md)**: Full project guide, setup, and features.
- **[中文说明文档](./docs/README_CN.md)**: 核心功能介绍、快速部署与 AI 数据科学家模式指南。
- **[移动端知识库规格](./docs/MOBILE_KNOWLEDGE_SPEC.md)**: 本地 PDF 解析、RAG 检索、知识图谱完整规格。

---

## 🌟 Key Features (v3.1)

- **Multi-Provider AI Models**: Bring your own API key — DeepSeek, Qwen, MiniMax, OpenAI, Gemini, Claude. Organized by region (VPN / No-VPN).
- **Extended Thinking**: First-class reasoning chain support for DeepSeek R1, Claude Opus/Sonnet, QwQ-32B, and Gemini Pro.
- **AI Data Scientist Agent**: Secure Python sandbox for complex modeling, multi-table analysis, and Matplotlib/Seaborn chart capturing.
- **Map Chart & 16+ Visualizations**: Geographic heatmaps, ECharts dynamic dashboards, and professional chart types.
- **Mobile Local Knowledge Base** *(v3.1 New)*: Three PDF modes fully on-device — PDF.js local parse / MinerU deep parse / LLM knowledge graph extraction. Layered RAG: vector search → FTS5 fallback.
- **Knowledge Graph Visualization** *(v3.1 New)*: Interactive ECharts force graph of entities and relations extracted from documents.
- **Bring Your Own Data (BYOD)**: External agents can provide private datasets via API for instant analysis.
- **Enterprise-Ready**: Automated database initialization with massive simulation datasets (160k+ records).

## 🚀 Quick Start (Docker)

```bash
# Clone the repository
git clone https://github.com/CadanHu/data-analyse-system.git

# Copy environment config (AI API keys are configured inside the app)
cp .env.example .env

# Start the entire stack
docker-compose up --build
```

> Configure your AI provider API keys (DeepSeek / OpenAI / Gemini / Claude) in the **Model/Key** settings panel inside the app after startup.

## 🛠️ Tech Stack

- **Frontend**: React, TypeScript, Tailwind CSS, Vite, Capacitor 6.
- **Backend**: FastAPI, LangChain, SQLAlchemy.
- **AI**: DeepSeek, OpenAI, Google Gemini, Anthropic Claude (multi-provider).
- **Analysis**: Pandas, Matplotlib, Seaborn, Scikit-learn.
- **Database**: MySQL (business data) + PostgreSQL (knowledge base / vector store).

## 📄 License

This project is licensed under the [MIT License](LICENSE).
