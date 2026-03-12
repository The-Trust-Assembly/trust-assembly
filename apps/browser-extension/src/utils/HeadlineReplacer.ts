/**
 * HeadlineReplacer — universal, DOM-wide headline replacement engine.
 *
 * Instead of targeting specific CSS selectors, this class:
 * 1. Finds ALL occurrences of the original headline text across the entire DOM
 *    (text nodes, attributes, meta tags, <title>, JSON-LD, etc.)
 * 2. Replaces them all when activated
 * 3. Uses a MutationObserver to catch dynamically-added content (SPAs, feeds)
 * 4. Restores everything when toggled off
 */

const MODIFIED_STYLE = {
  color: 'blue',
  fontStyle: 'italic',
} as const;

/** Tracks a single replacement site in the DOM */
type ReplacementRecord =
  | { type: 'textNode'; node: Text; original: string }
  | { type: 'attribute'; element: Element; attr: string; original: string }
  | { type: 'style'; element: HTMLElement; originalColor: string; originalFontStyle: string };

export default class HeadlineReplacer {
  private originalHeadline: string;
  private normalizedOriginal: string;
  private modifiedHeadline: string | undefined;
  private isModified = false;
  private replacements: ReplacementRecord[] = [];
  private observer: MutationObserver | null = null;
  /** Elements we've already processed, to avoid duplicates */
  private processedNodes = new WeakSet<Node>();

  constructor(originalHeadline: string) {
    this.originalHeadline = originalHeadline;
    this.normalizedOriginal = this.normalize(originalHeadline);
  }

  /** Apply the modified headline and start observing */
  public setModified(headline?: string): void {
    this.modifiedHeadline = headline;
    if (!this.isModified) {
      this.activate();
    } else {
      // Re-scan with new headline
      this.restoreAll();
      this.activate();
    }
  }

  /** Toggle between original and modified */
  public toggle(headline?: string): void {
    if (headline) {
      this.modifiedHeadline = headline;
    }
    if (this.isModified) {
      this.deactivate();
    } else {
      this.activate();
    }
  }

  private activate(): void {
    if (!this.modifiedHeadline) {
      console.warn('[TrustAssembly] No modified headline set');
      return;
    }
    this.isModified = true;
    this.scanAndReplace(document);
    this.startObserving();
  }

  private deactivate(): void {
    this.isModified = false;
    this.stopObserving();
    this.restoreAll();
  }

  // ---------------------------------------------------------------------------
  // DOM scanning
  // ---------------------------------------------------------------------------

  /** Walk the entire subtree and replace all headline occurrences */
  private scanAndReplace(root: Node): void {
    if (!this.modifiedHeadline) return;

    // 1. <title> tag
    if (root === document || root === document.documentElement || root === document.head) {
      this.replaceTitle();
    }

    // 2. Meta tags (og:title, twitter:title, etc.)
    if (root === document || root === document.documentElement || root === document.head) {
      this.replaceMetaTags();
    }

    // 3. Walk all nodes in the subtree
    const walker = document.createTreeWalker(
      root,
      NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT,
    );

    let node: Node | null = walker.currentNode;
    while (node) {
      if (this.processedNodes.has(node)) {
        node = walker.nextNode();
        continue;
      }

      if (node.nodeType === Node.TEXT_NODE) {
        this.replaceTextNode(node as Text);
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        this.replaceElementAttributes(node as Element);
      }

      node = walker.nextNode();
    }
  }

  private replaceTitle(): void {
    if (!this.modifiedHeadline) return;
    const titleEl = document.querySelector('title');
    if (titleEl && titleEl.textContent && this.containsHeadline(titleEl.textContent)) {
      if (!this.processedNodes.has(titleEl)) {
        this.processedNodes.add(titleEl);
        const original = titleEl.textContent;
        titleEl.textContent = this.replaceHeadlineIn(original);
        this.replacements.push({ type: 'textNode', node: titleEl.firstChild as Text, original });
      }
    }
  }

  private replaceMetaTags(): void {
    if (!this.modifiedHeadline) return;
    const metaSelectors = [
      'meta[property="og:title"]',
      'meta[name="twitter:title"]',
      'meta[name="title"]',
      'meta[property="title"]',
    ];
    for (const sel of metaSelectors) {
      const el = document.querySelector<HTMLMetaElement>(sel);
      if (el && el.content && this.containsHeadline(el.content)) {
        if (!this.processedNodes.has(el)) {
          this.processedNodes.add(el);
          const original = el.content;
          el.content = this.replaceHeadlineIn(original);
          this.replacements.push({ type: 'attribute', element: el, attr: 'content', original });
        }
      }
    }
  }

  private replaceTextNode(node: Text): void {
    if (!this.modifiedHeadline || !node.textContent) return;
    if (!this.containsHeadline(node.textContent)) return;

    // Only replace text nodes inside headline-like elements (headings,
    // elements with "headline"/"title" in their class, etc.). Body text
    // that happens to quote the headline should NOT be replaced.
    const parent = node.parentElement;
    if (!parent || !this.isHeadlineContext(parent)) return;

    this.processedNodes.add(node);
    const original = node.textContent;
    node.textContent = this.replaceHeadlineIn(original);
    this.replacements.push({ type: 'textNode', node, original });

    // Apply visual styling to the parent element if it's a visible heading/container
    if (this.isVisibleHeadlineElement(parent)) {
      this.processedNodes.add(parent);
      this.replacements.push({
        type: 'style',
        element: parent,
        originalColor: parent.style.color,
        originalFontStyle: parent.style.fontStyle,
      });
      parent.style.color = MODIFIED_STYLE.color;
      parent.style.fontStyle = MODIFIED_STYLE.fontStyle;
    }
  }

