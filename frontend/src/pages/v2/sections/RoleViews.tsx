// @ts-nocheck
// Ported verbatim from datapulse-ai-design-system/project/v2/RoleViews.jsx
import React, { useState, useRef, useEffect, useMemo } from 'react'
import { AreaChart, BarChart, FunnelChart, LineCompareChart } from './CanvasA'

const { useState: useStateR } = React;

/* Sales view: territory + pipeline focused */
export function SalesView() {
  return (
    <div style={{padding: 32, height: '100%', overflow: 'auto', background: 'var(--paper)'}}>
      <div style={{maxWidth: 1280, margin: '0 auto'}}>
        <div style={{display:'flex', alignItems:'baseline', justifyContent:'space-between', marginBottom: 24}}>
          <div>
            <div className="eyebrow">默认视图 · 销售</div>
            <h2 style={{fontFamily:'var(--font-serif)', fontSize: 36, fontWeight:400, margin:'6px 0 0'}}>
              销售管线 · <span style={{fontStyle:'italic', color:'var(--amber-deep)'}}>本周</span>
            </h2>
          </div>
          <div style={{display:'flex', gap:8}}>
            <span className="pill" style={{padding:'6px 12px', border:'1px solid var(--line-1)', borderRadius:999, fontSize:12, color:'var(--ink-2)'}}>区域: 华东</span>
            <span className="pill" style={{padding:'6px 12px', border:'1px solid var(--line-1)', borderRadius:999, fontSize:12, color:'var(--ink-2)'}}>团队: 全部</span>
          </div>
        </div>

        <div style={{display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap: 12, marginBottom: 24}}>
          {[
            {l:'本周新签', v:'¥ 2.84M', d:'+12.3% 周同比', col:'var(--success)'},
            {l:'管线总额', v:'¥ 18.2M', d:'62 单 · 加权 ¥ 9.1M', col:'var(--ink-3)'},
            {l:'回款', v:'¥ 1.56M', d:'-4.2% 周同比', col:'var(--terracotta)'},
            {l:'活跃客户', v:'238', d:'+18 新增', col:'var(--success)'},
          ].map((k,i)=>(
            <div key={i} style={{padding:18, background:'var(--paper)', border:'1px solid var(--line-1)', borderRadius:14}}>
              <div style={{fontFamily:'var(--font-mono)', fontSize:10, letterSpacing:'0.18em', textTransform:'uppercase', color:'var(--ink-3)'}}>{k.l}</div>
              <div style={{fontFamily:'var(--font-serif)', fontSize:32, color:'var(--ink-1)', margin:'8px 0 4px'}}>{k.v}</div>
              <div style={{fontSize:11, color:k.col, fontFamily:'var(--font-mono)'}}>{k.d}</div>
            </div>
          ))}
        </div>

        <div style={{display:'grid', gridTemplateColumns:'2fr 1fr', gap: 16}}>
          <div style={{padding:20, background:'var(--paper)', border:'1px solid var(--line-1)', borderRadius:16}}>
            <div style={{display:'flex', justifyContent:'space-between', alignItems:'baseline', marginBottom:12}}>
              <h3 style={{fontFamily:'var(--font-serif)', fontSize:22, fontWeight:400, margin:0}}>销售漏斗 · 本季</h3>
              <span style={{fontFamily:'var(--font-mono)', fontSize:11, color:'var(--ink-3)'}}>线索 → 签约</span>
            </div>
            <FunnelChart ratios={[100, 64, 42, 23, 11]}/>
            <div style={{display:'flex', gap:16, marginTop:16, fontSize:12, color:'var(--ink-2)', fontFamily:'var(--font-mono)'}}>
              <span>报价转化 <strong style={{color:'var(--ink-1)'}}>54%</strong></span>
              <span>签约转化 <strong style={{color:'var(--ink-1)'}}>48%</strong></span>
              <span style={{color:'var(--success)'}}>↑ 总转化 +2.1pt</span>
            </div>
          </div>
          <div style={{padding:20, background:'var(--paper)', border:'1px solid var(--line-1)', borderRadius:16}}>
            <h3 style={{fontFamily:'var(--font-serif)', fontSize:22, fontWeight:400, margin:'0 0 12px'}}>本周需要关注</h3>
            {[
              {t:'金额最大: 海粤集团 ¥ 480K', m:'决策阶段 · 32 天'},
              {t:'卡住最久: 创智科技 ¥ 96K', m:'报价阶段 · 58 天'},
              {t:'即将到期: 普源 NDA', m:'还有 3 天'},
            ].map((it,i)=>(
              <div key={i} style={{padding:'10px 0', borderBottom:i<2?'1px solid var(--line-2)':'none'}}>
                <div style={{fontSize:13, color:'var(--ink-1)', fontWeight:500}}>{it.t}</div>
                <div style={{fontFamily:'var(--font-mono)', fontSize:11, color:'var(--ink-3)', marginTop:4}}>{it.m}</div>
              </div>
            ))}
          </div>
        </div>

        <div style={{padding:20, background:'var(--paper)', border:'1px solid var(--line-1)', borderRadius:16, marginTop:16}}>
          <h3 style={{fontFamily:'var(--font-serif)', fontSize:22, fontWeight:400, margin:'0 0 12px'}}>各区域签单趋势</h3>
          <BarChart/>
        </div>

        <div style={{marginTop:20, padding:14, background:'oklch(0.78 0.16 65 / 0.08)', borderRadius:12, fontSize:13, color:'var(--ink-2)'}}>
          <strong style={{color:'var(--amber-deep)'}}>从这里继续:</strong> 试试问 "华东的成交速度比华南慢多少?" 或 "上季度后 30% 客户的复购情况"
        </div>
      </div>
    </div>
  );
};

