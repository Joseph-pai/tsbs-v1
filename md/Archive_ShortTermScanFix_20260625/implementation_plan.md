# 短線過濾掃描（scanShortTerm）修正計劃

## 背景

根據您對現有六大策略的 Bug 分析，以及對 `scanner.ts`（`scanShortTerm` 函數）、`engine.ts` 和 `page.tsx` 的完整程式碼審查，本計劃針對四個核心矛盾點進行精準修正。

---

## 已發現的具體 Bug（程式碼層級）

### Bug 1：策略一 × 策略五「邏輯自相矛盾」
**位置**：`scanner.ts` 第 479–482 行

```ts
// 現有錯誤邏輯：
if (marketMode === 'extreme' && positionRatio >= 0.40) return null;  // ← 極嚴格模式只接受 <40% 位階
if (positionRatio > 0.80) return null;                               // ← 一般也排除 >80%
```

**問題**：當大盤 >80%（極熱市場），邏輯要求找 60 日位階 <40% 的股票（即破底股），與「強勢股動量」原則完全相反。

---

### Bug 2：策略五「誤殺真正的飆股」
**位置**：`scanner.ts` 第 482 行

```ts
if (positionRatio > 0.80) return null;  // ← 硬性排除，不管市場狀況
```

**問題**：連續強勢噴出的股票（AI概念、重電）60 日位階永遠 >90%，會被這條硬性排除。

---

### Bug 3：策略三 × 策略六「量能條件衝突」
**位置**：`scanner.ts` 第 495 行（策略六）和第 525 行（策略三）

```ts
// 策略六：今日量 > 45日均量 × volThreshold（2.5~5x）
if (priorVol45Avg <= 0 || todayVol < priorVol45Avg * volThreshold) return null;

// 策略三 VCP 條件：今日量 > 20日均量 × 2.5
if (todayVol < priorVol20Avg * 2.5) return null;
```

**問題**：同時要求「45日均量 × 倍數」和「20日均量 × 2.5」兩個獨立量能門檻，當前幾天縮量時 45日均量被拉低、20日均量相對高，兩者交叉點計算不一致，容易出現矛盾。

---

### Bug 4：RS 週期過短（策略四）
**位置**：`scanner.ts` 第 529–535 行

```ts
// 只取 10 日漲幅計算 RS
const stock10 = closes.slice(-10);
if (indexReturn10 !== 0 && stockReturn10 < indexReturn10 - 0.02) return null;
```

**問題**：10 天週期受短線雜訊影響極大，大盤或個股單日波動就可能使結果翻轉。

---

## 修正方案（逐條對應）

### 修正一：重構位階邏輯（修正 Bug 1 + Bug 2）

**核心理念**：放棄「硬性排除高位股」，改為「距離高點比」+「市場溫度匹配」

```
新邏輯（取代舊策略五）：

1. 計算「距 60 日高點距離」= (max60 - today.close) / max60
   → 距離 ≤ 10%  = 高位（near high）
   → 距離 11-40% = 中位
   → 距離 > 40%  = 低位

2. 市場 × 位階 匹配矩陣：
   ┌──────────────┬──────────────────────┬──────────────────────┐
   │ 市場狀態      │ 允許位階範圍          │ 額外條件              │
   ├──────────────┼──────────────────────┼──────────────────────┤
   │ normal       │ 全部放行             │ 無                   │
   │ strict       │ 距高點 ≤ 20% 或低位  │ 無                   │
   │ extreme      │ 距高點 ≤ 10%         │ 必須滿足 VCP 收縮     │
   │              │ （強勢突破）         │ 且不能連續爆量 3 天+  │
   └──────────────┴──────────────────────┴──────────────────────┘

3. 真正的「過熱排除」條件（取代舊的 >80% 排除）：
   positionRatio > 0.95（即 95% 位階）
   且 今日爆量日數連續 ≥ 3 天（即已噴出 3 天以上） → 排除
```

### 修正二：大盤極熱模式（extreme）的邏輯反轉（修正 Bug 1）

```
舊邏輯：extreme 模式 → 找低位股（<40%）
新邏輯：extreme 模式 → 找高位強勢突破股，但要求更嚴格的突破品質條件：
  - 突破當天必須是「整根陽線」（上影線 < 實體 30%，比原本 50% 更嚴）
  - VCP 收縮必須更完整（5日ATR < 20日ATR × 50%，比原本 60% 更嚴）
  - 不接受「已連續爆量 3 天以上」的股票（已末段）
```

