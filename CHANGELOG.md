# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/),
and this project adheres to [Semantic Versioning](https://semver.org/).

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

[0.2.0]: https://github.com/kan/wema/releases/tag/v0.2.0
[0.1.0]: https://github.com/kan/wema/releases/tag/v0.1.0
