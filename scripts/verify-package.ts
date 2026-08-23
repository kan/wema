/**
 * package.json が公開エントリとして宣言しているファイルが、実際に `npm pack` の
 * 成果物へ含まれているかを検証する。
 *
 * vite-plugin-dts のオプション名変更により `dist/wema.d.ts` が生成されないまま
 * v0.3.2 を公開してしまった事故 (#42) の再発防止。
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, rmSync } from 'node:fs';

/** package.json のフィールドを再帰的に辿り、文字列のパスをすべて集める */
function collectPaths(value: unknown, found: Set<string>): void {
  if (typeof value === 'string') {
    found.add(value);
  } else if (value !== null && typeof value === 'object') {
    for (const child of Object.values(value)) collectPaths(child, found);
  }
}

const pkg = JSON.parse(readFileSync('package.json', 'utf8'));

const expected = new Set<string>();
for (const field of [pkg.types, pkg.main, pkg.module, pkg.exports]) {
  collectPaths(field, expected);
}

const tarball = execFileSync('npm', ['pack', '--silent'], { encoding: 'utf8' }).trim();

try {
  const packed = new Set(execFileSync('tar', ['tzf', tarball], { encoding: 'utf8' }).split('\n'));
  const missing = [...expected].filter((path) => !packed.has(`package/${path.replace(/^\.\//, '')}`));

  if (missing.length > 0) {
    console.error(`公開物に次のエントリが含まれていません:\n${missing.map((p) => `  - ${p}`).join('\n')}`);
    process.exit(1);
  }

  console.log(`公開物のエントリ ${expected.size} 件をすべて確認しました (${tarball})`);
} finally {
  rmSync(tarball, { force: true });
}
