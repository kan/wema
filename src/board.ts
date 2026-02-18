import type {
  NoteId,
  EdgeId,
  NoteTheme,
  WemaNote,
  WemaEdge,
  WemaBoardData,
  WemaBoardOptions,
  WemaEventMap,
} from './types.js';
import { EventEmitter } from './events.js';
import { NoteManager } from './note.js';
import { DragManager } from './drag.js';
import { SelectionManager } from './selection.js';
import { EdgeManager } from './edge.js';
import { AnchorDragManager } from './anchor-drag.js';
import { ResizeManager } from './resize.js';
import { EdgeStylePopup } from './edge-popup.js';
import { NoteStylePopup } from './note-popup.js';
import { alignNotes, distributeNotes, autoLayout } from './layout.js';
import { HistoryManager } from './history.js';
import { RichTextToolbar } from './rich-text.js';
import { createElement, createSvgElement, setStyles } from './utils/dom.js';
import { toEmbedUrlAsync } from './utils/oembed.js';

/** Main API class for the wema board */
export class WemaBoard {
  private emitter = new EventEmitter<WemaEventMap>();
  private boardEl: HTMLElement;
  private svgEl: SVGSVGElement;
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
  private changePending = false;
  private container: HTMLElement;
  private readOnly: boolean;
  private viewOnly: boolean;
  private defaultNoteWidth: number;
  private defaultNoteHeight: number;
  private positionSnapshot: { id: NoteId; x: number; y: number }[] | null = null;
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

  constructor(options: WemaBoardOptions) {
    this.container = options.container;
    this.readOnly = options.readOnly ?? false;
    this.viewOnly = options.viewOnly ?? false;
    this.defaultNoteWidth = options.defaultNoteWidth ?? 200;
    this.defaultNoteHeight = options.defaultNoteHeight ?? 150;
    this.theme = options.theme ?? 'default';

    // Create board element
    this.boardEl = createElement('div', 'wema-board');
    if (this.theme !== 'default') {
      this.boardEl.classList.add(`wema-theme-${this.theme}`);
    }
    setStyles(this.boardEl, { position: 'relative', width: '100%', height: '100%', overflow: 'hidden' });
    this.boardEl.tabIndex = 0;

    // Create SVG layer for edges
    this.svgEl = createSvgElement('svg', 'wema-edges');
    this.svgEl.setAttribute('width', '100%');
    this.svgEl.setAttribute('height', '100%');
    setStyles(this.svgEl as unknown as HTMLElement, {
      position: 'absolute',
      top: '0',
      left: '0',
      pointerEvents: 'none',
    });
    this.boardEl.appendChild(this.svgEl);

    // Mount to container
    this.container.appendChild(this.boardEl);

    // Initialize managers
    this.noteManager = new NoteManager({
      boardEl: this.boardEl,
      emitter: this.emitter,
      defaultWidth: options.defaultNoteWidth ?? 200,
      defaultHeight: options.defaultNoteHeight ?? 150,
      defaultColor: options.defaultNoteColor ?? '#FFF9C4',
      readOnly: this.readOnly,
    });

    this.selectionManager = new SelectionManager({
      boardEl: this.boardEl,
      noteManager: this.noteManager,
      emitter: this.emitter,
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
      emitter: this.emitter,
      getReadOnly: isLocked,
      getSelection: () => this.selectionManager.getSelection(),
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
      emitter: this.emitter,
      getReadOnly: isRestricted,
      onResizeStart: () => { this.historyManager.beginBatch(); },
      onResizeEnd: () => { this.historyManager.endBatch(); },
    });

    this.edgePopup = new EdgeStylePopup({
      boardEl: this.boardEl,
      edgeManager: this.edgeManager,
      noteManager: this.noteManager,
      onDelete: (edgeId) => {
        this.edgeManager.deselectEdge();
        this.edgeManager.deleteEdge(edgeId);
      },
    });

    this.notePopup = new NoteStylePopup({
      boardEl: this.boardEl,
      noteManager: this.noteManager,
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
        const notes = noteIds.map((id) => this.noteManager.getNote(id)).filter((n) => n != null);
        const allAutoSize = notes.every((n) => n.autoSize);
        for (const id of noteIds) {
          this.noteManager.updateNote(id, { autoSize: !allAutoSize });
        }
        this.notePopup.showMulti(noteIds);
      },
    });

    this.richTextToolbar = new RichTextToolbar({
      boardEl: this.boardEl,
      readOnly: this.readOnly,
      viewOnly: this.viewOnly,
    });

