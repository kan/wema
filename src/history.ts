import type {
  NoteId,
  EdgeId,
  WemaNote,
  WemaEdge,
  WemaEventMap,
  HistoryDelta,
  HistoryOrigin,
} from './types.js';
import { EventEmitter } from './events.js';

interface HistoryEntry {
  deltas: HistoryDelta[];
}

/** Callbacks used to apply deltas to the board (undo/redo and remote changes) */
export interface ReplayCallbacks {
  addNoteWithId(note: WemaNote): void;
  updateNote(id: NoteId, params: Partial<WemaNote>): void;
  /** Delete a note together with any edge still connected to it */
  deleteNote(id: NoteId): void;
  addEdgeWithId(edge: WemaEdge): void;
  updateEdge(id: EdgeId, params: Partial<WemaEdge>): void;
  deleteEdge(id: EdgeId): void;
}

/** Copy a delta so the receiver cannot mutate the original */
function cloneDelta(delta: HistoryDelta): HistoryDelta {
  switch (delta.type) {
    case 'note:create':
    case 'note:delete':
      return { type: delta.type, note: { ...delta.note } };
    case 'edge:create':
    case 'edge:delete':
      return { type: delta.type, edge: { ...delta.edge } };
    case 'note:update':
    case 'edge:update':
      return { ...delta, before: { ...delta.before }, after: { ...delta.after } } as HistoryDelta;
  }
}

/** Build the delta that undoes `delta` (create <-> delete, before <-> after) */
function invertDelta(delta: HistoryDelta): HistoryDelta {
  const copy = cloneDelta(delta);
  switch (copy.type) {
    case 'note:create':
      return { ...copy, type: 'note:delete' };
    case 'note:delete':
      return { ...copy, type: 'note:create' };
    case 'edge:create':
      return { ...copy, type: 'edge:delete' };
    case 'edge:delete':
      return { ...copy, type: 'edge:create' };
    case 'note:update':
    case 'edge:update':
      return { ...copy, before: copy.after, after: copy.before } as HistoryDelta;
  }
}

/** The keys whose value differs between `prev` and `next`, with both values */
function diffKeys<T extends { id: string }>(
  prev: T,
  next: T,
  ignored: Set<keyof T>,
): { before: Partial<T>; after: Partial<T> } {
  const before: Partial<T> = {};
  const after: Partial<T> = {};
  for (const key of Object.keys(next) as (keyof T)[]) {
    if (key === 'id' || ignored.has(key)) continue;
    if (prev[key] !== next[key]) {
      before[key] = prev[key];
      after[key] = next[key];
    }
  }
  return { before, after };
}

/**
 * The note fields an update delta may change.
 * Written as a record so that a field added to WemaNote fails to compile here
 * until it is listed (a missing key would be dropped from undo and sync).
 */
const NOTE_UPDATE_KEYS = Object.keys({
  x: true, y: true, width: true, height: true, text: true, color: true, zIndex: true, autoSize: true,
} satisfies Record<Exclude<keyof WemaNote, 'id'>, true>) as (keyof WemaNote)[];

/** The edge fields an update delta may change (same rule as NOTE_UPDATE_KEYS) */
const EDGE_UPDATE_KEYS = Object.keys({
  fromAnchor: true, toAnchor: true, style: true, label: true, lineStyle: true, strokeWidth: true,
  arrowHead: true, arrowSize: true, routing: true, collapsed: true,
} satisfies Record<Exclude<keyof WemaEdge, 'id' | 'from' | 'to'>, true>) as (keyof WemaEdge)[];

/**
 * Params that take an object from `before` to `after`.
 * A key present only in `before` is reset to undefined. Only `keys` are
 * considered: a delta may come from the network, and anything else in it
 * (unknown fields, `__proto__`) must not reach the model.
 */
function updateParams<T extends object>(before: Partial<T>, after: Partial<T>, keys: (keyof T)[]): Partial<T> {
  const params: Partial<T> = {};
  for (const key of keys) {
    if (Object.hasOwn(after, key)) params[key] = after[key];
    else if (Object.hasOwn(before, key)) params[key] = undefined;
  }
  return params;
}

/**
 * Merge updates of the same note/edge into one delta, so that a drag made of
 * hundreds of moves commits as a single update. Updates are only merged while
 * no create/delete sits between them. Keys that end where they started are
 * dropped, and so are updates left without keys.
 */
function coalesceDeltas(deltas: HistoryDelta[]): HistoryDelta[] {
  const result: HistoryDelta[] = [];
  const lastUpdateIndex = new Map<string, number>();

  for (const delta of deltas) {
    if (delta.type !== 'note:update' && delta.type !== 'edge:update') {
      result.push(delta);
      lastUpdateIndex.clear();
      continue;
    }
    const key = delta.type === 'note:update' ? `note:${delta.noteId}` : `edge:${delta.edgeId}`;
    const index = lastUpdateIndex.get(key);
    const first = index === undefined ? undefined : result[index];
    if (index === undefined || first === undefined || first.type !== delta.type) {
      lastUpdateIndex.set(key, result.length);
      result.push(delta);
      continue;
    }
    // Earliest `before` and latest `after` win
    result[index] = {
      ...first,
      before: { ...delta.before, ...first.before },
      after: { ...first.after, ...delta.after },
    } as HistoryDelta;
  }

  return result.filter((delta) => {
    if (delta.type !== 'note:update' && delta.type !== 'edge:update') return true;
    const before = delta.before as Record<string, unknown>;
    const after = delta.after as Record<string, unknown>;
    for (const key of Object.keys(after)) {
      if (before[key] === after[key]) {
        delete before[key];
        delete after[key];
      }
    }
    return Object.keys(after).length > 0;
  });
}

