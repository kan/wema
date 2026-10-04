---
paths:
  - "standalone/**"
  - "scripts/build-standalone.ts"
---

# スタンドアロン版 (`standalone/template.html`)

ライブラリとは独立したアプリケーションコード。
ビルド時に `scripts/build-standalone.ts` が CSS と UMD バンドルをインライン注入して
`dist/wema.html` を生成する。

## template.html の責務

- ツールバーUI (付箋追加、色変更、整列・均等配置・autoLayoutボタン等)
- IndexedDB によるデータ自動保存 (`change` イベント + 300ms debounce)
- JSON ファイルのエクスポート/インポート
- キーボードショートカット (Delete で削除、Ctrl+A で全選択 等)
- viewOnly / readOnly トグル

## ビルドスクリプトの仕組み

`standalone/template.html` 内のプレースホルダコメント:
- `<!-- __WEMA_CSS__ -->` → `<style>dist/wema.css の中身</style>` に置換
- `<!-- __WEMA_JS__ -->` → `<script>dist/wema.umd.js の中身</script>` に置換

テンプレート内のアプリコードは `window.Wema` (UMDグローバル) を参照する。
