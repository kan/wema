import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { WemaBoard } from '../src/board';
import {
  toggleList, appendListItem, indentListItems, outdentListItems,
} from '../src/utils/list';

describe('list editing', () => {
  let content: HTMLElement;

  beforeEach(() => {
    content = document.createElement('div');
    document.body.appendChild(content);
  });

  afterEach(() => {
    content.remove();
  });

  /** The first text node under the content element holding `text` */
  function textNode(text: string): Text {
    const walker = document.createTreeWalker(content, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if ((node as Text).data.includes(text)) return node as Text;
    }
    throw new Error(`no text node holds "${text}"`);
  }

  /** A caret inside the text `text`, `offset` characters from where it starts */
  function caretIn(text: string, offset = 0): Range {
    const node = textNode(text);
    const range = document.createRange();
    range.setStart(node, node.data.indexOf(text) + offset);
    range.collapse(true);
    return range;
  }

  /** A selection from the start of the text `from` to the end of the text `to` */
  function select(from: string, to: string): Range {
    const start = textNode(from);
    const end = textNode(to);
    const range = document.createRange();
    range.setStart(start, start.data.indexOf(from));
    range.setEnd(end, end.data.indexOf(to) + to.length);
    return range;
  }

  describe('toggleList', () => {
    it('turns the line of the caret into a list item', () => {
      content.innerHTML = 'one\ntwo\nthree';
      toggleList(content, caretIn('two', 1), 'ul');
      expect(content.innerHTML).toBe('one\n<ul><li>two</li></ul>three');
    });

    it('turns the first and the last line without touching the others', () => {
      content.innerHTML = 'one\ntwo';
      toggleList(content, caretIn('one'), 'ul');
      expect(content.innerHTML).toBe('<ul><li>one</li></ul>two');

      content.innerHTML = 'one\ntwo';
      toggleList(content, caretIn('two', 3), 'ol');
      expect(content.innerHTML).toBe('one\n<ol><li>two</li></ol>');
    });

    it('keeps the caret where it was in the text', () => {
      content.innerHTML = 'one\ntwo';
      const next = toggleList(content, caretIn('two', 2), 'ul');
      expect(next?.collapsed).toBe(true);
      expect((next?.startContainer as Text).data).toBe('two');
      expect(next?.startOffset).toBe(2);
    });

    it('turns each selected line into an item', () => {
      content.innerHTML = 'one\ntwo\nthree\nfour';
      toggleList(content, select('two', 'three'), 'ul');
      expect(content.innerHTML).toBe('one\n<ul><li>two</li><li>three</li></ul>four');
    });

    it('covers a line the selection only partly includes', () => {
      content.innerHTML = 'one\ntwo\nthree';
      const range = select('one', 'two');
      range.setStart(range.startContainer, 2);
      range.setEnd(range.endContainer, range.endOffset - 2);
      toggleList(content, range, 'ul');
      expect(content.innerHTML).toBe('<ul><li>one</li><li>two</li></ul>three');
    });

    it('leaves out the line a selection ends at the start of', () => {
      content.innerHTML = 'one\ntwo\nthree';
      const range = select('one', 'two');
      range.setEnd(range.endContainer, range.endOffset - 3);
      toggleList(content, range, 'ul');
      expect(content.innerHTML).toBe('<ul><li>one</li></ul>two\nthree');
    });

    it('leaves out the next line when the selection ends at offset 0 of its text', () => {
      content.innerHTML = 'one<br>two<br>three';
      const range = select('one', 'two');
      range.setEnd(textNode('two'), 0);
      toggleList(content, range, 'ul');
      expect(content.innerHTML).toBe('<ul><li>one</li></ul>two<br>three');
    });

    it('leaves out the next <div> when the selection ends at its start', () => {
      content.innerHTML = '<div>one</div><div>two</div><div>three</div>';
      const range = select('one', 'two');
      range.setEnd(content.children[1], 0);
      toggleList(content, range, 'ul');
      expect(content.innerHTML).toBe('<ul><li>one</li></ul><div>two</div><div>three</div>');
    });

    it('keeps a line that holds only an image', () => {
      content.innerHTML = 'one<br><img src="a.png"><br>two';
      toggleList(content, select('one', 'two'), 'ul');
      expect(content.innerHTML).toBe('<ul><li>one</li><li><img src="a.png"></li><li>two</li></ul>');
    });

    it('skips empty lines in a selection', () => {
      content.innerHTML = 'one\n\ntwo';
      toggleList(content, select('one', 'two'), 'ul');
      expect(content.innerHTML).toBe('<ul><li>one</li><li>two</li></ul>');
    });

    it('handles lines separated by <br>', () => {
      content.innerHTML = 'one<br><b>two</b> and<br>three';
      toggleList(content, select('one', 'and'), 'ul');
      expect(content.innerHTML).toBe('<ul><li>one</li><li><b>two</b> and</li></ul>three');
    });

    it('handles lines the browser wrapped in <div>', () => {
      content.innerHTML = 'one<div>two</div><div>three</div><div><br></div>';
      toggleList(content, select('one', 'three'), 'ol');
      expect(content.innerHTML).toBe('<ol><li>one</li><li>two</li><li>three</li></ol><div><br></div>');
    });

    it('turns the <div> of the caret into an item', () => {
      content.innerHTML = 'one<div>two</div><div>three</div>';
      toggleList(content, caretIn('two'), 'ul');
      expect(content.innerHTML).toBe('one<ul><li>two</li></ul><div>three</div>');
    });

    it('makes an empty item on an empty line and puts the caret in it', () => {
      const range = document.createRange();
      range.selectNodeContents(content);
      range.collapse(true);
      const next = toggleList(content, range, 'ul');
      expect(content.innerHTML).toBe('<ul><li></li></ul>');
      expect(next?.startContainer).toBe(content.querySelector('li'));
    });

    it('adds a checkbox to each item of a checklist', () => {
      content.innerHTML = 'one\ntwo';
      toggleList(content, select('one', 'two'), 'checklist');
      expect(content.innerHTML).toBe(
        '<ul class="wema-checklist"><li><input type="checkbox">one</li><li><input type="checkbox">two</li></ul>',
      );
    });

    it('joins the new list with a list of the same type next to it', () => {
      content.innerHTML = '<ul><li>one</li></ul>two\n<ul><li>three</li></ul>';
      toggleList(content, caretIn('two'), 'ul');
      expect(content.innerHTML).toBe('<ul><li>one</li><li>two</li><li>three</li></ul>');
    });

    it('does not join a list of another type', () => {
      content.innerHTML = '<ol><li>one</li></ol>two';
      toggleList(content, caretIn('two'), 'ul');
      expect(content.innerHTML).toBe('<ol><li>one</li></ol><ul><li>two</li></ul>');
    });

    it('takes in a list the selection covers together with plain lines', () => {
      content.innerHTML = 'one\n<ol><li>two</li></ol>three';
      toggleList(content, select('one', 'three'), 'ul');
      expect(content.innerHTML).toBe('<ul><li>one</li><li>two</li><li>three</li></ul>');
    });

    it('converts the list the caret is in', () => {
      content.innerHTML = '<ul><li>one</li><li>two</li></ul>';
      toggleList(content, caretIn('two'), 'ol');
      expect(content.innerHTML).toBe('<ol><li>one</li><li>two</li></ol>');
    });

    it('converts only the sub-list the caret is in', () => {
      content.innerHTML = '<ul><li>one<ul><li>two</li></ul></li></ul>';
      toggleList(content, caretIn('two'), 'ol');
      expect(content.innerHTML).toBe('<ul><li>one<ol><li>two</li></ol></li></ul>');
    });

    it('removes the checkboxes when a checklist becomes another list', () => {
      content.innerHTML = '<ul class="wema-checklist"><li class="wema-checked"><input type="checkbox" checked>one</li></ul>';
      toggleList(content, caretIn('one'), 'ul');
      expect(content.innerHTML).toBe('<ul><li class="">one</li></ul>');
    });

    it('turns the item of the caret back into a line when the list already has the type', () => {
      content.innerHTML = '<ul><li>one</li></ul>';
      const next = toggleList(content, caretIn('one', 2), 'ul');
      expect(content.innerHTML).toBe('<div>one</div>');
      expect((next?.startContainer as Text).data).toBe('one');
      expect(next?.startOffset).toBe(2);
    });

    it('splits the list around the item it turns back', () => {
      content.innerHTML = '<ol><li>one</li><li>two</li><li>three</li></ol>';
      toggleList(content, caretIn('two'), 'ol');
      expect(content.innerHTML).toBe('<ol><li>one</li></ol><div>two</div><ol><li>three</li></ol>');
    });

    it('turns back all the selected items', () => {
      content.innerHTML = '<ul><li>one</li><li>two</li><li>three</li></ul>';
      toggleList(content, select('two', 'three'), 'ul');
      expect(content.innerHTML).toBe('<ul><li>one</li></ul><div>two</div><div>three</div>');
    });

    it('removes the checkbox when a checklist item is turned back', () => {
      content.innerHTML = '<ul class="wema-checklist"><li class="wema-checked"><input type="checkbox" checked>one</li></ul>';
      toggleList(content, caretIn('one'), 'checklist');
      expect(content.innerHTML).toBe('<div>one</div>');
    });

    it('keeps the sub-list of an item it turns back', () => {
      content.innerHTML = '<ul><li>one<ul><li>two</li></ul></li><li>three</li></ul>';
      toggleList(content, caretIn('one'), 'ul');
      expect(content.innerHTML).toBe('<div>one</div><ul><li>two</li></ul><ul><li>three</li></ul>');
    });

    it('turns back an item of a sub-list inside its parent item', () => {
      content.innerHTML = '<ul><li>one<ul><li>two</li></ul></li></ul>';
      toggleList(content, caretIn('two'), 'ul');
      expect(content.innerHTML).toBe('<ul><li>one<div>two</div></li></ul>');
    });

    it('keeps an empty item it turns back as an empty line', () => {
      content.innerHTML = '<ul><li></li></ul>';
      const range = document.createRange();
      range.selectNodeContents(content.querySelector('li')!);
      toggleList(content, range, 'ul');
      expect(content.innerHTML).toBe('<div><br></div>');
    });

    it('goes back to the list when toggled again', () => {
      content.innerHTML = '<ul><li>one</li><li>two</li><li>three</li></ul>';
      toggleList(content, caretIn('two'), 'ul');
      toggleList(content, caretIn('two'), 'ul');
      expect(content.innerHTML).toBe('<ul><li>one</li><li>two</li><li>three</li></ul>');
    });
  });

  describe('appendListItem', () => {
    it('adds a new list at the end', () => {
      content.innerHTML = 'one';
      const caret = appendListItem(content, 'ul');
      expect(content.innerHTML).toBe('one<ul><li></li></ul>');
      expect(caret.startContainer).toBe(content.querySelector('li'));
    });

    it('adds the item to a list of the same type that ends the content', () => {
      content.innerHTML = '<ul><li>one</li></ul>';
      appendListItem(content, 'ul');
      expect(content.innerHTML).toBe('<ul><li>one</li><li></li></ul>');
    });
  });

  describe('indentListItems', () => {
    it('moves the item under the item before it', () => {
      content.innerHTML = '<ul><li>one</li><li>two</li><li>three</li></ul>';
      indentListItems(content, caretIn('two'));
      expect(content.innerHTML).toBe('<ul><li>one<ul><li>two</li></ul></li><li>three</li></ul>');
    });

    it('keeps the caret in the moved item', () => {
      content.innerHTML = '<ul><li>one</li><li>two</li></ul>';
      const next = indentListItems(content, caretIn('two', 1));
      expect((next?.startContainer as Text).data).toBe('two');
      expect(next?.startOffset).toBe(1);
    });

    it('adds to the sub-list the item before already has', () => {
      content.innerHTML = '<ul><li>one<ul><li>two</li></ul></li><li>three</li></ul>';
      indentListItems(content, caretIn('three'));
      expect(content.innerHTML).toBe('<ul><li>one<ul><li>two</li><li>three</li></ul></li></ul>');
    });

    it('moves all selected items, keeping their order', () => {
      content.innerHTML = '<ol><li>one</li><li>two</li><li>three</li></ol>';
      indentListItems(content, select('two', 'three'));
      expect(content.innerHTML).toBe('<ol><li>one<ol><li>two</li><li>three</li></ol></li></ol>');
    });

    it('takes the sub-items along', () => {
      content.innerHTML = '<ul><li>one</li><li>two<ul><li>three</li></ul></li></ul>';
      indentListItems(content, caretIn('two'));
      expect(content.innerHTML).toBe('<ul><li>one<ul><li>two<ul><li>three</li></ul></li></ul></li></ul>');
    });

    it('keeps the checklist type in the sub-list', () => {
      content.innerHTML = '<ul class="wema-checklist"><li><input type="checkbox">one</li><li><input type="checkbox">two</li></ul>';
      indentListItems(content, caretIn('two'));
      expect(content.innerHTML).toBe(
        '<ul class="wema-checklist"><li><input type="checkbox">one<ul class="wema-checklist"><li><input type="checkbox">two</li></ul></li></ul>',
      );
    });

    it('leaves the first item of a list', () => {
      content.innerHTML = '<ul><li>one</li><li>two</li></ul>';
      expect(indentListItems(content, caretIn('one'))).toBeNull();
      expect(content.innerHTML).toBe('<ul><li>one</li><li>two</li></ul>');
    });

    it('does nothing outside a list', () => {
      content.innerHTML = 'one';
      expect(indentListItems(content, caretIn('one'))).toBeNull();
    });
  });

  describe('outdentListItems', () => {
    it('moves the item out to right after the item it was under', () => {
      content.innerHTML = '<ul><li>one<ul><li>two</li></ul></li><li>three</li></ul>';
      outdentListItems(content, caretIn('two'));
      expect(content.innerHTML).toBe('<ul><li>one</li><li>two</li><li>three</li></ul>');
    });

    it('keeps the order of the lines: the items after it become its sub-items', () => {
      content.innerHTML = '<ul><li>one<ul><li>two</li><li>three</li><li>four</li></ul></li></ul>';
      outdentListItems(content, caretIn('three'));
      expect(content.innerHTML).toBe(
        '<ul><li>one<ul><li>two</li></ul></li><li>three<ul><li>four</li></ul></li></ul>',
      );
    });

    it('moves all selected items, keeping their order', () => {
      content.innerHTML = '<ul><li>one<ul><li>two</li><li>three</li></ul></li></ul>';
      outdentListItems(content, select('two', 'three'));
      expect(content.innerHTML).toBe('<ul><li>one</li><li>two</li><li>three</li></ul>');
    });

    it('undoes an indent', () => {
      const html = '<ol><li>one</li><li>two</li><li>three</li></ol>';
      content.innerHTML = html;
      indentListItems(content, select('two', 'three'));
      outdentListItems(content, select('two', 'three'));
      expect(content.innerHTML).toBe(html);
    });

    it('adapts the item to the type of the list it moves into', () => {
      content.innerHTML = '<ul><li>one<ul class="wema-checklist"><li><input type="checkbox">two</li></ul></li></ul>';
      outdentListItems(content, caretIn('two'));
      expect(content.innerHTML).toBe('<ul><li>one</li><li>two</li></ul>');
    });

    it('leaves an item of a top-level list', () => {
      content.innerHTML = '<ul><li>one</li></ul>';
      expect(outdentListItems(content, caretIn('one'))).toBeNull();
      expect(content.innerHTML).toBe('<ul><li>one</li></ul>');
    });
  });
});

