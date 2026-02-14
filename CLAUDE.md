# CLAUDE.md — wema 開発ガイド

## プロジェクト概要

wemaは、Web上に付箋を絵馬のように貼って並べるフレームワーク非依存のTypeScriptライブラリ。
付箋の作成・編集・自由配置・接続線描画を提供する。

2つの配布形態がある:
1. **npmパッケージ** (`wema`) — ライブラリとして組み込む
2. **スタンドアロンHTML** (`wema.html`) — 1ファイルで完結するツール。ブラウザで開くだけで使える

## リポジトリ構成

```
wema/
├── CLAUDE.md                 # このファイル
├── README.md
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
│   ├── drag.ts               # ドラッグ&ドロップ
│   ├── layout.ts             # 整列・レイアウトエンジン
│   ├── selection.ts          # 選択状態管理
│   ├── events.ts             # イベントシステム
│   ├── style.css             # デフォルトスタイル
│   └── utils/
│       ├── geometry.ts       # 座標計算・アンカーポイント
│       ├── id.ts             # ID生成
│       └── dom.ts            # DOM操作ヘルパー
├── standalone/
│   └── template.html         # スタンドアロン版テンプレート
├── dist/                     # ビルド成果物 (gitignore)
│   ├── wema.js               # ESM
│   ├── wema.umd.js           # UMD (グローバル名: Wema)
│   ├── wema.d.ts             # 型定義
│   ├── style.css             # CSS
│   └── wema.html             # スタンドアロン版
├── .github/
│   └── workflows/
│       ├── ci.yml            # テスト・ビルド
│       └── release.yml       # リリース (HTML配布 + npm publish)
└── tests/
    └── ...
```

## 技術スタック

- **言語**: TypeScript (strict mode)
- **ビルド**: Vite (library mode)
- **描画**: DOM (付箋) + SVG (接続線) ハイブリッド
- **フレームワーク依存**: なし
- **テスト**: Vitest
- **出力**: ESM + UMD + 型定義 + style.css + スタンドアロンHTML

## コマンド

```bash
npm install          # 依存インストール
npm run dev          # 開発サーバー起動 (standalone/template.html を Vite で serve)
npm run build        # ライブラリビルド + スタンドアロンHTMLビルド
npm run build:lib    # ライブラリのみビルド
npm run build:standalone  # スタンドアロンHTMLのみビルド
npm test             # テスト実行
npm run lint         # リント
```

## アーキテクチャ

### 描画方式: DOM + SVG ハイブリッド

- **付箋 (ノード)** → DOM要素 (`div`, `contenteditable` でテキスト編集)
- **接続線 (エッジ)** → SVG `<path>` + `<marker>` で矢印描画
- **ボード全体** → 相対配置の `div` コンテナ

```
┌─ .wema-board ────────────────────────────────────┐
│  ┌─ svg.wema-edges (position: absolute, 全面) ──┐│
│  │  <path> ... </path>                           ││
│  └───────────────────────────────────────────────┘│
│  ┌─ .wema-note (position: absolute) ─┐           │
│  │  .wema-note-content (contenteditable)          │
│  │  .wema-note-anchors (接続ポイント4辺)          │
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
type EdgeStyle = 'arrow' | 'line' | 'dashed';

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
  fromAnchor: Anchor;   // default: 'auto'
  toAnchor: Anchor;     // default: 'auto'
  style: EdgeStyle;     // default: 'arrow'
  label?: string;
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
  addEdge(from: NoteId, to: NoteId, params?: Partial<Omit<WemaEdge, 'id' | 'from' | 'to'>>): WemaEdge;
  deleteEdge(id: EdgeId): void;
  getEdges(): WemaEdge[];
  getEdgesOf(noteId: NoteId): WemaEdge[];

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

  // イベント
  on<K extends keyof WemaEventMap>(event: K, handler: (payload: WemaEventMap[K]) => void): void;
  off<K extends keyof WemaEventMap>(event: K, handler: (payload: WemaEventMap[K]) => void): void;
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
}
```

### イベント

```typescript
interface WemaEventMap {
  'note:create': { note: WemaNote };
  'note:update': { note: WemaNote; prev: WemaNote };
  'note:delete': { note: WemaNote };
  'note:select': { noteIds: NoteId[] };
  'edge:create': { edge: WemaEdge };
  'edge:delete': { edge: WemaEdge };
  'change':      { data: WemaBoardData };
}
```

## 実装上の注意点

### 付箋のテキスト編集

