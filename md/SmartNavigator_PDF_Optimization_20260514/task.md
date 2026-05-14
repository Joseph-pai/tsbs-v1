# 修復 PDF 匯出限制並調整分頁數量任務清單

- `[x]` 1. 備份 `src/app/smart-navigator/page.tsx`
- `[x]` 2. 將 PDF 匯出的 `CHUNK_SIZE` 從 15 改為 20
- `[x]` 3. 修改 `handleDownloadPDF` 邏輯，改為依據 `capturedChunks` 迴圈使用 `pdf.addPage` 動態新增分頁
- `[x]` 4. 移除原先超長單一頁面 `totalHeightMM` 的相關邏輯
