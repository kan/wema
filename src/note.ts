import type { NoteId, WemaNote, WemaEventMap, ChangeOrigin } from './types.js';
import { EventEmitter } from './events.js';
import { generateId } from './utils/id.js';
import type { WemaLabels } from './labels.js';
import {
  createElement, setLabel, setStyles, getSelectionRange, setSelectionRange, placeOverlay, screenBoxOf,
} from './utils/dom.js';
import { sanitizeHtml, escapeHtml, isPlainText, insertHtmlAtCaret, resolveSafeUrl } from './utils/sanitize.js';
import { normalizeMeta } from './utils/meta.js';
import { isInListItem, indentListItems, outdentListItems, getListType, createListItem } from './utils/list.js';

/** Class of a note whose size follows its content (the style sheet does the sizing) */
const AUTO_SIZE_CLASS = 'wema-auto-size';
/** On a note that is placed for the display only (`placeNotes`): it is as wide as it is placed, autoSize or not */
const PLACED_CLASS = 'wema-note-placed';

/**
 * A rendered size as a whole number of pixels that is not smaller than the
 * exact size. `offsetWidth` rounds: a note set to a width a fraction of a
 * pixel short of its content wraps the last word. `computed` is the exact
 * size from the computed style, when the browser gives one in pixels.
 */
function wholePixels(offsetSize: number, computed: string): number {
  const exact = parseFloat(computed);
  // Only the fraction is taken from the computed style: it is the same size
  // as offsetSize in a browser, and anything else is not a rendered size
  return exact > offsetSize && exact - offsetSize < 1 ? offsetSize + 1 : offsetSize;
}

/** Class of a note with the `foldable` flag (the style sheet makes its height follow what it shows) */
const FOLDABLE_CLASS = 'wema-foldable';
/** Class of a foldable note whose text is long enough to fold: it shows the link that opens and closes it */
const FOLD_LONG_CLASS = 'wema-fold-long';
/** Class of a foldable note that is closed: it shows only the beginning of its text */
const FOLDED_CLASS = 'wema-folded';
/** How many lines a closed note shows in full (the next one fades out). The style sheet has the same number. */
const FOLD_LINES = 2;

/** The position and the size of a note */
export type NoteRect = Pick<WemaNote, 'x' | 'y' | 'width' | 'height'>;
/** The size of a note */
export type NoteSize = Pick<WemaNote, 'width' | 'height'>;

/** The keys of a note that say where it is and how large */
export const RECT_KEYS = ['x', 'y', 'width', 'height'] as const;

export const rectDiffers = (a: NoteRect, b: NoteRect): boolean => RECT_KEYS.some((key) => a[key] !== b[key]);

export const rectOf = ({ x, y, width, height }: NoteRect): NoteRect => ({ x, y, width, height });

/** Whether the size of a note is measured from what it shows, instead of set */
function isMeasured(note: WemaNote): boolean {
  return !!note.autoSize || !!note.foldable;
}

/** Whether the text in a content element takes more lines than a closed note shows in full */
function isLongText(content: HTMLElement): boolean {
  const style = getComputedStyle(content);
  const px = (value: string): number => parseFloat(value) || 0;
  // Where the browser gives no line height in pixels, the one of the style sheet (1.4)
  const lineHeight = px(style.lineHeight) || px(style.fontSize) * 1.4;
  const textHeight = content.scrollHeight - px(style.paddingTop) - px(style.paddingBottom);
  // Half a line of tolerance: the margins of a list or an image add a little
  return textHeight > lineHeight * (FOLD_LINES + 0.5);
}

interface NoteManagerOptions {
  boardEl: HTMLElement;
  /** Element the notes are rendered into (the panned layer inside the board) */
  layerEl: HTMLElement;
  emitter: EventEmitter<WemaEventMap>;
  defaultWidth: number;
  defaultHeight: number;
  defaultColor: string;
  readOnly: boolean;
  /**
   * An autoSize note was measured and its size changed in the model without a
   * note event (the size is derived from the content, not a user operation).
   * `before` is the size it had.
   */
  onMeasure: (noteId: NoteId, before: NoteSize) => void;
  /**
   * A measured note that is placed for the display (`placeNotes`) was
   * measured: the size it is drawn with may have changed, whether or not
   * the one in the model did.
   */
  onPlacedMeasure: (noteId: NoteId) => void;
  /** Handle a click on a link, given its resolved absolute URL. Return true to keep it from opening in a new tab. */
  onLinkClick?: (url: string, event: MouseEvent) => boolean | void;
  /** Let the host draw a note into `container`. Return true when it did (the `renderNote` option). */
  hostRender?: (note: WemaNote, container: HTMLElement) => boolean | void;
  /** Let the host draw under a note into `container`. Return true when it did (the `renderNoteFooter` option). */
  hostFooter?: (note: WemaNote, container: HTMLElement) => boolean | void;
  /**
   * What the host draws under the notes is to be drawn again, or is as tall
   * as it was no longer: `drawFooters()` and the column are due
   */
  onFooterChange: () => void;
  /** Texts of the UI on a note: the link under a foldable one, the button on a selected image */
  labels: WemaLabels;
}

/**
 * On the element of a note the host draws (`renderNote` option): it shows
 * `.wema-note-custom` instead of its text, and the text cannot be edited
 */
const HOST_DRAWN_CLASS = 'wema-note-host-drawn';

/**
 * On the element of a note the host drew something under (`renderNoteFooter`
 * option): `.wema-note-footer` is shown, and the column leaves room for it
 */
const HAS_FOOTER_CLASS = 'wema-note-has-footer';

/**
 * On a control drawn under a note: what it stands for. When what is under
 * the note is drawn again while the control has the focus, the control with
 * the same value gets it (the elements themselves are replaced).
 */
export const FOCUS_KEY_ATTR = 'data-wema-focus-key';

/** The key of the control in `container` that has the focus, if one has both */
function focusKeyIn(container: HTMLElement | null): string | undefined {
  const active = document.activeElement;
  if (!container || !active || !container.contains(active)) return undefined;
  return active.getAttribute(FOCUS_KEY_ATTR) ?? undefined;
}

