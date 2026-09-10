import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { runBacktestOnBars, computeBacktestMetrics } from './backtestEngine';
import { NormalizedBar } from './historicalData';
import { PredictionLedgerItem } from './types';

describe('Backtest Engine & Look-ahead Bias Unit Tests', () => {

    test('1. 嚴格驗證零 Look-ahead Bias：訊號評估時絕對看不到未來 D+1 之後的資料', () => {
        // 建立 30 天模擬 K 線
        const bars: NormalizedBar[] = Array.from({ length: 30 }, (_, i) => {
            const dayNum = String(i + 1).padStart(2, '0');
            return {
                date: `2026-09-${dayNum}`,
                open: 100,
                high: 105,
                low: 99,
                close: 100 + i,
                volume: 1000 + i * 10,
            };
        });

        const evaluatedMaxLengths: number[] = [];
        const evaluatedLastDates: string[] = [];

        // 自訂 Signal Evaluator 記錄傳入之 pastBars 切片
        const customEvaluator = (pastBars: NormalizedBar[]) => {
            evaluatedMaxLengths.push(pastBars.length);
            evaluatedLastDates.push(pastBars[pastBars.length - 1].date);

            // 僅對第 22 天發送訊號 (2026-09-22)
            if (pastBars[pastBars.length - 1].date === '2026-09-22') {
                return { isSignal: true, score: 0.85, reasons: ['TEST_SIGNAL'] };
            }
            return null;
        };

        const ledgerItems = runBacktestOnBars(bars, {
            stockId: 'TEST_STOCK',
            minHistoryBars: 20,
            customSignalEvaluator: customEvaluator,
        });

        // 檢查 Signal Evaluator 每次被呼叫時之 pastBars 切片：
        // 第一次呼叫 (d = 19, 第 20 天 2026-09-20)，pastBars 長度應剛好為 20
        assert.equal(evaluatedMaxLengths[0], 20);
        assert.equal(evaluatedLastDates[0], '2026-09-20');

        // 每次呼叫時，傳給訊號評估器的最後一天 date 必須「精確等於」測試當日 D，絕對不得包含日後日期
        for (let i = 0; i < evaluatedMaxLengths.length; i++) {
            const expectedLength = 20 + i;
            assert.equal(evaluatedMaxLengths[i], expectedLength);
            const expectedDay = String(20 + i).padStart(2, '0');
            assert.equal(evaluatedLastDates[i], `2026-09-${expectedDay}`);
        }

        // 檢查產生之 Ledger Item
        assert.equal(ledgerItems.length, 1);
        assert.equal(ledgerItems[0].signalDate, '2026-09-22');
        assert.equal(ledgerItems[0].signalClose, 121); // 2026-09-22 close
    });

    test('2. computeBacktestMetrics 統計指標計算正確性', () => {
        const ledgerItems: PredictionLedgerItem[] = [
            // Hit on Day 1 (maxReturn = 0.12)
            { id: '1', signalDate: '2026-09-01', stockId: '2330', stockName: 'A', market: 'TWSE', signalClose: 100, score: 0.8, rank: 1, reasons: [], targetPrice: 110, day1High: 112, day2High: 105, day3High: 104, day4High: 103, day5High: 102, maxHigh: 112, maxReturn: 0.12, hit5d10: true, daysToTarget: 1, dataComplete: true },
            // Hit on Day 3 (maxReturn = 0.15)
            { id: '2', signalDate: '2026-09-02', stockId: '2330', stockName: 'A', market: 'TWSE', signalClose: 100, score: 0.8, rank: 1, reasons: [], targetPrice: 110, day1High: 102, day2High: 105, day3High: 115, day4High: 103, day5High: 102, maxHigh: 115, maxReturn: 0.15, hit5d10: true, daysToTarget: 3, dataComplete: true },
            // Miss (maxReturn = 0.05)
            { id: '3', signalDate: '2026-09-03', stockId: '2330', stockName: 'A', market: 'TWSE', signalClose: 100, score: 0.8, rank: 1, reasons: [], targetPrice: 110, day1High: 101, day2High: 102, day3High: 103, day4High: 104, day5High: 105, maxHigh: 105, maxReturn: 0.05, hit5d10: false, daysToTarget: null, dataComplete: true },
            // Incomplete signal (dataComplete: false)
            { id: '4', signalDate: '2026-09-28', stockId: '2330', stockName: 'A', market: 'TWSE', signalClose: 100, score: 0.8, rank: 1, reasons: [], targetPrice: 110, day1High: 101, day2High: 102, day3High: null, day4High: null, day5High: null, maxHigh: 102, maxReturn: 0.02, hit5d10: false, daysToTarget: null, dataComplete: false },
        ];

        const metrics = computeBacktestMetrics(ledgerItems);

        assert.equal(metrics.totalSignals, 4);
        assert.equal(metrics.validSignals, 3);
        assert.equal(metrics.incompleteSignals, 1);
        assert.equal(metrics.hitSignals, 2);
        assert.equal(metrics.missSignals, 1);

        // hitRate5d10 = 2 / 3 = 0.6667
        assert.equal(metrics.hitRate5d10, 0.6667);

        // Day 1 hit rate = 1 / 3 = 0.3333
        assert.equal(metrics.day1HitRate, 0.3333);
        // Day 3 hit rate = 1 / 3 = 0.3333
        assert.equal(metrics.day3HitRate, 0.3333);
        assert.equal(metrics.day2HitRate, 0);

        // maxReturns for valid signals = [0.05, 0.12, 0.15]
        // Avg = (0.05 + 0.12 + 0.15) / 3 = 0.1067
        assert.equal(metrics.averageMaxReturn, 0.1067);
        // Median = 0.12
        assert.equal(metrics.medianMaxReturn, 0.12);

        // Avg days to target = (1 + 3) / 2 = 2.0
        assert.equal(metrics.averageDaysToTarget, 2.0);
    });

    test('3. 歷史資料末端 (末 4 天) 訊號標示為 incompleteSignals', () => {
        const bars: NormalizedBar[] = Array.from({ length: 23 }, (_, i) => ({
            date: `2026-09-${String(i + 1).padStart(2, '0')}`,
            open: 100,
            high: 105,
            low: 99,
            close: 100,
            volume: 1000,
        }));

        // 訊號發生在倒數第 2 天 (索引 21, 2026-09-22)
        const customEvaluator = (pastBars: NormalizedBar[]) => {
            if (pastBars[pastBars.length - 1].date === '2026-09-22') {
                return { isSignal: true, score: 0.9, reasons: ['TEST_END'] };
            }
            return null;
        };

        const ledgerItems = runBacktestOnBars(bars, {
            stockId: 'TEST_STOCK',
            minHistoryBars: 20,
            customSignalEvaluator: customEvaluator,
        });

        assert.equal(ledgerItems.length, 1);
        assert.equal(ledgerItems[0].dataComplete, false); // 未滿 5 個未來交易日

        const metrics = computeBacktestMetrics(ledgerItems);
        assert.equal(metrics.totalSignals, 1);
        assert.equal(metrics.validSignals, 0);
        assert.equal(metrics.incompleteSignals, 1);
        assert.equal(metrics.hitSignals, 0);
    });
});
