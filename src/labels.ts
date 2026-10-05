/**
 * The texts the board shows in its own UI: tooltips of the buttons (also
 * their `aria-label`), headings of the edge popup, and the link under a
 * foldable note. Pass the ones to replace as the `labels` option.
 */
export interface WemaLabels {
  // Note popup
  /** Button that opens the note colors */
  color: string;
  /** Button that duplicates the note */
  duplicate: string;
  /** Button that deletes the note, or the edge */
  delete: string;
  /** Button that deletes the selected notes, given how many they are */
  deleteNotes: (count: number) => string;
  /** Button that turns `autoSize` on and off */
  autoSize: string;
  bulletedList: string;
  numberedList: string;
  checklist: string;
  /** Button that moves list items one level up (the key is Shift+Tab) */
  outdent: string;
  /** Button that moves list items one level down (the key is Tab) */
  indent: string;
  /** Button that inserts an image */
  image: string;
  /** Button that embeds a URL */
  embed: string;
  /** Button that turns `foldable` on and off */
  foldLongText: string;

  // Note colors
  colorButter: string;
  colorRose: string;
  colorPeach: string;
  colorLavender: string;
  colorSky: string;
  colorMint: string;
  colorSage: string;
  colorGray: string;

  // Edge popup: headings (shown as text)
  /** Button that opens the route and anchor sections */
  details: string;
  route: string;
  /** Heading of the anchor on the note the edge starts from */
  from: string;
  /** Heading of the anchor on the note the edge ends at */
  to: string;
  line: string;
  arrow: string;
  /** Heading of the arrow sizes */
  size: string;
  /** Heading of the line widths */
  width: string;

  // Edge popup: buttons
  lineSolid: string;
  lineDashed: string;
  lineDotted: string;
  arrowNone: string;
  arrowStart: string;
  arrowEnd: string;
  arrowBoth: string;
  sizeSmall: string;
  sizeMedium: string;
  sizeLarge: string;
  widthThin: string;
  widthNormal: string;
  widthThick: string;
  routeCurve: string;
  routePolyline: string;
  anchorAuto: string;
  anchorTop: string;
  anchorRight: string;
  anchorBottom: string;
  anchorLeft: string;

  // Text toolbar
  bold: string;
  strikethrough: string;
  textColor: string;
  link: string;
  removeLink: string;
  /** Button that applies the URL typed for a link or an embed (shown as text) */
  ok: string;

  // Note
  /** Button on a selected image that deletes it */
  deleteImage: string;
  /** Link that opens a folded note (shown as text) */
  readMore: string;
  /** Link that closes an opened foldable note (shown as text) */
  showLess: string;
}

/** The keys of the labels that are plain texts */
export type TextLabelKey = {
  [K in keyof WemaLabels]: WemaLabels[K] extends string ? K : never;
}[keyof WemaLabels];

