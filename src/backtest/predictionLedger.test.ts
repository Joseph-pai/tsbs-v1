import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
    createPredictionLedgerEntry,
    validatePredictionLedgerItem,
    PredictionLedgerStore
} from './predictionLedger';

describe('Prediction Ledger Unit Tests', () => {

    test('1. 完整建立 5 日 Prediction Ledger Item 且包含所有必要欄位', () => {
        const signalDate = '2026-09-01';
        const stockId = '2330';
        const stockName = '台積電';
        const market = 'TWSE';
        const signalClose = 1000;
        const score = 85;
        const rank = 1;
        const reasons = ['VOLUME_EXPLOSION', 'MA_SQUEEZE'];
        const futureBars = [
            { date: '2026-09-02', open: 1000, high: 1020, low: 990, close: 1010, volume: 1000 },
            { date: '2026-09-03', open: 1010, high: 1050, low: 1000, close: 1040, volume: 1100 },
            { date: '2026-09-04', open: 1040, high: 1110, low: 1030, close: 1100, volume: 1200 }, // D+3 Hit (+10% => 1100)
            { date: '2026-09-05', open: 1070, high: 1080, low: 1050, close: 1060, volume: 1300 },
            { date: '2026-09-06', open: 1060, high: 1090, low: 1050, close: 1080, volume: 1400 },
        ];

        const entry = createPredictionLedgerEntry({
            signalDate,
            stockId,
            stockName,
            market,
            signalClose,
            score,
            rank,
            reasons,
            futureBars,
        });

        assert.equal(entry.id, '2026-09-01_2330');
        assert.equal(entry.signalDate, '2026-09-01');
        assert.equal(entry.stockId, '2330');
        assert.equal(entry.stockName, '台積電');
        assert.equal(entry.market, 'TWSE');
        assert.equal(entry.signalClose, 1000);
        assert.equal(entry.score, 85);
        assert.equal(entry.rank, 1);
        assert.deepEqual(entry.reasons, ['VOLUME_EXPLOSION', 'MA_SQUEEZE']);
        assert.equal(entry.targetPrice, 1100);

        assert.equal(entry.day1High, 1020);
        assert.equal(entry.day2High, 1050);
        assert.equal(entry.day3High, 1110);
        assert.equal(entry.day4High, 1080);
        assert.equal(entry.day5High, 1090);

        assert.equal(entry.maxHigh, 1110);
        assert.equal(entry.maxReturn, 0.11);
        assert.equal(entry.hit5d10, true);
        assert.equal(entry.daysToTarget, 3);
        assert.equal(entry.dataComplete, true);

        // 驗證生成的 Item 符合型態驗證
        assert.equal(validatePredictionLedgerItem(entry), true);
    });

    test('2. 未滿 5 個交易日資料補 null 與 dataComplete 標示', () => {
        const signalDate = '2026-09-01';
        const futureBars = [
            { date: '2026-09-02', open: 100, high: 102, low: 99, close: 101, volume: 1000 },
            { date: '2026-09-03', open: 101, high: 105, low: 100, close: 104, volume: 1100 },
            { date: '2026-09-04', open: 104, high: 108, low: 103, close: 107, volume: 1200 },
            // 只有 3 天
        ];

        const entry = createPredictionLedgerEntry({
            signalDate,
            stockId: '2317',
            stockName: '鴻海',
            market: 'TWSE',
            signalClose: 100,
            score: 75,
            rank: 2,
            reasons: 'BREAKOUT',
            futureBars,
        });

        assert.equal(entry.day1High, 102);
        assert.equal(entry.day2High, 105);
        assert.equal(entry.day3High, 108);
        assert.equal(entry.day4High, null);
        assert.equal(entry.day5High, null);
        assert.equal(entry.dataComplete, false);
        assert.deepEqual(entry.reasons, ['BREAKOUT']);
        assert.equal(validatePredictionLedgerItem(entry), true);
    });

    test('3. validatePredictionLedgerItem 型態驗證器過濾非法資料', () => {
        const validItem = {
            id: '2026-09-01_2330',
            signalDate: '2026-09-01',
            stockId: '2330',
            stockName: '台積電',
            market: 'TWSE',
            signalClose: 1000,
            score: 90,
            rank: 1,
            reasons: ['DISCOVERY'],
            targetPrice: 1100,
            day1High: 1020,
            day2High: 1030,
            day3High: 1040,
            day4High: 1050,
            day5High: 1060,
            maxHigh: 1060,
            maxReturn: 0.06,
            hit5d10: false,
            daysToTarget: null,
            dataComplete: true,
        };

        assert.equal(validatePredictionLedgerItem(validItem), true);

        // 無效情況測試
        assert.equal(validatePredictionLedgerItem(null), false);
        assert.equal(validatePredictionLedgerItem({ ...validItem, signalClose: -10 }), false);
        assert.equal(validatePredictionLedgerItem({ ...validItem, signalDate: '2026/09/01' }), false); // 日期格式錯
        assert.equal(validatePredictionLedgerItem({ ...validItem, rank: 0 }), false); // rank < 1
        assert.equal(validatePredictionLedgerItem({ ...validItem, reasons: 'not an array' }), false);
    });

    test('4. PredictionLedgerStore 操作 (add, get, getAll, clear)', () => {
        const store = new PredictionLedgerStore();
        assert.equal(store.getAll().length, 0);

        const entry1 = createPredictionLedgerEntry({
            signalDate: '2026-09-01',
            stockId: '2330',
            stockName: '台積電',
            market: 'TWSE',
            signalClose: 1000,
            score: 90,
            rank: 1,
            reasons: ['TAG1'],
            futureBars: [
                { date: '2026-09-02', open: 1000, high: 1010, low: 990, close: 1005, volume: 1000 },
                { date: '2026-09-03', open: 1005, high: 1020, low: 1000, close: 1015, volume: 1000 },
                { date: '2026-09-04', open: 1015, high: 1030, low: 1010, close: 1025, volume: 1000 },
                { date: '2026-09-05', open: 1025, high: 1040, low: 1020, close: 1035, volume: 1000 },
                { date: '2026-09-06', open: 1035, high: 1050, low: 1030, close: 1045, volume: 1000 },
            ],
        });

        const success = store.add(entry1);
        assert.equal(success, true);
        assert.equal(store.getAll().length, 1);

        const fetched = store.get('2026-09-01_2330');
        assert.equal(fetched?.stockName, '台積電');

        store.clear();
        assert.equal(store.getAll().length, 0);
    });
});
