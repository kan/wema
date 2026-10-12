---
paths:
  - "src/board.ts"
  - "src/note.ts"
  - "src/animation.ts"
  - "src/selection.ts"
  - "src/anchor-drag.ts"
  - "src/style.css"
  - "tests/stacked.test.ts"
---

# 表示だけの縦積み（`setStacked()`）

`stacked` オプションと `setStacked()` で入る表示の状態（issue #69）。付箋を縦 1 列に積んで描くが、付箋のデータ（`x` / `y` / `width` / `height`）は変えない。保存や同期をしている利用側（wema-kake）が、狭い画面で読ませるために使う。データごと積む `stackNotes()`（`.claude/rules/move-animation.md`）とは別の機能。

## 状態

- 表示だけの状態（絞り込み、表示位置、`pageScroll` と同じ扱い）。`note:*` / `edge:*` / `history:commit` / `change` を出さず、`exportData()` にも含めない。readOnly / viewOnly でも切り替えられる
- 積み方（`x` / `y` / `width` / `gap` / `order`）は `WemaBoard.stack` が持つ。`null` なら積んでいない。`duration` は `setStacked()` の第 2 引数で受け、その呼び出しだけに使う（`setStacked(null, { duration })` で、列から出るときにも渡せるようにするため。積み方の中に入れない）
- `pageScroll` とは独立。片方だけでも使える
- **縦積みのために `updateNote()` を呼ばないこと。** 呼ぶと `note:update` と `history:commit` が出て、スマートフォンで開いただけで、保存してある配置が変わる（この機能を足した理由）

## 描く位置は 3 層

付箋を描く位置は `NoteManager.applyStyles()` が、次の順で決める。

1. `shownRects`: アニメーションの途中の位置（`.claude/rules/move-animation.md`）
2. `placedRects`: 表示のために置いた位置（縦積み）
3. モデル（`notes`）

- `placedRects` に書き込むのは `NoteManager.placeNotes()` だけで、呼ぶのは `WemaBoard.restack()` だけ
- **描いている位置を読むときは、モデルではなく次の 2 つを使う。** `getShownNote()`（いま描いている位置。アニメーションの途中を含む）と `getPlacedNote()`（動き終わったあとの位置。アニメーションの終点）。積んでいないときは、どちらもモデルと同じ値を返す
  - 接続線、付箋のポップアップ、埋め込み URL の入力欄、ラバーバンド選択の当たり判定、アンカーからの仮の線は `getShownNote()` を読む
  - 範囲の計算（`visibleBounds()`。`revealNotes()` / `centerContent()` / `fitToContent()` / パンの制限が使う）とページの高さ（`lowestBottom()`）は、置いた位置を読む
  - **付箋の位置を読む処理を足すときは、「データの位置」と「描いている位置」のどちらが要るかを決める。** 画面の上のもの（当たり判定、重ねて出すもの、スクロール先）は描いている位置、データへ書き込む値の元にするものはモデル
- `placedRects` の `height` は、置いたときに読んだ表示の高さ。高さが変わったら積み直すので、古くならない

## 幅と計測

- 置いた付箋の要素には `wema-note-placed` クラスが付く（`applyStyles()`）。`autoSize` の付箋は、CSS の `width: max-content !important` が外れ、インラインの幅になる（`style.css` の `.wema-note.wema-auto-size:not(.wema-note-placed)`）
- **モデルの `width` / `height` は、モデルの幅で測った値のまま保つ。** `atModelWidth()` が、クラスを外して幅をモデルの値へ差し替えてから測り、戻す。`applyMeasuredSize()`、`resizeToContent()`、`openHeight()`（`foldable` を OFF にするときの高さ）はここを通る。計測の経路を足すときも通す。通さないと、列の幅での高さがモデルに入り、`note:update` と履歴に載る
  - `atModelWidth()` は、幅を戻したあとに `applyFold()` を呼び直す。`foldable` の「長い」の判定は幅で変わるので、表示の状態（`wema-fold-long` / `wema-folded`）を、描いている幅のものにするため
