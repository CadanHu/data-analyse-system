"""告警评估 worker — 用 apscheduler 跑 alert_rules.schedule_cron 注册的规则。

设计:
- FastAPI lifespan 启动一个 AsyncIOScheduler，跟 web server 同进程
- 进程启动时从 DB 加载所有 enabled + schedule_cron 非空的规则
- create_rule / update_rule / delete_rule 时通过 sync_job 同步 scheduler

评估器 (evaluate_rule):
  优先级：
  1. threshold_json.mock_value: 人工灌的演示值 (开发/联调用)
  2. widget_id: 从 board_widgets → canvas_node → v2_messages 取 data_json.rows[-1] 的某字段
  3. metric_id: 跑 metric.expression (DSL 解析未做，跳过)

命中阈值就调 alert_services.trigger_event (会自动给订阅者发通知)。
"""
from __future__ import annotations
import asyncio
import logging
from typing import Optional, Dict, Any
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger

logger = logging.getLogger(__name__)

_scheduler: Optional[AsyncIOScheduler] = None
_started: bool = False


def _job_id(rule_id: str) -> str:
    return f'alert-rule-{rule_id}'


def get_scheduler() -> AsyncIOScheduler:
    global _scheduler
    if _scheduler is None:
        _scheduler = AsyncIOScheduler(
            timezone='UTC',
            job_defaults={'coalesce': True, 'max_instances': 1, 'misfire_grace_time': 60},
        )
    return _scheduler


def _compare(op: str, current: float, threshold: float) -> bool:
    if op == '>': return current > threshold
    if op == '>=': return current >= threshold
    if op == '<': return current < threshold
    if op == '<=': return current <= threshold
    if op == '==': return current == threshold
    if op == '!=': return current != threshold
    return False


async def _extract_widget_value(widget_id: str) -> Optional[float]:
    """从 board_widget → canvas_node → v2_messages.data_json 取一个数字。

    简化：data_json 期望是 {rows: [[v1, v2, ...]]}，取 rows[-1][0]。
    """
    from database.v2.base import v2_db
    from database.v2.models import BoardWidgetModel, CanvasNodeModel, V2MessageModel
    from sqlalchemy.future import select

    async with v2_db.async_session() as s:
        res = await s.execute(
            select(V2MessageModel)
            .join(CanvasNodeModel, CanvasNodeModel.message_id == V2MessageModel.id)
            .join(BoardWidgetModel, BoardWidgetModel.source_node_id == CanvasNodeModel.id)
            .where(BoardWidgetModel.id == widget_id)
        )
        msg = res.scalar_one_or_none()
        if not msg or not msg.data_json:
            return None
        data = msg.data_json
        try:
            rows = data.get('rows') if isinstance(data, dict) else None
            if rows and isinstance(rows, list) and len(rows) > 0:
                last = rows[-1]
                if isinstance(last, (list, tuple)) and len(last) > 0:
                    return float(last[0])
                if isinstance(last, (int, float)):
                    return float(last)
        except (ValueError, TypeError, KeyError):
            pass
        return None


