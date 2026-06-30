# 主力AI分析判斷 修改計劃

> 版本：V2（最終確認版）  
> 日期：2026-06-30

---

## 一、目標

將「智能選股導航」功能全面升級為「**主力AI分析判斷**」，依照三種主力類型（業內/投信/外資）的不同操盤特性，給出精準的主力**階段辨識**（吸貨/洗盤/拉抬/出貨）與操作建議。

---

## 二、現有數據確認（無需新增 API）

| 數據 | 來源 | 用途 |
|------|------|------|
| 股價歷史（OHLCV） | TWSE/TPEX 免費 API | 均線、位階、量能、K線型態 |
| 三大法人每日買賣超 | FinMind `TaiwanStockHoldingSharesPer` → route.ts 第30行已有 | 投信/外資連續買超天數計算 |
| 融資餘額 | FinMind `TaiwanStockMarginPurchaseShortSale` | 散戶融資行為 |
| 隔日沖數據 | FinMind `TaiwanStockDayTrading` | 業內主力特徵 |
| 總股本 | TWSE 查詢 | 換手率計算 |

> ✅ **Q1 結論：** `institutionalData` 已包含 `Investment_Trust`（投信）和 `Foreign_Investor`（外資）每日 `buy`/`sell` 欄位，可直接計算連續買超天數作為主力強度指標。**不需要新增任何 FinMind API 呼叫，不會消耗額外 token。**

> ✅ **Q2 結論：** 台幣匯率暫不接入，外資分析使用外資買超連續天數 + 季線突破 + MACD 判斷。

---

## 三、三種主力核心邏輯對照

| 項目 | 業內主力 | 投信主力 | 外資主力 |
|------|---------|---------|---------|
| **週期** | 5–15 天 | 20–40 天 | 60–120 天 |
| **生命線（均線）** | MA5（5日） | MA10 / MA20 | MA60（季線） |
| **量能特徵** | 爆發量（>前日3倍/20日均量2倍） | 溫和放量（1.5–2倍） | 緩慢累積，不求爆量 |
| **法人籌碼** | 特定隔日沖分點、高日沖率 | 投信連續買超≥3天（5日中） | 外資連續買超≥7天（10日中） |
| **均線狀態** | MA5/MA10/MA20 糾結→起爆 | 10日線走平後溫和向上 | 突破季線（60MA）且季線走平上揚 |
| **出場信號** | 跌破5MA / 天量長上影線 | 跌破10MA或20MA / 投信大賣 | 跌破60MA且季線下彎 |

---

## 四、修改計劃：只改動三個檔案

> ⚠️ **不改動其他任何功能**：主控台掃描、短線掃描、強化掃描、回測、預約賣出、模擬交易、歷史紀錄、Firebase 等全部不動。

---

### 【檔案一】`src/app/api/smart-navigator/route.ts`

#### 1.1 新增 `masterType` 參數接收

API 新增接收 `masterType` 查詢參數，值為：
- `insider`（業內主力，預設值）
- `institutional`（投信主力）
- `foreign`（外資主力）

#### 1.2 從現有 `institutionalData` 計算三大法人連續買超

利用已有的 `institutionalData`（route.ts 第30行），過濾出：
- **投信連續買超天數**：篩選 `name === "Investment_Trust"`，統計近5交易日中有幾天 `buy > sell`
- **外資連續買超天數**：篩選 `name === "Foreign_Investor"`，統計近10交易日中有幾天 `buy > sell`
- **投信淨買超累積（相對強度）**：近30日內投信 `(buy - sell)` 加總，用於判斷籌碼積累程度

#### 1.3 依主力類型啟用差異化判斷邏輯

**業內主力（insider）— 5–15天週期：**
```
進場條件（權重40%量/30%K線/20%籌碼/10%週轉率）
✅ 量能起爆：volumeRatio > 3（當日量>5日均量3倍）
✅ K線突破：實體紅K突破近2週盤整高點
✅ 均線糾結：MA5/MA10/MA20 收斂（三線差距 < 3%）
✅ 高日沖率：highDayTradingRate = true（現有指標）
✅ 籌碼集中：accumulationScore 高（現有指標）

洗盤訊號：isShrinkingTurnover + isVcpSqueeze + positionPercent < 35
拉抬訊號：isHighTurnover + isMaBullishAligned + volumeRatio > 3
出貨訊號：isViolentDistribution 或跌破5MA
```

