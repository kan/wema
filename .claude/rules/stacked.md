---
paths:
  - "src/board.ts"
  - "src/note.ts"
  - "src/animation.ts"
  - "src/selection.ts"
  - "src/anchor-drag.ts"
  - "src/style.css"
  - "tests/stacked.test.ts"
  - "tests/note-footer.test.ts"
  - "tests/note-accessory.test.ts"
  - "src/note-links.ts"
  - "tests/note-links.test.ts"
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
  - 接続線、ラバーバンド選択の当たり判定、アンカーからの仮の線は `getShownNote()` を読む。付箋のポップアップは `getShownBox()`（付箋の下に利用側が描いた要素を含む箱）を読み、埋め込み URL の入力欄は、そのポップアップを置いた結果の箱（`boxWith()`）に付く
  - 範囲の計算（`visibleBounds()`。`revealNotes()` / `centerContent()` / `fitToContent()` / パンの制限が使う）とページの高さ（`lowestBottom()`）は、置いた位置を読む
  - **付箋の位置を読む処理を足すときは、「データの位置」と「描いている位置」のどちらが要るかを決める。** 画面の上のもの（当たり判定、重ねて出すもの、スクロール先）は描いている位置、データへ書き込む値の元にするものはモデル
- `placedRects` の `height` は、置いたときに読んだ表示の高さ。高さが変わったら積み直すので、古くならない

## 幅と計測

- 置いた付箋の要素には `wema-note-placed` クラスが付く（`applyStyles()`）。`autoSize` の付箋は、CSS の `width: max-content !important` が外れ、インラインの幅になる（`style.css` の `.wema-note.wema-auto-size:not(.wema-note-placed)`）
- **モデルの `width` / `height` は、モデルの幅で測った値のまま保つ。** `atModelWidth()` が、クラスを外して幅をモデルの値へ差し替えてから測り、戻す。`applyMeasuredSize()`、`resizeToContent()`、`openHeight()`（`foldable` を OFF にするときの高さ）はここを通る。計測の経路を足すときも通す。通さないと、列の幅での高さがモデルに入り、`note:update` と履歴に載る
  - `atModelWidth()` は、幅を戻したあとに `applyFold()` を呼び直す。`foldable` の「長い」の判定は幅で変わるので、表示の状態（`wema-fold-long` / `wema-folded`）を、描いている幅のものにするため
- **要素の大きさを読むのは、スタイルシートが大きさを決める付箋だけ**（`isSizedByContent()`。`applyMeasuredSize()`、`readMeasuredSize()`、`getShownNote()`、`sizesAtWidth()` が見る）。利用側が描いた `foldable` の付箋は、要素にインラインの高さがそのまま出る。置いているあいだ、その値は置いたときの高さなので、モデルへ読み戻すと `updateNote({ height })` や `applyRemote()` の高さを取り消す。`isMeasured()`（`foldable` というフラグだけを見る）に戻さないこと。`openHeight()` も、利用側が描いた付箋では測らない
- 列の計算に使う高さは、`placeNotes()` が「幅を当てる → 高さを読む → 位置を決める」の順で読む（`stackNotes()` と同じ 2 段）。高さを計測する付箋は要素から読み、それ以外はモデルの `height` を使う

## 積み直すきっかけ

`WemaBoard.restack()` が、表示中の付箋を `computeStackLayout()` で並べ、`placeNotes()` に渡す。

- `setStacked()`（その場で。`duration` があればアニメーションする）
- `recomputeVisibility()` の末尾（`scheduleRestack()`）。付箋の作成と削除、絞り込み、折り畳み、`importData()` はここを通る。非表示の付箋は列に入れず、`placedRects` からも外す
- `note:update` のリスナー（`scheduleRestack()`）。データの位置や大きさ、本文が変わると、列の順番や高さが変わる
- `onPlacedMeasure`（`scheduleRestack()`）。`NoteManager.measure()` が、置いてある付箋を計測して、描いている高さが `placedRects` の値と違ったときに呼ぶ。**モデルの大きさが変わったかどうかでは判定しない。** 描いている幅での高さだけが変わることがあるため（`onMeasure` は、モデルの大きさが変わったときしか呼ばれない）
- `onUnderChange`（`scheduleRestack()`）。付箋の下に利用側が描く要素を描き直すとき、またはその高さが変わったとき（下の「付箋の下に利用側が描く要素」）

