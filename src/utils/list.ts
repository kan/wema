/** Kind of list in a note's content. A checklist is a `<ul class="wema-checklist">`. */
export type ListType = 'ul' | 'ol' | 'checklist';

const CHECKLIST_CLASS = 'wema-checklist';
const CHECKED_CLASS = 'wema-checked';

/** Elements that show something without holding text */
const MEDIA_SELECTOR = 'img, iframe, video, audio, input';

/** A line of the content: what becomes one list item */
interface LineUnit {
  /** Nodes of the line. A `<div>` / `<p>` or a list is a line of its own, alone here. */
  nodes: Node[];
  /** Child index in the container where the line starts */
  start: number;
  /** Child index in the container where the line ends (the line break, if any, is here) */
  end: number;
  /** The `<br>` or "\n" text node that ends the line */
  terminator: Node | null;
}

function isElement(node: Node | null): node is HTMLElement {
  return node?.nodeType === Node.ELEMENT_NODE;
}

function isList(node: Node | null): node is HTMLElement {
  return isElement(node) && (node.tagName === 'UL' || node.tagName === 'OL');
}

function isItem(node: Node | null): node is HTMLElement {
  return isElement(node) && node.tagName === 'LI';
}

function isBlock(node: Node | null): node is HTMLElement {
  return isElement(node) && (node.tagName === 'DIV' || node.tagName === 'P');
}

function isBr(node: Node | null): boolean {
  return isElement(node) && node.tagName === 'BR';
}

function isNewline(node: Node | null): boolean {
  return node?.nodeType === Node.TEXT_NODE && (node as Text).data === '\n';
}

function childIndex(node: Node): number {
  return Array.prototype.indexOf.call(node.parentNode?.childNodes ?? [], node);
}

/** The siblings after a node, as a list that stays the same while they are moved */
function nextSiblings(node: Node): Node[] {
  const siblings: Node[] = [];
  for (let next = node.nextSibling; next; next = next.nextSibling) siblings.push(next);
  return siblings;
}

/** Closest ancestor (or self) matching the selector, inside the content element */
function closestIn(content: HTMLElement, node: Node, selector: string): HTMLElement | null {
  const el = isElement(node) ? node : node.parentElement;
  const found = el?.closest<HTMLElement>(selector) ?? null;
  return found && found !== content && content.contains(found) ? found : null;
}

/** Whether the range starts inside a list item of the content element */
export function isInListItem(content: HTMLElement, range: Range): boolean {
  return closestIn(content, range.startContainer, 'li') !== null;
}

/** Determine the logical list type of a DOM list element */
export function getListType(list: Element): ListType {
  if (list.tagName === 'OL') return 'ol';
  if (list.classList.contains(CHECKLIST_CLASS)) return 'checklist';
  return 'ul';
}

/** Create an empty list element of the given type */
function createList(listType: ListType): HTMLElement {
  const list = document.createElement(listType === 'ol' ? 'ol' : 'ul');
  if (listType === 'checklist') list.classList.add(CHECKLIST_CLASS);
  return list;
}

/** Give a list item the checkbox its list type needs, or take it away */
function adaptItem(li: HTMLElement, listType: ListType): void {
  const cb = li.querySelector(':scope > input[type="checkbox"]');
  if (listType === 'checklist') {
    if (cb) return;
    const input = document.createElement('input');
    input.type = 'checkbox';
    li.insertBefore(input, li.firstChild);
  } else {
    cb?.remove();
    li.classList.remove(CHECKED_CLASS);
  }
}

/** Create an empty item for a list of the given type (with its checkbox in a checklist) */
export function createListItem(listType: ListType): HTMLLIElement {
  const li = document.createElement('li');
  adaptItem(li, listType);
  return li;
}

/** Move nodes (the children of a list) into a list, adapting the items to its type */
function moveItems(nodes: Iterable<Node>, to: HTMLElement, before: Node | null = null): void {
  const listType = getListType(to);
  for (const node of Array.from(nodes)) {
    if (isItem(node)) adaptItem(node, listType);
    to.insertBefore(node, before);
  }
}

/** The boundaries of a range, remembered by `saveRange` */
interface SavedRange {
  restore(content: HTMLElement, fallback: Node, stale?: Node): Range;
}

