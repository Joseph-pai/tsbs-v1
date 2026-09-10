# 短線過濾掃描重新設計計劃

## 背景與目標

重新設計「短線過濾掃描」功能，使其：
1. 支援從歷史紀錄選擇日期（單選/多選）進行分析
2. 若選當天日期但無歷史共振/強化掃描數據，則直接掃全市場並顯示前30名
3. 整合「台股短線掃描策略完整判斷標準 v3.1」的四維度評分算法（RS + VSR + K線品質 + 法人籌碼）
4. 完全隔離，不影響其他掃描功能

---

## 用戶已確認事項 ✅

- **歷史模式數據**：重新去拉那天的實際歷史數據（更準確）
- **模式選擇器**：移除（自動/寬鬆/中等/嚴格），改為只顯示分析結果（v3.1 內建自動大盤判斷）
- **股票來源**：合併 original + enhanced 兩種掃描的股票

---

## FinMind API Token 使用分析

> [!IMPORTANT]
> 這是關鍵問題。以下詳細說明哪些地方用到 FinMind，以及如何節省 token。

### v3.1 四維度所需數據 vs 數據來源

| 維度 | 所需數據 | 數據來源 | FinMind 用途 |
|------|---------|---------|-------------|
| Dim1 RS | 個股3日+10日漲幅、大盤3日+10日漲幅 | **交易所免費 API** (`getStockHistory`) + `getTaiexHistory` | ❌ 不需要 |
| Dim2 VSR | 當日成交量 / 20日均量 | **交易所免費 API** (`getStockHistory`) | ❌ 不需要 |
| Dim3 K線品質 | open/high/low/close/prev_close | **交易所免費 API** (`getStockHistory`) | ❌ 不需要 |
| Dim4 法人籌碼 | foreign_net、trust_net | **FinMind `TaiwanStockHoldingSharesPer`** | ✅ 需要 |
| 大盤環境 | TAIEX 5日均線 | **交易所免費 API** (`getTaiexHistory`) | ❌ 不需要 |

### 現有 `analyzeStock()` 的 FinMind 用量（問題所在）

現有的分析函數每支股票會打 **3–4 個 FinMind API**：
1. `TaiwanStockPrice`（日K歷史）→ **v3.1 不需要，用交易所代替**
2. `TaiwanStockHoldingSharesPer`（法人籌碼）→ **v3.1 Dim4 需要**
3. `TaiwanStockMonthRevenue`（月營收）→ **v3.1 不需要**
4. `TaiwanStockMarginPurchaseShortSale`（融資）→ **v3.1 不需要**

### 新 v3.1 函數的 FinMind 用量（精簡後）

**即時全市場模式（掃描 ~200 支預篩股票）：**

| API 類型 | 用量 | 說明 |
|---------|-----|------|
| 交易所免費（TWSE/TPEX） | 200次 | 個股歷史K線（免費，無 token 消耗） |
| FinMind 法人籌碼 | **最多 30 次** | 只對通過前三維度篩選的股票才查法人（Dim4） |
| FinMind 大盤（TAIEX） | **1 次（有快取）** | 60日歷史，TTL=4小時 Redis快取 |
| **總 FinMind 消耗** | **≤ 31 次/掃描** | 遠低於現有邏輯 |

**歷史模式（假設選擇日期後提取 50-100 支股票）：**

| API 類型 | 用量 | 說明 |
|---------|-----|------|
| 交易所免費 | 50-100次 | 個股歷史K線（免費） |
| FinMind 法人籌碼 | **最多 30 次** | 前三維度篩選後才查法人 |
| **總 FinMind 消耗** | **≤ 31 次/掃描** | |

### 省 Token 三大策略

> [!TIP]
> 以下三個策略可大幅減少 FinMind token 消耗：

**策略 A：延後法人查詢（僅前三維度通過後才查 Dim4）**
```
流程：
1. 先用交易所數據計算 Dim1+Dim2+Dim3（免費）
2. 只對「Dim1+Dim2+Dim3 分數 ≥ 45分」的股票，才呼叫 FinMind 查法人
3. Dim4 最多影響 15分，屬於加分項，不是淘汰門檻

效果：若預篩後 200 支股票中只有 40 支通過前三維度，
       則 FinMind 只需查 40 支（取前30名輸出），而非全部 200 支
```

**策略 B：Redis 快取（已有架構，加強使用）**
```
現有快取 key 格式：tsbs:raw:inst:{stock_id}:{todayStr} TTL=4h
新增快取 key：
  - tsbs:raw:hist:{stock_id}:{dateStr}:exchange  TTL=24h（交易所歷史，不變）
  - tsbs:v31:chip:{stock_id}:{dateStr}           TTL=4h（法人快取）
  - tsbs:v31:taiex:{dateStr}                     TTL=4h（大盤快取，1次即可）

效果：同一天內多次掃描，FinMind 只打 1 次
```

