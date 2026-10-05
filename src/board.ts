import type {
  NoteId,
  EdgeId,
  NoteTheme,
  WemaNote,
  WemaEdge,
  WemaBoardData,
  WemaBoardOptions,
  WemaBatchOptions,
  WemaViewport,
  WemaViewportMoveOptions,
  WemaCenterOptions,
  WemaFitOptions,
  WemaClientPoint,
  WemaEventMap,
  HistoryDelta,
  ChangeOrigin,
} from './types.js';
import { type WemaLabels, resolveLabels } from './labels.js';
import { EventEmitter } from './events.js';
import { NoteManager } from './note.js';
import { DragManager, DRAG_THRESHOLD } from './drag.js';
import { SelectionManager } from './selection.js';
import { EdgeManager } from './edge.js';
import { AnchorDragManager } from './anchor-drag.js';
import { ResizeManager } from './resize.js';
import { EdgeStylePopup } from './edge-popup.js';
import { NoteStylePopup } from './note-popup.js';
import { computeAlignment, computeDistribution, computeAutoLayout } from './layout.js';
import type { NotePosition, NoteAlignment, DistributeDirection } from './layout.js';
import { HistoryManager, replayDeltas } from './history.js';
import type { ReplayCallbacks } from './history.js';
import { RichTextToolbar } from './rich-text.js';
import { Viewport } from './viewport.js';
import { createElement, createSvgElement, setStyles, TYPING_SELECTOR } from './utils/dom.js';
import { toEmbedUrlAsync } from './utils/oembed.js';
import { isSafeUrl } from './utils/sanitize.js';
import { resolveAutoAnchor } from './utils/geometry.js';
import type { Point } from './utils/geometry.js';

/** Popups and toolbars that sit on the board; a pointer event on one of them is not a board gesture */
const OVERLAY_SELECTOR =
  '.wema-edge-popup, .wema-note-popup, .wema-richtext-toolbar, .wema-image-overlay, .wema-embed-input';

/** Zoom per pixel of Ctrl + wheel, as a power of 2 (a capped notch of 30 changes the zoom by about 23%) */
const WHEEL_ZOOM_RATE = 0.01;
/** Largest wheel delta, in pixels, that a single Ctrl + wheel event counts for */
const WHEEL_ZOOM_MAX_DELTA = 30;

/** Where a box [start, end] starts when it sits in the middle of `size` (one axis) */
const centerInBoard = (start: number, end: number, size: number): number => (size - (end - start)) / 2;

/** Main API class for the wema board */
export class WemaBoard {
  private emitter = new EventEmitter<WemaEventMap>();
  private boardEl: HTMLElement;
  private viewportEl: HTMLElement;
  private svgEl: SVGSVGElement;
  /** Which part of the board is shown, and the coordinate conversions */
  private view: Viewport;
  private wheelPan: boolean;
  private wheelZoom: boolean;
  /** How much empty space a user gesture may show beyond the notes, in screen pixels (Infinity: no limit) */
  private panMargin: number;
  private spaceHeld = false;
  private pointerInside = false;
  /** The inline URL input for embeds and the note it belongs to, while it is open */
  private embedInput: { el: HTMLElement; noteId: NoteId } | null = null;
  private pan: { pointerId: number; startX: number; startY: number; lastX: number; lastY: number; moved: boolean } | null = null;
  private panMoved = false;
  private noteManager: NoteManager;
  private dragManager: DragManager;
  private selectionManager: SelectionManager;
  private edgeManager: EdgeManager;
  private anchorDragManager: AnchorDragManager;
  private resizeManager: ResizeManager;
  private edgePopup: EdgeStylePopup;
  private notePopup: NoteStylePopup;
  private richTextToolbar: RichTextToolbar;
  private historyManager: HistoryManager;
  private visibilitySuspended = false;
  /** Notes to show, or null to show all (see setNoteFilter) */
  private noteFilter: Set<NoteId> | null = null;
  /** Notes currently hidden by a collapsed edge or by the filter */
  private hiddenNoteIds = new Set<NoteId>();
  private onImageUpload?: (file: File) => Promise<string>;
  private changePending = false;
  private container: HTMLElement;
  /** The texts of the UI (the `labels` and `foldLabels` options over the English ones) */
  private labels: WemaLabels;
  private readOnly: boolean;
  private viewOnly: boolean;
  private defaultNoteWidth: number;
  private defaultNoteHeight: number;
  private positionSnapshot: Map<NoteId, { x: number; y: number }> | null = null;
  private collapsedEdgeSnapshot: Map<EdgeId, boolean> | null = null;
  private theme: NoteTheme;
  private rubberBandMoved = false;
  private noteDragged = false;

  private handleDblClick: (e: MouseEvent) => void;
  private handleKeyDown: (e: KeyboardEvent) => void;
  private handleBoardClick: (e: MouseEvent) => void;
  private handleRubberBandDown: (e: PointerEvent) => void;
  private handleRubberBandMove: (e: PointerEvent) => void;
  private handleRubberBandUp: (e: PointerEvent) => void;
  private handlePanDown: (e: PointerEvent) => void;
  private handlePanMove: (e: PointerEvent) => void;
  private handlePanUp: (e: PointerEvent) => void;
  private handlePointerEnter: () => void;
  private handlePointerLeave: () => void;
  private handleSpaceDown: (e: KeyboardEvent) => void;
  private handleKeyUp: (e: KeyboardEvent) => void;
  private handleBlur: () => void;
  private handleWheel: (e: WheelEvent) => void;

