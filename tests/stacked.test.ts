import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { WemaBoard } from '../src/board';
import type { WemaBoardOptions, WemaEventMap } from '../src/types';

describe('Stacked display', () => {
  let container: HTMLElement;
  let board: WemaBoard;
  let boardEl: HTMLElement;

  function create(options: Partial<WemaBoardOptions> = {}): void {
    board = new WemaBoard({ container, ...options });
    boardEl = container.querySelector('.wema-board') as HTMLElement;
    // jsdom does not lay out: give the board a size
    Object.defineProperty(boardEl, 'clientWidth', { value: 800, configurable: true });
    Object.defineProperty(boardEl, 'clientHeight', { value: 600, configurable: true });
  }

  beforeEach(() => {
    // The animation runs on frames and reads the clock: both are driven by the test
    vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame', 'performance'] });
    // jsdom has no pointer capture
    HTMLElement.prototype.setPointerCapture ??= () => {};
    HTMLElement.prototype.releasePointerCapture ??= () => {};
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    board.destroy();
    container.remove();
    vi.useRealTimers();
  });

  // Helper to flush microtask-based batch commit
  const flush = () => Promise.resolve();

  const noteEl = (id: string) => container.querySelector(`[data-note-id="${id}"]`) as HTMLElement;
  /** Where a note is drawn: [left, top, width] */
  const drawn = (id: string): number[] => {
    const { left, top, width } = noteEl(id).style;
    return [parseFloat(left), parseFloat(top), parseFloat(width)];
  };

  function record<K extends keyof WemaEventMap>(event: K): WemaEventMap[K][] {
    const payloads: WemaEventMap[K][] = [];
    board.on(event, (p) => payloads.push(p));
    return payloads;
  }

  /**
   * jsdom does no layout: make a note as tall as `heightAt` says for the
   * width it is drawn with (a measured note is as tall as its content)
   */
  function setLayout(id: string, heightAt: (width: number) => number): void {
    const el = noteEl(id);
    Object.defineProperty(el, 'offsetWidth', { get: () => parseFloat(el.style.width), configurable: true });
    Object.defineProperty(el, 'offsetHeight', { get: () => heightAt(parseFloat(el.style.width)), configurable: true });
  }

  /** Three notes that are not in a column: the middle one first, by its place */
  function addThree(): string[] {
    const a = board.addNote({ x: 500, y: 300, width: 420, height: 100 });
    const b = board.addNote({ x: 100, y: 50, width: 200, height: 80 });
    const c = board.addNote({ x: 0, y: 300, width: 200, height: 120 });
    return [a.id, b.id, c.id];
  }

  describe('what is drawn', () => {
    it('draws the notes in one column, in the order of where the data has them', () => {
      create();
      const [a, b, c] = addThree();

      board.setStacked({ x: 12, y: 12, width: 351, gap: 16 });

      expect(drawn(b)).toEqual([12, 12, 351]);
      expect(drawn(c)).toEqual([12, 12 + 80 + 16, 351]);
      expect(drawn(a)).toEqual([12, 12 + 80 + 16 + 120 + 16, 351]);
      expect(boardEl.classList.contains('wema-stacked')).toBe(true);
    });

    it('starts at the origin, and keeps the widths, unless told', () => {
      create();
      const [a, b, c] = addThree();
      board.setStacked({});
      expect(drawn(b)).toEqual([0, 0, 200]);
      expect(drawn(c)).toEqual([0, 96, 200]);
      expect(drawn(a)).toEqual([0, 232, 420]);
    });

    it('follows `order`, with the notes left out after it', () => {
      create();
      const [a, b, c] = addThree();
      board.setStacked({ order: [a], gap: 10 });
      expect(drawn(a)[1]).toBe(0);
      expect(drawn(b)[1]).toBe(110);
      expect(drawn(c)[1]).toBe(200);
    });

    it('is given back when the notes are no longer stacked', () => {
      create();
      const [a, b] = addThree();
      board.setStacked({ x: 12, y: 12, width: 351 });
      board.setStacked(null);

      expect(drawn(a)).toEqual([500, 300, 420]);
      expect(drawn(b)).toEqual([100, 50, 200]);
      expect(boardEl.classList.contains('wema-stacked')).toBe(false);
      expect(noteEl(a).classList.contains('wema-note-placed')).toBe(false);
      expect(board.getStacked()).toBeNull();
    });

    it('can be asked for when the board is made, and read back', () => {
      create({
        data: { version: 1, notes: [{ id: 'n', x: 300, y: 200, width: 200, height: 90, text: '', color: '#fff', zIndex: 1 }], edges: [] },
        stacked: { x: 8, y: 8, width: 300 },
      });
      expect(drawn('n')).toEqual([8, 8, 300]);
      // What was given, as a copy
      const options = board.getStacked();
      expect(options).toEqual({ x: 8, y: 8, width: 300 });
      options!.width = 1;
      expect(board.getStacked()?.width).toBe(300);
    });

    it('works in readOnly and viewOnly', () => {
      create({ readOnly: true, data: { version: 1, notes: [{ id: 'n', x: 300, y: 200, width: 200, height: 90, text: '', color: '#fff', zIndex: 1 }], edges: [] } });
      board.setStacked({ x: 5, y: 5 });
      expect(drawn('n')).toEqual([5, 5, 200]);
      board.setReadOnly(false);
      board.setViewOnly(true);
      board.setStacked({ x: 7, y: 7 });
      expect(drawn('n')).toEqual([7, 7, 200]);
      board.setViewOnly(false);
      expect(board.getNote('n')).toMatchObject({ x: 300, y: 200 });
    });
  });

  describe('the data', () => {
    it('is not changed, and nothing is emitted', async () => {
      create();
      const [a, b, c] = addThree();
      await flush();
      const before = JSON.stringify(board.exportData());
      const updates = record('note:update');
      const measures = record('note:measure');
      const commits = record('history:commit');
      const changes = record('change');

      board.setStacked({ x: 12, y: 12, width: 351 });
      await flush();
      await flush();
      board.setStacked(null);
      await flush();
      await flush();

      expect(JSON.stringify(board.exportData())).toBe(before);
      expect(board.getNote(a)).toMatchObject({ x: 500, y: 300, width: 420, height: 100 });
      expect(board.getNotes().map((n) => n.id)).toEqual([a, b, c]);
      expect(updates).toHaveLength(0);
      expect(measures).toHaveLength(0);
      expect(commits).toHaveLength(0);
      expect(changes).toHaveLength(0);
    });

    it('keeps the height a measured note has at its own width', async () => {
      create();
      const note = board.addNote({ x: 300, y: 0, width: 200, height: 150, text: 'text' });
      // Taller where it is narrow
      setLayout(note.id, (width) => (width >= 351 ? 60 : 100));
      board.updateNote(note.id, { foldable: true });
      const below = board.addNote({ x: 0, y: 500, width: 200, height: 80 });
      await flush();
      const updates = record('note:update');

      board.setStacked({ x: 0, y: 0, width: 351, gap: 10 });
      // Stacked by the height it has where it is drawn
      expect(drawn(below.id)[1]).toBe(60 + 10);
      expect(board.getNote(note.id)?.height).toBe(100);

      // Measured again while it is stacked: still the height at its own width
      noteEl(note.id).querySelector('.wema-note-content')!.dispatchEvent(new Event('input'));
      await flush();
      expect(board.getNote(note.id)?.height).toBe(100);
      expect(noteEl(note.id).style.width).toBe('351px');
      expect(updates).toHaveLength(0);
    });

    it('is still changed by what moves notes in the data', async () => {
      create();
      const [a, b, c] = addThree();
      board.setStacked({ x: 0, y: 0, gap: 10 });

      // Moved to the top in the data: it becomes the first of the column
      board.moveNotes([{ id: a, y: -100 }]);
      expect(board.getNote(a)?.y).toBe(-100);
      await flush();
      expect(drawn(a)[1]).toBe(0);
      expect(drawn(b)[1]).toBe(110);
      expect(drawn(c)[1]).toBe(200);
    });
  });

  describe('stacking again', () => {
    it('when a note is made or deleted', async () => {
      create();
      const [a, b, c] = addThree();
      board.setStacked({ x: 0, y: 0, gap: 10 });

      // Once what changed the notes is done (many may change at once)
      const top = board.addNote({ x: 0, y: -500, width: 200, height: 50 });
      await flush();
      expect(drawn(top.id)[1]).toBe(0);
      expect(drawn(b)[1]).toBe(60);

      board.deleteNote(b);
      await flush();
      expect(drawn(c)[1]).toBe(60);
      expect(drawn(a)[1]).toBe(190);
    });

    it('when a remote change or an import changes the notes', async () => {
      create();
      const [a, b, c] = addThree();
      board.setStacked({ x: 0, y: 0, gap: 10 });

      board.applyRemote([{ type: 'note:update', noteId: b, before: { height: 80 }, after: { height: 200 } }]);
      await flush();
      expect(drawn(c)[1]).toBe(210);
      // The data has what arrived
      expect(board.getNote(b)).toMatchObject({ x: 100, y: 50, height: 200 });

      const data = board.exportData();
      data.notes = data.notes.filter((n) => n.id !== b);
      board.importData(data);
      await flush();
      expect(drawn(c)[1]).toBe(0);
      expect(drawn(a)[1]).toBe(130);
    });

    it('leaves a hidden note out of the column, and puts it back in', async () => {
      create();
      const [a, b, c] = addThree();
      board.setStacked({ x: 0, y: 0, gap: 10 });

      board.setNoteFilter([a, c]);
      await flush();
      expect(drawn(c)[1]).toBe(0);
      expect(drawn(a)[1]).toBe(130);
      // Not placed: drawn where the data has it (it is not shown)
      expect(drawn(b)).toEqual([100, 50, 200]);

      board.setNoteFilter(null);
      await flush();
      expect(drawn(b)[1]).toBe(0);
      expect(drawn(c)[1]).toBe(90);
    });

    it('once for many changes, and before a place on screen is read', async () => {
      create();
      const [a] = addThree();
      board.setStacked({ x: 0, y: 0, gap: 10 });

      board.batch(() => {
        for (let i = 0; i < 5; i++) board.addNote({ x: 0, y: -100 * (i + 1), width: 200, height: 50 });
      });
      // Not stacked again yet: the note is still where it was in the column
      expect(drawn(a)[1]).toBe(220);
      await flush();
      expect(drawn(a)[1]).toBe(220 + 5 * 60);

      // A note made just now is in the column by the time it is revealed
      const made = board.addNote({ width: 200, height: 50 });
      board.revealNotes([made.id]);
      expect(drawn(made.id)).toEqual([0, 220 + 5 * 60 + 110, 200]);
    });

    it('when the height a measured note is drawn with changes', async () => {
      create();
      const note = board.addNote({ x: 0, y: 0, width: 200, height: 150, text: 'text' });
      let tall = false;
      // The same height at its own width all along: only what is drawn changes
      setLayout(note.id, (width) => (width >= 351 && tall ? 300 : 100));
      board.updateNote(note.id, { foldable: true });
      const below = board.addNote({ x: 0, y: 500, width: 200, height: 80 });
      board.setStacked({ x: 0, y: 0, width: 351, gap: 10 });
      await flush();
      expect(drawn(below.id)[1]).toBe(110);
      const measures = record('note:measure');
      const changes = record('change');

      tall = true;
      noteEl(note.id).querySelector('.wema-note-content')!.dispatchEvent(new Event('input'));
      await flush();
      expect(drawn(below.id)[1]).toBe(310);
      // Nothing changed in the data
      await flush();
      expect(measures).toHaveLength(0);
      expect(changes).toHaveLength(0);
    });
  });

  describe('notes the board places itself', () => {
    it('go under all the notes in the data, and to the end of the column', async () => {
      create();
      const [a] = addThree();
      board.setStacked({ x: 0, y: 0, gap: 10 });

      const made = board.addNote({ width: 200, height: 50 });
      // The notes of the data reach from x 0 to y 420
      expect(board.getNote(made.id)).toMatchObject({ x: 0, y: 440 });
      await flush();
      expect(drawn(made.id)[1]).toBe(drawn(a)[1] + 100 + 10);

      // A place that is given is kept
      const placed = board.addNote({ x: 700, y: -50, width: 200, height: 50 });
      expect(board.getNote(placed.id)).toMatchObject({ x: 700, y: -50 });
    });

    it('a double click makes a note there, not where it was clicked', () => {
      create();
      addThree();
      board.setStacked({ x: 0, y: 0 });
      boardEl.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, clientX: 300, clientY: 20 }));
      const made = board.getNotes().at(-1)!;
      expect(made).toMatchObject({ x: 0, y: 440 });
    });

    it('on an empty board, where they go without being stacked', () => {
      create();
      board.setStacked({ x: 0, y: 0 });
      const made = board.addNote();
      expect(board.getNote(made.id)).toMatchObject({ x: 100, y: 100 });
    });
  });

  describe('dragging and resizing', () => {
    function pointer(type: string, target: Element, clientX: number, clientY: number): void {
      target.dispatchEvent(new PointerEvent(type, {
        bubbles: true, cancelable: true, pointerId: 1, button: 0, clientX, clientY,
      }));
    }

    function drag(target: Element): void {
      pointer('pointerdown', target, 300, 300);
      pointer('pointermove', boardEl, 380, 390);
      pointer('pointerup', boardEl, 380, 390);
    }

    it('do nothing while the notes are stacked', async () => {
      create();
      const [a] = addThree();
      board.setStacked({ x: 0, y: 0 });
      await flush();
      const updates = record('note:update');
      const before = drawn(a);

      drag(noteEl(a).querySelector('.wema-move-handle')!);
      drag(noteEl(a).querySelector('.wema-resize-handle')!);

      expect(updates).toHaveLength(0);
      expect(drawn(a)).toEqual(before);
      expect(board.getNote(a)).toMatchObject({ x: 500, y: 300, width: 420, height: 100 });
    });

    it('work again afterwards', () => {
      create();
      const [a] = addThree();
      board.setStacked({ x: 0, y: 0 });
      board.setStacked(null);
      drag(noteEl(a).querySelector('.wema-move-handle')!);
      expect(board.getNote(a)).toMatchObject({ x: 580, y: 390 });
    });
  });

  describe('with other features', () => {
    it('the page is as tall as the column', () => {
      create({ pageScroll: true });
      addThree();
      // The lowest note of the data ends at 420
      expect(boardEl.style.height).toBe('444px');
      board.setStacked({ x: 0, y: 12, gap: 10 });
      expect(boardEl.style.height).toBe(`${12 + 80 + 10 + 120 + 10 + 100 + 24}px`);
      board.setStacked(null);
      expect(boardEl.style.height).toBe('444px');
    });

    it('the edges are drawn between the notes where they are drawn', () => {
      create();
      const [a, b] = addThree();
      const edge = board.addEdge(a, b);
      const pathOf = () => container.querySelector(`.wema-edge-path[data-edge-id="${edge.id}"]`)!.getAttribute('d');
      const apart = pathOf();

      board.setStacked({ x: 0, y: 0 });
      const stacked = pathOf();
      expect(stacked).not.toBe(apart);

      board.setStacked(null);
      expect(pathOf()).toBe(apart);
    });

    it('an autoSize note is as wide as the column', () => {
      create();
      const note = board.addNote({ x: 300, y: 0, text: 'text', autoSize: true });
      board.setStacked({ x: 0, y: 0, width: 351 });
      expect(noteEl(note.id).classList.contains('wema-note-placed')).toBe(true);
      expect(noteEl(note.id).style.width).toBe('351px');
    });

    it('the rubberband selects the notes where they are drawn', () => {
      create();
      const [a, b] = addThree();
      board.setStacked({ x: 0, y: 0 });
      const press = (type: string, target: Element, clientX: number, clientY: number): void => {
        target.dispatchEvent(new PointerEvent(type, {
          bubbles: true, cancelable: true, pointerId: 1, button: 0, clientX, clientY,
        }));
      };
      // Over the first note of the column only (b), where the data has none
      press('pointerdown', boardEl, 250, 10);
      press('pointermove', boardEl, 150, 60);
      press('pointerup', boardEl, 150, 60);
      expect(board.getSelection()).toEqual([b]);
      expect(board.getSelection()).not.toContain(a);
    });

    it('animates to the column and back with a duration, and not when it stacks again', async () => {
      create();
      const note = board.addNote({ x: 400, y: 200, width: 200, height: 100 });
      board.setStacked({ x: 0, y: 0 }, { duration: 300 });
      // Drawn where it was, on its way
      expect(drawn(note.id)).toEqual([400, 200, 200]);
      vi.advanceTimersByTime(150);
      expect(drawn(note.id)[0]).toBeGreaterThan(0);
      expect(drawn(note.id)[0]).toBeLessThan(400);
      vi.advanceTimersByTime(300);
      expect(drawn(note.id)).toEqual([0, 0, 200]);

      // Stacked again by the board: at once
      const top = board.addNote({ x: 0, y: -500, width: 200, height: 50 });
      await flush();
      expect(drawn(top.id)[1]).toBe(0);
      expect(drawn(note.id)[1]).toBe(66);

      // And back
      board.setStacked(null, { duration: 300 });
      expect(drawn(note.id)).toEqual([0, 66, 200]);
      vi.advanceTimersByTime(150);
      expect(drawn(note.id)[0]).toBeGreaterThan(0);
      expect(drawn(note.id)[0]).toBeLessThan(400);
      vi.advanceTimersByTime(300);
      expect(drawn(note.id)).toEqual([400, 200, 200]);
    });

    it('a note on its way goes on when the board stacks the notes again', async () => {
      create();
      const [a, b] = addThree();
      board.setStacked({ x: 0, y: 0, gap: 10 }, { duration: 300 });
      vi.advanceTimersByTime(150);
      const onTheWay = drawn(a);
      expect(onTheWay[0]).toBeGreaterThan(0);

      // Something else changes the column: this is no move of its own
      board.updateNote(b, { color: '#eee' });
      await flush();
      expect(drawn(a)).toEqual(onTheWay);
      board.updateNote(b, { height: 180 });
      await flush();
      expect(drawn(a)).toEqual(onTheWay);

      // It ends where the column has it now
      vi.advanceTimersByTime(300);
      expect(drawn(a)).toEqual([0, 180 + 10 + 120 + 10, 420]);
    });

    it('a note on its way is stacked by the height it has at the width it ends with', () => {
      create();
      const note = board.addNote({ x: 0, y: 0, width: 200, height: 150, text: 'text' });
      // Lower where it is wide
      setLayout(note.id, (width) => (width >= 351 ? 60 : 100));
      board.updateNote(note.id, { foldable: true });
      const below = board.addNote({ x: 0, y: 500, width: 200, height: 80 });

      board.setStacked({ x: 0, y: 0, width: 351, gap: 10 }, { duration: 300 });
      // Still drawn 200 wide, where it is 100 tall
      expect(noteEl(note.id).style.width).toBe('200px');
      vi.advanceTimersByTime(400);
      expect(drawn(below.id)[1]).toBe(60 + 10);
    });

    it('a note that is placed where the data has it is given back all the same', () => {
      create();
      const note = board.addNote({ x: 0, y: 0, text: 'text', autoSize: true });
      // No width, and the origin: the place in the column is the one in the data
      board.setStacked({});
      expect(noteEl(note.id).classList.contains('wema-note-placed')).toBe(true);
      board.setStacked(null);
      expect(noteEl(note.id).classList.contains('wema-note-placed')).toBe(false);
    });

    it('the collapse button is on the side the edge is drawn from', async () => {
      create();
      // Side by side in the data: the edge leaves the first note to the right
      const a = board.addNote({ x: 0, y: 0, width: 200, height: 100 });
      const b = board.addNote({ x: 600, y: 0, width: 200, height: 100 });
      board.addEdge(a.id, b.id);
      const shownSide = (): string[] =>
        [...noteEl(a.id).querySelectorAll<HTMLElement>('.wema-note-collapse-btn')]
          .filter((btn) => btn.style.display !== 'none')
          .map((btn) => btn.dataset.side!);
      expect(shownSide()).toEqual(['right']);

      // One under the other in the column: the edge leaves it at the bottom
      board.setStacked({ x: 0, y: 0, gap: 80 });
      expect(shownSide()).toEqual(['bottom']);

      board.setStacked(null);
      expect(shownSide()).toEqual(['right']);
    });
  });
});
