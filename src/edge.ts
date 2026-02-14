import type { NoteId, EdgeId, WemaEdge, WemaEventMap } from './types.js';
import { EventEmitter } from './events.js';

/**
 * EdgeManager — stub for Phase 1.
 * Full implementation (SVG rendering, anchor drag) comes in Phase 2.
 */
export class EdgeManager {
  private edges = new Map<EdgeId, WemaEdge>();

  constructor(_options: {
    boardEl: HTMLElement;
    svgEl: SVGSVGElement;
    emitter: EventEmitter<WemaEventMap>;
  }) {
    // Phase 2
  }

  addEdge(_from: NoteId, _to: NoteId, _params?: Partial<Omit<WemaEdge, 'id' | 'from' | 'to'>>): WemaEdge {
    console.warn('EdgeManager.addEdge() is a stub in Phase 1');
    return undefined as never;
  }

  deleteEdge(_id: EdgeId): void {
    console.warn('EdgeManager.deleteEdge() is a stub in Phase 1');
  }

  getEdges(): WemaEdge[] {
    return Array.from(this.edges.values()).map((e) => ({ ...e }));
  }

  getEdgesOf(_noteId: NoteId): WemaEdge[] {
    return [];
  }

  clear(): void {
    this.edges.clear();
  }

  destroy(): void {
    this.clear();
  }
}
