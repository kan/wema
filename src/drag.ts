import type { NoteId } from './types.js';
import { NoteManager } from './note.js';
import type { ToBoardPoint } from './utils/geometry.js';

/** How far the pointer must move, in screen pixels, before a press becomes a drag rather than a click */
export const DRAG_THRESHOLD = 4;

type DragState = 'IDLE' | 'PENDING' | 'DRAGGING';

interface GroupOffset {
  id: NoteId;
  startX: number;
  startY: number;
}

interface DragContext {
  noteId: NoteId;
  startX: number;
  startY: number;
  startClientX: number;
  startClientY: number;
  noteStartX: number;
  noteStartY: number;
  pointerId: number;
  groupOffsets: GroupOffset[] | null;
}

export class DragManager {
  private state: DragState = 'IDLE';
  private ctx: DragContext | null = null;
  private boardEl: HTMLElement;
  private noteManager: NoteManager;
  private getReadOnly: () => boolean;
  private getSelection: () => NoteId[];
  private toBoardPoint: ToBoardPoint;
  private onDragStart?: () => void;
  private onDragEnd?: (noteId: NoteId) => void;

  private handlePointerDown: (e: PointerEvent) => void;
  private handlePointerMove: (e: PointerEvent) => void;
  private handlePointerUp: (e: PointerEvent) => void;

  constructor(options: {
    boardEl: HTMLElement;
    noteManager: NoteManager;
    getReadOnly: () => boolean;
    getSelection: () => NoteId[];
    /** Convert a pointer position (clientX / clientY) to board coordinates */
    toBoardPoint: ToBoardPoint;
    onDragStart?: () => void;
    onDragEnd?: (noteId: NoteId) => void;
  }) {
    this.toBoardPoint = options.toBoardPoint;
    this.boardEl = options.boardEl;
    this.noteManager = options.noteManager;
    this.getReadOnly = options.getReadOnly;
    this.getSelection = options.getSelection;
    this.onDragStart = options.onDragStart;
    this.onDragEnd = options.onDragEnd;

    this.handlePointerDown = this.onPointerDown.bind(this);
    this.handlePointerMove = this.onPointerMove.bind(this);
    this.handlePointerUp = this.onPointerUp.bind(this);

    this.boardEl.addEventListener('pointerdown', this.handlePointerDown);
  }

  destroy(): void {
    this.boardEl.removeEventListener('pointerdown', this.handlePointerDown);
    this.boardEl.removeEventListener('pointermove', this.handlePointerMove);
    this.boardEl.removeEventListener('pointerup', this.handlePointerUp);
    this.state = 'IDLE';
    this.ctx = null;
  }

  private onPointerDown(e: PointerEvent): void {
    if (e.button !== 0) return; // left click only
    if (this.getReadOnly()) return;

    // Only start drag from the move handle
    if (!(e.target as HTMLElement).closest('.wema-move-handle')) return;

    const noteEl = (e.target as HTMLElement).closest('.wema-note') as HTMLElement | null;
    if (!noteEl) return;

    e.preventDefault();

    const noteId = noteEl.dataset.noteId;
    if (!noteId) return;

    const note = this.noteManager.getNote(noteId);
    if (!note) return;

    // Check if this note is part of a multi-selection
    const selection = this.getSelection();
    let groupOffsets: GroupOffset[] | null = null;
    if (selection.length > 1 && selection.includes(noteId)) {
      groupOffsets = [];
      for (const id of selection) {
        const n = this.noteManager.getNote(id);
        if (n) {
          groupOffsets.push({ id, startX: n.x, startY: n.y });
        }
      }
    }

    // Positions are kept in board coordinates, so the note stays under the
    // pointer even if the viewport moves during the drag
    const start = this.toBoardPoint(e.clientX, e.clientY);
    this.ctx = {
      noteId,
      startX: start.x,
      startY: start.y,
      startClientX: e.clientX,
      startClientY: e.clientY,
      noteStartX: note.x,
      noteStartY: note.y,
      pointerId: e.pointerId,
      groupOffsets,
    };

    this.state = 'PENDING';
    this.boardEl.addEventListener('pointermove', this.handlePointerMove);
    this.boardEl.addEventListener('pointerup', this.handlePointerUp);
  }

  private onPointerMove(e: PointerEvent): void {
    if (!this.ctx) return;

    const point = this.toBoardPoint(e.clientX, e.clientY);
    const dx = point.x - this.ctx.startX;
    const dy = point.y - this.ctx.startY;

    if (this.state === 'PENDING') {
      // Compared on screen: in board coordinates the distance depends on the zoom
      if (
        Math.abs(e.clientX - this.ctx.startClientX) < DRAG_THRESHOLD
        && Math.abs(e.clientY - this.ctx.startClientY) < DRAG_THRESHOLD
      ) {
        return;
      }
      this.state = 'DRAGGING';
      this.onDragStart?.();

      // Capture pointer now that we're actually dragging (tracks outside board)
      this.boardEl.setPointerCapture(this.ctx.pointerId);
      this.noteManager.bringToFront(this.ctx.noteId);
    }

    if (this.state === 'DRAGGING') {
      if (this.ctx.groupOffsets) {
        // Group drag: move all selected notes
        for (const offset of this.ctx.groupOffsets) {
          this.noteManager.updateNote(offset.id, {
            x: offset.startX + dx,
            y: offset.startY + dy,
          });
        }
      } else {
        // Single drag
        const newX = this.ctx.noteStartX + dx;
        const newY = this.ctx.noteStartY + dy;
        this.noteManager.updateNote(this.ctx.noteId, { x: newX, y: newY });
      }
    }
  }

  private onPointerUp(_e: PointerEvent): void {
    if (!this.ctx) return;

    this.boardEl.removeEventListener('pointermove', this.handlePointerMove);
    this.boardEl.removeEventListener('pointerup', this.handlePointerUp);

    const wasDragging = this.state === 'DRAGGING';

    if (wasDragging) {
      try {
        this.boardEl.releasePointerCapture(this.ctx.pointerId);
      } catch {
        // pointer capture may already be released
      }
    }
    const noteId = this.ctx.noteId;

    this.state = 'IDLE';
    this.ctx = null;

    if (wasDragging) {
      this.onDragEnd?.(noteId);
    }
  }
}
