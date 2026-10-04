---
paths:
  - "src/board.ts"
  - "src/drag.ts"
  - "src/selection.ts"
  - "src/edge-popup.ts"
  - "src/note-popup.ts"
---

# ポインタイベントとポップアップ

## ポインタイベントとクリックの干渉

ドラッグ (`pointerdown` → `pointermove` → `pointerup`) の後に `click` イベントが発火する。
ドラッグ操作で選択状態が壊れないよう、`noteDragged` / `rubberBandMoved` フラグで
ドラッグ直後の `click` をスキップするパターンを使用している。

## ポップアップの DOM 再構築

ポップアップ内のボタンクリックで `this.show()` を呼ぶと `innerHTML` が再構築され、
クリックされたボタンが DOM から切り離される。`stopPropagation()` をポップアップ要素に
設定してボードの `handleBoardClick` への伝播を防止している。
