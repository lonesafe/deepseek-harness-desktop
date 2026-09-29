import { ssrRenderAttrs } from "vue/server-renderer";
import { useSSRContext } from "vue";
import { _ as _export_sfc } from "./plugin-vue_export-helper.1tPrXgE0.js";
const __pageData = JSON.parse('{"title":"通过提示词配置持久化插件","description":"","frontmatter":{"editSource":"docs/user/develop/practice/dynamic-cordis.zh.md","rawMarkdownPath":"develop/practice/dynamic-cordis.md"},"headers":[],"relativePath":"develop/practice/dynamic-cordis.md","filePath":"develop/practice/dynamic-cordis.md"}');
const _sfc_main = { name: "develop/practice/dynamic-cordis.md" };
function _sfc_ssrRender(_ctx, _push, _parent, _attrs, $props, $setup, $data, $options) {
  _push(`<div${ssrRenderAttrs(_attrs)}><h1 id="通过提示词配置持久化插件" tabindex="-1">通过提示词配置持久化插件 <a class="header-anchor" href="#通过提示词配置持久化插件" aria-label="Permalink to &quot;通过提示词配置持久化插件&quot;">​</a></h1><p>创造模式提供 <a href="https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/boot/plugin-manager/README.zh.md" target="_blank" rel="noreferrer">Plugin Manager</a> 和只读<a href="https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/extensions/tool-cordis/README.zh.md" target="_blank" rel="noreferrer">运行时检查</a>。插件配置属于当前 profile，影响其会话，并在进程重启后保留。</p><h2 id="连接-mcp-服务器" tabindex="-1">连接 MCP 服务器 <a class="header-anchor" href="#连接-mcp-服务器" aria-label="Permalink to &quot;连接 MCP 服务器&quot;">​</a></h2><p>启动 Web profile 并选择创造模式。准备一个可访问且提供 <code>ping</code> 的 Streamable HTTP MCP 服务器，将其实际端点填入以下提示词：</p><blockquote><p>将 <code>&lt;endpoint&gt;</code> 处的 MCP 服务器配置到当前 profile，命名为 <code>demo</code>。立即启用它的工具，然后调用它的 ping 工具并告诉我结果。</p></blockquote><p>agent 编写纯配置组合包，在 patch 中插入 <code>@deepseek-ai/dsh-mcp-client</code>，再通过 <code>plugin_manager install_bundle</code> 安装。启用 HMR 时，工具会出现在同一个运行中的会话里。同时检查管理结果（<code>application: applied</code>）和成功的 <code>mcp__demo__ping</code> 调用。返回 <code>restart-required</code> 的已保存条目尚未激活；失败条目需要修复配置。</p><p>修改配置前先读取组合包 patch。使用 Plugin Manager 停用条目或移除组合包。可接受的配置及连接失败行为见 <a href="https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/mcp/mcp-client/README.zh.md" target="_blank" rel="noreferrer">MCP client 参考</a>。</p></div>`);
}
const _sfc_setup = _sfc_main.setup;
_sfc_main.setup = (props, ctx) => {
  const ssrContext = useSSRContext();
  (ssrContext.modules || (ssrContext.modules = /* @__PURE__ */ new Set())).add("develop/practice/dynamic-cordis.md");
  return _sfc_setup ? _sfc_setup(props, ctx) : void 0;
};
const dynamicCordis = /* @__PURE__ */ _export_sfc(_sfc_main, [["ssrRender", _sfc_ssrRender]]);
export {
  __pageData,
  dynamicCordis as default
};
