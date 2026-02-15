import type { NoteId, WemaNote, WemaEventMap } from './types.js';
import { EventEmitter } from './events.js';
import { generateId } from './utils/id.js';
import { createElement, setStyles } from './utils/dom.js';
import { sanitizeHtml, escapeHtml, isPlainText, insertHtmlAtCaret } from './utils/sanitize.js';

interface NoteManagerOptions {
  boardEl: HTMLElement;
  emitter: EventEmitter<WemaEventMap>;
  defaultWidth: number;
  defaultHeight: number;
  defaultColor: string;
  readOnly: boolean;
}

export class NoteManager {
  private notes = new Map<NoteId, WemaNote>();
  private elements = new Map<NoteId, HTMLElement>();
  private zCounter = 1;
  private boardEl: HTMLElement;
  private emitter: EventEmitter<WemaEventMap>;
  private defaultWidth: number;
  private defaultHeight: number;
  private defaultColor: string;
  private readOnly: boolean;
  private viewOnly = false;
  private imageOverlay: HTMLElement;
  private activeImage: HTMLImageElement | null = null;
  private activeImageNoteId: NoteId | null = null;
  private handleImageOverlayDismiss: (e: MouseEvent) => void;

  constructor(options: NoteManagerOptions) {
    this.boardEl = options.boardEl;
    this.emitter = options.emitter;
    this.defaultWidth = options.defaultWidth;
    this.defaultHeight = options.defaultHeight;
    this.defaultColor = options.defaultColor;
    this.readOnly = options.readOnly;

    // Image overlay (size + delete controls)
    this.imageOverlay = createElement('div', 'wema-image-overlay');
    this.imageOverlay.style.display = 'none';
    this.imageOverlay.addEventListener('click', (e) => e.stopPropagation());
    this.imageOverlay.addEventListener('pointerdown', (e) => e.stopPropagation());
    this.imageOverlay.addEventListener('mousedown', (e) => e.preventDefault());
    this.boardEl.appendChild(this.imageOverlay);

    // Dismiss overlay on outside click
    this.handleImageOverlayDismiss = (e: MouseEvent) => {
      if (this.imageOverlay.style.display === 'none') return;
      if (this.imageOverlay.contains(e.target as Node)) return;
      if (e.target === this.activeImage) return;
      this.hideImageOverlay();
    };
    this.boardEl.addEventListener('click', this.handleImageOverlayDismiss, true);
  }

  /** Create a new note and render it */
  addNote(params?: Partial<Omit<WemaNote, 'id'>>): WemaNote {
    const note: WemaNote = {
      id: generateId(),
      x: params?.x ?? 100,
      y: params?.y ?? 100,
      width: params?.width ?? this.defaultWidth,
      height: params?.height ?? this.defaultHeight,
      text: params?.text ?? '',
      color: params?.color ?? this.defaultColor,
      zIndex: params?.zIndex ?? this.zCounter++,
    };

    if (note.zIndex >= this.zCounter) {
      this.zCounter = note.zIndex + 1;
    }

    this.notes.set(note.id, note);
    this.renderNote(note);
    this.emitter.emit('note:create', { note: { ...note } });
    return { ...note };
  }

  /** Add a note with a specific ID (used for undo restore) */
  addNoteWithId(note: WemaNote): void {
    const copy = { ...note };
    if (copy.zIndex >= this.zCounter) {
      this.zCounter = copy.zIndex + 1;
    }
    this.notes.set(copy.id, copy);
    this.renderNote(copy);
    this.emitter.emit('note:create', { note: { ...copy } });
  }

  /** Update an existing note's properties */
  updateNote(id: NoteId, params: Partial<WemaNote>): void {
    const note = this.notes.get(id);
    if (!note) return;

    const prev = { ...note };
    Object.assign(note, params, { id }); // prevent id overwrite
    this.updateNoteElement(note);
    this.emitter.emit('note:update', { note: { ...note }, prev });
  }

  /** Delete a note and remove its DOM element */
  deleteNote(id: NoteId): void {
    const note = this.notes.get(id);
    if (!note) return;

    const el = this.elements.get(id);
    if (el) {
      el.remove();
      this.elements.delete(id);
    }
    this.notes.delete(id);
    this.emitter.emit('note:delete', { note: { ...note } });
  }

