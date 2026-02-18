import type { Anchor, EdgeRouting, WemaNote } from '../types.js';

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
export function getAnchorNormal(anchor: 'top' | 'right' | 'bottom' | 'left'): Point {
  switch (anchor) {
    case 'top': return { x: 0, y: -1 };
    case 'bottom': return { x: 0, y: 1 };
    case 'left': return { x: -1, y: 0 };
    case 'right': return { x: 1, y: 0 };
  }
}

/**
 * Generate SVG path between two anchor points.
 * Uses cubic bezier for 'curve' routing, orthogonal polyline for 'polyline'.
 */
export function computeEdgePath(
  fromNote: WemaNote,
  toNote: WemaNote,
  fromAnchor: Anchor,
  toAnchor: Anchor,
  routing?: EdgeRouting,
): string {
  const resolvedFrom = fromAnchor === 'auto' ? resolveAutoAnchor(fromNote, toNote) : fromAnchor;
  const resolvedTo = toAnchor === 'auto' ? resolveAutoAnchor(toNote, fromNote) : toAnchor;

  const p1 = getAnchorPoint(fromNote, resolvedFrom);
  const p2 = getAnchorPoint(toNote, resolvedTo);

  if (routing === 'polyline') {
    return computePolylinePath(p1, p2, resolvedFrom, resolvedTo);
  }

  const dist = Math.sqrt((p2.x - p1.x) ** 2 + (p2.y - p1.y) ** 2);
  const offset = Math.min(Math.max(dist * 0.4, 40), 150);

  const n1 = getAnchorNormal(resolvedFrom);
  const n2 = getAnchorNormal(resolvedTo);

  const cp1x = p1.x + n1.x * offset;
  const cp1y = p1.y + n1.y * offset;
  const cp2x = p2.x + n2.x * offset;
  const cp2y = p2.y + n2.y * offset;

  return `M ${p1.x} ${p1.y} C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2.x} ${p2.y}`;
}

/**
 * Generate an orthogonal (right-angle only) polyline path between two anchor points.
 * All segments are strictly horizontal or vertical — no diagonal lines.
 *
 * Three routing patterns depending on anchor relationship:
 *
 * 1. **Facing** (opposite normals, e.g. bottom→top):
 *    Route directly through the gap — no offset needed.
 *    ```
 *    p1 ──┐
 *         │  midpoint between p1 & p2
 *    p2 ──┘
 *    ```
 *
 * 2. **Same direction** (same normals, e.g. bottom→bottom):
 *    Extend outward past both, then bridge.
 *    ```
 *    p1 ──┐
 *         │  beyond the outermost point + offset
 *    p2 ──┘
 *    ```
 *
 * 3. **Perpendicular** (e.g. right→top):
 *    Single L-shaped corner.
 *    ```
 *    p1 ────── corner
 *                │
 *               p2
 *    ```
 */
function computePolylinePath(
  p1: Point,
  p2: Point,
  fromAnchor: 'top' | 'right' | 'bottom' | 'left',
  toAnchor: 'top' | 'right' | 'bottom' | 'left',
): string {
  const n1 = getAnchorNormal(fromAnchor);
  const n2 = getAnchorNormal(toAnchor);
  const fromHoriz = fromAnchor === 'left' || fromAnchor === 'right';
  const toHoriz = toAnchor === 'left' || toAnchor === 'right';

  let waypoints: Point[];

  if (fromHoriz === toHoriz) {
    // Same axis — check facing vs same-direction
    const facing = (n1.x + n2.x === 0) && (n1.y + n2.y === 0);

    if (facing) {
      // Opposite normals: route through the midpoint between p1 and p2
      if (fromHoriz) {
        const midX = (p1.x + p2.x) / 2;
        waypoints = [{ x: midX, y: p1.y }, { x: midX, y: p2.y }];
      } else {
        const midY = (p1.y + p2.y) / 2;
        waypoints = [{ x: p1.x, y: midY }, { x: p2.x, y: midY }];
      }
    } else {
      // Same direction: extend outward past both anchors
      const dist = Math.sqrt((p2.x - p1.x) ** 2 + (p2.y - p1.y) ** 2);
      const offset = Math.min(Math.max(dist * 0.3, 30), 100);

      if (fromHoriz) {
        const outX = n1.x > 0
          ? Math.max(p1.x, p2.x) + offset
          : Math.min(p1.x, p2.x) - offset;
        waypoints = [{ x: outX, y: p1.y }, { x: outX, y: p2.y }];
      } else {
        const outY = n1.y > 0
          ? Math.max(p1.y, p2.y) + offset
          : Math.min(p1.y, p2.y) - offset;
        waypoints = [{ x: p1.x, y: outY }, { x: p2.x, y: outY }];
      }
    }
  } else {
    // Perpendicular — single L-shaped corner
    if (fromHoriz) {
      waypoints = [{ x: p2.x, y: p1.y }];
    } else {
      waypoints = [{ x: p1.x, y: p2.y }];
    }
  }

  const parts = [`M ${p1.x} ${p1.y}`];
  for (const wp of waypoints) {
    parts.push(`L ${wp.x} ${wp.y}`);
  }
  parts.push(`L ${p2.x} ${p2.y}`);
  return parts.join(' ');
}

/**
 * Generate a temporary path from an anchor point to a free cursor position.
 * Used during edge creation drag.
 */
export function computeTempEdgePath(
  fromNote: WemaNote,
  fromAnchor: 'top' | 'right' | 'bottom' | 'left',
  toPoint: Point,
  routing?: EdgeRouting,
): string {
  const p1 = getAnchorPoint(fromNote, fromAnchor);
  const dist = Math.sqrt((toPoint.x - p1.x) ** 2 + (toPoint.y - p1.y) ** 2);

  if (routing === 'polyline') {
    const fromHoriz = fromAnchor === 'left' || fromAnchor === 'right';
    const corner = fromHoriz
      ? { x: toPoint.x, y: p1.y }  // horizontal then vertical
      : { x: p1.x, y: toPoint.y }; // vertical then horizontal
    return `M ${p1.x} ${p1.y} L ${corner.x} ${corner.y} L ${toPoint.x} ${toPoint.y}`;
  }

  const offset = Math.min(Math.max(dist * 0.4, 40), 150);

  const n1 = getAnchorNormal(fromAnchor);
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
