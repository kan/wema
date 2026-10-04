import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { WemaBoard } from '../src/board';
import type { HistoryDelta, WemaEventMap, WemaNote } from '../src/types';

describe('Sync API', () => {
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
    vi.restoreAllMocks();
  });

  // Helper to flush microtask-based batch commit
  const flush = () => Promise.resolve();

  /** Collect history:commit payloads */
  function recordCommits(target: WemaBoard = board): WemaEventMap['history:commit'][] {
    const commits: WemaEventMap['history:commit'][] = [];
    target.on('history:commit', (p) => commits.push(p));
    return commits;
  }

  const remoteNote: WemaNote = {
    id: 'remote-1', x: 10, y: 20, width: 200, height: 150, text: 'remote', color: '#FFF9C4', zIndex: 1,
  };

  describe('history:commit', () => {
    it('emits one commit per operation with origin "user"', async () => {
      const commits = recordCommits();
      const note = board.addNote({ text: 'a' });
      await flush();

      expect(commits).toHaveLength(1);
      expect(commits[0].origin).toBe('user');
      expect(commits[0].deltas).toEqual([
        { type: 'note:create', note: expect.objectContaining({ id: note.id, text: 'a' }) },
      ]);
    });

    it('reports only the changed keys of an update', async () => {
      const note = board.addNote({ x: 0, y: 0 });
      await flush();
      const commits = recordCommits();

      board.updateNote(note.id, { x: 50 });
      await flush();

      expect(commits[0].deltas).toEqual([
        { type: 'note:update', noteId: note.id, before: { x: 0 }, after: { x: 50 } },
      ]);
    });

    it('merges the updates of one operation into a single delta per note', async () => {
      const n1 = board.addNote({ x: 0, y: 0 });
      const n2 = board.addNote({ x: 300, y: 0 });
      await flush();
      const commits = recordCommits();

      // A group drag: every pointer move updates both notes
      board.batch(() => {
        for (let step = 1; step <= 3; step++) {
          board.updateNote(n1.id, { x: step * 10 });
          board.updateNote(n2.id, { x: 300 + step * 10 });
        }
      });

      expect(commits).toHaveLength(1);
      expect(commits[0].deltas).toEqual([
        { type: 'note:update', noteId: n1.id, before: { x: 0 }, after: { x: 30 } },
        { type: 'note:update', noteId: n2.id, before: { x: 300 }, after: { x: 330 } },
      ]);

      board.undo();
      expect(board.getNote(n1.id)!.x).toBe(0);
      expect(board.getNote(n2.id)!.x).toBe(300);
    });

    it('commits nothing when an operation ends where it started', async () => {
      const note = board.addNote({ x: 0, y: 0 });
      await flush();
      const commits = recordCommits();

      board.batch(() => {
        board.updateNote(note.id, { x: 50 });
        board.updateNote(note.id, { x: 0 });
      });

      expect(commits).toHaveLength(0);
      board.undo();
      expect(board.getNotes()).toHaveLength(0);
    });

    it('does not merge updates across a create or delete', async () => {
      const n1 = board.addNote({ x: 0, y: 0 });
      await flush();
      const commits = recordCommits();

      board.batch(() => {
        board.updateNote(n1.id, { x: 10 });
        board.addNote({ x: 300, y: 0 });
        board.updateNote(n1.id, { x: 20 });
      });

      expect(commits[0].deltas.map((d) => d.type)).toEqual(['note:update', 'note:create', 'note:update']);
    });

    it('emits the inverse deltas in reverse order on undo', async () => {
      const n1 = board.addNote({ x: 0, y: 0 });
      const n2 = board.addNote({ x: 300, y: 0 });
      await flush();
      const edge = board.addEdge(n1.id, n2.id);
      board.updateNote(n1.id, { x: 40 });
      await flush();
      const commits = recordCommits();

      board.undo();

      expect(commits).toHaveLength(1);
      expect(commits[0].origin).toBe('undo');
      expect(commits[0].deltas).toEqual([
        { type: 'note:update', noteId: n1.id, before: { x: 40 }, after: { x: 0 } },
        { type: 'edge:delete', edge: expect.objectContaining({ id: edge.id }) },
      ]);
    });

    it('emits the original deltas on redo', async () => {
      const note = board.addNote({ x: 0, y: 0 });
      await flush();
      board.updateNote(note.id, { x: 50 });
      await flush();
      board.undo();
      const commits = recordCommits();

      board.redo();

      expect(commits).toHaveLength(1);
      expect(commits[0].origin).toBe('redo');
      expect(commits[0].deltas).toEqual([
        { type: 'note:update', noteId: note.id, before: { x: 0 }, after: { x: 50 } },
      ]);
    });

    it('does not let a listener mutate the history through the payload', async () => {
      const note = board.addNote({ x: 0, y: 0 });
      await flush();
      board.on('history:commit', ({ deltas }) => {
        const delta = deltas[0];
        if (delta.type === 'note:update') delta.before.x = 999;
      });
      board.updateNote(note.id, { x: 50 });
      await flush();

      board.undo();
      expect(board.getNote(note.id)!.x).toBe(0);
    });
  });

  describe('batch', () => {
    it('groups operations into one undo step and one commit', async () => {
      const commits = recordCommits();
      const created = board.batch(() => {
        const a = board.addNote({ x: 0, y: 0 });
        const b = board.addNote({ x: 300, y: 0 });
        board.addEdge(a.id, b.id);
        return [a.id, b.id];
      });

      expect(created).toHaveLength(2);
      expect(commits).toHaveLength(1);
      expect(commits[0].deltas.map((d) => d.type)).toEqual(['note:create', 'note:create', 'edge:create']);

      board.undo();
      expect(board.getNotes()).toHaveLength(0);
      expect(board.getEdges()).toHaveLength(0);
    });

    it('reports the given origin, then falls back to "user"', async () => {
      const commits = recordCommits();
      board.batch(() => { board.addNote(); }, { origin: 'agent' });
      board.addNote();
      await flush();

      expect(commits.map((c) => c.origin)).toEqual(['agent', 'user']);
    });

    it('keeps earlier uncommitted changes out of the batch', () => {
      const commits = recordCommits();
      board.addNote({ text: 'by user' });
      board.batch(() => { board.addNote({ text: 'by agent' }); }, { origin: 'agent' });

      expect(commits.map((c) => [c.origin, c.deltas.length])).toEqual([['user', 1], ['agent', 1]]);
    });

    it('commits what was done before fn threw', () => {
      const commits = recordCommits();
      expect(() => board.batch(() => {
        board.addNote();
        throw new Error('boom');
      })).toThrow('boom');

      expect(commits).toHaveLength(1);
      expect(board.canUndo()).toBe(true);
    });
  });

  describe('applyRemote', () => {
    it('applies create, update and delete deltas', () => {
      board.applyRemote([{ type: 'note:create', note: remoteNote }]);
      expect(board.getNote('remote-1')?.text).toBe('remote');

      board.applyRemote([
        { type: 'note:update', noteId: 'remote-1', before: { x: 10 }, after: { x: 99 } },
      ]);
      expect(board.getNote('remote-1')?.x).toBe(99);

      board.applyRemote([{ type: 'note:delete', note: remoteNote }]);
      expect(board.getNote('remote-1')).toBeUndefined();
    });

    it('is not recorded in the undo history and emits no history:commit', async () => {
      const commits = recordCommits();
      board.applyRemote([{ type: 'note:create', note: remoteNote }]);
      await flush();

      expect(commits).toHaveLength(0);
      expect(board.canUndo()).toBe(false);
    });

    it('keeps the existing undo history', async () => {
      const note = board.addNote({ x: 0, y: 0 });
      await flush();
      board.updateNote(note.id, { x: 50 });
      await flush();

      board.applyRemote([{ type: 'note:create', note: remoteNote }]);
      await flush();

      board.undo();
      expect(board.getNote(note.id)!.x).toBe(0);
      expect(board.getNote('remote-1')).toBeDefined();
    });

    it('marks note and edge events with origin "remote"', () => {
      const local = board.addNote({ x: 300, y: 0 });
      const origins: string[] = [];
      board.on('note:create', (p) => origins.push(`note:create ${p.origin}`));
      board.on('note:update', (p) => origins.push(`note:update ${p.origin}`));
      board.on('edge:create', (p) => origins.push(`edge:create ${p.origin}`));

      board.applyRemote([
        { type: 'note:create', note: remoteNote },
        { type: 'note:update', noteId: 'remote-1', before: { x: 10 }, after: { x: 11 } },
        {
          type: 'edge:create',
          edge: { id: 'e1', from: 'remote-1', to: local.id, fromAnchor: 'auto', toAnchor: 'auto', style: 'arrow' },
        },
      ]);
      board.updateNote(local.id, { x: 301 });

      expect(origins).toEqual([
        'note:create remote',
        'note:update remote',
        'edge:create remote',
        'note:update local',
      ]);
    });

    it('marks a change made from a remote event handler as local', () => {
      const local = board.addNote({ text: 'local' });
      const updateOrigins: string[] = [];
      board.on('note:update', ({ origin }) => updateOrigins.push(origin));
      board.on('note:create', ({ origin }) => {
        if (origin === 'remote') board.updateNote(local.id, { text: 'reacted' });
      });

      board.applyRemote([{ type: 'note:create', note: remoteNote }]);

      expect(board.getNote(local.id)!.text).toBe('reacted');
      expect(updateOrigins).toEqual(['local']);
    });

    it('applies in readOnly and viewOnly', () => {
      board.setReadOnly(true);
      board.applyRemote([{ type: 'note:create', note: remoteNote }]);
      expect(board.getNote('remote-1')).toBeDefined();

      board.setReadOnly(false);
      board.setViewOnly(true);
      board.applyRemote([
        { type: 'note:update', noteId: 'remote-1', before: { text: 'remote' }, after: { text: 'changed' } },
      ]);
      expect(board.getNote('remote-1')?.text).toBe('changed');
    });

    it('resets a key that is in before but missing from after', () => {
      const n1 = board.addNote({ x: 0, y: 0 });
      const n2 = board.addNote({ x: 300, y: 0 });
      const edge = board.addEdge(n1.id, n2.id);
      board.updateEdge(edge.id, { collapsed: true });

      // The shape a delta takes after a JSON round trip of { collapsed: undefined }
      const delta: HistoryDelta = JSON.parse(JSON.stringify({
        type: 'edge:update', edgeId: edge.id, before: { collapsed: true }, after: { collapsed: undefined },
      }));
      expect(delta).toEqual({ type: 'edge:update', edgeId: edge.id, before: { collapsed: true }, after: {} });

      board.applyRemote([delta]);
      expect(board.getEdges()[0].collapsed).toBeUndefined();
    });

    it('ignores keys that are not note or edge fields', () => {
      const n1 = board.addNote({ x: 0, y: 0 });
      const n2 = board.addNote({ x: 300, y: 0 });
      const edge = board.addEdge(n1.id, n2.id);

      // As received from the network: JSON.parse keeps "__proto__" as an own key
      const deltas: HistoryDelta[] = JSON.parse(`[
        {"type":"note:update","noteId":"${n1.id}","before":{},
         "after":{"x":5,"id":"hijack","unknown":1,"__proto__":{"autoSize":true}}},
        {"type":"edge:update","edgeId":"${edge.id}","before":{},
         "after":{"strokeWidth":4,"from":"${n2.id}","to":"${n1.id}","unknown":1,"__proto__":{"collapsed":true}}}
      ]`);
      board.applyRemote(deltas);

      const data = board.exportData();
      expect(Object.keys(data.notes[0]).sort()).toEqual(Object.keys(n1).sort());
      expect(data.notes[0]).toEqual({ ...n1, x: 5 });
      expect(data.edges[0]).toEqual(expect.objectContaining({ id: edge.id, from: n1.id, to: n2.id, strokeWidth: 4 }));
      expect(data.edges[0]).not.toHaveProperty('unknown');
      // The prototype was not swapped: no inherited flags took effect
      expect(container.querySelector('.wema-auto-size')).toBeNull();
      expect(container.querySelectorAll('.wema-note')[1]).toHaveProperty('style.display', '');
    });

    it('skips deltas whose target is missing or already exists', () => {
      const local = board.addNote({ text: 'local' });
      const createHandler = vi.fn();
      board.on('note:create', createHandler);
      board.on('edge:create', createHandler);

      board.applyRemote([
        { type: 'note:create', note: { ...local, text: 'duplicate' } },
        { type: 'note:update', noteId: 'missing', before: { x: 0 }, after: { x: 1 } },
        { type: 'note:delete', note: { ...remoteNote, id: 'missing' } },
        {
          type: 'edge:create',
          edge: { id: 'e1', from: local.id, to: 'missing', fromAnchor: 'auto', toAnchor: 'auto', style: 'arrow' },
        },
        { type: 'edge:delete', edge: { id: 'e2', from: local.id, to: 'missing', fromAnchor: 'auto', toAnchor: 'auto', style: 'arrow' } },
      ]);

      expect(createHandler).not.toHaveBeenCalled();
      expect(board.getNotes()).toHaveLength(1);
      expect(board.getNote(local.id)?.text).toBe('local');
      expect(board.getEdges()).toHaveLength(0);
      expect(container.querySelectorAll('.wema-note')).toHaveLength(1);
    });

    it('deletes edges still connected to a remotely deleted note', () => {
      const n1 = board.addNote({ x: 0, y: 0 });
      const n2 = board.addNote({ x: 300, y: 0 });
      board.addEdge(n1.id, n2.id);
      board.select([n1.id]);

      board.applyRemote([{ type: 'note:delete', note: n1 }]);

      expect(board.getEdges()).toHaveLength(0);
      expect(board.getSelection()).toEqual([]);
    });

    it('does not overwrite the content of a note being edited', () => {
      const note = board.addNote({ text: 'original' });
      const content = container.querySelector('.wema-note-content') as HTMLElement;
      content.tabIndex = 0; // jsdom does not treat contenteditable as focusable
      content.focus();
      expect(document.activeElement).toBe(content);
      content.innerHTML = 'typing';

      board.applyRemote([
        { type: 'note:update', noteId: note.id, before: { text: 'original' }, after: { text: 'from remote' } },
      ]);

      expect(content.innerHTML).toBe('typing');
    });
  });

  describe('viewOnly', () => {
    it('records neither the temporary moves nor the restore', async () => {
      const note = board.addNote({ x: 0, y: 0 });
      await flush();
      const commits = recordCommits();

      board.setViewOnly(true);
      board.updateNote(note.id, { x: 500 });
      await flush();
      board.setViewOnly(false);
      await flush();

      expect(board.getNote(note.id)!.x).toBe(0);
      expect(commits).toHaveLength(0);

      // The only undo step is the creation of the note
      board.undo();
      expect(board.getNotes()).toHaveLength(0);
    });

    it('still records changes that viewOnly does not restore', async () => {
      const note = board.addNote({ x: 0, y: 0, text: 'before' });
      await flush();
      const commits = recordCommits();

      board.setViewOnly(true);
      board.updateNote(note.id, { x: 500, text: 'after' });
      await flush();
      board.setViewOnly(false);

      expect(commits).toHaveLength(1);
      expect(commits[0].deltas).toEqual([
        { type: 'note:update', noteId: note.id, before: { text: 'before' }, after: { text: 'after' } },
      ]);
      expect(board.getNote(note.id)).toEqual(expect.objectContaining({ x: 0, text: 'after' }));
    });

    it('ignores undo and redo', async () => {
      const note = board.addNote({ x: 0, y: 0 });
      await flush();
      board.updateNote(note.id, { x: 50 });
      await flush();
      const commits = recordCommits();

      board.setViewOnly(true);
      board.undo();

      expect(board.getNote(note.id)!.x).toBe(50);
      expect(commits).toHaveLength(0);
    });

    it('restores a note created remotely during viewOnly', () => {
      board.setViewOnly(true);
      board.applyRemote([{ type: 'note:create', note: remoteNote }]);
      board.updateNote('remote-1', { x: 500 });
      board.setViewOnly(false);

      expect(board.getNote('remote-1')!.x).toBe(10);
    });

    it('records again after leaving viewOnly', async () => {
      const note = board.addNote({ x: 0, y: 0 });
      await flush();
      board.setViewOnly(true);
      board.setViewOnly(false);
      const commits = recordCommits();

      board.updateNote(note.id, { x: 50 });
      await flush();
      expect(commits).toHaveLength(1);
    });

    it('restores to the remote state received during viewOnly', () => {
      const n1 = board.addNote({ x: 0, y: 0 });
      const n2 = board.addNote({ x: 300, y: 0 });
      const edge = board.addEdge(n1.id, n2.id);

      board.setViewOnly(true);
      board.updateNote(n1.id, { x: 500 });
      board.applyRemote([
        { type: 'note:update', noteId: n1.id, before: { x: 0 }, after: { x: 120 } },
        { type: 'edge:update', edgeId: edge.id, before: {}, after: { collapsed: true } },
      ]);
      board.setViewOnly(false);

      expect(board.getNote(n1.id)!.x).toBe(120);
      expect(board.getEdges()[0].collapsed).toBe(true);
    });

    it('restores to the data imported during viewOnly, not to what was there before', () => {
      const n1 = board.addNote({ x: 0, y: 0 });
      const n2 = board.addNote({ x: 300, y: 0 });
      const edge = board.addEdge(n1.id, n2.id);
      const data = board.exportData();

      board.setViewOnly(true);
      // A reconnect reloads the board: the same notes, moved by another client meanwhile
      data.notes[0].x = 120;
      data.edges[0].collapsed = true;
      board.importData(data);
      board.updateNote(n1.id, { x: 500 });
      board.setViewOnly(false);

      expect(board.getNote(n1.id)!.x).toBe(120);
      expect(board.getEdges().find((e) => e.id === edge.id)!.collapsed).toBe(true);
    });

    it('restores positions when the board was created in viewOnly', () => {
      const data = board.exportData();
      data.notes.push({ ...remoteNote });
      const other = document.createElement('div');
      document.body.appendChild(other);
      const viewBoard = new WemaBoard({ container: other, data, viewOnly: true });
      const commits = recordCommits(viewBoard);

      viewBoard.updateNote('remote-1', { x: 500 });
      viewBoard.setViewOnly(false);

      expect(viewBoard.getNote('remote-1')!.x).toBe(10);
      expect(commits).toHaveLength(0);
      viewBoard.destroy();
      other.remove();
    });
  });

  describe('change event', () => {
    it('always carries the board data', async () => {
      const note = board.addNote({ text: 'a' });
      await flush();
      const payloads: WemaEventMap['change'][] = [];
      board.on('change', (p) => payloads.push(p));

      // Committing an edit on blur used to emit change with undefined data
      const content = container.querySelector('.wema-note-content') as HTMLElement;
      content.innerHTML = 'edited';
      content.dispatchEvent(new Event('input'));
      content.dispatchEvent(new Event('blur'));
      await flush();

      expect(payloads).toHaveLength(1);
      expect(payloads[0].data.notes[0]).toEqual(expect.objectContaining({ id: note.id, text: 'edited' }));
    });
  });

  describe('onImageUpload', () => {
    /** Make the next file picker resolve to `file` */
    function pickFile(file: File): void {
      vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(function (this: HTMLInputElement) {
        Object.defineProperty(this, 'files', { value: [file] });
        this.dispatchEvent(new Event('change'));
      });
    }

    /** Trigger the note popup's "insert image" action */
    function insertImage(target: WemaBoard, noteId: string): void {
      (target as unknown as { insertImageIntoNote(id: string): void }).insertImageIntoNote(noteId);
    }

    const file = new File(['x'], 'photo.png', { type: 'image/png' });

    function createBoard(onImageUpload: (file: File) => Promise<string>): { target: WemaBoard; el: HTMLElement } {
      const el = document.createElement('div');
      document.body.appendChild(el);
      return { target: new WemaBoard({ container: el, onImageUpload }), el };
    }

    it('inserts the image with the returned URL', async () => {
      const upload = vi.fn().mockResolvedValue('https://img.example/photo.png');
      const { target, el } = createBoard(upload);
      const note = target.addNote();
      pickFile(file);

      insertImage(target, note.id);
      await vi.waitFor(() => expect(target.getNote(note.id)!.text).toContain('<img'));

      expect(upload).toHaveBeenCalledWith(file);
      const img = el.querySelector('.wema-note-content img') as HTMLImageElement;
      expect(img.getAttribute('src')).toBe('https://img.example/photo.png');
      expect(target.getNote(note.id)!.text).not.toContain('data:');
      target.destroy();
      el.remove();
    });

    it('inserts nothing and emits image:error when the upload fails', async () => {
      const failure = new Error('upload failed');
      const { target, el } = createBoard(() => Promise.reject(failure));
      const note = target.addNote();
      const handler = vi.fn();
      target.on('image:error', handler);
      pickFile(file);

      insertImage(target, note.id);
      await vi.waitFor(() => expect(handler).toHaveBeenCalled());

      expect(handler).toHaveBeenCalledWith({ noteId: note.id, file, error: failure });
      expect(el.querySelector('.wema-note-content img')).toBeNull();
      target.destroy();
      el.remove();
    });

    it('rejects a URL with an unsafe scheme', async () => {
      // eslint-disable-next-line no-script-url
      const { target, el } = createBoard(() => Promise.resolve('javascript:alert(1)'));
      const note = target.addNote();
      const handler = vi.fn();
      target.on('image:error', handler);
      pickFile(file);

      insertImage(target, note.id);
      await vi.waitFor(() => expect(handler).toHaveBeenCalled());

      expect(el.querySelector('.wema-note-content img')).toBeNull();
      target.destroy();
      el.remove();
    });
  });
});
