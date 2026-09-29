import { ssrRenderAttrs } from "vue/server-renderer";
import { useSSRContext } from "vue";
import { _ as _export_sfc } from "./plugin-vue_export-helper.1tPrXgE0.js";
const __pageData = JSON.parse('{"title":"Configure persistent plugins from a prompt","description":"","frontmatter":{"editSource":"docs/user/develop/practice/dynamic-cordis.md","rawMarkdownPath":"en/develop/practice/dynamic-cordis.md"},"headers":[],"relativePath":"en/develop/practice/dynamic-cordis.md","filePath":"en/develop/practice/dynamic-cordis.md"}');
const _sfc_main = { name: "en/develop/practice/dynamic-cordis.md" };
function _sfc_ssrRender(_ctx, _push, _parent, _attrs, $props, $setup, $data, $options) {
  _push(`<div${ssrRenderAttrs(_attrs)}><h1 id="configure-persistent-plugins-from-a-prompt" tabindex="-1">Configure persistent plugins from a prompt <a class="header-anchor" href="#configure-persistent-plugins-from-a-prompt" aria-label="Permalink to &quot;Configure persistent plugins from a prompt&quot;">​</a></h1><p>Creator mode provides <a href="https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/boot/plugin-manager/README.md" target="_blank" rel="noreferrer">Plugin Manager</a> and read-only <a href="https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/extensions/tool-cordis/README.md" target="_blank" rel="noreferrer">runtime inspection</a>. Plugin configuration belongs to the current profile, affects its sessions, and survives process restarts.</p><h2 id="connect-an-mcp-server" tabindex="-1">Connect an MCP server <a class="header-anchor" href="#connect-an-mcp-server" aria-label="Permalink to &quot;Connect an MCP server&quot;">​</a></h2><p>Start the Web profile and select Creator mode. With a reachable Streamable HTTP MCP server that exposes <code>ping</code>, send this prompt using its actual endpoint:</p><blockquote><p>Configure the MCP server at <code>&lt;endpoint&gt;</code> in this profile as <code>demo</code>. Make its tools available now, then call its ping tool and tell me the result.</p></blockquote><p>The agent writes a configuration-only bundle whose patch inserts <code>@deepseek-ai/dsh-mcp-client</code>, then installs it with <code>plugin_manager install_bundle</code>. With HMR enabled, the tools appear in the same running session. Verify both the management result (<code>application: applied</code>) and a successful <code>mcp__demo__ping</code> call. A saved entry with <code>restart-required</code> has not activated yet; a failed entry needs configuration repair.</p><p>Read the bundle patch before editing its configuration. Use Plugin Manager to disable entries or remove the bundle. See the <a href="https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/mcp/mcp-client/README.md" target="_blank" rel="noreferrer">MCP client reference</a> for accepted configuration and connection failure behavior.</p></div>`);
}
const _sfc_setup = _sfc_main.setup;
_sfc_main.setup = (props, ctx) => {
  const ssrContext = useSSRContext();
  (ssrContext.modules || (ssrContext.modules = /* @__PURE__ */ new Set())).add("en/develop/practice/dynamic-cordis.md");
  return _sfc_setup ? _sfc_setup(props, ctx) : void 0;
};
const dynamicCordis = /* @__PURE__ */ _export_sfc(_sfc_main, [["ssrRender", _sfc_ssrRender]]);
export {
  __pageData,
  dynamicCordis as default
};
