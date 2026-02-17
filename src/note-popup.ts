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

const LIST_UL_ICON = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><circle cx="3" cy="6" r="1.5" fill="currentColor" stroke="none"/><circle cx="3" cy="12" r="1.5" fill="currentColor" stroke="none"/><circle cx="3" cy="18" r="1.5" fill="currentColor" stroke="none"/></svg>';

const LIST_OL_ICON = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="10" y1="6" x2="21" y2="6"/><line x1="10" y1="12" x2="21" y2="12"/><line x1="10" y1="18" x2="21" y2="18"/><text x="2" y="8" font-size="8" fill="currentColor" stroke="none" font-family="sans-serif">1</text><text x="2" y="14" font-size="8" fill="currentColor" stroke="none" font-family="sans-serif">2</text><text x="2" y="20" font-size="8" fill="currentColor" stroke="none" font-family="sans-serif">3</text></svg>';

const CHECKBOX_ICON = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><polyline points="9 11 12 14 22 4" stroke-width="2"/></svg>';

const IMAGE_ICON = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>';

const EMBED_ICON = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>';

const AUTO_SIZE_ICON = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/></svg>';

export class NoteStylePopup {
  private popupEl: HTMLElement;
  private boardEl: HTMLElement;
  private noteManager: NoteManager;
  private onColorChange: (noteId: NoteId, color: string) => void;
  private onMultiColorChange: (noteIds: NoteId[], color: string) => void;
  private onDuplicate: (noteId: NoteId) => void;
  private onDelete: (noteId: NoteId) => void;
  private onMultiDelete: (noteIds: NoteId[]) => void;
  private onInsertImage: ((noteId: NoteId) => void) | null = null;
  private onInsertEmbed: ((noteId: NoteId) => void) | null = null;
  private onAutoSizeToggle: ((noteId: NoteId) => void) | null = null;
  private onMultiAutoSizeToggle: ((noteIds: NoteId[]) => void) | null = null;
  private currentNoteId: NoteId | null = null;
  private currentNoteIds: NoteId[] | null = null;

  constructor(options: {
    boardEl: HTMLElement;
    noteManager: NoteManager;
    onColorChange: (noteId: NoteId, color: string) => void;
    onMultiColorChange: (noteIds: NoteId[], color: string) => void;
    onDuplicate: (noteId: NoteId) => void;
    onDelete: (noteId: NoteId) => void;
    onMultiDelete: (noteIds: NoteId[]) => void;
    onInsertImage?: (noteId: NoteId) => void;
    onInsertEmbed?: (noteId: NoteId) => void;
    onAutoSizeToggle?: (noteId: NoteId) => void;
    onMultiAutoSizeToggle?: (noteIds: NoteId[]) => void;
  }) {
    this.boardEl = options.boardEl;
    this.noteManager = options.noteManager;
    this.onColorChange = options.onColorChange;
    this.onMultiColorChange = options.onMultiColorChange;
    this.onDuplicate = options.onDuplicate;
    this.onDelete = options.onDelete;
    this.onMultiDelete = options.onMultiDelete;
    this.onInsertImage = options.onInsertImage ?? null;
    this.onInsertEmbed = options.onInsertEmbed ?? null;
    this.onAutoSizeToggle = options.onAutoSizeToggle ?? null;
    this.onMultiAutoSizeToggle = options.onMultiAutoSizeToggle ?? null;

    this.popupEl = createElement('div', 'wema-note-popup');
    this.popupEl.style.display = 'none';
    this.popupEl.addEventListener('click', (e) => e.stopPropagation());
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

    // Auto-size toggle button
    const autoSizeBtn = createElement('button', 'wema-popup-btn') as HTMLButtonElement;
    autoSizeBtn.innerHTML = AUTO_SIZE_ICON;
    autoSizeBtn.title = 'Auto Size';
    if (note.autoSize) autoSizeBtn.classList.add('active');
    autoSizeBtn.addEventListener('click', () => {
      if (!this.currentNoteId) return;
      this.onAutoSizeToggle?.(this.currentNoteId);
    });

    actions.appendChild(colorBtn);
    actions.appendChild(autoSizeBtn);
    actions.appendChild(dupBtn);
    actions.appendChild(delBtn);

    // Rich text actions row
    const richActions = createElement('div', 'wema-note-popup-actions');

    const ulBtn = createElement('button', 'wema-popup-btn') as HTMLButtonElement;
    ulBtn.innerHTML = LIST_UL_ICON;
    ulBtn.title = 'Bulleted List';
    ulBtn.addEventListener('click', () => {
      if (!this.currentNoteId) return;
      this.toggleList(this.currentNoteId, 'ul');
    });

    const olBtn = createElement('button', 'wema-popup-btn') as HTMLButtonElement;
    olBtn.innerHTML = LIST_OL_ICON;
    olBtn.title = 'Numbered List';
    olBtn.addEventListener('click', () => {
      if (!this.currentNoteId) return;
      this.toggleList(this.currentNoteId, 'ol');
    });

    const cbBtn = createElement('button', 'wema-popup-btn') as HTMLButtonElement;
    cbBtn.innerHTML = CHECKBOX_ICON;
    cbBtn.title = 'Checklist';
    cbBtn.addEventListener('click', () => {
      if (!this.currentNoteId) return;
      this.toggleList(this.currentNoteId, 'checklist');
    });

    const imgBtn = createElement('button', 'wema-popup-btn') as HTMLButtonElement;
    imgBtn.innerHTML = IMAGE_ICON;
    imgBtn.title = 'Image';
    imgBtn.addEventListener('click', () => {
      if (!this.currentNoteId) return;
      this.onInsertImage?.(this.currentNoteId);
    });

    const embedBtn = createElement('button', 'wema-popup-btn') as HTMLButtonElement;
    embedBtn.innerHTML = EMBED_ICON;
    embedBtn.title = 'Embed';
    embedBtn.addEventListener('click', () => {
      if (!this.currentNoteId) return;
      this.onInsertEmbed?.(this.currentNoteId);
    });

    richActions.appendChild(ulBtn);
    richActions.appendChild(olBtn);
    richActions.appendChild(cbBtn);
    richActions.appendChild(imgBtn);
    richActions.appendChild(embedBtn);

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
    this.popupEl.appendChild(richActions);
    this.popupEl.appendChild(colorGrid);

    // Position below the note, centered horizontally
    this.popupEl.style.left = `${note.x + note.width / 2}px`;
    this.popupEl.style.top = `${note.y + note.height + 8}px`;
    this.popupEl.style.display = '';
  }

