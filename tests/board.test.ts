import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { WemaBoard } from '../src/board';
import type { WemaBoardData, WemaNote } from '../src/types';

describe('WemaBoard', () => {
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

  describe('Note CRUD', () => {
    it('addNote creates a note with defaults', () => {
      const note = board.addNote();
      expect(note.id).toBeTruthy();
      expect(note.width).toBe(200);
      expect(note.height).toBe(150);
      expect(note.color).toBe('#FFF9C4');
      expect(note.text).toBe('');
    });

    it('addNote accepts custom params', () => {
      const note = board.addNote({ x: 50, y: 60, text: 'Hello', color: '#F00' });
      expect(note.x).toBe(50);
      expect(note.y).toBe(60);
      expect(note.text).toBe('Hello');
      expect(note.color).toBe('#F00');
    });

    it('getNote returns a note by ID', () => {
      const note = board.addNote({ text: 'test' });
      const retrieved = board.getNote(note.id);
      expect(retrieved).toEqual(note);
    });

    it('getNote returns undefined for unknown ID', () => {
      expect(board.getNote('nonexistent')).toBeUndefined();
    });

    it('getNotes returns all notes', () => {
      board.addNote({ text: 'A' });
      board.addNote({ text: 'B' });
      const notes = board.getNotes();
      expect(notes).toHaveLength(2);
    });

    it('updateNote modifies a note', () => {
      const note = board.addNote({ text: 'old' });
      board.updateNote(note.id, { text: 'new' });
      const updated = board.getNote(note.id);
      expect(updated?.text).toBe('new');
    });

    it('deleteNote removes a note', () => {
      const note = board.addNote();
      board.deleteNote(note.id);
      expect(board.getNote(note.id)).toBeUndefined();
      expect(board.getNotes()).toHaveLength(0);
    });
  });

  describe('Events', () => {
    it('emits note:create on addNote', () => {
      const handler = vi.fn();
      board.on('note:create', handler);
      const note = board.addNote({ text: 'hi' });
      expect(handler).toHaveBeenCalledWith({ note: expect.objectContaining({ text: 'hi' }) });
    });

    it('emits note:update on updateNote', () => {
      const handler = vi.fn();
      const note = board.addNote({ text: 'before' });
      board.on('note:update', handler);
      board.updateNote(note.id, { text: 'after' });
      expect(handler).toHaveBeenCalledWith({
        note: expect.objectContaining({ text: 'after' }),
        prev: expect.objectContaining({ text: 'before' }),
      });
    });

    it('emits note:delete on deleteNote', () => {
      const handler = vi.fn();
      const note = board.addNote();
      board.on('note:delete', handler);
      board.deleteNote(note.id);
      expect(handler).toHaveBeenCalledWith({ note: expect.objectContaining({ id: note.id }) });
    });

    it('emits change event (coalesced via microtask)', async () => {
      const handler = vi.fn();
      board.on('change', handler);
      board.addNote();
      board.addNote();
      // change should not have fired yet (sync)
      expect(handler).not.toHaveBeenCalled();
      // Wait for microtask
      await Promise.resolve();
      expect(handler).toHaveBeenCalledOnce();
    });
  });

  describe('exportData / importData', () => {
    it('exports board data', () => {
      board.addNote({ text: 'A', x: 10, y: 20 });
      board.addNote({ text: 'B', x: 30, y: 40 });
      const data = board.exportData();
      expect(data.version).toBe(1);
      expect(data.notes).toHaveLength(2);
      expect(data.edges).toHaveLength(0);
    });

    it('exportData returns a deep clone', () => {
      board.addNote({ text: 'original' });
      const data = board.exportData();
      data.notes[0].text = 'mutated';
      expect(board.getNotes()[0].text).toBe('original');
    });

    it('importData restores board state', () => {
      const data: WemaBoardData = {
        version: 1,
        notes: [
          { id: 'n1', x: 10, y: 20, width: 200, height: 150, text: 'imported', color: '#FFF', zIndex: 1 },
        ],
        edges: [],
      };
      board.importData(data);
      const notes = board.getNotes();
      expect(notes).toHaveLength(1);
      expect(notes[0].text).toBe('imported');
      expect(notes[0].id).toBe('n1');
    });

    it('importData replaces existing notes', () => {
      board.addNote({ text: 'old' });
      board.addNote({ text: 'old2' });
      const data: WemaBoardData = {
        version: 1,
        notes: [
          { id: 'n1', x: 0, y: 0, width: 200, height: 150, text: 'new', color: '#FFF', zIndex: 1 },
        ],
        edges: [],
      };
      board.importData(data);
      expect(board.getNotes()).toHaveLength(1);
      expect(board.getNotes()[0].text).toBe('new');
    });
  });

  describe('Selection', () => {
    it('select and getSelection', () => {
      const n1 = board.addNote();
      const n2 = board.addNote();
      board.select([n1.id]);
      expect(board.getSelection()).toEqual([n1.id]);
      board.select([n1.id, n2.id]);
      expect(board.getSelection()).toHaveLength(2);
    });

    it('selectAll selects all notes', () => {
      board.addNote();
      board.addNote();
      board.addNote();
      board.selectAll();
      expect(board.getSelection()).toHaveLength(3);
    });

    it('deleting a selected note removes it from selection', () => {
      const note = board.addNote();
      board.select([note.id]);
      board.deleteNote(note.id);
      expect(board.getSelection()).toHaveLength(0);
    });
  });

  describe('destroy', () => {
    it('removes the board element from DOM', () => {
      expect(container.querySelector('.wema-board')).toBeTruthy();
      board.destroy();
      expect(container.querySelector('.wema-board')).toBeNull();
    });
  });

  describe('Options', () => {
    it('respects custom default note dimensions and color', () => {
      board.destroy();
      container.remove();
      const c2 = document.createElement('div');
      document.body.appendChild(c2);
      const b2 = new WemaBoard({
        container: c2,
        defaultNoteWidth: 300,
        defaultNoteHeight: 200,
        defaultNoteColor: '#FF0000',
      });
      const note = b2.addNote();
      expect(note.width).toBe(300);
      expect(note.height).toBe(200);
      expect(note.color).toBe('#FF0000');
      b2.destroy();
      c2.remove();
    });

    it('loads initial data from options', () => {
      board.destroy();
      container.remove();
      const c2 = document.createElement('div');
      document.body.appendChild(c2);
      const data: WemaBoardData = {
        version: 1,
        notes: [
          { id: 'init1', x: 0, y: 0, width: 200, height: 150, text: 'loaded', color: '#FFF', zIndex: 1 },
        ],
        edges: [],
      };
      const b2 = new WemaBoard({ container: c2, data });
      expect(b2.getNotes()).toHaveLength(1);
      expect(b2.getNotes()[0].text).toBe('loaded');
      b2.destroy();
      c2.remove();
    });
  });
});
