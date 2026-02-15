import { createElement } from './utils/dom.js';

const TEXT_COLORS = [
  '#333333', '#D32F2F', '#1976D2', '#388E3C',
  '#F57C00', '#7B1FA2', '#00796B', '#455A64',
];

/**
 * Floating toolbar that appears when text is selected inside a .wema-note-content element.
 * Provides inline formatting: Bold, Text Color, and Link insertion.
 */
export class RichTextToolbar {
  private boardEl: HTMLElement;
  private toolbarEl: HTMLElement;
  private readOnly: boolean;
  private viewOnly: boolean;
  private rafId = 0;
  private handleSelectionChange: () => void;
  private handleMouseDown: (e: MouseEvent) => void;
  private activeContentEl: HTMLElement | null = null;
  private savedRange: Range | null = null;
  private subPanelOpen = false;

  constructor(options: { boardEl: HTMLElement; readOnly: boolean; viewOnly: boolean }) {
    this.boardEl = options.boardEl;
    this.readOnly = options.readOnly;
    this.viewOnly = options.viewOnly;

    this.toolbarEl = createElement('div', 'wema-richtext-toolbar');
    this.toolbarEl.style.display = 'none';
    this.toolbarEl.addEventListener('mousedown', (e) => {
      // Prevent toolbar clicks from stealing focus/selection
      e.preventDefault();
    });
    this.toolbarEl.addEventListener('pointerdown', (e) => {
      // Stop pointerdown from reaching the board's rubberband handler
      e.stopPropagation();
    });
    this.boardEl.appendChild(this.toolbarEl);

    this.handleSelectionChange = () => {
      if (this.rafId) cancelAnimationFrame(this.rafId);
      this.rafId = requestAnimationFrame(() => this.onSelectionChange());
    };

    // Prevent default on mousedown on toolbar to preserve selection
    this.handleMouseDown = (e: MouseEvent) => {
      if (this.toolbarEl.contains(e.target as Node)) {
        e.preventDefault();
      }
    };

    document.addEventListener('selectionchange', this.handleSelectionChange);
    this.boardEl.addEventListener('mousedown', this.handleMouseDown);
  }

  setReadOnly(readOnly: boolean): void {
    this.readOnly = readOnly;
    if (readOnly) this.hide();
  }

  setViewOnly(viewOnly: boolean): void {
    this.viewOnly = viewOnly;
    if (viewOnly) this.hide();
  }

  destroy(): void {
    document.removeEventListener('selectionchange', this.handleSelectionChange);
    this.boardEl.removeEventListener('mousedown', this.handleMouseDown);
    if (this.rafId) cancelAnimationFrame(this.rafId);
    this.toolbarEl.remove();
  }

  private hide(): void {
    this.toolbarEl.style.display = 'none';
    this.activeContentEl = null;
    this.savedRange = null;
    this.subPanelOpen = false;
  }

  private onSelectionChange(): void {
    if (this.readOnly || this.viewOnly) {
      this.hide();
      return;
    }

    // Don't rebuild toolbar while a sub-panel (color palette / link input) is open
    if (this.subPanelOpen) {
      return;
    }

    const sel = document.getSelection();
    if (!sel || sel.rangeCount === 0 || sel.isCollapsed) {
      this.hide();
      return;
    }

    // Check if selection is within a .wema-note-content inside our board
    const range = sel.getRangeAt(0);
    const ancestor = range.commonAncestorContainer;
    const contentEl = (ancestor.nodeType === Node.TEXT_NODE ? ancestor.parentElement : ancestor as HTMLElement)
      ?.closest('.wema-note-content');

    if (!contentEl || !this.boardEl.contains(contentEl)) {
      this.hide();
      return;
    }

    this.activeContentEl = contentEl as HTMLElement;
    this.buildToolbar();
    this.positionToolbar(range);
    this.toolbarEl.style.display = '';
  }

