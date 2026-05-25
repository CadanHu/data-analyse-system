// @ts-nocheck
// Ported verbatim from datapulse-ai-design-system/project/v2/Admin.jsx
import React, { useState, useRef, useEffect, useMemo } from 'react'

const { useState: useS_AD } = React;

/* =========================================================
   Admin · Audit / API keys / Models / Billing
   ========================================================= */

function AdmSide({ on }) {
  return (
    <div className="adm-side">
      <div className="brand"><span className="dot"/>DataPulse</div>
      <div className="group">合规 · COMPLIANCE</div>
      <a className={on==='audit'?'on':''}><span className="ix">▸</span>审计日志</a>
      <a><span className="ix">·</span>会话留痕</a>
      <a><span className="ix">·</span>数据脱敏</a>
      <div className="group">访问 · ACCESS</div>
      <a className={on==='keys'?'on':''}><span className="ix">▸</span>API Key</a>
      <a><span className="ix">·</span>OAuth 应用</a>
      <a><span className="ix">·</span>SSO 配置</a>
      <div className="group">资源 · RESOURCES</div>
      <a className={on==='models'?'on':''}><span className="ix">▸</span>模型与算力</a>
      <a><span className="ix">·</span>沙箱配额</a>
      <a className={on==='billing'?'on':''}><span className="ix">▸</span>账单与套餐</a>
      <div className="group">系统 · SYSTEM</div>
      <a><span className="ix">·</span>服务健康</a>
      <a><span className="ix">·</span>导出 / 备份</a>
    </div>
  );
}

/* =========================================================
   1. Audit log
   ========================================================= */

const AUDIT = [
  { t:'14:48:21', who:{n:'李文', av:'李', cls:''},  verb:'create', cls:'c', target:'看板 · Q3 渠道复盘', meta:'12 节点',          ip:'10.4.21.18'  },
  { t:'14:32:09', who:{n:'陈昊', av:'陈', cls:'b'}, verb:'update', cls:'u', target:'指标 · gmv', meta:'v3 口径修订',                ip:'10.4.21.42'  },
  { t:'14:28:54', who:{n:'李文', av:'李', cls:''},  verb:'invite', cls:'c', target:'成员 · sunyu@acme.com',  meta:'访客角色',          ip:'10.4.21.18'  },
  { t:'14:08:11', who:{n:'周晴', av:'周', cls:'c'}, verb:'share',  cls:'c', target:'节点 · #04 抖音 vs 私域', meta:'→ @销售 14 人',     ip:'10.4.22.06'  },
  { t:'13:56:32', who:{n:'API · pulse-cli', av:'A', cls:'sys'}, verb:'query', cls:'u', target:'datasource · events_olap', meta:'扫描 2.4M 行', ip:'10.4.22.91' },
  { t:'13:48:02', who:{n:'李文', av:'李', cls:''},  verb:'export', cls:'c', target:'看板 · Q3 渠道复盘 · PDF', meta:'18 页 · 4.2MB',     ip:'10.4.21.18'  },
  { t:'13:22:45', who:{n:'陈昊', av:'陈', cls:'b'}, verb:'delete', cls:'d', target:'节点 · #11 临时草稿',     meta:'软删除 · 30 天可恢复', ip:'10.4.21.42' },
  { t:'12:54:18', who:{n:'王萌', av:'王', cls:''},  verb:'login',  cls:'c', target:'会话 · macOS Chrome',     meta:'SSO 飞书',           ip:'10.4.21.78' },
  { t:'12:10:33', who:{n:'API · pulse-sdk', av:'A', cls:'sys'}, verb:'create', cls:'c', target:'订阅 · GMV 异常守望',     meta:'阈值 ¥ 1.5M',     ip:'10.4.22.91' },
  { t:'11:48:00', who:{n:'李文', av:'李', cls:''},  verb:'revoke', cls:'d', target:'API Key · production-ro', meta:'轮换 · 替换为 v3',    ip:'10.4.21.18' },
];

