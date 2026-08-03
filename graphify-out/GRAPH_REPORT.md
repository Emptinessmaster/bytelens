# Graph Report - C:\Users\sante\Desktop\Claude\Git_test  (2026-08-03)

## Corpus Check
- cluster-only mode — file stats not available

## Summary
- 18 nodes · 39 edges · 3 communities
- Extraction: 90% EXTRACTED · 10% INFERRED · 0% AMBIGUOUS · INFERRED: 4 edges (avg confidence: 0.5)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- runProcess
- bind
- app.js

## God Nodes (most connected - your core abstractions)
1. `runProcess()` - 11 edges
2. `bind()` - 6 edges
3. `applyResult()` - 5 edges
4. `scheduleProcess()` - 4 edges
5. `loadFile()` - 4 edges
6. `fmtBytes()` - 3 edges
7. `num()` - 3 edges
8. `targetDimensions()` - 3 edges
9. `canvasToBlob()` - 3 edges
10. `fitToBudget()` - 3 edges

## Surprising Connections (you probably didn't know these)
- `scheduleProcess()` --indirect_call--> `runProcess()`  [INFERRED]
  app.js → app.js  _Bridges community 1 → community 0_
- `loadFile()` --calls--> `fmtBytes()`  [EXTRACTED]
  app.js → app.js  _Bridges community 2 → community 1_
- `runProcess()` --calls--> `applyResult()`  [EXTRACTED]
  app.js → app.js  _Bridges community 0 → community 2_

## Import Cycles
- None detected.

## Communities (3 total, 0 thin omitted)

### Community 0 - "runProcess"
Cohesion: 0.38
Nodes (7): canvasToBlob(), currentFormat(), drawCanvas(), fitToBudget(), num(), runProcess(), targetDimensions()

### Community 1 - "bind"
Cohesion: 0.40
Nodes (6): bind(), loadFile(), onUnitChange(), reset(), scheduleProcess(), syncAutoUI()

### Community 2 - "app.js"
Cohesion: 0.70
Nodes (4): applyResult(), extFor(), fmtBytes(), setStatus()

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `runProcess()` connect `runProcess` to `bind`, `app.js`?**
  _High betweenness centrality (0.152) - this node is a cross-community bridge._
- **Why does `bind()` connect `bind` to `app.js`?**
  _High betweenness centrality (0.032) - this node is a cross-community bridge._
- **Why does `applyResult()` connect `app.js` to `runProcess`?**
  _High betweenness centrality (0.017) - this node is a cross-community bridge._
- **Are the 3 inferred relationships involving `bind()` (e.g. with `onUnitChange()` and `reset()`) actually correct?**
  _`bind()` has 3 INFERRED edges - model-reasoned connections that need verification._
- **Are the 2 inferred relationships involving `scheduleProcess()` (e.g. with `bind()` and `runProcess()`) actually correct?**
  _`scheduleProcess()` has 2 INFERRED edges - model-reasoned connections that need verification._