export class NoteManager {
  private notes = new Map<NoteId, WemaNote>();
  private elements = new Map<NoteId, HTMLElement>();
  private zCounter = 1;
  private boardEl: HTMLElement;
  private layerEl: HTMLElement;
  private emitter: EventEmitter<WemaEventMap>;
  private defaultWidth: number;
  private defaultHeight: number;
  private defaultColor: string;
  private readOnly: boolean;
  private viewOnly = false;
  private onMeasure: (noteId: NoteId, before: NoteSize) => void;
  private onLinkClick?: (url: string, event: MouseEvent) => boolean | void;
  private hostRender?: (note: WemaNote, container: HTMLElement) => boolean | void;
  /**
   * For notes whose measured size is not yet reported in a note event: the
   * size they had in the last one. The next note:update uses it as `prev`.
   */
  private unreportedSizeBase = new Map<NoteId, NoteSize>();
  /**
   * For notes that are animated to their place: where they are drawn for
   * now. The model already has the place they end at (see `setShownRect`).
   */
  private shownRects = new Map<NoteId, NoteRect>();
  /**
   * For notes the board lays out for the display only (`setStacked`): where
   * they are drawn instead of where the model has them. The height is the
   * one the note has at that width, as read when it was placed.
   */
  private placedRects = new Map<NoteId, NoteRect>();
  private onPlacedMeasure: (noteId: NoteId) => void;
  private hostFooter?: (note: WemaNote, container: HTMLElement) => boolean | void;
  private onFooterChange: () => void;
  /** Whether the notes show what the host draws under them (`setFootersShown`) */
  private footersShown = false;
  /** The notes whose footer is to be drawn, or drawn again, by `drawFooters()` */
  private staleFooters = new Set<NoteId>();
  /**
   * For placed notes with something under them: how tall that was when the
   * note was placed. Not part of the note: `placedRects` has the note alone.
   */
  private footerHeights = new Map<NoteId, number>();
  /** Tells when what the host drew under a note changes its height by itself (a font that loads, the host's own update) */
  private footerObserver: ResizeObserver | null = null;
  private labels: WemaLabels;
  /**
   * The foldable notes the user opened. A state of the display only: not in
   * the data, no event, no history. A note not in here is closed.
   */
  private unfolded = new Set<NoteId>();
  /** The note whose text has the focus. It is shown open while it is edited. */
  private editingId: NoteId | null = null;
  private imageOverlay: HTMLElement;
  private activeImage: HTMLImageElement | null = null;
  private activeImageNoteId: NoteId | null = null;
  private handleImageOverlayDismiss: (e: MouseEvent) => void;

  constructor(options: NoteManagerOptions) {
    this.boardEl = options.boardEl;
    this.layerEl = options.layerEl;
    this.emitter = options.emitter;
    this.defaultWidth = options.defaultWidth;
    this.defaultHeight = options.defaultHeight;
    this.defaultColor = options.defaultColor;
    this.readOnly = options.readOnly;
    this.onMeasure = options.onMeasure;
    this.onPlacedMeasure = options.onPlacedMeasure;
    this.onLinkClick = options.onLinkClick;
    this.hostRender = options.hostRender;
    this.hostFooter = options.hostFooter;
    this.onFooterChange = options.onFooterChange;
    this.labels = options.labels;

    if (this.hostFooter && typeof ResizeObserver !== 'undefined') {
      this.footerObserver = new ResizeObserver((entries) => {
        for (const { target } of entries) {
          const id = target.parentElement?.dataset.noteId;
          // A note on its way has another width for now: the column has the
          // height of the width the note ends with
          if (id === undefined || this.shownRects.has(id)) continue;
          if ((target as HTMLElement).offsetHeight === (this.footerHeights.get(id) ?? 0)) continue;
          this.onFooterChange();
          return;
        }
      });
    }

    // Image overlay (size + delete controls)
    this.imageOverlay = createElement('div', 'wema-image-overlay');
    this.imageOverlay.style.display = 'none';
    this.imageOverlay.addEventListener('click', (e) => e.stopPropagation());
    this.imageOverlay.addEventListener('pointerdown', (e) => e.stopPropagation());
    this.imageOverlay.addEventListener('mousedown', (e) => e.preventDefault());
    this.boardEl.appendChild(this.imageOverlay);

    // Dismiss overlay on outside click
    this.handleImageOverlayDismiss = (e: MouseEvent) => {
      if (this.imageOverlay.style.display === 'none') return;
      if (this.imageOverlay.contains(e.target as Node)) return;
      if (e.target === this.activeImage) return;
      this.hideImageOverlay();
    };
    this.boardEl.addEventListener('click', this.handleImageOverlayDismiss, true);
  }

  /** Create a new note and render it */
  addNote(params?: Partial<Omit<WemaNote, 'id'>>): WemaNote {
    const meta = normalizeMeta(params?.meta);
    const note: WemaNote = {
      id: generateId(),
      x: params?.x ?? 100,
      y: params?.y ?? 100,
      width: params?.width ?? this.defaultWidth,
      height: params?.height ?? this.defaultHeight,
      text: params?.text ?? '',
      color: params?.color ?? this.defaultColor,
      zIndex: params?.zIndex ?? this.zCounter++,
      ...(params?.autoSize ? { autoSize: true } : {}),
      ...(params?.foldable ? { foldable: true } : {}),
      ...(meta ? { meta } : {}),
    };

    if (note.zIndex >= this.zCounter) {
      this.zCounter = note.zIndex + 1;
    }

    this.notes.set(note.id, note);
    this.renderNote(note);
    this.emitter.emit('note:create', { note: { ...note }, origin: 'local' });
    return { ...note };
  }

  /** Add a note with a specific ID (undo restore, remote changes). Does nothing if the ID exists. */
  addNoteWithId(note: WemaNote, origin: ChangeOrigin = 'local'): void {
    if (this.notes.has(note.id)) return;
    const copy = this.stored(note);
    if (copy.zIndex >= this.zCounter) {
      this.zCounter = copy.zIndex + 1;
    }
    this.notes.set(copy.id, copy);
    this.renderNote(copy);
    this.emitter.emit('note:create', { note: { ...copy }, origin });
  }

  /** Update an existing note's properties */
  updateNote(id: NoteId, params: Partial<WemaNote>): void {
    const change = this.applyParams(id, params);
    if (change) this.emitUpdate(change.note, change.prev);
  }

  /**
   * Update a note while replaying history or applying a remote change.
   * The history does not record this update, so it must not report a size
   * measured earlier: that report stays for the next `updateNote`.
   */
  replayUpdate(id: NoteId, params: Partial<WemaNote>, origin: ChangeOrigin): void {
    const change = this.applyParams(id, params);
    if (change) this.emitter.emit('note:update', { note: { ...change.note }, prev: change.prev, origin });
  }

  /** Apply params to the model and the DOM. Returns the note and its previous state. */
  private applyParams(id: NoteId, params: Partial<WemaNote>): { note: WemaNote; prev: WemaNote } | undefined {
    const note = this.notes.get(id);
    if (!note) return undefined;

    const prev = { ...note };
    Object.assign(note, params, { id }); // prevent id overwrite
    if ('meta' in params) note.meta = normalizeMeta(params.meta);
    if (!prev.foldable !== !note.foldable) {
      // A note made foldable starts closed. One that no longer is keeps the
      // height it has when open: its height is its own again from here on.
      this.unfolded.delete(id);
      if (!note.foldable && !('height' in params)) note.height = this.openHeight(note) ?? note.height;
    }
    this.updateNoteElement(note, 'text' in params);
    // What the host draws depends on the text and the meta, not on the position
    if ('text' in params || 'meta' in params) {
      this.drawByHost(note);
      this.requestFooter(id);
    }
    // Measure now when the change can resize a measured note, so the event
    // (and its undo) carries the resulting size
    if ('autoSize' in params || 'foldable' in params || 'text' in params || 'meta' in params
      || 'width' in params || 'height' in params) {
      this.applyMeasuredSize(note);
    }
    return { note, prev };
  }

