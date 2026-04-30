# Smart Navigator 錯誤修復與換手率升級計畫

本計畫針對您回報的 500 錯誤（API 呼叫上限）提供解決方案，並根據稍早的分析結果，提出「真實換手率」的計算修改計畫。

## User Review Required

> [!WARNING]
> **500 錯誤原因分析**：
> 剛才測試確認，`FinMind` 的免費版 API 有嚴格的呼叫頻率限制。當我們一次請求近 200 天的歷史資料時，很容易觸發 `API 402: Requests reach the upper limit` 的錯誤，導致伺服器回傳 500。
> 
> **解決方案**：
> 我們系統內本來就有實作強大的 `ExchangeClient.getStockHistory`（直接從 TWSE/TPEx 抓取資料，繞過 FinMind 限制）。我計畫將 `Smart Navigator` 的底層資料源切換為 `ExchangeClient`，這樣就能徹底解決 API 上限導致的卡頓與 500 錯誤。

## Proposed Changes

### 1. 修復 500 錯誤（切換資料源）

#### [MODIFY] [route.ts](file:///Users/joseph/Downloads/stock-pro-main/src/app/api/smart-navigator/route.ts)
- **變更內容**：
  - 將原本依賴 `FinMindClient.getDailyStats` 抓取股價的邏輯，改為使用 `ExchangeClient.getStockHistory(stockId, 6)`。
  - `ExchangeClient` 會直接向台灣證券交易所與櫃買中心抓取過去 6 個月的日線資料（約 120 個交易日），足以計算 20MA、MACD 以及 120 日位階。
  - 此改動能**完全避開 FinMind 的 API 限制**，大幅提升功能穩定性。

### 2. 真實換手率 (Turnover Rate) 計算升級

#### [NEW] [shares.ts](file:///Users/joseph/Downloads/stock-pro-main/src/lib/shares.ts) (或整合至 `exchange.ts`)
- **變更內容**：新增一個專門獲取「發行總股數」的工具函數。
- **實作細節**：
  - 實作向 TWSE `MI_QFIIS` (外資及陸資投資持股統計) 與 TPEx 對應端點獲取 `ShareNumber` (總發行股數) 的邏輯。
  - 考量到官方 Open API 偶爾會不穩定，會加入**記憶體快取 (Cache)** 機制。由於發行股數短期內不會頻繁變動，我們只需在第一次查詢該股票時獲取並暫存即可，避免每次點擊都發送請求。

#### [MODIFY] [route.ts](file:///Users/joseph/Downloads/stock-pro-main/src/app/api/smart-navigator/route.ts)
- **變更內容**：升級運算邏輯，使用真實換手率取代目前的「相對於 5日均量」。
- **運算邏輯更新**：
  1. 呼叫上述新增的函數獲取該股票的 `TotalShares`（發行總股數）。
  2. 計算真實換手率：`TurnoverRate = (當日成交股數 / TotalShares) * 100%`。（注意：若來源成交量單位為「張」，需轉換為「股」）。
  3. 更新狀態定義（依據您最初的需求）：
     - **綠燈**：換手率 > 5%。
     - **黃燈**：換手率穩定（例如 < 5%）。
     - **紅燈**：換手率 > 25% (極度爆量)。

## Verification Plan
1. 修改完成後，在本地端重新點擊 `Smart Navigator` 測試 `2363` 與 `4540`。
2. 確認是否不再出現 `500 Failed to load resource` 錯誤。
3. 檢查 API 回傳的資料中，是否成功計算出真實的換手率（例如回傳 `turnoverRate: 5.2%`），並且燈號判斷正確。
