/** Allowed tags for rich-text content in notes */
const ALLOWED_TAGS = new Set([
  'b', 'strong', 'i', 'em', 'u', 's', 'br', 'span',
  'ul', 'ol', 'li', 'a', 'input', 'img', 'iframe', 'video', 'audio', 'div', 'p',
]);

/** Allowed attributes per tag (in addition to 'class' and 'style' which are global) */
const TAG_ATTRIBUTES: Record<string, Set<string>> = {
  a: new Set(['href', 'target', 'rel']),
  input: new Set(['type', 'checked']),
  img: new Set(['src', 'alt', 'width', 'height']),
  iframe: new Set(['src', 'width', 'height', 'sandbox', 'allow', 'allowfullscreen', 'frameborder', 'title']),
  video: new Set(['src', 'controls', 'preload', 'width', 'height', 'poster']),
  audio: new Set(['src', 'controls', 'preload']),
};

/** Tags that should be completely removed (including children) */
const REMOVE_TAGS = new Set(['script', 'style', 'noscript', 'object', 'embed', 'applet']);

/** CSS properties allowed in inline style */
const ALLOWED_CSS_PROPS = new Set([
  'color', 'background-color', 'font-size', 'font-weight', 'font-style',
  'text-decoration', 'text-align', 'margin', 'padding', 'display',
  'list-style-type', 'white-space',
]);

/**
 * Sanitize an HTML string by removing disallowed tags, attributes,
 * and dangerous content (event handlers, javascript: URLs).
 */
export function sanitizeHtml(html: string): string {
  const parser = new DOMParser();
  const doc = parser.parseFromString(`<body>${html}</body>`, 'text/html');
  const body = doc.body;

  walkAndSanitize(body);

  return body.innerHTML;
}

function walkAndSanitize(node: Node): void {
  const children = Array.from(node.childNodes);

  for (const child of children) {
    if (child.nodeType === Node.TEXT_NODE) {
      // Text nodes are always safe
      continue;
    }

    if (child.nodeType !== Node.ELEMENT_NODE) {
      // Remove comments and other non-element nodes
      child.parentNode?.removeChild(child);
      continue;
    }

    const el = child as Element;
    const tagName = el.tagName.toLowerCase();

    if (REMOVE_TAGS.has(tagName)) {
      // Completely remove dangerous tags and their content
      el.parentNode?.removeChild(el);
      continue;
    }

    if (!ALLOWED_TAGS.has(tagName)) {
      // Replace disallowed element with its children (unwrap)
      const fragment = el.ownerDocument.createDocumentFragment();
      while (el.firstChild) {
        fragment.appendChild(el.firstChild);
      }
      el.parentNode?.replaceChild(fragment, el);
      // Re-walk inserted children
      walkAndSanitize(node);
      return;
    }

    // Special case: input must be type="checkbox"
    if (tagName === 'input') {
      const inputEl = el as HTMLInputElement;
      if (inputEl.type !== 'checkbox') {
        el.parentNode?.removeChild(el);
        continue;
      }
    }

    // Sanitize iframes: remove sandbox (breaks video players), keep allow attribute
    if (tagName === 'iframe') {
      // Ensure javascript: src is blocked (handled below in href/src check)
      // Don't force sandbox — it breaks YouTube, Vimeo, etc.
    }

    // Sanitize attributes
    const allowedAttrs = TAG_ATTRIBUTES[tagName];
    const attrsToRemove: string[] = [];

    for (const attr of Array.from(el.attributes)) {
      const name = attr.name.toLowerCase();

      // Remove all on* event handlers
      if (name.startsWith('on')) {
        attrsToRemove.push(attr.name);
        continue;
      }

      // Allow class and style globally
      if (name === 'class') continue;
      if (name === 'style') {
        sanitizeStyle(el as HTMLElement);
        continue;
      }

      // Check tag-specific allowed attributes
      if (!allowedAttrs || !allowedAttrs.has(name)) {
        attrsToRemove.push(attr.name);
        continue;
      }

      // Sanitize href/src for javascript: URLs
      if (name === 'href' || name === 'src') {
        const val = attr.value.trim().toLowerCase();
        // eslint-disable-next-line no-script-url
        if (val.startsWith('javascript:') || val.startsWith('data:text/html')) {
          attrsToRemove.push(attr.name);
        }
      }
    }

    for (const name of attrsToRemove) {
      el.removeAttribute(name);
    }

    // Recurse into children
    walkAndSanitize(el);
  }
}

function sanitizeStyle(el: HTMLElement): void {
  const style = el.style;
  const propsToRemove: string[] = [];

  for (let i = 0; i < style.length; i++) {
    const prop = style[i];
    if (!ALLOWED_CSS_PROPS.has(prop)) {
      propsToRemove.push(prop);
    }
  }

  for (const prop of propsToRemove) {
    style.removeProperty(prop);
  }

  // Remove empty style attribute
  if (el.getAttribute('style') === '') {
    el.removeAttribute('style');
  }
}

/**
 * Escape HTML special characters for safe insertion as text content.
 */
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * Check if a string is plain text (contains no HTML tags).
 */
export function isPlainText(text: string): boolean {
  return !/<[a-z][^>]*>/i.test(text);
}

/**
 * Insert HTML at the current caret position using Selection/Range API.
 * Only works when a contenteditable element is focused.
 */
export function insertHtmlAtCaret(html: string): void {
  const sel = document.getSelection();
  if (!sel || sel.rangeCount === 0) return;

  const range = sel.getRangeAt(0);
  range.deleteContents();

  const temp = document.createElement('div');
  temp.innerHTML = html;
  const fragment = document.createDocumentFragment();
  let lastNode: Node | null = null;
  while (temp.firstChild) {
    lastNode = fragment.appendChild(temp.firstChild);
  }
  range.insertNode(fragment);

  // Move caret to end of inserted content
  if (lastNode) {
    const newRange = document.createRange();
    newRange.setStartAfter(lastNode);
    newRange.collapse(true);
    sel.removeAllRanges();
    sel.addRange(newRange);
  }
}
