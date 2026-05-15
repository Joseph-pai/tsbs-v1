/**
 * Core Technical Analysis Functions
 * Optimized for growth/breakout stock discovery
 */

/**
 * Calculate Volume Ratio (量能倍數)
 * Optimized: Current Volume / Average of previous 45 days (baseline)
 */
export function calculateVRatio(volumes: number[]): number {
    if (volumes.length < 6) return 0;

    // 觀測：當日量
    const observationAvg = volumes[volumes.length - 1];

    // 基線：前 45 天均量（排除當日），更符合中長期量能對比頻率
    const availableBaseline = volumes.slice(0, -1); // 排除當日
    const baselineVolumes = availableBaseline.slice(-45); // 取 45 天
    if (baselineVolumes.length < 5) return 0;
    const baselineAvg = baselineVolumes.reduce((a, b) => a + b, 0) / baselineVolumes.length;

    return baselineAvg === 0 ? 0 : observationAvg / baselineAvg;
}

/**
 * Check Moving Average Constriction (均線糾結度)
 * Percentage gap between MA5 and MA20
 */
export function checkMaConstrict(ma5: number, ma20: number, threshold: number = 0.02) {
    if (!ma5 || !ma20) return { isSqueezing: false, constrictValue: 1 };

    // Calculate relative gap
    const gap = Math.abs(ma5 - ma20) / ma20;

    return {
        isSqueezing: gap <= threshold,
        constrictValue: gap
    };
}

/**
 * Check for Increasing Volume Trend (量能遞增)
 */
export function checkVolumeIncreasing(volumes: number[]): boolean {
    if (volumes.length < 3) return false;
    const last3 = volumes.slice(-3);
    return last3[2] > last3[1] && last3[1] > last3[0];
}

/**
 * 判斷跳空缺口（Gap Up）
 * 條件：今日最低 > 昨日最高
 */
export function checkGapUp(
    todayLow: number,
    prevHigh: number
): { isGapUp: boolean; gapPercent: number } {
    const gap = todayLow - prevHigh;
    const gapPercent = prevHigh > 0 ? gap / prevHigh : 0;
    return {
        isGapUp: gap > 0,
        gapPercent: Math.max(0, gapPercent)
    };
}

/**
 * 判斷融資融券軋空動能
 * 條件：近 5 日融資餘額穩定/溫和增加 && 股價同步上升 → 軋空信號
 */
export function checkMarginSqueezeSignal(
    marginData: { date: string; MarginPurchaseTodayBalance: number; ShortSaleTodayBalance: number }[],
    priceData: { date: string; close: number }[]
): { hasSignal: boolean; marginTrend: 'increasing' | 'stable' | 'decreasing'; score: number } {
    if (marginData.length < 5) return { hasSignal: false, marginTrend: 'stable', score: 0 };

    const recent5 = marginData.slice(-5);
    const marginChanges: number[] = [];
    for (let i = 1; i < recent5.length; i++) {
        marginChanges.push(recent5[i].MarginPurchaseTodayBalance - recent5[i - 1].MarginPurchaseTodayBalance);
    }

    const avgChange = marginChanges.reduce((a, b) => a + b, 0) / marginChanges.length;
    const allNonNeg = marginChanges.every(c => c >= 0);
    const marginTrend: 'increasing' | 'stable' | 'decreasing' = avgChange > 0 ? 'increasing' : (avgChange === 0 ? 'stable' : 'decreasing');

    // 股價同步判斷
    const recentPrices = priceData.slice(-5);
    const priceUp = recentPrices.length >= 2 &&
        recentPrices[recentPrices.length - 1].close > recentPrices[0].close;

    // 軋空信號：融資溫和增加 + 股價上升
    const hasSignal = allNonNeg && avgChange > 0 && priceUp;
    const score = hasSignal ? Math.min(1, avgChange / 500) : 0;

    return { hasSignal, marginTrend, score };
}

/**
 * Evaluate Stock Base Logic
 */
import { CONFIG } from '@/lib/config';

