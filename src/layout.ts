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
/** Vertical gap between levels when the edges between them are close to vertical */
const V_GAP = 60;
/**
 * The gap between two levels grows with how far sideways the edges between
 * them reach, by this factor, up to `MAX_V_GAP`. Both follow from how an edge
 * is drawn (`computeEdgePath`): its curve runs vertically for 0.4 x its
 * length, at most 150px, at each end. A gap of 0.44 x the sideways reach is
 * where that run fits (0.4 / sqrt(1 - 0.4^2)).
 */
const FAN_SLOPE = 0.44;
const MAX_V_GAP = 150;
/** Gap between groups of connected notes that share no edge */
const GROUP_GAP = 80;
/**
 * Childless siblings wrap into several rows from this count. Edges to the
 * rows after the first run behind the rows above them, so a row stays one
 * row until it gets too wide to take in at a glance.
 */
const WRAP_MIN = 16;
/** Width / height that the packed groups aim for */
const TARGET_ASPECT = 1.6;
/** Down + up passes over the levels when positioning a group */
const SWEEPS = 4;
/**
 * How much more the slot of a passing edge counts than a note when both want
 * the same place. This approximates "notes make way for the slot": the slot
 * still gives way by about n / (PASSING_WEIGHT + n) of the distance when n
 * notes push against it.
 */
const PASSING_WEIGHT = 1000;

/** Notes placed relative to the top-left corner of the box around them */
interface Block {
  width: number;
  height: number;
  places: NotePosition[];
}

/**
 * What takes one slot in a level: a note, childless siblings wrapped into a
 * grid, or (with an empty block) the place where an edge passes the level
 */
interface Unit {
  block: Block;
  level: number;
  /** True for the slot of an edge that spans more than one level */
  passing: boolean;
  parents: Unit[];
  children: Unit[];
  /** Horizontal center, relative to the other units of the group */
  center: number;
}

/** The edges between the target notes, with the cycles removed */
interface Graph {
  /** The notes that have an edge, ordered by position */
  nodes: LayoutNote[];
  children: Map<NoteId, NoteId[]>;
  parentCount: Map<NoteId, number>;
  /** The ids of `nodes`, each one after all of its parents */
  order: NoteId[];
}

/** Left to right, then top to bottom: the order wherever nothing else decides */
const byPosition = (a: LayoutNote, b: LayoutNote): number => a.x - b.x || a.y - b.y;

const shifted = (places: NotePosition[], dx: number, dy: number): NotePosition[] =>
  places.map((p) => ({ id: p.id, x: p.x + dx, y: p.y + dy }));

/** Arrange notes in rows of `cols`, each column as wide as its widest note */
function gridBlock(notes: LayoutNote[], cols: number): Block {
  const colWidths: number[] = [];
  const rowHeights: number[] = [];
  notes.forEach((n, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    colWidths[col] = Math.max(colWidths[col] ?? 0, n.width);
    rowHeights[row] = Math.max(rowHeights[row] ?? 0, n.height);
  });
  const starts = (sizes: number[], gap: number): number[] => {
    let at = 0;
    return sizes.map((size) => {
      const start = at;
      at += size + gap;
      return start;
    });
  };
  const colX = starts(colWidths, H_GAP);
  const rowY = starts(rowHeights, V_GAP);
  const lastCol = colWidths.length - 1;
  const lastRow = rowHeights.length - 1;
  return {
    width: colX[lastCol] + colWidths[lastCol],
    height: rowY[lastRow] + rowHeights[lastRow],
    places: notes.map((n, i) => ({ id: n.id, x: colX[i % cols], y: rowY[Math.floor(i / cols)] })),
  };
}

/**
 * Centers that are as close to `desired` as possible (weighted least squares)
 * while keeping the given order and `H_GAP` between neighbors. Where items
 * push against each other, the heavier one stays closer to where it wants to be.
 */
