import { describe, it, expect } from 'vitest';
import { sanitizeHtml, escapeHtml, isPlainText, resolveSafeUrl } from '../src/utils/sanitize';

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

  it('removes javascript: URLs obfuscated with control characters', () => {
    expect(sanitizeHtml('<a href="java&#9;script:alert(1)">x</a>')).toBe('<a>x</a>');
    expect(sanitizeHtml('<a href="&#1;javascript:alert(1)">x</a>')).toBe('<a>x</a>');
    expect(sanitizeHtml('<iframe src="jav&#10;ascript:alert(1)"></iframe>')).toBe('<iframe></iframe>');
  });

  it('removes URLs with schemes outside the allowlist', () => {
    expect(sanitizeHtml('<a href="vbscript:msgbox(1)">x</a>')).toBe('<a>x</a>');
    expect(sanitizeHtml('<a href="data:text/html,x">x</a>')).toBe('<a>x</a>');
  });

  it('removes data: URLs whose media type does not match the tag', () => {
    expect(sanitizeHtml('<iframe src="data:image/svg+xml,x"></iframe>')).toBe('<iframe></iframe>');
    expect(sanitizeHtml('<img src="data:text/html,x">')).toBe('<img>');
    expect(sanitizeHtml('<video src="data:video/mp4;base64,abc" poster="data:text/html,x"></video>'))
      .toBe('<video src="data:video/mp4;base64,abc"></video>');
  });

  it('preserves mailto:, tel: and relative URLs', () => {
    expect(sanitizeHtml('<a href="mailto:a@example.com">m</a>')).toContain('href="mailto:a@example.com"');
    expect(sanitizeHtml('<a href="tel:+81312345678">t</a>')).toContain('href="tel:+81312345678"');
    expect(sanitizeHtml('<a href="/docs/a.html#top">r</a>')).toContain('href="/docs/a.html#top"');
    expect(sanitizeHtml('<a href="my file: v2.html">r</a>')).toContain('href="my file: v2.html"');
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

describe('resolveSafeUrl', () => {
  it('returns the absolute URL for allowed schemes', () => {
    expect(resolveSafeUrl('https://example.com/a?b=1#c')).toBe('https://example.com/a?b=1#c');
    expect(resolveSafeUrl('mailto:a@example.com')).toBe('mailto:a@example.com');
  });

  it('resolves relative links against the page', () => {
    expect(resolveSafeUrl('/p/home')).toBe(`${location.origin}/p/home`);
    expect(resolveSafeUrl('p/home')).toBe(new URL('p/home', document.baseURI).href);
  });

  it('resolves links that only look like paths to their real host', () => {
    for (const href of ['//other.example/x', '/\\other.example/x', '\\\\other.example/x']) {
      expect(new URL(resolveSafeUrl(href)!).host).toBe('other.example');
    }
  });

  it('returns null for schemes outside the allowlist', () => {
    // eslint-disable-next-line no-script-url
    for (const href of ['javascript:alert(1)', 'java\tscript:alert(1)', ' javascript:alert(1)', 'vbscript:x', 'data:text/html,x', 'file:///etc/passwd', 'blob:https://example.com/id']) {
      expect(resolveSafeUrl(href)).toBeNull();
    }
  });

  it('returns null for a URL that cannot be parsed', () => {
    expect(resolveSafeUrl('https://exa mple.com:99999999/')).toBeNull();
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

  it('stays fast on many unclosed tag openers', () => {
    const start = performance.now();
    expect(isPlainText('<a'.repeat(40000))).toBe(true);
    expect(performance.now() - start).toBeLessThan(200);
  });
});
