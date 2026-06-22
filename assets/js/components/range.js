/* 波段策略 component
 * 数据: frontend/data/range.json  由 backend/components/range/ 生产
 *
 * 视图(重构后):
 *   - 顶部:4 个策略 tab(综合合议 / 双均线 / 布林带 / MACD),综合合议在最前
 *   - 策略说明卡 + KPI(1 年 / 1 月 / 跑赢基准 / 当前持仓)
 *   - 排行榜:以"近 1 月收益"为核心列,1 年作为对照
 *           点击行 → 展开"近 1 月迷你 K 线" + 最近买卖点 + 当前持仓状态
 *           不再展示 1 年大 K 线图
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
  function fmtMoney(v) {
    if (v === null || v === undefined || isNaN(v)) return "—";
    return Number(v).toLocaleString("zh-CN", {
      minimumFractionDigits: 2, maximumFractionDigits: 2,
    });
  }
  function pctClass(v) {
    if (v === null || v === undefined || isNaN(v)) return "flat";
    if (v > 0) return "up";
    if (v < 0) return "down";
    return "flat";
  }

  async function loadData() {
    const res = await fetch(DATA_URL, { cache: "no-store" });
    if (!res.ok) throw new Error("HTTP " + res.status);
    return res.json();
  }

  // ---------- state ----------
  let payload = null;
  let activeStrategy = null;
  let activeSymbol = null;
  let chartInst = null;

  // ---------- render: tabs ----------
  function renderTabs(host) {
    const tabs = (payload.strategies || []).map((s) => {
      const cls = s.name === activeStrategy ? "active" : "";
      const recommended = s.name === "composite" ? '<span class="t-rec">推荐</span>' : "";
      return `<button class="range-tab ${cls}" data-name="${s.name}">
        <span class="t-title">${s.title}${recommended}</span>
        <span class="t-group">${s.group}</span>
        <span class="t-stat ${pctClass(s.summary.avg_return_1m_pct)}">
          月均 ${fmtPct(s.summary.avg_return_1m_pct)}
        </span>
      </button>`;
    }).join("");
    host.innerHTML = tabs;
    host.querySelectorAll(".range-tab").forEach((el) => {
      el.addEventListener("click", () => {
        activeStrategy = el.dataset.name;
        rerender();
      });
    });
  }

  // ---------- render: strategy header ----------
  function renderStrategyHeader(s) {
    const sum = s.summary;
    const paramStr = Object.entries(s.params || {})
      .map(([k, v]) => `<code>${k}=${v}</code>`).join(" ");
    return `
      <div class="range-strategy-card">
        <div class="rs-head">
          <div class="rs-title">
            <span class="rs-name">${s.title}</span>
            <span class="rs-tag">${s.group}</span>
          </div>
          <div class="rs-params">${paramStr}</div>
        </div>
        <div class="rs-desc">${s.desc}</div>
        <div class="rs-kpis">
          <div class="rs-kpi ${pctClass(sum.avg_return_1m_pct)}">
            <div class="label">近 1 月平均收益</div>
            <div class="value">${fmtPct(sum.avg_return_1m_pct)}</div>
            <div class="sub">基准 ${fmtPct(sum.avg_bnh_1m_pct)}</div>
          </div>
          <div class="rs-kpi ${pctClass(sum.avg_return_pct)}">
            <div class="label">1 年累计收益</div>
            <div class="value">${fmtPct(sum.avg_return_pct)}</div>
            <div class="sub">年化 ${fmtPct(sum.avg_annual_pct)} · 基准 ${fmtPct(sum.avg_bnh_pct)}</div>
          </div>
          <div class="rs-kpi flat">
            <div class="label">监控池</div>
            <div class="value">${sum.stocks}</div>
            <div class="sub">当前持仓 ${sum.in_position_now} · 盈利 ${sum.winning_stocks}</div>
          </div>
          <div class="rs-kpi down">
            <div class="label">平均最大回撤</div>
            <div class="value">${fmtPct(sum.avg_max_drawdown_pct, false)}</div>
            <div class="sub">跑赢基准 ${sum.beat_bnh}/${sum.stocks}</div>
          </div>
        </div>
      </div>
    `;
  }

  // ---------- render: table ----------
  function renderTable(s) {
    const rows = s.stocks.map((it) => rowOf(it)).join("");
    return `
      <div class="panel range-table-panel">
        <div class="panel-head">
          <div class="panel-title">
            波段榜单
            <small>按近 1 月收益降序 · 点击查看近 1 月走势 + 买卖点</small>
          </div>
        </div>
        <div class="range-table-wrap">
          <table class="range-table">
            <thead>
              <tr>
                <th>代码</th>
                <th>名称</th>
                <th class="num">现价</th>
                <th class="num">近1月</th>
                <th class="num">基准1月</th>
                <th class="num">1年</th>
                <th class="num">基准1年</th>
                <th class="num">回撤</th>
                <th class="num">交易</th>
                <th>当前状态</th>
                <th>最近信号</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      </div>
    `;
  }

  function rowOf(it) {
    const m = it.metrics;
    const inPos = it.position.in_position;
    let posTag;
    if (inPos) {
      const fpClass = pctClass(it.position.float_pnl_pct);
      posTag = `<span class="pos-tag pos-in ${fpClass}">
        持仓 · 浮盈 ${fmtPct(it.position.float_pnl_pct)}
      </span>`;
    } else {
      posTag = `<span class="pos-tag pos-out">空仓</span>`;
    }
    const recent = (it.signals_recent || []).slice(-3).map((sg) => {
      const cls = sg.kind === "buy" ? "sig-buy" : "sig-sell";
      const sym = sg.kind === "buy" ? "B" : "S";
      return `<span class="sig-chip ${cls}" title="${sg.date} ${sg.note}">${sym} ${sg.date.slice(5)}</span>`;
    }).join("");
    const recentCell = recent || '<span class="text-mute">—</span>';
    const activeCls = activeSymbol === it.symbol ? "active" : "";
    return `
      <tr class="range-row ${activeCls}" data-sym="${it.symbol}">
        <td class="sym">${it.symbol}</td>
        <td>${it.name}</td>
        <td class="num">${fmtNum(it.last_close)}</td>
        <td class="num ${pctClass(m.return_1m_pct)} strong">${fmtPct(m.return_1m_pct)}</td>
        <td class="num ${pctClass(m.bnh_1m_pct)}">${fmtPct(m.bnh_1m_pct)}</td>
        <td class="num ${pctClass(m.total_return_pct)}">${fmtPct(m.total_return_pct)}</td>
        <td class="num ${pctClass(m.bnh_return_pct)}">${fmtPct(m.bnh_return_pct)}</td>
        <td class="num down">${fmtPct(m.max_drawdown_pct, false)}</td>
        <td class="num">${m.trades_count}</td>
        <td>${posTag}</td>
        <td class="recent-cell">${recentCell}</td>
      </tr>
    `;
  }

  // ---------- render: detail (近 1 月 mini K 线) ----------
  function renderDetail(s, item) {
    const klRoot = payload.klines[item.symbol];
    if (!klRoot) return `<div class="state">无 K 线数据</div>`;

    return `
      <div class="panel range-detail-panel" id="range-detail">
        <div class="panel-head">
          <div class="panel-title">
            ${item.symbol} ${item.name}
            <small>${s.title} · 近 ${klRoot.recent_bars} 个交易日</small>
          </div>
          ${renderDetailMeta(item)}
        </div>
        ${renderRecentSignals(item)}
        <div id="range-chart"
             style="width:100%;height:380px;background:#0b1220;border-radius:10px;margin-top:8px;"></div>
        ${renderTradeList(item)}
      </div>
    `;
  }

  function renderDetailMeta(item) {
    const m = item.metrics;
    const pos = item.position;
    const posPart = pos.in_position
      ? `<span class="dm-item ${pctClass(pos.float_pnl_pct)}">
           持仓中(自 ${pos.since}, ${pos.bars_held ?? '?'} 日)
           浮盈 <b>${fmtPct(pos.float_pnl_pct)}</b>
         </span>`
      : `<span class="dm-item text-mute">当前空仓</span>`;
    return `
      <div class="detail-meta">
        ${posPart}
        <span class="dm-item ${pctClass(m.return_1m_pct)}">
          近1月 <b>${fmtPct(m.return_1m_pct)}</b> · 基准 ${fmtPct(m.bnh_1m_pct)}
        </span>
        <span class="dm-item ${pctClass(m.total_return_pct)}">
          1年 <b>${fmtPct(m.total_return_pct)}</b> · 基准 ${fmtPct(m.bnh_return_pct)}
        </span>
      </div>
    `;
  }

  function renderRecentSignals(item) {
    const sigs = item.signals_recent || [];
    if (!sigs.length) {
      return `<div class="recent-sig-empty">近 1 月内该策略无买卖信号</div>`;
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
          <div class="rs-pill-note">${sg.note || ""}</div>
        </div>
      `;
    }).join("");
    return `<div class="recent-sig-strip">${chips}</div>`;
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
          <td class="note">${t.note_in || ""} ${t.note_out ? "→ " + t.note_out : ""}</td>
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
            <th class="num">持仓 K</th><th class="num">收益</th><th>说明</th>
          </tr></thead>
          <tbody>${trs}</tbody>
        </table>
      </div>
    `;
  }

  // ---------- ECharts: 近 1 月迷你 K 线 ----------
  function buildChartOption(strategy, item) {
    const klRoot = payload.klines[item.symbol];
    const klines = klRoot.klines;                  // 近 ~22 根
    const recentStart = klRoot.recent_start_index;  // 在原始全段 K 线中的起点 index
    const dates = klines.map((k) => k.date);
    const ohlc = klines.map((k) => [k.open, k.close, k.low, k.high]);

    // 信号:只取落在 [recentStart, ∞) 区间的;把 index 平移到迷你区
    const buyPoints = [];
    const sellPoints = [];
    (item.signals || []).forEach((sg) => {
      if (sg.index < recentStart) return;
      const relIdx = sg.index - recentStart;
      if (relIdx >= dates.length) return;
      const point = {
        coord: [dates[relIdx], sg.price],
        value: sg.kind === "buy" ? "B" : "S",
        itemStyle: { color: sg.kind === "buy" ? "#ff4d6d" : "#19d27a" },
        symbol: "pin",
        symbolSize: 38,
        symbolOffset: [0, sg.kind === "buy" ? -8 : 8],
        symbolRotate: sg.kind === "buy" ? 0 : 180,
        label: {
          color: "#fff", fontWeight: 700,
          formatter: sg.kind === "buy" ? "B" : "S",
          offset: sg.kind === "buy" ? [0, 0] : [0, 10],
        },
        tooltip: {
          formatter: `${sg.kind === "buy" ? "买入" : "卖出"} ${sg.date}<br/>价 ${sg.price}<br/>${sg.note}`,
        },
      };
      (sg.kind === "buy" ? buyPoints : sellPoints).push(point);
    });

    // Overlay 折线(已由后端切到近 1 月,长度对齐 dates)
    const overlays = (item.overlay && item.overlay.overlays) || {};
    const overlayColors = {
      MA5: "#ffd84d", MA10: "#ff7a5a", MA20: "#5b8cff",
      EMA20: "#5b8cff", EMA200: "#b07bff",
      BOLL_MID: "#ffd84d", BOLL_UP: "#5b8cff", BOLL_LOW: "#5b8cff",
    };
    const overlaySeries = Object.entries(overlays).map(([name, arr]) => ({
      name, type: "line", data: arr, smooth: true, symbol: "none",
      lineStyle: {
        width: (name === "BOLL_UP" || name === "BOLL_LOW") ? 1 : 1.6,
        color: overlayColors[name] || "#b07bff",
        type: (name === "BOLL_UP" || name === "BOLL_LOW") ? "dashed" : "solid",
      },
      xAxisIndex: 0, yAxisIndex: 0,
    }));

    return {
      backgroundColor: "transparent",
      animation: false,
      legend: {
        top: 4, textStyle: { color: "#7d8aa6" },
        data: ["K线", ...Object.keys(overlays)],
      },
      tooltip: {
        trigger: "axis",
        axisPointer: { type: "cross" },
        backgroundColor: "rgba(11,18,32,0.92)",
        borderColor: "#1d2942",
        textStyle: { color: "#d8e1f4" },
      },
      grid: { left: 60, right: 24, top: 32, bottom: 40 },
      xAxis: {
        type: "category", data: dates, scale: true, boundaryGap: false,
        axisLine: { lineStyle: { color: "#1d2942" } },
        splitLine: { show: false },
        axisLabel: { color: "#7d8aa6" },
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
            symbol: "pin", symbolSize: 32,
            label: { fontSize: 11, color: "#fff", fontWeight: 700 },
            data: [...buyPoints, ...sellPoints],
          },
        },
        ...overlaySeries,
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
  function getStrategy() {
    if (!payload || !payload.strategies) return null;
    return payload.strategies.find((s) => s.name === activeStrategy)
        || payload.strategies[0];
  }

  function sortByRecent(stocks) {
    // 按近 1 月收益降序
    return stocks.slice().sort(
      (a, b) => (b.metrics.return_1m_pct ?? -1e9) - (a.metrics.return_1m_pct ?? -1e9));
  }

  function rerender(opts = {}) {
    const host = rerender._host;
    if (!host) return;
    const s = getStrategy();
    if (!s) {
      host.innerHTML = `<div class="state">无策略数据</div>`;
      return;
    }
    if (!activeStrategy) activeStrategy = s.name;
    const sortedStocks = sortByRecent(s.stocks);
    const sView = { ...s, stocks: sortedStocks };

    if (!sortedStocks.find((it) => it.symbol === activeSymbol)) {
      activeSymbol = (sortedStocks[0] && sortedStocks[0].symbol) || null;
    }
    const item = sortedStocks.find((it) => it.symbol === activeSymbol);

    host.innerHTML = `
      <div class="range-tabs" id="range-tabs"></div>
      ${renderStrategyHeader(sView)}
      ${renderTable(sView)}
      ${item ? renderDetail(sView, item) : ""}
    `;
    renderTabs(document.getElementById("range-tabs"));
    host.querySelectorAll(".range-row").forEach((tr) => {
      tr.addEventListener("click", () => {
        activeSymbol = tr.dataset.sym;
        rerender({ scroll: true });
      });
    });
    if (item) {
      mountChart(sView, item);
      if (opts.scroll) {
        const d = document.getElementById("range-detail");
        if (d) d.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    }
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
    if (!payload.strategies || !payload.strategies.length) {
      host.innerHTML = `<div class="state">尚无策略数据</div>`;
      return;
    }
    activeStrategy = payload.strategies[0].name;  // 默认综合合议
    const sortedFirst = sortByRecent(payload.strategies[0].stocks);
    activeSymbol = sortedFirst[0] ? sortedFirst[0].symbol : null;
    rerender();

    const u = document.getElementById("updated-at");
    if (u && payload.updated_at) u.textContent = "更新于 " + payload.updated_at;
  }

  window.NexusComponents = window.NexusComponents || {};
  window.NexusComponents["range"] = {
    id: "range",
    title: "波段策略",
    group: "技术分析",
    render,
  };
})();
