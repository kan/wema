// `node --test 'test/*.node-test.mjs'` で走る。**名前を `*.test.mjs` にしない** ——
// subtree で取り込んだ先の vitest が既定の include（`**/*.{test,spec}.?(c|m)[jt]s?(x)`）で
// 拾い、node:test のファイルなので "No test suite found" で落ちる。
//
// `changelog.mjs` の関数は直接、2 つのスクリプトは一時
// ディレクトリに repo のルートを作り、そこを作業ディレクトリにして子プロセスで実行する
// （tagpr と publish のワークフローと同じ呼ばれ方）。
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, test } from 'node:test';
import { findSection, githubRepo, releaseDate } from '../changelog.mjs';

const prepare = join(import.meta.dirname, '..', 'release-prepare.mjs');
const notes = join(import.meta.dirname, '..', 'release-notes.mjs');

const HEADER = '# Changelog\n\nIntro.\n\n';
const MINIMAL = `${HEADER}## [Unreleased]\n\n- A.\n`;
const LINK = '[1.2.4]: https://github.com/o/r/releases/tag/v1.2.4';

const dirs = [];
after(() => {
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
});

function makeRepo({
  version = '1.2.4',
  repository = { type: 'git', url: 'git+https://github.com/o/r.git' },
  changelog = MINIMAL,
  lock = true,
} = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'tagpr-scripts-'));
  dirs.push(dir);
  writeFileSync(join(dir, 'package.json'), `${JSON.stringify({ name: 'x', version, repository }, null, 2)}\n`);
  if (lock) {
    const content = { name: 'x', version: '1.2.3', lockfileVersion: 3, packages: { '': { name: 'x', version: '1.2.3' } } };
    writeFileSync(join(dir, 'package-lock.json'), `${JSON.stringify(content, null, 2)}\n`);
  }
  writeFileSync(join(dir, 'CHANGELOG.md'), changelog);
  return dir;
}

const run = (script, cwd, args = [], next = 'v1.2.4') =>
  spawnSync(process.execPath, [script, ...args], {
    cwd,
    env: { ...process.env, TAGPR_NEXT_VERSION: next },
    encoding: 'utf8',
  });

const read = (dir, name) => readFileSync(join(dir, name), 'utf8');
const lockVersions = (dir) => {
  const lock = JSON.parse(read(dir, 'package-lock.json'));
  return [lock.version, lock.packages[''].version];
};

/**
 * prepare を走らせ、見出しの日付を `<date>` にした CHANGELOG を返す。日付は実行の前後
 * どちらかの日であること（日付をまたいでも落ちない）
 */
function prepareAndRead(dir) {
  const before = releaseDate();
  const r = run(prepare, dir);
  const after = releaseDate();
  assert.equal(r.status, 0, r.stderr);
  const text = read(dir, 'CHANGELOG.md');
  const date = /^## \[1\.2\.4\] - (\S+)$/m.exec(text)?.[1];
  assert.ok(date === before || date === after, `unexpected date ${date}`);
  return text.replace(` - ${date}\n`, ' - <date>\n');
}

// --- release-prepare.mjs ---

test('prepare: stamps Unreleased, adds the link above the others, and syncs the lock', () => {
  const dir = makeRepo({
    changelog: `${HEADER}## [Unreleased]\n\n### Fixed\n\n- A.\n\n## [1.2.3] - 2026-01-01\n\n- Old.\n\n[1.2.3]: https://github.com/o/r/releases/tag/v1.2.3\n`,
  });
  assert.equal(
    prepareAndRead(dir),
    `${HEADER}## [Unreleased]\n\n## [1.2.4] - <date>\n\n### Fixed\n\n- A.\n\n## [1.2.3] - 2026-01-01\n\n- Old.\n\n` +
      `${LINK}\n[1.2.3]: https://github.com/o/r/releases/tag/v1.2.3\n`,
  );
  assert.deepEqual(lockVersions(dir), ['1.2.4', '1.2.4']);
});

test('prepare: puts the link at the end when there are no link definitions', () => {
  assert.equal(prepareAndRead(makeRepo()), `${HEADER}## [Unreleased]\n\n## [1.2.4] - <date>\n\n- A.\n\n${LINK}\n`);
});

test('prepare: a link-shaped line inside an entry is not where the links go', () => {
  const dir = makeRepo({ changelog: `${HEADER}## [Unreleased]\n\n[BREAKING]: dropped Node 18\n\n- A.\n` });
  assert.equal(
    prepareAndRead(dir),
    `${HEADER}## [Unreleased]\n\n## [1.2.4] - <date>\n\n[BREAKING]: dropped Node 18\n\n- A.\n\n${LINK}\n`,
  );
});

test('prepare: leaves headings and link definitions inside code fences alone', () => {
  const fence = '````md\n```\n## [Unreleased]\n[x]: https://example.com\n````\n';
  const dir = makeRepo({ changelog: `${HEADER}## [Unreleased]\n\n- A.\n\n${fence}` });
  assert.equal(prepareAndRead(dir), `${HEADER}## [Unreleased]\n\n## [1.2.4] - <date>\n\n- A.\n\n${fence}\n${LINK}\n`);
});

