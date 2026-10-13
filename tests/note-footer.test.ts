import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { WemaBoard } from '../src/board';
import type { WemaBoardOptions, WemaEventMap, WemaNote } from '../src/types';

describe('What the host draws under a note (renderNoteFooter)', () => {
  let container: HTMLElement;
  let board: WemaBoard;
  let boardEl: HTMLElement;
  /** How tall the host draws under each note (none: nothing is drawn) */
  let heights: Map<string, number>;
  /** The notes the host was asked to draw under, in order */
  let calls: string[];

  /** A host that draws a box `heights` tall under the notes that are in it */
  const drawFooter = (note: WemaNote, el: HTMLElement): boolean => {
    calls.push(note.id);
    const height = heights.get(note.id);
    if (height === undefined) return false;
    const chip = document.createElement('button');
    chip.textContent = `under ${note.id}`;
    el.appendChild(chip);
    // jsdom does no layout: the element is as tall as the host says
    Object.defineProperty(el, 'offsetHeight', { get: () => heights.get(note.id) ?? 0, configurable: true });
    return true;
  };

  function create(options: Partial<WemaBoardOptions> = {}): void {
    board = new WemaBoard({ container, renderNoteFooter: drawFooter, ...options });
    boardEl = container.querySelector('.wema-board') as HTMLElement;
    Object.defineProperty(boardEl, 'clientWidth', { value: 800, configurable: true });
    Object.defineProperty(boardEl, 'clientHeight', { value: 600, configurable: true });
  }

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame', 'performance'] });
    HTMLElement.prototype.setPointerCapture ??= () => {};
    HTMLElement.prototype.releasePointerCapture ??= () => {};
    container = document.createElement('div');
    document.body.appendChild(container);
    heights = new Map();
    calls = [];
  });

  afterEach(() => {
    board.destroy();
    container.remove();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  /** Let what is pending be done: the footers are drawn and the notes stacked once a call is over */
  const settle = async () => {
    for (let i = 0; i < 4; i++) await Promise.resolve();
  };

  const noteEl = (id: string) => container.querySelector(`[data-note-id="${id}"]`) as HTMLElement;
  const footerEl = (id: string) => noteEl(id).querySelector(':scope > .wema-note-footer') as HTMLElement;
  const isDrawn = (id: string) => noteEl(id).classList.contains('wema-note-has-footer');
  const top = (id: string) => parseFloat(noteEl(id).style.top);

  function record<K extends keyof WemaEventMap>(event: K): WemaEventMap[K][] {
    const payloads: WemaEventMap[K][] = [];
    board.on(event, (p) => payloads.push(p));
    return payloads;
  }

  /** Three notes, from the top: 80, 120 and 100 tall */
  function addThree(): string[] {
    const a = board.addNote({ x: 100, y: 50, width: 200, height: 80 });
    const b = board.addNote({ x: 0, y: 300, width: 200, height: 120 });
    const c = board.addNote({ x: 500, y: 300, width: 420, height: 100 });
    return [a.id, b.id, c.id];
  }

  const STACK = { x: 12, y: 12, width: 351, gap: 16 };

  describe('when it is drawn', () => {
    it('not while the notes are not stacked', async () => {
      create();
      const [a] = addThree();
      heights.set(a, 30);
      board.refreshNote(a);
      await settle();
      expect(calls).toEqual([]);
      expect(footerEl(a).childElementCount).toBe(0);
    });

    it('for every note once the notes are stacked, and not from inside the call', async () => {
      create();
      const [a, b, c] = addThree();
      heights.set(b, 30);

      board.setStacked(STACK);
      expect(calls).toEqual([]);
      await settle();

      expect([...calls].sort()).toEqual([a, b, c].sort());
      expect(isDrawn(b)).toBe(true);
      expect(footerEl(b).textContent).toBe(`under ${b}`);
      expect(isDrawn(a)).toBe(false);
      expect(footerEl(a).childElementCount).toBe(0);
    });

    it('can ask the board about the notes of the data it is made with', async () => {
      const seen: Record<string, number> = {};
      const made: WemaBoard = new WemaBoard({
        container,
        data: {
          version: 1,
          notes: [
            { id: 'a', x: 0, y: 0, width: 200, height: 80, text: 'a', color: '#fff', zIndex: 1 },
            { id: 'b', x: 0, y: 200, width: 200, height: 80, text: 'b', color: '#fff', zIndex: 2 },
          ],
          edges: [{ id: 'e', from: 'a', to: 'b', fromAnchor: 'auto', toAnchor: 'auto', style: 'arrow' }],
        },
        stacked: STACK,
        renderNoteFooter: (note) => {
          // `made` is not assigned until the constructor returns
          seen[note.id] = made.getEdgesOf(note.id).length;
          return false;
        },
      });
      board = made;
      const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
      await settle();
      expect(seen).toEqual({ a: 1, b: 1 });
      expect(errors).not.toHaveBeenCalled();
    });

    it('for a note that is made, and one whose text or meta changes', async () => {
      create();
      const [a] = addThree();
      board.setStacked(STACK);
      await settle();
      calls.length = 0;

      const d = board.addNote({ x: 0, y: 900 });
      await settle();
      expect(calls).toEqual([d.id]);

      calls.length = 0;
      board.updateNote(a, { text: 'new' });
      board.updateNote(a, { meta: { kind: 'x' } });
      board.updateNote(a, { x: 5, color: '#000' });
      await settle();
      expect(calls).toEqual([a]);
    });

    it('for a note whose text was typed', async () => {
      create();
      const [a] = addThree();
      board.setStacked(STACK);
      await settle();
      calls.length = 0;

      const content = noteEl(a).querySelector('.wema-note-content') as HTMLElement;
      content.innerHTML = 'typed';
      content.dispatchEvent(new Event('input', { bubbles: true }));
      await settle();
      expect(calls).toEqual([]);
      content.dispatchEvent(new FocusEvent('blur'));
      await settle();
      expect(board.getNote(a)!.text).toBe('typed');
      expect(calls).toEqual([a]);
    });

    it('not on a board that was destroyed before it was drawn', async () => {
      create();
      addThree();
      board.setStacked(STACK);
      board.destroy();
      await settle();
      expect(calls).toEqual([]);
    });

    it('again with refreshNote(), once however often it is asked for', async () => {
      create();
      const [a, b] = addThree();
      board.setStacked(STACK);
      await settle();
      calls.length = 0;

      heights.set(a, 20);
      board.refreshNote(a);
      board.refreshNote(a);
      board.refreshNote(b);
      await settle();
      expect(calls).toEqual([a, b]);
      expect(isDrawn(a)).toBe(true);

      // Nothing to draw any more: what was there is removed
      heights.delete(a);
      board.refreshNote(a);
      await settle();
      expect(isDrawn(a)).toBe(false);
      expect(footerEl(a).childElementCount).toBe(0);
    });

    it('also when the column is laid out before what was asked for is drawn', async () => {
      create();
      const [a, b] = addThree();
      board.setStacked(STACK);
      await settle();
      calls.length = 0;

      heights.set(a, 20);
      board.refreshNote(a);
      board.setStacked({ ...STACK, gap: 8 });
      await settle();
      expect(calls).toEqual([a]);
      expect(top(b)).toBe(12 + 80 + 20 + 8);
    });

    it('needs the option: a board without it makes no element under its notes', () => {
      board = new WemaBoard({ container });
      const note = board.addNote();
      expect(container.querySelector(`[data-note-id="${note.id}"] > .wema-note-footer`)).toBeNull();
      board.setStacked(STACK);
      board.refreshNote(note.id);
    });

    it('before a place on screen is read', () => {
      create();
      const [a, b] = addThree();
      heights.set(a, 30);
      board.setStacked(STACK);
      board.revealNotes([b]);
      expect(isDrawn(a)).toBe(true);
      expect(top(b)).toBe(12 + 80 + 30 + 16);
    });

    it('is removed when the notes are no longer stacked', async () => {
      create();
      const [a, b] = addThree();
      heights.set(a, 30);
      board.setStacked(STACK);
      await settle();

      board.setStacked(null);
      await settle();
      expect(isDrawn(a)).toBe(false);
      expect(footerEl(a).childElementCount).toBe(0);
      expect(noteEl(a).style.top).toBe('50px');
      expect(noteEl(a).style.height).toBe('80px');
      expect(noteEl(b).style.top).toBe('300px');
      expect(noteEl(b).style.width).toBe('200px');
    });

    it('goes on with the other notes when the host throws for one', async () => {
      const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
      board = new WemaBoard({
        container,
        renderNoteFooter: (note, el) => {
          el.appendChild(document.createElement('span'));
          if (note.text === 'bad') throw new Error('boom');
          return true;
        },
      });
      const bad = board.addNote({ x: 0, y: 0, text: 'bad' });
      const good = board.addNote({ x: 0, y: 300, text: 'good' });
      board.setStacked(STACK);
      await settle();
      expect(errors).toHaveBeenCalledTimes(1);
      expect(footerEl(bad.id).childElementCount).toBe(0);
      expect(footerEl(good.id).childElementCount).toBe(1);
    });

    it('also under a note the host draws itself', async () => {
      create({ renderNote: (_note, el) => { el.textContent = 'mine'; return true; } });
      const [a] = addThree();
      heights.set(a, 30);
      board.setStacked(STACK);
      await settle();
      expect(noteEl(a).classList.contains('wema-note-host-drawn')).toBe(true);
      expect(isDrawn(a)).toBe(true);
    });
  });

  describe('the column', () => {
    it('leaves room under a note for what is drawn there, and none where nothing is', async () => {
      create();
      const [a, b, c] = addThree();
      heights.set(a, 30);
      board.setStacked(STACK);
      await settle();

      expect(top(a)).toBe(12);
      expect(top(b)).toBe(12 + 80 + 30 + 16);
      expect(top(c)).toBe(12 + 80 + 30 + 16 + 120 + 16);
      // The note itself is as tall as it was
      expect(noteEl(a).style.height).toBe('80px');
    });

    it('is laid out again when what is drawn gets taller, shorter or goes away', async () => {
      create();
      const [a, b] = addThree();
      heights.set(a, 30);
      board.setStacked(STACK);
      await settle();

      heights.set(a, 64);
      board.refreshNote(a);
      await settle();
      expect(top(b)).toBe(12 + 80 + 64 + 16);

      heights.delete(a);
      board.refreshNote(a);
      await settle();
      expect(top(b)).toBe(12 + 80 + 16);
    });

    it('stays without overlap when notes are filtered, added by a remote change, or removed', async () => {
      create();
      const [a, b, c] = addThree();
      for (const id of [a, b, c]) heights.set(id, 30);
      board.setStacked(STACK);
      await settle();

      board.setNoteFilter([a, c]);
      await settle();
      expect(top(c)).toBe(12 + 80 + 30 + 16);

      board.setNoteFilter(null);
      heights.set('r', 40);
      board.applyRemote([{
        type: 'note:create',
        note: { id: 'r', x: 0, y: 100, width: 200, height: 60, text: '', color: '#fff', zIndex: 9 },
      }]);
      await settle();
      // By where the data has them: a (y 50), r (100), b (300), c (300)
      expect(top('r')).toBe(12 + 80 + 30 + 16);
      expect(top(b)).toBe(12 + 80 + 30 + 16 + 60 + 40 + 16);

      board.applyRemote([{ type: 'note:delete', note: board.getNote('r')! }]);
      await settle();
      expect(top(b)).toBe(12 + 80 + 30 + 16);
      expect(top(c)).toBe(12 + 80 + 30 + 16 + 120 + 30 + 16);
    });

    it('makes the page as tall as the last note and what is under it', async () => {
      create({ pageScroll: true });
      const c = addThree()[2];
      board.setStacked(STACK);
      await settle();
      const without = parseFloat(boardEl.style.height);

      heights.set(c, 50);
      board.refreshNote(c);
      await settle();
      expect(parseFloat(boardEl.style.height)).toBe(without + 50);
    });
  });

  describe('the data', () => {
    it('is not changed, and no event tells of it', async () => {
      create();
      const [a, b, c] = addThree();
      await settle();
      const before = board.exportData();
      const events = [
        record('note:update'), record('note:measure'), record('history:commit'), record('change'),
        record('history:change'),
      ];

      for (const id of [a, b, c]) heights.set(id, 30);
      board.setStacked(STACK);
      await settle();
      heights.set(a, 70);
      board.refreshNote(a);
      await settle();

      expect(events.flat()).toEqual([]);
      expect(board.exportData()).toEqual(before);
      expect(board.getNote(a)).toMatchObject({ x: 100, y: 50, width: 200, height: 80 });
    });
  });

  describe('a press or a click in it', () => {
    it('does not select the note, and does not reach the board', async () => {
      create();
      const [a] = addThree();
      heights.set(a, 30);
      board.setStacked(STACK);
      await settle();
      const chip = footerEl(a).querySelector('button') as HTMLElement;
      const clicked = vi.fn();
      chip.addEventListener('click', clicked);
      const reached = vi.fn();
      for (const type of ['pointerdown', 'click', 'dblclick']) boardEl.addEventListener(type, reached);
      const count = board.getNotes().length;

      chip.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0 }));
      chip.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      chip.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));

      expect(clicked).toHaveBeenCalledTimes(1);
      expect(reached).not.toHaveBeenCalled();
      expect(board.getSelection()).toEqual([]);
      expect(board.getNotes()).toHaveLength(count);
    });

    it('a key pressed in it is not a shortcut of the board', async () => {
      create();
      const [a, b] = addThree();
      heights.set(a, 30);
      board.setStacked(STACK);
      await settle();
      board.select([b]);

      const chip = footerEl(a).querySelector('button') as HTMLElement;
      chip.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', bubbles: true }));
      expect(board.getNote(b)).toBeDefined();
    });
  });

  describe('isNoteHidden() and note:visibility', () => {
    it('tell of the filter', async () => {
      create();
      const [a, b, c] = addThree();
      await settle();
      const events = record('note:visibility');

      board.setNoteFilter([a]);
      expect(board.isNoteHidden(a)).toBe(false);
      expect(board.isNoteHidden(b)).toBe(true);
      expect(events).toEqual([]);
      await settle();
      expect(events).toEqual([{ hidden: [b, c], shown: [] }]);

      board.setNoteFilter([a, b]);
      await settle();
      expect(events[1]).toEqual({ hidden: [], shown: [b] });

      board.setNoteFilter(null);
      await settle();
      expect(events[2]).toEqual({ hidden: [], shown: [c] });
      expect(board.isNoteHidden(c)).toBe(false);
      expect(board.isNoteHidden('nope')).toBe(false);
    });

    it('tell of a collapsed edge, also when its badge is pressed', async () => {
      create();
      const [a, b, c] = addThree();
      const edge = board.addEdge(a, b);
      board.addEdge(b, c);
      await settle();
      const events = record('note:visibility');

      board.updateEdge(edge.id, { collapsed: true });
      await settle();
      expect(events).toEqual([{ hidden: [b, c], shown: [] }]);
      expect(board.isNoteHidden(b)).toBe(true);

      const badge = noteEl(a).querySelector('.wema-note-collapse-badge') as HTMLElement;
      badge.click();
      await settle();
      expect(events[1]).toEqual({ hidden: [], shown: [b, c] });
      expect(board.isNoteHidden(b)).toBe(false);
    });

    it('report once what differs in the end, and nothing for a note that is deleted or a board that is loaded', async () => {
      create();
      const [a, b, c] = addThree();
      await settle();
      const events = record('note:visibility');

      board.setNoteFilter([a]);
      board.setNoteFilter([a, b]);
      await settle();
      expect(events).toEqual([{ hidden: [c], shown: [] }]);

      board.setNoteFilter(null);
      board.setNoteFilter([a, b]);
      await settle();
      expect(events).toHaveLength(1);

      board.applyRemote([{ type: 'note:delete', note: board.getNote(c)! }]);
      await settle();
      expect(events).toHaveLength(1);

      board.importData({
        version: 1,
        notes: [
          { id: 'x', x: 0, y: 0, width: 200, height: 80, text: '', color: '#fff', zIndex: 1 },
          { id: 'y', x: 0, y: 200, width: 200, height: 80, text: '', color: '#fff', zIndex: 2 },
        ],
        edges: [{ id: 'e', from: 'x', to: 'y', fromAnchor: 'auto', toAnchor: 'auto', style: 'arrow', collapsed: true }],
      });
      await settle();
      expect(board.isNoteHidden('y')).toBe(true);
      expect(events).toHaveLength(1);
    });

    it('a note that a remote change makes outside the filter is reported as hidden', async () => {
      create();
      const [a] = addThree();
      board.setNoteFilter([a]);
      await settle();
      const events = record('note:visibility');
      board.applyRemote([{
        type: 'note:create',
        note: { id: 'r', x: 0, y: 0, width: 200, height: 60, text: '', color: '#fff', zIndex: 9 },
      }]);
      await settle();
      expect(events).toEqual([{ hidden: ['r'], shown: [] }]);
    });

    it('let the host draw again what depends on whether another note is shown', async () => {
      create();
      const [a, b] = addThree();
      board.addEdge(a, b);
      heights.set(a, 30);
      board.setStacked(STACK);
      board.on('note:visibility', ({ hidden, shown }) => {
        for (const id of [...hidden, ...shown]) {
          for (const edge of board.getEdgesOf(id)) board.refreshNote(edge.from === id ? edge.to : edge.from);
        }
      });
      await settle();
      calls.length = 0;

      board.setNoteFilter([a]);
      await settle();
      expect(calls).toEqual([a]);
    });
  });
});