  /** Show popup for multiple selected notes (color change + bulk delete) */
  showMulti(noteIds: NoteId[]): void {
    const notes = noteIds
      .map((id) => this.noteManager.getNote(id))
      .filter((n) => n != null);
    if (notes.length < 2) return;

    this.currentNoteId = null;
    this.currentNoteIds = noteIds.slice();
    this.popupEl.innerHTML = '';

    // Actions row
    const actions = createElement('div', 'wema-note-popup-actions');

    // Color swatch button (show mixed indicator)
    const colorBtn = createElement('button', 'wema-popup-btn wema-note-popup-color-btn') as HTMLButtonElement;
    const allSameColor = notes.every((n) => n.color === notes[0].color);
    colorBtn.style.backgroundColor = allSameColor ? notes[0].color : '#ccc';
    colorBtn.title = 'Color';
    colorBtn.addEventListener('click', () => {
      const isVisible = colorGrid.style.display !== 'none';
      colorGrid.style.display = isVisible ? 'none' : '';
    });

    // Auto-size toggle button
    const allAutoSize = notes.every((n) => n.autoSize);
    const autoSizeBtn = createElement('button', 'wema-popup-btn') as HTMLButtonElement;
    autoSizeBtn.innerHTML = AUTO_SIZE_ICON;
    autoSizeBtn.title = 'Auto Size';
    if (allAutoSize) autoSizeBtn.classList.add('active');
    autoSizeBtn.addEventListener('click', () => {
      if (!this.currentNoteIds) return;
      this.onMultiAutoSizeToggle?.(this.currentNoteIds.slice());
    });

    // Delete button
    const delBtn = createElement('button', 'wema-popup-btn wema-popup-btn-delete') as HTMLButtonElement;
    delBtn.innerHTML = TRASH_ICON;
    delBtn.title = `Delete ${notes.length} notes`;
    delBtn.addEventListener('click', () => {
      if (!this.currentNoteIds) return;
      const ids = this.currentNoteIds.slice();
      this.hide();
      this.onMultiDelete(ids);
    });

    actions.appendChild(colorBtn);
    actions.appendChild(autoSizeBtn);
    actions.appendChild(delBtn);

    // Color grid (hidden by default)
    const colorGrid = createElement('div', 'wema-note-popup-colors');
    colorGrid.style.display = 'none';
    for (const color of NOTE_COLORS) {
      const swatch = createElement('button', 'wema-color-swatch') as HTMLButtonElement;
      swatch.style.backgroundColor = color.hex;
      swatch.title = color.name;
      if (allSameColor && notes[0].color.toUpperCase() === color.hex) {
        swatch.classList.add('active');
      }
      swatch.addEventListener('click', () => {
        if (!this.currentNoteIds) return;
        this.onMultiColorChange(this.currentNoteIds, color.hex);
        colorBtn.style.backgroundColor = color.hex;
        colorGrid.querySelectorAll('.wema-color-swatch').forEach((s) => s.classList.remove('active'));
        swatch.classList.add('active');
      });
      colorGrid.appendChild(swatch);
    }

    this.popupEl.appendChild(actions);
    this.popupEl.appendChild(colorGrid);

    // Position at the center-bottom of the bounding box of all selected notes
    const minX = Math.min(...notes.map((n) => n.x));
    const maxX = Math.max(...notes.map((n) => n.x + n.width));
    const maxY = Math.max(...notes.map((n) => n.y + n.height));
    this.popupEl.style.left = `${(minX + maxX) / 2}px`;
    this.popupEl.style.top = `${maxY + 8}px`;
    this.popupEl.style.display = '';
  }

