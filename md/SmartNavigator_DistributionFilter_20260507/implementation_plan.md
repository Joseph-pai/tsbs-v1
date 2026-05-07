# 智能選股導航：主力出貨預警系統

## 目標

在現有「出貨進行中」紅燈訊號的基礎上，新增完整三層出貨預警，讓使用者能提前掌握主力動態，從「初步跡象」到「大量出貨」都能即時因應。

---

## 三個出貨警示等級

| 等級 | 顏色 | 觸發條件 | 市場含義 | 操作建議 |
|---|---|---|---|---|
| **留意觀察** | 🟡 黃色 | 高位（>60%）+ **1個**前兆訊號 | 單一跡象，尚不確定，但需提高警覺 | 停止加碼，準備停利計畫 |
| **出貨準備前兆** | 🟠 橙色 | 高位（>60%）+ **2個以上**前兆訊號 | 多重跡象同時出現，主力慢慢撤退 | 縮減部位 30~50%，設移動停利 |
| **出貨進行中** | 🔴 紅色 | 高位（>70%）+ 前兆 + 高換手放量 | 主力正在大規模倒貨給散戶 | 立即停損，清倉離場 |

---

---

## Proposed Changes

### 後端：新增計算邏輯

#### [MODIFY] [indicators.ts](file:///Users/joseph/Downloads/stock-pro-main/src/services/indicators.ts)

目前 `calculateMACD` 只回傳**最新一日**的 `{ dif, macd, osc }`。
要計算頂背離，需要整個 DIF 歷史陣列。

**新增一個 `calculateMACDFull` 函數**，回傳完整歷史陣列：

```typescript
export const calculateMACDFull = (prices: number[], shortPeriod = 12, longPeriod = 26, signalPeriod = 9) => {
    if (prices.length < longPeriod) return null;
    const emaShort = calculateEMA(prices, shortPeriod);
    const emaLong = calculateEMA(prices, longPeriod);
    const difArray = prices.map((_, i) => emaShort[i] - emaLong[i]);
    const macdArray = calculateEMA(difArray, signalPeriod);
    return { difArray, macdArray };
};
```

> [!NOTE]
> 不修改原有的 `calculateMACD`，保持向後相容，避免影響其他頁面。

---

#### [MODIFY] [route.ts](file:///Users/joseph/Downloads/stock-pro-main/src/app/api/smart-navigator/route.ts)

新增三個「準備出貨前兆」的計算邏輯：

---

**前兆訊號 A — MACD 頂背離（最可靠）**

```
邏輯：
1. 取得完整 DIF 歷史陣列（使用新的 calculateMACDFull）
2. 在過去 20 日內，找出「前一個價格高點」（local price peak）
3. 比較：
   - 當前收盤價 >= 前高  →  股價再創高（或持平）
   - 當前 DIF < 前高當日 DIF  →  動能卻在下降
4. 兩者同時成立 → 出現「頂背離」
```

```typescript
let hasMacdDivergence = false;
const macdFull = calculateMACDFull(closePrices);
if (macdFull && closePrices.length >= 20) {
    const lookback = 20;
    const recentPrices = closePrices.slice(-lookback);
    const recentDif = macdFull.difArray.slice(-lookback);
    
    // Find previous local peak (not the last bar, look 3~15 bars back)
    let prevPeakIdx = -1;
    let prevPeakPrice = -Infinity;
    for (let i = 2; i < lookback - 1; i++) {
        if (recentPrices[i] > recentPrices[i - 1] && recentPrices[i] > recentPrices[i + 1]) {
            if (recentPrices[i] > prevPeakPrice) {
                prevPeakPrice = recentPrices[i];
                prevPeakIdx = i;
            }
        }
    }
    
    const currentPrice = recentPrices[lookback - 1];
    const currentDif = recentDif[lookback - 1];
    
    if (prevPeakIdx !== -1) {
        const prevPeakDif = recentDif[prevPeakIdx];
        // 頂背離：當前價格 >= 前高，但 DIF 卻更低
        hasMacdDivergence = currentPrice >= prevPeakPrice * 0.98 && currentDif < prevPeakDif;
    }
}
```

---

**前兆訊號 B — 高位量能遞減（量縮滯漲）**

```
邏輯：
在高位（positionPercent > 60%），近 5 日的每日成交量呈現
連續遞減趨勢（線性回歸斜率為負），且當日均量 < 10日均量
→ 買方力道逐漸枯竭
```

```typescript
let isVolumeDeclineAtHigh = false;
if (positionPercent > 60 && volumesInShares.length >= 10) {
    const last5Vol = volumesInShares.slice(-5);
    // Check if volume is in declining trend (each day < previous)
    const decliningCount = last5Vol.filter((v, i) => i > 0 && v < last5Vol[i - 1]).length;
    const vol5Avg = last5Vol.reduce((a, b) => a + b, 0) / 5;
    const vol10Avg = volumesInShares.slice(-10).reduce((a, b) => a + b, 0) / 10;
    isVolumeDeclineAtHigh = decliningCount >= 3 && vol5Avg < vol10Avg;
}
```

