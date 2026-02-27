# DataPulse: AI-Powered Smart Data Analytics Assistant

[中文](./README.md) | English

An AI-driven intelligent data analysis system, a dual-engine commercial platform that enables structured data query (SQL) and unstructured document analysis (RAG) through natural language conversation.

## 🎯 Core Capabilities

### Dual-Engine Analysis Logic
- ✅ **Smart SQL Engine**: Driven by SQLAlchemy, supporting MySQL and PostgreSQL. Automatically recognizes schemas and converts natural language into high-precision SQL statements.
- ✅ **RAG Knowledge Base Enhancement**: Supports uploading PDF/Markdown/TXT, integrates **PyMuPDF** and **MinerU** for efficient parsing, combined with **ChromaDB** vector storage to assist AI in terminology alignment and business metric interpretation.

### Native Mobile Experience
- 📱 **Full Platform Adaptation**: Built with Capacitor 6, natively supporting **iOS (iPhone)** and **Android (Pixel/Samsung)**.
- 👁️ **AI Thought Process Visualization**: Standard SSE streaming transmission, real-time display of DeepSeek R1 reasoning chains, making AI inference transparent and visible.

### Enterprise-Grade Backend Architecture
- 🏗️ **Unified Adaptation Layer**: Implements cross-database general schema extraction and asynchronous query execution based on SQLAlchemy.
- 🔒 **User Authentication System**: Complete JWT registration, login, and token verification processes, supporting multi-user data isolation.
- ⚡ **Performance Optimization**: Asynchronous FastAPI architecture combined with standard Event-Stream protocol ensures second-level response times.

---

## 📦 Project Structure (Organized)

```
data-analyse-system/
├── backend/            # Backend Project (FastAPI, SQLAlchemy, Agents)
│   ├── agents/        # Core AI Agent Logic
│   ├── database/      # SQLAlchemy Models and Storage Logic
│   ├── databases/     # Database Adapters (MySQL/PostgreSQL)
│   ├── services/      # Document Processing, Vector Store, Stream Services
│   ├── routers/       # API Routers
│   └── tests/         # Unit Tests and Test Documents
│       └── knowledge_base/ # Business Metric Test Sets
├── frontend/           # Frontend Project (React, Vite, Tailwind)
│   ├── ios/           # iOS Native Projects
│   └── android/       # Android Native Projects
├── scripts/            # Environment Verification and Initialization Scripts
├── docs/               # Deployment and Installation Guides
└── docker-compose.yml  # Containerized Deployment Configuration
```

---

## 🚀 Quick Start

### 1. Prerequisites
- **Backend**: Python 3.12+, MySQL 8.0+
- **Frontend**: Node.js 18+

### 2. Local Installation
For detailed steps, please refer to: [Local Installation and Testing Guide](./docs/LOCAL_INSTALLATION.md)

### 3. Environment Verification
Run the following script to check your MySQL and API configurations:
```bash
python3 scripts/check_db_env.py
```

---

## 📝 Architecture Evolution
- **v1.7.0 (2026-02-27)**: Expanded to 15+ types of advanced visualization charts (Radar, Funnel, etc.); introduced AI-driven ECharts dynamic configuration engine for automatic display type adaptation.
- **v1.6.0**: Completely deprecated SQLite, shifted fully to SQLAlchemy (MySQL/PG); standardized SSE streaming protocol; normalized directory structure.
- **v1.5.0**: Implemented Android/iOS mobile adaptation, introduced thought visualization solution.
- **v1.4.0**: Integrated RAG knowledge base features, supporting **MinerU** and **PyMuPDF** for complex PDF parsing.
