import type { NoteId } from './types.js';
import { NoteManager } from './note.js';
import type { ToBoardPoint } from './utils/geometry.js';
import { DRAG_THRESHOLD } from './drag.js';

const MIN_WIDTH = 80;
const MIN_HEIGHT = 60;

/** Two presses on a handle within this time are a double press */
const DOUBLE_PRESS_MS = 500;

/** A press on a resize handle that may turn out to be the first of a double press */
interface HandlePress {
  noteId: NoteId;
  time: number;
  clientX: number;
  clientY: number;
}

interface ResizeContext {
  noteId: NoteId;
  startX: number;
  startY: number;
  startWidth: number;
  startHeight: number;
  pointerId: number;
}

export class ResizeManager {
  private boardEl: HTMLElement;
  private noteManager: NoteManager;
  private getReadOnly: () => boolean;
  private toBoardPoint: ToBoardPoint;
  private onResizeStart?: () => void;
  private onResizeEnd?: () => void;
  private ctx: ResizeContext | null = null;

  private onDoublePress?: (noteId: NoteId) => void;
  private firstPress: HandlePress | null = null;
  /** Whether the last press on the board was one on a resize handle that this manager took */
  private pressedHandle = false;

  private handlePointerDown: (e: PointerEvent) => void;
  private handlePointerMove: (e: PointerEvent) => void;
  private handlePointerUp: (e: PointerEvent) => void;
  private handleClickAfterPress: (e: MouseEvent) => void;
  private handleAnyPointerDown: () => void;

  constructor(options: {
    boardEl: HTMLElement;
    noteManager: NoteManager;
    getReadOnly: () => boolean;
    /** Convert a pointer position (clientX / clientY) to board coordinates */
    toBoardPoint: ToBoardPoint;
    onResizeStart?: () => void;
    onResizeEnd?: () => void;
    /** The resize handle of a note was pressed twice in a row: fit the note to its content */
    onDoublePress?: (noteId: NoteId) => void;
  }) {
    this.toBoardPoint = options.toBoardPoint;
    this.boardEl = options.boardEl;
    this.noteManager = options.noteManager;
    this.getReadOnly = options.getReadOnly;
    this.onResizeStart = options.onResizeStart;
    this.onResizeEnd = options.onResizeEnd;

    this.handlePointerDown = this.onPointerDown.bind(this);
    this.handlePointerMove = this.onPointerMove.bind(this);
    this.handlePointerUp = this.onPointerUp.bind(this);

    this.onDoublePress = options.onDoublePress;
    this.handleClickAfterPress = this.onClickAfterPress.bind(this);
    this.handleAnyPointerDown = this.onAnyPointerDown.bind(this);

    this.boardEl.addEventListener('pointerdown', this.handleAnyPointerDown, true);
    this.boardEl.addEventListener('pointerdown', this.handlePointerDown);
    // Capture phase: before the board's own click and dblclick handlers
    this.boardEl.addEventListener('click', this.handleClickAfterPress, true);
    this.boardEl.addEventListener('dblclick', this.handleClickAfterPress, true);
  }

  destroy(): void {
    this.boardEl.removeEventListener('click', this.handleClickAfterPress, true);
    this.boardEl.removeEventListener('dblclick', this.handleClickAfterPress, true);
    this.boardEl.removeEventListener('pointerdown', this.handleAnyPointerDown, true);
    this.boardEl.removeEventListener('pointerdown', this.handlePointerDown);
    this.boardEl.removeEventListener('pointermove', this.handlePointerMove);
    this.boardEl.removeEventListener('pointerup', this.handlePointerUp);
    this.ctx = null;
  }

  /** The note whose resize handle the event is on, unless the board is read-only */
  private noteOfHandle(e: PointerEvent): NoteId | null {
    if (e.button !== 0) return null;
    if (this.getReadOnly()) return null;

    const handle = (e.target as HTMLElement).closest('.wema-resize-handle') as HTMLElement | null;
    const noteEl = handle?.closest('.wema-note') as HTMLElement | null | undefined;
    return noteEl?.dataset.noteId ?? null;
  }

