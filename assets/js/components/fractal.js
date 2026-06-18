/* 顶底分型 component
 * 数据: frontend/data/fractal.json
 * 由 backend/components/fractal.py 生产
 *
 * 视图:
 *   - 仅展示最近 N 个交易日内形成分型的股票(N 由后端 RECENT_DAYS 配置)
 *   - 每条分型同时呈现量能(放量 / 平量 / 缩量,基于近 5 日均量)
 *   - 点击行,下方蜡烛图 + 成交量副图,markPoint 标出分型位置
 */
(function () {
  "use strict";

  const DATA_URL = "data/fractal.json";

  // ---------- helpers ----------
  function fmtPct(v) {
    if (v === null || v === undefined) return "-";
    return (v >= 0 ? "+" : "") + Number(v).toFixed(2) + "%";
  }
  function fmtPrice(v) {
    if (v === null || v === undefined) return "-";
    return Number(v).toFixed(2);
  }
  function fmtVol(v) {
    if (v === null || v === undefined) return "-";
    const n = Number(v);
    if (!Number.isFinite(n)) return "-";
    // akshare 成交量单位是 "手"(100 股),换算到亿/万 更直观
    if (n >= 1e8) return (n / 1e8).toFixed(2) + "亿手";
    if (n >= 1e4) return (n / 1e4).toFixed(2) + "万手";
    return Math.round(n).toLocaleString();
  }
  function pctClass(v) {
    if (v === null || v === undefined || isNaN(v)) return "flat";
    if (v > 0) return "up";
    if (v < 0) return "down";
    return "flat";
  }
  function volClass(label) {
    if (label === "放量") return "vol-high";
    if (label === "缩量") return "vol-low";
    if (label === "平量") return "vol-mid";
    return "";
  }
  function strengthClass(s) {
    if (s === "转折") return "strength-strong";
    if (s === "中继") return "strength-weak";
    return "";
  }

  async function loadData() {
    const res = await fetch(DATA_URL, { cache: "no-store" });
    if (!res.ok) throw new Error("HTTP " + res.status);
    return res.json();
  }

  // ---------- KPI ----------
  function renderKPIs(p, root) {
    const tops = p.top_fractals || [];
    const btms = p.bottom_fractals || [];
    const recentDays = (p.config && p.config.recent_days) || 3;

    const countByVol = (arr, label) =>
      arr.filter((x) => x.volume_label === label).length;
    const countByStrength = (arr, s) =>
      arr.filter((x) => x.strength === s).length;

    const cards = [
      {
        label: `监控池 · 最近 ${recentDays} 日`,
        value: p.stocks_total ?? "-",
        sub: `成功 ${p.stocks_ok ?? 0} · 失败 ${p.stocks_failed ?? 0}` +
             (p.stocks_skipped_old ? ` · 老分型 ${p.stocks_skipped_old}` : ""),
      },
      {
        label: "底分型",
        value: btms.length,
        sub: btms.length
          ? `转折 ${countByStrength(btms, "转折")} · 中继 ${countByStrength(btms, "中继")} · 放量 ${countByVol(btms, "放量")}`
          : "暂无",
        cls: "down", // 绿色,A 股惯例:绿跌 → 底分型暗示反转
      },
      {
        label: "顶分型",
        value: tops.length,
        sub: tops.length
          ? `转折 ${countByStrength(tops, "转折")} · 中继 ${countByStrength(tops, "中继")} · 放量 ${countByVol(tops, "放量")}`
          : "暂无",
        cls: "up",
      },
      {
        label: "底/顶 比",
        value: tops.length
          ? (btms.length / tops.length).toFixed(2)
          : btms.length ? "∞" : "-",
        sub: `${btms.length} : ${tops.length}`,
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

  // ---------- table ----------
  function renderList(list, kind, root, onPick) {
    if (!list || !list.length) {
      root.innerHTML = `<div class="state" style="padding:30px">最近窗口内未识别到${
        kind === "top" ? "顶" : "底"
      }分型</div>`;
      return;
    }
    const head = `
      <thead>
        <tr>
          <th>名称</th>
          <th>强度</th>
          <th>量能</th>
          <th class="num">最新价</th>
          <th class="num">日涨跌</th>
        </tr>
      </thead>`;
    const body = list
      .map(
        (r, i) => {
          const vLabel = r.volume_label || "-";
          const vRatio = r.volume_ratio != null ? `${r.volume_ratio}x` : "";
          const vCls = volClass(r.volume_label);
          const sLabel = r.strength || "-";
          const sCls = strengthClass(r.strength);
          // 代码 / 分型日期 / 距今 / 高低点 已收进图表 subtitle 与 tooltip,
          // 表格只留"做选股决策当下要看"的五列
          const titleAttr =
            `${r.symbol}  ·  分型 ${r.fractal_date} (距今 ${r.bars_since}d)` +
            (r.kind === "top"
              ? `  ·  高点 ${fmtPrice(r.fractal_high)}`
              : `  ·  低点 ${fmtPrice(r.fractal_low)}`);
          return `
        <tr data-idx="${i}" class="row-pick" title="${titleAttr}">
          <td>${r.name}</td>
          <td><span class="strength-tag ${sCls}">${sLabel}</span></td>
          <td><span class="vol-tag ${vCls}">${vLabel}</span>${
            vRatio ? `<span class="vol-ratio">${vRatio}</span>` : ""
          }</td>
          <td class="num">${fmtPrice(r.latest_close)}</td>
          <td class="num ${pctClass(r.change_pct)}">${fmtPct(r.change_pct)}</td>
        </tr>`;
        }
      )
      .join("");

    root.innerHTML = `<table class="tbl fractal-tbl">${head}<tbody>${body}</tbody></table>`;

    root.querySelectorAll("tr.row-pick").forEach((tr) => {
      tr.addEventListener("click", () => {
        const idx = Number(tr.dataset.idx);
        // 只清当前表格内的 active
        root
          .querySelectorAll("tr.row-pick.active")
          .forEach((x) => x.classList.remove("active"));
        tr.classList.add("active");
        onPick(list[idx], kind);
      });
    });
  }

  // ---------- candlestick + volume ----------
  let chartInst = null;
  function renderChart(entry, kind, host) {
    if (!entry || !entry.kline || !entry.kline.length) {
      host.innerHTML = '<div class="state">无 K 线数据</div>';
      return;
    }
    host.innerHTML = "";
    if (chartInst) {
      try { chartInst.dispose(); } catch (_) {}
      chartInst = null;
    }
    chartInst = echarts.init(host, null, { renderer: "canvas" });

    const dates = entry.kline.map((k) => k.date);
    // ECharts candlestick 数据顺序: [open, close, low, high]
    const cdata = entry.kline.map((k) => [k.open, k.close, k.low, k.high]);
    // 成交量柱:方向决定色相(红涨绿跌)、量能等级决定不透明度,
    // 让"放量天"在视觉上自然跳出来,缩量天淡出
    const vols = entry.kline.map((k) => {
      const isUp = k.close >= k.open;
      const baseRgb = isUp ? "255, 77, 109" : "25, 210, 122";
      const cls = k.vol_class;
      const alpha = cls === "放量" ? 0.9 : cls === "缩量" ? 0.22 : 0.5;
      return {
        value: k.volume == null ? 0 : k.volume,
        itemStyle: {
          color: `rgba(${baseRgb}, ${alpha})`,
          // 放量再加一圈高亮描边,扫一眼就能看到
          borderColor: cls === "放量" ? `rgba(${baseRgb}, 1)` : "transparent",
          borderWidth: cls === "放量" ? 1 : 0,
        },
      };
    });
    // 量能 MA(N) 折线 — 数据不足的位置用 '-' 让 echarts 自动断开
    const volMa = entry.kline.map((k) => (k.vol_ma == null ? "-" : k.vol_ma));

    const fIdx = entry.fractal_in_tail_index;
    const fK = entry.kline[fIdx] || null;
    const isTop = kind === "top";
    // 强度:转折型 = 强反转,markPoint 用本色;中继型 = 弱信号,用灰
    const isStrong = entry.strength === "转折";
    const markColor = isStrong
      ? (isTop ? "#ff4d6d" : "#19d27a")
      : "#6b7892";

    const subtitleParts = [
      `${isTop ? "顶分型" : "底分型"} · ${entry.fractal_date}`,
    ];
    if (entry.bars_since != null) subtitleParts.push(`距今 ${entry.bars_since}d`);
    if (entry.strength) {
      subtitleParts.push(`{${isStrong ? "strong" : "weak"}|${entry.strength}型}`);
    }
    if (entry.volume_label) {
      subtitleParts.push(
        `${entry.volume_label}${entry.volume_ratio != null ? ` ${entry.volume_ratio}x` : ""}`
      );
    }

    chartInst.setOption({
      animation: false,
      title: {
        text: `${entry.symbol} · ${entry.name}`,
        subtext: subtitleParts.join(" · "),
        textStyle: { color: "#d8e1f4", fontSize: 13, fontWeight: 600 },
        subtextStyle: {
          color: isTop ? "#ff4d6d" : "#19d27a",
          fontSize: 11,
          // 富文本片段:转折型用本色高亮,中继型偏灰
          rich: {
            strong: {
              color: isTop ? "#ff4d6d" : "#19d27a",
              backgroundColor: isTop
                ? "rgba(255, 77, 109, 0.15)"
                : "rgba(25, 210, 122, 0.15)",
              padding: [1, 6],
              borderRadius: 3,
              fontWeight: 700,
            },
            weak: {
              color: "#7d8aa6",
              backgroundColor: "rgba(125, 138, 166, 0.12)",
              padding: [1, 6],
              borderRadius: 3,
              fontWeight: 600,
            },
          },
        },
        left: 12,
        top: 6,
      },
      // 双 grid:上 K 线、下成交量
      grid: [
        { left: 60, right: 16, top: 60, height: "58%" },
        { left: 60, right: 16, top: "76%", height: "16%" },
      ],
      tooltip: {
        trigger: "axis",
        axisPointer: { type: "cross", link: { xAxisIndex: "all" } },
        backgroundColor: "rgba(15,22,35,0.95)",
        borderColor: "#1d2942",
        textStyle: { color: "#d8e1f4" },
      },
      axisPointer: { link: { xAxisIndex: "all" } },
      xAxis: [
        {
          type: "category", data: dates, gridIndex: 0,
          scale: true, boundaryGap: true,
          axisLine: { lineStyle: { color: "#1d2942" } },
          axisLabel: { color: "#7d8aa6", fontSize: 10 },
          splitLine: { show: false },
          axisPointer: { z: 100 },
        },
        {
          type: "category", data: dates, gridIndex: 1,
          scale: true, boundaryGap: true,
          axisLine: { lineStyle: { color: "#1d2942" } },
          axisLabel: { show: false },
          axisTick: { show: false },
          splitLine: { show: false },
        },
      ],
      yAxis: [
        {
          gridIndex: 0, scale: true,
          axisLine: { lineStyle: { color: "#1d2942" } },
          axisLabel: { color: "#7d8aa6", fontSize: 10 },
          splitLine: { lineStyle: { color: "rgba(29,41,66,0.5)" } },
        },
        {
          gridIndex: 1, scale: true, splitNumber: 2,
          axisLine: { show: false },
          axisLabel: {
            color: "#7d8aa6", fontSize: 9,
            formatter: (v) => {
              if (v >= 1e8) return (v / 1e8).toFixed(1) + "亿";
              if (v >= 1e4) return (v / 1e4).toFixed(0) + "万";
              return v;
            },
          },
          splitLine: { show: false },
        },
      ],
      dataZoom: [
        { type: "inside", xAxisIndex: [0, 1], start: 0, end: 100 },
        {
          type: "slider", xAxisIndex: [0, 1], height: 16, bottom: 6,
          backgroundColor: "rgba(29,41,66,0.4)",
          fillerColor: "rgba(37,212,242,0.08)",
          borderColor: "#1d2942",
          handleStyle: { color: "#25d4f2" },
          textStyle: { color: "#7d8aa6" },
        },
      ],
      series: [
        {
          name: "K 线",
          type: "candlestick",
          data: cdata,
          xAxisIndex: 0, yAxisIndex: 0,
          itemStyle: {
            color: "#ff4d6d",         // 阳线 红
            color0: "#19d27a",        // 阴线 绿
            borderColor: "#ff4d6d",
            borderColor0: "#19d27a",
          },
          markPoint: fK
            ? {
                // 改用圆点 + 偏移 label,而不是 pin —— pin 的头永远朝上,
                // 用在 "底分型@fK.low" 上会把 pin 头插进 K 线实体里;
                // 这里让 label 浮在 K 线 上(顶) / 下(底)的空白区域,
                // 永远不挡蜡烛
                symbol: "circle",
                symbolSize: 9,
                // 圆点本身也离 K 线一段(屏幕坐标 y 向下为正):
                // 顶分型往上 14px,底分型往下 14px。横向 fIdx 不动,
                // 仍精确对齐高/低点的那一根 K
                symbolOffset: [0, isTop ? -14 : 14],
                label: {
                  show: true,
                  formatter: (isTop ? "顶" : "底") +
                             (entry.strength ? `·${entry.strength}` : ""),
                  position: isTop ? "top" : "bottom",
                  distance: 20,
                  color: "#fff",
                  backgroundColor: markColor,
                  // 中继型再降一档亮度,跟字体颜色保持一致
                  borderColor: isStrong ? "transparent" : "#a0acc4",
                  borderWidth: isStrong ? 0 : 1,
                  padding: [3, 7],
                  borderRadius: 4,
                  fontWeight: 700,
                  fontSize: 11,
                },
                data: [
                  {
                    name: (isTop ? "顶分型" : "底分型") +
                          (entry.strength ? `·${entry.strength}` : ""),
                    coord: [fIdx, isTop ? fK.high : fK.low],
                    itemStyle: { color: markColor },
                  },
                ],
              }
            : undefined,
        },
        {
          name: "成交量",
          type: "bar",
          data: vols,
          xAxisIndex: 1, yAxisIndex: 1,
          barMaxWidth: 12,
          // 在分型当日柱顶画一个圆点,让量能位置直观对应
          markPoint: fK
            ? {
                symbol: "circle",
                symbolSize: 9,
                label: { show: false },
                data: [
                  {
                    coord: [fIdx, fK.volume == null ? 0 : fK.volume],
                    itemStyle: { color: markColor },
                  },
                ],
              }
            : undefined,
        },
        {
          // 量能 MA(N) 参考线 — 跟柱体并陈,直观判断当下是放/平/缩
          name: `量MA${entry.volume_ma || 5}`,
          type: "line",
          data: volMa,
          xAxisIndex: 1, yAxisIndex: 1,
          smooth: true,
          symbol: "none",
          lineStyle: { color: "#ffb547", width: 1.2, opacity: 0.85 },
          z: 5,
          tooltip: {
            valueFormatter: (v) =>
              v == null || v === "-" ? "-" : Number(v).toLocaleString(),
          },
        },
      ],
    });

    if (host._fractalRO) host._fractalRO.disconnect();
    host._fractalRO = new ResizeObserver(() => chartInst && chartInst.resize());
    host._fractalRO.observe(host);
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
          请先生成静态数据:<code>bash scripts/generate.sh fractal</code>
        </div>`;
      return;
    }

    const recentDays = (payload.config && payload.config.recent_days) || 3;
    const volWin = (payload.config && payload.config.vol_ma_window) || 5;

    host.innerHTML = `
      <div class="kpi-row" id="fr-kpis"></div>
      <div class="fractal-grid">
        <div class="panel">
          <div class="panel-head">
            <div class="panel-title">
              <span class="dot-tag dot-down"></span>底分型
              <small>潜在反转买点 · 最近 ${recentDays} 日内形成 · 量能基于近 ${volWin} 日均量</small>
            </div>
            <div class="meta-item">${(payload.bottom_fractals || []).length} 例</div>
          </div>
          <div class="tbl-wrap" id="fr-bottom"></div>
        </div>
        <div class="panel">
          <div class="panel-head">
            <div class="panel-title">
              <span class="dot-tag dot-up"></span>顶分型
              <small>潜在反转卖点 · 最近 ${recentDays} 日内形成 · 量能基于近 ${volWin} 日均量</small>
            </div>
            <div class="meta-item">${(payload.top_fractals || []).length} 例</div>
          </div>
          <div class="tbl-wrap" id="fr-top"></div>
        </div>
      </div>
      <div class="panel">
        <div class="panel-head">
          <div class="panel-title">K 线 + 成交量 · 分型标记 <small>左右两表中点选某一行查看</small></div>
        </div>
        <div id="fr-chart" class="chart fractal-chart"></div>
      </div>
      ${
        (payload.errors || []).length
          ? `<div class="panel">
               <div class="panel-head">
                 <div class="panel-title">抓取失败 <small>${payload.errors.length} 例 · 直接重跑会从缓存补抓</small></div>
               </div>
               <div class="tbl-wrap">
                 <table class="tbl">
                   <thead><tr><th>代码</th><th>名称</th><th>原因</th></tr></thead>
                   <tbody>
                     ${payload.errors
                       .map(
                         (e) =>
                           `<tr><td class="mono">${e.symbol}</td><td>${
                             e.name || "-"
                           }</td><td class="down">${e.error}</td></tr>`
                       )
                       .join("")}
                   </tbody>
                 </table>
               </div>
             </div>`
          : ""
      }
    `;

    const chartHost = host.querySelector("#fr-chart");
    const onPick = (row, kind) => renderChart(row, kind, chartHost);

    renderKPIs(payload, host.querySelector("#fr-kpis"));
    renderList(payload.bottom_fractals || [], "bottom", host.querySelector("#fr-bottom"), onPick);
    renderList(payload.top_fractals || [], "top", host.querySelector("#fr-top"), onPick);

    // 默认展示一只:底分型有就用底,否则顶
    const initial =
      (payload.bottom_fractals && payload.bottom_fractals[0] && {
        row: payload.bottom_fractals[0], kind: "bottom",
      }) ||
      (payload.top_fractals && payload.top_fractals[0] && {
        row: payload.top_fractals[0], kind: "top",
      });
    if (initial) {
      renderChart(initial.row, initial.kind, chartHost);
      const list = host.querySelector(initial.kind === "bottom" ? "#fr-bottom" : "#fr-top");
      const tr = list.querySelector("tr.row-pick");
      if (tr) tr.classList.add("active");
    } else {
      chartHost.innerHTML =
        `<div class="state">最近 ${recentDays} 日内没有股票出现顶/底分型 — 这通常是好事,休市享受生活。</div>`;
    }

    // 顶栏更新时间
    const u = document.getElementById("updated-at");
    if (u && payload.updated_at) u.textContent = "更新于 " + payload.updated_at;
  }

  // 注册到全局
  window.NexusComponents = window.NexusComponents || {};
  window.NexusComponents["fractal"] = {
    id: "fractal",
    title: "顶底分型",
    group: "技术分析",
    render,
  };
})();
