# 数据分析系统 - 重启与测试全指南

本指南涵盖了在修改代码后，如何正确重启后端、前端及 iOS 端服务，并包含了清理缓存和验证功能的方法。

---

## 1. 后端服务 (Python / FastAPI)
**场景**：修改了 `agents/`, `routers/`, `services/`, `models/` 或 `config.py`。

### 推荐启动命令 (手动指定端口 8003)
由于 `main.py` 内部可能默认 8000，**请务必使用以下命令**以确保端口正确：
```bash
cd backend
source venv312/bin/activate
# 强烈推荐：手动指定 8003 端口
python3 -m uvicorn main:app --host 0.0.0.0 --port 8003 --reload
```

### 备选启动命令 (仅限调试)
```bash
# 注意：此命令默认端口可能为 8000
python main.py
```

### 数据库变更验证
如果修改了数据库结构（如新增了 `thinking` 字段）：
```bash
# 运行专门的验证脚本
python verify_thinking_db.py
```

### 调试建议
- 观察终端输出：查看 `📡 [Database]`, `🧠 [DeepSeek Thinking]` 等关键日志。
- 检查 `.env` 文件中的 `MODEL_NAME` 是否为 `deepseek-reasoner`。

---

## 2. 前端服务 (Vite / React)
**场景**：修改了 `src/` 下的组件、Hooks 或 Stores。

### 开发模式启动
```bash
cd frontend
npm run dev
```

### 彻底清理并重新启动 (遇到奇怪的样式或状态问题时)
```bash
cd frontend
rm -rf node_modules/.vite
npm run dev
```

---

## 3. iOS 移动端 (Capacitor)
**场景**：修改了前端代码，需要在真机或模拟器上查看效果。

### 同步前端构建到 iOS 工程
```bash
cd frontend
# 1. 构建前端产物
npm run build
# 2. 将产物同步到 ios 文件夹
npx cap sync ios
```

### 运行 iOS 应用
- **使用 Xcode**:
  1. `npx cap open ios` (打开 Xcode)
  2. 在 Xcode 中点击左上角的 **Run** (播放图标) 按钮。
- **命令行运行**:
  ```bash
  npx cap run ios
  ```

### 常见问题排除
- **白屏或内容不更新**: 确保运行了 `npm run build` 和 `npx cap sync ios`。
- **API 连接失败**: iOS 模拟器通常无法直接访问 `localhost`，请在 `useSSE.ts` 中检查 API 路径，使用 `http://127.0.0.1:8003` 或您的局域网 IP。

---

## 4. 思考模式 (DeepSeek R1) 测试要点
1. **确认模型**: `backend/config.py` 中的 `MODEL_NAME` 必须是 `deepseek-reasoner`。
2. **确认开关**: 前端输入框右侧的 "思考模式" 按钮必须是高亮状态。
3. **确认流式内容**: 观察是否有 `Thinking Process` 气泡流式出现。
4. **数据库验证**: 运行 `python backend/verify_thinking_db.py` 确认 `thinking` 字段非空。

---

## 5. 分支同步
如果您在某个分支完成了功能，记得同步到其他分支：
```bash
git checkout main
git merge <your-feature-branch>
git checkout <other-branch>
git merge main
```