  constructor(options: WemaBoardOptions) {
    this.container = options.container;
    this.labels = resolveLabels(options.labels, options.foldLabels);
    this.readOnly = options.readOnly ?? false;
    this.viewOnly = options.viewOnly ?? false;
    this.defaultNoteWidth = options.defaultNoteWidth ?? 200;
    this.defaultNoteHeight = options.defaultNoteHeight ?? 150;
    this.theme = options.theme ?? 'default';
    this.onImageUpload = options.onImageUpload;
    this.wheelPan = options.wheelPan ?? true;
    this.wheelZoom = options.wheelZoom ?? true;
    this.panMargin = options.panMargin !== undefined && options.panMargin >= 0 ? options.panMargin : 200;

    // Create board element
    this.boardEl = createElement('div', 'wema-board');
    if (this.theme !== 'default') {
      this.boardEl.classList.add(`wema-theme-${this.theme}`);
    }
    setStyles(this.boardEl, { position: 'relative', width: '100%', height: '100%', overflow: 'hidden' });
    this.boardEl.tabIndex = 0;

    // Layer for everything drawn in board coordinates; panning moves it and zooming scales it
    this.viewportEl = createElement('div', 'wema-viewport');
    setStyles(this.viewportEl, { position: 'absolute', top: '0', left: '0', width: '0', height: '0' });
    this.boardEl.appendChild(this.viewportEl);
    this.view = new Viewport({
      boardEl: this.boardEl,
      layerEl: this.viewportEl,
      minZoom: options.minZoom,
      maxZoom: options.maxZoom,
    });

    // Create SVG layer for edges (drawn outside its own box, wherever the notes are)
    this.svgEl = createSvgElement('svg', 'wema-edges');
    this.svgEl.setAttribute('width', '1');
    this.svgEl.setAttribute('height', '1');
    setStyles(this.svgEl as unknown as HTMLElement, {
      position: 'absolute',
      top: '0',
      left: '0',
      overflow: 'visible',
      pointerEvents: 'none',
    });
    this.viewportEl.appendChild(this.svgEl);

    // Mount to container
    this.container.appendChild(this.boardEl);

    // Initialize managers
    this.noteManager = new NoteManager({
      boardEl: this.boardEl,
      layerEl: this.viewportEl,
      emitter: this.emitter,
      defaultWidth: options.defaultNoteWidth ?? 200,
      defaultHeight: options.defaultNoteHeight ?? 150,
      defaultColor: options.defaultNoteColor ?? '#FFF9C4',
      readOnly: this.readOnly,
      // A measured size is not a note event: redraw the edges and report the data
      onMeasure: (noteId) => {
        this.edgeManager.updateEdgesOf(noteId);
        this.notePopup.follow();
        this.scheduleChange();
      },
      onLinkClick: options.onLinkClick,
      hostRender: options.renderNote,
      labels: this.labels,
    });

    this.selectionManager = new SelectionManager({
      layerEl: this.viewportEl,
      noteManager: this.noteManager,
      emitter: this.emitter,
      isSelectable: (noteId) => !this.hiddenNoteIds.has(noteId),
    });

    this.edgeManager = new EdgeManager({
      boardEl: this.boardEl,
      svgEl: this.svgEl,
      noteManager: this.noteManager,
      emitter: this.emitter,
    });

    const isLocked = () => this.readOnly;
    const isRestricted = () => this.readOnly || this.viewOnly;

    this.dragManager = new DragManager({
      boardEl: this.boardEl,
      noteManager: this.noteManager,
      getReadOnly: isLocked,
      getSelection: () => this.selectionManager.getSelection(),
      toBoardPoint: (clientX, clientY) => this.view.clientToBoard(clientX, clientY),
      onDragStart: () => {
        this.notePopup.hide();
        this.noteDragged = true;
        this.historyManager.beginBatch();
      },
      onDragEnd: (noteId) => {
        this.historyManager.endBatch();
        // Only auto-select the dragged note if it wasn't part of a group drag
        const sel = this.selectionManager.getSelection();
        if (!sel.includes(noteId)) {
          this.selectionManager.select([noteId]);
        }
        this.updateNotePopup();
      },
    });

    // Anchor drag for edge creation (blocked in readOnly and viewOnly)
    this.anchorDragManager = new AnchorDragManager({
      boardEl: this.boardEl,
      svgEl: this.svgEl,
      noteManager: this.noteManager,
      edgeManager: this.edgeManager,
      emitter: this.emitter,
      getReadOnly: isRestricted,
      toBoardPoint: (clientX, clientY) => this.view.clientToBoard(clientX, clientY),
      onDropOnEmpty: (x, y, fromNoteId) => {
        const newNote = this.noteManager.addNote({
          x: x - this.defaultNoteWidth / 2,
          y: y - this.defaultNoteHeight / 2,
        });
        this.edgeManager.addEdge(fromNoteId, newNote.id, {
          fromAnchor: 'auto',
          toAnchor: 'auto',
        });
      },
    });

    this.resizeManager = new ResizeManager({
      boardEl: this.boardEl,
      noteManager: this.noteManager,
      getReadOnly: isRestricted,
      toBoardPoint: (clientX, clientY) => this.view.clientToBoard(clientX, clientY),
      onResizeStart: () => { this.historyManager.beginBatch(); },
      onResizeEnd: () => { this.historyManager.endBatch(); },
      // A double click on the handle of a selected note fits the whole selection
      onDoublePress: (noteId) => {
        const selection = this.selectionManager.getSelection();
        this.resizeNotesToContent(selection.includes(noteId) ? selection : [noteId]);
      },
    });

    this.edgePopup = new EdgeStylePopup({
      boardEl: this.boardEl,
      view: this.view,
      edgeManager: this.edgeManager,
      noteManager: this.noteManager,
      labels: this.labels,
      onDelete: (edgeId) => {
        this.edgeManager.deselectEdge();
        this.edgeManager.deleteEdge(edgeId);
      },
    });

    this.notePopup = new NoteStylePopup({
      boardEl: this.boardEl,
      noteManager: this.noteManager,
      labels: this.labels,
      toScreen: (x, y) => this.view.boardToScreen(x, y),
      onColorChange: (noteId, color) => {
        this.noteManager.updateNote(noteId, { color });
      },
      onMultiColorChange: (noteIds, color) => {
        for (const id of noteIds) {
          this.noteManager.updateNote(id, { color });
        }
      },
      onDuplicate: (noteId) => {
        const note = this.noteManager.getNote(noteId);
        if (!note) return;
        const newNote = this.noteManager.addNote({
          x: note.x + 20,
          y: note.y + 20,
          width: note.width,
          height: note.height,
          text: note.text,
          color: note.color,
          ...(note.autoSize ? { autoSize: true } : {}),
          ...(note.foldable ? { foldable: true } : {}),
        });
        this.selectionManager.select([newNote.id]);
        this.notePopup.show(newNote.id);
      },
      onDelete: (noteId) => {
        this.deleteNote(noteId);
      },
      onMultiDelete: (noteIds) => {
        for (const id of noteIds) {
          this.deleteNote(id);
        }
      },
      onInsertImage: (noteId) => {
        this.insertImageIntoNote(noteId);
      },
      onInsertEmbed: (noteId) => {
        this.showEmbedInput(noteId);
      },
      onAutoSizeToggle: (noteId) => {
        const note = this.noteManager.getNote(noteId);
        if (!note) return;
        this.noteManager.updateNote(noteId, { autoSize: !note.autoSize });
        this.notePopup.show(noteId);
      },
      onMultiAutoSizeToggle: (noteIds) => {
        const notes = this.getNotesByIds(noteIds);
        const allAutoSize = notes.every((n) => n.autoSize);
        for (const id of noteIds) {
          this.noteManager.updateNote(id, { autoSize: !allAutoSize });
        }
        this.notePopup.showMulti(noteIds);
      },
      onFoldableToggle: (noteIds) => {
        const foldable = !this.getNotesByIds(noteIds).every((n) => n.foldable);
        this.batch(() => {
          for (const id of noteIds) this.noteManager.updateNote(id, { foldable });
        });
        this.updateNotePopup();
      },
    });

    this.richTextToolbar = new RichTextToolbar({
      boardEl: this.boardEl,
      labels: this.labels,
      readOnly: this.readOnly,
      viewOnly: this.viewOnly,
    });

    // Initialize history manager for undo/redo
    this.historyManager = new HistoryManager(this.emitter, this.createReplay('local'));

    // Update edges in real-time during note drag
    this.emitter.on('note:update', ({ note }) => {
      this.edgeManager.updateEdgesOf(note.id);
    });

    // What viewOnly restores on exit must follow the remote state
    this.emitter.on('note:create', ({ note, origin }) => {
      if (origin === 'remote') this.positionSnapshot?.set(note.id, { x: note.x, y: note.y });
    });
    this.emitter.on('note:update', ({ note, prev, origin }) => {
      const snap = origin === 'remote' ? this.positionSnapshot?.get(note.id) : undefined;
      if (!snap) return;
      if (note.x !== prev.x) snap.x = note.x;
      if (note.y !== prev.y) snap.y = note.y;
    });
    this.emitter.on('edge:create', ({ edge, origin }) => {
      if (origin === 'remote') this.collapsedEdgeSnapshot?.set(edge.id, !!edge.collapsed);
    });
    this.emitter.on('edge:update', ({ edge, prev, origin }) => {
      if (origin === 'remote' && edge.collapsed !== prev.collapsed) {
        this.collapsedEdgeSnapshot?.set(edge.id, !!edge.collapsed);
      }
    });

    // Recompute visibility on any structural change
    this.emitter.on('edge:create', () => this.recomputeVisibility());
    this.emitter.on('edge:update', () => this.recomputeVisibility());
    this.emitter.on('edge:delete', () => this.recomputeVisibility());
    this.emitter.on('note:create', ({ note }) => {
      // A newly created note joins the filter, so it does not vanish the
      // moment it is created. A note that is replayed (a remote change, or
      // one coming back from undo/redo) does not: the filter stays as set.
      if (!this.historyManager.isReplaying()) this.noteFilter?.add(note.id);
      this.recomputeVisibility();
    });
    this.emitter.on('note:delete', () => this.recomputeVisibility());

    // Coalesce change events via microtask
    this.emitter.on('note:create', () => this.scheduleChange());
    this.emitter.on('note:update', () => this.scheduleChange());
    this.emitter.on('note:delete', () => this.scheduleChange());
    this.emitter.on('edge:create', () => this.scheduleChange());
    this.emitter.on('edge:update', () => this.scheduleChange());
    this.emitter.on('edge:delete', () => this.scheduleChange());

    // Double-click to create note
    this.handleDblClick = (e: MouseEvent) => {
      // Only on an empty area of the board, not on a note or a popup
      const target = e.target as HTMLElement;
      if (target.closest(`.wema-note, ${OVERLAY_SELECTOR}`)) return;

      const createsNote = !this.readOnly && !this.viewOnly && (options.createOnDblClick ?? true);
      if (createsNote) {
        this.addNote(this.view.clientToBoard(e.clientX, e.clientY));
        return;
      }

      // Where a double click creates nothing, it brings that point to the center
      const current = this.view.get();
      const clicked = this.view.clientToScreen(e.clientX, e.clientY);
      const center = this.view.screenCenter();
      this.panWithinLimit({ x: current.x + center.x - clicked.x, y: current.y + center.y - clicked.y });
    };
    this.boardEl.addEventListener('dblclick', this.handleDblClick);

    // Delete key to remove selected notes or selected edge
    this.handleKeyDown = (e: KeyboardEvent) => {
      // Undo/Redo shortcuts (work even in readOnly/viewOnly is debatable, but only when not editing text)
      if ((e.ctrlKey || e.metaKey) && !this.readOnly && !this.viewOnly) {
        const inEditable = (e.target as HTMLElement).closest(TYPING_SELECTOR);
        if (!inEditable) {
          if (e.key === 'z' && !e.shiftKey) {
            e.preventDefault();
            this.undo();
            return;
          }
          if ((e.key === 'z' && e.shiftKey) || e.key === 'y') {
            e.preventDefault();
            this.redo();
            return;
          }
        }
      }

      if (this.readOnly || this.viewOnly) return;
      if (e.key === 'Delete' || e.key === 'Backspace') {
        // Don't delete notes when editing text
        if ((e.target as HTMLElement).closest(TYPING_SELECTOR)) return;

        // Delete selected edge first
        const selectedEdge = this.edgeManager.getSelectedEdge();
        if (selectedEdge) {
          this.edgeManager.deleteEdge(selectedEdge);
          return;
        }

        // Delete selected notes (and their connected edges)
        const selected = this.selectionManager.getSelection();
        this.notePopup.hide();
        for (const id of selected) {
          this.deleteNote(id);
        }
      }
    };
    this.boardEl.addEventListener('keydown', this.handleKeyDown);

    // Click on board: select note, select edge, or deselect
    this.handleBoardClick = (e: MouseEvent) => {
      // After a pan, rubberband drag or note drag, skip the click that follows pointerup
      if (this.panMoved) {
        this.panMoved = false;
        return;
      }
      if (this.rubberBandMoved) {
        this.rubberBandMoved = false;
        return;
      }
      if (this.noteDragged) {
        this.noteDragged = false;
        return;
      }

      // Don't handle clicks from popups or toolbar
      if ((e.target as HTMLElement).closest(OVERLAY_SELECTOR)) return;

      if (this.readOnly) return;

      // Check if an edge was clicked (via hit test)
      const hitEdgeId = !this.viewOnly ? this.edgeManager.hitTest(e.clientX, e.clientY) : null;
      if (hitEdgeId) {
        this.selectionManager.clear();
        this.notePopup.hide();
        this.edgeManager.selectEdge(hitEdgeId);
        this.edgePopup.show(hitEdgeId, e.clientX, e.clientY);
        this.boardEl.focus();
        return;
      }

      // Deselect edge and hide edge popup
      this.edgeManager.deselectEdge();
      this.edgePopup.hide();

      const noteEl = (e.target as HTMLElement).closest('.wema-note') as HTMLElement | null;
      if (noteEl) {
        const noteId = noteEl.dataset.noteId;
        if (noteId) {
          if (e.shiftKey) {
            this.selectionManager.addToSelection([noteId]);
          } else if (e.ctrlKey || e.metaKey) {
            this.selectionManager.toggleSelection(noteId);
          } else {
            this.selectionManager.select([noteId]);
          }
          this.noteManager.bringToFront(noteId);
          this.updateNotePopup();
        }
      } else {
        this.selectionManager.clear();
        this.notePopup.hide();
      }
      // Ensure board has focus for keyboard shortcuts (Delete key etc.)
      const active = document.activeElement;
      if (!active || !active.closest(TYPING_SELECTOR)) {
        this.boardEl.focus();
      }
    };
    this.boardEl.addEventListener('click', this.handleBoardClick);

    // Rubberband selection on empty area drag
    this.handleRubberBandDown = (e: PointerEvent) => {
      if (e.button !== 0) return;
      if (this.readOnly) return;
      if (this.pan) return; // this drag pans the board instead
      // Only start rubberband from empty board area (not notes, anchors, handles, toolbars)
      if ((e.target as HTMLElement).closest(`.wema-note, ${OVERLAY_SELECTOR}`)) return;

      const { x, y } = this.view.clientToBoard(e.clientX, e.clientY);

      this.selectionManager.startRubberBand(x, y);
      this.boardEl.setPointerCapture(e.pointerId);
      this.boardEl.addEventListener('pointermove', this.handleRubberBandMove);
      this.boardEl.addEventListener('pointerup', this.handleRubberBandUp);
    };

    this.handleRubberBandMove = (e: PointerEvent) => {
      if (!this.selectionManager.isRubberBandActive()) return;
      this.rubberBandMoved = true;
      const { x, y } = this.view.clientToBoard(e.clientX, e.clientY);
      this.selectionManager.updateRubberBand(x, y);
    };

    this.handleRubberBandUp = (e: PointerEvent) => {
      this.boardEl.removeEventListener('pointermove', this.handleRubberBandMove);
      this.boardEl.removeEventListener('pointerup', this.handleRubberBandUp);
      try {
        this.boardEl.releasePointerCapture(e.pointerId);
      } catch {
        // may already be released
      }
      this.selectionManager.endRubberBand();
      this.updateNotePopup();
    };

    this.boardEl.addEventListener('pointerdown', this.handleRubberBandDown);

    // --- Pan ---
    // Registered in the capture phase, so a pan started over a note wins over
    // the note's own drag.
    this.handlePanDown = (e: PointerEvent) => {
      if (!this.wantsPan(e)) return;
      e.preventDefault();
      e.stopPropagation();
      this.pan = {
        pointerId: e.pointerId,
        startX: e.clientX,
        startY: e.clientY,
        lastX: e.clientX,
        lastY: e.clientY,
        moved: false,
      };
      this.boardEl.classList.add('wema-panning');
      this.boardEl.setPointerCapture(e.pointerId);
      this.boardEl.addEventListener('pointermove', this.handlePanMove);
      this.boardEl.addEventListener('pointerup', this.handlePanUp);
      this.boardEl.addEventListener('pointercancel', this.handlePanUp);
    };

    this.handlePanMove = (e: PointerEvent) => {
      if (!this.pan || e.pointerId !== this.pan.pointerId) return;
      const dx = e.clientX - this.pan.startX;
      const dy = e.clientY - this.pan.startY;
      if (Math.abs(dx) >= DRAG_THRESHOLD || Math.abs(dy) >= DRAG_THRESHOLD) this.pan.moved = true;
      // Moved by the distance since the last event, so that a zoom in the
      // middle of the drag (which also moves the viewport) is not undone
      const current = this.view.get();
      this.panWithinLimit({ x: current.x + e.clientX - this.pan.lastX, y: current.y + e.clientY - this.pan.lastY });
      this.pan.lastX = e.clientX;
      this.pan.lastY = e.clientY;
    };

    this.handlePanUp = (e: PointerEvent) => {
      if (!this.pan || e.pointerId !== this.pan.pointerId) return;
      this.boardEl.removeEventListener('pointermove', this.handlePanMove);
      this.boardEl.removeEventListener('pointerup', this.handlePanUp);
      this.boardEl.removeEventListener('pointercancel', this.handlePanUp);
      try {
        this.boardEl.releasePointerCapture(e.pointerId);
      } catch {
        // may already be released
      }
      // Only a left-button drag that ends normally is followed by a click that
      // must be skipped (a cancelled one is not: the flag would eat the next click)
      this.panMoved = this.pan.moved && e.type === 'pointerup' && e.button === 0;
      this.pan = null;
      this.boardEl.classList.remove('wema-panning');
    };

    // Hold Space to pan with a left drag. Decided by where the pointer is, not
    // by focus: the board does not always have focus (right after loading,
    // after a click on the host's own buttons, in readOnly), and a key state
    // tied to focus is lost when focus moves while the key is down.
    this.handlePointerEnter = () => { this.pointerInside = true; };
    this.handlePointerLeave = () => { this.pointerInside = false; };
    this.handleSpaceDown = (e: KeyboardEvent) => {
      if (e.code !== 'Space' || e.ctrlKey || e.metaKey || e.altKey) return;
      if (!this.pointerInside) return;
      // Space belongs to whatever is being typed in or activated
      if (document.activeElement?.closest(`${TYPING_SELECTOR}, button`)) return;
      e.preventDefault();
      this.setSpaceHeld(true);
    };
    this.handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') this.setSpaceHeld(false);
    };
    this.handleBlur = () => this.setSpaceHeld(false);

