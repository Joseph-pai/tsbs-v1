# 代码分析 - 操作邏輯問題清單

## 🔴 Critical Issues (關鍵問題)

### 1. **分數計算邏輯不一致**
- **位置**: `src/services/engine.ts` 第 79-95 行
- **問題**: 
  - `chipScore` 在 `engine.ts` 中初始化為 0（佔位符）
  - 後續在 `scanner.ts` 與 `/api/scan/analyze/route.ts` 中被重新計算並覆蓋
  - 這導致 `comprehensiveScoreDetails` 中的 `chipScore` 與實際回傳值不匹配
- **影響**: 前端顯示的分數細節（volumeScore/maScore/chipScore）可能不準確
- **修復建議**: 在 `engine.ts` 中傳遞 `consecutiveBuy` 參數，或在上游統一計算

### 2. **月營收 MoM/YoY 判定的日期邏輯錯誤**
- **位置**: `src/services/scanner.ts` 第 299-315 行
- **問題**:
  - YoY 計算使用 `new Date(latest.date)` 直接解析，可能存在時區問題
  - `yearKey` 使用 `String(prevYear.getMonth()+1).padStart(2,'0')` 拼接，但應使用 `getFullYear()` 年份
  - 若 `latest.date` 為 ROC 格式（民國年），此邏輯會完全失效
  - 數據排序假設為 ISO 日期格式，但 FinMind API 可能返回不同格式
- **影響**: YoY/MoM 計算完全失效或返回錯誤結果，導致 `revenueBonusPoints` 永遠為 0
- **修復建議**: 
  - 先驗證 FinMind 返回的日期格式（ROC 或 ISO）
  - 統一轉換為 ISO 格式再進行日期運算
  - 添加日期格式轉換函數

### 3. **投信連買判定邏輯有缺陷**
- **位置**: `src/services/scanner.ts` 第 247-261 行
- **問題**:
  - 計算連買天數時，按日期**降序排列**後逐一檢查
  - 假設返回數據已按日期排序，但若 FinMind API 返回無序數據會導致錯誤
  - 未考慮非交易日（週末/假日），可能錯誤認為連買被中斷
  - `const byDate: Record<string, number>` 若同一日期有多筆投信資料會累加，但未驗證這是否正確
- **影響**: `consecutiveBuy` 計算不準確，進而影響 `instScore` 與最終評分
- **修復建議**: 
  - 先按日期升序排列並篩選交易日
  - 添加交易日判定邏輯或使用歷史收盤數據作對照

### 4. **分數權重計算超過 100 分**
- **位置**: `src/services/scanner.ts` 第 329-332 行 & `/api/scan/analyze/route.ts` 第 109-110 行
- **問題**:
  - `totalPoints = volumeScore(40) + maScore(30) + chipScore(30) + revenueBonusPoints(10)` = **110 分**
  - 當 `finalScore` 計算 `totalPoints / 100` 時，會超過 1.0
  - `Math.min(1, ...)` 會截斷，導致分數無法區分 100 分和 110 分的差異
- **影響**: 評分系統缺乏精度，推薦策略（score >= 0.6）可能誤判
- **修復建議**: 
  - 方案 A: 調整權重比例，確保總計 100 分（如 35-25-25-15）
  - 方案 B: 將 `revenueBonusPoints` 改為加成倍數（而非加分）

### 5. **FinMind API 錯誤處理不完整**
- **位置**: `src/services/scanner.ts` 第 276-279 行
- **問題**:
  - 月營收 API 若返回空數據，直接忽略異常，導致 `revenueBonusPoints = 0`
  - 無法區分「API 失敗」與「真的沒有月營收數據」
  - 回落邏輯（fallback to ExchangeClient）只對日 K 線有效，月營收無回落方案
- **影響**: 當 FinMind 月營收 API 超時或授權失敗時，無法提示用戶
- **修復建議**: 
  - 在外層 `try-catch` 中記錄 FinMind API 的具體錯誤
  - 添加重試機制或降級策略

---

## 🟡 Medium Issues (中等問題)

### 6. **數據不一致：stock_name 來源**
- **位置**: `src/services/scanner.ts` 第 346 行
- **問題**:
  - 若 FinMind API 返回的數據中 `stock_name` 為空，會使用 `stockId` 作備用
  - 但此時無法從 `TaiwanStockInfo` 取得完整名稱（因 `analyzeStock` 未調用該 API）
  - `/api/scan/analyze/route.ts` 依賴上層傳來的 `stock.name`，可能為空或錯誤
- **影響**: 前端顯示的股票名稱可能為代碼而非中文名稱
- **修復建議**: 添加 `FinMindClient.getStockInfo()` 調用作為備用名稱源

