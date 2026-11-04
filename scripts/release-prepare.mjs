/**
 * **リリース PR の中身を作る。** tagpr が `postVersionCommand`（`.tagpr`）として、
 * main からリリース PR を作り直すたびに走らせる。
 *
 *     TAGPR_NEXT_VERSION=vX.Y.Z node scripts/release-prepare.mjs
 *
 * 1. `package-lock.json` の版を `package.json` に揃える。**tagpr は lock を
 *    書き換えない**（版のファイルとして扱わない一覧に入っている）。揃えないと、
 *    `npm version` で上げていた頃と違い lock だけが前の版を名乗る
 * 2. `CHANGELOG.md` の `## [Unreleased]` を `## [X.Y.Z] - <日本時間の日付>` にし、
 *    その上に空の `## [Unreleased]` を置き直し、リンク定義を足す
 *
 * **自分の出力に対してもう一度走らせても何も変えない**（tagpr は作り直すたびに
 * 走らせる）。**Node の組み込みしか使わない** —— このジョブはリポジトリへ push
 * できるトークンを持つので、依存のコードを走らせない。
 *
 * 失敗しても tagpr はリリース PR を更新する。run が赤ならそのリリース PR は
 * マージしない（CLAUDE.md「リリース手順」）。
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  SectionError,
  changelogPath,
  findSection,
  isFenceToggle,
  isLinkDefinition,
  isSectionHeading,
  readSection,
  root,
} from './release-notes.mjs';

function fail(message) {
  console.error(message);
  process.exit(1);
}

const next = process.env.TAGPR_NEXT_VERSION ?? '';
const version = next.replace(/^v/, '');
if (!/^\d+\.\d+\.\d+$/.test(version)) {
  fail(`TAGPR_NEXT_VERSION must be vX.Y.Z, got "${next}"`);
}

// --- package.json / package-lock.json ---

const readJson = (name) => JSON.parse(readFileSync(join(root, name), 'utf8'));

// tagpr が package.json を書き換えた後に走るので、ずれていたら tagpr の設定の誤り
const pkgVersion = readJson('package.json').version;
if (pkgVersion !== version) {
  fail(`package.json says ${pkgVersion}, but tagpr proposes ${version} (check versionFile in .tagpr)`);
}

const lock = readJson('package-lock.json');
const self = lock.packages?.[''];
if (!self) fail('package-lock.json has no packages[""]');
if (lock.version !== version || self.version !== version) {
  lock.version = version;
  self.version = version;
  // npm と同じ書き方（2 スペース + 末尾の改行）。違うと差分が全行に出る
  writeFileSync(join(root, 'package-lock.json'), `${JSON.stringify(lock, null, 2)}\n`);
  console.log(`package-lock.json: -> ${version}`);
} else {
  console.log(`package-lock.json: already ${version}`);
}

// --- CHANGELOG.md ---

const text = readFileSync(changelogPath, 'utf8');

try {
  if (findSection(text, version) !== null) {
    // 作り直しで 2 回目に走った。版の節は空でないこと、新しい項目が Unreleased に
    // 来ていないこと（どちらの版の話かを決められない）を見る
    readSection(text, version);
    if (findSection(text, 'Unreleased')) {
      fail(`CHANGELOG.md has both "## [${version}]" and entries under "## [Unreleased]"`);
    }
    console.log(`CHANGELOG.md: "## [${version}]" is already stamped`);
    process.exit(0);
  }
  // 無いか空なら、ここで理由を出して落ちる
  readSection(text, 'Unreleased');
} catch (e) {
  if (e instanceof SectionError) fail(e.message);
  throw e;
}

const date = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo' }).format(new Date());
const link = `[${version}]: https://github.com/kan/wema/releases/tag/v${version}`;

const out = [];
let fence = false;
let linked = false;
for (const line of text.split('\n')) {
  if (isFenceToggle(line)) fence = !fence;
  if (!fence && isSectionHeading(line, 'Unreleased')) {
    out.push(line, '', `## [${version}] - ${date}`);
    continue;
  }
  if (!fence && !linked && isLinkDefinition(line)) {
    out.push(link);
    linked = true;
  }
  out.push(line);
}
if (!linked) {
  // 末尾の改行の手前に置く
  while (out.length > 0 && out[out.length - 1] === '') out.pop();
  out.push('', link, '');
}

writeFileSync(changelogPath, out.join('\n'));
console.log(`CHANGELOG.md: "## [Unreleased]" -> "## [${version}]"`);
