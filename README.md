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
- リッチテキスト（太字、取り消し線、テキスト色、箇条書き、チェックボックス、リンク、画像、Embed）
- リストの段下げと段上げ（Tab / Shift+Tab）
- 複数選択・整列・均等配置・自動レイアウト
- Undo/Redo（Ctrl+Z / Ctrl+Y）
- autoSize モード（コンテンツに合わせて付箋サイズを自動調整）
- 長い付箋を畳んで表示（3 行以上の付箋は冒頭だけを見せ、「続きを読む」で開く）
- リサイズハンドルのダブルクリックで、付箋をコンテンツに合うサイズへ 1 回だけ変更
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
  renderNote?: (note: WemaNote, container: HTMLElement) => boolean | void,  // 付箋の中身を利用側が描く
  labels?: Partial<WemaLabels>,  // 画面の文言（ボタンの説明、接続線のポップアップの見出しなど）。省略したキーは英語
  foldLabels?: { more?: string, less?: string },  // 畳んだ付箋を開閉するリンクの文言。labels の readMore / showLess と同じもの
  wheelPan?: boolean,          // default: true（ホイールで表示位置を動かす）
  wheelZoom?: boolean,         // default: true（Ctrl / Cmd + ホイールで拡大・縮小する）
  emptyDrag?: 'select' | 'pan',  // default: 'select'（空いている場所の左ドラッグ。'pan' でパン、選択は Shift か Ctrl / Cmd + ドラッグ）
  panMargin?: number,          // default: 200（操作でパンできる範囲。付箋の外側に見せる余白のピクセル数）
  minZoom?: number,            // default: 0.25
  maxZoom?: number,            // default: 2
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
- 呼び出されるのは、URL の安全性の検査（`http` / `https` / `mailto` / `tel`、および相対リンク）を通ったリンクだけ。検査を通らないリンクは、クリックしても何も開かない
- 新しいタブで開くときも、同じ解決済みの URL を使う
- ブラウザ既定の遷移は wema が止めている（`event.defaultPrevented` は `true`）
- readOnly / viewOnly でも呼び出される

#### 画面の文言（`labels`）

wema が描く UI の文言は、何も指定しなければ英語で出る。対象は、付箋のポップアップ、接続線のポップアップ、文字のツールバー、画像の上のボタン、畳んだ付箋の開閉のリンク。`labels` オプションで差し替えられる。日本語の文言は `jaLabels` として同梱している。

```typescript
import { WemaBoard, jaLabels } from '@kanf/wema';

const board = new WemaBoard({ container, labels: jaLabels });
```

一部だけを変えるときは、変えるキーだけを渡す。渡さなかったキーは英語のまま出る。

```typescript
const board = new WemaBoard({
  container,
  labels: {
    ...jaLabels,
    duplicate: 'コピーを作る',
    deleteNotes: (count) => `選んだ ${count} 枚を削除`,  // 数の入る文言は関数で渡す
  },
});
```

- キーの一覧は、型 `WemaLabels` にある。英語の文言は `enLabels` として取り出せる。自分で訳を持つときは、`const labels: WemaLabels = { ... }` と型を付けておくと、wema が文言を足したときに、訳していないキーが型エラーになる
- アイコンだけのボタンには、同じ文言を `title`（ポインタを乗せたときの説明）と `aria-label`（読み上げ）の両方に入れる
- 文言は HTML として解釈しない
- 読むのは、ボードを作るときの 1 回だけ。作ったあとで言語を切り替えるには、ボードを作り直す
- どの言語にするかは、利用側が決めて渡す。wema は、ブラウザの言語設定を見ない
- 畳んだ付箋のリンクの文言（`readMore` / `showLess`）は、`foldLabels` オプションでも指定できる。両方を渡したときは `foldLabels` が使われる
- UMD 版では `Wema.jaLabels` / `Wema.enLabels`

#### 付箋

