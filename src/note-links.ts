import type { EdgeId, NoteId, WemaEdge, WemaNote, WemaNoteLinksOptions } from './types.js';
import type { WemaLabels } from './labels.js';
import { arrowHeadOf } from './edge.js';
import { FOCUS_KEY_ATTR } from './note.js';
import { createElement } from './utils/dom.js';
import { isPlainText, REMOVE_TAGS } from './utils/sanitize.js';

/**
 * How an edge runs, seen from one of its notes: `out` points at the other
 * note, `in` comes from it, `both` has an arrow at both ends, `none` at neither
 */
export type NoteLinkDirection = 'out' | 'in' | 'both' | 'none';

/** One note a note is connected to, as it is shown under the note (the `noteLinks` option) */
export interface NoteLink {
  edgeId: EdgeId;
  direction: NoteLinkDirection;
  /** The note at the other end */
  peer: NoteId;
  /** What stands for that note: the first line of its text, or what the host gave. Empty when it has none. */
  text: string;
  /** The label of the edge */
  label?: string;
}

/** The order the links of a note are shown in: where it leads first, then what leads to it */
const ORDER: NoteLinkDirection[] = ['out', 'in', 'both', 'none'];

/** The sign of each direction. Not a text: the same in every language. */
const ARROWS: Record<NoteLinkDirection, string> = { out: '→', in: '←', both: '↔', none: '―' };

/** The label that says each direction to a screen reader */
const LABEL_KEYS = { out: 'linkOut', in: 'linkIn', both: 'linkBoth', none: 'linkNone' } as const;

/** On a note for a moment after a link to it was pressed (the style sheet animates it) */
const TARGET_CLASS = 'wema-note-link-target';
/** How long that moment is, in milliseconds. The animation of the style sheet takes as long. */
const TARGET_MS = 1400;

/** Elements that start a new line in the text of a note */
const LINE_BREAKING = new Set([
  'ADDRESS', 'BLOCKQUOTE', 'BR', 'DD', 'DIV', 'DL', 'DT', 'FIGURE', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6',
  'HR', 'IFRAME', 'LI', 'OL', 'P', 'PRE', 'TABLE', 'TD', 'TH', 'TR', 'UL',
]);
/** Elements the sanitizer keeps, whose content the note does not show as text */
const NO_TEXT_INSIDE = new Set(['template', 'iframe', 'video', 'audio']);
/** Characters that do not show (zero width space, BOM): a line of these has no text */
const INVISIBLE = /[​﻿]/g;

/**
 * Whether what is in an element is not text of the note: what the note
 * does not show either (the sanitizer drops it), and a template
 */
const isNotText = (el: Node): boolean => {
  const tag = el.nodeName.toLowerCase();
  return (
    REMOVE_TAGS.has(tag) ||
    // What is in these is shown only where they are not supported
    NO_TEXT_INSIDE.has(tag) ||
    (el as HTMLElement).style?.display === 'none'
  );
};

/** Add the text under `node` to `lines`, whose last entry is the line being read */
function readLines(node: Node, lines: string[]): void {
  for (const child of node.childNodes) {
    if (child.nodeType === Node.TEXT_NODE) {
      // A line break in the text is one in the note too (the text is shown `pre-wrap`)
      const [first, ...rest] = (child.nodeValue ?? '').split('\n');
      lines[lines.length - 1] += first;
      lines.push(...rest);
    } else if (child.nodeType === Node.ELEMENT_NODE && !isNotText(child)) {
      const breaks = LINE_BREAKING.has(child.nodeName);
      if (breaks) lines.push('');
      readLines(child, lines);
      if (breaks) lines.push('');
    }
  }
}

/**
 * The first line of a note's text that has any text in it, or '' when none
 * has. The text of a note is HTML, and not always sanitized (it may come
 * from `applyRemote()` as it is): it is parsed into a document of its own,
 * where nothing loads and nothing runs, and only its text is read. Use the
 * result as text, never as HTML.
 */
export function firstLineOf(text: string): string {
  let lines: string[];
  if (isPlainText(text)) {
    lines = text.split('\n');
  } else {
    lines = [''];
    readLines(new DOMParser().parseFromString(`<body>${text}</body>`, 'text/html').body, lines);
  }
  for (const line of lines) {
    const trimmed = line.replace(INVISIBLE, '').trim();
    if (trimmed !== '') return trimmed;
  }
  return '';
}

/**
 * The first lines read so far, by note, with the text each was read from.
 * A note is shown under every note it is connected to, and those are drawn
 * again whenever one of them changes: its text is parsed once, not each time.
 */
export type FirstLines = Map<NoteId, { text: string; line: string }>;

function firstLineOfNote(note: WemaNote, known?: FirstLines): string {
  const had = known?.get(note.id);
  if (had && had.text === note.text) return had.line;
  const line = firstLineOf(note.text);
  known?.set(note.id, { text: note.text, line });
  return line;
}