  private replaceElementAttributes(el: Element): void {
    if (!this.modifiedHeadline) return;

    // Check data-* attributes and common headline-carrying attributes
    const attrsToCheck = ['data-headline', 'data-title', 'aria-label', 'title', 'alt'];
    for (const attr of attrsToCheck) {
      const val = el.getAttribute(attr);
      if (val && this.containsHeadline(val)) {
        const key = `${attr}:${el.tagName}`;
        // Use a compound key to track attribute-level processing
        this.processedNodes.add(el);
        const original = val;
        el.setAttribute(attr, this.replaceHeadlineIn(original));
        this.replacements.push({ type: 'attribute', element: el, attr, original });
      }
    }
  }

  /** Determines if a text node's parent is in a "headline context" — i.e.
   *  the text is part of a headline element, not article body prose that
   *  happens to quote the headline. We walk up the DOM tree to check. */
  private isHeadlineContext(el: HTMLElement): boolean {
    // Walk up to 5 ancestors looking for a headline-like container
    let current: HTMLElement | null = el;
    for (let i = 0; i < 5 && current; i++) {
      if (this.isVisibleHeadlineElement(current)) return true;

      // Also allow elements explicitly marked as headline containers
      const editable = current.getAttribute('data-editable');
      if (editable === 'headline' || editable === 'headlineText') return true;

      current = current.parentElement;
    }
    return false;
  }

  /** Determines if an element is a visible headline container worth styling */
  private isVisibleHeadlineElement(el: HTMLElement): boolean {
    const tag = el.tagName.toLowerCase();
    if (['h1', 'h2', 'h3'].includes(tag)) return true;
    const cls = el.className?.toLowerCase?.() || '';
    if (cls.includes('headline') || cls.includes('title')) return true;
    // Schema.org microdata
    if (el.getAttribute('itemprop') === 'headline') return true;
    return false;
  }

  // ---------------------------------------------------------------------------
  // MutationObserver — catch dynamic content (Twitter feeds, SPA navigation)
  // ---------------------------------------------------------------------------

  private startObserving(): void {
    if (this.observer) return;

    this.observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        // New nodes added to the DOM
        for (const node of mutation.addedNodes) {
          if (this.processedNodes.has(node)) continue;
          this.scanAndReplace(node);
        }
        // Character data changes (text content updates)
        if (mutation.type === 'characterData' && mutation.target.nodeType === Node.TEXT_NODE) {
          if (this.processedNodes.has(mutation.target)) continue;
          this.replaceTextNode(mutation.target as Text);
        }
      }
    });

    this.observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      characterData: true,
    });

    console.log('[TrustAssembly] MutationObserver started');
  }

  private stopObserving(): void {
    if (this.observer) {
      this.observer.disconnect();
      this.observer = null;
      console.log('[TrustAssembly] MutationObserver stopped');
    }
  }

  // ---------------------------------------------------------------------------
  // Restore
  // ---------------------------------------------------------------------------

  private restoreAll(): void {
    // Disconnect observer first to avoid re-triggering during restore
    this.stopObserving();

    for (const rec of this.replacements) {
      switch (rec.type) {
        case 'textNode':
          if (rec.node) rec.node.textContent = rec.original;
          break;
        case 'attribute':
          rec.element.setAttribute(rec.attr, rec.original);
          break;
        case 'style':
          rec.element.style.color = rec.originalColor;
          rec.element.style.fontStyle = rec.originalFontStyle;
          break;
      }
    }

    this.replacements = [];
    this.processedNodes = new WeakSet();
    console.log('[TrustAssembly] All replacements restored');
  }

  // ---------------------------------------------------------------------------
  // String matching helpers
  // ---------------------------------------------------------------------------

  /** Normalize whitespace for fuzzy matching */
  private normalize(text: string): string {
    return text.replace(/\s+/g, ' ').trim().toLowerCase();
  }

  /** Check if a string contains the original headline (whitespace-insensitive) */
  private containsHeadline(text: string): boolean {
    return this.normalize(text).includes(this.normalizedOriginal);
  }

  /** Replace the headline within a larger string, preserving surrounding text */
  private replaceHeadlineIn(text: string): string {
    if (!this.modifiedHeadline) return text;

    // Try exact match first
    if (text.includes(this.originalHeadline)) {
      return text.split(this.originalHeadline).join(this.modifiedHeadline);
    }

    // Fallback: whitespace-insensitive replacement
    // Build a regex that matches the original headline with flexible whitespace
    const escaped = this.originalHeadline
      .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      .replace(/\s+/g, '\\s+');
    const regex = new RegExp(escaped, 'gi');
    return text.replace(regex, this.modifiedHeadline);
  }
}