  /** A copy of a note from outside (import, undo, remote change), as it is kept in the model */
  private stored(note: WemaNote): WemaNote {
    const { meta: given, ...rest } = note;
    const meta = normalizeMeta(given);
    return meta ? { ...rest, meta } : rest;
  }

  /**
   * Offer the note to the host (`renderNote` option). When the host draws it,
   * its text is hidden and cannot be edited; otherwise it is an ordinary note.
   * Returns whether the note switched between the two.
   */
  private drawByHost(note: WemaNote): boolean {
    if (!this.hostRender) return false;
    const el = this.elements.get(note.id);
    // Only the note's own container: the text of a note may carry any class
    // name (the sanitizer keeps `class`), and it comes first in the element
    const container = el?.querySelector(':scope > .wema-note-custom') as HTMLElement | null;
    if (!el || !container) return false;
    container.replaceChildren();
    let drawn = false;
    try {
      drawn = this.hostRender({ ...note }, container) === true;
    } catch (error) {
      // Called while a note is created or updated: an error here must not
      // leave that half done. The note stays an ordinary one.
      console.error(`Error in renderNote for note "${note.id}":`, error);
    }
    const wasDrawn = el.classList.contains(HOST_DRAWN_CLASS);
    // Commit a text edit in progress while the note still counts as text:
    // once the host draws it, its content is no longer read back
    if (drawn && !wasDrawn) this.getTextElement(note.id)?.blur();
    // Drop what a host that did not return true (or threw) left behind
    if (!drawn) container.replaceChildren();
    el.classList.toggle(HOST_DRAWN_CLASS, drawn);
    this.applyEditable(note.id);
    return drawn !== wasDrawn;
  }

  /**
   * Draw a note again through the host (`refreshNote`): what it shows changed
   * outside the note's data. Returns whether the note switched between
   * host-drawn and ordinary.
   */
  refresh(id: NoteId): boolean {
    const note = this.notes.get(id);
    if (!note) return false;
    const switched = this.drawByHost(note);
    if (isMeasured(note)) this.measure(id);
    this.requestFooter(id);
    return switched;
  }

  /** The element under a note that the host draws into (`renderNoteFooter` option) */
  private footerElement(id: NoteId): HTMLElement | null {
    return (this.elements.get(id)?.querySelector(':scope > .wema-note-footer') as HTMLElement | undefined) ?? null;
  }

  /**
   * Ask for what the host draws under a note to be drawn, or drawn again.
   * `drawFooters()` does it, once however often it was asked for: the host
   * is not called from here, where a note is being made or updated and the
   * board is not in a state to be asked about (the note has no edges yet,
   * a board that is being made is not in the hands of the host yet).
   * Also called by the board, for what it draws there itself (`noteLinks`).
   */
  requestFooter(id: NoteId): void {
    if (!this.hostFooter || !this.footersShown) return;
    this.staleFooters.add(id);
    this.onFooterChange();
  }

  /**
   * Show what the host draws under the notes (`renderNoteFooter` option), or
   * nothing. Shown, it is drawn for every note by the next `drawFooters()`.
   */
  setFootersShown(shown: boolean): void {
    if (!this.hostFooter || this.footersShown === shown) return;
    this.footersShown = shown;
    if (shown) {
      this.staleFooters = new Set(this.notes.keys());
      this.onFooterChange();
    } else {
      this.staleFooters.clear();
      for (const id of this.notes.keys()) this.emptyFooter(id);
    }
  }

  /**
   * Let the host draw under the notes that were asked for (see
   * `requestFooter`). Returns whether there were any: the column is due then.
   */
  drawFooters(): boolean {
    if (!this.hostFooter || this.staleFooters.size === 0) return false;
    // What the host asks for while it draws is for the next time
    const stale = this.staleFooters;
    this.staleFooters = new Set();
    for (const id of stale) {
      const note = this.notes.get(id);
      // What is drawn is replaced as a whole: the focus that is on a control
      // in it goes to the one that takes its place (see `focusKeyIn`)
      const focused = focusKeyIn(this.footerElement(id));
      const footer = this.emptyFooter(id);
      // A note that was deleted meanwhile has neither
      if (!note || !footer) continue;
      let drawn = false;
      try {
        drawn = this.hostFooter({ ...note }, footer) === true;
      } catch (error) {
        // One note must not keep the others from being drawn and stacked
        console.error(`Error in renderNoteFooter / noteLinks for note "${id}":`, error);
      }
      if (drawn) {
        this.elements.get(id)?.classList.add(HAS_FOOTER_CLASS);
        this.footerObserver?.observe(footer);
        if (focused !== undefined) {
          Array.from(footer.querySelectorAll<HTMLElement>(`[${FOCUS_KEY_ATTR}]`))
            .find((el) => el.getAttribute(FOCUS_KEY_ATTR) === focused)
            ?.focus({ preventScroll: true });
        }
      } else {
        // Drop what a host that did not return true (or threw) left behind
        footer.replaceChildren();
      }
    }
    return true;
  }

  /** Remove what the host drew under a note. Returns the element it draws into. */
  private emptyFooter(id: NoteId): HTMLElement | null {
    const footer = this.footerElement(id);
    if (!footer) return null;
    footer.replaceChildren();
    this.elements.get(id)?.classList.remove(HAS_FOOTER_CLASS);
    this.footerObserver?.unobserve(footer);
    return footer;
  }

  /** Whether the host draws this note (its text is hidden and not editable) */
  isHostDrawn(id: NoteId): boolean {
    return this.elements.get(id)?.classList.contains(HOST_DRAWN_CLASS) ?? false;
  }

  /**
   * The element holding a note's text, for reading it back or writing to it.
   * A note the host draws has none: its text is hidden, and the DOM of a
   * hidden text is not its source of truth (the model is).
   */
  getTextElement(id: NoteId): HTMLElement | null {
    if (this.isHostDrawn(id)) return null;
    return this.contentElement(id);
  }

  /**
   * Run an edit on a note's text in the DOM, at the current selection, and
   * commit it. `edit` gets the selection (null when it is not in the text) and
   * returns the range to select afterwards, or null when it changed nothing.
   *
   * @returns whether the text was edited
   */
  editContent(
    id: NoteId,
    edit: (content: HTMLElement, range: Range | null) => Range | null,
  ): boolean {
    const content = this.getTextElement(id);
    if (!content || !this.isEditable(id)) return false;
    const next = edit(content, getSelectionRange(content));
    if (!next) return false;
    content.focus();
    setSelectionRange(next);
    this.syncNoteContent(id);
    return true;
  }

  private contentElement(id: NoteId): HTMLElement | null {
    return (this.elements.get(id)?.querySelector('.wema-note-content') as HTMLElement | undefined) ?? null;
  }

  /**
   * Whether the text of a note can be edited: not in readOnly / viewOnly mode,
   * and not when the host draws the note. Handlers ask this too, because a
   * key also arrives from a checkbox in the text, which takes the focus even
   * while the text itself cannot be edited.
   */
  private isEditable(id: NoteId): boolean {
    return !this.readOnly && !this.viewOnly && !this.isHostDrawn(id);
  }

  /** Make the text of a note editable or not, from the board's mode and who draws the note */
  private applyEditable(id: NoteId): void {
    const content = this.contentElement(id);
    if (!content) return;
    const editable = this.isEditable(id);
    content.contentEditable = editable ? 'true' : 'false';
    if (!editable) content.blur();
  }