/**
 * Moving a node resets the range boundaries inside it. Remember them, and
 * build the range again afterwards. A boundary that pointed at a node which
 * is gone (or at `stale`, whose child offsets changed) falls back to the end
 * of `fallback`.
 */
function saveRange(range: Range): SavedRange {
  const { startContainer, startOffset, endContainer, endOffset } = range;
  return {
    restore(content, fallback, stale) {
      const usable = (node: Node): boolean => node !== content && node !== stale && content.contains(node);
      const restored = document.createRange();
      if (usable(startContainer) && usable(endContainer)) {
        restored.setStart(startContainer, startOffset);
        restored.setEnd(endContainer, endOffset);
      } else {
        restored.selectNodeContents(fallback);
        restored.collapse(false);
      }
      return restored;
    },
  };
}

/**
 * Split the text nodes directly under the content element so that each "\n"
 * is a node of its own. The content element keeps line feeds
 * (`white-space: pre-wrap`), so they end a line just like a `<br>`.
 */
function splitNewlines(content: HTMLElement): void {
  for (const child of Array.from(content.childNodes)) {
    if (child.nodeType !== Node.TEXT_NODE) continue;
    let text = child as Text;
    let idx: number;
    while ((idx = text.data.indexOf('\n')) !== -1) {
      if (idx > 0) text = text.splitText(idx);
      if (text.data.length === 1) break;
      text = text.splitText(1);
    }
  }
}

/** Break the children of a container into lines */
function collectUnits(container: HTMLElement): LineUnit[] {
  const units: LineUnit[] = [];
  let nodes: Node[] = [];
  let start = 0;
  const children = Array.from(container.childNodes);
  children.forEach((child, i) => {
    if (isBr(child) || isNewline(child)) {
      units.push({ nodes, start, end: i, terminator: child });
    } else if (isBlock(child) || isList(child)) {
      if (nodes.length > 0) units.push({ nodes, start, end: i, terminator: null });
      units.push({ nodes: [child], start: i, end: i + 1, terminator: null });
    } else {
      nodes.push(child);
      return;
    }
    nodes = [];
    start = i + 1;
  });
  if (nodes.length > 0 || units.length === 0) {
    units.push({ nodes, start, end: children.length, terminator: null });
  }
  return units;
}

/** Whether a node shows nothing (white space, `<br>`, or an element holding only those) */
function isBlankNode(node: Node): boolean {
  if (node.nodeType === Node.TEXT_NODE) return (node as Text).data.trim() === '';
  if (!isElement(node)) return true;
  return node.textContent?.trim() === ''
    && !node.matches(MEDIA_SELECTOR) && !node.querySelector(MEDIA_SELECTOR);
}

function isBlankUnit(unit: LineUnit): boolean {
  return !isList(unit.nodes[0] ?? null) && unit.nodes.every(isBlankNode);
}

/**
 * The element whose children are the lines to work on: the content element,
 * or a `<div>` / `<p>` in it that holds the whole range and more than one line.
 */
function findLineContainer(content: HTMLElement, range: Range): HTMLElement {
  let container = closestIn(content, range.commonAncestorContainer, 'div, p');
  while (container) {
    const lines = collectUnits(container).filter((u) => !isBlankUnit(u));
    if (lines.length > 1 && !closestIn(content, container, 'li')) return container;
    container = container.parentElement ? closestIn(content, container.parentElement, 'div, p') : null;
  }
  return content;
}

/** A range boundary, moved out of a "\n" node so that it can be compared with line positions */
function boundary(container: HTMLElement, node: Node, offset: number): Range {
  const point = document.createRange();
  if (isNewline(node) && node.parentNode === container) {
    point.setStart(container, childIndex(node) + offset);
  } else {
    point.setStart(node, offset);
  }
  point.collapse(true);
  return point;
}

