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
var ANCHOR_RE = /#(gu-[a-z]+-\d{3})/g;
var InlineAnchorPlugin = class extends import_obsidian.Plugin {
  async onload() {
    this.registerMarkdownPostProcessor((el, ctx) => {
      this.processInlineAnchors(el);
    });
    this.registerEvent(
      this.app.workspace.on("layout-change", () => {
        this.handleJump();
      })
    );
    console.log("Inline Anchor plugin loaded");
  }
  processInlineAnchors(el) {
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, null);
    const textNodes = [];
    let node;
    while (node = walker.nextNode()) {
      textNodes.push(node);
    }
    for (const textNode of textNodes) {
      const text = textNode.textContent || "";
      if (!ANCHOR_RE.test(text))
        continue;
      ANCHOR_RE.lastIndex = 0;
      const parts = [];
      let lastIndex = 0;
      let match;
      while ((match = ANCHOR_RE.exec(text)) !== null) {
        if (match.index > lastIndex) {
          parts.push({ type: "text", content: text.slice(lastIndex, match.index) });
        }
        parts.push({ type: "anchor", content: match[1] });
        lastIndex = match.index + match[0].length;
      }
      if (lastIndex < text.length) {
        parts.push({ type: "text", content: text.slice(lastIndex) });
      }
      const parent = textNode.parentNode;
      if (!parent)
        continue;
      const fragment = document.createDocumentFragment();
      let pendingText = "";
      for (const part of parts) {
        if (part.type === "text") {
          pendingText += part.content;
        } else {
          if (pendingText) {
            const span = document.createElement("span");
            span.textContent = pendingText;
            fragment.appendChild(span);
            pendingText = "";
          }
          const anchorSpan = document.createElement("span");
          anchorSpan.id = part.content;
          anchorSpan.className = "inline-anchor-target";
          anchorSpan.textContent = "";
          fragment.appendChild(anchorSpan);
        }
      }
      if (pendingText) {
        const span = document.createElement("span");
        span.textContent = pendingText;
        fragment.appendChild(span);
      }
      parent.replaceChild(fragment, textNode);
    }
  }
  handleJump() {
    const view = this.app.workspace.getActiveViewOfType(import_obsidian.MarkdownView);
    if (!view)
      return;
    setTimeout(() => {
      const hash = window.location.hash;
      if (!hash || !hash.startsWith("#gu-"))
        return;
      const targetId = hash.slice(1);
      const el = document.getElementById(targetId);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        const prev = el.previousSibling;
        if (prev && prev.nodeType === Node.TEXT_NODE || prev && prev instanceof HTMLSpanElement) {
          const target = prev;
          target.classList.add("inline-anchor-flash");
          setTimeout(() => target.classList.remove("inline-anchor-flash"), 2e3);
        }
      }
    }, 100);
  }
};
