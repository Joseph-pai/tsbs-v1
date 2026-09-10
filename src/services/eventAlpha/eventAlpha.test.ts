import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { EventAlphaItem, RawEventInput } from './eventTypes';
import { validateEventAlphaItem, computeRawContentHash } from './eventSchema';
import { normalizeEventInput, normalizeEventBatch } from './eventNormalizer';

describe('Event Alpha Data Structure & Normalizer Unit Tests', () => {

    test('1. validateEventAlphaItem 完整欄位校驗通過', () => {
        const validItem: EventAlphaItem = {
            eventId: 'evt_2330_001',
            stockId: '2330',
            eventType: 'earnings',
            sourceType: 'news',
            title: '台積電 Q3 營收創歷史新高',
            publishedAt: '2026-09-10T12:00:00.000Z',
            url: 'https://example.com/news/123',
            sentiment: 'bullish',
            impactScore: 0.85,
            confidence: 0.95,
            rawContentHash: 'a1b2c3d4e5f6',
            extractedAt: '2026-09-10T12:05:00.000Z',
        };

        const result = validateEventAlphaItem(validItem);
        assert.equal(result.valid, true);
        assert.equal(result.errors.length, 0);
        assert.ok(result.item);
        assert.equal(result.item?.stockId, '2330');
        assert.equal(result.item?.eventType, 'earnings');
    });

    test('2. validateEventAlphaItem 攔截非法類型與無效範圍', () => {
        const invalidItem = {
            eventId: '',
            stockId: '2330',
            eventType: 'invalid_type', // 非法 eventType
            sourceType: 'news',
            title: '測試新聞',
            publishedAt: 'invalid-date', // 非法日期
            url: 'https://example.com',
            sentiment: 'bullish',
            impactScore: 5.0,  // 超過 +1.0 範圍
            confidence: -0.5, // 小於 0.0 範圍
            rawContentHash: '12345',
            extractedAt: '2026-09-10T12:00:00Z',
        };

        const result = validateEventAlphaItem(invalidItem);
        assert.equal(result.valid, false);
        assert.ok(result.errors.length >= 4);
    });

    test('3. computeRawContentHash 生成一致之 SHA-256 雜湊碼', () => {
        const content = '台積電宣布擴建 2nm 晶圓廠';
        const hash1 = computeRawContentHash(content);
        const hash2 = computeRawContentHash(content);

        assert.equal(hash1.length, 64); // SHA-256 hex長度
        assert.equal(hash1, hash2);
        assert.equal(computeRawContentHash(''), '');
    });

    test('4. normalizeEventInput 正常清洗並補充預設值', () => {
        const rawInput: RawEventInput = {
            stockId: '2454',
            title: ' 聯發科推出最新 5G 旗艦晶片  ',
            content: '聯發科今日發表高階天璣晶片...',
            publishedAt: '2026-09-11 10:00:00',
            impactScore: 1.5, // 超出界限，應自動修剪至 1.0
            confidence: 0.9,
        };

        const item = normalizeEventInput(rawInput);
        assert.equal(item.stockId, '2454');
        assert.equal(item.title, '聯發科推出最新 5G 旗艦晶片');
        assert.equal(item.eventType, 'other'); // 預設值
        assert.equal(item.sentiment, 'unknown'); // 預設值
        assert.equal(item.impactScore, 1.0); // 修剪上限
        assert.equal(item.confidence, 0.9);
        assert.ok(item.rawContentHash.length === 64);
        assert.ok(item.publishedAt.endsWith('Z'));
    });

    test('5. normalizeEventBatch 正確進行批次處理與重覆排重', () => {
        const batchInputs: RawEventInput[] = [
            {
                eventId: 'evt_1',
                stockId: '2330',
                title: '新聞 A',
                content: '內文 A',
                eventType: 'revenue',
            },
            {
                eventId: 'evt_1', // 重複 ID
                stockId: '2330',
                title: '新聞 A 副本',
                content: '內文 A 副本',
                eventType: 'revenue',
            },
            {
                eventId: 'evt_2',
                stockId: '2330',
                title: '新聞 A 同內文',
                content: '內文 A', // 重複 Content Hash
                eventType: 'revenue',
            },
            {
                eventId: 'evt_3',
                stockId: '2308',
                title: '台達電擴產',
                content: '台達電宣布泰國新廠動工',
                eventType: 'factory',
            },
        ];

        const normalized = normalizeEventBatch(batchInputs);
        assert.equal(normalized.length, 2); // 應排重過濾剩 2 筆
        assert.equal(normalized[0].eventId, 'evt_1');
        assert.equal(normalized[1].eventId, 'evt_3');
        assert.equal(normalized[1].eventType, 'factory');
    });
});
