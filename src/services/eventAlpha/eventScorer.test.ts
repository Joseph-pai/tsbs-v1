import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { calculateEventAlphaScore, calculateTimeDecayFactor, EventScoreInput } from './eventScorer';

describe('Event Alpha Scorer Unit Tests', () => {

    test('1. calculateTimeDecayFactor 時間衰減計算', () => {
        const now = new Date('2026-09-11T00:00:00Z').getTime();

        // 10 小時前發布
        const recentStr = new Date(now - 10 * 3600 * 1000).toISOString();
        assert.equal(calculateTimeDecayFactor(recentStr, '2026-09-11T00:00:00Z'), 1.0);

        // 48 小時前發布
        const twoDaysAgo = new Date(now - 48 * 3600 * 1000).toISOString();
        assert.equal(calculateTimeDecayFactor(twoDaysAgo, '2026-09-11T00:00:00Z'), 0.8);

        // 10 天前發布
        const tenDaysAgo = new Date(now - 10 * 24 * 3600 * 1000).toISOString();
        assert.equal(calculateTimeDecayFactor(tenDaysAgo, '2026-09-11T00:00:00Z'), 0.2);
    });

    test('2. 歷史證據不足 (sampleSize < 5) 時強制降階 confidence 並標示 insufficientEvidence', () => {
        const inputWithoutEvidence: EventScoreInput = {
            eventType: 'earnings',
            sourceType: 'announcement',
            confidence: 0.9, // 高初始信心度
            publishedAt: '2026-09-11T00:00:00Z',
            sentiment: 'bullish',
            impactScore: 0.8,
            historicalEvidence: {
                sampleSize: 2, // 樣本數僅 2 筆 (不足 5 筆)
            }
        };

        const result = calculateEventAlphaScore(inputWithoutEvidence, '2026-09-11T00:00:00Z');

        assert.equal(result.insufficientEvidence, true);
        assert.equal(result.adjustedConfidence, 0.3); // 強制由 0.9 調降至 0.3
        assert.ok(result.scoreReasoning.some(r => r.includes('歷史證據不足')));
    });

    test('3. 歷史證據充足時保持信心度', () => {
        const inputWithSufficientEvidence: EventScoreInput = {
            eventType: 'revenue',
            sourceType: 'announcement',
            confidence: 0.85,
            publishedAt: '2026-09-11T00:00:00Z',
            sentiment: 'bullish',
            impactScore: 0.8,
            historicalEvidence: {
                sampleSize: 20, // 樣本數 20 筆 (>= 5)
                historicalHitRate: 0.65,
                avgMaxReturn: 0.12,
            }
        };

        const result = calculateEventAlphaScore(inputWithSufficientEvidence, '2026-09-11T00:00:00Z');

        assert.equal(result.insufficientEvidence, false);
        assert.equal(result.adjustedConfidence, 0.85); // 保持原始 0.85
        assert.ok(result.eventAlphaScore > 0);
    });

    test('4. 嚴格合規檢查：分數稱呼必須為 eventAlphaScore 且不可有上漲機率之宣稱', () => {
        const input: EventScoreInput = {
            eventType: 'contract',
            sourceType: 'news',
            confidence: 0.8,
            publishedAt: '2026-09-11T00:00:00Z',
            sentiment: 'bullish',
            impactScore: 0.9,
            historicalEvidence: { sampleSize: 10 }
        };

        const result = calculateEventAlphaScore(input, '2026-09-11T00:00:00Z');
        const jsonString = JSON.stringify(result);

        assert.ok('eventAlphaScore' in result);
        assert.equal(jsonString.includes('機率'), false);
        assert.equal(jsonString.includes('成功率'), false);
        assert.equal(jsonString.includes('保證'), false);
    });
});
