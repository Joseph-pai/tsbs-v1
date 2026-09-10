# 本地數據預載庫與「下載最新股票數據」架構設計計畫

## 背景與目標

為了解決 Netlify Serverless 限制導致「每次傳送 2 支股票、掃描需發送幾十次請求且非常緩慢」的問題，本計畫提出 **「本地數據倉庫 (Local Data Lake) + 離線秒級掃描」** 架構：

1. **一鍵下載全市場數據**：主頁面上方新增 **「🔄 下載最新股票數據」** 按鈕，點擊後一次性打包預載今日全市場上市/上櫃股票數據，並於介面顯示 **「最新數據時間：2026-09-10 16:30」**。
2. **數據儲存至內部 (IndexedDB / SessionStorage)**：下載後的數據保存在瀏覽器高速資料庫中。
3. **極速掃描 (純前端 / 本地運算)**：點擊定點共振掃描或短線掃描時，直接從網站內部資料庫調用數據並完成分析，掃描速度從原本數十分鐘縮短至 **1~2 秒秒級完成**，且再也不會觸發 Netlify 502/504 逾時！

---

## 架構與功能設計 (User Review Required)

> [!IMPORTANT]
> 依據全局規範：
> 1. **修改代碼前詢問**：提出計畫供您審閱，經您同意後才會開始修改程式碼。
> 2. **自動備份**：修改程式碼前會自動複製現有檔案並存至 `_backups/` 目錄。
> 3. **無瀏覽器/影片**：未經許可不會開啟瀏覽器或錄製影片。

---

## 擬議變更 (Proposed Changes)

### 1. 數據預載服務 (NEW Component / Service)
#### [NEW] [dataSyncService.ts](file:///Users/joseph/Downloads/stock-pro-main/src/services/dataSyncService.ts)
- 負責向後端 API 抓取一次性打包的全市場快照與指標數據。
- 提供 `IndexedDB` 本地高速儲存與讀取介面。
- 記錄並管理最後更新時間戳記 (Last Sync Timestamp)。

### 2. 一鍵打包 API 端點 (NEW API Route)
#### [NEW] [route.ts](file:///Users/joseph/Downloads/stock-pro-main/src/app/api/market/bulk-sync/route.ts)
- 提供 `GET /api/market/bulk-sync` 端點。
- 將證交所全市場快照與熱門股數據進行一次性打包壓縮回應，減少連線次數。

### 3. 主頁面UI與掃描流程調整
#### [MODIFY] [page.tsx](file:///Users/joseph/Downloads/stock-pro-main/src/app/page.tsx)
- **新增 UI 組件**：在控制面板或頂部列加入「🔄 下載最新股票數據」按鈕與「數據狀態：未下載 / 最新 2026-09-10 16:30」。
- **升級掃描邏輯**：
  - 掃描前優先檢查網站內部資料庫是否有最新的快照。
  - 若已下載最新數據，直接在本地以高速內存引擎完成共振篩選（耗時 < 1 秒）。
  - 若無數據，引導使用者點擊下載按鈕或進行自動增量預載。

---

## 驗證計畫 (Verification Plan)

### 自動化測試
- 執行 `npx tsc --noEmit` 確保型別定義與 API 回傳格式正確。

### 功能驗證
1. **點擊「下載最新股票數據」**：確認按鈕成功預載數據並更新 UI 顯示「最新數據日期時間：YYYY-MM-DD HH:mm」。
2. **執行定點共振掃描**：確認掃描直接調用網站內部預載數據，可以在 1~2 秒內快速產出分析結果，完全不會發生 Netlify 502/504 逾時。
