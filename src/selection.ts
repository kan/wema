import type { NoteId, WemaEventMap } from './types.js';
import { EventEmitter } from './events.js';
import { NoteManager } from './note.js';

export class SelectionManager {
  private selected = new Set<NoteId>();
  private noteManager: NoteManager;
  private emitter: EventEmitter<WemaEventMap>;
  private boardEl: HTMLElement;

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
    for (const id of this.selected) {
      const el = this.noteManager.getElement(id);
      el?.classList.remove('wema-note-selected');
    }
    this.selected.clear();
  }

  destroy(): void {
    this.clear();
  }
}