| メソッド | 説明 |
|---------|------|
| `addNote(params?)` | 付箋を追加 |
| `updateNote(id, params)` | 付箋を更新 |
| `deleteNote(id)` | 付箋を削除 |
| `getNote(id)` | IDで取得 |
| `getNotes()` | 全付箋を取得 |
| `refreshNote(id)` | `renderNote` オプションで描いた付箋を描き直す |
| `resizeNotesToContent(noteIds)` | 付箋をコンテンツに合うサイズへ 1 回だけ変更する（`autoSize` は変えない） |

#### 長い本文を畳む（`foldable`）

付箋の `foldable` を `true` にすると、本文が 3 行以上のときに冒頭だけを表示する。1 行目と 2 行目をそのまま見せ、3 行目は薄くして、その上に続きを開くリンクを重ねる。開くと、リンクは本文の下へ移り、畳み直すリンクに変わる。2 行以下の付箋は、ふつうの付箋と同じ表示になる。

```typescript
const board = new WemaBoard({
  container,
  labels: { readMore: '続きを読む', showLess: '折り畳む' },  // リンクの文言（jaLabels にも入っている）
});

board.addNote({ text: '長い本文…', foldable: true });
board.updateNote(noteId, { foldable: true });   // あとから切り替える
```

付箋のポップアップにも、切り替えのボタンがある。

- 行数は、表示上の行で数える。改行がなくても、付箋の幅で折り返して 3 行以上になれば畳む
- `foldable` の付箋の高さは、表示している内容から決まる（閉じているときは約 3 行分、開いているときは本文の全体）。`height` は wema が計測して書き込む値になり、`updateNote()` やリサイズハンドルで指定できるのは幅だけになる。接続線、整列、自動レイアウトは、その時点の表示の大きさに従う
- **開いているかどうかは、表示だけの状態。** データには入らない。`note:update` と `history:commit` を出さず、Undo の対象外。ボードを読み込んだ直後は、すべて閉じている。ロックモードと参照モードでも開閉できる
- 開閉で高さが変わると `change` が発火する。`data` の `height` は、その時点の表示の高さになる
- 本文を編集しているあいだは、閉じている付箋も一時的に開く。フォーカスが外れると元の状態へ戻る
- `foldable` を `false` に戻すと、高さは本文の全体が収まる値になる（非表示の付箋は計測できないので、そのときの高さのまま残る）
- `renderNote` で利用側が描いた付箋は畳まない
- 「部分木の折り畳み」（接続線の `collapsed`。接続先の付箋を隠す）とは別の機能

#### 付箋に利用側のデータを持たせる（`meta`）

付箋の `meta` は、利用側が自由に使える項目。wema は中身を読まず、保存してそのまま返す。本文（`text`）とは別なので、本文を編集しても変わらない。

```typescript
const note = board.addNote({ text: '子ページ', meta: { page: 'child-1' } });
board.getNote(note.id)?.meta;                        // { page: 'child-1' }
board.updateNote(note.id, { meta: { page: 'child-2' } });  // 全体を置き換える
board.updateNote(note.id, { meta: undefined });      // 取り除く
```

- 値は文字列だけ（`Record<string, string>`）。文字列以外の値は保存時に落とす。入れ子のデータを持たせたいときは、利用側で JSON の文字列にする
- 返される `meta` は凍結されている（書き換えると例外になる）。変えるときは、新しいオブジェクトを `updateNote()` に渡す。`updateNote()` は `meta` の全体を置き換える（キーごとのマージはしない）
- `getNote()` / `getNotes()` / `exportData()` / `importData()`、付箋のイベント、`history:commit` のデルタ、`applyRemote()`、Undo / Redo を通して値が保たれる
- 中身が同じ `meta` を渡した更新は、変更として扱わない（履歴にも `history:commit` にも載らない）
- **付箋を複製しても `meta` は引き継がない。** 複製した付箋は、本文、色、大きさだけを引き継ぐ
- 大きさと形の上限は設けていない。同期する場合は、受け取る側（サーバー）で検証すること

