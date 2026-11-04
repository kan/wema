/**
 * **リリース PR の中身を作る。** tagpr が `postVersionCommand`（`.tagpr`）として、
 * main からリリース PR を作り直すたびに走らせる。**repo のルートで実行する。**
 *
 *     TAGPR_CURRENT_VERSION=vX.Y.Z TAGPR_NEXT_VERSION=vX.Y.Z node scripts/tagpr/release-prepare.mjs
 *
 * `TAGPR_CURRENT_VERSION` は最新のタグ、`TAGPR_NEXT_VERSION` は tagpr が提案する版。
 * どちらも tagpr が渡す。
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
  compareVersions,
  githubRepo,
  isSectionHeading,
  linkBlockStart,
  readRootFile,
  readSection,
  releaseDate,
  scan,
  versionHeadings,
} from './changelog.mjs';

/** 環境変数の `vX.Y.Z` から `X.Y.Z` を取り出す。形が違えば落とす */
function versionFromEnv(name) {
  const value = process.env[name] ?? '';
  const version = value.replace(/^v/, '');
  if (!/^\d+\.\d+\.\d+$/.test(version)) {
    throw new ReleaseError(`${name} must be vX.Y.Z, got "${value}"`);
  }
  return version;
}

try {
  const version = versionFromEnv('TAGPR_NEXT_VERSION');
  const current = versionFromEnv('TAGPR_CURRENT_VERSION');

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
  // **最新のタグより新しい版の節があれば落とす。** tagpr はリリース PR のブランチを毎回
  // main から作り直すので、その節があるのは、main にリリース PR が入ったのにタグが
  // 打たれていないとき（タグを打ち直すために消している間も同じ）。
  //
  // 提案する版の節だけを見ると、間に `enhancement` の PR が入ったときに通ってしまう。
  // tagpr は最新のタグから数えるので、0.17.1 のタグが無いまま minor の 0.18.0 を提案し、
  // 「タグの無い 0.17.1 の上に 0.18.0 を積んだ」リリース PR が緑のまま作られる。
  //
  // タグが 1 つも無いと tagpr は `v0.0.0` を渡す。そのときは比べる相手が無いので見ない
  // （タグを打たずにリリースしてきた repo が tagpr へ移ると、古い節がすべて引っかかる）。
  const untagged =
    current === '0.0.0'
      ? []
      : versionHeadings(text)
          .filter((v) => compareVersions(v, current) > 0)
          .sort(compareVersions);
  if (untagged.length > 0) {
    // 古い順にすべて出す。新しい方だけ直すと、古い方はそのタグより古くなって見えなくなる
    const sections = untagged.map((v) => `"## [${v}]"`).join(', ');
    throw new ReleaseError(
      `CHANGELOG.md already has ${sections}, newer than the latest tag v${current}: ` +
        'a release pull request was merged but not tagged. ' +
        `Re-run the tagpr run of the merge commit for ${untagged[0]} first (or push the tag again) ` +
        'instead of merging a new release pull request',
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
