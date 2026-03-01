import financedatabase as fd
import pandas as pd
from sqlalchemy import create_engine
import sys
import os
from pathlib import Path

# 1. 加载配置
sys.path.insert(0, str(Path(__file__).parent))
from backend.config import DATABASES

def get_pg_url():
    conf = DATABASES.get("postgres_example")
    user = conf['user']
    password = conf['password']
    host = conf['host']
    port = conf['port']
    db = conf['database']
    return f"postgresql://{user}:{password}@{host}:{port}/{db}"

def import_data():
    engine = create_engine(get_pg_url())
    print("🚀 开始从 FinanceDatabase 获取数据...")

    # --- 1. 股票数据 (Equities) ---
    print("📥 获取全球股票数据...")
    try:
        equities = fd.Equities().select()
        equities = equities.reset_index()
        # 限制前 10000 条
        equities_sample = equities.head(10000)
        print(f"✅ 获取到 {len(equities)} 条，导入 10000 条...")
        equities_sample.to_sql('equities', engine, if_exists='replace', index=False)
        print("🎉 股票数据导入成功！")
    except Exception as e:
        print(f"❌ 股票数据失败: {e}")

    # --- 2. ETF 数据 ---
    print("📥 获取 ETF 数据...")
    try:
        etfs = fd.ETFs().select()
        etfs = etfs.reset_index().head(5000)
        etfs.to_sql('etfs', engine, if_exists='replace', index=False)
        print("🎉 ETF 数据导入成功！")
    except Exception as e:
        print(f"❌ ETF 数据失败: {e}")

    # --- 3. 加密货币数据 ---
    print("📥 获取加密货币数据...")
    try:
        cryptos = fd.Cryptos().select()
        cryptos = cryptos.reset_index().head(2000)
        cryptos.to_sql('cryptos', engine, if_exists='replace', index=False)
        print("🎉 加密货币数据导入成功！")
    except Exception as e:
        print(f"❌ 加密货币数据失败: {e}")

    print("✨ 所有金融数据导入完成！")

if __name__ == "__main__":
    import_data()