### 修正三：整合量能門檻（修正 Bug 3）

```
統一使用「45日均量」作為唯一基線，廢除與「20日均量 × 2.5」的衝突：

舊：
  策略六：todayVol > priorVol45Avg × volThreshold
  策略三 VCP：todayVol > priorVol20Avg × 2.5  ← 衝突！

新（統一為單一 VOLUME_MULTIPLIER 變數）：
  const VOL_BREAKOUT_MULTIPLIER = volThreshold;  // 由大盤模式決定
  策略六：todayVol > priorVol45Avg × VOL_BREAKOUT_MULTIPLIER  ← 保留
  策略三 VCP：移除 todayVol > priorVol20Avg × 2.5 這條（已被策略六涵蓋）
  VCP 條件改為只檢查「突破前的收縮度」：
    - 5日ATR < 20日ATR × 60%
    - 5日均量 < 20日均量 × 70%
    （不重複要求爆量，因為策略六已做）
```

### 修正四：RS 週期由 10 日改為 20 日（修正 Bug 4）

```
舊：
  const stock10 = closes.slice(-10);
  indexReturn10 = (最近10日漲幅)

新：
  const RETURN_DAYS = 20;  // 改為 20 日
  const stockReturn20 = closes.slice(-RETURN_DAYS)...
  const indexReturn20 = taiexHistory.slice(-RETURN_DAYS)...
  if (indexReturn20 !== 0 && stockReturn20 < indexReturn20 - 0.02) return null;
  if (stockReturn20 > indexReturn20 + 0.03) rsBonus = 5;
```

---

## 受影響文件

### 主要修改：[scanner.ts](file:///Users/joseph/Downloads/stock-pro-main/src/services/scanner.ts)

**修改範圍**：`scanShortTerm` 函數（第 288–667 行）

| 行號 | 修改內容 |
|------|---------|
| 397–405 | RS 計算改為 20 日（取代 10 日）|
| 472–482 | 重寫位階過濾邏輯（引入距高點比 + 市場匹配矩陣）|
| 521–525 | VCP 條件三移除（不重複要求爆量，已由策略六統一）|
| 527–539 | RS 排除改用 20 日漲幅 |
| 新增 | `consecutiveBoomDays` 計算（連續爆量天數，供過熱判斷）|

### 前端更新：[page.tsx](file:///Users/joseph/Downloads/stock-pro-main/src/app/page.tsx)

**修改範圍**：短線掃描結果說明文字（第 1535–1543 行）

- 更新六大策略描述，將策略五的「>80% 排除」改為「距高點比過濾」

---

## 不修改的部分

- `engine.ts`：不動（`evaluateStock` 函數的 VCP 邏輯屬於強化掃描，與短線掃描獨立）
- `scanMarket`、`filterStocks`、`analyzeStock`：完全不動
- `page.tsx` 的 `runShortTermScan` 函數：不動
- API route `/api/scan/short-term/route.ts`：不動

---

## 開放問題（請確認）

> [!IMPORTANT]
> **問題 1**：修正後的 `extreme` 模式不再找低位股，而是找「距 60 日高點 ≤ 10% 的強勢突破股」但要求更嚴格。這可能導致 extreme 模式掃出數量更少（甚至 0 支）。您是否接受這個取捨？

> [!IMPORTANT]
> **問題 2**：RS 改為 20 日後，在大盤急漲的情況下（如大盤 20 日漲 15%），個股需要同步 ≥13% 才不被排除，這條件比 10 日更穩定但篩選仍然偏嚴。是否同意改為 20 日？

> [!NOTE]
> **問題 3**：修正三建議統一使用 45 日均量，移除 VCP 條件中的「20日均量 × 2.5」爆量判斷（因已被策略六涵蓋）。這樣 VCP 就專注於「收縮型態」，策略六專注於「突破爆量」，兩者各司其職。您是否同意此分工方式？

---

## 預估效果

| 修正項目 | 預估改善 |
|---------|---------|
| 修正一+二：位階邏輯反轉 | 強勢飆股不再被誤殺，極熱市場改要求更嚴格突破品質 |
| 修正三：量能統一 | 消除 Bug，邏輯更清晰，避免邊界衝突 |
| 修正四：RS 改 20 日 | 減少每天換血，篩選器更穩定 |

---

## PR 規劃（依您需求）

- **PR 1（本次）**：scanner.ts 的 Bug 修正（修正一至四）
- **PR 2（後續）**：如需 state machine 監控（monitor.ts）另開計劃

---

*計劃建立時間：2026/06/25*
