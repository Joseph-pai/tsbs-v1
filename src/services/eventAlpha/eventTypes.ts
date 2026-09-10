/**
 * Event Alpha 型態定義
 * 純資料層結構，與 Technical Scanner 完全分離
 */

export type EventType =
    | 'earnings'      // 財報 / 盈餘
    | 'revenue'       // 營收
    | 'contract'      // 訂單 / 大單
    | 'product'       // 新產品 / 技術
    | 'capacity'      // 擴產 / 產能
    | 'factory'       // 建廠 / 擴廠
    | 'investment'    // 投資 / 併購
    | 'management'    // 高層變動
    | 'institutional' // 法人評等 / 目標價
    | 'industry'      // 產業趨勢 / 政策
    | 'regulation'    // 法規 / 限制
    | 'other';        // 其他

export type EventSourceType =
    | 'news'          // 新聞
    | 'filing'        // 公告 / 申報
    | 'announcement'  // 重訊
    | 'report'        // 研究報告
    | 'social'        // 社群 / 論壇
    | 'other';        // 其他

export type EventSentiment = 'bullish' | 'bearish' | 'neutral' | 'unknown';

export interface EventAlphaItem {
    eventId: string;
    stockId: string;
    eventType: EventType;
    sourceType: EventSourceType;
    title: string;
    publishedAt: string;     // ISO 8601 時間字串 (例: 2026-09-11T00:00:00Z)
    url: string;
    sentiment: EventSentiment;
    impactScore: number;     // 影響度評分: -1.0 (極度負面) ~ +1.0 (極度正面)
    confidence: number;      // 信心度: 0.0 ~ 1.0
    rawContentHash: string;  // 原始文章內容之 SHA-256 雜湊碼 (用於去重與校驗)
    extractedAt: string;     // 擷取時間 ISO 8601
    metadata?: Record<string, unknown>; // 可選延伸元資料
}

export interface RawEventInput {
    eventId?: string;
    stockId: string;
    eventType?: string;
    sourceType?: string;
    title: string;
    content?: string;
    publishedAt?: string | Date;
    url?: string;
    sentiment?: string;
    impactScore?: number;
    confidence?: number;
    rawContentHash?: string;
    extractedAt?: string | Date;
    metadata?: Record<string, unknown>;
}
