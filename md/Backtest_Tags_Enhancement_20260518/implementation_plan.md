# 準確率回測結果資訊擴充計畫

為達成在「準確率回測結果」中顯示更詳細的歷史掃描背景資訊及達標歷程，計畫進行以下修改：

## 變更目標
1. **顯示每個達標的交易日、價格與時間**：將從 API 取回的 `hitRecords` 顯示於前端成功清單中。
2. **顯示當時掃描得到的評分**：從歷史掃描紀錄提取 `potential_score` 並與回測資料綁定顯示。
3. **顯示當時掃描得到的正向訊號標籤**：提取量能激增、帶量突破、融資軋空、營收新高等訊號，轉換為標籤展示在 UI。

## Proposed Changes

### [MODIFY] [page.tsx](file:///Users/joseph/Downloads/stock-pro-main/src/app/page.tsx)
- **更新 `BacktestResult` 介面**：增加 `hitRecords`, `score`, 及 `flags` 型別定義。
- **資料提取與儲存 (`runBacktest` 函數)**：
  - 在建立 `earliestScanMap` 迴圈中，額外從 `session.results` (即參數 `r`) 提取出 `score`、`v_ratio`、`is_ma_breakout`、`marginSqueezeSignal`、`isRevenueNewHigh` 等屬性。
  - 將提取的資料隨 API 呼叫結果一同存回 `backtestResults`。
- **更新 UI 渲染**：
  - 在成功清單 (`successList.map`) 與未達標清單 (`failList.map`) 的標題列中，增加顯示**歷史評分**與**標籤（如：量能激增{X}x、帶量突破、融資軋空、營收新高等）**。
  - 於成功清單卡片內部，增加一段區塊遍歷 `r.hitRecords`，列出所有達成目標價的**交易日期與該日最高價**。

## User Review Required

> [!WARNING]
> 此次修改牽涉到 `page.tsx` 中較為複雜的狀態資料對齊，且我已自動為您建立了一份當前程式碼的備份檔 (`_backups/page_backup_20260518_...tsx`)。
> 若上述規劃符合您的需求，請回覆「可以開始修改代碼」或同意，我將立即為您執行代碼變更。
