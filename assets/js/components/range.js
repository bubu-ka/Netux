/* 单支波段策略 component
 * 数据: frontend/data/range.json  由 backend/components/range/ 生产
 *
 * 视图:
 *   - 唯一单支波段策略说明 + 明日操作统计
 *   - 榜单:明日建议、规则评分、策略/股票近 1 月和近 1 年表现、上涨波段数
 *   - 点击行 → 最近 3 个月日 K + 买卖点 + 策略波段 + 操作依据
 */
(function () {
  "use strict";

  const DATA_URL = "data/range.json";

  // ---------- helpers ----------
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
    if (v > 0) return "up";
    if (v < 0) return "down";
    return "flat";
  }
  function metric(it, key, fallback) {
    const m = it.metrics || {};
    return m[key] !== undefined ? m[key] : m[fallback];
  }
  function shortDate(d) {
    return d ? d.slice(5) : "—";
  }
  function esc(s) {
    return String(s || "").replace(/[&<>"]/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;",
    }[c]));
  }
  function fractalMeta(hint) {
    const isTop = hint && hint.kind === "top";
    return {
      isTop,
      short: isTop ? "顶" : "底",
      label: isTop ? "顶分型" : "底分型",
      priceLabel: isTop ? "高点" : "低点",
      price: isTop ? hint.fractal_high : hint.fractal_low,
      chipClass: isTop ? "top" : "bottom",
    };
  }
  function getFractalHint(item) {
    if (!item) return null;
    return item.recent_fractal_hint || item.bottom_fractal_hint || null;
  }
  function renderRecentHintTags(item, compact = false) {
    const nd = item.next_day || {};
    const action = nd.new_entry_action || nd.action;
    const actionLabel = nd.new_entry_label || nd.action_label || "观察等待";
    const actionTip = (nd.basis || []).join("；") || nd.existing_holder_label || actionLabel;
    const tags = [`<span class="action-pill ${actionClass(action)}" title="${esc(actionTip)}">${esc(actionLabel)}</span>`];
    const hint = getFractalHint(item);
    if (hint) {
      const meta = fractalMeta(hint);
      const tip = `${meta.label} ${hint.fractal_date} · 距今 ${hint.bars_since}日 · ${meta.priceLabel} ${fmtNum(meta.price)}`
        + (hint.volume_label ? ` · ${hint.volume_label}${hint.volume_ratio != null ? " " + hint.volume_ratio + "x" : ""}` : "");
      const text = compact
        ? `${meta.label} ${shortDate(hint.fractal_date)} · ${hint.strength || "-"}`
        : `${meta.label} ${shortDate(hint.fractal_date)}`;
      tags.push(`<span class="fractal-chip compact ${meta.chipClass}" title="${esc(tip)}">${esc(text)}</span>`);
    }
    return `<div class="recent-hint-tags">${tags.join("")}</div>`;
  }

  async function loadData() {
    const res = await fetch(DATA_URL, { cache: "no-store" });
    if (!res.ok) throw new Error("HTTP " + res.status);
    return res.json();
  }

  // ---------- state ----------
  let payload = null;
  let activeSymbol = null;
  let sortState = { key: null, dir: -1 };
  let searchQuery = "";
  let searchDraft = "";
  let chartInst = null;
  let detailCache = new Map();
  let detailLoadingKey = null;
  let detailError = null;
  let detailErrorKey = null;
  let detailRequestSeq = 0;

  function strategyNameOf(item, fallback) {
    const st = (item && (item.selected_strategy || item.strategy)) || {};
    return st.name || fallback || "";
  }

  function detailKey(strategyName, symbol) {
    return `${strategyName || ""}::${symbol || ""}`;
  }

  function getKlineRoot(item) {
    if (item && item.klines && Array.isArray(item.klines.klines)) return item.klines;
    if (payload && payload.klines && payload.klines[item.symbol]) return payload.klines[item.symbol];
    return null;
  }

  async function loadDetail(strategy, item) {
    if (!item) return null;
    const key = detailKey(strategyNameOf(item, strategy && strategy.name), item.symbol);
    if (detailCache.has(key)) return detailCache.get(key);

    // 兼容旧版完整 range.json:详情数据已内联在 payload 中。
    if (payload && payload.klines && payload.klines[item.symbol]) {
      const inline = { ...item, klines: payload.klines[item.symbol] };
      detailCache.set(key, inline);
      return inline;
    }
    if (item.klines && item.signals && item.trades && item.overlay) {
      detailCache.set(key, item);
      return item;
    }
    if (!item.detail_url) throw new Error("缺少详情数据地址");

    const res = await fetch(item.detail_url, { cache: "no-store" });
    if (!res.ok) throw new Error("HTTP " + res.status);
    const detail = await res.json();
    const merged = {
      ...item,
      ...detail,
      recent_fractal_hint: getFractalHint(item) || detail.recent_fractal_hint,
      selected_strategy: item.selected_strategy || detail.selected_strategy,
      detail_url: item.detail_url || detail.detail_url,
    };
    detailCache.set(key, merged);
    return merged;
  }

  function selectedStrategyOf(it, fallback) {
    return (it && (it.selected_strategy || it.strategy)) || fallback || {};
  }

  function strategyReasonText(st) {
    const reason = st && st.reason;
    return Array.isArray(reason) ? reason.join("；") : "";
  }

  function strategyDisplayTitle(st, fallback = "当前策略") {
    const title = (st && (st.title || st.name)) || fallback;
    return title === "海龟突破波段" ? "海龟交易" : title;
  }

  // ---------- render: strategy header ----------
  function renderStrategyHeader(s) {
    const strategyDescriptions = [
      {
        name: "medium_swing",
        title: "海龟交易",
        text: "海龟交易的核心思想是顺势突破：价格突破阶段高点后跟随趋势，用移动止损控制回撤。更适合趋势强、波段延续性好、愿意追随强势突破的标的。",
      },
      {
        name: "donchian_channel",
        title: "唐奇安通道",
        text: "唐奇安通道关注一段时间内的价格上下边界：接近通道上沿代表趋势确认，跌破或回落到关键位置提示风险。更适合波动边界清晰、趋势与回撤交替明显的标的。",
      },
    ];
    const descHtml = strategyDescriptions.map((it) => `
      <div class="strategy-desc-line" data-strategy="${esc(it.name)}">
        <b>${esc(it.title)}</b>
        <span>${esc(it.text)}</span>
      </div>
    `).join("");
    return `
      <div class="range-strategy-card range-explain">
        <div class="rs-head">
          <div class="rs-title">
            <span class="rs-name">${s.title || "智能匹配单支波段策略"}</span>
            <span class="rs-tag">${s.group || "逐标的策略分类器"}</span>
          </div>
          <div class="rs-params">
            <code>逐标的分类</code><code>日K</code><code>次日开盘执行</code>
          </div>
        </div>
        <div class="rs-desc">${esc(s.desc || "不同标的波动结构不同；分类器会结合趋势结构、近期表现、超额收益、回撤控制和明日信号，为每个标的选择更合适的单支波段策略。")}</div>
        <div class="strategy-desc-list">${descHtml}</div>
        <div class="range-table-searchbar range-searchbar-in-card">
          <input class="range-search" type="search" placeholder="搜索标的名称 / 编号" value="${esc(searchDraft)}" />
          <button class="range-search-btn" type="button">搜索</button>
        </div>
      </div>
    `;
  }

  // ---------- render: table ----------
  const SORT_COLUMNS = {
    strategy_1m: (it) => metric(it, "strategy_return_1m_pct", "return_1m_pct"),
    stock_1m: (it) => metric(it, "stock_return_1m_pct", "bnh_1m_pct"),
    strategy_1y: (it) => metric(it, "strategy_return_1y_pct", "total_return_pct"),
    stock_1y: (it) => metric(it, "stock_return_1y_pct", "bnh_return_pct"),
    excess_1y: (it) => metric(it, "excess_1y_pct", "excess_pct"),
    capture: (it) => metric(it, "capture_ratio_1y_pct"),
  };

  function sortClass(key) {
    if (sortState.key !== key) return "";
    return sortState.dir < 0 ? "sorted-desc" : "sorted-asc";
  }

  function sortIndicator(key) {
    if (sortState.key !== key) return "↕";
    return sortState.dir < 0 ? "↓" : "↑";
  }

  function sortTh(key, label) {
    return `<th class="num sortable ${sortClass(key)}" data-sort="${key}">${label}<span class="sort-ind">${sortIndicator(key)}</span></th>`;
  }

  function renderTable(s) {
    const rows = s.stocks.map((it) => rowOf(it, s)).join("");
    const empty = rows ? "" : `<tr><td colspan="14" class="text-mute">没有匹配的标的</td></tr>`;
    return `
      <div class="panel range-table-panel">
        <div class="panel-head">
          <div class="panel-title">
            中线波段榜单
            <small>每个标的使用分类器匹配的策略 · 点击查看最近3个月日K、买卖点和上涨波段</small>
          </div>
        </div>
        <div class="range-table-wrap">
          <table class="range-table">
            <thead>
              <tr>
                <th>代码</th>
                <th>名称</th>
                <th>适用策略</th>
                <th>近期提示</th>
                ${sortTh("strategy_1m", "策略近1月")}
                ${sortTh("stock_1m", "股票近1月")}
                ${sortTh("strategy_1y", "策略近1年")}
                ${sortTh("stock_1y", "股票近1年")}
                ${sortTh("excess_1y", "超额1年")}
                ${sortTh("capture", "捕获率")}
                <th>阶段</th>
                <th>当前状态</th>
                <th>最近信号</th>
              </tr>
            </thead>
            <tbody>${rows || empty}</tbody>
          </table>
        </div>
      </div>
    `;
  }

  function actionClass(action) {
    if (action === "buy") return "action-buy";
    if (action === "sell") return "action-sell";
    if (action === "hold") return "action-hold";
    if (action === "avoid") return "action-avoid";
    return "action-watch";
  }

  function rowOf(it, strategy) {
    const nd = it.next_day || {};
    const st = selectedStrategyOf(it, strategy);
    const reason = strategyReasonText(st);
    const rg = ((it.regime || {}).current) || {};
    const inPos = it.position && it.position.in_position;
    let posTag;
    if (inPos) {
      const fpClass = pctClass(it.position.float_pnl_pct);
      posTag = `<span class="pos-tag pos-in ${fpClass}">持仓 · ${fmtPct(it.position.float_pnl_pct)}</span>`;
    } else {
      posTag = `<span class="pos-tag pos-out">空仓</span>`;
    }
    const recent = (it.signals_recent || []).slice(-3).map((sg) => {
      const cls = sg.kind === "buy" ? "sig-buy" : "sig-sell";
      const sym = sg.kind === "buy" ? "买" : "卖";
      return `<span class="sig-chip ${cls}" title="${sg.date} ${esc(sg.note)}">${sym} ${shortDate(sg.date)}</span>`;
    }).join("");
    const recentCell = recent || '<span class="text-mute">—</span>';
    const activeCls = activeSymbol === it.symbol ? "active" : "";
    const regimeTip = rg.label
      ? `${rg.start_date || ""} → ${rg.end_date || ""} · ${fmtPct(rg.return_pct)} · ${rg.bars || "—"}日`
      : "暂无阶段数据";
    return `
      <tr class="range-row ${activeCls}" data-sym="${it.symbol}">
        <td class="sym">${it.symbol}</td>
        <td>${it.name}</td>
        <td><span class="strategy-chip" title="${esc(reason)}">${esc(strategyDisplayTitle(st))}</span></td>
        <td class="recent-hint-cell">${renderRecentHintTags(it, true)}</td>
        <td class="num ${pctClass(metric(it, "strategy_return_1m_pct", "return_1m_pct"))} strong">${fmtPct(metric(it, "strategy_return_1m_pct", "return_1m_pct"))}</td>
        <td class="num ${pctClass(metric(it, "stock_return_1m_pct", "bnh_1m_pct"))}">${fmtPct(metric(it, "stock_return_1m_pct", "bnh_1m_pct"))}</td>
        <td class="num ${pctClass(metric(it, "strategy_return_1y_pct", "total_return_pct"))}">${fmtPct(metric(it, "strategy_return_1y_pct", "total_return_pct"))}</td>
        <td class="num ${pctClass(metric(it, "stock_return_1y_pct", "bnh_return_pct"))}">${fmtPct(metric(it, "stock_return_1y_pct", "bnh_return_pct"))}</td>
        <td class="num ${pctClass(metric(it, "excess_1y_pct", "excess_pct"))} strong">${fmtPct(metric(it, "excess_1y_pct", "excess_pct"))}</td>
        <td class="num">${fmtNum(metric(it, "capture_ratio_1y_pct"), 0)}%</td>
        <td><span class="regime-chip regime-${esc(rg.type || "transition")}" title="${esc(regimeTip)}">${esc(rg.label || "转换观察")}</span></td>
        <td>${posTag}</td>
        <td class="recent-cell">${recentCell}</td>
      </tr>
    `;
  }

  // ---------- render: detail ----------
  function renderDetail(s, item) {
    const klRoot = getKlineRoot(item);
    if (!klRoot) return `<div class="state">无 K 线数据</div>`;

    return `
      <div class="panel range-detail-panel" id="range-detail">
        <div class="panel-head">
          <div class="panel-title">
            ${item.symbol} ${item.name}
            <small>${strategyDisplayTitle(selectedStrategyOf(item, s), s.title)} · 最近 ${klRoot.chart_bars || klRoot.recent_bars || 0} 个交易日（日K）</small>
          </div>
          ${renderDetailMeta(item)}
        </div>
        ${renderNextDayCard(item)}
        ${renderRecentSignals(item)}
        ${renderRegimeLegend()}
        <div id="range-chart"
             style="width:100%;height:460px;background:#0b1220;border-radius:10px;margin-top:10px;"></div>
        ${renderRegimeList(item)}
        ${renderTradeList(item)}
      </div>
    `;
  }

  function renderDetailMeta(item) {
    const pos = item.position || {};
    const posPart = pos.in_position
      ? `<span class="dm-item ${pctClass(pos.float_pnl_pct)}">
           持仓中(自 ${pos.since}, ${pos.bars_held ?? "?"} 日)
           浮盈 <b>${fmtPct(pos.float_pnl_pct)}</b>
         </span>`
      : `<span class="dm-item text-mute">当前空仓</span>`;
    return `
      <div class="detail-meta">
        ${posPart}
        <span class="dm-item ${pctClass(metric(item, "strategy_return_1m_pct", "return_1m_pct"))}">
          策略近1月 <b>${fmtPct(metric(item, "strategy_return_1m_pct", "return_1m_pct"))}</b>
        </span>
        <span class="dm-item ${pctClass(metric(item, "strategy_return_1y_pct", "total_return_pct"))}">
          策略近1年 <b>${fmtPct(metric(item, "strategy_return_1y_pct", "total_return_pct"))}</b>
        </span>
        <span class="dm-item ${pctClass(metric(item, "stock_return_1y_pct", "bnh_return_pct"))}">
          股票近1年 <b>${fmtPct(metric(item, "stock_return_1y_pct", "bnh_return_pct"))}</b>
        </span>
        <span class="dm-item ${pctClass(metric(item, "excess_1y_pct", "excess_pct"))}">
          超额 <b>${fmtPct(metric(item, "excess_1y_pct", "excess_pct"))}</b>
        </span>
        <span class="dm-item text-mute">
          捕获率 <b>${fmtNum(metric(item, "capture_ratio_1y_pct"), 0)}%</b> · 在场 <b>${fmtNum(metric(item, "time_in_market_1y_pct"), 0)}%</b>
        </span>
      </div>
    `;
  }

  function renderNextDayCard(item) {
    const nd = item.next_day || {};
    const st = selectedStrategyOf(item);
    const rg = ((item.regime || {}).current) || {};
    const classifierReason = (st.reason || []).map((b) => `<li>${esc(b)}</li>`).join("");
    const basis = (nd.basis || []).map((b) => `<li>${esc(b)}</li>`).join("");
    return `
      <div class="next-action-card ${actionClass(nd.action)}">
        <div class="next-main">
          <div class="next-label">未持有建议</div>
          <div class="next-action">${nd.new_entry_label || nd.action_label || "观察等待"}</div>
          <div class="next-exec">${esc(nd.existing_holder_label || "已有仓位按策略信号管理；未持有等待低风险新买点")}</div>
        </div>
        <div class="next-score classifier-detail">
          <span class="strategy-chip">${esc(strategyDisplayTitle(st))}</span>
          <span class="regime-chip regime-${esc(rg.type || "transition")}">${esc(rg.label || "转换观察")}</span>
          <span class="confidence-note">按当前阶段给出未持有建议</span>
        </div>
        <div>
          ${classifierReason ? `<div class="basis-title">分类依据</div><ul class="basis-list">${classifierReason}</ul>` : ""}
          <div class="basis-title">操作依据</div>
          <ul class="basis-list">${basis || "<li>暂无详细依据</li>"}</ul>
        </div>
      </div>
    `;
  }


  function renderRegimeLegend() {
    return `
      <div class="regime-legend">
        <span><i class="legend-main-up"></i>主升阶段</span>
        <span><i class="legend-choppy"></i>震荡阶段</span>
        <span><i class="legend-down"></i>下行阶段</span>
        <span><i class="legend-transition"></i>转换观察</span>
      </div>
    `;
  }

  function renderRecentSignals(item) {
    const sigs = item.signals_recent || [];
    if (!sigs.length) {
      return `<div class="recent-sig-empty">近 3 个月内该策略无买卖信号</div>`;
    }
    const chips = sigs.map((sg) => {
      const cls = sg.kind === "buy" ? "rs-buy" : "rs-sell";
      const tag = sg.kind === "buy" ? "买入" : "卖出";
      return `
        <div class="rs-pill ${cls}">
          <div class="rs-pill-head">
            <span class="rs-pill-tag">${tag}</span>
            <span class="rs-pill-date">${sg.date}</span>
          </div>
          <div class="rs-pill-price">@ ${fmtNum(sg.price)}</div>
          <div class="rs-pill-note">${esc(sg.note || "")}</div>
        </div>
      `;
    }).join("");
    return `<div class="recent-sig-strip">${chips}</div>`;
  }

  function renderRegimeList(item) {
    const regime = item.regime || {};
    const current = regime.current || {};
    const segments = (regime.segments || []).slice().reverse().slice(0, 6);
    const currentHtml = current.label ? `
      <div class="regime-current">
        当前阶段 <span class="regime-chip regime-${esc(current.type || "transition")}">${esc(current.label)}</span>
        <span>${current.start_date || "—"} → ${current.end_date || "—"}</span>
        <b class="${pctClass(current.return_pct)}">${fmtPct(current.return_pct)}</b>
        <span>适合 ${esc(strategyDisplayTitle({ title: current.strategy_title || current.strategy_name }, "观察等待"))}</span>
      </div>` : `<div class="regime-current text-mute">暂无阶段窗口数据</div>`;
    const rows = segments.map((seg) => `
      <tr>
        <td><span class="regime-chip regime-${esc(seg.type || "transition")}">${esc(seg.label || "转换观察")}</span></td>
        <td>${seg.start_date || "—"}</td><td>${seg.end_date || "—"}</td>
        <td class="num ${pctClass(seg.return_pct)}">${fmtPct(seg.return_pct)}</td>
        <td class="num">${seg.bars ?? "—"}</td>
        <td>${esc(strategyDisplayTitle({ title: seg.strategy_title || seg.strategy_name }, "观察等待"))}</td>
      </tr>`).join("");
    return `
      <div class="regime-list-wrap">
        <div class="trade-list-title">近期阶段窗口（按当前市场状态选择策略）</div>
        ${currentHtml}
        ${rows ? `<table class="trade-list"><thead><tr><th>阶段</th><th>开始</th><th>结束</th><th class="num">区间涨跌</th><th class="num">K数</th><th>适合策略</th></tr></thead><tbody>${rows}</tbody></table>` : ""}
      </div>
    `;
  }

  function renderTradeList(item) {
    const trs = (item.trades || []).slice().reverse().slice(0, 8).map((t) => {
      const cls = pctClass(t.pnl_pct);
      const exit = t.exit_date
        ? `${t.exit_date} @ ${fmtNum(t.exit_price)}`
        : `<span class="text-mute">持仓中</span>`;
      return `
        <tr class="${cls}">
          <td>${t.entry_date}</td>
          <td class="num">${fmtNum(t.entry_price)}</td>
          <td>${exit}</td>
          <td class="num">${t.bars_held ?? "—"}</td>
          <td class="num strong">${t.pnl_pct === null ? "—" : fmtPct(t.pnl_pct)}</td>
          <td class="note">${esc(t.note_in || "")} ${t.note_out ? "→ " + esc(t.note_out) : ""}</td>
        </tr>`;
    }).join("");
    if (!trs) {
      return `<div class="trade-empty">该策略未在此标的产生交易。</div>`;
    }
    return `
      <div class="trade-list-wrap">
        <div class="trade-list-title">交易明细（最近 8 笔，逆序）</div>
        <table class="trade-list">
          <thead><tr>
            <th>买入</th><th class="num">买价</th><th>卖出</th>
            <th class="num">持仓K</th><th class="num">收益</th><th>说明</th>
          </tr></thead>
          <tbody>${trs}</tbody>
        </table>
      </div>
    `;
  }

  function renderDetailShell(s, summaryItem, detailItem) {
    if (!summaryItem) {
      return `<div class="panel range-detail-panel"><div class="state">点击榜单行查看最近3个月日K、买卖点和交易明细</div></div>`;
    }
    const key = detailKey(strategyNameOf(summaryItem, s.name), summaryItem.symbol);
    if (detailLoadingKey === key) {
      return `<div class="panel range-detail-panel" id="range-detail"><div class="state">正在加载 ${summaryItem.symbol} ${summaryItem.name} 详情数据…</div></div>`;
    }
    if (detailError && detailErrorKey === key) {
      return `<div class="panel range-detail-panel" id="range-detail"><div class="state error">详情加载失败:${esc(detailError.message)}<br/><br/>请重新点击该行重试</div></div>`;
    }
    if (!detailItem) {
      return `<div class="panel range-detail-panel" id="range-detail"><div class="state">点击榜单行加载 ${summaryItem.symbol} 详情数据</div></div>`;
    }
    return renderDetail(s, detailItem);
  }

  // ---------- ECharts: 最近 3 个月日 K ----------
  function buildChartOption(strategy, item) {
    const klRoot = getKlineRoot(item);
    const klines = (klRoot && klRoot.klines) || [];
    const chartStart = klRoot.chart_start_index ?? klRoot.recent_start_index ?? 0;
    const dates = klines.map((k) => k.date);
    const ohlc = klines.map((k) => [k.open, k.close, k.low, k.high]);

    const buyPoints = [];
    const sellPoints = [];
    const fractalPoints = [];
    const recentHint = getFractalHint(item);
    if (recentHint) {
      const relIdx = dates.indexOf(recentHint.fractal_date);
      if (relIdx >= 0) {
        const meta = fractalMeta(recentHint);
        const y = meta.isTop ? recentHint.fractal_high : recentHint.fractal_low;
        fractalPoints.push({
          coord: [dates[relIdx], y],
          value: meta.short,
          itemStyle: { color: meta.isTop ? "#ff4d6d" : (recentHint.strength === "转折" ? "#19d27a" : "#6b7892") },
          symbol: "pin",
          symbolSize: 42,
          symbolOffset: [0, meta.isTop ? -12 : 12],
          symbolRotate: meta.isTop ? 0 : 180,
          label: { color: "#fff", fontWeight: 900, formatter: meta.short, offset: [0, meta.isTop ? 0 : 8] },
          tooltip: {
            formatter: `${meta.label} ${recentHint.fractal_date}<br/>${meta.priceLabel} ${fmtNum(y)}<br/>强度:${esc(recentHint.strength || "-")}<br/>量能:${esc(recentHint.volume_label || "-")}${recentHint.volume_ratio != null ? " " + recentHint.volume_ratio + "x" : ""}`,
          },
        });
      }
    }
    (item.signals || []).forEach((sg) => {
      if (sg.index < chartStart) return;
      const relIdx = sg.index - chartStart;
      if (relIdx < 0 || relIdx >= dates.length) return;
      const label = sg.kind === "buy" ? "买" : "卖";
      const point = {
        coord: [dates[relIdx], sg.price],
        value: label,
        itemStyle: { color: sg.kind === "buy" ? "#ff4d6d" : "#19d27a" },
        symbol: "pin",
        symbolSize: 40,
        symbolOffset: [0, sg.kind === "buy" ? -10 : 10],
        symbolRotate: sg.kind === "buy" ? 0 : 180,
        label: {
          color: "#fff", fontWeight: 800,
          formatter: label,
          offset: sg.kind === "buy" ? [0, 0] : [0, 10],
        },
        tooltip: {
          formatter: `${label === "买" ? "买入" : "卖出"} ${sg.date}<br/>信号价 ${sg.price}<br/>原因:${esc(sg.note)}<br/>次日开盘执行`,
        },
      };
      (sg.kind === "buy" ? buyPoints : sellPoints).push(point);
    });

    const openTrade = (item.trades || []).slice().reverse().find((t) => t.exit_index === null);
    if (openTrade && openTrade.entry_index < chartStart && dates.length && !buyPoints.length) {
      buyPoints.push({
        coord: [dates[0], klines[0].low],
        value: "持",
        itemStyle: { color: "#ff4d6d" },
        symbol: "pin",
        symbolSize: 40,
        symbolOffset: [0, -10],
        label: { color: "#fff", fontWeight: 800, formatter: "持" },
        tooltip: {
          formatter: `持仓延续<br/>买入点 ${openTrade.entry_date} @ ${fmtNum(openTrade.entry_price)}<br/>买点早于当前3个月图表`,
        },
      });
    }

    const regimeAreas = [];
    function regimeColor(type) {
      if (type === "main_up") return "rgba(255,181,71,0.08)";
      if (type === "choppy") return "rgba(91,140,255,0.08)";
      if (type === "down") return "rgba(25,210,122,0.07)";
      return "rgba(176,123,255,0.07)";
    }
    ((item.regime || {}).segments || []).forEach((seg) => {
      const sIdx = Math.max(0, (seg.start_index ?? chartStart) - chartStart);
      const eIdx = Math.min(dates.length - 1, (seg.end_index ?? chartStart) - chartStart);
      if (sIdx > eIdx || !dates[sIdx] || !dates[eIdx]) return;
      regimeAreas.push([
        { xAxis: dates[sIdx], itemStyle: { color: regimeColor(seg.type) } },
        { xAxis: dates[eIdx] },
      ]);
    });

    const markLines = [];
    (item.trades || []).forEach((t) => {
      const entryIndex = t.entry_index;
      const exitIndex = t.exit_index === null || t.exit_index === undefined
        ? chartStart + dates.length - 1
        : t.exit_index;
      if (entryIndex === undefined || exitIndex < chartStart || entryIndex >= chartStart + dates.length) return;
      const sIdx = Math.max(0, entryIndex - chartStart);
      const eIdx = Math.min(dates.length - 1, exitIndex - chartStart);
      const sPrice = entryIndex < chartStart ? klines[sIdx].close : t.entry_price;
      const ePrice = t.exit_index === null || t.exit_index === undefined ? klines[eIdx].close : t.exit_price;
      markLines.push([
        { coord: [dates[sIdx], sPrice], symbol: "circle" },
        { coord: [dates[eIdx], ePrice], symbol: "arrow", value: fmtPct(t.pnl_pct) },
      ]);
    });

    const overlays = (item.overlay && item.overlay.overlays) || {};
    function overlayColor(name) {
      if (name.includes("上轨")) return "#ffb547";
      if (name.includes("中轨")) return "#5b8cff";
      if (name.includes("下轨")) return "#19d27a";
      if (name.includes("Chandelier")) return "#ff7a5a";
      if (name.includes("EMA120")) return "#b07bff";
      if (name.includes("EMA60")) return "#5b8cff";
      if (name.includes("EMA20")) return "#5b8cff";
      if (name.includes("EMA10")) return "#ffd84d";
      return "#b07bff";
    }
    const overlaySeries = Object.entries(overlays).map(([name, arr]) => ({
      name, type: "line", data: arr, smooth: true, symbol: "none",
      lineStyle: { width: name.includes("EMA120") ? 1.3 : 1.7, color: overlayColor(name) },
      xAxisIndex: 0, yAxisIndex: 0,
    }));

    return {
      backgroundColor: "transparent",
      animation: false,
      legend: {
        top: 4, textStyle: { color: "#7d8aa6" },
        data: ["K线", ...Object.keys(overlays), "市场阶段", "策略交易"],
      },
      tooltip: {
        trigger: "axis",
        axisPointer: { type: "cross" },
        backgroundColor: "rgba(11,18,32,0.92)",
        borderColor: "#1d2942",
        textStyle: { color: "#d8e1f4" },
        formatter(params) {
          const p0 = Array.isArray(params) ? params.find((p) => p.seriesName === "K线") : null;
          if (!p0) return "";
          const k = klines[p0.dataIndex];
          return `${k.date}<br/>开 ${fmtNum(k.open)}　高 ${fmtNum(k.high)}<br/>低 ${fmtNum(k.low)}　收 ${fmtNum(k.close)}`;
        },
      },
      grid: { left: 60, right: 24, top: 36, bottom: 48 },
      xAxis: {
        type: "category", data: dates, scale: true, boundaryGap: false,
        axisLine: { lineStyle: { color: "#1d2942" } },
        splitLine: { show: false },
        axisLabel: {
          color: "#7d8aa6", hideOverlap: true,
          formatter: (v) => String(v).slice(5),
        },
      },
      yAxis: {
        scale: true,
        splitLine: { lineStyle: { color: "rgba(29,41,66,0.6)" } },
        axisLabel: { color: "#7d8aa6" },
      },
      series: [
        {
          name: "K线", type: "candlestick", data: ohlc,
          itemStyle: {
            color: "#ff4d6d", color0: "#19d27a",
            borderColor: "#ff4d6d", borderColor0: "#19d27a",
          },
          markPoint: {
            symbol: "pin", symbolSize: 34,
            label: { fontSize: 11, color: "#fff", fontWeight: 800 },
            data: [...buyPoints, ...sellPoints, ...fractalPoints],
          },
        },
        ...overlaySeries,
        {
          name: "市场阶段",
          type: "line",
          data: dates.map(() => null),
          symbol: "none",
          lineStyle: { opacity: 0 },
          markArea: {
            silent: true,
            label: { show: false },
            emphasis: { disabled: true },
            data: regimeAreas,
          },
        },
        {
          name: "策略交易",
          type: "line",
          data: dates.map(() => null),
          symbol: "none",
          lineStyle: { opacity: 0 },
          markLine: {
            symbol: ["circle", "arrow"],
            lineStyle: { color: "#ffb547", width: 1.5, type: "dashed" },
            label: { color: "#ffb547", formatter: (p) => p.value || "策略交易" },
            data: markLines,
          },
        },
      ],
    };
  }

  function mountChart(strategy, item) {
    const el = document.getElementById("range-chart");
    if (!el || !window.echarts) return;
    if (chartInst) { chartInst.dispose(); chartInst = null; }
    chartInst = window.echarts.init(el);
    chartInst.setOption(buildChartOption(strategy, item));
    if (!mountChart._bound) {
      window.addEventListener("resize", () => chartInst && chartInst.resize());
      mountChart._bound = true;
    }
  }

  // ---------- main ----------
  function getStrategies() {
    if (!payload) return [];
    if (payload.strategy) return [payload.strategy];
    return payload.strategies && payload.strategies.length ? [payload.strategies[0]] : [];
  }

  function getStrategy() {
    const strategies = getStrategies();
    return strategies.length ? strategies[0] : null;
  }

  function normalizeSearch(s) {
    return String(s || "").trim().toUpperCase();
  }

  function filterStocks(stocks) {
    const q = normalizeSearch(searchQuery);
    if (!q) return stocks;
    return stocks.filter((it) => {
      const sym = normalizeSearch(it.symbol);
      const name = normalizeSearch(it.name);
      return sym.includes(q) || name.includes(q);
    });
  }

  function sortValue(it, key) {
    const getter = SORT_COLUMNS[key];
    if (!getter) return null;
    const n = Number(getter(it));
    return Number.isFinite(n) ? n : null;
  }

  function sortStocks(stocks) {
    const actionRank = { buy: 0, hold: 1, watch: 2, avoid: 3, sell: 4 };
    if (sortState.key) {
      return stocks.slice().sort((a, b) => {
        const av = sortValue(a, sortState.key);
        const bv = sortValue(b, sortState.key);
        if (av === null && bv === null) return 0;
        if (av === null) return 1;
        if (bv === null) return -1;
        if (av === bv) return 0;
        return (av - bv) * sortState.dir;
      });
    }
    return stocks.slice().sort((a, b) => {
      const ar = actionRank[(a.next_day || {}).action] ?? 9;
      const br = actionRank[(b.next_day || {}).action] ?? 9;
      if (ar !== br) return ar - br;
      const as = ((a.selected_strategy || {}).score) ?? -1;
      const bs = ((b.selected_strategy || {}).score) ?? -1;
      if (as !== bs) return bs - as;
      return (metric(b, "strategy_return_1m_pct", "return_1m_pct") ?? -1e9)
        - (metric(a, "strategy_return_1m_pct", "return_1m_pct") ?? -1e9);
    });
  }

  function rerender(opts = {}) {
    const host = rerender._host;
    if (!host) return;
    const s = getStrategy();
    if (!s) {
      host.innerHTML = `<div class="state">无策略数据</div>`;
      return;
    }
    const filteredStocks = filterStocks(s.stocks || []);
    const sortedStocks = sortStocks(filteredStocks);
    const sView = { ...s, stocks: sortedStocks };

    if (activeSymbol && !sortedStocks.find((it) => it.symbol === activeSymbol)) {
      activeSymbol = null;
    }
    const item = activeSymbol
      ? sortedStocks.find((it) => it.symbol === activeSymbol)
      : null;
    const detailItem = item ? detailCache.get(detailKey(strategyNameOf(item, s.name), item.symbol)) : null;

    host.innerHTML = `
      ${renderStrategyHeader(sView)}
      ${renderTable(sView)}
      ${renderDetailShell(sView, item, detailItem)}
    `;
    const search = host.querySelector(".range-search");
    if (search) {
      search.addEventListener("input", (e) => {
        searchDraft = e.target.value;
      });
      search.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          searchQuery = searchDraft;
          rerender({ focusSearch: true });
        }
      });
    }
    const searchBtn = host.querySelector(".range-search-btn");
    if (searchBtn) {
      searchBtn.addEventListener("click", () => {
        searchQuery = searchDraft;
        rerender({ focusSearch: true });
      });
    }
    host.querySelectorAll(".range-table th.sortable").forEach((th) => {
      th.addEventListener("click", () => {
        const key = th.dataset.sort;
        if (sortState.key === key) sortState.dir *= -1;
        else {
          sortState.key = key;
          sortState.dir = -1;
        }
        rerender();
      });
    });
    host.querySelectorAll(".range-row").forEach((tr) => {
      tr.addEventListener("click", () => {
        selectSymbol(tr.dataset.sym, { scroll: true });
      });
    });
    if (opts.focusSearch) {
      const focused = host.querySelector(".range-search");
      if (focused) {
        focused.focus();
        focused.setSelectionRange(focused.value.length, focused.value.length);
      }
    }
    if (detailItem) {
      mountChart(sView, detailItem);
    } else if (chartInst) {
      chartInst.dispose();
      chartInst = null;
    }
    if (opts.scroll) {
      const d = document.getElementById("range-detail");
      if (d) d.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  async function selectSymbol(symbol, opts = {}) {
    const s = getStrategy();
    const item = s && (s.stocks || []).find((x) => x.symbol === symbol);
    if (!item) return;
    const key = detailKey(strategyNameOf(item, s.name), symbol);
    activeSymbol = symbol;
    detailError = null;
    detailErrorKey = null;

    if (detailCache.has(key)) {
      detailLoadingKey = null;
      rerender(opts);
      return;
    }

    detailLoadingKey = key;
    rerender(opts);
    const seq = ++detailRequestSeq;
    try {
      await loadDetail(s, item);
      if (seq !== detailRequestSeq || activeSymbol !== symbol) return;
      detailLoadingKey = null;
      detailError = null;
      detailErrorKey = null;
    } catch (err) {
      if (seq !== detailRequestSeq || activeSymbol !== symbol) return;
      detailLoadingKey = null;
      detailError = err;
      detailErrorKey = key;
    }
    rerender(opts);
  }

  async function render(host) {
    rerender._host = host;
    host.innerHTML = `<div class="state">数据加载中…</div>`;
    try {
      payload = await loadData();
    } catch (err) {
      host.innerHTML = `
        <div class="state error">
          数据加载失败:${err.message}<br/><br/>
          请先生成静态数据:<code>bash scripts/generate.sh range</code>
        </div>`;
      return;
    }
    const s = getStrategy();
    if (!s || !s.stocks || !s.stocks.length) {
      host.innerHTML = `<div class="state">尚无策略数据</div>`;
      return;
    }
    activeSymbol = null;
    sortState = { key: null, dir: -1 };
    searchQuery = "";
    searchDraft = "";
    detailCache = new Map();
    detailLoadingKey = null;
    detailError = null;
    detailErrorKey = null;
    detailRequestSeq = 0;
    rerender();

    const u = document.getElementById("updated-at");
    if (u && payload.updated_at) u.textContent = "更新于 " + payload.updated_at;
  }

  window.NexusComponents = window.NexusComponents || {};
  window.NexusComponents["range"] = {
    id: "range",
    title: "单支波段策略",
    group: "技术分析",
    render,
  };
})();
