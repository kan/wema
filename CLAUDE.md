# CLAUDE.md — wema 開発ガイド

## プロジェクト概要

wemaは、Web上に付箋を絵馬のように貼って並べるフレームワーク非依存のTypeScriptライブラリ。
付箋の作成・編集・自由配置・接続線描画を提供する。

2つの配布形態がある:
1. **npmパッケージ** (`@kanf/wema`) — ライブラリとして組み込む
2. **スタンドアロンHTML** (`wema.html`) — 1ファイルで完結するツール。ブラウザで開くだけで使える

## 開発ルール

- **修正完了時は必ず `npm run build` を実行する** — ユーザーに動作確認を促す前に、lint・テスト・ビルドをすべて通すこと
  ```bash
  npm run lint && npm test && npm run build
  ```
- **外部依存ゼロ** を維持する (devDependencies は OK)
- TypeScript は strict mode で書く
- 全ての public API に JSDoc コメントをつける
- テストは Vitest で、少なくともデータモデル操作 (CRUD) とイベント発火をカバーする
- 全セレクタは `.wema-` プレフィックス付き (衝突回避)

## コマンド

```bash
npm install          # 依存インストール
npm run dev          # 開発サーバー起動 (standalone/template.html を Vite で serve)
npm run build        # ライブラリビルド + スタンドアロンHTMLビルド
npm run build:lib    # ライブラリのみビルド
npm run build:standalone  # スタンドアロンHTMLのみビルド
npm test             # テスト実行
npm run verify:package    # npm pack の成果物に公開エントリが揃っているか検証
npm run lint         # リント (tsc --noEmit)
```

## リポジトリ構成

```
wema/
├── CLAUDE.md
├── README.md
├── CHANGELOG.md              # Keep a Changelog 形式
├── LICENSE                   # MIT
├── SECURITY.md               # 脆弱性報告ポリシー
├── package.json
├── tsconfig.json
├── vite.config.ts
├── scripts/
│   ├── build-standalone.ts   # wema.html ビルドスクリプト
│   └── verify-package.ts     # 公開物にエントリファイルが揃っているか検証
├── src/                      # ライブラリ本体
│   ├── index.ts              # public API re-export
│   ├── types.ts              # 型定義
│   ├── board.ts              # WemaBoard クラス (メインAPI)
│   ├── note.ts               # 付箋の管理・描画
│   ├── edge.ts               # 接続線の管理・描画
│   ├── drag.ts               # ドラッグ&ドロップ (グループドラッグ対応)
│   ├── selection.ts          # 選択状態管理 (複数選択・ラバーバンド)
│   ├── layout.ts             # 整列・均等配置・自動レイアウト
│   ├── anchor-drag.ts        # アンカーからのEdge作成ドラッグ
│   ├── resize.ts             # 付箋のリサイズ
│   ├── rich-text.ts          # リッチテキスト編集 (Selection/Range API)
│   ├── history.ts            # Undo/Redo 履歴管理 (デルタベース)
│   ├── edge-popup.ts         # Edge スタイル編集ポップアップ
│   ├── note-popup.ts         # ノートスタイル編集ポップアップ (単一/複数)
│   ├── events.ts             # イベントシステム
│   ├── style.css             # デフォルトスタイル
│   └── utils/
│       ├── geometry.ts       # 座標計算・アンカーポイント・パス生成
│       ├── id.ts             # ID生成 (crypto.randomUUID)
│       ├── dom.ts            # DOM/SVG操作ヘルパー
│       ├── sanitize.ts       # HTML サニタイズ
│       └── oembed.ts         # oEmbed URL → iframe 変換
├── standalone/
│   └── template.html         # スタンドアロン版テンプレート
├── dist/                     # ビルド成果物 (gitignore)
│   ├── wema.js               # ESM
│   ├── wema.umd.js           # UMD (グローバル名: Wema)
│   ├── wema.d.ts             # 型定義
│   ├── style.css             # CSS
│   └── wema.html             # スタンドアロン版
├── tests/
│   ├── board.test.ts
│   ├── edge.test.ts
│   ├── events.test.ts
│   ├── geometry.test.ts
│   ├── layout.test.ts
│   ├── sanitize.test.ts
│   └── history.test.ts
└── .github/
    ├── dependabot.yml        # 依存の自動更新 (npm + GitHub Actions)
    └── workflows/
        ├── ci.yml            # テスト・ビルド + npm audit
        ├── release.yml       # リリース (HTML配布 + npm publish)
        └── pages.yml         # GitHub Pages デプロイ (https://kan.github.io/wema/)
```

