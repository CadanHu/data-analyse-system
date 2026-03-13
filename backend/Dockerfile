FROM python:3.11-slim

WORKDIR /app

# 安装系统依赖
RUN apt-get update && apt-get install -y \
    gcc \
    curl \
    && rm -rf /var/lib/apt/lists/*

# 复制依赖文件
COPY requirements.txt .

# 🚀 核心优化：强制安装 CPU 版 Torch (约 150MB)
# 这一步会拦截所有依赖项，防止它们去下载 3GB 的 CUDA 版本
RUN pip install --no-cache-dir torch --index-url https://download.pytorch.org/whl/cpu

# 安装其余 Python 依赖 (使用清华镜像源加速)
RUN pip install --no-cache-dir -i https://pypi.tuna.tsinghua.edu.cn/simple --upgrade pip && \
    pip install --no-cache-dir -i https://pypi.tuna.tsinghua.edu.cn/simple -r requirements.txt

# 复制应用代码
COPY . .

# 创建数据目录
RUN mkdir -p /app/data /app/logs

# 暴露端口
EXPOSE 8000

# 启动命令
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