#### 付箋の中身を利用側が描く（`renderNote`）

`renderNote` を指定すると、付箋ごとに呼び出す。`container` に DOM を作って `true` を返すと、その付箋は本文の代わりに `container` の中身を表示する。それ以外を返した付箋は、ふつうの付箋のまま本文を表示する。

```typescript
const board = new WemaBoard({
  container,
  renderNote: (note, el) => {
    const slug = note.meta?.page;
    if (!slug) return false;              // ふつうの付箋
    const title = document.createElement('strong');
    title.textContent = pages.get(slug)?.title ?? slug;
    const open = document.createElement('button');
    open.textContent = '開く';
    open.addEventListener('click', () => router.push(`/p/${slug}`));
    el.append(title, open);
    return true;
  },
});

// 付箋のデータ以外（ページの表示名など）が変わったら、描き直しを頼む
board.refreshNote(noteId);
```

- 呼び出すのは、付箋を作ったとき（`importData()`、`applyRemote()`、Undo での復活を含む）、付箋の `text` または `meta` が変わったとき、`refreshNote(id)` を呼んだとき。移動、リサイズ、色の変更では呼ばない
- `container` は、呼び出しのたびに空にしてから渡す。前回付けたイベントリスナーは要素ごと消える
- 利用側が描いた付箋は、本文を編集できない。ポップアップにも、本文の書式（リスト、画像、埋め込み）のボタンを出さない。本文（`text`）はデータに残り、`exportData()` はそのまま返す
- それ以外はふつうの付箋と同じ。移動、リサイズ、選択、削除、接続線、整列、自動レイアウト、絞り込み、折り畳みの対象になる
- `container` の中をドラッグすると、付箋が動く。リンク、ボタン、入力欄（`a` / `button` / `input` / `select` / `textarea` / `label` / `summary`）と、`data-wema-no-drag` 属性を付けた要素の上では、ドラッグを始めない
- `container` の中のクリックは、付箋の選択にもなる（ポップアップが出る）。出したくないときは、利用側のハンドラで `event.stopPropagation()` を呼ぶ
- **`container` の中身は、wema のサニタイズを通さない。** 他人が書いた文字列（`meta` や本文を含む）を出すときは、`innerHTML` ではなく `textContent` を使うこと
- readOnly / viewOnly でも呼び出し、中のボタンやリンクは押せる
- `container` の中の入力欄（`input` / `textarea` / `select`、`contenteditable` の要素）にフォーカスがあるあいだ、ボードのキーボードショートカット（Delete、Undo / Redo、Space）は働かない
- `renderNote` が例外を投げたときは、コンソールにエラーを出し、その付箋をふつうの付箋として表示する。付箋の作成や `importData()` は止まらない
- `refreshNote()` はデータを変えない。イベントも履歴も出さない

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

#### 表示位置（パンとズーム）

ボードはコンテナの大きさで表示し、はみ出した付箋へは表示位置を動かして届く。倍率を下げれば、広い範囲を一度に表示できる。

| メソッド | 説明 |
|---------|------|
| `getViewport()` | 表示位置と倍率 `{ x, y, zoom }` を取得 |
| `setViewport({ x?, y?, zoom? })` | 表示位置と倍率を設定 |
| `zoomTo(zoom, center?)` | 倍率を設定する。`center`（`{ clientX, clientY }`）の下にある点を画面上で動かさない。省略時はボードの中央 |
| `revealNotes(noteIds, options?)` | 指定した付箋が見えるよう、必要な分だけ表示位置を動かす。倍率は変えない |
| `centerContent(options?)` | 付箋全体（絞り込み中は表示対象）がボードの中央に来るよう動かす。倍率は変えない。`options.noteIds` で対象を絞れる |
| `fitToContent(options?)` | 付箋全体（絞り込み中は表示対象）がボードに収まる倍率と位置にする。`options.noteIds` で対象を絞れる |

