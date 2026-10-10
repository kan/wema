import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { WemaBoard } from '../src/board';
import { computeAlignment, computeDistribution, computeAutoLayout } from '../src/layout';
import type { LayoutNote } from '../src/layout';
import type { WemaNote } from '../src/types';

describe('Layout', () => {
  let container: HTMLElement;
  let board: WemaBoard;

  beforeEach(() => {
    container = document.createElement('div');
    container.style.width = '1200px';
    container.style.height = '800px';
    document.body.appendChild(container);
    board = new WemaBoard({ container });
  });

  afterEach(() => {
    board.destroy();
    container.remove();
  });

  function addNoteAt(x: number, y: number, w = 200, h = 150): WemaNote {
    return board.addNote({ x, y, width: w, height: h });
  }

  describe('alignNotes', () => {
    it('does nothing with fewer than 2 notes', () => {
      const n1 = addNoteAt(100, 100);
      board.alignNotes([n1.id], 'left');
      expect(board.getNote(n1.id)!.x).toBe(100);
    });

    it('aligns left', () => {
      const n1 = addNoteAt(50, 100);
      const n2 = addNoteAt(200, 200);
      const n3 = addNoteAt(150, 300);
      board.alignNotes([n1.id, n2.id, n3.id], 'left');
      expect(board.getNote(n1.id)!.x).toBe(50);
      expect(board.getNote(n2.id)!.x).toBe(50);
      expect(board.getNote(n3.id)!.x).toBe(50);
    });

    it('aligns center', () => {
      const n1 = addNoteAt(0, 0, 100, 100);
      const n2 = addNoteAt(200, 0, 100, 100);
      // n1 center = 50, n2 center = 250, avg = 150
      board.alignNotes([n1.id, n2.id], 'center');
      expect(board.getNote(n1.id)!.x).toBe(100); // 150 - 50
      expect(board.getNote(n2.id)!.x).toBe(100); // 150 - 50
    });

    it('aligns right', () => {
      const n1 = addNoteAt(0, 0, 100, 100);
      const n2 = addNoteAt(200, 0, 150, 100);
      // maxRight = 200 + 150 = 350
      board.alignNotes([n1.id, n2.id], 'right');
      expect(board.getNote(n1.id)!.x).toBe(250); // 350 - 100
      expect(board.getNote(n2.id)!.x).toBe(200); // 350 - 150
    });

    it('aligns top', () => {
      const n1 = addNoteAt(0, 50);
      const n2 = addNoteAt(0, 200);
      board.alignNotes([n1.id, n2.id], 'top');
      expect(board.getNote(n1.id)!.y).toBe(50);
      expect(board.getNote(n2.id)!.y).toBe(50);
    });

    it('aligns middle', () => {
      const n1 = addNoteAt(0, 0, 100, 100);
      const n2 = addNoteAt(0, 200, 100, 200);
      // n1 center = 50, n2 center = 300, avg = 175
      board.alignNotes([n1.id, n2.id], 'middle');
      expect(board.getNote(n1.id)!.y).toBe(125); // 175 - 50
      expect(board.getNote(n2.id)!.y).toBe(75);  // 175 - 100
    });

    it('aligns bottom', () => {
      const n1 = addNoteAt(0, 0, 100, 80);
      const n2 = addNoteAt(0, 100, 100, 120);
      // maxBottom = 100 + 120 = 220
      board.alignNotes([n1.id, n2.id], 'bottom');
      expect(board.getNote(n1.id)!.y).toBe(140); // 220 - 80
      expect(board.getNote(n2.id)!.y).toBe(100); // 220 - 120
    });
  });

  describe('distributeNotes', () => {
    it('does nothing with fewer than 3 notes', () => {
      const n1 = addNoteAt(0, 0, 100, 100);
      const n2 = addNoteAt(400, 0, 100, 100);
      board.distributeNotes([n1.id, n2.id], 'horizontal');
      expect(board.getNote(n1.id)!.x).toBe(0);
      expect(board.getNote(n2.id)!.x).toBe(400);
    });

    it('distributes horizontally', () => {
      // 3 notes of width 100, first at x=0, last at x=400
      const n1 = addNoteAt(0, 0, 100, 100);
      const n2 = addNoteAt(100, 0, 100, 100);
      const n3 = addNoteAt(400, 0, 100, 100);
      board.distributeNotes([n1.id, n2.id, n3.id], 'horizontal');
      // totalSpan = 400 + 100 - 0 = 500
      // totalWidth = 300
      // gap = (500 - 300) / 2 = 100
      // n1 stays at 0 (first), n2 should be at 0 + 100 + 100 = 200
      expect(board.getNote(n1.id)!.x).toBe(0);
      expect(board.getNote(n2.id)!.x).toBe(200);
      expect(board.getNote(n3.id)!.x).toBe(400);
    });

    it('distributes vertically', () => {
      const n1 = addNoteAt(0, 0, 100, 50);
      const n2 = addNoteAt(0, 50, 100, 50);
      const n3 = addNoteAt(0, 400, 100, 50);
      board.distributeNotes([n1.id, n2.id, n3.id], 'vertical');
      // totalSpan = 400 + 50 - 0 = 450
      // totalHeight = 150
      // gap = (450 - 150) / 2 = 150
      // n1 stays at 0, n2 at 0 + 50 + 150 = 200
      expect(board.getNote(n1.id)!.y).toBe(0);
      expect(board.getNote(n2.id)!.y).toBe(200);
      expect(board.getNote(n3.id)!.y).toBe(400);
    });
  });

  describe('autoLayout', () => {
    it('lays out a linear graph', () => {
      const n1 = addNoteAt(500, 500, 200, 150);
      const n2 = addNoteAt(500, 500, 200, 150);
      const n3 = addNoteAt(500, 500, 200, 150);
      board.addEdge(n1.id, n2.id);
      board.addEdge(n2.id, n3.id);

      board.autoLayout();

      // n1 should be at level 0, n2 at level 1, n3 at level 2
      const r1 = board.getNote(n1.id)!;
      const r2 = board.getNote(n2.id)!;
      const r3 = board.getNote(n3.id)!;

      // Each level should have increasing y
      expect(r1.y).toBeLessThan(r2.y);
      expect(r2.y).toBeLessThan(r3.y);
    });

    it('places disconnected notes in a grid', () => {
      const n1 = addNoteAt(0, 0, 200, 150);
      const n2 = addNoteAt(0, 0, 200, 150);
      const n3 = addNoteAt(0, 0, 200, 150);
      // No edges - all disconnected

      board.autoLayout();

      const r1 = board.getNote(n1.id)!;
      const r2 = board.getNote(n2.id)!;
      const r3 = board.getNote(n3.id)!;

      // All should have been repositioned (not all at 0,0)
      const positions = [r1, r2, r3].map((n) => `${n.x},${n.y}`);
      // At least some should be different from each other
      expect(new Set(positions).size).toBeGreaterThan(1);
    });

    it('handles mixed connected and disconnected notes', () => {
      const n1 = addNoteAt(0, 0, 200, 150);
      const n2 = addNoteAt(0, 0, 200, 150);
      const n3 = addNoteAt(0, 0, 200, 150); // disconnected
      board.addEdge(n1.id, n2.id);

      board.autoLayout();

      const r1 = board.getNote(n1.id)!;
      const r2 = board.getNote(n2.id)!;
      const r3 = board.getNote(n3.id)!;

      // Connected notes should be in different rows
      expect(r1.y).toBeLessThan(r2.y);
      // Disconnected note should be beside the connected ones, clear of them
      expect(r3.x).toBeGreaterThanOrEqual(r1.x + 200);
      expect(r3.x).toBeGreaterThanOrEqual(r2.x + 200);
    });

    it('wraps to the shape of the board', () => {
      const boardEl = container.querySelector('.wema-board') as HTMLElement;
      const height = (): number => {
        board.autoLayout();
        const notes = board.getNotes();
        return Math.max(...notes.map((n) => n.y + n.height)) - Math.min(...notes.map((n) => n.y));
      };
      for (let i = 0; i < 12; i++) addNoteAt(i * 10, 0);

      Object.defineProperty(boardEl, 'clientWidth', { value: 1600, configurable: true });
      Object.defineProperty(boardEl, 'clientHeight', { value: 400, configurable: true });
      const wide = height();
      Object.defineProperty(boardEl, 'clientWidth', { value: 400, configurable: true });
      Object.defineProperty(boardEl, 'clientHeight', { value: 1600, configurable: true });
      const tall = height();

      expect(wide).toBeLessThan(tall);
    });

    it('works with specific noteIds subset', () => {
      const n1 = addNoteAt(100, 100, 200, 150);
      const n2 = addNoteAt(200, 200, 200, 150);
      const n3 = addNoteAt(300, 300, 200, 150);

      board.autoLayout([n1.id, n2.id]);

      // n1 and n2 should have been repositioned
      const r1 = board.getNote(n1.id)!;
      const r2 = board.getNote(n2.id)!;
      const r3 = board.getNote(n3.id)!;

      // n3 should NOT have been moved
      expect(r3.x).toBe(300);
      expect(r3.y).toBe(300);
    });
  });
});

