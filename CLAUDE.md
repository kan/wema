# CLAUDE.md — wema 開発ガイド

## プロジェクト概要

wemaは、Web上に付箋を絵馬のように貼って並べるフレームワーク非依存のTypeScriptライブラリ。
付箋の作成・編集・自由配置・接続線描画を提供する。

2つの配布形態がある:
1. **npmパッケージ** (`@kanf/wema`) — ライブラリとして組み込む
2. **スタンドアロンHTML** (`wema.html`) — 1ファイルで完結するツール。ブラウザで開くだけで使える

## 開発ルール

- **修正完了時は必ず `npm run build` を実行する** — ユーザーに動作確認を促す前に、lint・テスト・ビルドをすべて通すこと
  ```bash
  npm run lint && npm test && npm run build
  ```
- **外部依存ゼロ** を維持する (devDependencies は OK)
- TypeScript は strict mode で書く
- 全ての public API に JSDoc コメントをつける
- テストは Vitest で、少なくともデータモデル操作 (CRUD) とイベント発火をカバーする
- 全セレクタは `.wema-` プレフィックス付き (衝突回避)
- **画面に出す文言（`title`、見出し、ボタンの文字）をソースへ直接書かない。** `src/labels.ts` の `WemaLabels` にキーを足し、`enLabels` と `jaLabels` の両方へ文言を入れて、`labels` 経由で読む（利用側が `labels` オプションで差し替える。issue #58）
  - アイコンだけのボタンの説明は `setLabel()`（`src/utils/dom.ts`）で入れる。`title` と `aria-label` の両方に同じ文言が入る
  - 文言を `innerHTML` に入れない（利用側が渡す文字列なので、HTML として解釈させない）
  - 言語に依らない表示（`S` / `M` / `L` / `100%`、`✕`、`https://...`）は対象外

## コマンド

```bash
npm install          # 依存インストール
npm run dev          # 開発サーバー起動 (ルートの index.html を Vite で serve)
npm run build        # ライブラリビルド + スタンドアロンHTMLビルド
npm run build:lib    # ライブラリのみビルド
npm run build:standalone  # スタンドアロンHTMLのみビルド
npm test             # テスト実行
npm run verify:package    # npm pack の成果物に公開エントリが揃っているか検証
npm run lint         # リント (tsc --noEmit)
```

## PR 運用

**変更はブランチを切って PR にし、マージして main に入れる。** リリースは tagpr がマージ済みの PR から組み立てるので、**main へ直接 push しない。** ruleset では強制していないので、守るのは手順の側。

- ブランチの push、PR の作成、マージは、それぞれユーザーの承認を得てから行う
- マージは squash。**例外は `scripts/tagpr/` の subtree を取り込む PR で、マージコミットにする**（「リリース PR（tagpr）の仕組み」）
- **CHANGELOG はその PR の中で、`## [Unreleased]` の下に書く。** リリース PR のブランチでは書かない（tagpr が main から作り直すたびに消える）
- **次のリリースを minor にする PR（機能の追加）には `enhancement` ラベルを付ける。** tagpr がマージ済みの PR のラベルを見て、リリース PR に `tagpr:minor` を付ける（`.tagpr` の `minorLabels`）。付いていなければ patch
- dependabot の PR も同じくマージで入れる。開発依存だけの更新は利用者に届かないので、CHANGELOG に書くかは中身で決める（脆弱性の修正は書く）。書くときは、dependabot のブランチへ CHANGELOG のコミットを足してからマージする

## リリース手順

**リリースは、ユーザーから指示されたときだけ行う。リリースは tagpr のリリース PR をマージして始める**（0.17.0 の次の版から）。版上げ（`package.json` / `package-lock.json`）、`CHANGELOG.md` の見出しとリンク定義、タグは、リリース PR とワークフローが行う。**`npm version` を手で回さない。タグも手で打たない**（打ち直すときを除く。下の「やり直し」）。

