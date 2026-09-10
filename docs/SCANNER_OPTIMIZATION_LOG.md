# Scanner Evidence-based Optimization Log

> 本文件記錄每一輪 Evidence-based Scanner Optimization 的完整決策過程。
> **所有修改必須依據 Backtest Evidence，禁止猜測。**

---

## 第 0 輪 (Round 0) — 2026-09-11

### 決策狀態：⏸️ 暫緩所有因子修改

**原因：Backtest 樣本數不足 (n=8)**

---

### 閱讀材料清單（已全部閱讀）

| 文件 | 摘要 |
|---|---|
| `docs/STOCK_SCANNER_BASELINE.md` | 系統架構、Scanner 邏輯、權重結構 |
| `docs/FACTOR_ANALYSIS.md` | 因子分析報告（基於 n=8 樣本） |
| `docs/EVENT_ALPHA_BACKTEST.md` | Event Alpha A/B 回測（無事件資料，結論暫無支持） |
| `backtest-results/summary.txt` | 基準回測結果 |
| `backtest-results/factor-analysis.json` | 因子分析原始資料 |
| `backtest-results/ledger.csv` | 完整訊號明細（8 筆） |

---

### Baseline 回測結果（Round 0）

| 指標 | 數值 |
|---|---|
| 測試期間 | 2026-05-06 ~ 2026-06-02 |
| Stock Universe | 10 支基準股（8 支有產生訊號） |
| 有效樣本數 | **8** |
| 5D +10% 命中率 | **37.50%** |
| 平均最大報酬 | 11.47% |
| 中位數最大報酬 | 9.01% |
| 平均達標天數 | 2.33 天 |

---

### ⚠️ Round 0 False Positive 警示

| Factor | Round 0 發現 | 當時判斷 | 後續 Round 1 驗證 |
|---|---|---|---|
| RS (score proxy) | 75% vs 0% hit rate | 最強 evidence | ❌ **False Positive 確認** |

**根本原因**：n=4 vs n=4 的 bucket 在統計上等同擲硬幣，不具統計意義。

---

## 第 1 輪 (Round 1) — 2026-09-11

### 決策狀態：⏸️ 仍暫緩因子修改

**操作**：擴大 Stock Universe 10 → 40 支，測試期間 6 → 12 個月

**API 限制發現**：多數股票（尤其 TPEX）12 個月期間有大量月份取得失敗，實際有效月份仍約 6 個月，有效股票 40 → 29 支。

---

### 📊 Round 1 回測結果

| 指標 | Round 0 (n=8) | Round 1 (n=19) | 變化 |
|---|:---:|:---:|:---:|
| 測試期間 | 2026-05-06 ~ 2026-06-02 | 2026-01-07 ~ 2026-07-30 | ↑ 擴大 |
| Stock Universe | 10 支 | 40 支（有效 29） | ↑ |
| 有效樣本數 | **8** | **19** | +11 |
| 5D +10% 命中率 | 37.50% | **47.37%** | +9.87pp |
| 平均最大報酬 | 11.47% | 9.18% | -2.29pp |
| 中位數最大報酬 | 9.01% | 8.71% | -0.30pp |
| 平均達標天數 | 2.33 天 | 3.33 天 | +1.00 天 |

### 📊 Round 1 因子分析（n=19）

| Factor | Bucket | 樣本數 | 命中率 | 評估 |
|---|---|:---:|:---:|---|
| Volume Ratio | 全部 3.0+ | 19 | 47.37% | ⚠️ 仍無跨 bucket 比較 |
| Breakout | 全部 True | 19 | 47.37% | ⚠️ 仍無跨 bucket 比較 |
| MA Alignment | 全部 True | 19 | 47.37% | ⚠️ 仍無跨 bucket 比較 |
| MA Constriction | Squeezing (n=4) | 4 | 50.00% | ⚠️ 差距僅 3.33pp，不顯著 |
| MA Constriction | Unconstricted (n=15) | 15 | 46.67% | — |
| **RS (score proxy)** | RS Strong ≥0.8 (n=8) | 8 | **50.00%** | ❌ Round 0 的 False Positive |
| **RS (score proxy)** | RS Neutral <0.8 (n=11) | 11 | **45.45%** | — |

### 🔴 重要發現：Round 0 RS Evidence 為 False Positive

| | Round 0 (n=4 vs 4) | Round 1 (n=8 vs 11) |
|---|:---:|:---:|
| RS Strong 命中率 | 0% | **50%** |
| RS Neutral 命中率 | 75% | **45.45%** |
| **結論** | 「RS 有預測力」| **完全推翻，差距 4.55pp 無意義** |

> n=4 vs n=4 的分組等同擲硬幣。Round 0 的 RS finding 純屬統計雜訊。

### 🔍 額外發現：Score 並非固定

2454 (2026-05-06) 的 score 在 Round 0 為 0.7843，Round 1 為 0.9797。
**Score 隨可取得歷史資料量（lookback）而變動，不具跨 run 可比性。**

### 決策記錄（Round 1）

