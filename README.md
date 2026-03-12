# Data Analyse System

An open-source AI-assisted data analysis system for building automated data pipelines, visualization workflows, and intelligent insights.

[![GitHub Topics](https://img.shields.io/badge/topics-data--analysis%20%7C%20python%20%7C%20automation%20%7C%20ai--tools%20%7C%20llm-blue)](https://github.com/CadanHu/data-analyse-system)

## Features

- **AI-Powered Data Insights**: Automatically generate statistical summaries and strategic recommendations using LLMs (OpenAI, Gemini, Claude, DeepSeek).
- **Automated Analysis Pipelines**: End-to-end processing from raw data ingestion to structured report generation.
- **Smart Visualization**: Dynamic ECharts generation and interactive dashboards with responsive layouts.
- **Deep Knowledge Extraction**: Integrated MinerU and OCR engines for processing complex PDFs, images, and Markdown.
- **Enterprise-Grade Simulation**: Includes massive datasets (160k+ orders) for stress-testing SQL generation and analysis.
- **Mobile-Ready**: Precision-optimized interface for mobile devices with real-time SSE log streaming.

## Why this project exists

Many developers and analysts need simple, powerful tools to explore datasets and build analysis workflows without complex setups. This project provides a lightweight yet extensible system to automate common data analysis tasks while leveraging the latest Large Language Models to provide human-like insights.

## Future roadmap

- **AI-Assisted Data Insights**: Deeper correlation analysis and predictive modeling.
- **Automated Report Generation**: One-click professional PDF/HTML reports with advanced styling.
- **LLM-Based Analysis Tools**: Specialized agents for financial auditing and supply chain optimization.
- **Automated Pull Request Review**: Integrated AI workflows for code and data schema changes.

## Example workflow

1. **Load Dataset**: Ingest CSV, Excel, or SQL databases.
2. **Run Automated Analysis**: AI agents classify intent and generate optimized SQL queries.
3. **Generate Visualization**: Real-time rendering of charts based on data patterns.
4. **Export Report**: Generate professional PDF or interactive HTML dashboards.

## Installation

```bash
# Clone the repository
git clone https://github.com/CadanHu/data-analyse-system.git

# Quick Start with Docker (Recommended)
docker-compose up --build
```

## AI-Assisted Analysis

The project is designed to support AI-powered workflows out of the box. You can use the built-in analysis module to get instant insights from any pandas DataFrame.

Example:

```python
import pandas as pd
from ai_analysis import analyze_dataset

# Load your data
df = pd.read_csv("your_data.csv")

# Get AI insights
insights = analyze_dataset(df)
print(insights)
```

---

# 中文文档 (Chinese Documentation)

DataPulse 是一款基于 AI 的全栈数据分析系统，旨在通过自然语言与多种文档输入实现深度的知识提取、结构化分析与商业级可视化报表。

## 🌟 核心特性

- **💎 深度知识提取**: 集成 MinerU 与 OCR，支持扫描版 PDF 与复杂表格高精度识别。
- **📊 智能报告工厂**: 生成基于 ECharts 的深色极客风看板，支持离线 PDF 导出。
- **🧠 交互与反馈闭环**: 支持对话分支管理、重新生成及 Token 精准统计。
- **🛠️ 移动端适配**: 内置调试面板，支持局域网自动探测与实时日志流。

## 🚀 快速启动 (方案 A：Docker)

克隆项目后，在根目录执行：
```bash
docker-compose up --build
```
系统会自动启动所有服务并填充 16万+ 仿真业务数据。

---

## GitHub Topics (Recommended)

To help others find this project, please add these topics to your repository settings:
`data-analysis`, `python`, `automation`, `ai-tools`, `llm`, `fastapi`, `langchain`.