function spread(widths: number[], desired: number[], weights: number[]): number[] {
  // offsets[i]: center of item i when the row is packed tight from 0
  const offsets: number[] = [];
  let left = 0;
  for (const width of widths) {
    offsets.push(left + width / 2);
    left += width + H_GAP;
  }
  // Pool adjacent violators: items that push against each other share one shift
  const runs: { sum: number; weight: number; count: number }[] = [];
  for (let i = 0; i < widths.length; i++) {
    let run = { sum: (desired[i] - offsets[i]) * weights[i], weight: weights[i], count: 1 };
    while (runs.length > 0) {
      const prev = runs[runs.length - 1];
      if (prev.sum / prev.weight <= run.sum / run.weight) break;
      run = { sum: prev.sum + run.sum, weight: prev.weight + run.weight, count: prev.count + run.count };
      runs.pop();
    }
    runs.push(run);
  }
  const centers: number[] = [];
  for (const run of runs) {
    for (let k = 0; k < run.count; k++) {
      centers.push(run.sum / run.weight + offsets[centers.length]);
    }
  }
  return centers;
}

/** Position the units of one level next to `neighbors` (their parents or their children) */
function settle(level: Unit[], neighbors: (unit: Unit) => Unit[]): void {
  const wanted = level.map((unit) => {
    // An edge that spans several levels is drawn as one line between its two
    // notes. Its ends line up with its slots, so that the line runs through
    // the slots and not behind the notes of the levels in between.
    const all = neighbors(unit);
    const slots = all.filter((u) => u.passing);
    const near = slots.length > 0 ? slots : all;
    const at = near.length > 0 ? near.reduce((sum, u) => sum + u.center, 0) / near.length : unit.center;
    return { unit, at };
  });
  // Sorting by the neighbors' position is what reduces edge crossings.
  // Array.prototype.sort is stable, so ties keep their order.
  wanted.sort((a, b) => a.at - b.at);
  const centers = spread(
    wanted.map((w) => w.unit.block.width),
    wanted.map((w) => w.at),
    // Notes make way for a passing edge, not the other way around
    wanted.map((w) => (w.unit.passing ? PASSING_WEIGHT : 1)),
  );
  wanted.forEach(({ unit }, i) => {
    unit.center = centers[i];
    level[i] = unit;
  });
}

/** Lay out the units of one group of connected notes, level by level */
function layoutGroup(units: Unit[]): Block {
  const levels: Unit[][] = [];
  for (const unit of units) {
    (levels[unit.level] ??= []).push(unit);
  }
  for (const level of levels) settle(level, () => []);

  // A level follows its parents on the way down and its children on the way
  // up. Ending on the way up puts each parent above the middle of its children.
  for (let sweep = 0; sweep < SWEEPS; sweep++) {
    for (let i = 1; i < levels.length; i++) settle(levels[i], (u) => u.parents);
    for (let i = levels.length - 2; i >= 0; i--) settle(levels[i], (u) => u.children);
  }

  // The box around the notes; the slot of a passing edge may lie outside it
  const filled = units.filter((u) => !u.passing);
  const left = Math.min(...filled.map((u) => u.center - u.block.width / 2));
  const right = Math.max(...filled.map((u) => u.center + u.block.width / 2));
  const places: NotePosition[] = [];
  let top = 0;
  let bottom = 0;
  for (const level of levels) {
    for (const unit of level) {
      places.push(...shifted(unit.block.places, unit.center - unit.block.width / 2 - left, top));
    }
    bottom = top + Math.max(...level.map((u) => u.block.height));
    top = bottom + gapBelow(level);
  }
  return { width: right - left, height: bottom, places };
}

/**
 * Vertical gap between a level and the next one. Edges that fan out far to
 * the side need a taller gap: an edge leaves and enters a note vertically,
 * and when the gap is shorter than that vertical run, the curve bends back
 * on itself and the edges of one parent cross each other.
 */
function gapBelow(level: Unit[]): number {
  let reach = 0;
  for (const unit of level) {
    if (unit.passing) continue;
    for (const child of unit.children) {
      if (!child.passing) reach = Math.max(reach, Math.abs(child.center - unit.center));
    }
  }
  return Math.min(Math.max(reach * FAN_SLOPE, V_GAP), MAX_V_GAP);
}

/** Put blocks side by side, starting a new row when `maxWidth` would be exceeded */
function packBlocks(blocks: Block[], maxWidth: number): Block {
  const places: NotePosition[] = [];
  let x = 0;
  let y = 0;
  let rowHeight = 0;
  let width = 0;
  for (const block of blocks) {
    if (x > 0 && x + block.width > maxWidth) {
      x = 0;
      y += rowHeight + GROUP_GAP;
      rowHeight = 0;
    }
    places.push(...shifted(block.places, x, y));
    width = Math.max(width, x + block.width);
    rowHeight = Math.max(rowHeight, block.height);
    x += block.width + GROUP_GAP;
  }
  return { width, height: y + rowHeight, places };
}