1. **リリース PR を確かめる**

   ```bash
   gh pr list --label tagpr --state open --json number,title,headRefName
   gh run list --workflow tagpr.yml --branch main -L 3
   ```

   - **最新の tagpr の run が success であること。** 失敗していたら `scripts/tagpr/release-prepare.mjs` の出力を読む。多いのは `## [Unreleased]` が空のとき。CHANGELOG を書く PR をマージすると作り直される。「already has `## [X.Y.Z]`」で落ちていたら、前のリリース PR のタグが打たれていない（下の 3）
   - **版（PR のタイトル）をユーザーに確認する**（npm への公開は取り消せない）。既定は patch。`enhancement` の PR が入っていれば minor になる。手で変えるときはリリース PR にラベルを付けて作り直す

     ```bash
     gh pr edit <番号> --add-label tagpr:minor
     gh workflow run tagpr.yml --ref main
     ```

   - Files changed が `package.json` / `package-lock.json`（版の行だけ）と `CHANGELOG.md`（見出しとリンク定義）だけであること
   - **ラベルを付け外ししたら、作り直してからマージする。** タグの版はマージの時点の `package.json` で決まり（tagpr は `versionFile` をマージ時に読む）、`package.json` と CHANGELOG の見出しは最後に作り直した時点の版のまま。作り直さずにマージすると、**ラベルの版ではなく前の版がそのまま出る**（どこも食い違わないので、何も止まらない）
   - リリース PR の CI は承認待ち（`action_required`）で止まることがある（GITHUB_TOKEN が作った PR のため）。そのときは今の head の run を承認する（`gh api -X POST repos/kan/wema/actions/runs/<id>/approve`）

2. **CHANGELOG の節を確かめる**

   **この節がそのまま GitHub のリリースノートになる。** 前回のタグからの変更と突き合わせ、利用者に届く変更が載っているかを見る。直すときはリリース PR のブランチではなく、**main の `## [Unreleased]` を直す PR を入れる**。

   ```bash
   git fetch origin
   git show origin/<ブランチ>:CHANGELOG.md | sed -n '1,60p'
   git log --oneline <前回のタグ>..origin/main
   ```

   見出しの日付は、tagpr が最後にリリース PR を作り直した日（日本時間）。マージする日と違えば `gh workflow run tagpr.yml --ref main` で作り直す。

3. **リリース PR をマージする**（ユーザーの承認を得てから）

   ```bash
   gh pr merge <番号> --squash --delete-branch
   git switch main && git pull --ff-only
   gh run list --workflow tagpr.yml --commit "$(git rev-parse HEAD)" -L 1
   gh run list --workflow release.yml -L 1
   ```

   マージの push で走る tagpr の run がマージコミットにタグを打ち、`release` ジョブが `release.yml` をそのタグで起動する。`release.yml` は 3 つのジョブで動く。`build` がタグと版の一致と CHANGELOG の節を確かめ、lint・テスト・ビルドを通して tgz を作る。`publish` がその tgz を `npm publish` し、`release` がその後に GitHub Release（本文は CHANGELOG の節、`wema.html` を添付）を作る。`main` の push で動く `pages.yml` は、デモページを更新する。

   **タグが打たれるまで main へ何もマージしない。** tagpr の run は前の run が終わるまで待ち、待っている run は新しい push の run に置き換えられる（cancelled になる）。置き換えられたら、マージコミットの run を `gh run rerun <run-id>` で再実行するとタグが打たれる。置き換えた側の run は、同じ版を提案すれば「already has `## [X.Y.Z]`」で赤になる（版だけ上がったリリース PR が残ることがある。マージせず、タグが打たれた後の run で作り直される）。**`enhancement` の PR が入って版が変わると緑のまま通り、タグの無い版の上に次の版を積んだリリース PR ができる。** run の色ではなく、`git ls-remote --tags origin vX.Y.Z` でタグが打たれたかを確かめる。

   リリースの直後は `## [Unreleased]` が空なので、次に CHANGELOG を書くまで main への push ごとに tagpr の run が失敗する。これは想定どおりで、その間のリリース PR はマージしない。

4. **公開された結果を確かめる**
   - `gh run list` で tagpr / Release / CI / Pages のワークフローが成功していること
   - `npm view @kanf/wema dist-tags --prefer-online` の `latest` が新しい版であること（公開の直後は古い値を返すことがある）
   - `gh release view vX.Y.Z` に `wema.html` が付いていて、本文が CHANGELOG の節であること

**やり直し**

- `release.yml` が npm へ出す前に落ちたら、直してから `gh workflow run release.yml --ref vX.Y.Z` で起動し直す
- npm へは出て `release.yml` の `release` ジョブ（GitHub Release の作成。`tagpr.yml` の同名のジョブとは別）だけが落ちたら、`gh run rerun <run-id> --failed` でそのジョブだけをやり直す。「Re-run all jobs」でもよい（`publish` は npm に既にある版を飛ばす）。artifact の保持期間（7 日）を過ぎていたら、タグを checkout して `npm run build` で `dist/wema.html` を作り、`gh release create vX.Y.Z dist/wema.html --title vX.Y.Z --verify-tag --notes-file <(node scripts/tagpr/release-notes.mjs vX.Y.Z)` を手で回す（ノートのファイルを作業ツリーに残さない）
- `publish` ジョブが 401 / 404 で落ちたら、npm の token ではなく OIDC の側（`id-token: write`、npm の Trusted Publisher の登録）を疑う。setup-node が `NODE_AUTH_TOKEN` に入れる仮の値で認証を試みた結果のことが多い（`release.yml` のコメント）
- **`release.yml` はタグの指すコミットで動く。** npm へ出る前に落ちた原因がコードや CHANGELOG にあるなら、直した PR をマージしてタグを打ち直す（`git push origin :refs/tags/vX.Y.Z && git tag -d vX.Y.Z` で消し、直したマージコミットに打って push する。`push: tags` で起動する）。CHANGELOG は main ではもう `## [X.Y.Z] - 日付` になっている節を直す。**タグを消している間に main へ入ると、その tagpr の run は「already has `## [X.Y.Z]`」で赤になるか（同じ版を提案したとき）、次の版のリリース PR を緑のまま作る（版が変わったとき）。** そのリリース PR はマージせず、タグを打ち直した後に閉じる。打ち直しが済むまで他の PR はマージしない
- **npm へ出た版は打ち直せない**（同じ版は二度と publish できない）。次の版で直す

