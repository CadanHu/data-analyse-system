# DataPulse Architectural Design Document

## 1. System Overview
DataPulse is an AI-driven intelligent data analysis platform featuring a dual-engine architecture for structured data query (SQL) and unstructured document analysis (RAG).

## 2. Core Architecture: Dual-Engine Logic

### 2.1 Smart SQL Engine (Text-to-SQL)
- **Natural Language Processing**: Translates user intent into high-precision SQL queries using DeepSeek R1 reasoning models.
- **ORM & Adapter Layer**: Built on **SQLAlchemy 2.0 (Async)**, providing a unified interface for MySQL and PostgreSQL.
- **Dynamic Schema Service**: Automatically extracts database metadata (tables, columns, samples) to provide context for the AI Agent.
- **Visualization Adaptation**: Dynamically maps SQL results to 15+ types of ECharts visualizations based on AI recommendations.

### 2.2 RAG Knowledge Base Engine
- **Document Processing**: Integrated with **MinerU** and **PyMuPDF** for high-quality PDF, Markdown, and TXT parsing.
- **Vector Storage**: Uses **ChromaDB** for efficient embedding storage and semantic retrieval.
- **Contextual Reasoning**: Enhances AI responses by retrieving relevant context from uploaded business documents.

## 3. Technology Stack

### Backend
- **Framework**: FastAPI (Asynchronous)
- **AI Orchestration**: LangChain 0.3
- **Database Driver**: SQLAlchemy (Asyncio)
- **Database Support**: MySQL 8.0+, PostgreSQL 14+
- **Parsing**: MinerU, PyMuPDF (fitz)
- **Protocols**: Standard Server-Sent Events (SSE) for streaming

### Frontend
- **Framework**: React 18, Vite, TypeScript
- **Styling**: Tailwind CSS
- **Visualization**: Apache ECharts 5
- **Mobile Development**: Capacitor 6 (iOS & Android)
- **State Management**: Zustand

## 4. Key Architectural Patterns

### 4.1 Agentic Workflow
The system uses a **Research -> Strategy -> Execution** lifecycle.
1. **Classification**: Identifies if the user intent is a query, chat, or confirmation.
2. **Planning**: Generates an analysis plan for user approval before execution.
3. **Execution**: Generates SQL, executes it, and synthesizes a natural language summary.

### 4.2 Streamable HTTP (SSE)
Ensures real-time user feedback by streaming the AI's "Thought Chain" and final content using standard Event-Stream protocols.

### 4.3 Scalable Data Adapters
A modular adapter pattern allows for easy expansion to other data sources (e.g., MongoDB, ClickHouse) while maintaining a consistent internal interface.

## 5. Security & Isolation
- **Authentication**: JWT-based stateless authentication.
- **Multi-tenancy**: Strict session isolation ensured via `user_id` filtering at the database layer.
- **Database Protection**: Read-only enforcement for AI-generated queries via restricted DB user permissions.
