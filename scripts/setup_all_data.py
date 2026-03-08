import os
import subprocess
import sys
from pathlib import Path

def run_script(script_path):
    print(f"执行脚本: {script_path} ...")
    # 使用当前 Python 解释器运行
    result = subprocess.run([sys.executable, script_path], capture_output=True, text=True)
    if result.returncode == 0:
        print(f"✅ {script_path} 执行成功")
    else:
        print(f"❌ {script_path} 执行失败")
        print(result.stderr)

def main():
    base_dir = Path(__file__).parent.parent
    scripts_dir = base_dir / "scripts"
    
    # 定义执行顺序 (必须先初始化基础，再进行企业级增强和优化)
    pipeline = [
        scripts_dir / "init_classic_business.py",
        scripts_dir / "init_global_analysis.py",
        scripts_dir / "upgrade_to_enterprise_db.py",
        scripts_dir / "ultimate_db_optimization.py",
        scripts_dir / "full_db_enterprise_sync.py"
    ]
    
    print("🌟 正在一键构建企业级仿真数据库环境...")
    print("------------------------------------------")
    
    for script in pipeline:
        if script.exists():
            run_script(str(script))
        else:
            print(f"⚠️ 跳过缺失的脚本: {script.name}")
            
    print("------------------------------------------")
    print("🎉 所有数据库已就绪！")
    print("   - MySQL: test, classic_business, global_analysis")
    print("   - PostgreSQL: postgres")

if __name__ == "__main__":
    main()
