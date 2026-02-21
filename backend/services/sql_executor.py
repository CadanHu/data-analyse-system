"""
SQL 执行服务
"""
import aiosqlite
import asyncio
from typing import List, Dict, Any, Optional
from config import BUSINESS_DB_PATH, MAX_SQL_EXECUTION_TIME


class SQLExecutor:
    @staticmethod
    def validate_sql(sql: str) -> tuple[bool, Optional[str]]:
        sql_lower = sql.strip().lower()
        
        forbidden_keywords = ['insert', 'update', 'delete', 'drop', 'alter', 'create', 'truncate', 'replace']
        for keyword in forbidden_keywords:
            if keyword in sql_lower:
                return False, f"禁止使用 {keyword.upper()} 操作，只允许 SELECT 查询"
        
        if not sql_lower.startswith('select'):
            return False, "只允许 SELECT 查询"
        
        return True, None

    @staticmethod
    async def execute_sql(sql: str, timeout: int = MAX_SQL_EXECUTION_TIME) -> Dict[str, Any]:
        is_valid, error_msg = SQLExecutor.validate_sql(sql)
        if not is_valid:
            raise ValueError(error_msg)

        try:
            async def execute():
                async with aiosqlite.connect(BUSINESS_DB_PATH) as conn:
                    conn.row_factory = aiosqlite.Row
                    async with conn.execute(sql) as cursor:
                        rows = await cursor.fetchall()
                        columns = [desc[0] for desc in cursor.description] if cursor.description else []
                        
                        result_rows = []
                        for row in rows:
                            result_rows.append(dict(row))
                        
                        return {
                            "columns": columns,
                            "rows": result_rows,
                            "row_count": len(result_rows)
                        }
            
            result = await asyncio.wait_for(execute(), timeout=timeout)
            return result
        except asyncio.TimeoutError:
            raise TimeoutError(f"SQL 查询超时（超过 {timeout} 秒），请优化查询条件")
        except Exception as e:
            raise RuntimeError(f"SQL 执行失败: {str(e)}")

    @staticmethod
    def format_sql_result(result: Dict[str, Any], max_rows: int = 50) -> str:
        if not result or not result["rows"]:
            return "查询结果为空"
        
        columns = result["columns"]
        rows = result["rows"][:max_rows]
        
        lines = []
        lines.append("| " + " | ".join(columns) + " |")
        lines.append("|" + "|".join(["---"] * len(columns)) + "|")
        
        for row in rows:
            values = [str(row.get(col, "")) for col in columns]
            lines.append("| " + " | ".join(values) + " |")
        
        if len(result["rows"]) > max_rows:
            lines.append(f"\n... 还有 {len(result['rows']) - max_rows} 行数据")
        
        return "\n".join(lines)
