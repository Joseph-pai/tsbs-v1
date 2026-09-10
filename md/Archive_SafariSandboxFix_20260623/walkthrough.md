# Safari 歷史模擬交易沙盒無法顯示紀錄修復總結

## 問題描述
使用者反應在「歷史模擬交易沙盒」中，同一個帳號在 Chrome 瀏覽器可以正常顯示與寫入買入股票資訊，但是在 Mac Safari 與 iPad iOS 的 Safari 瀏覽器上卻無法顯示任何紀錄。

## 原因分析
1. **Safari 讀取快取失敗**：Safari (Mac/iOS) 的隱私保護（ITP）及 IndexedDB 實作限制，導致 Firestore 使用 `persistentMultipleTabManager` 時經常存取失敗，進而觸發讀取 `mock_trades` 的 Error Catch。
2. **自動存檔邏輯陷阱 (Race Condition)**：在 `MockTradingModal.tsx` 中，當讀取失敗進入 `.catch` 區塊時，系統會自動給予一筆「預設的空白紀錄」並標記讀取完成。此時另一個 `useEffect` 偵測到資料列 (`rows`) 的改變，便**自動觸發寫入**，試圖將這筆空白紀錄覆蓋回 Firebase。

## 修復細節
1. **阻斷自動空白覆寫機制 (`src/components/MockTradingModal.tsx`)**：
   - 引入 `useRef(false)` 作為 `hasModified` 標記。
   - 只有在使用者實際點擊「新增股票」、「刪除股票」或「輸入數值」時，才將 `hasModified` 設為 `true`。
   - 自動存檔的 `useEffect` 現在會檢查 `hasModified.current`，防止在讀取失敗或初始載入時誤將空資料寫回雲端。

2. **強制繞過本地快取 (`src/services/firebaseDb.ts`)**：
   - 將沙盒專用的 `getDoc` 方法替換為 `getDocFromServer`。
   - 此舉強制每次讀取歷史沙盒資料時，都直接向 Firebase 伺服器請求，繞過 Safari 上不穩定的 IndexedDB 快取，徹底解決畫面空白讀不到資料的問題。

## 驗證與結果
修改完成後已成功 commit 並 push 至 GitHub，解決了跨瀏覽器平台顯示不一致的 Bug，並保護了使用者的雲端資料免受錯誤覆寫。