describe('list editing in a note', () => {
  let container: HTMLElement;
  let board: WemaBoard;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    board = new WemaBoard({ container });
  });

  afterEach(() => {
    board.destroy();
    container.remove();
  });

  // Helper to flush microtask-based batch commit
  const flush = () => Promise.resolve();

  function contentOf(noteId: string): HTMLElement {
    return container.querySelector(`[data-note-id="${noteId}"] .wema-note-content`) as HTMLElement;
  }

  /** Click a note, which selects it and opens its popup */
  function clickNote(noteId: string): void {
    // jsdom has no layout: the board asks which edge is under the pointer
    document.elementsFromPoint ??= () => [];
    container.querySelector(`[data-note-id="${noteId}"]`)
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  }

  /** Put the caret at the start of the text `text` in a note */
  function placeCaret(noteId: string, text: string): void {
    const walker = document.createTreeWalker(contentOf(noteId), NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (!(node as Text).data.includes(text)) continue;
      const range = document.createRange();
      range.setStart(node, (node as Text).data.indexOf(text));
      range.collapse(true);
      const sel = document.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(range);
      return;
    }
    throw new Error(`no text node holds "${text}"`);
  }

  function pressTab(noteId: string, shiftKey = false): KeyboardEvent {
    const event = new KeyboardEvent('keydown', { key: 'Tab', shiftKey, bubbles: true, cancelable: true });
    contentOf(noteId).dispatchEvent(event);
    return event;
  }

  function popupButton(title: string): HTMLButtonElement {
    const buttons = Array.from(container.querySelectorAll<HTMLButtonElement>('.wema-note-popup button'));
    const button = buttons.find((b) => b.title.startsWith(title));
    if (!button) throw new Error(`no popup button "${title}"`);
    return button;
  }

  it('Tab indents and Shift+Tab outdents the item of the caret', () => {
    const note = board.addNote({ text: '<ul><li>one</li><li>two</li></ul>' });
    placeCaret(note.id, 'two');

    expect(pressTab(note.id).defaultPrevented).toBe(true);
    expect(contentOf(note.id).innerHTML).toBe('<ul><li>one<ul><li>two</li></ul></li></ul>');

    expect(pressTab(note.id, true).defaultPrevented).toBe(true);
    expect(contentOf(note.id).innerHTML).toBe('<ul><li>one</li><li>two</li></ul>');
  });

  it('Tab keeps the focus in a list even when the item cannot move', () => {
    const note = board.addNote({ text: '<ul><li>one</li></ul>' });
    placeCaret(note.id, 'one');
    expect(pressTab(note.id).defaultPrevented).toBe(true);
    expect(contentOf(note.id).innerHTML).toBe('<ul><li>one</li></ul>');
  });

  it('Tab is left alone outside a list', () => {
    const note = board.addNote({ text: 'plain' });
    placeCaret(note.id, 'plain');
    expect(pressTab(note.id).defaultPrevented).toBe(false);
  });

  function pressEnter(noteId: string): void {
    contentOf(noteId).dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
  }

  it('Enter in a checklist item keeps the checkboxes of its sub-items', () => {
    const note = board.addNote({
      text: '<ul class="wema-checklist"><li><input type="checkbox">one'
        + '<ul class="wema-checklist"><li><input type="checkbox">two</li></ul></li></ul>',
    });
    const one = Array.from(contentOf(note.id).querySelector('li')!.childNodes)
      .find((n) => n.nodeType === Node.TEXT_NODE) as Text;
    const range = document.createRange();
    range.setStart(one, one.data.length);
    range.collapse(true);
    document.getSelection()?.removeAllRanges();
    document.getSelection()?.addRange(range);

    pressEnter(note.id);
    expect(contentOf(note.id).innerHTML).toBe(
      '<ul class="wema-checklist"><li><input type="checkbox">one</li>'
      + '<li><input type="checkbox"> <ul class="wema-checklist"><li><input type="checkbox">two</li></ul></li></ul>',
    );
  });

  it('Enter in a plain sub-list of a checklist adds no checkbox', () => {
    const note = board.addNote({
      text: '<ul class="wema-checklist"><li><input type="checkbox">one<ul><li>two</li></ul></li></ul>',
    });
    placeCaret(note.id, 'two');
    const event = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
    contentOf(note.id).dispatchEvent(event);
    // Left to the browser, which adds a plain item
    expect(event.defaultPrevented).toBe(false);
    expect(contentOf(note.id).querySelectorAll('input').length).toBe(1);
  });

  it('an indent by Tab is committed at once, as one update', async () => {
    const note = board.addNote({ text: '<ul><li>one</li><li>two</li></ul>' });
    await flush();
    const updates: string[] = [];
    board.on('note:update', ({ note: n }) => updates.push(n.text));

    placeCaret(note.id, 'two');
    pressTab(note.id);
    expect(updates).toEqual(['<ul><li>one<ul><li>two</li></ul></li></ul>']);
    // A Tab that moves nothing, and the blur that follows, report nothing more
    placeCaret(note.id, 'one');
    pressTab(note.id);
    contentOf(note.id).dispatchEvent(new Event('blur'));
    expect(updates.length).toBe(1);
  });

  it('an indent can be undone', async () => {
    const note = board.addNote({ text: '<ul><li>one</li><li>two</li></ul>' });
    await flush();
    placeCaret(note.id, 'two');
    pressTab(note.id);
    await flush();
    contentOf(note.id).blur();
    board.undo();
    expect(board.getNote(note.id)?.text).toBe('<ul><li>one</li><li>two</li></ul>');
  });

  it('the list button turns the line of the caret into a list', () => {
    const note = board.addNote({ text: 'one\ntwo\nthree' });
    clickNote(note.id);
    placeCaret(note.id, 'two');

    popupButton('Bulleted List').click();
    expect(board.getNote(note.id)?.text).toBe('one\n<ul><li>two</li></ul>three');
  });

  it('the list button adds an item at the end when the caret is not in the note', () => {
    const note = board.addNote({ text: 'one' });
    clickNote(note.id);
    document.getSelection()?.removeAllRanges();

    popupButton('Numbered List').click();
    expect(board.getNote(note.id)?.text).toBe('one<ol><li></li></ol>');
  });

  it('the indent and outdent buttons move the item of the caret', () => {
    const note = board.addNote({ text: '<ul><li>one</li><li>two</li></ul>' });
    clickNote(note.id);
    placeCaret(note.id, 'two');

    popupButton('Indent').click();
    expect(board.getNote(note.id)?.text).toBe('<ul><li>one<ul><li>two</li></ul></li></ul>');

    popupButton('Outdent').click();
    expect(board.getNote(note.id)?.text).toBe('<ul><li>one</li><li>two</li></ul>');
  });

  it('a list button does not take the focus out of the note', () => {
    const note = board.addNote({ text: 'one' });
    clickNote(note.id);
    const event = new MouseEvent('mousedown', { bubbles: true, cancelable: true });
    popupButton('Bulleted List').dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
  });
});