  /** Get a note by ID */
  getNote(id: NoteId): WemaNote | undefined {
    const note = this.notes.get(id);
    return note ? { ...note } : undefined;
  }

  /** Get all notes */
  getNotes(): WemaNote[] {
    return Array.from(this.notes.values()).map((n) => ({ ...n }));
  }

  /** Get the DOM element for a note */
  getElement(id: NoteId): HTMLElement | undefined {
    return this.elements.get(id);
  }

  /** Bring a note to front by updating its zIndex */
  bringToFront(id: NoteId): void {
    const note = this.notes.get(id);
    if (!note) return;
    note.zIndex = this.zCounter++;
    this.updateNoteElement(note);
  }

  /** Toggle readOnly on all existing notes */
  setReadOnly(readOnly: boolean): void {
    this.readOnly = readOnly;
    for (const el of this.elements.values()) {
      const content = el.querySelector('.wema-note-content') as HTMLElement | null;
      if (content) {
        content.contentEditable = readOnly ? 'false' : 'true';
        if (readOnly) content.blur();
      }
      const resizeHandle = el.querySelector('.wema-resize-handle') as HTMLElement | null;
      if (resizeHandle) {
        resizeHandle.style.display = readOnly ? 'none' : '';
      }
      const moveHandle = el.querySelector('.wema-move-handle') as HTMLElement | null;
      if (moveHandle) {
        moveHandle.style.visibility = readOnly ? 'hidden' : '';
      }
    }
  }

  /** Toggle viewOnly on all existing notes */
  setViewOnly(viewOnly: boolean): void {
    this.viewOnly = viewOnly;
    for (const el of this.elements.values()) {
      const content = el.querySelector('.wema-note-content') as HTMLElement | null;
      if (content) {
        // viewOnly or readOnly → no editing
        content.contentEditable = (viewOnly || this.readOnly) ? 'false' : 'true';
        if (viewOnly) content.blur();
      }
      const resizeHandle = el.querySelector('.wema-resize-handle') as HTMLElement | null;
      if (resizeHandle) {
        resizeHandle.style.display = (viewOnly || this.readOnly) ? 'none' : '';
      }
      const moveHandle = el.querySelector('.wema-move-handle') as HTMLElement | null;
      if (moveHandle) {
        // viewOnly allows move; readOnly hides it
        moveHandle.style.visibility = this.readOnly ? 'hidden' : '';
      }
    }
  }

  /** Flush any in-progress contenteditable edits to internal state */
  flushEditing(): void {
    for (const [id, el] of this.elements) {
      const contentEl = el.querySelector('.wema-note-content') as HTMLElement | null;
      if (!contentEl) continue;
      const note = this.notes.get(id);
      if (note && note.text !== contentEl.innerHTML) {
        note.text = contentEl.innerHTML;
      }
    }
  }

  /** Clean up board-level listeners */
  destroy(): void {
    this.boardEl.removeEventListener('click', this.handleImageOverlayDismiss, true);
    this.imageOverlay.remove();
  }

  /** Show image overlay above the given image */
  private showImageOverlay(img: HTMLImageElement, noteId: NoteId): void {
    this.activeImage = img;
    this.activeImageNoteId = noteId;
    img.classList.add('wema-image-selected');

    this.imageOverlay.innerHTML = '';

    // Size buttons
    const sizes: { label: string; width: string }[] = [
      { label: 'S', width: '25%' },
      { label: 'M', width: '50%' },
      { label: 'L', width: '75%' },
      { label: '100%', width: '100%' },
    ];
    for (const size of sizes) {
      const btn = createElement('button', 'wema-image-overlay-btn') as HTMLButtonElement;
      btn.textContent = size.label;
      btn.title = size.width;
      const isActive = img.style.width === size.width
        || (!img.style.width && size.width === '100%');
      if (isActive) btn.classList.add('active');
      btn.addEventListener('click', () => {
        img.style.width = size.width;
        // Sync to note data
        this.syncNoteContent(noteId);
        this.showImageOverlay(img, noteId); // refresh active state
      });
      this.imageOverlay.appendChild(btn);
    }

    // Delete button
    const delBtn = createElement('button', 'wema-image-overlay-btn wema-image-overlay-delete') as HTMLButtonElement;
    delBtn.textContent = '✕';
    delBtn.title = 'Delete image';
    delBtn.addEventListener('click', () => {
      img.remove();
      this.hideImageOverlay();
      this.syncNoteContent(noteId);
    });
    this.imageOverlay.appendChild(delBtn);

    // Position above the image
    const boardRect = this.boardEl.getBoundingClientRect();
    const imgRect = img.getBoundingClientRect();
    this.imageOverlay.style.left = `${imgRect.left + imgRect.width / 2 - boardRect.left}px`;
    this.imageOverlay.style.top = `${imgRect.top - boardRect.top - 4}px`;
    this.imageOverlay.style.display = '';
  }

