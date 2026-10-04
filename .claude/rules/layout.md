---
paths:
  - "src/layout.ts"
  - "src/index.ts"
  - "tests/layout.test.ts"
---

# レイアウト関数（DOM 非依存）

`WemaBoard` のレイアウト系メソッドは、次の純粋関数の結果を `updateNote` で反映するだけの薄いラッパー。
関数は `src/layout.ts` にあり、`src/index.ts` から export している（サーバー側で使うため DOM に触れないこと）。

```typescript
computeAlignment(notes: LayoutNote[], alignment: NoteAlignment): NotePosition[];
computeDistribution(notes: LayoutNote[], direction: DistributeDirection): NotePosition[];
computeAutoLayout(notes: LayoutNote[], edges: LayoutEdge[], options?: { noteIds?: NoteId[] }): NotePosition[];
```
