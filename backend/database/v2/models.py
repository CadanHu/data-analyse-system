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
