import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { WemaBoard } from '../src/board';
import type { HistoryDelta, WemaBoardOptions, WemaEventMap, WemaNote } from '../src/types';

describe('Note extensions for the embedding application', () => {
  let container: HTMLElement;
  let board: WemaBoard;

  function createBoard(options: Partial<WemaBoardOptions> = {}): WemaBoard {
    board?.destroy();
    board = new WemaBoard({ container, ...options });
    return board;
  }

  beforeEach(() => {
    container = document.createElement('div');
    container.style.width = '800px';
    container.style.height = '600px';
    document.body.appendChild(container);
    createBoard();
  });

  afterEach(() => {
    board.destroy();
    container.remove();
    vi.restoreAllMocks();
  });

  // Flush the microtask that commits the history
  const flush = () => Promise.resolve();

  function recordCommits(target: WemaBoard = board): WemaEventMap['history:commit'][] {
    const commits: WemaEventMap['history:commit'][] = [];
    target.on('history:commit', (p) => commits.push(p));
    return commits;
  }

  /** Send deltas through JSON, as a network would */
  const overTheWire = (deltas: HistoryDelta[]): HistoryDelta[] => JSON.parse(JSON.stringify(deltas));

  const noteEl = (id: string) => container.querySelector(`[data-note-id="${id}"]`) as HTMLElement;

  /** Click a note, which selects it and opens its popup */
  function clickNote(id: string): void {
    // jsdom has no layout: the board asks which edge is under the pointer
    document.elementsFromPoint ??= () => [];
    noteEl(id).dispatchEvent(new MouseEvent('click', { bubbles: true }));
  }
  const contentOf = (id: string) => noteEl(id).querySelector('.wema-note-content') as HTMLElement;
  const customOf = (id: string) => noteEl(id).querySelector('.wema-note-custom') as HTMLElement;

  describe('WemaNote.meta', () => {
    it('keeps the meta given to addNote and returns it from getNote, getNotes and exportData', () => {
      const note = board.addNote({ text: 'a', meta: { page: 'child-1' } });

      expect(note.meta).toEqual({ page: 'child-1' });
      expect(board.getNote(note.id)!.meta).toEqual({ page: 'child-1' });
      expect(board.getNotes()[0].meta).toEqual({ page: 'child-1' });
      expect(board.exportData().notes[0].meta).toEqual({ page: 'child-1' });
    });

    it('has no meta key on a note created without one', () => {
      const note = board.addNote({ text: 'a' });
      expect('meta' in note).toBe(false);
      expect('meta' in board.exportData().notes[0]).toBe(false);
    });

    it('stores a copy that cannot be changed from outside', () => {
      const given = { page: 'child-1' };
      const note = board.addNote({ meta: given });
      given.page = 'changed';

      expect(board.getNote(note.id)!.meta).toEqual({ page: 'child-1' });
      expect(() => {
        (board.getNote(note.id)!.meta as Record<string, string>).page = 'changed';
      }).toThrow();
      expect(board.getNote(note.id)!.meta).toEqual({ page: 'child-1' });
    });

    it('keeps only string values, and ignores a meta that is not an object', () => {
      const mixed = { page: 'child-1', count: 3, nested: { a: 'b' }, none: null } as unknown as Record<string, string>;
      expect(board.addNote({ meta: mixed }).meta).toEqual({ page: 'child-1' });
      expect('meta' in board.addNote({ meta: 'text' as unknown as Record<string, string> })).toBe(false);
      expect('meta' in board.addNote({ meta: ['a'] as unknown as Record<string, string> })).toBe(false);
    });

    it('survives exportData and importData', () => {
      board.addNote({ text: 'a', meta: { page: 'child-1' } });
      const data = JSON.parse(JSON.stringify(board.exportData()));

      createBoard();
      board.importData(data);

      expect(board.getNotes()[0].meta).toEqual({ page: 'child-1' });
    });

    it('replaces the whole meta on updateNote and reports it in note:update', () => {
      const note = board.addNote({ meta: { page: 'child-1', kind: 'page' } });
      const updates: WemaEventMap['note:update'][] = [];
      board.on('note:update', (p) => updates.push(p));

      board.updateNote(note.id, { meta: { page: 'child-2' } });

      expect(board.getNote(note.id)!.meta).toEqual({ page: 'child-2' });
      expect(updates).toHaveLength(1);
      expect(updates[0].prev.meta).toEqual({ page: 'child-1', kind: 'page' });
      expect(updates[0].note.meta).toEqual({ page: 'child-2' });
    });

    it('carries the meta in the history deltas of create, update and delete', async () => {
      const commits = recordCommits();

      const note = board.addNote({ meta: { page: 'child-1' } });
      await flush();
      board.updateNote(note.id, { meta: { page: 'child-2' } });
      await flush();
      board.deleteNote(note.id);
      await flush();

      expect(commits.map((c) => c.deltas)).toEqual([
        [{ type: 'note:create', note: expect.objectContaining({ meta: { page: 'child-1' } }) }],
        [{ type: 'note:update', noteId: note.id, before: { meta: { page: 'child-1' } }, after: { meta: { page: 'child-2' } } }],
        [{ type: 'note:delete', note: expect.objectContaining({ meta: { page: 'child-2' } }) }],
      ]);
    });

    it('does not record an update whose meta has the same entries', async () => {
      const note = board.addNote({ meta: { page: 'child-1', kind: 'page' } });
      await flush();
      const commits = recordCommits();

      board.updateNote(note.id, { meta: { kind: 'page', page: 'child-1' } });
      await flush();

      expect(commits).toHaveLength(0);
    });

    it('restores the meta on undo and redo', async () => {
      const note = board.addNote({ text: 'a' });
      await flush();
      board.updateNote(note.id, { meta: { page: 'child-1' } });
      await flush();
      board.updateNote(note.id, { meta: { page: 'child-2' } });
      await flush();

      board.undo();
      expect(board.getNote(note.id)!.meta).toEqual({ page: 'child-1' });
      board.undo();
      expect(board.getNote(note.id)!.meta).toBeUndefined();
      board.redo();
      expect(board.getNote(note.id)!.meta).toEqual({ page: 'child-1' });

      board.deleteNote(note.id);
      await flush();
      board.undo();
      expect(board.getNote(note.id)!.meta).toEqual({ page: 'child-1' });
    });

    it('removes the meta with meta: undefined, also on the receiving board', async () => {
      const commits = recordCommits();
      const note = board.addNote({ meta: { page: 'child-1' } });
      await flush();
      board.updateNote(note.id, { meta: undefined });
      await flush();

      expect(board.getNote(note.id)!.meta).toBeUndefined();
      expect('meta' in JSON.parse(JSON.stringify(board.exportData())).notes[0]).toBe(false);

      const otherContainer = document.createElement('div');
      document.body.appendChild(otherContainer);
      const other = new WemaBoard({ container: otherContainer });
      other.applyRemote(overTheWire(commits[0].deltas));
      expect(other.getNote(note.id)!.meta).toEqual({ page: 'child-1' });
      other.applyRemote(overTheWire(commits[1].deltas));
      expect(other.getNote(note.id)!.meta).toBeUndefined();
      other.destroy();
      otherContainer.remove();
    });

    it('applies a remote meta, dropping what is not a string', () => {
      const remote = {
        id: 'remote-1', x: 0, y: 0, width: 200, height: 150, text: '', color: '#FFF9C4', zIndex: 1,
        meta: { page: 'child-1', count: 3 },
      } as unknown as WemaNote;
      board.applyRemote([{ type: 'note:create', note: remote }]);
      expect(board.getNote('remote-1')!.meta).toEqual({ page: 'child-1' });

      board.applyRemote([{
        type: 'note:update',
        noteId: 'remote-1',
        before: { meta: { page: 'child-1' } },
        after: { meta: { page: 'child-2', evil: { a: 1 } } as unknown as Record<string, string> },
      }]);
      expect(board.getNote('remote-1')!.meta).toEqual({ page: 'child-2' });
    });

    it('is not copied when the note is duplicated', () => {
      const note = board.addNote({ text: 'a', meta: { page: 'child-1' } });
      clickNote(note.id);
      (container.querySelector('.wema-note-popup button[title="Duplicate"]') as HTMLElement).click();

      const copy = board.getNotes().find((n) => n.id !== note.id)!;
      expect(copy.text).toBe('a');
      expect('meta' in copy).toBe(false);
    });
  });

  describe('renderNote option', () => {
    /** Draws the notes that have meta.page, as a label and a button */
    const renderPage = vi.fn((note: WemaNote, el: HTMLElement): boolean => {
      if (!note.meta?.page) return false;
      const label = document.createElement('span');
      label.className = 'label';
      label.textContent = note.meta.page;
      const open = document.createElement('button');
      open.className = 'open';
      open.textContent = 'open';
      el.append(label, open);
      return true;
    });

    beforeEach(() => {
      renderPage.mockClear();
      createBoard({ renderNote: renderPage });
    });

    it('shows what the host draws instead of the text, and the note cannot be edited', () => {
      const note = board.addNote({ text: 'fallback', meta: { page: 'child-1' } });

      expect(noteEl(note.id).classList.contains('wema-note-host-drawn')).toBe(true);
      expect(customOf(note.id).querySelector('.label')!.textContent).toBe('child-1');
      expect(contentOf(note.id).contentEditable).toBe('false');
    });

    it('leaves a note the host does not draw as an ordinary note', () => {
      const note = board.addNote({ text: 'plain' });

      expect(renderPage).toHaveBeenCalledTimes(1);
      expect(noteEl(note.id).classList.contains('wema-note-host-drawn')).toBe(false);
      expect(customOf(note.id).childNodes).toHaveLength(0);
      expect(contentOf(note.id).contentEditable).toBe('true');
      expect(contentOf(note.id).textContent).toBe('plain');
    });

    it('draws again when the text or the meta changes, but not when the note moves', () => {
      const note = board.addNote({ meta: { page: 'child-1' } });
      renderPage.mockClear();

      board.updateNote(note.id, { x: 300, y: 200, width: 240, color: '#fff' });
      expect(renderPage).not.toHaveBeenCalled();

      board.updateNote(note.id, { meta: { page: 'child-2' } });
      expect(renderPage).toHaveBeenCalledTimes(1);
      expect(customOf(note.id).querySelector('.label')!.textContent).toBe('child-2');
      expect(customOf(note.id).querySelectorAll('.label')).toHaveLength(1);

      board.updateNote(note.id, { text: 'new text' });
      expect(renderPage).toHaveBeenCalledTimes(2);
    });

    it('switches between host-drawn and ordinary as the meta comes and goes, also by undo', async () => {
      const note = board.addNote({ text: 'plain' });
      await flush();

      board.updateNote(note.id, { meta: { page: 'child-1' } });
      await flush();
      expect(noteEl(note.id).classList.contains('wema-note-host-drawn')).toBe(true);
      expect(contentOf(note.id).contentEditable).toBe('false');

      board.undo();
      expect(noteEl(note.id).classList.contains('wema-note-host-drawn')).toBe(false);
      expect(customOf(note.id).childNodes).toHaveLength(0);
      expect(contentOf(note.id).contentEditable).toBe('true');
    });

    it('draws notes that come from importData and applyRemote', () => {
      board.importData({
        version: 1,
        notes: [{ id: 'n1', x: 0, y: 0, width: 200, height: 150, text: '', color: '#fff', zIndex: 1, meta: { page: 'a' } }],
        edges: [],
      });
      expect(customOf('n1').querySelector('.label')!.textContent).toBe('a');

      board.applyRemote([{ type: 'note:update', noteId: 'n1', before: { meta: { page: 'a' } }, after: { meta: { page: 'b' } } }]);
      expect(customOf('n1').querySelector('.label')!.textContent).toBe('b');
    });

    it('draws a note again on refreshNote without an event or a history entry', async () => {
      const titles: Record<string, string> = { 'child-1': 'First title' };
      createBoard({
        renderNote: (note, el) => {
          if (!note.meta?.page) return false;
          el.textContent = titles[note.meta.page];
          return true;
        },
      });
      const note = board.addNote({ meta: { page: 'child-1' } });
      await flush();
      const commits = recordCommits();
      const updates = vi.fn();
      board.on('note:update', updates);
      board.on('change', updates);

      titles['child-1'] = 'Second title';
      board.refreshNote(note.id);
      await flush();

      expect(customOf(note.id).textContent).toBe('Second title');
      expect(commits).toHaveLength(0);
      expect(updates).not.toHaveBeenCalled();
    });

    it('exports the text of the model for a host-drawn note', () => {
      const note = board.addNote({ text: 'kept <b>text</b>', meta: { page: 'child-1' } });
      expect(board.exportData().notes.find((n) => n.id === note.id)!.text).toBe('kept <b>text</b>');
    });

    it('keeps a host-drawn note not editable through readOnly and viewOnly', () => {
      const drawn = board.addNote({ meta: { page: 'child-1' } });
      const plain = board.addNote({ text: 'plain' });

      board.setReadOnly(true);
      expect(customOf(drawn.id).querySelector('.label')).not.toBeNull();
      board.setReadOnly(false);
      expect(contentOf(drawn.id).contentEditable).toBe('false');
      expect(contentOf(plain.id).contentEditable).toBe('true');

      board.setViewOnly(true);
      board.setViewOnly(false);
      expect(contentOf(drawn.id).contentEditable).toBe('false');
      expect(contentOf(plain.id).contentEditable).toBe('true');
    });

    it('is also called in readOnly', () => {
      createBoard({ renderNote: renderPage, readOnly: true });
      board.importData({
        version: 1,
        notes: [{ id: 'n1', x: 0, y: 0, width: 200, height: 150, text: '', color: '#fff', zIndex: 1, meta: { page: 'a' } }],
        edges: [],
      });
      expect(customOf('n1').querySelector('.label')!.textContent).toBe('a');
    });

    it('does not offer text formatting in the popup of a host-drawn note', () => {
      const drawn = board.addNote({ meta: { page: 'child-1' } });
      const plain = board.addNote({ text: 'plain' });
      const rows = () => container.querySelectorAll('.wema-note-popup .wema-note-popup-actions').length;

      clickNote(plain.id);
      const plainRows = rows();
      clickNote(drawn.id);

      expect(rows()).toBe(plainRows - 1);
    });

    it('leaves the keyboard to a form field the host put in a note', async () => {
      createBoard({
        renderNote: (note, el) => {
          if (!note.meta?.page) return false;
          el.append(document.createElement('input'));
          return true;
        },
      });
      const note = board.addNote({ meta: { page: 'child-1' } });
      await flush();
      board.updateNote(note.id, { x: 500 });
      await flush();
      board.select([note.id]);
      const input = customOf(note.id).querySelector('input')!;
      const key = (init: KeyboardEventInit) =>
        input.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init }));

      key({ key: 'Backspace' });
      key({ key: 'Delete' });
      expect(board.getNote(note.id)).toBeDefined();

      key({ key: 'z', ctrlKey: true });
      expect(board.getNote(note.id)!.x).toBe(500);
    });

    it('keeps the note as an ordinary one when renderNote throws', async () => {
      const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
      createBoard({
        renderNote: () => {
          throw new Error('host bug');
        },
      });
      const created = vi.fn();
      board.on('note:create', created);
      const commits = recordCommits();

      const note = board.addNote({ text: 'plain' });
      board.updateNote(note.id, { text: 'changed' });
      await flush();

      expect(created).toHaveBeenCalledTimes(1);
      expect(commits).toHaveLength(1);
      expect(noteEl(note.id).classList.contains('wema-note-host-drawn')).toBe(false);
      expect(contentOf(note.id).textContent).toBe('changed');
      expect(logged).toHaveBeenCalled();
    });

    describe('dragging', () => {
      function pointer(type: string, target: Element, clientX: number, clientY: number): void {
        target.dispatchEvent(
          new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: 1, button: 0, clientX, clientY }),
        );
      }

      function dragFrom(target: Element): void {
        pointer('pointerdown', target, 100, 100);
        pointer('pointermove', target, 160, 130);
        pointer('pointerup', target, 160, 130);
      }

      beforeEach(() => {
        // jsdom does not implement pointer capture
        HTMLElement.prototype.setPointerCapture ??= () => {};
        HTMLElement.prototype.releasePointerCapture ??= () => {};
      });

      it('moves the note when dragged by what the host drew', () => {
        const note = board.addNote({ x: 50, y: 50, meta: { page: 'child-1' } });
        dragFrom(customOf(note.id).querySelector('.label')!);

        expect(board.getNote(note.id)).toEqual(expect.objectContaining({ x: 110, y: 80 }));
      });

      it('does not move the note when a button in it is pressed', () => {
        const note = board.addNote({ x: 50, y: 50, meta: { page: 'child-1' } });
        dragFrom(customOf(note.id).querySelector('.open')!);

        expect(board.getNote(note.id)).toEqual(expect.objectContaining({ x: 50, y: 50 }));
      });

      it('does not move the note from an element marked data-wema-no-drag', () => {
        const note = board.addNote({ x: 50, y: 50, meta: { page: 'child-1' } });
        const label = customOf(note.id).querySelector('.label')!;
        label.setAttribute('data-wema-no-drag', '');
        dragFrom(label);

        expect(board.getNote(note.id)).toEqual(expect.objectContaining({ x: 50, y: 50 }));
      });

      it('does not move an ordinary note dragged by its text', () => {
        const note = board.addNote({ x: 50, y: 50, text: 'plain' });
        dragFrom(contentOf(note.id));

        expect(board.getNote(note.id)).toEqual(expect.objectContaining({ x: 50, y: 50 }));
      });
    });
  });
});
