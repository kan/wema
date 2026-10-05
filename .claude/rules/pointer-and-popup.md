---
paths:
  - "src/board.ts"
  - "src/drag.ts"
  - "src/resize.ts"
  - "src/anchor-drag.ts"
  - "src/selection.ts"
  - "src/edge-popup.ts"
  - "src/note-popup.ts"
---

# ポインタイベントとポップアップ

## ポインタイベントとクリックの干渉

ドラッグ (`pointerdown` → `pointermove` → `pointerup`) の後に `click` イベントが発火する。
ドラッグ操作で選択状態が壊れないよう、`noteDragged` / `rubberBandMoved` / `panMoved` フラグで
ドラッグ直後の `click` をスキップするパターンを使用している。

## ポインタのキャプチャ後の `click` / `dblclick`

`setPointerCapture()` でポインタをボードへキャプチャすると、そのあとの `click` と `dblclick` は、
押した要素ではなくボードを `target` にして届く。ボードは、これを空いている場所への操作として扱う
（`click` は選択の解除、`dblclick` は付箋の作成）。

- リサイズハンドルの押下に続く `click` / `dblclick` は、`ResizeManager` がキャプチャ段階で止める
  （`onClickAfterPress`）
- **リサイズハンドルのダブルクリックは `dblclick` イベントで判定しない。** `target` がハンドルに
  ならないため。`pointerdown` の時点で、同じハンドルへの 2 回目の押下かどうかを判定する
  （`isSecondPress`）
- jsdom はポインタのキャプチャを再現しない。テストでは、押下のあとのイベントをボードへ
  dispatch して実ブラウザの挙動に合わせる。キャプチャを使う操作を変えたら、実ブラウザでも確認する

## ポップアップの DOM 再構築

ポップアップ内のボタンクリックで `this.show()` を呼ぶと `innerHTML` が再構築され、
クリックされたボタンが DOM から切り離される。`stopPropagation()` をポップアップ要素に
設定してボードの `handleBoardClick` への伝播を防止している。
