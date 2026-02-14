# wema

Web上に付箋を絵馬のように貼って並べる、フレームワーク非依存のTypeScriptライブラリ。

付箋の作成・編集・自由配置を提供する。1ファイルで完結するスタンドアロンHTML版もあり、ブラウザで開くだけで使える。

## 使い方

### スタンドアロン版（最も簡単）

[Releases](https://github.com/kan/wema/releases) から `wema.html` をダウンロードしてブラウザで開くだけ。

- 付箋の追加・編集・ドラッグ移動・削除
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

#### 選択

| メソッド | 説明 |
|---------|------|
| `select(noteIds)` | 付箋を選択 |
| `selectAll()` | 全選択 |
| `getSelection()` | 選択中のIDを取得 |

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
  --wema-anchor-size: 12px;
  --wema-anchor-color: #4A90D9;
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

MIT
