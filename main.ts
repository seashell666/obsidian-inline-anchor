import { Plugin, MarkdownPostProcessorContext, MarkdownView } from 'obsidian';

// 匹配 #gu-xxx-NNN 格式的行内锚点标记
const ANCHOR_RE = /#(gu-[a-z]+-\d{3})/g;

export default class InlineAnchorPlugin extends Plugin {
  async onload() {
    // 1. 阅读视图渲染：把 #gu-xxx-NNN 标记隐藏，给前面的词包 span
    this.registerMarkdownPostProcessor((el: HTMLElement, ctx: MarkdownPostProcessorContext) => {
      this.processInlineAnchors(el);
    });

    // 2. 链接跳转后：监听布局变化，找到目标锚点并滚动+高亮
    this.registerEvent(
      this.app.workspace.on('layout-change', () => {
        this.handleJump();
      })
    );

    console.log('Inline Anchor plugin loaded');
  }

  processInlineAnchors(el: HTMLElement) {
    // 遍历所有文本节点，找 #gu-xxx-NNN
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, null);
    const textNodes: Text[] = [];
    let node: Node | null;
    while ((node = walker.nextNode())) {
      textNodes.push(node as Text);
    }

    for (const textNode of textNodes) {
      const text = textNode.textContent || '';
      if (!ANCHOR_RE.test(text)) continue;
      ANCHOR_RE.lastIndex = 0;

      // 把这段文本拆成：前面的文字 + #id 标记 + 后面的文字
      const parts: Array<{ type: 'text' | 'anchor'; content: string }> = [];
      let lastIndex = 0;
      let match: RegExpExecArray | null;
      while ((match = ANCHOR_RE.exec(text)) !== null) {
        if (match.index > lastIndex) {
          parts.push({ type: 'text', content: text.slice(lastIndex, match.index) });
        }
        parts.push({ type: 'anchor', content: match[1] }); // 不包含 #
        lastIndex = match.index + match[0].length;
      }
      if (lastIndex < text.length) {
        parts.push({ type: 'text', content: text.slice(lastIndex) });
      }

      // 替换原文本节点
      const parent = textNode.parentNode;
      if (!parent) continue;
      const fragment = document.createDocumentFragment();
      let pendingText = '';
      for (const part of parts) {
        if (part.type === 'text') {
          pendingText += part.content;
        } else {
          // 遇到锚点：先把累积的普通文本作为一个 span（不带 id），然后锚点本身隐藏
          if (pendingText) {
            const span = document.createElement('span');
            span.textContent = pendingText;
            fragment.appendChild(span);
            pendingText = '';
          }
          // 创建锚点 span：带 id，用来跳转
          const anchorSpan = document.createElement('span');
          anchorSpan.id = part.content; // gu-du-001
          anchorSpan.className = 'inline-anchor-target';
          anchorSpan.textContent = ''; // 不显示任何文字
          // 注意：锚点 span 本身是空的，id 在这里
          // 但我们希望"毒蛊"两个字被高亮，所以把锚点 span 插在"毒蛊"后面
          // 前面的普通文本 span 会包含"毒蛊"
          fragment.appendChild(anchorSpan);
        }
      }
      if (pendingText) {
        const span = document.createElement('span');
        span.textContent = pendingText;
        fragment.appendChild(span);
      }
      parent.replaceChild(fragment, textNode);
    }
  }

  handleJump() {
    // 从 URL 或 Obsidian 内部状态拿 hash
    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (!view) return;

    // Obsidian 打开文件带 #hash 时，hash 会在什么地方？
    // 我们用一个简单方式：检查当前 active leaf 的 history
    // 更可靠的方式：在链接点击时拦截

    // 暂时用 setTimeout 等渲染完
    setTimeout(() => {
      // 找所有 inline-anchor-target，看哪个 id 匹配
      // 我们怎么知道要跳哪个？Obsidian 打开链接时会把 hash 加到 URL
      const hash = window.location.hash;
      if (!hash || !hash.startsWith('#gu-')) return;
      const targetId = hash.slice(1); // 去掉 #
      const el = document.getElementById(targetId);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        // 高亮前面的蛊虫词（el 前面的兄弟节点）
        const prev = el.previousSibling;
        if (prev && prev.nodeType === Node.TEXT_NODE || (prev && prev instanceof HTMLSpanElement)) {
          const target = prev as HTMLElement;
          target.classList.add('inline-anchor-flash');
          setTimeout(() => target.classList.remove('inline-anchor-flash'), 2000);
        }
      }
    }, 100);
  }
}
