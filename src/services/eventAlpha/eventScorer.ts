import { EventType, EventSourceType, EventSentiment } from './eventTypes';

export interface HistoricalEvidence {
    sampleSize: number;            // 歷史類似事件樣本數
    historicalHitRate?: number;    // 歷史 5D10% 命中率 (0.0 ~ 1.0)
    avgMaxReturn?: number;         // 歷史平均最大報酬 (0.0 ~ 1.0)
}

export interface EventScoreInput {
    eventType: EventType;
    sourceType: EventSourceType;
    confidence: number;            // 初始信心度 0.0 ~ 1.0
    publishedAt: string;           // ISO 8601 時間字串
    sentiment?: EventSentiment;
    impactScore?: number;          // -1.0 ~ +1.0
    historicalEvidence?: HistoricalEvidence;
}

export interface EventScoreResult {
    eventAlphaScore: number;       // 獨立 Event Alpha 分數 (例如 -100 ~ +100)
    adjustedConfidence: number;    // 經歷史證據檢驗後調整之信心度
    timeDecayFactor: number;       // 時間衰減係數 (0.0 ~ 1.0)
    insufficientEvidence: boolean; // 歷史證據不足標記
    scoreReasoning: string[];      // 計分與信心度調整理由
}

/**
 * 依據事件發布時間計算時間衰減因子 (Time Decay Factor)
 * 24 小時內衰減最少，超過 7 天顯著衰減
 */
export function calculateTimeDecayFactor(publishedAtStr: string, referenceDateStr?: string): number {
    const publishedTime = new Date(publishedAtStr).getTime();
    if (isNaN(publishedTime)) return 0.5; // 無效日期預設 0.5

    const refTime = referenceDateStr ? new Date(referenceDateStr).getTime() : Date.now();
    const ageInHours = Math.max(0, (refTime - publishedTime) / (1000 * 60 * 60));

    if (ageInHours <= 24) {
        return 1.0;
    } else if (ageInHours <= 72) {
        return 0.8;
    } else if (ageInHours <= 168) { // 7 天內
        return 0.5;
    } else if (ageInHours <= 336) { // 14 天內
        return 0.2;
    } else {
        return 0.05;
    }
}

/**
 * 獨立 Event Alpha 計分模組 (Event Alpha Scorer)
 * 絕對與 Technical Score 分離，零機率承諾，證據不足自動調降 Confidence
 */
export function calculateEventAlphaScore(input: EventScoreInput, referenceDateStr?: string): EventScoreResult {
    const scoreReasoning: string[] = [];

    // 1. 基本情緒與衝擊基礎分 (Base Impact Score: -1.0 ~ +1.0 -> -100 ~ +100)
    let rawImpact = typeof input.impactScore === 'number' ? input.impactScore : 0.0;
    rawImpact = Math.max(-1.0, Math.min(1.0, rawImpact));

    if (input.sentiment === 'bullish' && rawImpact === 0) rawImpact = 0.5;
    if (input.sentiment === 'bearish' && rawImpact === 0) rawImpact = -0.5;

    let baseScore = rawImpact * 100.0;
    scoreReasoning.push(`事件基礎衝擊分: ${baseScore.toFixed(1)}`);

    // 2. 來源類型權重係數 (Source Type Weight)
    let sourceWeight = 1.0;
    switch (input.sourceType) {
        case 'filing':
        case 'announcement':
            sourceWeight = 1.2; // 官方重訊/申報權重較高
            break;
        case 'report':
            sourceWeight = 1.1;
            break;
        case 'news':
            sourceWeight = 1.0;
            break;
        case 'social':
            sourceWeight = 0.7; // 社群資訊權重較低
            break;
        default:
            sourceWeight = 0.9;
    }
    scoreReasoning.push(`來源類型權重 (${input.sourceType}): x${sourceWeight}`);

    // 3. 時間衰減 (Time Decay)
    const timeDecayFactor = calculateTimeDecayFactor(input.publishedAt, referenceDateStr);
    scoreReasoning.push(`時間衰減因子: x${timeDecayFactor.toFixed(2)}`);

    // 4. 歷史證據檢驗與 Confidence 調降 (Strict Evidence Adjustment)
    let adjustedConfidence = Math.max(0.0, Math.min(1.0, input.confidence));
    let insufficientEvidence = false;

    const evidence = input.historicalEvidence;
    if (!evidence || typeof evidence.sampleSize !== 'number' || evidence.sampleSize < 5) {
        insufficientEvidence = true;
        // 歷史證據不足 (< 5 筆)，強制將信心度上限降至 0.3，不允許自行假設高顯著性
        const prevConfidence = adjustedConfidence;
        adjustedConfidence = Math.min(adjustedConfidence, 0.3);
        scoreReasoning.push(`⚠️ 歷史證據不足 (樣本數 < 5)，信心度由 ${prevConfidence.toFixed(2)} 強制調降至 ${adjustedConfidence.toFixed(2)}`);
    } else {
        // 具備足夠歷史證據，可依據歷史命中率做微調
        if (typeof evidence.historicalHitRate === 'number') {
            scoreReasoning.push(`歷史類似事件樣本數: ${evidence.sampleSize} 筆，5D10% 歷史命中率: ${(evidence.historicalHitRate * 100).toFixed(1)}%`);
        }
    }

    // 5. 綜合計算 Event Alpha Score
    const finalScore = baseScore * sourceWeight * timeDecayFactor * adjustedConfidence;
    const roundedScore = parseFloat(finalScore.toFixed(2));

    scoreReasoning.push(`最終 Event Alpha Score: ${roundedScore}`);

    return {
        eventAlphaScore: roundedScore,
        adjustedConfidence,
        timeDecayFactor,
        insufficientEvidence,
        scoreReasoning,
    };
}
