# 台股爆發預警系統 (TSBS) - 專案盤點與 Baseline 報告

## 專案概要
- **專案名稱**: tsbs-v1 (tsbs-app)
- **GitHub Repository**: Joseph-pai/tsbs-v1
- **部署平台**: Netlify

---

## 核心盤點項目確認

### 1. 使用什麼 Framework
- **Next.js**: 14.2.0 (App Router 模式)
- **React**: 18.2.0
- **UI & 樣式**: TailwindCSS 3.3.0, Lucide React 0.300.0, Lightweight Charts 4.1.0

### 2. 使用什麼 Node / TypeScript 設定
- **TypeScript**: 5.x
- **Target**: `ES2017`
- **Module Resolution**: `bundler`
- **Strict Mode**: `true`
- **Path Alias**: `@/*` 指向 `./src/*`
- **Node Types**: `@types/node: ^20`

### 3. Netlify build 設定
- **配置文件**: `netlify.toml`
  ```toml
  [build]
    command = "npm run build"
    publish = ".next"
  ```
- **Build 指令**: `npm run build` (`next build`)

### 4. Scanner 的主要入口
- **API Routes**:
  - `src/app/api/scan/route.ts` (處理 Stage 1: discovery, Stage 2: filter, Stage 3: expert)
  - `src/app/api/smart-navigator/route.ts` (短線過濾掃描，呼叫 `scanShortTerm`)
  - `src/app/api/scan/short-term/route.ts` / `src/app/api/scan/short-term-v31/route.ts`
- **核心 Service**:
  - `src/services/scanner.ts` (`ScannerService`)

### 5. Scanner 的資料來源
- **FinMind API** (`src/lib/finmind.ts`): 提供日 K 價量 (`TaiwanStockPrice`)、法人持股比 (`TaiwanStockHoldingSharesPer`)、法人買賣超 (`TaiwanStockInstitutionalInvestorsBuySell`)、每月營收 (`TaiwanStockMonthRevenue`)、融資融券與當沖資料。
- **TWSE / TPEX OpenAPI & 官方網頁 API** (`src/lib/exchange.ts`): 提供即時快照 (`MI_INDEX`, `STOCK_DAY_ALL`, `tpex_mainboard_daily_close_quotes`)、歷史 K 線 (`STOCK_DAY`, `daily_trading_info`)、大盤指數 (`TAIEX`) 及產業分類。
- **快取機制**: Redis (`ioredis`) 快取 raw data (TTL 4 ~ 12 小時)。

### 6. 股票候選篩選流程
- **Stage 1 (Discovery)**:
  1. 快速預篩：從市場快照中篩選成交量 > 1000 股且收盤 > 開盤（紅 K）之股票，按成交量排序取前 200 支。
  2. 嚴格驗證：對前 200 支獲取歷史資料，檢驗量能倍數 ≥ 2.5x、均線糾結帶 ≤ 4%、價格突破幅度 ≥ 3.5%、MA5 > MA20 多頭排列。
- **Stage 2 (Filter)**:
  - 檢驗投信連續買超 ≥ 3 日、量能遞增、價格站上 MA。篩選綜合評分 > 0.4 或符合 2 個以上條件之強勢股，輸出前 30 支。
- **Short-Term Scanner (`scanShortTerm`)**:
  - 執行六大策略：策略一（大盤位階動態門檻）、策略二（品質數量自動控制）、策略三（VCP 波動率收縮）、策略四（RS 相對強度硬性過濾）、策略五（60 日高點距離與位階矩陣）、策略六（成交量型態質化）。

### 7. 評分流程
- 實作於 `src/services/engine.ts` (`evaluateStock`) 與 `src/services/scanner.ts`。
- 整合以下維度計算權重與總分 (0 ~ 1 / 0 ~ 100 分)：
  - 量能得分 (V-Ratio)
  - 均線糾結與多空排列得分 (MA Score)
  - 法人籌碼買超得分 (Chip Score)
  - 突破幅度與強勢加分 (Breakout / RS Score)
  - 位階與 VCP 特徵加分

### 8. 現有技術指標
- **SMA / EMA** (`src/services/indicators.ts`)
- **Volume Ratio (V-Ratio)**: 當日量 / 歷史均量
- **MA Alignment & Constriction**: 均線糾結帶計算
- **Point of Control (POC)**: 透過 Volume Profile 籌碼密集區估計
- **MACD**: DIF, MACD, OSC (Histogram), prevOsc, calculateMACDFull
- **KD (Stochastic Oscillator)**: K 與 D 軌跡計算
- **ATR (Average True Range)**: VCP 波動率收縮評估

