import { fetchAndNormalizeStockHistory } from './historicalData';
import { runBacktestOnBars, computeBacktestMetrics, BacktestSummaryMetrics, BacktestEngineOptions } from './backtestEngine';
import { PredictionLedgerItem } from './types';
import { PredictionLedgerStore } from './predictionLedger';

export interface BacktestRunnerResult {
    metrics: BacktestSummaryMetrics;
    ledgerItems: PredictionLedgerItem[];
    processedStocksCount: number;
}

/**
 * 回測執行器 (Backtest Runner)
 * 可對單支或多支股票進行完整 5D10% 歷史回測
 */
export async function runMarketBacktest(
    stockIds: string[],
    options?: {
        months?: number;
        scoreThreshold?: number;
        enhanced?: boolean;
    }
): Promise<BacktestRunnerResult> {
    const store = new PredictionLedgerStore();
    let processedCount = 0;

    for (const stockId of stockIds) {
        try {
            const normalizedRes = await fetchAndNormalizeStockHistory(stockId, {
                months: options?.months ?? 6,
                minRequiredBars: 20
            });

            if (normalizedRes.bars.length < 20) {
                continue;
            }

            const engineOpts: BacktestEngineOptions = {
                stockId,
                scoreThreshold: options?.scoreThreshold ?? 0.7,
                enhanced: options?.enhanced ?? true,
            };

            const items = runBacktestOnBars(normalizedRes.bars, engineOpts);

            items.forEach(item => store.add(item));
            processedCount++;
        } catch (e) {
            console.warn(`[BacktestRunner] Failed to backtest stock ${stockId}:`, e);
        }
    }

    const allItems = store.getAll();
    const metrics = computeBacktestMetrics(allItems);

    return {
        metrics,
        ledgerItems: allItems,
        processedStocksCount: processedCount,
    };
}
