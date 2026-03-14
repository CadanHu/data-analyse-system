"""
SQL 执行服务
"""
import asyncio
import re
from typing import List, Dict, Any, Optional
from config import MAX_SQL_EXECUTION_TIME
from services.schema_service import SchemaService
from databases.database_manager import DatabaseManager


class SQLExecutor:
    @staticmethod
    def validate_sql(sql: str) -> tuple[bool, Optional[str]]:
        # 移除前导空白和注释
        clean_sql = re.sub(r'(--.*|/\*[\s\S]*?\*/)', '', sql).strip()
        sql_lower = clean_sql.lower()
        
        # 使用正则表达式确保关键字是独立的单词
        forbidden_keywords = ['insert', 'update', 'delete', 'drop', 'alter', 'create', 'truncate', 'replace']
        for keyword in forbidden_keywords:
            pattern = rf'\b{keyword}\b'
            if re.search(pattern, sql_lower):
                return False, f"禁止使用 {keyword.upper()} 操作，只允许查询类操作"
        
        # 允许的查询前缀
        allowed_prefixes = ('select', 'show', 'describe', 'desc', 'explain', 'with')
        if not sql_lower.startswith(allowed_prefixes):
            return False, "只允许 SELECT, WITH, SHOW, DESC 或 EXPLAIN 查询"
        
        return True, None

    @staticmethod
    async def execute_sql(sql: str, timeout: int = MAX_SQL_EXECUTION_TIME) -> Dict[str, Any]:
        is_valid, error_msg = SQLExecutor.validate_sql(sql)
        if not is_valid:
            raise ValueError(error_msg)

        try:
            async def execute():
                db_key = SchemaService.get_current_db_key()
                adapter = DatabaseManager.get_adapter(db_key)
                
                if not adapter:
                    raise ValueError(f"无法获取数据库适配器: {db_key}")
                
                if not adapter.connected:
                    await adapter.connect()
                
                # 只有 MySQL 需要转义 % (防止 aiomysql 占位符解析错误)
                escaped_sql = sql
                if "mysql" in db_key.lower():
                    escaped_sql = sql.replace("%", "%%")
                
                print(f"📡 [Database] 准备执行 SQL: {escaped_sql}")
                
                rows = await adapter.execute_query(escaped_sql)
                
                if not rows:
                    return {
                        "columns": [],
                        "rows": [],
                        "row_count": 0
                    }
                
                columns = list(rows[0].keys()) if rows else []
                
                return {
                    "columns": columns,
                    "rows": rows,
                    "row_count": len(rows)
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