`scheduleRestack()` はマイクロタスクで 1 回にまとめる（`applyRemote()` や `batch()` で多くの付箋が一度に変わるため。その場で積み直すと、付箋を N 枚足すたびに全体を N 回積み直す）。描く前に済むので、積み直す前の状態は表示されない。**描いている位置をその場で読む処理は、先に `flushPending()` を呼ぶ**（`visibleBounds()` が呼んでいる。作ったばかりの付箋へ `revealNotes()` するとき、列に入る前の位置を読まないため）。

- `placeNotes()` が描き直す（`applyStyles()` と `applyFold()`）のは、新しく置く付箋と、置く幅が変わる付箋だけ。入力のたびに呼ばれるので、全部の付箋を描き直さない。それ以外の付箋は高さを読むだけにして、読み書きを交互にしない。本文が変わった付箋の `foldable` の表示は、計測（`atModelWidth()`）が直している

- 積み直しは `animateNotes()` を通す。接続線、ページの高さ、ポップアップ類の追従（`followShownNotes()`）と、ページの高さを縮めるのを待つ処理（`holdsPageHeight`）を共有するため。`change` は、`note:update` を伴わずに描き直した付箋の ID を返す
- アニメーションの終点は `getPlacedNote()` から読む（`NoteAnimator.tick()` と `animateNotes()`）。`getNote()` に戻すと、積んでいる間の移動が、データの位置へ向かう
- **ボードによる積み直し（`scheduleRestack()` からの `restack()`）は、`animateNotes()` に付箋の ID を渡さない。** 渡すと、`duration` の無い移動として、動いている途中の付箋が全部その場で終点へ飛ぶ（`setStacked()` のアニメーション中に、色の変更や計測が 1 回起きただけで起きる）。終点はフレームごとに読むので、動いている付箋は新しい列の位置へそのまま向かう。全部の ID を渡すのは `setStacked()` だけ
- 動いている途中の付箋（`shownRects` がある）の高さは、置く幅に差し替えて読む（`sizesAtWidth()`）。差し替えは全部の付箋をまとめて行う（幅を書く → 全部読む → 幅を戻す）。付箋ごとに書いて読むと、付箋の数だけレイアウトの計算が走る。途中の幅で読むと、その高さで列が決まり、動き終わっても直らない
- `placeNotes()` は、列から外した付箋を、位置が変わらなくても描き直す（`released`）。描き直さないと `wema-note-placed` クラスが残り、`autoSize` の付箋が自分の幅に戻らない
- 接続線の折り畳みボタンの辺（`updateNoteCollapseBtns()`）は、`getPlacedNote()` から決める。積み直しで付箋が動いたら、`restack()` が呼び直す
  - 積んでいる間、接続線の片方が列に置かれていない（折り畳みで非表示）ときは、両方が列にあったときの辺をそのまま使う（`stackedSides` が覚える。`isPlaced()` で見分ける）。一度も列に並んだことのない接続線は `bottom` にする。置かれていない付箋は `getPlacedNote()` がモデルの位置を返すので、列の位置と混ぜて辺を決めると、折り畳んだ瞬間にバッジが別の辺へ移る
- **積んでいる間は、モデルの位置や大きさが変わっても、アニメーションをやめない。** モデルの位置は画面に出ていないので、やめると、他のクライアントのドラッグが届くたびに、列へ移動中の付箋が終点へ跳ぶ。止めている場所は 2 つ
  - `note:update` のリスナー（`this.stack` があれば `cancel()` しない）
  - データを動かすメソッド（`applyMoves()` と `stackNotes()`）。`movedOnScreen()` を通して、`animateNotes()` に渡す ID を空にする。データを動かすメソッドを足すときも、ここを通す。積んでいる間、これらのメソッドの `duration` は使われない（データの変更で列が変わる分は、続く積み直しで、すぐに反映する）

## 操作

