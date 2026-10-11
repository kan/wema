import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { WemaBoard } from '../src/board';
import type { WemaEventMap } from '../src/types';

describe('Moving notes', () => {
  let container: HTMLElement;
  let board: WemaBoard;

  beforeEach(() => {
    // The animation runs on frames and reads the clock: both are driven by the test
    vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame', 'performance'] });
    container = document.createElement('div');
    container.style.width = '1200px';
    container.style.height = '800px';
    document.body.appendChild(container);
    board = new WemaBoard({ container });
  });

  afterEach(() => {
    board.destroy();
    container.remove();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  // Helper to flush microtask-based batch commit
  const flush = () => Promise.resolve();

  const noteEl = (id: string) => container.querySelector(`[data-note-id="${id}"]`) as HTMLElement;
  const left = (id: string) => parseFloat(noteEl(id).style.left);
  const pathOf = (edgeId: string) =>
    container.querySelector(`.wema-edge-path[data-edge-id="${edgeId}"]`)!.getAttribute('d');

  function record<K extends keyof WemaEventMap>(event: K): WemaEventMap[K][] {
    const payloads: WemaEventMap[K][] = [];
    board.on(event, (p) => payloads.push(p));
    return payloads;
  }

  describe('moveNotes', () => {
    it('moves and resizes at once without a duration', () => {
      const a = board.addNote({ x: 0, y: 0, width: 200, height: 150 });
      const b = board.addNote({ x: 300, y: 0, width: 200, height: 150 });

      board.moveNotes([{ id: a.id, x: 40, width: 320 }, { id: b.id, y: 500, height: 90 }]);

      expect(board.getNote(a.id)).toMatchObject({ x: 40, y: 0, width: 320, height: 150 });
      expect(board.getNote(b.id)).toMatchObject({ x: 300, y: 500, width: 200, height: 90 });
      expect(noteEl(a.id).style.left).toBe('40px');
      expect(noteEl(a.id).style.width).toBe('320px');
    });

    it('emits one note:update per note and one undo step for all of them', async () => {
      const a = board.addNote({ x: 0, y: 0 });
      const b = board.addNote({ x: 300, y: 0 });
      const c = board.addNote({ x: 600, y: 0 });
      await flush();
      const updates = record('note:update');
      const commits = record('history:commit');

      // c is where it is told to go already: it is not updated
      board.moveNotes([{ id: a.id, x: 100 }, { id: b.id, x: 400 }, { id: c.id, x: 600 }], { duration: 300 });
      await flush();
      vi.advanceTimersByTime(400);
      await flush();

      expect(updates.map((u) => u.note.id)).toEqual([a.id, b.id]);
      expect(commits).toHaveLength(1);
      expect(commits[0].deltas).toHaveLength(2);

      board.undo();
      expect(board.getNote(a.id)!.x).toBe(0);
      expect(board.getNote(b.id)!.x).toBe(300);
    });

    it('has the end in the data from the start, and draws the way there', () => {
      const a = board.addNote({ x: 0, y: 0, width: 200, height: 150 });

      board.moveNotes([{ id: a.id, x: 300, width: 400 }], { duration: 300 });
      expect(board.getNote(a.id)).toMatchObject({ x: 300, width: 400 });
      expect(board.exportData().notes[0]).toMatchObject({ x: 300, width: 400 });
      expect(left(a.id)).toBe(0);

      vi.advanceTimersByTime(150);
      expect(left(a.id)).toBeGreaterThan(0);
      expect(left(a.id)).toBeLessThan(300);
      expect(parseFloat(noteEl(a.id).style.width)).toBeGreaterThan(200);
      expect(parseFloat(noteEl(a.id).style.width)).toBeLessThan(400);

      vi.advanceTimersByTime(200);
      expect(noteEl(a.id).style.left).toBe('300px');
      expect(noteEl(a.id).style.width).toBe('400px');
    });

    it('keeps the edges attached to the notes on the way', () => {
      const a = board.addNote({ x: 0, y: 0 });
      const b = board.addNote({ x: 0, y: 400 });
      const edge = board.addEdge(a.id, b.id);
      const atStart = pathOf(edge.id);

      board.moveNotes([{ id: b.id, x: 600 }], { duration: 300 });
      // Drawn from where the note is drawn, not from where the data has it
      expect(pathOf(edge.id)).toBe(atStart);

      vi.advanceTimersByTime(150);
      const onTheWay = pathOf(edge.id);
      expect(onTheWay).not.toBe(atStart);

      vi.advanceTimersByTime(200);
      const atEnd = pathOf(edge.id);
      expect(atEnd).not.toBe(onTheWay);

      // The same path as a move without animation
      board.moveNotes([{ id: b.id, x: 0 }]);
      board.moveNotes([{ id: b.id, x: 600 }]);
      expect(pathOf(edge.id)).toBe(atEnd);
    });

    it('goes on from where the note is drawn when it is moved again on the way', () => {
      const a = board.addNote({ x: 0, y: 0 });

      board.moveNotes([{ id: a.id, x: 300 }], { duration: 300 });
      vi.advanceTimersByTime(150);
      const onTheWay = left(a.id);

      board.moveNotes([{ id: a.id, x: -300 }], { duration: 300 });
      expect(left(a.id)).toBe(onTheWay);
      vi.advanceTimersByTime(16);
      expect(left(a.id)).toBeLessThan(onTheWay);

      vi.advanceTimersByTime(400);
      expect(noteEl(a.id).style.left).toBe('-300px');
    });

    it('puts the note at its place at once when a move without duration follows', () => {
      const a = board.addNote({ x: 0, y: 0 });

      board.moveNotes([{ id: a.id, x: 300 }], { duration: 300 });
      vi.advanceTimersByTime(100);
      board.moveNotes([{ id: a.id, x: 500 }]);

      expect(noteEl(a.id).style.left).toBe('500px');
      vi.advanceTimersByTime(400);
      expect(noteEl(a.id).style.left).toBe('500px');
    });

    it('stops animating a note that something else moves', async () => {
      const a = board.addNote({ x: 0, y: 0 });
      const b = board.addNote({ x: 0, y: 300 });
      await flush();

      board.moveNotes([{ id: a.id, x: 300 }, { id: b.id, x: 300 }], { duration: 300 });
      await flush();
      vi.advanceTimersByTime(100);
      board.updateNote(a.id, { x: 50 });
      expect(noteEl(a.id).style.left).toBe('50px');
      // A change of something else than the place leaves the animation alone
      board.updateNote(b.id, { color: '#C8E6C9' });
      expect(left(b.id)).toBeLessThan(300);

      await flush();
      board.undo(); // the updates of a and b
      board.undo(); // the move
      expect(noteEl(a.id).style.left).toBe('0px');
      expect(noteEl(b.id).style.left).toBe('0px');
      vi.advanceTimersByTime(400);
      expect(noteEl(b.id).style.left).toBe('0px');
    });

    it('does not animate when the user asked for less motion', () => {
      vi.stubGlobal('matchMedia', (query: string) => ({ matches: query.includes('prefers-reduced-motion') }));
      const a = board.addNote({ x: 0, y: 0 });

      board.moveNotes([{ id: a.id, x: 300 }], { duration: 300 });

      expect(noteEl(a.id).style.left).toBe('300px');
    });

    it('ignores unknown notes and values that are not numbers', () => {
      const a = board.addNote({ x: 0, y: 0, width: 200 });
      const updates = record('note:update');

      board.moveNotes([
        { id: 'missing', x: 10 },
        { id: a.id, x: NaN, width: '300' as unknown as number, text: 'no' } as never,
      ], { duration: 300 });

      expect(updates).toHaveLength(0);
      expect(board.getNote(a.id)).toMatchObject({ x: 0, width: 200, text: '' });
    });

    it('survives a note that is deleted, and an import, on the way', () => {
      const a = board.addNote({ x: 0, y: 0 });
      const b = board.addNote({ x: 0, y: 300 });

      board.moveNotes([{ id: a.id, x: 300 }, { id: b.id, x: 300 }], { duration: 300 });
      board.deleteNote(a.id);
      vi.advanceTimersByTime(100);
      expect(left(b.id)).toBeGreaterThan(0);

      const data = board.exportData();
      data.notes[0].x = 700;
      board.importData(data);
      vi.advanceTimersByTime(400);
      expect(noteEl(b.id).style.left).toBe('700px');
    });

    it('works in viewOnly, where the place is temporary, and not in readOnly', async () => {
      const a = board.addNote({ x: 0, y: 0 });
      await flush();
      const commits = record('history:commit');

      board.setViewOnly(true);
      board.moveNotes([{ id: a.id, x: 300, y: 40 }], { duration: 300 });
      await flush();
      expect(board.getNote(a.id)).toMatchObject({ x: 300, y: 40 });
      expect(commits).toHaveLength(0);

      board.setViewOnly(false);
      expect(board.getNote(a.id)).toMatchObject({ x: 0, y: 0 });
      expect(noteEl(a.id).style.left).toBe('0px');

      board.setReadOnly(true);
      board.moveNotes([{ id: a.id, x: 300 }]);
      expect(board.getNote(a.id)!.x).toBe(0);
    });
  });

  describe('a note whose height follows its width', () => {
    /** A foldable note that is 100px tall at 200px wide, and 60px tall at 400px */
    function addMeasured(): string {
      const note = board.addNote({ x: 0, y: 0, width: 200, height: 150, text: 'text' });
      const el = noteEl(note.id);
      Object.defineProperty(el, 'offsetWidth', { get: () => parseFloat(el.style.width), configurable: true });
      Object.defineProperty(el, 'offsetHeight', {
        get: () => (parseFloat(el.style.width) >= 400 ? 60 : 100),
        configurable: true,
      });
      board.updateNote(note.id, { foldable: true });
      return note.id;
    }

    it('is measured at the width it ends with, not at the one it is drawn with', () => {
      const id = addMeasured();
      expect(board.getNote(id)!.height).toBe(100);

      board.moveNotes([{ id, width: 400 }], { duration: 300 });
      expect(board.getNote(id)!.height).toBe(60);
      expect(noteEl(id).style.width).toBe('200px');

      // The measurement after layout runs in the first frames: the note is
      // drawn narrower than 400px then, which must not be what is measured
      vi.advanceTimersByTime(100);
      expect(parseFloat(noteEl(id).style.width)).toBeLessThan(400);
      expect(board.getNote(id)!.height).toBe(60);

      vi.advanceTimersByTime(300);
      expect(noteEl(id).style.width).toBe('400px');
      expect(board.getNote(id)!.height).toBe(60);
    });
  });

  describe('a size the note measures from its content', () => {
    it('is not set, and reports no change that is none', () => {
      const auto = board.addNote({ x: 0, y: 0, width: 200, height: 150, autoSize: true });
      const fold = board.addNote({ x: 0, y: 300, width: 200, height: 150, foldable: true });
      const updates = record('note:update');

      board.moveNotes([{ id: auto.id, width: 400, height: 400 }, { id: fold.id, height: 400 }]);
      board.stackNotes({ noteIds: [auto.id], x: 0, y: 0, width: 400 });
      expect(updates).toHaveLength(0);

      // The width of a foldable note is its own
      board.moveNotes([{ id: fold.id, width: 300, height: 400 }]);
      expect(updates).toHaveLength(1);
      expect(board.getNote(fold.id)).toMatchObject({ width: 300, height: 150 });
    });
  });

  describe('the page scroll mode', () => {
    const boardEl = () => container.querySelector('.wema-board') as HTMLElement;

    it('keeps the board tall until the notes that move up are there', () => {
      const a = board.addNote({ x: 0, y: 0, width: 200, height: 100 });
      const b = board.addNote({ x: 0, y: 900, width: 200, height: 100 });
      board.setPageScroll(true);
      expect(boardEl().style.height).toBe('1024px');

      board.moveNotes([{ id: b.id, y: 200 }], { duration: 300 });
      expect(boardEl().style.height).toBe('1024px');
      // Growing does not wait
      board.moveNotes([{ id: a.id, y: 1500 }], { duration: 300 });
      expect(boardEl().style.height).toBe('1624px');
      board.moveNotes([{ id: a.id, y: 0 }], { duration: 300 });

      vi.advanceTimersByTime(400);
      expect(boardEl().style.height).toBe('324px');
    });

    it('gets shorter at once when the animation is cut short', () => {
      board.addNote({ x: 0, y: 0, width: 200, height: 100 });
      const b = board.addNote({ x: 0, y: 900, width: 200, height: 100 });
      board.setPageScroll(true);

      board.moveNotes([{ id: b.id, y: 200 }], { duration: 300 });
      board.updateNote(b.id, { y: 300 });

      expect(boardEl().style.height).toBe('424px');
    });
  });

  describe('layout methods', () => {
    it('animate with a duration', () => {
      const a = board.addNote({ x: 0, y: 0 });
      const b = board.addNote({ x: 300, y: 200 });

      board.alignNotes([a.id, b.id], 'left', { duration: 300 });
      expect(board.getNote(b.id)!.x).toBe(0);
      expect(noteEl(b.id).style.left).toBe('300px');

      vi.advanceTimersByTime(400);
      expect(noteEl(b.id).style.left).toBe('0px');
    });

    it('autoLayout and distributeNotes take a duration too', () => {
      const notes = [0, 1, 2].map((i) => board.addNote({ x: i * i * 100, y: i * 37 }));
      const ids = notes.map((n) => n.id);

      board.distributeNotes(ids, 'horizontal', { duration: 300 });
      expect(board.getNote(ids[1])!.x).toBe(200);
      expect(noteEl(ids[1]).style.left).toBe('100px');

      board.autoLayout(undefined, { duration: 300 });
      vi.advanceTimersByTime(400);
      for (const id of ids) expect(noteEl(id).style.left).toBe(`${board.getNote(id)!.x}px`);
    });
  });

  describe('stackNotes', () => {
    it('stacks the notes in one column, in the order of where they are', () => {
      const a = board.addNote({ x: 500, y: 300, width: 200, height: 100 });
      const b = board.addNote({ x: 100, y: 50, width: 300, height: 80 });
      const c = board.addNote({ x: 0, y: 300, width: 150, height: 120 });

      board.stackNotes({ x: 20, y: 56, width: 335, gap: 16 });

      expect(board.getNote(b.id)).toMatchObject({ x: 20, y: 56, width: 335 });
      expect(board.getNote(c.id)).toMatchObject({ x: 20, y: 56 + 80 + 16, width: 335 });
      expect(board.getNote(a.id)).toMatchObject({ x: 20, y: 56 + 80 + 16 + 120 + 16, width: 335 });
    });

    it('stacks a measured note by the height it has at the new width', () => {
      const first = board.addNote({ x: 0, y: 0, width: 200, height: 150, text: 'text' });
      const el = noteEl(first.id);
      Object.defineProperty(el, 'offsetWidth', { get: () => parseFloat(el.style.width), configurable: true });
      Object.defineProperty(el, 'offsetHeight', {
        get: () => (parseFloat(el.style.width) >= 400 ? 60 : 100),
        configurable: true,
      });
      board.updateNote(first.id, { foldable: true });
      const second = board.addNote({ x: 0, y: 500, width: 200, height: 150 });

      board.stackNotes({ width: 400, gap: 10, duration: 300 });

      expect(board.getNote(first.id)).toMatchObject({ y: 0, width: 400, height: 60 });
      expect(board.getNote(second.id)).toMatchObject({ y: 70, width: 400 });
    });

    it('leaves hidden notes where they are', () => {
      const a = board.addNote({ x: 0, y: 0, height: 100 });
      const b = board.addNote({ x: 300, y: 0, height: 100 });
      const c = board.addNote({ x: 600, y: 0, height: 100 });
      board.setNoteFilter([a.id, c.id]);

      board.stackNotes({ x: 0, y: 0, gap: 10 });

      expect(board.getNote(b.id)).toMatchObject({ x: 300, y: 0 });
      expect(board.getNote(c.id)).toMatchObject({ x: 0, y: 110 });
    });

    it('is one undo step, works in viewOnly and not in readOnly', async () => {
      const a = board.addNote({ x: 0, y: 0, height: 100 });
      const b = board.addNote({ x: 300, y: 0, height: 100 });
      await flush();

      board.stackNotes({ width: 250 });
      await flush();
      expect(board.getNote(b.id)).toMatchObject({ x: 0, y: 116, width: 250 });
      board.undo();
      expect(board.getNote(a.id)).toMatchObject({ x: 0, y: 0, width: 200 });
      expect(board.getNote(b.id)).toMatchObject({ x: 300, y: 0, width: 200 });

      board.setViewOnly(true);
      board.stackNotes({ noteIds: [b.id, a.id], order: [b.id] });
      expect(board.getNote(a.id)).toMatchObject({ x: 0, y: 116 });
      board.setViewOnly(false);

      board.setReadOnly(true);
      board.stackNotes({ x: 900 });
      expect(board.getNote(a.id)!.x).toBe(0);
    });
  });
});
