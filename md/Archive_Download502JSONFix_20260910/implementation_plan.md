# 修復「下載最新股票數據」觸發 502 與 Unexpected end of JSON input 計畫

## 問題診斷與原因

當點擊「下載最新股票數據」時出現 `Failed to execute 'json' on 'Response': Unexpected end of JSON input` 與 `502 (Bad Gateway)` 錯誤，診斷原因如下：

1. **多個 Serverless 請求同時併發打證交所 API**：
   - 原 [dataSyncService.ts](file:///Users/joseph/Downloads/stock-pro-main/src/services/dataSyncService.ts) 使用 `Promise.all` 同時發送 3 個全市場 API 請求（上市快照 + 上櫃快照 + 產業 Mapping）。
   - 3 個 Serverless Function 在同一毫秒同時打向台灣證交所與上櫃中心 OpenAPI，導致證交所伺服器延遲或阻擋，進而觸發 Netlify 的 10 秒硬性關閉（502 Bad Gateway）。

2. **前端未檢測 `res.ok` 直接解析 JSON**：
   - 當 API 傳回 502 HTML 或空回應時，調用 `res.json()` 拋出 `Unexpected end of JSON input` 崩潰。

3. **後端 API 與 OpenAPI 缺乏 Timeout 保險**：
   - 證交所 API 在高流量時回應較慢，若沒設定短 Timeout，Serverless Function 會持續掛起直至被 Netlify 強制關閉。

---

## 擬議修復方案 (Proposed Changes)

> [!IMPORTANT]
> 依據全局規範，修改程式碼前會自動將相關檔案備份至 `_backups/` 目錄。

### 1. [MODIFY] [dataSyncService.ts](file:///Users/joseph/Downloads/stock-pro-main/src/services/dataSyncService.ts)
- **改為平滑分步下載 (Sequential Fetching)**：
  - 由原本併發打 API 改為「1. 上市快照 ➔ 2. 上櫃快照 ➔ 3. 產業 Mapping」依序平滑下載。
  - 即時顯示各階段下載進度百分比（如：`已完成上市數據 (1/3)` ➔ `已完成上櫃數據 (2/3)`）。
- **`res.ok` 安全回應防衛**：
  - 先檢測回應狀態 `if (!res.ok)`。若遇到網路或伺服器異常，傳回友善錯誤訊息，防止解析 JSON 拋出 `Unexpected end of JSON input`。

### 2. [MODIFY] [exchange.ts](file:///Users/joseph/Downloads/stock-pro-main/src/lib/exchange.ts)
- **證交所 OpenAPI 連線 Timeout 保護**：
  - 在 `getAllMarketQuotes` 中為 `axios.get` 加入 7 秒連線超時限制，確保不會因為證交所伺服器卡住而導致 Netlify 逾時關閉。

### 3. [MODIFY] [snapshot/route.ts](file:///Users/joseph/Downloads/stock-pro-main/src/app/api/market/snapshot/route.ts)
- **7.5 秒安全截斷保護**：
  - 增加 7.5 秒逾時保護機制，確保快照 API 無論如何都在 Netlify 10 秒限制前回傳有效 200 OK JSON。

---

## 驗證計畫 (Verification Plan)

### 自動化驗證
- 執行 `npx tsc --noEmit` 確保 TypeScript 編譯無誤。

### 測試驗證
- 點擊「下載最新股票數據」，確認下載進度平滑推進（1/3 ➔ 2/3 ➔ 3/3），無 502 或 JSON 崩潰，並成功儲存全市場數據。
