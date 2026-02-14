# wema — 設計ドキュメント v0.1

> Web上に付箋を絵馬のように貼って並べるライブラリ

## 概要

wemaは、フレームワーク非依存のTypeScript付箋ボードライブラリ。
任意のDOM要素にマウントし、テキスト付箋の作成・編集・自由配置・接続線描画を提供する。
データ永続化はライブラリの責務外とし、シリアライズ可能なデータのexport/import APIを提供する。

## 技術スタック

| 項目 | 選定 |
|------|------|
| 言語 | TypeScript (strict mode) |
| パッケージ構成 | 単一パッケージ (`wema`) |
| ビルド | Vite (library mode) |
| 描画 | DOM (付箋) + SVG (接続線) ハイブリッド |
| フレームワーク依存 | なし (Vanilla JS) |
| 出力形式 | ESM + UMD + 型定義 + style.css + スタンドアロンHTML |

## パッケージ構成

```
wema/
├── package.json
├── tsconfig.json
├── vite.config.ts
├── scripts/
│   └── build-standalone.ts   # wema.html ビルドスクリプト
├── src/
│   ├── index.ts              # エントリポイント (public API re-export)
│   ├── types.ts              # 型定義
│   ├── board.ts              # WemaBoard クラス (メインAPI)
│   ├── note.ts               # 付箋の管理・描画
│   ├── edge.ts               # 接続線の管理・描画
│   ├── drag.ts               # ドラッグ&ドロップ
│   ├── layout.ts             # 整列・レイアウトエンジン
│   ├── selection.ts          # 選択状態管理
│   ├── history.ts            # Undo/Redo (将来)
│   ├── events.ts             # イベントシステム
│   └── utils/
│       ├── geometry.ts       # 座標計算・アンカーポイント
│       ├── id.ts             # ID生成
│       └── dom.ts            # DOM操作ヘルパー
├── standalone/
│   └── template.html         # スタンドアロン版のテンプレート (アプリ部分のソース)
├── dist/                     # ビルド成果物
│   ├── wema.js               # ESM バンドル
│   ├── wema.umd.js           # UMD バンドル
│   ├── wema.d.ts             # 型定義
│   ├── style.css             # CSS (単独ファイル)
│   └── wema.html             # スタンドアロン版 (CSS+JS+HTML 全部入り)
└── tests/
    └── ...
```

## 配布形態

### 1. npm パッケージ (`wema`)

ライブラリとして組み込む場合:

```typescript
import { WemaBoard } from 'wema';
import 'wema/style.css';  // バンドラーが解決
```

package.json の exports:

```jsonc
{
  "name": "wema",
  "type": "module",
  "main": "./dist/wema.umd.js",
  "module": "./dist/wema.js",
  "types": "./dist/wema.d.ts",
  "exports": {
    ".": {
      "import": "./dist/wema.js",
      "require": "./dist/wema.umd.js",
      "types": "./dist/wema.d.ts"
    },
    "./style.css": "./dist/style.css"
  },
  "files": ["dist"]
}
```

### 2. スタンドアロン HTML (`wema.html`)

1ファイルで完結するツール。「右クリック→保存」で即使える。
ブラウザで開くだけで付箋ボードとして動作し、IndexedDB にデータを自動保存する。

```
┌─ wema.html ──────────────────────────────────────┐
│                                                    │
│  <style>  ... wema.css (インライン) ...  </style>  │
│  <style>  ... アプリ固有CSS ...          </style>  │
│                                                    │
│  <body>                                            │
│    <div id="toolbar">...</div>                     │
│    <div id="board"></div>                          │
│  </body>                                           │
│                                                    │
│  <script>  ... wema.js (IIFE, インライン) </script>│
│  <script>  ... アプリコード (IndexedDB等) </script>│
│                                                    │
└────────────────────────────────────────────────────┘
```

ビルドプロセス:

```
src/*.ts ──→ vite build (library) ──→ dist/wema.js, dist/style.css
                                           │              │
standalone/template.html ──────────────────┼──────────────┤
                                           ↓              ↓
scripts/build-standalone.ts ──→ dist/wema.html (CSS+JS インライン化)
```

`standalone/template.html` にはアプリ固有のコードを記述:
- ツールバーUI (新規作成、色変更、整列ボタン等)
- IndexedDB による自動保存/読み込み
- キーボードショートカット
- エクスポート/インポート機能 (JSONファイル)

## データモデル (`types.ts`)

