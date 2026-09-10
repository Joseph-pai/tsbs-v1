# Scrapling Data Acquisition Service

獨立公開資料爬蟲與事件資料標準化服務 (Data Acquisition & Event Alpha Extractor Service).

## 📌 服務原則與合規聲明
1. **公開資料採集**：本服務僅允許抓取公司官方網站公告、TWSE/TPEX 公開資訊及合法新聞報導。
2. **遵守爬蟲規範**：
   - 嚴格遵守 `robots.txt` 協定與網站 Terms of Service。
   - 內建 Rate Limiting (請求間距與頻率限制)，避免造成伺服器負擔。
3. **安全邊界**：
   - **絕不**繞過登入、CAPTCHA、付費牆、存取控制或任何安全機制。
   - 絕不直接修改線上 Production 資料庫。
   - 零 AI 依賴與零控制路徑干擾。

## 🚀 API 介面
- `GET /health` : 服務健康檢查與狀態。
- `POST /crawl` : 觸發公開來源爬蟲任務 (輸入來源網址或標的代碼)。
- `POST /events` : 取得經 SHA-256 雜湊與標準化後的 Event JSON 列表。

## 🛠️ 執行說明
```bash
# 安裝依賴
pip install -r requirements.txt

# 啟動 API 服務 (預設 Port 8000)
python -m uvicorn api.main:app --host 0.0.0.0 --port 8000
```
