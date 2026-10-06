import { type Box, type OverlaySide, placeOverlayBox } from './geometry.js';

/** Create an HTML element with optional class name */
export function createElement<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (className) el.className = className;
  return el;
}

/**
 * Describe a control that shows an icon instead of a text: the tooltip, and
 * the same text for screen readers
 */
export function setLabel(el: HTMLElement, label: string): void {
  el.title = label;
  el.setAttribute('aria-label', label);
}

/**
 * Position an overlay (a child of the board element) next to `target`, kept
 * inside the part of the board that is on screen. `target` is in screen
 * coordinates (pixels inside the board element). The overlay must be
 * displayed, or its size reads as 0. Returns the box the overlay takes.
 */
export function placeOverlay(
  el: HTMLElement,
  boardEl: HTMLElement,
  target: Box,
  side: OverlaySide,
  gap: number,
): Box {
  // The board may reach beyond the window when the page scrolls
  const board = boardEl.getBoundingClientRect();
  const root = document.documentElement;
  const bounds = {
    left: Math.max(0, -board.left),
    top: Math.max(0, -board.top),
    right: Math.min(boardEl.clientWidth, root.clientWidth - board.left),
    bottom: Math.min(boardEl.clientHeight, root.clientHeight - board.top),
  };
  const size = { width: el.offsetWidth, height: el.offsetHeight };
  const { x, y } = placeOverlayBox(size, target, bounds, side, gap);
  el.style.left = `${x}px`;
  el.style.top = `${y}px`;
  return { left: x, top: y, right: x + size.width, bottom: y + size.height };
}

/** The box of an element or a range in screen coordinates (pixels inside the board element) */
export function screenBoxOf(source: Element | Range, boardEl: HTMLElement): Box {
  const rect = source.getBoundingClientRect();
  const board = boardEl.getBoundingClientRect();
  return {
    left: rect.left - board.left,
    top: rect.top - board.top,
    right: rect.right - board.left,
    bottom: rect.bottom - board.top,
  };
}

/** Create an SVG element with optional class name */
export function createSvgElement<K extends keyof SVGElementTagNameMap>(
  tag: K,
  className?: string,
): SVGElementTagNameMap[K] {
  const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
  if (className) el.setAttribute('class', className);
  return el;
}

/**
 * Elements that take typing: the text of a note, and form fields (a host may
 * put them in a note it draws). While one of them has the focus, the board
 * leaves the keyboard and the focus to it.
 */
export const TYPING_SELECTOR = '[contenteditable]:not([contenteditable="false"]), input, textarea, select';

/** The current selection as a range, or null unless it is inside the element */
export function getSelectionRange(el: HTMLElement): Range | null {
  const sel = document.getSelection();
  if (!sel || sel.rangeCount === 0) return null;
  const range = sel.getRangeAt(0);
  return el.contains(range.commonAncestorContainer) ? range : null;
}

/** Make the range the current selection */
export function setSelectionRange(range: Range): void {
  const sel = document.getSelection();
  if (!sel) return;
  sel.removeAllRanges();
  sel.addRange(range);
}

/** Set multiple inline styles on an element */
export function setStyles(el: HTMLElement | SVGElement, styles: Partial<CSSStyleDeclaration>): void {
  Object.assign(el.style, styles);
}
