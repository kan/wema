import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { WemaBoard } from '../src/board';
import type { WemaBoardOptions, WemaNote, WemaNoteDecoration } from '../src/types';

const note = (id: string, y: number, extra: Partial<WemaNote> = {}): WemaNote =>
  ({ id, x: 0, y, width: 200, height: 80, text: id, color: '#fff', zIndex: 1, ...extra });

describe('Classes and styles of the host on a note (decorateNote)', () => {
  let container: HTMLElement;
  let board: WemaBoard;
  /** How old each note is, outside the data (0: new, 1: about to go) */
  let age: Map<string, number>;
  /** The notes the host was asked to decorate, in order */
  let calls: string[];

  const noteEl = (id: string) => container.querySelector(`[data-note-id="${id}"]`) as HTMLElement;
  const settle = () => new Promise<void>((resolve) => queueMicrotask(resolve));

  const decorate = (n: WemaNote): WemaNoteDecoration | undefined => {
    calls.push(n.id);
    const a = age.get(n.id);
    if (a === undefined) return undefined;
    return {
      className: a > 0.5 ? 'old fading' : 'fading',
      style: { opacity: String(1 - a), '--fade': String(a) },
    };
  };

  function create(options: Partial<WemaBoardOptions> = {}): void {
    board = new WemaBoard({
      container,
      data: { version: 1, notes: [note('a', 0), note('b', 100)], edges: [] },
      decorateNote: decorate,
      ...options,
    });
  }

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    age = new Map([['a', 0.25], ['b', 0.75]]);
    calls = [];
  });

  afterEach(() => {
    board?.destroy();
    container.remove();
    vi.restoreAllMocks();
  });

  it('puts what it returns on the element of each note when the board is made', () => {
    create();
    expect(noteEl('a').classList.contains('fading')).toBe(true);
    expect(noteEl('a').classList.contains('old')).toBe(false);
    expect(noteEl('a').style.opacity).toBe('0.75');
    expect(noteEl('a').style.getPropertyValue('--fade')).toBe('0.25');
    expect(noteEl('b').classList.contains('old')).toBe(true);
    expect(noteEl('b').style.opacity).toBe('0.25');
  });

  it('keeps the classes and styles of the board itself', () => {
    create();
    const el = noteEl('a');
    expect(el.classList.contains('wema-note')).toBe(true);
    expect(el.style.zIndex).toBe('1');
    expect(el.style.top).toBe('0px');
    expect(el.style.getPropertyValue('--wema-note-color')).toBe('#fff');
  });

  it('takes off what it put on the last time when it is called again', () => {
    create();
    age.set('b', 0.1);
    board.refreshNoteDecoration('b');
    expect(noteEl('b').classList.contains('old')).toBe(false);
    expect(noteEl('b').classList.contains('fading')).toBe(true);
    expect(noteEl('b').style.opacity).toBe('0.9');

    age.delete('b');
    board.refreshNoteDecoration('b');
    expect(noteEl('b').classList.contains('fading')).toBe(false);
    expect(noteEl('b').style.opacity).toBe('');
    expect(noteEl('b').style.getPropertyValue('--fade')).toBe('');
    expect(noteEl('b').style.zIndex).toBe('1');
  });

  it('decorates all the notes again when no id is given', () => {
    create();
    calls = [];
    age.set('a', 0.5);
    age.set('b', 0.5);
    board.refreshNoteDecoration();
    expect(calls.sort()).toEqual(['a', 'b']);
    expect(noteEl('a').style.opacity).toBe('0.5');
    expect(noteEl('b').style.opacity).toBe('0.5');
  });

  it('does nothing for a note that does not exist', () => {
    create();
    calls = [];
    expect(() => board.refreshNoteDecoration('nope')).not.toThrow();
    expect(calls).toEqual([]);
  });

  it('is called when the text or meta changes, not when the note moves', () => {
    create();
    calls = [];
    board.updateNote('a', { x: 50, y: 50 });
    board.updateNote('a', { color: '#000' });
    expect(calls).toEqual([]);
    board.updateNote('a', { text: 'new' });
    board.updateNote('a', { meta: { k: 'v' } });
    expect(calls).toEqual(['a', 'a']);
  });

  it('is called by refreshNote()', () => {
    create();
    calls = [];
    board.refreshNote('a');
    expect(calls).toEqual(['a']);
  });

  it('decorates a note that is created, imported, applied from remote, or brought back by undo', async () => {
    create();
    age.set('c', 0.5);
    calls = [];
    const added = board.addNote({ text: 'x' });
    expect(calls).toEqual([added.id]);

    board.importData({ version: 1, notes: [note('c', 0)], edges: [] });
    expect(noteEl('c').style.opacity).toBe('0.5');

    board.applyRemote([{ type: 'note:create', note: note('d', 200) }]);
    age.set('d', 0.75);
    board.refreshNoteDecoration('d');
    expect(noteEl('d').style.opacity).toBe('0.25');

    board.deleteNote('c');
    await settle();
    expect(noteEl('c')).toBeNull();
    board.undo();
    expect(noteEl('c').style.opacity).toBe('0.5');
  });

  it('changes nothing in the data: no event, no history', async () => {
    create();
    await settle();
    const handler = vi.fn();
    board.on('note:update', handler);
    board.on('history:commit', handler);
    board.on('change', handler);
    const before = board.exportData();
    age.set('a', 0.9);
    board.refreshNoteDecoration();
    await settle();
    expect(handler).not.toHaveBeenCalled();
    expect(board.exportData()).toEqual(before);
  });

  it('works in readOnly, viewOnly and while the notes are stacked', () => {
    create({ readOnly: true });
    age.set('a', 0.5);
    board.refreshNoteDecoration('a');
    expect(noteEl('a').style.opacity).toBe('0.5');
    board.destroy();

    create({ viewOnly: true, stacked: { width: 300 } });
    expect(noteEl('b').style.opacity).toBe('0.25');
    age.set('b', 0);
    board.refreshNoteDecoration('b');
    expect(noteEl('b').style.opacity).toBe('1');
  });

  it('ignores the classes and styles that belong to the board, and values that are not strings', () => {
    age.clear();
    create({
      decorateNote: () => ({
        className: 'mine wema-note-selected  other',
        style: {
          left: '999px', 'z-index': '99', display: 'none', '--wema-note-color': 'red',
          opacity: 0.5 as unknown as string, '--ok': 'yes',
        },
      }),
    });
    const el = noteEl('a');
    expect(el.classList.contains('mine')).toBe(true);
    expect(el.classList.contains('other')).toBe(true);
    expect(el.classList.contains('wema-note-selected')).toBe(false);
    expect(el.style.left).toBe('0px');
    expect(el.style.zIndex).toBe('1');
    expect(el.style.display).toBe('');
    expect(el.style.getPropertyValue('--wema-note-color')).toBe('#fff');
    expect(el.style.opacity).toBe('');
    expect(el.style.getPropertyValue('--ok')).toBe('yes');
  });

  it('ignores the properties of the board in any case, and the shorthands that set them', () => {
    age.clear();
    let style: Record<string, string> = {
      Top: '999px', 'Z-INDEX': '99', inset: '0', 'inset-inline-start': '5px', all: 'unset',
      'block-size': '1px', Opacity: '0.5',
    };
    create({ decorateNote: () => ({ style }) });
    const el = noteEl('a');
    expect(el.style.top).toBe('0px');
    expect(el.style.left).toBe('0px');
    expect(el.style.zIndex).toBe('1');
    expect(el.style.height).toBe('80px');
    expect(el.style.opacity).toBe('0.5');
    // Taking them off again leaves the board's own
    style = {};
    board.refreshNoteDecoration('a');
    expect(el.style.opacity).toBe('');
    expect(el.style.top).toBe('0px');
    expect(el.style.left).toBe('0px');
    expect(el.style.zIndex).toBe('1');
  });

  it('keeps a class of the board that the host also returned when it takes its own off', () => {
    create({ decorateNote: () => ({ className: 'wema-note' }) });
    board.refreshNoteDecoration('a');
    expect(noteEl('a').classList.contains('wema-note')).toBe(true);
  });

  it('logs an error and takes the decoration off when the function throws', () => {
    create();
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    board.destroy();
    let fail = false;
    create({
      decorateNote: (n) => {
        if (fail) throw new Error('boom');
        return decorate(n);
      },
    });
    fail = true;
    expect(() => board.refreshNoteDecoration('a')).not.toThrow();
    expect(error).toHaveBeenCalled();
    expect(noteEl('a').classList.contains('fading')).toBe(false);
    expect(noteEl('a').style.opacity).toBe('');
    // Creating a note is not stopped by it
    expect(() => board.addNote({ text: 'x' })).not.toThrow();
  });

  it('keeps the decoration on a note that is selected', () => {
    create();
    board.select(['b']);
    expect(noteEl('b').classList.contains('wema-note-selected')).toBe(true);
    expect(noteEl('b').style.opacity).toBe('0.25');
  });
});
