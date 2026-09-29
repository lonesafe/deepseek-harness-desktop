var __typeError = (msg) => {
  throw TypeError(msg);
};
var __accessCheck = (obj, member, msg) => member.has(obj) || __typeError("Cannot " + msg);
var __privateGet = (obj, member, getter) => (__accessCheck(obj, member, "read from private field"), getter ? getter.call(obj) : member.get(obj));
var __privateAdd = (obj, member, value) => member.has(obj) ? __typeError("Cannot add the same private member more than once") : member instanceof WeakSet ? member.add(obj) : member.set(obj, value);
var __privateSet = (obj, member, value, setter) => (__accessCheck(obj, member, "write to private field"), setter ? setter.call(obj, value) : member.set(obj, value), value);
var __privateMethod = (obj, member, method) => (__accessCheck(obj, member, "access private method"), method);
var _entries, _observer, _events, _active, _close, _ImageViewer_instances, closeActive_fn, remove_fn, scan_fn;
import { labelButton, viewerButton } from "./media-viewer.Dw0QkpCZ.js";
import "@panzoom/panzoom";
const messages = {
  en: "View image fullscreen: {alt}",
  zh: "全屏查看图片：{alt}"
};
class ImageViewer {
  /**
   * @param doc Browser document containing VitePress content.
   * @param language Current VitePress language, read again when entries refresh.
   * @param viewer Shared modal owner for images and diagrams.
   */
  constructor(doc, language, viewer) {
    __privateAdd(this, _ImageViewer_instances);
    __privateAdd(this, _entries, /* @__PURE__ */ new Map());
    __privateAdd(this, _observer);
    __privateAdd(this, _events, new AbortController());
    __privateAdd(this, _active);
    __privateAdd(this, _close);
    this.doc = doc;
    this.language = language;
    this.viewer = viewer;
    const root = doc.querySelector("#VPContent") ?? doc.body;
    const scan = () => {
      __privateMethod(this, _ImageViewer_instances, scan_fn).call(this);
    };
    __privateSet(this, _observer, new MutationObserver(scan));
    __privateGet(this, _observer).observe(root, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["src", "srcset", "alt", "role", "aria-hidden", "data-no-zoom"]
    });
    const options = { capture: true, signal: __privateGet(this, _events).signal };
    root.addEventListener("load", scan, options);
    root.addEventListener("error", scan, options);
    __privateMethod(this, _ImageViewer_instances, scan_fn).call(this);
  }
  /** Close the image view and refresh controls after route, language, or theme changes. */
  refresh() {
    __privateMethod(this, _ImageViewer_instances, closeActive_fn).call(this);
    __privateMethod(this, _ImageViewer_instances, scan_fn).call(this);
  }
  /** Remove image enhancements, event handlers, observers, and any active image modal. */
  dispose() {
    __privateGet(this, _observer).disconnect();
    __privateGet(this, _events).abort();
    __privateMethod(this, _ImageViewer_instances, closeActive_fn).call(this);
    for (const [image, entry] of __privateGet(this, _entries)) __privateMethod(this, _ImageViewer_instances, remove_fn).call(this, image, entry);
  }
}
_entries = new WeakMap();
_observer = new WeakMap();
_events = new WeakMap();
_active = new WeakMap();
_close = new WeakMap();
_ImageViewer_instances = new WeakSet();
closeActive_fn = function() {
  var _a;
  (_a = __privateGet(this, _close)) == null ? void 0 : _a.call(this);
  __privateSet(this, _close, void 0);
  __privateSet(this, _active, void 0);
};
remove_fn = function(image, entry) {
  if (image === __privateGet(this, _active)) __privateMethod(this, _ImageViewer_instances, closeActive_fn).call(this);
  entry.events.abort();
  entry.button.remove();
  entry.container.classList.remove("dsh-image-container");
  image.classList.remove("dsh-image-zoomable");
  __privateGet(this, _entries).delete(image);
};
scan_fn = function() {
  const images = new Set(Array.from(this.doc.querySelectorAll(".vp-doc p > img")).filter((image) => {
    var _a;
    const entry = __privateGet(this, _entries).get(image);
    return image.complete && image.naturalWidth > 0 && image.naturalHeight > 0 && image.alt.trim() && !image.closest('a, button, .mermaid, [data-no-zoom], [aria-hidden="true"], [role="presentation"], [role="none"]') && Array.from(((_a = image.parentNode) == null ? void 0 : _a.childNodes) ?? []).every((node) => {
      var _a2;
      return node === image || node === (entry == null ? void 0 : entry.button) || node.nodeType === 3 && !((_a2 = node.textContent) == null ? void 0 : _a2.trim());
    });
  }));
  for (const [image, entry] of __privateGet(this, _entries)) {
    if (!images.has(image) || image.parentElement !== entry.container || !entry.button.isConnected || entry.source !== (image.currentSrc || image.src)) {
      __privateMethod(this, _ImageViewer_instances, remove_fn).call(this, image, entry);
    }
  }
  const copy = this.language().startsWith("zh") ? messages.zh : messages.en;
  for (const image of images) {
    const label = copy.replace("{alt}", () => image.alt);
    const existing = __privateGet(this, _entries).get(image);
    if (existing) {
      if (existing.button.getAttribute("aria-label") !== label) labelButton(existing.button, label);
      continue;
    }
    const container = image.parentElement;
    if (!container) continue;
    const button = viewerButton(this.doc, label, "open");
    button.className = "dsh-image-open";
    button.setAttribute("aria-haspopup", "dialog");
    const events = new AbortController();
    const open = () => {
      __privateMethod(this, _ImageViewer_instances, closeActive_fn).call(this);
      const content = this.doc.createElement("img");
      content.src = image.currentSrc || image.src;
      content.alt = image.alt;
      content.draggable = false;
      __privateSet(this, _close, this.viewer.open({
        element: content,
        width: image.naturalWidth,
        height: image.naturalHeight,
        title: image.alt,
        originalSize: true
      }, button, () => {
        __privateSet(this, _close, void 0);
        __privateSet(this, _active, void 0);
      }));
      __privateSet(this, _active, image);
    };
    button.addEventListener("click", open, { signal: events.signal });
    image.addEventListener("click", open, { signal: events.signal });
    container.classList.add("dsh-image-container");
    image.classList.add("dsh-image-zoomable");
    container.append(button);
    __privateGet(this, _entries).set(image, { container, button, events, source: image.currentSrc || image.src });
  }
};
export {
  ImageViewer
};
