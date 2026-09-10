import { EventAlphaItem, RawEventInput, EventType, EventSourceType, EventSentiment } from './eventTypes';
import { computeRawContentHash, validateEventAlphaItem, VALID_EVENT_TYPES, VALID_SOURCE_TYPES, VALID_SENTIMENTS } from './eventSchema';

/**
 * 將原始爬取/數據介面輸入之 RawEventInput 標準化為 EventAlphaItem
 */
export function normalizeEventInput(input: RawEventInput): EventAlphaItem {
    const rawContent = input.content || input.title || '';
    const contentHash = input.rawContentHash || computeRawContentHash(rawContent);

    // 產生預設 eventId (以 stockId, timestamp, 雜湊值組合)
    const generatedId = input.eventId || `evt_${input.stockId}_${Date.now()}_${contentHash.substring(0, 8)}`;

    // 解析 publishedAt
    let publishedAtIso: string;
    if (input.publishedAt instanceof Date) {
        publishedAtIso = input.publishedAt.toISOString();
    } else if (typeof input.publishedAt === 'string' && !isNaN(Date.parse(input.publishedAt))) {
        publishedAtIso = new Date(input.publishedAt).toISOString();
    } else {
        publishedAtIso = new Date().toISOString();
    }

    // 解析 extractedAt
    let extractedAtIso: string;
    if (input.extractedAt instanceof Date) {
        extractedAtIso = input.extractedAt.toISOString();
    } else if (typeof input.extractedAt === 'string' && !isNaN(Date.parse(input.extractedAt))) {
        extractedAtIso = new Date(input.extractedAt).toISOString();
    } else {
        extractedAtIso = new Date().toISOString();
    }

    // 校驗類型預設值
    const eventType: EventType = (input.eventType && VALID_EVENT_TYPES.includes(input.eventType as EventType))
        ? (input.eventType as EventType)
        : 'other';

    const sourceType: EventSourceType = (input.sourceType && VALID_SOURCE_TYPES.includes(input.sourceType as EventSourceType))
        ? (input.sourceType as EventSourceType)
        : 'other';

    const sentiment: EventSentiment = (input.sentiment && VALID_SENTIMENTS.includes(input.sentiment as EventSentiment))
        ? (input.sentiment as EventSentiment)
        : 'unknown';

    // 限制數值範圍 (-1 ~ 1 for impactScore, 0 ~ 1 for confidence)
    let impactScore = typeof input.impactScore === 'number' ? input.impactScore : 0.0;
    impactScore = Math.max(-1.0, Math.min(1.0, impactScore));

    let confidence = typeof input.confidence === 'number' ? input.confidence : 0.5;
    confidence = Math.max(0.0, Math.min(1.0, confidence));

    const item: EventAlphaItem = {
        eventId: generatedId,
        stockId: String(input.stockId).trim(),
        eventType,
        sourceType,
        title: (input.title || '').trim(),
        publishedAt: publishedAtIso,
        url: (input.url || '').trim(),
        sentiment,
        impactScore: parseFloat(impactScore.toFixed(4)),
        confidence: parseFloat(confidence.toFixed(4)),
        rawContentHash: contentHash,
        extractedAt: extractedAtIso,
        ...(input.metadata ? { metadata: input.metadata } : {}),
    };

    return item;
}

/**
 * 批次標準化事件列表並進行去重 (Deduplication)
 */
export function normalizeEventBatch(inputs: RawEventInput[]): EventAlphaItem[] {
    if (!Array.isArray(inputs) || inputs.length === 0) {
        return [];
    }

    const seenIds = new Set<string>();
    const seenHashes = new Set<string>();
    const normalizedItems: EventAlphaItem[] = [];

    for (const raw of inputs) {
        if (!raw || !raw.stockId || !raw.title) {
            continue; // 跳過缺少核心識別資料的無效條目
        }

        const item = normalizeEventInput(raw);

        // 依據 eventId 與 rawContentHash 雙重關卡進行排重
        if (seenIds.has(item.eventId)) {
            continue;
        }

        if (item.rawContentHash && seenHashes.has(item.rawContentHash)) {
            continue;
        }

        const validation = validateEventAlphaItem(item);
        if (validation.valid && validation.item) {
            seenIds.add(item.eventId);
            if (item.rawContentHash) {
                seenHashes.add(item.rawContentHash);
            }
            normalizedItems.push(validation.item);
        }
    }

    return normalizedItems;
}
