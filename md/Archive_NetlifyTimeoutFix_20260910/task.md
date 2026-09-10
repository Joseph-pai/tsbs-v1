# Netlify 502/504 逾時修復任務清單

- [x] 自動備份受影響檔案至 `_backups/` <!-- id: 0 -->
- [x] 修改 `src/app/page.tsx`（縮減 BATCH_SIZE 至 5、增加 batchRes.ok 防衛） <!-- id: 1 -->
- [x] 修改 `src/app/api/scan/analyze/route.ts`（降低批次並加入 8 秒逾時防衛） <!-- id: 2 -->
- [x] 執行 TypeScript 檢測驗證 <!-- id: 3 -->
- [x] 撰寫 walkthrough 說明文檔與詢問使用者是否保留或刪除 md 檔 <!-- id: 4 -->
