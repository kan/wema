import type { NoteId, WemaNote, WemaEdge } from './types.js';

/** The part of a note the layout functions read */
export type LayoutNote = Pick<WemaNote, 'id' | 'x' | 'y' | 'width' | 'height'>;

/** The part of an edge the layout functions read */
export type LayoutEdge = Pick<WemaEdge, 'from' | 'to'>;

/** A new position for a note, as computed by a layout function */
export interface NotePosition {
  id: NoteId;
  x: number;
  y: number;
}

/** Axis and side used by `computeAlignment` */
export type NoteAlignment = 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom';

/** Axis used by `computeDistribution` */
export type DistributeDirection = 'horizontal' | 'vertical';

/** Options for `computeAutoLayout` */
export interface AutoLayoutOptions {
  /** Lay out only these notes (default: all notes) */
  noteIds?: NoteId[];
}

/**
 * Compute positions that align notes along a specified axis.
 * Pure function: does not touch the DOM. Returns a position for every note,
 * or an empty array when fewer than 2 notes are given.
 */
export function computeAlignment(notes: LayoutNote[], alignment: NoteAlignment): NotePosition[] {
  if (notes.length < 2) return [];

  switch (alignment) {
    case 'left': {
      const minX = Math.min(...notes.map((n) => n.x));
      return notes.map((n) => ({ id: n.id, x: minX, y: n.y }));
    }
    case 'center': {
      const avgCenterX =
        notes.reduce((sum, n) => sum + n.x + n.width / 2, 0) / notes.length;
      return notes.map((n) => ({ id: n.id, x: avgCenterX - n.width / 2, y: n.y }));
    }
    case 'right': {
      const maxRight = Math.max(...notes.map((n) => n.x + n.width));
      return notes.map((n) => ({ id: n.id, x: maxRight - n.width, y: n.y }));
    }
    case 'top': {
      const minY = Math.min(...notes.map((n) => n.y));
      return notes.map((n) => ({ id: n.id, x: n.x, y: minY }));
    }
    case 'middle': {
      const avgCenterY =
        notes.reduce((sum, n) => sum + n.y + n.height / 2, 0) / notes.length;
      return notes.map((n) => ({ id: n.id, x: n.x, y: avgCenterY - n.height / 2 }));
    }
    case 'bottom': {
      const maxBottom = Math.max(...notes.map((n) => n.y + n.height));
      return notes.map((n) => ({ id: n.id, x: n.x, y: maxBottom - n.height }));
    }
  }
}

/**
 * Compute positions that distribute notes evenly along an axis.
 * Pure function: does not touch the DOM. The first and last notes stay in
 * place, so only the notes in between are returned. Returns an empty array
 * when fewer than 3 notes are given.
 */
export function computeDistribution(notes: LayoutNote[], direction: DistributeDirection): NotePosition[] {
  if (notes.length < 3) return [];

  const positions: NotePosition[] = [];
  if (direction === 'horizontal') {
    const sorted = [...notes].sort((a, b) => a.x - b.x);
    const first = sorted[0];
    const last = sorted[sorted.length - 1];
    const totalSpan = last.x + last.width - first.x;
    const totalNoteWidth = sorted.reduce((sum, n) => sum + n.width, 0);
    const gap = (totalSpan - totalNoteWidth) / (sorted.length - 1);

    let currentX = first.x + first.width + gap;
    for (let i = 1; i < sorted.length - 1; i++) {
      positions.push({ id: sorted[i].id, x: currentX, y: sorted[i].y });
      currentX += sorted[i].width + gap;
    }
  } else {
    const sorted = [...notes].sort((a, b) => a.y - b.y);
    const first = sorted[0];
    const last = sorted[sorted.length - 1];
    const totalSpan = last.y + last.height - first.y;
    const totalNoteHeight = sorted.reduce((sum, n) => sum + n.height, 0);
    const gap = (totalSpan - totalNoteHeight) / (sorted.length - 1);

    let currentY = first.y + first.height + gap;
    for (let i = 1; i < sorted.length - 1; i++) {
      positions.push({ id: sorted[i].id, x: sorted[i].x, y: currentY });
      currentY += sorted[i].height + gap;
    }
  }
  return positions;
}

const H_GAP = 40;
const V_GAP = 60;
const LAYOUT_MARGIN = 40;

/**
 * Compute an automatic layout using a BFS-based hierarchical layout.
 * Connected components form tree-like structures with children centered
 * under their parents. Disconnected notes are placed in a grid below.
 * Pure function: does not touch the DOM. Returns a position for every
 * target note.
 */
