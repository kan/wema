import { describe, it, expect } from 'vitest';
import { getAnchorPoint, resolveAutoAnchor, computeEdgePath, placeOverlayBox } from '../src/utils/geometry';
import type { WemaNote } from '../src/types';

const makeNote = (x: number, y: number, w = 200, h = 150): WemaNote => ({
  id: 'test',
  x, y,
  width: w,
  height: h,
  text: '',
  color: '#FFF',
  zIndex: 1,
});

describe('geometry', () => {
  describe('getAnchorPoint', () => {
    const note = makeNote(100, 50);

    it('returns top center for "top"', () => {
      expect(getAnchorPoint(note, 'top')).toEqual({ x: 200, y: 50 });
    });

    it('returns bottom center for "bottom"', () => {
      expect(getAnchorPoint(note, 'bottom')).toEqual({ x: 200, y: 200 });
    });

    it('returns left center for "left"', () => {
      expect(getAnchorPoint(note, 'left')).toEqual({ x: 100, y: 125 });
    });

    it('returns right center for "right"', () => {
      expect(getAnchorPoint(note, 'right')).toEqual({ x: 300, y: 125 });
    });

    it('returns center for "auto"', () => {
      expect(getAnchorPoint(note, 'auto')).toEqual({ x: 200, y: 125 });
    });
  });

  describe('resolveAutoAnchor', () => {
    const center = makeNote(200, 200);

    it('picks "right" when other is to the right', () => {
      const other = makeNote(500, 200);
      expect(resolveAutoAnchor(center, other)).toBe('right');
    });

    it('picks "left" when other is to the left', () => {
      const other = makeNote(-200, 200);
      expect(resolveAutoAnchor(center, other)).toBe('left');
    });

    it('picks "bottom" when other is below', () => {
      const other = makeNote(200, 500);
      expect(resolveAutoAnchor(center, other)).toBe('bottom');
    });

    it('picks "top" when other is above', () => {
      const other = makeNote(200, -200);
      expect(resolveAutoAnchor(center, other)).toBe('top');
    });

    it('connects a note in the row below through bottom and top, however far sideways', () => {
      // 60px below, 1000px to the right
      const other = makeNote(1200, 410);
      expect(resolveAutoAnchor(center, other)).toBe('bottom');
      expect(resolveAutoAnchor(other, center)).toBe('top');
    });

    it('uses the sides when the vertical gap leaves no room for the edge', () => {
      // 20px below, 1000px to the right
      const other = makeNote(1200, 370);
      expect(resolveAutoAnchor(center, other)).toBe('right');
      expect(resolveAutoAnchor(other, center)).toBe('left');
    });
  });

  describe('computeEdgePath', () => {
    it('returns an SVG path string starting with M and containing C', () => {
      const n1 = makeNote(0, 0);
      const n2 = makeNote(400, 0);
      const path = computeEdgePath(n1, n2, 'auto', 'auto');
      expect(path).toMatch(/^M\s/);
      expect(path).toContain('C');
    });

    it('works with explicit anchors', () => {
      const n1 = makeNote(0, 0);
      const n2 = makeNote(400, 0);
      const path = computeEdgePath(n1, n2, 'right', 'left');
      expect(path).toMatch(/^M\s/);
    });
  });

  describe('placeOverlayBox', () => {
    const size = { width: 100, height: 40 };
    const bounds = { left: 0, top: 0, right: 800, bottom: 600 };
    const box = (left: number, top: number, width: number, height: number) =>
      ({ left, top, right: left + width, bottom: top + height });

    it('centers the overlay on the preferred side when it fits', () => {
      const target = box(300, 200, 200, 150);
      expect(placeOverlayBox(size, target, bounds, 'below', 8)).toEqual({ x: 350, y: 358 });
      expect(placeOverlayBox(size, target, bounds, 'above', 8)).toEqual({ x: 350, y: 152 });
    });

    it('moves to the other side when the preferred one has no room', () => {
      expect(placeOverlayBox(size, box(300, 430, 200, 150), bounds, 'below', 8)).toEqual({ x: 350, y: 382 });
      expect(placeOverlayBox(size, box(300, 20, 200, 150), bounds, 'above', 8)).toEqual({ x: 350, y: 178 });
    });

    it('keeps the overlay inside the left and right edges', () => {
      expect(placeOverlayBox(size, box(-150, 200, 200, 150), bounds, 'below', 8).x).toBe(4);
      expect(placeOverlayBox(size, box(750, 200, 200, 150), bounds, 'below', 8).x).toBe(696);
    });

    it('pushes the overlay back inside when it fits on neither side', () => {
      // A note taller than the visible area
      expect(placeOverlayBox(size, box(300, -100, 200, 900), bounds, 'below', 8)).toEqual({ x: 350, y: 556 });
      expect(placeOverlayBox(size, box(300, -100, 200, 900), bounds, 'above', 8)).toEqual({ x: 350, y: 4 });
    });

    it('keeps the top left corner of an overlay larger than the visible area', () => {
      const large = { width: 900, height: 700 };
      expect(placeOverlayBox(large, box(300, 200, 200, 150), bounds, 'below', 8)).toEqual({ x: 4, y: 4 });
    });

    it('lets the overlay leave with a target that is out of the visible area', () => {
      expect(placeOverlayBox(size, box(1000, 200, 200, 150), bounds, 'below', 8)).toEqual({ x: 1050, y: 358 });
      expect(placeOverlayBox(size, box(300, -400, 200, 150), bounds, 'below', 8)).toEqual({ x: 350, y: -242 });
    });
  });
});