  /** Hide the image overlay */
  private hideImageOverlay(): void {
    this.imageOverlay.style.display = 'none';
    if (this.activeImage) {
      this.activeImage.classList.remove('wema-image-selected');
    }
    this.activeImage = null;
    this.activeImageNoteId = null;
  }

  /** Sync a note's content element innerHTML back to note data */
  private syncNoteContent(noteId: NoteId): void {
    const el = this.elements.get(noteId);
    if (!el) return;
    const contentEl = el.querySelector('.wema-note-content') as HTMLElement | null;
    if (!contentEl) return;
    const current = this.notes.get(noteId);
    if (!current) return;
    const prev = { ...current };
    current.text = contentEl.innerHTML;
    this.emitter.emit('note:update', { note: { ...current }, prev });
    this.emitter.emit('change', { data: undefined as never });
  }

  /** Remove all notes and DOM elements */
  clear(): void {
    for (const el of this.elements.values()) {
      el.remove();
    }
    this.elements.clear();
    this.notes.clear();
    this.zCounter = 1;
  }

  /** Render all notes from data (used by importData) */
  renderAll(notes: WemaNote[]): void {
    this.clear();
    for (const note of notes) {
      this.notes.set(note.id, { ...note });
      if (note.zIndex >= this.zCounter) {
        this.zCounter = note.zIndex + 1;
      }
      this.renderNote(this.notes.get(note.id)!);
    }
  }

  private renderNote(note: WemaNote): void {
    const el = createElement('div', 'wema-note');
    el.dataset.noteId = note.id;

    // Move handle (grip bar at top)
    const moveHandle = createElement('div', 'wema-move-handle');
    moveHandle.innerHTML = '<svg width="20" height="10" viewBox="0 0 20 10"><circle cx="4" cy="3" r="1.5" fill="currentColor"/><circle cx="10" cy="3" r="1.5" fill="currentColor"/><circle cx="16" cy="3" r="1.5" fill="currentColor"/><circle cx="4" cy="8" r="1.5" fill="currentColor"/><circle cx="10" cy="8" r="1.5" fill="currentColor"/><circle cx="16" cy="8" r="1.5" fill="currentColor"/></svg>';
    if (this.readOnly) {
      moveHandle.style.visibility = 'hidden';
    }

    const content = createElement('div', 'wema-note-content');
    if (!this.readOnly && !this.viewOnly) {
      content.contentEditable = 'true';
    }
    content.innerHTML = isPlainText(note.text) ? escapeHtml(note.text) : sanitizeHtml(note.text);

    // Track if content was actually edited (prevents false diffs from browser innerHTML normalization)
    let dirty = false;
    content.addEventListener('input', () => { dirty = true; });

    // Handle blur to commit text edits
    content.addEventListener('blur', () => {
      if (!dirty) return;
      dirty = false;
      const current = this.notes.get(note.id);
      if (!current) return;
      const newText = content.innerHTML;
      if (newText !== current.text) {
        const prev = { ...current };
        current.text = newText;
        this.emitter.emit('note:update', { note: { ...current }, prev });
        this.emitter.emit('change', { data: undefined as never }); // board will handle actual data
      }
    });

    // Paste handler: sanitize pasted HTML
    content.addEventListener('paste', (e: ClipboardEvent) => {
      e.preventDefault();
      const html = e.clipboardData?.getData('text/html');
      const plain = e.clipboardData?.getData('text/plain') ?? '';
      if (html) {
        insertHtmlAtCaret(sanitizeHtml(html));
      } else {
        insertHtmlAtCaret(escapeHtml(plain).replace(/\n/g, '<br>'));
      }
      dirty = true;
    });

    // Checkbox toggle handler
    content.addEventListener('click', (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' && (target as HTMLInputElement).type === 'checkbox') {
        // Allow the default toggle, then sync checked attribute and class
        setTimeout(() => {
          const input = target as HTMLInputElement;
          // Sync .checked property to HTML attribute so innerHTML reflects it
          if (input.checked) {
            input.setAttribute('checked', '');
          } else {
            input.removeAttribute('checked');
          }
          const li = target.closest('li');
          if (li) {
            li.classList.toggle('wema-checked', input.checked);
          }
          dirty = true;
          const current = this.notes.get(note.id);
          if (!current) return;
          const prev = { ...current };
          current.text = content.innerHTML;
          this.emitter.emit('note:update', { note: { ...current }, prev });
          this.emitter.emit('change', { data: undefined as never });
        }, 0);
        return;
      }

      // Link click handler — always open in new tab
      if (target.tagName === 'A' || target.closest('a')) {
        const linkEl = (target.tagName === 'A' ? target : target.closest('a')) as HTMLAnchorElement;
        e.preventDefault();
        const href = linkEl.getAttribute('href');
        if (href) {
          window.open(href, '_blank', 'noopener');
        }
        return;
      }

      // Image click handler — show size/delete overlay
      if (target.tagName === 'IMG') {
        e.preventDefault();
        if (!this.readOnly && !this.viewOnly) {
          this.showImageOverlay(target as HTMLImageElement, note.id);
        }
      }
    });