- **積んでいる間は、付箋のドラッグとリサイズを始めない**（`DragManager` と `ResizeManager` の `getReadOnly`）。描いている位置とデータの位置が別で、動かした結果を写すデータ上の位置が無いため。リサイズハンドルとムーブハンドルは CSS でも隠す（`.wema-board.wema-stacked`。ムーブハンドルは `visibility: hidden` で、高さを残す）。列の中の並べ替えとして扱う案は見送っている（並び順をデータと利用側の `order` のどちらに持つかを決める必要がある）
- **積んでいる間は、接続線を表示しない**（`style.css` の `.wema-board.wema-stacked .wema-edges`）。縦 1 列では、離れた付箋をつなぐ線が間の付箋の裏を通り、隙間に切れ端と矢印の頭だけが見える。隣どうしの線も、隙間（16px）がベジェ曲線の制御点の距離（40px 以上）より短く、折り返す
  - 隠すのは CSS だけ。パスの計算（`getShownNote()` を読む）は続けるので、`setStacked(null, { duration })` で列から出るとき、線は付箋と一緒に動く
  - アンカー（`.wema-anchor`）も隠す。仮の線が同じ SVG の中にあり、ドラッグしても何も見えないため。API（`addEdge()` など）はそのまま働く
  - 折り畳みのボタンは、バッジ（`wema-note-collapse-badge`。折り畳み済み）だけを残す。消すと、隠れた付箋を列の中から開けない
  - `setStacked()` は、列へ入るとき、接続線の選択を外してポップアップを閉じる
  - 線を左の余白に通して関係を見せる案は見送っている（線を通す幅を付箋から削る必要があり、線の多いボードでは 375px に収まらない）
- 選択、本文の編集、付箋の作成と削除、ポップアップは通常どおり
- **ボードが位置を決める付箋のデータ上の位置は、`newNotePlace()` の 1 か所で決める。** 積んでいる間は、全部の付箋（非表示を含む）のある範囲の左下（下端 + `STACKED_NEW_NOTE_GAP`）。広い画面で他の付箋と重ならず、列では最後に並ぶ。ダブルクリック、位置を省略した `addNote()`、複製、引用、アンカーから空いている場所へのドロップが通る。**画面の座標（`clientToBoard()` の結果）や元の付箋の隣を、積んでいる間のデータの位置に使わないこと。** 位置を渡した `addNote()` は、その値をそのまま入れる
  - ダブルクリック、複製、アンカーからのドロップは、積んでいる間、作った付箋を `revealNotes()` で見える位置へ出す（列の最後にできるため）。引用は、積んでいなくても出す
  - アンカーは積んでいる間は隠しているので、アンカーからのドロップは、いまは画面の操作では起きない。アンカーを再び出すときのために、`newNotePlace()` を通す処理は残している
- `moveNotes()` / `stackNotes()` / `alignNotes()` / Undo は、これまでどおりデータを変える。表示は列のままで、`note:update` から積み直しが走る

## 付箋の下に利用側が描く要素（`renderNoteAccessory` と `renderNoteFooter`）

付箋の枠の下に、利用側が描く場所が 2 つある。wema は、どちらの中身も解釈しない。

| 場所 | オプション | 表示するとき | 用途 |
|---|---|---|---|
| `.wema-note-accessory`（上） | `renderNoteAccessory`（issue #73） | 常に（積んでいても、いなくても） | 印、ボタン、数（作者の印、「いいね」） |
| `.wema-note-footer`（下） | `renderNoteFooter`（issue #70）、または `noteLinks` | 積んでいる間だけ | 接続線の代わりに出す「つながっている相手」 |

- 2 つは、付箋の要素の直下の `.wema-note-under` に入る（上から `.wema-note-accessory`、`.wema-note-footer`）。`.wema-note-under` は `position: absolute; top: 100%` で、付箋の枠の外側に出る。付箋の要素の `offsetHeight` には入らない。`display: flow-root` なので、中の要素の余白（負の余白を含む）まで含めた高さになる
- **2 つの場所の描画は、同じ仕組み（`NoteManager` の `UnderSlot`）を通す。** 描く関数、描いたことを表すクラス、描画待ちの集合、表示するかどうかを、場所ごとに `this.accessory` と `this.footer` が持つ。場所ごとの処理を別々に書き足さないこと。全部の場所に行う処理は `this.slots` を回す（`hasUnder()`、`drawUnder()`、`clear()`、`destroy()`、要素の作成）。何か描いてある付箋の `.wema-note-under` は `drawnUnder()` で取る。違いは `shown` だけ（`accessory` は常に `true`、`footer` は `setFootersShown()` が切り替える）
- **積んでいないとき、この領域は場所を取らない。** 列の計算（`placeNotes()` が `layout` に渡す高さ）に入るのは、列に置いた付箋の分だけ。積んでいないときは、下の付箋やボードに重なる。そのため `.wema-note-under` と `.wema-note-accessory` は `pointer-events: none` にして、`.wema-note-accessory` に直接入れた要素だけがポインタを受ける（`style.css`）。**`.wema-note-accessory` を `pointer-events: auto` に戻さないこと。** 付箋の下の幅いっぱいの帯が、下の付箋へのクリックを止める
  - `.wema-note-accessory` を横並びの入れ物（`display: flex`）にしているのも同じ理由。利用側が自前の行で包むと、その行が幅いっぱいにポインタを受ける
  - **ホバーや選択で `.wema-note-under` の高さが変わる CSS を、README の例に書かないこと。** 積んでいる間は `underObserver` から積み直しが走り、列がポインタの下で動く。例は `visibility` で切り替えている。`opacity` も勧めない（透明な要素がポインタを受けて、下の付箋へのクリックを止める）
