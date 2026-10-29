---
paths:
  - "src/note.ts"
  - "src/utils/meta.ts"
  - "src/history.ts"
  - "src/drag.ts"
  - "src/note-popup.ts"
  - "tests/note-extension.test.ts"
  - "tests/note-decoration.test.ts"
---

# 利用側のための付箋の拡張（`meta` と `renderNote`）

wema-kake の「子ページの付箋」のために足した 2 つの口（issue #53）。wema は、どちらの中身も解釈しない。

## `WemaNote.meta`

- 型は `Readonly<Record<string, string>>`。値を文字列だけにしてあるのは、付箋のコピーが `{ ...note }` の浅いコピーで行われるため。入れ子を許すと、コピーの先から中身を書き換えられる
- モデルに入れる前に必ず `normalizeMeta()`（`src/utils/meta.ts`）を通す。文字列以外の値を落とし、凍結したコピーにする。入口は `addNote` / `addNoteWithId` / `renderAll`（`stored()` 経由）と `applyParams` の 4 つ。**入口を増やしたら、そこでも通すこと**。`applyRemote()` と `importData()` の値は外から来るので、検査なしでモデルに入れない
- 凍結してあるので、モデル、イベント、履歴のデルタ、`getNote()` の戻り値が同じオブジェクトを共有してよい。`meta` のためのコピーを各所に足さないこと
- `meta` の比較は中身で行う（`sameFieldValue()`）。参照で比べると、中身が同じ `meta` を渡すたびに `prev` と `note` が同値の `note:update` が履歴に積まれる。履歴の差分（`diffKeys`）と、まとめた後の間引き（`coalesceDeltas`）の両方が使っている
- `updateNote()` は `meta` の全体を置き換える。キーごとのマージはしない（デルタの `before` / `after` が `meta` 全体を持つので、マージにすると Undo で元に戻せない）
- 複製（ポップアップの Duplicate）は `meta` を引き継がない。`board.ts` の `onDuplicate` は引き継ぐ項目を名指しで書いているので、項目を足しても自動では引き継がれない

## `renderNote` オプションと `refreshNote()`

- 付箋の要素には、本文の `.wema-note-content` と、利用側が描く `.wema-note-custom` の両方が常にある。利用側が描いた付箋は、要素に `wema-note-host-drawn` クラスが付き、CSS で本文を隠して `.wema-note-custom` を出す。本文の要素を消さないのは、多くの処理が `.wema-note-content` を前提にしているため
- **`.wema-note-custom` をクラス名だけで探さない。** 本文のサニタイズは `class` 属性を残すので、本文の中に同じクラス名の要素を書ける。本文の要素のほうが DOM で先にあるため、`querySelector('.wema-note-custom')` は本文の中の要素を返す。描画先は付箋の要素の直下（`:scope > .wema-note-custom`）から取り、ドラッグの開始判定では、親がこのボードの付箋の要素であることを確かめる（`src/drag.ts`）
- 「利用側が描いた付箋かどうか」の状態は、このクラスだけが持つ（`isHostDrawn()` はクラスを見る）。同じ情報を別の変数に持たない
- 利用側の関数を呼ぶ場所は `NoteManager.drawByHost()` の 1 か所。呼ぶのは、要素を作ったとき、`text` または `meta` を変える更新のとき、`refresh()` のとき。**移動やリサイズのたびに呼ばないこと**（ドラッグ中は pointermove ごとに更新が来る）
- 利用側の関数が例外を投げても、付箋の作成や更新を途中で止めない（`drawByHost()` が捕まえて `console.error` に出し、ふつうの付箋として扱う）。止めると、付箋がモデルに入ったのに `note:create` が出ない、`importData()` が途中で終わる、といった不整合になる
- 本文を編集できるかどうかは `isEditable()` の 1 か所で決める（readOnly、viewOnly、利用側が描いた付箋のどれかなら不可）。`contentEditable` へ反映するのは `applyEditable()` だけで、別の場所で書き換えない
- **本文のキー操作やボタンで DOM を書き換える処理は、先に `isEditable()` を確かめる。** 本文の中のチェックボックスは、本文が編集できない状態でもフォーカスを受け、そこで押したキーの `keydown` が本文の要素へ届く
- **本文の要素を読む、または書き込むときは、必ず `getTextElement(id)` を通す。** 利用側が描いた付箋では `null` を返す。隠れている本文の `innerHTML` はブラウザが正規化した値で、モデルの `text` と一致しないことがあり、そこへ書き込んでもデータに反映されない。`querySelector('.wema-note-content')` を直接使ってよいのは、表示と編集可否を決める `NoteManager` の内部（`contentElement()`）だけ
- ふつうの付箋から利用側の描画へ切り替わるときは、切り替える前に本文を blur して、編集中の内容を確定させる
- ドラッグは、ムーブハンドルに加えて `.wema-note-custom` の中からも始まる。`NO_DRAG_SELECTOR`（`src/drag.ts`）に当たる要素と、スクロールバーの上では始めない
- 入力を受ける要素（本文、`input` / `textarea` / `select`）の定義は `TYPING_SELECTOR`（`src/utils/dom.ts`）の 1 つ。フォーカスがそこにあるあいだ、ボードはキーボードショートカット（Delete、Undo、Space）とフォーカスを取らない。`NO_DRAG_SELECTOR` もこれに足して組み立てている。入力要素を別の場所で列挙しない
- `refreshNote()` は、利用側が描くかどうかが切り替わったときだけポップアップを作り直す。毎回作り直すと、ポップアップに入力中の内容（埋め込み URL）が消える
- `.wema-note-custom` の中身はサニタイズしない。wema が自分で `innerHTML` を入れることはない
- `refresh()` は、`decorateNote` も当て直す（下の節）
- `refresh()` は、付箋の下の要素（`renderNoteAccessory` と `renderNoteFooter` オプション）の描き直しも頼む。こちらは `renderNote` と違い、その場では呼ばない。`renderNoteFooter` は、積んでいる間だけ描く（`.claude/rules/stacked.md` の「付箋の下に利用側が描く要素」）