    // Enter key in checklist: insert new TODO item
    content.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.key !== 'Enter') return;
      const sel = document.getSelection();
      if (!sel || sel.rangeCount === 0) return;
      const li = (sel.anchorNode?.nodeType === Node.TEXT_NODE
        ? sel.anchorNode.parentElement : sel.anchorNode as HTMLElement)?.closest('li');
      if (!li || !li.closest('.wema-checklist')) return;

      e.preventDefault();
      const newLi = document.createElement('li');
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      newLi.appendChild(cb);
      newLi.appendChild(document.createTextNode(' '));

      // Split text after caret into new item
      const range = sel.getRangeAt(0);
      const afterRange = document.createRange();
      afterRange.setStart(range.endContainer, range.endOffset);
      afterRange.setEndAfter(li.lastChild ?? li);
      const trailing = afterRange.extractContents();
      // Remove the checkbox from extracted contents if any (shouldn't happen, but safety)
      const extractedCb = trailing.querySelector('input[type="checkbox"]');
      if (extractedCb) extractedCb.remove();
      newLi.appendChild(trailing);

      li.parentNode?.insertBefore(newLi, li.nextSibling);

      // Set caret after the checkbox in the new item
      const newRange = document.createRange();
      newRange.setStart(newLi, 2); // after checkbox and space text node
      newRange.collapse(true);
      sel.removeAllRanges();
      sel.addRange(newRange);
      dirty = true;
    });

    // Anchor points (visual only in Phase 1)
    const anchors = createElement('div', 'wema-note-anchors');
    for (const pos of ['top', 'right', 'bottom', 'left'] as const) {
      const anchor = createElement('div', `wema-anchor wema-anchor-${pos}`);
      anchor.dataset.anchor = pos;
      anchors.appendChild(anchor);
    }

    // Resize handle (bottom-right corner)
    const resizeHandle = createElement('div', 'wema-resize-handle');
    if (this.readOnly || this.viewOnly) {
      resizeHandle.style.display = 'none';
    }

    el.appendChild(moveHandle);
    el.appendChild(content);
    el.appendChild(anchors);
    el.appendChild(resizeHandle);

    this.applyStyles(el, note);
    this.boardEl.appendChild(el);
    this.elements.set(note.id, el);
  }

  private updateNoteElement(note: WemaNote): void {
    const el = this.elements.get(note.id);
    if (!el) return;
    this.applyStyles(el, note);
    const content = el.querySelector('.wema-note-content') as HTMLElement | null;
    if (content && content.innerHTML !== note.text && document.activeElement !== content) {
      content.innerHTML = isPlainText(note.text) ? escapeHtml(note.text) : sanitizeHtml(note.text);
    }
  }

  private applyStyles(el: HTMLElement, note: WemaNote): void {
    setStyles(el, {
      left: `${note.x}px`,
      top: `${note.y}px`,
      width: `${note.width}px`,
      height: `${note.height}px`,
      zIndex: String(note.zIndex),
    });
    el.style.setProperty('--wema-note-color', note.color);
  }
}