### リリース PR（tagpr）の仕組み

- **main に push があるたびに `tagpr.yml` がリリース PR を作り直す。** ブランチは `tagpr-from-v<前回の版>`。マージすると、次の run がマージコミットにタグを打つ。設定は `.tagpr`
- **版は `package.json` で持つ**（`versionFile`）。**tagpr は `package-lock.json` を書き換えない**ので、`scripts/tagpr/release-prepare.mjs`（`postVersionCommand`）が揃える
- **`release-prepare.mjs` は `## [Unreleased]` を `## [X.Y.Z] - 日付` にし、その上に空の `## [Unreleased]` を置き直し、末尾のリンク定義の先頭にその版のリンクを足す。** 検査をすべて済ませてから書き、落ちるときは何も書き換えない。落ちるのは `## [Unreleased]` が無いか空か重複しているとき、`## [X.Y.Z]` が既にあるとき（タグが打たれていない）、`package.json` の版や `repository` が合わないとき。失敗しても tagpr はリリース PR を作るので、**run が赤ならマージしない**
- **tagpr のジョブでは依存のコードを走らせない。** リポジトリへ push できるトークンを持つため。`npm ci` をせず、`scripts/tagpr/` は Node の組み込みだけで書く。tagpr の action は SHA で固定する
- **CHANGELOG と GitHub の Release は tagpr に作らせない**（`changelog = false` / `release = false`）。tagpr の CHANGELOG は PR のタイトルを並べるだけ。Release は `release.yml` が npm publish の**後**に作る（publish に失敗した版の Release を残さない）。`.github/release.yml` は、リリース PR の本文に並ぶ PR の分類にだけ使う
- **CHANGELOG の読み方（節の見出し、コードフェンス、末尾のリンク定義）は `scripts/tagpr/changelog.mjs` の 1 か所に置く。** `release-prepare.mjs` と `release-notes.mjs` はそれを import する。2 か所に書くと、リリース PR は通るのに `release.yml` の検査で落ちる。リンク定義の行で節が終わるので、**項目の中のリンクは参照形式ではなくインラインで書く**
- **`scripts/tagpr/` は [kan/tagpr-scripts](https://github.com/kan/tagpr-scripts) の git subtree**（lily / wema-kake と共有）。**ここでは編集しない。** upstream を直してから取り込む

  ```bash
  git subtree pull -S --prefix=scripts/tagpr https://github.com/kan/tagpr-scripts.git main --squash
  ```

  - **`-S` を付ける。** subtree は `commit-tree` でコミットを作るので、`commit.gpgsign` が効かず未署名になる
  - **この PR だけはマージコミットで入れる**（`gh pr merge <番号> --merge`）。subtree は前回の取り込みを自分のコミットから探すので、squash すると次の pull が壊れる
  - 取り込む PR は CHANGELOG に書かない（利用者に届かない）
  - テストは `cd scripts/tagpr && node --test 'test/*.node-test.mjs'`。名前が `*.test.*` でないので、`npm test`（vitest）には拾われない
- **`release.yml` は権限ごとに 3 つのジョブに分ける**（`build` は `contents: read`、`publish` は `id-token: write`、`release` は `contents: write`）。依存のコード（`npm ci` の install script、テスト、ビルド）が走るのは `build` だけにする。`id-token: write` のジョブで依存のコードが走ると、そのコードが npm 向けの OIDC トークンを取り、好きな版を publish できる。**`publish` と `release` のジョブで checkout や `npm ci` をしない。** `build` の成果物（リリースノート、tgz、`wema.html`）は artifact で渡す
- **`release.yml` は `workflow_dispatch` でタグを ref にして起動する**（`tagpr.yml` の `release` ジョブ）。GITHUB_TOKEN で push したタグでは `push: tags` が起動しないが、`workflow_dispatch` は例外として起動できる。`workflow_call` で同じ run から呼ぶ形にしないこと。run の主体が `tagpr.yml`、ref が `refs/heads/main` になり、npm の Trusted Publisher（`release.yml` を登録してある）と provenance がそれを名乗る。**`release.yml` のファイル名を変えると、npm 側の登録も変えるまで publish が通らない**
- **`workflow_dispatch` の権限（`actions: write`）は `release` ジョブだけに付け、tagpr のジョブには付けない**
- **`tagpr` ジョブの `concurrency` は `cancel-in-progress: false`。** 同じブランチを作り直し合わないように並べず、タグを打った直後に止めて publish されないタグを残さないように止めない
- GitHub 側の設定: 「Allow GitHub Actions to create and approve pull requests」を ON にしてある（tagpr が GITHUB_TOKEN でリリース PR を作るのに要る）

## リポジトリ構成

```
wema/
├── CLAUDE.md
├── .claude/rules/            # 領域ごとの実装ルール (対象のファイルを読んだときに読み込まれる)
├── README.md
├── index.html                # 開発用ページ (npm run dev が serve する)
├── CHANGELOG.md              # Keep a Changelog 形式 (各 PR で ## [Unreleased] に書く)
├── LICENSE                   # MIT
├── SECURITY.md               # 脆弱性報告ポリシー
├── .tagpr                    # tagpr の設定 (リリース PR)
├── package.json
├── tsconfig.json
├── vite.config.ts
├── scripts/
│   ├── build-standalone.ts   # wema.html ビルドスクリプト
│   ├── verify-package.ts     # 公開物にエントリファイルが揃っているか検証
│   └── tagpr/                # リリース PR の中身と Release の本文を作るスクリプト (kan/tagpr-scripts の subtree。ここでは編集しない)
├── src/                      # ライブラリ本体
│   ├── index.ts              # public API re-export
│   ├── types.ts              # 型定義
│   ├── labels.ts             # 画面の文言 (WemaLabels 型、enLabels / jaLabels)
│   ├── board.ts              # WemaBoard クラス (メインAPI)
│   ├── note.ts               # 付箋の管理・描画
│   ├── edge.ts               # 接続線の管理・描画
│   ├── drag.ts               # ドラッグ&ドロップ (グループドラッグ対応)
│   ├── selection.ts          # 選択状態管理 (複数選択・ラバーバンド)
│   ├── layout.ts             # 整列・均等配置・自動レイアウト
│   ├── anchor-drag.ts        # アンカーからのEdge作成ドラッグ
│   ├── resize.ts             # 付箋のリサイズ
│   ├── rich-text.ts          # リッチテキスト編集 (Selection/Range API)
│   ├── viewport.ts           # 表示位置・倍率の状態と座標変換
│   ├── animation.ts          # 付箋の移動のアニメーション (表示だけを補間)
│   ├── history.ts            # Undo/Redo 履歴管理 (デルタベース)
│   ├── edge-popup.ts         # Edge スタイル編集ポップアップ
│   ├── note-popup.ts         # ノートスタイル編集ポップアップ (単一/複数)
│   ├── note-links.ts         # 縦積みの間、付箋の下に出す「つながっている付箋」の印 (noteLinks)
│   ├── events.ts             # イベントシステム
│   ├── style.css             # デフォルトスタイル
│   └── utils/
│       ├── geometry.ts       # 座標計算・アンカーポイント・パス生成
│       ├── id.ts             # ID生成 (crypto.randomUUID)
│       ├── dom.ts            # DOM/SVG操作ヘルパー
│       ├── sanitize.ts       # HTML サニタイズ
│       ├── list.ts           # リストの編集 (行のリスト化と解除・段下げ・段上げ)
│       ├── meta.ts           # 付箋の meta の検査と比較
│       └── oembed.ts         # oEmbed URL → iframe 変換
├── standalone/
│   └── template.html         # スタンドアロン版テンプレート
├── dist/                     # ビルド成果物 (gitignore)
│   ├── wema.js               # ESM
│   ├── wema.umd.js           # UMD (グローバル名: Wema)
│   ├── wema.d.ts             # 型定義
│   ├── wema.css              # CSS (公開パスは @kanf/wema/style.css)
│   └── wema.html             # スタンドアロン版
├── tests/
│   ├── autosize.test.ts
│   ├── board.test.ts
│   ├── edge.test.ts
│   ├── events.test.ts
│   ├── filter.test.ts
│   ├── fold.test.ts
│   ├── geometry.test.ts
│   ├── labels.test.ts
│   ├── layout.test.ts
│   ├── list.test.ts
│   ├── move.test.ts
│   ├── note-extension.test.ts
│   ├── note-footer.test.ts
│   ├── note-links.test.ts
│   ├── note-accessory.test.ts
│   ├── note-decoration.test.ts
│   ├── page-scroll.test.ts
│   ├── stacked.test.ts
│   ├── rich-text.test.ts
│   ├── sanitize.test.ts
│   ├── history.test.ts
│   ├── sync.test.ts
│   └── viewport.test.ts
└── .github/
    ├── dependabot.yml        # 依存の自動更新 (npm + GitHub Actions)
    ├── release.yml           # リリース PR の本文に並ぶ PR の分類 (tagpr が使う)
    └── workflows/
        ├── ci.yml            # テスト・ビルド + npm audit
        ├── tagpr.yml         # リリース PR の作成、マージ後のタグ付けと release.yml の起動
        ├── release.yml       # リリース (build → npm publish → GitHub Release に wema.html を添付。権限ごとにジョブを分ける)
        └── pages.yml         # GitHub Pages デプロイ (https://kan.github.io/wema/)
```

## 技術スタック

- **言語**: TypeScript (strict mode)
- **ビルド**: Vite (library mode)
- **描画**: DOM (付箋) + SVG (接続線) ハイブリッド
- **フレームワーク依存**: なし
- **テスト**: Vitest + jsdom
- **出力**: ESM + UMD + 型定義 + style.css + スタンドアロンHTML

## アーキテクチャ

### 描画方式: DOM + SVG ハイブリッド

```
┌─ .wema-board (overflow: hidden、画面座標) ───────────┐
│  ┌─ .wema-viewport (translate + scale、ボード座標) ┐ │
│  │  svg.wema-edges (1px、overflow: visible)        │ │
│  │    <path> ... </path>                           │ │
│  │  .wema-note (position: absolute)                │ │
│  │    .wema-move-handle (ドラッグ用グリップ)       │ │
│  │    .wema-note-content (contenteditable)         │ │
│  │    .wema-note-anchors (接続ポイント4辺)         │ │
│  │    .wema-resize-handle (リサイズ)               │ │
│  │    .wema-note-under (枠の下。利用側が描く)      │ │
│  │      .wema-note-accessory / .wema-note-footer   │ │
│  │  .wema-rubberband                               │ │
│  └─────────────────────────────────────────────────┘ │
│  .wema-note-popup / .wema-edge-popup                 │
│  .wema-richtext-toolbar / .wema-image-overlay        │
└──────────────────────────────────────────────────────┘
```

### 領域ごとのルール（`.claude/rules/`）

実装の細かい規則は領域ごとに分けてあり、対象のファイルを読んだときに読み込まれる。対象外のファイルから同じ領域に触れるときは、先に該当のルールを読むこと。

| ルール | 内容 | 主な対象 |
|---|---|---|
| `viewport.md` | 表示位置（パンとズーム）と座標変換、ポップアップ類の追従、パンの範囲の制限 | `src/viewport.ts`、`src/board.ts`、ドラッグ・リサイズ・ポップアップ |
| `visibility.md` | 付箋の非表示（折り畳みと絞り込み） | `src/board.ts`、`src/selection.ts` |
| `sync.md` | `history:commit` / `applyRemote`、履歴の再生、参照モード | `src/history.ts`、`src/board.ts` |
| `autosize.md` | autoSize の計測と `note:update` | `src/note.ts` |
| `fold.md` | 長い本文を畳む付箋（`foldable`）と、開閉の状態 | `src/note.ts`、`src/board.ts`、`src/style.css`、`src/resize.ts` |
| `note-extension.md` | 利用側のデータ（`meta`）と、付箋の中身を利用側が描く口（`renderNote`）、付箋の要素へ利用側が当てる class と style（`decorateNote`） | `src/note.ts`、`src/utils/meta.ts`、`src/history.ts` |
| `pointer-and-popup.md` | ドラッグ直後の `click`、ポップアップの DOM 再構築 | `src/drag.ts`、`src/selection.ts`、`src/*-popup.ts` |
| `edge-path.md` | 接続線のパス計算 | `src/edge.ts`、`src/utils/geometry.ts` |
| `layout.md` | レイアウト関数（DOM 非依存） | `src/layout.ts` |
| `move-animation.md` | 付箋の移動のアニメーション（`moveNotes()` と `duration`） | `src/animation.ts`、`src/note.ts`、`src/board.ts`、`src/edge.ts` |
| `page-scroll.md` | ページと一緒にスクロールするモード（`pageScroll`） | `src/board.ts`、`src/style.css` |
| `stacked.md` | データを変えない、表示だけの縦積み（`setStacked()`）、付箋の下へ利用側が描く口（`renderNoteAccessory` と、積んでいる間の `renderNoteFooter`）、つながっている付箋の印（`noteLinks`） | `src/board.ts`、`src/note.ts`、`src/note-links.ts`、`src/animation.ts`、`src/style.css` |
| `standalone.md` | スタンドアロン版の責務とビルド | `standalone/`、`scripts/build-standalone.ts` |

### データの流れ

```
ユーザー操作 → DOM イベント → 内部状態更新 → DOM/SVG 再描画
                                    ↓
                          'change' イベント発火
                                    ↓
                          利用側で永続化 (ライブラリは関与しない)
```

ライブラリはデータ永続化に一切関与しない。
`exportData()` でシリアライズ可能なオブジェクトを返し、`importData()` で復元する。
スタンドアロン版 (`standalone/template.html`) がIndexedDBでの保存を実装する。

## データモデル

```typescript
type NoteId = string;
type EdgeId = string;
type Anchor = 'top' | 'right' | 'bottom' | 'left' | 'auto';
type NoteTheme = 'default' | 'card';
type EdgeStyle = 'arrow' | 'line' | 'dashed';  // legacy shorthand
type LineStyle = 'solid' | 'dashed' | 'dotted';
type ArrowHead = 'none' | 'start' | 'end' | 'both';
type EdgeRouting = 'curve' | 'polyline';

interface WemaNote {
  id: NoteId;
  x: number;
  y: number;
  width: number;
  height: number;
  text: string;
  color: string;
  zIndex: number;
  autoSize?: boolean;
  foldable?: boolean;  // 長い本文（3 行以上）を畳んで表示する。開閉の状態はデータに入れない
  meta?: Readonly<Record<string, string>>;  // 利用側のデータ。wema は中身を読まない
}

interface WemaEdge {
  id: EdgeId;
  from: NoteId;
  to: NoteId;
  fromAnchor: Anchor;       // default: 'auto'
  toAnchor: Anchor;         // default: 'auto'
  style: EdgeStyle;         // default: 'arrow' (legacy)
  label?: string;
  lineStyle?: LineStyle;    // default: 'solid'
  strokeWidth?: number;     // default: 2
  arrowHead?: ArrowHead;    // default: 'end'
  arrowSize?: number;       // default: 12
  routing?: EdgeRouting;    // default: 'curve'
  collapsed?: boolean;
}

interface WemaBoardData {
  version: 1;
  notes: WemaNote[];
  edges: WemaEdge[];
  viewport?: { x: number; y: number; zoom: number };  // 未使用（exportData は書かず、importData は無視する）
}
```

## Public API (`WemaBoard` クラス)

```typescript
class WemaBoard {
  constructor(options: WemaBoardOptions);
  destroy(): void;

  // 付箋
  addNote(params?: Partial<Omit<WemaNote, 'id'>>): WemaNote;
  updateNote(id: NoteId, params: Partial<WemaNote>): void;
  deleteNote(id: NoteId): void;
  getNote(id: NoteId): WemaNote | undefined;
  getNotes(): WemaNote[];
  refreshNote(id: NoteId): void;  // renderNote で描いた付箋と、renderNoteAccessory / renderNoteFooter で描いた要素を描き直し、decorateNote を当て直す（データは変えない）
  refreshNoteAccessory(id: NoteId): void;  // renderNoteAccessory で描いた要素だけを描き直す
  refreshNoteDecoration(id?: NoteId): void;  // decorateNote の class と style を当て直す（id を省くと全付箋。データは変えない）
  resizeNotesToContent(noteIds: NoteId[]): void;  // 内容に合うサイズへ 1 回だけ変える（autoSize は変えない。Undo 1 回分）

  // 接続線
  addEdge(from: NoteId, to: NoteId, params?: ...): WemaEdge;
  updateEdge(id: EdgeId, params: Partial<Omit<WemaEdge, 'id' | 'from' | 'to'>>): void;  // viewOnly では collapsed だけを反映する
  deleteEdge(id: EdgeId): void;
  getEdges(): WemaEdge[];
  getEdgesOf(noteId: NoteId): WemaEdge[];
  getSelectedEdge(): EdgeId | null;

  // 選択
  select(noteIds: NoteId[]): void;
  selectAll(): void;
  getSelection(): NoteId[];

  // 絞り込み（表示だけを変える。データ・イベント・履歴には影響しない）
  setNoteFilter(noteIds: NoteId[] | null): void;
  getNoteFilter(): NoteId[] | null;
  isNoteHidden(id: NoteId): boolean;  // 絞り込みの対象外、または折り畳んだ接続線の先。変わると note:visibility が発火する

  // 表示位置と倍率（表示だけを変える。viewport:change のみ発火）
  getViewport(): WemaViewport;                 // { x, y, zoom }
  setViewport(viewport: Partial<WemaViewport>): void;  // zoom は minZoom〜maxZoom に収める
  zoomTo(zoom: number, center?: { clientX: number; clientY: number }): void;  // center（省略時はボードの中央）を動かさない
  revealNotes(noteIds: NoteId[], options?: { padding?: number }): void;       // 倍率は変えない
  centerContent(options?: { noteIds?: NoteId[]; padding?: number }): void;    // 倍率は変えない
  fitToContent(options?: { noteIds?: NoteId[]; padding?: number; maxZoom?: number }): void;  // 収まる倍率にする（既定では等倍を超えない）

  // ページと一緒にスクロールするモード（表示だけを変える。狭い画面向け）
  setPageScroll(pageScroll: boolean): void;  // ボードが付箋の高さまで伸び、表示位置は { x: 0, y: 0, zoom: 1 } に固定
  isPageScroll(): boolean;

  // 表示だけの縦積み（データは変えない。イベントも履歴も出さない。列が変わるたびにボードが積み直す）
  setStacked(stack: { x?: number; y?: number; width?: number; gap?: number; order?: NoteId[] } | null, options?: { duration?: number }): void;  // 積んでいる間、ドラッグとリサイズはできない
  getStacked(): StackLayoutOptions | null;

  // レイアウト（options.duration を渡すと、付箋と接続線が新しい位置までアニメーションする）
  moveNotes(moves: { id: NoteId; x?: number; y?: number; width?: number; height?: number }[], options?: { duration?: number }): void;  // viewOnly でも通る
  alignNotes(noteIds: NoteId[], alignment: 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom', options?: { duration?: number }): void;
  distributeNotes(noteIds: NoteId[], direction: 'horizontal' | 'vertical', options?: { duration?: number }): void;
  autoLayout(noteIds?: NoteId[], options?: { duration?: number }): void;  // ボードの縦横比に合わせて折り返す
  stackNotes(options?: { noteIds?: NoteId[]; x?: number; y?: number; width?: number; gap?: number; order?: NoteId[]; duration?: number }): void;  // 縦 1 列に積む。viewOnly でも通る

  // 履歴・同期
  batch<T>(fn: () => T, options?: { origin?: 'user' | 'agent' }): T;  // Undo 1 回分にまとめる
  applyRemote(deltas: HistoryDelta[]): void;  // readOnly/viewOnly でも適用、履歴に積まない

  // データ入出力
  exportData(): WemaBoardData;
  importData(data: WemaBoardData): void;

  // 状態
  setReadOnly(readOnly: boolean): void;
  isReadOnly(): boolean;
  setViewOnly(viewOnly: boolean): void;
  isViewOnly(): boolean;
  setTheme(theme: NoteTheme): void;
  getTheme(): NoteTheme;

  // イベント
  on<K extends keyof WemaEventMap>(event: K, handler: (...) => void): void;
  off<K extends keyof WemaEventMap>(event: K, handler: (...) => void): void;
}
```

### WemaBoardOptions

```typescript
interface WemaBoardOptions {
  container: HTMLElement;
  data?: WemaBoardData;
  defaultNoteWidth?: number;   // default: 200
  defaultNoteHeight?: number;  // default: 150
  defaultNoteColor?: string;   // default: '#FFF9C4'
  createOnDblClick?: boolean;  // default: true
  readOnly?: boolean;          // default: false
  viewOnly?: boolean;          // default: false
  theme?: NoteTheme;           // default: 'default'
  onImageUpload?: (file: File) => Promise<string>;  // 指定時は data URL の代わりに返された URL で画像を挿入
  onLinkClick?: (url: string, event: MouseEvent) => boolean | void;  // url は解決済みの絶対 URL。true を返すと新しいタブを開かない
  renderNote?: (note: WemaNote, container: HTMLElement) => boolean | void;  // true を返した付箋は、本文の代わりに container の中身を表示する
  renderNoteAccessory?: (note: WemaNote, container: HTMLElement) => boolean | void;  // true を返した付箋の枠のすぐ下に、container の中身（印やボタン）を表示する。積んでいなくても出る。付箋のデータは変えない
  decorateNote?: (note: WemaNote) => { className?: string; style?: Record<string, string> } | undefined | void;  // 付箋の要素（.wema-note）に利用側の class と style を当てる。前回の分は外してから当てる。付箋のデータは変えない
  renderNoteFooter?: (note: WemaNote, container: HTMLElement) => boolean | void;  // 積んでいる間（setStacked）、true を返した付箋の下に container の中身を表示する。付箋のデータは変えない
  noteLinks?: boolean | { text?: (peer: WemaNote, edge: WemaEdge) => string | undefined | void; padding?: number };  // default: false（積んでいる間、つながっている付箋を付箋の下にボタンで出す。renderNoteFooter があれば、そちらが描く）
  labels?: Partial<WemaLabels>;  // 画面の文言。省略したキーは英語（enLabels）。日本語は jaLabels を渡す。読むのは作成時の 1 回
  foldLabels?: { more?: string; less?: string };  // labels の readMore / showLess と同じ文言。両方あればこちらが優先（default: 'Read more' / 'Show less'）
  wheelPan?: boolean;          // default: true（ホイールで表示位置を動かす）
  wheelZoom?: boolean;         // default: true（Ctrl / Cmd + ホイールでズームする）
  emptyDrag?: 'select' | 'pan';  // default: 'select'（空いている場所の左ドラッグ。'pan' でパン、ラバーバンド選択は Shift か Ctrl / Cmd + ドラッグ）
  panMargin?: number;          // default: 200（操作でパンできる範囲。付箋の外側に見せる余白。Infinity で無制限）
  pageScroll?: boolean;        // default: false（ページと一緒にスクロールするモードで始める）
  stacked?: StackLayoutOptions;  // 付箋を縦 1 列に積んだ表示で始める（setStacked() と同じ。データは変えない）
  minZoom?: number;            // default: 0.25
  maxZoom?: number;            // default: 2
}
```

### イベント

```typescript
type ChangeOrigin = 'local' | 'remote';                    // 'remote' は applyRemote() による変更
type HistoryOrigin = 'user' | 'undo' | 'redo' | 'agent';

interface WemaEventMap {
  'note:create':     { note: WemaNote; origin: ChangeOrigin };
  'note:update':     { note: WemaNote; prev: WemaNote; origin: ChangeOrigin };
  'note:delete':     { note: WemaNote; origin: ChangeOrigin };
  'note:measure':    { note: WemaNote; prev: WemaNote };  // 計測で大きさが変わった（表示だけ。履歴に載らない）
  'note:visibility': { hidden: NoteId[]; shown: NoteId[] };  // 表示と非表示が変わった付箋（表示だけ。履歴に載らない）
  'note:select':     { noteIds: NoteId[] };
  'edge:create':     { edge: WemaEdge; origin: ChangeOrigin };
  'edge:update':     { edge: WemaEdge; prev: WemaEdge; origin: ChangeOrigin };
  'edge:delete':     { edge: WemaEdge; origin: ChangeOrigin };
  'readOnly:change': { readOnly: boolean };
  'viewOnly:change': { viewOnly: boolean };
  'history:change':  { canUndo: boolean; canRedo: boolean };
  'history:commit':  { deltas: HistoryDelta[]; origin: HistoryOrigin };
  'image:error':     { noteId: NoteId; file: File; error: unknown };
  'viewport:change': WemaViewport;
  'change':          { data: WemaBoardData };
}
```

## CSS カスタマイズ

```css
.wema-board {
  --wema-note-border-radius: 4px;
  --wema-note-shadow: 0 2px 8px rgba(0,0,0,0.15);
  --wema-note-font-size: 14px;
  --wema-anchor-size: 12px;
  --wema-anchor-color: #4A90D9;
  --wema-edge-color: #555;
  --wema-edge-width: 2px;
  /* noteLinks のボタン */
  --wema-note-link-background: #fff;
  --wema-note-link-color: #333;
  --wema-note-link-border-color: rgba(0,0,0,0.15);
  --wema-note-link-label-color: #666;
  --wema-note-link-accent-color: #4A90D9;
}
```

## 実装フェーズ

Phase 1〜6（MVP、接続線、レイアウトと整列、リッチテキスト、Undo / Redo、パンとズーム）は実装済み。リリースごとの変更は `CHANGELOG.md` にある。

### Phase 7 — 入れ子ボード（wema-kake へ引き継ぎ）

付箋を子ボードに見立てた階層構造は、wema では実装しない。wema を使った Wiki である wema-kake（`../wema-kake`、github.com/kan/wema-kake）へ引き継ぐ。wema に `children?: WemaBoardData` のようなデータ構造は足さない。

### Phase 8 — モバイル対応

スマホ Web での動作を正式サポート。タッチ操作の最適化、レスポンシブ UI。

- タッチ操作（1 本指のパン、2 本指のピンチ）
- `pointerdown` で始まる操作（パン、リサイズ、アンカー、付箋のドラッグ、ラバーバンド）の開始判定を 1 か所にまとめる。現在は、パンがキャプチャ段階で先に受け取り、伝播を止めている。タッチ操作を足すときに一緒に行う

### 将来

- React / Vue アダプター (`@kanf/wema-react` / `@kanf/wema-vue` 別パッケージ)
- オンラインコラボレーション (wema ライブラリ + WebSocket の別 Web アプリとして実現、別リポジトリ)
