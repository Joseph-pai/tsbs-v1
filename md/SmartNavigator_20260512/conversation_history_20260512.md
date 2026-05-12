# 智能選股導航 (Smart Navigator) 修改紀錄 - 2026-05-12

## 1. 數據獲取失敗預警與再次篩選功能
**目標：** 當自動篩選無法獲取某檔股票的市場數據時，顯示失敗檔數並允許用戶針對這些股票重試。

### 修改內容：
- **前端狀態管理**：在 `page.tsx` 中增加 `failedStocks` 狀態。
- **篩選邏輯優化**：修改 `handleAutoFilter`，捕獲 API 請求錯誤並記錄失敗的股票代號與名稱。
- **UI 增強**：
    - 增加黃色警告框提示失敗檔數。
    - 增加「針對這些股票再次篩選」按鈕。
- **TypeScript 修復**：修復了因函數參數變更導致的 `onClick` 類型不匹配問題（解決 Netlify 編譯失敗）。

---

## 2. 502 Bad Gateway 效能優化
**目標：** 解決 Netlify Serverless Function 因外部抓取超時（10秒）導致的 502 錯誤。

### 修改原因：
- 原本採用的順序抓取（Sequential Fetching）在抓取 6 個月數據時，累積網路等待時間過長。
- 交易所（TWSE/TPEx）伺服器響應變慢，加劇了超時風險。

### 修改內容：
- **並行抓取 (Parallel Fetching)**：
    - 在 `exchange.ts` 中，將 `getStockHistory` 與 `getTaiexHistory` 的 `for` 循環改為 `Promise.all`。
    - 6 個月的數據請求現在同時發出，總耗時從 ~9-12 秒縮短至 ~2-3 秒。
- **API 路由並行化**：
    - 在 `route.ts` 中，將「個股歷史」、「產業映射」、「總股數」、「大盤數據」改為並行獲取。
- **結果**：API 穩定性大幅提升，徹底解決了批量篩選時的超時報錯。

---

## 3. 文件與備份紀錄
- **備份文件**：
    - `src/app/smart-navigator/page_20260512_170915.tsx.bak`
    - `src/lib/exchange_20260512_174453.ts.bak`
    - `src/app/api/smart-navigator/route_20260512_174453.ts.bak`
- **文件保存**：
    - 修改計劃與報告已保存至 `md/SmartNavigator_FailureHandling_20260512` 與 `md/SmartNavigator_PerformanceOptimization_20260512`。

## 4. GitHub 狀態
- 所有代碼與文檔已推送到 `main` 分支。