  hide(): void {
    this.popupEl.style.display = 'none';
    this.currentNoteId = null;
    this.currentNoteIds = null;
  }

  destroy(): void {
    this.popupEl.remove();
  }

  /** Toggle or convert list type (ul / ol / checklist) in a note's content.
   *  Only affects the list at the caret position. If caret is outside a list,
   *  inserts a new list at the end. */
  private toggleList(noteId: NoteId, listType: 'ul' | 'ol' | 'checklist'): void {
    const noteEl = this.noteManager.getElement(noteId);
    if (!noteEl) return;
    const content = noteEl.querySelector('.wema-note-content') as HTMLElement | null;
    if (!content) return;

    // Try to find the list at the current caret position
    const caretList = this.findCaretList(content);

    if (caretList) {
      // Convert this specific list if it's a different type
      if (this.getListType(caretList) === listType) return; // already same type
      const newList = this.convertList(caretList, listType);
      caretList.parentNode?.replaceChild(newList, caretList);
    } else {
      // No list at caret — append a new one
      content.focus();
      content.appendChild(this.createNewList(listType));
    }

    // Update model directly so updateNoteElement won't overwrite the DOM
    // (dispatching 'input' only sets dirty without syncing the model)
    this.noteManager.updateNote(noteId, { text: content.innerHTML });
  }

  /** Find the closest ul/ol ancestor of the caret within the content element */
  private findCaretList(content: HTMLElement): HTMLElement | null {
    const sel = document.getSelection();
    if (!sel || sel.rangeCount === 0) return null;
    const node = sel.anchorNode;
    if (!node || !content.contains(node)) return null;
    const el = node.nodeType === Node.TEXT_NODE ? node.parentElement : node as HTMLElement;
    const list = el?.closest('ul, ol');
    if (list && content.contains(list)) return list as HTMLElement;
    return null;
  }

  /** Determine the logical list type of a DOM list element */
  private getListType(list: Element): 'ul' | 'ol' | 'checklist' {
    if (list.tagName === 'OL') return 'ol';
    if (list.classList.contains('wema-checklist')) return 'checklist';
    return 'ul';
  }

  /** Create a new empty list of the given type */
  private createNewList(listType: 'ul' | 'ol' | 'checklist'): HTMLElement {
    const tag = listType === 'ol' ? 'ol' : 'ul';
    const list = document.createElement(tag);
    const li = document.createElement('li');
    if (listType === 'checklist') {
      list.classList.add('wema-checklist');
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      li.appendChild(cb);
      li.appendChild(document.createTextNode(' Todo'));
    } else {
      li.textContent = 'Item';
    }
    list.appendChild(li);
    return list;
  }

  /** Convert a list element to a different list type, preserving items */
  private convertList(oldList: HTMLElement, listType: 'ul' | 'ol' | 'checklist'): HTMLElement {
    const tag = listType === 'ol' ? 'ol' : 'ul';
    const newList = document.createElement(tag);
    const wasChecklist = oldList.classList.contains('wema-checklist');

    if (listType === 'checklist') {
      newList.classList.add('wema-checklist');
    }

    // Move children and adjust checkbox presence
    for (const child of Array.from(oldList.children)) {
      if (child.tagName !== 'LI') { newList.appendChild(child); continue; }
      const li = child as HTMLElement;

      if (wasChecklist && listType !== 'checklist') {
        // Remove checkboxes
        const cb = li.querySelector('input[type="checkbox"]');
        if (cb) cb.remove();
        li.classList.remove('wema-checked');
      } else if (!wasChecklist && listType === 'checklist') {
        // Add checkboxes
        const cb = document.createElement('input');
        cb.type = 'checkbox';
        li.insertBefore(cb, li.firstChild);
      }
      newList.appendChild(li);
    }
    return newList;
  }

  /** Insert block HTML content at the end of a note's content */
  private insertBlockContent(noteId: NoteId, html: string): void {
    const noteEl = this.noteManager.getElement(noteId);
    if (!noteEl) return;
    const content = noteEl.querySelector('.wema-note-content') as HTMLElement | null;
    if (!content) return;

    content.focus();
    // Append to end
    const temp = document.createElement('div');
    temp.innerHTML = html;
    while (temp.firstChild) {
      content.appendChild(temp.firstChild);
    }
    // Update model directly so updateNoteElement won't overwrite the DOM
    this.noteManager.updateNote(noteId, { text: content.innerHTML });
  }
}
