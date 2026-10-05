/** Unique identifier for a note */
export type NoteId = string;

/** Unique identifier for an edge */
export type EdgeId = string;

/** Anchor position on a note's border */
export type Anchor = 'top' | 'right' | 'bottom' | 'left' | 'auto';

/** Theme for note appearance */
export type NoteTheme = 'default' | 'card';

/** Visual style of an edge (legacy shorthand) */
export type EdgeStyle = 'arrow' | 'line' | 'dashed';

/** Line stroke style */
export type LineStyle = 'solid' | 'dashed' | 'dotted';

/** Arrow head direction */
export type ArrowHead = 'none' | 'start' | 'end' | 'both';

/** Edge routing style */
export type EdgeRouting = 'curve' | 'polyline';

/** A sticky note on the board */
export interface WemaNote {
  id: NoteId;
  x: number;
  y: number;
  width: number;
  height: number;
  text: string;
  color: string;
  zIndex: number;
  autoSize?: boolean;
  /**
   * Show only the beginning of a long text. A note with three lines or more
   * shows its first two lines and, over the faded third one, a link that
   * opens the rest ("Read more"); once open, a link under the text that
   * closes it again. A shorter note looks as usual.
   *
   * The height of such a note follows what it shows, like the size of an
   * `autoSize` note: `height` is measured, not set (the width is still
   * yours). Whether a note is open is a state of the display only: there is
   * no field for it, opening or closing a note emits no note event and is not
   * an undo step, and every note starts closed. The measured `height` does
   * follow it: `change` fires with the new height, and the next
   * `note:update` of the note reports it, as for an `autoSize` note that was
   * typed in.
   */
  foldable?: boolean;
  /**
   * Data of the embedding application, kept with the note. The board does not
   * read it: it stores it and hands it back (in `getNote()`, `exportData()`,
   * the note events and the history deltas, through undo and `applyRemote()`).
   * Only string values are kept. The object is frozen: to change it, pass a
   * new object to `updateNote()`, which replaces the whole of it
   * (`meta: undefined` removes it). Duplicating a note does not copy it.
   */
  meta?: Readonly<Record<string, string>>;
}

/** A connection line between two notes */
export interface WemaEdge {
  id: EdgeId;
  from: NoteId;
  to: NoteId;
  fromAnchor: Anchor;
  toAnchor: Anchor;
  style: EdgeStyle;
  label?: string;
  lineStyle?: LineStyle;
  strokeWidth?: number;
  arrowHead?: ArrowHead;
  arrowSize?: number;
  routing?: EdgeRouting;
  collapsed?: boolean;
}

/** Serializable board data */
export interface WemaBoardData {
  version: 1;
  notes: WemaNote[];
  edges: WemaEdge[];
  /**
   * Not used: the viewport is display state of each client, so `exportData()`
   * does not write it and `importData()` ignores it. Use `getViewport()` /
   * `setViewport()` to save and restore it yourself.
   */
  viewport?: { x: number; y: number; zoom: number };
}

/**
 * Which part of the board is shown. `x` / `y` are how far the board content
 * is moved, in screen pixels: a note at board position (nx, ny) is drawn at
 * (nx * zoom + x, ny * zoom + y) inside the board element. `zoom` is the
 * scale (1 = actual size).
 */
export interface WemaViewport {
  x: number;
  y: number;
  zoom: number;
}

/** Options for `revealNotes()`, `centerContent()` and `fitToContent()` */
export interface WemaViewportMoveOptions {
  /** Space to keep between the notes and the edge of the board, in screen pixels (default: 24) */
  padding?: number;
}

/** Options for `centerContent()` */
export interface WemaCenterOptions extends WemaViewportMoveOptions {
  /** Notes to center or fit (default: all shown notes) */
  noteIds?: NoteId[];
}

/** Options for `fitToContent()` */
export interface WemaFitOptions extends WemaCenterOptions {
  /**
   * Largest zoom to use (default: 1, so a few small notes are not enlarged).
   * The board's `minZoom` / `maxZoom` still apply.
   */
  maxZoom?: number;
}

/** A point on screen, as in a pointer event */
export interface WemaClientPoint {
  clientX: number;
  clientY: number;
}

