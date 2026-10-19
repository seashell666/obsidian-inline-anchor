"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// main.ts
var main_exports = {};
__export(main_exports, {
  default: () => InlineAnchorPlugin
});
module.exports = __toCommonJS(main_exports);
var import_obsidian = require("obsidian");
var ANCHOR_ID_RE = /^[a-z]+(?:_[a-z]+)*_\d{3}$/;
var ANCHOR_MARKER_RE = /\{([a-z]+(?:_[a-z]+)*_\d{3})\|([^}]+)\}/g;
function markerOf(id) {
  return `{${id}|`;
}
var InlineAnchorPlugin = class extends import_obsidian.Plugin {
  async onload() {
    this.registerMarkdownPostProcessor((el, ctx) => {
      this.processAnchors(el);
    });
    this.registerLinkNavigation();
    this.registerHoverPreview();
    console.log("\u4E00\u884C\u591A\u951A\u70B9 loaded");
  }
  // ===== 渲染层 =====
  processAnchors(el) {
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    const nodes = [];
    let n;
    while (n = walker.nextNode())
      nodes.push(n);
    for (const node of nodes) {
      const text = node.textContent || "";
      if (!text.includes("{") || !text.includes("|"))
        continue;
      ANCHOR_MARKER_RE.lastIndex = 0;
      if (!ANCHOR_MARKER_RE.test(text))
        continue;
      ANCHOR_MARKER_RE.lastIndex = 0;
      const parent = node.parentNode;
      if (!parent)
        continue;
      const frag = document.createDocumentFragment();
      let last = 0;
      let m;
      while ((m = ANCHOR_MARKER_RE.exec(text)) !== null) {
        if (m.index > last)
          frag.appendChild(document.createTextNode(text.slice(last, m.index)));
        const span = document.createElement("span");
        span.id = m[1];
        span.className = "anchor-word";
        span.textContent = m[2];
        frag.appendChild(span);
        last = m.index + m[0].length;
      }
      if (last < text.length)
        frag.appendChild(document.createTextNode(text.slice(last)));
      parent.replaceChild(frag, node);
    }
  }
  // ===== 源文件里定位标记所在行（0-based）=====
  findLineOfAnchor(content, id) {
    const marker = markerOf(id);
    const lines = content.split("\n");
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes(marker))
        return i;
    }
    return null;
  }
  // ===== 点击跳转 =====
  registerLinkNavigation() {
    const { workspace } = this.app;
    const original = workspace.openLinkText.bind(workspace);
    workspace.openLinkText = async (linktext, sourcePath, newLeaf, openViewState) => {
      const hashIdx = linktext.indexOf("#");
      if (hashIdx === -1)
        return original(linktext, sourcePath, newLeaf, openViewState);
      const filePart = linktext.slice(0, hashIdx);
      const fragment = linktext.slice(hashIdx + 1);
      if (!ANCHOR_ID_RE.test(fragment))
        return original(linktext, sourcePath, newLeaf, openViewState);
      const file = this.app.metadataCache.getFirstLinkpathDest(filePart, sourcePath);
      if (!(file instanceof import_obsidian.TFile))
        return original(linktext, sourcePath, newLeaf, openViewState);
      const activeMd = this.app.workspace.getActiveViewOfType(import_obsidian.MarkdownView);
      const leaf = newLeaf ? this.app.workspace.getLeaf(true) : activeMd?.leaf ?? this.app.workspace.getMostRecentLeaf();
      if (!leaf)
        return original(linktext, sourcePath, newLeaf, openViewState);
      const content = await this.app.vault.cachedRead(file);
      const line = this.findLineOfAnchor(content, fragment);
      await leaf.openFile(file);
      const mdView = leaf.view;
      const renderer = mdView.previewMode?.renderer;
      if (line !== null) {
        if (renderer?.applyScrollDelayed) {
          renderer.applyScrollDelayed(line, { highlight: false });
        } else if (renderer?.applyScroll) {
          renderer.applyScroll(line);
        } else if (mdView.previewMode?.applyScroll) {
          mdView.previewMode.applyScroll(line);
        }
      }
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(null))));
      const previewRoot = mdView.containerEl.querySelector(".markdown-preview-view") || mdView.contentEl;
      const anchor = await this.waitForElementById(fragment, 2e3, previewRoot);
      if (anchor) {
        const rect = anchor.getBoundingClientRect();
        if (rect.top < 0 || rect.top > window.innerHeight) {
          anchor.scrollIntoView({ behavior: "auto", block: "start" });
        }
        anchor.classList.add("inline-anchor-flash");
        setTimeout(() => anchor.classList.remove("inline-anchor-flash"), 4200);
      }
    };
    this.register(() => {
      workspace.openLinkText = original;
    });
  }
  // ===== 悬停预览 =====
  registerHoverPreview() {
    try {
      const internal = this.app.internalPlugins;
      const plugin = internal?.getPluginById?.call(internal, "page-preview") ?? internal?.plugins?.["page-preview"];
      const instance = plugin?.instance;
      if (!instance || typeof instance.onLinkHover !== "function")
        return;
      const original = instance.onLinkHover.bind(instance);
      const wrapped = async (hoverParent, targetEl, linktext, sourcePath, ...rest) => {
        const hashIdx = linktext.indexOf("#");
        if (hashIdx === -1)
          return original(hoverParent, targetEl, linktext, sourcePath, ...rest);
        const fragment = linktext.slice(hashIdx + 1);
        if (!ANCHOR_ID_RE.test(fragment))
          return original(hoverParent, targetEl, linktext, sourcePath, ...rest);
        const filePart = linktext.slice(0, hashIdx);
        const file = this.app.metadataCache.getFirstLinkpathDest(filePart, sourcePath);
        if (!(file instanceof import_obsidian.TFile))
          return original(hoverParent, targetEl, linktext, sourcePath, ...rest);
        const content = await this.app.vault.cachedRead(file);
        const line = this.findLineOfAnchor(content, fragment);
        if (line === null)
          return original(hoverParent, targetEl, linktext, sourcePath, ...rest);
        const lines = content.split("\n");
        let para = lines[line] || "";
        const escapedId = fragment.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const currentMarker = new RegExp(`\\{${escapedId}\\|([^}]+)\\}`, "g");
        para = para.replace(currentMarker, "==$1==");
        para = para.replace(ANCHOR_MARKER_RE, "$2");
        const popover = new import_obsidian.HoverPopover(hoverParent, targetEl);
        const embed = popover.hoverEl.createDiv({ cls: "markdown-embed is-loaded inline-anchor-popover" });
        const preview = embed.createDiv({ cls: "markdown-preview-view markdown-rendered" });
        await import_obsidian.MarkdownRenderer.render(this.app, para, preview, file.path, new import_obsidian.Component());
        embed.addEventListener("click", () => {
          popover.hide();
          this.app.workspace.openLinkText(`${file.basename}#${fragment}`, sourcePath);
        });
      };
      instance.onLinkHover = wrapped;
      this.register(() => {
        if (instance.onLinkHover === wrapped)
          instance.onLinkHover = original;
      });
    } catch (e) {
      console.log("\u4E00\u884C\u591A\u951A\u70B9\uFF1A\u9884\u89C8\u62E6\u622A\u5931\u8D25", e);
    }
  }
  // ===== 等待元素出现（应对懒渲染）=====
  waitForElementById(id, timeoutMs, root) {
    const find = () => root.querySelector(`#${CSS.escape(id)}`);
    const existing = find();
    if (existing)
      return Promise.resolve(existing);
    return new Promise((resolve) => {
      let settled = false;
      const finish = (el) => {
        if (settled)
          return;
        settled = true;
        observer.disconnect();
        clearTimeout(timer);
        resolve(el);
      };
      const observer = new MutationObserver(() => {
        const el = find();
        if (el)
          finish(el);
      });
      observer.observe(root, { childList: true, subtree: true });
      const timer = setTimeout(() => finish(find()), timeoutMs);
    });
  }
};
