import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';

const root = resolve(dirname(new URL(import.meta.url).pathname), '..');
const distDir = resolve(root, 'dist');

// Read built assets
const css = readFileSync(resolve(distDir, 'wema.css'), 'utf-8');
const js = readFileSync(resolve(distDir, 'wema.umd.js'), 'utf-8');

// Read template
const template = readFileSync(resolve(root, 'standalone/template.html'), 'utf-8');

// Inject CSS and JS
let html = template.replace(
  '<!-- __WEMA_CSS__ -->',
  `<style>\n${css}\n</style>`,
);
html = html.replace(
  '<!-- __WEMA_JS__ -->',
  `<script>\n${js}\n</script>`,
);

// Ensure dist directory exists
mkdirSync(distDir, { recursive: true });

// Write output
writeFileSync(resolve(distDir, 'wema.html'), html, 'utf-8');

console.log('Built dist/wema.html');
