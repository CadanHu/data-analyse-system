// @ts-nocheck
// Ported verbatim from datapulse-ai-design-system/project/v2/SystemStates.jsx
import React, { useState, useRef, useEffect, useMemo } from 'react'


/* =========================================================
   System states · 404 / Offline / Skeleton / 5xx
   ========================================================= */

function SysTop({ crumbs = [], badge, clock='14:58 · main', alarm }) {
  return (
    <div className="p1-topbar" style={alarm ? { borderBottomColor:'oklch(0.74 0.16 75 / 0.5)' } : null}>
      <div className="brand"><span className="dot"/>DataPulse</div>
      <span className="crumb">
        {crumbs.map((c, i) => (
          <React.Fragment key={i}>
            {i > 0 && <span style={{margin:'0 8px', color:'var(--ink-5)'}}>/</span>}
            {i === crumbs.length - 1 ? <b>{c}</b> : c}
          </React.Fragment>
        ))}
      </span>
      {badge && (
        <span style={{
          fontFamily:'var(--font-mono)', fontSize:10,
          letterSpacing:'0.2em', textTransform:'uppercase',
          color: alarm ? 'var(--warning)' : 'var(--ink-3)',
          padding:'3px 8px',
          border:`1px solid ${alarm ? 'oklch(0.74 0.16 75 / 0.5)' : 'var(--line-1)'}`,
          borderRadius:999, marginLeft:8,
          background: alarm ? 'oklch(0.74 0.16 75 / 0.08)' : 'transparent'
        }}>{badge}</span>
      )}
      <span style={{flex:1}}/>
      <span className="clk">{clock}</span>
      <div className="av">李</div>
    </div>
  );
}

/* =========================================================
   1. 404 Not Found
   ========================================================= */

