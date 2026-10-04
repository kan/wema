---
paths:
  - "src/history.ts"
  - "src/board.ts"
  - "src/note.ts"
  - "src/edge.ts"
  - "src/types.ts"
  - "tests/history.test.ts"
  - "tests/sync.test.ts"
---

# 同期（`history:commit` / `applyRemote`）

- `HistoryDelta`（`src/types.ts`）は HistoryManager が作る差分で、Undo 1 回分 = `history:commit` 1 回
- `update` の `after` にキーがなく `before` にあるものは「未設定に戻す」。JSON で `undefined` のキーが消えるための規則で、`replayDeltas`（`src/history.ts`）が復元する
- Undo / Redo の再生と `applyRemote` は同じ `replayDeltas` を通り、どちらも `historyManager.withoutRecording()` の中で実行するので履歴に積まれない。`origin` は `createReplay(origin)` が NoteManager / EdgeManager のメソッドへ引数で渡す（可変の状態として持たない）
- `commitPending()` は確定時に `coalesceDeltas` で同じ付箋・接続線への更新を 1 件にまとめる（ドラッグ中の pointermove ごとの差分をそのまま `history:commit` に載せないため）。間に作成・削除を挟む更新はまとめない
- 参照モード（viewOnly）中は `historyManager.setIgnoredKeys(['x', 'y'], ['collapsed'])` で、終了時に復元するキーだけ記録を止める（text など復元しないキーは記録する）。終了時の復元も記録しない。`undo()` / `redo()` は何もしない
- `applyRemote` は参照モードの復元用スナップショット（`positionSnapshot` / `collapsedEdgeSnapshot`）も更新する。更新しないと、終了時の復元でリモートの変更を巻き戻してしまう。参照モード中の `importData()` も、同じ理由でスナップショットを取り直す（`snapshotForViewOnly()`）
- `zIndex` はローカルな表示状態。`bringToFront` はイベントも履歴も出さない
- `change` は必ず `scheduleChange()` 経由で発火し、`data` に `exportData()` の結果を入れる
- `exportData()` は編集中の DOM の内容を返すが、モデルの `text` は書き換えない（`getNotesWithLiveText()`）。書き換えると blur 時に差分が出ず、編集が履歴にも `history:commit` にも載らなくなる
