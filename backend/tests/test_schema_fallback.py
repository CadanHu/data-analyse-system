"""DAT-40: SchemaService 选库兜底 — _current_db_key 为 None 时不再返回 None。

只测纯类方法的 fallback 顺序,不连真实 DB。每个用例还原全局状态(SchemaService
与 DatabaseManager 都是类级单例)。
"""
import os
import sys

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from services.schema_service import SchemaService
from databases.database_manager import DatabaseManager
from config import DATABASES


@pytest.fixture(autouse=True)
def _restore_state():
    saved_key = SchemaService._current_db_key
    saved_configs = dict(DatabaseManager._configs)
    yield
    SchemaService._current_db_key = saved_key
    DatabaseManager._configs = saved_configs


def test_explicit_key_wins():
    SchemaService._current_db_key = "classic_business"
    assert SchemaService.get_current_db_key() == "classic_business"


def test_fallback_to_registered_when_none():
    # 用户未选库 + 注册了一个动态数据源 → 兜底到它
    SchemaService._current_db_key = None
    DatabaseManager._configs = {"user_ds_1": {"type": "mysql", "name": "user_ds_1"}}
    assert SchemaService.get_current_db_key() == "user_ds_1"


def test_fallback_writes_back():
    # 兜底结果应写回,保证后续直接读字段也一致(避免 get_full_schema 仍拿 None)
    SchemaService._current_db_key = None
    DatabaseManager._configs = {"user_ds_1": {"type": "mysql", "name": "user_ds_1"}}
    SchemaService.get_current_db_key()
    assert SchemaService._current_db_key == "user_ds_1"


def test_fallback_to_static_databases_when_nothing_registered():
    # 没有动态注册时退到静态 DATABASES 首个
    SchemaService._current_db_key = None
    DatabaseManager._configs = {}
    assert SchemaService.get_current_db_key() == next(iter(DATABASES))


def test_never_returns_none_with_any_db_available():
    SchemaService._current_db_key = None
    DatabaseManager._configs = {}
    assert SchemaService.get_current_db_key() is not None
