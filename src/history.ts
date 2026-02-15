import type { NoteId, EdgeId, WemaNote, WemaEdge, WemaEventMap } from './types.js';
import { EventEmitter } from './events.js';

/** A single atomic change */
type Delta =
  | { type: 'note:create'; note: WemaNote }
  | { type: 'note:update'; noteId: NoteId; before: Partial<WemaNote>; after: Partial<WemaNote> }
  | { type: 'note:delete'; note: WemaNote }
  | { type: 'edge:create'; edge: WemaEdge }
  | { type: 'edge:update'; edgeId: EdgeId; before: Partial<WemaEdge>; after: Partial<WemaEdge> }
  | { type: 'edge:delete'; edge: WemaEdge };

interface HistoryEntry {
  deltas: Delta[];
}

/** Callbacks the HistoryManager uses to replay operations during undo/redo */
export interface ReplayCallbacks {
  addNoteWithId(note: WemaNote): void;
  updateNote(id: NoteId, params: Partial<WemaNote>): void;
  deleteNoteOnly(id: NoteId): void;
  addEdgeWithId(edge: WemaEdge): void;
  updateEdge(id: EdgeId, params: Partial<WemaEdge>): void;
  deleteEdge(id: EdgeId): void;
}

/** Manages undo/redo history by listening to board events */
export class HistoryManager {
  private undoStack: HistoryEntry[] = [];
  private redoStack: HistoryEntry[] = [];
  private pendingDeltas: Delta[] = [];
  private batchDepth = 0;
  private commitScheduled = false;
  private recording = true;
  private maxHistory: number;
  private emitter: EventEmitter<WemaEventMap>;
  private replay: ReplayCallbacks;

  private handlers: {
    noteCreate: (p: WemaEventMap['note:create']) => void;
    noteUpdate: (p: WemaEventMap['note:update']) => void;
    noteDelete: (p: WemaEventMap['note:delete']) => void;
    edgeCreate: (p: WemaEventMap['edge:create']) => void;
    edgeUpdate: (p: WemaEventMap['edge:update']) => void;
    edgeDelete: (p: WemaEventMap['edge:delete']) => void;
  };

  constructor(emitter: EventEmitter<WemaEventMap>, replay: ReplayCallbacks, maxHistory = 100) {
    this.emitter = emitter;
    this.replay = replay;
    this.maxHistory = maxHistory;

    this.handlers = {
      noteCreate: (p) => this.pushDelta({ type: 'note:create', note: { ...p.note } }),
      noteUpdate: (p) => {
        const before: Partial<WemaNote> = {};
        const after: Partial<WemaNote> = {};
        for (const key of Object.keys(p.note) as (keyof WemaNote)[]) {
          if (key === 'id') continue;
          if (p.prev[key] !== p.note[key]) {
            (before as Record<string, unknown>)[key] = p.prev[key];
            (after as Record<string, unknown>)[key] = p.note[key];
          }
        }
        if (Object.keys(after).length > 0) {
          this.pushDelta({ type: 'note:update', noteId: p.note.id, before, after });
        }
      },
      noteDelete: (p) => this.pushDelta({ type: 'note:delete', note: { ...p.note } }),
      edgeCreate: (p) => this.pushDelta({ type: 'edge:create', edge: { ...p.edge } }),
      edgeUpdate: (p) => {
        const before: Partial<WemaEdge> = {};
        const after: Partial<WemaEdge> = {};
        for (const key of Object.keys(p.edge) as (keyof WemaEdge)[]) {
          if (key === 'id') continue;
          if (p.prev[key] !== p.edge[key]) {
            (before as Record<string, unknown>)[key] = p.prev[key];
            (after as Record<string, unknown>)[key] = p.edge[key];
          }
        }
        if (Object.keys(after).length > 0) {
          this.pushDelta({ type: 'edge:update', edgeId: p.edge.id, before, after });
        }
      },
      edgeDelete: (p) => this.pushDelta({ type: 'edge:delete', edge: { ...p.edge } }),
    };

    this.emitter.on('note:create', this.handlers.noteCreate);
    this.emitter.on('note:update', this.handlers.noteUpdate);
    this.emitter.on('note:delete', this.handlers.noteDelete);
    this.emitter.on('edge:create', this.handlers.edgeCreate);
    this.emitter.on('edge:update', this.handlers.edgeUpdate);
    this.emitter.on('edge:delete', this.handlers.edgeDelete);
  }