**策略 C：歷史模式下用「指定日期」而非「今天」拉法人數據**
```
歷史模式選了 2026-06-20，則：
  - 個股K線：從交易所拉 2026-06-20 前 90 天的歷史（免費）
  - 法人籌碼：startDate = 2026-06-10, endDate = 2026-06-20（只查 10 天）
  - Redis 快取 key：tsbs:v31:chip:{stock_id}:{scanDate}

效果：歷史數據不會因為「今天」而重複拉，key 按 scanDate 分開快取
```

### 預估 token 消耗比較

| 掃描模式 | 現有邏輯 | 新 v3.1 邏輯 | 節省 |
|---------|---------|-------------|------|
| 即時掃描（200支預篩） | ~200×4 = **800次** | **≤ 31次** | 節省 96% |
| 歷史模式（50支股票） | ~50×4 = **200次** | **≤ 31次** | 節省 85% |
| 每日首次 + Redis 命中 | 800次 | **1次（大盤） + 30次（法人）** = 31次 | 節省 96% |

---

## 修改範圍

> [!WARNING]
> 只修改「短線過濾掃描」相關的邏輯與 UI，不動其他掃描功能（定點共振掃描、強化評分掃描、回測、預約助理等）。

---

## 修改計劃

### Component 1：前端 UI — page.tsx

#### [MODIFY] [page.tsx](file:///Users/joseph/Downloads/stock-pro-main/src/app/page.tsx)

**變更說明：**

1. **新增 State 變數**（短線日期選擇器）
   ```ts
   const [shortTermSelectedDates, setShortTermSelectedDates] = useState<Set<string>>(new Set());
   const [shortTermCalViewMonth, setShortTermCalViewMonth] = useState(() => new Date());
   const [shortTermScanMode, setShortTermScanMode] = useState<'history' | 'live'>('live');
   ```

2. **移除原有「大盤濾網模式」選擇器**（auto/loose/medium/strict）
   - 整個 `{/* 短線模式選擇 */}` 區塊移除
   - 改為在短線結果區塊上方放「歷史模式日曆選擇器」

3. **新增短線日期選擇 UI**（仿照回測日曆選擇器的設計）
   - 顯示在「短線過濾掃描」按鈕上方或結果頂部
   - 只顯示「有 scan_history 數據」的日期（active dates）
   - 支援單選/多選，可清空
   - 說明文字：選擇日期 → 分析歷史掃描股票；不選日期 → 直接掃當日全市場

4. **修改 `runShortTermScan()` 函數**
   ```ts
   const runShortTermScan = async () => {
     // 判斷模式
     if (shortTermSelectedDates.size > 0) {
       // 歷史模式：從 historyRecords 提取選定日期的股票
       await runShortTermHistoryMode(shortTermSelectedDates);
     } else {
       // 即時模式：直接打 /api/scan/short-term-v31
       await runShortTermLiveMode();
     }
   };
   ```

5. **結果顯示區塊**
   - 保留現有的「市場溫度指示器」（meta 資訊）
   - 新增「模式說明」badge：顯示「歷史模式（X日期）」或「即時全市場掃描」
   - 結果限制前30名，從高到低排序（comprehensiveScoreDetails.total）
   - 移除原有「六大策略說明」文字，改為顯示 v3.1 四維度分數細節

6. **StockCard 顯示強化**
   - 在短線結果中顯示：RS分 / VSR分 / K線分 / 法人分 / 總分
   - 標示「新鮮度」（trend_days ≤ 2 = 🟢新鮮 / ≤ 3 = 🟡延續 / ≥ 4 = 🔴過熱）

---

### Component 2：後端 API — 新增 v3.1 短線掃描端點

#### [NEW] route.ts (src/app/api/scan/short-term-v31/route.ts)

新的 API 端點，不修改現有的 `/api/scan/short-term`：
```ts
// GET /api/scan/short-term-v31?market=TWSE&mode=auto
// POST /api/scan/short-term-v31
//   Body: { stockIds?: string[], date?: string } 
//   (stockIds 有值 = 歷史模式，無值 = 即時全市場)
```

---

### Component 3：掃描服務 — 新增 v3.1 評分函數

#### [MODIFY] [scanner.ts](file:///Users/joseph/Downloads/stock-pro-main/src/services/scanner.ts)

**新增函數（不修改現有任何函數）：**

```ts
// 新增：v3.1 評分算法（完全獨立）
scanShortTermV31: async (
  market: 'TWSE' | 'TPEX',
  stockIds?: string[]  // 有值 = 歷史模式；無值 = 即時全市場
): Promise<{ results: AnalysisResult[], meta: any, timing: any }>
```

**四維度評分算法（依據 v3.1.html）：**

| 維度 | 滿分 | 核心邏輯 |
|------|------|---------|
| Dim1: RS 相對強度 | 25分 | RS_3d×0.4 + RS_10d×0.6；需跑贏大盤；收盤>MA5>MA20 得滿分 |
| Dim2: VSR 量能激增 | 35分 | 當日量/20日均量；≥2.0得滿分；<1.5 Hard Filter 淘汰（漲停除外） |
| Dim3: K線品質突破 | 25分 | 實體>50%、上影線<20%、漲幅>3.5%、突破20日高點得滿分 |
| Dim4: 法人籌碼共振 | 15分 | 投信主導A1(+10)、外資主導A2(+8)、三方共振A3(+5)、族群共振B(+5) |
| 新鮮度係數 | × | trend_days≤2: ×1.0；=3: ×0.9；≥4: ×0.8（作用在 Dim2+Dim3） |
| 漲停溢價 | +5 | is_limit_up 時額外 +5，跳過 VSR Hard Filter |