### 9. 現有 API
- `/api/scan` (POST / GET)
- `/api/scan/short-term` & `/api/scan/short-term-v31` & `/api/scan/cycle-method`
- `/api/smart-navigator`
- `/api/backtest`
- `/api/analyze/[id]`
- `/api/market/bulk-sync`, `/api/market/industry-mapping`, `/api/market/snapshot`
- `/api/stocks/[symbol]`
- `/api/pre-order-advice`

### 10. 現有資料儲存方式
- **Redis (`ioredis`)**: 用於 API 外部請求快取 (Raw data caching)。
- **Firebase Firestore (`firebase/firestore`)**: 用於模擬交易 (Mock Trading)、歷史紀錄、使用者設定。
- **Browser LocalStorage**: 用於前端狀態與登入持久化。

### 11. 是否已有 backtest
- **是 (Yes)**。
  - API Route: `src/app/api/backtest/route.ts`
  - 獨立腳本: `scripts/test-algo-v2.mjs`, `scripts/test-new-algo.mjs`, `test-vratio.mjs`, `generate_scanner_v31.py`

### 12. 是否已有 historical data
- **否/動態抓取**。無預先儲存的大型靜態歷史資料庫，歷史 K 線與籌碼係由 FinMind / TWSE / TPEX API 動態抓取並寫入 Redis 快取。

### 13. 是否已有 test
- **否 (No)**。`package.json` 中沒有配置 `"test"` script，專案中無 Jest / Vitest / Playwright / Cypress 單元與整合測試框架。僅有手動執行的獨立測試腳本 (`scripts/*.mjs`)。

### 14. 是否存在 hard-coded secret / token
- **是 (Yes)**。
  - `src/lib/config.ts` 第 4 行包含 FinMind API Token 寫死預設值：`NEXT_PUBLIC_FINMIND_TOKEN || 'eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9...'`
  - `.env.local` 中亦有設定 `NEXT_PUBLIC_FINMIND_TOKEN`。

### 15. 是否已經使用 AI / LLM
- **否 (No)**。專案中無任何 OpenAI, Anthropic, Gemini, Claude, DeepSeek 或其他 LLM SDK / API / 模型呼叫。

### 16. 是否存在 Vercel 相關設定
- **否 (No)**。`README.md` 中有 `create-next-app` 產生的 Vercel 說明文案，但部署設定檔完全以 `netlify.toml` 為主，無 `vercel.json` 或 Vercel 專用 API。

---

## 執行紀錄

### 1. `npm install` 結果
- **成功**: 依賴套件完整安裝 (up to date in 5s)。

### 2. `npm run build` 結果
- **失敗 (Failed)**: Exit Code 1.
- **失敗原因**: 
  - 在執行 `next build` 進行靜態頁面預渲染 (prerender) 時，因為環境變數中缺少有效的 Firebase 配置 (`NEXT_PUBLIC_FIREBASE_API_KEY`)，引發 `FirebaseError: Firebase: Error (auth/invalid-api-key)` 錯誤，導致 `/login`, `/smart-navigator`, `/_not-found`, `/` 等頁面匯出失敗。

### 3. `npm test` 結果
- **無 test script**: `package.json` 未定義 `test` 指令。

---

## 現有問題與風險

1. **Build 階段 Firebase 靜態預渲染失敗**: `src/lib/firebase/config.ts` 在 Client / SSR 被載入時，直接讀取 `process.env.NEXT_PUBLIC_FIREBASE_*`；若環境變數未提供，會在 `next build` static export 時拋出 Invalid API Key 例外。
2. **Hard-coded API Token**: `src/lib/config.ts` 中含有寫死的 FinMind JWT Token 備用值，若洩漏可能導致配額遭套用或安全風險。
3. **缺乏自動化測試**: 缺乏單元測試與整合測試框架，演算法重構或調整時容易產生非預期 Bug。
4. **大量歷史備份檔案殘留**: `src/app/`, `src/services/`, `src/lib/` 目錄中存在許多 `.bak`, `.backup`, `.ts.2` 結尾的備份檔案，增加專案維護與搜尋雜訊。

---

## 目前沒有修改的核心檔案
- `package.json`
- `netlify.toml`
- `src/app/page.tsx`
- `src/services/scanner.ts`
- `src/services/engine.ts`
- `src/services/indicators.ts`
- `src/lib/exchange.ts`
- `src/lib/finmind.ts`
- `src/lib/config.ts`
- `src/lib/firebase/config.ts`
（全專案現有程式邏輯與設定均保持原樣，零修改）