  /** Start a manual batch (e.g. for drag/resize spanning multiple ticks) */
  beginBatch(): void {
    this.batchDepth++;
  }

  /** End a manual batch and commit if depth reaches 0 */
  endBatch(): void {
    if (this.batchDepth > 0) {
      this.batchDepth--;
    }
    if (this.batchDepth === 0) {
      this.commitPending();
    }
  }

  /** Undo the last history entry */
  undo(): void {
    const entry = this.undoStack.pop();
    if (!entry) return;

    this.recording = false;
    try {
      // Replay deltas in reverse order
      for (let i = entry.deltas.length - 1; i >= 0; i--) {
        const delta = entry.deltas[i];
        switch (delta.type) {
          case 'note:create':
            this.replay.deleteNoteOnly(delta.note.id);
            break;
          case 'note:update':
            this.replay.updateNote(delta.noteId, delta.before);
            break;
          case 'note:delete':
            this.replay.addNoteWithId(delta.note);
            break;
          case 'edge:create':
            this.replay.deleteEdge(delta.edge.id);
            break;
          case 'edge:update':
            this.replay.updateEdge(delta.edgeId, delta.before);
            break;
          case 'edge:delete':
            this.replay.addEdgeWithId(delta.edge);
            break;
        }
      }
    } finally {
      this.recording = true;
    }

    this.redoStack.push(entry);
    this.emitHistoryChange();
  }

  /** Redo the last undone entry */
  redo(): void {
    const entry = this.redoStack.pop();
    if (!entry) return;

    this.recording = false;
    try {
      // Replay deltas in forward order
      for (const delta of entry.deltas) {
        switch (delta.type) {
          case 'note:create':
            this.replay.addNoteWithId(delta.note);
            break;
          case 'note:update':
            this.replay.updateNote(delta.noteId, delta.after);
            break;
          case 'note:delete':
            this.replay.deleteNoteOnly(delta.note.id);
            break;
          case 'edge:create':
            this.replay.addEdgeWithId(delta.edge);
            break;
          case 'edge:update':
            this.replay.updateEdge(delta.edgeId, delta.after);
            break;
          case 'edge:delete':
            this.replay.deleteEdge(delta.edge.id);
            break;
        }
      }
    } finally {
      this.recording = true;
    }

    this.undoStack.push(entry);
    this.emitHistoryChange();
  }

  /** Whether there are entries to undo */
  canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  /** Whether there are entries to redo */
  canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  /** Clear all history (e.g. after importData) */
  clear(): void {
    this.undoStack.length = 0;
    this.redoStack.length = 0;
    this.pendingDeltas.length = 0;
    this.batchDepth = 0;
    this.commitScheduled = false;
    this.emitHistoryChange();
  }

  /** Remove event listeners */
  destroy(): void {
    this.emitter.off('note:create', this.handlers.noteCreate);
    this.emitter.off('note:update', this.handlers.noteUpdate);
    this.emitter.off('note:delete', this.handlers.noteDelete);
    this.emitter.off('edge:create', this.handlers.edgeCreate);
    this.emitter.off('edge:update', this.handlers.edgeUpdate);
    this.emitter.off('edge:delete', this.handlers.edgeDelete);
  }

  private pushDelta(delta: Delta): void {
    if (!this.recording) return;

    this.pendingDeltas.push(delta);

    // Clear redo stack on new action
    if (this.redoStack.length > 0) {
      this.redoStack.length = 0;
    }

    // Schedule auto-commit via microtask when not in explicit batch
    if (this.batchDepth === 0 && !this.commitScheduled) {
      this.commitScheduled = true;
      queueMicrotask(() => {
        this.commitScheduled = false;
        if (this.batchDepth === 0) {
          this.commitPending();
        }
      });
    }
  }

  private commitPending(): void {
    if (this.pendingDeltas.length === 0) return;

    const entry: HistoryEntry = { deltas: this.pendingDeltas.splice(0) };
    this.undoStack.push(entry);

    // Enforce max history limit
    while (this.undoStack.length > this.maxHistory) {
      this.undoStack.shift();
    }

    this.emitHistoryChange();
  }

  private emitHistoryChange(): void {
    this.emitter.emit('history:change', {
      canUndo: this.canUndo(),
      canRedo: this.canRedo(),
    });
  }
}
