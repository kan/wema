import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { WemaBoard } from '../src/board';
import type { WemaNote } from '../src/types';

describe('Note filter', () => {
  let container: HTMLElement;
  let board: WemaBoard;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    board = new WemaBoard({ container });
  });

  afterEach(() => {
    board.destroy();
    container.remove();
    vi.restoreAllMocks();
  });

  // Helper to flush microtask-based batch commit
  const flush = () => Promise.resolve();

  const noteEl = (id: string): HTMLElement =>
    container.querySelector(`[data-note-id="${id}"]`) as HTMLElement;
  const isShown = (id: string): boolean => noteEl(id).style.display !== 'none';
  const edgeGroups = (): SVGGElement[] => Array.from(container.querySelectorAll('.wema-edge-group'));

  /** a -> b -> c, plus d on its own */
  function createChain(): { a: WemaNote; b: WemaNote; c: WemaNote; d: WemaNote } {
    const a = board.addNote({ x: 0, y: 0 });
    const b = board.addNote({ x: 300, y: 0 });
    const c = board.addNote({ x: 600, y: 0 });
    const d = board.addNote({ x: 0, y: 300 });
    board.addEdge(a.id, b.id);
    board.addEdge(b.id, c.id);
    return { a, b, c, d };
  }

  describe('setNoteFilter', () => {
    it('shows only the given notes', () => {
      const { a, b, c, d } = createChain();

      board.setNoteFilter([a.id, b.id]);

      expect([a, b, c, d].map((n) => isShown(n.id))).toEqual([true, true, false, false]);
      expect(board.getNoteFilter()).toEqual([a.id, b.id]);
    });

    it('hides the edges connected to a hidden note', () => {
      const { a, b } = createChain();

      board.setNoteFilter([a.id, b.id]);

      // a -> b stays, b -> c goes
      expect(edgeGroups().map((g) => g.style.display)).toEqual(['', 'none']);
    });

    it('shows everything again when cleared with null', () => {
      const { a, b, c, d } = createChain();
      board.setNoteFilter([a.id]);

      board.setNoteFilter(null);

      expect([a, b, c, d].map((n) => isShown(n.id))).toEqual([true, true, true, true]);
      expect(edgeGroups().map((g) => g.style.display)).toEqual(['', '']);
      expect(board.getNoteFilter()).toBeNull();
    });

    it('hides every note for an empty list', () => {
      const { a, b, c, d } = createChain();

      board.setNoteFilter([]);

      expect([a, b, c, d].map((n) => isShown(n.id))).toEqual([false, false, false, false]);
    });

    it('does not change the data, emit note/edge events or record history', async () => {
      const { a } = createChain();
      await flush();
      const before = board.exportData();
      const handler = vi.fn();
      for (const event of ['note:update', 'note:delete', 'edge:update', 'edge:delete', 'history:commit', 'change'] as const) {
        board.on(event, handler);
      }

      board.setNoteFilter([a.id]);
      await flush();

      expect(handler).not.toHaveBeenCalled();
      expect(board.exportData()).toEqual(before);
      expect(board.getNotes()).toHaveLength(4);
      expect(board.getEdges()).toHaveLength(2);

      // The last undo step is still the creation of the chain
      board.undo();
      expect(board.getEdges()).toHaveLength(0);
    });

    it('works in readOnly and viewOnly', () => {
      const { a, b } = createChain();

      board.setReadOnly(true);
      board.setNoteFilter([a.id]);
      expect(isShown(b.id)).toBe(false);

      board.setReadOnly(false);
      board.setViewOnly(true);
      board.setNoteFilter([b.id]);
      expect([isShown(a.id), isShown(b.id)]).toEqual([false, true]);
    });

    it('is cleared by importData', () => {
      const { a, b } = createChain();
      board.setNoteFilter([a.id]);

      board.importData(board.exportData());

      expect(board.getNoteFilter()).toBeNull();
      expect(isShown(b.id)).toBe(true);
    });
  });

  describe('selection', () => {
    it('drops hidden notes from the selection', () => {
      const { a, b, c } = createChain();
      board.select([a.id, b.id, c.id]);
      const handler = vi.fn();
      board.on('note:select', handler);

      board.setNoteFilter([a.id]);

      expect(board.getSelection()).toEqual([a.id]);
      expect(handler).toHaveBeenCalledWith({ noteIds: [a.id] });
      expect(noteEl(b.id).classList.contains('wema-note-selected')).toBe(false);
    });

    it('does not select hidden notes', () => {
      const { a, b, c, d } = createChain();
      board.setNoteFilter([a.id, d.id]);

      board.selectAll();
      expect(board.getSelection().sort()).toEqual([a.id, d.id].sort());

      board.select([b.id, c.id]);
      expect(board.getSelection()).toEqual([]);
    });

    it('deselects a selected note when a collapsed edge hides it', () => {
      const { a, b } = createChain();
      board.select([a.id, b.id]);

      board.updateEdge(board.getEdges()[0].id, { collapsed: true }); // hides b and c

      expect(board.getSelection()).toEqual([a.id]);
    });

    it('deselects the selected edge when it becomes hidden', () => {
      const { a, b } = createChain();
      const [first, second] = board.getEdges();
      const internals = board as unknown as { edgeManager: { selectEdge(id: string): void } };

      // b -> c is hidden by the filter
      internals.edgeManager.selectEdge(second.id);
      board.setNoteFilter([a.id, b.id]);
      expect(board.getSelectedEdge()).toBeNull();

      // a -> b stays visible, so it stays selected
      internals.edgeManager.selectEdge(first.id);
      board.setNoteFilter([a.id, b.id]);
      expect(board.getSelectedEdge()).toBe(first.id);

      // b -> c is hidden by collapsing a -> b
      board.setNoteFilter(null);
      internals.edgeManager.selectEdge(second.id);
      board.updateEdge(first.id, { collapsed: true });
      expect(board.getSelectedEdge()).toBeNull();
    });

    it('does not select notes hidden by a collapsed edge either', () => {
      const { a, b, c, d } = createChain();
      board.updateEdge(board.getEdges()[0].id, { collapsed: true }); // hides b and c

      board.selectAll();

      expect(board.getSelection().sort()).toEqual([a.id, d.id].sort());
      expect([isShown(b.id), isShown(c.id)]).toEqual([false, false]);
    });
  });

  describe('with collapsed edges', () => {
    it('keeps a collapsed subtree hidden while the filter includes it', () => {
      const { a, b, c } = createChain();
      board.updateEdge(board.getEdges()[1].id, { collapsed: true }); // b -> c collapsed: hides c

      board.setNoteFilter([a.id, b.id, c.id]);
      expect([isShown(a.id), isShown(b.id), isShown(c.id)]).toEqual([true, true, false]);

      // Clearing the filter leaves the collapse as it was
      board.setNoteFilter(null);
      expect(isShown(c.id)).toBe(false);
    });

    it('ignores a collapsed edge whose source the filter hides', () => {
      const { a, b, c } = createChain();
      board.updateEdge(board.getEdges()[0].id, { collapsed: true }); // a -> b collapsed: hides b and c

      // a is filtered out, so its collapse (which has no button now) must not hide b and c
      board.setNoteFilter([b.id, c.id]);

      expect([isShown(a.id), isShown(b.id), isShown(c.id)]).toEqual([false, true, true]);
      expect(edgeGroups().map((g) => g.style.display)).toEqual(['none', '']);
    });

    it('shows no collapse button for edges hidden by the filter', () => {
      const { a, b } = createChain();
      const button = (id: string): HTMLElement =>
        noteEl(id).querySelector('.wema-note-collapse-btn[data-side="right"]') as HTMLElement;
      expect(button(b.id).style.display).toBe('');

      board.setNoteFilter([a.id, b.id]); // b -> c is hidden

      expect(button(a.id).style.display).toBe('');
      expect(button(b.id).style.display).toBe('none');
    });
  });

  describe('notes added while filtering', () => {
    it('shows a note created on this board', () => {
      const { a, b } = createChain();
      board.setNoteFilter([a.id]);

      const created = board.addNote({ x: 0, y: 500 });

      expect(isShown(created.id)).toBe(true);
      expect(isShown(b.id)).toBe(false);
      expect(board.getNoteFilter()).toEqual([a.id, created.id]);
    });

    it('does not add a note that comes back from undo or redo', async () => {
      const { a } = createChain();
      await flush();
      const x = board.addNote({ x: 0, y: 500 });
      await flush();
      board.setNoteFilter([a.id]);

      board.undo(); // removes the hidden x
      board.redo(); // brings it back

      expect(board.getNote(x.id)).toBeDefined();
      expect(isShown(x.id)).toBe(false);
      expect(board.getNoteFilter()).toEqual([a.id]);
    });

    it('lays out only the shown notes with autoLayout()', () => {
      const { a, b, d } = createChain();
      board.updateNote(d.id, { x: 777, y: 888 });
      board.setNoteFilter([a.id, b.id]);

      board.autoLayout();

      expect(board.getNote(d.id)).toEqual(expect.objectContaining({ x: 777, y: 888 }));
      expect(board.getNote(b.id)!.y).toBeGreaterThan(board.getNote(a.id)!.y);
    });

    it('keeps a note added by applyRemote hidden', () => {
      const { a } = createChain();
      board.setNoteFilter([a.id]);

      board.applyRemote([{
        type: 'note:create',
        note: { id: 'remote-1', x: 0, y: 500, width: 200, height: 150, text: '', color: '#fff', zIndex: 1 },
      }]);

      expect(isShown('remote-1')).toBe(false);
      expect(board.getNote('remote-1')).toBeDefined();

      board.setNoteFilter([a.id, 'remote-1']);
      expect(isShown('remote-1')).toBe(true);
    });
  });
});