  /** Emit a local note:update, reporting any size measured since the last one */
  private emitUpdate(note: WemaNote, prev: WemaNote): void {
    const base = this.unreportedSizeBase.get(note.id);
    this.unreportedSizeBase.delete(note.id);
    this.emitter.emit('note:update', { note: { ...note }, prev: base ? { ...prev, ...base } : prev, origin: 'local' });
  }

  /**
   * Show a foldable note open or closed, and its link, from the length of its
   * text and from whether the user opened it. Called before the note is
   * measured: this decides the height it has.
   */
  private applyFold(note: WemaNote, el: HTMLElement): void {
    // Nothing to do for a note that is not foldable and shows no trace of
    // having been (this runs for every note that is resized or typed in)
    if (!note.foldable && !el.classList.contains(FOLD_LONG_CLASS)) return;
    const content = el.querySelector(':scope > .wema-note-content') as HTMLElement | null;
    const toggle = el.querySelector(':scope > .wema-note-fold-toggle');
    if (!content || !toggle) return;
    // Not laid out (hidden by a collapsed edge or the filter, or detached):
    // its text has no length to judge by. It is measured when shown again.
    if (el.offsetWidth === 0 && el.offsetHeight === 0) return;

    // The length is that of the open text: a closed one is cut off
    el.classList.remove(FOLDED_CLASS);
    // A note the host draws shows no text to fold
    const long = !!note.foldable && !el.classList.contains(HOST_DRAWN_CLASS) && isLongText(content);
    // Open while it is edited, so that the caret is never in a hidden line
    const closed = long && !this.unfolded.has(note.id) && this.editingId !== note.id;

    el.classList.toggle(FOLD_LONG_CLASS, long);
    el.classList.toggle(FOLDED_CLASS, closed);
    const label = closed ? this.labels.readMore : this.labels.showLess;
    if (toggle.textContent !== label) toggle.textContent = label;
    // The text may have been scrolled while it was edited
    if (closed) content.scrollTop = 0;
  }

  /** Open or close a foldable note (the link under its text). Changes the display only. */
  private toggleFold(id: NoteId): void {
    // From what the note shows now, not from `unfolded`: a note that is open
    // only because it is edited is closed by its link
    const wasClosed = this.elements.get(id)?.classList.contains(FOLDED_CLASS) ?? false;
    if (this.editingId === id) {
      // Pressing the link takes the focus away in some browsers and not in
      // others: end the edit here, so that both behave the same
      this.contentElement(id)?.blur();
      this.editingId = null;
    }
    if (wasClosed) this.unfolded.add(id);
    else this.unfolded.delete(id);
    this.measure(id);
  }

  /**
   * The height the whole text of a foldable note takes, without the link
   * that opens and closes it, or undefined when the note is not laid out.
   * Leaves the note shown open: the caller applies its state again.
   */
  private openHeight(note: WemaNote): number | undefined {
    const el = this.elements.get(note.id);
    // A note the host draws was not folded: the height it has is its own
    // already (and its element may show another, see `readMeasuredSize`)
    if (!el || this.isHostDrawn(note.id)) return undefined;
    // The width this update gives the note is not on its element yet (unless
    // the note is drawn somewhere else than the model has it, which
    // `atModelWidth` sees to)
    if (!this.shownRects.has(note.id) && !this.placedRects.has(note.id)) el.style.width = `${note.width}px`;
    // A height for the model: the one the text has at the width of the model,
    // not at the width the note is placed with for the display
    return this.atModelWidth(note, el, () => {
      el.classList.remove(FOLDED_CLASS, FOLD_LONG_CLASS);
      return el.offsetHeight || undefined;
    });
  }

  /**
   * Copy the rendered size of a measured note (autoSize, foldable) to the
   * model. Returns whether the size changed. A size of 0 means the note is
   * not laid out (hidden by a collapsed edge, or detached) and is ignored.
   */
  private applyMeasuredSize(note: WemaNote): boolean {
    const el = this.elements.get(note.id);
    if (!el) return false;
    // Nothing to measure and nothing to fold (this runs for every key typed
    // in any note): the note is not laid out again for it
    if (!this.isSizedByContent(note) && !el.classList.contains(FOLD_LONG_CLASS)) return false;
    return this.atModelWidth(note, el, () => this.readMeasuredSize(note, el));
  }

  /**
   * Run `read` with the note laid out at the width the model has for it. A
   * note on its way to its place, or placed for the display, is drawn with
   * another width for now: what is measured for the model is the size it
   * has at its own.
   */
  private atModelWidth<T>(note: WemaNote, el: HTMLElement, read: () => T): T {
    const placed = el.classList.contains(PLACED_CLASS);
    const shown = this.shownRects.get(note.id) ?? this.placedRects.get(note.id);
    if (!placed && (!shown || shown.width === note.width)) return read();
    el.classList.remove(PLACED_CLASS);
    el.style.width = `${note.width}px`;
    try {
      return read();
    } finally {
      if (shown) el.style.width = `${shown.width}px`;
      el.classList.toggle(PLACED_CLASS, placed);
      // Open or closed is decided by the length of the text, which is another
      // one at the width the note is drawn with
      if (placed) this.applyFold(note, el);
    }
  }

  private readMeasuredSize(note: WemaNote, el: HTMLElement): boolean {
    this.applyFold(note, el);
    // A foldable note the host draws is not sized by the style sheet: its
    // element has the height it is given, which is not always the one of the
    // model (a note placed for the display, or on its way, has another), and
    // reading it back would undo a height the model was just given
    if (!this.isSizedByContent(note)) return false;
    // Only an autoSize note has a measured width: a foldable one keeps its own
    const width = note.autoSize ? el.offsetWidth : note.width;
    const height = el.offsetHeight;
    if (width === 0 || height === 0) return false;
    if (width === note.width && height === note.height) return false;
    note.width = width;
    note.height = height;
    return true;
  }

  /**
   * Measure a measured note outside of a note event (while typing, after
   * layout, when a foldable note is opened or closed). The size change is not
   * an operation of its own: it is reported through `onMeasure` and becomes
   * part of the next note:update.
   */
  private measure(noteId: NoteId): void {
    const note = this.notes.get(noteId);
    if (!note) return;
    const before = { width: note.width, height: note.height };
    const changed = this.applyMeasuredSize(note);
    // Placed for the display, the note may be drawn with another height now,
    // whatever the size in the model did
    const placed = this.placedRects.get(noteId);
    const el = placed && this.elements.get(noteId);
    if (placed && el && this.sizesAtWidth([{ note, el, width: placed.width }])[0].height !== placed.height) {
      this.onPlacedMeasure(noteId);
    }
    if (!changed) return;
    // Back at the size of the last note event (a note opened and closed
    // again): nothing is left to report
    const base = this.unreportedSizeBase.get(noteId) ?? before;
    if (base.width === note.width && base.height === note.height) this.unreportedSizeBase.delete(noteId);
    else this.unreportedSizeBase.set(noteId, base);
    this.onMeasure(noteId, before);
  }

