/** Create an HTML element with optional class name */
export function createElement<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (className) el.className = className;
  return el;
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

/** Set multiple inline styles on an element */
export function setStyles(el: HTMLElement | SVGElement, styles: Partial<CSSStyleDeclaration>): void {
  Object.assign(el.style, styles);
}
