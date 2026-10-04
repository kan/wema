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
  2. 出発側/到着側それぞれ、最適なアンカーを選択（`resolveAutoAnchor`）
     - 相手がはっきり上または下にあるとき（縦の間隔が `AUTO_ANCHOR_ROOM` = 40px 以上）は、横にどれだけ離れていても下辺と上辺でつなぐ。線が段と段のあいだを通り、隣の付箋の裏に入らない。`computeAutoLayout` の段の間隔（`V_GAP` = 60px）はこの値より大きくしてあり、整列した結果の線はすべて下辺から上辺へ向かう
     - それ以外は、中心どうしを結ぶ向きにいちばん近い辺を選ぶ
  3. `routing: 'curve'` → 3次ベジェ曲線、`'polyline'` → 直角折れ線
  4. ベジェの制御点はアンカーの法線方向にオフセット (距離に比例、40px〜150px)
