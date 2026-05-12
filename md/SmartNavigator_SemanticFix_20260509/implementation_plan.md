# 智能選股導航：雙模式語義重構計畫

## 核心問題定義

| 問題 | 現況 | 目標 |
|------|------|------|
| **主力進場模式** 燈號語義混亂 | 紅/黃燈混入了「高位出貨風險」的描述，與「找買點」的目的矛盾 | 三色燈只表達「主力進場的確信度」，與出貨概念完全分離 |
| **出貨預警模式** 缺少「安全」等級 | 只篩選有出貨前兆的股票，無法顯示「完全沒有出貨跡象」的股票 | 加入「🟢 無出貨跡象」等級，讓用戶能看到安全的股票做對比 |

---

## 設計決策

### 一、主力進場模式 — 重新定義三色燈

**核心原則**：用戶選擇「主力進場」時，燈號只回答一個問題：**「主力進場的確信度有多高？」**

| 燈號 | 意義 | 觸發條件 |
|------|------|----------|
| 🟢 **綠燈 (強烈買入訊號)** | 多個指標同時確認主力正在積極佈局，可跟進 | 低位/中位出現明顯放量（高換手）+ MACD 配合 |
| 🟡 **黃燈 (初步佈局訊號)** | 有部分跡象顯示主力試探性操作，但確認度不足 | 低位縮量蓄勢 / MACD剛轉正 / 中位量縮整理 |
| 🔴 **紅燈 (不適合買入)** | 價格位置過高追買風險大，或已跌破均線趨勢轉弱 | 跌破20MA / 股價位於高位（positionPercent > 60%）任何狀況 |

> **關鍵調整**：高位的所有狀態（目前的黃燈高位系列）統一改成**紅燈**，因為從「找買點」的角度，高位本身就不適合追買，這樣燈號才不會誤導用戶。

**篩選結果顯示邏輯（主力進場模式）**：
- 🟢 綠燈：重點顯示，這是用戶最想找的股票
- 🟡 黃燈：次要顯示，提醒用戶「可觀察但未確認」
- 🔴 紅燈：**不納入自動篩選結果**（單獨查詢時仍顯示，但自動篩選跳過，因為這批對找買點沒有意義）

---

### 二、出貨預警模式 — 新增安全等級

**核心原則**：出貨預警的目的是幫用戶「識別賣出時機」，因此需要完整的四個等級。

| 等級 | 意義 | 觸發條件 |
|------|------|----------|
| 🔴 **Alert (出貨進行中)** | 主力明確大量倒貨，立即離場 | 暴力出貨(避雷針/天量) 或 多重前兆+放量 |
| 🟠 **Warning (出貨前兆)** | 主力開始小量分批出貨，提高警覺 | 2個以上衰退前兆（MACD背離/量縮/滯漲）|
| 🟡 **Watch (留意觀察)** | 出現單一異常，尚未構成警報 | 1個衰退前兆 |
| 🟢 **Safe (無出貨跡象)** | 主力持股穩定，目前沒有出貨跡象 | `positionPercent <= 60%` 或所有前兆均未觸發 |

**篩選結果顯示邏輯（出貨預警模式）**：
- 預設顯示所有等級（含 Safe 的股票）
- 提供等級過濾器，讓用戶可以選擇只看「Alert」、「Warning」、「Watch」或「Safe」
- 排序：Alert → Warning → Watch → Safe

---

## Proposed Changes

### [MODIFY] [route.ts](file:///Users/joseph/Downloads/stock-pro-main/src/app/api/smart-navigator/route.ts)

**調整重點**：在主力進場燈號邏輯中，將 `positionPercent > 60` 的所有情況統一強制改為 `light = 'red'`，僅保留表達出場風險的 `signalTag`（例如「高位追漲風險」）但燈號強制為紅色。原本的黃燈高位系列全部升級為紅燈。

