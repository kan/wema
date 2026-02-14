import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { WemaBoard } from '../src/board';
import type { WemaBoardData } from '../src/types';

describe('Edges', () => {
  let container: HTMLElement;
  let board: WemaBoard;

  beforeEach(() => {
    container = document.createElement('div');
    container.style.width = '800px';
    container.style.height = '600px';
    document.body.appendChild(container);
    board = new WemaBoard({ container });
  });

  afterEach(() => {
    board.destroy();
    container.remove();
  });

  describe('Edge CRUD', () => {
    it('addEdge creates an edge between two notes', () => {
      const n1 = board.addNote({ x: 0, y: 0 });
      const n2 = board.addNote({ x: 300, y: 0 });
      const edge = board.addEdge(n1.id, n2.id);
      expect(edge.id).toBeTruthy();
      expect(edge.from).toBe(n1.id);
      expect(edge.to).toBe(n2.id);
      expect(edge.style).toBe('arrow');
      expect(edge.fromAnchor).toBe('auto');
      expect(edge.toAnchor).toBe('auto');
    });

    it('addEdge accepts custom params', () => {
      const n1 = board.addNote({ x: 0, y: 0 });
      const n2 = board.addNote({ x: 300, y: 0 });
      const edge = board.addEdge(n1.id, n2.id, {
        fromAnchor: 'right',
        toAnchor: 'left',
        style: 'dashed',
        label: 'test',
      });
      expect(edge.fromAnchor).toBe('right');
      expect(edge.toAnchor).toBe('left');
      expect(edge.style).toBe('dashed');
      expect(edge.label).toBe('test');
    });

    it('getEdges returns all edges', () => {
      const n1 = board.addNote({ x: 0, y: 0 });
      const n2 = board.addNote({ x: 300, y: 0 });
      const n3 = board.addNote({ x: 0, y: 300 });
      board.addEdge(n1.id, n2.id);
      board.addEdge(n1.id, n3.id);
      expect(board.getEdges()).toHaveLength(2);
    });

    it('getEdgesOf returns edges connected to a note', () => {
      const n1 = board.addNote({ x: 0, y: 0 });
      const n2 = board.addNote({ x: 300, y: 0 });
      const n3 = board.addNote({ x: 0, y: 300 });
      board.addEdge(n1.id, n2.id);
      board.addEdge(n2.id, n3.id);
      expect(board.getEdgesOf(n1.id)).toHaveLength(1);
      expect(board.getEdgesOf(n2.id)).toHaveLength(2);
      expect(board.getEdgesOf(n3.id)).toHaveLength(1);
    });

    it('deleteEdge removes an edge', () => {
      const n1 = board.addNote({ x: 0, y: 0 });
      const n2 = board.addNote({ x: 300, y: 0 });
      const edge = board.addEdge(n1.id, n2.id);
      board.deleteEdge(edge.id);
      expect(board.getEdges()).toHaveLength(0);
    });

    it('deleting a note removes its connected edges', () => {
      const n1 = board.addNote({ x: 0, y: 0 });
      const n2 = board.addNote({ x: 300, y: 0 });
      const n3 = board.addNote({ x: 0, y: 300 });
      board.addEdge(n1.id, n2.id);
      board.addEdge(n2.id, n3.id);
      board.deleteNote(n2.id);
      expect(board.getEdges()).toHaveLength(0);
    });
  });

  describe('Edge events', () => {
    it('emits edge:create on addEdge', () => {
      const handler = vi.fn();
      board.on('edge:create', handler);
      const n1 = board.addNote({ x: 0, y: 0 });
      const n2 = board.addNote({ x: 300, y: 0 });
      board.addEdge(n1.id, n2.id);
      expect(handler).toHaveBeenCalledWith({
        edge: expect.objectContaining({ from: n1.id, to: n2.id }),
      });
    });

    it('emits edge:delete on deleteEdge', () => {
      const handler = vi.fn();
      const n1 = board.addNote({ x: 0, y: 0 });
      const n2 = board.addNote({ x: 300, y: 0 });
      const edge = board.addEdge(n1.id, n2.id);
      board.on('edge:delete', handler);
      board.deleteEdge(edge.id);
      expect(handler).toHaveBeenCalledWith({
        edge: expect.objectContaining({ id: edge.id }),
      });
    });

    it('edges trigger change event', async () => {
      const handler = vi.fn();
      board.on('change', handler);
      const n1 = board.addNote({ x: 0, y: 0 });
      const n2 = board.addNote({ x: 300, y: 0 });
      // Wait for microtask from note creation
      await Promise.resolve();
      handler.mockClear();

      board.addEdge(n1.id, n2.id);
      await Promise.resolve();
      expect(handler).toHaveBeenCalled();
    });
  });

  describe('updateEdge', () => {
    it('updateEdge changes edge properties', () => {
      const n1 = board.addNote({ x: 0, y: 0 });
      const n2 = board.addNote({ x: 300, y: 0 });
      const edge = board.addEdge(n1.id, n2.id);
      board.updateEdge(edge.id, { lineStyle: 'dashed', arrowHead: 'none', strokeWidth: 4 });
      const updated = board.getEdges().find(e => e.id === edge.id);
      expect(updated?.lineStyle).toBe('dashed');
      expect(updated?.arrowHead).toBe('none');
      expect(updated?.strokeWidth).toBe(4);
    });

    it('emits edge:update on updateEdge', () => {
      const handler = vi.fn();
      const n1 = board.addNote({ x: 0, y: 0 });
      const n2 = board.addNote({ x: 300, y: 0 });
      const edge = board.addEdge(n1.id, n2.id);
      board.on('edge:update', handler);
      board.updateEdge(edge.id, { strokeWidth: 4 });
      expect(handler).toHaveBeenCalledWith({
        edge: expect.objectContaining({ id: edge.id, strokeWidth: 4 }),
        prev: expect.objectContaining({ id: edge.id }),
      });
    });

    it('edge:update triggers change event', async () => {
      const handler = vi.fn();
      const n1 = board.addNote({ x: 0, y: 0 });
      const n2 = board.addNote({ x: 300, y: 0 });
      const edge = board.addEdge(n1.id, n2.id);
      await Promise.resolve();
      board.on('change', handler);
      board.updateEdge(edge.id, { lineStyle: 'dotted' });
      await Promise.resolve();
      expect(handler).toHaveBeenCalled();
    });

    it('new style fields default correctly from legacy style', () => {
      const n1 = board.addNote({ x: 0, y: 0 });
      const n2 = board.addNote({ x: 300, y: 0 });
      const arrowEdge = board.addEdge(n1.id, n2.id, { style: 'arrow' });
      expect(arrowEdge.style).toBe('arrow');
      // Defaults when not explicitly set
      expect(arrowEdge.lineStyle).toBeUndefined();
      expect(arrowEdge.arrowHead).toBeUndefined();
      expect(arrowEdge.strokeWidth).toBeUndefined();
    });

    it('arrowHead supports start, end, both, none', () => {
      const n1 = board.addNote({ x: 0, y: 0 });
      const n2 = board.addNote({ x: 300, y: 0 });
      const edge = board.addEdge(n1.id, n2.id);

      for (const ah of ['none', 'start', 'end', 'both'] as const) {
        board.updateEdge(edge.id, { arrowHead: ah });
        const updated = board.getEdges().find(e => e.id === edge.id);
        expect(updated?.arrowHead).toBe(ah);
      }
    });
  });

  describe('Export/Import with edges', () => {
    it('exportData includes edges', () => {
      const n1 = board.addNote({ x: 0, y: 0 });
      const n2 = board.addNote({ x: 300, y: 0 });
      board.addEdge(n1.id, n2.id, { style: 'dashed' });
      const data = board.exportData();
      expect(data.edges).toHaveLength(1);
      expect(data.edges[0].style).toBe('dashed');
    });

    it('importData restores edges', () => {
      const data: WemaBoardData = {
        version: 1,
        notes: [
          { id: 'n1', x: 0, y: 0, width: 200, height: 150, text: 'A', color: '#FFF', zIndex: 1 },
          { id: 'n2', x: 300, y: 0, width: 200, height: 150, text: 'B', color: '#FFF', zIndex: 2 },
        ],
        edges: [
          { id: 'e1', from: 'n1', to: 'n2', fromAnchor: 'auto', toAnchor: 'auto', style: 'arrow' },
        ],
      };
      board.importData(data);
      expect(board.getEdges()).toHaveLength(1);
      expect(board.getEdges()[0].from).toBe('n1');
    });
  });
});