/** Apply deltas in order through the replay callbacks */
export function replayDeltas(deltas: HistoryDelta[], replay: ReplayCallbacks): void {
  for (const delta of deltas) {
    switch (delta.type) {
      case 'note:create':
        replay.addNoteWithId(delta.note);
        break;
      case 'note:update':
        replay.updateNote(delta.noteId, updateParams(delta.before, delta.after, NOTE_UPDATE_KEYS));
        break;
      case 'note:delete':
        replay.deleteNote(delta.note.id);
        break;
      case 'edge:create':
        replay.addEdgeWithId(delta.edge);
        break;
      case 'edge:update':
        replay.updateEdge(delta.edgeId, updateParams(delta.before, delta.after, EDGE_UPDATE_KEYS));
        break;
      case 'edge:delete':
        replay.deleteEdge(delta.edge.id);
        break;
    }
  }
}

/** Manages undo/redo history by listening to board events */
export class HistoryManager {
  private undoStack: HistoryEntry[] = [];
  private redoStack: HistoryEntry[] = [];
  private pendingDeltas: HistoryDelta[] = [];
  private pendingOrigin: HistoryOrigin = 'user';
  private batchDepth = 0;
  private commitScheduled = false;
  private recording = true;
  private ignoredNoteKeys = new Set<keyof WemaNote>();
  private ignoredEdgeKeys = new Set<keyof WemaEdge>();
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
        const { before, after } = diffKeys(p.prev, p.note, this.ignoredNoteKeys);
        if (Object.keys(after).length > 0) {
          this.pushDelta({ type: 'note:update', noteId: p.note.id, before, after });
        }
      },
      noteDelete: (p) => this.pushDelta({ type: 'note:delete', note: { ...p.note } }),
      edgeCreate: (p) => this.pushDelta({ type: 'edge:create', edge: { ...p.edge } }),
      edgeUpdate: (p) => {
        const { before, after } = diffKeys(p.prev, p.edge, this.ignoredEdgeKeys);
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

  /**
   * Start a manual batch (e.g. for drag/resize spanning multiple ticks).
   * `origin` is reported by the `history:commit` that ends the batch. It only
   * applies to an outermost batch, and changes still waiting to be committed
   * are committed first so they keep their own origin.
   */
  beginBatch(origin?: HistoryOrigin): void {
    if (origin && this.batchDepth === 0) {
      this.commitPending();
      this.pendingOrigin = origin;
    }
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

  /**
   * Stop recording changes to the given keys (pass empty arrays to record
   * everything again). Used while those keys only hold temporary values.
   */
  setIgnoredKeys(noteKeys: (keyof WemaNote)[], edgeKeys: (keyof WemaEdge)[]): void {
    this.ignoredNoteKeys = new Set(noteKeys);
    this.ignoredEdgeKeys = new Set(edgeKeys);
  }

  /** Undo the last history entry */
  undo(): void {
    const entry = this.undoStack.pop();
    if (!entry) return;

    // Inverse deltas in reverse order
    const inverse = entry.deltas.map(invertDelta).reverse();
    this.withoutRecording(() => replayDeltas(inverse, this.replay));

    this.redoStack.push(entry);
    this.emitHistoryChange();
    this.emitter.emit('history:commit', { deltas: inverse, origin: 'undo' });
  }

  /** Redo the last undone entry */
  redo(): void {
    const entry = this.redoStack.pop();
    if (!entry) return;

    this.withoutRecording(() => replayDeltas(entry.deltas, this.replay));

    this.undoStack.push(entry);
    this.emitHistoryChange();
    this.emitter.emit('history:commit', { deltas: entry.deltas.map(cloneDelta), origin: 'redo' });
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
    this.pendingOrigin = 'user';
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

  /** Whether deltas are being replayed right now (undo/redo, or remote changes) rather than new operations made */
  isReplaying(): boolean {
    return !this.recording;
  }

  /**
   * Run `fn` without recording the changes it makes: used to replay history
   * and to apply remote changes, neither of which is a new user operation.
   */
  withoutRecording(fn: () => void): void {
    this.recording = false;
    try {
      fn();
    } finally {
      this.recording = true;
    }
  }

  private pushDelta(delta: HistoryDelta): void {
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
    const origin = this.pendingOrigin;
    this.pendingOrigin = 'user';
    const deltas = coalesceDeltas(this.pendingDeltas.splice(0));
    if (deltas.length === 0) return;

    const entry: HistoryEntry = { deltas };
    this.undoStack.push(entry);

    // Enforce max history limit
    while (this.undoStack.length > this.maxHistory) {
      this.undoStack.shift();
    }

    this.emitHistoryChange();
    this.emitter.emit('history:commit', { deltas: entry.deltas.map(cloneDelta), origin });
  }

  private emitHistoryChange(): void {
    this.emitter.emit('history:change', {
      canUndo: this.canUndo(),
      canRedo: this.canRedo(),
    });
  }
}