### 7. **FinMind 月營收 API 字段映射不完整**
- **位置**: `src/services/scanner.ts` 第 282 行
- **問題**:
  - `getRevenue` 函數嘗試多個可能的字段名 (`revenue`, `monthly_revenue`, `MonthlyRevenue`, `營業收入`, `Revenue`)
  - 但不清楚 FinMind API 的實際返回字段名
  - 若返回格式為其他名稱，會默認返回 0
- **影響**: 月營收數據提取失敗，`revenueBonusPoints` 永遠為 0
- **修復建議**: 
  - 聯繫 FinMind 或查閱 API 文檔確認實際字段名
  - 添加日誌輸出以追蹤字段映射失敗

### 8. **均線糾結度正規化邏輯過於簡化**
- **位置**: `src/services/engine.ts` 第 82-87 行
- **問題**:
  - 當 `constrictValue > squeezeTarget` 時，線性衰減 `1 - ((maData.constrictValue - squeezeTarget) / 0.10)`
  - 假設超額 0.1（10%）時分數為 0，但實際上可能超過 0.1
  - 未考慮市場波動性不同（某些股票天然均線距離較遠）
- **影響**: `maScore` 的評分不夠靈活，可能過度懲罰某些股票
- **修復建議**: 
  - 使用對數或分段函數替代線性衰減
  - 根據歷史回測調整衰減因子

### 9. **Stage 2 篩選條件未使用新分數**
- **位置**: `src/services/scanner.ts` 第 175-189 行
- **問題**:
  - `filterStocks` 使用門檻 `score > 0.4` 判斷
  - 但該門檻是相對於舊的計分邏輯設定的，未根據新的 YoY/MoM 調整
  - 若 `revenueBonusPoints` 佔總分 10%，舊的 0.4 門檻應調整至約 0.36-0.42
- **影響**: Stage 2 的篩選條件不再適用，導致篩選偏寬鬆或過嚴
- **修復建議**: 重新進行回測，確定合理的分數門檻

### 10. **後備 API 不返回機構與月營收數據**
- **位置**: `src/services/scanner.ts` 第 224-230 行
- **問題**:
  - 當 FinMind API 失敗時，回落至 `ExchangeClient.getStockHistory()`
  - 但 `ExchangeClient` 只返回日 K 線數據，不包含機構持股與月營收
  - 此時 `insts` 為空，導致 `consecutiveBuy = 0`, `instScore = 0`
  - 月營收也無法取得，導致 `revenueBonusPoints = 0`
- **影響**: 當 FinMind 不可用時，分數會大幅降低，可能無法推薦任何股票
- **修復建議**: 
  - 為 `ExchangeClient` 添加機構與月營收數據源（需查詢新的 API）
  - 或使用 HTML 爬蟲補充（風險：網頁結構變化會導致失敗）

---

## 🟢 Low Priority Issues (低優先級)

### 11. **連續買入判定未考慮數量大小**
- **位置**: `src/services/scanner.ts` 第 261 行
- **問題**:
  - `if ((byDate[d] || 0) > 0)` 只判定是否為正，不管買入規模
  - 買入 1 張與買入 10 萬張視為相同的「連買」
- **影響**: 低優先級，因為定義上「連買」通常指有買有賣，而不關注規模
- **修復建議**: 可選，若需要考慮規模，可引入 `buyScale` 參數

### 12. **MoM/YoY 計算中的閥值硬編碼**
- **位置**: `src/services/scanner.ts` 第 295, 317 行
- **問題**:
  - MoM 與 YoY 的 0.2（20% 成長率）作為"full score"硬編碼
  - 若市場環境變化（景氣循環），此閥值可能不適用
- **影響**: 低優先級，但應記錄於配置檔
- **修復建議**: 將 0.2 移至 `CONFIG.SYSTEM` 中可配置化

### 13. **未記錄 API 調用超時**
- **位置**: `src/lib/finmind.ts` 第 6-7 行
- **問題**:
  - axios timeout 設定為 15 秒，但若網路慢會導致靜默失敗
  - 無日誌記錄超時重試次數
- **影響**: 低優先級，但影響調試
- **修復建議**: 添加重試邏輯或超時日誌

---

## 🔧 Action Items (建議修復順序)

| 優先級 | 問題 | 建議修復時間 |
|------|------|-----------|
| 🔴 Critical | #2 月營收日期邏輯 | **立即** - 會導致 API 失敗 |
| 🔴 Critical | #4 分數權重超 100 分 | **立即** - 影響推薦邏輯 |
| 🔴 Critical | #1 分數不一致 | **今日** - 影響前端顯示 |
| 🟡 Medium | #3 投信連買邏輯 | **本週** - 影響推薦準確度 |
| 🟡 Medium | #10 後備 API 不完整 | **本週** - FinMind 故障時受影響 |
| 🟡 Medium | #6 stock_name 來源 | **本週** - 優化用戶體驗 |
| 🟡 Medium | #7 月營收字段映射 | **本週** - 需驗證 API 實際返回 |
| 🟢 Low | 其他 | **後續優化** |

