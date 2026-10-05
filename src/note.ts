import type { NoteId, WemaNote, WemaEventMap, ChangeOrigin } from './types.js';
import { EventEmitter } from './events.js';
import { generateId } from './utils/id.js';
import { createElement, setStyles, getSelectionRange, setSelectionRange } from './utils/dom.js';
import { sanitizeHtml, escapeHtml, isPlainText, insertHtmlAtCaret, resolveSafeUrl } from './utils/sanitize.js';
import { normalizeMeta } from './utils/meta.js';
import { isInListItem, indentListItems, outdentListItems, getListType, createListItem } from './utils/list.js';

/** Class of a note whose size follows its content (the style sheet does the sizing) */
const AUTO_SIZE_CLASS = 'wema-auto-size';

/**
 * A rendered size as a whole number of pixels that is not smaller than the
 * exact size. `offsetWidth` rounds: a note set to a width a fraction of a
 * pixel short of its content wraps the last word. `computed` is the exact
 * size from the computed style, when the browser gives one in pixels.
 */
function wholePixels(offsetSize: number, computed: string): number {
  const exact = parseFloat(computed);
  // Only the fraction is taken from the computed style: it is the same size
  // as offsetSize in a browser, and anything else is not a rendered size
  return exact > offsetSize && exact - offsetSize < 1 ? offsetSize + 1 : offsetSize;
}

interface NoteManagerOptions {
  boardEl: HTMLElement;
  /** Element the notes are rendered into (the panned layer inside the board) */
  layerEl: HTMLElement;
  emitter: EventEmitter<WemaEventMap>;
  defaultWidth: number;
  defaultHeight: number;
  defaultColor: string;
  readOnly: boolean;
  /**
   * An autoSize note was measured and its size changed in the model without a
   * note event (the size is derived from the content, not a user operation).
   */
  onMeasure: (noteId: NoteId) => void;
  /** Handle a click on a link, given its resolved absolute URL. Return true to keep it from opening in a new tab. */
  onLinkClick?: (url: string, event: MouseEvent) => boolean | void;
  /** Let the host draw a note into `container`. Return true when it did (the `renderNote` option). */
  hostRender?: (note: WemaNote, container: HTMLElement) => boolean | void;
}

/**
 * On the element of a note the host draws (`renderNote` option): it shows
 * `.wema-note-custom` instead of its text, and the text cannot be edited
 */
const HOST_DRAWN_CLASS = 'wema-note-host-drawn';

export class NoteManager {
  private notes = new Map<NoteId, WemaNote>();
  private elements = new Map<NoteId, HTMLElement>();
  private zCounter = 1;
  private boardEl: HTMLElement;
  private layerEl: HTMLElement;
  private emitter: EventEmitter<WemaEventMap>;
  private defaultWidth: number;
  private defaultHeight: number;
  private defaultColor: string;
  private readOnly: boolean;
  private viewOnly = false;
  private onMeasure: (noteId: NoteId) => void;
  private onLinkClick?: (url: string, event: MouseEvent) => boolean | void;
  private hostRender?: (note: WemaNote, container: HTMLElement) => boolean | void;
  /**
   * For notes whose measured size is not yet reported in a note event: the
   * size they had in the last one. The next note:update uses it as `prev`.
   */
  private unreportedSizeBase = new Map<NoteId, { width: number; height: number }>();
  private imageOverlay: HTMLElement;
  private activeImage: HTMLImageElement | null = null;
  private activeImageNoteId: NoteId | null = null;
  private handleImageOverlayDismiss: (e: MouseEvent) => void;

  constructor(options: NoteManagerOptions) {
    this.boardEl = options.boardEl;
    this.layerEl = options.layerEl;
    this.emitter = options.emitter;
    this.defaultWidth = options.defaultWidth;
    this.defaultHeight = options.defaultHeight;
    this.defaultColor = options.defaultColor;
    this.readOnly = options.readOnly;
    this.onMeasure = options.onMeasure;
    this.onLinkClick = options.onLinkClick;
    this.hostRender = options.hostRender;

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
    const meta = normalizeMeta(params?.meta);
    const note: WemaNote = {
      id: generateId(),
      x: params?.x ?? 100,
      y: params?.y ?? 100,
      width: params?.width ?? this.defaultWidth,
      height: params?.height ?? this.defaultHeight,
      text: params?.text ?? '',
      color: params?.color ?? this.defaultColor,
      zIndex: params?.zIndex ?? this.zCounter++,
      ...(params?.autoSize ? { autoSize: true } : {}),
      ...(meta ? { meta } : {}),
    };

    if (note.zIndex >= this.zCounter) {
      this.zCounter = note.zIndex + 1;
    }

    this.notes.set(note.id, note);
    this.renderNote(note);
    this.emitter.emit('note:create', { note: { ...note }, origin: 'local' });
    return { ...note };
  }

