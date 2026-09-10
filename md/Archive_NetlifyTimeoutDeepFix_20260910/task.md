# Netlify 502/504 深層優化任務清單

- [x] 自動備份受影響檔案至 `_backups/` <!-- id: 0 -->
- [x] 優化 `src/lib/redis.ts`（無 REDIS_URL 時停用實體 Socket 連線與等待） <!-- id: 1 -->
- [x] 優化 `src/services/scanner.ts`（以 Promise.allSettled 並行抓取 FinMind 數據） <!-- id: 2 -->
- [x] 修復 `src/app/api/scan/analyze/route.ts`（計時器移至最頂端並設 6 秒安全超時） <!-- id: 3 -->
- [x] 調整 `src/app/page.tsx`（BATCH_SIZE 改為 2 支） <!-- id: 4 -->
- [x] 執行 TypeScript 檢測驗證 <!-- id: 5 -->
- [x] 撰寫 walkthrough 說明文檔與詢問使用者是否保留或刪除 md 檔 <!-- id: 6 -->
