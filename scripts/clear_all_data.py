import os
import sys
import asyncio
from pathlib import Path

# 添加 backend 到 sys.path
BASE_DIR = Path(__file__).resolve().parent.parent
sys.path.append(str(BASE_DIR / "backend"))

async def clear_all():
    print("🧹 开始清理所有测试数据...")
    
    # 1. 清理 ChromaDB 向量数据库
    try:
        from services.vector_store import VectorStore
        vs = VectorStore()
        vs.delete_all()
        print("✅ 已成功清空 ChromaDB 向量数据库")
    except Exception as e:
        print(f"❌ 清空 ChromaDB 失败: {str(e)}")

    # 2. 清理 PostgreSQL 知识库
    try:
        from database.knowledge_db import knowledge_db
        await knowledge_db.delete_all()
    except Exception as e:
        print(f"❌ 清空 PostgreSQL 失败: {str(e)}")

    # 3. 可选：清理上传的文件
    # UPLOAD_DIR = BASE_DIR / "backend" / "uploads"
    # if UPLOAD_DIR.exists():
    #     for f in UPLOAD_DIR.glob("*"):
    #         if f.is_file() and f.name != ".gitkeep":
    #             f.unlink()
    #     print(f"✅ 已清空上传目录: {UPLOAD_DIR}")

    print("\n✨ 清理完成！您可以开启全新的测试了。")

if __name__ == "__main__":
    asyncio.run(clear_all())
