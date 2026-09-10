# Event Alpha A/B Backtest Report

- **分析日期**: 2026-09-10
- **Future Leakage Guard**: ✅ 嚴格啟用 (所有事件需 publishedAt < D 日 09:00 台灣時間)

---

## 📊 A/B 比較結果 (Control vs Treatment)

| 指標 | Control (Technical Only) | Treatment (Technical + Event Alpha) | 差距 |
| :--- | :---: | :---: | :---: |
| 有效樣本數 (Sample Size) | 227 | 0 | - |
| 5D +10% 命中率 | 40.97% | 0.00% | -40.97% |
| D+1 命中率 | 0.88% | 0.00% | - |
| D+2 命中率 | 21.59% | 0.00% | - |
| D+3 命中率 | 8.37% | 0.00% | - |
| D+4 命中率 | 4.85% | 0.00% | - |
| D+5 命中率 | 5.29% | 0.00% | - |
| 平均最大報酬 | 10.48% | 0.00% | -10.48% |
| 中位數最大報酬 | 7.93% | 0.00% | -7.93% |
| 平均達標天數 | 2.81 天 | 0.00 天 | -2.81 天 |
| 最大回撤 | 49.49% | 0.00% | - |

---

## 🔍 分組分析 (Group Analysis)

### 📌 依事件類別 (by eventType)

*（樣本不足，無法進行分組分析）*

### 📌 依來源類別 (by sourceType)

*（樣本不足，無法進行分組分析）*

### 📌 依信心度分層 (by Confidence Tier)

*（樣本不足，無法進行分組分析）*

---

## 🏁 研究結論 (Research Conclusion)

**Event Alpha 暫無證據支持**

- Treatment 5D+10% 命中率差距 (-40.97pp) 未達顯著門檻 (+5pp)
- Treatment 組有效樣本數 (0) 不足 10 筆，證據不充分
- Treatment 平均最大報酬未超越 Control (差距 -10.48pp)

---

## 🛡️ 研究聲明 (Research Disclaimer)

1. 本報告為歷史回測統計 (Historical Backtest Result)，僅供學術研究與策略開發參考。
2. 本報告不保證未來 Event Alpha 效果，不構成任何投資建議。
3. 所有 Event 資料均嚴格按照 publishedAt 時間驗證，Future Leakage Guard 已全程啟用。
4. 即使結論為「有證據支持」，亦不代表任何形式的上漲保證或命中率保證宣稱。