  /**
   * Measure a note that is laid out again (it was hidden by a collapsed edge
   * or by the filter): what changed while it was hidden was not measured.
   */
  remeasure(id: NoteId): void {
    this.measure(id);
  }

  /** Whether the height of a note follows what it shows (a foldable note that shows its text) */
  hasMeasuredHeight(id: NoteId): boolean {
    return !!this.notes.get(id)?.foldable && !this.isHostDrawn(id);
  }

  /** Whether the style sheet, not the model, decides how tall a note is drawn */
  private isSizedByContent(note: WemaNote): boolean {
    return !!note.autoSize || this.hasMeasuredHeight(note.id);
  }

  /**
   * Resize a note once to the size its content takes: the size it would have
   * as an autoSize note. `autoSize` itself is not changed, so the note keeps
   * that size afterwards. Reported as one note:update, or not at all when
   * the note has that size already.
   */
  resizeToContent(id: NoteId): void {
    const note = this.notes.get(id);
    const el = this.elements.get(id);
    // An autoSize note already has the size of its content
    if (!note || !el || note.autoSize) return;

    // Lay the note out as an autoSize note for a moment, and read the result
    const { width, height } = this.atModelWidth(note, el, () => {
      el.classList.add(AUTO_SIZE_CLASS);
      const style = getComputedStyle(el);
      const size = {
        width: wholePixels(el.offsetWidth, style.width),
        height: wholePixels(el.offsetHeight, style.height),
      };
      el.classList.remove(AUTO_SIZE_CLASS);
      return size;
    });

    // Not laid out (hidden by a collapsed edge, or detached): nothing to fit to
    if (width === 0 || height === 0) return;
    if (width === note.width && height === note.height) return;
    this.updateNote(id, { width, height });
  }

  /** Delete a note and remove its DOM element */
  deleteNote(id: NoteId, origin: ChangeOrigin = 'local'): void {
    const note = this.notes.get(id);
    if (!note) return;

    this.emptyFooter(id);
    const el = this.elements.get(id);
    if (el) {
      el.remove();
      this.elements.delete(id);
    }
    this.notes.delete(id);
    this.unreportedSizeBase.delete(id);
    this.shownRects.delete(id);
    this.placedRects.delete(id);
    this.footerHeights.delete(id);
    this.unfolded.delete(id);
    if (this.editingId === id) this.editingId = null;
    this.emitter.emit('note:delete', { note: { ...note }, origin });
  }

  /** Get a note by ID */
  getNote(id: NoteId): WemaNote | undefined {
    const note = this.notes.get(id);
    return note ? { ...note } : undefined;
  }

  /**
   * Draw a note somewhere else than where the model has it, or back where
   * the model has it (null). Used to animate a note to its place: the model
   * has the end from the start, and only what is drawn moves. Changes
   * nothing in the data and emits nothing.
   */
  setShownRect(id: NoteId, rect: NoteRect | null): void {
    if (rect) this.shownRects.set(id, rect);
    else if (!this.shownRects.delete(id)) return;
    const note = this.notes.get(id);
    const el = this.elements.get(id);
    if (note && el) this.applyStyles(el, note);
    // What the host drew under the note was not watched on the way (see
    // `footerObserver`): observed again, it is reported as it is now
    const footer = !rect && el?.classList.contains(HAS_FOOTER_CLASS) ? this.footerElement(id) : null;
    if (footer && this.footerObserver) {
      this.footerObserver.unobserve(footer);
      this.footerObserver.observe(footer);
    }
  }

  /**
   * Draw the notes `ids` where `layout` puts them, for the display only, and
   * all the others where the model has them (none: all of them). Nothing
   * changes in the data and nothing is emitted.
   *
   * The notes are first drawn `width` wide (their own width without one),
   * then `layout` gets them with the size they have at that width, and
   * returns their places. Returns the notes that are drawn somewhere else
   * than before.
   */
  placeNotes(
    ids: NoteId[],
    width: number | undefined,
    layout: (notes: WemaNote[]) => (Pick<WemaNote, 'id'> & Partial<NoteRect>)[],
  ): NoteId[] {
    const before = new Map<NoteId, NoteRect>();
    for (const [id, note] of this.notes) before.set(id, this.placedRects.get(id) ?? rectOf(note));

    const placed = new Set(ids);
    // No longer placed: drawn as the model has them again, whether or not
    // that is the same place (an autoSize note takes its own width again)
    const released = new Set<NoteId>();
    for (const id of [...this.placedRects.keys()]) {
      if (placed.has(id)) continue;
      this.placedRects.delete(id);
      this.footerHeights.delete(id);
      released.add(id);
    }
    // The widths first: they decide the heights the layout works with. Only
    // a note that gets another width is drawn again here (this runs for every
    // key typed in a note): the others have the height of their width already.
    const drawn: { note: WemaNote; el: HTMLElement }[] = [];
    const widened: { note: WemaNote; el: HTMLElement }[] = [];
    for (const id of placed) {
      const note = this.notes.get(id);
      const el = this.elements.get(id);
      if (!note || !el) continue;
      const rect = { ...before.get(id)!, width: width ?? note.width };
      if (!this.placedRects.has(id) || this.placedRects.get(id)!.width !== rect.width) widened.push({ note, el });
      this.placedRects.set(id, rect);
      drawn.push({ note, el });
    }
    for (const { note, el } of widened) this.applyStyles(el, note);
    for (const { note, el } of widened) this.applyFold(note, el);

    const sizes = this.sizesAtWidth(
      drawn.map(({ note, el }) => ({ note, el, width: this.placedRects.get(note.id)!.width })),
    );
    const sized = drawn.map(({ note }, i) => {
      const rect = this.placedRects.get(note.id)!;
      const { height, footer } = sizes[i];
      rect.height = height;
      if (footer > 0) this.footerHeights.set(note.id, footer);
      else this.footerHeights.delete(note.id);
      // The layout leaves room for what the host drew under the note: the
      // next note goes under that. The note itself is as tall as it was.
      return { ...note, width: rect.width, height: height + footer };
    });
    for (const place of layout(sized)) {
      const rect = this.placedRects.get(place.id);
      if (!rect) continue;
      if (place.x !== undefined) rect.x = place.x;
      if (place.y !== undefined) rect.y = place.y;
    }

    const changed: NoteId[] = [];
    for (const [id, note] of this.notes) {
      const rect = this.placedRects.get(id) ?? note;
      const was = before.get(id)!;
      if (!rectDiffers(rect, was) && !released.has(id)) continue;
      changed.push(id);
      const el = this.elements.get(id);
      if (el) this.applyStyles(el, note);
    }
    return changed;
  }