// package-lock.json と CHANGELOG.md は、どの失敗でも書き換えない
for (const { name, opts, message, next } of [
  { name: 'an empty Unreleased', opts: { changelog: `${HEADER}## [Unreleased]\n\n## [1.2.3]\n\n- Old.\n` }, message: /is empty/ },
  { name: 'no Unreleased', opts: { changelog: `${HEADER}## [1.2.3]\n\n- Old.\n` }, message: /no "## \[Unreleased\]"/ },
  { name: 'two Unreleased sections', opts: { changelog: `${MINIMAL}\n## [Unreleased]\n\n- B.\n` }, message: /2 "## \[Unreleased\]" sections/ },
  {
    name: 'a section for the version that is already there',
    opts: { changelog: `${HEADER}## [Unreleased]\n\n## [1.2.4] - 2026-01-02\n\n- A.\n` },
    message: /merged but not tagged/,
  },
  { name: 'CRLF line endings', opts: { changelog: MINIMAL.replaceAll('\n', '\r\n') }, message: /CR line endings/ },
  { name: 'package.json at another version', opts: { version: '1.2.5' }, message: /package\.json says 1\.2\.5/ },
  { name: 'a non-GitHub repository', opts: { repository: 'https://gitlab.com/o/r' }, message: /must point at a GitHub repository/ },
  { name: 'no repository', opts: { repository: null }, message: /must point at a GitHub repository/ },
  { name: 'a TAGPR_NEXT_VERSION that is not vX.Y.Z', opts: {}, message: /must be vX\.Y\.Z/, next: 'v1.2' },
]) {
  test(`prepare: fails on ${name} and writes nothing`, () => {
    const dir = makeRepo(opts);
    const changelog = read(dir, 'CHANGELOG.md');
    const r = run(prepare, dir, [], next);
    assert.equal(r.status, 1);
    assert.match(r.stderr, message);
    assert.equal(read(dir, 'CHANGELOG.md'), changelog);
    assert.deepEqual(lockVersions(dir), ['1.2.3', '1.2.3']);
  });
}

test('prepare: says where to run it when a file is missing', () => {
  const r = run(prepare, makeRepo({ lock: false }));
  assert.equal(r.status, 1);
  assert.match(r.stderr, /package-lock\.json not found .*run this from the repository root/);
  const sub = join(makeRepo(), 'sub');
  mkdirSync(sub);
  assert.match(run(notes, sub, ['1.2.4']).stderr, /CHANGELOG\.md not found/);
});

// --- release-notes.mjs ---

test('notes: prints the section for a tag, without the link definitions', () => {
  const dir = makeRepo({
    changelog: `${HEADER}## [Unreleased]\n\n## [1.2.4] - 2026-01-02\n\n### Fixed\n\n- A.\n\n## [1.2.3]\n\n- Old.\n\n[1.2.4]: https://example.com\n\n`,
  });
  const r = run(notes, dir, ['v1.2.4']);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout, '### Fixed\n\n- A.\n');
  // 最後の節に末尾のリンク定義が混ざらない
  assert.equal(run(notes, dir, ['1.2.3']).stdout, '- Old.\n');
});

test('notes: fails on a missing or empty section', () => {
  const dir = makeRepo({ changelog: `${HEADER}## [Unreleased]\n\n## [1.2.3]\n\n- Old.\n` });
  assert.match(run(notes, dir, ['v9.9.9']).stderr, /no "## \[9\.9\.9\]"/);
  assert.match(run(notes, dir, ['Unreleased']).stderr, /is empty/);
});

// --- changelog.mjs ---

test('findSection: a link-shaped line inside an entry does not end the section', () => {
  const text = `${HEADER}## [1.2.4]\n\n[BREAKING]: dropped Node 18\n\n- A.\n\n## [1.2.3]\n\n- Old.\n\n[1.2.3]: https://x\n`;
  assert.equal(findSection(text, '1.2.4'), '[BREAKING]: dropped Node 18\n\n- A.');
  assert.equal(findSection(text, '1.2.3'), '- Old.');
});

test('findSection: a fence closes only on the same marker, at least as long', () => {
  for (const fence of ['````\n```\n## [1.2.3]\n````', '~~~\n```\n## [1.2.3]\n~~~']) {
    const text = `## [1.2.4]\n\n${fence}\n\n## [1.2.3]\n\n- Old.\n`;
    assert.equal(findSection(text, '1.2.4'), fence);
    assert.equal(findSection(text, '1.2.3'), '- Old.');
  }
});

test('githubRepo: takes the forms npm accepts for GitHub', () => {
  for (const spec of [
    'o/r',
    'github:o/r',
    'git@github.com:o/r.git',
    'https://github.com/o/r',
    'http://www.github.com/o/r/',
    'git+https://github.com/o/r.git',
    'git+ssh://git@github.com/o/r.git',
    'ssh://git@github.com/o/r.git',
    'git://github.com/o/r.git',
    { type: 'git', url: 'https://github.com/o/r.git' },
  ]) {
    assert.equal(githubRepo(spec), 'o/r', JSON.stringify(spec));
  }
});

test('githubRepo: rejects anything that is not GitHub', () => {
  for (const spec of ['bitbucket.org/foo', 'gitlab:o/r', 'https://gitlab.com/o/r', 'https://github.com/o', '', null, undefined, {}]) {
    assert.equal(githubRepo(spec), null, JSON.stringify(spec));
  }
});

test('releaseDate: is the date in JST', () => {
  assert.equal(releaseDate(new Date('2026-01-01T14:59:59Z')), '2026-01-01');
  assert.equal(releaseDate(new Date('2026-01-01T15:00:00Z')), '2026-01-02');
});
