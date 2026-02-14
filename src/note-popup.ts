import type { NoteId } from './types.js';
import { NoteManager } from './note.js';
import { createElement } from './utils/dom.js';

const NOTE_COLORS: { hex: string; name: string }[] = [
  { hex: '#FFF9C4', name: 'Butter' },
  { hex: '#FFCDD2', name: 'Rose' },
  { hex: '#FFE0B2', name: 'Peach' },
  { hex: '#E1BEE7', name: 'Lavender' },
  { hex: '#BBDEFB', name: 'Sky' },
  { hex: '#B2DFDB', name: 'Mint' },
  { hex: '#C8E6C9', name: 'Sage' },
  { hex: '#F5F5F5', name: 'Gray' },
];

const DUPLICATE_ICON = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';

const TRASH_ICON = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>';

export class NoteStylePopup {
  private popupEl: HTMLElement;
  private boardEl: HTMLElement;
  private noteManager: NoteManager;
  private onColorChange: (noteId: NoteId, color: string) => void;
  private onDuplicate: (noteId: NoteId) => void;
  private onDelete: (noteId: NoteId) => void;
  private currentNoteId: NoteId | null = null;

  constructor(options: {
    boardEl: HTMLElement;
    noteManager: NoteManager;
    onColorChange: (noteId: NoteId, color: string) => void;
    onDuplicate: (noteId: NoteId) => void;
    onDelete: (noteId: NoteId) => void;
  }) {
    this.boardEl = options.boardEl;
    this.noteManager = options.noteManager;
    this.onColorChange = options.onColorChange;
    this.onDuplicate = options.onDuplicate;
    this.onDelete = options.onDelete;

    this.popupEl = createElement('div', 'wema-note-popup');
    this.popupEl.style.display = 'none';
    this.boardEl.appendChild(this.popupEl);
  }

  show(noteId: NoteId): void {
    const note = this.noteManager.getNote(noteId);
    if (!note) return;

    this.currentNoteId = noteId;
    this.popupEl.innerHTML = '';

    // Actions row
    const actions = createElement('div', 'wema-note-popup-actions');

    // Color swatch button
    const colorBtn = createElement('button', 'wema-popup-btn wema-note-popup-color-btn') as HTMLButtonElement;
    colorBtn.style.backgroundColor = note.color;
    colorBtn.title = 'Color';
    colorBtn.addEventListener('click', () => {
      const isVisible = colorGrid.style.display !== 'none';
      colorGrid.style.display = isVisible ? 'none' : '';
    });

    // Duplicate button
    const dupBtn = createElement('button', 'wema-popup-btn') as HTMLButtonElement;
    dupBtn.innerHTML = DUPLICATE_ICON;
    dupBtn.title = 'Duplicate';
    dupBtn.addEventListener('click', () => {
      if (!this.currentNoteId) return;
      const id = this.currentNoteId;
      this.hide();
      this.onDuplicate(id);
    });

    // Delete button
    const delBtn = createElement('button', 'wema-popup-btn wema-popup-btn-delete') as HTMLButtonElement;
    delBtn.innerHTML = TRASH_ICON;
    delBtn.title = 'Delete';
    delBtn.addEventListener('click', () => {
      if (!this.currentNoteId) return;
      const id = this.currentNoteId;
      this.hide();
      this.onDelete(id);
    });

    actions.appendChild(colorBtn);
    actions.appendChild(dupBtn);
    actions.appendChild(delBtn);

    // Color grid (hidden by default)
    const colorGrid = createElement('div', 'wema-note-popup-colors');
    colorGrid.style.display = 'none';
    for (const color of NOTE_COLORS) {
      const swatch = createElement('button', 'wema-color-swatch') as HTMLButtonElement;
      swatch.style.backgroundColor = color.hex;
      swatch.title = color.name;
      if (note.color.toUpperCase() === color.hex) {
        swatch.classList.add('active');
      }
      swatch.addEventListener('click', () => {
        if (!this.currentNoteId) return;
        this.onColorChange(this.currentNoteId, color.hex);
        // Update swatch preview and active state
        colorBtn.style.backgroundColor = color.hex;
        colorGrid.querySelectorAll('.wema-color-swatch').forEach(s => s.classList.remove('active'));
        swatch.classList.add('active');
      });
      colorGrid.appendChild(swatch);
    }

    this.popupEl.appendChild(actions);
    this.popupEl.appendChild(colorGrid);

    // Position below the note, centered horizontally
    this.popupEl.style.left = `${note.x + note.width / 2}px`;
    this.popupEl.style.top = `${note.y + note.height + 8}px`;
    this.popupEl.style.display = '';
  }

  hide(): void {
    this.popupEl.style.display = 'none';
    this.currentNoteId = null;
  }

  destroy(): void {
    this.popupEl.remove();
  }
}
