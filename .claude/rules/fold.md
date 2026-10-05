---
paths:
  - "src/note.ts"
  - "src/board.ts"
  - "src/resize.ts"
  - "src/style.css"
  - "tests/fold.test.ts"
---

# 長い本文を畳む付箋（`foldable`）

`WemaNote.foldable` が `true` の付箋は、本文が 3 行以上のときに冒頭だけを表示し、本文の下のリンクで開閉する。

## 用語

- **この機能を「折り畳み」とだけ書かない。** wema で「折り畳み」「collapsed」は、接続線の部分木を隠す機能（`WemaEdge.collapsed`、`.claude/rules/visibility.md`）を指す。こちらは `foldable` / fold と書き、識別子に `collapse` を使わない
- 付箋の要素に付くクラスは 3 つ。`wema-foldable`（フラグが ON）、`wema-fold-long`（本文が長く、リンクを出す）、`wema-folded`（閉じている）

## 状態の持ち方

- フラグ `foldable` はデータ。`note:update`、履歴、`exportData()`、`applyRemote()` を通る。`NOTE_UPDATE_KEYS`（`src/history.ts`）に入っている
- **開いているかどうかは表示だけの状態で、`NoteManager.unfolded` が持つ。** データに入れない。イベントも履歴も出さない。`WemaNote` に開閉の項目を足さない。付箋は閉じた状態で始まり、`foldable` を ON にし直したときも閉じる
- 本文を編集しているあいだ（`editingId`）は、閉じている付箋も開いて表示する。キャレットが隠れた行へ入らないようにするため
- 開閉のリンクは readOnly / viewOnly でも働く。データを変えない操作なので、モードで止めない

## 高さ

- `foldable` の付箋の高さは、autoSize の付箋のサイズと同じ「計測する値」。CSS（`.wema-note.wema-foldable` の `height: auto`）が高さを決め、`applyMeasuredSize()` がモデルの `height` へ写す。計測の規則は `.claude/rules/autosize.md` に従う（開閉による高さの変化は `note:update` を出さず、`onMeasure` で接続線の再描画と `change` だけを行う）
- 幅は計測しない（autoSize でもある付箋を除く）。リサイズハンドルで変えられるのは幅だけ
- **表示の状態を決める場所は `applyFold()` の 1 か所で、必ず計測の直前に呼ばれる**（`applyMeasuredSize()` の先頭）。クラスを別の場所で付け外しすると、モデルの `height` と表示がずれる。例外は `openHeight()` だけで、`foldable` を OFF にする直前に、開いた状態の高さを測るためにクラスを外す
- `applyFold()` は、`foldable` でなく `wema-fold-long` も付いていない付箋では何もしない。`applyMeasuredSize()` はリサイズのドラッグ中の pointermove ごとに、ふつうの付箋でも呼ばれるため
- 「長い」の判定（`isLongText()`）は、開いた状態の本文の高さで行う。閉じた状態で測ると、切り詰めた高さを測ってしまう
- 閉じたときに見せる行数は、`FOLD_LINES`（`src/note.ts`）と CSS の `.wema-folded` の両方にある。変えるときは両方を変える
- `foldable` を OFF にしたときは、本文の全体が収まる高さ（`openHeight()`）をモデルに入れる。入れないと、閉じた高さのまま固定の付箋になる。レイアウトされていない付箋では測れないので、そのときの `height` のまま残る（既知の制限）
- 利用側が描いた付箋（`renderNote`）は畳まない。CSS でも `:not(.wema-note-host-drawn)` で外している。「高さが計測値かどうか」は `foldable` だけでは決まらないので、`NoteManager.hasMeasuredHeight()` で調べる（リサイズハンドルが高さを変えるかどうかの判定に使っている）
- **レイアウトされていない付箋（接続線の折り畳みや絞り込みで非表示、DOM から外れている）では、`applyFold()` は表示の状態を変えない。** 本文の高さが 0 になり、長さを判定できないため。再表示のときに `recomputeVisibility()` が `NoteManager.remeasure()` を呼び、非表示のあいだの変更を計測し直す
- 計測でサイズが直前の `note:update` の値へ戻ったら（開いて閉じた）、`unreportedSizeBase` を消す。残すと、`prev` と `note` が同値の `note:update` が出る

## 開閉のリンク

- リンクは、`unfolded` ではなく、いま表示している状態（`wema-folded` クラス）を反転する。編集中で一時的に開いている付箋のリンクは「閉じる」になる
- リンクの `mousedown` は `preventDefault()` する。フォーカスが移るブラウザでは、押した瞬間に本文が blur して付箋が閉じ、リンクが動いて `click` が届かなくなる。編集の終了は、`click` の処理の中で本文を blur して行う

## テスト

- jsdom はレイアウトを計算しない。テストでは本文の `scrollHeight` と付箋の `offsetHeight` を差し替える（`tests/fold.test.ts` の `setLayout()`）。見た目（行数、フェード、リンクの位置）を変えたら、実ブラウザでも確認する
