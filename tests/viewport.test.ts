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
      expect([input.style.left, input.style.top]).toEqual(['200px', '256px']);

      board.setViewport({ x: -30, y: 12 });

      expect(container.querySelector('.wema-embed-input')).toBe(input);
      expect((input.querySelector('input') as HTMLInputElement).value).toBe('https://example.com/typed');
      expect([input.style.left, input.style.top]).toEqual(['170px', '268px']);
    });

    describe('inside the visible part of the board', () => {
      /** jsdom does no layout: give the window and the popups a size */
      function layoutWindow(width: number, height: number): void {
        vi.spyOn(document.documentElement, 'clientWidth', 'get').mockReturnValue(width);
        vi.spyOn(document.documentElement, 'clientHeight', 'get').mockReturnValue(height);
      }

      function sized(selector: string, width: number, height: number): HTMLElement {
        const el = container.querySelector(selector) as HTMLElement;
        Object.defineProperty(el, 'offsetWidth', { value: width, configurable: true });
        Object.defineProperty(el, 'offsetHeight', { value: height, configurable: true });
        return el;
      }

      function showNotePopup(noteId: string): void {
        board.select([noteId]);
        board.selectAll();
      }

      it('puts the note popup above a note at the bottom edge, and back inside at the right edge', () => {
        layoutWindow(2000, 2000);
        const popup = sized('.wema-note-popup', 300, 40);
        const note = board.addNote({ x: 650, y: 430, width: 200, height: 150 });
        showNotePopup(note.id);

        // Below would end at 628 (the board is 600 high): above the note, at 430 - 8 - 40.
        // Centered would end at 900 (the board is 800 wide): pushed back to 800 - 4 - 300
        expect([popup.style.left, popup.style.top]).toEqual(['496px', '382px']);
      });

      it('goes back under the note when the viewport makes room', () => {
        layoutWindow(2000, 2000);
        const popup = sized('.wema-note-popup', 300, 40);
        const note = board.addNote({ x: 250, y: 430, width: 200, height: 150 });
        showNotePopup(note.id);
        expect(popup.style.top).toBe('382px');

        board.setViewport({ y: -100 });

        expect([popup.style.left, popup.style.top]).toEqual(['200px', '488px']);
      });

      it('stops at the edge of the window when the board reaches beyond it', () => {
        layoutWindow(600, 400); // the board is at (100, 50): 500 x 350 of it are on screen
        const popup = sized('.wema-note-popup', 300, 40);
        const note = board.addNote({ x: 250, y: 100, width: 200, height: 150 });
        showNotePopup(note.id);

        // Below would end at 298, inside 350; centered would end at 500, the edge: 500 - 4 - 300
        expect([popup.style.left, popup.style.top]).toEqual(['196px', '258px']);
      });

      it('keeps the edge popup and the embed URL input inside too', () => {
        layoutWindow(2000, 2000);
        const a = board.addNote({ x: 0, y: 400, width: 200, height: 150 });
        const b = board.addNote({ x: 400, y: 400, width: 200, height: 150 });
        const edge = board.addEdge(a.id, b.id);
        const internals = board as unknown as {
          edgePopup: { show(id: string, x: number, y: number): void };
          showEmbedInput(id: string): void;
          placeEmbedInput(): void;
        };
        const edgePopup = sized('.wema-edge-popup', 200, 180);
        internals.edgePopup.show(edge.id, 120, 600); // screen point: (20, 550)
        expect([edgePopup.style.left, edgePopup.style.top]).toEqual(['4px', '358px']);

      });

      it('puts the embed URL input beyond the note popup, on the side the popup is on', () => {
        layoutWindow(2000, 2000);
        const popup = sized('.wema-note-popup', 300, 70);
        const note = board.addNote({ x: 250, y: 430, width: 200, height: 150 });
        showNotePopup(note.id);
        const internals = board as unknown as { showEmbedInput(id: string): void; placeEmbedInput(): void };
        internals.showEmbedInput(note.id);
        const input = sized('.wema-embed-input', 280, 40);
        internals.placeEmbedInput();

        // The popup is above the note (430 - 8 - 70), the input above the popup (352 - 6 - 40)
        expect(popup.style.top).toBe('352px');
        expect([input.style.left, input.style.top]).toEqual(['210px', '306px']);

        board.setViewport({ y: -200 });

        // Both under the note (bottom edge at 380): the popup at 388, the input at 388 + 70 + 6
        expect(popup.style.top).toBe('388px');
        expect(input.style.top).toBe('464px');
      });
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

    it('does not pan on Ctrl + wheel when wheelZoom is false', () => {
      board.destroy();
      createBoard({ wheelZoom: false });
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
      board.addNote({ x: 300, y: 300, text: 'short' });
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
      const note = board.addNote({ x: 200, y: 200 });
      const noteEl = container.querySelector('.wema-note') as HTMLElement;

      pointer('pointerdown', noteEl, { button: 1, clientX: 300, clientY: 300 });
      pointer('pointermove', boardEl, { clientX: 340, clientY: 280 });
      pointer('pointerup', boardEl, { button: 1, clientX: 340, clientY: 280 });

      expect(board.getViewport()).toEqual({ x: 40, y: -20, zoom: 1 });
      expect(board.getNote(note.id)).toEqual(expect.objectContaining({ x: 200, y: 200 }));
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

    describe("with emptyDrag: 'pan'", () => {
      beforeEach(() => {
        board.destroy();
        createBoard({ emptyDrag: 'pan', panMargin: Infinity });
      });

      it('pans on a plain left drag of an empty area in normal mode', () => {
        board.addNote({ x: 200, y: 250, width: 100, height: 100 });

        drag(boardEl, 200, 200);

        expect(board.getViewport()).toEqual({ x: 200, y: 200, zoom: 1 });
        expect(board.getSelection()).toEqual([]);
        expect(container.querySelector('.wema-rubberband')).toBeNull();
      });

      it.each([
        ['Ctrl', { ctrlKey: true }],
        ['Cmd', { metaKey: true }],
        ['Shift', { shiftKey: true }],
      ])('draws a rubberband with %s + drag', (_name, init) => {
        const note = board.addNote({ x: 200, y: 250, width: 100, height: 100 });

        drag(boardEl, 200, 200, init);

        expect(board.getViewport()).toEqual({ x: 0, y: 0, zoom: 1 });
        expect(board.getSelection()).toEqual([note.id]);
      });

      it('still drags a note instead of panning', () => {
        const note = board.addNote({ x: 200, y: 250, width: 100, height: 100 });
        const handle = container.querySelector('.wema-move-handle') as HTMLElement;

        drag(handle, 40, 30);

        expect(board.getViewport()).toEqual({ x: 0, y: 0, zoom: 1 });
        expect(board.getNote(note.id)).toEqual(expect.objectContaining({ x: 240, y: 280 }));
      });

      it('ends the editing of a note when the press starts a pan', () => {
        const note = board.addNote({ x: 200, y: 250, width: 100, height: 100 });
        const content = container.querySelector('.wema-note-content') as HTMLElement;
        content.tabIndex = 0; // jsdom does not treat contenteditable as focusable
        content.focus();
        expect(document.activeElement).toBe(content);
        content.textContent = 'typed';
        content.dispatchEvent(new Event('input', { bubbles: true }));

        drag(boardEl, 30, 30);

        expect(document.activeElement).toBe(boardEl);
        expect(board.getNote(note.id)!.text).toBe('typed');
      });

      it('clears the selection with a click that does not move', () => {
        const note = board.addNote({ x: 200, y: 250, width: 100, height: 100 });
        board.select([note.id]);

        drag(boardEl, 0, 0);
        boardEl.dispatchEvent(new MouseEvent('click', { bubbles: true }));

        expect(board.getSelection()).toEqual([]);
        expect(board.getViewport()).toEqual({ x: 0, y: 0, zoom: 1 });
      });

      it('still creates a note on a double click', () => {
        boardEl.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, clientX: 400, clientY: 300 }));
        expect(board.getNotes()).toHaveLength(1);
      });

      it('keeps Shift + drag for the rubberband in viewOnly, and adds Ctrl + drag', () => {
        const note = board.addNote({ x: 200, y: 250, width: 100, height: 100 });
        board.setViewOnly(true);

        for (const init of [{ shiftKey: true }, { ctrlKey: true }, { metaKey: true }]) {
          board.select([]);
          drag(boardEl, 200, 200, init);
          expect(board.getSelection()).toEqual([note.id]);
          expect(board.getViewport()).toEqual({ x: 0, y: 0, zoom: 1 });
        }

        board.select([]);
        drag(boardEl, 200, 200);
        expect(board.getSelection()).toEqual([]);
        expect(board.getViewport()).toEqual({ x: 200, y: 200, zoom: 1 });
      });

      it('takes the focus from a field outside the board', () => {
        const field = document.createElement('input');
        document.body.appendChild(field);
        field.focus();

        drag(boardEl, 30, 30);

        expect(document.activeElement).toBe(boardEl);
        field.remove();
      });

      it('pans in readOnly whatever keys are held', () => {
        board.setReadOnly(true);
        drag(boardEl, -80, 10, { ctrlKey: true });
        expect(board.getViewport()).toEqual({ x: -80, y: 10, zoom: 1 });
      });
    });

    it("treats an unknown emptyDrag as 'select'", () => {
      board.destroy();
      createBoard({ emptyDrag: 'scroll' as never });
      const note = board.addNote({ x: 200, y: 250, width: 100, height: 100 });

      drag(boardEl, 200, 200);

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

  describe('zoom', () => {
    it('scales the layer without changing note positions', () => {
      const note = board.addNote({ x: 40, y: 60 });
      board.setViewport({ x: 10, y: 20, zoom: 0.5 });

      expect(board.getViewport()).toEqual({ x: 10, y: 20, zoom: 0.5 });
      expect(viewportEl().style.transform).toBe('translate(10px, 20px) scale(0.5)');
      expect(board.getNote(note.id)).toMatchObject({ x: 40, y: 60 });
    });

    it('keeps the zoom within minZoom / maxZoom', () => {
      board.setViewport({ zoom: 10 });
      expect(board.getViewport().zoom).toBe(2);
      board.setViewport({ zoom: 0.01 });
      expect(board.getViewport().zoom).toBe(0.25);

      board.destroy();
      createBoard({ minZoom: 0.5, maxZoom: 4 });
      board.setViewport({ zoom: 10 });
      expect(board.getViewport().zoom).toBe(4);
      board.zoomTo(0.1);
      expect(board.getViewport().zoom).toBe(0.5);
    });

    it('starts within a zoom range that does not include 1, and panning keeps it', () => {
      board.destroy();
      createBoard({ maxZoom: 0.5 });
      expect(board.getViewport()).toEqual({ x: 0, y: 0, zoom: 0.5 });
      expect(viewportEl().style.transform).toBe('translate(0px, 0px) scale(0.5)');

      board.setViewport({ x: 30 });
      expect(board.getViewport()).toEqual({ x: 30, y: 0, zoom: 0.5 });
    });

    it('falls back to the default range for a minZoom / maxZoom that is not a positive number', () => {
      board.destroy();
      createBoard({ minZoom: 0, maxZoom: NaN });
      board.setViewport({ zoom: 0 });
      expect(board.getViewport().zoom).toBe(0.25);
      board.setViewport({ zoom: 100 });
      expect(board.getViewport().zoom).toBe(2);
    });

    it('keeps a zoom made in the middle of a pan drag', () => {
      pointer('pointerdown', boardEl, { button: 1, clientX: 300, clientY: 300 });
      pointer('pointermove', boardEl, { clientX: 320, clientY: 310 });
      wheel(boardEl, { deltaY: -30, ctrlKey: true, clientX: 320, clientY: 310 });
      const zoomed = board.getViewport();

      pointer('pointermove', boardEl, { clientX: 330, clientY: 310 });
      pointer('pointerup', boardEl, { button: 1, clientX: 330, clientY: 310 });

      expect(board.getViewport()).toEqual({ x: zoomed.x + 10, y: zoomed.y, zoom: zoomed.zoom });
    });

    it('zooms the board, not the page, with Ctrl + wheel over a popup', () => {
      const note = board.addNote({ x: 0, y: 0 });
      (board as unknown as { showEmbedInput(id: string): void }).showEmbedInput(note.id);
      const input = container.querySelector('.wema-embed-input') as HTMLElement;

      const zoom = wheel(input, { deltaY: -30, ctrlKey: true });
      expect(zoom.defaultPrevented).toBe(true);
      expect(board.getViewport().zoom).toBeGreaterThan(1);

      // A plain wheel over a popup is still left to the popup
      const before = board.getViewport();
      expect(wheel(input, { deltaY: 50 }).defaultPrevented).toBe(false);
      expect(board.getViewport()).toEqual(before);
    });

    it('ignores a zoom that is not a number', () => {
      board.setViewport({ zoom: NaN });
      board.zoomTo(NaN);
      expect(board.getViewport()).toEqual({ x: 0, y: 0, zoom: 1 });
    });

    it('emits viewport:change and nothing else', async () => {
      board.addNote({ x: 0, y: 0 });
      await flush();
      const viewportChange = vi.fn();
      const others = vi.fn();
      board.on('viewport:change', viewportChange);
      board.on('note:update', others);
      board.on('history:commit', others);
      board.on('change', others);

      board.zoomTo(1.5);
      await flush();

      expect(viewportChange).toHaveBeenCalledTimes(1);
      expect(viewportChange.mock.calls[0][0].zoom).toBe(1.5);
      expect(others).not.toHaveBeenCalled();
      expect(board.exportData().viewport).toBeUndefined();
    });

    it('zoomTo keeps the middle of the board in place by default', () => {
      board.setViewport({ x: 100, y: 50 });
      board.zoomTo(2);
      // The middle of the 800 x 600 board showed board point (300, 250) and still does
      expect(board.getViewport()).toEqual({ x: -200, y: -200, zoom: 2 });
    });

    it('zoomTo keeps the point under the given position in place', () => {
      // The board is at (100, 50) on screen: client (300, 250) is (200, 200) inside it
      board.zoomTo(0.5, { clientX: 300, clientY: 250 });
      expect(board.getViewport()).toEqual({ x: 100, y: 100, zoom: 0.5 });
    });

    it('zooms around the pointer with Ctrl + wheel', () => {
      const out = wheel(boardEl, { deltaY: 100, ctrlKey: true, clientX: 300, clientY: 250 });
      const zoomedOut = board.getViewport();
      expect(out.defaultPrevented).toBe(true);
      expect(zoomedOut.zoom).toBeLessThan(1);
      // Board point (200, 200) stays under the pointer
      expect(200 * zoomedOut.zoom + zoomedOut.x).toBeCloseTo(200);
      expect(200 * zoomedOut.zoom + zoomedOut.y).toBeCloseTo(200);

      wheel(boardEl, { deltaY: -100, metaKey: true, clientX: 300, clientY: 250 });
      expect(board.getViewport().zoom).toBeCloseTo(1);
    });

    it('zooms with Ctrl + wheel even when wheelPan is false, and over a scrolling note', () => {
      board.destroy();
      createBoard({ wheelPan: false });
      const note = board.addNote({ x: 0, y: 0 });
      const content = container.querySelector(`[data-note-id="${note.id}"] .wema-note-content`) as HTMLElement;
      Object.defineProperty(content, 'scrollHeight', { value: 500, configurable: true });
      Object.defineProperty(content, 'clientHeight', { value: 100, configurable: true });

      wheel(content, { deltaY: -100, ctrlKey: true });
      expect(board.getViewport().zoom).toBeGreaterThan(1);
    });

    it('creates a note under the pointer on double click when zoomed', () => {
      board.setViewport({ x: 100, y: 40, zoom: 0.5 });
      boardEl.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, clientX: 500, clientY: 290 }));
      // (500 - 100 - 100) / 0.5, (290 - 50 - 40) / 0.5
      expect(board.getNotes()[0]).toMatchObject({ x: 600, y: 400 });
    });

    it('moves a dragged note by the pointer distance divided by the zoom', () => {
      const note = board.addNote({ x: 100, y: 100 });
      board.setViewport({ zoom: 2 });
      const handle = container.querySelector(`[data-note-id="${note.id}"] .wema-move-handle`) as HTMLElement;

      drag(handle, 60, 40);

      expect(board.getNote(note.id)).toMatchObject({ x: 130, y: 120 });
    });

    it('starts a note drag by the distance on screen, not on the board', () => {
      const note = board.addNote({ x: 100, y: 100 });
      board.setViewport({ zoom: 0.25 });
      const handle = container.querySelector(`[data-note-id="${note.id}"] .wema-move-handle`) as HTMLElement;

      // 3 screen pixels are 12 board pixels at this zoom: still a click
      drag(handle, 3, 3);

      expect(board.getNote(note.id)).toMatchObject({ x: 100, y: 100 });
    });

    it('places the note popup and the embed URL input by the zoom', () => {
      const note = board.addNote({ x: 100, y: 100, width: 200, height: 100 });
      board.select([note.id]);
      (board as unknown as { updateNotePopup(): void }).updateNotePopup();
      (board as unknown as { showEmbedInput(id: string): void }).showEmbedInput(note.id);
      const popup = container.querySelector('.wema-note-popup') as HTMLElement;
      const input = container.querySelector('.wema-embed-input') as HTMLElement;

      board.setViewport({ x: 10, y: 20, zoom: 2 });

      // Under the middle of the note's bottom edge: (200 * 2 + 10, 200 * 2 + 20), with gaps that do not scale
      expect([popup.style.left, popup.style.top]).toEqual(['410px', '428px']);
      // Under the popup, which has no height in jsdom
      expect([input.style.left, input.style.top]).toEqual(['410px', '434px']);
    });

    it('keeps the edge popup at the clicked point of the edge', () => {
      const a = board.addNote({ x: 0, y: 0 });
      const b = board.addNote({ x: 400, y: 0 });
      const edge = board.addEdge(a.id, b.id);
      const popup = container.querySelector('.wema-edge-popup') as HTMLElement;
      (board as unknown as { edgePopup: { show(id: string, x: number, y: number): void } }).edgePopup
        .show(edge.id, 400, 150);
      expect([popup.style.left, popup.style.top]).toEqual(['300px', '112px']);

      board.setViewport({ x: 50, y: 0, zoom: 0.5 });

      // Board point (300, 100) is now at (200, 50) on screen
      expect([popup.style.left, popup.style.top]).toEqual(['200px', '62px']);
    });

    it('adds a note without a position inside what is shown', () => {
      board.setViewport({ x: -400, y: -200, zoom: 2 });
      expect(board.addNote()).toMatchObject({ x: 300, y: 200 });
    });

    it('revealNotes keeps the zoom', () => {
      const note = board.addNote({ x: 2000, y: 0, width: 200, height: 100 });
      board.setViewport({ zoom: 0.5 });

      board.revealNotes([note.id]);

      // The note is 100 px wide on screen and ends 24 px from the right edge
      expect(board.getViewport()).toEqual({ x: -324, y: 24, zoom: 0.5 });
    });
  });

  describe('pan limit', () => {
    // The board is 800 x 600 and the default margin is 200
    const wheelBy = (deltaX: number, deltaY: number): void => { wheel(boardEl, { deltaX, deltaY }); };

    it('shows at most the margin of empty space beyond notes larger than the board', () => {
      board.addNote({ x: 0, y: 0, width: 200, height: 100 });
      board.addNote({ x: 1800, y: 1400, width: 200, height: 100 });

      wheelBy(-5000, -5000);
      expect(board.getViewport()).toEqual({ x: 200, y: 200, zoom: 1 });

      wheelBy(9000, 9000);
      // Right edge of the notes (2000) at 800 - 200, bottom edge (1500) at 600 - 200
      expect(board.getViewport()).toEqual({ x: -1400, y: -1100, zoom: 1 });
    });

    it('keeps notes that fit in the board inside it', () => {
      board.addNote({ x: 100, y: 100, width: 200, height: 100 });

      wheelBy(5000, 5000);
      expect(board.getViewport()).toEqual({ x: -100, y: -100, zoom: 1 });

      wheelBy(-5000, -5000);
      expect(board.getViewport()).toEqual({ x: 500, y: 400, zoom: 1 });
    });

    it('applies to a pan drag and to the double click that centers', () => {
      board.addNote({ x: 0, y: 0, width: 200, height: 100 });
      board.addNote({ x: 1800, y: 1400, width: 200, height: 100 });
      board.setReadOnly(true);

      drag(boardEl, 900, 700);
      expect(board.getViewport()).toEqual({ x: 200, y: 200, zoom: 1 });

      board.setViewport({ x: -1400, y: -1100 });
      boardEl.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, clientX: 890, clientY: 640 }));
      expect(board.getViewport()).toEqual({ x: -1400, y: -1100, zoom: 1 });
    });

    it('scales with the zoom, and applies to Ctrl + wheel', () => {
      board.addNote({ x: 0, y: 0, width: 200, height: 100 });
      board.addNote({ x: 3800, y: 2900, width: 200, height: 100 });
      board.setViewport({ zoom: 0.5 });

      wheelBy(9000, 9000);
      // The notes are 2000 x 1500 on screen at this zoom
      expect(board.getViewport()).toEqual({ x: -1400, y: -1100, zoom: 0.5 });

      // Zooming out around the top-left corner would pull the notes away from the bottom right
      wheel(boardEl, { deltaY: 30, ctrlKey: true, clientX: 100, clientY: 50 });
      const { x, y, zoom } = board.getViewport();
      expect(zoom).toBeLessThan(0.5);
      expect(4000 * zoom + x).toBeCloseTo(600);
      expect(3000 * zoom + y).toBeCloseTo(400);
    });

    it('does not limit the API', () => {
      board.addNote({ x: 0, y: 0 });
      board.setViewport({ x: 5000, y: -5000 });
      expect(board.getViewport()).toEqual({ x: 5000, y: -5000, zoom: 1 });
    });

    it('lets a viewport that is already outside come back, without a jump and without going further', () => {
      board.addNote({ x: 0, y: 0, width: 200, height: 100 });
      board.setViewport({ x: 5000, y: 0 });

      wheelBy(-50, 0); // further away
      expect(board.getViewport().x).toBe(5000);
      wheelBy(50, 0); // back toward the notes
      expect(board.getViewport().x).toBe(4950);
    });

    it('leaves hidden notes out', () => {
      const a = board.addNote({ x: 100, y: 100, width: 200, height: 100 });
      board.addNote({ x: 5000, y: 5000, width: 200, height: 100 });
      board.setNoteFilter([a.id]);

      wheelBy(9000, 9000);
      expect(board.getViewport()).toEqual({ x: -100, y: -100, zoom: 1 });
    });

    it('has no limit on an empty board or with panMargin: Infinity', () => {
      wheelBy(9000, 0);
      expect(board.getViewport().x).toBe(-9000);

      board.destroy();
      createBoard({ panMargin: Infinity });
      board.addNote({ x: 0, y: 0 });
      wheelBy(9000, 0);
      expect(board.getViewport().x).toBe(-9000);
    });

    it('takes the margin from panMargin', () => {
      board.destroy();
      createBoard({ panMargin: 50 });
      board.addNote({ x: 0, y: 0, width: 2000, height: 1500 });
      wheelBy(-9000, -9000);
      expect(board.getViewport()).toEqual({ x: 50, y: 50, zoom: 1 });
    });
  });

  describe('fitToContent', () => {
    it('zooms out until the notes fit, in the middle', () => {
      board.addNote({ x: 0, y: 0, width: 200, height: 100 });
      board.addNote({ x: 1800, y: 900, width: 200, height: 100 });

      board.fitToContent({ padding: 0 });

      // 2000 x 1000 in 800 x 600: zoom 0.4, 800 x 400 on screen
      expect(board.getViewport()).toEqual({ x: 0, y: 100, zoom: 0.4 });
    });

    it('leaves the padding free', () => {
      board.addNote({ x: 0, y: 0, width: 1500, height: 100 });
      board.fitToContent({ padding: 25 });
      expect(board.getViewport()).toEqual({ x: 25, y: 275, zoom: 0.5 });
    });

    it('does not enlarge a few small notes unless maxZoom allows it', () => {
      board.addNote({ x: 1000, y: 1000, width: 200, height: 100 });

      board.fitToContent();
      expect(board.getViewport()).toEqual({ x: -700, y: -750, zoom: 1 });

      board.fitToContent({ maxZoom: 2 });
      // 400 x 200 on screen, starting at (200, 200)
      expect(board.getViewport()).toEqual({ x: -1800, y: -1800, zoom: 2 });
    });

    it('shows the top-left corner when the notes do not fit at minZoom', () => {
      board.addNote({ x: -100, y: -100, width: 100, height: 100 });
      board.addNote({ x: 9900, y: 9900, width: 100, height: 100 });

      board.fitToContent();

      expect(board.getViewport()).toEqual({ x: 49, y: 49, zoom: 0.25 });
    });

    it('fits only the notes shown by the filter, or the given ones', () => {
      const a = board.addNote({ x: 0, y: 0, width: 200, height: 100 });
      const b = board.addNote({ x: 5000, y: 5000, width: 200, height: 100 });
      board.setNoteFilter([a.id]);
      board.fitToContent();
      expect(board.getViewport()).toEqual({ x: 300, y: 250, zoom: 1 });

      board.setNoteFilter(null);
      board.fitToContent({ noteIds: [b.id] });
      expect(board.getViewport()).toEqual({ x: -4700, y: -4750, zoom: 1 });
    });

    it('does nothing on an empty board', () => {
      board.setViewport({ x: 7, y: 8, zoom: 0.5 });
      board.fitToContent();
      expect(board.getViewport()).toEqual({ x: 7, y: 8, zoom: 0.5 });
    });
  });
});