```typescript
// ======== Core Types ========

export type NoteId = string;
export type EdgeId = string;

export type Anchor = 'top' | 'right' | 'bottom' | 'left' | 'auto';

export type EdgeStyle = 'arrow' | 'line' | 'dashed';

export interface WemaNote {
  id: NoteId;
  x: number;
  y: number;
  width: number;
  height: number;
  text: string;
  color: string;       // CSS color
  zIndex: number;
}

export interface WemaEdge {
  id: EdgeId;
  from: NoteId;
  to: NoteId;
  fromAnchor: Anchor;  // default: 'auto'
  toAnchor: Anchor;    // default: 'auto'
  style: EdgeStyle;    // default: 'arrow'
  label?: string;
}

// ボード全体のシリアライズ可能な状態
export interface WemaBoardData {
  version: 1;
  notes: WemaNote[];
  edges: WemaEdge[];
  viewport?: { x: number; y: number; zoom: number };
}

// ======== Options ========

export interface WemaBoardOptions {
  /** マウント先のDOM要素 */
  container: HTMLElement;

  /** 初期データ */
  data?: WemaBoardData;

  /** 付箋のデフォルト幅 */
  defaultNoteWidth?: number;   // default: 200

  /** 付箋のデフォルト高さ */
  defaultNoteHeight?: number;  // default: 150

  /** 付箋のデフォルト色 */
  defaultNoteColor?: string;   // default: '#FFF9C4'

  /** ダブルクリックで付箋を新規作成するか */
  createOnDblClick?: boolean;  // default: true

  /** 読み取り専用モード */
  readOnly?: boolean;          // default: false
}

// ======== Events ========

export interface WemaEventMap {
  'note:create':  { note: WemaNote };
  'note:update':  { note: WemaNote; prev: WemaNote };
  'note:delete':  { note: WemaNote };
  'note:select':  { noteIds: NoteId[] };
  'edge:create':  { edge: WemaEdge };
  'edge:delete':  { edge: WemaEdge };
  'change':       { data: WemaBoardData };  // あらゆる変更時に発火
}
```

## Public API (`board.ts`)

```typescript
export class WemaBoard {
  constructor(options: WemaBoardOptions);

  // ── ライフサイクル ──
  destroy(): void;

  // ── 付箋操作 ──
  addNote(params?: Partial<Omit<WemaNote, 'id'>>): WemaNote;
  updateNote(id: NoteId, params: Partial<WemaNote>): void;
  deleteNote(id: NoteId): void;
  getNote(id: NoteId): WemaNote | undefined;
  getNotes(): WemaNote[];

  // ── 接続線操作 ──
  addEdge(from: NoteId, to: NoteId, params?: Partial<Omit<WemaEdge, 'id' | 'from' | 'to'>>): WemaEdge;
  deleteEdge(id: EdgeId): void;
  getEdges(): WemaEdge[];
  getEdgesOf(noteId: NoteId): WemaEdge[];  // 特定の付箋に接続された線

  // ── 選択 ──
  select(noteIds: NoteId[]): void;
  selectAll(): void;
  getSelection(): NoteId[];

  // ── レイアウト ──
  alignNotes(noteIds: NoteId[], alignment: 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom'): void;
  distributeNotes(noteIds: NoteId[], direction: 'horizontal' | 'vertical'): void;
  autoLayout(noteIds?: NoteId[]): void;  // グラフ構造を考慮した自動配置

  // ── データ入出力 ──
  exportData(): WemaBoardData;
  importData(data: WemaBoardData): void;

  // ── イベント ──
  on<K extends keyof WemaEventMap>(event: K, handler: (payload: WemaEventMap[K]) => void): void;
  off<K extends keyof WemaEventMap>(event: K, handler: (payload: WemaEventMap[K]) => void): void;
}
```

## DOM構造

```html
<!-- container に自動生成される -->
<div class="wema-board" tabindex="0">

  <!-- 接続線レイヤー (SVG) -->
  <svg class="wema-edges" width="100%" height="100%">
    <defs>
      <marker id="wema-arrowhead" viewBox="0 0 10 10"
              refX="10" refY="5" markerWidth="8" markerHeight="8"
              orient="auto-start-reverse">
        <path d="M 0 0 L 10 5 L 0 10 Z" fill="currentColor" />
      </marker>
    </defs>
    <g class="wema-edge" data-edge-id="edge-1">
      <path d="M 100,75 C 200,75 200,225 300,225"
            stroke="#666" stroke-width="2" fill="none"
            marker-end="url(#wema-arrowhead)" />
    </g>
  </svg>

  <!-- 付箋レイヤー -->
  <div class="wema-note" data-note-id="note-1"
       style="left: 50px; top: 50px; width: 200px; min-height: 150px;
              background: #FFF9C4; z-index: 1;">
    <div class="wema-note-content" contenteditable="true">
      付箋のテキスト
    </div>
    <div class="wema-note-anchors">
      <div class="wema-anchor" data-anchor="top"></div>
      <div class="wema-anchor" data-anchor="right"></div>
      <div class="wema-anchor" data-anchor="bottom"></div>
      <div class="wema-anchor" data-anchor="left"></div>
    </div>
  </div>

</div>
```