---

**前兆訊號 C — 高位橫盤天數（無法再創新高）**

```
邏輯：
在高位（positionPercent > 60%），計算近期最高點出現在幾天前，
若超過 5 個交易日都沒有再突破前高 → 多方無力攻頂
```

```typescript
let highStagnationDays = 0;
if (positionPercent > 60 && prices.length >= 10) {
    const recentPrices = prices.slice(-10);
    const periodHighPrice = Math.max(...recentPrices.map(p => p.max));
    const highDayIdx = recentPrices.map(p => p.max).lastIndexOf(periodHighPrice);
    highStagnationDays = recentPrices.length - 1 - highDayIdx;
}
const isHighStagnant = highStagnationDays >= 5;
```

---

**前兆綜合判斷 — 出貨預警等級**

```typescript
// 出貨準備前兆：至少符合兩個前兆訊號，且在高位
const distributionPrecursorCount = [hasMacdDivergence, isVolumeDeclineAtHigh, isHighStagnant]
    .filter(Boolean).length;

const isDistributionWarning = positionPercent > 60 && distributionPrecursorCount >= 2;
const isDistributionAlert = positionPercent > 70 && distributionPrecursorCount >= 2 && isHighTurnover;
```

**出貨等級定義：**
| 條件 | 等級 | 中文說明 |
|---|---|---|
| `isDistributionAlert = true` | 🔴 出貨進行中 | 高位 + 高換手 + 2個以上前兆 |
| `isDistributionWarning = true` | 🟠 出貨準備前兆 | 高位 + 2個以上前兆（但尚未大量換手）|
| 只符合1個前兆 | 🟡 留意觀察 | 單一前兆，尚不構成警示 |

回傳 API 新增欄位：
```typescript
distribution: {
    warningLevel: 'none' | 'watch' | 'warning' | 'alert',
    hasMacdDivergence,
    isVolumeDeclineAtHigh,
    isHighStagnant,
    highStagnationDays,
    distributionPrecursorCount,
}
```

---

### 前端：新增出貨預警 UI 區塊

#### [MODIFY] [page.tsx](file:///Users/joseph/Downloads/stock-pro-main/src/app/smart-navigator/page.tsx)

在「智能操作價格」區塊**之前**，新增一個「**主力動向預警**」卡片，只在 `warningLevel !== 'none'` 時顯示：

```
┌─────────────────────────────────────┐
│  ⚠️  主力動向預警                    │
│                                     │
│  🟠 出貨準備前兆 / 🔴 出貨進行中     │
│                                     │
│  ✓ MACD 頂背離（動能衰退）           │
│  ✓ 高位量能遞減（買方力道衰竭）      │
│  ✓ 5 日未突破前高（攻頂無力）        │
│                                     │
│  💡 操作建議：縮減部位，設移動停利   │
└─────────────────────────────────────┘
```

**顏色設計：**
- `warning`（準備出貨）→ 橙色邊框 `border-orange-500/40` + 橙色圖示
- `alert`（出貨進行中）→ 紅色邊框 `border-rose-500/40` + 紅色圖示
- `watch`（留意觀察）→ 黃色邊框，僅在高位顯示單一前兆提示

**INTERPRETATION_DETAILS 新增條目：**
- `MACD 頂背離` — 分析師角度解讀動能衰退訊號
- `高位量能遞減` — 買方枯竭的白話說明
- `高位橫盤滯漲` — 多方無力攻頂的市場含義

---

## User Review Required

> [!IMPORTANT]
> **橙色「出貨準備前兆」等級**：需要符合 **2個以上**前兆訊號才觸發，單一訊號只顯示「留意觀察」。這個門檻您覺得合適嗎？（可調整為只要1個即顯示）

> [!NOTE]
> **MACD 頂背離的容忍度**：目前設定「當前價格 >= 前高的 98%」才算接近前高。若設太嚴格（100%）可能漏掉一些背離訊號；太寬鬆則誤報增加。98% 是否合適？

> [!NOTE]
> **出貨預警卡片的顯示位置**：計畫放在「智能操作價格」之前（燈號之後）。您希望放在哪個位置？

---

## Verification Plan

### 手動驗證（不執行瀏覽器）
- 測試**長期高位橫盤股**（如某些傳產股）→ 確認 `isHighStagnant` 正確觸發
- 測試**主升段中的強勢股**（如台積電多頭期間）→ 確認不誤觸發出貨警示
- 測試**已下跌的股票**（positionPercent < 60%）→ 確認完全不顯示出貨預警卡片

### 代碼驗證
- 確認 `next build` 無 TypeScript 錯誤