- **高さは、積んでいるかどうかに依らず、描いた付箋すべての分を `underHeights` に持つ。** 高さの出どころを `underHeights` の 1 つにするため。読んで入れるのは `keepUnderHeight()`（利用側が描いたあとの `drawUnder()`、`underObserver`、`setFootersShown(false)`）と、`placeNotes()`（置く幅での高さ）。**DOM から高さをその場で読む処理を、使う側に足さないこと**（付箋のポップアップはフレームごとに位置を決めるので、毎フレームの強制レイアウトになる）
  - 積んでいないときも、`getPlacedBoxes()`（`revealNotes()` などの範囲）、`lowestBottom()`（ページの高さ）、`getShownBox()`（付箋のポップアップ）は、この高さを含める。場所を取らないのは、列の計算だけ
  - `placeNotes()` は、列から外した付箋の高さを消さない（印は積んでいなくても出ている）。幅が変わって高さが変わった分は、`underObserver` が直す
  - 高さを読むのは、まとめて描いたあとの 1 回にする（`drawUnder()` と `setFootersShown(false)`。書き込みと読み取りを付箋ごとに交互にしない）
- **この要素の高さを、付箋の高さ（モデルの `height`、`placedRects` の `height`）に足さないこと。** 足すと、`getPlacedNote()` を読む接続線、ポップアップ、ラバーバンドの当たり判定がずれ、モデルに入れば `note:update` と履歴に載る。高さ（2 つの場所の合計。`.wema-note-under` の高さ）は `underHeights` に別に持ち、足すのは 4 か所だけ。`placeNotes()` が `layout` に渡す高さ（下の付箋をこの要素の下から始める）、`lowestBottom()`（ページの高さ）、`getPlacedBoxes()`（`visibleBounds()` が読み、`revealNotes()` などの範囲にこの要素を含める）、`getShownBox()`（付箋のポップアップ）。付箋が画面で占める範囲を読む処理を足すときは `getPlacedBoxes()` / `getShownBox()`、付箋そのものの隣に描くもの（接続線、当たり判定）は `getPlacedNote()` / `getShownNote()` を使う
- 利用側が描いたかどうかは、付箋の要素のクラスだけが持つ（`wema-note-has-accessory` と `wema-note-has-footer`。`renderNote` の `wema-note-host-drawn` と同じ持ち方）。`true` を返さなかったときは、中身を消してクラスを外す
- `.wema-note-under` と中の要素は、オプションを渡したボードの付箋にだけ作る（渡した場所の分だけ）。`underElement()` と `slotElement()` は、無ければ `null` を返す
- **`.wema-note-footer` を表示するのは積んでいる間だけ**（`footer.shown`。`setStacked()` が `setFootersShown()` で切り替える）。積んでいない間は、利用側の関数を呼ばず、中身も消す。積み始めたときに、全部の付箋を描く。`.wema-note-accessory` は、積んでいるかどうかに依らず描く
- **利用側の関数を、頼まれたその場で（同期で）呼ばないこと。** 呼ぶ場所は `NoteManager.drawSlot()` の 1 か所（`drawUnder()` が 2 つの場所の分を呼ぶ）で、`drawUnder()` を呼び出すのは `WemaBoard.flushPending()` だけ。頼む側は、場所の `stale` に入れて `onUnderChange` を呼ぶだけにする（`requestSlot()`）
  - 頼むのは、付箋の要素を作ったとき、`text` または `meta` を変える更新、`refresh()`（`requestUnder()` が 2 つの場所とも頼む）。`.wema-note-accessory` だけを頼む口が `requestAccessory()`（`refreshNoteAccessory()`）、`.wema-note-footer` だけを頼む口が `requestFooter()`（`noteLinks` の配線）
  - **`onUnderChange` は、積んでいなくてもマイクロタスクを予約する**（`queueFlush()`）。`.wema-note-accessory` は積んでいないときも描くため。**`onUnderChange` で `scheduleRestack()` を呼ばないこと。** 描き直しを頼まれただけで列全体を積み直すことになる（「いいね」の数が届くたびに、全付箋の高さを読む）。積み直すかどうかは、描いたあとに高さが変わったかどうかで決める
  - 無い付箋の ID での依頼は、`requestSlot()` が捨てる。利用側の関数が、描いている最中の付箋をもう一度頼んだ分も捨てる（`slot.drawing`。捨てないと、描くたびに次の描画が予約されて止まらない）
  - マイクロタスクを予約済みかどうかは `flushQueued` が持つ。`restackPending`（列が古い）とは別の状態で、1 つにまとめない（`restack()` と `importData()` が `restackPending` だけを下ろすので、まとめると、予約済みなのに予約し直す経路ができる）
  - 利用側の関数は、ボードに問い合わせる（`getEdgesOf()`、`isNoteHidden()`）。その場で呼ぶと、コンストラクタの中では利用側が `new WemaBoard()` の戻り値をまだ持っておらず、`importData()` と `applyRemote()` の途中では接続線がまだ無い
  - 描画待ちは場所ごとの `stale` が持ち、`restackPending`（列が古い）とは別。`flushPending()` は、`restackPending` が下りていても `drawUnder()` を呼び、積んでいる間に、描いたものの高さが変わっていたら積み直す（`drawUnder()` の戻り値。高さが同じなら積み直さない）。`setStacked()` が直接呼ぶ `restack()` が `restackPending` を下ろしても、頼んであった描画は行われる。**`flushPending()` の先頭に `if (!this.restackPending) return` を足さないこと**
  - 積んでいないときに高さが変わった分（`.wema-note-accessory`）では、積み直さない。場所を取らないので、ページの高さとポップアップ類の位置だけを直す（`followUnder()`。`underObserver` の通知も、ここを通る）
  - `flushPending()` は、描く前に `restackPending` を下ろす。利用側の関数の中から `refreshNote()` を呼ばれた分は、次の回に描く
  - 例外は、積んでいる間の、描いている位置をその場で読む処理（`visibleBounds()`）。先に `flushPending()` を呼ぶので、利用側が `revealNotes()` などを呼んだ時点で描く。**積んでいないときは、ここで `flushPending()` を呼ばないこと。** 描いても付箋の位置は変わらないのに、利用側の関数が、呼び出しの途中（ホイールやパンの操作中を含む）で走る
