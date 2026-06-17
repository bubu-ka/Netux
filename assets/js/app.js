/* Nexus 主程序：左侧导航 + 组件路由
 * 新增组件只需：
 *   1. backend/components/xxx.py  生产 frontend/data/xxx.json
 *   2. frontend/assets/js/components/xxx.js  注册到 window.NexusComponents
 *   3. 在下面 index.html 的 <script> 引入新组件文件
 * 组件注册时声明的 group 会自动出现在左侧目录里。
 */
(function () {
  "use strict";

  const registry = window.NexusComponents || {};
  const components = Object.values(registry);

  // 按 group 分组
  const groups = {};
  components.forEach((c) => {
    const g = c.group || "未分类";
    (groups[g] = groups[g] || []).push(c);
  });

  function buildNav() {
    const nav = document.getElementById("nav");
    nav.innerHTML = "";
    for (const groupName of Object.keys(groups)) {
      const wrap = document.createElement("div");
      wrap.className = "nav-group";
      wrap.innerHTML = `<div class="nav-group-title">${groupName}</div>`;
      groups[groupName].forEach((c) => {
        const item = document.createElement("div");
        item.className = "nav-item";
        item.dataset.id = c.id;
        item.innerHTML = `<span class="ic"></span><span>${c.title}</span>`;
        item.addEventListener("click", () => navigate(c.id));
        wrap.appendChild(item);
      });
      nav.appendChild(wrap);
    }
  }

  function setActive(id) {
    document.querySelectorAll(".nav-item").forEach((el) => {
      el.classList.toggle("active", el.dataset.id === id);
    });
    const c = registry[id];
    if (!c) return;
    document.getElementById("crumb-group").textContent = c.group || "组件";
    document.getElementById("crumb-page").textContent = c.title;
    document.title = `${c.title} · Nexus`;
  }

  async function navigate(id) {
    const c = registry[id];
    const view = document.getElementById("view");
    if (!c) {
      view.innerHTML = `<div class="state">未注册的组件: ${id}</div>`;
      return;
    }
    setActive(id);
    location.hash = "#/" + id;
    try {
      await c.render(view);
    } catch (err) {
      console.error(err);
      view.innerHTML = `<div class="state error">组件渲染异常：${err.message}</div>`;
    }
  }

  function bootstrap() {
    if (components.length === 0) {
      document.getElementById("view").innerHTML =
        '<div class="state">尚未注册任何组件</div>';
      return;
    }
    buildNav();
    const fromHash = (location.hash || "").replace(/^#\//, "");
    const startId = registry[fromHash] ? fromHash : components[0].id;
    navigate(startId);
  }

  window.addEventListener("hashchange", () => {
    const id = (location.hash || "").replace(/^#\//, "");
    if (registry[id]) navigate(id);
  });

  document.addEventListener("DOMContentLoaded", bootstrap);
})();
