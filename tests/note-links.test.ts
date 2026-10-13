import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { WemaBoard } from '../src/board';
import { jaLabels } from '../src/labels';
import { computeNoteLinks, firstLineOf } from '../src/note-links';
import type { WemaBoardOptions, WemaEdge, WemaEventMap, WemaNote } from '../src/types';

const note = (id: string, text = id, extra: Partial<WemaNote> = {}): WemaNote =>
  ({ id, x: 0, y: 0, width: 200, height: 80, text, color: '#fff', zIndex: 1, ...extra });
const edge = (id: string, from: string, to: string, extra: Partial<WemaEdge> = {}): WemaEdge =>
  ({ id, from, to, fromAnchor: 'auto', toAnchor: 'auto', style: 'arrow', ...extra });

describe('firstLineOf', () => {
  it('gives the first line of a plain text that has any text', () => {
    expect(firstLineOf('first\nsecond')).toBe('first');
    expect(firstLineOf('\n  \n second ')).toBe('second');
    expect(firstLineOf('')).toBe('');
    expect(firstLineOf(' \n​\n')).toBe('');
  });

  it('keeps a plain text as it is written (it is not HTML)', () => {
    expect(firstLineOf('a &amp; b < c')).toBe('a &amp; b < c');
  });

  it('reads the text of HTML, a line per block and per line break', () => {
    expect(firstLineOf('<div><b>bold</b> start</div><div>next</div>')).toBe('bold start');
    expect(firstLineOf('<p></p><ul><li>item one</li><li>item two</li></ul>')).toBe('item one');
    expect(firstLineOf('lead<br>rest')).toBe('lead');
    expect(firstLineOf('<div><br></div><div>a &amp; b</div>')).toBe('a & b');
    expect(firstLineOf('<img src="x.png"><div>after the image</div>')).toBe('after the image');
    expect(firstLineOf('<span>one</span>\n<span>two</span>')).toBe('one');
  });

  it('has no text for markup that shows none', () => {
    expect(firstLineOf('<img src="x.png">')).toBe('');
    expect(firstLineOf('<style>p { color: red }</style><script>alert(1)</script>')).toBe('');
    // What the note does not show (the sanitizer drops it) is not its text
    expect(firstLineOf('<noscript>hidden</noscript><object>hidden</object><p>shown</p>')).toBe('shown');
    expect(firstLineOf('<video src="a.mp4">No video support</video><div>Title</div>')).toBe('Title');
    expect(firstLineOf('<iframe src="https://example.com/">fallback</iframe><div>Title</div>')).toBe('Title');
    expect(firstLineOf('<span style="display:none">hidden</span><div>Title</div>')).toBe('Title');
  });

  it('runs and loads nothing of what it reads', () => {
    const win = window as unknown as Record<string, unknown>;
    win.__hit = 0;
    const created = vi.spyOn(document, 'createElement');
    expect(firstLineOf('<img src="x" onerror="window.__hit = 1"><script>window.__hit = 2</script><p>text</p>')).toBe('text');
    // Parsed into a document of its own: no element of this document is made
    expect(created).not.toHaveBeenCalled();
    expect(win.__hit).toBe(0);
    created.mockRestore();
  });
});

