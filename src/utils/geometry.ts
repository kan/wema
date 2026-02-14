import type { Anchor, WemaNote } from '../types.js';

/** Point in 2D space */
export interface Point {
  x: number;
  y: number;
}

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
      // For auto, return center — full auto logic in Phase 2
      return { x: cx, y: cy };
  }
}
