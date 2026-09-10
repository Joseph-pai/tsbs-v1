# 解決 Netlify 502 / 504 逾時與 Unexpected token '<' 錯誤修復計畫

## 問題診斷與原因

當在 Netlify 執行「定點共振掃描」時，出現 `502 Bad Gateway`、`504 Gateway Timeout` 與 `SyntaxError: Unexpected token '<'` 錯誤，原因如下：

1. **單次批次量過大與 Netlify 10 秒逾時限制**：
   - 前端 [src/app/page.tsx](file:///Users/joseph/Downloads/stock-pro-main/src/app/page.tsx) 原本單次傳送 **25 支股票**（`BATCH_SIZE = 25`）給 `/api/scan/analyze`。
   - 後端 [route.ts](file:///Users/joseph/Downloads/stock-pro-main/src/app/api/scan/analyze/route.ts) 分析 25 支股票需要對外部 API 進行多輪 HTTP 查詢。在冷啟動或無快取時，執行時間常高達 15~30 秒。
   - Netlify 的 Serverless API 限制單次請求必須在 **10 秒內** 回應，超過即強制拔插頭並回傳 **502 / 504 HTML 頁面**。

2. **前端缺乏 HTTP 回應狀態碼判斷 (`batchRes.ok`)**：
   - 當 Netlify 回傳 502/504 HTML 網頁時，前端直接調用 `await batchRes.json()` 解析 HTML，導致擲出 `SyntaxError: Unexpected token '<'`。

---

## 預計修改方案 (Proposed Changes)

> [!IMPORTANT]
> 依據全局規範，進行代碼修改前需經您確認同意，並自動將 [page.tsx](file:///Users/joseph/Downloads/stock-pro-main/src/app/page.tsx) 與 [route.ts](file:///Users/joseph/Downloads/stock-pro-main/src/app/api/scan/analyze/route.ts) 備份至 `_backups/` 目錄。

### 1. [MODIFY] [page.tsx](file:///Users/joseph/Downloads/stock-pro-main/src/app/page.tsx)
- **縮小前端單次 API 請求批次**：
  - 將原始掃描 (runScan) 與強化掃描 (runEnhancedScan) 傳給 `/api/scan/analyze` 的 `BATCH_SIZE` 由 25 支調降為 **5 ~ 6 支**。
  - 此調整可使每次 API 請求只需 2~4 秒完成，完全符合 Netlify 10 秒限制。
- **加入 `batchRes.ok` 防禦檢查**：
  - 呼叫 `fetch('/api/scan/analyze')` 後先檢查 `if (!batchRes.ok)`。若遇到 502/504，安全擷取文字訊息並繼續下一批或進行重試，避免整個程式崩潰拋出 `Unexpected token '<'`。

### 2. [MODIFY] [route.ts](file:///Users/joseph/Downloads/stock-pro-main/src/app/api/scan/analyze/route.ts)
- **優化後端內部併發**：
  - 將後端內部的 `batchSize` 配合調整，確保不會併發過多請求造成外部 API 限流。
- **超時安全保護**：
  - 加入 8 秒安全超時切斷保護機制。若處理時間接近 8 秒，自動先行回轉已完成的股票數據，確保 Netlify 能收到 200 OK 的 JSON 回應而非 504。

---

## 驗證計畫 (Verification Plan)

### 自動與本地驗證
1. 執行 `npx tsc --noEmit` 確保 TypeScript 型別無誤。
2. 進行本地測試驗證前端對 502/504 的防衛判斷邏輯。

### 部署後驗證
1. 推送更新至 GitHub 並觸發 Netlify 自動部署。
2. 在 Netlify 線上環境執行定點共振掃描，確認不會再觸發 502/504 逾時或 HTML 解析錯誤。
