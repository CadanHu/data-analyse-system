import ast
import pandas as pd
import numpy as np
import traceback
import io
import contextlib
import base64
import matplotlib
matplotlib.use('Agg') # 禁用 GUI
import matplotlib.pyplot as plt
import seaborn as sns
from typing import Dict, Any, List, Optional
from utils.logger import logger
from utils.json_utils import json_dumps

class PythonExecutor:
    """
    AI Data Agent 的 Python 代码执行沙盒 (带 AST 安全审计)
    AI Data Agent Python Sandbox (with AST security audit)
    """
    
    # 允许的库列表
    ALLOWED_MODULES = {'pd', 'np', 'plt', 'sns', 'sklearn', 'scipy', 'statsmodels', 'json', 'datetime'}
    # 禁用的危险函数/类
    BLOCKED_NODES = {ast.Import, ast.ImportFrom, ast.Call}

    @staticmethod
    def _is_safe(code: str) -> bool:
        """简单的 AST 安全审计 / Simple AST security audit"""
        try:
            # 🚀 预清洗：替换 AI 可能生成的“智能引号”或特殊不可见字符
            code = code.replace('‘', "'").replace('’', "'").replace('“', '"').replace('”', '"')
            
            tree = ast.parse(code)
            for node in ast.walk(tree):
                # 拦截 import
                if isinstance(node, ast.Import):
                    for name in node.names:
                        base_mod = name.name.split('.')[0]
                        if base_mod not in ['pandas', 'numpy', 'matplotlib', 'seaborn', 'sklearn', 'scipy', 'statsmodels', 'json', 'datetime']:
                            return False, f"Import forbidden (禁止导入模块): {name.name}"
                
                if isinstance(node, ast.ImportFrom):
                    if node.module:
                        base_mod = node.module.split('.')[0]
                        if base_mod not in ['pandas', 'numpy', 'matplotlib', 'seaborn', 'sklearn', 'scipy', 'statsmodels', 'json', 'datetime']:
                            return False, f"Import from forbidden (禁止从该模块导入): {node.module}"
                
                # 拦截 eval, exec, system 等
                if isinstance(node, ast.Call) and isinstance(node.func, ast.Name):
                    if node.func.id in ['eval', 'exec', 'open', 'getattr', 'setattr', 'delattr']:
                        return False, f"Function call forbidden (禁止调用函数): {node.func.id}"
            return True, None
        except Exception as e:
            return False, f"AST Parse Error (AST 解析错误): {str(e)}"

    @staticmethod
    def _clean_result(obj: Any) -> Any:
        """递归清理结果数据，确保所有键值对都能被 JSON 序列化"""
        from datetime import date, datetime
        from decimal import Decimal

        if isinstance(obj, dict):
            # 关键修复：强制将所有字典键转为字符串，防止 Period/Timestamp 键导致 JSON 报错
            return {str(k): PythonExecutor._clean_result(v) for k, v in obj.items()}
        elif isinstance(obj, (list, tuple, set)):
            return [PythonExecutor._clean_result(i) for i in obj]
        elif isinstance(obj, (datetime, date)):
            return obj.isoformat()
        elif hasattr(obj, 'to_timestamp'): # 处理 Pandas Period 等
            try:
                return obj.to_timestamp().isoformat()
            except:
                return str(obj)
        elif isinstance(obj, Decimal):
            return float(obj)
        elif isinstance(obj, (np.int64, np.int32, np.int_, np.intc)):
            return int(obj)
        elif isinstance(obj, (np.float64, np.float32, np.float16)):
            return float(obj)
        elif isinstance(obj, pd.DataFrame):
            # 填补空缺，将 DataFrame 转为前端表格依赖的行数据结构
            return PythonExecutor._clean_result(obj.reset_index().to_dict(orient='records'))
        elif isinstance(obj, pd.Series):
            return PythonExecutor._clean_result(obj.to_dict())
        elif isinstance(obj, np.ndarray):
            return PythonExecutor._clean_result(obj.tolist())
        elif pd.isna(obj) if hasattr(pd, 'isna') else False:
            return None
        return obj

    @staticmethod
    def execute_analysis(df_input: Any, code: str) -> Dict[str, Any]:
        """执行代码并返回数据、图表配置和日志"""
        # 🚀 预清洗：彻底替换 AI 可能生成的“智能引号”或特殊中文标点
        replacements = {
            '‘': "'", '’': "'", '“': '"', '”': '"',
            '，': ',', '：': ':', '；': ';', '！': '!',
            '（': '(', '）': ')', '—': '-', '。': '.'
        }
        for old, new in replacements.items():
            code = code.replace(old, new)
        
        # 0. 安全审计
        is_safe, error_msg = PythonExecutor._is_safe(code)
        if not is_safe:
            return {"success": False, "error": f"Security audit failed (安全审计失败): {error_msg}"}

        # 1. 准备执行环境
        exec_globals = {
            'pd': pd,
            'np': np,
            'plt': plt,
            'sns': sns,
            'result_data': None,
            'viz_config': None,
            'summary_text': ""
        }
        
        # 🚀 字体兼容：强制使用 DejaVu Sans (英文) 避免中文显示为方块
        # 理由：系统环境可能缺失中文字体，导致渲染失败。
        plt.rcParams['font.sans-serif'] = ['DejaVu Sans', 'Arial', 'Helvetica', 'sans-serif']
        plt.rcParams['axes.unicode_minus'] = False 
        
        # 💡 提示：所有生成的图表标题 (Title)、轴标签 (Labels) 和图例 (Legend) 请务必使用英文。
        
        # 注入数据集
        if isinstance(df_input, dict):
            exec_globals.update(df_input)
            if df_input:
                exec_globals['df'] = list(df_input.values())[0]
        else:
            exec_globals['df'] = df_input
        
        stdout = io.StringIO()
        plt.clf() 
        
        try:
            with contextlib.redirect_stdout(stdout):
                exec(code, exec_globals)
            
            # 🚀 捕获图表：增强版捕获逻辑
            plot_base64 = None
            try:
                # 检查是否有活跃的 Figure，或者当前 Figure 是否有内容（轴）
                fig = plt.gcf()
                if fig and fig.get_axes():
                    logger.info(f"🎨 [Executor] Active chart detected, rendering... (检测到活跃图表，正在渲染...)")
                    buf = io.BytesIO()
                    fig.savefig(buf, format='png', bbox_inches='tight', dpi=100)
                    buf.seek(0)
                    plot_base64 = base64.b64encode(buf.read()).decode('utf-8')
                    logger.info(f"✅ [Executor] Chart captured successfully (图表捕获成功), len: {len(plot_base64)}")
                    plt.close('all')
                else:
                    logger.info("⚠️ [Executor] No valid plot output detected (未检测到有效绘图输出)")
            except Exception as e:
                logger.error(f"❌ [Executor] Chart capture failed (绘图捕获失败): {str(e)}")

            # 🚀 关键：在返回前清理所有数据
            return {
                "success": True,
                "stdout": stdout.getvalue(),
                "data": PythonExecutor._clean_result(exec_globals.get('result_data')),
                "viz_config": PythonExecutor._clean_result(exec_globals.get('viz_config')),
                "summary": exec_globals.get('summary_text', ""),
                "plot_image": plot_base64
            }
        except Exception:
            err_traceback = traceback.format_exc()
            logger.error(f"❌ [Executor] Execution crashed (代码执行崩溃):\n{err_traceback}")
            return {
                "success": False,
                "error": err_traceback,
                "stdout": stdout.getvalue()
            }

    @staticmethod
    def generate_initial_context(df: pd.DataFrame) -> str:
        """为 AI 提供数据集的初始上下文"""
        from utils.json_utils import json_dumps
        buffer = io.StringIO()
        df.info(buf=buffer)
        info_str = buffer.getvalue()
        
        sample = df.head(3).to_dict(orient='records')
        description = df.describe(include='all').to_dict()
        
        context = f"""
[Dataset Metadata / 数据集元数据]
{info_str}

[Data Sample (First 3 rows) / 数据样本 (前3行)]
{json_dumps(sample, indent=2)}

[Statistical Description / 统计描述]
{json_dumps(description, indent=2)}
"""
        return context

python_executor = PythonExecutor()