  /** Add a note with a specific ID (undo restore, remote changes). Does nothing if the ID exists. */
  addNoteWithId(note: WemaNote, origin: ChangeOrigin = 'local'): void {
    if (this.notes.has(note.id)) return;
    const copy = this.stored(note);
    if (copy.zIndex >= this.zCounter) {
      this.zCounter = copy.zIndex + 1;
    }
    this.notes.set(copy.id, copy);
    this.renderNote(copy);
    this.emitter.emit('note:create', { note: { ...copy }, origin });
  }

  /** Update an existing note's properties */
  updateNote(id: NoteId, params: Partial<WemaNote>): void {
    const change = this.applyParams(id, params);
    if (change) this.emitUpdate(change.note, change.prev);
  }

  /**
   * Update a note while replaying history or applying a remote change.
   * The history does not record this update, so it must not report a size
   * measured earlier: that report stays for the next `updateNote`.
   */
  replayUpdate(id: NoteId, params: Partial<WemaNote>, origin: ChangeOrigin): void {
    const change = this.applyParams(id, params);
    if (change) this.emitter.emit('note:update', { note: { ...change.note }, prev: change.prev, origin });
  }

  /** Apply params to the model and the DOM. Returns the note and its previous state. */
  private applyParams(id: NoteId, params: Partial<WemaNote>): { note: WemaNote; prev: WemaNote } | undefined {
    const note = this.notes.get(id);
    if (!note) return undefined;

    const prev = { ...note };
    Object.assign(note, params, { id }); // prevent id overwrite
    if ('meta' in params) note.meta = normalizeMeta(params.meta);
    this.updateNoteElement(note, 'text' in params);
    // What the host draws depends on the text and the meta, not on the position
    if ('text' in params || 'meta' in params) this.drawByHost(note);
    // Measure now when the change can resize an autoSize note, so the event
    // (and its undo) carries the resulting size
    if ('autoSize' in params || 'text' in params || 'meta' in params || 'width' in params || 'height' in params) {
      this.applyMeasuredSize(note);
    }
    return { note, prev };
  }

  /** A copy of a note from outside (import, undo, remote change), as it is kept in the model */
  private stored(note: WemaNote): WemaNote {
    const { meta: given, ...rest } = note;
    const meta = normalizeMeta(given);
    return meta ? { ...rest, meta } : rest;
  }

  /**
   * Offer the note to the host (`renderNote` option). When the host draws it,
   * its text is hidden and cannot be edited; otherwise it is an ordinary note.
   * Returns whether the note switched between the two.
   */
  private drawByHost(note: WemaNote): boolean {
    if (!this.hostRender) return false;
    const el = this.elements.get(note.id);
    // Only the note's own container: the text of a note may carry any class
    // name (the sanitizer keeps `class`), and it comes first in the element
    const container = el?.querySelector(':scope > .wema-note-custom') as HTMLElement | null;
    if (!el || !container) return false;
    container.replaceChildren();
    let drawn = false;
    try {
      drawn = this.hostRender({ ...note }, container) === true;
    } catch (error) {
      // Called while a note is created or updated: an error here must not
      // leave that half done. The note stays an ordinary one.
      console.error(`Error in renderNote for note "${note.id}":`, error);
    }
    const wasDrawn = el.classList.contains(HOST_DRAWN_CLASS);
    // Commit a text edit in progress while the note still counts as text:
    // once the host draws it, its content is no longer read back
    if (drawn && !wasDrawn) this.getTextElement(note.id)?.blur();
    // Drop what a host that did not return true (or threw) left behind
    if (!drawn) container.replaceChildren();
    el.classList.toggle(HOST_DRAWN_CLASS, drawn);
    this.applyEditable(note.id);
    return drawn !== wasDrawn;
  }

  /**
   * Draw a note again through the host (`refreshNote`): what it shows changed
   * outside the note's data. Returns whether the note switched between
   * host-drawn and ordinary.
   */
  refresh(id: NoteId): boolean {
    const note = this.notes.get(id);
    if (!note) return false;
    const switched = this.drawByHost(note);
    if (note.autoSize) this.measure(id);
    return switched;
  }