describe('computeNoteLinks', () => {
  const notes = new Map([note('a', 'A'), note('b', 'B'), note('c', 'C')].map((n) => [n.id, n]));
  const noteOf = (id: string) => notes.get(id);

  it('says which way each edge runs, seen from the note', () => {
    const edges = [
      edge('1', 'a', 'b'),
      edge('2', 'c', 'a'),
      edge('3', 'a', 'c', { arrowHead: 'start' }),
      edge('4', 'a', 'b', { arrowHead: 'both' }),
      edge('5', 'a', 'b', { style: 'line' }),
      edge('6', 'b', 'a', { arrowHead: 'none' }),
    ];
    expect(computeNoteLinks('a', edges, noteOf).map((l) => [l.edgeId, l.direction, l.peer])).toEqual([
      ['1', 'out', 'b'], ['2', 'in', 'c'], ['3', 'in', 'c'], ['4', 'both', 'b'], ['5', 'none', 'b'], ['6', 'none', 'b'],
    ]);
  });

  it('puts where the note leads first, in the order of the edges', () => {
    const edges = [edge('1', 'b', 'a'), edge('2', 'a', 'c'), edge('3', 'a', 'b', { style: 'line' }), edge('4', 'a', 'b')];
    expect(computeNoteLinks('a', edges, noteOf).map((l) => l.edgeId)).toEqual(['2', '4', '1', '3']);
  });

  it('leaves out an edge to a note that is not there, and one from the note to itself', () => {
    expect(computeNoteLinks('a', [edge('1', 'a', 'gone'), edge('2', 'a', 'a')], noteOf)).toEqual([]);
  });

  it('carries the label of the edge and the first line of the other note', () => {
    notes.set('d', note('d', '<div>Title</div><div>body</div>'));
    const [link] = computeNoteLinks('a', [edge('1', 'a', 'd', { label: ' because ' })], noteOf);
    expect(link).toEqual({ edgeId: '1', direction: 'out', peer: 'd', text: 'Title', label: 'because' });
    expect(computeNoteLinks('a', [edge('1', 'a', 'd', { label: '  ' })], noteOf)[0]).not.toHaveProperty('label');
  });

  it('takes the text the host gives for a note, and its own first line when it gives none', () => {
    notes.set('p', note('p', 'ignored', { meta: { page: 'home' } }));
    const text = (peer: WemaNote) => (peer.meta?.page ? `Page ${peer.meta.page}` : undefined);
    const links = computeNoteLinks('a', [edge('1', 'a', 'p'), edge('2', 'a', 'b')], noteOf, text);
    expect(links.map((l) => l.text)).toEqual(['Page home', 'B']);
  });

  it('keeps the first line when the host gives a text that is empty, or throws', () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    const text = (peer: WemaNote) => {
      if (peer.id === 'b') throw new Error('boom');
      return '  ';
    };
    const links = computeNoteLinks('a', [edge('1', 'a', 'b'), edge('2', 'a', 'c')], noteOf, text);
    expect(links.map((l) => l.text)).toEqual(['B', 'C']);
    expect(errors).toHaveBeenCalledTimes(1);
    errors.mockRestore();
  });
});

