// @ts-nocheck
// Ported verbatim from datapulse-ai-design-system/project/v2/MarketingExtras.jsx
import React, { useState, useRef, useEffect, useMemo } from 'react'

const { useState: useS_MX } = React;

/* =========================================================
   Marketing extras · Pricing / Docs / Changelog
   ========================================================= */

function MktTop({ on='pricing' }) {
  return (
    <div className="p1-topbar">
      <div className="brand" style={{fontSize:22}}><span className="dot"/>DataPulse</div>
      <span style={{flex:1}}/>
      <div style={{display:'flex', gap:24, fontSize:13, color:'var(--ink-2)'}}>
        {[
          ['product','产品'],
          ['pricing','定价'],
          ['docs','文档'],
          ['changelog','更新'],
          ['about','关于'],
        ].map(([k,n]) => (
          <span key={k} style={{
            color: on===k ? 'var(--ink-1)' : 'var(--ink-3)',
            fontWeight: on===k ? 500 : 400,
            borderBottom: on===k ? '2px solid var(--amber-deep)' : '2px solid transparent',
            paddingBottom: 4,
            cursor: 'pointer'
          }}>{n}</span>
        ))}
      </div>
      <span style={{flex:1}}/>
      <span style={{fontFamily:'var(--font-mono)', fontSize:11, color:'var(--ink-3)', cursor:'pointer'}}>登录</span>
      <button className="btn-primary" style={{padding:'6px 14px', fontSize:12}}>免费试用 →</button>
    </div>
  );
}

/* =========================================================
   1. Pricing
   ========================================================= */

