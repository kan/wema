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
npm run dev          # 開発サーバー起動 (ルートの index.html を Vite で serve)
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
├── .claude/rules/            # 領域ごとの実装ルール (対象のファイルを読んだときに読み込まれる)
├── README.md
├── index.html                # 開発用ページ (npm run dev が serve する)
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
│   ├── viewport.ts           # 表示位置・倍率の状態と座標変換
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
│   ├── wema.css              # CSS (公開パスは @kanf/wema/style.css)
│   └── wema.html             # スタンドアロン版
├── tests/
│   ├── autosize.test.ts
│   ├── board.test.ts
│   ├── edge.test.ts
│   ├── events.test.ts
│   ├── filter.test.ts
│   ├── geometry.test.ts
│   ├── layout.test.ts
│   ├── sanitize.test.ts
│   ├── history.test.ts
│   ├── sync.test.ts
│   └── viewport.test.ts
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
│  ┌─ .wema-viewport (translate + scale、ボード座標) ┐ │
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

### 領域ごとのルール（`.claude/rules/`）

実装の細かい規則は領域ごとに分けてあり、対象のファイルを読んだときに読み込まれる。対象外のファイルから同じ領域に触れるときは、先に該当のルールを読むこと。

| ルール | 内容 | 主な対象 |
|---|---|---|
| `viewport.md` | 表示位置（パンとズーム）と座標変換、ポップアップ類の追従、パンの範囲の制限 | `src/viewport.ts`、`src/board.ts`、ドラッグ・リサイズ・ポップアップ |
| `visibility.md` | 付箋の非表示（折り畳みと絞り込み） | `src/board.ts`、`src/selection.ts` |
| `sync.md` | `history:commit` / `applyRemote`、履歴の再生、参照モード | `src/history.ts`、`src/board.ts` |
| `autosize.md` | autoSize の計測と `note:update` | `src/note.ts` |
| `pointer-and-popup.md` | ドラッグ直後の `click`、ポップアップの DOM 再構築 | `src/drag.ts`、`src/selection.ts`、`src/*-popup.ts` |
| `edge-path.md` | 接続線のパス計算 | `src/edge.ts`、`src/utils/geometry.ts` |
| `layout.md` | レイアウト関数（DOM 非依存） | `src/layout.ts` |
| `standalone.md` | スタンドアロン版の責務とビルド | `standalone/`、`scripts/build-standalone.ts` |

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
  collapsed?: boolean;
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

  // 表示位置と倍率（表示だけを変える。viewport:change のみ発火）
  getViewport(): WemaViewport;                 // { x, y, zoom }
  setViewport(viewport: Partial<WemaViewport>): void;  // zoom は minZoom〜maxZoom に収める
  zoomTo(zoom: number, center?: { clientX: number; clientY: number }): void;  // center（省略時はボードの中央）を動かさない
  revealNotes(noteIds: NoteId[], options?: { padding?: number }): void;       // 倍率は変えない
  centerContent(options?: { noteIds?: NoteId[]; padding?: number }): void;    // 倍率は変えない
  fitToContent(options?: { noteIds?: NoteId[]; padding?: number; maxZoom?: number }): void;  // 収まる倍率にする（既定では等倍を超えない）

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
  wheelZoom?: boolean;         // default: true（Ctrl / Cmd + ホイールでズームする）
  panMargin?: number;          // default: 200（操作でパンできる範囲。付箋の外側に見せる余白。Infinity で無制限）
  minZoom?: number;            // default: 0.25
  maxZoom?: number;            // default: 2
}
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

## CSS カスタマイズ

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

## 実装フェーズ

Phase 1〜6（MVP、接続線、レイアウトと整列、リッチテキスト、Undo / Redo、パンとズーム）は実装済み。リリースごとの変更は `CHANGELOG.md` にある。

### Phase 7 — 入れ子ボード（wema-kake へ引き継ぎ）

付箋を子ボードに見立てた階層構造は、wema では実装しない。wema を使った Wiki である wema-kake（`../wema-kake`、github.com/kan/wema-kake）へ引き継ぐ。wema に `children?: WemaBoardData` のようなデータ構造は足さない。

### Phase 8 — モバイル対応

スマホ Web での動作を正式サポート。タッチ操作の最適化、レスポンシブ UI。

- タッチ操作（1 本指のパン、2 本指のピンチ）
- `pointerdown` で始まる操作（パン、リサイズ、アンカー、付箋のドラッグ、ラバーバンド）の開始判定を 1 か所にまとめる。現在は、パンがキャプチャ段階で先に受け取り、伝播を止めている。タッチ操作を足すときに一緒に行う

### 将来

- React / Vue アダプター (`@kanf/wema-react` / `@kanf/wema-vue` 別パッケージ)
- オンラインコラボレーション (wema ライブラリ + WebSocket の別 Web アプリとして実現、別リポジトリ)