- **要素の大きさを読むのは、スタイルシートが大きさを決める付箋だけ**（`isSizedByContent()`。`applyMeasuredSize()`、`readMeasuredSize()`、`getShownNote()`、`heightAtWidth()` が見る）。利用側が描いた `foldable` の付箋は、要素にインラインの高さがそのまま出る。置いているあいだ、その値は置いたときの高さなので、モデルへ読み戻すと `updateNote({ height })` や `applyRemote()` の高さを取り消す。`isMeasured()`（`foldable` というフラグだけを見る）に戻さないこと。`openHeight()` も、利用側が描いた付箋では測らない
- 列の計算に使う高さは、`placeNotes()` が「幅を当てる → 高さを読む → 位置を決める」の順で読む（`stackNotes()` と同じ 2 段）。高さを計測する付箋は要素から読み、それ以外はモデルの `height` を使う

## 積み直すきっかけ

`WemaBoard.restack()` が、表示中の付箋を `computeStackLayout()` で並べ、`placeNotes()` に渡す。

- `setStacked()`（その場で。`duration` があればアニメーションする）
- `recomputeVisibility()` の末尾（`scheduleRestack()`）。付箋の作成と削除、絞り込み、折り畳み、`importData()` はここを通る。非表示の付箋は列に入れず、`placedRects` からも外す
- `note:update` のリスナー（`scheduleRestack()`）。データの位置や大きさ、本文が変わると、列の順番や高さが変わる
- `onPlacedMeasure`（`scheduleRestack()`）。`NoteManager.measure()` が、置いてある付箋を計測して、描いている高さが `placedRects` の値と違ったときに呼ぶ。**モデルの大きさが変わったかどうかでは判定しない。** 描いている幅での高さだけが変わることがあるため（`onMeasure` は、モデルの大きさが変わったときしか呼ばれない）

`scheduleRestack()` はマイクロタスクで 1 回にまとめる（`applyRemote()` や `batch()` で多くの付箋が一度に変わるため。その場で積み直すと、付箋を N 枚足すたびに全体を N 回積み直す）。描く前に済むので、積み直す前の状態は表示されない。**描いている位置をその場で読む処理は、先に `flushRestack()` を呼ぶ**（`visibleBounds()` が呼んでいる。作ったばかりの付箋へ `revealNotes()` するとき、列に入る前の位置を読まないため）。

- `placeNotes()` が描き直す（`applyStyles()` と `applyFold()`）のは、新しく置く付箋と、置く幅が変わる付箋だけ。入力のたびに呼ばれるので、全部の付箋を描き直さない。それ以外の付箋は高さを読むだけにして、読み書きを交互にしない。本文が変わった付箋の `foldable` の表示は、計測（`atModelWidth()`）が直している

- 積み直しは `animateNotes()` を通す。接続線、ページの高さ、ポップアップ類の追従（`followShownNotes()`）と、ページの高さを縮めるのを待つ処理（`holdsPageHeight`）を共有するため。`change` は、`note:update` を伴わずに描き直した付箋の ID を返す
- アニメーションの終点は `getPlacedNote()` から読む（`NoteAnimator.tick()` と `animateNotes()`）。`getNote()` に戻すと、積んでいる間の移動が、データの位置へ向かう
- **ボードによる積み直し（`scheduleRestack()` からの `restack()`）は、`animateNotes()` に付箋の ID を渡さない。** 渡すと、`duration` の無い移動として、動いている途中の付箋が全部その場で終点へ飛ぶ（`setStacked()` のアニメーション中に、色の変更や計測が 1 回起きただけで起きる）。終点はフレームごとに読むので、動いている付箋は新しい列の位置へそのまま向かう。全部の ID を渡すのは `setStacked()` だけ
- 動いている途中の付箋（`shownRects` がある）の高さは、置く幅に差し替えて読む（`heightAtWidth()`）。途中の幅で読むと、その高さで列が決まり、動き終わっても直らない
- `placeNotes()` は、列から外した付箋を、位置が変わらなくても描き直す（`released`）。描き直さないと `wema-note-placed` クラスが残り、`autoSize` の付箋が自分の幅に戻らない
- 接続線の折り畳みボタンの辺（`updateNoteCollapseBtns()`）は、`getPlacedNote()` から決める。積み直しで付箋が動いたら、`restack()` が呼び直す
  - 積んでいる間、接続線の片方が列に置かれていない（折り畳みで非表示）ときは、両方が列にあったときの辺をそのまま使う（`stackedSides` が覚える。`isPlaced()` で見分ける）。一度も列に並んだことのない接続線は `bottom` にする。置かれていない付箋は `getPlacedNote()` がモデルの位置を返すので、列の位置と混ぜて辺を決めると、折り畳んだ瞬間にバッジが別の辺へ移る
