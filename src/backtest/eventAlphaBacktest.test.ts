import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
    isEventAvailableOnSignalDate,
    getAvailableEventsForSignal,
    computeMaxDrawdown,
    runEventAlphaABBacktest,
    generateEventAlphaBacktestMarkdown,
} from './eventAlphaBacktest';
import { PredictionLedgerItem } from './types';
import { EventAlphaItem } from '@/services/eventAlpha/eventTypes';

describe('Event Alpha A/B Backtest Unit Tests', () => {

    // =============================================
    // 測試 Helper Data
    // =============================================
    const makeSignal = (overrides: Partial<PredictionLedgerItem>): PredictionLedgerItem => ({
        id: '2330_2026-09-01',
        signalDate: '2026-09-01',
        stockId: '2330',
        stockName: '台積電',
        market: 'TWSE',
        signalClose: 1000,
        score: 0.8,
        rank: 1,
        reasons: ['BREAKOUT'],
        targetPrice: 1100,
        day1High: 1010, day2High: 1050, day3High: 1120, day4High: 1080, day5High: 1090,
        maxHigh: 1120,
        maxReturn: 0.12,
        hit5d10: true,
        daysToTarget: 3,
        dataComplete: true,
        ...overrides,
    });

    const makeEvent = (overrides: Partial<EventAlphaItem>): EventAlphaItem => ({
        eventId: 'evt_2330_001',
        stockId: '2330',
        eventType: 'earnings',
        sourceType: 'announcement',
        title: '台積電 Q3 財報超預期',
        publishedAt: '2026-08-31T22:00:00Z', // D 日前一晚
        url: 'https://example.com/news/1',
        sentiment: 'bullish',
        impactScore: 0.8,
        confidence: 0.9,
        rawContentHash: 'abc123',
        extractedAt: '2026-08-31T22:05:00Z',
        ...overrides,
    });

    // =============================================
    // Test 1: Future Leakage 防護
    // =============================================
    test('1. isEventAvailableOnSignalDate 正確判斷 Future Leakage', () => {
        const signalDate = '2026-09-01';

        // 盤前發布 (D-1 晚上) -> 可用
        const preMarketEvent = makeEvent({ publishedAt: '2026-08-31T22:00:00Z' });
        assert.equal(isEventAvailableOnSignalDate(preMarketEvent, signalDate), true);

        // D 日開盤前一秒 (00:59:59 UTC = 08:59:59 CST) -> 可用
        const justBeforeOpen = makeEvent({ publishedAt: '2026-09-01T00:59:59Z' });
        assert.equal(isEventAvailableOnSignalDate(justBeforeOpen, signalDate), true);

        // D 日開盤 (01:00:00 UTC = 09:00:00 CST) -> 不可用 (盤中)
        const atOpen = makeEvent({ publishedAt: '2026-09-01T01:00:00Z' });
        assert.equal(isEventAvailableOnSignalDate(atOpen, signalDate), false);

        // D 日盤後 -> 不可用 (Future Leakage)
        const afterClose = makeEvent({ publishedAt: '2026-09-01T08:00:00Z' });
        assert.equal(isEventAvailableOnSignalDate(afterClose, signalDate), false);

        // D+1 -> 絕對不可用
        const nextDay = makeEvent({ publishedAt: '2026-09-02T00:00:00Z' });
        assert.equal(isEventAvailableOnSignalDate(nextDay, signalDate), false);
    });

    // =============================================
    // Test 2: getAvailableEventsForSignal 篩選合規事件
    // =============================================
    test('2. getAvailableEventsForSignal 嚴格過濾未來事件與過期事件', () => {
        const signalDate = '2026-09-05';
        const events: EventAlphaItem[] = [
            makeEvent({ eventId: 'e1', stockId: '2330', publishedAt: '2026-09-04T20:00:00Z' }),  // 可用 (D-1)
            makeEvent({ eventId: 'e2', stockId: '2330', publishedAt: '2026-09-05T05:00:00Z' }),  // 不可用 (D 日盤中)
            makeEvent({ eventId: 'e3', stockId: '2330', publishedAt: '2026-08-20T00:00:00Z' }),  // 太舊 (lookback 7天外)
            makeEvent({ eventId: 'e4', stockId: '2317', publishedAt: '2026-09-04T20:00:00Z' }),  // 不同股票
        ];

        const available = getAvailableEventsForSignal('2330', signalDate, events, 7);
        assert.equal(available.length, 1);
        assert.equal(available[0].eventId, 'e1');
    });

    // =============================================
    // Test 3: computeMaxDrawdown 最大回撤計算
    // =============================================
    test('3. computeMaxDrawdown 最大回撤計算正確性', () => {
        const items: PredictionLedgerItem[] = [
            makeSignal({ maxReturn: 0.10, dataComplete: true }),
            makeSignal({ maxReturn: 0.15, dataComplete: true }),
            makeSignal({ maxReturn: 0.05, dataComplete: true }), // 從 0.15 降到 0.05 = 0.10 drawdown
        ];

        const dd = computeMaxDrawdown(items);
        assert.equal(dd, 0.1);
    });

    // =============================================
    // Test 4: runEventAlphaABBacktest 完整 A/B 執行
    // =============================================
    test('4. runEventAlphaABBacktest 完整執行並產出合規結論', () => {
        const controlLedger: PredictionLedgerItem[] = [
            makeSignal({ id: 'c1', stockId: '2330', signalDate: '2026-09-01', hit5d10: false, maxReturn: 0.05 }),
            makeSignal({ id: 'c2', stockId: '2330', signalDate: '2026-09-02', hit5d10: false, maxReturn: 0.04 }),
        ];

        const treatmentLedger: PredictionLedgerItem[] = [
            makeSignal({ id: 't1', stockId: '2330', signalDate: '2026-09-01', hit5d10: true, maxReturn: 0.12 }),
            makeSignal({ id: 't2', stockId: '2330', signalDate: '2026-09-02', hit5d10: true, maxReturn: 0.11 }),
        ];

        const events: EventAlphaItem[] = [
            makeEvent({ eventId: 'e1', stockId: '2330', publishedAt: '2026-08-31T20:00:00Z' }),
            makeEvent({ eventId: 'e2', stockId: '2330', publishedAt: '2026-09-01T20:00:00Z' }),
        ];

        const result = runEventAlphaABBacktest({ controlLedger, treatmentLedger, eventItems: events });

        // 結論必須是合規的兩選一
        assert.ok(
            result.conclusion === 'Event Alpha 有證據支持' ||
            result.conclusion === 'Event Alpha 暫無證據支持'
        );
        assert.equal(result.futureLeakageGuardActive, true);
        assert.ok(result.conclusionReasons.length > 0);
    });

    // =============================================
    // Test 5: generateEventAlphaBacktestMarkdown 合規報告生成
    // =============================================
    test('5. generateEventAlphaBacktestMarkdown 合規標題與禁用詞彙檢查', () => {
        const mockResult = {
            controlMetrics: {
                totalSignals: 5, validSignals: 5, hitSignals: 2, missSignals: 3,
                incompleteSignals: 0, hitRate5d10: 0.4, day1HitRate: 0.1,
                day2HitRate: 0.1, day3HitRate: 0.1, day4HitRate: 0.05, day5HitRate: 0.05,
                averageMaxReturn: 0.08, medianMaxReturn: 0.07, averageDaysToTarget: 2.5,
                maxDrawdown: 0.05, sampleSize: 5,
            },
            treatmentMetrics: {
                totalSignals: 3, validSignals: 3, hitSignals: 2, missSignals: 1,
                incompleteSignals: 0, hitRate5d10: 0.67, day1HitRate: 0.1,
                day2HitRate: 0.1, day3HitRate: 0.3, day4HitRate: 0.1, day5HitRate: 0.07,
                averageMaxReturn: 0.11, medianMaxReturn: 0.10, averageDaysToTarget: 2.0,
                maxDrawdown: 0.03, sampleSize: 3,
            },
            differentials: {
                hitRate5d10Delta: 0.27, avgMaxReturnDelta: 0.03,
                medianMaxReturnDelta: 0.03, avgDaysToTargetDelta: -0.5,
            },
            groupAnalysis: { byEventType: {}, bySourceType: {}, byConfidenceTier: {} },
            conclusion: 'Event Alpha 暫無證據支持' as const,
            conclusionReasons: ['Treatment 組有效樣本數 (3) 不足 10 筆，證據不充分'],
            analysisDate: '2026-09-11',
            futureLeakageGuardActive: true,
        };

        const md = generateEventAlphaBacktestMarkdown(mockResult);

        assert.ok(md.includes('Event Alpha A/B Backtest Report'));
        assert.ok(md.includes('Future Leakage Guard'));
        assert.equal(md.includes('保證提高準確率'), false);
        assert.equal(md.includes('成功率'), false);
        assert.ok(md.includes('研究聲明 (Research Disclaimer)'));
    });
});
