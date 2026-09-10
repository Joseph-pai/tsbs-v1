# 短線過濾掃描 Bug 修正任務

## 準備
- [x] 備份 scanner.ts（含日期時間）
- [x] 確認修改範圍（只影響 scanShortTerm 函數）

## scanner.ts 修改
- [x] 修正一：RS 計算週期 10日 → 20日（indexReturn10 → indexReturn20）
- [x] 修正二：位階邏輯重構（移除硬性排除，改為距高點比 + 市場匹配矩陣）
- [x] 修正三：移除 VCP 條件三的重複爆量判斷（todayVol > priorVol20Avg × 2.5）
- [x] 修正四：RS 排除條件使用 20日漲幅（stockReturn10 → stockReturn20）

## page.tsx 修改
- [x] 更新短線掃描說明文字（策略⑤描述修正）

## GitHub
- [x] git add & commit（commit: 6501afb）
- [x] git push → main branch 推送成功
