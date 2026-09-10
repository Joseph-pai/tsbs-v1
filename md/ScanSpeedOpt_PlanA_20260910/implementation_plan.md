# 掃描加速：全前端本地運算（無 API 呼叫）

## 背景與問題根源

目前架構中，即便已下載市場快照到 localStorage，**每次掃描仍發起大量 API 呼叫**：

| 流程 | 問題 |
|------|------|
| `runScan` | 250 支候選股 ÷ 批次 2 = **125 次** POST `/api/scan/analyze` |
| `runEnhancedScan` | 同上，**125 次** POST |
| `runShortTermScan` | 先 GET candidates，再多批次 POST `/api/scan/short-term-v31` |
| 每次 `/api/scan/analyze` | 在後端重新抓 TAIEX+TPEX 指數、FinMind 個股歷史、法人數據等 |

「預載快照」只儲存今日行情（收盤、量、漲跌幅），並未包含歷史 K 線，  
所以掃描時後端仍須對每支股票發起外部 API，速度沒有明顯提升。

## 解決方向：全前端本地運算

> [!IMPORTANT]
> 核心原則：所有三種掃描（定點共振、強化評分、短線過濾）在點擊後**只使用 localStorage 的快照數據**，  
> 不發任何外部 API（除非快照為空才 fallback）。

### 快照資料欄位盤點

`/api/market/snapshot` 回傳的每支股票已包含：
- `stock_id`, `stock_name` — 代碼、名稱
- `close`, `open`, `high`, `low` — 今日四價
- `Trading_Volume` — 今日成交量（張數）
- `spread` — 漲跌價
- `change_percent` ← 可計算 `(spread/prev_close)`

**結論**：快照只有「今日單日」數據，**沒有歷史 K 線**。  
要完全前端化，必須調整評分邏輯，只用今日快照欄位做篩選。

## Open Questions

> [!IMPORTANT]
> 請確認以下設計取捨後再開始實作：

**Q1. 掃描精準度 vs 速度的取捨**

目前深度分析（`analyzeStock`）使用 60 天歷史 K 線計算：
- MA5/MA20 均線糾結
- 60 日量能比 (VRatio)
- 三大法人連買天數
- 月營收趨勢

新的純本地方案只能用今日快照做：
- 紅 K（收盤 > 開盤）✓
- 成交量排名 ✓
- 漲跌幅 ✓
- 漲幅 > 閾值（突破信號代理）✓

**選擇哪個方向？**

- **方案 A（推薦）：兩段式設計** — 本地快照做「超快速預篩」（秒級完成），篩出前 20 支後，只對這 20 支調 API 做深度分析。原本 125 次 API → 只剩 **10 次**，速度提升 90%+，精準度保持。
- **方案 B：純本地無 API** — 完全只用快照數據，不調任何 API。速度極快，但無法計算均線糾結、法人數據、月營收等，篩選精準度下降。
- **方案 C：擴大預載** — 下載按鈕不只下載快照，還一併下載所有股票的 30 日歷史 K 線，儲存到 IndexedDB（~50MB）。掃描時完全本地化，精準度不降。但下載時間更長（約 3-10 分鐘）。

**Q2. 如果選方案 A，前 20 支深度分析的 API 調用是否可接受（約 5-10 秒）？**

## Proposed Changes（以方案 A 為例）

### 前端掃描核心重構

#### [MODIFY] [page.tsx](file:///Users/joseph/Downloads/stock-pro-main/src/app/page.tsx)

- `runScan`：
  1. 從 localStorage 快照中，用純 JS 計算「紅 K + 成交量 Top 200 + 漲幅 > 1%」做預篩
  2. 取預篩前 20 名，只發 1 次 POST `/api/scan/analyze`（20 支）
  3. 後端收到 20 支，在 6 秒內處理完畢（目前 2 支需 ~1s，20 支 ≈ 5s 可行）
  
- `runEnhancedScan`：同上，預篩改為用成交金額（量×價）排序

- `runShortTermScan`：
  1. 第一步 GET candidates 保持不變（只取 stock_id 清單）
  2. 但只取前 30 支送 POST（而非全部批次送）

#### [MODIFY] [dataSyncService.ts](file:///Users/joseph/Downloads/stock-pro-main/src/services/dataSyncService.ts)

- 新增 `getLocalIndustryMap()` 方法，從 localStorage 讀取產業對應表

### 後端優化

#### [MODIFY] [src/app/api/scan/analyze/route.ts](file:///Users/joseph/Downloads/stock-pro-main/src/app/api/scan/analyze/route.ts)

- 移除每次批次都重新 fetch TAIEX/TPEX 指數的邏輯（改成只取一次或從 Redis 取）
- 這樣 20 支一批的處理速度可從 ~10s 降到 ~5s

## Verification Plan

### Manual Verification
- 點擊「定點共振掃描」後，觀察瀏覽器 Network 面板，確認 `/api/scan/analyze` 只被呼叫 1 次（而不是 100+ 次）
- 觀察掃描從點擊到顯示結果的總時間 ≤ 10 秒