/* PM view: behavior + funnel */
export function PMView() {
  return (
    <div style={{padding: 32, height:'100%', overflow:'auto', background:'var(--paper)'}}>
      <div style={{maxWidth: 1280, margin: '0 auto'}}>
        <div style={{marginBottom: 24}}>
          <div className="eyebrow">默认视图 · 产品经理</div>
          <h2 style={{fontFamily:'var(--font-serif)', fontSize: 36, fontWeight:400, margin:'6px 0 0'}}>
            产品健康度 · <span style={{fontStyle:'italic', color:'var(--amber-deep)'}}>过去 28 天</span>
          </h2>
        </div>

        <div style={{display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap: 12, marginBottom: 24}}>
          {[
            {l:'DAU', v:'24.3K', d:'+8.1% MoM'},
            {l:'D7 留存', v:'42%', d:'-1.2pt'},
            {l:'核心动作完成率', v:'68%', d:'+3.4pt'},
            {l:'功能采纳率', v:'31%', d:'新功能 2 周'},
          ].map((k,i)=>(
            <div key={i} style={{padding:18, background:'var(--paper)', border:'1px solid var(--line-1)', borderRadius:14}}>
              <div style={{fontFamily:'var(--font-mono)', fontSize:10, letterSpacing:'0.18em', textTransform:'uppercase', color:'var(--ink-3)'}}>{k.l}</div>
              <div style={{fontFamily:'var(--font-serif)', fontSize:32, color:'var(--ink-1)', margin:'8px 0 4px'}}>{k.v}</div>
              <div style={{fontSize:11, color:'var(--ink-3)', fontFamily:'var(--font-mono)'}}>{k.d}</div>
            </div>
          ))}
        </div>

        <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap: 16, marginBottom: 16}}>
          <div style={{padding:20, background:'var(--paper)', border:'1px solid var(--line-1)', borderRadius:16}}>
            <h3 style={{fontFamily:'var(--font-serif)', fontSize:22, fontWeight:400, margin:'0 0 12px'}}>新用户激活漏斗</h3>
            <FunnelChart/>
            <div style={{marginTop:12, fontSize:12, color:'var(--terracotta)', fontFamily:'var(--font-mono)'}}>⚠ 激活→付费 流失 75%</div>
          </div>
          <div style={{padding:20, background:'var(--paper)', border:'1px solid var(--line-1)', borderRadius:16}}>
            <h3 style={{fontFamily:'var(--font-serif)', fontSize:22, fontWeight:400, margin:'0 0 12px'}}>留存曲线 · 新 vs 老</h3>
            <LineCompareChart/>
          </div>
        </div>

        <div style={{padding:20, background:'var(--paper)', border:'1px solid var(--line-1)', borderRadius:16, marginBottom: 16}}>
          <h3 style={{fontFamily:'var(--font-serif)', fontSize:22, fontWeight:400, margin:'0 0 12px'}}>A/B 实验池</h3>
          {[
            {n:'EXP-014 · 简化注册流', s:'运行中', d:'7 天 · +6.2% 注册转化', c:'var(--success)'},
            {n:'EXP-013 · 推荐新算法', s:'待评审', d:'14 天 · 显著性 0.96', c:'var(--amber-deep)'},
            {n:'EXP-012 · 引导文案', s:'已结束', d:'胜出: B (+2.8%)', c:'var(--ink-3)'},
          ].map((e,i)=>(
            <div key={i} style={{display:'flex', justifyContent:'space-between', padding:'12px 0', borderBottom:i<2?'1px solid var(--line-2)':'none', alignItems:'center'}}>
              <div>
                <div style={{fontSize:14, color:'var(--ink-1)', fontWeight:500}}>{e.n}</div>
                <div style={{fontFamily:'var(--font-mono)', fontSize:11, color:'var(--ink-3)', marginTop:2}}>{e.d}</div>
              </div>
              <span style={{fontFamily:'var(--font-mono)', fontSize:10, letterSpacing:'0.15em', textTransform:'uppercase', padding:'4px 10px', borderRadius:999, background:'var(--paper-2)', color:e.c}}>{e.s}</span>
            </div>
          ))}
        </div>

        <div style={{padding:14, background:'oklch(0.78 0.16 65 / 0.08)', borderRadius:12, fontSize:13, color:'var(--ink-2)'}}>
          <strong style={{color:'var(--amber-deep)'}}>从这里继续:</strong> 试试 "对比新老用户的核心动作完成路径" 或 "找出留存最高的 5 个使用场景"
        </div>
      </div>
    </div>
  );
};

