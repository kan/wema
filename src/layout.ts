import type { NoteId, WemaEdge } from './types.js';
import { NoteManager } from './note.js';

/**
 * Align notes along a specified axis.
 * Requires at least 2 notes; does nothing otherwise.
 */
export function alignNotes(
  noteManager: NoteManager,
  noteIds: NoteId[],
  alignment: 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom',
): void {
  if (noteIds.length < 2) return;

  const notes = noteIds
    .map((id) => noteManager.getNote(id))
    .filter((n) => n != null);
  if (notes.length < 2) return;

  switch (alignment) {
    case 'left': {
      const minX = Math.min(...notes.map((n) => n.x));
      for (const n of notes) {
        noteManager.updateNote(n.id, { x: minX });
      }
      break;
    }
    case 'center': {
      const avgCenterX =
        notes.reduce((sum, n) => sum + n.x + n.width / 2, 0) / notes.length;
      for (const n of notes) {
        noteManager.updateNote(n.id, { x: avgCenterX - n.width / 2 });
      }
      break;
    }
    case 'right': {
      const maxRight = Math.max(...notes.map((n) => n.x + n.width));
      for (const n of notes) {
        noteManager.updateNote(n.id, { x: maxRight - n.width });
      }
      break;
    }
    case 'top': {
      const minY = Math.min(...notes.map((n) => n.y));
      for (const n of notes) {
        noteManager.updateNote(n.id, { y: minY });
      }
      break;
    }
    case 'middle': {
      const avgCenterY =
        notes.reduce((sum, n) => sum + n.y + n.height / 2, 0) / notes.length;
      for (const n of notes) {
        noteManager.updateNote(n.id, { y: avgCenterY - n.height / 2 });
      }
      break;
    }
    case 'bottom': {
      const maxBottom = Math.max(...notes.map((n) => n.y + n.height));
      for (const n of notes) {
        noteManager.updateNote(n.id, { y: maxBottom - n.height });
      }
      break;
    }
  }
}

/**
 * Distribute notes evenly along an axis.
 * Requires at least 3 notes; does nothing otherwise.
 */
export function distributeNotes(
  noteManager: NoteManager,
  noteIds: NoteId[],
  direction: 'horizontal' | 'vertical',
): void {
  if (noteIds.length < 3) return;

  const notes = noteIds
    .map((id) => noteManager.getNote(id))
    .filter((n) => n != null);
  if (notes.length < 3) return;

  if (direction === 'horizontal') {
    // Sort by x position
    notes.sort((a, b) => a.x - b.x);
    const first = notes[0];
    const last = notes[notes.length - 1];
    const totalSpan = last.x + last.width - first.x;
    const totalNoteWidth = notes.reduce((sum, n) => sum + n.width, 0);
    const gap = (totalSpan - totalNoteWidth) / (notes.length - 1);

    let currentX = first.x + first.width + gap;
    for (let i = 1; i < notes.length - 1; i++) {
      noteManager.updateNote(notes[i].id, { x: currentX });
      currentX += notes[i].width + gap;
    }
  } else {
    // Sort by y position
    notes.sort((a, b) => a.y - b.y);
    const first = notes[0];
    const last = notes[notes.length - 1];
    const totalSpan = last.y + last.height - first.y;
    const totalNoteHeight = notes.reduce((sum, n) => sum + n.height, 0);
    const gap = (totalSpan - totalNoteHeight) / (notes.length - 1);

    let currentY = first.y + first.height + gap;
    for (let i = 1; i < notes.length - 1; i++) {
      noteManager.updateNote(notes[i].id, { y: currentY });
      currentY += notes[i].height + gap;
    }
  }
}

const H_GAP = 40;
const V_GAP = 60;
const LAYOUT_MARGIN = 40;

/**
 * Auto-layout notes using a BFS-based hierarchical layout.
 * Connected components form tree-like structures with children centered
 * under their parents. Disconnected notes are placed in a grid below.
 */
export function autoLayout(
  noteManager: NoteManager,
  edges: WemaEdge[],
  noteIds?: NoteId[],
): void {
  const allNotes = noteManager.getNotes();
  const targetIds = new Set(noteIds ?? allNotes.map((n) => n.id));
  const targetNotes = allNotes.filter((n) => targetIds.has(n.id));
  if (targetNotes.length === 0) return;

  // Build adjacency for target notes only
  const children = new Map<NoteId, NoteId[]>();
  const parents = new Map<NoteId, NoteId[]>();
  const inDegree = new Map<NoteId, number>();
  for (const id of targetIds) {
    children.set(id, []);
    parents.set(id, []);
    inDegree.set(id, 0);
  }

  // Track which nodes participate in any edge
  const connectedNodes = new Set<NoteId>();
  for (const edge of edges) {
    if (targetIds.has(edge.from) && targetIds.has(edge.to)) {
      children.get(edge.from)!.push(edge.to);
      parents.get(edge.to)!.push(edge.from);
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

  // Note width lookup (uses current/default sizes)
  const noteWidth = (id: NoteId): number => noteManager.getNote(id)?.width ?? 200;
  const noteHeight = (id: NoteId): number => noteManager.getNote(id)?.height ?? 150;

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
      noteManager.updateNote(id, { x: xPos.get(id)!, y: yOffset });
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
      noteManager.updateNote(note.id, { x: xOffset, y: yOffset });
      rowMaxHeight = Math.max(rowMaxHeight, note.height);
      xOffset += note.width + H_GAP;
      if ((i + 1) % cols === 0) {
        xOffset = LAYOUT_MARGIN;
        yOffset += rowMaxHeight + V_GAP;
        rowMaxHeight = 0;
      }
    }
  }
}
