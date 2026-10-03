# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [0.6.0] - 2026-10-03

### Security

- 付箋内のリンクを開くとき、ブラウザが解決した URL を検査し、その URL を `onLinkClick` と新しいタブの両方で使う。従来は `href` 属性の値を検査し、新しいタブへも属性の値をそのまま渡していた。解決後の URL が検査を通らないリンクは、クリックしても何も開かない
- `file://` で開いたページの相対リンクは、同じホスト（ローカルディスク）を指す場合だけ開く。`//server/share` のように別のホストへ解決されるリンクは開かない

### Added

- **表示位置の移動（パン）** ([#52](https://github.com/kan/wema/issues/52))。ボードからはみ出した付箋へ届くようになった
  - `getViewport()` / `setViewport()` — 表示位置の取得と設定
  - `revealNotes(noteIds)` — 指定した付箋が見えるよう、必要な分だけ動かす
  - `centerContent()` — 付箋全体（絞り込み中は表示対象）がボードの中央に来るよう動かす
  - `viewport:change` イベント
  - 操作: ホイール、中ボタンのドラッグ、Space + 左ドラッグ。readOnly / viewOnly では、空いている場所の左ドラッグでもパンし、ダブルクリックでその位置を中央へ動かす
  - `wheelPan` オプション — `false` でホイールによるパンを無効にする
  - 表示位置は各クライアントの表示状態として扱う。`note:*` / `edge:*` / `history:commit` / `change` は発火せず、Undo 履歴にも積まれない。`exportData()` にも含めない
  - ズームは未対応（`zoom` は常に 1）

### Changed

- **ボードの上でホイールを回すと、ページではなくボードが動く。** ボードをスクロールするページに埋め込んでいる場合は、`wheelPan: false` で従来の挙動に戻せる
- **viewOnly で、空いている場所の左ドラッグがパンになった。** ラバーバンド選択は Shift + 左ドラッグで行う
- 座標を省略した `addNote()` は、表示中の領域の左上から (100, 100) の位置に付箋を作る。表示位置を動かしていなければ、従来と同じ位置になる
- 付箋と接続線の SVG を、新しい要素 `.wema-viewport` の中へ移した。`.wema-board > .wema-note` のように直下を前提にしたセレクタは当たらなくなる
- `WemaBoardData.viewport` は使わないことを明記した。`exportData()` は書き出さず、`importData()` は無視する
- スタンドアロン版は、ボードを付箋の範囲まで広げてスクロールさせる方式をやめ、パンで移動する方式にした。背景のグリッドは表示位置に合わせて動く

### Fixed

- autoSize の付箋の幅が、ボードの右端に近いほど狭くなる問題を修正した。ボードの幅を超えた位置では最小幅まで縮んでいた。位置によらず、内容に合った幅（最大 600px）になる
- `computeAutoLayout` / `autoLayout()` が、相互に参照するだけの付箋群（循環）の位置を返さないことがある問題を修正した。起点になる付箋が他にある場合と、循環だけの付箋群が複数ある場合に起きていた

## [0.5.0] - 2026-10-03

### Added

- `setNoteFilter(noteIds)` / `getNoteFilter()` を追加した。指定した付箋だけを表示し、それ以外の付箋と、その付箋につながる接続線を非表示にする。データ、イベント、Undo 履歴には影響しない
- `onLinkClick` オプションを追加した。付箋内のリンクのクリックを利用側で処理できる。ブラウザが解決した絶対 URL を受け取り、`true` を返すと新しいタブを開かない

### Changed

- 折り畳みで非表示になっている付箋は選択できない。選択中の付箋が折り畳みで隠れたときは、選択から外れる。従来は全選択やラバーバンド選択の対象になり、見えていない付箋を削除や移動できた

## [0.4.0] - 2026-10-03

### Security

- 付箋の HTML サニタイザが、危険な URL を通す問題を修正した
  - `java&#9;script:` のように制御文字を挟んだ `javascript:` URL、`vbscript:` URL、`<iframe>` の `data:` URL を除去していなかった。ブラウザは URL の解析時にタブや改行を捨てるため、こうした URL はスクリプトとして実行される
  - `href` / `src` / `poster` の検査を、URL スキームの許可リスト（`http` / `https` / `mailto` / `tel` と相対 URL）へ変更した。`data:` は `<img>` / `<video>` / `<audio>` で、種類の合うメディアに限って許可する
  - 付箋内のリンクをクリックしたとき、リンクの挿入時、埋め込み URL の入力時にも同じ検査をする
  - **この変更により、`file:` / `ftp:` / `blob:` や独自スキーム（`obsidian://` など）のリンクは、既存の付箋を読み込んだ時点で `href` が除去される**
- `<a` を大量に並べたテキストで、プレーンテキスト判定の正規表現の処理時間が入力長の 2 乗で増える問題を修正した

### Added

- **リアルタイム同期のための API** ([#50](https://github.com/kan/wema/issues/50))
  - `history:commit` イベント — ユーザー操作 1 回分（Undo 1 回分）が確定するたびに `{ deltas, origin }` を発火する。Undo では逆向きの差分、Redo では元の差分が流れる
  - `HistoryDelta` / `HistoryOrigin` / `ChangeOrigin` 型の export
  - `applyRemote(deltas)` — 他のクライアントの変更を適用する。readOnly / viewOnly 中でも適用し、Undo 履歴には積まない
  - `batch(fn, options?)` — 複数の操作を Undo 1 回分・`history:commit` 1 回にまとめる。`origin: 'agent'` を指定できる
  - `note:*` / `edge:*` イベントのペイロードに `origin`（`'local'` / `'remote'`）を追加
- `onImageUpload` オプションを追加した。指定すると、画像を data URL で埋め込まず、返された URL で挿入する。失敗時は `image:error` イベントを発火する
- DOM に依存しないレイアウト関数 `computeAlignment` / `computeDistribution` / `computeAutoLayout` を export した。`WemaBoard` を作れないサーバー側でも使える

### Changed

- **参照モード（viewOnly）中の移動と折り畳み、終了時の復元は Undo 履歴へ積まない。** 従来は通常の操作として履歴に残っていた
- **参照モード中の `undo()` / `redo()` は何もしない。** 従来はキーボードショートカットだけが無効で、メソッドを直接呼ぶと動いていた
- **`viewOnly: true` で作成したボードも、参照モードを終えると作成時点の位置と折り畳み状態へ戻る。** 従来、戻るのは `setViewOnly(true)` を呼んで参照モードへ入った場合だけだった
- **`change` イベントの `data` に常にボードのデータが入るようにした。** 従来はテキスト編集の確定時やドラッグ終了時に、`data` が `undefined` の `change` が余分に発火していた
- 1 回の操作の中で同じ付箋や接続線を何度も更新した場合、Undo 履歴の差分を 1 件にまとめる。元の位置へ戻しただけのドラッグは Undo 履歴に残らない
- 依存関係の更新（開発依存のみ、ライブラリ実体に影響なし）
  - undici 7.29.0 → 8.11.2（脆弱性修正、jsdom の更新による）
  - jsdom 29.1.1 → 30.1.1
  - vitest 4.1.10 → 5.0.0
  - tsx 4.23.0 → 4.23.13
  - vite-plugin-dts 5.0.3 → 5.1.0
- CI と GitHub Pages のビルドに使う Node.js を 20 から 24 へ更新した（jsdom 30 と vitest 5 が Node.js 22 以上を要求するため）

### Fixed

- **autoSize の付箋で、サイズの変化が Undo 履歴に残らない問題を修正** ([#51](https://github.com/kan/wema/issues/51))
  - 入力中の計測は `note:update` を発火しなくなった。従来は `prev` と `note` が同じ値の `note:update` を 1 文字ごとに発火していた
  - 入力によるサイズの変化は、blur 時の `note:update` にテキストと一緒に載る
  - autoSize をオンにしたときのサイズの変化は、その `note:update` に載る。Undo すると元のサイズへ戻る
  - 描画後の再計測でサイズが変わったとき、接続線を再描画する
- **編集中に `exportData()` が呼ばれると、そのテキスト編集が Undo 履歴に残らない問題を修正。** `exportData()` が編集中の内容をモデルへ書き込んでいたため、blur 時に差分が検出されなかった。autoSize の付箋では入力のたびに起きていた

## [0.3.3] - 2026-08-23

### Fixed

- **公開パッケージに型定義エントリ `dist/wema.d.ts` が含まれず、TypeScript から利用するとビルドが失敗する問題を修正** ([#42](https://github.com/kan/wema/issues/42)) — vite-plugin-dts 5 系でオプション名が `rollupTypes` から `bundleTypes` へリネームされたことにより、`vite.config.ts` の `rollupTypes: true` が黙って無視され、型定義エントリが出力されなくなっていた。`insertTypesEntry: true` に変更してエントリを生成するようにした。`package.json` の `types` / `exports` の参照先は変更していない

### Added

- **公開物の検証スクリプト** (`npm run verify:package`) — `npm pack` の成果物に `package.json` が宣言するエントリファイル（`types` / `main` / `module` / `exports`）がすべて含まれるかを検査する。CI のビルド後に実行し、同種の欠落を公開前に検出する

### Changed

- 依存関係の更新（開発依存のみ、ライブラリ実体に影響なし）
  - typescript 6.0.3 → 7.0.2（TypeScript 7 は JavaScript Compiler API を提供しないため、フォールバックの `@typescript/typescript6` を追加）
  - postcss 8.5.15 → 8.5.26（脆弱性修正）
  - undici 7.28.0 → 7.29.0（脆弱性修正）
  - nanoid 3.3.17 → 3.3.18（脆弱性修正）
  - vite 8.0.16 → 8.2.2
  - vitest 4.1.9 → 4.1.10
  - tsx 4.22.4 → 4.23.0
  - vite-plugin-dts 5.0.2 → 5.0.3
  - actions/setup-node 6 → 7

## [0.3.2] - 2026-06-25

### Changed

- 依存関係の更新（開発依存のみ、ライブラリ実体に影響なし）
  - esbuild 0.27.3 → 0.28.1（脆弱性修正）
  - undici 7.25.0 → 7.28.0（脆弱性修正）
  - vitest 4.1.5 → 4.1.9
  - tsx 4.21.0 → 4.22.4
  - actions/checkout 6 → 7

## [0.3.1] - 2026-02-18

### Changed

- **辺ごとの折り畳みボタン** — 折り畳みボタンを接続線が実際に出ている辺（上/右/下/左）にそれぞれ配置するように変更。各ボタンはその辺から出る接続線のみを独立して折り畳み/展開する。バッジ数もその辺の部分木のみをカウント
- 折り畳みボタンの位置をアンカーポイントと重ならないよう外側にオフセット

## [0.3.0] - 2026-02-18

### Added

- **接続先ノードの自動作成** — アンカーから接続線をドラッグして空白にドロップすると、その場に新しい付箋を作成して自動的に繋ぐ
- **部分木の折り畳み/展開** — 出力先を持つ付箋にカーソルを乗せると右端に折り畳みボタン（−）が表示される。クリックするとその付箋から出ている全ての接続線と接続先の部分木を再帰的に非表示にし、隠れているノード数を示す数字バッジに変わる。バッジをクリックすると再展開。状態は `WemaEdge.collapsed` としてエクスポート/インポートで永続化される

### Removed

- 付箋の折り畳み機能（v0.2.0 で追加したムーブハンドルのシェブロンボタン）を削除し、接続線ベースの部分木折り畳みに置き換えた

## [0.2.0] - 2026-02-18

### Added

- **折り畳み（Collapse）** — ムーブハンドル左端のシェブロン（▾/▸）で付箋を折り畳み/展開。折り畳み時はハンドル＋テキスト1行目のみ表示
- **autoSize モード** — 付箋のサイズをコンテンツに自動フィットさせるモード
- **GitHub Pages デモ** — https://kan.github.io/wema/ でスタンドアロン版を公開
- **ロゴ** — favicon、ツールバー、README にロゴを追加

### Changed

- ツールバーのテキストラベルを SVG アイコンに置き換え、レイアウトボタンをドロップダウンに統合
- ビューポートを超えるノートがある場合にスタンドアロン版でスクロール可能に

### Fixed

- lock/viewOnly 切替時の選択状態クリア漏れ
- リスト変換の revert 不具合
- チェックリスト内での IME 確定 Enter の誤動作

## [0.1.0] - 2025-02-15

### Added

- **付箋 CRUD** — 付箋の作成・読取・更新・削除、ドラッグ移動、リサイズ
- **データ入出力** — `exportData()` / `importData()` によるシリアライズ・復元
- **接続線（Edge）** — アンカーポイント、SVG パス描画（ベジェ曲線・折れ線）、ラベル
- **Edge スタイル編集** — 線種（solid/dashed/dotted）、矢印、太さ、ルーティング、アンカー指定
- **複数選択** — Shift+Click / Ctrl+Click / ラバーバンド選択、グループドラッグ
- **レイアウト・整列** — `alignNotes()` / `distributeNotes()` / `autoLayout()`
- **リッチテキスト** — 太字、テキスト色、箇条書き（ul/ol）、チェックボックス、リンク、画像、Embed
- **Undo/Redo** — デルタベースの履歴管理、マイクロタスクバッチング
- **スタンドアロン HTML** — 1 ファイルで完結する `wema.html`（IndexedDB 自動保存付き）
- **状態管理** — `readOnly` / `viewOnly` / `theme`（default / card）
- **イベントシステム** — `note:*` / `edge:*` / `change` / `history:change` イベント
- **CSS カスタマイズ** — CSS 変数によるスタイル調整

[0.3.1]: https://github.com/kan/wema/releases/tag/v0.3.1
[0.3.0]: https://github.com/kan/wema/releases/tag/v0.3.0
[0.2.0]: https://github.com/kan/wema/releases/tag/v0.2.0
[0.1.0]: https://github.com/kan/wema/releases/tag/v0.1.0
