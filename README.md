# wema

[![CI](https://github.com/kan/wema/actions/workflows/ci.yml/badge.svg)](https://github.com/kan/wema/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/wema.svg)](https://www.npmjs.com/package/wema)
[![license](https://img.shields.io/npm/l/wema.svg)](./LICENSE)

Web上に付箋を絵馬のように貼って並べる、フレームワーク非依存のTypeScriptライブラリ。

付箋の作成・編集・自由配置・接続線描画を提供する。1ファイルで完結するスタンドアロンHTML版もあり、ブラウザで開くだけで使える。

## 使い方

### スタンドアロン版（最も簡単）

[Releases](https://github.com/kan/wema/releases) から `wema.html` をダウンロードしてブラウザで開くだけ。

- 付箋の追加・編集・ドラッグ移動・リサイズ・削除
- 接続線（Edge）の作成・スタイル編集
- リッチテキスト（太字、テキスト色、箇条書き、チェックボックス、リンク、画像、Embed）
- 複数選択・整列・均等配置・自動レイアウト
- Undo/Redo（Ctrl+Z / Ctrl+Y）
- 5色のカラーパレット
- IndexedDB による自動保存
- JSON エクスポート/インポート

### npm パッケージ

```bash
npm install wema
```

```typescript
import { WemaBoard } from 'wema';
import 'wema/style.css';

const board = new WemaBoard({
  container: document.getElementById('board'),
});

// 付箋を追加
const note = board.addNote({ x: 100, y: 80, text: 'Hello!' });

// 接続線を追加
const note2 = board.addNote({ x: 400, y: 80, text: 'World!' });
board.addEdge(note.id, note2.id);

// データをエクスポート
const data = board.exportData();

// イベントを購読
board.on('change', ({ data }) => {
  console.log('Board changed:', data);
});
```

## API

### `WemaBoard`

```typescript
const board = new WemaBoard({
  container: HTMLElement,       // マウント先
  data?: WemaBoardData,        // 初期データ
  defaultNoteWidth?: number,   // default: 200
  defaultNoteHeight?: number,  // default: 150
  defaultNoteColor?: string,   // default: '#FFF9C4'
  createOnDblClick?: boolean,  // default: true
  readOnly?: boolean,          // default: false
  viewOnly?: boolean,          // default: false
  theme?: NoteTheme,           // default: 'default' ('default' | 'card')
});
```

#### 付箋

| メソッド | 説明 |
|---------|------|
| `addNote(params?)` | 付箋を追加 |
| `updateNote(id, params)` | 付箋を更新 |
| `deleteNote(id)` | 付箋を削除 |
| `getNote(id)` | IDで取得 |
| `getNotes()` | 全付箋を取得 |

#### 接続線（Edge）

| メソッド | 説明 |
|---------|------|
| `addEdge(from, to, params?)` | 接続線を追加 |
| `updateEdge(id, params)` | 接続線を更新（線種・矢印・太さ等） |
| `deleteEdge(id)` | 接続線を削除 |
| `getEdges()` | 全接続線を取得 |
| `getEdgesOf(noteId)` | 指定付箋に接続された線を取得 |
| `getSelectedEdge()` | 選択中の接続線IDを取得 |

#### 選択

| メソッド | 説明 |
|---------|------|
| `select(noteIds)` | 付箋を選択 |
| `selectAll()` | 全選択 |
| `getSelection()` | 選択中のIDを取得 |

#### レイアウト・整列

| メソッド | 説明 |
|---------|------|
| `alignNotes(noteIds, alignment)` | 付箋を整列（left/center/right/top/middle/bottom） |
| `distributeNotes(noteIds, direction)` | 付箋を均等配置（horizontal/vertical） |
| `autoLayout(noteIds?)` | 自動レイアウト（BFS階層） |

#### Undo/Redo

| メソッド | 説明 |
|---------|------|
| `undo()` | 元に戻す |
| `redo()` | やり直す |
| `canUndo()` | undo可能か |
| `canRedo()` | redo可能か |

#### 状態管理

| メソッド | 説明 |
|---------|------|
| `setReadOnly(readOnly)` | 読み取り専用モードを設定 |
| `isReadOnly()` | 読み取り専用か |
| `setViewOnly(viewOnly)` | 閲覧専用モードを設定（UIも非表示） |
| `isViewOnly()` | 閲覧専用か |
| `setTheme(theme)` | テーマを設定（'default' / 'card'） |
| `getTheme()` | 現在のテーマを取得 |

#### データ入出力

| メソッド | 説明 |
|---------|------|
| `exportData()` | ボードデータをオブジェクトで返す |
| `importData(data)` | データを読み込み（現在の内容を置換） |

#### イベント

| イベント | ペイロード |
|---------|-----------|
| `note:create` | `{ note }` |
| `note:update` | `{ note, prev }` |
| `note:delete` | `{ note }` |
| `note:select` | `{ noteIds }` |
| `edge:create` | `{ edge }` |
| `edge:update` | `{ edge, prev }` |
| `edge:delete` | `{ edge }` |
| `readOnly:change` | `{ readOnly }` |
| `viewOnly:change` | `{ viewOnly }` |
| `history:change` | `{ canUndo, canRedo }` |
| `change` | `{ data }` |

```typescript
board.on('change', ({ data }) => { /* ... */ });
board.off('change', handler);
```

## CSS カスタマイズ

CSS変数でスタイルを調整できる:

```css
.wema-board {
  --wema-note-border-radius: 4px;
  --wema-note-shadow: 0 2px 8px rgba(0,0,0,0.15);
  --wema-note-font-size: 14px;
  --wema-note-color-text: #333;
  --wema-anchor-size: 12px;
  --wema-anchor-color: #4A90D9;
  --wema-edge-color: #555;
  --wema-edge-width: 2px;
}
```

## 開発

```bash
npm install          # 依存インストール
npm run dev          # 開発サーバー (HMR)
npm run build        # ビルド (dist/)
npm test             # テスト
npm run lint         # 型チェック
```

## ライセンス

[MIT](./LICENSE)
