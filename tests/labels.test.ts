import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { WemaBoard } from '../src/board';
import { enLabels, jaLabels, resolveLabels } from '../src/labels';
import type { WemaBoardOptions } from '../src/types';

describe('resolveLabels', () => {
  it('gives the English labels when nothing is passed', () => {
    expect(resolveLabels()).toEqual(enLabels);
  });

  it('replaces only the keys that are passed', () => {
    const labels = resolveLabels({ bold: '太字' });
    expect(labels.bold).toBe('太字');
    expect(labels.strikethrough).toBe('Strikethrough');
  });

  it('keeps the English text of a key passed as undefined', () => {
    expect(resolveLabels({ bold: undefined }).bold).toBe('Bold');
  });

  it('ignores a key it does not know', () => {
    const labels = resolveLabels({ unknown: 'x' } as Record<string, string>);
    expect(labels).toEqual(enLabels);
  });

  it('keeps the English text of a key passed with a value of the wrong type', () => {
    const labels = resolveLabels({ bold: null, deleteNotes: 'Delete' } as unknown as Record<string, string>);
    expect(labels.bold).toBe('Bold');
    expect(labels.deleteNotes(2)).toBe('Delete 2 notes');
  });

  it('lets foldLabels win over readMore and showLess', () => {
    const labels = resolveLabels({ readMore: 'A', showLess: 'B' }, { more: 'C' });
    expect([labels.readMore, labels.showLess]).toEqual(['C', 'B']);
  });

  it('does not change the labels it is given', () => {
    resolveLabels({ bold: '太字' }, { more: 'C' });
    expect(enLabels.bold).toBe('Bold');
    expect(enLabels.readMore).toBe('Read more');
  });
});

describe('jaLabels', () => {
  it('has a text for every key of the English labels', () => {
    expect(Object.keys(jaLabels).sort()).toEqual(Object.keys(enLabels).sort());
    for (const value of Object.values(jaLabels)) {
      expect(typeof value === 'function' ? value(3) : value).not.toBe('');
    }
  });

  it('puts the count into the text of the bulk delete', () => {
    expect(enLabels.deleteNotes(3)).toBe('Delete 3 notes');
    expect(jaLabels.deleteNotes(3)).toBe('3 枚の付箋を削除');
  });
});

