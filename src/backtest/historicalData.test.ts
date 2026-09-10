import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeHistoricalBars } from './historicalData';

describe('normalizeHistoricalBars Unit Tests', () => {

    test('1. 日期排序 (Ascending Order)', () => {
        const rawBars = [
            { date: '2026-09-05', open: 100, max: 105, min: 99, close: 104, Trading_Volume: 1000 },
            { date: '2026-09-01', open: 90, max: 95, min: 89, close: 94, Trading_Volume: 800 },
            { date: '2026-09-03', open: 95, max: 98, min: 94, close: 97, Trading_Volume: 900 },
            { date: '2026-09-02', open: 92, max: 96, min: 91, close: 95, Trading_Volume: 850 },
            { date: '2026-09-04', open: 98, max: 101, min: 97, close: 100, Trading_Volume: 950 },
        ];

        const result = normalizeHistoricalBars(rawBars);

        assert.equal(result.bars.length, 5);
        assert.equal(result.dataComplete, true);
        assert.equal(result.bars[0].date, '2026-09-01');
        assert.equal(result.bars[1].date, '2026-09-02');
        assert.equal(result.bars[2].date, '2026-09-03');
        assert.equal(result.bars[3].date, '2026-09-04');
        assert.equal(result.bars[4].date, '2026-09-05');
    });

    test('2. 重複日期去除 (Duplicate Removal)', () => {
        const rawBars = [
            { date: '2026-09-01', open: 100, max: 105, min: 99, close: 104, Trading_Volume: 1000 },
            { date: '2026-09-01', open: 100, max: 106, min: 98, close: 105, Trading_Volume: 1100 }, // Duplicate
            { date: '2026-09-02', open: 104, max: 108, min: 103, close: 107, Trading_Volume: 1200 },
            { date: '2026-09-03', open: 107, max: 110, min: 106, close: 109, Trading_Volume: 1300 },
            { date: '2026-09-04', open: 109, max: 112, min: 108, close: 111, Trading_Volume: 1400 },
            { date: '2026-09-05', open: 111, max: 115, min: 110, close: 114, Trading_Volume: 1500 },
        ];

        const result = normalizeHistoricalBars(rawBars);

        assert.equal(result.totalRawBarsCount, 6);
        assert.equal(result.duplicateBarsDroppedCount, 1);
        assert.equal(result.bars.length, 5);
        // 第一筆保留
        assert.equal(result.bars[0].high, 105);
    });

    test('3. 多來源欄位映射 (OHLCV Mapping)', () => {
        // 測試 TWSE OpenAPI / TPEX OpenAPI / StockData 不同的欄位命名
        const rawBars = [
            { date: '113/09/01', open: '100', max: '105', min: '98', close: '103', Trading_Volume: '1000' }, // ROC 民國年
            { Date: '2024-09-02', Open: 103, High: 107, Low: 102, Close: 106, Volume: 1100 }, // OpenAPI 大寫
            { dateStr: '2024-09-03', OpeningPrice: 106, HighestPrice: 110, LowestPrice: 105, ClosingPrice: 109, TradeVolume: 1200 }, // TWSE API
            { date: '2024-09-04', open: 109, max: 112, min: 108, close: 111, Trading_Volume: 1300 },
            { date: '2024-09-05', open: 111, max: 116, min: 110, close: 115, Trading_Volume: 1400 },
        ];

        const result = normalizeHistoricalBars(rawBars);

        assert.equal(result.bars.length, 5);
        assert.equal(result.dataComplete, true);
        assert.equal(result.bars[0].date, '2024-09-01'); // 113年 -> 2024年
        assert.equal(result.bars[0].open, 100);
        assert.equal(result.bars[0].high, 105);
        assert.equal(result.bars[0].low, 98);
        assert.equal(result.bars[0].close, 103);
        assert.equal(result.bars[0].volume, 1000);

        assert.equal(result.bars[1].date, '2024-09-02');
        assert.equal(result.bars[1].high, 107);
        assert.equal(result.bars[2].date, '2024-09-03');
        assert.equal(result.bars[2].high, 110);
    });

    test('4. 缺失資料過濾', () => {
        const rawBars = [
            { date: '2026-09-01', open: 100, max: 105, min: 99, close: 104, Trading_Volume: 1000 },
            { date: '2026-09-02', open: null, max: 105, min: 99, close: 104, Trading_Volume: 1000 }, // 缺 open
            { date: '2026-09-03', open: 100, max: '--', min: 99, close: 104, Trading_Volume: 1000 }, // 缺 max
            { date: '', open: 100, max: 105, min: 99, close: 104, Trading_Volume: 1000 }, // 缺 date
            { date: '2026-09-05', open: 100, max: 105, min: 99, close: 104, Trading_Volume: 1000 },
        ];

        const result = normalizeHistoricalBars(rawBars);

        assert.equal(result.totalRawBarsCount, 5);
        assert.equal(result.invalidBarsDroppedCount, 3);
        assert.equal(result.bars.length, 2);
    });

    test('5. 非法數值過濾 (<=0, NaN, Corrupted High < Low)', () => {
        const rawBars = [
            { date: '2026-09-01', open: 100, max: 105, min: 99, close: 104, Trading_Volume: 1000 },
            { date: '2026-09-02', open: 0, max: 105, min: 99, close: 104, Trading_Volume: 1000 }, // open <= 0
            { date: '2026-09-03', open: 100, max: 90, min: 99, close: 104, Trading_Volume: 1000 }, // high < low 邏輯錯誤
            { date: '2026-09-04', open: 100, max: 105, min: 99, close: -10, Trading_Volume: 1000 }, // close < 0
            { date: '2026-09-05', open: 100, max: 105, min: 99, close: 104, Trading_Volume: 1000 },
        ];

        const result = normalizeHistoricalBars(rawBars);

        assert.equal(result.invalidBarsDroppedCount, 3);
        assert.equal(result.bars.length, 2);
    });

    test('6. 不足 5 個交易日 (dataComplete: false)', () => {
        const rawBars = [
            { date: '2026-09-01', open: 100, max: 105, min: 99, close: 104, Trading_Volume: 1000 },
            { date: '2026-09-02', open: 104, max: 108, min: 103, close: 107, Trading_Volume: 1200 },
            { date: '2026-09-03', open: 107, max: 110, min: 106, close: 109, Trading_Volume: 1300 },
        ]; // 僅 3 天

        const result = normalizeHistoricalBars(rawBars);

        assert.equal(result.bars.length, 3);
        assert.equal(result.dataComplete, false); // 不滿 5 天應為 false
    });
});