## 接続線のパス計算 (`geometry.ts`)

```
fromAnchor / toAnchor が 'auto' の場合:
  1. 2つの付箋の中心座標を結ぶ直線の方向を求める
  2. 出発側: 直線が付箋の辺を横切る位置に最も近いアンカー (top/right/bottom/left) を選択
  3. 到着側: 同様に最も近いアンカーを選択
  4. 3次ベジェ曲線 (cubic bezier) でパスを生成
     - 制御点はアンカーの法線方向にオフセット
     - オフセット量は2点間の距離に比例 (min: 40px, max: 150px)
```

## 接続線の作成UX

```
1. 付箋にホバー → アンカーポイント (●) が4辺に表示
2. アンカーをドラッグ開始 → 仮の線がマウスに追従
3. 別の付箋のアンカー (またはボディ) にドロップ → Edge 作成
4. 空白にドロップ → キャンセル
```

## 利用側コード例

### A. npm パッケージとして組み込む場合

```typescript
import { WemaBoard } from 'wema';
import 'wema/style.css';

const board = new WemaBoard({
  container: document.getElementById('board')!,
  createOnDblClick: true,
});

// 変更を任意の方法で保存
board.on('change', ({ data }) => {
  myStorage.save(data);
});
```

### B. スタンドアロン HTML (`standalone/template.html` 概要)

ビルド時にCSS・JSがインライン化されて `dist/wema.html` になる。
template.html 側は wema ライブラリが既にグローバル (`window.Wema`) に
存在する前提で、アプリロジックだけを記述する。

```html
<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>wema</title>
  <!-- build-standalone.ts が以下を注入 -->
  <!-- __WEMA_CSS__ -->
  <style>
    /* アプリ固有のスタイル */
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { overflow: hidden; }
    #toolbar {
      position: fixed; top: 0; left: 0; right: 0;
      height: 48px; background: #f5f5f5; border-bottom: 1px solid #ddd;
      display: flex; align-items: center; padding: 0 12px; gap: 8px;
      z-index: 1000;
    }
    #board { position: fixed; top: 48px; left: 0; right: 0; bottom: 0; }
  </style>
</head>
<body>
  <div id="toolbar">
    <button id="btn-add">+ 付箋</button>
    <button id="btn-color">色</button>
    <span style="flex:1"></span>
    <button id="btn-export">エクスポート</button>
    <button id="btn-import">インポート</button>
  </div>
  <div id="board"></div>

  <!-- build-standalone.ts が以下を注入 -->
  <!-- __WEMA_JS__ -->
  <script>
    // ── IndexedDB ──
    const DB_NAME = 'wema-standalone';
    const DB_VER = 1;
    const STORE = 'boards';
    const BOARD_KEY = 'default';

    function openDB() {
      return new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, DB_VER);
        req.onupgradeneeded = () => req.result.createObjectStore(STORE);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
    }

    async function load() {
      const db = await openDB();
      return new Promise((resolve) => {
        const tx = db.transaction(STORE, 'readonly');
        const req = tx.objectStore(STORE).get(BOARD_KEY);
        req.onsuccess = () => resolve(req.result ?? null);
      });
    }

    async function save(data) {
      const db = await openDB();
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(data, BOARD_KEY);
    }

    // ── 初期化 ──
    (async () => {
      const savedData = await load();

      const board = new Wema.WemaBoard({
        container: document.getElementById('board'),
        data: savedData ?? undefined,
        createOnDblClick: true,
      });

      // 自動保存 (300ms debounce)
      let timer;
      board.on('change', ({ data }) => {
        clearTimeout(timer);
        timer = setTimeout(() => save(data), 300);
      });

      // ── ツールバー ──
      document.getElementById('btn-add').onclick = () => board.addNote();

      document.getElementById('btn-export').onclick = () => {
        const json = JSON.stringify(board.exportData(), null, 2);
        const blob = new Blob([json], { type: 'application/json' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'wema-board.json';
        a.click();
      };

      document.getElementById('btn-import').onclick = () => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';
        input.onchange = async () => {
          const text = await input.files[0].text();
          const data = JSON.parse(text);
          board.importData(data);
        };
        input.click();
      };
    })();
  </script>
</body>
</html>
```

## 整列機能 (`layout.ts`)

