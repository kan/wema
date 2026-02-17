import type { NoteId, WemaEventMap } from './types.js';
import { EventEmitter } from './events.js';
import { NoteManager } from './note.js';

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
  private emitter: EventEmitter<WemaEventMap>;
  private getReadOnly: () => boolean;
  private onResizeStart?: () => void;
  private onResizeEnd?: () => void;
  private ctx: ResizeContext | null = null;

  private handlePointerDown: (e: PointerEvent) => void;
  private handlePointerMove: (e: PointerEvent) => void;
  private handlePointerUp: (e: PointerEvent) => void;

  constructor(options: {
    boardEl: HTMLElement;
    noteManager: NoteManager;
    emitter: EventEmitter<WemaEventMap>;
    getReadOnly: () => boolean;
    onResizeStart?: () => void;
    onResizeEnd?: () => void;
  }) {
    this.boardEl = options.boardEl;
    this.noteManager = options.noteManager;
    this.emitter = options.emitter;
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

    // autoSize or collapsed notes are not manually resizable
    if (note.autoSize || note.collapsed) return;

    e.preventDefault();
    e.stopPropagation();

    this.ctx = {
      noteId,
      startX: e.clientX,
      startY: e.clientY,
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

    const dx = e.clientX - this.ctx.startX;
    const dy = e.clientY - this.ctx.startY;

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
    this.emitter.emit('change', { data: undefined as never });
    this.ctx = null;
  }
}