/** Width that gives `TARGET_ASPECT` to boxes of the given sizes, each padded by `gap` */
function targetWidth(sizes: { width: number; height: number }[], gap: number): number {
  const area = sizes.reduce((sum, s) => sum + (s.width + gap) * (s.height + gap), 0);
  return Math.sqrt(area * TARGET_ASPECT);
}

/**
 * Read the edges between `targets` (given in position order) as an acyclic
 * graph. Duplicate edges and self-loops are ignored. A depth-first search
 * drops the edges that close a cycle (an edge back to a note that is still
 * being visited).
 */
function buildGraph(targets: LayoutNote[], edges: LayoutEdge[]): Graph {
  const targetIds = new Set(targets.map((n) => n.id));
  const out = new Map<NoteId, Set<NoteId>>();
  const hasParent = new Set<NoteId>();
  for (const { from, to } of edges) {
    if (from === to || !targetIds.has(from) || !targetIds.has(to)) continue;
    if (!out.has(from)) out.set(from, new Set());
    out.get(from)!.add(to);
    hasParent.add(to);
  }
  const nodes = targets.filter((n) => out.has(n.id) || hasParent.has(n.id));

  const children = new Map<NoteId, NoteId[]>(nodes.map((n) => [n.id, []]));
  const parentCount = new Map<NoteId, number>(nodes.map((n) => [n.id, 0]));
  const seen = new Set<NoteId>();
  const visiting = new Set<NoteId>();
  const finished: NoteId[] = [];
  const stack: { id: NoteId; next: NoteId[]; at: number }[] = [];
  const enter = (id: NoteId): void => {
    seen.add(id);
    visiting.add(id);
    stack.push({ id, next: [...(out.get(id) ?? [])], at: 0 });
  };
  // Start from the notes nothing points to; what is left after that is cycles
  const roots = nodes.filter((n) => !hasParent.has(n.id));
  for (const { id: start } of [...roots, ...nodes]) {
    if (seen.has(start)) continue;
    enter(start);
    while (stack.length > 0) {
      const top = stack[stack.length - 1];
      if (top.at === top.next.length) {
        visiting.delete(top.id);
        finished.push(top.id);
        stack.pop();
        continue;
      }
      const child = top.next[top.at++];
      if (visiting.has(child)) continue;
      children.get(top.id)!.push(child);
      parentCount.set(child, parentCount.get(child)! + 1);
      if (!seen.has(child)) enter(child);
    }
  }
  return { nodes, children, parentCount, order: finished.reverse() };
}

/** Level = longest path from a root, so that every edge points downward */
function assignLevels({ nodes, children, parentCount, order }: Graph): Map<NoteId, number> {
  const levelOf = new Map<NoteId, number>(nodes.map((n) => [n.id, 0]));
  for (const id of order) {
    for (const child of children.get(id)!) {
      levelOf.set(child, Math.max(levelOf.get(child)!, levelOf.get(id)! + 1));
    }
  }
  // A root goes right above its nearest child instead of staying at the top
  for (const { id } of nodes) {
    const below = children.get(id)!;
    if (parentCount.get(id) === 0 && below.length > 0) {
      levelOf.set(id, Math.min(...below.map((c) => levelOf.get(c)!)) - 1);
    }
  }
  return levelOf;
}

/**
 * Make the units and link them along the edges. There is one unit per note,
 * except that many childless children of the same (only) parent share one
 * unit and wrap into a grid. An edge that skips levels gets a slot unit in
 * each level it passes.
 */