/** The note at the other end of an edge of `noteId` */
export const peerOf = (edge: Pick<WemaEdge, 'from' | 'to'>, noteId: NoteId): NoteId =>
  (edge.from === noteId ? edge.to : edge.from);

function directionOf(edge: WemaEdge, noteId: NoteId): NoteLinkDirection {
  const head = arrowHeadOf(edge);
  if (head === 'both' || head === 'none') return head;
  return (head === 'end') === (edge.from === noteId) ? 'out' : 'in';
}

/**
 * The notes `noteId` is connected to, in the order they are shown. `edges`
 * are the edges of that note. An edge whose other note is not found, and
 * one from the note to itself, is left out. `firstLines` keeps what was
 * read of the notes between calls.
 *
 * Does not touch the DOM of the board.
 */
export function computeNoteLinks(
  noteId: NoteId,
  edges: WemaEdge[],
  noteOf: (id: NoteId) => WemaNote | undefined,
  textOf?: WemaNoteLinksOptions['text'],
  firstLines?: FirstLines,
): NoteLink[] {
  const links: NoteLink[] = [];
  for (const edge of edges) {
    const peerId = peerOf(edge, noteId);
    const peer = peerId === noteId ? undefined : noteOf(peerId);
    if (!peer) continue;
    let given: unknown;
    try {
      given = textOf?.(peer, edge);
    } catch (error) {
      // One note the host cannot name must not take the other links away
      console.error(`Error in noteLinks.text for note "${peerId}":`, error);
    }
    // No text given, or an empty one: the note stands for itself
    const named = typeof given === 'string' ? given.trim() : '';
    const label = edge.label?.trim();
    links.push({
      edgeId: edge.id,
      direction: directionOf(edge, noteId),
      peer: peerId,
      text: named !== '' ? named : firstLineOfNote(peer, firstLines),
      ...(label ? { label } : {}),
    });
  }
  // The sort is stable: links of one direction keep the order of their edges
  return links.sort((a, b) => ORDER.indexOf(a.direction) - ORDER.indexOf(b.direction));
}

/** What the links ask of the board they are drawn on */
export interface NoteLinkHost {
  labels: WemaLabels;
  /** Whether the note cannot be gone to (it is not shown) */
  isHidden: (id: NoteId) => boolean;
  /** Bring the note into view */
  reveal: (id: NoteId) => void;
  getElement: (id: NoteId) => HTMLElement | undefined;
}

/** The notes that are marked, with the timer that ends each mark */
const marked = new WeakMap<HTMLElement, ReturnType<typeof setTimeout>>();

/**
 * Mark a note for a moment. Pressed again meanwhile, the mark starts over.
 * A timer ends it, not the end of the animation: the style sheet of the
 * host may show the mark without one, and an animation that is cut short
 * (the note is hidden meanwhile) ends without saying so.
 */
function flash(el: HTMLElement): void {
  clearTimeout(marked.get(el));
  el.classList.remove(TARGET_CLASS);
  // Without a layout in between, adding the class back does not start the animation again
  void el.offsetWidth;
  el.classList.add(TARGET_CLASS);
  marked.set(el, setTimeout(() => el.classList.remove(TARGET_CLASS), TARGET_MS));
}

/** What a screen reader says for a link */
function describe(link: NoteLink, text: string, labels: WemaLabels): string {
  const what = labels[LABEL_KEYS[link.direction]](text);
  return link.label === undefined ? what : labels.linkLabeled(what, link.label);
}

/**
 * Draw the links of a note into `container`: one button per link, with the
 * sign of its direction, the label of the edge and the text of the other
 * note. Everything from the notes goes in as text. Returns whether anything
 * was drawn.
 */
export function drawNoteLinks(container: HTMLElement, links: NoteLink[], host: NoteLinkHost): boolean {
  if (links.length === 0) return false;
  const list = createElement('div', 'wema-note-links');
  for (const link of links) {
    const text = link.text === '' ? host.labels.linkEmpty : link.text;
    const button = createElement('button', 'wema-note-link');
    button.type = 'button';
    // Drawn again while it has the focus, the button of the same edge gets it
    button.setAttribute(FOCUS_KEY_ATTR, link.edgeId);
    button.setAttribute('aria-label', describe(link, text, host.labels));
    // A note that is not shown cannot be gone to
    button.disabled = host.isHidden(link.peer);
    const parts: [string, string | undefined][] = [
      ['wema-note-link-arrow', ARROWS[link.direction]],
      ['wema-note-link-label', link.label],
      ['wema-note-link-text', text],
    ];
    for (const [className, content] of parts) {
      if (content === undefined) continue;
      const part = createElement('span', className);
      part.textContent = content;
      button.appendChild(part);
    }
    button.addEventListener('click', () => {
      host.reveal(link.peer);
      // A note that is in view already does not move: the mark says which one it is
      const peer = host.getElement(link.peer);
      if (peer) flash(peer);
    });
    list.appendChild(button);
  }
  container.appendChild(list);
  return true;
}
