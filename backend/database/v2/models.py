"""阶段 1：模块 1（用户扩展，5 表）+ 模块 2（工作区，2 表）SQLAlchemy 模型。

字段定义严格对齐 data-sys-docs/v2-schema.md §5。
"""
from datetime import datetime
from sqlalchemy import (
    Column, String, Integer, DateTime, Boolean, JSON, Text,
    PrimaryKeyConstraint, UniqueConstraint, Index
)

from .base import V2Base


# ============================================================
# 模块 1 · 用户扩展（5 表）
# ============================================================

class UserProfileModel(V2Base):
    """用户扩展资料 (1:1 挂在旧 users 表上)。

    旧 users 表不动；新字段全部挂这里。user_id 即旧 users.id。
    """
    __tablename__ = 'user_profiles'

    user_id = Column(Integer, primary_key=True)   # FK 概念上指向旧 users.id，跨库不建物理 FK
    display_name = Column(String(64), nullable=True)
    role = Column(String(32), nullable=True)      # exec / sales / pm / ops / analyst / admin
    team_id = Column(String(36), nullable=True)
    avatar_url = Column(String(512), nullable=True)
    lang = Column(String(16), default='zh-CN')    # zh-CN / en-US
    theme = Column(String(16), default='light')   # light / dark / auto
    density = Column(String(16), default='cozy')  # cozy / compact
    shortcuts_json = Column(JSON, nullable=True)  # 用户自定义快捷键映射

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class User2FAModel(V2Base):
    """双因素认证 (一个用户最多一条)。"""
    __tablename__ = 'user_2fa'

    user_id = Column(Integer, primary_key=True)
    secret = Column(String(128), nullable=False)              # TOTP secret (base32)
    backup_codes_hash = Column(JSON, nullable=True)           # bcrypt 哈希列表
    enabled_at = Column(DateTime, nullable=True)              # 启用时间
    last_used_at = Column(DateTime, nullable=True)


class UserLoginSessionModel(V2Base):
    """登录会话 (设置中心-多设备会话列表用)。"""
    __tablename__ = 'user_login_sessions'

    id = Column(String(36), primary_key=True)
    user_id = Column(Integer, nullable=False)
    ip = Column(String(64), nullable=True)
    ua = Column(Text, nullable=True)
    device_label = Column(String(128), nullable=True)         # "MacBook · Chrome"
    last_active_at = Column(DateTime, default=datetime.utcnow)
    revoked_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    __table_args__ = (Index('idx_uls_user', 'user_id'),)