export function NotFound() {
  return (
    <div className="p0-frame">
      <div className="ai-scene">
        <SysTop crumbs={['DataPulse','找不到这个看板']} badge="404"/>
        <div className="sys-404">
          <div className="body">
            <div className="glyph">4·0·4</div>
            <div className="eyebrow">Page Not Found · 404</div>
            <h1>这张看板<em>不见了</em>。</h1>
            <p>
              要么链接抄错了一截,要么它已经被作者删掉。
              删除的看板会留在「回收站」30 天,如果是你自己删的,可以从那里找回。
            </p>
            <div className="row">
              <button className="pri">返回首页 ⌘ H</button>
              <button className="alt">去回收站找一找</button>
              <button className="alt">用 ⌘ K 直接问 AI</button>
            </div>
            <div className="last">
              <span>常被问的去处 ·</span>
              <a>Q3 渠道复盘</a>
              <span style={{color:'var(--ink-5)'}}>·</span>
              <a>EXP-014 留存</a>
              <span style={{color:'var(--ink-5)'}}>·</span>
              <a>高管周报</a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

/* =========================================================
   2. Offline mode
   ========================================================= */

export function OfflineMode() {
  return (
    <div className="p0-frame">
      <div className="ai-scene">
        <SysTop crumbs={['工作区','Q3 渠道复盘']} badge="离线模式 · OFFLINE" alarm/>
        <div className="sys-off">
          <div className="banner">
            <div className="ix">!</div>
            <div>
              <b>离线模式</b> · 后端连接已中断,AI 仅基于<b>本地缓存</b>回答,新提问会暂存。
            </div>
            <span className="meta">已重试 3 次 · 上次成功 4 分钟前</span>
            <button>重试</button>
          </div>
          <div className="stage">
            <div className="side">
              <span className="ttl">看板 · 缓存</span>
              <div className="item on">
                Q3 渠道复盘
                <span className="badge">cache 92%</span>
              </div>
              <div className="item">
                EXP-014 留存
                <span className="badge">cache 64%</span>
              </div>
              <div className="item">
                高管周报
                <span className="badge">cache 100%</span>
              </div>
              <div className="item" style={{opacity:0.5}}>
                销售管线 · 实时
                <span className="badge lock">⚿ 锁定</span>
              </div>
              <div className="item" style={{opacity:0.5}}>
                市场费用日表
                <span className="badge lock">⚿ 锁定</span>
              </div>
            </div>

            <div className="main">
              <div className="lock">
                <div className="ix">⚿</div>
                <div>
                  <h2>这张图<em>暂时不能刷新</em>,但本地缓存还在。</h2>
                  <p>
                    你能继续<b>查看</b>截至 14:54 的版本,以及在它上面<b>钉评论 / 写笔记</b>。
                    需要新 SQL 重跑的操作会排到队列里,网络恢复后自动执行。
                  </p>
                  <div className="opts">
                    <button className="btn-primary">仅看缓存继续</button>
                    <button className="btn-ghost">查看排队中的 2 个操作</button>
                  </div>
                </div>
              </div>

              <h3>缓存里能直接用的</h3>
              <div className="ofcache">
                <div className="c">
                  <span className="lbl">本周 · GMV</span>
                  <span className="name">¥ 12.4M(+8.2% WoW)</span>
                  <div className="chart"/>
                  <span className="meta">缓存于 14:54 · 4 分钟前</span>
                </div>
                <div className="c">
                  <span className="lbl">渠道漏斗</span>
                  <span className="name">抖音 vs 私域 vs 小红书</span>
                  <div className="chart"/>
                  <span className="meta">缓存于 14:48 · 10 分钟前</span>
                </div>
              </div>
            </div>

            <div className="aside">
              <span className="ttl">连接诊断 · DIAGNOSE</span>
              <div className="conn">
                <div className="row">
                  <span className="dot err"/>
                  <span className="name">主 API</span>
                  <span className="meta">超时 8.4s</span>
                </div>
                <div className="row">
                  <span className="dot"/>
                  <span className="name">语义层</span>
                  <span className="meta">正常</span>
                </div>
                <div className="row">
                  <span className="dot err"/>
                  <span className="name">SQL 执行</span>
                  <span className="meta">不可达</span>
                </div>
                <div className="row">
                  <span className="dot"/>
                  <span className="name">CDN · 静态</span>
                  <span className="meta">3 跳</span>
                </div>
              </div>
              <button className="retry-btn">重新连接 · 立刻</button>

              <span className="ttl" style={{marginTop:18, display:'block'}}>排队中</span>
              <div style={{fontFamily:'var(--font-mono)', fontSize:11, color:'var(--ink-3)',
                lineHeight:1.7, padding:'4px 0'}}>
                <div>· 提问 "本周营收..." <span style={{color:'var(--ink-4)'}}>14:56</span></div>
                <div>· 重跑节点 #04 <span style={{color:'var(--ink-4)'}}>14:54</span></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

/* =========================================================
   3. Skeleton loading
   ========================================================= */

export function SkeletonLoad() {
  return (
    <div className="p0-frame">
      <div className="ai-scene">
        <SysTop crumbs={['工作区','Q3 渠道复盘']} badge="加载中"/>
        <div className="sys-sk" style={{position:'relative'}}>
          <div className="sys-sk-side">
            <div className="sk title" style={{width:'40%', marginBottom:18}}/>
            <div className="sk line"/>
            <div className="sk line short"/>
            <div className="sk line tiny"/>
            <div style={{height:18}}/>
            <div className="sk line"/>
            <div className="sk line short"/>
            <div className="sk line tiny"/>
            <div className="sk line short"/>
            <div style={{height:18}}/>
            <div className="sk line"/>
            <div className="sk line tiny"/>
            <div className="sk line short"/>
          </div>

          <div className="sys-sk-main">
            <div className="top">
              <div className="sk av"/>
              <div className="body">
                <div className="sk title"/>
                <div className="sk line short"/>
              </div>
              <div className="sk line" style={{width:80, height:32, borderRadius:8}}/>
            </div>

            <div className="kpis">
              {[1,2,3,4].map(i => (
                <div key={i} className="kpi">
                  <div className="sk line tiny"/>
                  <div className="sk" style={{height:28, width:'70%'}}/>
                  <div className="sk line tiny"/>
                </div>
              ))}
            </div>

            <div className="charts">
              <div className="chart">
                <div className="sk line short"/>
                <div className="sk tile" style={{flex:1}}/>
              </div>
              <div className="chart">
                <div className="sk line short"/>
                <div className="sk tile" style={{flex:1}}/>
              </div>
            </div>
          </div>

          <div className="toast">
            <div className="spin"/>
            <span>正在跑 3 段 SQL · 预计 2.4s</span>
          </div>
        </div>
      </div>
    </div>
  );
};

/* =========================================================
   4. 5xx error
   ========================================================= */

export function GenericError() {
  return (
    <div className="p0-frame">
      <div className="ai-scene">
        <SysTop crumbs={['DataPulse']} badge="500 · INTERNAL"/>
        <div className="sys-5xx">
          <div className="body">
            <div className="eyebrow">Internal Server Error · 500</div>
            <div className="glyph">嗯…</div>
            <h1>这次<span style={{fontStyle:'italic'}}>不是你的问题</span>。我们这边出了点状况。</h1>
            <p>
              工程师已经收到这个错误,正在看。你可以重试,大概率几秒后就能恢复。
              如果一直不行,把下面这串 ID 发给我们,可以更快定位。
            </p>

            <div className="trace">
              <div><span className="k">incident_id   </span><span className="v">inc_8fa3d1c4-91ce-4280-a07b</span></div>
              <div><span className="k">trace         </span><span className="v">9d4e2a → routerd → modeld(timeout 30.0s)</span></div>
              <div><span className="k">timestamp     </span><span className="v">2026-09-30T14:58:42.118+08:00</span></div>
              <div><span className="k">message       </span><span className="err">UpstreamTimeoutError: model `deepseek-r1` did not return within 30s</span></div>
            </div>

            <div className="row">
              <button className="pri">重试 ⌘ R</button>
              <button className="alt">回首页</button>
              <button className="alt">查服务健康 →</button>
              <span className="copy">⧉ 复制错误 ID</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