```
手動整列 (alignNotes / distributeNotes):
  - 選択された付箋群に対して操作
  - align: 指定方向の座標を揃える (例: 'left' → 全付箋のxを最小値に統一)
  - distribute: 等間隔に配置

自動レイアウト (autoLayout):
  - Edge情報からグラフ構造を構築
  - 階層レイアウト (Sugiyama風) を適用
    1. 接続方向からレイヤー (rank) を割り当て
    2. レイヤー内でクロッシング最小化
    3. 座標割り当て
  - Edge の無い孤立ノードはグリッド配置
```

## ビルド

```jsonc
// package.json scripts
{
  "scripts": {
    "dev": "vite",                           // 開発サーバー
    "build": "vite build && npm run build:standalone",
    "build:lib": "vite build",               // ESM + UMD + CSS + 型定義
    "build:standalone": "tsx scripts/build-standalone.ts",
    "preview": "vite preview"
  }
}
```

### Vite library mode 設定

```typescript
// vite.config.ts
import { defineConfig } from 'vite';
import { resolve } from 'path';
import dts from 'vite-plugin-dts';

export default defineConfig({
  plugins: [dts({ rollupTypes: true })],
  build: {
    lib: {
      entry: resolve(__dirname, 'src/index.ts'),
      name: 'Wema',           // UMD のグローバル名
      formats: ['es', 'umd'],
      fileName: (format) => format === 'es' ? 'wema.js' : 'wema.umd.js',
    },
    cssFileName: 'style',
  },
});
```

### スタンドアロンHTMLビルド (`scripts/build-standalone.ts`)

```typescript
// dist/wema.umd.js と dist/style.css を読み込み、
// standalone/template.html の所定のコメントに注入して
// dist/wema.html を生成する

import { readFileSync, writeFileSync } from 'fs';

const template = readFileSync('standalone/template.html', 'utf-8');
const css = readFileSync('dist/style.css', 'utf-8');
const js = readFileSync('dist/wema.umd.js', 'utf-8');

const html = template
  .replace('<!-- __WEMA_CSS__ -->', `<style>\n${css}\n</style>`)
  .replace('<!-- __WEMA_JS__ -->', `<script>\n${js}\n</script>`);

writeFileSync('dist/wema.html', html, 'utf-8');
console.log('✅ dist/wema.html generated');
```

## CI/CD (GitHub Actions)

### 1. CI (`ci.yml`) — 全プッシュ・PR で実行

```yaml
name: CI
on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  build-and-test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: npm ci
      - run: npm run lint
      - run: npm test
      - run: npm run build
      - uses: actions/upload-artifact@v4
        with:
          name: wema-html
          path: dist/wema.html
```

### 2. Release (`release.yml`) — タグ push で実行

2つのジョブを持つ:
- **release-html**: `wema.html` を GitHub Release にアセットとして添付
- **publish-npm**: npm レジストリに publish (当面は手動 dispatch のみ)

```yaml
name: Release
on:
  push:
    tags: ['v*']

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          registry-url: 'https://registry.npmjs.org'
      - run: npm ci
      - run: npm run build

      # GitHub Release を作成し wema.html を添付
      - uses: softprops/action-gh-release@v2
        with:
          files: dist/wema.html
          generate_release_notes: true

  # npm publish は当面コメントアウト。準備ができたら有効化する
  # publish-npm:
  #   needs: build
  #   runs-on: ubuntu-latest
  #   steps:
  #     - uses: actions/checkout@v4
  #     - uses: actions/setup-node@v4
  #       with:
  #         node-version: 20
  #         registry-url: 'https://registry.npmjs.org'
  #     - run: npm ci
  #     - run: npm run build
  #     - run: npm publish
  #       env:
  #         NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
```

### リリースフロー

```
開発 → main に merge → CI (テスト・ビルド)
                            ↓ OK
                    git tag v0.1.0 && git push --tags
                            ↓
                    Release workflow 起動
                            ↓
                    GitHub Release 作成 + wema.html 添付
                    (将来: npm publish)
```

ユーザーは GitHub Releases ページから `wema.html` をダウンロードして使える。

## 実装の優先順位

### Phase 1 — MVP
1. ボードのマウント・破棄
2. 付箋の作成・テキスト編集・削除
3. ドラッグ&ドロップ移動
4. exportData / importData
5. `change` イベント
6. デフォルト CSS
7. Vite library build + スタンドアロンHTMLビルド
8. スタンドアロン版 (ツールバー + IndexedDB 保存)
9. GitHub Actions (CI + Release)

### Phase 2 — 接続線
7. アンカーポイント表示
8. ドラッグによるEdge作成
9. SVGパス描画 (auto anchor計算)
10. Edge削除

### Phase 3 — レイアウト・整列
11. 複数選択
12. alignNotes / distributeNotes
13. autoLayout

### Phase 4 — 将来
- パン & ズーム
- Undo / Redo
- 画像付箋
- リアルタイムコラボレーション
- React / Vue アダプター