| 項目 | 內容 |
|---|---|
| 決策 | **⏸️ 繼續暫緩** — 不執行任何因子修改 |
| 決策依據 | n=19 仍不足。所有因子 bucket 間差距均未超過 5pp，無統計意義 |
| API 瓶頸 | TWSE/TPEX 歷史 API 多數股票僅能取得最近 6 個月資料，12 個月設定無效 |
| 下一步 | 若要突破 n 限制，需考慮引入 FinMind API 或其他具備 2-3 年歷史資料的資料源 |


| Factor | Bucket | 樣本數 | 命中率 | 平均最大報酬 | 評估 |
|---|---|:---:|:---:|:---:|---|
| Volume Ratio | 全部 3.0+ | 8 | 37.50% | 11.47% | ⚠️ 無法跨 bucket 比較 |
| Breakout | 全部 True | 8 | 37.50% | 11.47% | ⚠️ 無法跨 bucket 比較 |
| MA Alignment | 全部 True | 8 | 37.50% | 11.47% | ⚠️ 無法跨 bucket 比較 |
| MA Constriction | Squeezing | 1 | 100.00% | 17.58% | ⚠️ n=1 完全不可靠 |
| MA Constriction | Unconstricted | 7 | 28.57% | 10.59% | — |
| **RS (score proxy)** | score < 0.8 | **4** | **75.00%** | **16.52%** | 🔍 最強 evidence（仍過小） |
| **RS (score proxy)** | score ≥ 0.8 | **4** | **0.00%** | **6.41%** | 🔍 — |

---

### Evidence 深度分析

#### 訊號明細（ledger.csv 完整分析）

| 訊號日期 | 股票 | 收盤 | Score | 命中 | 最大報酬 | 備註 |
|---|---|:---:|:---:|:---:|:---:|---|
| 2026-05-06 | 2454 | 3430 | 0.7843 | ✅ | 16.18% | 首次突破訊號 |
| 2026-05-29 | 3231 | 158.5 | 0.7843 | ✅ | 26.81% | 首次突破訊號 |
| 2026-06-01 | 2382 | 372.5 | 0.7843 | ✅ | 17.58% | 首次突破訊號（含 MA_SQUEEZE） |
| 2026-06-02 | 2379 | 653 | 0.7843 | ❌ | 5.51% | 首次突破訊號（Miss） |
| 2026-05-06 | 2317 | 252 | 0.8650 | ❌ | 2.38% | — |
| 2026-05-29 | 2317 | 289 | 0.9797 | ❌ | 8.65% | 23 天後再次觸發 |
| 2026-06-02 | 3231 | 191 | 0.9797 | ❌ | 5.24% | ⚠️ 距上次訊號僅 4 天（過度延伸） |
| 2026-06-02 | 2382 | 400.5 | 0.9797 | ❌ | 9.36% | ⚠️ 距上次訊號僅 1 天（過度延伸） |

#### 根本原因假設（Hypothesis，尚未驗證）

1. **假設一（Score 上限）**：Score ≥ 0.8 的訊號代表股票已過度延伸，市場已充分反映。
   - 方案：測試 score ceiling (0.7 ≤ score < 0.85)
   - 預期：Hit Rate 37.5% → 75%，但 n: 8→4 (-50%) **重大 Signal Reduction Risk**

2. **假設二（冷卻期）**：同一支股票在短期內（5 日內）重複觸發的訊號有系統性失準。
   - 方案：加入同股票 5 日冷卻期
   - 預期：Hit Rate 37.5% → 50%，n: 8→6 (-25%) ⚠️ Signal Reduction Risk

---

### 決策記錄

| 項目 | 內容 |
|---|---|
| 決策 | **⏸️ 暫緩** — 不執行任何因子修改 |
| 決策依據 | n=8 在任何統計方法下均不可靠。即使 RS factor 顯示差異（75% vs 0%），n=4 vs n=4 的分組樣本本質上無法區分真實訊號與統計雜訊 |
| 最小可信樣本要求 | 每個 Bucket 至少 **n=30**，整體至少 **n=100** |
| 下一步行動 | 擴大 backtest 股票 universe 或延長測試期間，取得更多樣本後再進行因子優化 |

---

### 擴大樣本的建議方向

1. **延長測試期間**：目前只測試 6 個月（實際僅 2026-05-06 ~ 2026-06-02，約 1 個月），應延長至 2 ~ 3 年
2. **擴大 Stock Universe**：目前只有 10 支基準股，應涵蓋更廣泛的上市/上櫃股票（目標 100+ 支）
3. **取得更多歷史資料**：目前 FinMind 資料取得可能受限，需確認可取得 2023-2025 的完整歷史資料

---

### 下一輪觸發條件

當且僅當滿足以下條件後，才進行因子修改：

- [ ] 整體 valid sample ≥ 100
- [ ] RS bucket 分析每個 bucket ≥ 30 樣本
- [ ] Factor differentiation 跨 bucket 差距 ≥ 10pp 且具有統計意義

---

## 📋 修改記錄格式（供未來使用）

```
| Factor | 修改項目 | 舊設定 | 新設定 |
| Before Hit Rate | After Hit Rate | Delta |
| Before Sample Size | After Sample Size | Delta |
| Before Avg Max Return | After Avg Max Return | Delta |
| Before Median Max Return | After Median Max Return | Delta |
| Before Days to Target | After Days to Target | Delta |
| Signal Reduction Risk | YES / NO |
| 結論 | 保留 / 恢復原設定 |
```
