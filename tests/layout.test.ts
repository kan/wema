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
      // Disconnected note should be below connected ones
      expect(r3.y).toBeGreaterThanOrEqual(r2.y);
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
    it('places a child below its parent and a disconnected note below both', () => {
      const result = computeAutoLayout(
        [note('p', 500, 500), note('c', 0, 0), note('x', 900, 900)],
        [{ from: 'p', to: 'c' }],
      );
      const pos = Object.fromEntries(result.map((r) => [r.id, r]));

      expect(result).toHaveLength(3);
      expect(pos.p.x).toBe(pos.c.x);
      expect(pos.c.y).toBe(pos.p.y + 150 + 60);
      expect(pos.x.y).toBeGreaterThan(pos.c.y);
    });

    it('lays out only the notes in options.noteIds', () => {
      const result = computeAutoLayout(
        [note('a', 100, 100), note('b', 200, 200), note('c', 300, 300)],
        [],
        { noteIds: ['a', 'b'] },
      );
      expect(result.map((r) => r.id).sort()).toEqual(['a', 'b']);
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
