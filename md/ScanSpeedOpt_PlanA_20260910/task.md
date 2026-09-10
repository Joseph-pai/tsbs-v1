# 掃描加速 Plan A — Task List

- [x] 備份三個目標檔案（加日期時間後綴 `_20260910_1700`）
- [x] `dataSyncService.ts`：新增 `getLocalIndustryMap()` 讀取本地產業對應表
- [x] `analyze/route.ts`：TAIEX/TPEX 指數改用 Redis 快取（4 小時 TTL），每天只抓一次
- [x] `page.tsx` `runScan`：本地預篩（紅K + 成交量排序）→ Top 20 → 1 次 API
- [x] `page.tsx` `runEnhancedScan`：本地預篩（成交金額排序）→ Top 20 → 1 次 API
- [x] 推送 GitHub
