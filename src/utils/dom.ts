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

/** Set multiple inline styles on an element */
export function setStyles(el: HTMLElement | SVGElement, styles: Partial<CSSStyleDeclaration>): void {
  Object.assign(el.style, styles);
}