/** The English labels: what the board shows when the `labels` option is not given */
export const enLabels: WemaLabels = {
  color: 'Color',
  duplicate: 'Duplicate',
  delete: 'Delete',
  deleteNotes: (count) => `Delete ${count} notes`,
  autoSize: 'Auto Size',
  bulletedList: 'Bulleted List',
  numberedList: 'Numbered List',
  checklist: 'Checklist',
  outdent: 'Outdent (Shift+Tab)',
  indent: 'Indent (Tab)',
  image: 'Image',
  embed: 'Embed',
  foldLongText: 'Fold Long Text',

  colorButter: 'Butter',
  colorRose: 'Rose',
  colorPeach: 'Peach',
  colorLavender: 'Lavender',
  colorSky: 'Sky',
  colorMint: 'Mint',
  colorSage: 'Sage',
  colorGray: 'Gray',

  details: 'Details',
  route: 'Route',
  from: 'From',
  to: 'To',
  line: 'Line',
  arrow: 'Arrow',
  size: 'Size',
  width: 'Width',

  lineSolid: 'Solid',
  lineDashed: 'Dashed',
  lineDotted: 'Dotted',
  arrowNone: 'No arrow',
  arrowStart: 'Arrow at start',
  arrowEnd: 'Arrow at end',
  arrowBoth: 'Arrow at both ends',
  sizeSmall: 'Small',
  sizeMedium: 'Medium',
  sizeLarge: 'Large',
  widthThin: 'Thin',
  widthNormal: 'Normal',
  widthThick: 'Thick',
  routeCurve: 'Curve',
  routePolyline: 'Polyline',
  anchorAuto: 'Auto',
  anchorTop: 'Top',
  anchorRight: 'Right',
  anchorBottom: 'Bottom',
  anchorLeft: 'Left',

  bold: 'Bold',
  strikethrough: 'Strikethrough',
  textColor: 'Text Color',
  link: 'Link',
  removeLink: 'Remove link',
  ok: 'OK',

  deleteImage: 'Delete image',
  readMore: 'Read more',
  showLess: 'Show less',
};

/** The Japanese labels */
export const jaLabels: WemaLabels = {
  color: '色',
  duplicate: '複製',
  delete: '削除',
  deleteNotes: (count) => `${count} 枚の付箋を削除`,
  autoSize: '内容に合わせたサイズ',
  bulletedList: '箇条書き',
  numberedList: '番号付きリスト',
  checklist: 'チェックリスト',
  outdent: '段上げ (Shift+Tab)',
  indent: '段下げ (Tab)',
  image: '画像',
  embed: '埋め込み',
  foldLongText: '長い本文を畳む',

  colorButter: 'バター',
  colorRose: 'ローズ',
  colorPeach: 'ピーチ',
  colorLavender: 'ラベンダー',
  colorSky: 'スカイ',
  colorMint: 'ミント',
  colorSage: 'セージ',
  colorGray: 'グレー',

  details: '詳細',
  route: '経路',
  from: '始点',
  to: '終点',
  line: '線',
  arrow: '矢印',
  size: 'サイズ',
  width: '太さ',

  lineSolid: '実線',
  lineDashed: '破線',
  lineDotted: '点線',
  arrowNone: '矢印なし',
  arrowStart: '始点に矢印',
  arrowEnd: '終点に矢印',
  arrowBoth: '両端に矢印',
  sizeSmall: '小',
  sizeMedium: '中',
  sizeLarge: '大',
  widthThin: '細い',
  widthNormal: '標準',
  widthThick: '太い',
  routeCurve: '曲線',
  routePolyline: '折れ線',
  anchorAuto: '自動',
  anchorTop: '上',
  anchorRight: '右',
  anchorBottom: '下',
  anchorLeft: '左',

  bold: '太字',
  strikethrough: '取り消し線',
  textColor: '文字色',
  link: 'リンク',
  removeLink: 'リンクを解除',
  ok: 'OK',

  deleteImage: '画像を削除',
  readMore: '続きを読む',
  showLess: '折り畳む',
};

/**
 * The labels a board shows: the English ones, replaced by the `labels`
 * option, then by the older `foldLabels` option (it wins over `labels`).
 * A key given as undefined keeps the English text, and so does a value of
 * the wrong type (the labels may come from JavaScript or from JSON).
 */
export function resolveLabels(
  labels?: Partial<WemaLabels>,
  foldLabels?: { more?: string; less?: string },
): WemaLabels {
  const resolved: Record<string, unknown> = { ...enLabels };
  const given: Record<string, unknown> = {
    ...labels,
    readMore: foldLabels?.more ?? labels?.readMore,
    showLess: foldLabels?.less ?? labels?.showLess,
  };
  for (const key of Object.keys(enLabels)) {
    if (typeof given[key] === typeof resolved[key]) resolved[key] = given[key];
  }
  return resolved as unknown as WemaLabels;
}
