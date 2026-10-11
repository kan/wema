import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { WemaBoard } from '../src/board';
import type { WemaBoardOptions, WemaViewport } from '../src/types';

describe('Page scroll mode', () => {
  let container: HTMLElement;
  let board: WemaBoard;
  let boardEl: HTMLElement;

  function create(options: Partial<WemaBoardOptions> = {}): void {
    board = new WemaBoard({ container, ...options });
    boardEl = container.querySelector('.wema-board') as HTMLElement;
    // jsdom does not lay out: give the board a size
    Object.defineProperty(boardEl, 'clientWidth', { value: 800, configurable: true });
    Object.defineProperty(boardEl, 'clientHeight', { value: 600, configurable: true });
  }

  beforeEach(() => {
    // jsdom has no pointer capture
    HTMLElement.prototype.setPointerCapture ??= () => {};
    HTMLElement.prototype.releasePointerCapture ??= () => {};
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    board.destroy();
    container.remove();
    vi.restoreAllMocks();
  });

  function pointer(type: string, target: Element, init: PointerEventInit): PointerEvent {
    const event = new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: 1, ...init });
    target.dispatchEvent(event);
    return event;
  }

  /** Press on `target`, move by (dx, dy), release */
  function drag(target: Element, dx: number, dy: number, init: PointerEventInit = {}): PointerEvent {
    const from = { clientX: 300, clientY: 300 };
    const down = pointer('pointerdown', target, { button: 0, ...from, ...init });
    pointer('pointermove', boardEl, { ...from, clientX: from.clientX + dx, clientY: from.clientY + dy, ...init });
    pointer('pointerup', boardEl, { button: 0, clientX: from.clientX + dx, clientY: from.clientY + dy, ...init });
    return down;
  }

  const handleOf = (id: string) =>
    container.querySelector(`[data-note-id="${id}"] .wema-move-handle`) as HTMLElement;

  describe('the size of the board', () => {
    it('is as tall as the shown notes, plus a margin', () => {
      create({ pageScroll: true });
      expect(board.isPageScroll()).toBe(true);
      expect(boardEl.classList.contains('wema-page-scroll')).toBe(true);
      expect(boardEl.style.overflow).toBe('visible');
      expect(boardEl.style.minHeight).toBe('100%');
      // No notes: only as tall as its container
      expect(boardEl.style.height).toBe('0px');

      const a = board.addNote({ x: 0, y: 100, width: 200, height: 150 });
      expect(boardEl.style.height).toBe('274px');

      const b = board.addNote({ x: 0, y: 900, width: 200, height: 100 });
      expect(boardEl.style.height).toBe('1024px');

      board.updateNote(b.id, { y: 400 });
      expect(boardEl.style.height).toBe('524px');

      board.setNoteFilter([a.id]);
      expect(boardEl.style.height).toBe('274px');
      board.setNoteFilter(null);

      board.deleteNote(b.id);
      expect(boardEl.style.height).toBe('274px');
    });

    it('follows the data that is imported and the notes an edge hides', () => {
      create({ pageScroll: true });
      const a = board.addNote({ x: 0, y: 0, width: 200, height: 100 });
      const b = board.addNote({ x: 0, y: 500, width: 200, height: 100 });
      const edge = board.addEdge(a.id, b.id);

      board.updateEdge(edge.id, { collapsed: true });
      expect(boardEl.style.height).toBe('124px');

      const data = board.exportData();
      data.edges[0].collapsed = false;
      data.notes[1].y = 1000;
      board.importData(data);
      expect(boardEl.style.height).toBe('1124px');
    });

    it('is given back when the mode is left', () => {
      create();
      board.addNote({ x: 0, y: 100, width: 200, height: 150 });
      expect(boardEl.style.height).toBe('100%');

      board.setPageScroll(true);
      expect(boardEl.style.height).toBe('274px');

      board.setPageScroll(false);
      expect(board.isPageScroll()).toBe(false);
      expect(boardEl.classList.contains('wema-page-scroll')).toBe(false);
      expect(boardEl.style.height).toBe('100%');
      expect(boardEl.style.overflow).toBe('hidden');
      expect(boardEl.style.minHeight).toBe('');

      // Not kept up to date outside the mode
      board.addNote({ x: 0, y: 2000 });
      expect(boardEl.style.height).toBe('100%');
    });
  });

  describe('the viewport', () => {
    it('goes back to the origin at actual size when the mode is entered', () => {
      create();
      board.setViewport({ x: -120, y: 80, zoom: 1.5 });
      const changes: WemaViewport[] = [];
      board.on('viewport:change', (v) => changes.push(v));

      board.setPageScroll(true);

      expect(board.getViewport()).toEqual({ x: 0, y: 0, zoom: 1 });
      expect(changes).toEqual([{ x: 0, y: 0, zoom: 1 }]);
    });

    it('is fixed while the mode is on, and free again after it', () => {
      create({ pageScroll: true });
      board.addNote({ x: 2000, y: 2000 });

      board.setViewport({ x: 50 });
      board.zoomTo(2);
      board.centerContent();
      board.fitToContent();
      expect(board.getViewport()).toEqual({ x: 0, y: 0, zoom: 1 });

      board.setPageScroll(false);
      board.setViewport({ x: 50 });
      expect(board.getViewport()).toEqual({ x: 50, y: 0, zoom: 1 });
    });

    it('leaves the wheel to the page', () => {
      create({ pageScroll: true });
      board.addNote({ x: 0, y: 0 });

      for (const init of [{ deltaY: 400 }, { deltaY: 100, ctrlKey: true }]) {
        const event = new WheelEvent('wheel', { bubbles: true, cancelable: true, ...init });
        boardEl.dispatchEvent(event);
        expect(event.defaultPrevented).toBe(false);
      }
      expect(board.getViewport()).toEqual({ x: 0, y: 0, zoom: 1 });
    });

    it('does not pan on a drag, the middle button or a double click', () => {
      create({ pageScroll: true });
      const note = board.addNote({ x: 350, y: 350, width: 100, height: 100 });
      board.setViewOnly(true);

      const down = drag(boardEl, 200, 200);
      // Nothing is taken from the browser, and nothing is selected by the drag
      expect(down.defaultPrevented).toBe(false);
      expect(board.getSelection()).toEqual([]);

      drag(boardEl, 100, 100, { button: 1 });
      boardEl.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, clientX: 700, clientY: 500 }));

      expect(board.getViewport()).toEqual({ x: 0, y: 0, zoom: 1 });
      expect(board.getNote(note.id)).toMatchObject({ x: 350, y: 350 });
    });

    it('still draws a rubberband with the mouse in the normal mode', () => {
      create({ pageScroll: true });
      const note = board.addNote({ x: 350, y: 350, width: 100, height: 100 });

      drag(boardEl, 200, 200);

      expect(board.getSelection()).toEqual([note.id]);
    });

    it('still creates a note on a double click in the normal mode', () => {
      create({ pageScroll: true });
      boardEl.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, clientX: 100, clientY: 100 }));
      expect(board.getNotes()).toHaveLength(1);
    });
  });

  describe('touch', () => {
    it('starts nothing on the board, so that a swipe scrolls the page', () => {
      create({ pageScroll: true });
      const note = board.addNote({ x: 200, y: 250, width: 100, height: 100 });

      const down = drag(handleOf(note.id), 0, 120, { pointerType: 'touch' });
      expect(down.defaultPrevented).toBe(false);
      expect(board.getNote(note.id)).toMatchObject({ x: 200, y: 250 });

      board.updateNote(note.id, { x: 350, y: 350 });
      drag(boardEl, 200, 200, { pointerType: 'touch' });
      expect(board.getSelection()).toEqual([]);
    });

    it('leaves the mouse as it is', () => {
      create({ pageScroll: true });
      const note = board.addNote({ x: 200, y: 250, width: 100, height: 100 });

      drag(handleOf(note.id), 30, 120, { pointerType: 'mouse' });

      expect(board.getNote(note.id)).toMatchObject({ x: 230, y: 370 });
    });

    it('drags notes as before outside the mode', () => {
      create();
      const note = board.addNote({ x: 200, y: 250, width: 100, height: 100 });

      drag(handleOf(note.id), 30, 120, { pointerType: 'touch' });

      expect(board.getNote(note.id)).toMatchObject({ x: 230, y: 370 });
    });
  });

  describe('revealNotes', () => {
    it('scrolls the page to the notes instead of panning', () => {
      create({ pageScroll: true });
      const a = board.addNote({ x: 20, y: 1500, width: 200, height: 100 });
      const b = board.addNote({ x: 20, y: 1700, width: 300, height: 100 });
      const boxes: { style: Record<string, string>; options: unknown }[] = [];
      HTMLElement.prototype.scrollIntoView = function (this: HTMLElement, options?: unknown) {
        const { left, top, width, height, scrollMargin } = this.style;
        boxes.push({ style: { left, top, width, height, scrollMargin }, options });
      };

      try {
        board.revealNotes([a.id, b.id], { padding: 10 });
      } finally {
        delete (HTMLElement.prototype as { scrollIntoView?: unknown }).scrollIntoView;
      }

      expect(boxes).toEqual([{
        style: { left: '20px', top: '1500px', width: '300px', height: '300px', scrollMargin: '10px' },
        options: { block: 'nearest', inline: 'nearest' },
      }]);
      expect(board.getViewport()).toEqual({ x: 0, y: 0, zoom: 1 });
      // The box it asked the browser about is gone
      expect(container.querySelectorAll('.wema-viewport > div:not(.wema-note)')).toHaveLength(0);
    });
  });
});
