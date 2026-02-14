import type {
  NoteId,
  EdgeId,
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
import { createElement, createSvgElement, setStyles } from './utils/dom.js';

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
  private changePending = false;
  private container: HTMLElement;
  private readOnly: boolean;

  private handleDblClick: (e: MouseEvent) => void;
  private handleKeyDown: (e: KeyboardEvent) => void;
  private handleBoardClick: (e: MouseEvent) => void;

  constructor(options: WemaBoardOptions) {
    this.container = options.container;
    this.readOnly = options.readOnly ?? false;

    // Create board element
    this.boardEl = createElement('div', 'wema-board');
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

    const getReadOnly = () => this.readOnly;

    this.dragManager = new DragManager({
      boardEl: this.boardEl,
      noteManager: this.noteManager,
      emitter: this.emitter,
      getReadOnly,
      onDragEnd: (noteId) => {
        this.selectionManager.select([noteId]);
      },
    });

    // Anchor drag for edge creation (not in readOnly mode)
    this.anchorDragManager = new AnchorDragManager({
      boardEl: this.boardEl,
      svgEl: this.svgEl,
      noteManager: this.noteManager,
      edgeManager: this.edgeManager,
      emitter: this.emitter,
      getReadOnly,
    });

    this.resizeManager = new ResizeManager({
      boardEl: this.boardEl,
      noteManager: this.noteManager,
      emitter: this.emitter,
      getReadOnly,
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
        });
        this.selectionManager.select([newNote.id]);
        this.notePopup.show(newNote.id);
      },
      onDelete: (noteId) => {
        this.deleteNote(noteId);
      },
    });

    // Update edges in real-time during note drag
    this.emitter.on('note:update', ({ note }) => {
      this.edgeManager.updateEdgesOf(note.id);
    });

    // Coalesce change events via microtask
    this.emitter.on('note:create', () => this.scheduleChange());
    this.emitter.on('note:update', () => this.scheduleChange());
    this.emitter.on('note:delete', () => this.scheduleChange());
    this.emitter.on('edge:create', () => this.scheduleChange());
    this.emitter.on('edge:update', () => this.scheduleChange());
    this.emitter.on('edge:delete', () => this.scheduleChange());

    // Double-click to create note
    this.handleDblClick = (e: MouseEvent) => {
      if (this.readOnly) return;
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
      if (this.readOnly) return;
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
      // Don't handle clicks from popups
      if ((e.target as HTMLElement).closest('.wema-edge-popup')) return;
      if ((e.target as HTMLElement).closest('.wema-note-popup')) return;

      if (this.readOnly) return;

      // Check if an edge was clicked (via hit test)
      const hitEdgeId = this.edgeManager.hitTest(e.clientX, e.clientY);
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
          this.selectionManager.select([noteId]);
          this.noteManager.bringToFront(noteId);
          this.notePopup.show(noteId);
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

    // Import initial data if provided
    if (options.data) {
      this.importData(options.data);
    }
  }

  /** Clean up all resources */
  destroy(): void {
    this.boardEl.removeEventListener('dblclick', this.handleDblClick);
    this.boardEl.removeEventListener('keydown', this.handleKeyDown);
    this.boardEl.removeEventListener('click', this.handleBoardClick);
    this.dragManager.destroy();
    this.anchorDragManager.destroy();
    this.resizeManager.destroy();
    this.edgePopup.destroy();
    this.notePopup.destroy();
    this.selectionManager.destroy();
    this.edgeManager.destroy();
    this.emitter.removeAllListeners();
    this.boardEl.remove();
  }

  // --- Notes ---

  /** Add a new note to the board */
  addNote(params?: Partial<Omit<WemaNote, 'id'>>): WemaNote {
    if (this.readOnly) return undefined as never;
    return this.noteManager.addNote(params);
  }

  /** Update an existing note */
  updateNote(id: NoteId, params: Partial<WemaNote>): void {
    if (this.readOnly) return;
    this.noteManager.updateNote(id, params);
  }

  /** Delete a note from the board, including connected edges */
  deleteNote(id: NoteId): void {
    if (this.readOnly) return;
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
    if (this.readOnly) return undefined as never;
    return this.edgeManager.addEdge(from, to, params);
  }

  /** Get the currently selected edge ID, or null */
  getSelectedEdge(): EdgeId | null {
    return this.edgeManager.getSelectedEdge();
  }

  /** Update an existing edge's properties */
  updateEdge(id: EdgeId, params: Partial<Omit<WemaEdge, 'id' | 'from' | 'to'>>): void {
    if (this.readOnly) return;
    this.edgeManager.updateEdge(id, params);
  }

  /** Delete an edge */
  deleteEdge(id: EdgeId): void {
    if (this.readOnly) return;
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

  /** Select notes by IDs */
  select(noteIds: NoteId[]): void {
    this.selectionManager.select(noteIds);
  }

  /** Select all notes */
  selectAll(): void {
    this.selectionManager.selectAll();
  }

  /** Get currently selected note IDs */
  getSelection(): NoteId[] {
    return this.selectionManager.getSelection();
  }

  // --- Layout ---

  /** Align selected notes */
  alignNotes(noteIds: NoteId[], alignment: 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom'): void {
    alignNotes(this.noteManager, noteIds, alignment);
  }

  /** Distribute notes evenly */
  distributeNotes(noteIds: NoteId[], direction: 'horizontal' | 'vertical'): void {
    distributeNotes(this.noteManager, noteIds, direction);
  }

  /** Auto-layout notes */
  autoLayout(noteIds?: NoteId[]): void {
    autoLayout(this.noteManager, noteIds);
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
    if (readOnly) {
      this.boardEl.classList.add('wema-readonly');
      this.notePopup.hide();
      this.edgePopup.hide();
    } else {
      this.boardEl.classList.remove('wema-readonly');
    }
    this.emitter.emit('readOnly:change', { readOnly });
  }

  /** Check if the board is read-only */
  isReadOnly(): boolean {
    return this.readOnly;
  }

  // --- Internal ---

  private scheduleChange(): void {
    if (this.changePending) return;
    this.changePending = true;
    queueMicrotask(() => {
      this.changePending = false;
      this.emitter.emit('change', { data: this.exportData() });
    });
  }
}
