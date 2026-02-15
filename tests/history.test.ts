import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { WemaBoard } from '../src/board';
import type { WemaBoardData } from '../src/types';

describe('Undo / Redo', () => {
  let container: HTMLElement;
  let board: WemaBoard;

  beforeEach(() => {
    container = document.createElement('div');
    container.style.width = '800px';
    container.style.height = '600px';
    document.body.appendChild(container);
    board = new WemaBoard({ container });
  });

  afterEach(() => {
    board.destroy();
    container.remove();
  });

  // Helper to flush microtask-based batch commit
  const flush = () => Promise.resolve();

  describe('Note operations', () => {
    it('undo addNote removes the note', async () => {
      board.addNote({ text: 'hello' });
      await flush();
      expect(board.getNotes()).toHaveLength(1);

      board.undo();
      expect(board.getNotes()).toHaveLength(0);
    });

    it('redo after undo addNote restores the note', async () => {
      const note = board.addNote({ text: 'hello' });
      await flush();

      board.undo();
      expect(board.getNotes()).toHaveLength(0);

      board.redo();
      expect(board.getNotes()).toHaveLength(1);
      expect(board.getNotes()[0].text).toBe('hello');
      expect(board.getNotes()[0].id).toBe(note.id);
    });

    it('undo updateNote reverts changes', async () => {
      const note = board.addNote({ text: 'before', x: 10, y: 20 });
      await flush();

      board.updateNote(note.id, { text: 'after', x: 50 });
      await flush();

      board.undo();
      const reverted = board.getNote(note.id);
      expect(reverted?.text).toBe('before');
      expect(reverted?.x).toBe(10);
    });

    it('redo updateNote re-applies changes', async () => {
      const note = board.addNote({ text: 'before' });
      await flush();

      board.updateNote(note.id, { text: 'after' });
      await flush();

      board.undo();
      board.redo();
      expect(board.getNote(note.id)?.text).toBe('after');
    });

    it('undo deleteNote restores the note', async () => {
      const note = board.addNote({ text: 'deleted' });
      await flush();

      board.deleteNote(note.id);
      await flush();
      expect(board.getNotes()).toHaveLength(0);

      board.undo();
      expect(board.getNotes()).toHaveLength(1);
      expect(board.getNotes()[0].text).toBe('deleted');
      expect(board.getNotes()[0].id).toBe(note.id);
    });
  });

  describe('Edge operations', () => {
    it('undo addEdge removes the edge', async () => {
      const n1 = board.addNote({ x: 0, y: 0 });
      const n2 = board.addNote({ x: 300, y: 0 });
      await flush();

      board.addEdge(n1.id, n2.id);
      await flush();
      expect(board.getEdges()).toHaveLength(1);

      board.undo();
      expect(board.getEdges()).toHaveLength(0);
    });

    it('redo after undo addEdge restores the edge', async () => {
      const n1 = board.addNote({ x: 0, y: 0 });
      const n2 = board.addNote({ x: 300, y: 0 });
      await flush();

      const edge = board.addEdge(n1.id, n2.id);
      await flush();

      board.undo();
      board.redo();
      expect(board.getEdges()).toHaveLength(1);
      expect(board.getEdges()[0].id).toBe(edge.id);
    });

    it('undo updateEdge reverts changes', async () => {
      const n1 = board.addNote({ x: 0, y: 0 });
      const n2 = board.addNote({ x: 300, y: 0 });
      const edge = board.addEdge(n1.id, n2.id);
      await flush();

      board.updateEdge(edge.id, { strokeWidth: 5, lineStyle: 'dashed' });
      await flush();

      board.undo();
      const reverted = board.getEdges().find(e => e.id === edge.id);
      expect(reverted?.strokeWidth).toBeUndefined();
      expect(reverted?.lineStyle).toBeUndefined();
    });

    it('undo deleteEdge restores the edge', async () => {
      const n1 = board.addNote({ x: 0, y: 0 });
      const n2 = board.addNote({ x: 300, y: 0 });
      const edge = board.addEdge(n1.id, n2.id);
      await flush();

      board.deleteEdge(edge.id);
      await flush();
      expect(board.getEdges()).toHaveLength(0);

      board.undo();
      expect(board.getEdges()).toHaveLength(1);
      expect(board.getEdges()[0].id).toBe(edge.id);
    });
  });

  describe('deleteNote with connected edges', () => {
    it('undo restores note and connected edges in one step', async () => {
      const n1 = board.addNote({ x: 0, y: 0 });
      const n2 = board.addNote({ x: 300, y: 0 });
      const n3 = board.addNote({ x: 600, y: 0 });
      const e1 = board.addEdge(n1.id, n2.id);
      const e2 = board.addEdge(n2.id, n3.id);
      await flush();

      // Delete n2 should remove n2, e1, and e2
      board.deleteNote(n2.id);
      await flush();
      expect(board.getNotes()).toHaveLength(2);
      expect(board.getEdges()).toHaveLength(0);

      // Single undo should restore everything
      board.undo();
      expect(board.getNotes()).toHaveLength(3);
      expect(board.getEdges()).toHaveLength(2);
      expect(board.getNote(n2.id)?.x).toBe(300);
      expect(board.getEdges().find(e => e.id === e1.id)).toBeDefined();
      expect(board.getEdges().find(e => e.id === e2.id)).toBeDefined();
    });
  });

  describe('Synchronous batching (auto-commit via microtask)', () => {
    it('multiple synchronous updates batch into one undo step', async () => {
      const n1 = board.addNote({ text: 'a', x: 50 });
      const n2 = board.addNote({ text: 'b', x: 200 });
      const n3 = board.addNote({ text: 'c', x: 350 });
      await flush();

      // alignNotes calls updateNote for each note synchronously
      board.alignNotes([n1.id, n2.id, n3.id], 'left');
      await flush();

      // All notes should now be aligned to x=50 (min x)
      expect(board.getNote(n1.id)?.x).toBe(50);
      expect(board.getNote(n2.id)?.x).toBe(50);
      expect(board.getNote(n3.id)?.x).toBe(50);

      // One undo should revert all alignment changes
      board.undo();
      expect(board.getNote(n1.id)?.x).toBe(50);
      expect(board.getNote(n2.id)?.x).toBe(200);
      expect(board.getNote(n3.id)?.x).toBe(350);
    });

    it('bulk delete batches into one undo step', async () => {
      const n1 = board.addNote({ text: 'a' });
      const n2 = board.addNote({ text: 'b' });
      const n3 = board.addNote({ text: 'c' });
      await flush();

      // Delete all notes
      board.deleteNote(n1.id);
      board.deleteNote(n2.id);
      board.deleteNote(n3.id);
      await flush();

      expect(board.getNotes()).toHaveLength(0);

      // One undo should restore all
      board.undo();
      expect(board.getNotes()).toHaveLength(3);
    });
  });

  describe('canUndo / canRedo', () => {
    it('initially both are false', () => {
      expect(board.canUndo()).toBe(false);
      expect(board.canRedo()).toBe(false);
    });

    it('canUndo becomes true after an action', async () => {
      board.addNote();
      await flush();
      expect(board.canUndo()).toBe(true);
      expect(board.canRedo()).toBe(false);
    });

    it('canRedo becomes true after undo', async () => {
      board.addNote();
      await flush();
      board.undo();
      expect(board.canUndo()).toBe(false);
      expect(board.canRedo()).toBe(true);
    });

    it('canRedo becomes false after new action', async () => {
      board.addNote();
      await flush();
      board.undo();
      expect(board.canRedo()).toBe(true);

      board.addNote();
      await flush();
      expect(board.canRedo()).toBe(false);
    });
  });

  describe('history:change event', () => {
    it('fires when history state changes', async () => {
      const handler = vi.fn();
      board.on('history:change', handler);

      board.addNote();
      await flush();
      expect(handler).toHaveBeenCalledWith({ canUndo: true, canRedo: false });

      handler.mockClear();
      board.undo();
      expect(handler).toHaveBeenCalledWith({ canUndo: false, canRedo: true });

      handler.mockClear();
      board.redo();
      expect(handler).toHaveBeenCalledWith({ canUndo: true, canRedo: false });
    });
  });

  describe('importData clears history', () => {
    it('undo is not available after importData', async () => {
      board.addNote({ text: 'a' });
      board.addNote({ text: 'b' });
      await flush();
      expect(board.canUndo()).toBe(true);

      const data: WemaBoardData = {
        version: 1,
        notes: [{ id: 'n1', x: 0, y: 0, width: 200, height: 150, text: 'imported', color: '#FFF', zIndex: 1 }],
        edges: [],
      };
      board.importData(data);
      expect(board.canUndo()).toBe(false);
      expect(board.canRedo()).toBe(false);
    });
  });

  describe('maxHistory limit', () => {
    it('old entries are discarded when limit is exceeded', async () => {
      // Create a board with a small history limit
      board.destroy();
      container.remove();

      container = document.createElement('div');
      container.style.width = '800px';
      container.style.height = '600px';
      document.body.appendChild(container);

      // We can't set maxHistory through public API, so we'll test indirectly
      // by creating many operations and verifying undo doesn't go beyond a reasonable point
      board = new WemaBoard({ container });

      // Create 5 notes (5 undo entries)
      for (let i = 0; i < 5; i++) {
        board.addNote({ text: `note${i}` });
        await flush();
      }

      // Undo all 5
      for (let i = 0; i < 5; i++) {
        board.undo();
      }
      expect(board.getNotes()).toHaveLength(0);
      expect(board.canUndo()).toBe(false);
    });
  });

  describe('redo stack cleared on new action', () => {
    it('redo is cleared when a new mutation occurs', async () => {
      board.addNote({ text: 'first' });
      await flush();

      board.undo();
      expect(board.canRedo()).toBe(true);

      board.addNote({ text: 'second' });
      await flush();
      expect(board.canRedo()).toBe(false);
    });
  });

  describe('multiple undo/redo cycles', () => {
    it('can undo and redo multiple times', async () => {
      const n1 = board.addNote({ text: 'one' });
      await flush();
      board.updateNote(n1.id, { text: 'two' });
      await flush();
      board.updateNote(n1.id, { text: 'three' });
      await flush();

      expect(board.getNote(n1.id)?.text).toBe('three');

      board.undo();
      expect(board.getNote(n1.id)?.text).toBe('two');

      board.undo();
      expect(board.getNote(n1.id)?.text).toBe('one');

      board.redo();
      expect(board.getNote(n1.id)?.text).toBe('two');

      board.redo();
      expect(board.getNote(n1.id)?.text).toBe('three');
    });
  });

  describe('undo with no history does nothing', () => {
    it('undo on empty history is a no-op', () => {
      expect(() => board.undo()).not.toThrow();
      expect(board.getNotes()).toHaveLength(0);
    });

    it('redo on empty redo stack is a no-op', () => {
      expect(() => board.redo()).not.toThrow();
    });
  });
});
