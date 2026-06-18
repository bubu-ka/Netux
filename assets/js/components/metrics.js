/* 大盘 component
 * 数据: frontend/data/metrics.json
 * 由 backend/components/metrics.py 生产
 *
 * 视图:每组(A 股指数 / 国内期货 / 美股指数)一个 panel,
 *      内部 tile 网格,每个 tile 显示:
 *        名称 / 最新价(大数值) / 涨跌幅 / 涨跌额 / 代号
 *      涨绿跌红 → 反转:沿用 A 股惯例(红涨绿跌)横跨所有市场
 */
(function () {
  "use strict";

  const DATA_URL = "data/metrics.json";

  // ---------- helpers ----------
  function fmtPrice(v) {
    if (v === null || v === undefined) return "—";
    const n = Number(v);
    if (!Number.isFinite(n)) return "—";
    // 千分位 + 两位小数,适合从指数(几千)到原油(几百)到 ETF(一两块)的混合
    return n.toLocaleString("zh-CN", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }
  function fmtPct(v) {
    if (v === null || v === undefined) return "—";
    const n = Number(v);
    if (!Number.isFinite(n)) return "—";
    return (n >= 0 ? "+" : "") + n.toFixed(2) + "%";
  }
  function fmtChange(v) {
    if (v === null || v === undefined) return "—";
    const n = Number(v);
    if (!Number.isFinite(n)) return "—";
    return (n >= 0 ? "+" : "") + n.toFixed(2);
  }
  function dirClass(v) {
    if (v === null || v === undefined || isNaN(v)) return "flat";
    const n = Number(v);
    if (n > 0) return "up";
    if (n < 0) return "down";
    return "flat";
  }
  function dirArrow(v) {
    if (v === null || v === undefined || isNaN(v)) return "·";
    const n = Number(v);
    if (n > 0) return "▲";
    if (n < 0) return "▼";
    return "·";
  }

  async function loadData() {
    const res = await fetch(DATA_URL, { cache: "no-store" });
    if (!res.ok) throw new Error("HTTP " + res.status);
    return res.json();
  }

  // ---------- tile ----------
  function renderTile(item) {
    if (item.error) {
      return `
        <div class="metric-tile metric-error" title="${item.error}">
          <div class="metric-name">${item.name}</div>
          <div class="metric-value">—</div>
          <div class="metric-sub">${item.error}</div>
          <div class="metric-symbol">${item.symbol}</div>
        </div>`;
    }
    const cls = dirClass(item.change_pct);
    const klineMark =
      item.source === "klines"
        ? '<span class="metric-source" title="quotes 接口未给到该字段,从最近两根日 K 收盘价反推">k</span>'
        : "";
    return `
      <div class="metric-tile ${cls}">
        <div class="metric-name">${item.name}${klineMark}</div>
        <div class="metric-value">${fmtPrice(item.last_price)}</div>
        <div class="metric-sub">
          <span class="metric-arrow">${dirArrow(item.change_pct)}</span>
          <span class="metric-pct">${fmtPct(item.change_pct)}</span>
          <span class="metric-change">${fmtChange(item.change)}</span>
        </div>
        <div class="metric-symbol">${item.symbol}</div>
      </div>`;
  }

  function renderGroup(group) {
    const items = group.items || [];
    const ups = items.filter((i) => Number(i.change_pct) > 0).length;
    const downs = items.filter((i) => Number(i.change_pct) < 0).length;
    const errs = items.filter((i) => i.error).length;
    const head = [
      `${items.length} 项`,
      ups ? `<span class="up">↑${ups}</span>` : null,
      downs ? `<span class="down">↓${downs}</span>` : null,
      errs ? `<span class="metric-err-tag">⚠ ${errs} 项失败</span>` : null,
    ]
      .filter(Boolean)
      .join(" · ");

    const tiles = items.map(renderTile).join("");
    return `
      <div class="panel">
        <div class="panel-head">
          <div class="panel-title">${group.name}<small>${head}</small></div>
        </div>
        <div class="metric-grid">${tiles}</div>
      </div>`;
  }

  // ---------- main ----------
  async function render(host) {
    host.innerHTML = '<div class="state">数据加载中…</div>';

    let payload;
    try {
      payload = await loadData();
    } catch (err) {
      host.innerHTML = `
        <div class="state error">
          数据加载失败:${err.message}<br/><br/>
          请先生成静态数据:<code>bash scripts/generate.sh metrics</code>
        </div>`;
      return;
    }

    const groups = payload.groups || [];
    if (!groups.length) {
      host.innerHTML = `<div class="state">配置为空 — 编辑
        <code>backend/components/metrics_symbols.txt</code> 后重新生成</div>`;
      return;
    }

    // 顶部 KPI 概览(总数 / 上涨 / 下跌 / 失败)
    const allItems = groups.flatMap((g) => g.items || []);
    const ups = allItems.filter((i) => Number(i.change_pct) > 0).length;
    const downs = allItems.filter((i) => Number(i.change_pct) < 0).length;
    const flat = allItems.filter(
      (i) => !i.error && Number(i.change_pct) === 0
    ).length;
    const errs = allItems.filter((i) => i.error).length;

    const kpiCards = [
      {
        label: "标的数",
        value: payload.total ?? allItems.length,
        sub: `成功 ${payload.ok ?? allItems.length - errs} · 失败 ${errs}`,
      },
      {
        label: "上涨",
        value: ups,
        sub: ups ? "中位 " + median(allItems, "up") : "—",
        cls: "up",
      },
      {
        label: "下跌",
        value: downs,
        sub: downs ? "中位 " + median(allItems, "down") : "—",
        cls: "down",
      },
      {
        label: "涨跌比",
        value: downs ? (ups / downs).toFixed(2) : ups ? "∞" : "—",
        sub: `${ups} : ${downs}${flat ? ` · 平 ${flat}` : ""}`,
      },
    ];

    host.innerHTML = `
      <div class="kpi-row">${kpiCards
        .map(
          (k) => `
        <div class="kpi ${k.cls || ""}">
          <div class="label">${k.label}</div>
          <div class="value">${k.value}</div>
          <div class="sub">${k.sub}</div>
        </div>`
        )
        .join("")}
      </div>
      ${groups.map(renderGroup).join("")}
    `;

    const u = document.getElementById("updated-at");
    if (u && payload.updated_at) u.textContent = "更新于 " + payload.updated_at;
  }

  // 上涨/下跌组的中位涨幅 — 给 KPI 副标题用
  function median(items, dir) {
    const xs = items
      .map((i) => Number(i.change_pct))
      .filter((n) => Number.isFinite(n) && (dir === "up" ? n > 0 : n < 0))
      .sort((a, b) => a - b);
    if (!xs.length) return "—";
    const m = xs[Math.floor(xs.length / 2)];
    return (m >= 0 ? "+" : "") + m.toFixed(2) + "%";
  }

  // 注册到全局
  window.NexusComponents = window.NexusComponents || {};
  window.NexusComponents["metrics"] = {
    id: "metrics",
    title: "大盘",
    group: "市场行情",
    render,
  };
})();