  private buildToolbar(): void {
    this.toolbarEl.innerHTML = '';

    // Bold button
    const boldBtn = createElement('button', 'wema-richtext-btn') as HTMLButtonElement;
    boldBtn.innerHTML = '<b>B</b>';
    boldBtn.title = 'Bold';
    if (this.isFormatActive('bold')) {
      boldBtn.classList.add('active');
    }
    boldBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.toggleBold();
    });

    // Text color button
    const colorBtn = createElement('button', 'wema-richtext-btn') as HTMLButtonElement;
    colorBtn.innerHTML = '<span style="border-bottom: 2px solid currentColor;">A</span>';
    colorBtn.title = 'Text Color';
    const colorPalette = this.buildColorPalette();
    colorPalette.style.display = 'none';
    colorBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const isVisible = colorPalette.style.display !== 'none';
      colorPalette.style.display = isVisible ? 'none' : '';
      linkInput.style.display = 'none';
      this.subPanelOpen = !isVisible;
    });

    // Link button
    const linkBtn = createElement('button', 'wema-richtext-btn') as HTMLButtonElement;
    linkBtn.innerHTML = '🔗';
    linkBtn.title = 'Link';
    const linkInput = this.buildLinkInput();
    linkInput.style.display = 'none';
    linkBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const isVisible = linkInput.style.display !== 'none';
      linkInput.style.display = isVisible ? 'none' : '';
      colorPalette.style.display = 'none';
      this.subPanelOpen = !isVisible;
      if (!isVisible) {
        // Save the current selection range before focus moves to the input
        const sel = document.getSelection();
        if (sel && sel.rangeCount > 0) {
          this.savedRange = sel.getRangeAt(0).cloneRange();
        }
        // Pre-fill if selection is already a link
        const a = this.getParentTag('a');
        const input = linkInput.querySelector('input') as HTMLInputElement;
        if (a) {
          input.value = (a as HTMLAnchorElement).href;
        } else {
          input.value = '';
        }
        setTimeout(() => input.focus(), 0);
      } else {
        this.savedRange = null;
      }
    });

    this.toolbarEl.appendChild(boldBtn);
    this.toolbarEl.appendChild(colorBtn);
    this.toolbarEl.appendChild(linkBtn);
    this.toolbarEl.appendChild(colorPalette);
    this.toolbarEl.appendChild(linkInput);
  }

  private buildColorPalette(): HTMLElement {
    const palette = createElement('div', 'wema-richtext-colors');
    for (const color of TEXT_COLORS) {
      const swatch = createElement('button', 'wema-color-swatch') as HTMLButtonElement;
      swatch.style.backgroundColor = color;
      swatch.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.applyColor(color);
      });
      palette.appendChild(swatch);
    }
    return palette;
  }

  private buildLinkInput(): HTMLElement {
    const container = createElement('div', 'wema-richtext-link-input');
    const input = document.createElement('input');
    input.type = 'url';
    input.placeholder = 'https://...';
    input.addEventListener('mousedown', (e) => e.stopPropagation());
    input.addEventListener('click', (e) => e.stopPropagation());

    const applyBtn = createElement('button', 'wema-richtext-btn') as HTMLButtonElement;
    applyBtn.textContent = 'OK';
    applyBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const url = input.value.trim();
      if (url) {
        this.applyLink(url);
      }
      container.style.display = 'none';
      this.subPanelOpen = false;
    });

    const removeBtn = createElement('button', 'wema-richtext-btn') as HTMLButtonElement;
    removeBtn.textContent = '✕';
    removeBtn.title = 'Remove link';
    removeBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.removeLink();
      container.style.display = 'none';
      this.subPanelOpen = false;
    });

    container.appendChild(input);
    container.appendChild(applyBtn);
    container.appendChild(removeBtn);
    return container;
  }

  private positionToolbar(range: Range): void {
    const rect = range.getBoundingClientRect();
    const boardRect = this.boardEl.getBoundingClientRect();

    const left = rect.left + rect.width / 2 - boardRect.left;
    const top = rect.top - boardRect.top - 8; // 8px gap above selection

    this.toolbarEl.style.left = `${left}px`;
    this.toolbarEl.style.top = `${top}px`;
  }

  private isFormatActive(format: string): boolean {
    try {
      return document.queryCommandState(format);
    } catch {
      return false;
    }
  }

  private getParentTag(tag: string): Element | null {
    const sel = document.getSelection();
    if (!sel || sel.rangeCount === 0) return null;
    let node: Node | null = sel.anchorNode;
    while (node && node !== this.activeContentEl) {
      if (node.nodeType === Node.ELEMENT_NODE && (node as Element).tagName.toLowerCase() === tag) {
        return node as Element;
      }
      node = node.parentNode;
    }
    return null;
  }

  private toggleBold(): void {
    const sel = document.getSelection();
    if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return;

    const range = sel.getRangeAt(0);

    // Check if selection is already bold
    const boldParent = this.findAncestor(range.commonAncestorContainer, ['b', 'strong']);
    if (boldParent && this.activeContentEl?.contains(boldParent)) {
      // Unwrap: move children out and remove the bold element
      this.unwrapElement(boldParent as HTMLElement);
    } else {
      // Wrap selection in <b>
      this.wrapSelection('b');
    }
    this.triggerInput();
  }

  private applyColor(color: string): void {
    const sel = document.getSelection();
    if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return;

    // Check if already wrapped in a span with color
    const range = sel.getRangeAt(0);
    const colorSpan = this.findColorSpan(range.commonAncestorContainer);
    if (colorSpan && this.activeContentEl?.contains(colorSpan)) {
      (colorSpan as HTMLElement).style.color = color;
    } else {
      const wrapper = document.createElement('span');
      wrapper.style.color = color;
      this.wrapSelectionWithElement(wrapper);
    }
    this.triggerInput();
  }

  private applyLink(url: string): void {
    if (!this.activeContentEl) return;

    // Restore saved selection range
    this.restoreSavedRange();

    const sel = document.getSelection();
    if (!sel || sel.rangeCount === 0) return;

    // Check if already a link
    const existingLink = this.getParentTag('a');
    if (existingLink) {
      (existingLink as HTMLAnchorElement).href = url;
    } else {
      if (sel.isCollapsed) return;
      const wrapper = document.createElement('a');
      wrapper.href = url;
      wrapper.target = '_blank';
      wrapper.rel = 'noopener';
      this.wrapSelectionWithElement(wrapper);
    }
    this.savedRange = null;
    this.triggerInput();
  }

  private removeLink(): void {
    // Restore saved selection range
    this.restoreSavedRange();

    const linkEl = this.getParentTag('a');
    if (linkEl && this.activeContentEl?.contains(linkEl)) {
      this.unwrapElement(linkEl as HTMLElement);
      this.triggerInput();
    }
    this.savedRange = null;
  }

  /** Restore the saved range to the document selection */
  private restoreSavedRange(): void {
    if (!this.savedRange || !this.activeContentEl) return;
    this.activeContentEl.focus();
    const sel = document.getSelection();
    if (!sel) return;
    sel.removeAllRanges();
    sel.addRange(this.savedRange);
  }

  private wrapSelection(tag: string): void {
    const wrapper = document.createElement(tag);
    this.wrapSelectionWithElement(wrapper);
  }

  private wrapSelectionWithElement(wrapper: HTMLElement): void {
    const sel = document.getSelection();
    if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return;

    const range = sel.getRangeAt(0);
    const contents = range.extractContents();
    wrapper.appendChild(contents);
    range.insertNode(wrapper);

    // Re-select the wrapped content
    const newRange = document.createRange();
    newRange.selectNodeContents(wrapper);
    sel.removeAllRanges();
    sel.addRange(newRange);
  }

  private unwrapElement(el: HTMLElement): void {
    const parent = el.parentNode;
    if (!parent) return;
    while (el.firstChild) {
      parent.insertBefore(el.firstChild, el);
    }
    parent.removeChild(el);
  }

  private findAncestor(node: Node, tags: string[]): Node | null {
    let current: Node | null = node;
    while (current && current !== this.activeContentEl) {
      if (current.nodeType === Node.ELEMENT_NODE) {
        const tagName = (current as Element).tagName.toLowerCase();
        if (tags.includes(tagName)) return current;
      }
      current = current.parentNode;
    }
    return null;
  }

  private findColorSpan(node: Node): Node | null {
    let current: Node | null = node;
    while (current && current !== this.activeContentEl) {
      if (current.nodeType === Node.ELEMENT_NODE) {
        const el = current as HTMLElement;
        if (el.tagName.toLowerCase() === 'span' && el.style.color) {
          return current;
        }
      }
      current = current.parentNode;
    }
    return null;
  }

  private triggerInput(): void {
    // Dispatch input event so the dirty flag is set for blur handler
    if (this.activeContentEl) {
      this.activeContentEl.dispatchEvent(new Event('input', { bubbles: true }));
    }
  }
}
