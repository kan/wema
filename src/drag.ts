import type { NoteId, WemaEventMap } from './types.js';
import { EventEmitter } from './events.js';
import { NoteManager } from './note.js';

const DRAG_THRESHOLD = 4;

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
  private emitter: EventEmitter<WemaEventMap>;
  private getReadOnly: () => boolean;
  private getSelection: () => NoteId[];
  private onDragStart?: () => void;
  private onDragEnd?: (noteId: NoteId) => void;

  private handlePointerDown: (e: PointerEvent) => void;
  private handlePointerMove: (e: PointerEvent) => void;
  private handlePointerUp: (e: PointerEvent) => void;

  constructor(options: {
    boardEl: HTMLElement;
    noteManager: NoteManager;
    emitter: EventEmitter<WemaEventMap>;
    getReadOnly: () => boolean;
    getSelection: () => NoteId[];
    onDragStart?: () => void;
    onDragEnd?: (noteId: NoteId) => void;
  }) {
    this.boardEl = options.boardEl;
    this.noteManager = options.noteManager;
    this.emitter = options.emitter;
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

    this.ctx = {
      noteId,
      startX: e.clientX,
      startY: e.clientY,
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

    const dx = e.clientX - this.ctx.startX;
    const dy = e.clientY - this.ctx.startY;

    if (this.state === 'PENDING') {
      if (Math.abs(dx) < DRAG_THRESHOLD && Math.abs(dy) < DRAG_THRESHOLD) {
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
      this.emitter.emit('change', { data: undefined as never });
      this.onDragEnd?.(noteId);
    }
  }
}
