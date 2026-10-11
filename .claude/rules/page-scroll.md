---
paths:
  - "src/board.ts"
  - "src/style.css"
  - "tests/page-scroll.test.ts"
---

# ページと一緒にスクロールするモード（`pageScroll`）

`pageScroll` オプションと `setPageScroll()` で入るモード（issue #63）。ボードは自分の表示領域を持たず、付箋の高さまで伸びて、ページの一部として流れる。狭い画面で、付箋を縦に積んで（`stackNotes()`）ページのように読ませるために使う。

## 状態

- 表示だけの状態（絞り込みや表示位置と同じ扱い）。`note:*` / `edge:*` / `history:commit` / `change` を出さず、`exportData()` にも含めない
- ボードの要素の `height` / `overflow` はインラインスタイルで入っている（コンストラクタ）。CSS のクラスでは上書きできないので、モードの切り替えもインラインスタイルで行う（`setPageScroll()`）。`wema-page-scroll` クラスは、`touch-action` の切り替えに使う
- ボードの高さは `updatePageHeight()` の 1 か所で決める。表示中の付箋の下端 + `PAGE_SCROLL_MARGIN`。**付箋の位置、大きさ、表示・非表示を変える経路を足したら、次の呼び出し元のどれかを通ることを確かめる**
  - `note:update` のリスナー（位置か大きさが変わったとき）と `onMeasure`
  - `recomputeVisibility()` の末尾。付箋の作成と削除、絞り込み、折り畳み、`importData()` はここを通る
  - `setPageScroll()`
  - アニメーションのフレームごとの `followShownNotes()` と、`animateNotes()` の末尾

- **付箋がアニメーションで動いているあいだは、高さを縮めない**（伸ばすのはすぐ）。モデルは最初から終点にあるので、すぐ縮めると、まだ下に描かれている付箋がボードの外へはみ出し、ブラウザがスクロール位置を切り詰めて画面が跳ぶ。縮めるのは、最後のフレームの `followShownNotes()` か、アニメーションをやめた `note:update` のとき
  - `animateNotes()` が `change` を実行しているあいだは、まだどの付箋もアニメーションを始めていない。このあいだも縮めないよう、`holdsPageHeight` を立てる。`change` のあとで必ず `updatePageHeight()` が呼ばれる
- 制限: ボード座標の負の位置にある付箋は見えない（表示位置を原点に固定し、高さは下端だけから決めるため）。README に書いてある。直すなら、原点をずらすのではなく、利用側に 0 以上の位置へ積ませる方針を保つ

## 表示位置

- モードに入るとき、`{ x: 0, y: 0, zoom: 1 }` に戻す。モードの間、`setViewport()` は何もしない。表示位置を変える経路は `setViewport()` の 1 つだけなので（`.claude/rules/viewport.md`）、`zoomTo()` / `centerContent()` / `fitToContent()` と利用者の操作は、これで止まる
- モードの中から表示位置を変える必要があるとき（モードに入るとき）は、`applyViewport()` を直接呼ぶ
- `revealNotes()` は、付箋を囲む箱と同じ大きさの要素を一時的に置き、`scrollIntoView()` を呼ぶ（`scrollPageToNotes()`）。何がスクロールするか（ページか、外側の要素か）をブラウザに任せるため。スクロール位置を自分で計算しない

## 操作をブラウザに渡す

- ホイールは、`handleWheel` の先頭で戻る（`preventDefault()` を呼ばない）。ページのスクロールと、Ctrl / Cmd + ホイールでのブラウザの拡大になる
- **「この押下をブラウザに渡すか」は `leavesToPage()` の 1 か所で決める。** 渡すのは、指（`pointerType === 'touch'`）での押下と、パンになるはずだった押下（`wantsPan()` が true）。押下の種類を増やすときは、ここに足す
- 渡す押下では、`handlePanDown` が `stopPropagation()` だけを呼んで戻る。`preventDefault()` は呼ばない。キャプチャ段階で止めるので、付箋のドラッグ、リサイズ、アンカーには届かず、ブラウザの既定の動作（スクロール、中ボタンのスクロールなど）は残る
- ラバーバンドは、空いている場所ではボード自身が `target` になる。伝播の停止に頼らず、`handleRubberBandDown` でも `leavesToPage()` を確かめる
- ダブルクリックでの移動は、`setViewport()` が何もしないので止まる（専用の分岐は無い）
- 付箋、ムーブハンドル、リサイズハンドルの `touch-action` は、モードの間 `manipulation` にする（`style.css`）。`none` のままだと、付箋の上から始めたスワイプでページが動かない。`pan-y` ではなく `manipulation` なのは、ピンチでのブラウザの拡大と横のスクロールも渡すため
- ドラッグ、リサイズ、アンカーの各マネージャは `pointercancel` を処理していない。指での操作をブラウザに渡すと `pointercancel` が届くので、モードの間は「始めない」ことで不整合を避けている。モードの外でのタッチ操作（Phase 8）を足すときは、各マネージャに `pointercancel` の処理を足す
- タップは `click` になるので、選択、リンク、折り畳みボタン、`foldable` の開閉のリンクは働く

## 利用側の前提

- コンテナの高さを固定しないこと。ボードは `overflow: visible` で、コンテナからはみ出して伸びる
- 付箋の並べ直しは行わない。積むのは `stackNotes()`

## テスト

- jsdom はレイアウトとスクロールを計算しない。`tests/page-scroll.test.ts` が確かめているのは、高さのインラインスタイル、表示位置が動かないこと、`preventDefault()` を呼ばないこと、指での押下で何も始まらないこと
- **ページが実際にスクロールするかどうかは、実ブラウザで確かめる。** 見るのは、幅 375px でタッチを有効にした状態での、付箋の上からのスワイプ、ホイール、開閉のリンクのタップ、モードを抜けたあとの指での付箋のドラッグ
