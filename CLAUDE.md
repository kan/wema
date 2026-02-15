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
│   └── build-standalone.ts   # wema.html ビルドスクリプト
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
        └── release.yml       # リリース (HTML配布 + npm publish)
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
┌─ .wema-board ────────────────────────────────────┐
│  ┌─ svg.wema-edges (position: absolute, 全面) ──┐│
│  │  <path> ... </path>                           ││
│  └───────────────────────────────────────────────┘│
│  ┌─ .wema-note (position: absolute) ─┐           │
│  │  .wema-move-handle (ドラッグ用グリップ)        │
│  │  .wema-note-content (contenteditable)          │
│  │  .wema-note-anchors (接続ポイント4辺)          │
│  │  .wema-resize-handle (リサイズ)                │
│  └────────────────────────────────────┘           │
└──────────────────────────────────────────────────┘
```

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
  viewport?: { x: number; y: number; zoom: number };
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

  // レイアウト
  alignNotes(noteIds: NoteId[], alignment: 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom'): void;
  distributeNotes(noteIds: NoteId[], direction: 'horizontal' | 'vertical'): void;
  autoLayout(noteIds?: NoteId[]): void;

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
}
```

### イベント

```typescript
interface WemaEventMap {
  'note:create':     { note: WemaNote };
  'note:update':     { note: WemaNote; prev: WemaNote };
  'note:delete':     { note: WemaNote };
  'note:select':     { noteIds: NoteId[] };
  'edge:create':     { edge: WemaEdge };
  'edge:update':     { edge: WemaEdge; prev: WemaEdge };
  'edge:delete':     { edge: WemaEdge };
  'readOnly:change': { readOnly: boolean };
  'viewOnly:change': { viewOnly: boolean };
  'history:change':  { canUndo: boolean; canRedo: boolean };
  'change':          { data: WemaBoardData };
}
```

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

---

**v0.1.0 リリース済み** — npm (`@kanf/wema`) + GitHub Release (`wema.html` 配布)

---

### Phase 6 — パン & ズーム

CSS transform (translate + scale) をボード内コンテナ (`.wema-viewport`) に適用する方式。
- ズーム: Ctrl+ホイール、ピンチ、ツールバー +/- ボタン
- パン: 中ボタンドラッグ、Space+ドラッグ
- 全座標系にビューポート変換を挟む (ドラッグ、リサイズ、ラバーバンド、アンカードラッグ、ダブルクリック作成)
- SVG 層も同じ transform を適用
- `exportData()` / `importData()` の `viewport` フィールドを実際に使う
- ビューポート操作は Undo/Redo 対象外

### Phase 7 — 入れ子ボード

付箋を子ボードに見立てた階層構造 (`children?: WemaBoardData`)。
Phase 6 のパン&ズームを活かし、子ボードへの「ズームイン」体験を提供する。

### Phase 8 — モバイル対応

スマホ Web での動作を正式サポート。タッチ操作の最適化、レスポンシブ UI。

### 将来

- React / Vue アダプター (`@kanf/wema-react` / `@kanf/wema-vue` 別パッケージ)
- オンラインコラボレーション (wema ライブラリ + WebSocket の別 Web アプリとして実現、別リポジトリ)