class UserNotificationPrefModel(V2Base):
    """通知偏好 (4 渠道 × 8 场景 组合主键)。"""
    __tablename__ = 'user_notification_prefs'

    user_id = Column(Integer, primary_key=True)
    channel = Column(String(16), primary_key=True)        # email / im / push / inapp
    event_type = Column(String(32), primary_key=True)     # mention / comment / alert / share / digest / system / ...
    enabled = Column(Boolean, default=True)
    dnd_start_min = Column(Integer, nullable=True)        # 免打扰起 (0-1439 分钟)
    dnd_end_min = Column(Integer, nullable=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class OAuthAuthorizedAppModel(V2Base):
    """用户授权过的第三方应用 (设置-授权应用)。"""
    __tablename__ = 'oauth_authorized_apps'

    id = Column(String(36), primary_key=True)
    user_id = Column(Integer, nullable=False)
    client_id = Column(String(128), nullable=False)
    client_name = Column(String(128), nullable=False)
    scope = Column(JSON, nullable=True)                       # 授权的权限列表
    authorized_at = Column(DateTime, default=datetime.utcnow)
    last_used_at = Column(DateTime, nullable=True)
    revoked_at = Column(DateTime, nullable=True)

    __table_args__ = (
        Index('idx_oaa_user', 'user_id'),
        UniqueConstraint('user_id', 'client_id', name='uq_oaa_user_client'),
    )


# ============================================================
# 模块 2 · 工作区（2 表）
# ============================================================

class WorkspaceModel(V2Base):
    """工作区 (多人协作的根容器)。"""
    __tablename__ = 'workspaces'

    id = Column(String(36), primary_key=True)
    name = Column(String(128), nullable=False)
    slug = Column(String(64), nullable=False)             # URL 友好的标识，组织内唯一
    owner_user_id = Column(Integer, nullable=False)
    plan_tier = Column(String(16), default='free')        # free / team / business / enterprise
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    __table_args__ = (
        UniqueConstraint('slug', name='uq_workspaces_slug'),
        Index('idx_ws_owner', 'owner_user_id'),
    )


class WorkspaceMemberModel(V2Base):
    """工作区成员 (组合主键)。"""
    __tablename__ = 'workspace_members'

    workspace_id = Column(String(36), primary_key=True)
    user_id = Column(Integer, primary_key=True)
    role = Column(String(16), nullable=False, default='viewer')   # owner / admin / editor / viewer
    joined_at = Column(DateTime, default=datetime.utcnow)
    invited_by_user_id = Column(Integer, nullable=True)

    __table_args__ = (
        Index('idx_wm_user', 'user_id'),
    )


# ============================================================
# 模块 3 · 画布节点（5 表，v2 核心）
# ============================================================

class V2SessionModel(V2Base):
    """新会话 — 替代旧 sessions 表，归属 workspace。"""
    __tablename__ = 'v2_sessions'

    id = Column(String(36), primary_key=True)
    workspace_id = Column(String(36), nullable=False)
    owner_user_id = Column(Integer, nullable=False)
    title = Column(String(255), nullable=True)
    model_provider = Column(String(32), nullable=True)
    model_name = Column(String(128), nullable=True)
    mode_flags_json = Column(JSON, nullable=True)                # {thinking, rag, data_science}
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    __table_args__ = (
        Index('idx_v2s_ws', 'workspace_id'),
        Index('idx_v2s_owner', 'owner_user_id'),
    )


class V2MessageModel(V2Base):
    """新消息 — 替代旧 messages 表，承载"内容"层。"""
    __tablename__ = 'v2_messages'

    id = Column(String(36), primary_key=True)
    session_id = Column(String(36), nullable=False)
    parent_msg_id = Column(String(36), nullable=True)            # LLM 候选树
    role = Column(String(20), nullable=False)                    # user / assistant / system
    content = Column(Text, nullable=True)
    sql = Column(Text, nullable=True)
    chart_cfg_json = Column(JSON, nullable=True)
    data_json = Column(JSON, nullable=True)
    thinking_steps_json = Column(JSON, nullable=True)            # 结构化思考链 (数组)
    elapsed_ms = Column(Integer, nullable=True)
    tokens_prompt = Column(Integer, default=0)
    tokens_completion = Column(Integer, default=0)
    confidence = Column(Integer, nullable=True)                  # 0-100，整数避免浮点
    model_provider = Column(String(32), nullable=True)
    model_name = Column(String(128), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    __table_args__ = (Index('idx_v2m_session', 'session_id'),)


class CanvasNodeModel(V2Base):
    """画布节点 — 承载"拓扑"层 (分支 / 钉看板 / 位置 / clarify / HITL 状态)。"""
    __tablename__ = 'canvas_nodes'

    id = Column(String(36), primary_key=True)
    session_id = Column(String(36), nullable=False)
    parent_node_id = Column(String(36), nullable=True)           # 画布分支父节点
    message_id = Column(String(36), nullable=False)              # FK→v2_messages.id (1:1)
    branch_label = Column(String(64), nullable=True)             # "分支 A · 仅抖音"
    branch_color = Column(String(32), nullable=True)
    pinned_to_board_id = Column(String(36), nullable=True)
    clarify_status = Column(String(16), default='none')          # none/pending/cleared/skipped
    hitl_status = Column(String(16), default='none')             # none/waiting/approved/rejected
    position_index = Column(Integer, default=0)                  # 时间线排序
    created_at = Column(DateTime, default=datetime.utcnow)

    __table_args__ = (
        Index('idx_cn_session', 'session_id'),
        Index('idx_cn_parent', 'parent_node_id'),
        UniqueConstraint('message_id', name='uq_cn_message'),    # 一个 message 只对应一个 node
    )


class NodeCommentModel(V2Base):
    """节点评论 (NodeDetail-评论 tab)。"""
    __tablename__ = 'node_comments'

    id = Column(String(36), primary_key=True)
    node_id = Column(String(36), nullable=False)
    user_id = Column(Integer, nullable=False)
    body = Column(Text, nullable=False)
    parent_comment_id = Column(String(36), nullable=True)        # 楼中楼
    resolved_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    __table_args__ = (Index('idx_nc_node', 'node_id'),)


class NodeMentionModel(V2Base):
    """@提及 (组合主键)，催化 notifications。"""
    __tablename__ = 'node_mentions'

    node_id = Column(String(36), primary_key=True)
    mentioned_user_id = Column(Integer, primary_key=True)
    by_user_id = Column(Integer, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    read_at = Column(DateTime, nullable=True)


# ============================================================
# 模块 4 · 看板（4 表）
# ============================================================

class BoardModel(V2Base):
    """看板 — BoardEditor 主体，归属 workspace。"""
    __tablename__ = 'boards'

    id = Column(String(36), primary_key=True)
    workspace_id = Column(String(36), nullable=False)
    title = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    grid_cols = Column(Integer, default=12)
    schedule_cron = Column(String(64), nullable=True)
    owner_user_id = Column(Integer, nullable=False)
    from_template_id = Column(String(36), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    __table_args__ = (
        Index('idx_board_ws', 'workspace_id'),
        Index('idx_board_owner', 'owner_user_id'),
    )


class BoardWidgetModel(V2Base):
    """看板上的每张图 (引用 canvas_node)。"""
    __tablename__ = 'board_widgets'

    id = Column(String(36), primary_key=True)
    board_id = Column(String(36), nullable=False)
    source_node_id = Column(String(36), nullable=False)         # FK 概念上指向 canvas_nodes.id
    grid_x = Column(Integer, default=0)
    grid_y = Column(Integer, default=0)
    w = Column(Integer, default=4)                              # 默认 4 列宽
    h = Column(Integer, default=3)                              # 默认 3 行高
    override_cfg_json = Column(JSON, nullable=True)             # 覆盖标题 / 图表配色
    order_index = Column(Integer, default=0)
    created_at = Column(DateTime, default=datetime.utcnow)

    __table_args__ = (Index('idx_widget_board', 'board_id'),)


class BoardVersionModel(V2Base):
    """看板版本 — VersionDiff 用。每次大改动建一条快照。"""
    __tablename__ = 'board_versions'

    id = Column(String(36), primary_key=True)
    board_id = Column(String(36), nullable=False)
    version_num = Column(Integer, nullable=False)
    layout_snapshot_json = Column(JSON, nullable=True)
    changed_by_user_id = Column(Integer, nullable=False)
    change_summary = Column(String(255), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    __table_args__ = (
        UniqueConstraint('board_id', 'version_num', name='uq_board_version'),
    )


class BoardTemplateModel(V2Base):
    """看板模板库 — BoardTemplates 6 个行业起手式。"""
    __tablename__ = 'board_templates'

    id = Column(String(36), primary_key=True)
    category = Column(String(64), nullable=True)                # exec / sales / pm / ops 等
    name = Column(String(128), nullable=False)
    preview_url = Column(String(512), nullable=True)
    layout_json = Column(JSON, nullable=True)                   # widgets + override 配置的预设
    is_builtin = Column(Boolean, default=False)                 # 内置模板不能删
    created_at = Column(DateTime, default=datetime.utcnow)


# ============================================================
# 模块 5 · 分享（2 表）
# ============================================================

class ShareLinkModel(V2Base):
    """链接分享：任何人凭 token 访问，按 permission 控制能做什么。"""
    __tablename__ = 'share_links'

    id = Column(String(36), primary_key=True)
    target_type = Column(String(16), nullable=False)             # session / board / node
    target_id = Column(String(36), nullable=False)
    token = Column(String(64), nullable=False)                   # URL-safe 32 字节 base64
    permission = Column(String(16), nullable=False, default='view')   # view / comment / edit
    expires_at = Column(DateTime, nullable=True)
    created_by = Column(Integer, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    revoked_at = Column(DateTime, nullable=True)

    __table_args__ = (
        UniqueConstraint('token', name='uq_share_token'),
        Index('idx_sl_target', 'target_type', 'target_id'),
        Index('idx_sl_creator', 'created_by'),
    )


class ShareGrantModel(V2Base):
    """指定人分享：把 target 授权给某个用户（不发链接）。"""
    __tablename__ = 'share_grants'

    id = Column(String(36), primary_key=True)
    target_type = Column(String(16), nullable=False)
    target_id = Column(String(36), nullable=False)
    user_id = Column(Integer, nullable=False)
    permission = Column(String(16), nullable=False, default='view')
    granted_by = Column(Integer, nullable=False)
    granted_at = Column(DateTime, default=datetime.utcnow)

    __table_args__ = (
        UniqueConstraint('target_type', 'target_id', 'user_id', name='uq_grant_target_user'),
        Index('idx_sg_user', 'user_id'),
    )


# ============================================================
# 模块 6 · 通知（1 表）
# ============================================================

class NotificationModel(V2Base):
    """统一通知收件箱 — mention/comment/alert/share/system 全走这一张表。"""
    __tablename__ = 'notifications'

    id = Column(String(36), primary_key=True)
    recipient_user_id = Column(Integer, nullable=False)
    type = Column(String(16), nullable=False)                    # mention / comment / alert / share / system
    source_type = Column(String(32), nullable=True)              # node / board / session / alert_rule / ...
    source_id = Column(String(36), nullable=True)
    payload_json = Column(JSON, nullable=True)                   # 渲染所需的 title / body / actor 等
    read_at = Column(DateTime, nullable=True)
    actioned_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    __table_args__ = (
        Index('idx_notif_recipient', 'recipient_user_id', 'created_at'),
        Index('idx_notif_unread', 'recipient_user_id', 'read_at'),
    )


# ============================================================
# 模块 7 · 告警（3 表）
# ============================================================

class AlertRuleModel(V2Base):
    """告警规则 — AlertWizard 创建的订阅 + 阈值。"""
    __tablename__ = 'alert_rules'

    id = Column(String(36), primary_key=True)
    workspace_id = Column(String(36), nullable=False)
    name = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    # 数据来源 — metric_id 指向 metrics(C 档/阶段 8) 或 widget_id 指向 board_widget
    metric_id = Column(String(36), nullable=True)
    widget_id = Column(String(36), nullable=True)
    threshold_json = Column(JSON, nullable=False)               # {op:>, value:100, window:'1h', comparator:'wow_pct'}
    schedule_cron = Column(String(64), nullable=True)           # null = 实时；否则 cron 串
    dedupe_minutes = Column(Integer, nullable=False, default=5)  # 去重窗口：同规则上次 fired_at 距今 < 此值则跳过；0 = 关闭去重
    channels_json = Column(JSON, nullable=True)                 # [{channel:'email', template:'...'}]
    owner_user_id = Column(Integer, nullable=False)
    enabled = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    __table_args__ = (
        Index('idx_ar_workspace', 'workspace_id'),
        Index('idx_ar_owner', 'owner_user_id'),
    )


class AlertEventModel(V2Base):
    """告警事件 — 规则触发一次产生一条。"""
    __tablename__ = 'alert_events'

    id = Column(String(36), primary_key=True)
    rule_id = Column(String(36), nullable=False)
    fired_at = Column(DateTime, default=datetime.utcnow)
    current_value = Column(String(64), nullable=True)           # 用 string 避免数值/百分比/文本混淆
    threshold_value = Column(String(64), nullable=True)
    severity = Column(String(16), default='warn')               # info / warn / critical
    attribution_json = Column(JSON, nullable=True)              # AI 归因结果 (按维度/区域/渠道)
    status = Column(String(16), default='open')                 # open / ack / resolved
    acked_at = Column(DateTime, nullable=True)
    acked_by_user_id = Column(Integer, nullable=True)
    resolved_at = Column(DateTime, nullable=True)
    resolved_by_user_id = Column(Integer, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    __table_args__ = (
        Index('idx_ae_rule', 'rule_id', 'fired_at'),
        Index('idx_ae_status', 'status'),
    )


class AlertSubscriptionModel(V2Base):
    """告警订阅 — 一条规则可以被多个用户订阅，可单独覆盖渠道偏好。"""
    __tablename__ = 'alert_subscriptions'

    rule_id = Column(String(36), primary_key=True)
    user_id = Column(Integer, primary_key=True)
    channel_overrides_json = Column(JSON, nullable=True)        # null = 跟随 user_notification_prefs
    subscribed_at = Column(DateTime, default=datetime.utcnow)

    __table_args__ = (Index('idx_asub_user', 'user_id'),)


# ============================================================
# 模块 8 · 审计 (1 表)
# ============================================================

class AuditLogModel(V2Base):
    """统一审计日志 — 所有 v2 写操作都该往这里写一条。"""
    __tablename__ = 'audit_logs'

    id = Column(String(36), primary_key=True)
    actor_user_id = Column(Integer, nullable=False)
    workspace_id = Column(String(36), nullable=True)        # 平台级动作可为 null
    action = Column(String(64), nullable=False)             # create/update/delete/share/revoke/...
    target_type = Column(String(64), nullable=True)
    target_id = Column(String(64), nullable=True)
    diff_json = Column(JSON, nullable=True)                 # {before, after} 或自定义结构
    ip = Column(String(64), nullable=True)
    ua = Column(Text, nullable=True)
    request_id = Column(String(64), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    __table_args__ = (
        Index('idx_audit_actor', 'actor_user_id', 'created_at'),
        Index('idx_audit_ws', 'workspace_id', 'created_at'),
        Index('idx_audit_target', 'target_type', 'target_id'),
    )


# ============================================================
# 模块 9 · 计费 (4 表)
# ============================================================

class SubscriptionModel(V2Base):
    """工作区订阅套餐。"""
    __tablename__ = 'subscriptions'

    id = Column(String(36), primary_key=True)
    workspace_id = Column(String(36), nullable=False)
    plan = Column(String(16), nullable=False, default='free')     # free/team/business/enterprise
    billing_cycle = Column(String(16), default='monthly')         # monthly/yearly
    valid_from = Column(DateTime, default=datetime.utcnow)
    valid_until = Column(DateTime, nullable=True)
    auto_renew = Column(Boolean, default=True)
    external_subscription_id = Column(String(128), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    __table_args__ = (Index('idx_sub_ws', 'workspace_id'),)


class OrgSeatsModel(V2Base):
    """工作区席位用量（每个 workspace 一条）。"""
    __tablename__ = 'org_seats'

    workspace_id = Column(String(36), primary_key=True)
    used_count = Column(Integer, default=0)
    limit_count = Column(Integer, default=5)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class UsageCounterModel(V2Base):
    """月度用量计数器（组合主键）。"""
    __tablename__ = 'usage_counters'

    workspace_id = Column(String(36), primary_key=True)
    period_yyyymm = Column(String(7), primary_key=True)            # "2026-05"
    asks_count = Column(Integer, default=0)
    tokens_total = Column(Integer, default=0)
    compute_seconds_total = Column(Integer, default=0)
    storage_bytes_avg = Column(Integer, default=0)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class InvoiceModel(V2Base):
    """发票。金额用 cents 整数避免浮点累计误差。"""
    __tablename__ = 'invoices'

    id = Column(String(36), primary_key=True)
    workspace_id = Column(String(36), nullable=False)
    period_yyyymm = Column(String(7), nullable=False)
    amount_cents = Column(Integer, nullable=False)
    currency = Column(String(8), default='CNY')
    status = Column(String(16), default='draft')                   # draft/issued/paid/void
    pdf_url = Column(String(512), nullable=True)
    paid_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    __table_args__ = (
        Index('idx_inv_ws', 'workspace_id', 'period_yyyymm'),
    )


# ============================================================
# 模块 10 · 模型与算力 (3 表)
# ============================================================

class ModelRouteModel(V2Base):
    """模型路由：哪种意图走哪个模型 (priority 高的先匹配)。"""
    __tablename__ = 'model_routes'

    id = Column(String(36), primary_key=True)
    workspace_id = Column(String(36), nullable=False)
    intent_pattern = Column(String(255), nullable=False)            # 简单关键词或正则
    target_model = Column(String(128), nullable=False)              # 如 deepseek-r1 / claude-4
    priority = Column(Integer, default=100)
    enabled = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    __table_args__ = (
        Index('idx_mr_ws', 'workspace_id', 'priority'),
    )


class ModelBudgetModel(V2Base):
    """模型预算 (workspace × model × 月)。"""
    __tablename__ = 'model_budgets'

    workspace_id = Column(String(36), primary_key=True)
    model_name = Column(String(128), primary_key=True)
    period_yyyymm = Column(String(7), primary_key=True)
    monthly_cap_usd_cents = Column(Integer, default=0)              # 月度上限
    used_cents = Column(Integer, default=0)
    alert_threshold_pct = Column(Integer, default=80)               # 80% 时报警
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class ApiKeyV2Model(V2Base):
    """组织级 API Key — 与旧 user_api_keys 语义完全不同。"""
    __tablename__ = 'api_keys_v2'

    id = Column(String(36), primary_key=True)
    workspace_id = Column(String(36), nullable=False)
    name = Column(String(128), nullable=False)
    key_prefix = Column(String(16), nullable=False)                 # 显示用：dpv2_ab...
    key_hash = Column(String(128), nullable=False)                  # 完整 key 的哈希
    scopes_json = Column(JSON, nullable=True)
    created_by_user_id = Column(Integer, nullable=False)
    last_used_at = Column(DateTime, nullable=True)
    rotated_from_id = Column(String(36), nullable=True)             # 轮换链
    revoked_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    __table_args__ = (
        Index('idx_apk_ws', 'workspace_id'),
        Index('idx_apk_hash', 'key_hash'),
    )


# ============================================================
# 模块 11 · 语义层 / 指标中心 (6 表) — 阶段 8 MVP
# ============================================================
# 注：本阶段只建表 + 基础 CRUD，metric.expression 暂用普通字符串，DSL 解析留待后续
# AI 同义词、向量匹配也留待后续

class DatasourceTableMetaModel(V2Base):
    """数据源下的表 (从 user_datasources 关联) — SchemaSemantic 树用。"""
    __tablename__ = 'datasource_tables_meta'

    ds_id = Column(String(36), primary_key=True)            # 来源 user_datasources.id (旧 schema)
    schema_name = Column(String(128), primary_key=True)
    table_name = Column(String(128), primary_key=True)
    row_count_estimate = Column(Integer, default=0)
    last_synced_at = Column(DateTime, nullable=True)
    comment = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)


class ColumnMetaModel(V2Base):
    """字段元数据 — 字段语义打标依赖这张表。"""
    __tablename__ = 'column_meta'

    id = Column(String(36), primary_key=True)
    ds_id = Column(String(36), nullable=False)
    schema_name = Column(String(128), nullable=False)
    table_name = Column(String(128), nullable=False)
    column_name = Column(String(128), nullable=False)
    dtype = Column(String(64), nullable=True)
    null_ratio = Column(Integer, default=0)                 # 百分比 *100 整数
    distinct_count = Column(Integer, default=0)
    sample_values_json = Column(JSON, nullable=True)
    comment = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    __table_args__ = (
        UniqueConstraint('ds_id', 'schema_name', 'table_name', 'column_name', name='uq_col_meta'),
        Index('idx_col_table', 'ds_id', 'schema_name', 'table_name'),
    )


class ColumnSemanticTagModel(V2Base):
    """字段语义标签 (组合主键)。"""
    __tablename__ = 'column_semantic_tags'

    column_id = Column(String(36), primary_key=True)
    tag_name = Column(String(64), primary_key=True)
    confidence = Column(Integer, default=100)                # 0-100 整数
    source = Column(String(16), default='manual')            # ai / user / manual
    tagged_by = Column(Integer, nullable=True)               # user_id
    tagged_at = Column(DateTime, default=datetime.utcnow)


class MetricModel(V2Base):
    """业务指标定义 — 指标中心。"""
    __tablename__ = 'metrics'

    id = Column(String(36), primary_key=True)
    workspace_id = Column(String(36), nullable=False)
    name = Column(String(128), nullable=False)               # 唯一性由代码层保证（workspace 内）
    expression = Column(Text, nullable=False)                # 暂用普通字符串，未来加 DSL 解析
    biz_definition = Column(Text, nullable=True)
    unit = Column(String(32), nullable=True)
    owner_user_id = Column(Integer, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    __table_args__ = (
        Index('idx_metric_ws', 'workspace_id'),
    )


class MetricSynonymModel(V2Base):
    """指标同义词 — AI 用 (组合主键)。"""
    __tablename__ = 'metric_synonyms'

    metric_id = Column(String(36), primary_key=True)
    synonym_text = Column(String(128), primary_key=True)
    weight = Column(Integer, default=100)                    # 匹配权重，越大越优先
    source = Column(String(16), default='user')              # ai / user
    created_at = Column(DateTime, default=datetime.utcnow)


class MetricLineageModel(V2Base):
    """指标血缘 — 一条指标依赖于哪些其它指标 / 表字段。"""
    __tablename__ = 'metric_lineage'

    from_metric_id = Column(String(36), primary_key=True)
    to_type = Column(String(16), primary_key=True)           # metric / table_column
    to_id = Column(String(128), primary_key=True)
    relation = Column(String(16), default='uses')            # uses / derives
    created_at = Column(DateTime, default=datetime.utcnow)