/** Options for creating a WemaBoard */
export interface WemaBoardOptions {
  container: HTMLElement;
  data?: WemaBoardData;
  defaultNoteWidth?: number;
  defaultNoteHeight?: number;
  defaultNoteColor?: string;
  createOnDblClick?: boolean;
  readOnly?: boolean;
  viewOnly?: boolean;
  theme?: NoteTheme;
  /**
   * Upload an image picked by the user and resolve to its URL.
   * When set, the image is inserted with that URL instead of a data URL.
   */
  onImageUpload?: (file: File) => Promise<string>;
  /**
   * Called when a link inside a note is clicked, after the URL passed the
   * safety check (the browser's own navigation is already prevented).
   * `url` is the absolute URL the browser resolves the link to, not the raw
   * `href` attribute: compare its origin to tell in-site links apart
   * ("//other.example/x" is another site even though it starts with "/").
   * Return true to handle the click yourself; otherwise the link opens in a
   * new tab. Also called in readOnly and viewOnly.
   */
  onLinkClick?: (url: string, event: MouseEvent) => boolean | void;
  /**
   * Draw the inside of a note yourself. Called for every note when it is
   * created, when its `text` or `meta` changes (also by undo and
   * `applyRemote()`), and when `refreshNote()` is called. `container` is an
   * empty element inside the note: fill it and return true. Return anything
   * else to leave the note as an ordinary one, showing its `text`.
   *
   * A note drawn this way cannot be edited as text. Everything else works as
   * for any note: moving (by dragging the handle or anywhere in `container`),
   * resizing, selecting, deleting, edges, layout, filter. What you put in
   * `container` is not sanitized. Links, buttons and form controls in it
   * receive their clicks and do not start a drag; mark any other element
   * that should not start one with the attribute `data-wema-no-drag`.
   * Also called in readOnly and viewOnly.
   */
  renderNote?: (note: WemaNote, container: HTMLElement) => boolean | void;
  /**
   * Texts of the link under a `foldable` note: `more` opens the note
   * (default: "Read more"), `less` closes it (default: "Show less").
   */
  foldLabels?: { more?: string; less?: string };
  /**
   * Pan the board with the mouse wheel / trackpad scroll (default: true).
   * Set to false when the board sits in a page that should scroll instead.
   */
  wheelPan?: boolean;
  /**
   * Zoom the board with Ctrl / Cmd + wheel and the trackpad pinch
   * (default: true). When false, the browser zooms the page as usual.
   */
  wheelZoom?: boolean;
  /**
   * How far the user can pan away from the notes: the empty space shown
   * beyond the outermost shown notes, in screen pixels (default: 200). Notes
   * that fit in the board can be put anywhere inside it. Pass `Infinity` to
   * pan without a limit. Applies to the user's gestures (wheel, drag, double
   * click), not to `setViewport()` and the other methods; an empty board has
   * no limit.
   */
  panMargin?: number;
  /** Smallest zoom (default: 0.25) */
  minZoom?: number;
  /** Largest zoom (default: 2) */
  maxZoom?: number;
}

/**
 * A single atomic change to the board.
 * In an update, a key present in `before` but missing from `after` means
 * "reset to unset" (a key whose value is `undefined` disappears in JSON).
 */
export type HistoryDelta =
  | { type: 'note:create'; note: WemaNote }
  | { type: 'note:update'; noteId: NoteId; before: Partial<WemaNote>; after: Partial<WemaNote> }
  | { type: 'note:delete'; note: WemaNote }
  | { type: 'edge:create'; edge: WemaEdge }
  | { type: 'edge:update'; edgeId: EdgeId; before: Partial<WemaEdge>; after: Partial<WemaEdge> }
  | { type: 'edge:delete'; edge: WemaEdge };

/** What produced a committed set of deltas */
export type HistoryOrigin = 'user' | 'undo' | 'redo' | 'agent';

/** Whether a note/edge event came from this board or from `applyRemote()` */
export type ChangeOrigin = 'local' | 'remote';

/** Options for `WemaBoard.batch()` */
export interface WemaBatchOptions {
  /** Reported as the `origin` of the resulting `history:commit` (default: 'user') */
  origin?: 'user' | 'agent';
}

/** Event payloads emitted by WemaBoard */
export interface WemaEventMap {
  'note:create': { note: WemaNote; origin: ChangeOrigin };
  'note:update': { note: WemaNote; prev: WemaNote; origin: ChangeOrigin };
  'note:delete': { note: WemaNote; origin: ChangeOrigin };
  'note:select': { noteIds: NoteId[] };
  'edge:create': { edge: WemaEdge; origin: ChangeOrigin };
  'edge:update': { edge: WemaEdge; prev: WemaEdge; origin: ChangeOrigin };
  'edge:delete': { edge: WemaEdge; origin: ChangeOrigin };
  'readOnly:change': { readOnly: boolean };
  'viewOnly:change': { viewOnly: boolean };
  'history:change': { canUndo: boolean; canRedo: boolean };
  /** One user operation (one undo step) was committed, undone or redone */
  'history:commit': { deltas: HistoryDelta[]; origin: HistoryOrigin };
  /** `onImageUpload` rejected or returned an unusable URL; no image was inserted */
  'image:error': { noteId: NoteId; file: File; error: unknown };
  /** The viewport moved or its zoom changed (by the user or through the API). Does not emit `change`. */
  'viewport:change': WemaViewport;
  'change': { data: WemaBoardData };
}
