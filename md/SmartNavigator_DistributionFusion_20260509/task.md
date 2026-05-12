# Task List: 出貨預警邏輯融合與燈號篩選

- [x] 1. 執行代碼備份 (遵守 User Global Rule)
  - [x] 備份 `src/app/api/smart-navigator/route.ts`
  - [x] 備份 `src/app/smart-navigator/page.tsx` (如有需要)
- [x] 2. 修改 API 邏輯 (`src/app/api/smart-navigator/route.ts`)
  - [x] 將位置觸發條件從 `> 70%` 放寬至 `> 60%`
  - [x] 整合單日暴力出貨 (紅燈) 邏輯
  - [x] 整合動能衰竭/三大前兆 (紅/黃燈) 邏輯
  - [x] 確保 `light` 與 `signalTag` 的回傳值正確覆蓋各種情況
- [x] 3. 確認/實作前端燈號篩選 (`src/app/smart-navigator/page.tsx`)
  - [x] 檢查是否已有燈號篩選器 (紅燈、黃燈、綠燈)
  - [x] 確保篩選邏輯能對應到後端回傳的 `light` 屬性
- [x] 4. 提交與推送到 GitHub
  - [ ] git commit
  - [ ] git push