```typescript
board.setNoteFilter(matchedIds);
board.fitToContent();          // 残った付箋が収まるように表示する
board.revealNotes([noteId]);   // この付箋が見える位置まで動かす
board.zoomTo(1);               // 等倍に戻す
```

- `x` / `y` は、ボードの内容を画面上でずらす量（ピクセル）。`zoom` は倍率（1 が等倍）。ボード座標 `(nx, ny)` の付箋は、ボード要素の中の `(nx * zoom + x, ny * zoom + y)` に描かれる
- 表示位置や倍率を変えても、付箋の座標と大きさ（`x` / `y` / `width` / `height`）は変わらない
- 倍率は `minZoom`〜`maxZoom`（既定値 0.25〜2）に収める。範囲外の値を渡すと、範囲の端の値になる
- `setViewport({ zoom })` のように `zoom` だけを渡すと、ボード座標の原点を中心に拡大・縮小する。画面上の点を中心にするには `zoomTo()` を使う
- `fitToContent` は、付箋が少ないときに等倍より大きくしない。大きくしてよい場合は `options.maxZoom` で上限を指定する（ボードの `maxZoom` を超えることはない）
- 表示位置は各クライアントの表示状態として扱う。`note:*` / `edge:*` / `history:commit` / `change` は発火せず、Undo 履歴にも積まれない。発火するのは `viewport:change` だけ
- `exportData()` は表示位置を含めず、`importData()` は表示位置を変えない。保存したい場合は `getViewport()` で取得し、`setViewport()` で戻す
- readOnly / viewOnly でも使える
- `revealNotes`、`centerContent`、`fitToContent` は、非表示の付箋（折り畳み、絞り込み）を対象から外す。対象がボードに収まらないとき（`fitToContent` では、最小の倍率でも収まらないとき）は、左上を表示する。`options.padding` で、ボードの端との間隔を画面のピクセルで指定できる（既定値 24）
- 座標を省略した `addNote()` は、表示中の領域の左上から (100, 100) の位置に付箋を作る
- 表示位置や倍率を変えると、付箋や接続線のポップアップなども一緒に動く。ポップアップ自体の大きさは変わらない

利用者の操作は次のとおり。

| 操作 | 通常 | ロック（readOnly） | 参照（viewOnly） |
|------|------|------|------|
| ホイール（Shift で横） | パン | パン | パン |
| Ctrl / Cmd + ホイール、トラックパッドのピンチ | ズーム | ズーム | ズーム |
| 中ボタンのドラッグ | パン | パン | パン |
| Space + 左ドラッグ | パン | パン | パン |
| 空いている場所の左ドラッグ | ラバーバンド選択（`emptyDrag: 'pan'` ではパン） | パン | パン |
| 空いている場所の Shift + 左ドラッグ | ラバーバンド選択 | パン | ラバーバンド選択 |
| 空いている場所の Ctrl / Cmd + 左ドラッグ | ラバーバンド選択 | パン | パン（`emptyDrag: 'pan'` ではラバーバンド選択） |
| 空いている場所のダブルクリック | 付箋を作成 | その位置を中央へ | その位置を中央へ |
| リサイズハンドルのダブルクリック | 付箋を内容に合うサイズへ変更 | （ハンドルなし） | （ハンドルなし） |

- 中身がスクロールできる付箋の上では、ホイールは付箋の中身をスクロールする
- Ctrl / Cmd + ホイールは、ポインタの位置を中心に拡大・縮小する。ボードの上ではブラウザのページのズームが働かなくなる。`wheelZoom: false` で無効にできる
- タッチ操作（2 本指のピンチ）でのズームは未対応
- ホイールでのパンは、ページのスクロールを止める。ボードをスクロールするページに埋め込む場合は、`wheelPan: false` で無効にできる
- Space は、ポインタがボードの上にある間だけパンの合図になる。ボードにフォーカスが無くても使える。テキストの編集中や、入力欄・ボタンにフォーカスがあるときは、通常のキー入力として扱う
- 通常モードでも `createOnDblClick: false` を指定していれば、ダブルクリックはその位置を中央へ動かす
- `emptyDrag: 'pan'` を指定すると、通常モードでも、空いている場所の左ドラッグがパンになる。ラバーバンド選択は、Shift または Ctrl / Cmd を押しながらドラッグする。既定値は `'select'`（左ドラッグがラバーバンド選択）
  - 動かさずに離したとき（クリック）の選択の解除、ダブルクリックでの付箋の作成、編集中の付箋の確定は、`'select'` のときと変わらない
  - このパンも下の `panMargin` の制限を受ける。付箋全体がボードに収まっているあいだは、付箋がボードからはみ出さない範囲でしか動かない
