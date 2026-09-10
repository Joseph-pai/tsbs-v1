# FinMind API Token 升級修訂計畫

## 背景與需求
目前 APP 使用的 FinMind Token 為預設舊金鑰。使用者已訂閱 Backer 會員，並提供新 Token：
`eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJ1c2VyX2lkIjoiam9zZXBocGFpIiwiZW1haWwiOiJhMTg5MTEyODkxMjJAZ21haWwuY29tIiwidG9rZW5fdmVyc2lvbiI6MH0.qAmCuuJ9oqtjr1rSu2P7wsRe5FkRYgZY8yzSyv1Z9QY`

此計畫旨在更新 [src/lib/config.ts](file:///Users/joseph/Downloads/stock-pro-main/src/lib/config.ts) 與環境變數檔案，確保系統使用新的 Backer 權限進行 API 請求。

## 使用者確認事項 (User Review Required)

> [!IMPORTANT]
> 依據全局規則：
> 1. **修改代碼前詢問**：在開始修改任何程式碼之前，需先取得您的同意。
> 2. **自動備份**：修改程式碼前會自動複製現有檔案並存至 `_backups/` 目錄（檔名加上日期與時間 `config_20260910_155306.ts.bak`）。
> 3. **瀏覽器/測試影片**：未經同意不會調用瀏覽器運行或拍攝影片。

## 擬議變更 (Proposed Changes)

### 備份與配置更新

#### [NEW] [config_20260910_155306.ts.bak](file:///Users/joseph/Downloads/stock-pro-main/_backups/config_20260910_155306.ts.bak)
- 自動備份當前的 [src/lib/config.ts](file:///Users/joseph/Downloads/stock-pro-main/src/lib/config.ts)。

#### [MODIFY] [config.ts](file:///Users/joseph/Downloads/stock-pro-main/src/lib/config.ts)
- 將 `CONFIG.FINMIND.TOKEN` 的預設 Token 替換為最新的 Backer 金鑰：
  `eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJ1c2VyX2lkIjoiam9zZXBocGFpIiwiZW1haWwiOiJhMTg5MTEyODkxMjJAZ21haWwuY29tIiwidG9rZW5fdmVyc2lvbiI6MH0.qAmCuuJ9oqtjr1rSu2P7wsRe5FkRYgZY8yzSyv1Z9QY`

#### [NEW] [.env.local](file:///Users/joseph/Downloads/stock-pro-main/.env.local)
- 新增或更新 `.env.local` 檔案，寫入 `NEXT_PUBLIC_FINMIND_TOKEN` 環境變數，確保本地與部署環境統一。

---

## 驗證計畫 (Verification Plan)

### 自動/程式驗證
- 檢查 [config.ts](file:///Users/joseph/Downloads/stock-pro-main/src/lib/config.ts) 語法與型別是否正常。
- 測試讀取 `CONFIG.FINMIND.TOKEN` 是否能正確傳回新的 Backer Token。
