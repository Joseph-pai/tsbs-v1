import { NormalizedBar } from './historicalData';
import { PredictionLedgerItem } from './types';
import { createPredictionLedgerEntry } from './predictionLedger';
import { evaluateStock } from '@/services/engine';

export interface BacktestSummaryMetrics {
    totalSignals: number;
    validSignals: number;
    hitSignals: number;
    missSignals: number;
    incompleteSignals: number;

    hitRate5d10: number;

    day1HitRate: number;
    day2HitRate: number;
    day3HitRate: number;
    day4HitRate: number;
    day5HitRate: number;

    averageMaxReturn: number;
    medianMaxReturn: number;

    averageDaysToTarget: number;
}

export interface BacktestEngineOptions {
    stockId: string;
    stockName?: string;
    market?: 'TWSE' | 'TPEX' | string;
    minHistoryBars?: number;     // 至少需要多少日歷史 K 線給 Scanner 參考 (預設 20)
    scoreThreshold?: number;     // 訊號門檻 (預設 0.7)
    enhanced?: boolean;          // 強化評分模式
    customSignalEvaluator?: (pastBars: NormalizedBar[]) => { isSignal: boolean; score: number; reasons: string[] } | null;
}

/**
 * 歷史 Backtest Engine 核心
 * 
 * 絕對禁止 Look-ahead Bias 規範：
 * 假設測試日期為索引 d (即 D 當日)
 * 傳給 Scanner 的過去歷史只能是 fullBars.slice(0, d + 1)
 * 絕對無法存取或看見任何 d + 1 之後 (D+1 ~ D+5) 的價格
 */
export function runBacktestOnBars(
    fullBars: NormalizedBar[],
    options: BacktestEngineOptions
): PredictionLedgerItem[] {
    const {
        stockId,
        stockName = stockId,
        market = 'TWSE',
        minHistoryBars = 20,
        scoreThreshold = 0.7,
        enhanced = true,
        customSignalEvaluator
    } = options;

    if (!Array.isArray(fullBars) || fullBars.length < minHistoryBars) {
        return [];
    }

    const ledgerItems: PredictionLedgerItem[] = [];

    // 遍歷所有可能產生訊號的歷史交易日 d (從 minHistoryBars - 1 開始)
    for (let d = minHistoryBars - 1; d < fullBars.length; d++) {
        // === 1. 截取過去歷史 (Zero Look-ahead Bias) ===
        // 包含從 index 0 到 index d (即 D 當日收盤價位)，完全不包含 d + 1 以後
        const pastBars = fullBars.slice(0, d + 1);
        const dayDBar = pastBars[pastBars.length - 1];
        const signalDate = dayDBar.date;
        const signalClose = dayDBar.close;

        // === 2. 執行 Scanner 邏輯 (僅傳入過去歷史 pastBars) ===
        let isSignal = false;
        let score = 0;
        let reasons: string[] = [];

        if (customSignalEvaluator) {
            const evalRes = customSignalEvaluator(pastBars);
            if (evalRes && evalRes.isSignal) {
                isSignal = true;
                score = evalRes.score;
                reasons = evalRes.reasons;
            }
        } else {
            // 使用 production engine 獨立函數 evaluateStock (無修改 production scanner)
            const engineInputHistory = pastBars.map(b => ({
                stock_id: stockId,
                stock_name: stockName,
                date: b.date,
                open: b.open,
                max: b.high,
                min: b.low,
                close: b.close,
                Trading_Volume: b.volume,
                Trading_money: 0,
                spread: 0,
                Trading_turnover: 0,
            }));

            const engineResult = evaluateStock(engineInputHistory, undefined, undefined, market as any, enhanced);

            if (engineResult && (engineResult.isQualified || engineResult.score >= scoreThreshold)) {
                isSignal = true;
                score = engineResult.score;
                reasons = [
                    ...(engineResult.isBreakout ? ['BREAKOUT'] : []),
                    ...(engineResult.vRatio >= 2.5 ? ['VOLUME_EXPLOSION'] : []),
                    ...(engineResult.is_bullish ? ['BULLISH_MA'] : []),
                    ...(engineResult.maData?.isSqueezing ? ['MA_SQUEEZE'] : []),
                ];
                if (reasons.length === 0) reasons = ['SIGNAL_QUALIFIED'];
            }
        }

        // === 3. 若產生訊號，讀取未來 D+1 ~ D+5 資料進行評估 ===
        if (isSignal) {
            // 未來資料僅由 Backtest Target Evaluation 使用
            const futureBars = fullBars.slice(d + 1, d + 6);

            const ledgerItem = createPredictionLedgerEntry({
                signalDate,
                stockId,
                stockName,
                market,
                signalClose,
                score: parseFloat(score.toFixed(4)),
                rank: 1,
                reasons,
                futureBars,
            });

            ledgerItems.push(ledgerItem);
        }
    }

    return ledgerItems;
}

