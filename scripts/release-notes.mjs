/**
 * **`CHANGELOG.md` の 1 つの節の本文を出す**（見出しは含めない）。
 *
 *     node scripts/release-notes.mjs 0.6.0        # "## [0.6.0] - <日付>" の節
 *     node scripts/release-notes.mjs v0.6.0       # タグ。その版の節
 *     node scripts/release-notes.mjs Unreleased
 *
 * `release.yml` がタグを渡し、出力を GitHub Release の本文にする。
 *
 * **CHANGELOG の読み方はここにしか書かない。** `release-prepare.mjs` も節の検査と
 * 見出しの判定をここから import する。2 か所に書くと、リリース PR は通るのに
 * `release.yml` の検査で落ちる（lily / roji と同じ形）。
 *
 * - 見出しは `## [名前]` か `## [名前] ...`。コードフェンスの中の見出しは数えない
 * - **リンク定義の行（`[x]: url`）で節が終わる。** 末尾のリンク定義を最後の節に
 *   含めないため。項目の中のリンクは参照形式ではなくインラインで書くこと
 *
 * 節が無いか、重複しているか、空なら落ちる。
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const root = dirname(dirname(fileURLToPath(import.meta.url)));
export const changelogPath = join(root, 'CHANGELOG.md');

/** CHANGELOG の形が要求を満たさない。呼んだ側はメッセージを出して落ちる */
export class SectionError extends Error {}

// 以下の 3 つは release-prepare も使う（書き換える位置を同じ読み方で探すため）
export const isFenceToggle = (line) => /^\s*(```|~~~)/.test(line);
export const isLinkDefinition = (line) => /^\[[^\]]+\]: /.test(line);
export const isSectionHeading = (line, name) =>
  line === `## [${name}]` || line.startsWith(`## [${name}] `);

/**
 * `## [name]` の節の本文を、前後の空行を落として返す。節が無ければ `null`、
 * 空なら `''`。**重複だけは投げる**（どちらが正か決められないため）。
 * @param {string} text CHANGELOG.md の中身
 * @param {string} name 版（`0.6.0`）か `Unreleased`
 * @returns {string | null}
 */
export function findSection(text, name) {
  const lines = text.split('\n');
  let fence = false;
  let inside = false;
  let found = 0;
  /** @type {string[]} */
  const body = [];
  for (const line of lines) {
    if (isFenceToggle(line)) fence = !fence;
    if (!fence && line.startsWith('## ')) {
      inside = isSectionHeading(line, name);
      if (inside) {
        found++;
        continue;
      }
    }
    if (!fence && isLinkDefinition(line)) inside = false;
    if (inside) body.push(line);
  }
  if (found === 0) return null;
  if (found > 1) {
    throw new SectionError(`CHANGELOG.md has ${found} "## [${name}]" sections; expected 1`);
  }
  const blank = (line) => line.trim() === '';
  while (body.length > 0 && blank(body[0])) body.shift();
  while (body.length > 0 && blank(body[body.length - 1])) body.pop();
  return body.join('\n');
}

/** `findSection` の、無いことも空であることも許さない版。リリースノートに使う */
export function readSection(text, name) {
  const body = findSection(text, name);
  if (body === null) {
    throw new SectionError(`CHANGELOG.md has no "## [${name}]" section`);
  }
  if (body === '') {
    throw new SectionError(`The "## [${name}]" section of CHANGELOG.md is empty`);
  }
  return body;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const arg = process.argv[2];
  if (!arg) {
    console.error('usage: node scripts/release-notes.mjs <version|tag|Unreleased>');
    process.exit(1);
  }
  // タグ（`v0.6.0`）は節の名前（`0.6.0`）にする
  const name = /^v\d/.test(arg) ? arg.slice(1) : arg;
  try {
    console.log(readSection(readFileSync(changelogPath, 'utf8'), name));
  } catch (e) {
    if (!(e instanceof SectionError)) throw e;
    console.error(e.message);
    process.exit(1);
  }
}
