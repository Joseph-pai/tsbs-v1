# 修復共振掃描與準確率回測 PDF 匯出不完整的問題

## 問題分析
「共振掃描」與「準確率回測」功能目前共用 `src/lib/pdfUtils.ts` 中的 `exportToPDF` 函式。
該函式目前採用「單一超長頁面」的匯出策略，將所有截圖區塊拼接到一個 PDF 頁面中。
當股票數量眾多時，總長度會超過 PDF 1.4 規範的 5080 毫米上限，導致後續內容空白或檔案損壞。

## 解決方案
我們將採用與「智能選股導航」相同的優化策略，對 `exportToPDF` 進行改造：
1. **動態多頁匯出**：不再強行合併成一個超長頁面，而是將每個截圖區塊（目前設定為 3000px 一跳）動態建立為 PDF 的獨立分頁。
2. **自動適應高度**：每一頁的高度都會根據截圖區塊的實際高度動態調整，確保內容完整且不被裁切。

此修改將同時解決以下功能的 PDF 匯出問題：
- **共振掃描結果報告**
- **準確率回測報告**

## 預計修改內容
### [MODIFY] [pdfUtils.ts](file:///Users/joseph/Downloads/stock-pro-main/src/lib/pdfUtils.ts)
- 更新匯出邏輯：使用 `pdf.addPage([pdfWidth, chunk.heightMM])` 替代 `totalHeightMM` 單頁邏輯。

## User Review Required
> [!IMPORTANT]
> 請問是否可以開始修改 `pdfUtils.ts` 以修復「共振掃描」與「回測報告」的匯出問題？