/** The lines the range covers. A caret covers the one line it is on. */
function selectUnits(container: HTMLElement, units: LineUnit[], range: Range): LineUnit[] {
  const start = boundary(container, range.startContainer, range.startOffset);
  const end = boundary(container, range.endContainer, range.endOffset);
  if (range.collapsed) {
    const startsBefore = units.filter((u) => end.comparePoint(container, u.start) <= 0);
    const on = startsBefore.find((u) => start.comparePoint(container, u.end) >= 0);
    const unit = on ?? startsBefore[startsBefore.length - 1] ?? units[0];
    return unit ? [unit] : [];
  }
  // A selection that ends at the very start of a line does not cover that line.
  // The end may be inside the line (offset 0 of its text or of its <div>), so
  // look at what lies between the start of the line and the end of the selection.
  const reaches = (u: LineUnit): boolean => {
    if (end.comparePoint(container, u.start) > 0) return false;
    const head = document.createRange();
    head.setStart(container, u.start);
    head.setEnd(end.startContainer, end.startOffset);
    return head.toString() !== '' || head.cloneContents().querySelector(MEDIA_SELECTOR) !== null;
  };
  // When a line is reached, so are all the lines before it
  let count = units.length;
  while (count > 0 && !reaches(units[count - 1])) count--;
  const covered = units.slice(0, count).filter((u) => start.comparePoint(container, u.end) >= 0);
  if (covered.length > 0) return covered;
  // Nothing but line breaks is selected: treat it as a caret
  const caret = range.cloneRange();
  caret.collapse(true);
  return selectUnits(container, units, caret);
}

/**
 * Turn the items of a list that the range covers back into plain lines (the
 * item of the caret when nothing is selected). The items before them stay in
 * the list, and the items after them go to a list of their own. A sub-list of
 * an item is kept as a list, right after the line of the item.
 *
 * @returns the range to select afterwards, or null when nothing changed
 */
function unwrapItems(content: HTMLElement, list: HTMLElement, range: Range, saved: SavedRange): Range | null {
  const items = Array.from(list.childNodes).filter(isItem).filter((li) => range.intersectsNode(li));
  const last = items[items.length - 1];
  const parent = list.parentNode;
  if (!last || !parent) return null;

  const followers = nextSiblings(last);
  if (followers.some(isItem)) {
    const tail = list.cloneNode(false) as HTMLElement;
    moveItems(followers, tail);
    parent.insertBefore(tail, list.nextSibling);
  }

  const before = list.nextSibling;
  const lines = items.map((item) => {
    // A line is a <div>: it breaks the line wherever the list was
    const line = document.createElement('div');
    parent.insertBefore(line, before);
    // Take the checkbox of a checklist item away: a plain line has none
    adaptItem(item, 'ul');
    for (const child of Array.from(item.childNodes)) {
      if (isList(child)) parent.insertBefore(child, before);
      else line.appendChild(child);
    }
    // An empty <div> has no height: the <br> keeps the line open
    if (!line.firstChild) line.appendChild(document.createElement('br'));
    item.remove();
    return line;
  });
  if (!list.firstElementChild) list.remove();
  return saved.restore(content, lines[lines.length - 1] ?? content);
}

/**
 * Toggle a list on the lines the range covers.
 *
 * - Outside a list: the lines become a list, one item per line. A caret turns
 *   the line it is on.
 * - Inside a list of another type: that list is converted to the given type.
 * - Inside a list of the given type: the items the range covers become plain
 *   lines again.
 *
 * @returns the range to select afterwards, or null when nothing changed
 */
export function toggleList(content: HTMLElement, range: Range, listType: ListType): Range | null {
  // Splitting moves the range boundaries, so it comes before they are saved
  splitNewlines(content);
  const saved = saveRange(range);

  const current = closestIn(content, range.commonAncestorContainer, 'ul, ol');
  if (current) {
    if (getListType(current) === listType) return unwrapItems(content, current, range, saved);
    const converted = createList(listType);
    moveItems(current.childNodes, converted);
    current.replaceWith(converted);
    return saved.restore(content, converted);
  }

  const container = findLineContainer(content, range);
  const units = selectUnits(container, collectUnits(container), range);
  const first = units[0];
  if (!first) return null;

  const list = createList(listType);
  container.insertBefore(list, first.nodes[0] ?? first.terminator);

  for (const unit of units) {
    const source = unit.nodes[0];
    if (isList(source)) {
      moveItems(source.childNodes, list);
      source.remove();
      continue;
    }
    // An empty line among the selected lines makes no item
    if (units.length > 1 && isBlankUnit(unit)) {
      for (const node of unit.nodes) node.parentNode?.removeChild(node);
      unit.terminator?.parentNode?.removeChild(unit.terminator);
      continue;
    }
    const li = document.createElement('li');
    if (isBlock(source)) {
      while (source.firstChild) li.appendChild(source.firstChild);
      // The <br> that keeps an empty line open is not needed in an item
      if (isBr(li.lastChild)) li.lastChild?.remove();
      source.remove();
    } else {
      for (const node of unit.nodes) li.appendChild(node);
      unit.terminator?.parentNode?.removeChild(unit.terminator);
    }
    adaptItem(li, listType);
    list.appendChild(li);
  }

  // Only empty lines were selected: leave one empty item to type in
  if (!list.firstChild) list.appendChild(createListItem(listType));

  // Join with a list of the same type right before or after
  const prev = list.previousSibling;
  if (isList(prev) && getListType(prev) === listType) {
    moveItems(prev.childNodes, list, list.firstChild);
    prev.remove();
  }
  const next = list.nextSibling;
  if (isList(next) && getListType(next) === listType) {
    moveItems(next.childNodes, list);
    next.remove();
  }

  return saved.restore(content, list.lastElementChild ?? list, container);
}