  /**
   * How tall notes are drawn at `width`, the width each is placed with, and
   * how tall what the host drew under them is there (`footer`, 0 for
   * nothing). The height is the one of the model, unless the style sheet
   * sizes the note. A note on its way to its place is drawn with another
   * width for now, and is laid out at `width` for as long as it takes to
   * read these: all such notes at once, so that the board is not laid out
   * again for each of them.
   */
  private sizesAtWidth(
    items: { note: WemaNote; el: HTMLElement; width: number }[],
  ): { height: number; footer: number }[] {
    const read = items.map(({ note, el, width }) => {
      const sized = this.isSizedByContent(note);
      const footer = el.classList.contains(HAS_FOOTER_CLASS) ? this.footerElement(note.id) : null;
      const shown = this.shownRects.get(note.id);
      // Nothing to read from a note that has the height of the model and nothing under it
      const offWidth = (sized || footer !== null) && shown !== undefined && shown.width !== width;
      return { note, el, width, sized, footer, restore: offWidth ? shown.width : undefined };
    });
    const moving = read.filter((item) => item.restore !== undefined);
    for (const { el, width } of moving) el.style.width = `${width}px`;
    // Open or closed is decided by the length of the text at that width
    for (const { note, el, sized } of moving) if (sized) this.applyFold(note, el);
    const sizes = read.map(({ note, el, sized, footer }) => ({
      // 0: the note is not laid out
      height: (sized && el.offsetHeight) || note.height,
      footer: footer?.offsetHeight ?? 0,
    }));
    for (const { el, restore } of moving) el.style.width = `${restore}px`;
    return sizes;
  }

  /**
   * A note where it is drawn when nothing moves: where it is placed for the
   * display (`placeNotes`), else the note of the model. An animation ends here.
   */
  getPlacedNote(id: NoteId): WemaNote | undefined {
    const note = this.notes.get(id);
    if (!note) return undefined;
    return { ...note, ...this.placedRects.get(id) };
  }

  /** Whether the note is placed for the display (`placeNotes`), and not drawn where the model has it */
  isPlaced(id: NoteId): boolean {
    return this.placedRects.has(id);
  }

  /**
   * The room all the notes take when nothing moves: where each is drawn
   * (see `getPlacedNote`), as tall as the note and what the host drew under
   * it together. For what has to fit or show all of a note, not for what is
   * drawn next to the note itself.
   */
  getPlacedBoxes(): WemaNote[] {
    return Array.from(this.notes.values(), (note) => this.withFooter({ ...note, ...this.placedRects.get(note.id) }));
  }

  /** The note, taller by what the host drew under it */
  private withFooter(note: WemaNote): WemaNote {
    const footer = this.footerHeights.get(note.id);
    return footer ? { ...note, height: note.height + footer } : note;
  }

  /**
   * The room a note takes as it is drawn now (see `getShownNote`), with what
   * the host drew under it: what is put next to all of it (its popup)
   * follows this one.
   */
  getShownBox(id: NoteId): WemaNote | undefined {
    const note = this.getShownNote(id);
    return note && this.withFooter(note);
  }

  /**
   * A note as it is drawn now: where it is placed (`getPlacedNote`), except
   * while it is animated to its place. What is drawn next to a note (its
   * edges) follows this one.
   */
  getShownNote(id: NoteId): WemaNote | undefined {
    const note = this.notes.get(id);
    if (!note) return undefined;
    const shown = this.shownRects.get(id);
    if (!shown) return this.getPlacedNote(id);
    const rect = { ...shown };
    // The style sheet sizes a measured note: its size on the way is the one
    // it is laid out with (0 when it is not laid out: keep the given one)
    const el = this.isSizedByContent(note) ? this.elements.get(id) : undefined;
    if (el) {
      if (note.autoSize) rect.width = el.offsetWidth || rect.width;
      rect.height = el.offsetHeight || rect.height;
    }
    return { ...note, ...rect };
  }

  /** Get all notes */
  getNotes(): WemaNote[] {
    return Array.from(this.notes.values()).map((n) => ({ ...n }));
  }

  /**
   * The lowest bottom edge among the notes `counts` accepts, or null when
   * there is none. What the host drew under a note counts as part of it.
   */
  lowestBottom(counts: (id: NoteId) => boolean): number | null {
    let bottom: number | null = null;
    for (const note of this.notes.values()) {
      if (!counts(note.id)) continue;
      const rect = this.placedRects.get(note.id) ?? note;
      bottom = Math.max(bottom ?? -Infinity, rect.y + rect.height + (this.footerHeights.get(note.id) ?? 0));
    }
    return bottom;
  }

  /** Get the DOM element for a note */
  getElement(id: NoteId): HTMLElement | undefined {
    return this.elements.get(id);
  }

  /** Bring a note to front by updating its zIndex */
  bringToFront(id: NoteId): void {
    const note = this.notes.get(id);
    if (!note) return;
    note.zIndex = this.zCounter++;
    this.updateNoteElement(note, false);
  }

  /** Toggle readOnly on all existing notes */
  setReadOnly(readOnly: boolean): void {
    this.readOnly = readOnly;
    for (const [id, el] of this.elements) {
      this.applyEditable(id);
      const resizeHandle = el.querySelector('.wema-resize-handle') as HTMLElement | null;
      if (resizeHandle) {
        resizeHandle.style.display = readOnly ? 'none' : '';
      }
      const moveHandle = el.querySelector('.wema-move-handle') as HTMLElement | null;
      if (moveHandle) {
        moveHandle.style.visibility = readOnly ? 'hidden' : '';
      }
    }
  }

  /** Toggle viewOnly on all existing notes */
  setViewOnly(viewOnly: boolean): void {
    this.viewOnly = viewOnly;
    for (const [id, el] of this.elements) {
      this.applyEditable(id);
      const resizeHandle = el.querySelector('.wema-resize-handle') as HTMLElement | null;
      if (resizeHandle) {
        resizeHandle.style.display = (viewOnly || this.readOnly) ? 'none' : '';
      }
      const moveHandle = el.querySelector('.wema-move-handle') as HTMLElement | null;
      if (moveHandle) {
        // viewOnly allows move; readOnly hides it
        moveHandle.style.visibility = this.readOnly ? 'hidden' : '';
      }
    }
  }

  /**
   * Get all notes with the text currently shown, including edits in progress.
   * The model is left untouched: an edit only reaches it when it is committed
   * on blur, so that the commit still sees the text from before the edit.
   */
  getNotesWithLiveText(): WemaNote[] {
    return Array.from(this.notes.values()).map((note) => {
      const contentEl = this.getTextElement(note.id);
      return { ...note, text: contentEl ? contentEl.innerHTML : note.text };
    });
  }

  /** Clean up board-level listeners */
  destroy(): void {
    this.boardEl.removeEventListener('click', this.handleImageOverlayDismiss, true);
    // What was asked of the host and is not drawn yet is not drawn any more
    this.footersShown = false;
    this.staleFooters.clear();
    this.footerObserver?.disconnect();
    this.imageOverlay.remove();
  }

