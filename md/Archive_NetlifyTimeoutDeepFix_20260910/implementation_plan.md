# 徹底解決 Netlify 502 / 504 逾時之深層優化計畫

## 深入原因分析

根據最新日誌，雖然前端已防禦 `Unexpected token '<'` 崩潰，但從第 6 批開始仍出現 `502 (Bad Gateway)` 與 `504 (Gateway Timeout)`。經深度追蹤發現以下三個關鍵效能瓶頸：

1. **Redis 無效連線等待 (主要延遲來源)**：
   - [redis.ts](file:///Users/joseph/Downloads/stock-pro-main/src/lib/redis.ts) 預設會嘗試連線 `redis://localhost:6379`。
   - 在 Netlify 等 Serverless 無 Redis 環境中，每次調用 `redis.get()` 都會觸發 5 秒連線失敗等待與多次重試 (retry)，導致單次請求浪費超過 5 秒在等待不存在的 Redis。

2. **FinMind API 串列請求 (Serial Fetching)**：
   - [scanner.ts](file:///Users/joseph/Downloads/stock-pro-main/src/services/scanner.ts) 中的 `analyzeStock` 針對每支股票分階段依序發送 4 次網路請求（價格 ➔ 法人 ➔ 營收 ➔ 融資融券）。
   - 串列執行使得單股分析時間需 3~4 秒。批次 5 支累積即需 15~20 秒，必然觸發 Netlify 的 10 秒硬性關閉。

3. **後端超時起算點位置偏差**：
   - [route.ts](file:///Users/joseph/Downloads/stock-pro-main/src/app/api/scan/analyze/route.ts) 原本的 `startTime` 設定在預抓大盤與產業 Mapping 之後，導致預抓時間未納入 8 秒計算中。

---

## 擬議修復方案 (Proposed Changes)

> [!IMPORTANT]
> 依據全局規範，修改程式碼前會自動將相關檔案備份至 `_backups/` 目錄並帶上時間戳記。

### 1. [MODIFY] [redis.ts](file:///Users/joseph/Downloads/stock-pro-main/src/lib/redis.ts)
- **環境檢查與虛擬避障 (Mock Bypass)**：
  - 當檢測到環境未提供 `process.env.REDIS_URL` 時，不建立實體 Redis socket 連線。
  - 直接傳回 null / no-op，瞬間完成快取查詢，消除 5 秒無效 timeout 等待。

### 2. [MODIFY] [scanner.ts](file:///Users/joseph/Downloads/stock-pro-main/src/services/scanner.ts)
- **並行化 API 請求 (Parallel Fetching)**：
  - 改用 `Promise.allSettled` 同時併發抓取該個股的「歷史價格、三大法人、月營收、融資融券」4 項數據。
  - 將單股 API 抓取總時間從 ~3.2 秒大幅縮短至 ~0.8 秒（縮短 75% 耗時）。

### 3. [MODIFY] [route.ts](file:///Users/joseph/Downloads/stock-pro-main/src/app/api/scan/analyze/route.ts)
- **起算點校正與 6 秒安全邊界**：
  - 將 `startTime = Date.now()` 移至 API 函式入口第一行。
  - 將安全邊界設定為 **6 秒**，若處理時間到達 6 秒即立即回傳已完成的資料，絕對不超載 Netlify 的 10 秒限制。

### 4. [MODIFY] [page.tsx](file:///Users/joseph/Downloads/stock-pro-main/src/app/page.tsx)
- **調整單次批次大小**：
  - 將前端傳送至 `/api/scan/analyze` 的 `BATCH_SIZE` 由 5 支調降為 **2 支**。
  - 配合並行抓取，每次 API 請求可在 1.5 秒內順暢完成。

---

## 驗證計畫 (Verification Plan)

### 自動化驗證
- 執行 `npx tsc --noEmit` 確保 TypeScript 編譯與型別完全正確。

### 線上驗證
- 推送至 GitHub 觸發 Netlify 重新部署後，測試共振掃描，確認日誌不再出現 502 / 504 錯誤。
