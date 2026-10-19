import { Plugin, MarkdownView, TFile, MarkdownPostProcessorContext, HoverPopover, MarkdownRenderer, Component, HoverParent } from 'obsidian';

// 锚点 id：拼音下划线 + 三位编号，如 yue_guang_gu_008、du_gu_001、liu_ying_cun_sheng_gu_001
const ANCHOR_ID_RE = /^[a-z]+(?:_[a-z]+)*_\d{3}$/;
// 正文标记：{id|词}，如 {yue_guang_gu_008|月光蛊}
const ANCHOR_MARKER_RE = /\{([a-z]+(?:_[a-z]+)*_\d{3})\|([^}]+)\}/g;
function markerOf(id: string) { return `{${id}|`; }

export default class InlineAnchorPlugin extends Plugin {
  async onload() {
    // 1. 阅读视图：{id|词} → 隐形的带 id 的词 span
    this.registerMarkdownPostProcessor((el: HTMLElement, ctx: MarkdownPostProcessorContext) => {
      this.processAnchors(el);
    });
    // 2. 点击链接：精确跳到词、瞬间到顶部、高亮
    this.registerLinkNavigation();
    // 3. 悬停预览：显示锚点所在段落，只高亮当前词
    this.registerHoverPreview();
    console.log('一行多锚点 loaded');
  }

  // ===== 渲染层 =====
  processAnchors(el: HTMLElement) {
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    const nodes: Text[] = [];
    let n: Node | null;
    while ((n = walker.nextNode())) nodes.push(n as Text);

    for (const node of nodes) {
      const text = node.textContent || '';
      if (!text.includes('{') || !text.includes('|')) continue;
      ANCHOR_MARKER_RE.lastIndex = 0;
      if (!ANCHOR_MARKER_RE.test(text)) continue;
      ANCHOR_MARKER_RE.lastIndex = 0;

      const parent = node.parentNode;
      if (!parent) continue;

      const frag = document.createDocumentFragment();
      let last = 0;
      let m: RegExpExecArray | null;
      while ((m = ANCHOR_MARKER_RE.exec(text)) !== null) {
        if (m.index > last) frag.appendChild(document.createTextNode(text.slice(last, m.index)));
        const span = document.createElement('span');
        span.id = m[1];
        span.className = 'anchor-word';
        span.textContent = m[2];
        frag.appendChild(span);
        last = m.index + m[0].length;
      }
      if (last < text.length) frag.appendChild(document.createTextNode(text.slice(last)));
      parent.replaceChild(frag, node);
    }
  }