## 技術スタック

- **言語**: TypeScript (strict mode)
- **ビルド**: Vite (library mode)
- **描画**: DOM (付箋) + SVG (接続線) ハイブリッド
- **フレームワーク依存**: なし
- **テスト**: Vitest + jsdom
- **出力**: ESM + UMD + 型定義 + style.css + スタンドアロンHTML

## アーキテクチャ

### 描画方式: DOM + SVG ハイブリッド

```
┌─ .wema-board (overflow: hidden、画面座標) ───────────┐
│  ┌─ .wema-viewport (translate でパン、ボード座標) ─┐ │
│  │  svg.wema-edges (1px、overflow: visible)        │ │
│  │    <path> ... </path>                           │ │
│  │  .wema-note (position: absolute)                │ │
│  │    .wema-move-handle (ドラッグ用グリップ)       │ │
│  │    .wema-note-content (contenteditable)         │ │
│  │    .wema-note-anchors (接続ポイント4辺)         │ │
│  │    .wema-resize-handle (リサイズ)               │ │
│  │  .wema-rubberband                               │ │
│  └─────────────────────────────────────────────────┘ │
│  .wema-note-popup / .wema-edge-popup                 │
│  .wema-richtext-toolbar / .wema-image-overlay        │
└──────────────────────────────────────────────────────┘
```

### 表示位置（パン）と座標

- ボード座標で描くもの（付箋、接続線、ラバーバンド）は `.wema-viewport` の中に置く。ポップアップ類は `.wema-board` の直下に置き、画面座標で位置を決める
- `.wema-viewport` は大きさ 0 なので、空いている場所のイベントの `target` は `.wema-board` 自身になる。`svg.wema-edges` は 1px の箱からはみ出して描く（`overflow: visible`）
- **ポインタの座標（`clientX` / `clientY`）をボード座標にするときは、必ず `WemaBoard.clientToBoard()` を通す。** ポップアップをボード座標の位置へ出すときは `boardToScreen()` を通す。`clientX - rect.left` を直接書くと、パンした分だけずれる
- 表示位置は表示だけの状態（`zIndex` や絞り込みと同じ扱い）。`setViewport()` が発火するのは `viewport:change` だけで、`note:*` / `edge:*` / `history:commit` / `change` は出さず、`exportData()` にも含めない
- 表示位置が動いたら、ポップアップ類も同じ量だけ動かす（`setViewport()` が各オーバーレイの `moveBy` / `updatePosition` を呼ぶ）。閉じてはいけない。埋め込み URL の入力中にトラックパッドが少し動いただけで、入力内容が消えるため
- ポップアップ類のセレクタは `board.ts` の `OVERLAY_SELECTOR` の 1 か所で管理する。オーバーレイを増やしたら、ここと `setViewport()` に足す
- Space + ドラッグの Space は、フォーカスではなく「ポインタがボードの上にあるか」で受け付ける（`document` の keydown / keyup と、ボードの pointerenter / pointerleave）。`window` の blur で解除する
- 座標を省略した `addNote()` は、ボード座標の固定位置ではなく、表示中の領域の左上を基準にする
- パンの開始は `wantsPan()` で決める。中ボタン、Space + 左ドラッグ、readOnly / viewOnly の空いている場所の左ドラッグ（viewOnly の Shift + ドラッグはラバーバンド選択）。`pointerdown` をキャプチャ段階で受けるので、付箋の上から始めたパンは付箋のドラッグより優先される
- ダブルクリックは、付箋を作成できるとき（通常モードで `createOnDblClick` が有効）は作成、できないときはその位置を中央へパンする
- ズームは未実装（#52）。`WemaViewport.zoom` は常に 1。実装するときは `clientToBoard` / `boardToScreen` と、ドラッグ・リサイズの移動量に倍率を入れる

### データの流れ

```
ユーザー操作 → DOM イベント → 内部状態更新 → DOM/SVG 再描画
                                    ↓
                          'change' イベント発火
                                    ↓
                          利用側で永続化 (ライブラリは関与しない)
```

