# 智能選股導航：出貨預警邏輯融合升級計畫

此計畫旨在將「當下極端價量異常 (暴力出貨)」與「一段時間的動能衰竭 (緩慢派發/溫水煮青蛙)」兩種出貨預警邏輯完美融合，讓使用者在單一模式下即可獲得最全面的高位風險防護，無須切換模式。

## 💡 融合策略分析

這兩種邏輯並不衝突，而是代表主力出貨的**兩種不同手法**。我們可以透過「優先級 (Priority)」的方式將它們整合在一個判斷樹中：

1.  **最高優先級 (突發致命性)：暴力出貨 (單日極端)**
    *   特徵：單日極度爆量 (4倍均量) 或 爆量帶長上影線 (避雷針)。
    *   行動：最危險的信號，直接給予 `紅燈`，標籤為「主力暴力出貨」。
2.  **次高優先級 (趨勢致命性)：動能衰竭 (緩慢派發)**
    *   特徵：沒有單日極端爆量，但滿足「三大前兆」中的 2 個以上 (MACD背離、量能遞減、高位滯漲)。
    *   行動：趨勢已經轉弱，主力正在悄悄撤退。給予 `紅燈` 或強烈警告，標籤為「高位動能衰竭」。
3.  **第三優先級 (潛在風險)：高位異常震盪**
    *   特徵：滿足 1 個前兆，或是連續 5 日高換手 (對倒)。
    *   行動：給予 `黃燈`，標籤為「高位初現疲態」或「高位對倒震盪」。

## Proposed Changes

### 1. 備份現有代碼 (User Global Rule)
在進行任何修改前，執行指令自動備份 `route.ts`：
- 將 `src/app/api/smart-navigator/route.ts` 複製為 `src/app/api/smart-navigator/route_[日期時間].ts.bak`

---

### [Component: Backend API]

#### [MODIFY] [route.ts](file:///Users/joseph/Downloads/stock-pro-main/src/app/api/smart-navigator/route.ts)
- **重構高位判斷區塊 (`positionPercent > 60` 及 `> 70`)**：
  整合現有的 `distributionPrecursorCount` (三大前兆計算) 與 `light` 賦值邏輯。
- **更新 `if-else` 判斷順序與文案**：
  ```typescript
  // 假設位階 > 60 (放寬警戒區，以便捕捉緩慢派發)
  if (positionPercent > 60) {
      rules.push(`目前股價處於近 ${period} 日相對高位（>60%）。`);
      
      // 1. 優先判斷：單日暴力出貨 (原本的 positionPercent > 70 且爆量條件)
      if (positionPercent > 70 && (isExtremelyHighTurnover || (isHighTurnover && hasLongUpperShadow))) {
          light = 'red';
          signalTag = hasLongUpperShadow ? '主力逢高倒貨 (避雷針)' : '主力高位暴力出貨';
          rules.push('⚠️ [極端風險] ... (保留現有警告文案)');
      } 
      // 2. 其次判斷：動能衰竭/緩慢派發 (三大前兆中 >= 2 個)
      else if (distributionPrecursorCount >= 2) {
          light = 'red';
          signalTag = '高位動能衰竭 (盤跌預警)';
          rules.push('⚠️ [趨勢風險] 股價出現多重衰退前兆 (如MACD頂背離、量能萎縮或高位滯漲)。主力可能正在利用盤整掩護，進行「溫水煮青蛙」式的緩慢派發。建議：提高警覺，跌破 20 日均線或跌破近期盤整區間底線時，必須立即停損/停利出場。');
      }
      // 3. 第三判斷：高位異常震盪或初期疲態
      else if (isTrending5DayHighTurnover && positionPercent > 70) {
          light = 'yellow';
          signalTag = '高位對倒震盪';
          // ... (保留現有文案)
      }
      else if (distributionPrecursorCount === 1) {
          light = 'yellow';
          signalTag = '高位初現疲態';
          rules.push('高位出現單一衰退前兆 (如量能不濟或指標背離)。目前尚未全面轉弱，但上漲動能已受阻。建議：持股者縮緊移動停利空間，不宜再加碼。');
      }
      else if (isHighTurnover && positionPercent > 70) {
          light = 'yellow';
          signalTag = '高位追漲風險';
          // ... (保留現有文案)
      }
      // 4. 其餘情況：高位惜售或觀察
      else if (isShrinkingTurnover && positionPercent > 70) {
          // ... (保留高位量縮惜售文案)
      } else {
          // ... (保留高位整理觀察文案)
      }
  }
  ```

## User Review Required
- **融合模式確認**：請問您是否同意將這兩種邏輯如上所述，透過「優先級」的方式整合在同一個判斷中？這樣您就不需要手動切換模式，系統會自動幫您找出是哪一種出貨手法並給出對應的紅燈/黃燈標籤。
- **門檻確認**：為了能捕捉到「溫水煮青蛙」的盤跌，我將整體高位警戒的觸發門檻從原先的 `> 70%` 稍微放寬至 `> 60%`，但在 `> 60% 且 <= 70%` 的區間，只會觸發「動能衰竭」的判斷，單日爆量等條件依然嚴格要求 `> 70%`，請問這樣設計是否符合您的預期？

## Verification Plan
1. 確認無 Type 錯誤，保存現有的 API 結構，避免破壞前端的解析。
2. 以不同型態的股票（如近期單日爆量急跌的股票 vs 高檔盤整量縮的股票）測試 API 回傳結果，確認是否能正確給出「暴力出貨」與「動能衰竭」兩種不同的 SignalTag 與文字解讀。