  /** Show image overlay above the given image */
  private showImageOverlay(img: HTMLImageElement, noteId: NoteId): void {
    this.activeImage = img;
    this.activeImageNoteId = noteId;
    img.classList.add('wema-image-selected');

    this.imageOverlay.innerHTML = '';

    // Size buttons
    const sizes: { label: string; width: string }[] = [
      { label: 'S', width: '25%' },
      { label: 'M', width: '50%' },
      { label: 'L', width: '75%' },
      { label: '100%', width: '100%' },
    ];
    for (const size of sizes) {
      const btn = createElement('button', 'wema-image-overlay-btn') as HTMLButtonElement;
      btn.textContent = size.label;
      btn.title = size.width;
      const isActive = img.style.width === size.width
        || (!img.style.width && size.width === '100%');
      if (isActive) btn.classList.add('active');
      btn.addEventListener('click', () => {
        img.style.width = size.width;
        // Sync to note data
        this.syncNoteContent(noteId);
        this.showImageOverlay(img, noteId); // refresh active state
      });
      this.imageOverlay.appendChild(btn);
    }

    // Delete button
    const delBtn = createElement('button', 'wema-image-overlay-btn wema-image-overlay-delete') as HTMLButtonElement;
    delBtn.textContent = '✕';
    setLabel(delBtn, this.labels.deleteImage);
    delBtn.addEventListener('click', () => {
      img.remove();
      this.hideImageOverlay();
      this.syncNoteContent(noteId);
    });
    this.imageOverlay.appendChild(delBtn);

    this.imageOverlay.style.display = '';
    this.updateOverlayPosition();
  }

  /**
   * Place the image overlay above its image, or below it when there is no
   * room above (call again after the viewport changes)
   */
  updateOverlayPosition(): void {
    if (!this.activeImage) return;
    placeOverlay(this.imageOverlay, this.boardEl, screenBoxOf(this.activeImage, this.boardEl), 'above', 4);
  }

  /** Hide the image overlay */
  private hideImageOverlay(): void {
    this.imageOverlay.style.display = 'none';
    if (this.activeImage) {
      this.activeImage.classList.remove('wema-image-selected');
    }
    this.activeImage = null;
    this.activeImageNoteId = null;
  }

  /**
   * Commit an edit made in the DOM (typing, checkbox, image) to note data.
   * One note:update carries the text and the size it resulted in, including
   * what was measured while typing. Nothing is emitted when nothing changed.
   */
  private syncNoteContent(noteId: NoteId): void {
    const contentEl = this.getTextElement(noteId);
    if (!contentEl) return;
    const current = this.notes.get(noteId);
    if (!current) return;
    const prev = { ...current };
    current.text = contentEl.innerHTML;
    // Like any change of the text (the note is not one the host draws: it has a text element)
    if (current.text !== prev.text) this.requestFooter(noteId);
    const resized = this.applyMeasuredSize(current);
    if (current.text !== prev.text || resized || this.unreportedSizeBase.has(noteId)) {
      this.emitUpdate(current, prev);
    }
  }

  /** Remove all notes and DOM elements */
  clear(): void {
    for (const el of this.elements.values()) {
      el.remove();
    }
    this.elements.clear();
    this.notes.clear();
    this.unreportedSizeBase.clear();
    this.shownRects.clear();
    this.placedRects.clear();
    this.staleFooters.clear();
    this.footerHeights.clear();
    this.footerObserver?.disconnect();
    this.unfolded.clear();
    this.editingId = null;
    this.zCounter = 1;
  }

  /** Render all notes from data (used by importData) */
  renderAll(notes: WemaNote[]): void {
    this.clear();
    for (const note of notes) {
      this.notes.set(note.id, this.stored(note));
      if (note.zIndex >= this.zCounter) {
        this.zCounter = note.zIndex + 1;
      }
      this.renderNote(this.notes.get(note.id)!, false);
    }
    // The sizes in the data are those of where it was saved (another font,
    // or an estimate): the measured notes take the size they have here. All
    // the notes are in the document first, so that reading the sizes one
    // after the other does not lay the board out again for each note.
    for (const note of this.notes.values()) {
      if (isMeasured(note)) this.applyMeasuredSize(note);
    }
  }

  /**
   * Create the element of a note. `measure`: copy the rendered size of a
   * measured note to the model right away (`renderAll` does it for all the
   * notes at once instead).
   */
  private renderNote(note: WemaNote, measure = true): void {
    const el = createElement('div', 'wema-note');
    el.dataset.noteId = note.id;

    // Move handle (grip bar at top)
    const moveHandle = createElement('div', 'wema-move-handle');
    moveHandle.style.position = 'relative';
    moveHandle.innerHTML = '<svg width="20" height="10" viewBox="0 0 20 10"><circle cx="4" cy="3" r="1.5" fill="currentColor"/><circle cx="10" cy="3" r="1.5" fill="currentColor"/><circle cx="16" cy="3" r="1.5" fill="currentColor"/><circle cx="4" cy="8" r="1.5" fill="currentColor"/><circle cx="10" cy="8" r="1.5" fill="currentColor"/><circle cx="16" cy="8" r="1.5" fill="currentColor"/></svg>';
    if (this.readOnly) {
      moveHandle.style.visibility = 'hidden';
    }

    const content = createElement('div', 'wema-note-content');
    content.innerHTML = isPlainText(note.text) ? escapeHtml(note.text) : sanitizeHtml(note.text);

    // Track if content was actually edited (prevents false diffs from browser innerHTML normalization)
    let dirty = false;
    content.addEventListener('input', () => {
      dirty = true;
      this.measure(note.id);
    });

    // A foldable note is shown open while its text is edited, and goes back
    // to how it was when the focus leaves
    content.addEventListener('focus', () => {
      this.editingId = note.id;
      this.measure(note.id);
    });

    // Handle blur to commit text edits
    content.addEventListener('blur', () => {
      if (this.editingId === note.id) this.editingId = null;
      // Before the commit, so that the update carries the size the note has now
      this.measure(note.id);
      if (!dirty) return;
      dirty = false;
      this.syncNoteContent(note.id);
    });

    // Paste handler: sanitize pasted HTML
    content.addEventListener('paste', (e: ClipboardEvent) => {
      e.preventDefault();
      const html = e.clipboardData?.getData('text/html');
      const plain = e.clipboardData?.getData('text/plain') ?? '';
      if (html) {
        insertHtmlAtCaret(sanitizeHtml(html, { pasted: true }));
      } else {
        insertHtmlAtCaret(escapeHtml(plain).replace(/\n/g, '<br>'));
      }
      dirty = true;
    });

    // Checkbox toggle handler
    content.addEventListener('click', (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' && (target as HTMLInputElement).type === 'checkbox') {
        // Allow the default toggle, then sync checked attribute and class
        setTimeout(() => {
          const input = target as HTMLInputElement;
          // Sync .checked property to HTML attribute so innerHTML reflects it
          if (input.checked) {
            input.setAttribute('checked', '');
          } else {
            input.removeAttribute('checked');
          }
          const li = target.closest('li');
          if (li) {
            li.classList.toggle('wema-checked', input.checked);
          }
          dirty = true;
          this.syncNoteContent(note.id);
        }, 0);
        return;
      }

      // Link click handler — open in a new tab unless onLinkClick handles it
      if (target.tagName === 'A' || target.closest('a')) {
        const linkEl = (target.tagName === 'A' ? target : target.closest('a')) as HTMLAnchorElement;
        e.preventDefault();
        // The hook and window.open both get the resolved URL, never the raw
        // attribute: "//host/path" or "/\host" look like paths but lead to
        // another site. A link that does not pass the check opens nothing.
        const href = linkEl.getAttribute('href');
        const url = href ? resolveSafeUrl(href) : null;
        if (url && this.onLinkClick?.(url, e) !== true) {
          window.open(url, '_blank', 'noopener');
        }
        return;
      }

      // Image click handler — show size/delete overlay
      if (target.tagName === 'IMG') {
        e.preventDefault();
        if (!this.readOnly && !this.viewOnly) {
          this.showImageOverlay(target as HTMLImageElement, note.id);
        }
      }
    });

