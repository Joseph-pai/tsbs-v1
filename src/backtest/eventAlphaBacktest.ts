import { PredictionLedgerItem } from './types';
import { BacktestSummaryMetrics, computeBacktestMetrics } from './backtestEngine';
import { EventAlphaItem, EventType, EventSourceType } from '@/services/eventAlpha/eventTypes';

// =========================================================
// 資料結構定義
// =========================================================

export interface ABGroupMetrics extends BacktestSummaryMetrics {
    maxDrawdown: number;       // 最大回撤 (Maximum Drawdown)
    sampleSize: number;        // 有效樣本數
}

export interface EventAlphaABResult {
    controlMetrics: ABGroupMetrics;
    treatmentMetrics: ABGroupMetrics;
    differentials: {
        hitRate5d10Delta: number;
        avgMaxReturnDelta: number;
        medianMaxReturnDelta: number;
        avgDaysToTargetDelta: number;
    };
    groupAnalysis: {
        byEventType: Record<string, ABGroupMetrics>;
        bySourceType: Record<string, ABGroupMetrics>;
        byConfidenceTier: Record<string, ABGroupMetrics>;
    };
    conclusion: 'Event Alpha 有證據支持' | 'Event Alpha 暫無證據支持';
    conclusionReasons: string[];
    analysisDate: string;
    futureLeakageGuardActive: boolean;
}

export interface EventAlphaBacktestInput {
    controlLedger: PredictionLedgerItem[];
    treatmentLedger: PredictionLedgerItem[];
    eventItems: EventAlphaItem[];
}

// =========================================================
// Future News Leakage 防護工具
// =========================================================

/**
 * 檢查某個事件在 signalDate (D 日) 是否可被正當取得
 *
 * 規則：事件的 publishedAt 必須早於 signalDate 的市場開盤時間
 * （以台灣市場 09:00 Taiwan Time = 01:00 UTC 為準）
 * 若 publishedAt 在 D 日盤中或盤後 -> 視為未來資訊 -> 禁止使用
 */
export function isEventAvailableOnSignalDate(
    event: EventAlphaItem,
    signalDateStr: string
): boolean {
    const publishedTime = new Date(event.publishedAt).getTime();
    if (isNaN(publishedTime)) return false;

    // signalDate 當日台灣市場開盤時間 = signalDate 09:00 CST = signalDate 01:00 UTC
    const signalDayOpenUTC = new Date(`${signalDateStr}T01:00:00.000Z`).getTime();

    // 嚴格要求：事件 publishedAt 必須早於 D 日 09:00 Taiwan Time (01:00 UTC)
    return publishedTime < signalDayOpenUTC;
}

/**
 * 查詢某支股票在某 signalDate 之前已可取得的合規 Event 清單
 * （Future Leakage 防護核心）
 */
export function getAvailableEventsForSignal(
    stockId: string,
    signalDateStr: string,
    allEvents: EventAlphaItem[],
    lookbackDays: number = 7
): EventAlphaItem[] {
    const signalTime = new Date(signalDateStr).getTime();
    const lookbackCutoff = signalTime - lookbackDays * 24 * 3600 * 1000;

    return allEvents.filter(evt => {
        if (evt.stockId !== stockId) return false;
        if (!isEventAvailableOnSignalDate(evt, signalDateStr)) return false;
        const evtTime = new Date(evt.publishedAt).getTime();
        // 同時過濾太舊的事件 (超過 lookbackDays 的事件不再適用)
        return evtTime >= lookbackCutoff;
    });
}

// =========================================================
// A/B 比較指標計算
// =========================================================

/**
 * 計算最大回撤 (Maximum Drawdown)
 * 定義：有效樣本中，maxReturn 最大值到後面最小值的最大差距
 */
export function computeMaxDrawdown(ledgerItems: PredictionLedgerItem[]): number {
    const validItems = ledgerItems.filter(i => i.dataComplete);
    if (validItems.length < 2) return 0;

    const returns = validItems.map(i => i.maxReturn);
    let maxDrawdown = 0;
    let peak = returns[0];

    for (const ret of returns) {
        if (ret > peak) peak = ret;
        const drawdown = peak - ret;
        if (drawdown > maxDrawdown) maxDrawdown = drawdown;
    }

    return parseFloat(maxDrawdown.toFixed(4));
}

