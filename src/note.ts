import type { NoteId, WemaNote, WemaEventMap } from './types.js';
import { EventEmitter } from './events.js';
import { generateId } from './utils/id.js';
import { createElement, setStyles } from './utils/dom.js';

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

  constructor(options: NoteManagerOptions) {
    this.boardEl = options.boardEl;
    this.emitter = options.emitter;
    this.defaultWidth = options.defaultWidth;
    this.defaultHeight = options.defaultHeight;
    this.defaultColor = options.defaultColor;
    this.readOnly = options.readOnly;
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
        moveHandle.style.display = readOnly ? 'none' : '';
      }
    }
  }

  /** Flush any in-progress contenteditable edits to internal state */
  flushEditing(): void {
    for (const [id, el] of this.elements) {
      const contentEl = el.querySelector('.wema-note-content') as HTMLElement | null;
      if (!contentEl) continue;
      const note = this.notes.get(id);
      if (note && note.text !== contentEl.textContent) {
        note.text = contentEl.textContent ?? '';
      }
    }
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
      moveHandle.style.display = 'none';
    }

    const content = createElement('div', 'wema-note-content');
    if (!this.readOnly) {
      content.contentEditable = 'true';
    }
    content.textContent = note.text;

    // Handle blur to commit text edits
    content.addEventListener('blur', () => {
      const current = this.notes.get(note.id);
      if (!current) return;
      const newText = content.textContent ?? '';
      if (newText !== current.text) {
        const prev = { ...current };
        current.text = newText;
        this.emitter.emit('note:update', { note: { ...current }, prev });
        this.emitter.emit('change', { data: undefined as never }); // board will handle actual data
      }
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
    if (this.readOnly) {
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
    if (content && content.textContent !== note.text && document.activeElement !== content) {
      content.textContent = note.text;
    }
  }

  private applyStyles(el: HTMLElement, note: WemaNote): void {
    setStyles(el, {
      left: `${note.x}px`,
      top: `${note.y}px`,
      width: `${note.width}px`,
      height: `${note.height}px`,
      backgroundColor: note.color,
      zIndex: String(note.zIndex),
    });
  }
}
