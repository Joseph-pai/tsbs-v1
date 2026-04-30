# 修正搜尋框顯示與股票信息卡名稱問題

問題描述：
1. 點擊下拉選單中的股票後，輸入框只顯示股票代號，沒有顯示名稱。
2. 點擊「共振掃描」按鈕後，股票信息卡標題出現「6456 6456」（代號重複兩次），因為 API 收到的 `name` 欄位被傳入了 `stockId`，而不是真正的股票名稱。

## User Review Required

> [!IMPORTANT]
> 根據您的要求，這是即將執行的修改計畫。請確認是否要開始執行修改代碼。我會在修改前自動備份目前的檔案。

## 問題根因分析

**問題 1 根因 (`StockSearch.tsx` 第 44 行)**
```typescript
// 目前：只儲存代號
const handleSelect = (stock: StockData) => {
    setSearchTerm(stock.stock_id); // ← 只存了代號
    setIsOpen(false);
};
```

**問題 2 根因 (`page.tsx` 第 363 行)**
```typescript
// 目前：name 欄位使用 stockId，API 回傳的 stock_name 就等於代號
body: JSON.stringify({
    stocks: [{ id: stockId, name: stockId }], // ← name 傳代號而非真名
    settings: settings
})
```
API 端收到 `name: "6456"` 就把它設成 `stock_name`，所以卡片顯示「6456 6456」。

## Proposed Changes

### StockSearch Component

#### [MODIFY] StockSearch.tsx (src/components/dashboard/StockSearch.tsx)

**修改 1：`onSearch` 介面改為同時傳遞 id 與 name**
```typescript
// 修改前
onSearch: (term: string) => void;
// 修改後
onSearch: (stockId: string, stockName: string) => void;
```

**修改 2：`handleSelect` 輸入框顯示「代號 名稱」**
```typescript
// 修改前
const handleSelect = (stock: StockData) => {
    setSearchTerm(stock.stock_id);
    setIsOpen(false);
};
// 修改後
const handleSelect = (stock: StockData) => {
    setSearchTerm(`${stock.stock_id} ${stock.stock_name}`);
    setIsOpen(false);
};
```

**修改 3：`handleTrigger` 解析出純代號傳給 onSearch，並附帶 stockName**
- 從 `searchTerm` 取出第一個 token（純代號），同時找到對應的 `stock_name`，傳給 `onSearch(stockId, stockName)`。

---

### Dashboard Page

#### [MODIFY] page.tsx (src/app/page.tsx)

**修改 1：`StockSearch` 的 `onSearch` callback 接收兩個參數**
```typescript
// 修改前
onSearch={(term) => {
    setSearchTerm(term);
    runSingleStockAnalysis(term);
}}
// 修改後
onSearch={(stockId, stockName) => {
    setSearchTerm(stockId);
    runSingleStockAnalysis(stockId, stockName);
}}
```

**修改 2：`runSingleStockAnalysis` 增加 `stockName` 參數，傳給 API**
```typescript
// 修改前
const runSingleStockAnalysis = async (stockId: string) => {
    stocks: [{ id: stockId, name: stockId }],
// 修改後
const runSingleStockAnalysis = async (stockId: string, stockName?: string) => {
    stocks: [{ id: stockId, name: stockName || stockId }],
```

## Verification Plan

### Manual Verification
1. 輸入股票代號或名稱，點選下拉選單中的股票，確認輸入框顯示「代號 名稱」（例如：`6456 GreenPower`）。
2. 點選「共振掃描」按鈕，確認信息卡標題顯示「代號 + 正確名稱」，不再重複代號。
3. 直接輸入代號（不透過下拉）並按 Enter 或點按鈕，功能仍正常運作。
