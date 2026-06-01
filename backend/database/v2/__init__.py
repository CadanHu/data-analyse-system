"""v2 数据库 (data_pulse_v2)。

承载 v2 设计稿的全部新模块：workspaces / canvas_nodes / boards / alerts / audit / billing / settings / ...
与旧 data_pulse_sessions 物理隔离，互不影响。

详见 data-sys-docs/v2-schema.md。
"""
from .base import v2_db, V2Base

__all__ = ["v2_db", "V2Base"]