async def evaluate_rule(
    rule_id: str, respect_dedupe: bool = True, triggered_by: str = 'cron_worker',
) -> Dict[str, Any]:
    """评估单条规则。返回 {evaluated, fired, value, threshold, reason}。

    respect_dedupe=True (cron 默认): 命中后若距上次 fired_at < rule.dedupe_minutes 则跳过触发。
    respect_dedupe=False (手动 _eval_now): 绕过去重，命中必触发。
    dedupe_minutes=0 表示关闭去重。
    triggered_by: 写进 event.attribution.evaluated_by，标记触发来源 (cron_worker / manual)。
    """
    from datetime import datetime, timedelta
    from database.v2 import alert_services as v2_alert
    rule = await v2_alert.get_rule(rule_id)
    if not rule:
        return {'evaluated': False, 'reason': 'rule_not_found'}
    if not rule.get('enabled'):
        return {'evaluated': False, 'reason': 'disabled'}

    threshold = rule.get('threshold_json') or {}
    op = threshold.get('op', '>')
    threshold_value = threshold.get('value')
    if threshold_value is None:
        return {'evaluated': False, 'reason': 'no_threshold_value'}

    # 取当前值优先级：mock_value → widget → metric (未做)
    current_value: Optional[float] = None
    source = 'mock'
    if 'mock_value' in threshold:
        try:
            current_value = float(threshold['mock_value'])
        except (ValueError, TypeError):
            current_value = None
    if current_value is None and rule.get('widget_id'):
        current_value = await _extract_widget_value(rule['widget_id'])
        source = 'widget'
    if current_value is None:
        return {'evaluated': False, 'reason': 'no_current_value (设 threshold.mock_value 或绑 widget)'}

    try:
        thr = float(threshold_value)
    except (ValueError, TypeError):
        return {'evaluated': False, 'reason': 'threshold_not_numeric'}

    fired = _compare(op, current_value, thr)
    out: Dict[str, Any] = {
        'evaluated': True,
        'fired': fired,
        'value': current_value,
        'threshold': thr,
        'op': op,
        'source': source,
    }

    if fired:
        # 去重窗口：cron 评估时，若距上次触发 < dedupe_minutes 则跳过（不写事件/不发通知）。
        # 手动 _eval_now (respect_dedupe=False) 与 dedupe_minutes<=0 均绕过。
        dedupe_minutes = rule.get('dedupe_minutes') or 0
        if respect_dedupe and dedupe_minutes > 0:
            last_fired = await v2_alert.get_last_event_fired_at(rule_id)
            if last_fired is not None:
                elapsed = datetime.utcnow() - last_fired
                if elapsed < timedelta(minutes=dedupe_minutes):
                    out['fired'] = False
                    out['skipped'] = 'deduped'
                    out['dedupe_minutes'] = dedupe_minutes
                    out['last_fired_at'] = last_fired.isoformat()
                    return out

        severity = threshold.get('severity', 'warn')
        event = await v2_alert.trigger_event(
            rule_id=rule_id,
            current_value=f'{current_value}',
            threshold_value=f'{op}{thr}',
            severity=severity,
            attribution={'source': source, 'evaluated_by': triggered_by},
        )
        out['event_id'] = event.get('id')
    return out


# ============================================================
# Scheduler 生命周期
# ============================================================

async def _scheduled_eval(rule_id: str):
    """scheduler 内部调用的入口 — 静默吞掉异常以免污染调度器。"""
    try:
        result = await evaluate_rule(rule_id)
        if result.get('fired'):
            logger.info(f'[alert-worker] rule {rule_id[:8]} FIRED: {result}')
        elif result.get('evaluated'):
            logger.debug(f'[alert-worker] rule {rule_id[:8]} ok: {result}')
    except Exception as e:
        logger.warning(f'[alert-worker] rule {rule_id[:8]} eval crashed: {e}')


def sync_job(rule: Dict[str, Any]) -> bool:
    """根据规则当前状态注册 / 更新 / 删除调度 job。返回 True 表示有 job 在跑。"""
    scheduler = get_scheduler()
    rid = rule['id']
    jid = _job_id(rid)
    cron_expr = rule.get('schedule_cron')

    # 先尝试删除旧 job
    if scheduler.get_job(jid):
        scheduler.remove_job(jid)

    if not rule.get('enabled') or not cron_expr:
        return False
    try:
        trigger = CronTrigger.from_crontab(cron_expr)
    except Exception as e:
        logger.warning(f'[alert-worker] rule {rid[:8]} cron {cron_expr!r} 解析失败: {e}')
        return False
    scheduler.add_job(_scheduled_eval, trigger=trigger, args=[rid], id=jid, replace_existing=True)
    logger.info(f'[alert-worker] 注册 cron job rule={rid[:8]} cron={cron_expr!r}')
    return True


def remove_job(rule_id: str) -> None:
    scheduler = get_scheduler()
    jid = _job_id(rule_id)
    if scheduler.get_job(jid):
        scheduler.remove_job(jid)


async def start_worker():
    """从 DB 加载所有规则并启动 scheduler。"""
    global _started
    if _started:
        return
    from database.v2 import alert_services as v2_alert
    from database.v2.base import v2_db
    from database.v2.models import AlertRuleModel
    from sqlalchemy.future import select

    scheduler = get_scheduler()
    try:
        # 列所有规则（不限 workspace）
        async with v2_db.async_session() as s:
            res = await s.execute(select(AlertRuleModel))
            rules = [{c.name: getattr(r, c.name) for c in r.__table__.columns} for r in res.scalars().all()]

        loaded = 0
        for r in rules:
            if sync_job(r):
                loaded += 1
        scheduler.start()
        _started = True
        print(f'✅ alert worker 启动，注册 {loaded} 条规则 (共 {len(rules)} 条)')
    except Exception as e:
        print(f'⚠️ [alert-worker] 启动失败 (吞掉): {e}')


def stop_worker():
    global _started
    if not _started:
        return
    try:
        get_scheduler().shutdown(wait=False)
        _started = False
        print('📥 alert worker 已关闭')
    except Exception as e:
        print(f'⚠️ [alert-worker] 关闭失败: {e}')
