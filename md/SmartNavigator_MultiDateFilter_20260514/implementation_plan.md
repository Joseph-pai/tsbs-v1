# 智能選股導航自動篩選：歷史掃描日期複選功能修改計劃

此修改計劃旨在讓「智能選股導航」的自動篩選功能支援選取多個歷史掃描日期，並在篩選時自動排除重複出現的股票代號，提升分析效率。

## User Review Required
> [!IMPORTANT]
> 請確認以下邏輯是否符合您的預期：
> 1. **點擊日期的行為將改為「切換（Toggle）」**：點擊未選取的日期會加入選擇，再次點擊已選取的日期則會取消選擇。
> 2. **去重複邏輯（系統原生支援）**：系統原先已經使用 `Map` 資料結構來處理當日掃描結果的去重。我們只需將多日的紀錄合併，系統會自動將同一個 `stock_id` 覆蓋，確保 5215 這種在多日出現的股票，最終只會被分析一次。

## Proposed Changes

### src/app/smart-navigator/page.tsx

此元件將進行以下三個主要部分的修改：

#### 1. 狀態管理 (State) 更新
- 將原先單選的狀態 `selectedDate` 改為陣列型態的 `selectedDates`：
  ```typescript
  // 舊版
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  // 新版
  const [selectedDates, setSelectedDates] = useState<string[]>([]);
  ```

#### 2. MiniCalendar 元件 (UI) 修改
- **修改 Props 介面**：將 `selectedDate` 改為接收 `selectedDates: string[]`。
- **更新 UI 判斷**：日曆中的高亮邏輯從 `isSelected = selectedDate === dateStr;` 改為判斷陣列包含 `isSelected = selectedDates.includes(dateStr);`。

#### 3. 自動篩選邏輯 (handleAutoFilter) 與事件綁定更新
- **日曆點擊事件**：在父元件綁定 `onSelectDate` 時加入 Toggle 邏輯：
  ```typescript
  onSelectDate={(date) => {
      setSelectedDates(prev => 
          prev.includes(date) ? prev.filter(d => d !== date) : [...prev, date]
      );
  }}
  ```
- **取得去重股票名單**：
  修改 `targetRecords` 的過濾條件，只要該筆紀錄的日期存在於 `selectedDates` 陣列中就保留：
  ```typescript
  const targetRecords = scanRecords.filter(r => {
      if (!r.createdAt?.seconds) return false;
      const rDate = format(new Date(r.createdAt.seconds * 1000), 'yyyy-MM-dd');
      return selectedDates.includes(rDate);
  });
  // 隨後的 Map 處理會自動過濾掉跨日重複的 stock_id
  ```
- **按鈕狀態更新**：修改「開始篩選」按鈕的防呆機制，改為 `disabled={isFiltering || selectedDates.length === 0}`。

## Verification Plan

### Manual Verification
1. 進入「智能選股導航」，點選「自動篩選」。
2. 在日曆上選擇三個有紀錄的日期（例如 5/1、5/2、5/4）。確認 UI 能正確高亮這三天，且再次點擊能取消選取。
3. 點擊「開始篩選」，觀察進度條上的總數（此數字應為去重後的唯一股票總數，不應有重複的股票被重複分析）。
4. 檢查最終列出的卡片中，每一檔股票都只出現一次。
