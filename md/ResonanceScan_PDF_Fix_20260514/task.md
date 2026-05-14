# 修復共振掃描 PDF 匯出限制任務清單

- `[x]` 1. 備份 `src/lib/pdfUtils.ts`
- `[x]` 2. 修改 `src/lib/pdfUtils.ts`：移除 `totalHeightMM` 單頁邏輯，改用 `pdf.addPage` 動態分頁
- `[x]` 3. 建立 `walkthrough.md` 總結變更
- `[ ]` 4. 將變更推送到 GitHub
- `[ ]` 5. 詢問用戶是否保留 md 文件夾