describe('onLinkClick', () => {
  let container: HTMLElement;
  let open: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    open = vi.spyOn(window, 'open').mockImplementation(() => null);
    // The click bubbles to the board, whose edge hit test needs this; jsdom has no layout
    document.elementsFromPoint = () => [];
  });

  afterEach(() => {
    container.remove();
    vi.restoreAllMocks();
    delete (document as Partial<Document>).elementsFromPoint;
  });

  function clickLink(board: WemaBoard, href: string): MouseEvent {
    board.importData({
      version: 1,
      notes: [{ id: 'n1', x: 0, y: 0, width: 200, height: 150, text: `<a href="${href}">link <b>text</b></a>`, color: '#fff', zIndex: 1 }],
      edges: [],
    });
    const event = new MouseEvent('click', { bubbles: true, cancelable: true });
    (container.querySelector('.wema-note-content a b') as HTMLElement).dispatchEvent(event);
    return event;
  }

  it('opens the link in a new tab when no handler is given', () => {
    const board = new WemaBoard({ container });

    clickLink(board, 'https://example.com/a');

    expect(open).toHaveBeenCalledWith('https://example.com/a', '_blank', 'noopener');
    board.destroy();
  });

  it('does not open a new tab when the handler returns true', () => {
    const onLinkClick = vi.fn().mockReturnValue(true);
    const board = new WemaBoard({ container, onLinkClick });

    const event = clickLink(board, '/p/home');

    expect(onLinkClick).toHaveBeenCalledWith(`${location.origin}/p/home`, event);
    expect(event.defaultPrevented).toBe(true);
    expect(open).not.toHaveBeenCalled();
    board.destroy();
  });

  it('passes the resolved URL, so links to another site cannot pass for a path', () => {
    const onLinkClick = vi.fn().mockReturnValue(false);
    const board = new WemaBoard({ container, onLinkClick });

    // These start with "/" but the browser resolves them to another host
    for (const href of ['//other.example/x', '/\\other.example/x', '\\\\other.example/x']) {
      clickLink(board, href);
    }

    const urls = onLinkClick.mock.calls.map(([url]) => new URL(url as string));
    expect(urls.map((url) => url.host)).toEqual(['other.example', 'other.example', 'other.example']);
    expect(urls.every((url) => url.origin !== location.origin)).toBe(true);
    board.destroy();
  });

  it('resolves a relative link against the page', () => {
    const onLinkClick = vi.fn().mockReturnValue(true);
    const board = new WemaBoard({ container, onLinkClick });

    clickLink(board, 'p/home?x=1#top');

    expect(onLinkClick.mock.calls[0][0]).toBe(new URL('p/home?x=1#top', document.baseURI).href);
    board.destroy();
  });

  it('opens a new tab when the handler returns nothing or false', () => {
    const board = new WemaBoard({ container, onLinkClick: () => undefined });
    clickLink(board, 'https://example.com/a');
    expect(open).toHaveBeenCalledTimes(1);
    board.destroy();

    const other = new WemaBoard({ container, onLinkClick: () => false });
    clickLink(other, 'https://example.com/b');
    expect(open).toHaveBeenCalledTimes(2);
    other.destroy();
  });

  it('does not call the handler for an unsafe URL', () => {
    const onLinkClick = vi.fn().mockReturnValue(false);
    const board = new WemaBoard({ container, onLinkClick });
    const note = board.addNote();
    // Put the link in the DOM directly: the sanitizer would already remove this href
    const content = container.querySelector(`[data-note-id="${note.id}"] .wema-note-content`) as HTMLElement;
    const link = document.createElement('a');
    // eslint-disable-next-line no-script-url
    link.setAttribute('href', 'javascript:alert(1)');
    content.appendChild(link);

    link.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

    expect(onLinkClick).not.toHaveBeenCalled();
    expect(open).not.toHaveBeenCalled();
    board.destroy();
  });

  it('is called in readOnly and viewOnly', () => {
    const onLinkClick = vi.fn().mockReturnValue(true);
    const board = new WemaBoard({ container, onLinkClick, readOnly: true });
    clickLink(board, '/p/a');
    board.setReadOnly(false);
    board.setViewOnly(true);
    (container.querySelector('.wema-note-content a') as HTMLElement)
      .dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

    expect(onLinkClick).toHaveBeenCalledTimes(2);
    board.destroy();
  });
});
