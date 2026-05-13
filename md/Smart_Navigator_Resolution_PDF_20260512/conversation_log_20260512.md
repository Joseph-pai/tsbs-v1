# 智能選股導航：列印解析度優化與報告完整化記錄 (2026-05-12)

## 任務背景
使用者反應「智能選股導航」在股票檔數較多（約 90 檔）時，下載的圖片放大後非常模糊。

## 優化歷程與決策

### 階段 1：初步調整解析度 (Scale)
- **分析**：發現 `html2canvas` 設有動態縮放保護，超過 16,000 像素會強制降速。
- **動作**：將 `scale` 預設值從 1.2 調高至 2。
- **結果**：對於 90 檔的長列表，依然會觸發保護機制導致模糊。

### 階段 2：嘗試分頁 PDF 方案
- **提案**：將列表分頁（每 8 檔一頁）並合併為 PDF。
- **問題**：使用者反饋 PDF 頁面邊緣會產生內容截斷（Truncation），導致卡片不完整。

### 階段 3：最終定案 - 高品質分段圖片 (Segmented PNG)
- **策略**：
    - 將清單每 15 檔股票分為一組。
    - 每組獨立捕捉為高品質 PNG (`scale: 2`)。
    - 命名包含日期與序號（如 `_Part1`, `_Part2`）。
- **完整化優化**：根據使用者要求，在 `Part 1` 中加入了「搜尋面板」與「統計摘要」區塊，使報告具備完整上下文。

## 技術實現摘要

### 代碼變更：[page.tsx](file:///Users/joseph/Downloads/stock-pro-main/src/app/smart-navigator/page.tsx)
- **DOM 標記**：
    - `stock-result-card`：用於識別股票卡片以便分段。
    - `stock-search-panel`：捕捉搜尋條件與日曆。
    - `stock-filter-summary-container`：捕捉類別統計數據。
- **下載邏輯 (`handleDownload`)**：
    - 偵測卡片數量。
    - 執行循環分段處理。
    - 第一段額外克隆並插入標題與設定區塊。
    - 使用克隆技術（Clone Node）在內存中渲染容器，避免干擾使用者當前畫面。
    - 鎖定 `scale: 2` 並移除動畫類名（`animate-in` 等）確保截圖清晰、不透明。

## 備份資訊
- **手動備份文件**：`src/app/smart-navigator/page_20260512_manual_backup.tsx` (可用於回退至修改前的狀態)。

## 文件清單 (位於 `md/Smart_Navigator_Resolution_PDF_20260512/`)
- `plan_v1_scale_adjustment.md`: 初期方案記錄。
- `task_v1_scale_adjustment.md`: 初期任務追蹤。
- `walkthrough_v1_scale_adjustment.md`: 初期執行結果。
- `conversation_log_20260512.md`: 本紀錄文件。