    // Initialize history manager for undo/redo
    this.historyManager = new HistoryManager(this.emitter, {
      addNoteWithId: (note) => { this.noteManager.addNoteWithId(note); },
      updateNote: (id, params) => { this.noteManager.updateNote(id, params); },
      deleteNoteOnly: (id) => {
        this.selectionManager.deselect(id);
        this.noteManager.deleteNote(id);
      },
      addEdgeWithId: (edge) => { this.edgeManager.addEdgeWithId(edge); },
      updateEdge: (id, params) => { this.edgeManager.updateEdge(id, params); },
      deleteEdge: (id) => { this.edgeManager.deleteEdge(id); },
    });

    // Update edges in real-time during note drag
    this.emitter.on('note:update', ({ note }) => {
      this.edgeManager.updateEdgesOf(note.id);
    });

    // Recompute collapse visibility on any structural change
    this.emitter.on('edge:create', () => this.recomputeVisibility());
    this.emitter.on('edge:update', () => this.recomputeVisibility());
    this.emitter.on('edge:delete', () => this.recomputeVisibility());
    this.emitter.on('note:create', () => this.recomputeVisibility());
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
      if (this.readOnly || this.viewOnly) return;
      if ((options.createOnDblClick ?? true) === false) return;
      // Only create if clicking on the board itself, not on a note
      if ((e.target as HTMLElement).closest('.wema-note')) return;

