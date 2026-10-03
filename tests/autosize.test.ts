import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { WemaBoard } from '../src/board';
import type { WemaEventMap } from '../src/types';

describe('autoSize measurement', () => {
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
  });

  // Helper to flush microtask-based batch commit
  const flush = () => Promise.resolve();
  const nextFrame = () => new Promise((resolve) => requestAnimationFrame(resolve));

  /** jsdom does no layout: make the note element report this rendered size */
  function setRenderedSize(noteId: string, width: number, height: number): void {
    const el = container.querySelector(`[data-note-id="${noteId}"]`) as HTMLElement;
    Object.defineProperty(el, 'offsetWidth', { value: width, configurable: true });
    Object.defineProperty(el, 'offsetHeight', { value: height, configurable: true });
  }

  function contentOf(noteId: string): HTMLElement {
    return container.querySelector(`[data-note-id="${noteId}"] .wema-note-content`) as HTMLElement;
  }

  /** Type into a note: the text changes and the note is rendered at a new size */
  function type(noteId: string, text: string, width: number, height: number): void {
    contentOf(noteId).innerHTML = text;
    setRenderedSize(noteId, width, height);
    contentOf(noteId).dispatchEvent(new Event('input'));
  }

  function recordUpdates(): WemaEventMap['note:update'][] {
    const updates: WemaEventMap['note:update'][] = [];
    board.on('note:update', (p) => updates.push(p));
    return updates;
  }

  function recordCommits(): WemaEventMap['history:commit'][] {
    const commits: WemaEventMap['history:commit'][] = [];
    board.on('history:commit', (p) => commits.push(p));
    return commits;
  }

  describe('while typing', () => {
    it('updates the size in the model without emitting note:update', async () => {
      const note = board.addNote({ text: 'a', width: 100, height: 40, autoSize: true });
      await flush();
      const updates = recordUpdates();
      const commits = recordCommits();

      type(note.id, 'ab', 110, 40);
      type(note.id, 'abc', 120, 40);
      await flush();

      expect(board.getNote(note.id)).toEqual(expect.objectContaining({ width: 120, height: 40 }));
      expect(updates).toHaveLength(0);
      expect(commits).toHaveLength(0);
      expect(board.canUndo()).toBe(true); // only the creation of the note
      board.undo();
      expect(board.getNotes()).toHaveLength(0);
    });

    it('emits change with the measured size', async () => {
      const note = board.addNote({ text: 'a', width: 100, height: 40, autoSize: true });
      await flush();
      const handler = vi.fn();
      board.on('change', handler);

      type(note.id, 'ab', 110, 40);
      await flush();

      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler.mock.calls[0][0].data.notes[0]).toEqual(expect.objectContaining({ width: 110 }));
    });

    it('redraws the connected edges', async () => {
      const note = board.addNote({ x: 0, y: 0, text: 'a', width: 100, height: 40, autoSize: true });
      const other = board.addNote({ x: 400, y: 0, width: 100, height: 40 });
      board.addEdge(note.id, other.id);
      const path = container.querySelector('.wema-edge-path') as SVGPathElement;
      const before = path.getAttribute('d');

      type(note.id, 'a much longer text', 300, 40);

      expect(before).toBeTruthy();
      expect(path.getAttribute('d')).not.toBe(before);
    });
  });

  describe('on blur', () => {
    it('emits one note:update carrying the text and the size before typing', async () => {
      const note = board.addNote({ text: 'a', width: 100, height: 40, autoSize: true });
      await flush();
      const updates = recordUpdates();
      const commits = recordCommits();

      type(note.id, 'ab', 110, 40);
      type(note.id, 'abc', 120, 60);
      contentOf(note.id).dispatchEvent(new Event('blur'));
      await flush();

      expect(updates).toHaveLength(1);
      expect(updates[0].prev).toEqual(expect.objectContaining({ text: 'a', width: 100, height: 40 }));
      expect(updates[0].note).toEqual(expect.objectContaining({ text: 'abc', width: 120, height: 60 }));
      expect(commits).toHaveLength(1);
      expect(commits[0].deltas).toEqual([{
        type: 'note:update',
        noteId: note.id,
        before: { text: 'a', width: 100, height: 40 },
        after: { text: 'abc', width: 120, height: 60 },
      }]);
    });

    it('still records the text when the data was exported while typing', async () => {
      const note = board.addNote({ text: 'a', width: 100, height: 40, autoSize: true });
      await flush();
      const commits = recordCommits();

      type(note.id, 'abc', 120, 40);
      await flush(); // the measurement emits change, which exports the data
      expect(board.exportData().notes[0].text).toBe('abc');
      contentOf(note.id).dispatchEvent(new Event('blur'));
      await flush();

      expect(commits).toHaveLength(1);
      expect(commits[0].deltas).toEqual([{
        type: 'note:update',
        noteId: note.id,
        before: { text: 'a', width: 100 },
        after: { text: 'abc', width: 120 },
      }]);
    });

    it('still reports the size when a remote change arrived while typing', async () => {
      const note = board.addNote({ x: 0, text: 'a', width: 100, height: 40, autoSize: true });
      await flush();
      const updates = recordUpdates();
      const commits = recordCommits();
      // The note being typed in has focus, so a remote update keeps its content
      contentOf(note.id).tabIndex = 0; // jsdom does not treat contenteditable as focusable
      contentOf(note.id).focus();

      type(note.id, 'abc', 120, 40);
      board.applyRemote([{ type: 'note:update', noteId: note.id, before: { x: 0 }, after: { x: 300 } }]);
      contentOf(note.id).dispatchEvent(new Event('blur'));
      await flush();

      // The remote event shows only what the remote changed
      expect(updates[0].origin).toBe('remote');
      expect(updates[0].prev.width).toBe(updates[0].note.width);
      expect(commits).toHaveLength(1);
      expect(commits[0].deltas).toEqual([{
        type: 'note:update',
        noteId: note.id,
        before: { text: 'a', width: 100 },
        after: { text: 'abc', width: 120 },
      }]);
    });

    it('undoes the text and the size in one step', async () => {
      const note = board.addNote({ text: 'a', width: 100, height: 40, autoSize: true });
      await flush();
      type(note.id, 'abc', 120, 60);
      contentOf(note.id).dispatchEvent(new Event('blur'));
      await flush();

      // Undo renders the old text again, at the old size
      setRenderedSize(note.id, 100, 40);
      board.undo();

      expect(board.getNote(note.id)).toEqual(expect.objectContaining({ text: 'a', width: 100, height: 40 }));
      board.undo();
      expect(board.getNotes()).toHaveLength(0);
    });
  });

  describe('updateNote', () => {
    it('reports the measured size in the same event when autoSize is turned on', async () => {
      const note = board.addNote({ text: 'a', width: 200, height: 150 });
      await flush();
      const updates = recordUpdates();
      setRenderedSize(note.id, 90, 40);

      board.updateNote(note.id, { autoSize: true });
      await flush();

      expect(updates).toHaveLength(1);
      expect(updates[0].prev).toEqual(expect.objectContaining({ width: 200, height: 150 }));
      expect(updates[0].note).toEqual(expect.objectContaining({ autoSize: true, width: 90, height: 40 }));

      // Undo gives the fixed size back
      board.undo();
      expect(board.getNote(note.id)).toEqual(expect.objectContaining({ width: 200, height: 150 }));
      expect(board.getNote(note.id)!.autoSize).toBeFalsy();
    });

    it('does not measure on a move', () => {
      const note = board.addNote({ width: 100, height: 40, autoSize: true });
      setRenderedSize(note.id, 150, 50);

      board.updateNote(note.id, { x: 500 });

      expect(board.getNote(note.id)).toEqual(expect.objectContaining({ x: 500, width: 100, height: 40 }));
    });

    it('ignores a size of 0 (a note that is not laid out)', async () => {
      const note = board.addNote({ text: 'a', width: 100, height: 40, autoSize: true });
      setRenderedSize(note.id, 0, 0);

      board.updateNote(note.id, { text: 'b' });
      await nextFrame();

      expect(board.getNote(note.id)).toEqual(expect.objectContaining({ width: 100, height: 40 }));
    });
  });

  describe('after layout (requestAnimationFrame)', () => {
    it('updates the size without emitting note:update, and reports it in the next one', async () => {
      const note = board.addNote({ text: 'a', width: 100, height: 40, autoSize: true });
      setRenderedSize(note.id, 100, 40);
      board.updateNote(note.id, { color: '#fff' });
      await flush();
      const updates = recordUpdates();
      const changeHandler = vi.fn();
      board.on('change', changeHandler);

      // The layout settles later (e.g. an image finished loading)
      setRenderedSize(note.id, 100, 90);
      await nextFrame();
      await flush();

      expect(board.getNote(note.id)).toEqual(expect.objectContaining({ height: 90 }));
      expect(updates).toHaveLength(0);
      expect(changeHandler).toHaveBeenCalledTimes(1);

      board.updateNote(note.id, { x: 10 });
      expect(updates).toHaveLength(1);
      expect(updates[0].prev).toEqual(expect.objectContaining({ height: 40 }));
      expect(updates[0].note).toEqual(expect.objectContaining({ x: 10, height: 90 }));
    });
  });
});