ライブラリはデータ永続化に一切関与しない。
`exportData()` でシリアライズ可能なオブジェクトを返し、`importData()` で復元する。
スタンドアロン版 (`standalone/template.html`) がIndexedDBでの保存を実装する。

## データモデル

```typescript
type NoteId = string;
type EdgeId = string;
type Anchor = 'top' | 'right' | 'bottom' | 'left' | 'auto';
type NoteTheme = 'default' | 'card';
type EdgeStyle = 'arrow' | 'line' | 'dashed';  // legacy shorthand
type LineStyle = 'solid' | 'dashed' | 'dotted';
type ArrowHead = 'none' | 'start' | 'end' | 'both';
type EdgeRouting = 'curve' | 'polyline';

interface WemaNote {
  id: NoteId;
  x: number;
  y: number;
  width: number;
  height: number;
  text: string;
  color: string;
  zIndex: number;
  autoSize?: boolean;
  collapsed?: boolean;
}

interface WemaEdge {
  id: EdgeId;
  from: NoteId;
  to: NoteId;
  fromAnchor: Anchor;       // default: 'auto'
  toAnchor: Anchor;         // default: 'auto'
  style: EdgeStyle;         // default: 'arrow' (legacy)
  label?: string;
  lineStyle?: LineStyle;    // default: 'solid'
  strokeWidth?: number;     // default: 2
  arrowHead?: ArrowHead;    // default: 'end'
  arrowSize?: number;       // default: 12
  routing?: EdgeRouting;    // default: 'curve'
}

interface WemaBoardData {
  version: 1;
  notes: WemaNote[];
  edges: WemaEdge[];
  viewport?: { x: number; y: number; zoom: number };  // 未使用（exportData は書かず、importData は無視する）
}
```

## Public API (`WemaBoard` クラス)

```typescript
class WemaBoard {
  constructor(options: WemaBoardOptions);
  destroy(): void;

  // 付箋
  addNote(params?: Partial<Omit<WemaNote, 'id'>>): WemaNote;
  updateNote(id: NoteId, params: Partial<WemaNote>): void;
  deleteNote(id: NoteId): void;
  getNote(id: NoteId): WemaNote | undefined;
  getNotes(): WemaNote[];

  // 接続線
  addEdge(from: NoteId, to: NoteId, params?: ...): WemaEdge;
  updateEdge(id: EdgeId, params: Partial<Omit<WemaEdge, 'id' | 'from' | 'to'>>): void;
  deleteEdge(id: EdgeId): void;
  getEdges(): WemaEdge[];
  getEdgesOf(noteId: NoteId): WemaEdge[];
  getSelectedEdge(): EdgeId | null;

  // 選択
  select(noteIds: NoteId[]): void;
  selectAll(): void;
  getSelection(): NoteId[];

  // 絞り込み（表示だけを変える。データ・イベント・履歴には影響しない）
  setNoteFilter(noteIds: NoteId[] | null): void;
  getNoteFilter(): NoteId[] | null;

  // 表示位置（表示だけを変える。viewport:change のみ発火）
  getViewport(): WemaViewport;                 // { x, y, zoom }（zoom は常に 1）
  setViewport(viewport: Partial<WemaViewport>): void;
  revealNotes(noteIds: NoteId[], options?: { padding?: number }): void;
  centerContent(options?: { noteIds?: NoteId[]; padding?: number }): void;  // fitToContent（倍率も合わせる）はズームと一緒に追加する

  // レイアウト
  alignNotes(noteIds: NoteId[], alignment: 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom'): void;
  distributeNotes(noteIds: NoteId[], direction: 'horizontal' | 'vertical'): void;
  autoLayout(noteIds?: NoteId[]): void;

  // 履歴・同期
  batch<T>(fn: () => T, options?: { origin?: 'user' | 'agent' }): T;  // Undo 1 回分にまとめる
  applyRemote(deltas: HistoryDelta[]): void;  // readOnly/viewOnly でも適用、履歴に積まない

  // データ入出力
  exportData(): WemaBoardData;
  importData(data: WemaBoardData): void;

  // 状態
  setReadOnly(readOnly: boolean): void;
  isReadOnly(): boolean;
  setViewOnly(viewOnly: boolean): void;
  isViewOnly(): boolean;
  setTheme(theme: NoteTheme): void;
  getTheme(): NoteTheme;

  // イベント
  on<K extends keyof WemaEventMap>(event: K, handler: (...) => void): void;
  off<K extends keyof WemaEventMap>(event: K, handler: (...) => void): void;
}
```

