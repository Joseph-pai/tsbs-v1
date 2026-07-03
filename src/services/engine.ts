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
 * 共用 VCP 波動率收縮條件判斷函式（統一標準）
 *
 * 標準：
 *   ATR 收縮：近 5 日 ATR < 近 20 日 ATR × 0.60
 *   量能收縮：近 5 日均量 < 近 20 日均量 × 0.70
 *
 * @param priorPrices  排除今日的歷史價格陣列（每筆需有 max, min, close）
 * @param priorVolumes 排除今日的歷史成交量陣列
 * @returns { isVcp, atrRatio, volRatio }
 */
export function checkVcpCondition(
    priorPrices: { max: number; min: number; close: number }[],
    priorVolumes: number[]
): { isVcp: boolean; atrRatio: number; volRatio: number } {
    if (priorPrices.length < 20 || priorVolumes.length < 20) {
        return { isVcp: false, atrRatio: 1, volRatio: 1 };
    }

    const getAtr = (slice: { max: number; min: number; close: number }[]) =>
        slice.reduce((sum, p) => sum + (p.close > 0 ? (p.max - p.min) / p.close : 0), 0) / slice.length;

    const recent5Atr  = getAtr(priorPrices.slice(-5));
    const recent20Atr = getAtr(priorPrices.slice(-20));

    const vol5Avg  = priorVolumes.slice(-5).reduce((a, b) => a + b, 0) / 5;
    const vol20Avg = priorVolumes.slice(-20).reduce((a, b) => a + b, 0) / 20;

    const atrRatio = recent20Atr > 0 ? recent5Atr / recent20Atr : 1;
    const volRatio = vol20Avg   > 0 ? vol5Avg   / vol20Avg    : 1;

    // 統一標準：ATR × 0.60、量能 × 0.70
    const isVcp = atrRatio < 0.60 && volRatio < 0.70;

    return { isVcp, atrRatio, volRatio };
}

/**
 * 判斷融資融券軋空動能（修正版）
 *
 * 軋空（Short Squeeze）的真實定義：
 *   空方（融券方）持倉壓力大，被迫回補，推升股價。
 *   核心信號 = 融券餘額下降（空方回補）+ 券資比高（空方壓力大）+ 股價同步上升
 *
 * 原邏輯錯誤：把「融資增加」當軋空信號。
 *   融資增加 = 多方加碼，與軋空無關。
 *
 * 修正後邏輯：
 *   1. 近 5 日融券餘額下降（空方被迫回補）
 *   2. 最新券資比 > 15%（空方壓力足夠大）
 *   3. 股價同步上升
 */
export function checkMarginSqueezeSignal(
    marginData: { date: string; MarginPurchaseTodayBalance: number; ShortSaleTodayBalance: number }[],
    priceData: { date: string; close: number }[]
): { hasSignal: boolean; marginTrend: 'increasing' | 'stable' | 'decreasing'; score: number } {
    if (marginData.length < 5) return { hasSignal: false, marginTrend: 'stable', score: 0 };

    const recent5 = marginData.slice(-5);

    // 融券餘額變化（用於判斷 marginTrend，保持原有輸出格式）
    const marginChanges: number[] = [];
    for (let i = 1; i < recent5.length; i++) {
        marginChanges.push(recent5[i].MarginPurchaseTodayBalance - recent5[i - 1].MarginPurchaseTodayBalance);
    }
    const avgMarginChange = marginChanges.reduce((a, b) => a + b, 0) / marginChanges.length;
    const marginTrend: 'increasing' | 'stable' | 'decreasing' =
        avgMarginChange > 0 ? 'increasing' : (avgMarginChange === 0 ? 'stable' : 'decreasing');

    // ── 修正核心：軋空信號改用融券餘額判斷 ──

    // 1. 最新與最舊融券餘額（判斷空方是否回補）
    const shortFirst = recent5[0].ShortSaleTodayBalance;
    const shortLast  = recent5[recent5.length - 1].ShortSaleTodayBalance;
    const shortDecreasing = shortLast < shortFirst; // 融券餘額下降 = 空方回補

    // 2. 券資比（最新日）：融券 / 融資，高代表空方壓力大
    const latestMargin = recent5[recent5.length - 1].MarginPurchaseTodayBalance;
    const shortRatio = latestMargin > 0 ? shortLast / latestMargin : 0;
    const isHighShortRatio = shortRatio > 0.15; // 券資比 > 15% 視為空方壓力大

    // 3. 股價同步上升
    const recentPrices = priceData.slice(-5);
    const priceUp = recentPrices.length >= 2 &&
        recentPrices[recentPrices.length - 1].close > recentPrices[0].close;

    // 軋空信號：空方回補 + 空方壓力大 + 股價上升
    const hasSignal = shortDecreasing && isHighShortRatio && priceUp;

    // 分數：依融券下降幅度計算，最高 1
    const shortDeclineRate = shortFirst > 0 ? (shortFirst - shortLast) / shortFirst : 0;
    const score = hasSignal ? Math.min(1, shortDeclineRate * 5) : 0;

    return { hasSignal, marginTrend, score };
}

/**
 * Evaluate Stock Base Logic
 * @param enhanced 強化評分模式：啟用後會計算股價位階並對低位爆量股加權
 */
import { CONFIG } from '@/lib/config';

