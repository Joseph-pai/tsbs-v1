# 智能選股導航：換手率動態基準升級計畫

## 目標

將現有固定門檻的換手率判斷（5% / 25%），升級為「以過去 20 日平均換手率為基準」的動態判斷，並新增五種主力訊號識別邏輯，讓系統更精準地反映台灣股市不同類型個股的量價關係。

---

## Proposed Changes

### 後端核心邏輯

#### [MODIFY] [route.ts](file:///Users/joseph/Downloads/stock-pro-main/src/app/api/smart-navigator/route.ts)

**改動 1 — 計算 20 日動態換手率基準**

新增計算邏輯，取每日成交量 ÷ 總股本，得出過去 20 日每日換手率，再平均得出 `avg20Turnover`：

```typescript
// 計算過去20日每日換手率，取平均作為基準
const last20 = prices.slice(-20);  // 最近20筆（含最新一日）
let avg20Turnover = 0;
if (totalShares && totalShares > 0) {
    const turnoverRates = last20.map(p => (p.Trading_Volume * 1000 / totalShares) * 100);
    avg20Turnover = turnoverRates.reduce((a, b) => a + b, 0) / turnoverRates.length;
}
```

**改動 2 — 動態換手熱度判斷**（替換原有固定 5% / 25%）

| 原本 | 改後 |
|---|---|
| `isHighTurnover = turnoverRate > 5%` | `isHighTurnover = turnoverRate > avg20Turnover * 2` |
| `isExtremelyHighTurnover = turnoverRate > 25%` | `isExtremelyHighTurnover = turnoverRate > avg20Turnover * 4` |

若 `totalShares` 不可用，保留原本 5MA 成交量比對的 fallback 邏輯。

**改動 3 — 新增近 5 日換手率趨勢（識別訊號 4 & 5）**

```typescript
// 計算近5日換手率陣列，用於識別縮量洗盤與對倒震盪
const last5TurnoverRates = prices.slice(-5).map(p =>
    totalShares ? (p.Trading_Volume * 1000 / totalShares) * 100 : 0
);
const isTrending5DayHighTurnover = last5TurnoverRates.every(r => r > avg20Turnover * 1.5);
const isShrinkingTurnover = last5TurnoverRates[4] < avg20Turnover * 0.5;  // 最新一日明顯縮量
```

**改動 4 — 新增長上影線 K 棒形態識別（精緻化訊號 2）**

```typescript
// 判斷最新一日是否出現長上影線（高開低收 / 上影線 > 實體2倍）
const body = Math.abs(latestData.close - latestData.open);
const upperShadow = latestData.max - Math.max(latestData.close, latestData.open);
const hasLongUpperShadow = body > 0 && upperShadow > body * 2;
```

> [!NOTE]
> `latestData.open` 需確認 ExchangeClient 是否已回傳開盤價欄位。若無，此項改為備用邏輯。

**改動 5 — 更新燈號判斷邏輯（對應五種訊號）**

重新整理 `light` 判斷流程：

```
訊號 1（低位放量）: positionPercent < 30 && isHighTurnover → 綠燈
訊號 2（高位出貨）: positionPercent > 70 && (isExtremelyHighTurnover || hasLongUpperShadow) → 紅燈
訊號 3（突破拉升）: positionPercent 30~70 && isHighTurnover → 綠燈
訊號 4（縮量洗盤）: positionPercent 30~70 && isShrinkingTurnover → 黃燈 + 洗盤解讀
訊號 5（對倒震盪）: isTrending5DayHighTurnover && !isHighlyRising → 黃燈 + 警示解讀
```

**改動 6 — 回傳新指標給前端**

在 `metrics` 物件中新增：
- `avg20Turnover` — 20日平均換手率（%）
- `turnoverMultiple` — 當日換手率相對 20 日均值的倍數
- `signalType` — 識別到的訊號類型（1~5 或 `null`）

---

### 前端解讀擴充

#### [MODIFY] [page.tsx](file:///Users/joseph/Downloads/stock-pro-main/src/app/smart-navigator/page.tsx)

**改動 1 — 新增解讀字典條目**（對應新訊號的白話解讀）

| 新增 key | 對應情境 |
|---|---|
| `縮量洗盤，籌碼鎖定` | 訊號 4：上漲中繼縮量 |
| `連續換手股價停滯` | 訊號 5：對倒震盪 |
| `高位長上影線` | 訊號 2 精緻化 |
| `換手倍數` | 顯示當日換手率是 20 日均值的幾倍 |

**改動 2 — 在解讀區塊顯示換手率基準資訊**

在「真實換手率 x.xx%」文字後，補充顯示「（20日均: y.yy%，為均值 z 倍）」，幫助使用者理解量的相對強度。

---

## 需確認事項

> [!IMPORTANT]
> **開盤價欄位**：`hasLongUpperShadow` 計算需要 `latestData.open`。請確認 ExchangeClient 的資料結構中是否有 `open` 欄位？若沒有，長上影線的判斷將跳過，其餘改動不受影響。

> [!NOTE]
> **Fallback 邏輯保留**：當 `totalShares` 不可用時（無法取得總股本），動態閾值改動無法生效。此情況仍保留原有 5MA 成交量比對邏輯，確保向後相容。

---

## Verification Plan

### 手動驗證（不需要瀏覽器）
1. 測試台積電（2330）— 大型股，換手率本身很低，動態基準應能正常識別異常量
2. 測試航運股（如 2603 長榮）— 高換手率常態股，動態基準應避免假訊號
3. 確認回傳的 `avg20Turnover` 和 `turnoverMultiple` 數值合理

### 代碼驗證
- 確認 `next build` 無 TypeScript 編譯錯誤
