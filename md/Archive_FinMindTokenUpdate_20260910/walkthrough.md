# FinMind Token 升級為 Backer 訂閱會員金鑰 - 完成報告

## 變更摘要

已成功將 APP 的 FinMind Token 更新為新的 Backer 訂閱會員金鑰。

### 1. 備份舊版檔案
- **備份路徑**：[_backups/config_20260910_155408.ts.bak](file:///Users/joseph/Downloads/stock-pro-main/_backups/config_20260910_155408.ts.bak)
- 符合全局規範，於程式碼變更前自動帶入時間戳記完成備份。

### 2. 更新配置文件
- **修改檔案**：[src/lib/config.ts](file:///Users/joseph/Downloads/stock-pro-main/src/lib/config.ts)
- 將 `CONFIG.FINMIND.TOKEN` 預設 Token 替換為您的 Backer 金鑰：
  `eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJ1c2VyX2lkIjoiam9zZXBocGFpIiwiZW1haWwiOiJhMTg5MTEyODkxMjJAZ21haWwuY29tIiwidG9rZW5fdmVyc2lvbiI6MH0.qAmCuuJ9oqtjr1rSu2P7wsRe5FkRYgZY8yzSyv1Z9QY`

### 3. 設定環境變數
- **新建檔案**：[.env.local](file:///Users/joseph/Downloads/stock-pro-main/.env.local)
- 設定 `NEXT_PUBLIC_FINMIND_TOKEN`，確保本地開發與伺服器環境皆載入正確的金鑰。

---

## 驗證結果
- TypeScript 型別與語法檢查無誤。
