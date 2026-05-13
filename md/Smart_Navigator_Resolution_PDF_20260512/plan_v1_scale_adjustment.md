# 提高智能選股導航截圖清晰度

根據您的要求，我們將調高「智能選股導航」在執行列印下載時的圖片解析度預設值，以改善放大後的模糊問題。

## 修改內容

### 智能選股導航組件 (Smart Navigator)

#### [MODIFY] [page.tsx](file:///Users/joseph/Downloads/stock-pro-main/src/app/smart-navigator/page.tsx)
- 將 `handleDownload` 函數中的 `dynamicScale` 預設值由 `1.2` 修改為 `2`。
- 在該行代碼後方加入註解：`// 提高截圖清晰度預設值至 2 (DPR)，改善放大後的模糊問題`。

## 執行流程

1. **備份文件**：修改前將自動複製並保留目前的版本（文件名稱加上日期與時間）。
2. **應用修改**：執行代碼替換。
3. **推送到 GitHub**：提交並推送變更。

## 驗證計劃

### 手動驗證
- 檢查代碼中 `dynamicScale` 是否已成功更新為 `2`。
- 確認註解內容正確無誤。