      const rect = this.boardEl.getBoundingClientRect();
      this.addNote({
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      });
    };
    this.boardEl.addEventListener('dblclick', this.handleDblClick);

    // Delete key to remove selected notes or selected edge
    this.handleKeyDown = (e: KeyboardEvent) => {
      // Undo/Redo shortcuts (work even in readOnly/viewOnly is debatable, but only when not editing text)
      if ((e.ctrlKey || e.metaKey) && !this.readOnly && !this.viewOnly) {
        const inEditable = (e.target as HTMLElement).closest('[contenteditable="true"]');
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
        if ((e.target as HTMLElement).closest('[contenteditable="true"]')) return;

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
      // After rubberband drag or note drag, skip the click that follows pointerup
      if (this.rubberBandMoved) {
        this.rubberBandMoved = false;
        return;
      }
      if (this.noteDragged) {
        this.noteDragged = false;
        return;
      }

      // Don't handle clicks from popups or toolbar
      if ((e.target as HTMLElement).closest('.wema-edge-popup')) return;
      if ((e.target as HTMLElement).closest('.wema-note-popup')) return;
      if ((e.target as HTMLElement).closest('.wema-richtext-toolbar')) return;
      if ((e.target as HTMLElement).closest('.wema-image-overlay')) return;
      if ((e.target as HTMLElement).closest('.wema-embed-input')) return;

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
      if (!active || !active.closest('[contenteditable="true"]')) {
        this.boardEl.focus();
      }
    };
    this.boardEl.addEventListener('click', this.handleBoardClick);

    // Rubberband selection on empty area drag
    this.handleRubberBandDown = (e: PointerEvent) => {
      if (e.button !== 0) return;
      if (this.readOnly) return;
      // Only start rubberband from empty board area (not notes, anchors, handles, toolbars)
      if ((e.target as HTMLElement).closest('.wema-note')) return;
      if ((e.target as HTMLElement).closest('.wema-edge-popup')) return;
      if ((e.target as HTMLElement).closest('.wema-note-popup')) return;
      if ((e.target as HTMLElement).closest('.wema-richtext-toolbar')) return;
      if ((e.target as HTMLElement).closest('.wema-image-overlay')) return;
      if ((e.target as HTMLElement).closest('.wema-embed-input')) return;

      const rect = this.boardEl.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      this.selectionManager.startRubberBand(x, y);
      this.boardEl.setPointerCapture(e.pointerId);
      this.boardEl.addEventListener('pointermove', this.handleRubberBandMove);
      this.boardEl.addEventListener('pointerup', this.handleRubberBandUp);
    };

    this.handleRubberBandMove = (e: PointerEvent) => {
      if (!this.selectionManager.isRubberBandActive()) return;
      this.rubberBandMoved = true;
      const rect = this.boardEl.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
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

    // Import initial data if provided
    if (options.data) {
      this.importData(options.data);
    }

    // Apply initial viewOnly state
    if (this.viewOnly) {
      this.boardEl.classList.add('wema-viewonly');
      this.noteManager.setViewOnly(true);
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
    return this.noteManager.addNote(params);
  }

  /** Update an existing note */
  updateNote(id: NoteId, params: Partial<WemaNote>): void {
    if (this.readOnly) return;
    this.noteManager.updateNote(id, params);
  }

  /** Delete a note from the board, including connected edges */
  deleteNote(id: NoteId): void {
    if (this.readOnly || this.viewOnly) return;
    // Delete all connected edges first
    const connectedEdges = this.edgeManager.getEdgesOf(id);
    for (const edge of connectedEdges) {
      this.edgeManager.deleteEdge(edge.id);
    }
    this.selectionManager.deselect(id);
    this.noteManager.deleteNote(id);
  }

  /** Get a note by ID */
  getNote(id: NoteId): WemaNote | undefined {
    return this.noteManager.getNote(id);
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

  // --- Layout ---

  /** Align selected notes */
  alignNotes(noteIds: NoteId[], alignment: 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom'): void {
    if (this.readOnly || this.viewOnly) return;
    alignNotes(this.noteManager, noteIds, alignment);
    this.updateNotePopup();
  }

  /** Distribute notes evenly */
  distributeNotes(noteIds: NoteId[], direction: 'horizontal' | 'vertical'): void {
    if (this.readOnly || this.viewOnly) return;
    distributeNotes(this.noteManager, noteIds, direction);
    this.updateNotePopup();
  }

  /** Auto-layout notes */
  autoLayout(noteIds?: NoteId[]): void {
    if (this.readOnly || this.viewOnly) return;
    autoLayout(this.noteManager, this.edgeManager.getEdges(), noteIds);
    this.updateNotePopup();
  }

  // --- History ---

  /** Undo the last operation */
  undo(): void {
    this.notePopup.hide();
    this.edgePopup.hide();
    this.selectionManager.clear();
    this.historyManager.undo();
  }

  /** Redo the last undone operation */
  redo(): void {
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
    this.noteManager.flushEditing();
    const data: WemaBoardData = {
      version: 1,
      notes: this.noteManager.getNotes(),
      edges: this.edgeManager.getEdges(),
    };
    return JSON.parse(JSON.stringify(data));
  }

  /** Import board data, replacing all current content */
  importData(data: WemaBoardData): void {
    this.selectionManager.clear();
    this.edgeManager.clear();
    this.noteManager.renderAll(data.notes);
    if (data.edges) {
      this.edgeManager.renderAll(data.edges);
    }
    this.historyManager.clear();
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
      // Snapshot note positions and edge collapsed states before entering viewOnly
      this.positionSnapshot = this.noteManager.getNotes().map((n) => ({ id: n.id, x: n.x, y: n.y }));
      this.collapsedEdgeSnapshot = new Map(this.edgeManager.getEdges().map((e) => [e.id, !!e.collapsed]));
      this.boardEl.classList.add('wema-viewonly');
      this.selectionManager.clear();
      this.noteManager.setViewOnly(true);
      this.notePopup.hide();
      this.edgePopup.hide();
    } else {
      // Restore positions from snapshot
      if (this.positionSnapshot) {
        for (const snap of this.positionSnapshot) {
          this.noteManager.updateNote(snap.id, { x: snap.x, y: snap.y });
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
      this.boardEl.classList.remove('wema-viewonly');
      this.noteManager.setViewOnly(false);
    }
    this.emitter.emit('viewOnly:change', { viewOnly });
    this.recomputeVisibility();
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

  /** Open a file picker and insert image as data URI into the note */
  private insertImageIntoNote(noteId: NoteId): void {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.addEventListener('change', () => {
      const file = input.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        const dataUri = reader.result as string;
        const noteEl = this.noteManager.getElement(noteId);
        if (!noteEl) return;
        const content = noteEl.querySelector('.wema-note-content') as HTMLElement | null;
        if (!content) return;
        const img = document.createElement('img');
        img.src = dataUri;
        img.alt = file.name;
        img.style.maxWidth = '100%';
        content.appendChild(img);
        content.dispatchEvent(new Event('input', { bubbles: true }));
        // Immediately sync to note data
        const note = this.noteManager.getNote(noteId);
        if (note) {
          this.noteManager.updateNote(noteId, { text: content.innerHTML });
        }
      };
      reader.readAsDataURL(file);
    });
    input.click();
  }

  /** Show an inline URL input for embedding an iframe into the note */
  private showEmbedInput(noteId: NoteId): void {
    // Remove any existing embed input
    this.boardEl.querySelector('.wema-embed-input')?.remove();

    const note = this.noteManager.getNote(noteId);
    if (!note) return;

    const container = createElement('div', 'wema-embed-input');
    container.style.position = 'absolute';
    container.style.left = `${note.x + note.width / 2}px`;
    container.style.top = `${note.y + note.height + 50}px`;
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
    okBtn.textContent = 'OK';
    okBtn.addEventListener('click', () => {
      const rawUrl = input.value.trim();
      if (!rawUrl) { container.remove(); return; }
      this.embedUrl(noteId, rawUrl);
      container.remove();
    });

    const cancelBtn = createElement('button', 'wema-popup-btn') as HTMLButtonElement;
    cancelBtn.textContent = '✕';
    cancelBtn.addEventListener('click', () => container.remove());

    container.appendChild(input);
    container.appendChild(okBtn);
    container.appendChild(cancelBtn);
    this.boardEl.appendChild(container);
    input.focus();
  }

  /** Image URL pattern (by file extension) */
  private static readonly IMAGE_URL_RE = /\.(?:png|jpe?g|gif|webp|svg|bmp|ico)(?:\?.*)?$/i;
  /** Video URL pattern (by file extension) */
  private static readonly VIDEO_URL_RE = /\.(?:mp4|webm|ogg|mov)(?:\?.*)?$/i;
  /** Audio URL pattern (by file extension) */
  private static readonly AUDIO_URL_RE = /\.(?:mp3|wav|flac|aac|m4a|opus|weba)(?:\?.*)?$/i;

  /** Convert URL to embed URL and insert iframe/img/video into a note */
  private async embedUrl(noteId: NoteId, rawUrl: string): Promise<void> {
    const noteEl = this.noteManager.getElement(noteId);
    if (!noteEl) return;
    const content = noteEl.querySelector('.wema-note-content') as HTMLElement | null;
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
   * Recompute which notes/edges are hidden due to collapsed edges,
   * apply visibility to DOM/SVG elements, then update collapse buttons.
   */
  private recomputeVisibility(): void {
    const edges = this.edgeManager.getEdges();
    const hiddenNotes = new Set<NoteId>();
    const hiddenEdges = new Set<EdgeId>();

    // DFS from each collapsed edge's target
    for (const edge of edges) {
      if (edge.collapsed) {
        hiddenEdges.add(edge.id);
        this.dfsHideNotes(edge.to, edges, hiddenNotes, hiddenEdges);
      }
    }

    // Apply to note DOM elements
    for (const note of this.noteManager.getNotes()) {
      const el = this.noteManager.getElement(note.id);
      if (el) el.style.display = hiddenNotes.has(note.id) ? 'none' : '';
    }

    // Apply to edge SVG elements
    this.edgeManager.applyVisibility(hiddenEdges);

    // Update per-note collapse buttons
    this.updateNoteCollapseBtns(edges, hiddenNotes);
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
   * Update the collapse/expand button on each note based on its outgoing edges.
   * One button per source note collapses/expands ALL its outgoing edges at once.
   */
  private updateNoteCollapseBtns(edges: WemaEdge[], hiddenNotes: Set<NoteId>): void {
    // Group outgoing edges by from-note
    const outgoingByNote = new Map<NoteId, WemaEdge[]>();
    for (const edge of edges) {
      let list = outgoingByNote.get(edge.from);
      if (!list) { list = []; outgoingByNote.set(edge.from, list); }
      list.push(edge);
    }

    for (const note of this.noteManager.getNotes()) {
      const el = this.noteManager.getElement(note.id);
      if (!el) continue;
      const btn = el.querySelector('.wema-note-collapse-btn') as HTMLElement | null;
      if (!btn) continue;

      const outgoing = outgoingByNote.get(note.id) ?? [];

      // Hide button when: no outgoing edges, note itself is hidden, or read-only mode
      if (outgoing.length === 0 || hiddenNotes.has(note.id) || this.readOnly) {
        btn.style.display = 'none';
        continue;
      }

      const allCollapsed = outgoing.every((e) => e.collapsed);

      btn.style.display = '';
      // Capture snapshot for click handler
      const snapshot = outgoing.map((e) => e.id);
      btn.onclick = (ev) => {
        ev.stopPropagation();
        if (allCollapsed) {
          for (const id of snapshot) this.edgeManager.updateEdge(id, { collapsed: false });
        } else {
          for (const id of snapshot) this.edgeManager.updateEdge(id, { collapsed: true });
        }
      };

      if (allCollapsed) {
        // Badge mode: show hidden subtree count, always visible
        const count = this.countSubtreeFromNote(note.id, edges);
        btn.className = 'wema-note-collapse-btn wema-note-collapse-badge';
        btn.textContent = String(count);
      } else {
        // Collapse mode: show minus icon, visible on note hover
        btn.className = 'wema-note-collapse-btn';
        btn.innerHTML = '<svg width="10" height="2" viewBox="0 0 10 2" fill="none">'
          + '<line x1="1" y1="1" x2="9" y2="1" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>'
          + '</svg>';
      }
    }
  }

  /** Count all notes in the subtree hidden by this note's collapsed outgoing edges */
  private countSubtreeFromNote(noteId: NoteId, edges: WemaEdge[]): number {
    const visited = new Set<NoteId>();
    for (const edge of edges) {
      if (edge.from === noteId && edge.collapsed) {
        this.countSubtreeDFS(edge.to, edges, visited);
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
