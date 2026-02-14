import type { NoteId, EdgeId, WemaEdge, WemaEventMap, EdgeStyle } from './types.js';
import { EventEmitter } from './events.js';
import { NoteManager } from './note.js';
import { generateId } from './utils/id.js';
import { createSvgElement } from './utils/dom.js';
import { computeEdgePath } from './utils/geometry.js';

const MARKER_ID = 'wema-arrowhead';

export class EdgeManager {
  private edges = new Map<EdgeId, WemaEdge>();
  private pathElements = new Map<EdgeId, SVGPathElement>();
  private hitElements = new Map<EdgeId, SVGPathElement>();
  private labelElements = new Map<EdgeId, SVGTextElement>();
  private svgEl: SVGSVGElement;
  private emitter: EventEmitter<WemaEventMap>;
  private noteManager: NoteManager;
  private selectedEdge: EdgeId | null = null;

  constructor(options: {
    boardEl: HTMLElement;
    svgEl: SVGSVGElement;
    noteManager: NoteManager;
    emitter: EventEmitter<WemaEventMap>;
  }) {
    this.svgEl = options.svgEl;
    this.emitter = options.emitter;
    this.noteManager = options.noteManager;

    this.ensureMarkerDefs();
  }

  /** Check if a point (clientX/clientY) hits an edge. Returns the edge ID or null. */
  hitTest(clientX: number, clientY: number): EdgeId | null {
    const els = document.elementsFromPoint(clientX, clientY);
    for (const el of els) {
      if (el.classList.contains('wema-edge-hit')) {
        const edgeId = (el as SVGElement).dataset.edgeId;
        if (edgeId && this.edges.has(edgeId)) return edgeId;
      }
    }
    return null;
  }

  /** Create a new edge between two notes */
  addEdge(from: NoteId, to: NoteId, params?: Partial<Omit<WemaEdge, 'id' | 'from' | 'to'>>): WemaEdge {
    if (from === to) return undefined as never;
    if (!this.noteManager.getNote(from) || !this.noteManager.getNote(to)) return undefined as never;

    const edge: WemaEdge = {
      id: generateId(),
      from,
      to,
      fromAnchor: params?.fromAnchor ?? 'auto',
      toAnchor: params?.toAnchor ?? 'auto',
      style: params?.style ?? 'arrow',
      label: params?.label,
    };

    this.edges.set(edge.id, edge);
    this.renderEdge(edge);
    this.emitter.emit('edge:create', { edge: { ...edge } });
    return { ...edge };
  }

  /** Delete an edge */
  deleteEdge(id: EdgeId): void {
    const edge = this.edges.get(id);
    if (!edge) return;

    this.removeEdgeElements(id);
    this.edges.delete(id);
    if (this.selectedEdge === id) this.selectedEdge = null;
    this.emitter.emit('edge:delete', { edge: { ...edge } });
  }

  /** Get all edges */
  getEdges(): WemaEdge[] {
    return Array.from(this.edges.values()).map((e) => ({ ...e }));
  }

  /** Get edges connected to a note */
  getEdgesOf(noteId: NoteId): WemaEdge[] {
    return this.getEdges().filter((e) => e.from === noteId || e.to === noteId);
  }

  /** Get currently selected edge ID */
  getSelectedEdge(): EdgeId | null {
    return this.selectedEdge;
  }

  /** Select an edge (highlight it) */
  selectEdge(id: EdgeId): void {
    this.deselectEdge();
    this.selectedEdge = id;
    const path = this.pathElements.get(id);
    path?.classList.add('wema-edge-selected');
  }

  /** Deselect edge */
  deselectEdge(): void {
    if (this.selectedEdge) {
      const path = this.pathElements.get(this.selectedEdge);
      path?.classList.remove('wema-edge-selected');
      this.selectedEdge = null;
    }
  }

  /** Redraw all edges connected to a note (called after note move) */
  updateEdgesOf(noteId: NoteId): void {
    for (const [id, edge] of this.edges) {
      if (edge.from === noteId || edge.to === noteId) {
        this.updateEdgePath(id);
      }
    }
  }

  /** Remove all edges and elements */
  clear(): void {
    for (const id of this.edges.keys()) {
      this.removeEdgeElements(id);
    }
    this.edges.clear();
    this.selectedEdge = null;
  }

