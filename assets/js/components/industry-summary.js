/* 行业一览图 component
 * 数据: frontend/data/industry_summary.json
 * 由 backend/components/industry_summary.py 生产
 */
(function () {
  "use strict";

  const DATA_URL = "data/industry_summary.json";

  // 列名启发式：兼容 akshare 字段差异，从原始列里挑出我们关心的
  function pickCol(columns, candidates) {
    for (const c of candidates) {
      const hit = columns.find((x) => x === c);
      if (hit) return hit;
    }
    // 模糊匹配（包含关键词）
    for (const kw of candidates) {
      const hit = columns.find((x) => x.includes(kw));
      if (hit) return hit;
    }
    return null;
  }

  const COLS = {
    name: ["板块", "板块名称", "名称"],
    pct: ["涨跌幅", "板块-涨跌幅"],
    volume: ["总成交量", "成交量"],
    turnover: ["总成交额", "成交额"],
    netInflow: ["净流入", "资金净流入"],
    up: ["上涨家数", "上涨数"],
    down: ["下跌家数", "下跌数"],
    avg: ["均价"],
    leader: ["领涨股", "领涨股-名称"],
    leaderPct: ["领涨股-涨跌幅", "领涨股-上涨幅度", "领涨股涨跌幅"],
    leaderPrice: ["领涨股-最新价", "领涨股最新价"],
  };

  function toNumber(v) {
    if (v === null || v === undefined || v === "") return null;
    if (typeof v === "number") return v;
    const s = String(v).trim();
    // 去掉 % 号
    const cleaned = s.replace(/[%,\s]/g, "");
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : null;
  }

  function fmtPct(v) {
    const n = toNumber(v);
    if (n === null) return "-";
    return (n >= 0 ? "+" : "") + n.toFixed(2) + "%";
  }

  function fmtNum(v, digits = 2) {
    const n = toNumber(v);
    if (n === null) return "-";
    const abs = Math.abs(n);
    if (abs >= 1e8) return (n / 1e8).toFixed(digits) + " 亿";
    if (abs >= 1e4) return (n / 1e4).toFixed(digits) + " 万";
    return n.toLocaleString("zh-CN", { maximumFractionDigits: digits });
  }

  function classOfPct(v) {
    const n = toNumber(v);
    if (n === null) return "flat";
    if (n > 0) return "up";
    if (n < 0) return "down";
    return "flat";
  }

  async function loadData() {
    const res = await fetch(DATA_URL, { cache: "no-store" });
    if (!res.ok) throw new Error("HTTP " + res.status);
    return res.json();
  }

  function renderKPIs(rows, c, root) {
    const total = rows.length;
    let ups = 0, downs = 0, flat = 0;
    let maxUp = null, maxDown = null;
    rows.forEach((r) => {
      const p = toNumber(r[c.pct]);
      if (p === null) return;
      if (p > 0) ups++;
      else if (p < 0) downs++;
      else flat++;
      if (maxUp === null || p > toNumber(maxUp[c.pct])) maxUp = r;
      if (maxDown === null || p < toNumber(maxDown[c.pct])) maxDown = r;
    });

    const cards = [
      {
        label: "板块总数",
        value: total,
        sub: `上涨 ${ups} · 下跌 ${downs} · 平 ${flat}`,
      },
      {
        label: "领涨板块",
        value: maxUp ? maxUp[c.name] : "-",
        sub: maxUp ? fmtPct(maxUp[c.pct]) : "-",
        cls: maxUp && toNumber(maxUp[c.pct]) > 0 ? "up" : "",
      },
      {
        label: "领跌板块",
        value: maxDown ? maxDown[c.name] : "-",
        sub: maxDown ? fmtPct(maxDown[c.pct]) : "-",
        cls: maxDown && toNumber(maxDown[c.pct]) < 0 ? "down" : "",
      },
      {
        label: "上涨/下跌比",
        value: downs ? (ups / downs).toFixed(2) : ups ? "∞" : "-",
        sub: ups + " : " + downs,
      },
    ];

    root.innerHTML = cards
      .map(
        (k) => `
      <div class="kpi ${k.cls || ""}">
        <div class="label">${k.label}</div>
        <div class="value">${k.value}</div>
        <div class="sub">${k.sub}</div>
      </div>`
      )
      .join("");
  }

  function renderChart(rows, c, root) {
    if (!c.pct || !c.name) {
      root.innerHTML = '<div class="state">缺少 涨跌幅 / 板块 列，无法渲染图表</div>';
      return;
    }
    const sorted = rows
      .map((r) => ({ name: r[c.name], pct: toNumber(r[c.pct]) }))
      .filter((r) => r.pct !== null);
    sorted.sort((a, b) => b.pct - a.pct);

    const topN = 12;
    const tops = sorted.slice(0, topN);
    const bottoms = sorted.slice(-topN).reverse();
    const merged = [...tops, ...bottoms.reverse()];
    // 上面 top 涨幅，下面 top 跌幅。统一按涨跌幅升序展示，便于一眼分辨
    merged.sort((a, b) => a.pct - b.pct);

    const chart = echarts.init(root, null, { renderer: "canvas" });
    chart.setOption({
      grid: { top: 20, left: 90, right: 60, bottom: 30 },
      tooltip: {
        trigger: "axis",
        axisPointer: { type: "shadow" },
        backgroundColor: "rgba(15,22,35,0.95)",
        borderColor: "#1d2942",
        textStyle: { color: "#d8e1f4" },
        formatter: (params) => {
          const p = params[0];
          return `${p.name}<br/><b style="color:${
            p.value >= 0 ? "#ff4d6d" : "#19d27a"
          }">${(p.value >= 0 ? "+" : "") + p.value.toFixed(2)}%</b>`;
        },
      },
      xAxis: {
        type: "value",
        axisLabel: { color: "#7d8aa6", formatter: "{value}%" },
        splitLine: { lineStyle: { color: "rgba(29,41,66,0.6)" } },
      },
      yAxis: {
        type: "category",
        data: merged.map((r) => r.name),
        axisLabel: { color: "#d8e1f4", fontSize: 11 },
        axisLine: { lineStyle: { color: "#1d2942" } },
        axisTick: { show: false },
      },
      series: [
        {
          type: "bar",
          data: merged.map((r) => ({
            value: r.pct,
            itemStyle: {
              color: r.pct >= 0
                ? new echarts.graphic.LinearGradient(0, 0, 1, 0, [
                    { offset: 0, color: "rgba(255,77,109,0.35)" },
                    { offset: 1, color: "#ff4d6d" },
                  ])
                : new echarts.graphic.LinearGradient(1, 0, 0, 0, [
                    { offset: 0, color: "rgba(25,210,122,0.35)" },
                    { offset: 1, color: "#19d27a" },
                  ]),
              borderRadius: [2, 2, 2, 2],
            },
            label: {
              show: true,
              position: r.pct >= 0 ? "right" : "left",
              color: r.pct >= 0 ? "#ff4d6d" : "#19d27a",
              fontSize: 11,
              formatter: (p) => (p.value >= 0 ? "+" : "") + p.value.toFixed(2) + "%",
            },
          })),
          barMaxWidth: 14,
        },
      ],
    });

    // resize
    const ro = new ResizeObserver(() => chart.resize());
    ro.observe(root);
  }

  function renderTable(rows, c, columns, root) {
    // 选择展示的列：按 columns 顺序展示原始列
    const headers = columns;
    let sortKey = c.pct;
    let sortDir = -1; // desc

    const pctCols = new Set(
      columns.filter((x) => /涨跌幅|涨幅|跌幅/.test(x))
    );
    const numericCols = new Set(
      columns.filter((x) =>
        /涨跌幅|涨幅|跌幅|价|额|量|流入|家数|均价|序号/.test(x)
      )
    );

    function cellOf(r, col) {
      const v = r[col];
      if (v === null || v === undefined) return "-";
      if (pctCols.has(col)) return fmtPct(v);
      if (numericCols.has(col)) {
        const n = toNumber(v);
        if (n === null) return v;
        // 成交量/额/净流入用人民币型缩写；家数等用整数
        if (/(额|流入)/.test(col)) return fmtNum(n, 2);
        if (/量/.test(col)) return fmtNum(n, 2);
        if (/家数|序号/.test(col)) return Math.round(n).toLocaleString();
        if (/价/.test(col)) return n.toFixed(2);
        return fmtNum(n, 2);
      }
      return v;
    }

    function classOf(r, col) {
      if (pctCols.has(col)) return classOfPct(r[col]);
      return "";
    }

    function build() {
      const sorted = [...rows].sort((a, b) => {
        const va = toNumber(a[sortKey]);
        const vb = toNumber(b[sortKey]);
        if (va === null && vb === null) return 0;
        if (va === null) return 1;
        if (vb === null) return -1;
        return (va - vb) * sortDir;
      });

      const thead = headers
        .map((h) => {
          const ind =
            h === sortKey ? (sortDir < 0 ? "▼" : "▲") : "↕";
          const sCls =
            h === sortKey
              ? sortDir < 0
                ? "sorted-desc"
                : "sorted-asc"
              : "";
          return `<th data-col="${h}" class="${sCls}">${h}<span class="sort-ind">${ind}</span></th>`;
        })
        .join("");

      const tbody = sorted
        .map(
          (r) =>
            "<tr>" +
            headers
              .map(
                (h) =>
                  `<td class="${classOf(r, h)}">${cellOf(r, h)}</td>`
              )
              .join("") +
            "</tr>"
        )
        .join("");

      root.innerHTML = `<table class="tbl"><thead><tr>${thead}</tr></thead><tbody>${tbody}</tbody></table>`;

      root.querySelectorAll("thead th").forEach((th) => {
        th.addEventListener("click", () => {
          const col = th.dataset.col;
          if (sortKey === col) sortDir *= -1;
          else {
            sortKey = col;
            sortDir = -1;
          }
          build();
        });
      });
    }

    build();
  }

  async function render(host) {
    host.innerHTML = '<div class="state">数据加载中…</div>';

    let payload;
    try {
      payload = await loadData();
    } catch (err) {
      host.innerHTML = `
        <div class="state error">
          数据加载失败：${err.message}<br/><br/>
          请先生成静态数据：<code>bash scripts/generate.sh industry-summary</code>
        </div>`;
      return;
    }

    const columns = payload.columns || [];
    const rows = payload.rows || [];
    const c = {};
    for (const k of Object.keys(COLS)) c[k] = pickCol(columns, COLS[k]);

    host.innerHTML = `
      <div class="kpi-row" id="is-kpis"></div>
      <div class="panel">
        <div class="panel-head">
          <div class="panel-title">板块涨跌排行 <small>Top ${12} 涨幅 / Top ${12} 跌幅</small></div>
          <div class="meta-item">共 ${payload.count ?? rows.length} 个板块</div>
        </div>
        <div id="is-chart" class="chart"></div>
      </div>
      <div class="panel">
        <div class="panel-head">
          <div class="panel-title">行业板块明细 <small>点击表头排序</small></div>
        </div>
        <div class="tbl-wrap" id="is-table"></div>
      </div>
    `;

    renderKPIs(rows, c, host.querySelector("#is-kpis"));
    renderChart(rows, c, host.querySelector("#is-chart"));
    renderTable(rows, c, columns, host.querySelector("#is-table"));

    // 顶栏更新时间
    const u = document.getElementById("updated-at");
    if (u && payload.updated_at) u.textContent = "更新于 " + payload.updated_at;
  }

  // 注册到全局
  window.NexusComponents = window.NexusComponents || {};
  window.NexusComponents["industry-summary"] = {
    id: "industry-summary",
    title: "行业一览图",
    group: "市场行情",
    render,
  };
})();