- 積んでいる間、高さが変わったら積み直す。きっかけは 3 つ。描き直して高さが変わったとき（`drawUnder()` が `true` を返す）、置く幅の変更（`sizesAtWidth()` が、付箋の高さと一緒に、置く幅での `.wema-note-under` の高さを読む）、利用側が自分で中身を書き換えたときやフォントの読み込み（`underObserver`。`ResizeObserver` で、`.wema-note-under` が `underHeights` と違う高さになったら、`underHeights` を直して `onUnderResize`。ボードの `followUnder()` が、積んでいれば積み直しを予約する）
- この要素の中の `pointerdown` / `click` / `dblclick` / `keydown` は、`.wema-note-under` で伝播を止める（2 つの場所とも）。付箋の選択や、空いている場所への操作として扱わない。`keydown` を止めるのは、中のボタンにフォーカスがあるときの Delete で、選択中の付箋を消さないため
- 付箋のポップアップは `getShownBox()`（`getShownNote()` にこの要素の高さを足した箱）の下に出す。`getShownNote()` に戻すと、ポップアップが利用側の描いたリンクを覆う
- 本文の入力の確定（`syncNoteContent()`）も、`text` が変わったら `requestUnder()` を呼ぶ。`applyParams()` を通らない経路なので、別に呼んでいる
- `underObserver` は、動いている途中の付箋（`shownRects` がある）の通知を捨てる（途中の幅での高さのため）。動き終わったとき（`setShownRect(id, null)`）に `observe()` し直して、その時点の高さを確かめる。し直さないと、移動中に利用側が中身を書き換えた分を取りこぼす
- `NoteManager.destroy()` は、2 つの場所の `shown` を下ろして `stale` を消す。残っているマイクロタスクの `flushPending()` が、破棄したボードで利用側の関数を呼ばないため
- `updateNoteCollapseBtns()` は、ボタンを隠すとき `wema-note-collapse-badge` クラスも外す。CSS がクラスでバッジを見分けているので、残すと、バッジが無いのにこの要素の右端が空く
- 既知の制限: 上辺のバッジ（列で上の付箋へ向かう接続線の折り畳み）は、1 つ上の付箋のこの要素に重なる。README に書いてある
- 非表示の付箋の分も描く（列には入らない）。表示に戻るときに描く形にすると、きっかけが 1 つ増えるため、そうしていない
- 下辺の折り畳みのバッジは、この要素のある付箋では右端に寄せ、要素の右端を空ける（`style.css` の `.wema-note-has-footer` / `.wema-note-has-accessory` の規則と、バッジの後ろの `.wema-note-under` に余白を入れる規則。どちらも積んでいる間だけ）。中央のままだと、印に重なる。後ろの兄弟を選ぶ規則なので、`.wema-note-under` は折り畳みのボタンより後ろに置く。積んでいないときは寄せない（下辺の中央に、折り畳みのボタンとアンカーが出る。利用側に、要素を左右へ寄せてもらう。README に書いてある）

