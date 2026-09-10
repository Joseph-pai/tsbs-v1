import crypto from 'crypto';
import { EventAlphaItem, EventType, EventSourceType, EventSentiment } from './eventTypes';

export const VALID_EVENT_TYPES: EventType[] = [
    'earnings',
    'revenue',
    'contract',
    'product',
    'capacity',
    'factory',
    'investment',
    'management',
    'institutional',
    'industry',
    'regulation',
    'other',
];

export const VALID_SOURCE_TYPES: EventSourceType[] = [
    'news',
    'filing',
    'announcement',
    'report',
    'social',
    'other',
];

export const VALID_SENTIMENTS: EventSentiment[] = [
    'bullish',
    'bearish',
    'neutral',
    'unknown',
];

/**
 * 計算文章原文之 SHA-256 雜湊碼 (用於校驗與排重)
 */
export function computeRawContentHash(content: string): string {
    if (!content) return '';
    return crypto.createHash('sha256').update(content.trim()).digest('hex');
}

export interface ValidationResult {
    valid: boolean;
    errors: string[];
    item?: EventAlphaItem;
}

/**
 * 驗證 EventAlphaItem 物件之欄位正確性
 */
export function validateEventAlphaItem(data: unknown): ValidationResult {
    const errors: string[] = [];

    if (!data || typeof data !== 'object') {
        return { valid: false, errors: ['資料必須是非 Null 之物件'] };
    }

    const item = data as Record<string, unknown>;

    // 1. eventId
    if (typeof item.eventId !== 'string' || item.eventId.trim() === '') {
        errors.push('eventId 必須是非空字串');
    }

    // 2. stockId
    if (typeof item.stockId !== 'string' || item.stockId.trim() === '') {
        errors.push('stockId 必須是非空字串');
    }

    // 3. eventType
    if (typeof item.eventType !== 'string' || !VALID_EVENT_TYPES.includes(item.eventType as EventType)) {
        errors.push(`eventType 必須為有效類型 (${VALID_EVENT_TYPES.join(', ')})`);
    }

    // 4. sourceType
    if (typeof item.sourceType !== 'string' || !VALID_SOURCE_TYPES.includes(item.sourceType as EventSourceType)) {
        errors.push(`sourceType 必須為有效來源 (${VALID_SOURCE_TYPES.join(', ')})`);
    }

    // 5. title
    if (typeof item.title !== 'string' || item.title.trim() === '') {
        errors.push('title 必須是非空字串');
    }

    // 6. publishedAt (ISO 8601)
    if (typeof item.publishedAt !== 'string' || isNaN(Date.parse(item.publishedAt))) {
        errors.push('publishedAt 必須是合法的 ISO 8601 日期字串');
    }

    // 7. url
    if (typeof item.url !== 'string') {
        errors.push('url 必須是字串');
    }

    // 8. sentiment
    if (typeof item.sentiment !== 'string' || !VALID_SENTIMENTS.includes(item.sentiment as EventSentiment)) {
        errors.push(`sentiment 必須為有效情緒 (${VALID_SENTIMENTS.join(', ')})`);
    }

    // 9. impactScore (-1.0 ~ +1.0)
    if (typeof item.impactScore !== 'number' || isNaN(item.impactScore) || item.impactScore < -1.0 || item.impactScore > 1.0) {
        errors.push('impactScore 必須是介於 -1.0 到 +1.0 之間的數值');
    }

    // 10. confidence (0.0 ~ 1.0)
    if (typeof item.confidence !== 'number' || isNaN(item.confidence) || item.confidence < 0.0 || item.confidence > 1.0) {
        errors.push('confidence 必須是介於 0.0 到 1.0 之間的數值');
    }

    // 11. rawContentHash
    if (typeof item.rawContentHash !== 'string') {
        errors.push('rawContentHash 必須是字串');
    }

    // 12. extractedAt (ISO 8601)
    if (typeof item.extractedAt !== 'string' || isNaN(Date.parse(item.extractedAt))) {
        errors.push('extractedAt 必須是合法的 ISO 8601 日期字串');
    }

    if (errors.length > 0) {
        return { valid: false, errors };
    }

    return {
        valid: true,
        errors: [],
        item: data as EventAlphaItem,
    };
}