  /** Whether the host draws this note (its text is hidden and not editable) */
  isHostDrawn(id: NoteId): boolean {
    return this.elements.get(id)?.classList.contains(HOST_DRAWN_CLASS) ?? false;
  }

  /**
   * The element holding a note's text, for reading it back or writing to it.
   * A note the host draws has none: its text is hidden, and the DOM of a
   * hidden text is not its source of truth (the model is).
   */
  getTextElement(id: NoteId): HTMLElement | null {
    if (this.isHostDrawn(id)) return null;
    return this.contentElement(id);
  }

  /**
   * Run an edit on a note's text in the DOM, at the current selection, and
   * commit it. `edit` gets the selection (null when it is not in the text) and
   * returns the range to select afterwards, or null when it changed nothing.
   *
   * @returns whether the text was edited
   */
  editContent(
    id: NoteId,
    edit: (content: HTMLElement, range: Range | null) => Range | null,
  ): boolean {
    const content = this.getTextElement(id);
    if (!content || !this.isEditable(id)) return false;
    const next = edit(content, getSelectionRange(content));
    if (!next) return false;
    content.focus();
    setSelectionRange(next);
    this.syncNoteContent(id);
    return true;
  }

  private contentElement(id: NoteId): HTMLElement | null {
    return (this.elements.get(id)?.querySelector('.wema-note-content') as HTMLElement | undefined) ?? null;
  }

  /**
   * Whether the text of a note can be edited: not in readOnly / viewOnly mode,
   * and not when the host draws the note. Handlers ask this too, because a
   * key also arrives from a checkbox in the text, which takes the focus even
   * while the text itself cannot be edited.
   */
  private isEditable(id: NoteId): boolean {
    return !this.readOnly && !this.viewOnly && !this.isHostDrawn(id);
  }

  /** Make the text of a note editable or not, from the board's mode and who draws the note */
  private applyEditable(id: NoteId): void {
    const content = this.contentElement(id);
    if (!content) return;
    const editable = this.isEditable(id);
    content.contentEditable = editable ? 'true' : 'false';
    if (!editable) content.blur();
  }

  /** Emit a local note:update, reporting any size measured since the last one */
  private emitUpdate(note: WemaNote, prev: WemaNote): void {
    const base = this.unreportedSizeBase.get(note.id);
    this.unreportedSizeBase.delete(note.id);
    this.emitter.emit('note:update', { note: { ...note }, prev: base ? { ...prev, ...base } : prev, origin: 'local' });
  }

  /**
   * Copy the rendered size of an autoSize note to the model.
   * Returns whether the size changed. A size of 0 means the note is not laid
   * out (hidden by a collapsed edge, or detached) and is ignored.
   */
  private applyMeasuredSize(note: WemaNote): boolean {
    if (!note.autoSize) return false;
    const el = this.elements.get(note.id);
    if (!el) return false;
    const width = el.offsetWidth;
    const height = el.offsetHeight;
    if (width === 0 || height === 0) return false;
    if (width === note.width && height === note.height) return false;
    note.width = width;
    note.height = height;
    return true;
  }

  /**
   * Measure an autoSize note outside of a note event (while typing, after
   * layout). The size change is not an operation of its own: it is reported
   * through `onMeasure` and becomes part of the next note:update.
   */
  private measure(noteId: NoteId): void {
    const note = this.notes.get(noteId);
    if (!note) return;
    const before = { width: note.width, height: note.height };
    if (!this.applyMeasuredSize(note)) return;
    if (!this.unreportedSizeBase.has(noteId)) this.unreportedSizeBase.set(noteId, before);
    this.onMeasure(noteId);
  }

  /**
   * Resize a note once to the size its content takes: the size it would have
   * as an autoSize note. `autoSize` itself is not changed, so the note keeps
   * that size afterwards. Reported as one note:update, or not at all when
   * the note has that size already.
   */
  resizeToContent(id: NoteId): void {
    const note = this.notes.get(id);
    const el = this.elements.get(id);
    // An autoSize note already has the size of its content
    if (!note || !el || note.autoSize) return;

    // Lay the note out as an autoSize note for a moment, and read the result
    el.classList.add(AUTO_SIZE_CLASS);
    const style = getComputedStyle(el);
    const width = wholePixels(el.offsetWidth, style.width);
    const height = wholePixels(el.offsetHeight, style.height);
    el.classList.remove(AUTO_SIZE_CLASS);

    // Not laid out (hidden by a collapsed edge, or detached): nothing to fit to
    if (width === 0 || height === 0) return;
    if (width === note.width && height === note.height) return;
    this.updateNote(id, { width, height });
  }

