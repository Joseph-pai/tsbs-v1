# Task List: 恢復雙模式與整合出貨邏輯

- [/] 1. 執行代碼備份 (遵守 User Global Rule)
  - [ ] 備份 `src/app/api/smart-navigator/route.ts`
  - [ ] 備份 `src/app/smart-navigator/page.tsx`
- [x] 2. 修改 API 邏輯 (`src/app/api/smart-navigator/route.ts`)
  - [x] 判斷 `isViolentDistribution` (暴力出貨)
  - [x] 將暴力出貨條件併入 `distributionLevel` (設為 'alert')
  - [x] 在 `distribution` 回傳物件中加入 `isViolentDistribution` 屬性
- [x] 3. 恢復並修改前端介面 (`src/app/smart-navigator/page.tsx`)
  - [x] 從備份檔恢復「篩選模式」(綠燈/出貨預警) 的切換 UI
  - [x] 確保出貨預警模式下的過濾邏輯正確對應 `distributionLevel`
  - [x] 在出貨預警卡片中，針對 `isViolentDistribution` 顯示專屬的警示文案
- [x] 4. 提交與推送到 GitHub
  - [ ] git commit
  - [ ] git push
