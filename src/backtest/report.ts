import { BacktestSummaryMetrics } from './backtestEngine';
import { PredictionLedgerItem } from './types';

export interface ReportPeriodOptions {
    startDate?: string;
    endDate?: string;
    stocksCount?: number;
}

const FORBIDDEN_WORDS = ['成功率', '保證', '預測準確率', '未來一定上漲'];

/**
 * 檢查報告文字是否包含違規/誇大字眼，若包含則拋出例外
 */
export function sanitizeReportText(text: string): string {
    for (const word of FORBIDDEN_WORDS) {
        if (text.includes(word)) {
            throw new Error(`Report contains forbidden word: "${word}". Backtest results must be historical non-guaranteed results.`);
        }
    }
    return text;
}

/**
 * 格式化文字版本之 Baseline Backtest Report
 */
export function generateTextReport(
    metrics: BacktestSummaryMetrics,
    options?: ReportPeriodOptions
): string {
    const startDate = options?.startDate || 'N/A';
    const endDate = options?.endDate || 'N/A';
    const stocksCount = options?.stocksCount ?? 0;

    const formatPct = (num: number) => `${(num * 100).toFixed(2)}%`;

    const reportLines = [
        '==========================================================',
        '               Historical Backtest Result                 ',
        '==========================================================',
        `測試期間 (Test Period): ${startDate} ~ ${endDate}`,
        `股票數量 (Stocks Count): ${stocksCount}`,
        `訊號數量 (Total Signals): ${metrics.totalSignals}`,
        `有效樣本數 (Valid Signals): ${metrics.validSignals}`,
        `資料不足數量 (Incomplete Signals): ${metrics.incompleteSignals}`,
        '----------------------------------------------------------',
        `5日 +10% 命中數 (Hit Signals): ${metrics.hitSignals}`,
        `5日 +10% 命中率 (Hit Rate): ${formatPct(metrics.hitRate5d10)}`,
        '----------------------------------------------------------',
        `D+1 命中率 (D+1 Hit Rate): ${formatPct(metrics.day1HitRate)}`,
        `D+2 命中率 (D+2 Hit Rate): ${formatPct(metrics.day2HitRate)}`,
        `D+3 命中率 (D+3 Hit Rate): ${formatPct(metrics.day3HitRate)}`,
        `D+4 命中率 (D+4 Hit Rate): ${formatPct(metrics.day4HitRate)}`,
        `D+5 命中率 (D+5 Hit Rate): ${formatPct(metrics.day5HitRate)}`,
        '----------------------------------------------------------',
        `平均 5 日最大報酬 (Avg Max Return): ${formatPct(metrics.averageMaxReturn)}`,
        `中位數 5 日最大報酬 (Median Max Return): ${formatPct(metrics.medianMaxReturn)}`,
        `平均達標天數 (Avg Days to Target): ${metrics.averageDaysToTarget.toFixed(2)} 天`,
        '==========================================================',
        '免責聲明：本報告為歷史回測統計結果 (Historical Backtest Result)，僅供學術研究與策略開發參考，不代表未來績效，亦不構成任何投資建議。',
    ];

    const rawReport = reportLines.join('\n');
    return sanitizeReportText(rawReport);
}

/**
 * 格式化 JSON 版本之 Baseline Backtest Report
 */
export function generateJSONReport(
    metrics: BacktestSummaryMetrics,
    ledgerItems: PredictionLedgerItem[],
    options?: ReportPeriodOptions
): string {
    const reportObj = {
        title: 'Historical Backtest Result',
        testPeriod: {
            startDate: options?.startDate || 'N/A',
            endDate: options?.endDate || 'N/A',
            stocksCount: options?.stocksCount ?? 0,
        },
        summaryMetrics: {
            totalSignals: metrics.totalSignals,
            validSignals: metrics.validSignals,
            incompleteSignals: metrics.incompleteSignals,
            hitSignals: metrics.hitSignals,
            missSignals: metrics.missSignals,

            hitRate5d10: metrics.hitRate5d10,
            hitRate5d10Formatted: `${(metrics.hitRate5d10 * 100).toFixed(2)}%`,

            day1HitRate: metrics.day1HitRate,
            day2HitRate: metrics.day2HitRate,
            day3HitRate: metrics.day3HitRate,
            day4HitRate: metrics.day4HitRate,
            day5HitRate: metrics.day5HitRate,

            averageMaxReturn: metrics.averageMaxReturn,
            medianMaxReturn: metrics.medianMaxReturn,
            averageDaysToTarget: metrics.averageDaysToTarget,
        },
        disclaimer: 'Historical Backtest Result only. Past performance does not guarantee future results.',
        itemsCount: ledgerItems.length,
        items: ledgerItems,
    };

    const jsonStr = JSON.stringify(reportObj, null, 2);
    sanitizeReportText(jsonStr);
    return jsonStr;
}

/**
 * 格式化 CSV 版本之 Prediction Ledger 明細
 */
export function generateCSVReport(ledgerItems: PredictionLedgerItem[]): string {
    const headers = [
        'id',
        'signalDate',
        'stockId',
        'stockName',
        'market',
        'signalClose',
        'score',
        'rank',
        'reasons',
        'targetPrice',
        'day1High',
        'day2High',
        'day3High',
        'day4High',
        'day5High',
        'maxHigh',
        'maxReturn',
        'hit5d10',
        'daysToTarget',
        'dataComplete'
    ];

    const rows = ledgerItems.map(item => [
        `"${item.id}"`,
        `"${item.signalDate}"`,
        `"${item.stockId}"`,
        `"${item.stockName}"`,
        `"${item.market}"`,
        item.signalClose,
        item.score,
        item.rank,
        `"${item.reasons.join(';')}"`,
        item.targetPrice,
        item.day1High ?? '',
        item.day2High ?? '',
        item.day3High ?? '',
        item.day4High ?? '',
        item.day5High ?? '',
        item.maxHigh,
        item.maxReturn,
        item.hit5d10,
        item.daysToTarget ?? '',
        item.dataComplete
    ]);

    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    sanitizeReportText(csvContent);
    return csvContent;
}
