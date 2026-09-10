export interface BarData {
    date?: string;
    high: number;
    low?: number;
    open?: number;
    close?: number;
    [key: string]: any;
}

export interface TargetEvaluationResult {
    targetPrice: number;
    hit5d10: boolean;
    daysToTarget: number | null;
    maxHigh: number;
    maxReturn: number;
    dataComplete: boolean;
}

/**
 * 評估訊號日 D 之後的 5 個交易日內是否達成 +10% 觸及目標 (Hit Target)
 * 
 * 規則定義：
 * 1. targetPrice = signalClose × 1.10
 * 2. 只使用訊號日之後未來最多 5 個交易日 (D+1 至 D+5)
 * 3. 使用盤中最高價 (High) 判斷，High >= targetPrice 即視為命中 (hit5d10 = true)
 * 4. 不採計 D 日本身價位，亦不採用 D+5 之後的資料
 * 5. daysToTarget 為首先達標的天數 (1..5)，若未達標則為 null
 */
export function evaluate5D10PercentTarget(
    signalClose: number,
    futureBars: BarData[]
): TargetEvaluationResult {
    // 1. 檢查 signalClose 輸入合規性
    if (typeof signalClose !== 'number' || signalClose <= 0 || !Number.isFinite(signalClose)) {
        return {
            targetPrice: 0,
            hit5d10: false,
            daysToTarget: null,
            maxHigh: 0,
            maxReturn: 0,
            dataComplete: false,
        };
    }

    const targetPrice = parseFloat((signalClose * 1.10).toFixed(6));

    if (!Array.isArray(futureBars) || futureBars.length === 0) {
        return {
            targetPrice,
            hit5d10: false,
            daysToTarget: null,
            maxHigh: 0,
            maxReturn: 0,
            dataComplete: false,
        };
    }

    // 2. 嚴格限縮只取未來最多 5 個交易日 (D+1 ~ D+5)
    const horizonBars = futureBars.slice(0, 5);
    const dataComplete = futureBars.length >= 5;

    // 3. 檢查日期順序 (若有提供 date)
    for (let i = 1; i < horizonBars.length; i++) {
        const prevDate = horizonBars[i - 1]?.date;
        const currDate = horizonBars[i]?.date;
        if (prevDate && currDate && currDate <= prevDate) {
            return {
                targetPrice,
                hit5d10: false,
                daysToTarget: null,
                maxHigh: 0,
                maxReturn: 0,
                dataComplete: false,
            };
        }
    }

    let maxHigh = 0;
    let hit5d10 = false;
    let daysToTarget: number | null = null;

    // 4. 逐日檢查 D+1 ~ D+5 最高價
    for (let i = 0; i < horizonBars.length; i++) {
        const bar = horizonBars[i];
        const barHigh = typeof bar?.high === 'number' && Number.isFinite(bar.high) ? bar.high : 0;

        if (barHigh > maxHigh) {
            maxHigh = barHigh;
        }

        // 浮點數精度處理: barHigh 達到或超過 targetPrice
        const epsilon = 1e-9;
        if (!hit5d10 && barHigh >= targetPrice - epsilon) {
            hit5d10 = true;
            daysToTarget = i + 1; // D+1 為 1
        }
    }

    const maxReturn = maxHigh > 0 ? (maxHigh / signalClose - 1) : 0;

    return {
        targetPrice,
        hit5d10,
        daysToTarget,
        maxHigh,
        maxReturn: parseFloat(maxReturn.toFixed(6)),
        dataComplete,
    };
}