## `decorateNote` オプションと `refreshNoteDecoration()`

wema-kake の「古い付箋ほど薄くする」（wema-kake #27）のために足した口。付箋の要素（`.wema-note`）に、利用側の class と inline style を当てる。wema は中身を解釈しない。

- 当てる処理は `NoteManager.decorate()` の 1 か所。呼ぶのは次のとき
  - 要素を作ったとき（`renderNote()`）
  - `text` または `meta` を変える更新（`applyParams()` と、入力の確定の `syncNoteContent()`）
  - `refresh()` と `refreshNoteDecoration()`（`decorate()` / `decorateAll()`）
- **移動やリサイズのたびに呼ばないこと**（`renderNote` と同じ理由）
- `renderNote` と同じく、その場で（同期で）呼ぶ。付箋の下の要素のようにマイクロタスクへ回していないのは、戻り値を要素へ当てるだけで、ボードへの問い合わせを前提にしていないため。README に「関数の中で `new WemaBoard()` の戻り値を読まない」と書いてある
- **前回当てた分は、`decorations`（要素をキーにした `WeakMap`）が持つ。** 当て直すときは、そこにある class と style のプロパティだけを外す。要素ごと消えれば記録も消えるので、削除や `clear()` で片付ける処理は要らない。要素の class や style を見て「利用側が当てたもの」を推測しないこと
- **wema 自身の class と style は、利用側に当てさせない。** 当てさせると、外すときに wema のものまで外れる。class は `wema-` で始まる名前を捨てる。style は 2 種類を捨てる
  - wema が付箋の要素へインラインで書くプロパティ（`BOARD_STYLE_PROPERTIES`。`applyStyles()` の `left` / `top` / `width` / `height` / `z-index` と、非表示の `display`）と、それらを一緒に書き換える一括指定（`inset` と `inset-*`、`block-size` / `inline-size`、`all`）。一括指定を通すと、外すときに `removeProperty()` が wema の値まで消す。判定の前に、カスタムプロパティ以外の名前を小文字にする（`setProperty()` は大文字の名前も受け付ける）
  - `--wema-` で始まるカスタムプロパティ
- **付箋の要素へインラインで書くプロパティを増やしたら、`BOARD_STYLE_PROPERTIES` にも足す**
- 例外は捕まえて `console.error` に出し、その付箋には何も当てない（前回の分も外す）。付箋の作成や更新を止めない
- データは変えない。イベントと履歴は出さない。計測はし直さない（当てた見た目で大きさを変えないことは、利用側の約束として README に書いてある）
