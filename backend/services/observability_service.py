"""
可观测性服务 (Phase 5)
Agent 执行日志和性能监控
"""
from typing import Dict, Any, List, Optional
from datetime import datetime
import json


class ObservabilityService:
    """可观测性服务（骨架）"""

    def __init__(self):
        self._logs: List[Dict[str, Any]] = []
        self._metrics: Dict[str, Any] = {}

    def log_agent_execution(self, agent_name: str, input_data: Dict, output_data: Dict, duration: float):
        """记录 Agent 执行"""
        log_entry = {
            "timestamp": datetime.now().isoformat(),
            "agent": agent_name,
            "input": input_data,
            "output": output_data,
            "duration_seconds": duration
        }
        self._logs.append(log_entry)
        print(f"[Observability] Agent 执行日志: {agent_name}, 耗时: {duration:.2f}s")

    def log_tool_call(self, tool_name: str, input_args: Dict, output: Any, duration: float):
        """记录工具调用"""
        print(f"[Observability] 工具调用: {tool_name}, 耗时: {duration:.2f}s")

    def record_metric(self, metric_name: str, value: float, tags: Optional[Dict] = None):
        """记录性能指标"""
        key = metric_name
        if key not in self._metrics:
            self._metrics[key] = []
        self._metrics[key].append({
            "value": value,
            "timestamp": datetime.now().isoformat(),
            "tags": tags or {}
        })

    def get_recent_logs(self, limit: int = 100) -> List[Dict[str, Any]]:
        """获取最近的日志"""
        return self._logs[-limit:]

    def get_metrics(self, metric_name: Optional[str] = None) -> Dict[str, Any]:
        """获取性能指标"""
        if metric_name:
            return {metric_name: self._metrics.get(metric_name, [])}
        return self._metrics.copy()


observability = ObservabilityService()
