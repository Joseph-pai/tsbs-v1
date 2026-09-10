# Task 13A Implementation Checklist

- [x] 1. 建立 `scraplingClient.ts` 與 `.env.example`
  - [x] 建立 `src/services/eventAlpha/scraplingClient.ts` (封裝 `POST /crawl` 與 `POST /events`，含 3s timeout 與 fallback)
  - [x] 更新 `.env.example` 加入 `SCRAPLING_SERVICE_URL`
- [x] 2. 擴充 TypeScript 介面 `src/types/index.ts`
  - [x] 在 `AnalysisResult` 加入 `eventAlphaScore`, `eventCount`, `events`, `eventSources`, `latestEventAt`, `eventAlphaStatus`
- [x] 3. 在 `ScannerService` 接入 Event Alpha
  - [x] 修改 `src/services/scanner.ts` (調用 `scraplingClient`、`normalizeEventBatch`、`calculateEventAlphaScore`)
  - [x] 加入 `publishedAt <= scanTime` Look-ahead bias 防護
  - [x] 確保 Technical Score, 門檻與 Ranking 排序完全不受影響
- [x] 4. 更新前端 UI 呈現
  - [x] 修改 `src/components/dashboard/StockCard.tsx` (呈現實際 Event Alpha Score 與事件資訊)
  - [x] 修改 `src/app/ranking/page.tsx` (呈現實際 Event Alpha Score，並保持獨立合規說明)
- [x] 5. 撰寫單元測試
  - [x] 建立 `src/services/eventAlpha/scraplingClient.test.ts` (測試成功、超時降級、publishedAt 防護、排序不變)
- [x] 6. 驗證與 Build
  - [x] 執行 `npm test` (46/46 passed)
  - [x] 執行 `npm run build` (Build succeeded with 0 errors)
