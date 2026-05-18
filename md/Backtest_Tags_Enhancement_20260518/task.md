# 準確率回測結果資訊擴充任務

- [x] 1. 更新 `BacktestResult` 介面，加入 `hitRecords`、`score` 及 `flags` 型別定義。
- [x] 2. 更新 `page.tsx` 中 `runBacktest` 收集資料之邏輯，包含自歷史紀錄中提取 `potential_score` 與技術指標狀態，並存入 Map。
- [x] 3. 將資料映射至新組成的 `BacktestResult` 物件，並交給狀態管理更新。
- [x] 4. 更新回測成功清單 (`successList`) UI 渲染，顯示得分、正向訊號標籤，以及以跑馬燈形式展示歷次達標的日期與對應價格。
- [x] 5. 更新回測未達標清單 (`failList`) UI 渲染，同樣顯示得分與正向訊號標籤。
