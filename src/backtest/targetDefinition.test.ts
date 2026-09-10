import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { evaluate5D10PercentTarget } from './targetDefinition';

describe('evaluate5D10PercentTarget Unit Tests', () => {

    test('1. D+1 命中 Target (+10%)', () => {
        const signalClose = 100;
        const futureBars = [
            { date: '2026-09-01', high: 110.5 }, // D+1 hit (110.5 >= 110)
            { date: '2026-09-02', high: 102 },
            { date: '2026-09-03', high: 103 },
            { date: '2026-09-04', high: 104 },
            { date: '2026-09-05', high: 105 },
        ];

        const result = evaluate5D10PercentTarget(signalClose, futureBars);

        assert.equal(result.targetPrice, 110);
        assert.equal(result.hit5d10, true);
        assert.equal(result.daysToTarget, 1);
        assert.equal(result.maxHigh, 110.5);
        assert.equal(result.dataComplete, true);
        assert.equal(result.maxReturn, 0.105);
    });

    test('2. D+5 命中 Target (+10%)', () => {
        const signalClose = 100;
        const futureBars = [
            { date: '2026-09-01', high: 102 },
            { date: '2026-09-02', high: 104 },
            { date: '2026-09-03', high: 106 },
            { date: '2026-09-04', high: 108 },
            { date: '2026-09-05', high: 112 }, // D+5 hit
        ];

        const result = evaluate5D10PercentTarget(signalClose, futureBars);

        assert.equal(result.targetPrice, 110);
        assert.equal(result.hit5d10, true);
        assert.equal(result.daysToTarget, 5);
        assert.equal(result.maxHigh, 112);
        assert.equal(result.dataComplete, true);
        assert.equal(result.maxReturn, 0.12);
    });

    test('3. 完全沒有命中 Target', () => {
        const signalClose = 100;
        const futureBars = [
            { date: '2026-09-01', high: 101 },
            { date: '2026-09-02', high: 103 },
            { date: '2026-09-03', high: 105 },
            { date: '2026-09-04', high: 107 },
            { date: '2026-09-05', high: 109 }, // Max is 109 < 110
        ];

        const result = evaluate5D10PercentTarget(signalClose, futureBars);

        assert.equal(result.targetPrice, 110);
        assert.equal(result.hit5d10, false);
        assert.equal(result.daysToTarget, null);
        assert.equal(result.maxHigh, 109);
        assert.equal(result.dataComplete, true);
        assert.equal(result.maxReturn, 0.09);
    });

    test('4. High 剛好等於 target (110% 觸碰命中)', () => {
        const signalClose = 50; // targetPrice = 55
        const futureBars = [
            { date: '2026-09-01', high: 52 },
            { date: '2026-09-02', high: 54 },
            { date: '2026-09-03', high: 55 }, // High exactly 55
            { date: '2026-09-04', high: 53 },
            { date: '2026-09-05', high: 54 },
        ];

        const result = evaluate5D10PercentTarget(signalClose, futureBars);

        assert.equal(result.targetPrice, 55);
        assert.equal(result.hit5d10, true);
        assert.equal(result.daysToTarget, 3);
        assert.equal(result.maxHigh, 55);
        assert.equal(result.dataComplete, true);
        assert.equal(result.maxReturn, 0.1);
    });

    test('5. 資料不足 (未滿 5 個交易日)', () => {
        const signalClose = 100;
        const futureBars = [
            { date: '2026-09-01', high: 102 },
            { date: '2026-09-02', high: 104 },
            { date: '2026-09-03', high: 105 }, // 僅有 3 天
        ];

        const result = evaluate5D10PercentTarget(signalClose, futureBars);

        assert.equal(result.targetPrice, 110);
        assert.equal(result.hit5d10, false);
        assert.equal(result.daysToTarget, null);
        assert.equal(result.maxHigh, 105);
        assert.equal(result.dataComplete, false); // 資料不足標示為 false
    });

    test('6. signalClose <= 0 無效輸入', () => {
        const futureBars = [
            { date: '2026-09-01', high: 10 },
            { date: '2026-09-02', high: 12 },
            { date: '2026-09-03', high: 15 },
            { date: '2026-09-04', high: 18 },
            { date: '2026-09-05', high: 20 },
        ];

        const resZero = evaluate5D10PercentTarget(0, futureBars);
        assert.equal(resZero.targetPrice, 0);
        assert.equal(resZero.hit5d10, false);
        assert.equal(resZero.daysToTarget, null);
        assert.equal(resZero.dataComplete, false);

        const resNeg = evaluate5D10PercentTarget(-10, futureBars);
        assert.equal(resNeg.targetPrice, 0);
        assert.equal(resNeg.hit5d10, false);
        assert.equal(resNeg.daysToTarget, null);
        assert.equal(resNeg.dataComplete, false);
    });

    test('7. futureBars 日期順序錯誤', () => {
        const signalClose = 100;
        const futureBars = [
            { date: '2026-09-01', high: 102 },
            { date: '2026-09-05', high: 115 }, // 日期暴跳
            { date: '2026-09-03', high: 103 }, // 日期倒退
            { date: '2026-09-04', high: 104 },
            { date: '2026-09-06', high: 105 },
        ];

        const result = evaluate5D10PercentTarget(signalClose, futureBars);

        assert.equal(result.hit5d10, false);
        assert.equal(result.daysToTarget, null);
        assert.equal(result.dataComplete, false); // 判定日期異常，dataComplete 為 false
    });
});