    this.handleWheel = (e: WheelEvent) => {
      const target = e.target as HTMLElement;
      // deltaMode: 0 = pixels, 1 = lines, 2 = pages
      const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? this.boardEl.clientHeight : 1;
      const current = this.view.get();

      // Ctrl / Cmd + wheel, which is also what a trackpad pinch arrives as, zooms.
      // Also over a popup: otherwise the browser would zoom the whole page there.
      if (e.ctrlKey || e.metaKey) {
        if (!this.wheelZoom) return;
        e.preventDefault();
        // One wheel notch is about 100 pixels and a pinch sends many small
        // deltas: cap a single event so that neither jumps
        const delta = Math.max(-WHEEL_ZOOM_MAX_DELTA, Math.min(WHEEL_ZOOM_MAX_DELTA, e.deltaY * unit));
        this.panWithinLimit(this.zoomedAround(current.zoom * Math.pow(2, -delta * WHEEL_ZOOM_RATE), e));
        return;
      }

      if (!this.wheelPan) return;
      if (target.closest(OVERLAY_SELECTOR)) return;
      // A note whose content scrolls keeps the wheel for itself
      const content = target.closest('.wema-note-content, .wema-note-custom');
      if (content && content.scrollHeight > content.clientHeight) return;

      e.preventDefault();
      let dx = e.deltaX * unit;
      let dy = e.deltaY * unit;
      if (e.shiftKey && dx === 0) {
        dx = dy;
        dy = 0;
      }
      this.panWithinLimit({ x: current.x - dx, y: current.y - dy });
    };

