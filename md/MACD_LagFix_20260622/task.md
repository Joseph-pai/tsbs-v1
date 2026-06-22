# MACD 滯後修正 — 執行進度

## 任務清單

- [x] 分析 MACD 使用位置與影響範圍
- [x] 建立修正計劃並取得用戶確認
- [x] 備份原始檔案（加時間戳記）
- [x] 修改 `indicators.ts`
  - [x] `calculateEMA` — 加入 SMA Seeding 初始化
  - [x] `calculateMACD` — 加入 `prevOsc` 輸出
  - [x] `calculateMACDFull` — 加入 `oscArray` 輸出
- [x] 修改 `smart-navigator/route.ts`
  - [x] `isMacdPositive` 改用 OSC 動能方向
  - [x] `isMacdJustTurnedPositive` 改用 OSC 翻正
  - [x] `hasMacdDivergence` 改用 oscArray 頂背離
- [x] TypeScript 編譯驗證（零錯誤）
