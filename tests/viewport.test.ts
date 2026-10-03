import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { WemaBoard } from '../src/board';
import type { WemaBoardOptions } from '../src/types';

describe('Viewport', () => {
  let container: HTMLElement;
  let board: WemaBoard;
  let boardEl: HTMLElement;

  /** jsdom does no layout: give the board a position and a size on screen */
  function layoutBoard(left: number, top: number, width: number, height: number): void {
    boardEl.getBoundingClientRect = () =>
      ({ left, top, width, height, right: left + width, bottom: top + height, x: left, y: top, toJSON: () => ({}) }) as DOMRect;
    Object.defineProperty(boardEl, 'clientWidth', { value: width, configurable: true });
    Object.defineProperty(boardEl, 'clientHeight', { value: height, configurable: true });
  }

  function createBoard(options: Partial<WemaBoardOptions> = {}): void {
    board = new WemaBoard({ container, ...options });
    boardEl = container.querySelector('.wema-board') as HTMLElement;
    // jsdom has neither pointer capture nor a layout for the edge hit test
    boardEl.setPointerCapture = () => undefined;
    boardEl.releasePointerCapture = () => undefined;
    layoutBoard(100, 50, 800, 600);
  }

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    document.elementsFromPoint = () => [];
    createBoard();
  });

  afterEach(() => {
    board.destroy();
    container.remove();
    vi.restoreAllMocks();
    delete (document as Partial<Document>).elementsFromPoint;
  });

  // Helper to flush microtask-based batch commit
  const flush = () => Promise.resolve();
  const viewportEl = (): HTMLElement => container.querySelector('.wema-viewport') as HTMLElement;

  function pointer(type: string, target: Element, init: PointerEventInit): PointerEvent {
    const event = new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: 1, ...init });
    target.dispatchEvent(event);
    return event;
  }

  /** Press on `target`, move by (dx, dy), release */
  function drag(target: Element, dx: number, dy: number, init: PointerEventInit = {}): void {
    const from = { clientX: 300, clientY: 300 };
    pointer('pointerdown', target, { button: 0, ...from, ...init });
    pointer('pointermove', boardEl, { ...from, clientX: from.clientX + dx, clientY: from.clientY + dy, ...init });
    pointer('pointerup', boardEl, { button: 0, clientX: from.clientX + dx, clientY: from.clientY + dy, ...init });
  }

  function wheel(target: Element, init: WheelEventInit): WheelEvent {
    const event = new WheelEvent('wheel', { bubbles: true, cancelable: true, ...init });
    target.dispatchEvent(event);
    return event;
  }

  describe('structure', () => {
    it('renders notes and edges inside the viewport layer', () => {
      const a = board.addNote({ x: 0, y: 0 });
      const b = board.addNote({ x: 300, y: 0 });
      board.addEdge(a.id, b.id);

      expect(viewportEl().parentElement).toBe(boardEl);
      expect(viewportEl().querySelectorAll('.wema-note')).toHaveLength(2);
      expect(viewportEl().querySelector('svg.wema-edges .wema-edge-path')).not.toBeNull();
      // Popups stay in screen space, outside the panned layer
      expect(container.querySelector('.wema-note-popup')!.parentElement).toBe(boardEl);
    });
  });

  describe('setViewport', () => {
    it('moves the layer without changing note positions', () => {
      const note = board.addNote({ x: 10, y: 20 });

      board.setViewport({ x: -200, y: 150 });

      expect(board.getViewport()).toEqual({ x: -200, y: 150, zoom: 1 });
      expect(viewportEl().style.transform).toBe('translate(-200px, 150px)');
      expect(board.getNote(note.id)).toEqual(expect.objectContaining({ x: 10, y: 20 }));
    });

    it('keeps the other axis when only one is given', () => {
      board.setViewport({ x: 10, y: 20 });
      board.setViewport({ y: 99 });
      expect(board.getViewport()).toEqual({ x: 10, y: 99, zoom: 1 });
    });

    it('emits viewport:change and nothing else', async () => {
      board.addNote();
      await flush();
      const viewportHandler = vi.fn();
      const otherHandler = vi.fn();
      board.on('viewport:change', viewportHandler);
      for (const event of ['note:update', 'history:commit', 'change'] as const) board.on(event, otherHandler);

      board.setViewport({ x: 5, y: 6 });
      board.setViewport({ x: 5, y: 6 }); // no change: no second event
      await flush();

      expect(viewportHandler).toHaveBeenCalledTimes(1);
      expect(viewportHandler).toHaveBeenCalledWith({ x: 5, y: 6, zoom: 1 });
      expect(otherHandler).not.toHaveBeenCalled();
      // The last undo step is still the creation of the note
      board.undo();
      expect(board.getNotes()).toHaveLength(0);
    });

    it('ignores values that are not finite numbers', () => {
      board.setViewport({ x: Number.NaN, y: 5 });
      expect(board.getViewport()).toEqual({ x: 0, y: 0, zoom: 1 });
    });

    it('works in readOnly and viewOnly', () => {
      board.setReadOnly(true);
      board.setViewport({ x: 1, y: 2 });
      board.setReadOnly(false);
      board.setViewOnly(true);
      board.setViewport({ x: 3, y: 4 });
      expect(board.getViewport()).toEqual({ x: 3, y: 4, zoom: 1 });
    });

    it('is not part of exportData and survives importData', () => {
      board.addNote();
      board.setViewport({ x: 30, y: 40 });

      const data = board.exportData();
      expect(data).not.toHaveProperty('viewport');

      board.importData({ ...data, viewport: { x: 1, y: 1, zoom: 2 } });
      expect(board.getViewport()).toEqual({ x: 30, y: 40, zoom: 1 });
    });

    it('moves the note popup with the note', () => {
      const note = board.addNote({ x: 100, y: 100, width: 200, height: 150 });
      board.select([note.id]);
      board.selectAll(); // shows the popup
      const popup = container.querySelector('.wema-note-popup') as HTMLElement;
      expect(popup.style.left).toBe('200px');
      expect(popup.style.top).toBe('258px');

      board.setViewport({ x: -50, y: 30 });

      expect(popup.style.left).toBe('150px');
      expect(popup.style.top).toBe('288px');
    });
  });

  describe('overlays', () => {
    it('moves the embed URL input along instead of closing it', () => {
      const note = board.addNote({ x: 100, y: 100, width: 200, height: 150 });
      (board as unknown as { showEmbedInput(id: string): void }).showEmbedInput(note.id);
      const input = container.querySelector('.wema-embed-input') as HTMLElement;
      (input.querySelector('input') as HTMLInputElement).value = 'https://example.com/typed';
      expect([input.style.left, input.style.top]).toEqual(['200px', '300px']);

      board.setViewport({ x: -30, y: 12 });

      expect(container.querySelector('.wema-embed-input')).toBe(input);
      expect((input.querySelector('input') as HTMLInputElement).value).toBe('https://example.com/typed');
      expect([input.style.left, input.style.top]).toEqual(['170px', '312px']);
    });

    it('moves the edge popup along', () => {
      const a = board.addNote({ x: 0, y: 0 });
      const b = board.addNote({ x: 400, y: 0 });
      const edge = board.addEdge(a.id, b.id);
      const internals = board as unknown as { edgePopup: { show(id: string, x: number, y: number): void } };
      internals.edgePopup.show(edge.id, 400, 250); // screen point: (300, 200) inside the board
      const popup = container.querySelector('.wema-edge-popup') as HTMLElement;
      expect([popup.style.left, popup.style.top, popup.style.display]).toEqual(['300px', '212px', '']);

      board.setViewport({ x: 50, y: -20 });

      expect([popup.style.left, popup.style.top, popup.style.display]).toEqual(['350px', '192px', '']);
    });
  });

  describe('addNote without a position', () => {
    it('places the note in the part of the board that is shown', () => {
      board.setViewport({ x: -2000, y: -1500 });

      const note = board.addNote({ text: 'new' });

      expect(note).toEqual(expect.objectContaining({ x: 2100, y: 1600 }));
    });

    it('keeps a given position as it is', () => {
      board.setViewport({ x: -2000, y: -1500 });
      expect(board.addNote({ x: 5, y: 0 })).toEqual(expect.objectContaining({ x: 5, y: 0 }));
    });
  });

  describe('pointer coordinates', () => {
    it('creates a note under the pointer on double click', () => {
      board.setViewport({ x: -300, y: 200 });

      boardEl.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, clientX: 400, clientY: 350 }));

      // screen (400, 350) - board origin (100, 50) - viewport (-300, 200)
      expect(board.getNotes()[0]).toEqual(expect.objectContaining({ x: 600, y: 100 }));
    });

    it('selects the notes under a rubberband drawn after panning', () => {
      const far = board.addNote({ x: 1000, y: 1000, width: 100, height: 100 });
      const near = board.addNote({ x: 0, y: 0, width: 100, height: 100 });
      board.setViewport({ x: -900, y: -900 });

      // The far note is now at screen (100 + 100, 50 + 100) .. (300, 250)
      pointer('pointerdown', boardEl, { button: 0, clientX: 150, clientY: 100 });
      pointer('pointermove', boardEl, { clientX: 350, clientY: 300 });
      pointer('pointerup', boardEl, { button: 0, clientX: 350, clientY: 300 });

      expect(board.getSelection()).toEqual([far.id]);
      expect(board.getSelection()).not.toContain(near.id);
    });
  });

  describe('pan with the wheel', () => {
    it('moves the viewport against the scroll direction', () => {
      const event = wheel(boardEl, { deltaX: 30, deltaY: 120 });

      expect(board.getViewport()).toEqual({ x: -30, y: -120, zoom: 1 });
      expect(event.defaultPrevented).toBe(true);
    });

    it('pans sideways with Shift', () => {
      wheel(boardEl, { deltaY: 120, shiftKey: true });
      expect(board.getViewport()).toEqual({ x: -120, y: 0, zoom: 1 });
    });

    it('converts line-based deltas to pixels', () => {
      wheel(boardEl, { deltaY: 3, deltaMode: 1 });
      expect(board.getViewport().y).toBe(-48);
    });

    it('leaves Ctrl + wheel alone', () => {
      const event = wheel(boardEl, { deltaY: 120, ctrlKey: true });
      expect(board.getViewport()).toEqual({ x: 0, y: 0, zoom: 1 });
      expect(event.defaultPrevented).toBe(false);
    });

    it('lets a note with scrolling content keep the wheel', () => {
      board.addNote({ text: 'long' });
      const content = container.querySelector('.wema-note-content') as HTMLElement;
      Object.defineProperty(content, 'scrollHeight', { value: 500, configurable: true });
      Object.defineProperty(content, 'clientHeight', { value: 100, configurable: true });

      const event = wheel(content, { deltaY: 120 });

      expect(board.getViewport().y).toBe(0);
      expect(event.defaultPrevented).toBe(false);
    });

    it('pans over a note whose content does not scroll', () => {
      board.addNote({ text: 'short' });
      wheel(container.querySelector('.wema-note-content') as HTMLElement, { deltaY: 120 });
      expect(board.getViewport().y).toBe(-120);
    });

    it('does nothing when wheelPan is false', () => {
      board.destroy();
      createBoard({ wheelPan: false });

      const event = wheel(boardEl, { deltaY: 120 });

      expect(board.getViewport().y).toBe(0);
      expect(event.defaultPrevented).toBe(false);
    });
  });

  describe('pan by dragging', () => {
    it('pans with the middle button, even over a note', () => {
      const note = board.addNote({ x: 0, y: 0 });
      const noteEl = container.querySelector('.wema-note') as HTMLElement;

      pointer('pointerdown', noteEl, { button: 1, clientX: 300, clientY: 300 });
      pointer('pointermove', boardEl, { clientX: 340, clientY: 280 });
      pointer('pointerup', boardEl, { button: 1, clientX: 340, clientY: 280 });

      expect(board.getViewport()).toEqual({ x: 40, y: -20, zoom: 1 });
      expect(board.getNote(note.id)).toEqual(expect.objectContaining({ x: 0, y: 0 }));
    });

    /** Press Space with the pointer over the board; the key goes to the document */
    function pressSpace(init: KeyboardEventInit = {}): KeyboardEvent {
      const event = new KeyboardEvent('keydown', { code: 'Space', bubbles: true, cancelable: true, ...init });
      document.dispatchEvent(event);
      return event;
    }
    const hover = (): void => { boardEl.dispatchEvent(new PointerEvent('pointerenter')); };

    it('pans with Space + left drag instead of drawing a rubberband', () => {
      hover();
      const event = pressSpace();
      expect(boardEl.classList.contains('wema-pan-ready')).toBe(true);
      expect(event.defaultPrevented).toBe(true);

      drag(boardEl, 60, 25);

      expect(board.getViewport()).toEqual({ x: 60, y: 25, zoom: 1 });
      expect(container.querySelector('.wema-rubberband')).toBeNull();

      document.dispatchEvent(new KeyboardEvent('keyup', { code: 'Space', bubbles: true }));
      expect(boardEl.classList.contains('wema-pan-ready')).toBe(false);
    });

    it('arms without focus on the board, as long as the pointer is over it', () => {
      (document.activeElement as HTMLElement | null)?.blur();
      hover();
      pressSpace();
      expect(boardEl.classList.contains('wema-pan-ready')).toBe(true);
    });

    it('leaves Space alone when the pointer is not over the board', () => {
      const event = pressSpace();
      expect(event.defaultPrevented).toBe(false);
      expect(boardEl.classList.contains('wema-pan-ready')).toBe(false);

      hover();
      boardEl.dispatchEvent(new PointerEvent('pointerleave'));
      pressSpace();
      expect(boardEl.classList.contains('wema-pan-ready')).toBe(false);
    });

    it('leaves Space alone with a modifier key', () => {
      hover();
      const event = pressSpace({ ctrlKey: true });
      expect(event.defaultPrevented).toBe(false);
      expect(boardEl.classList.contains('wema-pan-ready')).toBe(false);
    });

    it('does not take Space away from a note being edited', () => {
      board.addNote();
      const content = container.querySelector('.wema-note-content') as HTMLElement;
      // jsdom neither reflects the contentEditable property nor focuses such an element
      content.setAttribute('contenteditable', 'true');
      content.tabIndex = 0;
      content.focus();
      hover();

      const event = pressSpace();

      expect(event.defaultPrevented).toBe(false);
      expect(boardEl.classList.contains('wema-pan-ready')).toBe(false);
    });

    it('releases Space when the window loses focus', () => {
      hover();
      pressSpace();

      window.dispatchEvent(new Event('blur'));

      expect(boardEl.classList.contains('wema-pan-ready')).toBe(false);
      drag(boardEl, 60, 25);
      expect(board.getViewport()).toEqual({ x: 0, y: 0, zoom: 1 });
    });

    it('does not skip the next click after a pan that was cancelled', () => {
      const note = board.addNote({ x: 0, y: 0 });
      board.setViewOnly(true);
      pointer('pointerdown', boardEl, { button: 0, clientX: 300, clientY: 300 });
      pointer('pointermove', boardEl, { clientX: 360, clientY: 330 });
      pointer('pointercancel', boardEl, { clientX: 360, clientY: 330 });

      const noteEl = container.querySelector('.wema-note') as HTMLElement;
      noteEl.dispatchEvent(new MouseEvent('click', { bubbles: true }));

      expect(board.getSelection()).toEqual([note.id]);
    });

    it('draws a rubberband on a plain left drag in normal mode', () => {
      const note = board.addNote({ x: 200, y: 250, width: 100, height: 100 });

      drag(boardEl, 200, 200);

      expect(board.getViewport()).toEqual({ x: 0, y: 0, zoom: 1 });
      expect(board.getSelection()).toEqual([note.id]);
    });

    it('pans on a plain left drag of an empty area in readOnly', () => {
      board.setReadOnly(true);
      drag(boardEl, -80, 10);
      expect(board.getViewport()).toEqual({ x: -80, y: 10, zoom: 1 });
    });

    it('pans on a plain left drag of an empty area in viewOnly', () => {
      board.addNote({ x: 200, y: 250, width: 100, height: 100 });
      board.setViewOnly(true);

      drag(boardEl, 200, 200);

      expect(board.getViewport()).toEqual({ x: 200, y: 200, zoom: 1 });
      expect(board.getSelection()).toEqual([]);
    });

    it('draws a rubberband with Shift + drag in viewOnly', () => {
      const note = board.addNote({ x: 200, y: 250, width: 100, height: 100 });
      board.setViewOnly(true);

      drag(boardEl, 200, 200, { shiftKey: true });

      expect(board.getViewport()).toEqual({ x: 0, y: 0, zoom: 1 });
      expect(board.getSelection()).toEqual([note.id]);
    });

    it('does not clear the selection with the click that ends a pan', () => {
      const note = board.addNote();
      board.select([note.id]);
      hover();
      pressSpace();

      drag(boardEl, 50, 50);
      boardEl.dispatchEvent(new MouseEvent('click', { bubbles: true }));

      expect(board.getSelection()).toEqual([note.id]);
    });
  });

  describe('pan by double click', () => {
    const dblclick = (target: Element, clientX: number, clientY: number): void => {
      target.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, clientX, clientY }));
    };

    it('brings the clicked point to the center in viewOnly', () => {
      board.setViewOnly(true);
      board.setViewport({ x: 10, y: 20 });

      // The board is at (100, 50) and 800 x 600, so its center is (500, 350)
      dblclick(boardEl, 700, 150);

      expect(board.getViewport()).toEqual({ x: -190, y: 220, zoom: 1 });
      expect(board.getNotes()).toHaveLength(0);
    });

    it('brings the clicked point to the center in readOnly', () => {
      board.setReadOnly(true);
      dblclick(boardEl, 300, 350);
      expect(board.getViewport()).toEqual({ x: 200, y: 0, zoom: 1 });
    });

    it('pans in normal mode when createOnDblClick is false', () => {
      board.destroy();
      createBoard({ createOnDblClick: false });

      dblclick(boardEl, 600, 450);

      expect(board.getViewport()).toEqual({ x: -100, y: -100, zoom: 1 });
      expect(board.getNotes()).toHaveLength(0);
    });

    it('creates a note instead of panning in normal mode', () => {
      dblclick(boardEl, 700, 150);

      expect(board.getViewport()).toEqual({ x: 0, y: 0, zoom: 1 });
      expect(board.getNotes()).toHaveLength(1);
    });

    it('does nothing on a note', () => {
      board.addNote({ x: 0, y: 0 });
      board.setViewOnly(true);

      dblclick(container.querySelector('.wema-note-content') as HTMLElement, 700, 150);

      expect(board.getViewport()).toEqual({ x: 0, y: 0, zoom: 1 });
    });
  });

  describe('revealNotes', () => {
    it('does not move when the notes are already in view', () => {
      const note = board.addNote({ x: 100, y: 100, width: 200, height: 150 });
      board.revealNotes([note.id]);
      expect(board.getViewport()).toEqual({ x: 0, y: 0, zoom: 1 });
    });

    it('pans just enough to show a note beyond the right and bottom edges', () => {
      const note = board.addNote({ x: 1000, y: 900, width: 200, height: 150 });

      board.revealNotes([note.id]);

      // right edge 1200 -> 800 - 24, bottom edge 1050 -> 600 - 24
      expect(board.getViewport()).toEqual({ x: -424, y: -474, zoom: 1 });
    });

    it('pans just enough to show a note beyond the left and top edges', () => {
      const note = board.addNote({ x: -500, y: -300, width: 200, height: 150 });

      board.revealNotes([note.id], { padding: 10 });

      expect(board.getViewport()).toEqual({ x: 510, y: 310, zoom: 1 });
    });

    it('shows the top-left corner when the notes do not fit', () => {
      const a = board.addNote({ x: 0, y: 0, width: 200, height: 150 });
      const b = board.addNote({ x: 2000, y: 2000, width: 200, height: 150 });
      board.setViewport({ x: -900, y: -900 });

      board.revealNotes([a.id, b.id]);

      expect(board.getViewport()).toEqual({ x: 24, y: 24, zoom: 1 });
    });

    it('ignores hidden notes and unknown ids', () => {
      const shown = board.addNote({ x: 100, y: 100, width: 200, height: 150 });
      const hidden = board.addNote({ x: 5000, y: 5000, width: 200, height: 150 });
      board.setNoteFilter([shown.id]);

      board.revealNotes([shown.id, hidden.id, 'missing']);
      expect(board.getViewport()).toEqual({ x: 0, y: 0, zoom: 1 });

      board.revealNotes([hidden.id]);
      expect(board.getViewport()).toEqual({ x: 0, y: 0, zoom: 1 });
    });
  });

  describe('centerContent', () => {
    it('centers the notes when they fit', () => {
      board.addNote({ x: 1000, y: 1000, width: 200, height: 100 });
      board.addNote({ x: 1300, y: 1200, width: 100, height: 100 });

      board.centerContent();

      // content 400 x 300 centered in 800 x 600: starts at (200, 150)
      expect(board.getViewport()).toEqual({ x: -800, y: -850, zoom: 1 });
    });

    it('shows the top-left corner when the notes do not fit', () => {
      board.addNote({ x: -1000, y: -500, width: 200, height: 100 });
      board.addNote({ x: 3000, y: 3000, width: 200, height: 100 });

      board.centerContent({ padding: 40 });

      expect(board.getViewport()).toEqual({ x: 1040, y: 540, zoom: 1 });
    });

    it('fits only the notes shown by the filter', () => {
      const a = board.addNote({ x: 0, y: 0, width: 200, height: 100 });
      board.addNote({ x: 5000, y: 5000, width: 200, height: 100 });
      board.setNoteFilter([a.id]);

      board.centerContent();

      expect(board.getViewport()).toEqual({ x: 300, y: 250, zoom: 1 });
    });

    it('does nothing on an empty board', () => {
      board.setViewport({ x: 7, y: 8 });
      board.centerContent();
      expect(board.getViewport()).toEqual({ x: 7, y: 8, zoom: 1 });
    });
  });
});