### WemaBoardOptions

```typescript
interface WemaBoardOptions {
  container: HTMLElement;
  data?: WemaBoardData;
  defaultNoteWidth?: number;   // default: 200
  defaultNoteHeight?: number;  // default: 150
  defaultNoteColor?: string;   // default: '#FFF9C4'
  createOnDblClick?: boolean;  // default: true
  readOnly?: boolean;          // default: false
  viewOnly?: boolean;          // default: false
  theme?: NoteTheme;           // default: 'default'
  onImageUpload?: (file: File) => Promise<string>;  // 指定時は data URL の代わりに返された URL で画像を挿入
  onLinkClick?: (url: string, event: MouseEvent) => boolean | void;  // url は解決済みの絶対 URL。true を返すと新しいタブを開かない
  wheelPan?: boolean;          // default: true（ホイールで表示位置を動かす）
}
```

### 付箋の非表示（折り畳みと絞り込み）

付箋と接続線の表示・非表示は `WemaBoard.recomputeVisibility()` の 1 か所で決める。

- 非表示の原因は 2 つ。折り畳み（`WemaEdge.collapsed`、データの一部）と、絞り込み（`setNoteFilter`、表示だけの状態で `noteFilter` に持つ）
- 結果は `hiddenNoteIds` に入る。SelectionManager は `isSelectable` でこれを参照し、非表示の付箋を選択しない
- 絞り込みはイベントも履歴も出さない。絞り込み中にユーザーが作成した付箋は `noteFilter` に加える。`applyRemote` で届いた付箋と Undo / Redo で復活した付箋は加えない（`historyManager.isReplaying()` で判別する。新規作成は `addNote`、再生は `addNoteWithId` を通る）
- 折り畳みの探索は、絞り込みで表示される接続線だけを対象にする。絞り込みで隠れた接続線には展開ボタンを出せないので、その折り畳みで表示対象の付箋を隠してはいけない
- 非表示になった付箋と接続線は `recomputeVisibility()` が選択から外す（見えないものを Delete で消せてしまうのを防ぐ）
- 非表示の理由を増やすときも `recomputeVisibility()` に足すこと（DOM の `display` を別の場所で書き換えない）

### レイアウト関数（DOM 非依存）

`WemaBoard` のレイアウト系メソッドは、次の純粋関数の結果を `updateNote` で反映するだけの薄いラッパー。
関数は `src/layout.ts` にあり、`src/index.ts` から export している（サーバー側で使うため DOM に触れないこと）。

```typescript
computeAlignment(notes: LayoutNote[], alignment: NoteAlignment): NotePosition[];
computeDistribution(notes: LayoutNote[], direction: DistributeDirection): NotePosition[];
computeAutoLayout(notes: LayoutNote[], edges: LayoutEdge[], options?: { noteIds?: NoteId[] }): NotePosition[];
```

### イベント

```typescript
type ChangeOrigin = 'local' | 'remote';                    // 'remote' は applyRemote() による変更
type HistoryOrigin = 'user' | 'undo' | 'redo' | 'agent';

interface WemaEventMap {
  'note:create':     { note: WemaNote; origin: ChangeOrigin };
  'note:update':     { note: WemaNote; prev: WemaNote; origin: ChangeOrigin };
  'note:delete':     { note: WemaNote; origin: ChangeOrigin };
  'note:select':     { noteIds: NoteId[] };
  'edge:create':     { edge: WemaEdge; origin: ChangeOrigin };
  'edge:update':     { edge: WemaEdge; prev: WemaEdge; origin: ChangeOrigin };
  'edge:delete':     { edge: WemaEdge; origin: ChangeOrigin };
  'readOnly:change': { readOnly: boolean };
  'viewOnly:change': { viewOnly: boolean };
  'history:change':  { canUndo: boolean; canRedo: boolean };
  'history:commit':  { deltas: HistoryDelta[]; origin: HistoryOrigin };
  'image:error':     { noteId: NoteId; file: File; error: unknown };
  'viewport:change': WemaViewport;
  'change':          { data: WemaBoardData };
}
```

### 同期（`history:commit` / `applyRemote`）