/**
 * 計算 Backtest 統計指標 (Summary Metrics)
 */
export function computeBacktestMetrics(ledgerItems: PredictionLedgerItem[]): BacktestSummaryMetrics {
    const totalSignals = ledgerItems.length;

    const validItems = ledgerItems.filter(item => item.dataComplete === true);
    const incompleteItems = ledgerItems.filter(item => item.dataComplete === false);

    const validSignals = validItems.length;
    const incompleteSignals = incompleteItems.length;

    const hitItems = validItems.filter(item => item.hit5d10 === true);
    const hitSignals = hitItems.length;
    const missSignals = validSignals - hitSignals;

    const hitRate5d10 = validSignals > 0 ? parseFloat((hitSignals / validSignals).toFixed(4)) : 0;

    // 分日命中率 (Day 1..5)
    const day1Hits = validItems.filter(item => item.daysToTarget === 1).length;
    const day2Hits = validItems.filter(item => item.daysToTarget === 2).length;
    const day3Hits = validItems.filter(item => item.daysToTarget === 3).length;
    const day4Hits = validItems.filter(item => item.daysToTarget === 4).length;
    const day5Hits = validItems.filter(item => item.daysToTarget === 5).length;

    const day1HitRate = validSignals > 0 ? parseFloat((day1Hits / validSignals).toFixed(4)) : 0;
    const day2HitRate = validSignals > 0 ? parseFloat((day2Hits / validSignals).toFixed(4)) : 0;
    const day3HitRate = validSignals > 0 ? parseFloat((day3Hits / validSignals).toFixed(4)) : 0;
    const day4HitRate = validSignals > 0 ? parseFloat((day4Hits / validSignals).toFixed(4)) : 0;
    const day5HitRate = validSignals > 0 ? parseFloat((day5Hits / validSignals).toFixed(4)) : 0;

    // 計算平均與中位數 Return
    const maxReturns = validItems.map(item => item.maxReturn).sort((a, b) => a - b);
    const sumReturn = maxReturns.reduce((sum, r) => sum + r, 0);
    const averageMaxReturn = validSignals > 0 ? parseFloat((sumReturn / validSignals).toFixed(4)) : 0;

    let medianMaxReturn = 0;
    if (validSignals > 0) {
        const mid = Math.floor(validSignals / 2);
        if (validSignals % 2 === 0) {
            medianMaxReturn = (maxReturns[mid - 1] + maxReturns[mid]) / 2;
        } else {
            medianMaxReturn = maxReturns[mid];
        }
        medianMaxReturn = parseFloat(medianMaxReturn.toFixed(4));
    }

    // 計算平均觸及天數
    const daysList = hitItems.map(item => item.daysToTarget!).filter(d => d !== null);
    const sumDays = daysList.reduce((sum, d) => sum + d, 0);
    const averageDaysToTarget = hitSignals > 0 ? parseFloat((sumDays / hitSignals).toFixed(2)) : 0;

    return {
        totalSignals,
        validSignals,
        hitSignals,
        missSignals,
        incompleteSignals,

        hitRate5d10,

        day1HitRate,
        day2HitRate,
        day3HitRate,
        day4HitRate,
        day5HitRate,

        averageMaxReturn,
        medianMaxReturn,

        averageDaysToTarget,
    };
}
