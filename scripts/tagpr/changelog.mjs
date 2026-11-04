/**
 * **`CHANGELOG.md` の読み方と、2 つのスクリプトが共有する決め方。** ここは何も実行しない
 * （`release-notes.mjs` と `release-prepare.mjs` が import する）。
 *
 * **読み方はここにしか書かない。** 2 か所に書くと、リリース PR は通るのに publish の
 * 検査で落ちる。
 *
 * - 節の見出しは `## [名前]` か `## [名前] ...`。コードフェンスの中の見出しは数えない
 * - **節はファイル末尾のリンク定義のまとまり（`[x]: url` と空行だけが続く部分）の手前で
 *   終わる。** 項目の中にある `[x]: ...` の形の行では終わらない
 * - 改行は LF だけ
 */
import { readFileSync } from 'node:fs';

/** 作業ディレクトリ（repo のルート）からの相対パス */
export const changelogPath = 'CHANGELOG.md';

/** 入力が要求を満たさない。呼んだ側はメッセージを出して exit 1 する */
export class ReleaseError extends Error {}

/** repo のルートにあるはずのファイルを読む。無ければ、どこで実行すべきかを言って落ちる */
export function readRootFile(name) {
  try {
    return readFileSync(name, 'utf8');
  } catch (e) {
    if (e?.code === 'ENOENT') {
      throw new ReleaseError(`${name} not found in ${process.cwd()}; run this from the repository root`);
    }
    throw e;
  }
}

const isLinkDefinition = (line) => /^\[[^\]]+\]: /.test(line);
export const isSectionHeading = (line, name) =>
  line === `## [${name}]` || line.startsWith(`## [${name}] `);

// CommonMark のフェンス: 字下げ 3 文字まで、同じ記号 3 つ以上。閉じるのは開いたときと
// 同じ記号で、同じ長さ以上で、後ろに何も無い行
const FENCE = /^ {0,3}(`{3,}|~{3,})(.*)$/;

/**
 * 各行を `[行, コードフェンスの中か]` にする。フェンスを開く行は中、閉じる行は外に数える。
 * **フェンスの追い方はここだけに書く。**
 * @param {string} text
 * @returns {[string, boolean][]}
 */
export function scan(text) {
  if (text.includes('\r')) {
    throw new ReleaseError('CHANGELOG.md has CR line endings; save it with LF');
  }
  /** @type {string | null} 開いているフェンスの記号の並び */
  let open = null;
  /** @type {[string, boolean][]} */
  const rows = [];
  for (const line of text.split('\n')) {
    const m = FENCE.exec(line);
    if (open === null) {
      // バッククォートのフェンスの info string にはバッククォートを書けない
      if (m && !(m[1][0] === '`' && m[2].includes('`'))) open = m[1];
      rows.push([line, open !== null]);
    } else if (m && m[1][0] === open[0] && m[1].length >= open.length && m[2].trim() === '') {
      open = null;
      rows.push([line, false]);
    } else {
      rows.push([line, true]);
    }
  }
  return rows;
}

/**
 * ファイル末尾のリンク定義のまとまりの、最初の定義の行番号。無ければ `rows.length`。
 * @param {[string, boolean][]} rows `scan` の結果
 */
export function linkBlockStart(rows) {
  let start = rows.length;
  for (let i = rows.length - 1; i >= 0; i--) {
    const [line, fenced] = rows[i];
    if (line.trim() === '') continue;
    if (fenced || !isLinkDefinition(line)) break;
    start = i;
  }
  return start;
}

/**
 * `## [name]` の節の本文を、前後の空行を落として返す。節が無ければ `null`、
 * 空なら `''`。**重複だけは投げる**（どちらが正か決められないため）。
 * @param {string} text CHANGELOG.md の中身
 * @param {string} name 版（`0.6.0`）か `Unreleased`
 * @returns {string | null}
 */
export function findSection(text, name) {
  const rows = scan(text);
  const end = linkBlockStart(rows);
  let inside = false;
  let found = 0;
  /** @type {string[]} */
  const body = [];
  for (const [line, fenced] of rows.slice(0, end)) {
    if (!fenced && line.startsWith('## ')) {
      inside = isSectionHeading(line, name);
      if (inside) {
        found++;
        continue;
      }
    }
    if (inside) body.push(line);
  }
  if (found === 0) return null;
  if (found > 1) {
    throw new ReleaseError(`CHANGELOG.md has ${found} "## [${name}]" sections; expected 1`);
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
    throw new ReleaseError(`CHANGELOG.md has no "## [${name}]" section`);
  }
  if (body === '') {
    throw new ReleaseError(`The "## [${name}]" section of CHANGELOG.md is empty`);
  }
  return body;
}

/**
 * 見出しに書く日付。日本時間の `YYYY-MM-DD`。JST に夏時間は無いので +9 時間で足りる
 * （`Intl` の既定の書式は ICU の版で変わりうるので使わない）
 */
export const releaseDate = (now = new Date()) =>
  new Date(now.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);

const NAME = String.raw`([A-Za-z0-9-]+\/[\w.-]+?)(?:\.git)?\/?`;

/**
 * `package.json` の `repository` から GitHub の `owner/repo` を取り出す。GitHub でなければ `null`。
 * 受けるのは npm の短縮形（`o/r` / `github:o/r`）、scp 形式（`git@github.com:o/r.git`）、
 * host が github.com の URL（`git+https:` / `git+ssh:` / `ssh:` / `git:` / `http(s):`）
 * @param {unknown} repository
 * @returns {string | null}
 */
export function githubRepo(repository) {
  const spec = typeof repository === 'string' ? repository : repository?.url;
  if (typeof spec !== 'string') return null;
  // owner にドットは入らないので、`bitbucket.org/x` は短縮形にならない
  const short = new RegExp(`^(?:github:)?${NAME}$`).exec(spec) ?? new RegExp(`^git@github\\.com:${NAME}$`).exec(spec);
  if (short) return short[1];
  let url;
  try {
    url = new URL(spec.replace(/^git\+/, ''));
  } catch {
    return null;
  }
  if (!/^(www\.)?github\.com$/.test(url.hostname)) return null;
  return new RegExp(`^/${NAME}$`).exec(url.pathname)?.[1] ?? null;
}