- `HistoryDelta`（`src/types.ts`）は HistoryManager が作る差分で、Undo 1 回分 = `history:commit` 1 回
- `update` の `after` にキーがなく `before` にあるものは「未設定に戻す」。JSON で `undefined` のキーが消えるための規則で、`replayDeltas`（`src/history.ts`）が復元する
- Undo / Redo の再生と `applyRemote` は同じ `replayDeltas` を通り、どちらも `historyManager.withoutRecording()` の中で実行するので履歴に積まれない。`origin` は `createReplay(origin)` が NoteManager / EdgeManager のメソッドへ引数で渡す（可変の状態として持たない）
- `commitPending()` は確定時に `coalesceDeltas` で同じ付箋・接続線への更新を 1 件にまとめる（ドラッグ中の pointermove ごとの差分をそのまま `history:commit` に載せないため）。間に作成・削除を挟む更新はまとめない
- 参照モード（viewOnly）中は `historyManager.setIgnoredKeys(['x', 'y'], ['collapsed'])` で、終了時に復元するキーだけ記録を止める（text など復元しないキーは記録する）。終了時の復元も記録しない。`undo()` / `redo()` は何もしない
- `applyRemote` は参照モードの復元用スナップショット（`positionSnapshot` / `collapsedEdgeSnapshot`）も更新する。更新しないと、終了時の復元でリモートの変更を巻き戻してしまう
- `zIndex` はローカルな表示状態。`bringToFront` はイベントも履歴も出さない
- `change` は必ず `scheduleChange()` 経由で発火し、`data` に `exportData()` の結果を入れる
- `exportData()` は編集中の DOM の内容を返すが、モデルの `text` は書き換えない（`getNotesWithLiveText()`）。書き換えると blur 時に差分が出ず、編集が履歴にも `history:commit` にも載らなくなる

### autoSize の計測

autoSize の付箋の `width` / `height` は、内容と CSS から決まる派生値で、ユーザーの操作ではない。

- 入力中と描画後（`requestAnimationFrame`）の計測は `note:update` を出さない。モデルを更新し、`onMeasure` で接続線の再描画と `change` だけを行う（`NoteManager.measure`）
- 計測によるサイズの変化は、次の `note:update` の `prev` に計測前の値を入れて報告する（`unreportedSizeBase` / `emitUpdate`）。入力なら blur 時にテキストと同じ 1 件になる
- `updateNote` が `autoSize` / `text` / `width` / `height` を変えるときは、その場で計測してから `note:update` を出す。autoSize の切り替えとその結果のサイズが 1 件になり、Undo で元のサイズへ戻る
- Undo / Redo の再生と `applyRemote` は `NoteManager.replayUpdate` を使う。履歴に記録されない更新なので、未報告の計測前サイズを消費しない（消費すると、そのサイズの変化がどの `history:commit` にも載らなくなる）
- DOM 上の編集（入力の blur、チェックボックス、画像の操作）の確定は `syncNoteContent` の 1 か所で行う。確定経路を増やすときもここを通すこと
- 計測値が 0 のとき（折り畳みで非表示、DOM から外れている）は無視する
- `updateNoteElement` が表示内容を描き直すのは text を変える更新のときだけ。モデルの text とブラウザが正規化した innerHTML は一致しないことがあり、移動のたびに描き直すと画像や埋め込みが再読み込みされる
- **`prev` と `note` が同値の `note:update` を出さないこと。** 1 文字ごとに履歴が積まれる、または差分が履歴に残らない原因になる（#51）

## 実装上の注意点

### ポインタイベントとクリックの干渉

ドラッグ (`pointerdown` → `pointermove` → `pointerup`) の後に `click` イベントが発火する。
ドラッグ操作で選択状態が壊れないよう、`noteDragged` / `rubberBandMoved` フラグで
ドラッグ直後の `click` をスキップするパターンを使用している。

### ポップアップの DOM 再構築

ポップアップ内のボタンクリックで `this.show()` を呼ぶと `innerHTML` が再構築され、
クリックされたボタンが DOM から切り離される。`stopPropagation()` をポップアップ要素に
設定してボードの `handleBoardClick` への伝播を防止している。

### 接続線のパス計算

