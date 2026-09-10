# 短線過濾掃描 Task List

- [ ] 備份受影響文件（加上時間戳）
- [ ] 在 `scanner.ts` 末尾新增 `scanShortTerm` 函數
- [ ] 新增 API route `src/app/api/scan/short-term/route.ts`
- [ ] 修改 `page.tsx`：
  - [ ] 新增 State（shortTermResults, isShortTermScanning, shortTermProgress, shortTermMeta）
  - [ ] 擴展 activeTab 型別
  - [ ] 新增 `runShortTermScan` 函數
  - [ ] 按鈕區改為 3 列並新增短線按鈕
  - [ ] 新增短線掃描進度條
  - [ ] Tab 切換擴展為 3 個
  - [ ] 新增短線掃描結果顯示區
- [ ] 推送到 GitHub
