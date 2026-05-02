# 列印下載功能 — 實施計劃

## 目標說明

在以下兩個頁面新增「列印下載」按鈕，讓使用者可以將整個分析頁面內容儲存為 **PNG 圖片**，並自動觸發瀏覽器下載。

選擇 **PNG 圖片**（非 PDF），原因如下：
- 圖片格式更易跨設備預覽分享
- 使用 `html2canvas` 可在前端純客戶端完成，不需後端支援
- 支援暗色主題樣式，視覺保真度高

---

## 技術方案

使用 **`html2canvas`** 函式庫：
- 純前端、無伺服器需求
- 直接捕捉 DOM 節點渲染成 Canvas 再轉 PNG
- 支援中文字體、漸層、自訂顏色
- 安裝指令：`npm install html2canvas`

---

## Open Questions

> [!IMPORTANT]
> 請確認圖片格式選擇是否符合您需求。目前計劃輸出為 **PNG 圖片**，如需 PDF 請告知（需額外安裝 `jspdf`）。

---

## 修改範圍

### 1. 安裝依賴套件

安裝 `html2canvas`（TypeScript 型別已內建）。

---

### 2. 專業分析視圖（個股頁面）

#### [MODIFY] [page.tsx](file:///Users/joseph/Downloads/stock-pro-main/src/app/stock/[symbol]/page.tsx)

**修改位置：Portrait Header（直式標題列）**

目前 Portrait Header 右側只有一個佔位 `<div className="w-8" />`（第 165 行），計劃將其替換為「列印下載」按鈕。

```
目前：
  <div className="w-8" />  {/* Balance */}

改為：
  <PrintDownloadButton symbol={symbol} stockName={data.stock_name} />
```

**修改位置：Landscape Floating Header（橫式浮動標題列）**

在橫式標題列的右側加入相同按鈕。

**新增元件：`PrintDownloadButton`**

```tsx
function PrintDownloadButton({ symbol, stockName }: { symbol: string, stockName: string }) {
    const [isPrinting, setIsPrinting] = useState(false);

    const handleDownload = async () => {
        setIsPrinting(true);
        try {
            const html2canvas = (await import('html2canvas')).default;
            const element = document.getElementById('stock-analysis-content');
            const canvas = await html2canvas(element!, {
                backgroundColor: '#020617', // slate-950
                scale: 2, // 高解析度
                useCORS: true,
            });
            const link = document.createElement('a');
            link.download = `${symbol}_${stockName}_分析報告_${new Date().toLocaleDateString('zh-TW').replace(/\//g, '')}.png`;
            link.href = canvas.toDataURL('image/png');
            link.click();
        } finally {
            setIsPrinting(false);
        }
    };

    return (
        <button onClick={handleDownload} disabled={isPrinting} ...>
            {isPrinting ? <Loader2 /> : <Download />}
            {isPrinting ? '產生中...' : '列印下載'}
        </button>
    );
}
```

**新增 ID 標記：**

在最外層 `<div>` 加上 `id="stock-analysis-content"` 以供 html2canvas 捕捉整個分析內容。

---

### 3. 智能選股導航頁面

#### [MODIFY] [page.tsx](file:///Users/joseph/Downloads/stock-pro-main/src/app/smart-navigator/page.tsx)

**修改位置：頁面右上角（返回主控台按鈕旁）**

在第 374-381 行的 Header 區塊（包含返回按鈕的那一列），改為 flex 排列，右側加入「列印下載」按鈕。

```
目前：
  <button onClick={() => router.push('/')} ...>返回主控台</button>

改為：
  <div className="flex items-center justify-between mb-8">
    <button onClick={() => router.push('/')} ...>返回主控台</button>
    <PrintDownloadButton />  {/* 新增 */}
  </div>
```

**按鈕邏輯：**
- 點擊後捕捉 `id="smart-navigator-content"` 的 DOM 區塊
- 輸出檔名：`智能選股導航_分析報告_YYYYMMDD.png`
- 只有在 `result`（單一查詢結果）或 `filterCompleted`（自動篩選完成）時按鈕才顯示（有分析結果才能下載）

**新增 ID 標記：**

在 `<div className="container mx-auto ...">` 加上 `id="smart-navigator-content"`。

---

## 驗證計劃

### 自動化測試
（無，為前端 UI 功能，需人工驗證）

### 人工驗證
1. 在個股分析頁面點擊「列印下載」→ 確認 PNG 自動下載，檔名含股票代號
2. 在智能選股導航查詢結果後點擊「列印下載」→ 確認 PNG 自動下載
3. 自動篩選完成後點擊「列印下載」→ 確認全部篩選結果都包含在圖片中

### 完成後推送
修改完成後執行 `git add -A && git commit -m "feat: add print/download button to stock analysis and smart navigator pages" && git push`
