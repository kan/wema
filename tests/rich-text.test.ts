import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { WemaBoard } from '../src/board';

describe('rich text toolbar', () => {
  let container: HTMLElement;
  let board: WemaBoard;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    board = new WemaBoard({ container });
    // jsdom has no layout: the toolbar asks where the selection is
    Range.prototype.getBoundingClientRect ??= () => new DOMRect();
  });

  afterEach(() => {
    board.destroy();
    container.remove();
  });

  const nextFrame = () => new Promise((resolve) => requestAnimationFrame(resolve));

  function contentOf(noteId: string): HTMLElement {
    return container.querySelector(`[data-note-id="${noteId}"] .wema-note-content`) as HTMLElement;
  }

  /** Select the text `text` in a note, and wait for the toolbar to follow */
  async function selectText(noteId: string, text: string): Promise<void> {
    const walker = document.createTreeWalker(contentOf(noteId), NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const at = (node as Text).data.indexOf(text);
      if (at === -1) continue;
      const range = document.createRange();
      range.setStart(node, at);
      range.setEnd(node, at + text.length);
      const sel = document.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(range);
      document.dispatchEvent(new Event('selectionchange'));
      await nextFrame();
      return;
    }
    throw new Error(`no text node holds "${text}"`);
  }

  function toolbarButton(title: string): HTMLButtonElement {
    const button = container.querySelector<HTMLButtonElement>(`.wema-richtext-toolbar button[title="${title}"]`);
    if (!button) throw new Error(`no toolbar button "${title}"`);
    return button;
  }

  it('the strikethrough button wraps the selection in <s>', async () => {
    const note = board.addNote({ text: 'one two three' });
    await selectText(note.id, 'two');

    expect(toolbarButton('Strikethrough').classList.contains('active')).toBe(false);
    toolbarButton('Strikethrough').click();
    expect(contentOf(note.id).innerHTML).toBe('one <s>two</s> three');

    contentOf(note.id).dispatchEvent(new Event('blur'));
    expect(board.getNote(note.id)?.text).toBe('one <s>two</s> three');
  });

  it('the strikethrough button takes the <s> away from a selection inside it', async () => {
    const note = board.addNote({ text: 'one <s>two</s> three' });
    await selectText(note.id, 'two');

    expect(toolbarButton('Strikethrough').classList.contains('active')).toBe(true);
    toolbarButton('Strikethrough').click();
    expect(contentOf(note.id).innerHTML).toBe('one two three');
  });

  it('the bold button still wraps and unwraps', async () => {
    const note = board.addNote({ text: 'one two' });
    await selectText(note.id, 'two');
    toolbarButton('Bold').click();
    expect(contentOf(note.id).innerHTML).toBe('one <b>two</b>');

    await selectText(note.id, 'two');
    toolbarButton('Bold').click();
    expect(contentOf(note.id).innerHTML).toBe('one two');
  });
});
