# 準確率歷史回測功能

## 目標
在 APP 的歷史紀錄中新增一個「**準確率回測**」按鈕，讓用戶點擊後，系統自動對所有歷史掃描紀錄中的股票進行回測：查詢掃描後至今的 K 線最高價，判斷是否在某一天達到或超過掃描當日現價的指定漲幅目標（預設 50%），並以成功/失敗清單呈現結果。

---

## 功能流程說明

### 資料儲存（已有，確認現況）
- 每次掃描成功後，APP 已自動將掃描結果（含 `stock_id`、`close`、掃描日期 `id`）儲存至 `localStorage → tsbs_scan_history`
- 結構：`HistorySession[]`，每筆 session 含多支股票的 `AnalysisResult`，其中 `close` 即掃描時的現價，`id` 為 ISO timestamp

### 回測邏輯
1. 用戶點擊「準確率回測」按鈕
2. 前端遍歷所有歷史紀錄中的股票（去重複）
3. 對每支股票呼叫新 API `GET /api/backtest?stockId=XXXX&fromDate=YYYY-MM-DD`
4. API 後端：
   - 使用 `ExchangeClient.getStockHistory(stockId)` 抓最近 3 個月 K 線
   - 過濾出「掃描日期之後」的交易日
   - 找出其中的**最高最高價（`max`）**
   - 回傳：`{ stockId, peakDate, peakPrice, achievedDays }`
5. 前端計算：`peakPrice >= scanPrice * (1 + targetGain)` → 成功
6. 以兩個清單顯示：✅ 成功達標 / ❌ 未達標

---

## 預設目標漲幅
- 預設 **50%**（用戶可在回測 Modal 用滑桿調整，範圍 10%–200%）

---

## Proposed Changes

### 後端（新增 API）

#### [NEW] `src/app/api/backtest/route.ts`
- `GET /api/backtest?stockId=XXXX&fromDate=YYYY-MM-DD`
- 呼叫 `ExchangeClient.getStockHistory(stockId)` 取得 3 個月 K 線
- 過濾 `date > fromDate` 的交易日
- 從這些交易日中找最大 `max`（日最高價）
- 回傳：
  ```json
  {
    "success": true,
    "stockId": "6465",
    "fromDate": "2026-04-15",
    "peakPrice": 120,
    "peakDate": "2026-04-20",
    "achievedDays": 5,
    "tradingDaysChecked": 8
  }
  ```

---

### 前端（修改 page.tsx）

#### [MODIFY] `src/app/page.tsx`

**1. 新增 import**
- 新增 `FlaskConical`（或 `TestTube2`）icon 從 lucide-react

**2. 新增 state**
```ts
const [showBacktest, setShowBacktest] = useState(false);
const [backtestTarget, setBacktestTarget] = useState(50);       // 目標漲幅 %
const [backtestResults, setBacktestResults] = useState<BacktestResult[]>([]);
const [isBacktesting, setIsBacktesting] = useState(false);
```

**3. 新增介面型別（頁面頂端）**
```ts
interface BacktestResult {
  sessionDate: string;         // 掃描日期顯示
  sessionId: string;           // session ISO timestamp
  stock_id: string;
  stock_name: string;
  sector_name?: string;
  scanPrice: number;           // 掃描當日收盤現價
  targetPrice: number;         // 目標價（scanPrice * 1.5）
  peakPrice: number | null;    // 之後最高價
  peakDate: string | null;     // 最高價日期
  achievedDays: number | null; // 幾天後達到
  success: boolean;            // 是否達標
  gainPercent: number | null;  // 實際最高漲幅 %
}
```