describe('Layout functions (no board)', () => {
  const note = (id: string, x: number, y: number, width = 200, height = 150): LayoutNote =>
    ({ id, x, y, width, height });

  describe('computeAlignment', () => {
    it('returns a position for every note', () => {
      const result = computeAlignment([note('a', 50, 100), note('b', 200, 200)], 'left');
      expect(result).toEqual([
        { id: 'a', x: 50, y: 100 },
        { id: 'b', x: 50, y: 200 },
      ]);
    });

    it('aligns bottom edges of notes with different heights', () => {
      const result = computeAlignment([note('a', 0, 0, 100, 100), note('b', 200, 50, 100, 200)], 'bottom');
      expect(result).toEqual([
        { id: 'a', x: 0, y: 150 },
        { id: 'b', x: 200, y: 50 },
      ]);
    });

    it('returns nothing for fewer than 2 notes', () => {
      expect(computeAlignment([note('a', 0, 0)], 'left')).toEqual([]);
    });
  });

  describe('computeDistribution', () => {
    it('returns only the notes between the first and the last', () => {
      const result = computeDistribution(
        [note('c', 600, 0, 100), note('a', 0, 0, 100), note('b', 50, 30, 100)],
        'horizontal',
      );
      expect(result).toEqual([{ id: 'b', x: 300, y: 30 }]);
    });

    it('does not reorder the input array', () => {
      const notes = [note('c', 600, 0), note('a', 0, 0), note('b', 50, 0)];
      computeDistribution(notes, 'horizontal');
      expect(notes.map((n) => n.id)).toEqual(['c', 'a', 'b']);
    });

    it('returns nothing for fewer than 3 notes', () => {
      expect(computeDistribution([note('a', 0, 0), note('b', 300, 0)], 'vertical')).toEqual([]);
    });
  });

  describe('computeAutoLayout', () => {
    it('places a child below its parent and a disconnected note beside both', () => {
      const result = computeAutoLayout(
        [note('p', 500, 500), note('c', 0, 0), note('x', 900, 900)],
        [{ from: 'p', to: 'c' }],
      );
      const pos = Object.fromEntries(result.map((r) => [r.id, r]));

      expect(result).toHaveLength(3);
      expect(pos.p.x).toBe(pos.c.x);
      expect(pos.c.y).toBe(pos.p.y + 150 + 60);
      expect(pos.x.x).toBe(pos.p.x + 200 + 80);
      expect(pos.x.y).toBe(pos.p.y);
    });

    it('places a cycle that no root leads to', () => {
      // a -> b has a root (a); c <-> d is a cycle on its own
      const result = computeAutoLayout(
        [note('a', 0, 0), note('b', 0, 0), note('c', 0, 0), note('d', 0, 0)],
        [{ from: 'a', to: 'b' }, { from: 'c', to: 'd' }, { from: 'd', to: 'c' }],
      );
      const pos = Object.fromEntries(result.map((r) => [r.id, r]));

      expect(result.map((r) => r.id).sort()).toEqual(['a', 'b', 'c', 'd']);
      // The cycle is laid out as its own tree, beside the first one
      expect(pos.c.y).toBe(pos.a.y);
      expect(pos.d.y).toBe(pos.b.y);
      expect(pos.c.x).toBeGreaterThan(pos.a.x);
      // No two notes overlap
      const places = result.map((r) => `${r.x},${r.y}`);
      expect(new Set(places).size).toBe(4);
    });

    it('places every note of a graph made only of cycles', () => {
      const result = computeAutoLayout(
        [note('a', 0, 0), note('b', 0, 0), note('c', 0, 0), note('d', 0, 0)],
        [{ from: 'a', to: 'b' }, { from: 'b', to: 'a' }, { from: 'c', to: 'd' }, { from: 'd', to: 'c' }],
      );
      expect(result.map((r) => r.id).sort()).toEqual(['a', 'b', 'c', 'd']);
      expect(new Set(result.map((r) => `${r.x},${r.y}`)).size).toBe(4);
    });

    it('lays out only the notes in options.noteIds', () => {
      const result = computeAutoLayout(
        [note('a', 100, 100), note('b', 200, 200), note('c', 300, 300)],
        [],
        { noteIds: ['a', 'b'] },
      );
      expect(result.map((r) => r.id).sort()).toEqual(['a', 'b']);
    });

    const edge = (from: string, to: string) => ({ from, to });
    const layout = (notes: LayoutNote[], edges: { from: string; to: string }[]) =>
      Object.fromEntries(computeAutoLayout(notes, edges).map((r) => [r.id, r]));

    it('keeps the top-left corner of the area the notes occupy', () => {
      const result = computeAutoLayout(
        [note('a', 2000, 1500), note('b', 2300, 1500), note('c', 2600, 1700), note('z', 40, 40)],
        [edge('a', 'b'), edge('a', 'c')],
        { noteIds: ['a', 'b', 'c'] },
      );
      expect(Math.min(...result.map((r) => r.x))).toBe(2000);
      expect(Math.min(...result.map((r) => r.y))).toBe(1500);
    });

    it('keeps the top-left corner whatever the edges are', () => {
      // Deterministic pseudo-random graphs: edges that skip levels reserve
      // room beside the notes, which must not shift the result
      let seed = 1;
      const random = (n: number): number => {
        seed = (seed * 1103515245 + 12345) % 2147483648;
        return seed % n;
      };
      for (let round = 0; round < 300; round++) {
        const count = 3 + random(10);
        const notes = Array.from({ length: count }, (_, i) => note(`n${i}`, 500 + random(900), 300 + random(600)));
        const edges = Array.from({ length: count + random(count) }, () =>
          edge(`n${random(count)}`, `n${random(count)}`));
        const result = computeAutoLayout(notes, edges);
        expect(Math.min(...result.map((r) => r.x)), `round ${round}`).toBe(Math.min(...notes.map((n) => n.x)));
        expect(Math.min(...result.map((r) => r.y)), `round ${round}`).toBe(Math.min(...notes.map((n) => n.y)));
      }
    });

    it('orders siblings by their current position, not by edge order', () => {
      const pos = layout(
        [note('a', 300, 0), note('b', 600, 300), note('c', 0, 300)],
        [edge('a', 'b'), edge('a', 'c')],
      );
      expect(pos.c.x).toBeLessThan(pos.b.x);
      // The parent is above the middle of its children
      expect(pos.a.x).toBe((pos.b.x + pos.c.x) / 2);
    });

    it('points every edge downward and keeps a shortcut edge clear of the notes it passes', () => {
      const pos = layout(
        [note('a', 0, 0), note('b', 0, 0), note('c', 0, 0)],
        [edge('a', 'b'), edge('a', 'c'), edge('b', 'c')],
      );
      expect(pos.a.y).toBeLessThan(pos.b.y);
      expect(pos.b.y).toBeLessThan(pos.c.y);
      // a -> c is a straight vertical line, to the right of b
      expect(pos.c.x).toBe(pos.a.x);
      expect(pos.a.x + 100).toBeGreaterThan(pos.b.x + 200);
    });

    it('centers a note below its parents', () => {
      const pos = layout(
        [note('a', 0, 0), note('b', 500, 0), note('c', 0, 0), note('d', 0, 0)],
        [edge('a', 'c'), edge('b', 'c'), edge('c', 'd')],
      );
      expect(pos.a.y).toBe(pos.b.y);
      expect(pos.c.x).toBe((pos.a.x + pos.b.x) / 2);
      expect(pos.d.x).toBe(pos.c.x);
    });

    it('puts a root right above its child when another branch is longer', () => {
      const pos = layout(
        [note('r', 0, 0), note('x', 0, 0), note('c', 0, 0), note('b', 500, 0)],
        [edge('r', 'x'), edge('x', 'c'), edge('b', 'c')],
      );
      expect(pos.b.y).toBe(pos.x.y);
    });

    it('wraps many childless children into rows', () => {
      const leaves = Array.from({ length: 20 }, (_, i) => note(`c${i}`, i * 10, 0));
      const result = computeAutoLayout(
        [note('r', 0, 0), ...leaves],
        leaves.map((leaf) => edge('r', leaf.id)),
      );
      const leafPlaces = result.filter((r) => r.id !== 'r');
      expect(new Set(leafPlaces.map((r) => r.y)).size).toBe(4);
      expect(new Set(leafPlaces.map((r) => r.x)).size).toBe(5);
      expect(new Set(leafPlaces.map((r) => `${r.x},${r.y}`)).size).toBe(20);
    });

    it('leaves a taller gap below a note whose edges fan out wide', () => {
      const gapBelowParent = (count: number): number => {
        const leaves = Array.from({ length: count }, (_, i) => note(`c${i}`, i * 10, 0));
        const pos = layout([note('r', 0, 0), ...leaves], leaves.map((leaf) => edge('r', leaf.id)));
        return pos.c0.y - (pos.r.y + 150);
      };
      expect(gapBelowParent(1)).toBe(60);
      expect(gapBelowParent(3)).toBeGreaterThan(60);
      expect(gapBelowParent(5)).toBeGreaterThan(gapBelowParent(3));
      // The gap stops growing once the curve of an edge has all the room it uses
      expect(gapBelowParent(12)).toBe(150);
    });

    it('keeps a moderate number of childless children in one row', () => {
      const leaves = Array.from({ length: 12 }, (_, i) => note(`c${i}`, i * 10, 0));
      const result = computeAutoLayout(
        [note('r', 0, 0), ...leaves],
        leaves.map((leaf) => edge('r', leaf.id)),
      );
      expect(new Set(result.filter((r) => r.id !== 'r').map((r) => r.y)).size).toBe(1);
    });

    it('wraps groups that share no edge into rows', () => {
      const notes = Array.from({ length: 12 }, (_, i) => note(`t${i}`, i * 10, 0));
      const edges = Array.from({ length: 6 }, (_, i) => edge(`t${i * 2}`, `t${i * 2 + 1}`));
      const result = computeAutoLayout(notes, edges);
      const rootRows = new Set(result.filter((r) => Number(r.id.slice(1)) % 2 === 0).map((r) => r.y));
      expect(rootRows.size).toBeGreaterThan(1);
      expect(Math.max(...result.map((r) => r.x + 200))).toBeLessThan(1600);
    });

    it('never overlaps notes of different sizes', () => {
      const notes = [
        note('a', 0, 0, 300, 100), note('b', 0, 0, 120, 240), note('c', 0, 0), note('d', 0, 0, 400, 80),
        note('e', 0, 0), note('f', 0, 0, 150, 150), note('g', 0, 0), note('h', 0, 0, 260, 200),
      ];
      const edges = [
        edge('a', 'b'), edge('a', 'c'), edge('b', 'd'), edge('c', 'd'), edge('a', 'd'),
        edge('d', 'a'), edge('e', 'f'), edge('f', 'e'), edge('e', 'e'), edge('a', 'b'),
      ];
      const pos = layout(notes, edges);
      expect(Object.keys(pos)).toHaveLength(notes.length);
      const boxes = notes.map((n) => ({ ...n, ...pos[n.id] }));
      for (const p of boxes) {
        for (const q of boxes) {
          if (p.id >= q.id) continue;
          const apart =
            p.x + p.width <= q.x || q.x + q.width <= p.x || p.y + p.height <= q.y || q.y + q.height <= p.y;
          expect(apart, `${p.id} and ${q.id}`).toBe(true);
        }
      }
    });

    const boundsOf = (notes: LayoutNote[], pos: Record<string, { x: number; y: number }>) => {
      const boxes = notes.map((n) => ({ ...n, ...pos[n.id] }));
      return {
        width: Math.max(...boxes.map((b) => b.x + b.width)) - Math.min(...boxes.map((b) => b.x)),
        height: Math.max(...boxes.map((b) => b.y + b.height)) - Math.min(...boxes.map((b) => b.y)),
      };
    };
    const expectNoOverlap = (notes: LayoutNote[], pos: Record<string, { x: number; y: number }>): void => {
      const boxes = notes.map((n) => ({ ...n, ...pos[n.id] }));
      for (const p of boxes) {
        for (const q of boxes) {
          if (p.id >= q.id) continue;
          const apart =
            p.x + p.width <= q.x || q.x + q.width <= p.x || p.y + p.height <= q.y || q.y + q.height <= p.y;
          expect(apart, `${p.id} and ${q.id}`).toBe(true);
        }
      }
    };

    it('does not put notes without edges in one column because one of them is wide', () => {
      const notes = [
        note('wide', 0, 0, 900, 150),
        ...Array.from({ length: 8 }, (_, i) => note(`s${i}`, i + 1, 0)),
      ];
      const pos = layout(notes, []);

      expect(new Set(notes.map((n) => pos[n.id].x)).size).toBeGreaterThan(1);
      expect(boundsOf(notes, pos).height).toBeLessThan(1000);
      expectNoOverlap(notes, pos);
    });

    it('puts notes without edges beside a tall chain instead of below it', () => {
      const notes = [
        note('a', 0, 0, 640, 500), note('b', 0, 600), note('c', 0, 800, 320, 500),
        note('x', 0, 1400, 410, 260), note('y', 0, 1700, 640, 500), note('z', 0, 2300, 640, 500),
      ];
      const pos = layout(notes, [edge('a', 'b'), edge('b', 'c')]);

      // The chain is 500 + 60 + 150 + 60 + 500 tall; nothing makes the result taller
      expect(boundsOf(notes, pos).height).toBe(1270);
      expectNoOverlap(notes, pos);
    });

    it('wraps to options.aspectRatio', () => {
      const notes = Array.from({ length: 12 }, (_, i) => note(`n${i}`, i * 10, 0));
      const shape = (aspectRatio?: number) => {
        const result = computeAutoLayout(notes, [], { aspectRatio });
        return boundsOf(notes, Object.fromEntries(result.map((r) => [r.id, r])));
      };

      const wide = shape(4);
      const tall = shape(0.25);
      expect(wide.width).toBeGreaterThan(wide.height);
      expect(tall.height).toBeGreaterThan(tall.width);
      // A value that is not a ratio falls back to the default
      for (const bad of [0, -1, NaN, Infinity]) {
        expect(shape(bad)).toEqual(shape());
      }
    });

    it('can put notes of fractional widths in one row', () => {
      const notes = Array.from({ length: 7 }, (_, i) => note(`n${i}`, i * 10, 0, 100.1 + i * 0.7, 150));
      const result = computeAutoLayout(notes, [], { aspectRatio: 1000 });
      expect(new Set(result.map((r) => r.y)).size).toBe(1);
    });

    it('never overlaps notes of random sizes, with and without edges', () => {
      // Deterministic pseudo-random numbers (mulberry32)
      let seed = 12345;
      const random = (): number => {
        seed = (seed + 0x6d2b79f5) | 0;
        let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
      for (let round = 0; round < 40; round++) {
        const count = 2 + Math.floor(random() * 30);
        const notes = Array.from({ length: count }, (_, i) =>
          note(`n${i}`, random() * 2000, random() * 2000, 80 + random() * 700, 60 + random() * 500));
        const edges = Array.from({ length: Math.floor(random() * count) }, () =>
          edge(`n${Math.floor(random() * count)}`, `n${Math.floor(random() * count)}`));
        const aspectRatio = 0.3 + random() * 3;
        const result = computeAutoLayout(notes, edges, { aspectRatio });

        expect(result).toHaveLength(count);
        expectNoOverlap(notes, Object.fromEntries(result.map((r) => [r.id, r])));
      }
    });

    it('matches what WemaBoard.autoLayout applies', () => {
      const container = document.createElement('div');
      document.body.appendChild(container);
      const board = new WemaBoard({ container });
      const n1 = board.addNote({ x: 400, y: 400 });
      const n2 = board.addNote({ x: 0, y: 0 });
      const n3 = board.addNote({ x: 50, y: 700 });
      board.addEdge(n1.id, n2.id);
      board.addEdge(n1.id, n3.id);

      const expected = computeAutoLayout(board.getNotes(), board.getEdges());
      board.autoLayout();

      for (const { id, x, y } of expected) {
        expect(board.getNote(id)).toEqual(expect.objectContaining({ x, y }));
      }
      board.destroy();
      container.remove();
    });
  });
});