    // Tab / Shift+Tab in a list: indent / outdent the items
    content.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.key !== 'Tab' || e.isComposing || e.ctrlKey || e.metaKey || e.altKey) return;
      if (!this.isEditable(note.id)) return;
      const range = getSelectionRange(content);
      if (!range || !isInListItem(content, range)) return;
      // Inside a list the key never moves the focus, even when the item cannot move
      e.preventDefault();
      const move = e.shiftKey ? outdentListItems : indentListItems;
      this.editContent(note.id, (el, at) => at && move(el, at));
    });

    // Enter key in checklist: insert new TODO item
    content.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.key !== 'Enter' || e.isComposing) return;
      if (!this.isEditable(note.id)) return;
      const sel = document.getSelection();
      if (!sel || sel.rangeCount === 0) return;
      const li = (sel.anchorNode?.nodeType === Node.TEXT_NODE
        ? sel.anchorNode.parentElement : sel.anchorNode as HTMLElement)?.closest('li');
      // Look at the list the item is in: a checklist may hold a plain sub-list
      if (!li || !li.parentElement || getListType(li.parentElement) !== 'checklist') return;

      e.preventDefault();
      const newLi = createListItem('checklist');
      newLi.appendChild(document.createTextNode(' '));

      // Split text after caret into new item
      const range = sel.getRangeAt(0);
      const afterRange = document.createRange();
      afterRange.setStart(range.endContainer, range.endOffset);
      afterRange.setEndAfter(li.lastChild ?? li);
      const trailing = afterRange.extractContents();
      // Remove the item's own checkbox from extracted contents if any (shouldn't
      // happen, but safety). The checkboxes of a sub-list that comes along stay.
      for (const child of Array.from(trailing.children)) {
        if (child.tagName === 'INPUT' && (child as HTMLInputElement).type === 'checkbox') child.remove();
      }
      newLi.appendChild(trailing);

      li.parentNode?.insertBefore(newLi, li.nextSibling);

      // Set caret after the checkbox in the new item
      const newRange = document.createRange();
      newRange.setStart(newLi, 2); // after checkbox and space text node
      newRange.collapse(true);
      setSelectionRange(newRange);
      dirty = true;
    });

    // Anchor points (visual only in Phase 1)
    const anchors = createElement('div', 'wema-note-anchors');
    for (const pos of ['top', 'right', 'bottom', 'left'] as const) {
      const anchor = createElement('div', `wema-anchor wema-anchor-${pos}`);
      anchor.dataset.anchor = pos;
      anchors.appendChild(anchor);
    }

    // Resize handle (bottom-right corner)
    const resizeHandle = createElement('div', 'wema-resize-handle');
    if (this.readOnly || this.viewOnly) {
      resizeHandle.style.display = 'none';
    }

    // Per-side collapse buttons (managed by board via updateNoteCollapseBtns)
    const sides = ['top', 'right', 'bottom', 'left'] as const;
    for (const side of sides) {
      const collapseBtn = createElement('div', 'wema-note-collapse-btn');
      collapseBtn.dataset.side = side;
      collapseBtn.style.display = 'none';
      collapseBtn.addEventListener('pointerdown', (e) => e.stopPropagation());
      collapseBtn.addEventListener('click', (e) => e.stopPropagation());
      el.appendChild(collapseBtn);
    }

    el.appendChild(moveHandle);
    el.appendChild(content);
    // Where the host draws the note (`renderNote` option); shown instead of the content
    el.appendChild(createElement('div', 'wema-note-custom'));
    // The link that opens and closes a foldable note; shown when its text is long
    const foldToggle = createElement('button', 'wema-note-fold-toggle') as HTMLButtonElement;
    foldToggle.type = 'button';
    foldToggle.addEventListener('pointerdown', (e) => e.stopPropagation());
    // Keep the focus where it is: a note that is open because it is edited
    // would close under the pointer, and the click would miss the link
    foldToggle.addEventListener('mousedown', (e) => e.preventDefault());
    foldToggle.addEventListener('click', (e) => {
      e.stopPropagation();
      this.toggleFold(note.id);
    });
    el.appendChild(foldToggle);
    el.appendChild(anchors);
    el.appendChild(resizeHandle);
    if (this.hostFooter) {
      // Where the host draws under the note (`renderNoteFooter` option). It
      // is outside the box of the note, and a press or a click in it is not
      // one on the note: it selects nothing and starts nothing.
      const footer = createElement('div', 'wema-note-footer');
      // Nor is a key pressed in it (on a button of the host that has the
      // focus) a shortcut of the board: Delete would remove the selected notes
      for (const type of ['pointerdown', 'click', 'dblclick', 'keydown'] as const) {
        footer.addEventListener(type, (e) => e.stopPropagation());
      }
      el.appendChild(footer);
    }

    this.applyStyles(el, note);
    this.layerEl.appendChild(el);
    this.elements.set(note.id, el);
    this.applyEditable(note.id);
    this.drawByHost(note);
    this.requestFooter(note.id);
    // The size of a measured note is the rendered one from the start (and in
    // the note:create that follows). A foldable note starts closed.
    if (measure && isMeasured(note)) this.applyMeasuredSize(note);
  }

  /**
   * Apply a note's state to its element. The content is only rendered again
   * when `textChanged`: the model text may differ from the element's innerHTML
   * (which the browser normalizes), and rendering on every move would rebuild
   * the content, reloading its images and embeds.
   */
  private updateNoteElement(note: WemaNote, textChanged: boolean): void {
    const el = this.elements.get(note.id);
    if (!el) return;
    this.applyStyles(el, note);
    const content = el.querySelector('.wema-note-content') as HTMLElement | null;
    if (textChanged && content && content.innerHTML !== note.text && document.activeElement !== content) {
      content.innerHTML = isPlainText(note.text) ? escapeHtml(note.text) : sanitizeHtml(note.text);
    }
    // After CSS layout, sync measured size back to model for measured notes
    if (isMeasured(note)) {
      requestAnimationFrame(() => this.measure(note.id));
    }
  }

  private applyStyles(el: HTMLElement, note: WemaNote): void {
    const placed = this.placedRects.get(note.id);
    const rect = this.shownRects.get(note.id) ?? placed ?? note;
    el.classList.toggle(PLACED_CLASS, placed !== undefined);
    setStyles(el, {
      left: `${rect.x}px`,
      top: `${rect.y}px`,
      width: `${rect.width}px`,
      height: `${rect.height}px`,
      zIndex: String(note.zIndex),
    });
    el.style.setProperty('--wema-note-color', note.color);
    el.classList.toggle(AUTO_SIZE_CLASS, !!note.autoSize);
    el.classList.toggle(FOLDABLE_CLASS, !!note.foldable);
  }
}