describe('The links under a stacked note (noteLinks)', () => {
  let container: HTMLElement;
  let board: WemaBoard;

  const STACK = { x: 12, y: 12, width: 351, gap: 16 };
  const data = () => ({
    version: 1 as const,
    notes: [
      note('a', 'Alpha', { y: 0 }),
      note('b', '<div>Beta</div><div>more</div>', { y: 200 }),
      note('c', 'Gamma', { y: 400 }),
      note('d', 'Alone', { y: 600 }),
    ],
    edges: [edge('ab', 'a', 'b'), edge('ca', 'c', 'a', { label: 'why' })],
  });

  function create(options: Partial<WemaBoardOptions> = {}): void {
    board = new WemaBoard({ container, data: data(), stacked: STACK, noteLinks: true, ...options });
  }

  beforeEach(() => {
    vi.useFakeTimers({
      toFake: ['requestAnimationFrame', 'cancelAnimationFrame', 'performance', 'setTimeout', 'clearTimeout'],
    });
    container = document.createElement('div');
    document.body.appendChild(container);
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
  const noteEl = (id: string) => container.querySelector(`[data-note-id="${id}"]`) as HTMLElement;
  const linksOf = (id: string) => [...noteEl(id).querySelectorAll<HTMLButtonElement>(':scope > .wema-note-under > .wema-note-footer .wema-note-link')];
  /** What the links of a note show: the text of each */
  const shown = (id: string) => linksOf(id).map((link) => link.textContent);

  function record<K extends keyof WemaEventMap>(event: K): WemaEventMap[K][] {
    const payloads: WemaEventMap[K][] = [];
    board.on(event, (p) => payloads.push(p));
    return payloads;
  }

  it('shows the notes each note is connected to, and nothing under a note without edges', async () => {
    create();
    await settle();
    expect(shown('a')).toEqual(['→Beta', '←whyGamma']);
    expect(shown('b')).toEqual(['←Alpha']);
    expect(shown('c')).toEqual(['→whyAlpha']);
    expect(shown('d')).toEqual([]);
    expect(noteEl('d').classList.contains('wema-note-has-footer')).toBe(false);
    const [, labeled] = linksOf('a');
    expect([...labeled.children].map((el) => el.className)).toEqual([
      'wema-note-link-arrow', 'wema-note-link-label', 'wema-note-link-text',
    ]);
  });

  it('is off unless asked for, and not shown while the notes are not stacked', async () => {
    create({ noteLinks: undefined });
    await settle();
    expect(container.querySelector('.wema-note-link')).toBeNull();
    board.destroy();

    create({ stacked: undefined });
    await settle();
    expect(container.querySelector('.wema-note-link')).toBeNull();
    board.setStacked(STACK);
    await settle();
    expect(shown('b')).toEqual(['←Alpha']);
    board.setStacked(null);
    expect(container.querySelector('.wema-note-link')).toBeNull();
  });

  it('puts the text of the other note in as text', async () => {
    create();
    board.applyRemote([{
      type: 'note:update', noteId: 'b', before: {}, after: { text: '<div><img src="x" onerror="alert(1)"><b>Bold</b> &lt;i&gt;</div>' },
    }]);
    await settle();
    const [link] = linksOf('a');
    expect(link.querySelector('.wema-note-link-text')!.textContent).toBe('Bold <i>');
    expect(link.querySelector('img, b, i')).toBeNull();
  });

  it('says what a link is to a screen reader, in the language of the labels', async () => {
    create();
    await settle();
    expect(linksOf('a').map((link) => link.getAttribute('aria-label'))).toEqual([
      'Connects to: Beta', 'Connected from: Gamma (why)',
    ]);
    board.destroy();

    create({ labels: jaLabels });
    board.updateNote('b', { text: '' });
    await settle();
    expect(linksOf('a').map((link) => link.getAttribute('aria-label'))).toEqual([
      'つながり先: （本文なし）', 'つながり元: Gamma（why）',
    ]);
    expect(shown('a')[0]).toBe('→（本文なし）');
  });

  it('draws the links again when an edge is made, changed or deleted', async () => {
    create();
    await settle();

    const made = board.addEdge('d', 'a');
    await settle();
    expect(shown('d')).toEqual(['→Alpha']);
    expect(shown('a')).toEqual(['→Beta', '←whyGamma', '←Alone']);

    board.updateEdge(made.id, { arrowHead: 'both', label: 'pair' });
    await settle();
    expect(shown('d')).toEqual(['↔pairAlpha']);

    board.deleteEdge(made.id);
    await settle();
    expect(shown('d')).toEqual([]);
    expect(shown('a')).toEqual(['→Beta', '←whyGamma']);
  });

  it('draws them again when the text of the other note changes, also by typing and by a remote change', async () => {
    create();
    await settle();

    board.updateNote('b', { text: 'Renamed' });
    await settle();
    expect(shown('a')[0]).toBe('→Renamed');

    const content = noteEl('b').querySelector('.wema-note-content') as HTMLElement;
    content.textContent = 'Typed';
    content.dispatchEvent(new Event('input', { bubbles: true }));
    content.dispatchEvent(new FocusEvent('blur'));
    await settle();
    expect(shown('a')[0]).toBe('→Typed');

    board.applyRemote([{ type: 'note:update', noteId: 'b', before: {}, after: { text: 'Remote' } }]);
    await settle();
    expect(shown('a')[0]).toBe('→Remote');
  });

  it('draws them again when a note is deleted or comes back', async () => {
    create();
    await settle();
    board.deleteNote('b');
    await settle();
    expect(shown('a')).toEqual(['←whyGamma']);
    board.undo();
    await settle();
    expect(shown('a')).toEqual(['→Beta', '←whyGamma']);
  });

  it('a link to a note that is hidden cannot be pressed, until the note is shown again', async () => {
    create();
    await settle();
    board.setNoteFilter(['a', 'c', 'd']);
    await settle();
    expect(linksOf('a').map((link) => link.disabled)).toEqual([true, false]);
    board.setNoteFilter(null);
    await settle();
    expect(linksOf('a').map((link) => link.disabled)).toEqual([false, false]);
  });

  it('pressing a link brings the note into view and marks it, without selecting anything', async () => {
    create();
    await settle();
    const reveal = vi.spyOn(board, 'revealNotes');
    const [toBeta] = linksOf('a');

    toBeta.click();
    expect(reveal).toHaveBeenCalledWith(['b'], { padding: undefined });
    expect(noteEl('b').classList.contains('wema-note-link-target')).toBe(true);
    expect(board.getSelection()).toEqual([]);

    // Pressed again before the mark is gone: it lasts from the second press
    vi.advanceTimersByTime(1000);
    toBeta.click();
    vi.advanceTimersByTime(1000);
    expect(noteEl('b').classList.contains('wema-note-link-target')).toBe(true);
    vi.advanceTimersByTime(400);
    expect(noteEl('b').classList.contains('wema-note-link-target')).toBe(false);
  });

  it('keeps the space the host asks for around the note a link leads to', async () => {
    create({ noteLinks: { padding: 60 } });
    await settle();
    const reveal = vi.spyOn(board, 'revealNotes');
    linksOf('a')[0].click();
    expect(reveal).toHaveBeenCalledWith(['b'], { padding: 60 });
    board.destroy();

    // Not a distance: the padding of revealNotes() is kept
    create({ noteLinks: { padding: -1 } });
    await settle();
    const again = vi.spyOn(board, 'revealNotes');
    linksOf('a')[0].click();
    expect(again).toHaveBeenCalledWith(['b'], { padding: undefined });
  });

  it('takes the text for a note from the host, and draws again when its meta changes or the host asks', async () => {
    const titles = new Map([['home', 'Home page']]);
    create({ noteLinks: { text: (peer) => (peer.meta?.page ? titles.get(peer.meta.page) : undefined) } });
    await settle();
    expect(shown('a')[0]).toBe('→Beta');

    board.updateNote('b', { meta: { page: 'home' } });
    await settle();
    expect(shown('a')[0]).toBe('→Home page');

    // Something outside the board changed for that note: the host says so,
    // and the notes that show it are drawn again
    titles.set('home', 'Start');
    board.refreshNote('b');
    await settle();
    expect(shown('a')[0]).toBe('→Start');
  });

  it('keeps the focus on the link of the same edge when the links are drawn again', async () => {
    create();
    await settle();
    linksOf('a')[1].focus();
    expect(document.activeElement).toBe(linksOf('a')[1]);

    board.applyRemote([{ type: 'note:update', noteId: 'c', before: {}, after: { text: 'Renamed' } }]);
    await settle();
    const again = linksOf('a')[1];
    expect(again.textContent).toBe('←whyRenamed');
    expect(document.activeElement).toBe(again);

    // The edge is gone: the focus is not put on another link
    board.deleteEdge('ca');
    await settle();
    expect(linksOf('a')).toHaveLength(1);
    expect(document.activeElement).not.toBe(linksOf('a')[0]);
  });

  it('reads the text of a note again only when it changed', async () => {
    create();
    await settle();
    const parse = vi.spyOn(DOMParser.prototype, 'parseFromString');
    // The edge to b is drawn again under a: b was read when the notes were stacked
    board.updateEdge('ab', { label: 'x' });
    await settle();
    expect(shown('a')[0]).toBe('→xBeta');
    expect(parse).not.toHaveBeenCalled();
  });

  it('looks nothing up while the notes are not stacked', async () => {
    create({ stacked: undefined });
    await settle();
    const lookup = vi.spyOn(board, 'getEdgesOf');
    const internal = vi.spyOn((board as unknown as { edgeManager: { getEdgesOf: () => unknown } }).edgeManager, 'getEdgesOf');
    board.updateNote('b', { text: 'Renamed' });
    board.setNoteFilter(['a']);
    await settle();
    expect(lookup).not.toHaveBeenCalled();
    expect(internal).not.toHaveBeenCalled();
  });

  it('leaves the drawing to renderNoteFooter when both are given', async () => {
    create({ renderNoteFooter: (_note, el) => { el.textContent = 'mine'; return true; } });
    await settle();
    expect(container.querySelector('.wema-note-link')).toBeNull();
    expect(noteEl('a').querySelector(':scope > .wema-note-under > .wema-note-footer')!.textContent).toBe('mine');
  });

  it('changes nothing in the data, and emits nothing', async () => {
    create({ stacked: undefined });
    await settle();
    const before = board.exportData();
    const events = [record('note:update'), record('note:measure'), record('history:commit'), record('change')];
    board.setStacked(STACK);
    await settle();
    linksOf('a')[0].click();
    await settle();
    expect(events.flat()).toEqual([]);
    expect(board.exportData()).toEqual(before);
  });
});