export function evaluateStock(
    history: any[], 
    settings?: { volumeWeight?: number, maWeight?: number, breakoutWeight?: number, rsWeight?: number },
    indexData?: { TAIEX: any[], TPEX: any[] },
    market?: 'TWSE' | 'TPEX'
) {
    // 需有 60 天以上資料才能算 60 日新高，但為了容錯，至少給 20 天基準
    if (history.length < 20) return null;

    const vWeight = settings?.volumeWeight ?? 40;
    const maWeight = settings?.maWeight ?? 15;
    const bWeight = settings?.breakoutWeight ?? 35;
    const rsWeight = settings?.rsWeight ?? 10;

    const closes = history.map(h => h.close);
    const volumes = history.map(h => h.Trading_Volume);
    const highs = history.map(h => h.max);

    // Calc MAs
    const ma5 = closes.slice(-5).reduce((a, b) => a + b, 0) / 5;
    const ma10 = closes.slice(-10).reduce((a, b) => a + b, 0) / 10;
    const ma20 = closes.slice(-20).reduce((a, b) => a + b, 0) / 20;
    const ma60 = closes.length >= 60 ? closes.slice(-60).reduce((a, b) => a + b, 0) / 60 : ma20; // Fallback

    const today = history[history.length - 1];
    const prevClose = history[history.length - 2].close;
    const changePercent = (today.close - prevClose) / prevClose;

    // --- 1. Volume Resonance (量能倍數與 4 周新高) ---
    const vRatio = calculateVRatio(volumes); 
    // 4 周約等於 20 個交易日
    const recent20Vols = volumes.slice(-20);
    const maxVol20 = Math.max(...recent20Vols.slice(0, -1)); // 過去19天的最大量
    const is4WeekVolHigh = today.Trading_Volume >= maxVol20;
    // 分數：達成 2.5倍以上給部分，若達到 3.0 倍且創 4周新高給滿分
    let volumeScore = 0;
    if (vRatio >= 2.5) volumeScore += vWeight * 0.5;
    if (vRatio >= 3.0 && is4WeekVolHigh) volumeScore = vWeight;

    // --- 2. MA Resonance (均線糾結後開花) ---
    // 要求 5, 20, 60 發散或穩定多頭：收盤 > 5MA > 20MA > 60MA
    const isMaAligned = today.close > ma5 && ma5 > ma20 && ma20 >= ma60;
    const maData = checkMaConstrict(ma5, ma20, 0.04); // 均線糾結放寬至 4%
    // 分數：多頭排列給滿分，否則有糾結給一半
    let maScore = 0;
    if (isMaAligned) maScore = maWeight;
    else if (maData.isSqueezing && today.close > ma20) maScore = maWeight * 0.5;

    // --- 3. Breakout Resonance (延續性動能與 60 日突破) ---
    // 找 60 天高點
    const lookbackDays = Math.min(history.length, 60);
    const recent60Highs = highs.slice(-lookbackDays);
    const max60 = Math.max(...recent60Highs.slice(0, -1)); // 不含今日的最高價

    let isBreakout = today.close >= max60; // 當日真實突破
    let isExtension = false;

    // 延續性偵測 (看回近 7 天)
    if (!isBreakout && history.length >= 7) {
        const last7 = history.slice(-7);
        const last7Highs = last7.map(h => h.max);
        const hasRecentBreakout = last7Highs.some(h => h >= max60);
        const isAbove10MA = today.close > ma10;
        // 延續量不能縮到極致 (此處簡易防護：大於 20MA 量的一半)
        const ma20Vol = volumes.slice(-20).reduce((a, b) => a + b, 0) / 20;
        const volumeNotShrunk = today.Trading_Volume > ma20Vol * 0.5;

        if (hasRecentBreakout && isAbove10MA && volumeNotShrunk) {
            isExtension = true;
        }
    }

    let breakoutScore = 0;
    if (isBreakout || isExtension) breakoutScore = bWeight;

    // --- 4. Sector Relative Strength ---
    let rsScore = 0;
    if (indexData && market && indexData.TAIEX && indexData.TPEX) {
        // 計算近 10 日漲幅
        const stock10Days = history.slice(-10);
        const stockReturn = (stock10Days[stock10Days.length - 1].close - stock10Days[0].close) / stock10Days[0].close;

        let indexRef = market === 'TWSE' ? indexData.TAIEX : indexData.TPEX;
        if (indexRef && indexRef.length >= 10) {
            const idx10Days = indexRef.slice(-10);
            const idxReturn = (idx10Days[idx10Days.length - 1].close - idx10Days[0].close) / idx10Days[0].close;
            // 相對強度 > 大盤
            if (stockReturn > idxReturn) {
                rsScore = rsWeight; // 具備強度給滿分
            } else if (stockReturn > 0 && stockReturn > idxReturn - 0.02) {
                rsScore = rsWeight * 0.5; // 小輸但本身大於0給一半
            }
        }
    }

    const totalPoints = volumeScore + maScore + breakoutScore + rsScore;
    const isQualified = totalPoints >= 70; // 門檻: 綜合權重分數需 >= 70分 且具備流動性底線
    const score = Math.min(1, Math.max(0, totalPoints / 100));

    return {
        vRatio,
        maData,
        is_bullish: isMaAligned,
        changePercent,
        dailyChange: changePercent,
        isBreakout: isBreakout || isExtension,
        isQualified,
        score,
        comprehensiveScoreDetails: {
            volumeScore: parseFloat(volumeScore.toFixed(2)),
            maScore: parseFloat(maScore.toFixed(2)),
            chipScore: parseFloat(breakoutScore.toFixed(2)), // Repurposed for breakout score tracking
            rsScore: parseFloat(rsScore.toFixed(2)),
            total: parseFloat(totalPoints.toFixed(2)),
            note: 'engine_resonance_scores' as const
        }
    };
}
