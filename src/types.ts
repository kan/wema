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
  viewport?: { x: number; y: number; zoom: number };
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
}

/** Event payloads emitted by WemaBoard */
export interface WemaEventMap {
  'note:create': { note: WemaNote };
  'note:update': { note: WemaNote; prev: WemaNote };
  'note:delete': { note: WemaNote };
  'note:select': { noteIds: NoteId[] };
  'edge:create': { edge: WemaEdge };
  'edge:update': { edge: WemaEdge; prev: WemaEdge };
  'edge:delete': { edge: WemaEdge };
  'readOnly:change': { readOnly: boolean };
  'viewOnly:change': { viewOnly: boolean };
  'history:change': { canUndo: boolean; canRedo: boolean };
  'change': { data: WemaBoardData };
}
