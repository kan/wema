---
paths:
  - "src/animation.ts"
  - "src/note.ts"
  - "src/board.ts"
  - "src/edge.ts"
  - "tests/move.test.ts"
---

# 付箋の移動のアニメーション（`moveNotes()` と `duration`）

`moveNotes()` / `alignNotes()` / `distributeNotes()` / `autoLayout()` / `stackNotes()` は、`options.duration` を渡すと、付箋と接続線を新しい位置までアニメーションで動かす（issue #62）。

## モデルは最初から終点、動くのは表示だけ

- **モデル（`NoteManager.notes`）は、呼び出した時点で終点の値にする。** `note:update`、履歴、`change` は、そのときの 1 回だけ。アニメーションの終わりに確定する処理は無い。途中で打ち切っても、やり残しが出ない
- **終点で `updateNote()` を呼ぶ方式に変えないこと。** `batch()` は同期の関数しか受け取れないので、終点での確定は Undo 1 回分にまとめられない。途中の Undo、ドラッグ、`exportData()` の値も一貫しなくなる
- アニメーションの途中の位置は `NoteManager.shownRects` が持つ。`applyStyles()` は、これがあればモデルの代わりに使う。書き込むのは `setShownRect()` だけで、呼ぶのは `NoteAnimator`（`src/animation.ts`）だけ
- 補間の終点は、フレームごとに `getPlacedNote()` から読む（`NoteAnimator.tick()`）。計測で高さの変わる付箋があるため、開始時の値を控えない。`getPlacedNote()` はモデルの値を返す。表示だけの縦積み（`setStacked()`）の間だけ、列の中の位置を返す（`.claude/rules/stacked.md`）

## 接続線と計測

- **接続線のパスは `getShownNote()` から計算する**（`EdgeManager.updateEdgePath()`）。`getNote()` に戻すと、接続線だけが終点へ先に飛ぶ。フレームごとの再描画は `WemaBoard.followShownNotes()` が行う
- フレームごとの接続線の再描画は `EdgeManager.updateEdgesOfNotes()` でまとめて行う。接続線を 1 回だけ走査し、付箋の表示位置を先に全部読んでから、パスを書く。付箋ごとに `updateEdgesOf()` を呼ぶ形へ戻さないこと（動く付箋の数 × 接続線の数の走査になり、計測する付箋では読み書きが交互になる）
- 付箋の隣に出すもの（付箋のポップアップ、埋め込み URL の入力欄）も `getShownNote()` から位置を決める。本文の選択や画像に付くもの（文字のツールバー、画像の上のボタン）は、要素の位置から求めるので、そのままついていく
- 高さを計測で決める付箋（`autoSize` / `foldable`）の途中の大きさは、`getShownNote()` が要素から読む（CSS が大きさを決めていて、`shownRects` の値は使われないため）
- **計測は、モデルの幅で行う。** 途中の幅で測ると、その高さがモデルに入る。`applyMeasuredSize()` は、表示の幅がモデルと違うあいだ、幅をモデルの値に差し替えてから測り、戻す（`atModelWidth()`）

## アニメーションをやめる条件

- 同じ付箋をもう一度動かしたときは、いま表示している位置（`getShownNote()`）を起点にして、新しい終点へ向かう
- `duration` が無い移動、または結果が今の表示と同じ移動は、アニメーションをやめる（`animateNotes()` の末尾）
- 規則は 1 つ。**モデルの位置か大きさが書かれたら、`note:update` のリスナーがその付箋のアニメーションをやめる**（ドラッグ、リサイズ、Undo / Redo、`updateNote()`、`applyRemote()`）。位置と大きさ以外（色、本文）の更新ではやめない
- アニメーションする移動も、この規則でいったんやめさせられる。`animateNotes()` は、`change` を実行する前に起点（表示位置）を控えておき、実行のあとで始め直す。同じ同期処理の中なので、あいだの状態は描画されない。**「移動中はやめない」ためのフラグを足さないこと**（`holdsPageHeight` は別の目的のフラグで、ページの高さを縮めるのを待たせるだけ。`.claude/rules/page-scroll.md`）
- **アニメーションする処理を足すときは、動かす付箋の ID をすべて `animateNotes()` の `noteIds` に渡す。** 渡さなかった付箋は、起点が控えられず、終点へ一瞬で移る。位置や大きさは `change` の中で `setNoteRects()` を通して変える
  - 例外は、表示だけの縦積みをボードが積み直すとき（`restack()`）。アニメーションしない積み直しなので ID を渡さない。渡すと、動いている途中の付箋が止まる（`.claude/rules/stacked.md`）
- `importData()` と `destroy()` は `NoteAnimator.clear()` を呼ぶ。付箋の削除は、次のフレームで外れる
- `prefers-reduced-motion: reduce` のときは、`duration` を無視する

## モードと履歴

- `moveNotes()` と `stackNotes()` は、`updateNote()` と同じく参照モード（viewOnly）でも通る。止めるのは readOnly だけ。`alignNotes()` / `distributeNotes()` / `autoLayout()` は、どちらのモードでも何もしない（既存の挙動を変えない）
- 参照モードで記録を止めているのは `x` / `y` だけ（`.claude/rules/sync.md`）。`width` と `height` の変更は、参照モードでも履歴に積まれ、終了時に戻らない
- `setNoteRects()` は、値が変わらないキーを `updateNote()` に渡さない。`prev` と `note` が同値の `note:update` を出さないため
- 同じ理由で、計測で決まる大きさも渡さない（`autoSize` の付箋の `width` と `height`、高さを計測する付箋の `height`）。渡すと、`updateNote()` がその場で計測し直して元の値へ戻し、同値の `note:update` が出る
- `followShownNotes()` を呼ぶのは、表示位置がモデルと違うものになった付箋（アニメーションを始めた、またはやめた）があるときだけ。`duration` の無い移動では、`note:update` のリスナーが接続線を描き直し済みなので呼ばない

## `stackNotes()`

- 「幅を当てる → 高さを測る → 積む」の 2 段で行う。`updateNote({ width })` がその場で計測するので、2 段目の `computeStackLayout()` は新しい幅での高さを読める
- 非表示の付箋（絞り込み、接続線の折り畳み）は、`noteIds` で指定されても動かさない。レイアウトされず、高さを測れないため
- `stackNotes()` で積んだことを、ボードは覚えない。積んだあとの高さの変化には、利用側が `note:measure` を受けて `stackNotes()` を呼び直す（issue #68。README の「高さが変わったときに積み直す」）。**`stackNotes()` に、積み方を覚えて自動で積み直す仕組みを足さないこと。** 積み直しはデータを変えるので、付箋を開いただけで `note:update` と履歴が出る
- 積み方を覚えて積み直すのは、データを変えない `setStacked()` のほう（`.claude/rules/stacked.md`）。2 つを混ぜない

## テスト

- `tests/move.test.ts` は、`requestAnimationFrame` と `performance` を `vi.useFakeTimers()` で差し替えて、時間を進める
- jsdom はレイアウトを計算しない。補間の見た目や、計測する付箋の途中の高さを変えたら、実ブラウザでも確認する
