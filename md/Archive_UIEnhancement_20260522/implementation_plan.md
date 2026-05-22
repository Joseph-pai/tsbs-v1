# 三項 UI 修改計劃

## 修改目標概述

針對主頁掃描結果卡片與歷史紀錄的三項改善：

1. **歷史紀錄「出現X次」標示說明** — 加上 tooltip 解釋此標籤的意義
2. **歷史紀錄顯示掃描模式** — 在每筆紀錄的標題列加上「定點共振掃描」或「強化評分掃描」標籤
3. **主頁掃描結果加入綜合評分** — 在勝率與爆發力徽章上方新增「綜合評分」顯示

---

## 修改一：「出現X次」加說明 tooltip

**位置**：[page.tsx](file:///Users/joseph/Downloads/stock-pro-main/src/app/page.tsx) 約第 1692~1696 行

**現況**：
```tsx
{frequency[r.stock_id] > 1 && (
  <span className="px-2 py-0.5 rounded-lg bg-blue-500/10 border border-blue-500/30 text-[10px] font-black text-blue-400">
    出現 {frequency[r.stock_id]} 次
  </span>
)}
```

**修改後**：將 `<span>` 改為帶有 `title` tooltip 的 `<span>`，加入解釋文字：

```tsx
{frequency[r.stock_id] > 1 && (
  <span
    className="px-2 py-0.5 rounded-lg bg-blue-500/10 border border-blue-500/30 text-[10px] font-black text-blue-400 cursor-help"
    title={`此股票在目前篩選範圍內的 ${frequency[r.stock_id]} 筆掃描紀錄中均出現，次數越高代表持續符合共振條件，訊號可信度較強。`}
  >
    🔁 出現 {frequency[r.stock_id]} 次
  </span>
)}
```

---

## 修改二：歷史紀錄顯示掃描模式

**位置**：[page.tsx](file:///Users/joseph/Downloads/stock-pro-main/src/app/page.tsx) 約第 1624~1629 行（session 標題列）

**現況**：
```tsx
<div className="px-4 py-1 rounded-full bg-amber-500/20 text-amber-400 text-sm font-black">
  {session.date}
</div>
<span className="text-slate-400 font-bold">{session.market} · {session.sector}</span>
```

**修改後**：在日期右側加上掃描模式標籤：
- `scanMode === 'enhanced'` → 紫色「⚡ 強化評分掃描」
- `scanMode === 'original'` 或未設定 → 藍色「🔥 定點共振掃描」

```tsx
<div className="px-4 py-1 rounded-full bg-amber-500/20 text-amber-400 text-sm font-black">
  {session.date}
</div>
{/* 掃描模式標籤 */}
{session.scanMode === 'enhanced' ? (
  <span className="px-3 py-1 rounded-full bg-purple-500/20 border border-purple-500/40 text-purple-400 text-xs font-black">
    ⚡ 強化評分掃描
  </span>
) : (
  <span className="px-3 py-1 rounded-full bg-blue-500/20 border border-blue-500/40 text-blue-400 text-xs font-black">
    🔥 定點共振掃描
  </span>
)}
<span className="text-slate-400 font-bold">{session.market} · {session.sector}</span>
```

---

## 修改三：主頁掃描結果加入「綜合評分」

**位置**：[StockCard.tsx](file:///Users/joseph/Downloads/stock-pro-main/src/components/dashboard/StockCard.tsx) 約第 125~146 行

**現況**（勝率 + 爆發力並排）：
```tsx
<div className="mt-2 flex items-center gap-2">
  {/* 勝率分數 */}
  <div className="...勝率 badge..."> ... </div>
  {/* 爆發力分數 */}
  <div className="...爆發力 badge..."> ... </div>
</div>
```

**修改後**：改為垂直排列，綜合評分在上，勝率+爆發力在下：

```tsx
<div className="mt-2 flex flex-col items-end gap-1.5">
  {/* 綜合評分（上方，較大） */}
  <div
    className="flex items-center gap-1.5 bg-gradient-to-r from-amber-500/10 to-orange-500/10 border border-amber-500/40 rounded-xl px-3 py-1.5 cursor-help"
    title="【綜合評分】&#10;整合勝率分數與爆發力分數的加權總分（滿分 100）。&#10;80分以上為強力訊號，60~79分為潛力標的，60分以下謹慎觀察。"
  >
    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">綜合</span>
    <span className={`text-xl font-black font-mono ${
      comprehensiveScore >= 80 ? 'text-amber-400' :
      comprehensiveScore >= 60 ? 'text-blue-400' : 'text-slate-500'
    }`}>
      {comprehensiveScore}
    </span>
  </div>
  {/* 勝率 + 爆發力（下方，較小，並排） */}
  <div className="flex items-center gap-2">
    <div className="...勝率 badge..."> ... </div>
    <div className="...爆發力 badge..."> ... </div>
  </div>
</div>
```

> `comprehensiveScore` 的計算：`Math.round(data.potential_score || data.comprehensiveScoreDetails?.total || ((data.score || 0) * 100))`

---

## 受影響的檔案

| 檔案 | 修改內容 |
|------|---------|
| [StockCard.tsx](file:///Users/joseph/Downloads/stock-pro-main/src/components/dashboard/StockCard.tsx) | 加入「綜合評分」區塊（修改三）|
| [page.tsx](file:///Users/joseph/Downloads/stock-pro-main/src/app/page.tsx) | 歷史紀錄掃描模式標籤（修改二）+ 出現X次 tooltip（修改一）|

## 備份計劃

修改前將自動備份：
- `StockCard_backup_YYYYMMDD_HHmmss.tsx`
- `page_backup_YYYYMMDD_HHmmss.tsx`

## Open Questions

> [!IMPORTANT]
> **修改三的排版方向確認**：綜合評分放在勝率與爆發力的「上方」（垂直排列）。您確認這樣的排版嗎？或是希望改為「左側」另加一個更大的評分圓圈？

> [!NOTE]
> 「出現X次」的解釋文字說明：「在目前篩選範圍內的多筆掃描紀錄中均出現，次數越高代表持續符合共振條件，訊號可信度較強。」如有需要可調整措辭。