**4. 新增 `runBacktest()` 函數**
```ts
const runBacktest = async () => {
  setIsBacktesting(true);
  setBacktestResults([]);

  // 蒐集所有歷史股票（不去重，每個 session 各自一筆）
  const tasks: { sessionId, sessionDate, stock_id, stock_name, sector_name, scanPrice, fromDate }[] = [];
  historyRecords.forEach(session => {
    const fromDate = session.id.split('T')[0];  // ISO timestamp → YYYY-MM-DD
    session.results.forEach(r => {
      tasks.push({ sessionId: session.id, sessionDate: session.date, 
                   stock_id: r.stock_id, stock_name: r.stock_name, 
                   sector_name: r.sector_name, scanPrice: r.close, fromDate });
    });
  });

  // 批次呼叫 API（每次 5 支，避免過快）
  const results: BacktestResult[] = [];
  for (let i = 0; i < tasks.length; i += 5) {
    const batch = tasks.slice(i, i + 5);
    const batchResults = await Promise.allSettled(
      batch.map(task => fetch(`/api/backtest?stockId=${task.stock_id}&fromDate=${task.fromDate}`)
        .then(r => r.json())
        .then(data => {
          const targetPrice = task.scanPrice * (1 + backtestTarget / 100);
          const success = data.success && data.peakPrice !== null && data.peakPrice >= targetPrice;
          const gainPercent = data.peakPrice ? ((data.peakPrice - task.scanPrice) / task.scanPrice) * 100 : null;
          return { 
            ...task, targetPrice, 
            peakPrice: data.peakPrice, peakDate: data.peakDate, 
            achievedDays: data.achievedDays, success, gainPercent 
          };
        })
      )
    );
    batchResults.forEach(r => { if (r.status === 'fulfilled') results.push(r.value); });
  }

  setBacktestResults(results);
  setIsBacktesting(false);
};
```

**5. 新增「準確率回測」按鈕（緊鄰歷史紀錄按鈕旁邊）**
- 使用綠色 `FlaskConical` icon
- 點擊後開啟 `showBacktest` Modal

**6. 新增回測結果 Modal**
- 頂部：目標漲幅滑桿（10–200%）+ 開始回測按鈕
- 統計列：總回測數 / 成功數 / 成功率 %
- 兩個分區：
  - ✅ **成功達標**（綠色卡片）：股票代號、掃描現價、目標價、最高達到價、達標日期、幾天達成
  - ❌ **未達標**（灰色卡片）：股票代號、掃描現價、目標價、最高到達價、距目標差距 %

---

## 資料流示意圖

```
localStorage (tsbs_scan_history)
  └─ HistorySession[]
       ├─ id: "2026-04-15T13:06:00Z"   ← fromDate
       └─ results[]
            ├─ stock_id: "6465"
            └─ close: 70.1              ← scanPrice

  → API: GET /api/backtest?stockId=6465&fromDate=2026-04-15
  
  → ExchangeClient.getStockHistory("6465")
       ├─ 過濾 date > "2026-04-15"
       └─ max of (row.max) = 120 @ 2026-04-20

  → BacktestResult:
       targetPrice = 70.1 * 1.5 = 105.15
       peakPrice = 120 >= 105.15 → success ✅
       gainPercent = (120 - 70.1) / 70.1 * 100 = 71.2%
       achievedDays = 5
```

---

## Open Questions

> [!IMPORTANT]
> **確認「每 session 各自一筆」vs「去重」**：同一支股票在不同日期掃到，是否分開計算？（目前計劃：**分開計算**，每個 session 各算一次，可比較不同時間點掃到同一股票的結果差異）

> [!NOTE]
> **資料限制**：`ExchangeClient.getStockHistory` 只抓最近 3 個月（~60 交易日）。若某次掃描距今超過 3 個月，則無法取得該段的 K 線。目前方案：超範圍時顯示「資料不足」，不計入成功率統計。

> [!NOTE]
> **漲幅目標**：預設 50%。用戶可在 Modal 中用滑桿調整（10%~200%），調整後需重新點擊「開始回測」才更新結果。

---

## 修改的文件清單

| 文件 | 動作 |
|------|------|
| `src/app/api/backtest/route.ts` | **新增** |
| `src/app/page.tsx` | **修改**（新增 UI + 邏輯） |
| `src/types/index.ts` | **可選修改**（新增 BacktestResult 介面，也可定義在 page.tsx 中） |

---

## Verification Plan

### 手動驗證
1. 先執行一次掃描，確認歷史紀錄中有 `close` 現價
2. 點擊「準確率回測」按鈕，確認 Modal 打開
3. 點擊「開始回測」，等待結果
4. 比對成功案例：確認 `peakPrice >= scanPrice * 1.5`
5. 調整目標漲幅滑桿，確認結果即時更新（需重新回測）

> [!WARNING]
> 由於回測需對每支股票各自呼叫 API，若歷史紀錄中有 20 支股票，需發出 20 個 API 請求（批次 5 個一組），約需 10–30 秒。UI 需加入 Loading 進度條。
