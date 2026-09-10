# 修復數據下載 502 與 JSON 解析錯誤任務清單

- [x] 自動備份受影響檔案至 `_backups/` <!-- id: 0 -->
- [x] 修改 `src/services/dataSyncService.ts`（改為平滑分步下載並增加 res.ok 防衛） <!-- id: 1 -->
- [x] 修改 `src/lib/exchange.ts`（證交所 OpenAPI 加入 7 秒連線超時限制） <!-- id: 2 -->
- [x] 修改 `src/app/api/market/snapshot/route.ts`（加入 7.5 秒安全截斷控制） <!-- id: 3 -->
- [x] 執行 TypeScript 檢測驗證 <!-- id: 4 -->
- [x] 撰寫 walkthrough 說明文檔與詢問使用者是否保留或刪除 md 檔 <!-- id: 5 -->
