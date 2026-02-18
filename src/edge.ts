import type { NoteId, EdgeId, WemaEdge, WemaEventMap, EdgeStyle, LineStyle, ArrowHead } from './types.js';
import { EventEmitter } from './events.js';
import { NoteManager } from './note.js';
import { generateId } from './utils/id.js';
import { createSvgElement } from './utils/dom.js';
import { computeEdgePath } from './utils/geometry.js';

const MARKER_PREFIX = 'wema-arrowhead';
const ARROW_SIZES = [8, 12, 18];
const DEFAULT_ARROW_SIZE = 12;

export class EdgeManager {
  private edges = new Map<EdgeId, WemaEdge>();
  private groupElements = new Map<EdgeId, SVGGElement>();
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

  /** Add an edge with a specific ID (used for undo restore) */
  addEdgeWithId(edge: WemaEdge): void {
    const copy = { ...edge };
    this.edges.set(copy.id, copy);
    this.renderEdge(copy);
    this.emitter.emit('edge:create', { edge: { ...copy } });
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

  /** Update an existing edge's properties */
  updateEdge(id: EdgeId, params: Partial<Omit<WemaEdge, 'id' | 'from' | 'to'>>): void {
    const edge = this.edges.get(id);
    if (!edge) return;

    const prev = { ...edge };
    Object.assign(edge, params, { id: edge.id, from: edge.from, to: edge.to });

    // Re-apply visual style
    const path = this.pathElements.get(id);
    if (path) {
      this.applyEdgeStyle(path, edge);
    }
    this.updateEdgePath(id);

    this.emitter.emit('edge:update', { edge: { ...edge }, prev });
  }

  /** Get a single edge by ID */
  getEdge(id: EdgeId): WemaEdge | undefined {
    const edge = this.edges.get(id);
    return edge ? { ...edge } : undefined;
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

  /**
   * Show/hide edge SVG groups based on which edges are in the hidden set.
   * Called by board.ts after recomputing collapse visibility.
   */
  applyVisibility(hiddenEdges: Set<EdgeId>): void {
    for (const [id] of this.edges) {
      const group = this.groupElements.get(id);
      if (group) group.style.display = hiddenEdges.has(id) ? 'none' : '';
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

    for (const size of ARROW_SIZES) {
      const id = `${MARKER_PREFIX}-${size}`;
      if (!defs.querySelector(`#${id}`)) {
        const marker = createSvgElement('marker');
        marker.id = id;
        marker.setAttribute('viewBox', '0 0 10 10');
        marker.setAttribute('refX', '10');
        marker.setAttribute('refY', '5');
        marker.setAttribute('markerWidth', String(size));
        marker.setAttribute('markerHeight', String(size));
        marker.setAttribute('markerUnits', 'userSpaceOnUse');
        marker.setAttribute('orient', 'auto-start-reverse');

        const arrow = createSvgElement('path');
        arrow.setAttribute('d', 'M 0 0 L 10 5 L 0 10 Z');
        arrow.setAttribute('class', 'wema-arrow-fill');

        marker.appendChild(arrow);
        defs.appendChild(marker);
      }
    }
  }

  private renderEdge(edge: WemaEdge): void {
    const fromNote = this.noteManager.getNote(edge.from);
    const toNote = this.noteManager.getNote(edge.to);
    if (!fromNote || !toNote) return;

    // Group wrapper (enables CSS :hover for future per-edge controls)
    const group = createSvgElement('g', 'wema-edge-group') as SVGGElement;
    group.dataset.edgeId = edge.id;

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
    this.applyEdgeStyle(path, edge);

    group.appendChild(hit);
    group.appendChild(path);

    // Label
    if (edge.label) {
      const text = createSvgElement('text', 'wema-edge-label') as SVGTextElement;
      text.textContent = edge.label;
      text.setAttribute('text-anchor', 'middle');
      text.setAttribute('dy', '-6');
      group.appendChild(text);
      this.labelElements.set(edge.id, text);
    }

    this.svgEl.appendChild(group);
    this.groupElements.set(edge.id, group);
    this.hitElements.set(edge.id, hit);
    this.pathElements.set(edge.id, path);

    this.updateEdgePath(edge.id);
  }

  private updateEdgePath(id: EdgeId): void {
    const edge = this.edges.get(id);
    if (!edge) return;

    const fromNote = this.noteManager.getNote(edge.from);
    const toNote = this.noteManager.getNote(edge.to);
    if (!fromNote || !toNote) return;

    const d = computeEdgePath(fromNote, toNote, edge.fromAnchor, edge.toAnchor, edge.routing);

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

  private applyEdgeStyle(path: SVGPathElement, edge: WemaEdge): void {
    // Resolve effective values from explicit fields, falling back to legacy style
    const lineStyle: LineStyle = edge.lineStyle ?? (edge.style === 'dashed' ? 'dashed' : 'solid');
    const arrowHead: ArrowHead = edge.arrowHead ?? (edge.style === 'arrow' ? 'end' : 'none');
    const strokeWidth = edge.strokeWidth ?? 2;
    const arrowSize = edge.arrowSize ?? DEFAULT_ARROW_SIZE;

    // Line style
    switch (lineStyle) {
      case 'solid':
        path.removeAttribute('stroke-dasharray');
        break;
      case 'dashed':
        path.setAttribute('stroke-dasharray', '8 4');
        break;
      case 'dotted':
        path.setAttribute('stroke-dasharray', '3 3');
        break;
    }

    // Arrow head (marker uses orient="auto-start-reverse" so same marker works for both ends)
    const markerId = `${MARKER_PREFIX}-${arrowSize}`;
    const markerUrl = `url(#${markerId})`;
    if (arrowHead === 'end' || arrowHead === 'both') {
      path.setAttribute('marker-end', markerUrl);
    } else {
      path.removeAttribute('marker-end');
    }
    if (arrowHead === 'start' || arrowHead === 'both') {
      path.setAttribute('marker-start', markerUrl);
    } else {
      path.removeAttribute('marker-start');
    }

    // Stroke width (inline style to ensure it overrides CSS)
    path.style.strokeWidth = `${strokeWidth}px`;
  }

  private removeEdgeElements(id: EdgeId): void {
    this.groupElements.get(id)?.remove();
    this.groupElements.delete(id);
    this.pathElements.delete(id);
    this.hitElements.delete(id);
    this.labelElements.get(id)?.remove();
    this.labelElements.delete(id);
  }
}