export function computeAutoLayout(
  notes: LayoutNote[],
  edges: LayoutEdge[],
  options?: AutoLayoutOptions,
): NotePosition[] {
  const targetIds = new Set(options?.noteIds ?? notes.map((n) => n.id));
  const targetNotes = notes.filter((n) => targetIds.has(n.id));
  if (targetNotes.length === 0) return [];

  const positions: NotePosition[] = [];
  const noteById = new Map(notes.map((n) => [n.id, n]));

  // Build adjacency for target notes only
  const children = new Map<NoteId, NoteId[]>();
  const inDegree = new Map<NoteId, number>();
  for (const id of targetIds) {
    children.set(id, []);
    inDegree.set(id, 0);
  }

  // Track which nodes participate in any edge
  const connectedNodes = new Set<NoteId>();
  for (const edge of edges) {
    if (targetIds.has(edge.from) && targetIds.has(edge.to)) {
      children.get(edge.from)!.push(edge.to);
      inDegree.set(edge.to, (inDegree.get(edge.to) ?? 0) + 1);
      connectedNodes.add(edge.from);
      connectedNodes.add(edge.to);
    }
  }

  // BFS to assign levels starting from roots (in-degree 0 among connected nodes)
  const levels = new Map<NoteId, number>();
  const queue: NoteId[] = [];

  for (const id of connectedNodes) {
    if (inDegree.get(id) === 0) {
      levels.set(id, 0);
      queue.push(id);
    }
  }

  // Handle cycles: if all connected nodes have in-degree > 0, pick one as root
  if (queue.length === 0 && connectedNodes.size > 0) {
    const first = connectedNodes.values().next().value!;
    levels.set(first, 0);
    queue.push(first);
  }

  while (queue.length > 0) {
    const current = queue.shift()!;
    const currentLevel = levels.get(current)!;
    for (const child of children.get(current) ?? []) {
      if (!levels.has(child)) {
        levels.set(child, currentLevel + 1);
        queue.push(child);
      }
    }
  }

  // Group connected nodes by level
  const levelGroups = new Map<number, NoteId[]>();
  for (const [id, level] of levels) {
    if (!levelGroups.has(level)) levelGroups.set(level, []);
    levelGroups.get(level)!.push(id);
  }
  const sortedLevels = Array.from(levelGroups.keys()).sort((a, b) => a - b);

  // Disconnected nodes (no edges)
  const disconnected = targetNotes.filter((n) => !connectedNodes.has(n.id));

  // --- Tree layout: position children centered under parents ---

  // Note size lookup (uses current/default sizes)
  const noteWidth = (id: NoteId): number => noteById.get(id)?.width ?? 200;
  const noteHeight = (id: NoteId): number => noteById.get(id)?.height ?? 150;

  // Phase 1: Compute subtree widths bottom-up
  // subtreeWidth[id] = total horizontal space needed for this node and all descendants
  const subtreeWidth = new Map<NoteId, number>();

  function computeSubtreeWidth(id: NoteId): number {
    if (subtreeWidth.has(id)) return subtreeWidth.get(id)!;

    const childIds = (children.get(id) ?? []).filter((c) => levels.has(c) && levels.get(c)! > levels.get(id)!);
    if (childIds.length === 0) {
      const w = noteWidth(id);
      subtreeWidth.set(id, w);
      return w;
    }

    let totalChildWidth = 0;
    for (const child of childIds) {
      totalChildWidth += computeSubtreeWidth(child);
    }
    totalChildWidth += H_GAP * (childIds.length - 1);

    const w = Math.max(noteWidth(id), totalChildWidth);
    subtreeWidth.set(id, w);
    return w;
  }

  // Phase 2: Assign x positions top-down
  // Each node's center is placed in the center of its allocated subtree space
  const xPos = new Map<NoteId, number>();

  function assignX(id: NoteId, leftBound: number): void {
    const stw = subtreeWidth.get(id) ?? noteWidth(id);
    const nw = noteWidth(id);
    // Center this node in its subtree space
    xPos.set(id, leftBound + (stw - nw) / 2);

    const childIds = (children.get(id) ?? []).filter((c) => levels.has(c) && levels.get(c)! > levels.get(id)!);
    if (childIds.length === 0) return;

    let childLeft = leftBound;
    for (const child of childIds) {
      assignX(child, childLeft);
      childLeft += (subtreeWidth.get(child) ?? noteWidth(child)) + H_GAP;
    }
  }

  // Sort level-0 nodes (roots) and compute their subtree widths
  const roots = sortedLevels.length > 0 ? (levelGroups.get(sortedLevels[0]) ?? []) : [];

  // Order nodes within level 0 by their subtree width (largest first) for stable layout
  for (const root of roots) {
    computeSubtreeWidth(root);
  }

  // Assign x for each root tree, placed side by side
  let rootLeft = LAYOUT_MARGIN;
  for (const root of roots) {
    assignX(root, rootLeft);
    rootLeft += (subtreeWidth.get(root) ?? noteWidth(root)) + H_GAP * 2;
  }

  // For connected nodes that weren't reached by tree traversal (e.g., cycle members),
  // place them at the end of their level row
  for (const level of sortedLevels) {
    const ids = levelGroups.get(level)!;
    for (const id of ids) {
      if (!xPos.has(id)) {
        xPos.set(id, rootLeft);
        rootLeft += noteWidth(id) + H_GAP;
      }
    }
  }

  // Assign y positions by level
  let yOffset = LAYOUT_MARGIN;
  for (const level of sortedLevels) {
    const ids = levelGroups.get(level)!;
    for (const id of ids) {
      positions.push({ id, x: xPos.get(id)!, y: yOffset });
    }
    const maxHeight = Math.max(...ids.map((id) => noteHeight(id)));
    yOffset += maxHeight + V_GAP;
  }

  // Layout disconnected notes in a grid below the connected ones
  if (disconnected.length > 0) {
    const cols = Math.max(1, Math.ceil(Math.sqrt(disconnected.length)));
    let xOffset = LAYOUT_MARGIN;
    let rowMaxHeight = 0;
    for (let i = 0; i < disconnected.length; i++) {
      const note = disconnected[i];
      positions.push({ id: note.id, x: xOffset, y: yOffset });
      rowMaxHeight = Math.max(rowMaxHeight, note.height);
      xOffset += note.width + H_GAP;
      if ((i + 1) % cols === 0) {
        xOffset = LAYOUT_MARGIN;
        yOffset += rowMaxHeight + V_GAP;
        rowMaxHeight = 0;
      }
    }
  }

  return positions;
}
