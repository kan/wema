import type { NoteId, WemaEventMap } from './types.js';
import { EventEmitter } from './events.js';
import { NoteManager } from './note.js';
import { createElement } from './utils/dom.js';

export class SelectionManager {
  private selected = new Set<NoteId>();
  private noteManager: NoteManager;
  private emitter: EventEmitter<WemaEventMap>;
  private boardEl: HTMLElement;

  // Rubberband state
  private rubberBandEl: HTMLElement | null = null;
  private rubberBandStart: { x: number; y: number } | null = null;
  private rubberBandActive = false;

  constructor(options: {
    boardEl: HTMLElement;
    noteManager: NoteManager;
    emitter: EventEmitter<WemaEventMap>;
  }) {
    this.boardEl = options.boardEl;
    this.noteManager = options.noteManager;
    this.emitter = options.emitter;
  }

  /** Set the selected note IDs */
  select(noteIds: NoteId[]): void {
    // Clear previous selection visual state
    for (const id of this.selected) {
      const el = this.noteManager.getElement(id);
      el?.classList.remove('wema-note-selected');
    }

    this.selected.clear();
    for (const id of noteIds) {
      if (this.noteManager.getNote(id)) {
        this.selected.add(id);
        const el = this.noteManager.getElement(id);
        el?.classList.add('wema-note-selected');
      }
    }

    this.emitter.emit('note:select', { noteIds: this.getSelection() });
  }

  /** Select all notes */
  selectAll(): void {
    const allIds = this.noteManager.getNotes().map((n) => n.id);
    this.select(allIds);
  }

  /** Get currently selected note IDs */
  getSelection(): NoteId[] {
    return Array.from(this.selected);
  }

  /** Add notes to the existing selection */
  addToSelection(noteIds: NoteId[]): void {
    for (const id of noteIds) {
      if (this.noteManager.getNote(id) && !this.selected.has(id)) {
        this.selected.add(id);
        const el = this.noteManager.getElement(id);
        el?.classList.add('wema-note-selected');
      }
    }
    this.emitter.emit('note:select', { noteIds: this.getSelection() });
  }

  /** Toggle a note's selection state */
  toggleSelection(noteId: NoteId): void {
    if (this.selected.has(noteId)) {
      this.selected.delete(noteId);
      const el = this.noteManager.getElement(noteId);
      el?.classList.remove('wema-note-selected');
    } else if (this.noteManager.getNote(noteId)) {
      this.selected.add(noteId);
      const el = this.noteManager.getElement(noteId);
      el?.classList.add('wema-note-selected');
    }
    this.emitter.emit('note:select', { noteIds: this.getSelection() });
  }

  /** Remove a note from selection (e.g. when deleted) */
  deselect(noteId: NoteId): void {
    if (this.selected.has(noteId)) {
      this.selected.delete(noteId);
      const el = this.noteManager.getElement(noteId);
      el?.classList.remove('wema-note-selected');
    }
  }

  /** Clear all selections */
  clear(): void {
    if (this.selected.size === 0) return;
    for (const id of this.selected) {
      const el = this.noteManager.getElement(id);
      el?.classList.remove('wema-note-selected');
    }
    this.selected.clear();
    this.emitter.emit('note:select', { noteIds: [] });
  }

  // --- Rubberband selection ---

  /** Start a rubberband selection at the given board-relative coordinates */
  startRubberBand(x: number, y: number): void {
    this.rubberBandStart = { x, y };
    this.rubberBandActive = true;

    this.rubberBandEl = createElement('div', 'wema-rubberband');
    this.rubberBandEl.style.left = `${x}px`;
    this.rubberBandEl.style.top = `${y}px`;
    this.rubberBandEl.style.width = '0';
    this.rubberBandEl.style.height = '0';
    this.boardEl.appendChild(this.rubberBandEl);
  }

  /** Update the rubberband rectangle to the given board-relative coordinates */
  updateRubberBand(x: number, y: number): void {
    if (!this.rubberBandStart || !this.rubberBandEl) return;

    const left = Math.min(x, this.rubberBandStart.x);
    const top = Math.min(y, this.rubberBandStart.y);
    const width = Math.abs(x - this.rubberBandStart.x);
    const height = Math.abs(y - this.rubberBandStart.y);

    this.rubberBandEl.style.left = `${left}px`;
    this.rubberBandEl.style.top = `${top}px`;
    this.rubberBandEl.style.width = `${width}px`;
    this.rubberBandEl.style.height = `${height}px`;

    // Select notes that intersect with the rubberband rect
    const rect = { left, top, right: left + width, bottom: top + height };
    const intersecting: NoteId[] = [];
    for (const note of this.noteManager.getNotes()) {
      const noteRight = note.x + note.width;
      const noteBottom = note.y + note.height;
      if (
        note.x < rect.right &&
        noteRight > rect.left &&
        note.y < rect.bottom &&
        noteBottom > rect.top
      ) {
        intersecting.push(note.id);
      }
    }
    this.select(intersecting);
  }

  /** End the rubberband selection */
  endRubberBand(): void {
    if (this.rubberBandEl) {
      this.rubberBandEl.remove();
      this.rubberBandEl = null;
    }
    this.rubberBandStart = null;
    this.rubberBandActive = false;
  }

  /** Whether a rubberband drag is currently active */
  isRubberBandActive(): boolean {
    return this.rubberBandActive;
  }

  destroy(): void {
    this.endRubberBand();
    this.clear();
  }
}
