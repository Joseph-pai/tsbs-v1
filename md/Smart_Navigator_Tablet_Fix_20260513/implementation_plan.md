# 解決平板下載與分頁斷裂實作計畫 (最終版：單頁長卷式 PDF)

## 問題背景
1. **平板限制**：iPad/Android 瀏覽器禁止一次觸發多個圖檔下載。
2. **分頁斷裂**：原本 A4 分頁模式會將股票卡片從中切斷，影響閱讀。

## 解決方案
在「智能選股導航」增加「下載 PDF」按鈕，並採用「單頁長卷」技術。
1. **單一檔案**：繞過平板的安全限制。
2. **單頁無限高度**：動態計算內容總高度，生成單一頁面的 PDF，徹底消除分頁斷裂。
3. **分段捕捉**：內部仍使用分段截圖 (Chunks) 以確保大型報告的渲染穩定性，最後在 PDF 中無縫拼接。

## 修改內容

### [Component] Smart Navigator 頁面

#### [MODIFY] [page.tsx](file:///Users/joseph/Downloads/stock-pro-main/src/app/smart-navigator/page.tsx)
- **State**: `isExportingPDF`。
- **Logic**: `handleDownloadPDF` 重構：
    - 遍歷所有卡片分段並截圖，儲存於 `capturedChunks` 陣列。
    - 累計所有分段的高度 (`totalHeightMM`)。
    - 建立 `jsPDF` 實例，格式設為 `[210, totalHeightMM]`。
    - 依序將截圖貼入該單一頁面。
    - 執行 `pdf.save()`。

## 驗證計畫
1. 在 iPad 上執行「下載 PDF」。
2. 確認下載的是單一檔案。
3. 確認 PDF 是一條完整的長圖，沒有分頁縫隙，卡片完整且清晰。
