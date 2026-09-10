# 短線過濾掃描功能實作計劃

## 背景說明

根據 `6_24短線改進策略.md` 的分析，現有掃描系統在高位市場（如 6/5）假突破率高達 95%，本次計劃在**不影響任何現有功能**的前提下，新增獨立的「短線過濾掃描」按鈕，套用六大改進策略來提升命中率。

## 設計原則

- **完全獨立**：新掃描邏輯不修改 `scanMarket`、`filterStocks`、`analyzeStock`、`evaluateStock` 任何現有函數
- **新增函數/路由**：使用全新的 `scanShortTerm` 函數與獨立 API 路由
- **完全隔離 State**：新增獨立的 `shortTermResults`、`isShortTermScanning` 等 state，不共用現有 state
- **Tab 系統擴展**：在現有 `original | enhanced` 二 Tab 基礎上擴展為三 Tab

---

## 六大策略實作說明

### 策略一：大盤位階濾網（最高優先）
在掃描前獲取加權指數（`0001.TW` / `TPEx`）近 60 日收盤，計算當前位階：

```
大盤位階 < 60%  → 正常模式（量能門檻 2.5x，突破 3.5%）
大盤位階 60-80% → 嚴格模式（量能門檻 3.5x，突破 5.0%）
大盤位階 > 80%  → 極嚴格模式（量能門檻 5.0x，突破 5.0%，僅接受 60 日位階 <40% 的股票）
```

**Fallback**：若無法取得大盤資料，自動 fallback 為「嚴格模式」並顯示警告標籤。

### 策略二：掃出數量品質警示
```
< 20 檔  → 🥇 黃金時機
20-50 檔 → ✅ 正常品質
50-80 檔 → ⚠️ 市場過熱，自動重篩（量能門檻 ×1.5）
> 80 檔  → 🚨 嚴重警示，只取前 15 名並標示「高位假突破風險」
```
警示標籤直接顯示在結果列表頂部。

### 策略三：VCP 波動率收縮（必要條件）
全部四個條件同時滿足才通過：
1. 近 5 日 ATR < 近 20 日 ATR × 60%
2. 近 5 日均量 < 近 20 日均量 × 70%
3. 突破日爆量（今日量 > 20 日均量 × 2.5）
4. 突破日為陽線（收盤 > 開盤）

### 策略四：RS 相對強度硬性排除
```
個股 10 日漲幅 < 大盤 10 日漲幅 - 2% → 直接排除
個股 10 日漲幅 > 大盤 10 日漲幅 + 3% → 加分 +5
```

### 策略五：股價位階硬性過濾（Stage 1）
```
60 日位階 > 80% → 直接排除
60 日位階 40-80% → 正常通過
60 日位階 < 40% → 優先候選（加旗標）
```

### 策略六：成交量型態質化
全部三個條件同時滿足：
1. 今日量 > 45 日均量 × 3
2. 前 2-3 日為縮量（前日量 < 20 日均量 × 0.8）
3. 突破日陽線，上影線 < 實體 50%

---

## 受影響文件一覽

### 後端

---

#### [NEW] `src/app/api/scan/short-term/route.ts`
全新 API 路由，接收 `market`、`sector` 參數，內部呼叫 `ScannerService.scanShortTerm()`，回傳：
```typescript
{
  success: boolean;
  data: AnalysisResult[];
  meta: {
    marketLevel: number;       // 大盤位階 (0-1)
    marketMode: 'normal' | 'strict' | 'extreme'; // 市場模式
    qualityLevel: 'gold' | 'normal' | 'warning' | 'danger'; // 品質等級
    qualityLabel: string;      // 品質標籤文字
    totalFiltered: number;     // 原始過濾出的數量
    fallbackMode: boolean;     // 是否使用 fallback 模式
    indexFailedWarning?: string;
  };
  timing: any;
}
```

---

#### [MODIFY] `src/services/scanner.ts`
在現有 `ScannerService` 物件末尾**新增**一個函數 `scanShortTerm`，完全不修改任何現有函數：

```typescript
scanShortTerm: async (market, indexHistory?) => { ... }
```

內部邏輯：
1. 取大盤位階 → 決定 `marketMode` 與動態門檻
2. 快照預篩（紅 K + 成交量）→ 取前 200
3. 對每支股票獲取 60 日歷史，計算：
   - 60 日位階（策略五）
   - RS 相對強度（策略四）
   - VCP 條件（策略三）
   - 成交量型態（策略六）
4. 結果按評分排序，套用策略二的數量警示
5. 回傳 `{ results, meta, timing }`

---

### 前端

---

#### [MODIFY] `src/app/page.tsx`

**State 新增**（約 5 行）：
```typescript
const [shortTermResults, setShortTermResults] = useState<AnalysisResult[]>([]);
const [isShortTermScanning, setIsShortTermScanning] = useState(false);
const [shortTermProgress, setShortTermProgress] = useState({ current: 0, total: 0, phase: '' });
const [shortTermMeta, setShortTermMeta] = useState<any>(null);
```
> `activeTab` 型別從 `'original' | 'enhanced'` 擴展為 `'original' | 'enhanced' | 'shortterm'`

**新增函數** `runShortTermScan`（約 40 行）：
- 呼叫 `/api/scan/short-term?market=${market}&sector=${sector}`
- 設定進度、結果、meta 資料
- 切換 `activeTab` 為 `'shortterm'`

**按鈕區**（L1127-L1159）：
- 將 `grid-cols-2` 改為 `grid-cols-3`
- 新增第三顆按鈕「短線過濾掃描」（橙色漸層，Filter icon）

**進度條**：新增短線掃描專用進度條（橙色主題）

**Tab 切換區**（L1224-L1248）：新增第三個 Tab「📡 短線過濾掃描」

**結果展示區**：新增 `activeTab === 'shortterm'` 的結果區塊，頂部顯示品質警示標籤，卡片點擊同樣進入 K 線頁

---

## 注意事項

> [!IMPORTANT]
> 大盤資料來源：策略一和策略四都需要大盤（加權指數）歷史數據。系統已有 `ExchangeClient`，需確認能否取得 `0001`（加權指數）的 60 日歷史。若不行，將在 API 中 fallback 並顯示警告，但策略仍然執行。

> [!NOTE]
> 掃描速度：策略三、五、六都需要每支股票的 60 日歷史資料，這與現有 `analyzeStock` 相同。短線掃描預計耗時與強化掃描相近（1-3 分鐘）。

> [!WARNING]
> `activeTab` 型別擴展：`sessionStorage` 的持久化邏輯中已有 `activeTab`，擴展型別後需同時更新恢復邏輯的 fallback 值（防止舊 sessionStorage 的值觸發渲染問題）。

---

## 驗證計劃

### 手動驗證
1. 確認三顆按鈕並排顯示正確
2. 點擊「短線過濾掃描」後進度條顯示
3. 掃描完成後 Tab 自動切換至「短線過濾掃描」
4. 品質警示標籤正確顯示（根據掃出數量）
5. 點擊卡片可正確導航至 K 線頁
6. 現有「定點共振掃描」和「強化評分掃描」功能完全不受影響