describe('the labels option', () => {
  let container: HTMLElement;
  let board: WemaBoard;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    // jsdom has no layout: the board asks which edge is under the pointer,
    // and the toolbar asks where the selection is
    document.elementsFromPoint ??= () => [];
    Range.prototype.getBoundingClientRect ??= () => new DOMRect();
  });

  afterEach(() => {
    board.destroy();
    container.remove();
  });

  function createBoard(options: Partial<WemaBoardOptions> = {}): void {
    board = new WemaBoard({ container, ...options });
  }

  const nextFrame = () => new Promise((resolve) => requestAnimationFrame(resolve));

  /** The tooltips of the buttons inside an element, in the order they are shown */
  function titlesIn(selector: string): string[] {
    return Array.from(container.querySelectorAll<HTMLElement>(`${selector} button`))
      .map((b) => b.title)
      .filter((title) => title !== '');
  }

  /** Click a note, which selects it and opens its popup */
  function clickNote(noteId: string): void {
    container.querySelector(`[data-note-id="${noteId}"]`)
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  }

  function showEdgePopup(): void {
    const a = board.addNote({ x: 0, y: 0 });
    const b = board.addNote({ x: 400, y: 0 });
    const edge = board.addEdge(a.id, b.id);
    const internals = board as unknown as { edgePopup: { show(id: string, x: number, y: number): void } };
    internals.edgePopup.show(edge.id, 100, 100);
  }

  async function showToolbar(): Promise<void> {
    const note = board.addNote({ text: 'one two' });
    const text = container.querySelector(`[data-note-id="${note.id}"] .wema-note-content`)!.firstChild as Text;
    const range = document.createRange();
    range.setStart(text, 0);
    range.setEnd(text, 3);
    const sel = document.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
    document.dispatchEvent(new Event('selectionchange'));
    await nextFrame();
  }

  it('shows the English labels by default', () => {
    createBoard();
    const note = board.addNote({ text: 'a' });
    clickNote(note.id);
    expect(titlesIn('.wema-note-popup-actions')).toEqual([
      'Color', 'Auto Size', 'Fold Long Text', 'Duplicate', 'Delete',
      'Bulleted List', 'Numbered List', 'Checklist', 'Outdent (Shift+Tab)', 'Indent (Tab)', 'Image', 'Embed',
    ]);
  });

  it('labels the note popup', () => {
    createBoard({ labels: jaLabels });
    const note = board.addNote({ text: 'a' });
    clickNote(note.id);
    const titles = titlesIn('.wema-note-popup');
    for (const key of [
      'color', 'duplicate', 'delete', 'autoSize', 'foldLongText', 'bulletedList', 'numberedList', 'checklist',
      'outdent', 'indent', 'image', 'embed', 'colorButter', 'colorGray',
    ] as const) {
      expect(titles).toContain(jaLabels[key]);
    }
    expect(titles.some((title) => /[A-Za-z]/.test(title.replace(/\(.*\)/, '')))).toBe(false);
  });

  it('gives the buttons the same text as aria-label', () => {
    createBoard({ labels: jaLabels });
    const note = board.addNote({ text: 'a' });
    clickNote(note.id);
    const buttons = Array.from(container.querySelectorAll<HTMLElement>('.wema-note-popup button'));
    expect(buttons.length).toBeGreaterThan(0);
    for (const button of buttons) {
      expect(button.getAttribute('aria-label')).toBe(button.title);
      expect(button.title).not.toBe('');
    }
  });

  it('labels the bulk delete with the number of notes', () => {
    createBoard({ labels: { deleteNotes: (count) => `${count} 枚を削除` } });
    const notes = [board.addNote(), board.addNote(), board.addNote()];
    board.select(notes.map((n) => n.id));
    const internals = board as unknown as { notePopup: { showMulti(ids: string[]): void } };
    internals.notePopup.showMulti(notes.map((n) => n.id));
    expect(titlesIn('.wema-note-popup-actions')).toEqual(['Color', 'Auto Size', 'Fold Long Text', '3 枚を削除']);
  });

  it('labels the edge popup', () => {
    createBoard({ labels: jaLabels });
    showEdgePopup();
    const popup = container.querySelector('.wema-edge-popup') as HTMLElement;
    const headings = Array.from(popup.querySelectorAll('.wema-popup-label')).map((el) => el.textContent);
    expect(headings).toEqual(['線', '矢印', 'サイズ', '太さ', '経路', '始点', '終点']);
    expect(popup.querySelector('.wema-popup-details-toggle')?.textContent?.trim()).toBe('詳細');
    expect(titlesIn('.wema-edge-popup').sort()).toEqual([
      '実線', '破線', '点線',
      '矢印なし', '始点に矢印', '終点に矢印', '両端に矢印',
      '小', '中', '大',
      '細い', '標準', '太い',
      '曲線', '折れ線',
      '自動', '上', '右', '下', '左',
      '自動', '上', '右', '下', '左',
      '削除',
    ].sort());
  });

  it('does not read a label as HTML', () => {
    createBoard({ labels: { details: '<b>x</b>' } });
    showEdgePopup();
    const toggle = container.querySelector('.wema-popup-details-toggle') as HTMLElement;
    expect(toggle.querySelector('b')).toBeNull();
    expect(toggle.textContent?.trim()).toBe('<b>x</b>');
  });

  it('labels the text toolbar', async () => {
    createBoard({ labels: jaLabels });
    await showToolbar();
    expect(titlesIn('.wema-richtext-toolbar')).toEqual(['太字', '取り消し線', '文字色', 'リンク', 'リンクを解除']);
  });

  it('labels the button that applies a link', async () => {
    createBoard({ labels: { ok: '決定' } });
    await showToolbar();
    const buttons = Array.from(container.querySelectorAll('.wema-richtext-link-input button'));
    expect(buttons.map((b) => b.textContent)).toEqual(['決定', '✕']);
  });

  describe('the link under a foldable note', () => {
    /** The text of the link of a note that is long (jsdom has no layout: its text reports a height) */
    function foldLinkText(): string | null {
      const note = board.addNote({ text: 'text' });
      const el = container.querySelector(`[data-note-id="${note.id}"]`) as HTMLElement;
      Object.defineProperty(el.querySelector('.wema-note-content'), 'scrollHeight', { value: 200 });
      Object.defineProperty(el, 'offsetWidth', { value: 200 });
      Object.defineProperty(el, 'offsetHeight', { value: 100 });
      board.updateNote(note.id, { foldable: true });
      return el.querySelector('.wema-note-fold-toggle')?.textContent ?? null;
    }

    it('takes its text from labels', () => {
      createBoard({ labels: jaLabels });
      expect(foldLinkText()).toBe('続きを読む');
    });

    it('takes its text from foldLabels when both are given', () => {
      createBoard({ labels: jaLabels, foldLabels: { more: 'もっと見る' } });
      expect(foldLinkText()).toBe('もっと見る');
    });
  });
});
