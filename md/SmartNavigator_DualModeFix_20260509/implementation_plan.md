# 智能選股導航：恢復並強化雙模式篩選計畫

非常抱歉先前誤解了您的用意。完全理解您的需求：「主力進場」是用來找**買點**的機會，「出貨預警」是用來找**賣點**的逃命訊號，兩者的目的截然不同，確實必須在介面上分開讓用戶選擇，不能混為一談。

以下是針對這個方向的修改計畫：

## 💡 核心修改邏輯

我們將在前端恢復「雙模式切換」，並在後端確保兩種不同目的的訊號能被精準分離與標示。

### 1. 前端介面恢復 (page.tsx)
*   **恢復「篩選模式」切換按鈕**：
    *   **🎯 主力進場模式**：目標是尋找買點。此模式下，用戶可以使用**「燈號過濾器 (綠燈/黃燈/紅燈)」**來篩選股票，主要關注底部放量、突破等綠燈或蓄勢黃燈的股票。
    *   **⚠️ 出貨預警模式**：目標是判斷賣出時機。此模式下，用戶可以使用**「警示等級過濾器 (出貨進行中/出貨前兆/觀察)」**來篩選高位風險股票。

### 2. 後端資料結構整合 (route.ts)
為了讓「出貨預警模式」能夠同時抓到**「盤跌衰退 (三大前兆)」**與**「單日暴力倒貨」**這兩種優點，我們將在 API 中對 `distributionLevel` 的賦值進行整合：

*   **出貨警示級別 (`distribution.level`)**：
    *   **Alert (🔴 出貨進行中)**：觸發條件為「極端爆量/長上影線 (暴力出貨)」**或**「多重前兆且伴隨高換手」。
    *   **Warning (🟠 出貨準備前兆)**：觸發條件為「多重前兆 (動能衰退)」。
    *   **Watch (🟡 留意觀察)**：觸發條件為「單一衰退前兆」。
*   透過將暴力出貨併入 `distributionLevel = 'alert'`，當用戶在前端選擇「⚠️ 出貨預警」模式時，無論是哪一種出貨手法，都會被精準抓出並歸類到相應的等級中。

## Proposed Changes

### [MODIFY] [route.ts](file:///Users/joseph/Downloads/stock-pro-main/src/app/api/smart-navigator/route.ts)
- 在計算 `distributionLevel` 時，加入「暴力出貨」的判斷條件。
  ```typescript
  // 新增暴力出貨布林值
  const isViolentDistribution = positionPercent > 70 && (isExtremelyHighTurnover || (isHighTurnover && hasLongUpperShadow));

  // 綜合出貨等級判定
  let distributionLevel: 'none' | 'watch' | 'warning' | 'alert' = 'none';
  if (positionPercent > 60) {
      if (isViolentDistribution || (distributionPrecursorCount >= 2 && (isHighTurnover || isExtremelyHighTurnover) && positionPercent > 70)) {
          distributionLevel = 'alert'; // 暴力出貨或放量衰退都屬於最高級別
      } else if (distributionPrecursorCount >= 2) {
          distributionLevel = 'warning';
      } else if (distributionPrecursorCount === 1) {
          distributionLevel = 'watch';
      }
  }
  ```
- 並在回傳 `distribution` 物件時加入 `isViolentDistribution` 標記，以便前端在顯示「出貨預警卡片」時，能針對暴力出貨給予專屬的警示解讀文案。

### [MODIFY] [page.tsx](file:///Users/joseph/Downloads/stock-pro-main/src/app/smart-navigator/page.tsx)
- **Git Checkout 恢復**：先從備份檔恢復被刪除的模式切換 UI 程式碼。
- **UI 更新**：
    - 恢復 `filterMode` 的狀態切換 (`green` vs `distribution`)。
    - 根據選擇的模式，分別顯示「燈號顏色過濾器」與「警示等級過濾器」。
    - 在「出貨預警卡片」的渲染中，若偵測到 `distribution.isViolentDistribution` 為 true，則顯示「極端爆量或避雷針」專屬的暴力出貨解讀文字。

## User Review Required
- 請問這個「將雙模式分開，並讓出貨預警模式能同時捕捉『暴力出貨』與『盤跌衰退』」的設計，是否完全符合您區分「找買點」與「找賣點」的業務邏輯？
- 若您確認，我將立即還原前端介面並實作此更新。
