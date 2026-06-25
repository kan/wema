# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/),
and this project adheres to [Semantic Versioning](https://semver.org/).

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
