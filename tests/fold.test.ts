import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { WemaBoard } from '../src/board';
import type { WemaBoardOptions, WemaEventMap } from '../src/types';

describe('foldable notes', () => {
  let container: HTMLElement;
  let board: WemaBoard;

  function createBoard(options: Partial<WemaBoardOptions> = {}): void {
    board?.destroy();
    board = new WemaBoard({ container, ...options });
  }

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    createBoard();
  });

  afterEach(() => {
    board.destroy();
    container.remove();
  });

  // Helper to flush microtask-based batch commit
  const flush = () => Promise.resolve();

  const noteEl = (noteId: string): HTMLElement =>
    container.querySelector(`[data-note-id="${noteId}"]`) as HTMLElement;
  const contentOf = (noteId: string): HTMLElement =>
    noteEl(noteId).querySelector('.wema-note-content') as HTMLElement;
  const linkOf = (noteId: string): HTMLButtonElement =>
    noteEl(noteId).querySelector('.wema-note-fold-toggle') as HTMLButtonElement;
  const hasClass = (noteId: string, name: string): boolean => noteEl(noteId).classList.contains(name);

  /**
   * jsdom does no layout. Without the style sheet, a line counts as 22.4px
   * (1.4 times its default font size of 16px), and a text is long from 56px
   * (two and a half lines) on: 200px is long, 40px is not.
   */
  const LONG = 200;
  const SHORT = 40;

  /** Make the text of a note report this height, and the note this rendered height by state */
  function setLayout(noteId: string, textHeight: number, heights = { open: 220, closed: 100 }): void {
    Object.defineProperty(contentOf(noteId), 'scrollHeight', { value: textHeight, configurable: true });
    const el = noteEl(noteId);
    Object.defineProperty(el, 'offsetWidth', { get: () => parseFloat(el.style.width), configurable: true });
    Object.defineProperty(el, 'offsetHeight', {
      get: () => (el.classList.contains('wema-folded') ? heights.closed : heights.open),
      configurable: true,
    });
  }

  /** A foldable note whose text has the given height, measured */
  function addFoldable(textHeight: number): string {
    const note = board.addNote({ text: 'text', width: 200, height: 150 });
    setLayout(note.id, textHeight);
    board.updateNote(note.id, { foldable: true });
    return note.id;
  }

  /** Drag the resize handle of a note by (dx, dy) */
  function resizeBy(noteId: string, dx: number, dy: number): void {
    // jsdom has no pointer capture
    HTMLElement.prototype.setPointerCapture ??= () => {};
    HTMLElement.prototype.releasePointerCapture ??= () => {};
    const boardEl = container.querySelector('.wema-board') as HTMLElement;
    const pointer = (type: string, target: Element, clientX: number, clientY: number): void => {
      target.dispatchEvent(new PointerEvent(type, {
        bubbles: true, cancelable: true, pointerId: 1, button: 0, clientX, clientY,
      }));
    };
    pointer('pointerdown', noteEl(noteId).querySelector('.wema-resize-handle')!, 300, 300);
    pointer('pointermove', boardEl, 300 + dx, 300 + dy);
    pointer('pointerup', boardEl, 300 + dx, 300 + dy);
  }

  function record<K extends keyof WemaEventMap>(event: K): WemaEventMap[K][] {
    const payloads: WemaEventMap[K][] = [];
    board.on(event, (p) => payloads.push(p));
    return payloads;
  }

  describe('the flag', () => {
    it('is kept in the note and in the exported data', () => {
      const note = board.addNote({ text: 'a', foldable: true });
      expect(board.getNote(note.id)?.foldable).toBe(true);
      expect(board.exportData().notes[0].foldable).toBe(true);
      expect(hasClass(note.id, 'wema-foldable')).toBe(true);

      const plain = board.addNote({ text: 'b' });
      expect('foldable' in board.getNote(plain.id)!).toBe(false);
    });

    it('survives export and import', () => {
      board.addNote({ text: 'a', foldable: true });
      const data = board.exportData();
      createBoard({ data });
      expect(board.getNotes()[0].foldable).toBe(true);
    });

    it('is undone and redone', async () => {
      const note = board.addNote({ text: 'a' });
      await flush();
      board.updateNote(note.id, { foldable: true });
      await flush();
      board.undo();
      expect(board.getNote(note.id)?.foldable).toBeFalsy();
      expect(hasClass(note.id, 'wema-foldable')).toBe(false);
      board.redo();
      expect(board.getNote(note.id)?.foldable).toBe(true);
    });
  });

  describe('a long text', () => {
    it('is shown closed, with the link that opens it', () => {
      const id = addFoldable(LONG);
      expect(hasClass(id, 'wema-fold-long')).toBe(true);
      expect(hasClass(id, 'wema-folded')).toBe(true);
      expect(linkOf(id).textContent).toBe('Read more');
    });

    it('takes the height the closed note has', () => {
      const id = addFoldable(LONG);
      expect(board.getNote(id)).toEqual(expect.objectContaining({ width: 200, height: 100 }));
    });

    it('reports the flag and the resulting height as one update', async () => {
      const note = board.addNote({ text: 'text', width: 200, height: 150 });
      setLayout(note.id, LONG);
      await flush();
      const updates = record('note:update');
      const commits = record('history:commit');

      board.updateNote(note.id, { foldable: true });
      await flush();
      expect(updates).toHaveLength(1);
      expect(updates[0].prev).toEqual(expect.objectContaining({ height: 150 }));
      expect(updates[0].note).toEqual(expect.objectContaining({ foldable: true, height: 100 }));
      expect(commits).toHaveLength(1);
    });

    it('uses the texts of the foldLabels option', () => {
      createBoard({ foldLabels: { more: '続きを読む', less: '折り畳む' } });
      const id = addFoldable(LONG);
      expect(linkOf(id).textContent).toBe('続きを読む');
      linkOf(id).click();
      expect(linkOf(id).textContent).toBe('折り畳む');
    });
  });

  describe('a short text', () => {
    it('is shown as usual, without the link', () => {
      const id = addFoldable(SHORT);
      expect(hasClass(id, 'wema-fold-long')).toBe(false);
      expect(hasClass(id, 'wema-folded')).toBe(false);
    });

    it('folds once it becomes long', () => {
      const id = addFoldable(SHORT);
      setLayout(id, LONG);
      board.updateNote(id, { text: 'a longer text' });
      expect(hasClass(id, 'wema-folded')).toBe(true);
    });
  });

  describe('opening and closing', () => {
    it('the link opens the note and closes it again', () => {
      const id = addFoldable(LONG);
      linkOf(id).click();
      expect(hasClass(id, 'wema-folded')).toBe(false);
      expect(hasClass(id, 'wema-fold-long')).toBe(true);
      expect(linkOf(id).textContent).toBe('Show less');
      expect(board.getNote(id)?.height).toBe(220);

      linkOf(id).click();
      expect(hasClass(id, 'wema-folded')).toBe(true);
      expect(board.getNote(id)?.height).toBe(100);
    });

    it('is not an operation: no note event, no history, only change', async () => {
      const id = addFoldable(LONG);
      await flush();
      const updates = record('note:update');
      const commits = record('history:commit');
      const changes = record('change');
      const selections = record('note:select');

      linkOf(id).click();
      await flush();
      expect(updates).toHaveLength(0);
      expect(commits).toHaveLength(0);
      expect(selections).toHaveLength(0);
      expect(changes).toHaveLength(1);
      expect(changes[0].data.notes[0].height).toBe(220);
    });

    it('is not part of the data: an imported board starts closed', () => {
      const id = addFoldable(LONG);
      linkOf(id).click();
      const data = board.exportData();
      expect(Object.keys(data.notes[0]).sort()).toEqual(
        ['color', 'foldable', 'height', 'id', 'text', 'width', 'x', 'y', 'zIndex']);

      board.importData(data);
      setLayout(id, LONG);
      board.refreshNote(id);
      expect(hasClass(id, 'wema-folded')).toBe(true);
    });

    it('works in readOnly and viewOnly mode', () => {
      const id = addFoldable(LONG);
      board.setReadOnly(true);
      linkOf(id).click();
      expect(hasClass(id, 'wema-folded')).toBe(false);
      board.setReadOnly(false);
      board.setViewOnly(true);
      linkOf(id).click();
      expect(hasClass(id, 'wema-folded')).toBe(true);
    });

    it('a note is shown open while its text is edited', () => {
      const id = addFoldable(LONG);
      contentOf(id).dispatchEvent(new Event('focus'));
      expect(hasClass(id, 'wema-folded')).toBe(false);
      expect(board.getNote(id)?.height).toBe(220);

      contentOf(id).dispatchEvent(new Event('blur'));
      expect(hasClass(id, 'wema-folded')).toBe(true);
      expect(board.getNote(id)?.height).toBe(100);
    });

    it('the link closes a note that is open only because it is edited', () => {
      const id = addFoldable(LONG);
      contentOf(id).dispatchEvent(new Event('focus'));
      expect(linkOf(id).textContent).toBe('Show less');

      linkOf(id).click();
      expect(hasClass(id, 'wema-folded')).toBe(true);
      // It is closed for good: the link opens it again
      linkOf(id).click();
      expect(hasClass(id, 'wema-folded')).toBe(false);
    });

    it('editing without a change reports nothing, although the note opened and closed', async () => {
      const id = addFoldable(LONG);
      await flush();
      const updates = record('note:update');

      contentOf(id).dispatchEvent(new Event('focus'));
      contentOf(id).dispatchEvent(new Event('input'));
      contentOf(id).dispatchEvent(new Event('blur'));
      await flush();
      expect(updates).toHaveLength(0);

      // And nothing is left over for the next update
      board.updateNote(id, { x: 10 });
      expect(updates).toHaveLength(1);
      expect(updates[0].prev.height).toBe(updates[0].note.height);
    });

    it('a hidden note keeps its state, and is measured when it is shown again', () => {
      const id = addFoldable(LONG);
      board.setNoteFilter([]);
      // Not laid out while hidden
      Object.defineProperty(contentOf(id), 'scrollHeight', { value: 0, configurable: true });
      Object.defineProperty(noteEl(id), 'offsetWidth', { value: 0, configurable: true });
      Object.defineProperty(noteEl(id), 'offsetHeight', { value: 0, configurable: true });
      board.updateNote(id, { text: 'changed while hidden' });
      expect(hasClass(id, 'wema-folded')).toBe(true);
      expect(board.getNote(id)?.height).toBe(100);

      setLayout(id, LONG, { open: 240, closed: 120 });
      board.setNoteFilter(null);
      expect(hasClass(id, 'wema-folded')).toBe(true);
      expect(board.getNote(id)?.height).toBe(120);
    });

    it('a note the user opened stays open after it was edited', () => {
      const id = addFoldable(LONG);
      linkOf(id).click();
      contentOf(id).dispatchEvent(new Event('focus'));
      contentOf(id).dispatchEvent(new Event('blur'));
      expect(hasClass(id, 'wema-folded')).toBe(false);
    });
  });

  describe('turning the flag off', () => {
    it('shows the note as usual, with the height of its whole text', () => {
      const id = addFoldable(LONG);
      board.updateNote(id, { foldable: false });
      expect(hasClass(id, 'wema-foldable')).toBe(false);
      expect(hasClass(id, 'wema-fold-long')).toBe(false);
      expect(hasClass(id, 'wema-folded')).toBe(false);
      expect(board.getNote(id)?.height).toBe(220);
      expect(noteEl(id).style.height).toBe('220px');
    });

    it('a note made foldable again starts closed', () => {
      const id = addFoldable(LONG);
      linkOf(id).click();
      board.updateNote(id, { foldable: false });
      board.updateNote(id, { foldable: true });
      expect(hasClass(id, 'wema-folded')).toBe(true);
    });
  });

  describe('with other features', () => {
    it('a note the host draws is not folded', () => {
      createBoard({
        renderNote: (note, el) => {
          if (!note.meta?.page) return false;
          el.textContent = 'drawn';
          return true;
        },
      });
      const note = board.addNote({ text: 'text', width: 200, height: 150, meta: { page: 'p' } });
      setLayout(note.id, LONG);
      board.updateNote(note.id, { foldable: true });
      expect(hasClass(note.id, 'wema-fold-long')).toBe(false);
      expect(hasClass(note.id, 'wema-folded')).toBe(false);

      // Its height is still its own (the style sheet leaves it as set): the
      // handle resizes both sides
      const el = noteEl(note.id);
      Object.defineProperty(el, 'offsetHeight', { get: () => parseFloat(el.style.height), configurable: true });
      const before = board.getNote(note.id)!.height;
      resizeBy(note.id, 50, 80);
      expect(board.getNote(note.id)).toEqual(expect.objectContaining({ width: 250, height: before + 80 }));
    });

    it('the copy of a duplicated note is foldable too', () => {
      const note = board.addNote({ text: 'a', foldable: true });
      // jsdom has no layout: the board asks which edge is under the pointer
      document.elementsFromPoint ??= () => [];
      noteEl(note.id).dispatchEvent(new MouseEvent('click', { bubbles: true }));
      (container.querySelector('.wema-note-popup button[title="Duplicate"]') as HTMLElement).click();
      const copy = board.getNotes().find((n) => n.id !== note.id)!;
      expect(copy.foldable).toBe(true);
    });

    it('the popup button turns the flag on and off', () => {
      const note = board.addNote({ text: 'a' });
      document.elementsFromPoint ??= () => [];
      noteEl(note.id).dispatchEvent(new MouseEvent('click', { bubbles: true }));
      const button = (): HTMLElement =>
        container.querySelector('.wema-note-popup button[title="Fold Long Text"]') as HTMLElement;

      expect(button().classList.contains('active')).toBe(false);
      button().click();
      expect(board.getNote(note.id)?.foldable).toBe(true);
      expect(button().classList.contains('active')).toBe(true);
      button().click();
      expect(board.getNote(note.id)?.foldable).toBe(false);
    });

    it('resizing by the handle changes the width only', () => {
      const id = addFoldable(LONG);
      resizeBy(id, 50, 80);
      expect(board.getNote(id)).toEqual(expect.objectContaining({ width: 250, height: 100 }));
    });
  });
});
