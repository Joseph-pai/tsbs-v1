# 任務追蹤：共振演算法優化與 UI 重構

- [/] Frontend Updates
  - [ ] 更新 `src/types/index.ts` 中的 `HistorySession.settings` 與 `AnalysisResult` 型別。
  - [ ] 在 `src/app/page.tsx` 中將滑桿控制項替換為「權重共振設定」表格 UI。
  - [ ] 實作使用者權重總和防護與預設值 (30, 20, 30, 20)。
- [ ] Backend Algorithms (`src/services/scanner.ts` / `src/app/api/scan/analyze/route.ts`)
  - [ ] **大盤指標對數抓取**: 在 scan/analyze API 中額外抓取大盤與 OTC 過去 10 日漲幅，傳入 `analyzeStock` 供對標使用。
  - [ ] **流動性底線**: `analyzeStock` 內加掛「成交額 > 3000萬 或 量 > 500張」強制門檻。
  - [ ] **量能與周量演算法 (30%)**: 實作 `近 5 日內最大量 >= 過去 20 日最高量` (4周新高) 且今天大於 5日均量 2倍。
  - [ ] **均線多頭開花 (20%)**: `Close > 5MA > 20MA > 60MA` 與一定程度的收斂機制。
  - [ ] **突破與延續性動能 (30%)**: 60 日內最高價突破，或 7 日內曾突破且守穩 10MA 之上。
  - [ ] **產業/大盤對標 (20%)**: `個股近10日漲幅 > 所屬大盤10日漲幅` 達成後分配 20%。
- [ ] Verification
  - [ ] 依上述四點綜合計分。
  - [ ] 重大重構後的編譯與畫面確認。
