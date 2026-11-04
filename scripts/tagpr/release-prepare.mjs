/**
 * **リリース PR の中身を作る。** tagpr が `postVersionCommand`（`.tagpr`）として、
 * main からリリース PR を作り直すたびに走らせる。**repo のルートで実行する。**
 *
 *     TAGPR_NEXT_VERSION=vX.Y.Z node scripts/tagpr/release-prepare.mjs
 *
 * 1. `package-lock.json` の版を `package.json` に揃える。**tagpr は lock を
 *    書き換えない**（版のファイルとして扱わない一覧に入っている）
 * 2. `CHANGELOG.md` の `## [Unreleased]` を `## [X.Y.Z] - <日本時間の日付>` にし、
 *    その上に空の `## [Unreleased]` を置き直し、末尾のリンク定義の先頭にその版の
 *    リンクを足す。リンク先の repo は `package.json` の `repository` から決める
 *
 * **検査をすべて済ませてから書く。** 落ちるときは何も書き換えない（tagpr は失敗しても
 * リリース PR を更新するので、版だけ上がった PR を残さない）。それでも run が赤なら、
 * そのリリース PR はマージしない。
 *
 * **Node の組み込みしか使わない** —— このジョブはリポジトリへ push できるトークンを
 * 持つので、依存のコードを走らせない。
 */
import { writeFileSync } from 'node:fs';
import {
  ReleaseError,
  changelogPath,
  findSection,
  githubRepo,
  isSectionHeading,
  linkBlockStart,
  readRootFile,
  readSection,
  releaseDate,
  scan,
} from './changelog.mjs';

try {
  const next = process.env.TAGPR_NEXT_VERSION ?? '';
  const version = next.replace(/^v/, '');
  if (!/^\d+\.\d+\.\d+$/.test(version)) {
    throw new ReleaseError(`TAGPR_NEXT_VERSION must be vX.Y.Z, got "${next}"`);
  }

  // --- 検査（ここでは何も書かない） ---

  const pkg = JSON.parse(readRootFile('package.json'));
  // tagpr が package.json を書き換えた後に走るので、ずれていたら tagpr の設定の誤り
  if (pkg.version !== version) {
    throw new ReleaseError(`package.json says ${pkg.version}, but tagpr proposes ${version} (check versionFile in .tagpr)`);
  }
  const repo = githubRepo(pkg.repository);
  if (!repo) {
    throw new ReleaseError(`package.json "repository" must point at a GitHub repository, got ${JSON.stringify(pkg.repository)}`);
  }

  const lock = JSON.parse(readRootFile('package-lock.json'));
  const self = lock.packages?.[''];
  if (!self) throw new ReleaseError('package-lock.json has no packages[""] (lockfileVersion 2 or later is required)');

  const text = readRootFile(changelogPath);
  // tagpr はリリース PR のブランチを毎回 main から作り直すので、版の節が既にあるのは
  // main にリリース PR が入ったのにタグが打たれていないとき。ここで新しい PR を
  // 作ると、CHANGELOG に無い変更を含む後のコミットにその版のタグが打たれる
  if (findSection(text, version) !== null) {
    throw new ReleaseError(
      `CHANGELOG.md already has "## [${version}]": the release pull request was merged but not tagged. ` +
        'Re-run the tagpr run of that merge commit instead of merging a new release pull request',
    );
  }
  // 無いか空なら、ここで理由を出して落ちる
  readSection(text, 'Unreleased');

  // --- 書き換え ---

  const rows = scan(text);
  const linkAt = linkBlockStart(rows);
  const link = `[${version}]: https://github.com/${repo}/releases/tag/v${version}`;
  const out = [];
  rows.forEach(([line, fenced], i) => {
    if (i === linkAt) out.push(link);
    out.push(line);
    if (!fenced && isSectionHeading(line, 'Unreleased')) out.push('', `## [${version}] - ${releaseDate()}`);
  });
  if (linkAt === rows.length) {
    // 末尾の改行の手前に置く
    while (out.length > 0 && out[out.length - 1] === '') out.pop();
    out.push('', link, '');
  }

  if (lock.version !== version || self.version !== version) {
    lock.version = version;
    self.version = version;
    // npm と同じ書き方（2 スペース + 末尾の改行）。違うと差分が全行に出る
    writeFileSync('package-lock.json', `${JSON.stringify(lock, null, 2)}\n`);
    console.log(`package-lock.json: -> ${version}`);
  }
  writeFileSync(changelogPath, out.join('\n'));
  console.log(`CHANGELOG.md: "## [Unreleased]" -> "## [${version}]"`);
} catch (e) {
  if (!(e instanceof ReleaseError)) throw e;
  console.error(e.message);
  process.exit(1);
}
