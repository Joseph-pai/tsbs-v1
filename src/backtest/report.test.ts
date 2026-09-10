import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
    generateTextReport,
    generateJSONReport,
    generateCSVReport,
    sanitizeReportText
} from './report';
import { BacktestSummaryMetrics } from './backtestEngine';
import { PredictionLedgerItem } from './types';

describe('Backtest Report Generator & Compliance Unit Tests', () => {

    const sampleMetrics: BacktestSummaryMetrics = {
        totalSignals: 10,
        validSignals: 8,
        hitSignals: 6,
        missSignals: 2,
        incompleteSignals: 2,
        hitRate5d10: 0.75,
        day1HitRate: 0.25,
        day2HitRate: 0.25,
        day3HitRate: 0.125,
        day4HitRate: 0.125,
        day5HitRate: 0.0,
        averageMaxReturn: 0.125,
        medianMaxReturn: 0.11,
        averageDaysToTarget: 2.0,
    };

    const sampleLedgerItems: PredictionLedgerItem[] = [
        {
            id: '2026-09-01_2330',
            signalDate: '2026-09-01',
            stockId: '2330',
            stockName: '台積電',
            market: 'TWSE',
            signalClose: 1000,
            score: 85,
            rank: 1,
            reasons: ['VOLUME_EXPLOSION'],
            targetPrice: 1100,
            day1High: 1020,
            day2High: 1050,
            day3High: 1110,
            day4High: 1080,
            day5High: 1090,
            maxHigh: 1110,
            maxReturn: 0.11,
            hit5d10: true,
            daysToTarget: 3,
            dataComplete: true,
        }
    ];

    test('1. generateTextReport 包含 Historical Backtest Result 標頭與全部必要欄位', () => {
        const report = generateTextReport(sampleMetrics, {
            startDate: '2026-03-01',
            endDate: '2026-09-10',
            stocksCount: 10,
        });

        assert.equal(report.includes('Historical Backtest Result'), true);
        assert.equal(report.includes('測試期間 (Test Period): 2026-03-01 ~ 2026-09-10'), true);
        assert.equal(report.includes('股票數量 (Stocks Count): 10'), true);
        assert.equal(report.includes('訊號數量 (Total Signals): 10'), true);
        assert.equal(report.includes('有效樣本數 (Valid Signals): 8'), true);
        assert.equal(report.includes('資料不足數量 (Incomplete Signals): 2'), true);
        assert.equal(report.includes('5日 +10% 命中數 (Hit Signals): 6'), true);
        assert.equal(report.includes('5日 +10% 命中率 (Hit Rate): 75.00%'), true);
        assert.equal(report.includes('D+1 命中率 (D+1 Hit Rate): 25.00%'), true);
        assert.equal(report.includes('平均 5 日最大報酬 (Avg Max Return): 12.50%'), true);
        assert.equal(report.includes('中位數 5 日最大報酬 (Median Max Return): 11.00%'), true);
        assert.equal(report.includes('平均達標天數 (Avg Days to Target): 2.00 天'), true);
    });

    test('2. generateJSONReport 產出合法 JSON 且包含必要欄位', () => {
        const jsonStr = generateJSONReport(sampleMetrics, sampleLedgerItems, {
            startDate: '2026-03-01',
            endDate: '2026-09-10',
            stocksCount: 10,
        });

        const parsed = JSON.parse(jsonStr);
        assert.equal(parsed.title, 'Historical Backtest Result');
        assert.equal(parsed.summaryMetrics.validSignals, 8);
        assert.equal(parsed.summaryMetrics.hitRate5d10Formatted, '75.00%');
        assert.equal(parsed.items.length, 1);
        assert.equal(parsed.items[0].stockId, '2330');
    });

    test('3. generateCSVReport 產出合法 CSV 標頭與資料行', () => {
        const csvStr = generateCSVReport(sampleLedgerItems);
        const lines = csvStr.split('\n');

        assert.equal(lines[0].startsWith('id,signalDate,stockId'), true);
        assert.equal(lines[1].includes('"2026-09-01_2330"'), true);
        assert.equal(lines[1].includes('"台積電"'), true);
    });

    test('4. sanitizeReportText 嚴格攔截禁止詞彙 (成功率、保證、預測準確率、未來一定上漲)', () => {
        assert.doesNotThrow(() => sanitizeReportText('Historical Backtest Result: Hit Rate 75%'));

        assert.throws(() => sanitizeReportText('本策略歷史成功率高達 80%'), /forbidden word: "成功率"/);
        assert.throws(() => sanitizeReportText('收益保證獲利'), /forbidden word: "保證"/);
        assert.throws(() => sanitizeReportText('預測準確率 90%'), /forbidden word: "預測準確率"/);
        assert.throws(() => sanitizeReportText('未來一定上漲不虧損'), /forbidden word: "未來一定上漲"/);
    });
});