  /** Delete a note and remove its DOM element */
  deleteNote(id: NoteId, origin: ChangeOrigin = 'local'): void {
    const note = this.notes.get(id);
    if (!note) return;

    const el = this.elements.get(id);
    if (el) {
      el.remove();
      this.elements.delete(id);
    }
    this.notes.delete(id);
    this.unreportedSizeBase.delete(id);
    this.emitter.emit('note:delete', { note: { ...note }, origin });
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
    this.updateNoteElement(note, false);
  }

  /** Toggle readOnly on all existing notes */
  setReadOnly(readOnly: boolean): void {
    this.readOnly = readOnly;
    for (const [id, el] of this.elements) {
      this.applyEditable(id);
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
    for (const [id, el] of this.elements) {
      this.applyEditable(id);
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

  /**
   * Get all notes with the text currently shown, including edits in progress.
   * The model is left untouched: an edit only reaches it when it is committed
   * on blur, so that the commit still sees the text from before the edit.
   */
  getNotesWithLiveText(): WemaNote[] {
    return Array.from(this.notes.values()).map((note) => {
      const contentEl = this.getTextElement(note.id);
      return { ...note, text: contentEl ? contentEl.innerHTML : note.text };
    });
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

    this.updateOverlayPosition();
    this.imageOverlay.style.display = '';
  }

  /** Place the image overlay above its image (call again after the viewport changes) */
  updateOverlayPosition(): void {
    if (!this.activeImage) return;
    const boardRect = this.boardEl.getBoundingClientRect();
    const imgRect = this.activeImage.getBoundingClientRect();
    this.imageOverlay.style.left = `${imgRect.left + imgRect.width / 2 - boardRect.left}px`;
    this.imageOverlay.style.top = `${imgRect.top - boardRect.top - 4}px`;
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

  /**
   * Commit an edit made in the DOM (typing, checkbox, image) to note data.
   * One note:update carries the text and the size it resulted in, including
   * what was measured while typing. Nothing is emitted when nothing changed.
   */
  private syncNoteContent(noteId: NoteId): void {
    const contentEl = this.getTextElement(noteId);
    if (!contentEl) return;
    const current = this.notes.get(noteId);
    if (!current) return;
    const prev = { ...current };
    current.text = contentEl.innerHTML;
    const resized = this.applyMeasuredSize(current);
    if (current.text !== prev.text || resized || this.unreportedSizeBase.has(noteId)) {
      this.emitUpdate(current, prev);
    }
  }

  /** Remove all notes and DOM elements */
  clear(): void {
    for (const el of this.elements.values()) {
      el.remove();
    }
    this.elements.clear();
    this.notes.clear();
    this.unreportedSizeBase.clear();
    this.zCounter = 1;
  }

  /** Render all notes from data (used by importData) */
  renderAll(notes: WemaNote[]): void {
    this.clear();
    for (const note of notes) {
      this.notes.set(note.id, this.stored(note));
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
    moveHandle.style.position = 'relative';
    moveHandle.innerHTML = '<svg width="20" height="10" viewBox="0 0 20 10"><circle cx="4" cy="3" r="1.5" fill="currentColor"/><circle cx="10" cy="3" r="1.5" fill="currentColor"/><circle cx="16" cy="3" r="1.5" fill="currentColor"/><circle cx="4" cy="8" r="1.5" fill="currentColor"/><circle cx="10" cy="8" r="1.5" fill="currentColor"/><circle cx="16" cy="8" r="1.5" fill="currentColor"/></svg>';
    if (this.readOnly) {
      moveHandle.style.visibility = 'hidden';
    }

    const content = createElement('div', 'wema-note-content');
    content.innerHTML = isPlainText(note.text) ? escapeHtml(note.text) : sanitizeHtml(note.text);

    // Track if content was actually edited (prevents false diffs from browser innerHTML normalization)
    let dirty = false;
    content.addEventListener('input', () => {
      dirty = true;
      this.measure(note.id);
    });

    // Handle blur to commit text edits
    content.addEventListener('blur', () => {
      if (!dirty) return;
      dirty = false;
      this.syncNoteContent(note.id);
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
          this.syncNoteContent(note.id);
        }, 0);
        return;
      }

      // Link click handler — open in a new tab unless onLinkClick handles it
      if (target.tagName === 'A' || target.closest('a')) {
        const linkEl = (target.tagName === 'A' ? target : target.closest('a')) as HTMLAnchorElement;
        e.preventDefault();
        // The hook and window.open both get the resolved URL, never the raw
        // attribute: "//host/path" or "/\host" look like paths but lead to
        // another site. A link that does not pass the check opens nothing.
        const href = linkEl.getAttribute('href');
        const url = href ? resolveSafeUrl(href) : null;
        if (url && this.onLinkClick?.(url, e) !== true) {
          window.open(url, '_blank', 'noopener');
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

    // Tab / Shift+Tab in a list: indent / outdent the items
    content.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.key !== 'Tab' || e.isComposing || e.ctrlKey || e.metaKey || e.altKey) return;
      if (!this.isEditable(note.id)) return;
      const range = getSelectionRange(content);
      if (!range || !isInListItem(content, range)) return;
      // Inside a list the key never moves the focus, even when the item cannot move
      e.preventDefault();
      const move = e.shiftKey ? outdentListItems : indentListItems;
      this.editContent(note.id, (el, at) => at && move(el, at));
    });

    // Enter key in checklist: insert new TODO item
    content.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.key !== 'Enter' || e.isComposing) return;
      if (!this.isEditable(note.id)) return;
      const sel = document.getSelection();
      if (!sel || sel.rangeCount === 0) return;
      const li = (sel.anchorNode?.nodeType === Node.TEXT_NODE
        ? sel.anchorNode.parentElement : sel.anchorNode as HTMLElement)?.closest('li');
      // Look at the list the item is in: a checklist may hold a plain sub-list
      if (!li || !li.parentElement || getListType(li.parentElement) !== 'checklist') return;

      e.preventDefault();
      const newLi = createListItem('checklist');
      newLi.appendChild(document.createTextNode(' '));

      // Split text after caret into new item
      const range = sel.getRangeAt(0);
      const afterRange = document.createRange();
      afterRange.setStart(range.endContainer, range.endOffset);
      afterRange.setEndAfter(li.lastChild ?? li);
      const trailing = afterRange.extractContents();
      // Remove the item's own checkbox from extracted contents if any (shouldn't
      // happen, but safety). The checkboxes of a sub-list that comes along stay.
      for (const child of Array.from(trailing.children)) {
        if (child.tagName === 'INPUT' && (child as HTMLInputElement).type === 'checkbox') child.remove();
      }
      newLi.appendChild(trailing);

      li.parentNode?.insertBefore(newLi, li.nextSibling);

      // Set caret after the checkbox in the new item
      const newRange = document.createRange();
      newRange.setStart(newLi, 2); // after checkbox and space text node
      newRange.collapse(true);
      setSelectionRange(newRange);
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

    // Per-side collapse buttons (managed by board via updateNoteCollapseBtns)
    const sides = ['top', 'right', 'bottom', 'left'] as const;
    for (const side of sides) {
      const collapseBtn = createElement('div', 'wema-note-collapse-btn');
      collapseBtn.dataset.side = side;
      collapseBtn.style.display = 'none';
      collapseBtn.addEventListener('pointerdown', (e) => e.stopPropagation());
      collapseBtn.addEventListener('click', (e) => e.stopPropagation());
      el.appendChild(collapseBtn);
    }

    el.appendChild(moveHandle);
    el.appendChild(content);
    // Where the host draws the note (`renderNote` option); shown instead of the content
    el.appendChild(createElement('div', 'wema-note-custom'));
    el.appendChild(anchors);
    el.appendChild(resizeHandle);

    this.applyStyles(el, note);
    this.layerEl.appendChild(el);
    this.elements.set(note.id, el);
    this.applyEditable(note.id);
    this.drawByHost(note);
  }

  /**
   * Apply a note's state to its element. The content is only rendered again
   * when `textChanged`: the model text may differ from the element's innerHTML
   * (which the browser normalizes), and rendering on every move would rebuild
   * the content, reloading its images and embeds.
   */
  private updateNoteElement(note: WemaNote, textChanged: boolean): void {
    const el = this.elements.get(note.id);
    if (!el) return;
    this.applyStyles(el, note);
    const content = el.querySelector('.wema-note-content') as HTMLElement | null;
    if (textChanged && content && content.innerHTML !== note.text && document.activeElement !== content) {
      content.innerHTML = isPlainText(note.text) ? escapeHtml(note.text) : sanitizeHtml(note.text);
    }
    // After CSS layout, sync measured size back to model for autoSize notes
    if (note.autoSize) {
      requestAnimationFrame(() => this.measure(note.id));
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
    el.classList.toggle(AUTO_SIZE_CLASS, !!note.autoSize);
  }
}
