
/**
 * Calculate Simple Moving Average (SMA)
 */
export const calculateSMA = (prices: number[], period: number): number | null => {
    if (prices.length < period) return null;
    const slice = prices.slice(0, period);
    const sum = slice.reduce((a, b) => a + b, 0);
    return sum / period;
};

/**
 * Check if Moving Averages are aligned (squeezed) and price is breaking out.
 * Condition:
 * 1. (Max(MA) - Min(MA)) / Min(MA) < threshold (default 0.03) -> Alignment
 * 2. Close Price > Max(MA) -> Breakout
 */
export const checkMaAlignment = (
    close: number,
    ma5: number,
    ma10: number,
    ma20: number,
    threshold: number = 0.03
) => {
    const mas = [ma5, ma10, ma20];
    const maxMa = Math.max(...mas);
    const minMa = Math.min(...mas);

    const spread = (maxMa - minMa) / minMa;
    const isAligned = spread < threshold;
    const isBreakout = close > maxMa; // Price is above all MAs

    return { isAligned, isBreakout, spread };
};

/**
 * Calculate Volume Ratio
 * Volume / Average(Volume, period)
 */
export const calculateVolumeRatio = (currentVolume: number, historicalVolumes: number[]) => {
    if (historicalVolumes.length === 0) return 0;
    const avg = historicalVolumes.reduce((a, b) => a + b, 0) / historicalVolumes.length;
    if (avg === 0) return 0;
    return currentVolume / avg;
};

/**
 * Calculate Point of Control (POC)
 * Approximated using Volume Profile on Daily Data (Volume by Price buckets)
 * @param prices Array of StockData
 * @param period Lookback period (default 20 days)
 */
export const calculatePOC = (prices: any[], period: number = 20): number => {
    if (prices.length === 0) return 0;

    // 1. Get recent data
    const slice = prices.slice(Math.max(0, prices.length - period));
    if (slice.length === 0) return 0;

    // 2. Determine price range
    const maxPrice = Math.max(...slice.map((p: any) => p.max));
    const minPrice = Math.min(...slice.map((p: any) => p.min));

    if (maxPrice === minPrice) return maxPrice;

    // 3. Create buckets (e.g., 50 bins)
    const binCount = 50;
    const binSize = (maxPrice - minPrice) / binCount;
    const bins = new Array(binCount).fill(0);

    // 4. Distribute volume into bins
    // Strategy: Distribute day's volume evenly across the day's price range (or just assign to close/avg)
    // Better approximation: Assign volume to the "Average Price" of the day ( (Open+Close+High+Low)/4 )
    slice.forEach((day: any) => {
        const avgPrice = (day.open + day.close + day.max + day.min) / 4;
        const binIndex = Math.min(
            Math.floor((avgPrice - minPrice) / binSize),
            binCount - 1
        );
        bins[binIndex] += day.Trading_Volume;
    });

    // 5. Find bin with max volume
    let maxVol = -1;
    let maxBinIndex = -1;
    for (let i = 0; i < binCount; i++) {
        if (bins[i] > maxVol) {
            maxVol = bins[i];
            maxBinIndex = i;
        }
    }

    // 6. Return price level of max bin (center of bin)
    return minPrice + (maxBinIndex * binSize) + (binSize / 2);
};

/**
 * Calculate Exponential Moving Average (EMA)
 */
export const calculateEMA = (prices: number[], period: number): number[] => {
    if (prices.length === 0) return [];
    const k = 2 / (period + 1);
    const emaArray = [prices[0]];
    for (let i = 1; i < prices.length; i++) {
        emaArray.push(prices[i] * k + emaArray[i - 1] * (1 - k));
    }
    return emaArray;
};

/**
 * Calculate MACD
 * Returns the latest { dif, macd, osc } or null
 */
export const calculateMACD = (prices: number[], shortPeriod = 12, longPeriod = 26, signalPeriod = 9) => {
    if (prices.length < longPeriod) return null;
    
    const emaShort = calculateEMA(prices, shortPeriod);
    const emaLong = calculateEMA(prices, longPeriod);
    
    const difArray = [];
    for (let i = 0; i < prices.length; i++) {
        difArray.push(emaShort[i] - emaLong[i]);
    }
    
    const macdArray = calculateEMA(difArray, signalPeriod);
    
    const latestDif = difArray[difArray.length - 1];
    const latestMacd = macdArray[macdArray.length - 1];
    const latestOsc = latestDif - latestMacd; // MACD Histogram (OSC)
    
    return {
        dif: latestDif,
        macd: latestMacd,
        osc: latestOsc
    };
};

/**
 * Calculate MACD Full History
 * Returns full difArray and macdArray for divergence analysis.
 * Does NOT replace calculateMACD — this is an extended version for advanced signals.
 */
export const calculateMACDFull = (prices: number[], shortPeriod = 12, longPeriod = 26, signalPeriod = 9) => {
    if (prices.length < longPeriod) return null;
    const emaShort = calculateEMA(prices, shortPeriod);
    const emaLong = calculateEMA(prices, longPeriod);
    const difArray = prices.map((_, i) => emaShort[i] - emaLong[i]);
    const macdArray = calculateEMA(difArray, signalPeriod);
    return { difArray, macdArray };
};

/**
 * Calculate KD (Stochastic Oscillator)
 * Returns full K and D arrays.
 */
export const calculateKD = (prices: {max: number, min: number, close: number}[], period = 9) => {
    if (prices.length < period) return null;
    
    const kArray: number[] = [];
    const dArray: number[] = [];
    
    let prevK = 50;
    let prevD = 50;
    
    for (let i = 0; i < prices.length; i++) {
        if (i < period - 1) {
            kArray.push(50);
            dArray.push(50);
            continue;
        }
        
        const slice = prices.slice(i - period + 1, i + 1);
        const highestHigh = Math.max(...slice.map(p => p.max));
        const lowestLow = Math.min(...slice.map(p => p.min));
        
        let rsv = 50;
        if (highestHigh !== lowestLow) {
            rsv = ((prices[i].close - lowestLow) / (highestHigh - lowestLow)) * 100;
        }
        
        const currentK = prevK * (2/3) + rsv * (1/3);
        const currentD = prevD * (2/3) + currentK * (1/3);
        
        kArray.push(currentK);
        dArray.push(currentD);
        
        prevK = currentK;
        prevD = currentD;
    }
    
    return { kArray, dArray };
};