    this.boardEl.addEventListener('pointerdown', this.handlePanDown, true);
    this.boardEl.addEventListener('pointerenter', this.handlePointerEnter);
    this.boardEl.addEventListener('pointerleave', this.handlePointerLeave);
    document.addEventListener('keydown', this.handleSpaceDown);
    document.addEventListener('keyup', this.handleKeyUp);
    window.addEventListener('blur', this.handleBlur);
    this.boardEl.addEventListener('wheel', this.handleWheel, { passive: false });

    // Import initial data if provided
    if (options.data) {
      this.importData(options.data);
    }

    // Apply initial viewOnly state
    if (this.viewOnly) {
      this.enterViewOnly();
    }
  }

  /** Clean up all resources */
  destroy(): void {
    this.boardEl.removeEventListener('dblclick', this.handleDblClick);
    this.boardEl.removeEventListener('keydown', this.handleKeyDown);
    this.boardEl.removeEventListener('click', this.handleBoardClick);
    this.boardEl.removeEventListener('pointerdown', this.handleRubberBandDown);
    this.boardEl.removeEventListener('pointermove', this.handleRubberBandMove);
    this.boardEl.removeEventListener('pointerup', this.handleRubberBandUp);
    this.boardEl.removeEventListener('pointerdown', this.handlePanDown, true);
    this.boardEl.removeEventListener('pointermove', this.handlePanMove);
    this.boardEl.removeEventListener('pointerup', this.handlePanUp);
    this.boardEl.removeEventListener('pointercancel', this.handlePanUp);
    this.boardEl.removeEventListener('pointerenter', this.handlePointerEnter);
    this.boardEl.removeEventListener('pointerleave', this.handlePointerLeave);
    document.removeEventListener('keydown', this.handleSpaceDown);
    document.removeEventListener('keyup', this.handleKeyUp);
    window.removeEventListener('blur', this.handleBlur);
    this.boardEl.removeEventListener('wheel', this.handleWheel);
    this.noteManager.destroy();
    this.dragManager.destroy();
    this.anchorDragManager.destroy();
    this.resizeManager.destroy();
    this.edgePopup.destroy();
    this.notePopup.destroy();
    this.richTextToolbar.destroy();
    this.historyManager.destroy();
    this.selectionManager.destroy();
    this.edgeManager.destroy();
    this.emitter.removeAllListeners();
    this.boardEl.remove();
  }

  // --- Notes ---

  /** Add a new note to the board */
  addNote(params?: Partial<Omit<WemaNote, 'id'>>): WemaNote {
    if (this.readOnly || this.viewOnly) return undefined as never;
    // Without a position, the note goes near the top-left of what is shown
    // (not of the board, which may be panned out of view)
    const origin = this.view.screenToBoard(0, 0);
    return this.noteManager.addNote({ ...params, x: params?.x ?? origin.x + 100, y: params?.y ?? origin.y + 100 });
  }

  /** Update an existing note */
  updateNote(id: NoteId, params: Partial<WemaNote>): void {
    if (this.readOnly) return;
    this.noteManager.updateNote(id, params);
  }

  /** Delete a note from the board, including connected edges */
  deleteNote(id: NoteId): void {
    if (this.readOnly || this.viewOnly) return;
    this.removeNote(id);
  }

  /** Get a note by ID */
  getNote(id: NoteId): WemaNote | undefined {
    return this.noteManager.getNote(id);
  }

  /**
   * Call the `renderNote` option for a note again. Use it when what you draw
   * in the note depends on something outside the note's data and that changed.
   * (A change of the note's `text` or `meta` draws it again by itself.)
   * Changes nothing in the data: no event, no history. Also works in
   * readOnly and viewOnly.
   */
  refreshNote(id: NoteId): void {
    // The popup offers text formatting only for notes that show their text.
    // It is not rebuilt otherwise: that would drop what the user is typing in it.
    if (this.noteManager.refresh(id)) this.updateNotePopup();
  }

  /**
   * Resize notes once to the size their content takes: the size each would
   * have as an autoSize note (as wide as its longest line, up to the maximum
   * width of an autoSize note, and as tall as its lines). `autoSize` is not
   * changed, so the notes keep that size when their content changes later.
   *
   * All the notes are resized as one undo step. A note that is autoSize
   * already, hidden, or the right size already is left as it is.
   * Does nothing in readOnly and viewOnly.
   */
  resizeNotesToContent(noteIds: NoteId[]): void {
    if (this.readOnly || this.viewOnly) return;
    this.batch(() => {
      for (const id of noteIds) this.noteManager.resizeToContent(id);
    });
    this.updateNotePopup();
  }

  /** Get all notes */
  getNotes(): WemaNote[] {
    return this.noteManager.getNotes();
  }

  // --- Edges ---

  /** Add an edge between two notes */
  addEdge(from: NoteId, to: NoteId, params?: Partial<Omit<WemaEdge, 'id' | 'from' | 'to'>>): WemaEdge {
    if (this.readOnly || this.viewOnly) return undefined as never;
    return this.edgeManager.addEdge(from, to, params);
  }

  /** Get the currently selected edge ID, or null */
  getSelectedEdge(): EdgeId | null {
    return this.edgeManager.getSelectedEdge();
  }

  /** Update an existing edge's properties */
  updateEdge(id: EdgeId, params: Partial<Omit<WemaEdge, 'id' | 'from' | 'to'>>): void {
    if (this.readOnly || this.viewOnly) return;
    this.edgeManager.updateEdge(id, params);
  }

  /** Delete an edge */
  deleteEdge(id: EdgeId): void {
    if (this.readOnly || this.viewOnly) return;
    this.edgeManager.deleteEdge(id);
  }

  /** Get all edges */
  getEdges(): WemaEdge[] {
    return this.edgeManager.getEdges();
  }

  /** Get edges connected to a note */
  getEdgesOf(noteId: NoteId): WemaEdge[] {
    return this.edgeManager.getEdgesOf(noteId);
  }

  // --- Selection ---

  /** Update the note popup to match the current selection state */
  private updateNotePopup(): void {
    if (this.viewOnly) return;
    const sel = this.selectionManager.getSelection();
    if (sel.length === 1) {
      this.notePopup.show(sel[0]);
    } else if (sel.length >= 2) {
      this.notePopup.showMulti(sel);
    } else {
      this.notePopup.hide();
    }
  }

  /** Select notes by IDs */
  select(noteIds: NoteId[]): void {
    this.selectionManager.select(noteIds);
  }

  /** Select all notes */
  selectAll(): void {
    this.selectionManager.selectAll();
    this.updateNotePopup();
  }

  /** Get currently selected note IDs */
  getSelection(): NoteId[] {
    return this.selectionManager.getSelection();
  }

  // --- Filter ---

  /**
   * Show only the given notes; pass null to show all notes again.
   * Hidden notes, and the edges connected to them, stay in the data: no
   * note/edge event is emitted, nothing is recorded in the undo history and
   * `exportData()` still returns everything. Hidden notes cannot be selected.
   * Works in readOnly and viewOnly, and combines with collapsed edges.
   * A note added later by this board joins the filter; a note added by
   * `applyRemote()` stays hidden until the filter is set again.
   */
  setNoteFilter(noteIds: NoteId[] | null): void {
    this.noteFilter = noteIds ? new Set(noteIds) : null;
    this.recomputeVisibility();
  }

  /** Get the IDs of the notes shown by the filter, or null when no filter is set */
  getNoteFilter(): NoteId[] | null {
    return this.noteFilter ? Array.from(this.noteFilter) : null;
  }

  // --- Viewport ---

  /** Get which part of the board is shown */
  getViewport(): WemaViewport {
    return this.view.get();
  }

  /**
   * Move the viewport and set its zoom. Display state only: note positions do
   * not change, no note/edge event or `change` is emitted and nothing is
   * recorded in the undo history; `viewport:change` is emitted. Works in
   * readOnly and viewOnly. `zoom` is kept within `minZoom` / `maxZoom`.
   * To zoom around a point on screen, use `zoomTo()`: a `zoom` given here
   * without `x` / `y` scales around the origin of the board coordinates.
   */
  setViewport(viewport: Partial<WemaViewport>): void {
    if (!this.view.set(viewport)) return;

    // Overlays live in screen space: put them back over what they belong to
    this.notePopup.updatePosition();
    this.edgePopup.updatePosition();
    this.richTextToolbar.updatePosition();
    this.noteManager.updateOverlayPosition();
    this.placeEmbedInput();

    this.emitter.emit('viewport:change', this.getViewport());
  }

  /**
   * Set the zoom (1 = actual size), keeping the board point under `center`
   * where it is on screen. Without `center`, the middle of the board stays.
   * The zoom is kept within `minZoom` / `maxZoom`. Display state only, like
   * `setViewport()`.
   */
  zoomTo(zoom: number, center?: WemaClientPoint): void {
    this.setViewport(this.zoomedAround(zoom, center));
  }

  /** The viewport at `zoom` that keeps the board point under `center` (default: the middle of the board) in place */
  private zoomedAround(zoom: number, center?: WemaClientPoint): WemaViewport {
    const current = this.view.get();
    const next = this.view.clampZoom(zoom);
    const fixed = center ? this.view.clientToScreen(center.clientX, center.clientY) : this.view.screenCenter();
    const ratio = next / current.zoom;
    return {
      x: fixed.x - (fixed.x - current.x) * ratio,
      y: fixed.y - (fixed.y - current.y) * ratio,
      zoom: next,
    };
  }

  /**
   * Move the viewport as a user gesture (wheel, drag, double click) asks,
   * but not further than `panMargin` away from the shown notes, so that the
   * user does not get lost in an empty part of the board. Along each axis the
   * empty space beyond the notes is at most `panMargin` screen pixels; notes
   * that fit in the board may be put anywhere inside it. Not applied to the
   * API (`setViewport()` and the others move exactly where they are told).
   */
  private panWithinLimit(target: { x: number; y: number; zoom?: number }): void {
    // Without a limit there is no need to walk the notes for their bounds
    const bounds = Number.isFinite(this.panMargin) ? this.visibleBounds() : null;
    if (!bounds) {
      this.setViewport(target);
      return;
    }
    const current = this.view.get();
    const zoom = target.zoom ?? current.zoom;
    const margin = this.panMargin;
    // A viewport that is already outside (the notes changed, or the API put
    // it there) does not jump back: it just cannot move further away. A
    // change of zoom moves everything anyway, so there the limit is applied as is.
    const lenient = zoom === current.zoom;
    const limit = (wanted: number, held: number, start: number, end: number, size: number): number => {
      let min = Math.min(size - margin - end * zoom, -start * zoom);
      let max = Math.max(margin - start * zoom, size - end * zoom);
      if (lenient) {
        min = Math.min(min, held);
        max = Math.max(max, held);
      }
      // "+ 0" turns a -0 from the arithmetic above into 0
      return Math.min(Math.max(wanted, min), max) + 0;
    };
    this.setViewport({
      x: limit(target.x, current.x, bounds.left, bounds.right, this.boardEl.clientWidth),
      y: limit(target.y, current.y, bounds.top, bounds.bottom, this.boardEl.clientHeight),
      zoom,
    });
  }

  /**
   * Pan just enough to bring the given notes into view, without changing the
   * zoom. Notes that are hidden (by the filter or a collapsed edge) are left
   * out. If the notes do not fit, their top-left corner is shown.
   */
  revealNotes(noteIds: NoteId[], options?: WemaViewportMoveOptions): void {
    const padding = options?.padding ?? 24;
    this.moveToNotes(noteIds, padding, (start, end, size) => {
      if (start < padding) return padding;
      if (end > size - padding) return size - padding - (end - start);
      return start;
    });
  }

  /**
   * Pan so that all shown notes (or `options.noteIds`) are in the middle of
   * the board, without changing the zoom. If they do not fit, their top-left
   * corner is shown. Notes that are hidden (by the filter or a collapsed
   * edge) are left out.
   */
  centerContent(options?: WemaCenterOptions): void {
    this.moveToNotes(options?.noteIds, options?.padding ?? 24, centerInBoard);
  }

  /**
   * Zoom and pan so that all shown notes (or `options.noteIds`) fit in the
   * board, in the middle. The zoom is not raised above `options.maxZoom`
   * (default: 1) and stays within the board's `minZoom` / `maxZoom`; if the
   * notes do not fit even at `minZoom`, their top-left corner is shown. Notes
   * that are hidden (by the filter or a collapsed edge) are left out.
   */
  fitToContent(options?: WemaFitOptions): void {
    const padding = options?.padding ?? 24;
    this.moveToNotes(options?.noteIds, padding, centerInBoard, (boxWidth, boxHeight, width, height) =>
      Math.min(
        Math.max(width - padding * 2, 1) / Math.max(boxWidth, 1),
        Math.max(height - padding * 2, 1) / Math.max(boxHeight, 1),
        options?.maxZoom ?? 1,
      ));
  }

  /**
   * Move the viewport so that the box around the given notes lands where
   * `place` says. `place` works on one axis in screen pixels: it gets the box
   * as [start, end] and the board's size, and returns where `start` should be.
   * A box too large to fit (with `padding` on both sides) is put at `padding`.
   * `zoomFor` picks the zoom from the box's size in board coordinates and the
   * board's size on screen; without it the zoom stays.
   */
  private moveToNotes(
    noteIds: NoteId[] | undefined,
    padding: number,
    place: (start: number, end: number, size: number) => number,
    zoomFor?: (boxWidth: number, boxHeight: number, width: number, height: number) => number,
  ): void {
    const bounds = this.visibleBounds(noteIds);
    const width = this.boardEl.clientWidth;
    const height = this.boardEl.clientHeight;
    if (!bounds || width === 0 || height === 0) return;

    const current = this.view.get();
    const zoom = zoomFor
      ? this.view.clampZoom(zoomFor(bounds.right - bounds.left, bounds.bottom - bounds.top, width, height))
      : current.zoom;
    // Where the box is on screen at that zoom before moving, then how far to move it
    const offset = (boxStart: number, boxEnd: number, origin: number, size: number): number => {
      const start = boxStart * zoom + origin;
      const end = boxEnd * zoom + origin;
      return origin + (end - start + padding * 2 > size ? padding : place(start, end, size)) - start;
    };
    this.setViewport({
      x: offset(bounds.left, bounds.right, current.x, width),
      y: offset(bounds.top, bounds.bottom, current.y, height),
      zoom,
    });
  }

  /** Bounding box, in board coordinates, of the shown notes among `noteIds` (default: all) */
  private visibleBounds(noteIds?: NoteId[]): { left: number; top: number; right: number; bottom: number } | null {
    const ids = noteIds ? new Set(noteIds) : null;
    const notes = this.noteManager.getNotes()
      .filter((note) => (!ids || ids.has(note.id)) && !this.hiddenNoteIds.has(note.id));
    if (notes.length === 0) return null;
    return {
      left: Math.min(...notes.map((n) => n.x)),
      top: Math.min(...notes.map((n) => n.y)),
      right: Math.max(...notes.map((n) => n.x + n.width)),
      bottom: Math.max(...notes.map((n) => n.y + n.height)),
    };
  }

  /** Whether this pointerdown starts a pan rather than a selection or a note drag */
  private wantsPan(e: PointerEvent): boolean {
    const target = e.target as HTMLElement;
    if (target.closest(OVERLAY_SELECTOR)) return false;
    if (e.button === 1) return true; // middle button, anywhere
    if (e.button !== 0) return false;
    if (this.spaceHeld) return true; // Space + drag, anywhere
    // With nothing to select or edit on an empty area, a plain drag pans.
    // In viewOnly, Shift + drag still starts a rubberband selection.
    const onEmptyArea = !target.closest('.wema-note');
    return onEmptyArea && (this.readOnly || (this.viewOnly && !e.shiftKey));
  }

  private setSpaceHeld(held: boolean): void {
    this.spaceHeld = held;
    this.boardEl.classList.toggle('wema-pan-ready', held);
  }

  // --- Layout ---

  /** Align selected notes */
  alignNotes(noteIds: NoteId[], alignment: NoteAlignment): void {
    if (this.readOnly || this.viewOnly) return;
    this.applyPositions(computeAlignment(this.getNotesByIds(noteIds), alignment));
  }

  /** Distribute notes evenly */
  distributeNotes(noteIds: NoteId[], direction: DistributeDirection): void {
    if (this.readOnly || this.viewOnly) return;
    this.applyPositions(computeDistribution(this.getNotesByIds(noteIds), direction));
  }

  /** Auto-layout the given notes (default: all notes, or the notes shown by the filter) */
  autoLayout(noteIds?: NoteId[]): void {
    if (this.readOnly || this.viewOnly) return;
    const targetIds = noteIds ?? this.getNoteFilter() ?? undefined;
    this.applyPositions(
      computeAutoLayout(this.noteManager.getNotes(), this.edgeManager.getEdges(), { noteIds: targetIds }),
    );
  }

  private getNotesByIds(noteIds: NoteId[]): WemaNote[] {
    return noteIds.map((id) => this.noteManager.getNote(id)).filter((n) => n != null);
  }

  private applyPositions(positions: NotePosition[]): void {
    for (const { id, x, y } of positions) {
      this.noteManager.updateNote(id, { x, y });
    }
    this.updateNotePopup();
  }

  // --- History ---

  /**
   * Run `fn` and record every change it makes as one undo step
   * (one `history:commit`). `fn` must be synchronous.
   */
  batch<T>(fn: () => T, options?: WemaBatchOptions): T {
    this.historyManager.beginBatch(options?.origin);
    try {
      return fn();
    } finally {
      this.historyManager.endBatch();
    }
  }

  /**
   * Apply changes made elsewhere (another client, a server).
   * Works in readOnly/viewOnly, is not recorded in the undo history and does
   * not emit `history:commit`. The resulting note/edge events carry
   * `origin: 'remote'`. Deltas whose target no longer exists are skipped.
   */
  applyRemote(deltas: HistoryDelta[]): void {
    // Recompute collapse visibility once, not once per delta
    this.visibilitySuspended = true;
    try {
      this.historyManager.withoutRecording(() => replayDeltas(deltas, this.createReplay('remote')));
    } finally {
      this.visibilitySuspended = false;
      this.recomputeVisibility();
    }

    if (!this.edgeManager.getSelectedEdge()) this.edgePopup.hide();
    this.updateNotePopup();
  }

  /** Callbacks that apply deltas to the board, emitting events with the given origin */
  private createReplay(origin: ChangeOrigin): ReplayCallbacks {
    return {
      addNoteWithId: (note) => { this.noteManager.addNoteWithId(note, origin); },
      updateNote: (id, params) => { this.noteManager.replayUpdate(id, params, origin); },
      deleteNote: (id) => { this.removeNote(id, origin); },
      addEdgeWithId: (edge) => { this.edgeManager.addEdgeWithId(edge, origin); },
      updateEdge: (id, params) => { this.edgeManager.updateEdge(id, params, origin); },
      deleteEdge: (id) => { this.edgeManager.deleteEdge(id, origin); },
    };
  }

  /** Delete a note together with its connected edges, regardless of mode */
  private removeNote(id: NoteId, origin: ChangeOrigin = 'local'): void {
    for (const edge of this.edgeManager.getEdgesOf(id)) {
      this.edgeManager.deleteEdge(edge.id, origin);
    }
    this.selectionManager.deselect(id);
    this.noteManager.deleteNote(id, origin);
  }

  /** Undo the last operation (not available in viewOnly, where positions are temporary) */
  undo(): void {
    if (this.viewOnly) return;
    this.notePopup.hide();
    this.edgePopup.hide();
    this.selectionManager.clear();
    this.historyManager.undo();
  }

  /** Redo the last undone operation (not available in viewOnly, where positions are temporary) */
  redo(): void {
    if (this.viewOnly) return;
    this.notePopup.hide();
    this.edgePopup.hide();
    this.selectionManager.clear();
    this.historyManager.redo();
  }

  /** Whether undo is available */
  canUndo(): boolean {
    return this.historyManager.canUndo();
  }

  /** Whether redo is available */
  canRedo(): boolean {
    return this.historyManager.canRedo();
  }

  // --- Data ---

  /** Export board data as a serializable object */
  exportData(): WemaBoardData {
    const data: WemaBoardData = {
      version: 1,
      notes: this.noteManager.getNotesWithLiveText(),
      edges: this.edgeManager.getEdges(),
    };
    return JSON.parse(JSON.stringify(data));
  }

  /** Import board data, replacing all current content (this also clears the note filter) */
  importData(data: WemaBoardData): void {
    this.noteFilter = null;
    this.selectionManager.clear();
    this.edgeManager.clear();
    this.noteManager.renderAll(data.notes);
    if (data.edges) {
      this.edgeManager.renderAll(data.edges);
    }
    this.historyManager.clear();
    // What viewOnly restores on exit is now the imported data, not what it replaced
    if (this.viewOnly) this.snapshotForViewOnly();
    this.recomputeVisibility();
  }

  // --- Events ---

  /** Register an event handler */
  on<K extends keyof WemaEventMap>(event: K, handler: (payload: WemaEventMap[K]) => void): void {
    this.emitter.on(event, handler);
  }

  /** Remove an event handler */
  off<K extends keyof WemaEventMap>(event: K, handler: (payload: WemaEventMap[K]) => void): void {
    this.emitter.off(event, handler);
  }

  // --- ReadOnly ---

  /** Set the board's read-only state at runtime */
  setReadOnly(readOnly: boolean): void {
    if (this.readOnly === readOnly) return;
    this.readOnly = readOnly;
    this.noteManager.setReadOnly(readOnly);
    this.richTextToolbar.setReadOnly(readOnly);
    if (readOnly) {
      this.boardEl.classList.add('wema-readonly');
      this.selectionManager.clear();
      this.notePopup.hide();
      this.edgePopup.hide();
    } else {
      this.boardEl.classList.remove('wema-readonly');
    }
    this.emitter.emit('readOnly:change', { readOnly });
    this.recomputeVisibility();
  }

  /** Check if the board is read-only */
  isReadOnly(): boolean {
    return this.readOnly;
  }

  // --- ViewOnly ---

  /** Set the board's view-only state at runtime */
  setViewOnly(viewOnly: boolean): void {
    if (this.viewOnly === viewOnly) return;
    this.viewOnly = viewOnly;
    this.richTextToolbar.setViewOnly(viewOnly);
    if (viewOnly) {
      this.selectionManager.clear();
      this.enterViewOnly();
      this.notePopup.hide();
      this.edgePopup.hide();
    } else {
      // Restore positions from snapshot
      if (this.positionSnapshot) {
        for (const [id, { x, y }] of this.positionSnapshot) {
          this.noteManager.updateNote(id, { x, y });
        }
        this.positionSnapshot = null;
      }
      // Restore edge collapsed states from snapshot
      if (this.collapsedEdgeSnapshot) {
        for (const [id, wasCollapsed] of this.collapsedEdgeSnapshot) {
          this.edgeManager.updateEdge(id, { collapsed: wasCollapsed ? true : undefined });
        }
        this.collapsedEdgeSnapshot = null;
      }
      this.historyManager.setIgnoredKeys([], []);
      this.boardEl.classList.remove('wema-viewonly');
      this.noteManager.setViewOnly(false);
    }
    this.emitter.emit('viewOnly:change', { viewOnly });
    this.recomputeVisibility();
  }

  /**
   * Snapshot what viewOnly restores on exit and stop recording those keys:
   * moves and collapses made in viewOnly are temporary, so neither they nor
   * the restore may become undo steps or `history:commit` events.
   */
  private enterViewOnly(): void {
    this.snapshotForViewOnly();
    this.historyManager.setIgnoredKeys(['x', 'y'], ['collapsed']);
    this.boardEl.classList.add('wema-viewonly');
    this.noteManager.setViewOnly(true);
  }

  /** Remember the positions and collapsed states that leaving viewOnly restores */
  private snapshotForViewOnly(): void {
    this.positionSnapshot = new Map(this.noteManager.getNotes().map((n) => [n.id, { x: n.x, y: n.y }]));
    this.collapsedEdgeSnapshot = new Map(this.edgeManager.getEdges().map((e) => [e.id, !!e.collapsed]));
  }

  /** Check if the board is in view-only mode */
  isViewOnly(): boolean {
    return this.viewOnly;
  }

  // --- Theme ---

  /** Set the board theme */
  setTheme(theme: NoteTheme): void {
    if (this.theme === theme) return;
    this.boardEl.classList.remove(`wema-theme-${this.theme}`);
    this.theme = theme;
    if (theme !== 'default') {
      this.boardEl.classList.add(`wema-theme-${theme}`);
    }
  }

  /** Get the current theme */
  getTheme(): NoteTheme {
    return this.theme;
  }

  // --- Internal ---

  /**
   * Open a file picker and insert the image into the note: uploaded through
   * `onImageUpload` when set, embedded as a data URI otherwise.
   */
  private insertImageIntoNote(noteId: NoteId): void {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.addEventListener('change', () => {
      const file = input.files?.[0];
      if (!file) return;
      if (this.onImageUpload) {
        void this.uploadImage(noteId, file, this.onImageUpload);
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        this.appendImage(noteId, reader.result as string, file.name);
      };
      reader.readAsDataURL(file);
    });
    input.click();
  }

  /** Upload an image and insert it once the URL is known; emit 'image:error' on failure */
  private async uploadImage(
    noteId: NoteId,
    file: File,
    upload: (file: File) => Promise<string>,
  ): Promise<void> {
    try {
      const url = await upload(file);
      if (typeof url !== 'string' || url === '' || !isSafeUrl(url, 'image/')) {
        throw new Error(`onImageUpload returned an unusable URL: ${String(url)}`);
      }
      // The mode may have changed while the upload was running
      if (this.readOnly || this.viewOnly) {
        throw new Error('The board became read-only before the upload finished');
      }
      this.appendImage(noteId, url, file.name);
    } catch (error) {
      this.emitter.emit('image:error', { noteId, file, error });
    }
  }

  /** Append an <img> to the note content and sync it to note data */
  private appendImage(noteId: NoteId, src: string, alt: string): void {
    const content = this.noteManager.getTextElement(noteId);
    if (!content) return;
    const img = document.createElement('img');
    img.src = src;
    img.alt = alt;
    img.style.maxWidth = '100%';
    content.appendChild(img);
    content.dispatchEvent(new Event('input', { bubbles: true }));
    // Immediately sync to note data
    this.noteManager.updateNote(noteId, { text: content.innerHTML });
  }

  /** Show an inline URL input for embedding an iframe into the note */
  private showEmbedInput(noteId: NoteId): void {
    // Remove any existing embed input
    this.embedInput?.el.remove();
    this.embedInput = null;

    if (!this.noteManager.getNote(noteId)) return;

    const container = createElement('div', 'wema-embed-input');
    this.embedInput = { el: container, noteId };
    const close = (): void => {
      container.remove();
      if (this.embedInput?.el === container) this.embedInput = null;
    };
    container.style.position = 'absolute';
    this.placeEmbedInput();
    container.style.transform = 'translateX(-50%)';
    container.style.zIndex = '10002';
    container.addEventListener('click', (e) => e.stopPropagation());
    container.addEventListener('mousedown', (e) => e.stopPropagation());
    container.addEventListener('pointerdown', (e) => e.stopPropagation());

    const input = document.createElement('input');
    input.type = 'text';
    input.placeholder = 'https://...';
    input.style.cssText = 'width:200px;padding:4px 6px;border:1px solid #ddd;border-radius:3px;font-size:12px;';

    const okBtn = createElement('button', 'wema-popup-btn') as HTMLButtonElement;
    okBtn.textContent = this.labels.ok;
    okBtn.addEventListener('click', () => {
      const rawUrl = input.value.trim();
      if (rawUrl) this.embedUrl(noteId, rawUrl);
      close();
    });

    const cancelBtn = createElement('button', 'wema-popup-btn') as HTMLButtonElement;
    cancelBtn.textContent = '✕';
    cancelBtn.addEventListener('click', close);

    container.appendChild(input);
    container.appendChild(okBtn);
    container.appendChild(cancelBtn);
    this.boardEl.appendChild(container);
    input.focus();
  }

  /** Put the embed URL input under its note, below the note popup (call again after the viewport changes) */
  private placeEmbedInput(): void {
    if (!this.embedInput) return;
    const note = this.noteManager.getNote(this.embedInput.noteId);
    if (!note) return;
    const below = this.view.boardToScreen(note.x + note.width / 2, note.y + note.height);
    this.embedInput.el.style.left = `${below.x}px`;
    this.embedInput.el.style.top = `${below.y + 50}px`;
  }

  /** Image URL pattern (by file extension) */
  private static readonly IMAGE_URL_RE = /\.(?:png|jpe?g|gif|webp|svg|bmp|ico)(?:\?.*)?$/i;
  /** Video URL pattern (by file extension) */
  private static readonly VIDEO_URL_RE = /\.(?:mp4|webm|ogg|mov)(?:\?.*)?$/i;
  /** Audio URL pattern (by file extension) */
  private static readonly AUDIO_URL_RE = /\.(?:mp3|wav|flac|aac|m4a|opus|weba)(?:\?.*)?$/i;

  /** Convert URL to embed URL and insert iframe/img/video into a note */
  private async embedUrl(noteId: NoteId, rawUrl: string): Promise<void> {
    if (!isSafeUrl(rawUrl)) return;
    const content = this.noteManager.getTextElement(noteId);
    if (!content) return;

    if (WemaBoard.IMAGE_URL_RE.test(rawUrl)) {
      const img = document.createElement('img');
      img.src = rawUrl;
      content.appendChild(img);
    } else if (WemaBoard.VIDEO_URL_RE.test(rawUrl)) {
      const video = document.createElement('video');
      video.src = rawUrl;
      video.controls = true;
      video.preload = 'metadata';
      content.appendChild(video);
    } else if (WemaBoard.AUDIO_URL_RE.test(rawUrl)) {
      const audio = document.createElement('audio');
      audio.src = rawUrl;
      audio.controls = true;
      audio.preload = 'metadata';
      content.appendChild(audio);
    } else {
      const embedSrc = await toEmbedUrlAsync(rawUrl);
      const iframe = document.createElement('iframe');
      iframe.src = embedSrc;
      iframe.width = '100%';
      iframe.height = '200';
      iframe.style.border = 'none';
      iframe.setAttribute('allowfullscreen', '');
      iframe.setAttribute('allow', 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture');
      content.appendChild(iframe);
    }
    content.dispatchEvent(new Event('input', { bubbles: true }));
    this.noteManager.updateNote(noteId, { text: content.innerHTML });
  }

  /**
   * Recompute which notes/edges are hidden by the note filter and by
   * collapsed edges, drop what became hidden from the selection, apply
   * visibility to DOM/SVG elements, then update collapse buttons.
   */
  private recomputeVisibility(): void {
    if (this.visibilitySuspended) return;
    const notes = this.noteManager.getNotes();
    const edges = this.edgeManager.getEdges();
    const hiddenNotes = new Set<NoteId>();
    const hiddenEdges = new Set<EdgeId>();

    // Notes left out by the filter, and every edge connected to one of them
    const filter = this.noteFilter;
    const inFilter = (id: NoteId): boolean => !filter || filter.has(id);
    const shownEdges = edges.filter((edge) => inFilter(edge.from) && inFilter(edge.to));
    for (const note of notes) {
      if (!inFilter(note.id)) hiddenNotes.add(note.id);
    }
    for (const edge of edges) {
      if (!inFilter(edge.from) || !inFilter(edge.to)) hiddenEdges.add(edge.id);
    }

    // DFS from each collapsed edge's target. Only edges the filter shows
    // count: a collapsed edge that is itself hidden has no button to expand
    // it, so it must not hide notes the filter asked for.
    for (const edge of shownEdges) {
      if (edge.collapsed) {
        hiddenEdges.add(edge.id);
        this.dfsHideNotes(edge.to, shownEdges, hiddenNotes, hiddenEdges);
      }
    }
    this.hiddenNoteIds = hiddenNotes;

    // What is no longer visible must not stay selected (it could be deleted unseen)
    const selection = this.selectionManager.getSelection();
    const stillVisible = selection.filter((id) => !hiddenNotes.has(id));
    if (stillVisible.length !== selection.length) {
      this.selectionManager.select(stillVisible);
      this.updateNotePopup();
    }
    const selectedEdge = this.edgeManager.getSelectedEdge();
    if (selectedEdge && hiddenEdges.has(selectedEdge)) {
      this.edgeManager.deselectEdge();
      this.edgePopup.hide();
    }

    // Apply to note DOM elements
    for (const note of notes) {
      const el = this.noteManager.getElement(note.id);
      if (!el) continue;
      const wasHidden = el.style.display === 'none';
      const hidden = hiddenNotes.has(note.id);
      el.style.display = hidden ? 'none' : '';
      // A hidden note is not laid out, so what happened to it meanwhile was
      // not measured
      if (wasHidden && !hidden) this.noteManager.remeasure(note.id);
    }

    // Apply to edge SVG elements
    this.edgeManager.applyVisibility(hiddenEdges);

    // Update per-note collapse buttons (edges hidden by the filter get none)
    this.updateNoteCollapseBtns(shownEdges, hiddenNotes);
  }

  private dfsHideNotes(
    noteId: NoteId,
    edges: WemaEdge[],
    hiddenNotes: Set<NoteId>,
    hiddenEdges: Set<EdgeId>,
  ): void {
    if (hiddenNotes.has(noteId)) return;
    hiddenNotes.add(noteId);
    for (const edge of edges) {
      if (edge.from === noteId) {
        hiddenEdges.add(edge.id);
        this.dfsHideNotes(edge.to, edges, hiddenNotes, hiddenEdges);
      }
    }
  }

  /**
   * Update per-side collapse/expand buttons on each note.
   * Each side button controls only edges exiting from that side.
   */
  private updateNoteCollapseBtns(edges: WemaEdge[], hiddenNotes: Set<NoteId>): void {
    type Side = 'top' | 'right' | 'bottom' | 'left';

    // Group outgoing edges by (from-note, resolved side)
    const outgoingBySide = new Map<NoteId, Map<Side, WemaEdge[]>>();
    for (const edge of edges) {
      const fromNote = this.noteManager.getNote(edge.from);
      const toNote = this.noteManager.getNote(edge.to);
      if (!fromNote || !toNote) continue;

      const side: Side = edge.fromAnchor === 'auto'
        ? resolveAutoAnchor(fromNote, toNote)
        : edge.fromAnchor;

      let noteMap = outgoingBySide.get(edge.from);
      if (!noteMap) { noteMap = new Map(); outgoingBySide.set(edge.from, noteMap); }
      let list = noteMap.get(side);
      if (!list) { list = []; noteMap.set(side, list); }
      list.push(edge);
    }

    const sides: Side[] = ['top', 'right', 'bottom', 'left'];

    for (const note of this.noteManager.getNotes()) {
      const el = this.noteManager.getElement(note.id);
      if (!el) continue;

      const sideMap = outgoingBySide.get(note.id);

      for (const side of sides) {
        const btn = el.querySelector(`.wema-note-collapse-btn[data-side="${side}"]`) as HTMLElement | null;
        if (!btn) continue;

        const sideEdges = sideMap?.get(side);

        // Hide button when: no edges on this side, note hidden, or read-only
        if (!sideEdges || sideEdges.length === 0 || hiddenNotes.has(note.id) || this.readOnly) {
          btn.style.display = 'none';
          continue;
        }

        const allCollapsed = sideEdges.every((e) => e.collapsed);

        btn.style.display = '';
        // Capture snapshot for click handler
        const snapshot = sideEdges.map((e) => e.id);
        btn.onclick = (ev) => {
          ev.stopPropagation();
          if (allCollapsed) {
            for (const id of snapshot) this.edgeManager.updateEdge(id, { collapsed: false });
          } else {
            for (const id of snapshot) this.edgeManager.updateEdge(id, { collapsed: true });
          }
        };

        if (allCollapsed) {
          // Badge mode: show hidden subtree count for this side's edges
          const count = this.countSubtreeFromEdges(sideEdges, edges);
          btn.className = 'wema-note-collapse-btn wema-note-collapse-badge';
          btn.dataset.side = side;
          btn.textContent = String(count);
        } else {
          // Collapse mode: show minus icon, visible on note hover
          btn.className = 'wema-note-collapse-btn';
          btn.dataset.side = side;
          btn.innerHTML = '<svg width="10" height="2" viewBox="0 0 10 2" fill="none">'
            + '<line x1="1" y1="1" x2="9" y2="1" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>'
            + '</svg>';
        }
      }
    }
  }

  /** Count all notes in the subtree reachable from a set of collapsed edges */
  private countSubtreeFromEdges(sideEdges: WemaEdge[], allEdges: WemaEdge[]): number {
    const visited = new Set<NoteId>();
    for (const edge of sideEdges) {
      if (edge.collapsed) {
        this.countSubtreeDFS(edge.to, allEdges, visited);
      }
    }
    return visited.size;
  }

  private countSubtreeDFS(noteId: NoteId, edges: WemaEdge[], visited: Set<NoteId>): void {
    if (visited.has(noteId)) return;
    visited.add(noteId);
    for (const edge of edges) {
      if (edge.from === noteId) this.countSubtreeDFS(edge.to, edges, visited);
    }
  }

  private scheduleChange(): void {
    if (this.changePending) return;
    this.changePending = true;
    queueMicrotask(() => {
      this.changePending = false;
      this.emitter.emit('change', { data: this.exportData() });
    });
  }
}
