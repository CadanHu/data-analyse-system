"""DAT-29 — 月度结算 worker。

复用阶段 9 alert_worker 的 AsyncIOScheduler 单例,注册一个每月 1 号(UTC)跑的
job:聚合上月 usage_counters → 按套餐+用量算钱 → 写 draft invoice。usage_counters
保留不删。

设计与 alert_worker 对齐:
- lifespan 在 alert_worker.start_worker()(已 scheduler.start())之后调本模块 start_worker(),
  仅 add_job,不重复 start。apscheduler 支持运行时加 job。
- _scheduled_close 静默吞异常,不污染调度器。
- 手动补跑走 close_month(respect 幂等),由 router 端点调用。
"""
from __future__ import annotations
import logging
from datetime import datetime, timezone
from typing import Any, Dict

from apscheduler.triggers.cron import CronTrigger

logger = logging.getLogger(__name__)

_JOB_ID = 'billing-monthly-close'
_started = False


def _prev_period_yyyymm(now: datetime | None = None) -> str:
    """当前时间的「上一个自然月」YYYY-MM(cron 在某月 1 号跑,结算上月)。"""
    now = now or datetime.now(timezone.utc)
    year, month = now.year, now.month
    if month == 1:
        return f'{year - 1}-12'
    return f'{year}-{month - 1:02d}'


async def close_month(
    period_yyyymm: str, *, actor_user_id: int = 0, triggered_by: str = 'cron',
) -> Dict[str, Any]:
    """对所有有订阅的 workspace 结算指定 period,幂等写 draft invoice。

    返回 {period, triggered_by, workspaces, created, updated, skipped, errors, ok}。
    失败重试 1 次;无论成败写一条 monthly_close 审计;不向上抛异常。
    """
    from database.v2 import billing_services as v2_bill
    from services.billing_pricing import compute_invoice

    counts = {'created': 0, 'updated': 0, 'skipped': 0, 'errors': 0}
    total_ws = 0
    last_err: Exception | None = None

    for attempt in (1, 2):
        counts = {'created': 0, 'updated': 0, 'skipped': 0, 'errors': 0}
        try:
            workspaces = await v2_bill.list_workspaces_with_subscription()
            total_ws = len(workspaces)
            for ws_id, plan in workspaces:
                try:
                    usage = await v2_bill.get_usage(ws_id, period_yyyymm)
                    amount, items = compute_invoice(plan, usage)
                    _, action = await v2_bill.upsert_draft_invoice(
                        ws_id, period_yyyymm, amount, items,
                    )
                    counts[action] += 1
                except Exception as e:  # 单个 ws 失败不拖垮整批
                    counts['errors'] += 1
                    logger.warning(f'[billing-worker] ws {ws_id[:8]} 结算失败: {e}')
            last_err = None
            break
        except Exception as e:  # 整批失败(如列订阅失败)→ 重试 1 次
            last_err = e
            logger.warning(f'[billing-worker] close_month 第 {attempt} 次失败: {e}')

    result: Dict[str, Any] = {
        'period': period_yyyymm, 'triggered_by': triggered_by,
        'workspaces': total_ws, **counts, 'ok': last_err is None,
    }
    if last_err is not None:
        result['error'] = str(last_err)

    # 审计:无论成败都记一条,失败也不阻塞
    try:
        from database.v2 import audit_services as v2_audit
        await v2_audit.write(
            actor_user_id, 'monthly_close',
            target_type='billing', target_id=period_yyyymm, diff=result,
        )
    except Exception as e:
        logger.warning(f'[billing-worker] 写审计失败(忽略): {e}')

    logger.info(f'[billing-worker] close_month {period_yyyymm} → {result}')
    return result


async def _scheduled_close():
    """scheduler 入口 — 结算上月,静默吞异常。"""
    try:
        await close_month(_prev_period_yyyymm(), actor_user_id=0, triggered_by='cron')
    except Exception as e:
        logger.warning(f'[billing-worker] 月结 job crashed: {e}')


def register(scheduler) -> None:
    """注册每月 1 号 00:00 UTC 的月结 job。"""
    scheduler.add_job(
        _scheduled_close,
        trigger=CronTrigger.from_crontab('0 0 1 * *', timezone='UTC'),
        id=_JOB_ID, replace_existing=True,
    )
    print('✅ monthly billing worker registered (cron 0 0 1 * * UTC)')


async def start_worker():
    """把月结 job 加进 alert_worker 已启动的 scheduler 单例。"""
    global _started
    if _started:
        return
    try:
        from services.alert_worker import get_scheduler
        register(get_scheduler())
        _started = True
    except Exception as e:
        print(f'⚠️ [billing-worker] 启动失败 (吞掉): {e}')


def stop_worker():
    """移除月结 job(scheduler 本身由 alert_worker.stop_worker 关闭)。"""
    global _started
    if not _started:
        return
    try:
        from services.alert_worker import get_scheduler
        sched = get_scheduler()
        if sched.get_job(_JOB_ID):
            sched.remove_job(_JOB_ID)
    except Exception:
        pass
    _started = False