  /** Render edges from imported data */
  renderAll(edges: WemaEdge[]): void {
    this.clear();
    for (const edge of edges) {
      this.edges.set(edge.id, { ...edge });
      this.renderEdge(this.edges.get(edge.id)!);
    }
  }

  destroy(): void {
    this.clear();
  }

  private ensureMarkerDefs(): void {
    let defs = this.svgEl.querySelector('defs');
    if (!defs) {
      defs = createSvgElement('defs');
      this.svgEl.prepend(defs);
    }

    if (!defs.querySelector(`#${MARKER_ID}`)) {
      const marker = createSvgElement('marker');
      marker.id = MARKER_ID;
      marker.setAttribute('viewBox', '0 0 10 10');
      marker.setAttribute('refX', '10');
      marker.setAttribute('refY', '5');
      marker.setAttribute('markerWidth', '8');
      marker.setAttribute('markerHeight', '8');
      marker.setAttribute('orient', 'auto-start-reverse');

      const arrow = createSvgElement('path');
      arrow.setAttribute('d', 'M 0 0 L 10 5 L 0 10 Z');
      arrow.setAttribute('class', 'wema-arrow-fill');

      marker.appendChild(arrow);
      defs.appendChild(marker);
    }
  }

  private renderEdge(edge: WemaEdge): void {
    const fromNote = this.noteManager.getNote(edge.from);
    const toNote = this.noteManager.getNote(edge.to);
    if (!fromNote || !toNote) return;

    // Invisible wide hit area for click targeting
    const hit = createSvgElement('path', 'wema-edge-hit');
    hit.dataset.edgeId = edge.id;
    hit.setAttribute('fill', 'none');
    hit.setAttribute('stroke', 'transparent');
    hit.setAttribute('stroke-width', '20');
    hit.style.pointerEvents = 'all';

    // Visible path
    const path = createSvgElement('path', 'wema-edge-path');
    path.setAttribute('fill', 'none');
    path.dataset.edgeId = edge.id;
    this.applyEdgeStyle(path, edge.style);

    this.svgEl.appendChild(hit);
    this.svgEl.appendChild(path);
    this.hitElements.set(edge.id, hit);
    this.pathElements.set(edge.id, path);

    // Label
    if (edge.label) {
      this.renderLabel(edge);
    }

    this.updateEdgePath(edge.id);
  }

  private renderLabel(edge: WemaEdge): void {
    if (!edge.label) return;
    const text = createSvgElement('text', 'wema-edge-label');
    text.textContent = edge.label;
    text.setAttribute('text-anchor', 'middle');
    text.setAttribute('dy', '-6');
    this.svgEl.appendChild(text);
    this.labelElements.set(edge.id, text);
  }

  private updateEdgePath(id: EdgeId): void {
    const edge = this.edges.get(id);
    if (!edge) return;

    const fromNote = this.noteManager.getNote(edge.from);
    const toNote = this.noteManager.getNote(edge.to);
    if (!fromNote || !toNote) return;

    const d = computeEdgePath(fromNote, toNote, edge.fromAnchor, edge.toAnchor);

    const path = this.pathElements.get(id);
    const hit = this.hitElements.get(id);
    path?.setAttribute('d', d);
    hit?.setAttribute('d', d);

    // Update label position (midpoint of path)
    const label = this.labelElements.get(id);
    if (label) {
      const mx = (fromNote.x + fromNote.width / 2 + toNote.x + toNote.width / 2) / 2;
      const my = (fromNote.y + fromNote.height / 2 + toNote.y + toNote.height / 2) / 2;
      label.setAttribute('x', String(mx));
      label.setAttribute('y', String(my));
    }
  }

  private applyEdgeStyle(path: SVGPathElement, style: EdgeStyle): void {
    switch (style) {
      case 'arrow':
        path.setAttribute('marker-end', `url(#${MARKER_ID})`);
        path.removeAttribute('stroke-dasharray');
        break;
      case 'line':
        path.removeAttribute('marker-end');
        path.removeAttribute('stroke-dasharray');
        break;
      case 'dashed':
        path.removeAttribute('marker-end');
        path.setAttribute('stroke-dasharray', '8 4');
        break;
    }
  }

  private removeEdgeElements(id: EdgeId): void {
    this.pathElements.get(id)?.remove();
    this.pathElements.delete(id);
    this.hitElements.get(id)?.remove();
    this.hitElements.delete(id);
    this.labelElements.get(id)?.remove();
    this.labelElements.delete(id);
  }
}