  /**
   * Stop the `click` and `dblclick` that follow a press on a handle. A press
   * that starts a resize captures the pointer, so these events arrive with
   * the board as their target: the board would take them for a click on an
   * empty area (and clear the selection) or a double click there (and create
   * a note). The second press of a double press does not capture, and its
   * click arrives on the handle: the board would take it for a click on the
   * note (and select that note only). The double press itself is handled in
   * `onPointerDown`.
   */
  private onClickAfterPress(e: MouseEvent): void {
    if (!this.pressedHandle) return;
    const target = e.target as HTMLElement;
    if (target !== this.boardEl && !target.closest('.wema-resize-handle')) return;
    e.preventDefault();
    e.stopImmediatePropagation();
  }

  /**
   * Any press on the board ends the state of the press before it. Runs in the
   * capture phase, so it also sees a press that another handler takes for
   * itself and stops (a pan, a collapse button).
   */
  private onAnyPointerDown(): void {
    this.pressedHandle = false;
  }

  /** Whether this press on a handle is the second of a double press on it */
  private isSecondPress(e: PointerEvent, noteId: NoteId): boolean {
    const first = this.firstPress;
    return first !== null && first.noteId === noteId
      && e.timeStamp - first.time < DOUBLE_PRESS_MS
      && Math.hypot(e.clientX - first.clientX, e.clientY - first.clientY) < DRAG_THRESHOLD;
  }

  private onPointerDown(e: PointerEvent): void {
    const noteId = this.noteOfHandle(e);
    if (!noteId) return;

    const note = this.noteManager.getNote(noteId);
    if (!note) return;

    // autoSize notes are not manually resizable
    if (note.autoSize) return;

    e.preventDefault();
    e.stopPropagation();
    this.pressedHandle = true;

    if (this.isSecondPress(e, noteId)) {
      this.firstPress = null;
      this.onDoublePress?.(noteId);
      return;
    }
    this.firstPress = { noteId, time: e.timeStamp, clientX: e.clientX, clientY: e.clientY };

    // Kept in board coordinates, so the handle stays under the pointer even
    // if the viewport moves during the resize
    const start = this.toBoardPoint(e.clientX, e.clientY);
    this.ctx = {
      noteId,
      startX: start.x,
      startY: start.y,
      startWidth: note.width,
      startHeight: note.height,
      pointerId: e.pointerId,
    };

    this.boardEl.setPointerCapture(e.pointerId);
    this.boardEl.addEventListener('pointermove', this.handlePointerMove);
    this.boardEl.addEventListener('pointerup', this.handlePointerUp);

    this.onResizeStart?.();
  }

  private onPointerMove(e: PointerEvent): void {
    if (!this.ctx) return;

    // The note is not resized until the press has become a drag: a press that
    // only wobbles may be the first of a double press, and must change nothing
    const press = this.firstPress;
    if (press) {
      if (Math.hypot(e.clientX - press.clientX, e.clientY - press.clientY) < DRAG_THRESHOLD) return;
      // Now it is a resize, and no longer a candidate for a double press
      this.firstPress = null;
    }

    const point = this.toBoardPoint(e.clientX, e.clientY);
    const dx = point.x - this.ctx.startX;
    const dy = point.y - this.ctx.startY;

    // A note fitted to its content may be smaller than the minimum: it is not
    // made larger just because the handle was dragged
    const { startWidth, startHeight } = this.ctx;
    const newWidth = Math.max(Math.min(MIN_WIDTH, startWidth), startWidth + dx);
    const newHeight = Math.max(Math.min(MIN_HEIGHT, startHeight), startHeight + dy);

    this.noteManager.updateNote(this.ctx.noteId, { width: newWidth, height: newHeight });
  }

  private onPointerUp(e: PointerEvent): void {
    if (!this.ctx) return;

    this.boardEl.removeEventListener('pointermove', this.handlePointerMove);
    this.boardEl.removeEventListener('pointerup', this.handlePointerUp);

    try {
      this.boardEl.releasePointerCapture(this.ctx.pointerId);
    } catch {
      // already released
    }

    this.onResizeEnd?.();
    this.ctx = null;
  }
}
