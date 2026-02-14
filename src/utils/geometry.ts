import type { Anchor, WemaNote } from '../types.js';

/** Point in 2D space */
export interface Point {
  x: number;
  y: number;
}

const CONCRETE_ANCHORS: readonly ('top' | 'right' | 'bottom' | 'left')[] = ['top', 'right', 'bottom', 'left'];

/** Get the pixel coordinates of an anchor point on a note */
export function getAnchorPoint(note: WemaNote, anchor: Anchor): Point {
  const cx = note.x + note.width / 2;
  const cy = note.y + note.height / 2;

  switch (anchor) {
    case 'top':
      return { x: cx, y: note.y };
    case 'bottom':
      return { x: cx, y: note.y + note.height };
    case 'left':
      return { x: note.x, y: cy };
    case 'right':
      return { x: note.x + note.width, y: cy };
    case 'auto':
      return { x: cx, y: cy };
  }
}

/**
 * Resolve 'auto' anchor to the best concrete anchor.
 * Picks the anchor whose outward direction is closest to the line
 * from this note's center to the other note's center.
 */
export function resolveAutoAnchor(note: WemaNote, other: WemaNote): 'top' | 'right' | 'bottom' | 'left' {
  const cx = note.x + note.width / 2;
  const cy = note.y + note.height / 2;
  const ox = other.x + other.width / 2;
  const oy = other.y + other.height / 2;

  const dx = ox - cx;
  const dy = oy - cy;

  // Direction vectors for each anchor (outward normals)
  const normals: Record<'top' | 'right' | 'bottom' | 'left', { x: number; y: number }> = {
    top: { x: 0, y: -1 },
    right: { x: 1, y: 0 },
    bottom: { x: 0, y: 1 },
    left: { x: -1, y: 0 },
  };

  let best: 'top' | 'right' | 'bottom' | 'left' = 'right';
  let bestDot = -Infinity;

  for (const a of CONCRETE_ANCHORS) {
    const n = normals[a];
    const dot = dx * n.x + dy * n.y;
    if (dot > bestDot) {
      bestDot = dot;
      best = a;
    }
  }

  return best;
}

/** Normal direction vector for each anchor */
function anchorNormal(anchor: 'top' | 'right' | 'bottom' | 'left'): Point {
  switch (anchor) {
    case 'top': return { x: 0, y: -1 };
    case 'bottom': return { x: 0, y: 1 };
    case 'left': return { x: -1, y: 0 };
    case 'right': return { x: 1, y: 0 };
  }
}

/**
 * Generate SVG cubic bezier path between two anchor points.
 * Control points are offset along the anchor normal, proportional to distance.
 */
export function computeEdgePath(
  fromNote: WemaNote,
  toNote: WemaNote,
  fromAnchor: Anchor,
  toAnchor: Anchor,
): string {
  const resolvedFrom = fromAnchor === 'auto' ? resolveAutoAnchor(fromNote, toNote) : fromAnchor;
  const resolvedTo = toAnchor === 'auto' ? resolveAutoAnchor(toNote, fromNote) : toAnchor;

  const p1 = getAnchorPoint(fromNote, resolvedFrom);
  const p2 = getAnchorPoint(toNote, resolvedTo);

  const dist = Math.sqrt((p2.x - p1.x) ** 2 + (p2.y - p1.y) ** 2);
  const offset = Math.min(Math.max(dist * 0.4, 40), 150);

  const n1 = anchorNormal(resolvedFrom);
  const n2 = anchorNormal(resolvedTo);

  const cp1x = p1.x + n1.x * offset;
  const cp1y = p1.y + n1.y * offset;
  const cp2x = p2.x + n2.x * offset;
  const cp2y = p2.y + n2.y * offset;

  return `M ${p1.x} ${p1.y} C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2.x} ${p2.y}`;
}

/**
 * Generate a temporary path from an anchor point to a free cursor position.
 * Used during edge creation drag.
 */
export function computeTempEdgePath(
  fromNote: WemaNote,
  fromAnchor: 'top' | 'right' | 'bottom' | 'left',
  toPoint: Point,
): string {
  const p1 = getAnchorPoint(fromNote, fromAnchor);
  const dist = Math.sqrt((toPoint.x - p1.x) ** 2 + (toPoint.y - p1.y) ** 2);
  const offset = Math.min(Math.max(dist * 0.4, 40), 150);

  const n1 = anchorNormal(fromAnchor);
  const cp1x = p1.x + n1.x * offset;
  const cp1y = p1.y + n1.y * offset;

  // For the end point, use the reverse direction as control point
  const dx = p1.x - toPoint.x;
  const dy = p1.y - toPoint.y;
  const len = Math.sqrt(dx * dx + dy * dy) || 1;
  const cp2x = toPoint.x + (dx / len) * offset;
  const cp2y = toPoint.y + (dy / len) * offset;

  return `M ${p1.x} ${p1.y} C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${toPoint.x} ${toPoint.y}`;
}
