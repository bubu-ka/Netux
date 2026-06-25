/* ETF轮动 component
 * 数据: frontend/data/etf_rotation.json
 */
(function () {
  "use strict";

  const DATA_URL = "data/etf_rotation.json";
  let payload = null;
  let chartInst = null;

  function esc(s) {
    return String(s || "").replace(/[&<>"]/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;",
    }[c]));
  }
  function fmtPct(v, signed = true) {
    if (v === null || v === undefined || isNaN(v)) return "—";
    const n = Number(v);
    return (signed && n >= 0 ? "+" : "") + n.toFixed(2) + "%";
  }
  function fmtNum(v, digits = 2) {
    if (v === null || v === undefined || isNaN(v)) return "—";
    return Number(v).toFixed(digits);
  }
  function pctClass(v) {
    if (v === null || v === undefined || isNaN(v)) return "flat";
    if (Number(v) > 0) return "up";
    if (Number(v) < 0) return "down";
    return "flat";
  }
  function riskLabel(mode) {
    if (mode === "cash") return "清仓防守";
    if (mode === "half") return "半仓防守";
    return "正常轮动";
  }

  async function loadData() {
    const res = await fetch(DATA_URL, { cache: "no-store" });
    if (!res.ok) throw new Error("HTTP " + res.status);
    return res.json();
  }

  function renderSection() {
    return `<div class="etf-section-divider"></div>`;
  }

  function renderExplain() {
    const c = payload.config || {};
    return `
      <div class="range-strategy-card etf-rotation-explain">
        <div class="rs-head">
          <div class="rs-title">
            <span class="rs-name">ETF轮动2.0</span>
            <span class="rs-tag">趋势过滤 + 相对强弱 + 波动率控制 + 回撤保护</span>
          </div>
          <div class="rs-params">
            <code>周频调仓</code><code>Top${c.top_n || 3}</code><code>风险平价</code><code>MA${c.trend_ma || 120}</code>
          </div>
        </div>
        <div class="rs-desc">只在 ETF 站上长期趋势线时参与排名，使用 R20/R60/R120/R250 综合动量并扣除波动率惩罚，选择强势 Top3，按波动率倒数分配仓位；组合回撤超过阈值时自动降仓或清仓。</div>
      </div>
    `;
  }

  function renderPoolFit() {
    const fit = payload.pool_fit || {};
    if (!fit || !fit.status) return "";
    const status = fit.status || "normal";
    const statusText = status === "warning" ? "风格集中" : status === "watch" ? "观察" : "正常";
    const statusIcon = status === "warning" ? "⚠" : status === "watch" ? "◐" : "✓";
    const cats = (fit.category_scores || []).slice(0, 4);
    const hints = fit.hints || [];
    return `
      <div class="panel etf-pool-fit">
        <div class="panel-title">市场主线观察<small>观察当前强势分类与持仓集中度，不预测市场</small></div>
        <div class="etf-pool-fit-head">
          <div class="etf-pool-fit-status ${esc(status)}"><span>${statusIcon}</span>${statusText}</div>
          <div><b>${esc(fit.dominant_category || "—")}</b><span>当前主导分类</span></div>
          <div><b>${fmtPct(fit.holding_concentration_pct, false)}</b><span>持仓集中度</span></div>
          <div><b>${fit.trend_ok_count || 0}/${fit.pool_count || 0}</b><span>站上MA120</span></div>
        </div>
        <div class="etf-pool-fit-grid">
          <div><span>Top5分类集中度</span><b>${fmtPct(fit.top5_concentration_pct, false)}</b></div>
          <div><span>活跃分类</span><b>${(fit.active_categories || []).map(esc).join("、") || "—"}</b></div>
          <div><span>观察结论</span><b>${esc(fit.explanation || "仅作观察，不代表后续行情判断。")}</b></div>
        </div>
        ${cats.length ? `<div class="etf-pool-fit-cats">${cats.map((c) => `<span><b>${esc(c.category)}</b> 均分 ${fmtNum(c.avg_score, 2)} · 趋势 ${c.trend_ok_count || 0}/${c.pool_count || 0} · 持仓 ${fmtPct(c.holding_weight_pct || 0, false)}</span>`).join("")}</div>` : ""}
        ${hints.length ? `<div class="etf-pool-fit-hints">${hints.map((h) => `<div>${esc(h)}</div>`).join("")}</div>` : ""}
      </div>
    `;
  }

  function renderPool() {
    const groups = {};
    (payload.pool || []).forEach((it) => {
      (groups[it.category || "其他"] = groups[it.category || "其他"] || []).push(it);
    });
    const html = Object.entries(groups).map(([cat, items]) => `
      <div class="etf-pool-group">
        <div class="etf-pool-title">${esc(cat)}</div>
        <div class="etf-chip-list">
          ${items.map((it) => `<span class="etf-chip"><b>${esc(it.symbol)}</b>${esc(it.name)}</span>`).join("")}
        </div>
      </div>
    `).join("");
    return `<div class="panel"><div class="panel-title">ETF池子<small>单独配置，只参与 ETF 轮动</small></div><div class="etf-pool-grid">${html}</div></div>`;
  }

  function renderKPIs() {
    const m = payload.metrics || {};
    const cur = payload.current || {};
    return `
      <div class="kpi-row etf-kpis">
        <div class="kpi ${pctClass(m.annual_return_pct)}"><div class="label">年化收益</div><div class="value">${fmtPct(m.annual_return_pct)}</div><div class="sub">累计 ${fmtPct(m.total_return_pct)}</div></div>
        <div class="kpi down"><div class="label">最大回撤</div><div class="value">${fmtPct(-(m.max_drawdown_pct || 0))}</div><div class="sub">当前回撤 ${fmtPct(-(cur.drawdown_pct || 0))}</div></div>
        <div class="kpi"><div class="label">风险模式</div><div class="value risk-mode ${esc(cur.risk_mode || "normal")}">${riskLabel(cur.risk_mode)}</div><div class="sub">目标仓位 ${fmtPct(cur.target_exposure_pct, false)}</div></div>
        <div class="kpi"><div class="label">当前持仓</div><div class="value">${(cur.holdings || []).length}</div><div class="sub">调仓 ${m.rebalance_count || 0} 次 · 夏普 ${fmtNum(m.sharpe, 2)}</div></div>
      </div>
    `;
  }

  function renderLivePortfolio() {
    const live = payload.live_portfolio || {};
    const p = live.portfolio || {};
    const positions = p.positions || [];
    return `
      <div class="kpi-row live-portfolio-kpis">
        <div class="kpi"><div class="label">本金</div><div class="value">${fmtNum(p.initial_capital, 2)}</div><div class="sub">起始 ${esc(live.start_date || p.start_date || "2026-06-24")}</div></div>
        <div class="kpi"><div class="label">总市值</div><div class="value">${fmtNum(p.total_equity, 2)}</div><div class="sub">持仓 ${fmtNum(p.position_value || 0, 2)} · 现金 ${fmtNum(p.cash, 2)}</div></div>
        <div class="kpi"><div class="label">持仓</div><div class="value">${positions.length}</div><div class="sub">占用 ${fmtPct(p.total_equity ? (p.position_value || 0) / p.total_equity * 100 : 0, false)}</div></div>
        <div class="kpi ${pctClass(p.total_pnl_pct)}"><div class="label">总盈亏</div><div class="value">${fmtNum(p.total_pnl, 2)}</div><div class="sub">${fmtPct(p.total_pnl_pct)}</div></div>
        <div class="kpi ${pctClass(p.daily_pnl_pct)}"><div class="label">当日盈亏</div><div class="value">${fmtNum(p.daily_pnl || 0, 2)}</div><div class="sub">${fmtPct(p.daily_pnl_pct || 0)}</div></div>
      </div>
    `;
  }

  function renderLivePositions() {
    const p = ((payload.live_portfolio || {}).portfolio) || {};
    const positions = p.positions || [];
    if (!positions.length) {
      return `<div class="panel"><div class="panel-title">当前持仓明细<small>当前空仓</small></div><div class="etf-position-empty">当前无持仓，等待明日操作建议或交易记录。</div></div>`;
    }
    const cards = positions.map((h) => {
      const cls = pctClass(h.pnl_pct);
      return `
        <div class="etf-position-card ${cls}">
          <div class="etf-position-head">
            <div><b>${esc(h.name)}</b><span>${esc(h.symbol)} · ${esc(h.category || "")}</span></div>
            <strong>${fmtPct(h.weight_pct, false)}</strong>
          </div>
          <div class="etf-position-value">${fmtNum(h.market_value, 2)}</div>
          <div class="etf-position-pnl ${cls}">${fmtNum(h.pnl, 2)} / ${fmtPct(h.pnl_pct)}</div>
          <div class="etf-position-meta">
            <span>份额 ${fmtNum(h.shares, 0)}</span><span>成本 ${fmtNum(h.avg_cost, 4)}</span><span>现价 ${fmtNum(h.current_price, 4)}</span><span>日盈亏 ${fmtNum(h.daily_pnl || 0, 2)}</span>
          </div>
        </div>`;
    }).join("");
    return `<div class="panel"><div class="panel-title">当前持仓明细<small>按最新收盘价估算 · 合计 ${fmtNum(p.position_value || 0, 2)}</small></div><div class="etf-position-grid">${cards}</div></div>`;
  }

  function renderLastYearBacktest() {
    const c = payload.comparisons || {};
    const m = payload.metrics || {};
    const holding3 = c.holding3 || c.top3 || m.last_year || {};
    function block(label, ly) {
      return `<div>
        <span>${label}</span>
        <b class="${pctClass(ly.return_pct)}">${fmtPct(ly.return_pct)}</b>
        <em>本金 ${fmtNum(ly.initial, 2)} → ${fmtNum(ly.final, 2)}</em>
      </div>`;
    }
    return `
      <div class="panel etf-last-year-card">
        <div class="panel-title">回测概览<small>本金 ${fmtNum(holding3.initial || m.initial, 2)} · ${esc(holding3.start_date || "—")} → ${esc(holding3.end_date || "—")} · [回测]首次建仓 ${esc(m.first_entry_date || "—")} · 收益继续投入</small></div>
        <div class="etf-backtest-numbers compare">
          ${block("持仓3支回测收益率", holding3)}
        </div>
      </div>
    `;
  }

  function renderContributionTable() {
    const rows = (payload.last_year_contributions || []).map((r) => `
      <tr>
        <td>${esc(r.category)}</td>
        <td class="sym">${esc(r.symbol)}</td>
        <td>${esc(r.name)}</td>
        <td class="num ${pctClass(r.return_contribution_pct)}">${fmtPct(r.return_contribution_pct)}</td>
      </tr>
    `).join("");
    return `
      <div class="panel">
        <div class="panel-title">最近一年持仓ETF收益<small>按每日持仓权重估算的收益贡献，非单ETF自身涨跌幅</small></div>
        <div class="range-table-wrap">
          <table class="range-table etf-contrib-table">
            <thead><tr><th>分类</th><th>代码</th><th>名称</th><th class="num">收益贡献</th></tr></thead>
            <tbody>${rows || '<tr><td colspan="4" class="text-mute">暂无持仓贡献数据</td></tr>'}</tbody>
          </table>
        </div>
      </div>
    `;
  }

  function nextTradingHint(signalDate) {
    if (!signalDate) return "下一交易日建议";
    const d = new Date(signalDate + "T00:00:00");
    if (isNaN(d.getTime())) return `${signalDate} → 下一交易日建议`;
    do { d.setDate(d.getDate() + 1); } while (d.getDay() === 0 || d.getDay() === 6);
    const next = d.toISOString().slice(0, 10);
    return `${signalDate} 日K → ${next} 策略`;
  }

  function renderHoldings() {
    const plan = ((payload.live_portfolio || {}).tomorrow_plan) || {};
    const actions = plan.actions || [];
    const html = actions.length ? actions.map((a) => `
      <div class="rotation-holding-chip trade-action ${a.action}">
        <div><b>${esc(a.name)}</b><span>${esc(a.symbol)} · ${esc(a.category || "")}</span><span>目标 ${fmtPct(a.target_weight_pct, false)} · 建议 ${fmtPct(a.entry_weight_pct, false)}</span></div>
        <strong>${a.action === "buy" ? "+" : "-"}${fmtNum(a.amount, 0)}元</strong>
      </div>
    `).join("") : `<div class="text-mute">明日无操作，继续持有/观望。</div>`;
    return `<div class="panel"><div class="panel-title">明日操作建议<small>${esc(nextTradingHint(plan.date))} · 建议仓位 ${fmtPct(plan.entry_exposure_pct || 0, false)} · 现金 ${fmtPct(plan.cash_weight_pct || 0, false)}</small></div><div class="rotation-holdings">${html}</div><div class="etf-exec-note">${esc(plan.entry_note || "若未实际操作，系统不会自动记录；执行后可运行 record-plan 记录。")}</div></div>`;
  }

  function renderLiveTradeLog() {
    const trades = ((payload.live_portfolio || {}).trade_log) || [];
    const rows = trades.slice().reverse().map((t) => `
      <tr>
        <td>${esc(t.date)}</td>
        <td>${esc(t.summary || "—")}</td>
        <td>${esc(t.positions_summary || "—")}</td>
        <td class="num">${fmtNum(t.equity_after, 2)}</td>
        <td class="num">${fmtNum(t.cash_after, 2)}</td>
      </tr>
    `).join("");
    return `<div class="panel"><div class="panel-title">最近半年真实交易记录<small>无操作不记录</small></div><div class="range-table-wrap"><table class="range-table live-trade-log"><thead><tr><th>日期</th><th>操作</th><th>交易后持仓</th><th class="num">交易后资产</th><th class="num">交易后现金</th></tr></thead><tbody>${rows || '<tr><td colspan="5" class="text-mute live-empty-state">暂无真实交易记录</td></tr>'}</tbody></table></div></div>`;
  }

  function renderRanking() {
    const rows = (payload.ranking || []).map((r) => `
      <tr class="${r.trend_ok ? "" : "muted"}">
        <td>${r.rank || "—"}</td>
        <td>${esc(r.category)}</td>
        <td class="sym">${esc(r.symbol)}</td>
        <td>${esc(r.name)}</td>
        <td><span class="trend-pill ${r.trend_ok ? "ok" : "bad"}">${r.trend_ok ? "站上MA120" : "趋势过滤"}</span></td>
        <td class="num ${pctClass(r.r20_pct)}">${fmtPct(r.r20_pct)}</td>
        <td class="num ${pctClass(r.r60_pct)}">${fmtPct(r.r60_pct)}</td>
        <td class="num ${pctClass(r.r120_pct)}">${fmtPct(r.r120_pct)}</td>
        <td class="num ${pctClass(r.r250_pct)}">${fmtPct(r.r250_pct)}</td>
        <td class="num">${fmtPct(r.vol20_pct, false)}</td>
        <td class="num strong ${pctClass(r.final_score)}">${fmtNum(r.final_score, 2)}</td>
        <td class="num strong">${fmtPct(r.target_weight_pct, false)}</td>
      </tr>
    `).join("");
    return `
      <div class="panel">
        <div class="panel-title">ETF强弱排名<small>Final Score = 综合动量 - 0.5×Vol20</small></div>
        <div class="range-table-wrap">
          <table class="range-table etf-ranking-table">
            <thead><tr><th>排名</th><th>分类</th><th>代码</th><th>名称</th><th>趋势</th><th class="num">R20</th><th class="num">R60</th><th class="num">R120</th><th class="num">R250</th><th class="num">Vol20</th><th class="num">Score</th><th class="num">权重</th></tr></thead>
            <tbody>${rows || '<tr><td colspan="12" class="text-mute">暂无可排名数据</td></tr>'}</tbody>
          </table>
        </div>
      </div>
    `;
  }

  function renderRebalanceLog() {
    const rows = (payload.rebalance_log || []).slice().reverse().slice(0, 12).map((r) => `
      <tr>
        <td>${esc(r.date)}</td><td><span class="risk-mode ${esc(r.risk_mode)}">${riskLabel(r.risk_mode)}</span></td>
        <td class="num">${fmtPct(r.target_exposure_pct, false)}</td><td class="num">${fmtPct(r.drawdown_pct, false)}</td><td class="num">${fmtPct(r.turnover_pct, false)}</td>
        <td>${(r.holdings || []).map((h) => `${esc(h.name)} ${fmtPct(h.weight_pct, false)}`).join("；") || "现金"}</td>
      </tr>
    `).join("");
    return `
      <div class="panel">
        <div class="panel-title">调仓日志<small>最近12次，逆序</small></div>
        <div class="range-table-wrap">
          <table class="range-table"><thead><tr><th>日期</th><th>风险模式</th><th class="num">仓位</th><th class="num">回撤</th><th class="num">换手</th><th>持仓</th></tr></thead><tbody>${rows || '<tr><td colspan="6" class="text-mute">暂无调仓记录</td></tr>'}</tbody></table>
        </div>
      </div>
    `;
  }

  function chartOption() {
    const curve = payload.equity_curve || [];
    const dates = curve.map((x) => x.date);
    return {
      backgroundColor: "transparent",
      animation: false,
      tooltip: { trigger: "axis", backgroundColor: "rgba(11,18,32,0.92)", borderColor: "#1d2942", textStyle: { color: "#d8e1f4" } },
      legend: { top: 4, textStyle: { color: "#7d8aa6" }, data: ["组合净值", "回撤"] },
      grid: [{ left: 60, right: 24, top: 36, height: 230 }, { left: 60, right: 24, top: 300, height: 90 }],
      xAxis: [{ type: "category", data: dates, axisLabel: { color: "#7d8aa6", hideOverlap: true }, axisLine: { lineStyle: { color: "#1d2942" } } }, { type: "category", data: dates, gridIndex: 1, axisLabel: { color: "#7d8aa6", hideOverlap: true }, axisLine: { lineStyle: { color: "#1d2942" } } }],
      yAxis: [{ scale: true, axisLabel: { color: "#7d8aa6", formatter: (value) => { const initial = Number((payload.metrics || {}).initial || 10000); const pct = initial > 0 ? (Number(value) / initial - 1) * 100 : 0; return `${Number(value).toFixed(0)}\n${pct >= 0 ? "+" : ""}${pct.toFixed(0)}%`; } }, splitLine: { lineStyle: { color: "rgba(29,41,66,0.6)" } } }, { gridIndex: 1, axisLabel: { color: "#7d8aa6", formatter: "{value}%" }, splitLine: { lineStyle: { color: "rgba(29,41,66,0.6)" } } }],
      series: [
        { name: "组合净值", type: "line", data: curve.map((x) => x.equity), smooth: true, symbol: "none", lineStyle: { color: "#25d4f2", width: 2 } },
        { name: "回撤", type: "line", xAxisIndex: 1, yAxisIndex: 1, data: curve.map((x) => -x.drawdown_pct), smooth: true, symbol: "none", areaStyle: { color: "rgba(25,210,122,0.12)" }, lineStyle: { color: "#19d27a", width: 1.5 } },
      ],
    };
  }

  function mountChart() {
    const el = document.getElementById("etf-rotation-chart");
    if (!el || !window.echarts) return;
    if (chartInst) chartInst.dispose();
    chartInst = window.echarts.init(el);
    chartInst.setOption(chartOption());
    if (!mountChart._bound) {
      window.addEventListener("resize", () => chartInst && chartInst.resize());
      mountChart._bound = true;
    }
  }

  function renderErrors() {
    const errors = payload.errors || [];
    if (!errors.length) return "";
    return `<div class="panel"><div class="panel-title">数据提示<small>部分ETF暂不可用，已跳过</small></div><div class="text-mute">${errors.map((e) => `${esc(e.symbol)} ${esc(e.name)}: ${esc(e.error)}`).join("；")}</div></div>`;
  }

  async function render(host) {
    host.innerHTML = `<div class="state">数据加载中…</div>`;
    try {
      payload = await loadData();
    } catch (err) {
      host.innerHTML = `<div class="state error">数据加载失败:${err.message}<br/><br/>请先生成静态数据:<code>bash scripts/generate.sh etf_rotation</code></div>`;
      return;
    }
    host.innerHTML = `
      ${renderExplain()}

      ${renderSection("实际运行", "个人持仓、收益与操作建议")}
      ${renderLivePortfolio()}
      ${renderLivePositions()}
      ${renderHoldings()}
      ${renderLiveTradeLog()}

      ${renderSection("策略部分", "ETF池与市场主线观察")}
      ${renderPoolFit()}
      ${renderPool()}
      ${renderRanking()}

      ${renderSection("回测模块", "历史回测、净值回撤与调仓记录")}
      ${renderLastYearBacktest()}
      <div class="panel"><div class="panel-title">组合净值与回撤<small>左轴为本金净值/收益百分比，下方为回撤</small></div><div id="etf-rotation-chart" style="width:100%;height:420px;background:#0b1220;border-radius:10px;"></div></div>
      ${renderContributionTable()}
      ${renderRebalanceLog()}
      ${renderErrors()}
    `;
    mountChart();
    const u = document.getElementById("updated-at");
    if (u && payload.updated_at) u.textContent = "更新于 " + payload.updated_at;
  }

  window.NexusComponents = window.NexusComponents || {};
  window.NexusComponents["etf_rotation"] = {
    id: "etf_rotation",
    title: "ETF轮动",
    group: "资产配置",
    render,
  };
})();
