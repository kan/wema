import { describe, it, expect } from 'vitest';
import { sanitizeHtml, escapeHtml, isPlainText } from '../src/utils/sanitize';

describe('sanitizeHtml', () => {
  it('preserves allowed tags', () => {
    const input = '<b>bold</b> <i>italic</i> <u>underline</u>';
    expect(sanitizeHtml(input)).toBe('<b>bold</b> <i>italic</i> <u>underline</u>');
  });

  it('preserves br tags', () => {
    expect(sanitizeHtml('line1<br>line2')).toBe('line1<br>line2');
  });

  it('preserves span with allowed style', () => {
    const input = '<span style="color: red;">text</span>';
    const result = sanitizeHtml(input);
    expect(result).toContain('color');
    expect(result).toContain('red');
  });

  it('preserves links with href and target', () => {
    const input = '<a href="https://example.com" target="_blank">link</a>';
    const result = sanitizeHtml(input);
    expect(result).toContain('href="https://example.com"');
    expect(result).toContain('target="_blank"');
  });

  it('preserves lists', () => {
    const input = '<ul><li>item1</li><li>item2</li></ul>';
    expect(sanitizeHtml(input)).toBe('<ul><li>item1</li><li>item2</li></ul>');
  });

  it('preserves checkbox inputs', () => {
    const input = '<input type="checkbox" checked>';
    const result = sanitizeHtml(input);
    expect(result).toContain('type="checkbox"');
  });

  it('preserves images with allowed attributes', () => {
    const input = '<img src="data:image/png;base64,abc" alt="test" width="100">';
    const result = sanitizeHtml(input);
    expect(result).toContain('src="data:image/png;base64,abc"');
    expect(result).toContain('alt="test"');
  });

  it('preserves iframes with allowed attributes', () => {
    const input = '<iframe src="https://example.com" width="560" height="315" allowfullscreen></iframe>';
    const result = sanitizeHtml(input);
    expect(result).toContain('src="https://example.com"');
    expect(result).toContain('width="560"');
    expect(result).toContain('height="315"');
  });

  it('removes script tags', () => {
    const input = '<script>alert("xss")</script>safe text';
    expect(sanitizeHtml(input)).toBe('safe text');
  });

  it('removes on* event handlers', () => {
    const input = '<b onclick="alert(1)" onmouseover="hack()">bold</b>';
    const result = sanitizeHtml(input);
    expect(result).not.toContain('onclick');
    expect(result).not.toContain('onmouseover');
    expect(result).toContain('<b>bold</b>');
  });

  it('removes javascript: URLs from href', () => {
    // eslint-disable-next-line no-script-url
    const input = '<a href="javascript:alert(1)">click</a>';
    const result = sanitizeHtml(input);
    expect(result).not.toContain('javascript:');
  });

  it('removes javascript: URLs from src', () => {
    // eslint-disable-next-line no-script-url
    const input = '<img src="javascript:alert(1)">';
    const result = sanitizeHtml(input);
    expect(result).not.toContain('javascript:');
  });

  it('removes disallowed CSS properties from style', () => {
    const input = '<span style="color: red; position: fixed; top: 0;">text</span>';
    const result = sanitizeHtml(input);
    expect(result).toContain('color');
    expect(result).not.toContain('position');
    expect(result).not.toContain('top');
  });

  it('removes non-checkbox input types', () => {
    const input = '<input type="text" value="hack">';
    const result = sanitizeHtml(input);
    expect(result).not.toContain('input');
  });

  it('unwraps disallowed tags but keeps their text content', () => {
    const input = '<div><font color="red">styled text</font></div>';
    const result = sanitizeHtml(input);
    expect(result).toContain('styled text');
    expect(result).not.toContain('<font');
  });

  it('handles plain text without modification', () => {
    const input = 'Hello world';
    expect(sanitizeHtml(input)).toBe('Hello world');
  });

  it('handles nested allowed tags', () => {
    const input = '<ul><li><b>bold item</b></li></ul>';
    expect(sanitizeHtml(input)).toBe('<ul><li><b>bold item</b></li></ul>');
  });
});

describe('escapeHtml', () => {
  it('escapes ampersands', () => {
    expect(escapeHtml('A & B')).toBe('A &amp; B');
  });

  it('escapes angle brackets', () => {
    expect(escapeHtml('<script>')).toBe('&lt;script&gt;');
  });

  it('handles empty string', () => {
    expect(escapeHtml('')).toBe('');
  });

  it('leaves safe text unchanged', () => {
    expect(escapeHtml('Hello world')).toBe('Hello world');
  });
});

describe('isPlainText', () => {
  it('returns true for plain text', () => {
    expect(isPlainText('Hello world')).toBe(true);
  });

  it('returns true for text with angle brackets that are not tags', () => {
    expect(isPlainText('5 < 10 and 10 > 5')).toBe(true);
  });

  it('returns true for empty string', () => {
    expect(isPlainText('')).toBe(true);
  });

  it('returns false for HTML with tags', () => {
    expect(isPlainText('<b>bold</b>')).toBe(false);
  });

  it('returns false for self-closing tags', () => {
    expect(isPlainText('line1<br>line2')).toBe(false);
  });

  it('returns false for img tags', () => {
    expect(isPlainText('<img src="x">')).toBe(false);
  });
});
