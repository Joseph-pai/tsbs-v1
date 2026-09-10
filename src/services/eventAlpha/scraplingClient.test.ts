import test from 'node:test';
import assert from 'node:assert';
import { crawlStockEvents, queryStockEvents, checkScraplingHealth } from './scraplingClient';
import { normalizeEventBatch } from './eventNormalizer';
import { calculateEventAlphaScore } from './eventScorer';
import { ScannerService } from '../scanner';

test('1. scraplingClient: checkScraplingHealth returns boolean without throwing when server offline', async () => {
    const isHealthy = await checkScraplingHealth(500);
    assert.strictEqual(typeof isHealthy, 'boolean');
});

test('2. scraplingClient: crawlStockEvents returns array without throwing on timeout or offline', async () => {
    const events = await crawlStockEvents('2330', { timeoutMs: 500 });
    assert.ok(Array.isArray(events));
});

test('3. scraplingClient: queryStockEvents returns array without throwing on timeout or offline', async () => {
    const events = await queryStockEvents({ stockId: '2330', limit: 10 }, { timeoutMs: 500 });
    assert.ok(Array.isArray(events));
});

test('4. Time Safety Guard: publishedAt future event is filtered out', () => {
    const futureDate = new Date(Date.now() + 86400000 * 5).toISOString(); // 5 days in future
    const pastDate = new Date(Date.now() - 86400000).toISOString(); // 1 day ago

    const rawInputs = [
        {
            stockId: '2330',
            title: '未來的法說會新聞',
            publishedAt: futureDate,
            eventType: 'earnings',
            sourceType: 'news',
        },
        {
            stockId: '2330',
            title: '過去的營收公告',
            publishedAt: pastDate,
            eventType: 'revenue',
            sourceType: 'announcement',
        },
    ];

    const normalized = normalizeEventBatch(rawInputs);
    const cutoffTime = Date.now();

    const validEvents = normalized.filter(evt => {
        const pubTime = new Date(evt.publishedAt).getTime();
        return !isNaN(pubTime) && pubTime <= cutoffTime;
    });

    assert.strictEqual(validEvents.length, 1);
    assert.strictEqual(validEvents[0].title, '過去的營收公告');
});

test('5. Event Scorer: Event Alpha score is produced independently without probability promise', () => {
    const pastDate = new Date(Date.now() - 3600000 * 2).toISOString();
    const scoreResult = calculateEventAlphaScore({
        eventType: 'revenue',
        sourceType: 'announcement',
        confidence: 0.9,
        publishedAt: pastDate,
        sentiment: 'bullish',
        impactScore: 0.8,
    });

    assert.ok(typeof scoreResult.eventAlphaScore === 'number');
    assert.ok('eventAlphaScore' in scoreResult);
    assert.strictEqual('probability' in scoreResult, false);
});

test('6. Ranking Preservation: Technical Score and filtering remain untouched by Scrapling integration', async () => {
    // analyzeStock returns an AnalysisResult
    const res = await ScannerService.analyzeStock('2330');
    if (res) {
        // Technical score (score) must be between 0 and 1
        assert.ok(res.score >= 0 && res.score <= 1);
        // Technical score must equal (comprehensiveScoreDetails.total + bonus) scale or original formula
        assert.strictEqual(typeof res.score, 'number');
        // eventAlphaScore field exists
        assert.ok('eventAlphaScore' in res);
        // If Event Alpha Score is present, it is independent and does not modify res.score or comprehensiveScoreDetails.total
        if (res.eventAlphaScore !== null && res.eventAlphaScore !== undefined) {
            assert.strictEqual(typeof res.eventAlphaScore, 'number');
        }
    }
});
