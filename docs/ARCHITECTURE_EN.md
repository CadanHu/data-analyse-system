# DataPulse Architectural Design Document

## 1. System Overview
DataPulse is an AI-driven intelligent data analysis platform featuring a dual-engine architecture for structured data query (SQL) and unstructured document analysis (RAG).

## 2. Core Architecture: Physical Isolation (v4.0)

### 2.1 Multi-Mode Dispatcher (Physical Isolation)
The system employs a strict physical isolation pattern for its core processing logic to ensure stability, maintainability, and specialized handling for different AI tasks.

- **Scientist Mode (`run_scientist_mode`)**: 
  - **Focus**: Python-based data science, predictive modeling, and advanced visualization.
  - **Isolation**: Bypasses reasoning capture to focus on code execution and data transformation.
  - **Persistence**: Captures and stores Base64 images from Matplotlib/Seaborn.
- **Thinking Mode (`run_thinking_mode`)**: 
  - **Focus**: Deep reasoning and complex Text-to-SQL generation.
  - **Isolation**: Mandatory capture and streaming of the model's internal "thought chain" (Reasoning Content).
- **RAG Mode (`run_rag_mode`)**: 
  - **Focus**: Knowledge-base retrieval and document-grounded Q&A.
  - **Integration**: Combines vector search results (ChromaDB) with user questions for context-aware responses.
- **Depth Mode (`run_depth_mode`)**: 
  - **Focus**: Multi-step, high-dimensional data modeling.
  - **Strategy**: Injects specialized deep analysis instructions into the agent's prompt for exhaustive exploration.
- **Standard Mode (`run_standard_mode`)**: 
  - **Focus**: General SQL queries and conversational interactions with minimal overhead.

### 2.2 Shared Architectural Helpers
While processors are isolated, shared non-core utilities ensure consistent user experience:
- **Session Auto-Title Service**: An asynchronous helper (`_handle_session_auto_title`) that automatically generates professional session titles only when the current title is empty, ensuring clean navigation without blocking the main chat flow.
- **Streamable Service**: A unified `StreamableHTTPService` for managing Server-Sent Events (SSE) across all modes.

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
