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

  describe('the quote button', () => {
    const flush = () => Promise.resolve();

    it('quotes the selection in a new note, with an arrow from the note', async () => {
      const note = board.addNote({ x: 100, y: 50, width: 240, height: 150, text: 'one <b>two</b> three', color: '#C8E6C9' });
      await selectText(note.id, 'two');

      toolbarButton('Quote in a new note').click();

      const [, quote] = board.getNotes();
      expect(quote).toMatchObject({ x: 420, y: 50, width: 240, color: '#C8E6C9' });
      expect(quote.text).toBe('<blockquote>two</blockquote><div><br></div>');
      expect(contentOf(quote.id).querySelector('blockquote')?.textContent).toBe('two');
      expect(board.getEdges()).toMatchObject([{ from: note.id, to: quote.id, style: 'arrow' }]);
      // The source is left as it was, the new note is selected, the toolbar is gone
      expect(board.getNote(note.id)!.text).toBe('one <b>two</b> three');
      expect(board.getSelection()).toEqual([quote.id]);
      expect((container.querySelector('.wema-richtext-toolbar') as HTMLElement).style.display).toBe('none');
    });

    it('keeps the formatting of what is quoted', async () => {
      const note = board.addNote({ text: 'one <b>two</b> three' });
      const range = document.createRange();
      range.selectNodeContents(contentOf(note.id));
      document.getSelection()?.removeAllRanges();
      document.getSelection()?.addRange(range);
      document.dispatchEvent(new Event('selectionchange'));
      await nextFrame();

      toolbarButton('Quote in a new note').click();

      expect(board.getNotes()[1].text).toBe('<blockquote>one <b>two</b> three</blockquote><div><br></div>');
    });

    it('is one undo step', async () => {
      const note = board.addNote({ text: 'one two three' });
      await flush();
      await selectText(note.id, 'two');

      toolbarButton('Quote in a new note').click();
      await flush();
      expect(board.getNotes()).toHaveLength(2);

      board.undo();
      expect(board.getNotes()).toHaveLength(1);
      expect(board.getEdges()).toHaveLength(0);
    });

    it('keeps an edit of the note an undo step of its own', async () => {
      const note = board.addNote({ text: 'one two three' });
      await flush();
      // An edit that the quote button ends: the text is typed, not yet committed
      // (jsdom does not focus an element for being editable: it needs a tabindex)
      contentOf(note.id).tabIndex = 0;
      contentOf(note.id).focus();
      expect(document.activeElement).toBe(contentOf(note.id));
      contentOf(note.id).textContent = 'one two three four';
      contentOf(note.id).dispatchEvent(new Event('input', { bubbles: true }));
      await selectText(note.id, 'four');

      toolbarButton('Quote in a new note').click();
      await flush();
      expect(board.getNote(note.id)!.text).toBe('one two three four');

      board.undo();
      expect(board.getNotes()).toHaveLength(1);
      expect(board.getNote(note.id)!.text).toBe('one two three four');
    });

    it('gives list items that are quoted a list like the one they come from', async () => {
      const note = board.addNote({ text: '<ol><li>first</li><li>second</li><li>third</li></ol>' });
      const items = contentOf(note.id).querySelectorAll('li');
      const range = document.createRange();
      range.setStart(items[0].firstChild!, 2);
      range.setEnd(items[1].firstChild!, 3);
      document.getSelection()?.removeAllRanges();
      document.getSelection()?.addRange(range);
      document.dispatchEvent(new Event('selectionchange'));
      await nextFrame();

      toolbarButton('Quote in a new note').click();

      expect(board.getNotes()[1].text)
        .toBe('<blockquote><ol><li>rst</li><li>sec</li></ol></blockquote><div><br></div>');
    });

    it('puts the new note in the same column in the page scroll mode', async () => {
      const note = board.addNote({ x: 20, y: 56, width: 335, height: 100, text: 'one two three' });
      board.addNote({ x: 20, y: 172, width: 335, height: 100 });
      board.setPageScroll(true);
      await selectText(note.id, 'two');

      toolbarButton('Quote in a new note').click();

      expect(board.getNotes()[2]).toMatchObject({ x: 20, y: 292, width: 335 });
    });

    it('puts the new note under what is already next to the note', async () => {
      const note = board.addNote({ x: 0, y: 0, width: 200, height: 150, text: 'one two three' });
      board.addNote({ x: 300, y: 100, width: 200, height: 150 });
      board.addNote({ x: 250, y: 260, width: 200, height: 100 });
      await selectText(note.id, 'two');

      toolbarButton('Quote in a new note').click();

      expect(board.getNotes()[3]).toMatchObject({ x: 280, y: 380 });
    });

    it('keeps a blockquote through the sanitizer', () => {
      const note = board.addNote({ text: '<blockquote onclick="x()">quoted<script>x()</script></blockquote>' });
      expect(contentOf(note.id).innerHTML).toBe('<blockquote>quoted</blockquote>');
    });
  });

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
