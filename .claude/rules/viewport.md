---
paths:
  - "src/viewport.ts"
  - "src/board.ts"
  - "src/drag.ts"
  - "src/resize.ts"
  - "src/anchor-drag.ts"
  - "src/selection.ts"
  - "src/edge-popup.ts"
  - "src/note-popup.ts"
  - "src/rich-text.ts"
  - "src/style.css"
  - "tests/viewport.test.ts"
---

# 表示位置（パンとズーム）と座標

- ボード座標で描くもの（付箋、接続線、ラバーバンド）は `.wema-viewport` の中に置く。ポップアップ類は `.wema-board` の直下に置き、画面座標で位置を決める。ズームしてもポップアップ類の大きさは変えない
- `.wema-viewport` は大きさ 0 なので、空いている場所のイベントの `target` は `.wema-board` 自身になる。`svg.wema-edges` は 1px の箱からはみ出して描く（`overflow: visible`）
- 表示位置と倍率の状態、`.wema-viewport` の transform、座標変換は `Viewport` クラス（`src/viewport.ts`）の 1 か所にある。座標系は 3 つ: client（`clientX` / `clientY`）、screen（`.wema-board` の中のピクセル。ポップアップ類の位置）、board（付箋の座標）
- **ポインタの座標（`clientX` / `clientY`）をボード座標にするときは、必ず `clientToBoard()` を通す。** ポップアップをボード座標の位置へ出すときは `boardToScreen()` を通す。`clientX - rect.left` を直接書くと、パンした分と倍率の分だけずれる
- **ドラッグやリサイズの移動量は、ポインタの位置を `clientToBoard()` でボード座標にしてから差を取る。** `clientX` の差をそのまま付箋の座標に足すと、倍率の分だけずれる。逆に「ドラッグを始めるか」の判定（`DRAG_THRESHOLD`）と、パンの移動量（`viewport.x` / `y`）は画面のピクセルで扱う
- 表示位置と倍率は表示だけの状態（`zIndex` や絞り込みと同じ扱い）。`setViewport()` が発火するのは `viewport:change` だけで、`note:*` / `edge:*` / `history:commit` / `change` は出さず、`exportData()` にも含めない
- 表示位置と倍率を変える経路は `setViewport()` の 1 つだけ（`zoomTo` / `revealNotes` / `centerContent` / `fitToContent`、ホイール、ドラッグはすべてここを通る）。倍率の範囲（`minZoom` / `maxZoom`）と値の検査は `Viewport.set()` が行う
- 表示位置や倍率が変わったら、ポップアップ類も付いていかせる（`setViewport()` が各オーバーレイの `updatePosition` を呼ぶ。各オーバーレイは、対象のボード座標または対象の要素の位置から、自分の位置を計算し直す。画面座標を保存しておいて差分で動かす方式にはしない）。閉じてはいけない。埋め込み URL の入力中にトラックパッドが少し動いただけで、入力内容が消えるため。対象との間隔（付箋の下 8px など）は画面のピクセルで、倍率を掛けない
- ポップアップ類のセレクタは `board.ts` の `OVERLAY_SELECTOR` の 1 か所で管理する。オーバーレイを増やしたら、ここと `setViewport()` に足す
- Ctrl / Cmd + ホイール（トラックパッドのピンチも同じイベントで届く）は、ポインタの位置を中心にズームする。1 回のイベントで変える量には上限を設けている（マウスのホイール 1 ノッチで倍率が飛ばないようにするため）
- autoSize の計測（`offsetWidth` / `offsetHeight`）は transform の影響を受けないので、倍率で割らない。`getBoundingClientRect()` は倍率の掛かった値を返すので、計測には使わない
- Space + ドラッグの Space は、フォーカスではなく「ポインタがボードの上にあるか」で受け付ける（`document` の keydown / keyup と、ボードの pointerenter / pointerleave）。`window` の blur で解除する
- 座標を省略した `addNote()` は、ボード座標の固定位置ではなく、表示中の領域の左上を基準にする
- パンの開始は `wantsPan()` で決める。中ボタン、Space + 左ドラッグ、readOnly / viewOnly の空いている場所の左ドラッグ（viewOnly の Shift + ドラッグはラバーバンド選択）。`pointerdown` をキャプチャ段階で受けるので、付箋の上から始めたパンは付箋のドラッグより優先される
- ダブルクリックは、付箋を作成できるとき（通常モードで `createOnDblClick` が有効）は作成、できないときはその位置を中央へパンする
- 利用者の操作（ホイール、ドラッグ、ダブルクリック、Ctrl + ホイール）による移動は `panWithinLimit()` を通し、付箋のある範囲から `panMargin` より遠くへ行かせない。操作を増やすときも `setViewport()` を直接呼ばず、ここを通す。メソッド（`setViewport` / `zoomTo` / `revealNotes` / `centerContent` / `fitToContent`）は制限しない
  - 軸ごとの規則: 付箋全体がボードより大きいときは、付箋の外側の余白を `panMargin` まで見せる。ボードに収まるときは、付箋がボードからはみ出さない範囲で動かせる（小さい付箋群を画面の外へ追い出せないようにするため）
  - すでに範囲の外にあるとき（メソッドで動かした、付箋が減った、絞り込みが変わった）は、範囲の中へ引き戻さない。遠ざかる方向だけを止める。倍率が変わる操作では範囲をそのまま当てる
  - 表示中の付箋が無いときは制限しない
- jsdom はレイアウトも transform も計算しない。ズーム中の表示と操作（ドラッグ、リサイズ、ポップアップの位置）を変えたら、実ブラウザでも確認する
