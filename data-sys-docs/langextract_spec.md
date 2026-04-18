# LangExtract 核心规范文档 (Specification)

## 1. 输入规范 (Input Specification)

LangExtract 的 Pipeline (`lx.extract`) 采用灵活的输入机制，主要支持以下三类输入：

### 1.1 输入类型
- **纯文本 (Literal Text):** 直接传递一个字符串。
- **URL 地址:** 传递以 `http://` 或 `https://` 开头的字符串。系统会自动下载该 URL 指向的内容（默认为文本、JSON 或 XML）。
- **文档对象迭代器 (Iterable[Document]):** 传递一组 `langextract.core.data.Document` 对象，每个对象包含 `text` 和 `document_id`。

### 1.2 核心参数要求
- **prompt_description (必填):** 描述提取任务的指令字符串。
- **examples (必填):** 至少包含一个 `lx.data.ExampleData` 对象。每个对象必须包含：
    - `text`: 示例源文本。
    - `extractions`: 预期的提取结果列表（`Extraction` 对象），且 `extraction_text` 必须在 `text` 中**原文出现**以确保对齐。

### 1.3 处理配置
- **max_char_buffer:** 单次推理的最大字符数（默认 1000），用于自动分块。
- **extraction_passes:** 提取轮次（默认 1），增加轮次可提高复杂文档的查全率。

---

## 2. 模型接入规范 (Model Integration)

LangExtract 通过插件化架构支持多种文本模型，核心基类为 `base_model.BaseLanguageModel`。

### 2.1 已支持的模型类型
- **Google Gemini (推荐):** 支持 `gemini-2.0-flash`, `gemini-1.5-pro` 等。通过 `google-genai` SDK 接入，支持严格的 JSON Schema 约束。
- **OpenAI:** 支持 `gpt-4o` 等。通过 OpenAI SDK 接入，目前主要依赖 Prompt 工程进行格式化。
- **Ollama (本地):** 支持 `gemma2`, `llama3` 等本地模型。
- **自定义模型:** 支持通过 `@registry.register` 装饰器注册自定义 Provider。

### 2.2 接入要求
- **API Key:** 需配置环境变量 `LANGEXTRACT_API_KEY` 或在调用时传递 `api_key` 参数。
- **结构化能力:** 优先选择支持 `response_schema` 或 `controlled generation` 的模型。
- **协议:** 模型接口需能处理长文本分块后的并发请求 (`max_workers`)。

---

## 3. 输出数据格式规范 (Output Specification)

Pipeline 的最终产物是 `AnnotatedDocument` 对象（或其列表），通常序列化为 **JSONL** 格式。

### 3.1 核心数据结构
每个提取记录包含以下关键字段：
- **document_id:** 源文档的唯一标识符。
- **text:** 原始输入文本。
- **extractions:** 提取结果列表，每个元素包含：
    - **extraction_class:** 实体或关系的类别（如 "character", "medication"）。
    - **extraction_text:** 从原文中提取的原始文本片段。
    - **attributes:** 键值对字典，包含 LLM 推理出的属性（如 "dosage", "emotion"）。
    - **range:** 包含 `start` 和 `end` 索引，精确定位该片段在原文中的位置。

### 3.2 序列化示例 (JSONL)
```json
{
  "document_id": "doc_001",
  "text": "Patient took 50mg of Aspirin...",
  "extractions": [
    {
      "extraction_class": "medication",
      "extraction_text": "Aspirin",
      "attributes": {"dosage": "50mg"},
      "range": {"start": 20, "end": 27}
    }
  ]
}
```

### 3.3 可视化输出
支持通过 `lx.visualize` 将 JSONL 转换为带高亮显示的交互式 **HTML** 报告。
