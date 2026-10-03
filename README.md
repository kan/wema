<p align="center">
  <img src="standalone/favicon.svg" width="96" height="96" alt="wema logo">
</p>

# wema

[![CI](https://github.com/kan/wema/actions/workflows/ci.yml/badge.svg)](https://github.com/kan/wema/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/@kanf/wema.svg)](https://www.npmjs.com/package/@kanf/wema)
[![license](https://img.shields.io/npm/l/@kanf/wema.svg)](./LICENSE)

Web上に付箋を絵馬のように貼って並べる、フレームワーク非依存のTypeScriptライブラリ。

付箋の作成・編集・自由配置・接続線描画を提供する。1ファイルで完結するスタンドアロンHTML版もあり、ブラウザで開くだけで使える。

**[デモを試す](https://kan.github.io/wema/)**

## 使い方

### スタンドアロン版（最も簡単）

[デモページ](https://kan.github.io/wema/)でそのまま使うか、[Releases](https://github.com/kan/wema/releases) から `wema.html` をダウンロードしてブラウザで開く。

- 付箋の追加・編集・ドラッグ移動・リサイズ・削除
- 接続線（Edge）の作成・スタイル編集
- **接続線を空白にドロップ** → そこに新しい付箋を自動作成して接続
- **部分木の折り畳み** → 付箋にカーソルを乗せると折り畳みボタン（−）が出現。クリックで全ての接続先とその子孫を一括非表示。数字バッジをクリックで再展開
- リッチテキスト（太字、テキスト色、箇条書き、チェックボックス、リンク、画像、Embed）
- 複数選択・整列・均等配置・自動レイアウト
- Undo/Redo（Ctrl+Z / Ctrl+Y）
- autoSize モード（コンテンツに合わせて付箋サイズを自動調整）
- 5色のカラーパレット
- IndexedDB による自動保存
- JSON エクスポート/インポート

### npm パッケージ

```bash
npm install @kanf/wema
```

```typescript
import { WemaBoard } from '@kanf/wema';
import '@kanf/wema/style.css';

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
  onImageUpload?: (file: File) => Promise<string>,  // 画像のアップロード先 URL を返す
  onLinkClick?: (url: string, event: MouseEvent) => boolean | void,  // 付箋内のリンクのクリックを処理する
});
```

`onImageUpload` を指定すると、付箋に挿入する画像を data URL で埋め込まず、返された URL の `<img>` として挿入する。アップロードが完了してから挿入し、失敗したときは挿入せずに `image:error` イベントを発火する。未指定のときは従来どおり data URL で埋め込む。

付箋内のリンクは、クリックすると新しいタブで開く。`onLinkClick` を指定すると、クリックのたびにリンク先の URL とクリックイベントを渡して呼び出す。`true` を返した場合は新しいタブを開かないので、同じタブでの遷移などを利用側で行える。それ以外を返した場合は、指定しないときと同じく新しいタブで開く。

```typescript
const board = new WemaBoard({
  container,
  onLinkClick: (url) => {
    const target = new URL(url);
    if (target.origin !== location.origin) return false;  // サイト外は新しいタブで開く
    router.push(target.pathname + target.search + target.hash);
    return true;
  },
});
```

- **渡される URL は、ブラウザが解決した絶対 URL**（`href` 属性の値そのままではない）。サイト内のリンクかどうかは、オリジンを比べて判定すること。`//other.example/x` のように `/` で始まっていても別サイトを指す書き方があるので、文字列の先頭では判定できない
- 呼び出されるのは、URL の安全性の検査（`http` / `https` / `mailto` / `tel`）を通ったリンクだけ
- ブラウザ既定の遷移は wema が止めている（`event.defaultPrevented` は `true`）
- readOnly / viewOnly でも呼び出される

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
| `updateEdge(id, params)` | 接続線を更新（線種・矢印・太さ・折り畳み等） |
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

非表示の付箋（折り畳みや絞り込みで隠れているもの）は選択できない。

#### 絞り込み

| メソッド | 説明 |
|---------|------|
| `setNoteFilter(noteIds)` | 指定した付箋だけを表示する。`null` で解除 |
| `getNoteFilter()` | 表示対象の ID を取得。絞り込んでいなければ `null` |

```typescript
board.setNoteFilter(matchedIds);  // 一致した付箋だけを残す
board.setNoteFilter(null);        // 全部表示に戻す
```

- 表示対象でない付箋と、その付箋につながる接続線を非表示にする
- データは変えない。`note:*` / `edge:*` / `history:commit` / `change` は発火せず、Undo 履歴にも積まれない。`exportData()` は全部の付箋と接続線を返す
- 非表示になった付箋と接続線は選択から外れ、付箋は全選択やラバーバンド選択の対象にもならない
- ID を指定して呼ぶメソッド（`updateNote` / `deleteNote` / `alignNotes` / `autoLayout(noteIds)` など）は、非表示の付箋にも作用する
- `getNoteFilter()` が返すのは現在の表示対象で、`setNoteFilter()` に渡した配列そのものではない（絞り込み中に作成した付箋が加わり、削除した付箋の ID も残る）
- 折り畳み（`collapsed`）と両立する。表示対象の付箋どうしをつなぐ接続線が折り畳まれていれば、その先の付箋は表示対象でも隠れる。両端のどちらかが表示対象でない接続線の折り畳みは、絞り込みの間は無視する（展開するボタンを出せないため）
- readOnly / viewOnly でも使える
- 絞り込み中にユーザーが作成した付箋は、表示対象に加わる。`applyRemote()` で届いた付箋と、Undo / Redo で復活した付箋は加わらず、もう一度 `setNoteFilter()` を呼ぶまで非表示のまま
- 絞り込み中に引数なしで `autoLayout()` を呼ぶと、表示対象の付箋だけを配置する
- `importData()` を呼ぶと絞り込みは解除される

#### レイアウト・整列

| メソッド | 説明 |
|---------|------|
| `alignNotes(noteIds, alignment)` | 付箋を整列（left/center/right/top/middle/bottom） |
| `distributeNotes(noteIds, direction)` | 付箋を均等配置（horizontal/vertical） |
| `autoLayout(noteIds?)` | 自動レイアウト（BFS階層） |

同じ計算を DOM なしで行う関数も export している。サーバー側など `WemaBoard` を作れない環境で使える。どれも入力を変更せず、付箋の新しい位置 `{ id, x, y }` の配列を返す。

| 関数 | 説明 |
|------|------|
| `computeAlignment(notes, alignment)` | 整列後の位置。全付箋の位置を返す |
| `computeDistribution(notes, direction)` | 均等配置後の位置。両端を除く付箋の位置を返す |
| `computeAutoLayout(notes, edges, options?)` | 自動レイアウト後の位置。`options.noteIds` で対象を絞れる |

```typescript
import { computeAutoLayout } from '@kanf/wema';

const positions = computeAutoLayout(data.notes, data.edges);
```

#### Undo/Redo

| メソッド | 説明 |
|---------|------|
| `undo()` | 元に戻す |
| `redo()` | やり直す |
| `canUndo()` | undo可能か |
| `canRedo()` | redo可能か |
| `batch(fn, options?)` | `fn` の中の操作を Undo 1 回分にまとめる。`fn` は同期関数。`options.origin`（`'user'` / `'agent'`）は `history:commit` の `origin` になる |

#### 同期

| メソッド | 説明 |
|---------|------|
| `applyRemote(deltas)` | 他のクライアントやサーバーで起きた変更（`HistoryDelta[]`）を適用する |

使い方は[リアルタイム同期](#リアルタイム同期)を参照。

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
| `note:create` | `{ note, origin }` |
| `note:update` | `{ note, prev, origin }` |
| `note:delete` | `{ note, origin }` |
| `note:select` | `{ noteIds }` |
| `edge:create` | `{ edge, origin }` |
| `edge:update` | `{ edge, prev, origin }` |
| `edge:delete` | `{ edge, origin }` |
| `readOnly:change` | `{ readOnly }` |
| `viewOnly:change` | `{ viewOnly }` |
| `history:change` | `{ canUndo, canRedo }` |
| `history:commit` | `{ deltas, origin }` |
| `image:error` | `{ noteId, file, error }` |
| `change` | `{ data }` |

```typescript
board.on('change', ({ data }) => { /* ... */ });
board.off('change', handler);
```

- `note:*` / `edge:*` の `origin` は、このボードでの操作なら `'local'`、`applyRemote()` による変更なら `'remote'`
- `history:commit` は、ユーザー操作 1 回分（Undo 1 回分）が確定するたびに発火する。`origin` は `'user'` / `'undo'` / `'redo'` / `'agent'`
- `change` の `data` には常に `exportData()` と同じ内容が入る。同じタイミングの変更は 1 回にまとめて発火する

## リアルタイム同期

`history:commit` で確定した変更を送り、受け取った変更を `applyRemote()` で適用する。通信と保存は利用側で実装する（ライブラリは関与しない）。

```typescript
// 送信: 操作が確定するたびに差分を送る
board.on('history:commit', ({ deltas }) => {
  socket.send(JSON.stringify(deltas));
});

// 受信: 他のクライアントの差分を適用する
socket.addEventListener('message', (e) => {
  board.applyRemote(JSON.parse(e.data));
});
```

### `HistoryDelta`

```typescript
type HistoryDelta =
  | { type: 'note:create'; note: WemaNote }
  | { type: 'note:update'; noteId: string; before: Partial<WemaNote>; after: Partial<WemaNote> }
  | { type: 'note:delete'; note: WemaNote }
  | { type: 'edge:create'; edge: WemaEdge }
  | { type: 'edge:update'; edgeId: string; before: Partial<WemaEdge>; after: Partial<WemaEdge> }
  | { type: 'edge:delete'; edge: WemaEdge };
```

- `update` の `before` / `after` には変わったキーだけが入る
- `after` にキーがなく `before` にあるものは「未設定に戻す」を表す。値が `undefined` のキーは JSON にすると消えるため、`applyRemote()` はこの規則で復元する（接続線の `collapsed` を解除したときなど）

### `history:commit` が発火するタイミング

- ドラッグとリサイズは、操作の途中では発火せず、終了時に 1 回だけ発火する（途中経過は `note:update` で受け取れる）
- 1 回の操作の中で同じ付箋や接続線を何度も更新した場合、デルタは 1 件にまとまる（`before` は操作前の値、`after` は操作後の値）。元の値に戻ったキーは含まれず、何も変わらなかった操作では発火しない
- Undo では元の差分を逆向きにしたもの（逆順、create ↔ delete、before ↔ after の入れ替え）、Redo では元の差分が流れる
- `applyRemote()` による変更では発火しない。受け取った変更を送り返すことはない
- 参照モード（viewOnly）中の移動と折り畳み、終了時の復元では発火せず、Undo 履歴にも積まれない。参照モード中でも、`updateNote()` で変えたテキストや色のように終了時に戻らない変更は発火する

### `applyRemote()` の挙動

- readOnly / viewOnly 中でも適用する
- Undo 履歴には積まない。既存の Undo 履歴は消さない
- 対象がすでにない更新と削除、すでにある ID の作成、端点の付箋がない接続線の作成は、そのデルタだけを無視する
- 付箋を削除するとき、その付箋につながる接続線が残っていれば一緒に削除する
- 編集中（フォーカス中）の付箋は、表示中の内容を上書きしない
- 参照モード中に届いた付箋と接続線の作成、位置と折り畳みの変更は、モード終了時の復元先にも反映する
- 更新のデルタで変更できるのは `WemaNote` / `WemaEdge` のフィールドだけ。`id` / `from` / `to` と未知のキーは無視する
- 値の型や範囲は検証しない。信頼できない相手から受け取ったデルタは、利用側で検証してから渡すこと。付箋の `text` は描画時にサニタイズする

### `zIndex` は同期しない

`zIndex` は各クライアントの表示状態として扱う。付箋をクリックして最前面に出したとき、`note:update` と `history:commit` は発火せず、Undo 履歴にも積まれない。同期する側でも `zIndex` は保存や配信の対象から外すことを想定している（`note:create` のデルタには作成時の `zIndex` が含まれる）。

## モード

### ロックモード（readOnly）

付箋の作成・編集・移動・削除、接続線の操作をすべて禁止する。付箋の閲覧と選択は可能。

```typescript
const board = new WemaBoard({ container, readOnly: true });
// または実行時に切り替え
board.setReadOnly(true);
board.setReadOnly(false);
```

スタンドアロン版では 🔒 ボタン（Ctrl+L）で切替。状態はリロード後も保持される。

### 参照モード（viewOnly）

アンカー・リサイズハンドル・ポップアップなど編集 UI をすべて非表示にする。ロックモードより表示がクリーンで、ボードを「見せる」用途に向く。

```typescript
const board = new WemaBoard({ container, viewOnly: true });
// または実行時に切り替え
board.setViewOnly(true);
board.setViewOnly(false);
```

**参照モード中も可能な操作（一時的・データは変更されない）:**
- 付箋のドラッグ移動 — モード終了時に元の位置に戻る
- 部分木の折り畳み/展開 — モード終了時に元の状態に戻る

この 2 つの操作は Undo 履歴に積まれず、`history:commit` も発火しない。参照モード中、`undo()` と `redo()` は何もしない。`viewOnly: true` で作成したボードは、終了時に作成時点の位置と折り畳み状態へ戻る。

スタンドアロン版では 👁 ボタン（Ctrl+Shift+L）で切替。状態はリロード後も保持される。

### モード比較

| 操作 | 通常 | ロック | 参照 |
|------|:----:|:------:|:----:|
| 付箋の閲覧 | ✓ | ✓ | ✓ |
| 付箋の移動 | ✓ | ✗ | ✓（一時的） |
| 付箋の編集 | ✓ | ✗ | ✗ |
| 付箋の追加・削除 | ✓ | ✗ | ✗ |
| 接続線の操作 | ✓ | ✗ | ✗ |
| 折り畳み/展開 | ✓ | ✗ | ✓（一時的） |
| Undo/Redo | ✓ | ✗ | ✗ |

## データモデル

```typescript
interface WemaNote {
  id: string;
  x: number; y: number;
  width: number; height: number;
  text: string;         // HTML文字列
  color: string;
  zIndex: number;       // 重なり順。ローカルな表示状態（同期対象外）
  autoSize?: boolean;   // コンテンツに合わせてサイズ自動調整
}

interface WemaEdge {
  id: string;
  from: string; to: string;
  fromAnchor: 'top' | 'right' | 'bottom' | 'left' | 'auto';
  toAnchor:   'top' | 'right' | 'bottom' | 'left' | 'auto';
  style: 'arrow' | 'line' | 'dashed';
  lineStyle?: 'solid' | 'dashed' | 'dotted';
  arrowHead?: 'none' | 'start' | 'end' | 'both';
  strokeWidth?: number;
  arrowSize?: number;
  routing?: 'curve' | 'polyline';
  label?: string;
  collapsed?: boolean;  // true のとき接続先の部分木を非表示
}
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
