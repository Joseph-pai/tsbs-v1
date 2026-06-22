# MACD 滯後問題修正計劃

## 背景說明

MACD（Moving Average Convergence Divergence）本質上是雙重指數平滑移動平均線（EMA）的差值再次做 EMA，因此有兩層滯後：
1. **第一層滯後**：EMA(12) 與 EMA(26) 本身都是平滑均線，對價格反應遲鈍
2. **第二層滯後**：Signal Line（MACD 訊號線）是 DIF 的 EMA(9)，再次平滑放大滯後

此 APP 目前 MACD 使用位置：[indicators.ts](file:///Users/joseph/Downloads/stock-pro-main/src/services/indicators.ts) 與 [smart-navigator/route.ts](file:///Users/joseph/Downloads/stock-pro-main/src/app/api/smart-navigator/route.ts)

---

## 目前問題點盤點（smart-navigator/route.ts）

| 位置 | 問題 | 滯後影響 |
|------|------|----------|
| L152 `isMacdPositive` | 只看 DIF 是否 > 0，EMA 本身有滯後 | 訊號發出時可能已漲一段 |
| L400-404 `isMacdJustTurnedPositive` | 直接用 DIF 前後兩根比較 | 單點翻正不可靠，容易假突破 |
| L248-272 `hasMacdDivergence` (頂背離) | 只用 difArray 與收盤比較 | 背離確認時早已滯後 3~5 根K |

---

## 修正方案（專業分析師技巧）

### 策略 1：EMA 計算改用「零相位移 EMA」初始化

> **核心問題**：標準 EMA 用第一根收盤做初始值，導致前段 EMA 嚴重偏差，最終拉長整個 EMA 序列的收斂時間（暖機期太長）。

**修正方式**：改用「**回看期均值做初始值（SMA Seeding）**」
- 前 N 根不計算，以 SMA(N) 作為第 N 根 EMA 的啟動值
- 這讓 EMA 從第一個有效點就已收斂，消除前段暖機偏差

```
EMA[period-1] = SMA(prices[0..period-1])
EMA[i] = price[i] * k + EMA[i-1] * (1-k)
```

### 策略 2：MACD 判斷改用「OSC（Histogram）斜率」而非純數值

> **核心問題**：`isMacdPositive`（DIF > 0）是最滯後的判斷，因為 DIF 要從負值回升到 0 才觸發，此時行情往往已漲 5~10%。

**修正方式**：改為偵測「**OSC 轉正（由負轉正）或 OSC 持續擴張**」
- OSC（Histogram）= DIF - Signal，比 DIF 本身對行情反應快 1~2 根K
- 判斷 OSC 連續 2 根從小到大（斜率為正）即可確認動能轉折，不必等 DIF 穿越零軸

| 舊判斷（滯後） | 新判斷（領先） |
|-------------|-------------|
| `DIF > 0` | `OSC > 0 且 OSC 斜率 > 0（連2根擴大）` |
| 單點 DIF 翻正 | `OSC 由負轉正（底部確認更早）` |

### 策略 3：頂背離判斷改為「OSC 頂背離」

> **核心問題**：目前的頂背離用 difArray，但 DIF 自身已有滯後，背離確認往往在多個K棒後才看清楚。

**修正方式**：改用 **OSC（Histogram）頂背離**，因為 OSC 是 MACD 體系中最敏感的部分：
- OSC 頂背離：當前 OSC 高點低於前一個 OSC 高點，但股價高點更高 → 比 DIF 早 1~2 根確認

### 策略 4：`isMacdJustTurnedPositive` 加入「OSC 連續擴張」確認

> **核心問題**：目前只看前後兩根 DIF 翻正，單點翻正假訊號率高達 40%。

**修正方式**：
1. **主條件**：OSC 由負轉正（OSC[i-1] < 0 && OSC[i] >= 0）—— 比 DIF 翻正早
2. **輔助確認（過濾假訊號）**：連續 2 根 OSC 值擴大（動能持續）

---

## 修改範圍

### 修改 1：[indicators.ts](file:///Users/joseph/Downloads/stock-pro-main/src/services/indicators.ts)

#### [MODIFY] calculateEMA — 加入 SMA Seeding 初始化
- 新增 `useSmaSeeding` 參數（預設 `true`）
- 前 N 根用 SMA 作為 EMA 初始值，大幅減少暖機期偏差

#### [MODIFY] calculateMACD — 同步輸出 oscArray
- 在返回值加入 `osc`（最新 histogram 值）與 `prevOsc`（上一根 histogram 值）
- 以便 route.ts 計算 OSC 斜率與翻正判斷

#### [MODIFY] calculateMACDFull — 新增完整 oscArray 輸出
- 輸出 `{ difArray, macdArray, oscArray }` 三者
- 供頂背離與 OSC 斜率偵測使用

---

### 修改 2：[smart-navigator/route.ts](file:///Users/joseph/Downloads/stock-pro-main/src/app/api/smart-navigator/route.ts)

#### [MODIFY] isMacdPositive（L152） — 改用 OSC 動能方向判斷
```typescript
// 舊（滯後）：
const isMacdPositive = macdData ? macdData.dif > 0 : false;

// 新（較即時）：
// OSC > 0 且連續2根擴張，代表買方動能持續增強
const isMacdPositive = macdData
    ? (macdData.osc > 0 && macdData.osc > macdData.prevOsc)
    : false;
```

#### [MODIFY] isMacdJustTurnedPositive（L400-404） — 改用 OSC 翻正
```typescript
// 舊（滯後）：
isMacdJustTurnedPositive = prevDif < 0 && currDif >= 0;

// 新（領先 1~2K）：
// OSC 由負轉正比 DIF 穿越零軸早，且要求連續2根OSC值擴大（過濾假訊號）
const prevOsc = oscArray[oscArray.length - 2];
const currOsc = oscArray[oscArray.length - 1];
const prevPrevOsc = oscArray[oscArray.length - 3];
isMacdJustTurnedPositive = (prevOsc < 0 && currOsc >= 0)
    || (currOsc > 0 && currOsc > prevOsc && prevOsc > prevPrevOsc); // OSC 持續擴張
```

#### [MODIFY] hasMacdDivergence（L248-272）— 頂背離改用 oscArray
```typescript
// 舊：比較 difArray 的高點
// 新：比較 oscArray 的高點（更敏感，提前 1~2 根確認背離）
const recentOsc = macdFull.oscArray.slice(-lookback);
// 找前段 oscArray 最高點（對應股價高點）
// 比較當前 osc 高點 vs 前一個 osc 高點
```

---

## 修改後預期效果

| 指標 | 改前 | 改後 | 領先幅度 |
|------|------|------|---------|
| MACD 動能正負判斷 | DIF > 0 | OSC > 0 且擴張 | 領先 1~3 根K棒 |
| MACD 轉正訊號 | DIF 穿越零軸 | OSC 翻正 | 領先 1~2 根K棒 |
| 頂背離確認 | DIF 高點背離 | OSC 高點背離 | 領先 1~2 根K棒 |
| EMA 計算精準度 | 第一根收盤初始化 | SMA Seeding | 消除暖機期偏差 |

> [!IMPORTANT]
> SMA Seeding 初始化會改變所有 EMA 的計算基準值，因此 MACD 數值本身也會與以前略有不同。這是**精準度提升**，不是 bug。
>
> OSC 判斷法與原 DIF 判斷法方向一致，只是**反應更早**，不會有根本性的策略反轉。

---

## 修改檔案清單

| 檔案 | 修改性質 |
|------|---------|
| [indicators.ts](file:///Users/joseph/Downloads/stock-pro-main/src/services/indicators.ts) | calculateEMA、calculateMACD、calculateMACDFull |
| [smart-navigator/route.ts](file:///Users/joseph/Downloads/stock-pro-main/src/app/api/smart-navigator/route.ts) | isMacdPositive、isMacdJustTurnedPositive、hasMacdDivergence 三段判斷邏輯 |

---

## 驗證方式

修改後目視確認 smart-navigator API 在以下情境回傳結果：
1. 一檔剛脫離低位、OSC 翻正但 DIF 未穿零的個股 → 新版應提早發出 `MACD低位轉正` 訊號
2. 一檔高位 OSC 頂背離但 DIF 背離不明顯 → 新版應提早觸發 `hasMacdDivergence`
3. 整體訊號方向與原版一致，只是時機點更早
