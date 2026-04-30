# Debug 單股分析按鈕卡轉圈問題與修改按鈕名稱

問題描述：輸入個股代號並點擊「三大信號」按鈕後，第一次可以正常顯示，但按鈕會持續轉圈圈（Loading 狀態未解除），導致無法繼續輸入其他股票或再次點擊按鈕。此外，需將按鈕名稱改為「共振掃描」。

## User Review Required

> [!IMPORTANT]
> 根據您的要求，這是即將執行的修改計畫。請確認是否要開始執行修改代碼。我會在修改前自動備份目前的檔案。

## Proposed Changes

### Dashboard Component

#### [MODIFY] page.tsx (src/app/page.tsx)
- 在 `runSingleStockAnalysis` 函數中，加入 `finally` 區塊，並於其中執行 `setIsAnalyzingSingle(false);`。
- 這樣無論成功取得股價資訊還是發生錯誤，都能確保按鈕狀態被重置，不再卡在轉圈圈。

#### [MODIFY] StockSearch.tsx (src/components/dashboard/StockSearch.tsx)
- 將第 116 行的 `<span className="text-2xl font-black whitespace-nowrap">三大信號</span>` 修改為：
  `<span className="text-2xl font-black whitespace-nowrap">共振掃描</span>`

## Verification Plan

### Manual Verification
1. 在搜尋框中輸入股票代號並點擊「共振掃描」按鈕。
2. 確認載入動畫顯示，且分析完成後載入動畫消失。
3. 搜尋框清空或修改代號後，「共振掃描」按鈕可以再次點擊而不會被鎖定。
4. 檢查按鈕顯示文字確實已改為「共振掃描」。
