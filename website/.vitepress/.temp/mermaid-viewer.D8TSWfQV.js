import { labelButton, viewerButton } from "./media-viewer.Dw0QkpCZ.js";
import "@panzoom/panzoom";
const messages = {
  en: { open: "View diagram fullscreen", title: "Diagram viewer" },
  zh: { open: "全屏查看图表", title: "图表查看器" }
};
function dimensions(svg) {
  const { width, height } = svg.viewBox.baseVal;
  if (Number.isFinite(width) && width > 0 && Number.isFinite(height) && height > 0) {
    return { width, height };
  }
  return void 0;
}
function installMermaidViewer(doc, language, viewer) {
  const entries = /* @__PURE__ */ new Map();
  let active;
  let close;
  const closeActive = () => {
    close == null ? void 0 : close();
    close = void 0;
    active = void 0;
  };
  const scan = () => {
    const copy = language().startsWith("zh") ? messages.zh : messages.en;
    const containers = new Set(doc.querySelectorAll(".vp-doc .mermaid"));
    for (const [container, entry] of entries) {
      if (!containers.has(container) || container.querySelector("svg:not(.dsh-media-icon)") !== entry.svg || !entry.button.isConnected) {
        if (entry.svg === active) closeActive();
        entry.button.remove();
        entries.delete(container);
      }
    }
    for (const container of containers) {
      const existing = entries.get(container);
      if (existing) {
        if (existing.button.getAttribute("aria-label") !== copy.open) labelButton(existing.button, copy.open);
        continue;
      }
      const svg = container.querySelector("svg:not(.dsh-media-icon)");
      if (!svg || !dimensions(svg)) continue;
      const trigger = viewerButton(doc, copy.open, "open");
      trigger.className = "dsh-diagram-open";
      trigger.setAttribute("aria-haspopup", "dialog");
      trigger.addEventListener("click", () => {
        var _a;
        closeActive();
        const size = dimensions(svg);
        if (!size) return;
        const copy2 = language().startsWith("zh") ? messages.zh : messages.en;
        close = viewer.open({
          element: svg.cloneNode(true),
          ...size,
          title: ((_a = doc.querySelector(".vp-doc h1")) == null ? void 0 : _a.textContent.trim()) || copy2.title
        }, trigger, () => {
          close = void 0;
          active = void 0;
        });
        active = svg;
      });
      container.prepend(trigger);
      entries.set(container, { svg, button: trigger });
    }
  };
  const observer = new MutationObserver(scan);
  observer.observe(doc.querySelector("#VPContent") ?? doc.body, { childList: true, subtree: true });
  scan();
  return {
    refresh() {
      closeActive();
      scan();
    },
    dispose() {
      observer.disconnect();
      closeActive();
      for (const entry of entries.values()) entry.button.remove();
      entries.clear();
    }
  };
}
export {
  installMermaidViewer
};
