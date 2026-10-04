---
paths:
  - "src/edge.ts"
  - "src/utils/geometry.ts"
  - "tests/edge.test.ts"
  - "tests/geometry.test.ts"
---

# 接続線のパス計算

- `fromAnchor` / `toAnchor` が `'auto'` の場合:
  1. 2つの付箋の中心座標を結ぶ方向を算出
  2. 出発側/到着側それぞれ、最適なアンカーを選択
  3. `routing: 'curve'` → 3次ベジェ曲線、`'polyline'` → 直角折れ線
  4. ベジェの制御点はアンカーの法線方向にオフセット (距離に比例、40px〜150px)
