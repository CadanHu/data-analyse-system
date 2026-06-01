"""DAT-32: 全局搜索 _like 通配符转义 — 防止用户输入的 % _ \\ 被当成 LIKE 通配符。"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from database.v2.search_services import _like


def test_plain_text_wrapped():
    assert _like('sales') == '%sales%'


def test_percent_escaped():
    assert _like('50%') == '%50\\%%'


def test_underscore_escaped():
    assert _like('a_b') == '%a\\_b%'


def test_backslash_escaped_first():
    # 反斜杠必须先转义,否则会把后续转义的反斜杠再吃掉
    assert _like('a\\b') == '%a\\\\b%'


def test_combined():
    assert _like('100%_\\x') == '%100\\%\\_\\\\x%'