```typescript
// === 主力進場燈號重構 ===
// 高位區（>60%）：從找買點角度，一律是紅燈（不適合追買）
} else if (positionPercent > 60) {
    light = 'red'; // 所有高位狀態，從「找買點」的角度都是不適合追入
    // signalTag 根據具體情況描述風險程度
    if (isExtremelyHighTurnover || (isHighTurnover && hasLongUpperShadow)) {
        signalTag = '高位主力倒貨風險';
    } else if (distributionPrecursorCount >= 2) {
        signalTag = '高位動能衰竭';
    } else {
        signalTag = '高位追買風險高';
    }
}
```

**`distributionLevel` 加入 'safe' 等級**：

```typescript
// 新增 'safe' 作為有效的安全等級
let distributionLevel: 'none' | 'safe' | 'watch' | 'warning' | 'alert' = 'none';
if (positionPercent > 60) {
    if (isViolentDistribution || ...) {
        distributionLevel = 'alert';
    } else if (...) {
        distributionLevel = 'warning';
    } else if (...) {
        distributionLevel = 'watch';
    } else {
        distributionLevel = 'safe'; // 高位但目前無明顯出貨跡象
    }
} else {
    distributionLevel = 'safe'; // 低/中位，主力不在出貨區間，標記為安全
}
```

#### [MODIFY] [route.ts](file:///Users/joseph/Downloads/stock-pro-main/src/app/api/smart-navigator/route.ts)
- 高位 `positionPercent > 60` 的燈號全部強制設為 `red`
- `distributionLevel` 型別加入 `'safe'`，低中位自動設為 `'safe'`，高位未觸發前兆也設為 `'safe'`

---

### [MODIFY] [page.tsx](file:///Users/joseph/Downloads/stock-pro-main/src/app/smart-navigator/page.tsx)

**1. 主力進場模式 — 調整自動篩選邏輯**：
- 自動篩選只顯示 `light === 'green'` 或 `light === 'yellow'` 的股票（排除紅燈）
- 燈號過濾器只提供「全部」、「🟢 綠燈」、「🟡 黃燈」三個選項（移除紅燈選項，因為紅燈 = 高位不適合買）
- 說明文字修改為：「🟢 多指標確認主力進場 → 🟡 初步佈局訊號，需確認 → 🔴 高位或跌破均線，不納入篩選」

**2. 出貨預警模式 — 加入安全等級**：
- 自動篩選時，包含 `distributionLevel === 'safe'` 的股票
- 等級過濾器新增「🟢 無出貨跡象」按鈕
- 排序：alert → warning → watch → safe
- Safe 等級的卡片外觀：綠色邊框，顯示「✅ 目前無出貨跡象，主力持股穩定」

**3. 出貨預警卡片 — 加入 safe 狀態的渲染**：
```tsx
// 新增 safe 等級的顯示
const levelLabel = isAlert ? '🔴 出貨進行中' 
    : isWarning ? '🟠 出貨準備前兆' 
    : isSafe ? '🟢 無出貨跡象' 
    : '🟡 留意觀察';
```

## Verification Plan

### 手動確認邏輯
1. 用一檔低位股（如近 30 日位階 < 30% 且放量）查詢 → 應顯示 🟢 綠燈
2. 用一檔高位股（位階 > 70%）查詢 → 主力進場模式應顯示 🔴 紅燈；出貨預警模式應顯示對應等級
3. 在出貨預警模式的自動篩選中，確認「🟢 無出貨跡象」這個過濾按鈕能正常顯示並過濾結果

## Open Questions

> [!IMPORTANT]
> **主力進場模式是否完全排除紅燈股票？**
> 計畫中自動篩選將不顯示紅燈（高位/跌破均線）的股票。但若您希望讓用戶看到「這些是高風險、不要追入」的反面教材，可以保留紅燈但加上明確的「⛔ 勿追入」標記。請確認您希望的行為。
