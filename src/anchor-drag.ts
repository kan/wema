import type { NoteId, Anchor, WemaEventMap } from './types.js';
import { EventEmitter } from './events.js';
import { NoteManager } from './note.js';
import { EdgeManager } from './edge.js';
import { createSvgElement } from './utils/dom.js';
import { computeTempEdgePath } from './utils/geometry.js';

/**
 * Handles dragging from anchor points to create edges.
 *
 * UX:
 * 1. Hover note → anchors appear (CSS handles this)
 * 2. Drag from anchor → temp line follows cursor
 * 3. Drop on another note's anchor or body → create edge
 * 4. Drop on empty space → cancel
 */
export class AnchorDragManager {
  private boardEl: HTMLElement;
  private svgEl: SVGSVGElement;
  private noteManager: NoteManager;
  private edgeManager: EdgeManager;
  private emitter: EventEmitter<WemaEventMap>;

  private dragging = false;
  private fromNoteId: NoteId | null = null;
  private fromAnchor: 'top' | 'right' | 'bottom' | 'left' | null = null;
  private tempPath: SVGPathElement | null = null;

  private handlePointerDown: (e: PointerEvent) => void;
  private handlePointerMove: (e: PointerEvent) => void;
  private handlePointerUp: (e: PointerEvent) => void;

  constructor(options: {
    boardEl: HTMLElement;
    svgEl: SVGSVGElement;
    noteManager: NoteManager;
    edgeManager: EdgeManager;
    emitter: EventEmitter<WemaEventMap>;
  }) {
    this.boardEl = options.boardEl;
    this.svgEl = options.svgEl;
    this.noteManager = options.noteManager;
    this.edgeManager = options.edgeManager;
    this.emitter = options.emitter;

    this.handlePointerDown = this.onPointerDown.bind(this);
    this.handlePointerMove = this.onPointerMove.bind(this);
    this.handlePointerUp = this.onPointerUp.bind(this);

    this.boardEl.addEventListener('pointerdown', this.handlePointerDown);
  }

  destroy(): void {
    this.boardEl.removeEventListener('pointerdown', this.handlePointerDown);
    this.cleanup();
  }

  private onPointerDown(e: PointerEvent): void {
    if (e.button !== 0) return;

    const anchorEl = (e.target as HTMLElement).closest('.wema-anchor') as HTMLElement | null;
    if (!anchorEl) return;

    const noteEl = anchorEl.closest('.wema-note') as HTMLElement | null;
    if (!noteEl) return;

    const noteId = noteEl.dataset.noteId;
    const anchor = anchorEl.dataset.anchor as 'top' | 'right' | 'bottom' | 'left' | undefined;
    if (!noteId || !anchor) return;

    e.preventDefault();
    e.stopPropagation();

    this.dragging = true;
    this.fromNoteId = noteId;
    this.fromAnchor = anchor;

    // Create temp path
    this.tempPath = createSvgElement('path', 'wema-edge-temp');
    this.tempPath.setAttribute('fill', 'none');
    this.svgEl.appendChild(this.tempPath);

    this.boardEl.addEventListener('pointermove', this.handlePointerMove);
    this.boardEl.addEventListener('pointerup', this.handlePointerUp);
    this.boardEl.setPointerCapture(e.pointerId);
  }

  private onPointerMove(e: PointerEvent): void {
    if (!this.dragging || !this.fromNoteId || !this.fromAnchor || !this.tempPath) return;

    const fromNote = this.noteManager.getNote(this.fromNoteId);
    if (!fromNote) return;

    const rect = this.boardEl.getBoundingClientRect();
    const point = { x: e.clientX - rect.left, y: e.clientY - rect.top };

    const d = computeTempEdgePath(fromNote, this.fromAnchor, point);
    this.tempPath.setAttribute('d', d);

    // Highlight target anchor/note
    this.clearHighlight();
    const targetEl = document.elementFromPoint(e.clientX, e.clientY);
    if (targetEl) {
      const targetNote = (targetEl as HTMLElement).closest?.('.wema-note') as HTMLElement | null;
      if (targetNote && targetNote.dataset.noteId !== this.fromNoteId) {
        targetNote.classList.add('wema-note-drop-target');
      }
    }
  }

  private onPointerUp(e: PointerEvent): void {
    if (!this.dragging) return;

    this.boardEl.removeEventListener('pointermove', this.handlePointerMove);
    this.boardEl.removeEventListener('pointerup', this.handlePointerUp);

    try {
      this.boardEl.releasePointerCapture(e.pointerId);
    } catch {
      // already released
    }

    // Find drop target
    const targetEl = document.elementFromPoint(e.clientX, e.clientY);
    let targetNoteId: NoteId | null = null;
    let targetAnchor: Anchor = 'auto';

    if (targetEl) {
      const anchorEl = (targetEl as HTMLElement).closest?.('.wema-anchor') as HTMLElement | null;
      if (anchorEl) {
        targetAnchor = (anchorEl.dataset.anchor as Anchor) ?? 'auto';
        const noteEl = anchorEl.closest('.wema-note') as HTMLElement | null;
        targetNoteId = noteEl?.dataset.noteId ?? null;
      } else {
        const noteEl = (targetEl as HTMLElement).closest?.('.wema-note') as HTMLElement | null;
        targetNoteId = noteEl?.dataset.noteId ?? null;
      }
    }

    // Create edge if dropped on a different note
    if (targetNoteId && targetNoteId !== this.fromNoteId && this.fromNoteId) {
      this.edgeManager.addEdge(this.fromNoteId, targetNoteId, {
        fromAnchor: this.fromAnchor ?? 'auto',
        toAnchor: targetAnchor,
      });
    }

    this.cleanup();
  }

  private cleanup(): void {
    this.tempPath?.remove();
    this.tempPath = null;
    this.dragging = false;
    this.fromNoteId = null;
    this.fromAnchor = null;
    this.clearHighlight();
  }

  private clearHighlight(): void {
    this.boardEl.querySelectorAll('.wema-note-drop-target').forEach((el) => {
      el.classList.remove('wema-note-drop-target');
    });
  }
}