  // ===== 源文件里定位标记所在行（0-based）=====
  findLineOfAnchor(content: string, id: string): number | null {
    const marker = markerOf(id);
    const lines = content.split('\n');
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes(marker)) return i;
    }
    return null;
  }

  // ===== 点击跳转 =====
  registerLinkNavigation() {
    const { workspace } = this.app;
    const original = workspace.openLinkText.bind(workspace);

    workspace.openLinkText = async (
      linktext: string,
      sourcePath: string,
      newLeaf?: boolean,
      openViewState?: unknown
    ) => {
      const hashIdx = linktext.indexOf('#');
      if (hashIdx === -1) return original(linktext, sourcePath, newLeaf, openViewState);
      const filePart = linktext.slice(0, hashIdx);
      const fragment = linktext.slice(hashIdx + 1);

      if (!ANCHOR_ID_RE.test(fragment)) return original(linktext, sourcePath, newLeaf, openViewState);

      const file = this.app.metadataCache.getFirstLinkpathDest(filePart, sourcePath);
      if (!(file instanceof TFile)) return original(linktext, sourcePath, newLeaf, openViewState);

      const activeMd = this.app.workspace.getActiveViewOfType(MarkdownView);
      // @ts-ignore
      const leaf = newLeaf
        ? this.app.workspace.getLeaf(true)
        : activeMd?.leaf ?? this.app.workspace.getMostRecentLeaf();
      if (!leaf) return original(linktext, sourcePath, newLeaf, openViewState);

      const content = await this.app.vault.cachedRead(file);
      const line = this.findLineOfAnchor(content, fragment);

      // 不带 hash 打开（避免原生“未找到”）
      await leaf.openFile(file);
      const mdView = leaf.view as MarkdownView;

      // 用 Obsidian 原生 applyScroll 瞬间定位到行（同时触发懒渲染，解决后面锚点）
      // @ts-ignore
      const renderer = mdView.previewMode?.renderer;
      if (line !== null) {
        if (renderer?.applyScrollDelayed) {
          renderer.applyScrollDelayed(line, { highlight: false });
        } else if (renderer?.applyScroll) {
          renderer.applyScroll(line);
          // @ts-ignore
        } else if (mdView.previewMode?.applyScroll) {
          // @ts-ignore
          mdView.previewMode.applyScroll(line);
        }
      }

      // 等两帧让 DOM 渲染
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(null))));

      const previewRoot = (mdView.containerEl.querySelector('.markdown-preview-view') as HTMLElement) || mdView.contentEl;
      const anchor = await this.waitForElementById(fragment, 2000, previewRoot);

      if (anchor) {
        const rect = anchor.getBoundingClientRect();
        if (rect.top < 0 || rect.top > window.innerHeight) {
          anchor.scrollIntoView({ behavior: 'auto', block: 'start' });
        }
        anchor.classList.add('inline-anchor-flash');
        setTimeout(() => anchor.classList.remove('inline-anchor-flash'), 4200);
      }
    };

    this.register(() => { workspace.openLinkText = original; });
  }

  // ===== 悬停预览 =====
  registerHoverPreview() {
    try {
      // @ts-ignore
      const internal = this.app.internalPlugins;
      // @ts-ignore
      const plugin = internal?.getPluginById?.call(internal, 'page-preview') ?? internal?.plugins?.['page-preview'];
      const instance = plugin?.instance;
      if (!instance || typeof instance.onLinkHover !== 'function') return;

      const original = instance.onLinkHover.bind(instance);
      const wrapped = async (hoverParent: HoverParent, targetEl: HTMLElement, linktext: string, sourcePath: string, ...rest: unknown[]) => {
        const hashIdx = linktext.indexOf('#');
        if (hashIdx === -1) return original(hoverParent, targetEl, linktext, sourcePath, ...rest);
        const fragment = linktext.slice(hashIdx + 1);
        if (!ANCHOR_ID_RE.test(fragment)) return original(hoverParent, targetEl, linktext, sourcePath, ...rest);

        const filePart = linktext.slice(0, hashIdx);
        const file = this.app.metadataCache.getFirstLinkpathDest(filePart, sourcePath);
        if (!(file instanceof TFile)) return original(hoverParent, targetEl, linktext, sourcePath, ...rest);

        const content = await this.app.vault.cachedRead(file);
        const line = this.findLineOfAnchor(content, fragment);
        if (line === null) return original(hoverParent, targetEl, linktext, sourcePath, ...rest);

        const lines = content.split('\n');
        let para = lines[line] || '';
        // 当前锚点高亮：{id|词} → ==词==
        const escapedId = fragment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const currentMarker = new RegExp(`\\{${escapedId}\\|([^}]+)\\}`, 'g');
        para = para.replace(currentMarker, '==$1==');
        // 同段其他锚点只保留词、不高亮：{otherId|词} → 词
        para = para.replace(ANCHOR_MARKER_RE, '$2');

        const popover = new HoverPopover(hoverParent, targetEl);
        const embed = popover.hoverEl.createDiv({ cls: 'markdown-embed is-loaded inline-anchor-popover' });
        const preview = embed.createDiv({ cls: 'markdown-preview-view markdown-rendered' });
        await MarkdownRenderer.render(this.app, para, preview, file.path, new Component());

        embed.addEventListener('click', () => {
          popover.hide();
          this.app.workspace.openLinkText(`${file.basename}#${fragment}`, sourcePath);
        });
      };
      instance.onLinkHover = wrapped;
      this.register(() => {
        if (instance.onLinkHover === wrapped) instance.onLinkHover = original;
      });
    } catch (e) {
      console.log('一行多锚点：预览拦截失败', e);
    }
  }

  // ===== 等待元素出现（应对懒渲染）=====
  waitForElementById(id: string, timeoutMs: number, root: HTMLElement): Promise<HTMLElement | null> {
    const find = () => root.querySelector(`#${CSS.escape(id)}`) as HTMLElement | null;
    const existing = find();
    if (existing) return Promise.resolve(existing);

    return new Promise((resolve) => {
      let settled = false;
      const finish = (el: HTMLElement | null) => {
        if (settled) return;
        settled = true;
        observer.disconnect();
        clearTimeout(timer);
        resolve(el);
      };
      const observer = new MutationObserver(() => {
        const el = find();
        if (el) finish(el);
      });
      observer.observe(root, { childList: true, subtree: true });
      const timer = setTimeout(() => finish(find()), timeoutMs);
    });
  }
}