/**
 * 從 PredictionLedgerItem[] 計算完整 ABGroupMetrics
 */
export function computeABGroupMetrics(ledgerItems: PredictionLedgerItem[]): ABGroupMetrics {
    const base = computeBacktestMetrics(ledgerItems);
    const maxDrawdown = computeMaxDrawdown(ledgerItems);
    const sampleSize = ledgerItems.filter(i => i.dataComplete).length;

    return {
        ...base,
        maxDrawdown,
        sampleSize,
    };
}

// =========================================================
// 分組分析
// =========================================================

function computeGroupMetrics(
    treatmentLedger: PredictionLedgerItem[],
    allEvents: EventAlphaItem[],
    groupKey: 'eventType' | 'sourceType' | 'confidenceTier'
): Record<string, ABGroupMetrics> {
    const groups: Record<string, PredictionLedgerItem[]> = {};

    for (const item of treatmentLedger) {
        const availableEvents = getAvailableEventsForSignal(item.stockId, item.signalDate, allEvents);
        if (availableEvents.length === 0) continue;

        // 以該 signal 的最相關事件（最新一筆）為分組依據
        const latestEvent = availableEvents.sort(
            (a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()
        )[0];

        let groupValue: string;
        if (groupKey === 'eventType') {
            groupValue = latestEvent.eventType;
        } else if (groupKey === 'sourceType') {
            groupValue = latestEvent.sourceType;
        } else {
            // confidenceTier
            const conf = latestEvent.confidence;
            if (conf >= 0.8) groupValue = 'High (>=0.8)';
            else if (conf >= 0.5) groupValue = 'Medium (0.5-0.8)';
            else groupValue = 'Low (<0.5)';
        }

        if (!groups[groupValue]) groups[groupValue] = [];
        groups[groupValue].push(item);
    }

    const result: Record<string, ABGroupMetrics> = {};
    for (const [key, items] of Object.entries(groups)) {
        result[key] = computeABGroupMetrics(items);
    }
    return result;
}

// =========================================================
// 核心 A/B 回測執行函式
// =========================================================

/**
 * Event Alpha A/B Backtest 主函式
 *
 * Control:   Pure Technical Scanner signals
 * Treatment: Same signals filtered/enhanced by Event Alpha
 *
 * 嚴格禁止 Future News Leakage：
 * 所有 Event 的 publishedAt 必須早於 signalDate 09:00 台灣時間才可被使用
 */
export function runEventAlphaABBacktest(input: EventAlphaBacktestInput): EventAlphaABResult {
    const { controlLedger, treatmentLedger, eventItems } = input;

    // 1. 計算 Control 組指標
    const controlMetrics = computeABGroupMetrics(controlLedger);

    // 2. Treatment 組：篩選出在 signalDate 前確實有合規 Event 存在的 signals
    const treatmentWithEvent = treatmentLedger.filter(item => {
        const available = getAvailableEventsForSignal(item.stockId, item.signalDate, eventItems);
        return available.length > 0;
    });

    const treatmentMetrics = computeABGroupMetrics(treatmentWithEvent);

    // 3. 計算差異 (Treatment - Control)
    const hitRate5d10Delta = parseFloat(
        (treatmentMetrics.hitRate5d10 - controlMetrics.hitRate5d10).toFixed(4)
    );
    const avgMaxReturnDelta = parseFloat(
        (treatmentMetrics.averageMaxReturn - controlMetrics.averageMaxReturn).toFixed(4)
    );
    const medianMaxReturnDelta = parseFloat(
        (treatmentMetrics.medianMaxReturn - controlMetrics.medianMaxReturn).toFixed(4)
    );
    const avgDaysToTargetDelta = parseFloat(
        (treatmentMetrics.averageDaysToTarget - controlMetrics.averageDaysToTarget).toFixed(2)
    );

    // 4. 分組分析
    const byEventType = computeGroupMetrics(treatmentWithEvent, eventItems, 'eventType');
    const bySourceType = computeGroupMetrics(treatmentWithEvent, eventItems, 'sourceType');
    const byConfidenceTier = computeGroupMetrics(treatmentWithEvent, eventItems, 'confidenceTier');

    // 5. 結論判定 (嚴格實證：不允許保證性宣稱)
    const conclusionReasons: string[] = [];
    let hasEvidence = false;

    // 條件一：Treatment 命中率比 Control 高出 >= 5pp
    if (hitRate5d10Delta >= 0.05) {
        hasEvidence = true;
        conclusionReasons.push(
            `Treatment 5D+10% 命中率高於 Control ${(hitRate5d10Delta * 100).toFixed(2)}pp`
        );
    } else {
        conclusionReasons.push(
            `Treatment 5D+10% 命中率差距 (${(hitRate5d10Delta * 100).toFixed(2)}pp) 未達顯著門檻 (+5pp)`
        );
    }

    // 條件二：Treatment 樣本數 >= 10（避免小樣本統計失真）
    if (treatmentMetrics.sampleSize < 10) {
        hasEvidence = false;
        conclusionReasons.push(
            `Treatment 組有效樣本數 (${treatmentMetrics.sampleSize}) 不足 10 筆，證據不充分`
        );
    } else {
        conclusionReasons.push(`Treatment 組有效樣本數: ${treatmentMetrics.sampleSize} 筆`);
    }

    // 條件三：平均最大報酬也需高於 Control
    if (avgMaxReturnDelta > 0) {
        conclusionReasons.push(
            `Treatment 平均最大報酬高於 Control ${(avgMaxReturnDelta * 100).toFixed(2)}pp`
        );
    } else {
        hasEvidence = false;
        conclusionReasons.push(
            `Treatment 平均最大報酬未超越 Control (差距 ${(avgMaxReturnDelta * 100).toFixed(2)}pp)`
        );
    }

    const conclusion = hasEvidence
        ? 'Event Alpha 有證據支持'
        : 'Event Alpha 暫無證據支持';

    return {
        controlMetrics,
        treatmentMetrics,
        differentials: {
            hitRate5d10Delta,
            avgMaxReturnDelta,
            medianMaxReturnDelta,
            avgDaysToTargetDelta,
        },
        groupAnalysis: {
            byEventType,
            bySourceType,
            byConfidenceTier,
        },
        conclusion,
        conclusionReasons,
        analysisDate: new Date().toISOString().split('T')[0],
        futureLeakageGuardActive: true,
    };
}

// =========================================================
// Markdown 報告生成
// =========================================================

function fmtPct(val: number, decimals = 2): string {
    return (val * 100).toFixed(decimals) + '%';
}

function renderGroupTable(groups: Record<string, ABGroupMetrics>): string {
    if (Object.keys(groups).length === 0) {
        return '*（樣本不足，無法進行分組分析）*\n';
    }

    const lines: string[] = [];
    lines.push('| 分組 | 樣本數 | Hit Rate 5D10% | 平均最大報酬 | 中位數最大報酬 | 最大回撤 |');
    lines.push('| :--- | :---: | :---: | :---: | :---: | :---: |');

    for (const [key, m] of Object.entries(groups)) {
        lines.push(
            `| ${key} | ${m.sampleSize} | ${fmtPct(m.hitRate5d10)} | ${fmtPct(m.averageMaxReturn)} | ${fmtPct(m.medianMaxReturn)} | ${fmtPct(m.maxDrawdown)} |`
        );
    }

    return lines.join('\n') + '\n';
}

export function generateEventAlphaBacktestMarkdown(result: EventAlphaABResult): string {
    const lines: string[] = [];

    lines.push('# Event Alpha A/B Backtest Report');
    lines.push('');
    lines.push(`- **分析日期**: ${result.analysisDate}`);
    lines.push(`- **Future Leakage Guard**: ✅ 嚴格啟用 (所有事件需 publishedAt < D 日 09:00 台灣時間)`);
    lines.push('');
    lines.push('---');
    lines.push('');

    // A/B 比較主表格
    lines.push('## 📊 A/B 比較結果 (Control vs Treatment)');
    lines.push('');
    lines.push('| 指標 | Control (Technical Only) | Treatment (Technical + Event Alpha) | 差距 |');
    lines.push('| :--- | :---: | :---: | :---: |');

    const C = result.controlMetrics;
    const T = result.treatmentMetrics;
    const D = result.differentials;

    lines.push(`| 有效樣本數 (Sample Size) | ${C.sampleSize} | ${T.sampleSize} | - |`);
    lines.push(`| 5D +10% 命中率 | ${fmtPct(C.hitRate5d10)} | ${fmtPct(T.hitRate5d10)} | ${D.hitRate5d10Delta >= 0 ? '+' : ''}${fmtPct(D.hitRate5d10Delta)} |`);
    lines.push(`| D+1 命中率 | ${fmtPct(C.day1HitRate)} | ${fmtPct(T.day1HitRate)} | - |`);
    lines.push(`| D+2 命中率 | ${fmtPct(C.day2HitRate)} | ${fmtPct(T.day2HitRate)} | - |`);
    lines.push(`| D+3 命中率 | ${fmtPct(C.day3HitRate)} | ${fmtPct(T.day3HitRate)} | - |`);
    lines.push(`| D+4 命中率 | ${fmtPct(C.day4HitRate)} | ${fmtPct(T.day4HitRate)} | - |`);
    lines.push(`| D+5 命中率 | ${fmtPct(C.day5HitRate)} | ${fmtPct(T.day5HitRate)} | - |`);
    lines.push(`| 平均最大報酬 | ${fmtPct(C.averageMaxReturn)} | ${fmtPct(T.averageMaxReturn)} | ${D.avgMaxReturnDelta >= 0 ? '+' : ''}${fmtPct(D.avgMaxReturnDelta)} |`);
    lines.push(`| 中位數最大報酬 | ${fmtPct(C.medianMaxReturn)} | ${fmtPct(T.medianMaxReturn)} | ${D.medianMaxReturnDelta >= 0 ? '+' : ''}${fmtPct(D.medianMaxReturnDelta)} |`);
    lines.push(`| 平均達標天數 | ${C.averageDaysToTarget.toFixed(2)} 天 | ${T.averageDaysToTarget.toFixed(2)} 天 | ${D.avgDaysToTargetDelta >= 0 ? '+' : ''}${D.avgDaysToTargetDelta.toFixed(2)} 天 |`);
    lines.push(`| 最大回撤 | ${fmtPct(C.maxDrawdown)} | ${fmtPct(T.maxDrawdown)} | - |`);

    lines.push('');
    lines.push('---');
    lines.push('');

    // 分組分析
    lines.push('## 🔍 分組分析 (Group Analysis)');
    lines.push('');
    lines.push('### 📌 依事件類別 (by eventType)');
    lines.push('');
    lines.push(renderGroupTable(result.groupAnalysis.byEventType));

    lines.push('### 📌 依來源類別 (by sourceType)');
    lines.push('');
    lines.push(renderGroupTable(result.groupAnalysis.bySourceType));

    lines.push('### 📌 依信心度分層 (by Confidence Tier)');
    lines.push('');
    lines.push(renderGroupTable(result.groupAnalysis.byConfidenceTier));

    lines.push('---');
    lines.push('');

    // 結論
    lines.push('## 🏁 研究結論 (Research Conclusion)');
    lines.push('');
    lines.push(`**${result.conclusion}**`);
    lines.push('');
    result.conclusionReasons.forEach(reason => lines.push(`- ${reason}`));
    lines.push('');
    lines.push('---');
    lines.push('');
    lines.push('## 🛡️ 研究聲明 (Research Disclaimer)');
    lines.push('');
    lines.push('1. 本報告為歷史回測統計 (Historical Backtest Result)，僅供學術研究與策略開發參考。');
    lines.push('2. 本報告不保證未來 Event Alpha 效果，不構成任何投資建議。');
    lines.push('3. 所有 Event 資料均嚴格按照 publishedAt 時間驗證，Future Leakage Guard 已全程啟用。');
    lines.push('4. 即使結論為「有證據支持」，亦不代表任何形式的上漲保證或命中率保證宣稱。');

    return lines.join('\n');
}