- **操作でパンできる範囲は、付箋のある範囲の周囲までに限る。** 表示中の付箋全体を囲む範囲の外側に見える余白は、上下左右とも `panMargin`（既定値 200、画面のピクセル）まで。付箋全体がボードに収まるときは、付箋がボードからはみ出さない範囲で動かせる
  - 制限するのは上の表の操作（ホイール、ドラッグ、ダブルクリック、Ctrl / Cmd + ホイール）だけ。`setViewport()` などのメソッドは、指定どおりの位置へ動かす
  - 範囲の外にある状態（メソッドで動かした、付箋を削除した、絞り込みを変えた）からは、付箋へ近づく方向にだけ動かせる。範囲の中へ勝手に戻すことはしない
  - 付箋が 1 枚も表示されていないボードには、制限がない
  - `panMargin: Infinity` で制限をなくせる

#### レイアウト・整列

| メソッド | 説明 |
|---------|------|
| `alignNotes(noteIds, alignment)` | 付箋を整列（left/center/right/top/middle/bottom） |
| `distributeNotes(noteIds, direction)` | 付箋を均等配置（horizontal/vertical） |
| `autoLayout(noteIds?)` | 自動レイアウト（接続線から階層を作る。今の位置の左上を保つ。ボードの縦横比に合わせて折り返す） |

同じ計算を DOM なしで行う関数も export している。サーバー側など `WemaBoard` を作れない環境で使える。どれも入力を変更せず、付箋の新しい位置 `{ id, x, y }` の配列を返す。

| 関数 | 説明 |
|------|------|
| `computeAlignment(notes, alignment)` | 整列後の位置。全付箋の位置を返す |
| `computeDistribution(notes, direction)` | 均等配置後の位置。両端を除く付箋の位置を返す |
| `computeAutoLayout(notes, edges, options?)` | 自動レイアウト後の位置。`options.noteIds` で対象を絞れる。`options.aspectRatio` で、収めたい範囲の縦横比（幅 ÷ 高さ、既定値 1.6）を渡せる |

```typescript
import { computeAutoLayout } from '@kanf/wema';

const positions = computeAutoLayout(data.notes, data.edges);
// 横長の画面に収めたいとき
const wide = computeAutoLayout(data.notes, data.edges, { aspectRatio: 16 / 9 });
```

自動レイアウトは、次のように配置する。

- 接続線でつながった付箋は、線の向きに上から下へ段を作る。つながっていないまとまり同士は、横に並べて折り返す
- 接続線のない付箋は、左から詰めて折り返し、まとまりの下か右に置く。付箋の大きさが違っていても、付箋同士は重ならない
- 折り返す幅と、接続線のない付箋を下と右のどちらに置くかは、全体が `aspectRatio` の範囲に最も大きく収まるように選ぶ。`autoLayout()` は、ボードの要素の縦横比を使う
- 接続線の鎖は折り返さない。段の数が多いボードは、縦横比を渡しても縦に長くなる

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
| `viewport:change` | `{ x, y, zoom }` |
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
| 表示位置の移動（パン）とズーム | ✓ | ✓ | ✓ |

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
  foldable?: boolean;   // 長い本文を畳んで表示する（3 行以上のとき、冒頭だけを見せる）
  meta?: Readonly<Record<string, string>>;  // 利用側のデータ。wema は中身を読まない
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
