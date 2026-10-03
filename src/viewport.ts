import type { WemaViewport } from './types.js';
import type { Point } from './utils/geometry.js';

/**
 * Which part of the board is shown, and the conversions between the three
 * coordinate systems: client (clientX / clientY), screen (pixels inside the
 * board element, where overlays are placed) and board (where notes are).
 */
export class Viewport {
  private x = 0;
  private y = 0;
  private zoom: number;
  private minZoom: number;
  private maxZoom: number;
  private boardEl: HTMLElement;
  private layerEl: HTMLElement;

  constructor(options: { boardEl: HTMLElement; layerEl: HTMLElement; minZoom?: number; maxZoom?: number }) {
    this.boardEl = options.boardEl;
    this.layerEl = options.layerEl;
    // A zoom range that is not positive numbers would break the conversions
    const valid = (zoom: number | undefined, fallback: number): number =>
      zoom !== undefined && Number.isFinite(zoom) && zoom > 0 ? zoom : fallback;
    this.minZoom = valid(options.minZoom, 0.25);
    this.maxZoom = Math.max(valid(options.maxZoom, 2), this.minZoom);
    // Start at actual size, or as close to it as the zoom range allows
    this.zoom = this.clampZoom(1);
    this.layerEl.style.transformOrigin = '0 0';
    this.applyTransform();
  }

  get(): WemaViewport {
    return { x: this.x, y: this.y, zoom: this.zoom };
  }

  /** Keep a zoom within the zoom range (NaN stays NaN) */
  clampZoom(zoom: number): number {
    return Math.min(this.maxZoom, Math.max(this.minZoom, zoom));
  }

  /**
   * Move and scale the layer; values left out stay. The zoom is kept within
   * the zoom range. Returns false when nothing changed, which includes a
   * value that is not a finite number.
   */
  set(viewport: Partial<WemaViewport>): boolean {
    const x = viewport.x ?? this.x;
    const y = viewport.y ?? this.y;
    const zoom = this.clampZoom(viewport.zoom ?? this.zoom);
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(zoom)) return false;
    if (x === this.x && y === this.y && zoom === this.zoom) return false;
    this.x = x;
    this.y = y;
    this.zoom = zoom;
    this.applyTransform();
    return true;
  }

  private applyTransform(): void {
    const scale = this.zoom === 1 ? '' : ` scale(${this.zoom})`;
    this.layerEl.style.transform = `translate(${this.x}px, ${this.y}px)${scale}`;
  }

  /** The middle of the board element, as a position inside it */
  screenCenter(): Point {
    return { x: this.boardEl.clientWidth / 2, y: this.boardEl.clientHeight / 2 };
  }

  /** Convert a pointer position (clientX / clientY) to a position inside the board element */
  clientToScreen(clientX: number, clientY: number): Point {
    const rect = this.boardEl.getBoundingClientRect();
    return { x: clientX - rect.left, y: clientY - rect.top };
  }

  /** Convert a position inside the board element to board coordinates */
  screenToBoard(x: number, y: number): Point {
    return { x: (x - this.x) / this.zoom, y: (y - this.y) / this.zoom };
  }

  /** Convert board coordinates to a position inside the board element (for overlays) */
  boardToScreen(x: number, y: number): Point {
    return { x: x * this.zoom + this.x, y: y * this.zoom + this.y };
  }

  /** Convert a pointer position (clientX / clientY) to board coordinates */
  clientToBoard(clientX: number, clientY: number): Point {
    const screen = this.clientToScreen(clientX, clientY);
    return this.screenToBoard(screen.x, screen.y);
  }
}