export function AdminAudit() {
  return (
    <div className="p0-frame">
      <div className="adm-shell">
        <AdmSide on="audit"/>
        <div className="adm-main">
          <div className="adm-head">
            <div>
              <span className="sub">合规 · 审计日志</span>
              <h1>谁,什么时候,改了什么</h1>
            </div>
            <div className="right">
              <button className="btn-ghost">导出 CSV</button>
              <button className="btn-ghost">订阅每周摘要</button>
            </div>
          </div>

          <div className="adm-stats">
            <div className="adm-stat">
              <div className="k">今日事件</div>
              <div className="v"><em>284</em></div>
              <div className="delta up">+12% vs 昨</div>
            </div>
            <div className="adm-stat">
              <div className="k">写入 · 30 天</div>
              <div className="v">1,842</div>
              <div className="delta">平均 61 / 天</div>
            </div>
            <div className="adm-stat">
              <div className="k">删除 · 30 天</div>
              <div className="v">42</div>
              <div className="delta dn">+3 异常</div>
            </div>
            <div className="adm-stat">
              <div className="k">API 调用</div>
              <div className="v">96.4k</div>
              <div className="delta up">+18% MoM</div>
            </div>
          </div>

          <div className="adm-filters">
            <div className="adm-search">
              <span style={{color:'var(--ink-4)'}}>⌕</span>
              <input placeholder="搜对象、邮箱、IP、动作..." defaultValue=""/>
            </div>
            <span className="adm-chip on">全部 · 1,842</span>
            <span className="adm-chip">创建 · 412</span>
            <span className="adm-chip">修改 · 968</span>
            <span className="adm-chip">删除 · 42</span>
            <span className="adm-chip">分享 · 220</span>
            <span style={{flex:1}}/>
            <span className="adm-chip">最近 30 天</span>
          </div>

          <div className="adm-tbl">
            <table>
              <thead>
                <tr>
                  <th>时间</th>
                  <th>操作人</th>
                  <th>动作</th>
                  <th>对象</th>
                  <th>IP</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {AUDIT.map((r, i) => (
                  <tr key={i}>
                    <td><span className="when">2026-09-30 {r.t}</span></td>
                    <td>
                      <div className="who">
                        <div className={`av ${r.who.cls}`}>{r.who.av}</div>
                        {r.who.n}
                      </div>
                    </td>
                    <td><span className={`verb ${r.cls}`}>{r.verb}</span></td>
                    <td><span className="target">{r.target}<em>· {r.meta}</em></span></td>
                    <td><span className="ip">{r.ip}</span></td>
                    <td><span className="row-actions">详情 ›</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};

/* =========================================================
   2. API keys
   ========================================================= */

export function AdminApiKeys() {
  return (
    <div className="p0-frame">
      <div className="adm-shell">
        <AdmSide on="keys"/>
        <div className="adm-main">
          <div className="adm-head">
            <div>
              <span className="sub">访问 · API KEY</span>
              <h1>API Key 与凭据</h1>
            </div>
            <div className="right">
              <button className="btn-ghost">查看文档 →</button>
              <button className="btn-primary">+ 新建 Key</button>
            </div>
          </div>

          <div className="adm-stats">
            <div className="adm-stat">
              <div className="k">活跃 Key</div>
              <div className="v"><em>4</em></div>
              <div className="delta">共 5 个上限</div>
            </div>
            <div className="adm-stat">
              <div className="k">本月调用</div>
              <div className="v">96.4k</div>
              <div className="delta up">+18% MoM</div>
            </div>
            <div className="adm-stat">
              <div className="k">本月限额</div>
              <div className="v">200k</div>
              <div className="delta">48.2% 已用</div>
            </div>
            <div className="adm-stat">
              <div className="k">下次轮换</div>
              <div className="v">12 天</div>
              <div className="delta">production-ro</div>
            </div>
          </div>

          <div className="p0-eyebrow" style={{display:'block', marginBottom:10}}>当前 Key · 4</div>

          {[
            { name:'production-ro', tag:'live',  key:'sk_live_8fa3…91ce', last:'刚刚',     usage:'12.8k', perm:'只读 · 查询',  by:'李文' },
            { name:'production-rw', tag:'live',  key:'sk_live_42da…07bf', last:'2 分钟前', usage:'48.1k', perm:'读 / 写',     by:'陈昊' },
            { name:'dashboards-bi', tag:'live',  key:'sk_live_6c19…b3a7', last:'1 小时前', usage:'33.6k', perm:'只读 · 看板',  by:'李文' },
            { name:'staging-test',  tag:'test',  key:'sk_test_a190…2d4e', last:'昨天',     usage:'1.9k',  perm:'读 / 写',     by:'陈昊' },
          ].map(k => (
            <div key={k.name} className="adm-keycard">
              <div className="body">
                <div className="name">
                  <span className="n">{k.name}</span>
                  <span className={`pill ${k.tag}`}>{k.tag}</span>
                </div>
                <div className="key">
                  <span>{k.key}</span>
                  <span className="reveal">显示</span>
                  <span className="reveal">复制</span>
                </div>
              </div>
              <div className="col">
                <div className="k">最近调用</div>
                <div className="v">{k.last}</div>
              </div>
              <div className="col">
                <div className="k">本月 / 调用</div>
                <div className="v up">{k.usage}</div>
              </div>
              <div className="col">
                <div className="k">权限</div>
                <div className="v">{k.perm}</div>
              </div>
              <div className="actions">
                <a>轮换</a>
                <a>限额</a>
                <a className="danger">吊销</a>
              </div>
            </div>
          ))}

          <div style={{marginTop:24, padding:'18px 22px', background:'oklch(0.78 0.16 65 / 0.06)',
            border:'1px solid oklch(0.78 0.16 65 / 0.3)', borderRadius:'var(--r-xl)',
            display:'flex', gap:14, alignItems:'center'}}>
            <div style={{width:36, height:36, borderRadius:8, background:'var(--amber)',
              color:'var(--ink-1)', display:'grid', placeItems:'center',
              fontFamily:'var(--font-serif)', fontSize:18}}>!</div>
            <div style={{flex:1}}>
              <div style={{fontSize:14, color:'var(--ink-1)', fontWeight:500, marginBottom:2}}>建议每 90 天轮换一次 production Key</div>
              <div style={{fontSize:12, color:'var(--ink-3)', lineHeight:1.5}}>
                我们会提前 14 天提醒你,并在新 Key 启用后保留旧 Key 7 天作过渡。<a style={{color:'var(--amber-deep)', cursor:'pointer'}}>开启自动轮换 →</a>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

/* =========================================================
   3. Model usage + compute
   ========================================================= */

function Ring({ pct }) {
  const r = 70, c = 2 * Math.PI * r;
  return (
    <svg width="160" height="160" viewBox="0 0 160 160">
      <circle cx="80" cy="80" r={r} fill="none"
        stroke="var(--paper-2)" strokeWidth="14"/>
      <circle cx="80" cy="80" r={r} fill="none"
        stroke="var(--amber-deep)" strokeWidth="14"
        strokeLinecap="round"
        strokeDasharray={`${c * pct} ${c}`}
        transform="rotate(-90 80 80)"/>
    </svg>
  );
}

export function AdminModels() {
  return (
    <div className="p0-frame">
      <div className="adm-shell">
        <AdmSide on="models"/>
        <div className="adm-main">
          <div className="adm-head">
            <div>
              <span className="sub">资源 · 模型与算力</span>
              <h1>这个月烧了哪些模型?</h1>
            </div>
            <div className="right">
              <button className="btn-ghost">⌚ 30 天</button>
              <button className="btn-ghost">导出</button>
            </div>
          </div>

          <div className="adm-models">
            <div>
              <div className="adm-mcards">
                {[
                  { ic:'DR1', cls:'',  name:'DeepSeek R1',     desc:'对话主路由 · 大窗口',    q:'48,210', tok:'62.4M',  cost:'¥ 412.8',  pct: 0.62 },
                  { ic:'GPT', cls:'b', name:'GPT-4o',          desc:'兜底 / 中英混合',        q:'14,602', tok:'9.1M',   cost:'¥ 188.0',  pct: 0.31 },
                  { ic:'CL3', cls:'c', name:'Claude Sonnet',   desc:'长上下文 · 思维链',     q:'8,914',  tok:'14.2M',  cost:'¥ 224.6',  pct: 0.42 },
                  { ic:'EMB', cls:'d', name:'BGE Embedding',   desc:'语义层 / 向量召回',     q:'182k',   tok:'—',      cost:'¥ 48.2',   pct: 0.18 },
                ].map(m => (
                  <div key={m.name} className="adm-mcard">
                    <div className="head">
                      <div className={`badge ${m.cls}`}>{m.ic}</div>
                      <div>
                        <div className="name">{m.name}</div>
                        <div className="desc">{m.desc}</div>
                      </div>
                      <span className="status">在线</span>
                    </div>
                    <div className="grid">
                      <div className="cell">
                        <div className="k">请求 · 30d</div>
                        <div className="v">{m.q}</div>
                      </div>
                      <div className="cell">
                        <div className="k">Token</div>
                        <div className="v">{m.tok}</div>
                      </div>
                      <div className="cell">
                        <div className="k">成本</div>
                        <div className="v"><em>{m.cost}</em></div>
                      </div>
                    </div>
                    <div className="bar">
                      <div className="fill" style={{width:`${m.pct * 100}%`}}/>
                    </div>
                    <div className="bar-label">
                      <span>占月度预算 {Math.round(m.pct * 100)}%</span>
                      <span>预算 ¥ {Math.round(parseFloat(m.cost.replace(/[^\d.]/g,'')) / m.pct)}</span>
                    </div>
                  </div>
                ))}
              </div>

              <div style={{
                background:'var(--paper)',
                border:'1px solid var(--line-1)', borderRadius:'var(--r-xl)',
                padding:'18px 22px'}}>
                <div style={{fontFamily:'var(--font-mono)', fontSize:10, letterSpacing:'0.2em',
                  textTransform:'uppercase', color:'var(--ink-3)', marginBottom:14}}>
                  路由策略 · ROUTING
                </div>
                {[
                  ['Standard · 闲聊 + 简单 SQL', 'DeepSeek R1', 'DR1'],
                  ['Scientist · 沙箱 Python + HITL', 'Claude Sonnet', 'CL3'],
                  ['Deep / RAG · 知识库召回', 'BGE → DeepSeek R1', 'EMB'],
                  ['兜底 · 主路由超时 / 限流', 'GPT-4o', 'GPT'],
                ].map(([k, v, ic]) => (
                  <div key={k} style={{display:'flex', alignItems:'center', gap:14,
                    padding:'10px 0', borderBottom:'1px dashed var(--line-2)'}}>
                    <span style={{fontFamily:'var(--font-mono)', fontSize:11,
                      color:'var(--ink-3)', width:240, letterSpacing:'0.06em'}}>{k}</span>
                    <span style={{fontFamily:'var(--font-mono)', fontSize:11, color:'var(--ink-4)'}}>→</span>
                    <div style={{width:28, height:28, borderRadius:6,
                      background:'var(--paper-2)', border:'1px solid var(--line-1)',
                      display:'grid', placeItems:'center',
                      fontFamily:'var(--font-mono)', fontSize:10, color:'var(--ink-2)', fontWeight:600}}>{ic}</div>
                    <span style={{flex:1, fontSize:13, color:'var(--ink-1)'}}>{v}</span>
                    <span style={{fontFamily:'var(--font-mono)', fontSize:11, color:'var(--amber-deep)', cursor:'pointer'}}>编辑</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="adm-quota">
              <div className="ttl">月度预算 · BUDGET</div>
              <div className="ring">
                <Ring pct={0.54}/>
                <div className="num"><em>54%</em></div>
              </div>
              <div className="meta">
                <b style={{color:'var(--ink-1)', fontFamily:'var(--font-sans)'}}>¥ 873.6</b> / ¥ 1,620<br/>
                月底预计 ¥ 1,486 · 不会超
              </div>
              <hr/>
              <div className="field">
                <span className="k">沙箱 vCPU</span>
                <span className="v">8 / 16</span>
              </div>
              <div className="field">
                <span className="k">沙箱 RAM</span>
                <span className="v">12 / 32 GB</span>
              </div>
              <div className="field">
                <span className="k">RAG 向量库</span>
                <span className="v">42 / 100 GB</span>
              </div>
              <div className="field">
                <span className="k">月度限额</span>
                <span className="v">¥ 1,620</span>
              </div>
              <div style={{marginTop:16, padding:'10px 12px',
                background:'oklch(0.78 0.16 65 / 0.08)', borderRadius:'var(--r-md)',
                fontFamily:'var(--font-mono)', fontSize:11, color:'var(--amber-deep)',
                letterSpacing:'0.06em', textAlign:'center', cursor:'pointer'}}>
                提升到企业版 →
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

/* =========================================================
   4. Billing
   ========================================================= */

export function AdminBilling() {
  return (
    <div className="p0-frame">
      <div className="adm-shell">
        <AdmSide on="billing"/>
        <div className="adm-main">
          <div className="adm-head">
            <div>
              <span className="sub">资源 · 账单与套餐</span>
              <h1>账单 · 套餐</h1>
            </div>
            <div className="right">
              <button className="btn-ghost">下载发票</button>
              <button className="btn-ghost">付款方式</button>
            </div>
          </div>

          <div className="bil-plan">
            <div className="left">
              <span className="tag">当前 · CURRENT PLAN</span>
              <h2><em>Team</em> · 50 席位</h2>
              <div className="sub">月度计费 · 下次扣款 2026-10-15 · ¥ 4,800</div>
            </div>
            <div className="right">
              <button className="btn-ghost">管理席位</button>
              <button className="btn-primary">升级到 Enterprise →</button>
            </div>
          </div>

          <div className="bil-stats">
            <div className="bil-stat">
              <div className="k">席位 · SEATS</div>
              <div className="row">
                <span className="v">42 / 50</span>
                <span className="limit">余 8</span>
              </div>
              <div className="bar"><div className="fill" style={{width:'84%'}}/></div>
              <div className="reset">下月 1 日重置</div>
            </div>
            <div className="bil-stat">
              <div className="k">月度提问</div>
              <div className="row">
                <span className="v">12.4k / 50k</span>
                <span className="limit">余 37.6k</span>
              </div>
              <div className="bar"><div className="fill" style={{width:'24.8%'}}/></div>
              <div className="reset">下月 1 日重置</div>
            </div>
            <div className="bil-stat">
              <div className="k">沙箱算力 · vCPU·h</div>
              <div className="row">
                <span className="v">842 / 1,000</span>
                <span className="limit" style={{color:'var(--warning)'}}>余 158</span>
              </div>
              <div className="bar"><div className="fill warn" style={{width:'84.2%'}}/></div>
              <div className="reset">下月 1 日重置</div>
            </div>
          </div>

          <div className="bil-invoices">
            <div className="hd">
              <span className="lbl">账单历史 · 12 个月</span>
              <span className="right">
                <button className="btn-ghost">导出 PDF</button>
              </span>
            </div>
            <table>
              <thead>
                <tr>
                  <th>账期</th>
                  <th>说明</th>
                  <th>编号</th>
                  <th>金额</th>
                  <th>状态</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {[
                  { p:'2026-09', d:'Team · 50 席位 · 月度', n:'INV-26092-001', a:'¥ 4,800', s:'paid', sn:'已付' },
                  { p:'2026-09', d:'按量超额 · 沙箱 vCPU·h × 142', n:'INV-26092-002', a:'¥ 142.0', s:'due',  sn:'待付' },
                  { p:'2026-08', d:'Team · 50 席位 · 月度', n:'INV-26082-001', a:'¥ 4,800', s:'paid', sn:'已付' },
                  { p:'2026-08', d:'席位扩容 · +5(8 月 12 日起)', n:'INV-26082-002', a:'¥ 280', s:'paid', sn:'已付' },
                  { p:'2026-07', d:'Team · 45 席位 · 月度', n:'INV-26072-001', a:'¥ 4,320', s:'paid', sn:'已付' },
                  { p:'2026-06', d:'Team · 45 席位 · 月度', n:'INV-26062-001', a:'¥ 4,320', s:'paid', sn:'已付' },
                ].map((r, i) => (
                  <tr key={i}>
                    <td><span style={{fontFamily:'var(--font-mono)', fontSize:11, color:'var(--ink-3)'}}>{r.p}</span></td>
                    <td>{r.d}</td>
                    <td><span className="num">{r.n}</span></td>
                    <td><span className="amt">{r.a}</span></td>
                    <td><span className={`status ${r.s}`}>● {r.sn}</span></td>
                    <td><span style={{fontFamily:'var(--font-mono)', fontSize:11, color:'var(--amber-deep)', cursor:'pointer'}}>↓ PDF</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};
