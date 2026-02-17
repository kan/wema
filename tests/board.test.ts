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

  describe('Rich text (HTML)', () => {
    it('renders plain text notes with backward compatibility', () => {
      const note = board.addNote({ text: 'Hello world' });
      const noteEl = container.querySelector(`[data-note-id="${note.id}"]`);
      const content = noteEl?.querySelector('.wema-note-content') as HTMLElement;
      expect(content?.innerHTML).toBe('Hello world');
    });

    it('escapes HTML entities in plain text', () => {
      const note = board.addNote({ text: 'A & B < C > D' });
      const noteEl = container.querySelector(`[data-note-id="${note.id}"]`);
      const content = noteEl?.querySelector('.wema-note-content') as HTMLElement;
      expect(content?.innerHTML).toBe('A &amp; B &lt; C &gt; D');
    });

    it('strips script tags from HTML text', () => {
      const note = board.addNote({ text: '<b>safe</b><script>alert("xss")</script>' });
      const noteEl = container.querySelector(`[data-note-id="${note.id}"]`);
      const content = noteEl?.querySelector('.wema-note-content') as HTMLElement;
      expect(content?.innerHTML).not.toContain('script');
      expect(content?.innerHTML).toContain('<b>safe</b>');
    });

    it('renders HTML text with allowed tags', () => {
      const note = board.addNote({ text: '<b>bold</b> text' });
      const noteEl = container.querySelector(`[data-note-id="${note.id}"]`);
      const content = noteEl?.querySelector('.wema-note-content') as HTMLElement;
      expect(content?.innerHTML).toBe('<b>bold</b> text');
    });

    it('sanitizes dangerous HTML on render', () => {
      const note = board.addNote({ text: '<b onclick="alert(1)">bold</b>' });
      const noteEl = container.querySelector(`[data-note-id="${note.id}"]`);
      const content = noteEl?.querySelector('.wema-note-content') as HTMLElement;
      expect(content?.innerHTML).not.toContain('onclick');
      expect(content?.innerHTML).toContain('<b>bold</b>');
    });

    it('exports and imports HTML text correctly', () => {
      board.addNote({ text: '<b>bold</b> and <i>italic</i>' });
      const data = board.exportData();
      expect(data.notes[0].text).toContain('<b>bold</b>');

      board.importData(data);
      const notes = board.getNotes();
      expect(notes[0].text).toContain('<b>bold</b>');
    });

    it('handles updateNote with HTML text', () => {
      const note = board.addNote({ text: 'plain' });
      board.updateNote(note.id, { text: '<b>updated</b>' });
      const noteEl = container.querySelector(`[data-note-id="${note.id}"]`);
      const content = noteEl?.querySelector('.wema-note-content') as HTMLElement;
      expect(content?.innerHTML).toBe('<b>updated</b>');
    });
  });

  describe('autoSize', () => {
    it('addNote with autoSize stores the flag', () => {
      const note = board.addNote({ autoSize: true });
      expect(note.autoSize).toBe(true);
      const retrieved = board.getNote(note.id);
      expect(retrieved?.autoSize).toBe(true);
    });

    it('addNote without autoSize defaults to undefined', () => {
      const note = board.addNote();
      expect(note.autoSize).toBeUndefined();
    });

    it('updateNote can toggle autoSize on and off', () => {
      const note = board.addNote();
      board.updateNote(note.id, { autoSize: true });
      expect(board.getNote(note.id)?.autoSize).toBe(true);
      board.updateNote(note.id, { autoSize: false });
      expect(board.getNote(note.id)?.autoSize).toBe(false);
    });

    it('adds wema-auto-size class when autoSize is true', () => {
      const note = board.addNote({ autoSize: true });
      const noteEl = container.querySelector(`[data-note-id="${note.id}"]`);
      expect(noteEl?.classList.contains('wema-auto-size')).toBe(true);
    });

    it('removes wema-auto-size class when autoSize is turned off', () => {
      const note = board.addNote({ autoSize: true });
      board.updateNote(note.id, { autoSize: false });
      const noteEl = container.querySelector(`[data-note-id="${note.id}"]`);
      expect(noteEl?.classList.contains('wema-auto-size')).toBe(false);
    });

    it('exports and imports autoSize flag', () => {
      board.addNote({ text: 'auto', autoSize: true });
      board.addNote({ text: 'manual' });
      const data = board.exportData();
      expect(data.notes.find(n => n.text === 'auto')?.autoSize).toBe(true);
      expect(data.notes.find(n => n.text === 'manual')?.autoSize).toBeUndefined();

      board.importData(data);
      const notes = board.getNotes();
      expect(notes.find(n => n.text === 'auto')?.autoSize).toBe(true);
    });

    it('emits note:update when toggling autoSize', () => {
      const note = board.addNote();
      const handler = vi.fn();
      board.on('note:update', handler);
      board.updateNote(note.id, { autoSize: true });
      expect(handler).toHaveBeenCalledWith({
        note: expect.objectContaining({ autoSize: true }),
        prev: expect.objectContaining({ id: note.id }),
      });
    });
  });

  describe('collapsed', () => {
    it('addNote with collapsed stores the flag', () => {
      const note = board.addNote({ collapsed: true });
      expect(note.collapsed).toBe(true);
      const retrieved = board.getNote(note.id);
      expect(retrieved?.collapsed).toBe(true);
    });

    it('addNote without collapsed defaults to undefined', () => {
      const note = board.addNote();
      expect(note.collapsed).toBeUndefined();
    });

    it('updateNote can toggle collapsed on and off', () => {
      const note = board.addNote();
      board.updateNote(note.id, { collapsed: true });
      expect(board.getNote(note.id)?.collapsed).toBe(true);
      board.updateNote(note.id, { collapsed: false });
      expect(board.getNote(note.id)?.collapsed).toBe(false);
    });

    it('adds wema-collapsed class when collapsed is true', () => {
      const note = board.addNote({ collapsed: true });
      const noteEl = container.querySelector(`[data-note-id="${note.id}"]`);
      expect(noteEl?.classList.contains('wema-collapsed')).toBe(true);
    });

    it('removes wema-collapsed class when collapsed is turned off', () => {
      const note = board.addNote({ collapsed: true });
      board.updateNote(note.id, { collapsed: false });
      const noteEl = container.querySelector(`[data-note-id="${note.id}"]`);
      expect(noteEl?.classList.contains('wema-collapsed')).toBe(false);
    });

    it('exports and imports collapsed flag', () => {
      board.addNote({ text: 'folded', collapsed: true });
      board.addNote({ text: 'open' });
      const data = board.exportData();
      expect(data.notes.find(n => n.text === 'folded')?.collapsed).toBe(true);
      expect(data.notes.find(n => n.text === 'open')?.collapsed).toBeUndefined();

      board.importData(data);
      const notes = board.getNotes();
      expect(notes.find(n => n.text === 'folded')?.collapsed).toBe(true);
    });

    it('emits note:update when toggling collapsed', () => {
      const note = board.addNote();
      const handler = vi.fn();
      board.on('note:update', handler);
      board.updateNote(note.id, { collapsed: true });
      expect(handler).toHaveBeenCalledWith({
        note: expect.objectContaining({ collapsed: true }),
        prev: expect.objectContaining({ id: note.id }),
      });
    });

    it('has a collapse toggle button inside the move handle', () => {
      const note = board.addNote();
      const noteEl = container.querySelector(`[data-note-id="${note.id}"]`);
      const toggle = noteEl?.querySelector('.wema-collapse-toggle');
      expect(toggle).toBeTruthy();
    });
  });

  describe('destroy', () => {
    it('removes the board element from DOM', () => {
      expect(container.querySelector('.wema-board')).toBeTruthy();
      board.destroy();
      expect(container.querySelector('.wema-board')).toBeNull();
    });
  });

  describe('ReadOnly toggle', () => {
    it('isReadOnly returns false by default', () => {
      expect(board.isReadOnly()).toBe(false);
    });

    it('setReadOnly toggles read-only state', () => {
      board.setReadOnly(true);
      expect(board.isReadOnly()).toBe(true);
      board.setReadOnly(false);
      expect(board.isReadOnly()).toBe(false);
    });

    it('emits readOnly:change event', () => {
      const handler = vi.fn();
      board.on('readOnly:change', handler);
      board.setReadOnly(true);
      expect(handler).toHaveBeenCalledWith({ readOnly: true });
      board.setReadOnly(false);
      expect(handler).toHaveBeenCalledWith({ readOnly: false });
    });

    it('does not emit when setting same value', () => {
      const handler = vi.fn();
      board.on('readOnly:change', handler);
      board.setReadOnly(false);
      expect(handler).not.toHaveBeenCalled();
    });

    it('adds wema-readonly class to board element', () => {
      board.setReadOnly(true);
      const boardEl = container.querySelector('.wema-board');
      expect(boardEl?.classList.contains('wema-readonly')).toBe(true);
      board.setReadOnly(false);
      expect(boardEl?.classList.contains('wema-readonly')).toBe(false);
    });

    it('disables contenteditable on notes in readOnly mode', () => {
      const note = board.addNote({ text: 'test' });
      board.setReadOnly(true);
      const noteEl = container.querySelector(`[data-note-id="${note.id}"]`);
      const content = noteEl?.querySelector('.wema-note-content') as HTMLElement;
      expect(content?.contentEditable).toBe('false');
      board.setReadOnly(false);
      expect(content?.contentEditable).toBe('true');
    });
  });

  describe('ReadOnly guards on public API', () => {
    it('addNote is blocked in readOnly mode', () => {
      board.setReadOnly(true);
      const result = board.addNote({ text: 'blocked' });
      expect(result).toBeUndefined();
      expect(board.getNotes()).toHaveLength(0);
    });

    it('updateNote is blocked in readOnly mode', () => {
      const note = board.addNote({ text: 'original' });
      board.setReadOnly(true);
      board.updateNote(note.id, { text: 'modified' });
      expect(board.getNote(note.id)?.text).toBe('original');
    });

    it('deleteNote is blocked in readOnly mode', () => {
      const note = board.addNote({ text: 'keep me' });
      board.setReadOnly(true);
      board.deleteNote(note.id);
      expect(board.getNote(note.id)).toBeDefined();
      expect(board.getNotes()).toHaveLength(1);
    });

    it('addEdge is blocked in readOnly mode', () => {
      const n1 = board.addNote({ x: 0, y: 0 });
      const n2 = board.addNote({ x: 300, y: 0 });
      board.setReadOnly(true);
      const result = board.addEdge(n1.id, n2.id);
      expect(result).toBeUndefined();
      expect(board.getEdges()).toHaveLength(0);
    });

    it('updateEdge is blocked in readOnly mode', () => {
      const n1 = board.addNote({ x: 0, y: 0 });
      const n2 = board.addNote({ x: 300, y: 0 });
      const edge = board.addEdge(n1.id, n2.id);
      board.setReadOnly(true);
      board.updateEdge(edge.id, { strokeWidth: 4 });
      const updated = board.getEdges().find(e => e.id === edge.id);
      expect(updated?.strokeWidth).toBeUndefined();
    });

    it('deleteEdge is blocked in readOnly mode', () => {
      const n1 = board.addNote({ x: 0, y: 0 });
      const n2 = board.addNote({ x: 300, y: 0 });
      const edge = board.addEdge(n1.id, n2.id);
      board.setReadOnly(true);
      board.deleteEdge(edge.id);
      expect(board.getEdges()).toHaveLength(1);
    });

    it('operations work again after disabling readOnly', () => {
      board.setReadOnly(true);
      board.setReadOnly(false);
      const note = board.addNote({ text: 'works' });
      expect(note.text).toBe('works');
    });
  });

  describe('Resize', () => {
    it('notes have a resize handle element', () => {
      board.addNote();
      const handle = container.querySelector('.wema-resize-handle');
      expect(handle).toBeTruthy();
    });

    it('resize handle is hidden in readOnly mode', () => {
      board.addNote();
      board.setReadOnly(true);
      const handle = container.querySelector('.wema-resize-handle') as HTMLElement;
      expect(handle?.style.display).toBe('none');
    });

    it('updateNote can change width and height', () => {
      const note = board.addNote({ width: 200, height: 150 });
      board.updateNote(note.id, { width: 300, height: 200 });
      const updated = board.getNote(note.id);
      expect(updated?.width).toBe(300);
      expect(updated?.height).toBe(200);
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
