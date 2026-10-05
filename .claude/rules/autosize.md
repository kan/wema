---
paths:
  - "src/note.ts"
  - "src/board.ts"
  - "src/rich-text.ts"
  - "tests/autosize.test.ts"
---

# autoSize の計測

autoSize の付箋の `width` / `height` は、内容と CSS から決まる派生値で、ユーザーの操作ではない。

- 入力中と描画後（`requestAnimationFrame`）の計測は `note:update` を出さない。モデルを更新し、`onMeasure` で接続線の再描画と `change` だけを行う（`NoteManager.measure`）
- 計測によるサイズの変化は、次の `note:update` の `prev` に計測前の値を入れて報告する（`unreportedSizeBase` / `emitUpdate`）。入力なら blur 時にテキストと同じ 1 件になる
- 計測するのは autoSize の付箋（幅と高さ）と、`foldable` の付箋（高さだけ。`.claude/rules/fold.md`）。以下の規則は両方に当てはまる
- 非表示の付箋（接続線の折り畳み、絞り込み）はレイアウトされないので計測できない。再表示のときに `recomputeVisibility()` が `NoteManager.remeasure()` を呼んで計測し直す
- `updateNote` が `autoSize` / `foldable` / `text` / `meta` / `width` / `height` を変えるときは、その場で計測してから `note:update` を出す。autoSize の切り替えとその結果のサイズが 1 件になり、Undo で元のサイズへ戻る
- Undo / Redo の再生と `applyRemote` は `NoteManager.replayUpdate` を使う。履歴に記録されない更新なので、未報告の計測前サイズを消費しない（消費すると、そのサイズの変化がどの `history:commit` にも載らなくなる）
- DOM 上の編集（入力の blur、チェックボックス、画像の操作）の確定は `syncNoteContent` の 1 か所で行う。確定経路を増やすときもここを通すこと
- ボタンやキーで本文の DOM を書き換える編集（リストへの変換と解除、段下げ、段上げ）は `NoteManager.editContent()` を通す。選択範囲の取得、編集後の選択範囲の復元、`syncNoteContent` での確定をここが行う。`updateNote({ text: innerHTML })` で確定しない
- 内容に合うサイズへ 1 回だけ変える操作（`NoteManager.resizeToContent()`、公開メソッドは `resizeNotesToContent()`）は、付箋の要素へ `wema-auto-size` クラスを一時的に付けて計測し、外してから `updateNote({ width, height })` で確定する。大きさを決める規則は CSS の `.wema-note.wema-auto-size` の 1 か所だけにあり、JavaScript 側に同じ規則（最大幅など）を書かない
  - 確定する値は整数に切り上げる（`wholePixels()`）。`offsetWidth` は丸めた値なので、内容より小数ピクセルだけ狭い幅を固定すると、最後の語が折り返す
- 計測値が 0 のとき（折り畳みで非表示、DOM から外れている）は無視する
- `updateNoteElement` が表示内容を描き直すのは text を変える更新のときだけ。モデルの text とブラウザが正規化した innerHTML は一致しないことがあり、移動のたびに描き直すと画像や埋め込みが再読み込みされる
- **`prev` と `note` が同値の `note:update` を出さないこと。** 1 文字ごとに履歴が積まれる、または差分が履歴に残らない原因になる（#51）