/* Executive view: minimal, big numbers, bold */
export function ExecView() {
  return (
    <div style={{padding: '48px 64px', height:'100%', overflow:'auto', background:'var(--paper)'}}>
      <div style={{maxWidth: 1180, margin:'0 auto'}}>
        <div style={{marginBottom: 32, display:'flex', justifyContent:'space-between', alignItems:'baseline'}}>
          <div>
            <div className="eyebrow">默认视图 · 高管</div>
            <h2 style={{fontFamily:'var(--font-serif)', fontSize: 44, fontWeight:400, margin:'6px 0 0', lineHeight:1.1}}>
              本周一图 · <span style={{fontStyle:'italic'}}>不需要 SQL</span>
            </h2>
          </div>
          <div style={{fontFamily:'var(--font-mono)', fontSize:11, letterSpacing:'0.2em', color:'var(--ink-4)', textTransform:'uppercase'}}>
            04月19日 — 04月25日
          </div>
        </div>

        <div style={{padding: 40, background:'linear-gradient(135deg, oklch(0.97 0.025 70), oklch(0.94 0.03 50))', border:'1px solid var(--line-1)', borderRadius:24, marginBottom:24}}>
          <div className="eyebrow">头条</div>
          <div style={{fontFamily:'var(--font-serif)', fontSize:54, lineHeight:1.1, color:'var(--ink-1)', margin:'12px 0 16px', letterSpacing:'-0.02em'}}>
            营收 <span style={{color:'var(--amber-deep)'}}>¥ 12.4M</span>,<br/>
            创历史单周新高,<span style={{fontStyle:'italic', color:'var(--ink-3)'}}>同比 +28%</span>。
          </div>
          <div style={{fontSize:15, color:'var(--ink-2)', maxWidth: 720, lineHeight:1.6}}>
            主要由抖音渠道带动,GMV 占比从 31% 升至 39%。私域转化率维持高位 78%,但绝对量级仍不及付费渠道。
          </div>
        </div>

        <div style={{display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap: 16, marginBottom: 24}}>
          {[
            {l:'营收', v:'¥ 12.4M', d:'+28% 同比', col:'var(--success)'},
            {l:'付费用户', v:'8,420', d:'+11.2%', col:'var(--success)'},
            {l:'获客成本', v:'¥ 84', d:'-6.4%', col:'var(--success)'},
          ].map((k,i)=>(
            <div key={i} style={{padding:24, background:'var(--paper)', border:'1px solid var(--line-1)', borderRadius:18}}>
              <div style={{fontFamily:'var(--font-mono)', fontSize:11, letterSpacing:'0.2em', textTransform:'uppercase', color:'var(--ink-3)'}}>{k.l}</div>
              <div style={{fontFamily:'var(--font-serif)', fontSize:48, color:'var(--ink-1)', margin:'12px 0 6px', lineHeight:1}}>{k.v}</div>
              <div style={{fontSize:13, color:k.col, fontFamily:'var(--font-mono)'}}>{k.d}</div>
            </div>
          ))}
        </div>

        <div style={{padding:24, background:'var(--paper)', border:'1px solid var(--line-1)', borderRadius:18, marginBottom: 24}}>
          <div style={{display:'flex', justifyContent:'space-between', alignItems:'baseline', marginBottom: 16}}>
            <h3 style={{fontFamily:'var(--font-serif)', fontSize:24, fontWeight:400, margin:0}}>12 周营收走势</h3>
            <span style={{fontFamily:'var(--font-mono)', fontSize:11, color:'var(--ink-3)'}}>YoY 对比</span>
          </div>
          <AreaChart label="exec1"/>
        </div>

        <div>
          <h3 style={{fontFamily:'var(--font-serif)', fontSize:24, fontWeight:400, margin:'0 0 16px'}}>三件需要你拍板的事</h3>
          {[
            {n:'01', t:'是否把抖音预算从 30% 提到 45%', m:'@CMO 已写好建议方案 · 等你回复'},
            {n:'02', t:'付费转化第 3 阶段流失加剧', m:'@产品总监 提议本周内灰度新引导'},
            {n:'03', t:'华东大客户海粤即将续约', m:'¥ 480K · 决策已 32 天'},
          ].map((it,i)=>(
            <div key={i} style={{display:'flex', gap:20, padding:'18px 0', borderBottom:i<2?'1px solid var(--line-2)':'none'}}>
              <div style={{fontFamily:'var(--font-serif)', fontStyle:'italic', fontSize:32, color:'var(--amber-deep)', lineHeight:1, width: 56}}>{it.n}</div>
              <div style={{flex:1}}>
                <div style={{fontFamily:'var(--font-serif)', fontSize:22, color:'var(--ink-1)', lineHeight:1.3}}>{it.t}</div>
                <div style={{fontSize:13, color:'var(--ink-3)', marginTop:6}}>{it.m}</div>
              </div>
              <button style={{alignSelf:'center', padding:'10px 18px', border:'1px solid var(--ink-1)', background:'transparent', borderRadius:999, fontSize:12, cursor:'pointer'}}>查看详情 →</button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