## つながっている付箋の印（`noteLinks`）

`noteLinks` オプションで、積んでいる間、付箋の下に、つながっている相手をボタンで並べる（issue #71）。wema-kake が `renderNoteFooter` で描いていたものを、wema が既定で持つ。

- **新しい描画の経路は作っていない。** `renderNoteFooter` と同じ口（`NoteManager` の `hostFooter`）に、ボードが作る関数（コンストラクタの `drawLinks`）を渡しているだけ。表示の切り替え、マイクロタスクでの描画、高さを含めた積み直しは、上の「付箋の下に利用側が描く要素」の規則がそのまま当てはまる。`renderNoteFooter` も渡されたときは、そちらを `hostFooter` にして、`noteLinks` は何もしない
- 計算と描画は `src/note-links.ts` にある。`computeNoteLinks()`（向き、並び順、相手の表示名。ボードの DOM に触れない）と `drawNoteLinks()`（ボタンの DOM）。ボードへの問い合わせは `NoteLinkHost` で受け取り、`WemaBoard` を import しない
- 向きは `arrowHeadOf()`（`src/edge.ts`）から決める。接続線の描画（`applyEdgeStyle()`）と同じ関数で、矢印の既定値の決め方を 2 か所に書かない
- **相手の本文は、文字としてだけ入れる（`textContent`）。** 冒頭の取り出し（`firstLineOf()`）は、`DOMParser` で別の文書として読む。モデルの `text` はサニタイズ前のことがある（`applyRemote()` の値がそのまま入る）ので、`innerHTML` へ入れて読まないこと。切り離した要素でも、`img` の読み込みと `onerror` は動く
- **描き直しの配線は `board.ts` のコンストラクタの 1 か所**（内部のリスナーを登録している並びにある `if (noteLinks)` の中。描く関数 `drawLinks` を作る `if (noteLinks)` は、`NoteManager` に渡すので、それより前にある）。印に出しているものが変わるきっかけを足したら、リスナーの側に足す
  - `edge:create` / `edge:update` / `edge:delete`: 両端の付箋
  - `note:update` で `text` か `meta` が変わったとき: その付箋につながる付箋（`meta` は、利用側の `text` が読むことがあるため。中身で比べる。`sameFieldValue()`）
  - `refreshNote(id)`: その付箋につながる付箋（`redrawNoteLinkPeers`）。利用側の `text` が返す値の元が、データの外で変わったときのため。利用側に相手の列挙を書かせない
  - つながる付箋を調べる処理（`redrawPeers`）は、積んでいないときは何もしない（`this.stack` を見る）。絞り込みで数百枚の表示が一度に変わっても、接続線を走査しない
  - `note:visibility`: 表示が変わった付箋につながる付箋（ボタンの `disabled`）
  - 付箋の削除は、つながる接続線の `edge:delete` で届く
  - 頼むのは `NoteManager.requestFooter()`。**`refresh()`（`refreshNote()`）を呼ばないこと。** 利用側が描いた付箋の中身（`renderNote`）まで描き直す