export function PricingPage() {
  const [cycle, setCycle] = useS_MX('yearly');
  const factor = cycle === 'yearly' ? 0.8 : 1;
  return (
    <div className="p0-frame">
      <div className="ai-scene">
        <MktTop on="pricing"/>
        <div className="mkp">
          <div className="mkp-head">
            <div className="eyebrow">Pricing · 简单清晰</div>
            <h1>按<em>席位</em>计费,<br/>所有版本都不藏功能。</h1>
            <p>免费版可以做完整的"问 → 看图 → 钉看板"流程,够小团队跑起来。需要更多席位、私有部署、企业 SSO 时再升级。</p>
            <div className="mkp-toggle">
              <button className={cycle==='monthly'?'on':''}  onClick={()=>setCycle('monthly')}>月付</button>
              <button className={cycle==='yearly'?'on':''}   onClick={()=>setCycle('yearly')}>年付<span className="save">省 20%</span></button>
            </div>
          </div>

          <div className="mkp-grid">
            <div className="mkp-card">
              <div className="name">FREE · 免费</div>
              <div className="tag">先玩起来</div>
              <div className="price">
                <span className="cur">¥</span>
                <span className="num"><em>0</em></span>
                <span className="per">永久免费</span>
              </div>
              <div className="billed">3 人内的小组</div>
              <button className="cta">开始使用</button>
              <div className="feat-list">
                <div className="lim">配额</div>
                <div className="item">3 个席位</div>
                <div className="item">2 个数据源</div>
                <div className="item">200 次 AI 提问 / 月</div>
                <div className="lim">能力</div>
                <div className="item">Standard 模式 (SQL)</div>
                <div className="item">基础图表 + 看板</div>
                <div className="item no">Scientist · Python 沙箱</div>
                <div className="item no">数据血缘 · 审计日志</div>
              </div>
            </div>

            <div className="mkp-card">
              <div className="name">STARTER · 入门</div>
              <div className="tag">10 人左右团队</div>
              <div className="price">
                <span className="cur">¥</span>
                <span className="num">{Math.round(48 * factor)}</span>
                <span className="per">/ 席位 / 月</span>
              </div>
              <div className="billed">
                {cycle === 'yearly' ? <><s>¥ 48</s> 年付 · 折前 ¥ 576</> : <>月付 · 随时取消</>}
              </div>
              <button className="cta">选 Starter</button>
              <div className="feat-list">
                <div className="lim">在 FREE 基础上 +</div>
                <div className="item">不限席位</div>
                <div className="item">10 个数据源</div>
                <div className="item">2,000 次 / 席位 / 月</div>
                <div className="item">全部 3 种模式</div>
                <div className="item">看板订阅 / 周报</div>
                <div className="item">飞书 + 钉钉机器人</div>
                <div className="item no">私有部署</div>
              </div>
            </div>

            <div className="mkp-card featured">
              <div className="ribbon">最受欢迎</div>
              <div className="name">TEAM · 团队</div>
              <div className="tag">数据团队的<em style={{fontStyle:'italic', color:'var(--amber-deep)'}}>标配</em></div>
              <div className="price">
                <span className="cur">¥</span>
                <span className="num"><em>{Math.round(96 * factor)}</em></span>
                <span className="per">/ 席位 / 月</span>
              </div>
              <div className="billed">
                {cycle === 'yearly' ? <><s>¥ 96</s> 年付 · 折前 ¥ 1,152</> : <>月付 · 随时取消</>}
              </div>
              <button className="cta">选 Team →</button>
              <div className="feat-list">
                <div className="lim">在 STARTER 基础上 +</div>
                <div className="item">指标中心 · 业务口径</div>
                <div className="item">语义层 · AI 同义词训练</div>
                <div className="item">数据血缘 + 审计日志</div>
                <div className="item">异常告警 + 同环比解释</div>
                <div className="item">SSO · 飞书 / 钉钉 / Azure</div>
                <div className="item">优先支持(4 小时)</div>
                <div className="item no">私有部署 / 专属算力</div>
              </div>
            </div>

            <div className="mkp-card">
              <div className="name">ENTERPRISE · 企业</div>
              <div className="tag">私有部署 + 定制</div>
              <div className="price">
                <span className="cur"/>
                <span className="num" style={{fontSize:32, paddingTop:18}}>面议</span>
              </div>
              <div className="billed">年付 · 含部署 + 培训</div>
              <button className="cta">联系销售</button>
              <div className="feat-list">
                <div className="lim">在 TEAM 基础上 +</div>
                <div className="item">私有部署 · K8s / 信创</div>
                <div className="item">专属沙箱算力池</div>
                <div className="item">自带模型(本地 / 私有 API)</div>
                <div className="item">行级权限 + 数据脱敏</div>
                <div className="item">SLA 99.95% · 7×24 响应</div>
                <div className="item">专属客户成功</div>
                <div className="item">定制语义层 / 模板</div>
              </div>
            </div>
          </div>

          <div className="mkp-faq">
            <h2>大家最常问的</h2>
            <div className="row open">
              <div className="q">FREE 版可以正式用在公司里吗?</div>
              <div className="a">
                可以。FREE 不是"试用",而是给小团队长期免费的版本,只是配额受限。
                我们不会过几天就把功能锁掉催你付费,你可以一直用下去。
              </div>
            </div>
            <div className="row">
              <div className="q">超额了会怎么样?</div>
            </div>
            <div className="row">
              <div className="q">能用我们自己的模型(本地 / 自部署)吗?</div>
            </div>
            <div className="row">
              <div className="q">数据安全 · 我们的数据会被用来训练模型吗?</div>
            </div>
            <div className="row">
              <div className="q">支持开发票、跨境付款吗?</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

/* =========================================================
   2. Docs
   ========================================================= */

export function DocsPage() {
  return (
    <div className="p0-frame">
      <div className="ai-scene">
        <MktTop on="docs"/>
        <div className="mkd">
          <div className="mkd-side">
            <div className="brand"><span className="dot"/>DataPulse <span className="doc">DOCS</span></div>
            <div className="search">
              <span style={{color:'var(--ink-4)'}}>⌕</span>
              <span>搜文档...</span>
              <span className="kbd">⌘ K</span>
            </div>

            <div className="group">入门 · GETTING STARTED</div>
            <a>欢迎</a>
            <a className="on">5 分钟跑通第一个看板</a>
            <a>挑选你的视角</a>
            <a>把数据接进来</a>

            <div className="group">概念 · CONCEPTS</div>
            <a>三种模式(Standard / Scientist / Deep)</a>
            <a>节点 · 分支 · 时间线</a>
            <a>指标中心与业务口径</a>
            <a>语义层 · AI 同义词</a>
            <a>数据血缘</a>

            <div className="group">教程 · GUIDES</div>
            <a>用 AI 做留存归因</a>
            <a>把看板钉到飞书周报</a>
            <a>异常告警 · 阈值最佳实践</a>
            <a>SQL 编辑与 AI 修订</a>

            <div className="group">API · REFERENCE</div>
            <a>API Key 与鉴权</a>
            <a>REST · /v1/query</a>
            <a>SSE · 流式响应</a>
            <a>Webhook · 异常订阅</a>
            <a>错误码</a>

            <div className="group">运维 · OPS</div>
            <a>私有部署</a>
            <a>SSO 接入</a>
            <a>审计日志导出</a>
          </div>

          <div className="mkd-main">
            <div className="crumbs">DOCS / 入门 / <em>5 分钟跑通第一个看板</em></div>
            <h1>5 分钟跑通你的第一个看板</h1>
            <p className="lead">
              不写一行 SQL,只用对话就能从数据源接通到一张可分享的看板。
              这个教程假设你已经登录,且至少有一个数据源连过(MySQL/PG/Snowflake 都行)。
            </p>

            <h2 id="step-overview">大致流程</h2>
            <p>
              一个最小可用的 DataPulse 看板,需要走完这四步:接入数据源 → 给字段打语义 → 用自然语言提问 → 把产物钉到看板。
              每一步都会自动记录,后面你可以追问、分支、版本回退。
            </p>

            <ol className="steps">
              <li>
                <div>
                  <b>1. 连一个数据源</b>
                  <span>到「设置 / 数据源」,点 + 连接新源,填一遍只读账号。我们会跑一次探针拿表结构,5-30 秒。</span>
                </div>
              </li>
              <li>
                <div>
                  <b>2. 打语义(可选,但强烈推荐)</b>
                  <span>给 GMV、留存、渠道这些字段添加业务同义词,让 AI 听懂"流水""营收"。</span>
                </div>
              </li>
              <li>
                <div>
                  <b>3. 直接问</b>
                  <span>在主界面 ⌘ K 唤起输入框,用人话问。AI 会先反问澄清(如果有歧义),然后跑 SQL 给你图。</span>
                </div>
              </li>
              <li>
                <div>
                  <b>4. 钉到看板</b>
                  <span>满意的图按 ⌘ ↵ 钉到看板。看板可以分享、订阅、定时刷新。</span>
                </div>
              </li>
            </ol>

            <h2 id="step-curl">用 API 跑一次</h2>
            <p>
              如果你想从外部触发提问 —— 比如把它放到你已有的 dashboard 里,或者集成进 CI —— 用一行 <code>curl</code> 也可以:
            </p>
            <pre>
<span className="com"># POST /v1/query · stream=true 启用 SSE</span>
$ curl <span className="str">https://api.datapulse.cn/v1/query</span> \
    -H <span className="str">"Authorization: Bearer sk_live_..."</span> \
    -H <span className="str">"Content-Type: application/json"</span> \
    -d <span className="str">{'\'{"q":"这周营收涨了吗","mode":"standard","stream":true}\''}</span>
            </pre>

            <div className="callout">
              <div className="lbl">提示 · TIP</div>
              建议在 staging 环境用 <code>sk_test_…</code> Key 调试,生产环境再换成 <code>sk_live_…</code>。<br/>
              错误码请参考 <a style={{color:'var(--amber-deep)', cursor:'pointer'}}>错误码 · Reference →</a>
            </div>

            <h2 id="step-next">接下来</h2>
            <p>
              看板做出来之后,你可能想让它<b>每周一自动跑一遍</b>并发到飞书 —— 这是下一篇教程的主题。
            </p>

            <div className="links">
              <a>
                <div className="lbl">教程 · GUIDES</div>
                <div className="ttl">把看板钉到飞书周报</div>
              </a>
              <a>
                <div className="lbl">概念 · CONCEPTS</div>
                <div className="ttl">指标中心与业务口径</div>
              </a>
            </div>
          </div>

          <div className="mkd-toc">
            <div className="lbl">本页 · ON THIS PAGE</div>
            <a className="on">大致流程</a>
            <a>用 API 跑一次</a>
            <a className="sub">curl 示例</a>
            <a className="sub">SSE 响应格式</a>
            <a>接下来</a>
            <div style={{marginTop:24, paddingTop:20, borderTop:'1px solid var(--line-2)'}}>
              <div className="lbl">页脚</div>
              <a style={{fontFamily:'var(--font-mono)', fontSize:11}}>↗ 在 GitHub 编辑</a>
              <a style={{fontFamily:'var(--font-mono)', fontSize:11}}>↗ 反馈这一页</a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

/* =========================================================
   3. Changelog
   ========================================================= */

export function ChangelogPage() {
  return (
    <div className="p0-frame">
      <div className="ai-scene">
        <MktTop on="changelog"/>
        <div className="mkc">
          <div className="mkc-head">
            <div className="eyebrow">Changelog · 我们每周发新东西</div>
            <h1>每一周,DataPulse 都<em>更顺手</em>一点。</h1>
            <p>我们维护一份开放的更新日志,大改动写故事,小调整写一行。订阅 RSS 或者邮件都行。</p>
            <div className="sub-row">
              <span className="chip on">全部</span>
              <span className="chip">新功能</span>
              <span className="chip">改进</span>
              <span className="chip">修复</span>
              <span className="chip">⌘ 订阅</span>
              <span className="chip">⎙ RSS</span>
            </div>
          </div>

          <div className="mkc-stream">
            <div className="mkc-item">
              <div className="meta">
                <div className="ver"><em>v4.2</em></div>
                <div className="date">2026-09-28</div>
                <div style={{marginTop:8}}>本周 · WEEK</div>
              </div>
              <div className="body">
                <h2>异常告警学会了<em>解释自己</em></h2>
                <div className="sub">FEATURE · 自动归因 · 同环比 · 飞书推送</div>

                <div className="preview">
                  <div>
                    <div className="pl">GMV 跌破 ¥ 1.5M <em>← 这是 AI 写的</em></div>
                    <div className="pmeta">同比 −4.2% · 环比 −18% · 3 条最可能原因</div>
                  </div>
                  <div className="img">异常告警详情 · 预览</div>
                </div>

                <p style={{fontSize:14, color:'var(--ink-1)', lineHeight:1.7, margin:'10px 0 18px'}}>
                  以前异常只告诉你"GMV 低了",从这周开始,DataPulse 会顺手帮你做归因:
                  把当时的渠道投放、实验、数据源刷新状态都看一遍,选出 3 条最可能的原因。
                  不保证一定对,但能帮你少跑两轮 SQL。
                </p>

                <div className="mkc-cat">
                  <div className="line">
                    <span className="tag new">NEW</span>
                    <div>
                      <b>异常告警的 AI 归因</b> · 触发时自动生成<code>解释</code>+ 同环比对比图。
                    </div>
                  </div>
                  <div className="line">
                    <span className="tag new">NEW</span>
                    <div>
                      <b>飞书推送预览</b> · 创建告警时实时预览推送卡片长什么样,不用回到飞书去看。
                    </div>
                  </div>
                  <div className="line">
                    <span className="tag perf">PERF</span>
                    <div>
                      同规则 10 分钟内的多次触发自动合并,告警噪音 −60%。
                    </div>
                  </div>
                  <div className="line">
                    <span className="tag fix">FIX</span>
                    <div>
                      修复了 <code>retention_d30</code> 在跨月窗口下偶尔少算一天的 bug。
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="mkc-item">
              <div className="meta">
                <div className="ver">v4.1</div>
                <div className="date">2026-09-21</div>
              </div>
              <div className="body">
                <h2>看板编辑器 · <em>把节点拖到画布上</em></h2>
                <div className="sub">FEATURE · 自由编排 · 12 列网格</div>
                <p style={{fontSize:14, color:'var(--ink-1)', lineHeight:1.7, margin:'10px 0 18px'}}>
                  以前看板是"列表式"的,这周开始你可以把节点拖到画布上,
                  做出真正像汇报材料的版面。支持 12 列网格、拖拽吸附、文字块、空白间距。
                </p>
                <div className="mkc-cat">
                  <div className="line">
                    <span className="tag new">NEW</span>
                    <div><b>看板自由编辑器</b> · 拖拽 / 缩放 / 文字块 / PDF 导出。</div>
                  </div>
                  <div className="line">
                    <span className="tag new">NEW</span>
                    <div><b>6 个行业模板</b> · 销售 / 增长 / 财务 / 高管 / 产品 / 渠道。</div>
                  </div>
                  <div className="line">
                    <span className="tag perf">PERF</span>
                    <div>看板首屏渲染从 1.8s 降到 0.6s。</div>
                  </div>
                </div>
              </div>
            </div>

            <div className="mkc-item minor">
              <div className="meta">
                <div className="ver">v4.0.4</div>
                <div className="date">2026-09-14</div>
              </div>
              <div className="body">
                <h2>稳定性周</h2>
                <div className="sub">PERF + FIX · 没有大新功能</div>
                <div className="mkc-cat">
                  <div className="line">
                    <span className="tag perf">PERF</span>
                    <div>沙箱启动时间从 4.2s 优化到 1.1s,Scientist 模式打开更快。</div>
                  </div>
                  <div className="line">
                    <span className="tag fix">FIX</span>
                    <div>修复 Snowflake 数据源在某些 timezone 下读不到表的问题。</div>
                  </div>
                  <div className="line">
                    <span className="tag fix">FIX</span>
                    <div>修复移动端追问时键盘遮挡输入框的 issue。</div>
                  </div>
                  <div className="line">
                    <span className="tag brk">BREAK</span>
                    <div>
                      <code>/v1/query</code> 的 <code>stream</code> 参数从 <code>boolean</code> 改成 <code>"sse"|"none"</code>。
                      旧值仍然兼容,但下个大版本会移除。
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="mkc-item">
              <div className="meta">
                <div className="ver"><em>v4.0</em></div>
                <div className="date">2026-09-01</div>
                <div style={{marginTop:8}}>大版本 · MAJOR</div>
              </div>
              <div className="body">
                <h2>v4.0 · <em>暖色系</em>,以及画布式分析</h2>
                <div className="sub">REWRITE · 全新视觉与交互</div>

                <div className="preview full">
                  <div>
                    <div className="pl">2026-09-01 · <em>新主页</em></div>
                    <div className="pmeta">画布式时间线 + 内联分支 + 暖色系</div>
                  </div>
                </div>

                <p style={{fontSize:14, color:'var(--ink-1)', lineHeight:1.7, margin:'10px 0 18px'}}>
                  v4.0 是一次完整重写:从冷色蓝绿换到暖色奶油 + 琥珀,从聊天列表换成画布式时间线,
                  增加了内联分支、节点详情抽屉、版本对照。所有 v3 的看板会自动迁移。
                </p>

                <div className="mkc-cat">
                  <div className="line">
                    <span className="tag new">NEW</span>
                    <div>暖色系视觉系统 · 全新衬线字体 + 琥珀色高光。</div>
                  </div>
                  <div className="line">
                    <span className="tag new">NEW</span>
                    <div>画布式时间线 · 节点 / 分支 / 依赖箭头。</div>
                  </div>
                  <div className="line">
                    <span className="tag new">NEW</span>
                    <div>指标中心 + 语义层 + 数据血缘三件套。</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