/**
 * Add an empty item at the end of the content, in the list that ends it when
 * that list has the given type, or in a new list.
 *
 * @returns the range to select afterwards (a caret in the new item)
 */
export function appendListItem(content: HTMLElement, listType: ListType): Range {
  const last = content.lastChild;
  const list = isList(last) && getListType(last) === listType ? last : createList(listType);
  if (list !== last) content.appendChild(list);
  const li = list.appendChild(createListItem(listType));
  const caret = document.createRange();
  caret.selectNodeContents(li);
  caret.collapse(false);
  return caret;
}

/** The list items the range covers. An item inside another covered item is left out. */
function selectItems(content: HTMLElement, range: Range): HTMLElement[] {
  const first = closestIn(content, range.startContainer, 'li');
  const last = closestIn(content, range.endContainer, 'li');
  if (!first || !last) return [];
  if (last.contains(first)) return [last];
  const all = Array.from(content.querySelectorAll<HTMLElement>('li'));
  const covered = all.slice(all.indexOf(first), all.indexOf(last) + 1);
  return covered.filter((li) => !covered.some((other) => other !== li && other.contains(li)));
}

/** The list at the end of an item that holds its sub-items, created when missing */
function subListOf(li: HTMLElement, like: HTMLElement): HTMLElement {
  if (isList(li.lastElementChild)) return li.lastElementChild;
  const sub = like.cloneNode(false) as HTMLElement;
  li.appendChild(sub);
  return sub;
}

/**
 * Indent the list items the range covers: each becomes a sub-item of the
 * item before it. The first item of a list has nothing to go under and stays.
 *
 * @returns the range to select afterwards, or null when nothing changed
 */
export function indentListItems(content: HTMLElement, range: Range): Range | null {
  const saved = saveRange(range);
  let moved: HTMLElement | null = null;
  for (const li of selectItems(content, range)) {
    const list = li.parentElement;
    const prev = li.previousElementSibling;
    if (!list || !isItem(prev)) continue;
    const sub = subListOf(prev, list);
    adaptItem(li, getListType(sub));
    sub.appendChild(li);
    moved = li;
  }
  return moved ? saved.restore(content, moved) : null;
}

/**
 * Outdent the list items the range covers: each moves out of its sub-list to
 * right after the item it was under. The items that followed it in the
 * sub-list become its own sub-items, so the order of the lines is kept.
 * An item of a top-level list stays.
 *
 * @returns the range to select afterwards, or null when nothing changed
 */
export function outdentListItems(content: HTMLElement, range: Range): Range | null {
  const saved = saveRange(range);
  let moved: HTMLElement | null = null;
  for (const li of selectItems(content, range)) {
    const list = li.parentElement;
    const host = list?.parentElement;
    if (!list || !host || host === content || !content.contains(host)) continue;
    // A sub-list is normally inside an item; some HTML puts it right under the list
    const after = host.tagName === 'LI' ? host : isList(host) ? list : null;
    const outer = after?.parentElement;
    if (!after || !outer) continue;

    const followers = nextSiblings(li);
    if (followers.length > 0) moveItems(followers, subListOf(li, list));
    adaptItem(li, getListType(outer));
    outer.insertBefore(li, after.nextSibling);
    if (!list.firstElementChild) list.remove();
    moved = li;
  }
  return moved ? saved.restore(content, moved) : null;
}
