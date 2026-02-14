import type { NoteId, WemaEventMap } from './types.js';
import { EventEmitter } from './events.js';
import { NoteManager } from './note.js';

const DRAG_THRESHOLD = 4;

type DragState = 'IDLE' | 'PENDING' | 'DRAGGING';

interface DragContext {
  noteId: NoteId;
  startX: number;
  startY: number;
  noteStartX: number;
  noteStartY: number;
  pointerId: number;
}

export class DragManager {
  private state: DragState = 'IDLE';
  private ctx: DragContext | null = null;
  private boardEl: HTMLElement;
  private noteManager: NoteManager;
  private emitter: EventEmitter<WemaEventMap>;
  private onDragEnd?: (noteId: NoteId) => void;

  private handlePointerDown: (e: PointerEvent) => void;
  private handlePointerMove: (e: PointerEvent) => void;
  private handlePointerUp: (e: PointerEvent) => void;

  constructor(options: {
    boardEl: HTMLElement;
    noteManager: NoteManager;
    emitter: EventEmitter<WemaEventMap>;
    onDragEnd?: (noteId: NoteId) => void;
  }) {
    this.boardEl = options.boardEl;
    this.noteManager = options.noteManager;
    this.emitter = options.emitter;
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

    // Don't interfere with anchor drag (edge creation)
    if ((e.target as HTMLElement).closest('.wema-anchor')) return;

    const noteEl = (e.target as HTMLElement).closest('.wema-note') as HTMLElement | null;
    if (!noteEl) return;

    // Don't start drag if clicking inside editable content
    const contentEl = noteEl.querySelector('.wema-note-content') as HTMLElement | null;
    if (contentEl && contentEl.contains(e.target as Node) && document.activeElement === contentEl) {
      return;
    }

    const noteId = noteEl.dataset.noteId;
    if (!noteId) return;

    const note = this.noteManager.getNote(noteId);
    if (!note) return;

    this.ctx = {
      noteId,
      startX: e.clientX,
      startY: e.clientY,
      noteStartX: note.x,
      noteStartY: note.y,
      pointerId: e.pointerId,
    };

    this.state = 'PENDING';
    this.boardEl.addEventListener('pointermove', this.handlePointerMove);
    this.boardEl.addEventListener('pointerup', this.handlePointerUp);
    // Don't capture pointer here — it would hijack click event targets.
    // Capture is deferred to DRAGGING state in onPointerMove.
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

      // Capture pointer now that we're actually dragging (tracks outside board)
      this.boardEl.setPointerCapture(this.ctx.pointerId);

      // Disable contenteditable during drag
      const el = this.noteManager.getElement(this.ctx.noteId);
      const contentEl = el?.querySelector('.wema-note-content') as HTMLElement | null;
      if (contentEl) {
        contentEl.contentEditable = 'false';
        contentEl.blur();
      }

      this.noteManager.bringToFront(this.ctx.noteId);
    }

    if (this.state === 'DRAGGING') {
      const newX = this.ctx.noteStartX + dx;
      const newY = this.ctx.noteStartY + dy;
      this.noteManager.updateNote(this.ctx.noteId, { x: newX, y: newY });
    }
  }

  private onPointerUp(e: PointerEvent): void {
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

    // Re-enable contenteditable
    const el = this.noteManager.getElement(noteId);
    const contentEl = el?.querySelector('.wema-note-content') as HTMLElement | null;
    if (contentEl) {
      contentEl.contentEditable = 'true';
    }

    this.state = 'IDLE';
    this.ctx = null;

    if (wasDragging) {
      this.emitter.emit('change', { data: undefined as never });
      this.onDragEnd?.(noteId);
    }
  }
}