**投信主力（institutional）— 20–40天週期：**
```
進場條件（權重40%投信籌碼/30%K線/20%股本/10%量能）
✅ 投信連續買超：5日中 ≥ 3天投信淨買超
✅ 投信積累強度：近30日投信淨買超為正，且有加速趨勢
✅ K線突破：帶量突破近1–2週盤整（isHighTurnover，1.5倍即可）
✅ 股本適中：totalShares 在合理中小型股範圍（可略過）
✅ MACD確認：isMacdPositive 或 isMacdJustTurnedPositive

洗盤訊號：isShrinkingTurnover + 位階30–60% + 投信沒有大賣
拉抬訊號：投信連續買超 + 突破盤整 + MA10走揚
出貨訊號：跌破MA10或MA20 / 投信轉賣（近5日投信淨買超為負且加速）
```

**外資主力（foreign）— 60–120天週期：**
```
進場條件（權重40%外資籌碼/20%季線/20%週K打底/20%MACD）
✅ 外資連續買超：10日中 ≥ 7天外資淨買超
✅ 季線突破：latestClose > ma60 且 ma60走平或上揚（ma60 > 前5日ma60）
✅ 週K打底：hasBaseBuilding（現有指標，低位橫盤≥10天）
✅ MACD確認：isMacdPositive

洗盤訊號：isShrinkingTurnover + 位階在MA20附近（月線回踩）
拉抬訊號：站上季線 + 外資7天+買超 + MACD正
出貨訊號：跌破MA60 / 外資轉賣（近10日外資淨買超為負）
```

#### 1.4 主力四大階段判斷邏輯

每次分析都輸出以下四個階段之一（優先級由高到低判斷）：

1. **`distribution`（出貨/派發）** — 出貨訊號觸發，優先判斷
2. **`markup`（拉抬/主升段）** — 拉抬訊號觸發
3. **`shakeout`（洗盤）** — 洗盤訊號觸發
4. **`accumulation`（吸貨/建倉）** — 進場條件部分符合，但未達拉抬門檻
5. **`none`（無明顯主力介入）** — 以上皆不符合

#### 1.5 置信度計算

- **高（high）**：核心條件全部符合（3個以上主要指標）
- **中（medium）**：2個主要指標符合
- **低（low）**：1個指標符合或部分符合

#### 1.6 API 回傳新增欄位（完全向後相容）

現有欄位**全部保留**，新增以下欄位到 `data` 物件：

```typescript
masterType: 'insider' | 'institutional' | 'foreign'
masterStage: 'accumulation' | 'shakeout' | 'markup' | 'distribution' | 'none'
confidence: 'high' | 'medium' | 'low'
operationAdvice: 'buy' | 'hold' | 'sell'
stageEvidence: string[]   // 中文主要依據，最多4條
masterPeriod: string      // 例如 "5–15天"
masterLifeline: string    // 例如 "5日均線(MA5)"
institutionalSignal: {    // 法人籌碼摘要
    itConsecutiveBuyDays: number    // 投信近5日連買天數
    foreignConsecutiveBuyDays: number // 外資近10日連買天數
    itAccumulation: number          // 投信30日淨買超累積（正=買超，負=賣超）
}
```

---

## 五、不受影響的功能清單

| 功能 | 狀態 |
|------|------|
| 主控台掃描（定點共振/強化評分/短線過濾） | ✅ 完全不動 |
| 短線週期掃描 / 回測 | ✅ 完全不動 |
| 預約賣出助手 / 模擬交易 | ✅ 完全不動 |
| 歷史紀錄 / Firebase 存取 | ✅ 完全不動 |
| 燈號系統（紅/黃/綠）| ✅ 保留，與主力面板並列 |
| 買入/停損/停利價格計算 | ✅ 保留 |
| 出貨預警（Distribution Warning）| ✅ 保留 |
| 專業解讀展開（BookOpen）| ✅ 保留 |
| 下載列印 / PDF 功能 | ✅ 保留 |
| 自動篩選（主力進場 / 出貨預警）| ✅ 延伸，不破壞 |
| AuthGuard / Firebase 認證 | ✅ 完全不動 |
| 其他所有 API 路由 | ✅ 完全不動 |

---

## 六、執行順序

1. **備份**：自動備份 `route.ts`、`page.tsx`（smart-navigator）、`page.tsx`（主控台）加時間戳
2. **後端先行**：修改 `route.ts`（API 邏輯），確保新欄位正確回傳
3. **前端接入**：修改 `smart-navigator/page.tsx`，加入主力面板 UI
4. **主控台改名**：修改 `src/app/page.tsx` 第1058行文字

---

## 七、驗證方式（手動，不開瀏覽器）

1. 個股查詢（如 `2330`）三種主力類型各測試一次，確認：
   - `masterStage` 欄位正確返回
   - 主力動向面板正確顯示
   - 原有燈號、買入/停損/停利價格不受影響
2. 自動篩選功能帶入 `masterType`，結果卡片正常顯示主力面板
3. 確認主控台首頁按鈕文字已更新
