import type { NoteId } from './types.js';
import { NoteManager } from './note.js';
import type { ToBoardPoint } from './utils/geometry.js';

const MIN_WIDTH = 80;
const MIN_HEIGHT = 60;

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

  private handlePointerDown: (e: PointerEvent) => void;
  private handlePointerMove: (e: PointerEvent) => void;
  private handlePointerUp: (e: PointerEvent) => void;

  constructor(options: {
    boardEl: HTMLElement;
    noteManager: NoteManager;
    getReadOnly: () => boolean;
    /** Convert a pointer position (clientX / clientY) to board coordinates */
    toBoardPoint: ToBoardPoint;
    onResizeStart?: () => void;
    onResizeEnd?: () => void;
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

    this.boardEl.addEventListener('pointerdown', this.handlePointerDown);
  }

  destroy(): void {
    this.boardEl.removeEventListener('pointerdown', this.handlePointerDown);
    this.boardEl.removeEventListener('pointermove', this.handlePointerMove);
    this.boardEl.removeEventListener('pointerup', this.handlePointerUp);
    this.ctx = null;
  }

  private onPointerDown(e: PointerEvent): void {
    if (e.button !== 0) return;
    if (this.getReadOnly()) return;

    const handle = (e.target as HTMLElement).closest('.wema-resize-handle') as HTMLElement | null;
    if (!handle) return;

    const noteEl = handle.closest('.wema-note') as HTMLElement | null;
    if (!noteEl) return;

    const noteId = noteEl.dataset.noteId;
    if (!noteId) return;

    const note = this.noteManager.getNote(noteId);
    if (!note) return;

    // autoSize notes are not manually resizable
    if (note.autoSize) return;

    e.preventDefault();
    e.stopPropagation();

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

    const point = this.toBoardPoint(e.clientX, e.clientY);
    const dx = point.x - this.ctx.startX;
    const dy = point.y - this.ctx.startY;

    const newWidth = Math.max(MIN_WIDTH, this.ctx.startWidth + dx);
    const newHeight = Math.max(MIN_HEIGHT, this.ctx.startHeight + dy);

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
