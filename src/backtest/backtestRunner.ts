import { fetchAndNormalizeStockHistory } from './historicalData';
import { runBacktestOnBars, computeBacktestMetrics, BacktestSummaryMetrics, BacktestEngineOptions } from './backtestEngine';
import { PredictionLedgerItem } from './types';
import { PredictionLedgerStore } from './predictionLedger';

export interface BacktestRunnerResult {
    metrics: BacktestSummaryMetrics;
    ledgerItems: PredictionLedgerItem[];
    processedStocksCount: number;
}

/** API 請求之間的等待 (ms)，避免 FinMind rate limiting */
function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * 回測執行器 (Backtest Runner)
 * 可對單支或多支股票進行完整 5D10% 歷史回測
 *
 * 資料來源優先順序：
 *   1. FinMind API (Primary) - 支援 2-3 年歷史
 *   2. TWSE/TPEX ExchangeClient (Fallback) - 約 6 個月
 */
export async function runMarketBacktest(
    stockIds: string[],
    options?: {
        months?: number;
        scoreThreshold?: number;
        enhanced?: boolean;
        requestDelayMs?: number;  // 每個股票請求之間的延遲 (預設 600ms)
    }
): Promise<BacktestRunnerResult> {
    const store = new PredictionLedgerStore();
    let processedCount = 0;
    const delayMs = options?.requestDelayMs ?? 600;

    for (let i = 0; i < stockIds.length; i++) {
        const stockId = stockIds[i];

        // 每個股票之間加入延遲，避免 FinMind API rate limiting
        if (i > 0) {
            await sleep(delayMs);
        }

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