export function evaluateStock(
    history: any[], 
    settings?: { volumeWeight?: number, maWeight?: number, breakoutWeight?: number, rsWeight?: number },
    indexData?: { TAIEX: any[], TPEX: any[] },
    market?: 'TWSE' | 'TPEX',
    enhanced?: boolean
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

    const basePoints = volumeScore + maScore + breakoutScore + rsScore;

    // --- 5. 強化模式：股價位階與動態乘數 ---
    let finalPoints = basePoints;
    let positionRatio = 0.5; // 預設中性值

    // 提前計算波動率與上影線 (供強化模式使用)
    const recent20ForVol = history.slice(-20);
    let totalVolatility = 0;
    for (const h of recent20ForVol) {
        if (h.close > 0) {
            totalVolatility += (h.max - h.min) / h.close;
        }
    }
    const avgVolatility = recent20ForVol.length > 0 ? totalVolatility / recent20ForVol.length : 0;

    const openPrice = today.open !== undefined ? today.open : prevClose;
    const bodyMax = Math.max(openPrice, today.close);
    const upperShadow = today.max - bodyMax;
    const body = Math.abs(today.close - openPrice);
    const hasLongUpperShadow = upperShadow > body && upperShadow > (today.close * 0.015);

    if (enhanced) {
        const recent60Closes = closes.slice(-lookbackDays);
        const min60 = Math.min(...recent60Closes);
        const max60Price = Math.max(...recent60Closes);

        if (max60Price > min60) {
            positionRatio = (today.close - min60) / (max60Price - min60);
        }

        // 位階乘數：低位加分，高位(>85%)懲罰
        const positionMultiplier =
            positionRatio < 0.30 ? 1.25 :
            positionRatio < 0.60 ? 1.10 :
            positionRatio < 0.85 ? 1.00 :
            0.85;

        finalPoints = basePoints * positionMultiplier;

        // 股性波動率乘數
        if (avgVolatility > 0.035) {
            finalPoints *= 1.15; // 活潑股加分
        } else if (avgVolatility < 0.015) {
            finalPoints *= 0.85; // 牛皮股降分
        }

        // 長上影線扣分
        if (hasLongUpperShadow) {
            finalPoints -= 15;
        }

        // === 主力進場特徵 (Smart Money Footprints) 評分加成 ===
        
        // 1. 紅黑K量能結構比 (Accumulation Volume Ratio)
        let isAccumulationVolume = false;
        if (history.length >= 10) {
            const recent10 = history.slice(-10);
            let upVolume = 0;
            let downVolume = 0;
            for (let i = 1; i < recent10.length; i++) {
                const p = recent10[i];
                const pPrev = recent10[i - 1];
                if (p.close > pPrev.close || p.close > p.open) {
                    upVolume += p.Trading_Volume;
                } else if (p.close < pPrev.close || p.close < p.open) {
                    downVolume += p.Trading_Volume;
                }
            }
            if (upVolume / (downVolume || 1) > 1.5) {
                isAccumulationVolume = true;
                finalPoints += 10; // 量能結構佳，爆發力加分
            }
        }

        // 2. VCP 波動率收縮 (Volatility Contraction)
        // 統一標準：使用共用函式 checkVcpCondition（ATR×0.60、量能×0.70）
        let isVcpSqueeze = false;
        if (history.length >= 21) {
            const priorPricesForVcp = history.slice(0, -1); // 排除今日（突破日）
            const priorVolsForVcp   = volumes.slice(0, -1);
            const vcpResult = checkVcpCondition(priorPricesForVcp, priorVolsForVcp);
            if (vcpResult.isVcp) {
                isVcpSqueeze = true;
                finalPoints += 10; // 籌碼鎖定窒息量，爆發力加分
            }
        }

        // 3. 威科夫破底翻洗盤 (Wyckoff Spring)
        let isWyckoffSpring = false;
        if (positionRatio < 0.35) {
            const lowerShadow = Math.min(today.close, openPrice) - today.min;
            isWyckoffSpring = body > 0 
                ? lowerShadow > body * 2
                : lowerShadow > today.close * 0.015;
            const vol20Avg = volumes.slice(-20).reduce((a, b) => a + b, 0) / 20;
            if (isWyckoffSpring && today.Trading_Volume < vol20Avg * 3) {
                finalPoints += 5; // 故意洗盤洗出浮額，爆發力加分
            }
        }
        
        // 4. 築底天數 (Base Building Duration)
        let hasBaseBuilding = false;
        if (history.length >= 15 && lookbackDays >= 60) {
            const recent15 = history.slice(-15);
            let lowDays = 0;
            for (const p of recent15) {
                const pos = max60Price > min60 ? (p.close - min60) / (max60Price - min60) : 0;
                if (pos < 0.35) lowDays++;
            }
            if (lowDays >= 10) {
                hasBaseBuilding = true;
                if (isAccumulationVolume) finalPoints += 5; // 築底且伴隨吸籌，再給予穩定獎勵
            }
        }
    }

    const isQualified = finalPoints >= 70; // 門檻: 綜合權重分數需 >= 70分 且具備流動性底線
    const score = Math.min(1, Math.max(0, finalPoints / 100));

    return {
        vRatio,
        maData,
        is_bullish: isMaAligned,
        changePercent,
        dailyChange: changePercent,
        isBreakout: isBreakout || isExtension,
        isQualified,
        score,
        win_rate_score: basePoints,
        explosive_score: finalPoints,
        comprehensiveScoreDetails: {
            volumeScore: parseFloat(volumeScore.toFixed(2)),
            maScore: parseFloat(maScore.toFixed(2)),
            chipScore: parseFloat(breakoutScore.toFixed(2)), // Repurposed for breakout score tracking
            rsScore: parseFloat(rsScore.toFixed(2)),
            total: parseFloat(finalPoints.toFixed(2)),
            note: 'engine_resonance_scores' as const
        }
    };
}