**前置閘門（PRE-FILTER，依 v3.1 規範）：**
- 大盤環境：TAIEX < 5MA×0.98 → 保守模式（VSR hard filter ≥2.0；RS閾值 >1.5%）
- 成交量 < 800張 → 排除
- 處置股/注意股 → 排除（若有資料）
- K線 HL_Range < 0.01 → K線品質給0分

**輸出規格：**
- 取前30名，按總分從高到低排序
- 每筆包含：
  ```ts
  comprehensiveScoreDetails: {
    rsScore: number,      // Dim1 0-25
    vsrScore: number,     // Dim2 0-35
    klineScore: number,   // Dim3 0-25
    chipScore: number,    // Dim4 0-15
    freshnessMultiplier: number, // 0.8 / 0.9 / 1.0
    limitUpBonus: number, // 0 或 5
    total: number,        // 最終得分
    trendDays: number,    // 連漲天數
    vsr: number,          // VSR 倍數
    isLimitUp: boolean,
    marketMode: 'normal' | 'conservative'
  }
  ```

---

### Component 4：新增短線日期選擇器子組件

#### [NEW] ShortTermDatePicker (內嵌在 page.tsx 的 JSX 中)

- 使用與回測日曆相同的 UI 框架（`date-fns` + `clsx`）
- 顯示當月日曆（可翻月）
- 高亮「有 scan_history 數據」的日期（從 historyRecords 提取 scanDate）
- 點擊日期進行選取/取消（多選模式）
- 「清空選擇」按鈕
- 選擇說明：「✓ 已選 X 個日期 → 分析歷史股票」或「未選日期 → 即時全市場掃描」

---

## 數據流設計

```
用戶操作
  │
  ├── 選擇了日期（多個）
  │     └─→ 從 historyRecords 提取那些日期的 original + enhanced 掃描股票
  │           → 去重（同一 stock_id 取最新的 close 等數據）
  │           → POST /api/scan/short-term-v31 { stockIds: [...] }
  │               → 後端：用 v3.1 算法重新評分這些股票
  │               → 返回前30名
  │
  └── 未選日期（直接點掃描）
        └─→ GET /api/scan/short-term-v31?market=TWSE
                → 後端：全市場快照預篩
                → 批次應用 v3.1 四維度評分
                → 返回前30名
```

---

## 不修改的部分

- `runScan()` — 定點共振掃描
- `runEnhancedScan()` — 強化評分掃描
- `runBacktest()` — 回測
- `ScannerService.scanShortTerm()` — 現有短線掃描（保留不動）
- `ScannerService.filterStocks()` — 現有篩選邏輯
- `ScannerService.analyzeStock()` — 現有個股分析
- 所有其他 API 路由
- `HistoryModal`, `MockTradingModal`, `PreOrderAssistantModal`
- `StockCard` 組件（只新增 v3.1 評分顯示的欄位判斷）

---

## 文件變更清單

| 檔案 | 狀態 | 說明 |
|------|------|------|
| `src/app/page.tsx` | MODIFY | 新增日期選擇器 State + UI；修改 runShortTermScan 邏輯 |
| `src/services/scanner.ts` | MODIFY | 新增 `scanShortTermV31()` 函數 |
| `src/app/api/scan/short-term-v31/route.ts` | NEW | 新 API 端點 |

---

## 驗證計劃

### 自動化測試
- 不需要（前端測試環境未設置）

### 手動驗證
1. **即時模式**：點「短線過濾掃描」不選日期 → 應看到全市場掃描進度 → 出現前30名含四維度分數
2. **歷史模式**：選擇1個有數據的日期 → 按掃描 → 應看到從歷史股票重新評分的前30名
3. **多選歷史**：選擇2-3個日期 → 按掃描 → 合併所有日期的股票後評分排序
4. **不影響其他掃描**：執行定點共振掃描 → 強化評分掃描 → 確認正常運作
5. **結果排序**：確認結果由高到低排列，最多30筆

---

## 結論：FinMind 使用最佳化

新 v3.1 短線掃描的設計原則：

1. **個股K線歷史** → 100% 使用交易所免費 API（TWSE/TPEX），**完全不消耗 FinMind token**
2. **大盤 TAIEX** → 使用交易所 `getTaiexHistory()`，**完全不消耗 FinMind token**
3. **法人籌碼（Dim4）** → 唯一使用 FinMind 的地方，但採「延後查詢」策略：只對前三維度得分 ≥45分的股票才查，加上 Redis 4小時快取，同天多次掃描只打一次
4. **最壞情況**：每次掃描最多 30次 FinMind API 請求（30名輸出的法人數據）
5. **快取命中情況**：第二次以後掃描，FinMind 請求接近 0