- `fromAnchor` / `toAnchor` が `'auto'` の場合:
  1. 2つの付箋の中心座標を結ぶ方向を算出
  2. 出発側/到着側それぞれ、最適なアンカーを選択
  3. `routing: 'curve'` → 3次ベジェ曲線、`'polyline'` → 直角折れ線
  4. ベジェの制御点はアンカーの法線方向にオフセット (距離に比例、40px〜150px)

### CSS カスタマイズ

```css
.wema-board {
  --wema-note-border-radius: 4px;
  --wema-note-shadow: 0 2px 8px rgba(0,0,0,0.15);
  --wema-note-font-size: 14px;
  --wema-anchor-size: 12px;
  --wema-anchor-color: #4A90D9;
  --wema-edge-color: #555;
  --wema-edge-width: 2px;
}
```

## スタンドアロン版 (`standalone/template.html`)

ライブラリとは独立したアプリケーションコード。
ビルド時に `scripts/build-standalone.ts` が CSS と UMD バンドルをインライン注入して
`dist/wema.html` を生成する。

### template.html の責務

- ツールバーUI (付箋追加、色変更、整列・均等配置・autoLayoutボタン等)
- IndexedDB によるデータ自動保存 (`change` イベント + 300ms debounce)
- JSON ファイルのエクスポート/インポート
- キーボードショートカット (Delete で削除、Ctrl+A で全選択 等)
- viewOnly / readOnly トグル

### ビルドスクリプトの仕組み

`standalone/template.html` 内のプレースホルダコメント:
- `<!-- __WEMA_CSS__ -->` → `<style>dist/style.css の中身</style>` に置換
- `<!-- __WEMA_JS__ -->` → `<script>dist/wema.umd.js の中身</script>` に置換

テンプレート内のアプリコードは `window.Wema` (UMDグローバル) を参照する。

## 実装フェーズ

### Phase 1〜5 [完了 → v0.1.0]

1. **MVP** — 付箋 CRUD、ドラッグ、exportData/importData、スタンドアロン版、CI
2. **接続線** — アンカーポイント、SVG パス描画、Edge スタイル編集
3. **レイアウト・整列** — 複数選択、グループドラッグ、align/distribute/autoLayout
4. **リッチテキスト** — 太字、色、リスト、チェックボックス、リンク、画像、Embed
5. **Undo/Redo** — デルタベース履歴、マイクロタスクバッチング

### v0.2.0 追加機能

- **autoSize** — 付箋サイズをコンテンツに自動フィット (`autoSize?: boolean`)
- **折り畳み (Collapse)** — ムーブハンドル左端のシェブロンで付箋を折り畳み/展開 (`collapsed?: boolean`)
- **GitHub Pages デモ** — https://kan.github.io/wema/

---

**v0.2.0 リリース済み** — npm (`@kanf/wema`) + GitHub Release + GitHub Pages

---

### Phase 6 — パン & ズーム

設計と進め方は issue #52。パン（`.wema-viewport`、`setViewport` / `revealNotes` / `centerContent`、ホイールやドラッグの操作）は実装済みで、仕様は「表示位置（パン）と座標」の節にある。残りは次のとおり。

- ズーム: Ctrl+ホイール、ピンチ、`zoomTo`、`fitToContent`、`minZoom` / `maxZoom`、ツールバー +/- ボタン。`.wema-viewport` の transform に scale を足す
- ズームの前に行う整理: 表示位置と座標変換を 1 つのクラス（`Viewport`）にまとめる。`pointerdown` で始まる操作（パン、リサイズ、アンカー、付箋のドラッグ、ラバーバンド）の開始判定を 1 か所にまとめる。ドラッグ開始の閾値（`DRAG_THRESHOLD`）は画面のピクセルで比べる
- スタンドアロン版: ズームのボタン、表示位置の保存
- 表示位置は `exportData()` / `importData()` に含めない（各クライアントの表示状態として扱う、と決定済み）

### Phase 7 — 入れ子ボード

付箋を子ボードに見立てた階層構造 (`children?: WemaBoardData`)。
Phase 6 のパン&ズームを活かし、子ボードへの「ズームイン」体験を提供する。

### Phase 8 — モバイル対応

スマホ Web での動作を正式サポート。タッチ操作の最適化、レスポンシブ UI。

### 将来

- React / Vue アダプター (`@kanf/wema-react` / `@kanf/wema-vue` 別パッケージ)
- オンラインコラボレーション (wema ライブラリ + WebSocket の別 Web アプリとして実現、別リポジトリ)