- 文言（`aria-label`、本文のない付箋の表示）は `labels` の `linkOut` / `linkIn` / `linkBoth` / `linkNone` / `linkLabeled` / `linkEmpty`。向きの記号（`→` など）は言語に依らないので、ソースに直接書いている
- 色は CSS 変数（`--wema-note-link-background` / `-color` / `-border-color` / `-label-color` / `-accent-color`。`style.css` の先頭）で持つ。**印の色に `--wema-anchor-color` を使わないこと。** アンカーを隠すためにこの変数を `transparent` にする利用側があり、向きの記号と強調が見えなくなる（issue #72。fushihara.net で起きた）。印に色を足すときも、固定値を書かずに変数を足す
- ボタンを押したときの `revealNotes()` の余白は、`noteLinks.padding` から渡す（数でない値、負の値は渡さず、`revealNotes()` の既定に任せる）
- 相手の強調は、付箋の要素に `wema-note-link-target` クラスを付け、タイマー（`TARGET_MS`。CSS のアニメーションと同じ長さ）で外す。**`animationend` で外す形に戻さないこと。** 利用側が見た目を上書きしてアニメーションが無いとき、強調中に相手が非表示になったとき（届くのは `animationcancel`）にクラスが残り、付箋の中のアニメーションの `animationend`（バブルする）で途中で外れる。見た目は `outline` で、選択中の付箋の `outline` を一時的に上書きする
- 相手の本文の冒頭は、付箋ごとに覚える（`WemaBoard.noteLinkLines`。本文が同じなら解析し直さない）。1 枚の付箋は、つながる付箋すべての下に出て、どれかが変わるたびに描き直されるため。付箋の削除と `importData()` で消す
- 本文として読まないタグは、サニタイズが落とすタグ（`REMOVE_TAGS`。`src/utils/sanitize.ts`）と同じにする。別の一覧を持つと、付箋に見えていない文字がボタンに出る。サニタイズが残すが中身を文字として表示しない要素（`NO_TEXT_INSIDE` の `video` / `audio` / `iframe`、`display: none` の要素）も読まない
- 利用側の `text` は、接続線ごとに `try` で囲む。1 枚の付箋で例外が出ても、他のボタンを消さない。空の文字列は「返さなかった」と同じに扱い、本文の冒頭にする
- **描き直しでフォーカスを落とさない。** 描き直しは中身を丸ごと作り直す。`drawSlot()` が、フォーカスのある要素の `data-wema-focus-key`（`FOCUS_KEY_ATTR`）を控え、描いたあと、同じ値の要素へフォーカスを戻す。印のボタンは接続線の ID を入れている。共同編集で相手の本文が変わるたびに描き直すので、戻さないと、キーボードで操作している間にフォーカスが `body` へ落ちる。`renderNoteFooter` の利用側も、同じ属性を付ければ使える
- 既知の制限: 積んでいる間、付箋ごとに `getEdgesOf()` で接続線を全部走査する（付箋 × 接続線）。複製はしないので、数百枚では問題にならない。大きなボードで遅くなったら、付箋から接続線への索引を作る
- `linkOut` などの文言は関数（`deleteNotes` と同じ形）。JSON から渡した `labels` では差し替わらず、英語のままになる

## テスト

- `noteLinks` のテストは `tests/note-links.test.ts`（計算、本文の冒頭の取り出し、ボタンと描き直し）
- `renderNoteAccessory` のテストは `tests/note-accessory.test.ts`、`renderNoteFooter` のテストは `tests/note-footer.test.ts`。高さは `.wema-note-under`（`container` の親）の `offsetHeight` を差し替えて決める（列が読むのは、2 つの場所を合わせた高さのため）。描画はマイクロタスクなので、確かめる前に待つ（`settle()`）
- jsdom はレイアウトを計算しない。`tests/stacked.test.ts` は、付箋の要素の `offsetHeight` を「描いている幅」から決まる値に差し替えて、表示の高さとモデルの高さを分けて確かめる（`setLayout()`）
- 見た目（`foldable` のリンク、`autoSize` の付箋の幅、ページの高さ、接続線）を変えたら、実ブラウザでも確認する。見るのは、幅 375px での `pageScroll` との併用、`foldable` の開閉、入力中の積み直し、付箋の追加、積んでいる間は接続線とアンカーが出ないこと、`setStacked(null)` で元の配置に戻り接続線も出ること。`renderNoteFooter` を変えたときは、付箋の下の要素と下の付箋が重ならないこと、要素の中のタップで付箋が選択されないこと、折り畳みのバッジが要素に重ならないことも見る