- **積んでいる間は、モデルの位置や大きさが変わっても、アニメーションをやめない。** モデルの位置は画面に出ていないので、やめると、他のクライアントのドラッグが届くたびに、列へ移動中の付箋が終点へ跳ぶ。止めている場所は 2 つ
  - `note:update` のリスナー（`this.stack` があれば `cancel()` しない）
  - データを動かすメソッド（`applyMoves()` と `stackNotes()`）。`movedOnScreen()` を通して、`animateNotes()` に渡す ID を空にする。データを動かすメソッドを足すときも、ここを通す。積んでいる間、これらのメソッドの `duration` は使われない（データの変更で列が変わる分は、続く積み直しで、すぐに反映する）

## 操作

- **積んでいる間は、付箋のドラッグとリサイズを始めない**（`DragManager` と `ResizeManager` の `getReadOnly`）。描いている位置とデータの位置が別で、動かした結果を写すデータ上の位置が無いため。リサイズハンドルとムーブハンドルは CSS でも隠す（`.wema-board.wema-stacked`。ムーブハンドルは `visibility: hidden` で、高さを残す）。列の中の並べ替えとして扱う案は見送っている（並び順をデータと利用側の `order` のどちらに持つかを決める必要がある）
- 選択、本文の編集、付箋と接続線の作成と削除、ポップアップは通常どおり
- **ボードが位置を決める付箋のデータ上の位置は、`newNotePlace()` の 1 か所で決める。** 積んでいる間は、全部の付箋（非表示を含む）のある範囲の左下（下端 + `STACKED_NEW_NOTE_GAP`）。広い画面で他の付箋と重ならず、列では最後に並ぶ。ダブルクリック、位置を省略した `addNote()`、複製、引用、アンカーから空いている場所へのドロップが通る。**画面の座標（`clientToBoard()` の結果）や元の付箋の隣を、積んでいる間のデータの位置に使わないこと。** 位置を渡した `addNote()` は、その値をそのまま入れる
  - ダブルクリック、複製、アンカーからのドロップは、積んでいる間、作った付箋を `revealNotes()` で見える位置へ出す（列の最後にできるため）。引用は、積んでいなくても出す
- `moveNotes()` / `stackNotes()` / `alignNotes()` / Undo は、これまでどおりデータを変える。表示は列のままで、`note:update` から積み直しが走る

## テスト

- jsdom はレイアウトを計算しない。`tests/stacked.test.ts` は、付箋の要素の `offsetHeight` を「描いている幅」から決まる値に差し替えて、表示の高さとモデルの高さを分けて確かめる（`setLayout()`）
- 見た目（`foldable` のリンク、`autoSize` の付箋の幅、ページの高さ、接続線）を変えたら、実ブラウザでも確認する。見るのは、幅 375px での `pageScroll` との併用、`foldable` の開閉、入力中の積み直し、付箋の追加、`setStacked(null)` で元の配置に戻ること