function buildUnits({ nodes, children, parentCount }: Graph, levelOf: Map<NoteId, number>): Map<NoteId, Unit> {
  const noteById = new Map(nodes.map((n) => [n.id, n]));
  const unitOf = new Map<NoteId, Unit>();
  const newUnit = (block: Block, level: number, passing = false): Unit => ({
    block,
    level,
    passing,
    parents: [],
    children: [],
    center: 0,
  });
  const link = (parent: Unit, child: Unit): void => {
    if (parent.children.includes(child)) return;
    parent.children.push(child);
    child.parents.push(parent);
  };

  for (const { id } of nodes) {
    const leaves = children
      .get(id)!
      .filter((c) => children.get(c)!.length === 0 && parentCount.get(c) === 1)
      .map((c) => noteById.get(c)!);
    if (leaves.length < WRAP_MIN) continue;
    leaves.sort(byPosition);
    const unit = newUnit(gridBlock(leaves, Math.ceil(Math.sqrt(leaves.length))), levelOf.get(id)! + 1);
    for (const leaf of leaves) unitOf.set(leaf.id, unit);
  }
  for (const n of nodes) {
    if (!unitOf.has(n.id)) unitOf.set(n.id, newUnit(gridBlock([n], 1), levelOf.get(n.id)!));
  }
  for (const { id } of nodes) {
    const unit = unitOf.get(id)!;
    for (const child of children.get(id)!) {
      const childUnit = unitOf.get(child)!;
      let above = unit;
      for (let level = unit.level + 1; level < childUnit.level; level++) {
        const slot = newUnit({ width: 0, height: 0, places: [] }, level, true);
        link(above, slot);
        above = slot;
      }
      link(above, childUnit);
    }
  }
  return unitOf;
}

/** Split the units into groups joined by edges, in the order of their first note */
function groupUnits(nodes: LayoutNote[], unitOf: Map<NoteId, Unit>): Unit[][] {
  const groups: Unit[][] = [];
  const grouped = new Set<Unit>();
  for (const { id } of nodes) {
    const first = unitOf.get(id)!;
    if (grouped.has(first)) continue;
    grouped.add(first);
    const group = [first];
    for (let i = 0; i < group.length; i++) {
      for (const near of [...group[i].parents, ...group[i].children]) {
        if (!grouped.has(near)) {
          grouped.add(near);
          group.push(near);
        }
      }
    }
    groups.push(group);
  }
  return groups;
}

/**
 * Compute an automatic layout from the connection lines.
 *
 * - Notes joined by edges form levels: every edge points to a lower level,
 *   a note with several parents sits below the middle of them, and the order
 *   within a level is chosen to keep edges from crossing
 * - An edge that skips levels gets room in the levels it passes, so that it
 *   does not run behind the notes there
 * - Many childless children of one note wrap into several rows
 * - Groups that share no edge are placed side by side and wrap into rows;
 *   notes without edges go in a grid below
 * - The current arrangement is the starting point: the result keeps the
 *   top-left corner of the area the notes occupy now, and ties are ordered
 *   by the notes' current position (left to right, then top to bottom)
 *
 * Pure function: does not touch the DOM. Returns a position for every
 * target note.
 */
export function computeAutoLayout(
  notes: LayoutNote[],
  edges: LayoutEdge[],
  options?: AutoLayoutOptions,
): NotePosition[] {
  const wanted = options?.noteIds ? new Set(options.noteIds) : null;
  const targets = notes.filter((n) => !wanted || wanted.has(n.id)).sort(byPosition);
  if (targets.length === 0) return [];

  const graph = buildGraph(targets, edges);
  const unitOf = buildUnits(graph, assignLevels(graph));
  const groups = groupUnits(graph.nodes, unitOf).map(layoutGroup);
  const packed = packBlocks(
    groups,
    Math.max(targetWidth(groups, GROUP_GAP), ...groups.map((g) => g.width)),
  );
  let places = packed.places;

  // Notes without edges go in a grid below, about as wide as the groups above
  const loose = targets.filter((n) => !unitOf.has(n.id));
  if (loose.length > 0) {
    const maxWidth = Math.max(packed.width, targetWidth(loose, H_GAP));
    const widest = Math.max(...loose.map((n) => n.width));
    const cols = Math.max(1, Math.min(loose.length, Math.floor((maxWidth + H_GAP) / (widest + H_GAP))));
    const top = groups.length > 0 ? packed.height + GROUP_GAP : 0;
    places = [...places, ...shifted(gridBlock(loose, cols).places, 0, top)];
  }

  // Keep the top-left corner of the area the notes occupy now
  const originX = Math.min(...targets.map((n) => n.x));
  const originY = Math.min(...targets.map((n) => n.y));
  return places.map((p) => ({ id: p.id, x: Math.round(originX + p.x), y: Math.round(originY + p.y) }));
}
