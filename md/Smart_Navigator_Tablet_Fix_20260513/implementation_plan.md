# 解決平板無法下載多份圖檔（智能選股報告）實作計畫

## 問題背景
在 iPad 或 Android 平板使用「智能選股導航」的自動篩選功能時，點擊「列印下載」只能下載到第一個圖檔（Part 1），後續圖檔被瀏覽器安全性原則阻擋。這是因為行動裝置瀏覽器通常不允許在單次使用者操作下觸發多個自動下載連結。

## 解決方案
在「智能選股導航」結果頁面增加一個「下載 PDF 報告」按鈕，與原有的「列印下載」（PNG）並存。
1. **保留 PNG 下載**：現有的 `handleDownload` 邏輯維持不變，供電腦端使用者選擇使用。
2. **新增 PDF 下載**：新增 `handleDownloadPDF` 函數，專為平板使用者或希望獲得單一文件的使用者設計。
3. **高品質整合**：PDF 下載同樣採用「分段（Chunks）」截圖策略，確保高解析度且不超過畫布限制，最後合併輸出為單一 PDF。

## 擬定的修改內容

### [Component] Smart Navigator 頁面

#### [MODIFY] [page.tsx](file:///Users/joseph/Downloads/stock-pro-main/src/app/smart-navigator/page.tsx)
- **State**: 新增 `isExportingPDF` 狀態。
- **UI**: 在原有的「列印下載」按鈕旁邊增加「下載 PDF」按鈕。
- **Logic**: 新增 `handleDownloadPDF` 函數：
    - 使用動態導入 `jspdf`。
    - 複用 `handleDownload` 的分段（CHUNK_SIZE = 15）邏輯。
    - 每個分段截圖後，將 `canvas` 加入 PDF 實例。
    - 處理自動分頁（A4 格式）。
    - 最後執行 `pdf.save()`。

## 驗證計畫

### 自動化測試 (模擬環境)
- 無

### 手動驗證 (請使用者協助)
1. 在 iPad/平板上執行自動篩選。
2. 點擊「列印下載」。
3. 確認是否彈出單一 PDF 下載視窗，且內容包含所有篩選出的股票卡片。
4. 確認 PDF 畫質清晰且無裁切。