- `contenteditable="true"` を使用
- ドラッグ中は `contenteditable` を一時的に `false` にして、テキスト選択と干渉しないようにする
- フォーカスアウト時に `note:update` と `change` を発火

### ドラッグ&ドロップ

- `pointerdown` / `pointermove` / `pointerup` を使用 (touch対応のため)
- ドラッグ開始は mousedown から数px 移動してから (クリックとの区別)
- ドラッグ中は付箋に接続されたエッジのSVGパスをリアルタイム更新

### 接続線のパス計算

- `fromAnchor` / `toAnchor` が `'auto'` の場合:
  1. 2つの付箋の中心座標を結ぶ方向を算出
  2. 出発側/到着側それぞれ、直線が辺を横切る位置に最も近いアンカーを選択
  3. 3次ベジェ曲線 (cubic bezier) でパス生成
  4. 制御点はアンカーの法線方向にオフセット (距離に比例、40px〜150px)

### 接続線の作成UX

1. 付箋にホバー → アンカーポイント (●) が4辺中央に表示
2. アンカーをドラッグ開始 → 仮の線がマウスに追従
3. 別の付箋のアンカーまたはボディにドロップ → Edge作成
4. 空白にドロップ → キャンセル

### CSS設計

- 全セレクタは `.wema-` プレフィックス付き (衝突回避)
- CSS変数で主要な値をカスタマイズ可能にする:
  ```css
  .wema-board {
    --wema-note-border-radius: 4px;
    --wema-note-shadow: 0 2px 8px rgba(0,0,0,0.15);
    --wema-note-font-size: 14px;
    --wema-anchor-size: 12px;
    --wema-anchor-color: #4A90D9;
    --wema-edge-color: #666;
    --wema-edge-width: 2px;
  }
  ```

### ID生成

- `crypto.randomUUID()` を使用 (全モダンブラウザ対応)
- フォールバック不要 (サポート範囲を考慮)

## スタンドアロン版 (`standalone/template.html`)

ライブラリとは独立したアプリケーションコード。
ビルド時に `scripts/build-standalone.ts` が CSS と UMD バンドルをインライン注入して
`dist/wema.html` を生成する。

### template.html の責務

- ツールバーUI (付箋追加、色変更、整列ボタン等)
- IndexedDB によるデータ自動保存 (`change` イベント + 300ms debounce)
- JSON ファイルのエクスポート/インポート
- キーボードショートカット (Delete で削除 等)

### ビルドスクリプトの仕組み

`standalone/template.html` 内に以下のプレースホルダコメントを置く:
- `<!-- __WEMA_CSS__ -->` → `<style>dist/style.css の中身</style>` に置換
- `<!-- __WEMA_JS__ -->` → `<script>dist/wema.umd.js の中身</script>` に置換

テンプレート内のアプリコードは `window.Wema` (UMDグローバル) を参照する。

## 実装フェーズ

### Phase 1 — MVP (まずここを完成させる)

1. プロジェクトセットアップ (package.json, tsconfig, vite.config.ts)
2. 型定義 (`types.ts`)
3. イベントシステム (`events.ts`)
4. WemaBoard クラスの骨格 (`board.ts`) — マウント・破棄
5. 付箋の作成・テキスト編集・削除 (`note.ts`)
6. ドラッグ&ドロップ (`drag.ts`)
7. exportData / importData
8. `change` イベント
9. デフォルト CSS (`style.css`)
10. スタンドアロン版テンプレート (`standalone/template.html`)
11. ビルドスクリプト (`scripts/build-standalone.ts`)
12. GitHub Actions CI

### Phase 2 — 接続線

13. アンカーポイント表示
14. ドラッグによるEdge作成
15. SVGパス描画 (auto anchor計算) (`edge.ts`, `utils/geometry.ts`)
16. Edge削除

### Phase 3 — レイアウト・整列

17. 複数選択 (`selection.ts`)
18. alignNotes / distributeNotes (`layout.ts`)
19. autoLayout (グラフ構造を考慮した自動配置)

### Phase 4 — 将来

- パン & ズーム
- Undo / Redo (`history.ts`)
- 画像付箋
- リアルタイムコラボレーション
- React / Vue アダプター

## 開発時の注意

- **外部依存ゼロ** を維持する (devDependencies は OK)
- TypeScript は strict mode で書く
- 全ての public API に JSDoc コメントをつける
- テストは Vitest で、少なくともデータモデル操作 (CRUD) とイベント発火をカバーする
