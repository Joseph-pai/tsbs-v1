# Task List: Mock Trading Cloud Save & Option Expansion

- [x] 備份現有檔案 (`firebaseDb.ts`, `MockTradingModal.tsx`)
- [x] 尋找專案中的 `useAuth` 或 Auth Context 路徑
- [x] 實作資料庫連線 (`src/services/firebaseDb.ts`)
  - [x] 新增 `saveMockTradingData` 函數 (使用 setDoc)
  - [x] 新增 `getMockTradingData` 函數 (使用 getDoc)
- [x] 修改 `MockTradingModal.tsx`
  - [x] 引入 Auth Hook 與 DB functions
  - [x] 修改 `<select>` 中的目標 % 選項 (10% ~ 100%)
  - [x] 實作讀取邏輯 (如果雲端有資料則載入)
  - [x] 實作背景自動儲存邏輯 (每次 rows 更新即寫入)
- [x] TypeScript 編譯驗證
- [x] Git 提交與推送
