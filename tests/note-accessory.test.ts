import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { WemaBoard } from '../src/board';
import type { WemaBoardOptions, WemaEdge, WemaEventMap, WemaNote } from '../src/types';

const note = (id: string, y: number, extra: Partial<WemaNote> = {}): WemaNote =>
  ({ id, x: 0, y, width: 200, height: 80, text: id, color: '#fff', zIndex: 1, ...extra });
const edge = (id: string, from: string, to: string): WemaEdge =>
  ({ id, from, to, fromAnchor: 'auto', toAnchor: 'auto', style: 'arrow' });

describe('The accessories of a note (renderNoteAccessory)', () => {
  let container: HTMLElement;
  let board: WemaBoard;
  /** What the host knows of each note, outside the data: how many likes, and whether an agent made it */
  let info: Map<string, { likes: number; agent?: boolean }>;
  /** The notes the host was asked to draw the accessories of, in order */
  let calls: string[];
  /** How tall the footer of each note is (jsdom does no layout) */
  let footers: Map<string, number>;

  const ACCESSORY_HEIGHT = 20;
  const STACK = { x: 12, y: 12, width: 351, gap: 16 };

  const noteEl = (id: string) => container.querySelector(`[data-note-id="${id}"]`) as HTMLElement;
  const underEl = (id: string) => noteEl(id).querySelector(':scope > .wema-note-under') as HTMLElement;
  const accessoryEl = (id: string) => underEl(id).querySelector(':scope > .wema-note-accessory') as HTMLElement;
  const hasAccessory = (id: string) => noteEl(id).classList.contains('wema-note-has-accessory');
  const top = (id: string) => parseFloat(noteEl(id).style.top);

  /** jsdom does no layout: what is under a note is as tall as what was drawn there */
  function layOut(id: string): void {
    Object.defineProperty(underEl(id), 'offsetHeight', {
      get: () => (hasAccessory(id) ? ACCESSORY_HEIGHT : 0)
        + (noteEl(id).classList.contains('wema-note-has-footer') ? footers.get(id) ?? 0 : 0),
      configurable: true,
    });
  }

  const drawAccessory = (n: WemaNote, el: HTMLElement): boolean => {
    calls.push(n.id);
    layOut(n.id);
    const known = info.get(n.id);
    if (!known) return false;
    if (known.agent) {
      const badge = document.createElement('span');
      badge.className = 'badge';
      badge.textContent = 'AI';
      el.appendChild(badge);
    }
    const like = document.createElement('button');
    like.className = 'like';
    like.setAttribute('data-wema-focus-key', 'like');
    like.textContent = `♥ ${known.likes}`;
    el.appendChild(like);
    return true;
  };

  function create(options: Partial<WemaBoardOptions> = {}): void {
    board = new WemaBoard({
      container,
      data: {
        version: 1,
        notes: [note('a', 0), note('b', 200), note('c', 400)],
        edges: [edge('ab', 'a', 'b')],
      },
      renderNoteAccessory: drawAccessory,
      ...options,
    });
  }

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame', 'performance'] });
    container = document.createElement('div');
    document.body.appendChild(container);
    info = new Map([['a', { likes: 2, agent: true }], ['b', { likes: 0 }]]);
    footers = new Map();
    calls = [];
  });

  afterEach(() => {
    board.destroy();
    container.remove();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  const settle = async () => {
    for (let i = 0; i < 4; i++) await Promise.resolve();
  };

  function record<K extends keyof WemaEventMap>(event: K): WemaEventMap[K][] {
    const payloads: WemaEventMap[K][] = [];
    board.on(event, (p) => payloads.push(p));
    return payloads;
  }

  describe('when it is drawn', () => {
    it('for every note, stacked or not, once the board is made', async () => {
      create();
      expect(calls).toEqual([]);
      await settle();
      expect([...calls].sort()).toEqual(['a', 'b', 'c']);
      expect(accessoryEl('a').textContent).toBe('AI♥ 2');
      expect(accessoryEl('b').textContent).toBe('♥ 0');
      // Nothing for a note the host has nothing for
      expect(hasAccessory('c')).toBe(false);
      expect(accessoryEl('c').childElementCount).toBe(0);
    });

    it('can ask the board from the function, also for the notes it is made with', async () => {
      const seen: Record<string, number> = {};
      const made: WemaBoard = new WemaBoard({
        container,
        data: { version: 1, notes: [note('a', 0), note('b', 200)], edges: [edge('ab', 'a', 'b')] },
        renderNoteAccessory: (n) => {
          seen[n.id] = made.getEdgesOf(n.id).length;
          return false;
        },
      });
      board = made;
      await settle();
      expect(seen).toEqual({ a: 1, b: 1 });
    });

    it('again for the note refreshNoteAccessory() names, and nothing else of it', async () => {
      const renderNote = vi.fn(() => false);
      const renderNoteFooter = vi.fn(() => false);
      create({ renderNote, renderNoteFooter, stacked: STACK });
      await settle();
      calls.length = 0;
      renderNote.mockClear();
      renderNoteFooter.mockClear();

      info.set('b', { likes: 5 });
      board.refreshNoteAccessory('b');
      board.refreshNoteAccessory('b');
      expect(calls).toEqual([]);
      await settle();
      expect(calls).toEqual(['b']);
      expect(accessoryEl('b').textContent).toBe('♥ 5');
      expect(renderNote).not.toHaveBeenCalled();
      expect(renderNoteFooter).not.toHaveBeenCalled();
    });

    it('with refreshNote(), and when the text or the meta of the note changes', async () => {
      create();
      await settle();
      calls.length = 0;

      board.refreshNote('a');
      await settle();
      expect(calls).toEqual(['a']);

      calls.length = 0;
      board.updateNote('b', { text: 'new' });
      board.updateNote('b', { meta: { k: 'v' } });
      board.updateNote('b', { x: 30, color: '#000' });
      await settle();
      expect(calls).toEqual(['b']);
    });

    it('for a note that is made, also by a remote change, and nothing breaks for one that is gone', async () => {
      create();
      await settle();
      calls.length = 0;

      info.set('r', { likes: 1 });
      board.applyRemote([{ type: 'note:create', note: note('r', 600) }]);
      await settle();
      expect(calls).toEqual(['r']);
      expect(accessoryEl('r').textContent).toBe('♥ 1');

      calls.length = 0;
      board.applyRemote([{ type: 'note:delete', note: board.getNote('r')! }]);
      expect(() => {
        board.refreshNoteAccessory('r');
        board.refreshNoteAccessory('never-there');
        board.refreshNote('never-there');
      }).not.toThrow();
      await settle();
      expect(calls).toEqual([]);
    });

    it('removes what was there when the host has nothing to put any more', async () => {
      create();
      await settle();
      info.delete('a');
      board.refreshNoteAccessory('a');
      await settle();
      expect(hasAccessory('a')).toBe(false);
      expect(accessoryEl('a').childElementCount).toBe(0);
    });

    it('in readOnly and viewOnly, and for a note the host draws itself', async () => {
      create({ readOnly: true, renderNote: (_n, el) => { el.textContent = 'mine'; return true; } });
      await settle();
      expect(noteEl('a').classList.contains('wema-note-host-drawn')).toBe(true);
      expect(hasAccessory('a')).toBe(true);
      board.destroy();

      calls.length = 0;
      create({ viewOnly: true });
      await settle();
      expect(hasAccessory('a')).toBe(true);
    });

    it('goes on with the other notes when the host throws for one', async () => {
      const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
      create({
        renderNoteAccessory: (n, el) => {
          el.appendChild(document.createElement('span'));
          if (n.id === 'a') throw new Error('boom');
          return true;
        },
      });
      await settle();
      expect(errors).toHaveBeenCalledTimes(1);
      expect(String(errors.mock.calls[0][0])).toContain('renderNoteAccessory');
      expect(accessoryEl('a').childElementCount).toBe(0);
      expect(hasAccessory('b')).toBe(true);
    });

    it('not on a board that was destroyed before it was drawn, and needs the option', async () => {
      create();
      board.destroy();
      await settle();
      expect(calls).toEqual([]);

      board = new WemaBoard({ container });
      const made = board.addNote();
      expect(container.querySelector(`[data-note-id="${made.id}"] .wema-note-under`)).toBeNull();
      expect(() => board.refreshNoteAccessory(made.id)).not.toThrow();
    });

    it('not from inside a call that reads a place on screen, where the notes are not stacked', async () => {
      create();
      await settle();
      calls.length = 0;
      // The host makes a note, shows it, and only then fills in what it knows of it
      const made = board.addNote({ x: 0, y: 900 });
      board.revealNotes([made.id]);
      board.fitToContent();
      expect(calls).toEqual([]);
      info.set(made.id, { likes: 4 });
      await settle();
      expect(calls).toEqual([made.id]);
      expect(accessoryEl(made.id).textContent).toBe('♥ 4');
    });

    it('does not go on without an end when the host asks for the note it is drawing', async () => {
      let drawn = 0;
      create({
        renderNoteAccessory: (n, el) => {
          drawn += 1;
          board.refreshNoteAccessory(n.id);
          board.refreshNote(n.id);
          el.textContent = 'x';
          return true;
        },
      });
      for (let i = 0; i < 20; i++) await Promise.resolve();
      // Once for each of the three notes
      expect(drawn).toBe(3);
    });

    it('keeps the focus on the button that stands for the same thing', async () => {
      create();
      await settle();
      const like = accessoryEl('a').querySelector('.like') as HTMLElement;
      like.focus();
      info.set('a', { likes: 3, agent: true });
      board.refreshNoteAccessory('a');
      await settle();
      const again = accessoryEl('a').querySelector('.like') as HTMLElement;
      expect(again).not.toBe(like);
      expect(again.textContent).toBe('♥ 3');
      expect(document.activeElement).toBe(again);
    });
  });

  describe('the note and the data', () => {
    it('are not changed, and no event tells of it', async () => {
      create();
      await settle();
      const before = board.exportData();
      const events = [
        record('note:update'), record('note:measure'), record('history:commit'), record('change'),
        record('history:change'), record('note:select'),
      ];
      info.set('c', { likes: 9 });
      for (const id of ['a', 'b', 'c']) board.refreshNoteAccessory(id);
      await settle();
      board.setStacked(STACK);
      await settle();
      board.setStacked(null);
      await settle();

      expect(events.flat()).toEqual([]);
      expect(board.exportData()).toEqual(before);
      expect(noteEl('a').style.height).toBe('80px');
      expect(noteEl('a').style.top).toBe('0px');
    });

    it('the page is as tall as the last note and its accessories, stacked or not', async () => {
      create({ pageScroll: true });
      const boardEl = container.querySelector('.wema-board') as HTMLElement;
      const without = parseFloat(boardEl.style.height);
      // c is the last note: it has nothing yet
      await settle();
      expect(parseFloat(boardEl.style.height)).toBe(without);

      info.set('c', { likes: 1 });
      board.refreshNoteAccessory('c');
      await settle();
      expect(parseFloat(boardEl.style.height)).toBe(without + ACCESSORY_HEIGHT);
    });

    it('a press, a click or a key in it does not select the note, and does not reach the board', async () => {
      create();
      await settle();
      const boardEl = container.querySelector('.wema-board') as HTMLElement;
      const like = accessoryEl('a').querySelector('.like') as HTMLElement;
      const pressed = vi.fn();
      like.addEventListener('click', pressed);
      const reached = vi.fn();
      for (const type of ['pointerdown', 'click', 'dblclick', 'keydown']) boardEl.addEventListener(type, reached);
      board.select(['b']);

      like.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0 }));
      like.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      like.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
      like.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', bubbles: true }));

      expect(pressed).toHaveBeenCalledTimes(1);
      expect(reached).not.toHaveBeenCalled();
      expect(board.getSelection()).toEqual(['b']);
      expect(board.getNote('b')).toBeDefined();
    });

    it('says which note is selected with a class the host may style by', async () => {
      create();
      await settle();
      board.select(['a']);
      expect(noteEl('a').classList.contains('wema-note-selected')).toBe(true);
      expect(noteEl('b').classList.contains('wema-note-selected')).toBe(false);
      // The accessories are inside the element of the note
      expect(noteEl('a').contains(accessoryEl('a'))).toBe(true);
      board.select([]);
      expect(noteEl('a').classList.contains('wema-note-selected')).toBe(false);
    });
  });

  describe('where the notes are stacked', () => {
    it('the column leaves room for it, and none under a note without any', async () => {
      create({ stacked: STACK });
      await settle();
      expect(top('a')).toBe(12);
      expect(top('b')).toBe(12 + 80 + ACCESSORY_HEIGHT + 16);
      expect(top('c')).toBe(12 + 80 + ACCESSORY_HEIGHT + 16 + 80 + ACCESSORY_HEIGHT + 16);
      expect(noteEl('a').style.height).toBe('80px');
    });

    it('takes no room where they are not, and is still there', async () => {
      create({ stacked: STACK });
      await settle();
      board.setStacked(null);
      await settle();
      expect([top('a'), top('b'), top('c')]).toEqual([0, 200, 400]);
      expect(accessoryEl('a').textContent).toBe('AI♥ 2');
    });

    it('is laid out again when the accessories come, change height or go', async () => {
      create({ stacked: STACK });
      await settle();
      info.delete('a');
      board.refreshNoteAccessory('a');
      await settle();
      expect(top('b')).toBe(12 + 80 + 16);

      info.set('a', { likes: 1 });
      board.refreshNoteAccessory('a');
      await settle();
      expect(top('b')).toBe(12 + 80 + ACCESSORY_HEIGHT + 16);
    });

    it('is not laid out again for what is drawn again as tall as it was', async () => {
      create({ stacked: STACK });
      await settle();
      const manager = (board as unknown as { noteManager: { placeNotes: () => unknown } }).noteManager;
      const placed = vi.spyOn(manager, 'placeNotes');

      // A count that arrives changes what is shown, not how tall it is
      info.set('a', { likes: 3, agent: true });
      board.refreshNoteAccessory('a');
      board.refreshNoteAccessory('gone');
      await settle();
      expect(accessoryEl('a').textContent).toBe('AI♥ 3');
      expect(placed).not.toHaveBeenCalled();

      // Gone, it is: the note below moves up
      info.delete('a');
      board.refreshNoteAccessory('a');
      await settle();
      expect(placed).toHaveBeenCalledTimes(1);
    });

    it('goes with the links to the connected notes, and with a footer of the host', async () => {
      create({ stacked: STACK, noteLinks: true });
      await settle();
      expect(accessoryEl('a').textContent).toBe('AI♥ 2');
      const links = underEl('a').querySelectorAll(':scope > .wema-note-footer .wema-note-link');
      expect(links).toHaveLength(1);
      // The accessories come first, the footer under them
      expect([...underEl('a').children].map((el) => el.className)).toEqual(['wema-note-accessory', 'wema-note-footer']);
      board.destroy();

      footers.set('a', 30);
      create({
        stacked: STACK,
        renderNoteFooter: (n, el) => {
          if (n.id !== 'a') return false;
          el.textContent = 'footer';
          return true;
        },
      });
      await settle();
      expect(accessoryEl('a').textContent).toBe('AI♥ 2');
      expect(underEl('a').querySelector(':scope > .wema-note-footer')!.textContent).toBe('footer');
      expect(top('b')).toBe(12 + 80 + ACCESSORY_HEIGHT + 30 + 16);
    });
  });
});
