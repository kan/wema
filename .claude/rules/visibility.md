---
paths:
  - "src/board.ts"
  - "src/selection.ts"
  - "src/note.ts"
  - "src/edge.ts"
  - "tests/filter.test.ts"
---

# 付箋の非表示（折り畳みと絞り込み）

付箋と接続線の表示・非表示は `WemaBoard.recomputeVisibility()` の 1 か所で決める。

- 非表示の原因は 2 つ。折り畳み（`WemaEdge.collapsed`、データの一部）と、絞り込み（`setNoteFilter`、表示だけの状態で `noteFilter` に持つ）
- 結果は `hiddenNoteIds` に入る。SelectionManager は `isSelectable` でこれを参照し、非表示の付箋を選択しない
- 絞り込みはイベントも履歴も出さない。絞り込み中にユーザーが作成した付箋は `noteFilter` に加える。`applyRemote` で届いた付箋と Undo / Redo で復活した付箋は加えない（`historyManager.isReplaying()` で判別する。新規作成は `addNote`、再生は `addNoteWithId` を通る）
- 折り畳みの探索は、絞り込みで表示される接続線だけを対象にする。絞り込みで隠れた接続線には展開ボタンを出せないので、その折り畳みで表示対象の付箋を隠してはいけない
- 非表示になった付箋と接続線は `recomputeVisibility()` が選択から外す（見えないものを Delete で消せてしまうのを防ぐ）
- 非表示から表示へ戻した付箋は、`recomputeVisibility()` が `NoteManager.remeasure()` で計測し直す。非表示のあいだはレイアウトされず、autoSize や `foldable` の付箋のサイズを計測できないため
- 非表示の理由を増やすときも `recomputeVisibility()` に足すこと（DOM の `display` を別の場所で書き換えない）
