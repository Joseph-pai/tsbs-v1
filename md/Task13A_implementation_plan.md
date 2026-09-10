# TSBS-V1 Task 13A｜Scrapling 正式接入掃描流程 (不影響現有排名與選股)

本計畫之目標為將現有獨立的 Scrapling Python 資料爬蟲服務與 Event Alpha 評分模組正式接入 Next.js / TypeScript 掃描分析流程 (`ScannerService` & UI)，同時**嚴格保證不修改任何既有技術面選股條件、技術評分公式與 5D+10% 歷史回測排名**。

---

## 核心設計與安全原則 (Core Rules & Safeguards)

1. **資料流與分離機制**：
   - 股票先經過既有之 Technical Scanner 評分與篩選。
   - 篩選完成後，再透過 `scraplingClient` 向 Python Scrapling Service 獲取公開事件資料。
   - 透過 `eventNormalizer` 標準化並經由 `eventScorer` 計算 `eventAlphaScore`。
   - 附加資料至 `AnalysisResult` (包含 `eventAlphaScore`, `eventCount`, `events`, `eventSources`, `latestEventAt`)。
   - **`eventAlphaScore` 獨立儲存，完全不併入 Technical Score / Final Score，完全不參與排序**。

2. **時間安全防護 (Look-ahead Bias / Future Leakage Guard)**：
   - 嚴格過濾 `publishedAt > scanCutoffTime` 的未來事件，防止歷史與即時掃描資料洩漏。

3. **容錯與降級機制 (Graceful Degradation)**：
   - Scrapling Service 若發生離線、Timeout (預設 3000ms)、HTTP 50x 或連線失敗，`eventAlphaScore` 自動設為 `null`，`eventCount` 設為 `0`，Technical Scanner 仍保持 100% 正常運行。

4. **零破壞性承諾**：
   - 不修改 Technical Filter 門檻、不修改 `totalScore` / `finalScore` 計算、不修改 `backtestPerStockStats.json` 排名邏輯、不導入 AI/LLM。

---

## 變更檔案規劃 (Proposed Changes)

### [NEW] `src/services/eventAlpha/scraplingClient.ts`
- 建立 TypeScript Client API 模組。
- 讀取環境變數 `process.env.SCRAPLING_SERVICE_URL || 'http://localhost:8000'`。
- 提供 `crawlStockEvents(stockId, options)`：對應 `POST /crawl`。
- 提供 `queryStockEvents(params, options)`：對應 `POST /events`。
- 內建 `AbortController` (3 秒逾時) 與 try/catch 降級機制，服務不可用時回傳空陣列 `[]`。

### [MODIFY] `.env.example`
- 新增 `SCRAPLING_SERVICE_URL=http://localhost:8000` 設定說明。

### [MODIFY] `src/types/index.ts`
- 擴充 `AnalysisResult` 介面：
  - `eventAlphaScore?: number | null;`
  - `eventCount?: number;`
  - `events?: EventAlphaItem[];`
  - `eventSources?: string[];`
  - `latestEventAt?: string | null;`
  - `eventAlphaStatus?: string;`

### [MODIFY] `src/services/scanner.ts`
- 在 `analyzeStock` / `scanShortTerm` 完成既有技術面分析後，發起 Scrapling 事件調用。
- 使用 `normalizeEventBatch` 標準化事件並校驗 `publishedAt <= scanTime`。
- 調用 `calculateEventAlphaScore` 產生 `eventAlphaScore` 並附加於 `AnalysisResult`。
- 確保技術評分、排序、篩選結果維持 100% 原樣。

### [MODIFY] `src/components/dashboard/StockCard.tsx`
- 於個股卡片/詳細資訊區塊新增「Event Alpha / 公開事件」資訊展現（有數據時顯示 Score、事件數與最新日期；無數據或不可用時顯示 N/A）。

### [MODIFY] `src/app/ranking/page.tsx`
- 更新 Ranking 頁面，若個別股票包含 `eventAlphaScore` 實時資料則予以呈現，保留「Event Alpha 尚不影響 Technical Ranking」之合規說明。

### [NEW] `src/services/eventAlpha/scraplingClient.test.ts`
- 新增單元測試：
  1. Scrapling Client 正常請求與資料解析測試。
  2. Scrapling Service 超時/離線時的降級測試（不引發未捕捉異常）。
  3. `publishedAt` 未來時間洩漏防護測試。
  4. 驗證 Event Alpha Score 附加後 Technical Score 與選股排序保持一致。

---

## 驗證計畫 (Verification Plan)

### 自動化測試 (Automated Tests)
- 執行 `npm test`，確保既有與新寫之單元測試全數通過。
- 執行 `npm run build`，確保 TypeScript 類型檢查與 Next.js 打包成功。
- 執行 `npm run lint`。

### 手動與備份規範
- 在修改任何既存程式碼檔案前，自動執行檔案備份（加註 timestamp 例如 `*.bak_YYYYMMDD_HHMMSS`）。
- 每次修改程式碼前先向使用者詢問同意。
