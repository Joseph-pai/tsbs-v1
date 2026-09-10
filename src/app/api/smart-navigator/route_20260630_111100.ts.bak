import { NextResponse } from 'next/server';
import { ExchangeClient } from '@/lib/exchange';
import { getTotalShares } from '@/lib/shares';
import { calculateSMA, calculateMACD, calculateMACDFull, calculateKD } from '@/services/indicators';
import { FinMindClient, FinMindExtras } from '@/lib/finmind';
import { format, subDays } from 'date-fns';
import { redis } from '@/lib/redis';
import { StockData, InstitutionalData } from '@/types';

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const stockId = searchParams.get('stockId');
        const periodStr = searchParams.get('period') || '30';
        const period = parseInt(periodStr, 10);
        const masterType = searchParams.get('masterType') || 'insider';

        if (!stockId) {
            return NextResponse.json({ success: false, error: 'Missing stockId' }, { status: 400 });
        }

        const endDate = format(new Date(), 'yyyy-MM-dd');
        const startDate180 = format(subDays(new Date(), 180), 'yyyy-MM-dd'); // 180 calendar days (~125 trading days) for caching consistency
        const todayStr = format(new Date(), 'yyyy-MM-dd');

        // Redis cache fetch helper (Standardizing to match scanner.ts keys)
        const getCachedOrFetch = async (key: string, fetchFn: () => Promise<any>, expiry: number = 14400) => {
            try {
                const cached = await redis.get(key);
                if (cached) {
                    return JSON.parse(cached);
                }
            } catch (e) {
                console.warn(`[Redis] Read error for key ${key}:`, e);
            }
            const data = await fetchFn();
            if (data && (!Array.isArray(data) || data.length > 0)) {
                try {
                    await redis.set(key, JSON.stringify(data), 'EX', expiry);
                } catch (e) {
                    console.warn(`[Redis] Write error for key ${key}:`, e);
                }
            }
            return data;
        };

        // Parallelize all external data fetching with Redis cache wrapper
        const [pricesRaw, _, totalShares, taiexHistoryRaw, marginDataRaw, dayTradingDataRaw, institutionalDataRaw, institutionalBuySellRaw] = await Promise.all([
            getCachedOrFetch(`tsbs:raw:hist:${stockId}:${todayStr}`, () => ExchangeClient.getStockHistory(stockId, 6)),
            ExchangeClient.getIndustryMapping().catch(() => ({})),
            getCachedOrFetch(`tsbs:raw:shares:${stockId}:${todayStr}`, () => getTotalShares(stockId).catch(() => 0), 86400),
            getCachedOrFetch(`tsbs:raw:taiex:${todayStr}`, () => ExchangeClient.getTaiexHistory(3).catch(() => []), 14400), // 3 months of TAIEX
            getCachedOrFetch(`tsbs:raw:margin:${stockId}:${todayStr}`, () => FinMindExtras.getMarginTrading({ stockId, startDate: startDate180, endDate }).catch(() => [])),
            getCachedOrFetch(`tsbs:raw:daytrading:${stockId}:${todayStr}`, () => FinMindExtras.getDayTrading({ stockId, startDate: startDate180, endDate }).catch(() => [])),
            getCachedOrFetch(`tsbs:raw:inst:${stockId}:${todayStr}`, () => FinMindClient.getInstitutional({ stockId, startDate: startDate180, endDate }).catch(() => [])),
            getCachedOrFetch(`tsbs:raw:inst_buysell:${stockId}:${todayStr}`, () => FinMindClient.getInstitutionalBuySell({ stockId, startDate: startDate180, endDate }).catch(() => []))
        ]);

        const prices = (pricesRaw || []) as StockData[];
        const taiexHistory = (taiexHistoryRaw || []) as Array<{ date: string; close: number; spread: number }>;
        const marginData = (marginDataRaw || []) as any[];
        const dayTradingData = (dayTradingDataRaw || []) as any[];
        const institutionalData = (institutionalDataRaw || []) as any[];
        const institutionalBuySell = (institutionalBuySellRaw || []) as InstitutionalData[];

        if (!prices || prices.length === 0) {
            return NextResponse.json({ success: false, error: '無法獲取該股票的歷史交易數據，請確認代號是否正確。' }, { status: 404 });
        }

        // --- Process Chip Data (Level 2 Alert Metrics) ---
        let isMarginIncreasing = false;
        let isLargeShareholderDropping = false;
        let highDayTradingRate = false;

        try {
            // Margin processing (is margin continuously increasing?)
            if (marginData && marginData.length >= 3) {
                const recentMargin = marginData.slice(-5);
                let increaseCount = 0;
                for (let i = 1; i < recentMargin.length; i++) {
                    if (recentMargin[i].MarginPurchaseTodayBalance > recentMargin[i - 1].MarginPurchaseTodayBalance) {
                        increaseCount++;
                    }
                }
                if (increaseCount >= 2 && recentMargin[recentMargin.length - 1].MarginPurchaseTodayBalance > recentMargin[0].MarginPurchaseTodayBalance) {
                    isMarginIncreasing = true;
                }
            }

            // Day Trading processing (average > 40%)
            if (dayTradingData && dayTradingData.length > 0) {
                const recentDT = dayTradingData.slice(-5);
                let totalVolume = 0;
                let totalDTVolume = 0;
                recentDT.forEach((d: any) => {
                    totalVolume += d.Volume;
                    totalDTVolume += d.DayTradingVolume;
                });
                if (totalVolume > 0 && (totalDTVolume / totalVolume) > 0.4) {
                    highDayTradingRate = true;
                }
            }

            // Institutional Large Shareholder processing (is >1000 shares dropping?)
            if (institutionalData && institutionalData.length >= 2) {
                // TaiwanStockHoldingSharesPer data usually has 'HoldingSharesLevel': 15 for >1000 shares
                // But structure might be a flat list of dates and levels. Let's group by date.
                const instDataAny = institutionalData as any[];
                const lastTwoWeeks = instDataAny.filter(d => parseInt(d.HoldingSharesLevel, 10) === 15);
                if (lastTwoWeeks.length >= 2) {
                    const sorted = lastTwoWeeks.sort((a, b) => a.date.localeCompare(b.date));
                    const latest = sorted[sorted.length - 1].percent;
                    const prev = sorted[sorted.length - 2].percent;
                    if (latest < prev - 0.5) { // Dropped by more than 0.5% in a week
                        isLargeShareholderDropping = true;
                    }
                }
            }
        } catch (e) {
            console.error('[Chip Analysis] Error parsing chip data:', e);
        }

        // Fetch stock name from cache (populated by getIndustryMapping above)
        const stockName = ExchangeClient.getStockName(stockId) || stockId;

        // Extract close prices and volumes (ordered from oldest to newest)
        const closePrices = prices.map(p => p.close);
        const volumesInShares = prices.map(p => p.Trading_Volume * 1000);

        const latestData = prices[prices.length - 1];
        const latestClose = latestData.close;
        const latestHigh = latestData.max;
        const latestLow = latestData.min;
        const latestVolumeShares = latestData.Trading_Volume * 1000;
        
        // Calculate Real Turnover Rate (%)
        let turnoverRate = 0;
        if (totalShares && totalShares > 0) {
            turnoverRate = (latestVolumeShares / totalShares) * 100;
        }

        // Calculate 20-day average turnover rate as dynamic baseline
        let avg20Turnover = 0;
        if (totalShares && totalShares > 0) {
            const last20 = prices.slice(-20);
            const turnoverRates20 = last20.map(p => (p.Trading_Volume * 1000 / totalShares) * 100);
            avg20Turnover = turnoverRates20.reduce((a, b) => a + b, 0) / turnoverRates20.length;
        }

        // Calculate turnover multiple (current vs 20-day average)
        const turnoverMultiple = avg20Turnover > 0 ? turnoverRate / avg20Turnover : 0;

        // Calculate 5-day turnover trend for Signal 4 (洗盤縮量) & Signal 5 (對倒震盪)
        let last5TurnoverRates: number[] = [];
        if (totalShares && totalShares > 0) {
            last5TurnoverRates = prices.slice(-5).map(p => (p.Trading_Volume * 1000 / totalShares) * 100);
        }
        // Signal 5: All 5 days are above 1.5x average (persistent high turnover)
        const isTrending5DayHighTurnover = last5TurnoverRates.length === 5 && avg20Turnover > 0 &&
            last5TurnoverRates.every(r => r > avg20Turnover * 1.5);
        // Signal 4: Latest day turnover shrinks to below 0.5x average (locking chips)
        const isShrinkingTurnover = last5TurnoverRates.length > 0 && avg20Turnover > 0 &&
            last5TurnoverRates[last5TurnoverRates.length - 1] < avg20Turnover * 0.5;

        // Long upper shadow K-bar detection for Signal 2 refinement (高位長上影線)
        const latestOpen = latestData.open;
        const body = Math.abs(latestClose - latestOpen);
        const upperShadow = latestHigh - Math.max(latestClose, latestOpen);
        const hasLongUpperShadow = body > 0 && upperShadow > body * 2;

        // Calculate 5MA, 10MA, 20MA, 60MA
        const reversedClose = [...closePrices].reverse();
        const ma5  = calculateSMA(reversedClose, 5);
        const ma10 = calculateSMA(reversedClose, 10);
        const ma20 = calculateSMA(reversedClose, 20);
        const ma60 = calculateSMA(reversedClose, 60);

        // 【強剴1】均線排列判斷
        // 多頭排列：MA5 > MA20 > MA60 → 趨勢向上，綠燈可信度高
        // 空頭排列：MA5 < MA20 < MA60 → 趨勢向下，即使攞量也要降低可信度
        const isMaBullishAligned = !!(ma5 && ma20 && ma60 && ma5 > ma20 && ma20 > ma60);
        const isMaBearishAligned = !!(ma5 && ma20 && ma60 && ma5 < ma20 && ma20 < ma60);

        // Calculate MACD
        const macdData = calculateMACD(closePrices);
        // Anti-lag: use OSC (Histogram) direction instead of DIF zero-cross.
        // OSC > 0 AND expanding (OSC slope positive) confirms momentum ~1-2 bars earlier than DIF > 0.
        const isMacdPositive = macdData
            ? (macdData.osc > 0 && macdData.osc > macdData.prevOsc)
            : false;

        // Calculate Position %
        const periodPrices = reversedClose.slice(0, period);
        const periodMax = Math.max(...periodPrices);
        const periodMin = Math.min(...periodPrices);
        const positionPercent = periodMax === periodMin ? 0 : ((latestClose - periodMin) / (periodMax - periodMin)) * 100;

        // Calculate Turnover Heat (dynamic thresholds based on 20-day average)
        let isHighTurnover = false;
        let isExtremelyHighTurnover = false;

        if (totalShares && totalShares > 0 && avg20Turnover > 0) {
            // Dynamic: current > 2x 20-day average = high turnover
            isHighTurnover = turnoverRate > avg20Turnover * 2;
            // Dynamic: current > 4x 20-day average = extremely high turnover
            isExtremelyHighTurnover = turnoverRate > avg20Turnover * 4;
        } else if (totalShares && totalShares > 0) {
            // Static fallback when avg20 is unavailable
            isHighTurnover = turnoverRate > 5;
            isExtremelyHighTurnover = turnoverRate > 25;
        } else {
            // Fallback: compare to 5MA volume
            const reversedVolume = [...volumesInShares].reverse();
            const vol5MA = calculateSMA(reversedVolume, 5);
            isHighTurnover = vol5MA ? latestVolumeShares > (vol5MA * 2) : false;
            isExtremelyHighTurnover = vol5MA ? latestVolumeShares > (vol5MA * 4) : false;
        }



        // 【強化3】籌碼集中度評分 (Accumulation Score)
        let accumulationScore = 0;
        if (totalShares && totalShares > 0 && prices.length >= 20) {
            const lookbackDays = Math.min(60, prices.length - 20);
            if (lookbackDays > 0) {
                const startIndex = prices.length - lookbackDays;
                for (let i = startIndex; i < prices.length; i++) {
                    const currentClose = prices[i].close;
                    const currentPos = periodMax === periodMin ? 0 : ((currentClose - periodMin) / (periodMax - periodMin)) * 100;
                    
                    const past20Turnover = prices.slice(i - 20, i).map(p => (p.Trading_Volume * 1000 / totalShares) * 100);
                    const avg20Turn = past20Turnover.reduce((a, b) => a + b, 0) / 20;
                    const currentTurn = (prices[i].Trading_Volume * 1000 / totalShares) * 100;
                    
                    if (currentPos < 35 && currentTurn > avg20Turn * 1.5) {
                        accumulationScore++;
                    }
                }
            }
        }

        // 【強化5】計算量比 (Volume Ratio)
        let volumeRatio = 0;
        if (volumesInShares.length >= 6) {
            const last5Vol = volumesInShares.slice(volumesInShares.length - 6, volumesInShares.length - 1);
            const vol5MA = last5Vol.reduce((a, b) => a + b, 0) / 5;
            volumeRatio = vol5MA > 0 ? latestVolumeShares / vol5MA : 0;
        }

        // 【強化6】大盤相對強弱 (Relative Strength)
        let isRelativeStrengthHigh = false;
        try {
            if (taiexHistory.length >= 6 && prices.length >= 6) {
                const recentPrices = prices.slice(-6);
                let rsPositiveDays = 0;
                let taiexTotalChange = 0;
                
                for (let i = 1; i < recentPrices.length; i++) {
                    const stockDate = recentPrices[i].date;
                    const prevStockDate = recentPrices[i-1].date;
                    
                    const tDay = taiexHistory.find(t => t.date === stockDate);
                    const tPrevDay = taiexHistory.find(t => t.date === prevStockDate);
                    
                    if (tDay && tPrevDay) {
                        const stockChange = ((recentPrices[i].close - recentPrices[i-1].close) / recentPrices[i-1].close) * 100;
                        const marketChange = ((tDay.close - tPrevDay.close) / tPrevDay.close) * 100;
                        taiexTotalChange += marketChange;
                        if (stockChange > marketChange) {
                            rsPositiveDays++;
                        }
                    }
                }
                
                // 大盤偏弱或盤整 (近5日總漲幅<=0.5%)，但個股有3天以上跑贏大盤，且處於低位
                if (taiexTotalChange <= 0.5 && rsPositiveDays >= 3 && positionPercent < 35) {
                    isRelativeStrengthHigh = true;
                }
            }
        } catch (e) {
            console.error("[Relative Strength] Error:", e);
        }

        // === Distribution Warning: Three Precursor Signals ===

        // Precursor A: MACD Top Divergence — uses oscArray (Histogram) instead of difArray.
        // OSC divergence is detected 1~2 bars earlier than DIF divergence,
        // because the histogram is the most responsive component of MACD.
        let hasMacdDivergence = false;
        const macdFull = calculateMACDFull(closePrices);
        if (macdFull && closePrices.length >= 26) {
            const lookback = 20;
            const recentPrices = closePrices.slice(-lookback);
            // Use oscArray for earlier divergence detection
            const recentOsc = macdFull.oscArray.slice(-lookback);
            let prevPeakIdx = -1;
            let prevPeakPrice = -Infinity;
            for (let i = 1; i < lookback - 2; i++) {
                if (recentPrices[i] > recentPrices[i - 1] && recentPrices[i] >= recentPrices[i + 1]) {
                    if (recentPrices[i] > prevPeakPrice) {
                        prevPeakPrice = recentPrices[i];
                        prevPeakIdx = i;
                    }
                }
            }
            if (prevPeakIdx !== -1) {
                const currentPrice = recentPrices[lookback - 1];
                const currentOsc = recentOsc[lookback - 1];
                const prevPeakOsc = recentOsc[prevPeakIdx];
                // Price at or above prior high, but OSC (histogram) lower than at that peak
                hasMacdDivergence = currentPrice >= prevPeakPrice * 0.98 && currentOsc < prevPeakOsc;
            }
        }

        // Precursor B: Volume Decline at High Position (高位量能遞減)
        let isVolumeDeclineAtHigh = false;
        let isPriceDroppingWithVolumeDecline = false; // 【強化2】
        if (positionPercent > 60 && volumesInShares.length >= 10 && closePrices.length >= 5) {
            const last5Vol = volumesInShares.slice(-5);
            const decliningCount = last5Vol.filter((v, i) => i > 0 && v < last5Vol[i - 1]).length;
            const vol5Avg = last5Vol.reduce((a, b) => a + b, 0) / 5;
            const vol10Avg = volumesInShares.slice(-10).reduce((a, b) => a + b, 0) / 10;
            
            // 【強化2】股價方向區分
            const last5Close = closePrices.slice(-5);
            const priceDropPercent = ((last5Close[0] - last5Close[4]) / last5Close[0]) * 100;
            
            if (decliningCount >= 3 && vol5Avg < vol10Avg) {
                if (priceDropPercent > 3) {
                    isVolumeDeclineAtHigh = true;
                    isPriceDroppingWithVolumeDecline = true; // 量縮且價跌，緩慢出貨
                } else {
                    isVolumeDeclineAtHigh = false; // 量縮但價穩，鎖倉，不視為出貨前兆
                }
            }
        }

        // Precursor C: High Position Stagnation (高位橫盤滞漲)
        let highStagnationDays = 0;
        if (positionPercent > 60 && prices.length >= 10) {
            const recentPricesSlice = prices.slice(-10);
            const maxHighInSlice = Math.max(...recentPricesSlice.map(p => p.max));
            const lastIndexOfHigh = recentPricesSlice.map(p => p.max).lastIndexOf(maxHighInSlice);
            highStagnationDays = recentPricesSlice.length - 1 - lastIndexOfHigh;
        }
        const isHighStagnant = highStagnationDays >= 5;

        // Composite Distribution Warning Level
        const basePrecursorCount = [hasMacdDivergence, isVolumeDeclineAtHigh, isHighStagnant].filter(Boolean).length;
        // 【強化2】若量縮且價跌，前兆數額外 +1
        const distributionPrecursorCount = basePrecursorCount + (isPriceDroppingWithVolumeDecline ? 1 : 0);
        
        // 新增暴力出貨布林值
        const isViolentDistribution = positionPercent > 70 && (isExtremelyHighTurnover || (isHighTurnover && hasLongUpperShadow));
        
        let distributionLevel: 'safe' | 'watch' | 'warning' | 'alert' | 'fatal' = 'safe';
        let isLevel2Alert = false;

        // 【Level 2 籌碼實錘】大戶拋、散戶接
        if (positionPercent > 60 && isLargeShareholderDropping && isMarginIncreasing) {
            isLevel2Alert = true;
        }

        if (positionPercent > 60) {
            if (isLevel2Alert) {
                distributionLevel = 'fatal'; // 籌碼極度發散 (最高級別)
            } else if (isViolentDistribution || (distributionPrecursorCount >= 2 && (isHighTurnover || isExtremelyHighTurnover) && positionPercent > 70)) {
                distributionLevel = 'alert'; // 暴力出貨或放量衰退都屬於危險級別
            } else if (distributionPrecursorCount >= 2) {
                distributionLevel = 'warning';
            } else if (distributionPrecursorCount === 1) {
                distributionLevel = 'watch';
            } else {
                distributionLevel = 'safe'; // 高位但目前無出貨跡象
            }
        }
        // 低/中位（<=60%）：主力不在出貨區，一律標記為 safe

        // === 新增：主力進場四大特徵 (Smart Money Footprints) ===
        // 特徵 1: 紅黑K量能結構比 (Accumulation Volume Ratio)
        let accumulationVolumeRatio = 1;
        let isAccumulationVolume = false;
        if (prices.length >= 10) {
            const recent10 = prices.slice(-10);
            let upVolume = 0;
            let downVolume = 0;
            for (let i = 1; i < recent10.length; i++) {
                const p = recent10[i];
                const prevClose = recent10[i - 1].close;
                if (p.close > prevClose || p.close > p.open) {
                    upVolume += p.Trading_Volume;
                } else if (p.close < prevClose || p.close < p.open) {
                    downVolume += p.Trading_Volume;
                }
            }
            accumulationVolumeRatio = upVolume / (downVolume || 1);
            isAccumulationVolume = accumulationVolumeRatio > 1.5;
        }

        // 特徵 2: VCP 波動率收斂 (Volatility Contraction)
        let isVcpSqueeze = false;
        if (prices.length >= 20) {
            const getAtr = (pSlice: any[]) => pSlice.reduce((sum, p) => sum + ((p.max - p.min) / p.close), 0) / pSlice.length;
            const recent5Atr = getAtr(prices.slice(-5));
            const recent20Atr = getAtr(prices.slice(-20));
            isVcpSqueeze = recent5Atr < (recent20Atr * 0.5) && isShrinkingTurnover;
        }

        // 特徵 3: 威科夫破底翻洗盤 (Wyckoff Spring)
        let isWyckoffSpring = false;
        if (positionPercent < 35) {
            const latestBodyMax = Math.max(latestClose, latestOpen);
            const latestBodyMin = Math.min(latestClose, latestOpen);
            const lowerShadow = latestBodyMin - latestLow;
            const latestBody = latestBodyMax - latestBodyMin;
            isWyckoffSpring = latestBody > 0 
                ? (lowerShadow > latestBody * 2 && !isExtremelyHighTurnover)
                : (lowerShadow > latestClose * 0.015 && !isExtremelyHighTurnover);
        }

        // 特徵 4: 築底天數 (Base Building Duration)
        let baseBuildingDays = 0;
        let hasBaseBuilding = false;
        if (prices.length >= 15) {
            const recent15 = prices.slice(-15);
            for (const p of recent15) {
                const pos = periodMax === periodMin ? 0 : ((p.close - periodMin) / (periodMax - periodMin)) * 100;
                if (pos < 35) {
                    baseBuildingDays++;
                }
            }
            hasBaseBuilding = baseBuildingDays >= 10;
        }

        // === Early Accumulation Signals ===
        // Moderate volume: turnover 1.2x ~ 2x avg (warming up, not yet high)
        const isModerateVolume = avg20Turnover > 0
            ? turnoverRate > avg20Turnover * 1.2 && turnoverRate <= avg20Turnover * 2
            : false;
        // MACD just turned positive (anti-lag version):
        // Uses OSC (Histogram) zero-cross instead of DIF zero-cross.
        // OSC flips positive ~1-2 bars BEFORE DIF crosses zero, reducing signal lag.
        // Secondary condition: OSC expanding for 2+ consecutive bars (filters false positives).
        let isMacdJustTurnedPositive = false;
        if (macdFull && macdFull.oscArray.length >= 3) {
            const oscLen = macdFull.oscArray.length;
            const osc0 = macdFull.oscArray[oscLen - 3]; // 2 bars ago
            const osc1 = macdFull.oscArray[oscLen - 2]; // 1 bar ago
            const osc2 = macdFull.oscArray[oscLen - 1]; // latest
            // Primary: OSC crossed from negative to positive (zero-cross)
            const oscJustCrossed = osc1 < 0 && osc2 >= 0;
            // Secondary: OSC expanding upward for 2 bars (momentum building, filters false positives)
            const oscExpanding2Bars = osc2 > 0 && osc2 > osc1 && osc1 > osc0;
            isMacdJustTurnedPositive = oscJustCrossed || oscExpanding2Bars;
        }

        // 【強化4】計算 KD 指標與底背離
        const kdData = calculateKD(prices);
        let hasKDBottomDivergence = false;
        if (kdData && prices.length >= 20) {
            const currentK = kdData.kArray[kdData.kArray.length - 1];
            if (currentK < 20) { // 超賣區
                const lookback = 20;
                let prevLowIdx = -1;
                let prevLowPrice = Infinity;
                for (let i = prices.length - lookback; i < prices.length - 3; i++) {
                    if (prices[i].min < prevLowPrice) {
                        prevLowPrice = prices[i].min;
                        prevLowIdx = i;
                    }
                }
                if (prevLowIdx !== -1) {
                    const currentLow = latestLow;
                    const prevKValue = kdData.kArray[prevLowIdx];
                    // 股價創新低或持平，但K值未創新低
                    if (currentLow <= prevLowPrice * 1.02 && currentK > prevKValue) {
                        hasKDBottomDivergence = true;
                    }
                }
            }
        }

        // Prices will be dynamically calculated below after rules are evaluated

        // Logic Status
        let signalTag: string | null = null;
        let light = 'red';
        const rules: string[] = [];

        // Rule: MA20 trend check
        if (ma20 && latestClose < ma20) {
            rules.push('股價跌破 20 日均線，趨勢偏弱，請嚴格執行停損或觀望。');
        } else {
            rules.push('股價穩站 20 日均線之上，多頭格局維持。');
        }

        // Rule: MACD momentum
        if (isMacdPositive) {
            rules.push('MACD 維持零軸之上，具備上漲動能。');
        }

        // Rule: Five Signal Detection (Position + Turnover relationship)
        if (positionPercent < 35) {
            // Low position zone
            rules.push(`目前股價處於近 ${period} 日相對低位（<35%）。`);

            if (hasBaseBuilding && isAccumulationVolume && isVcpSqueeze) {
                light = 'green';
                signalTag = '🚀 絕佳擊球點 (主力控盤)';
                rules.push('【極強烈訊號】股價在低檔經過長時間築底（10天以上），上漲紅K量能明顯大於黑K（主力持續吃貨），且近5日波動率極致收斂（籌碼被徹底鎖定）。這代表主力已完美控盤，隨時可能迎來主升段爆發！建議：積極建倉，停損設於盤整區低點。');
            } else if (isWyckoffSpring) {
                light = 'green';
                signalTag = '破底翻洗盤 (Wyckoff Spring)';
                rules.push('低位出現長下影線的「破底翻」洗盤訊號！主力故意砸破重要支撐引發散戶停損，隨即在低檔將籌碼全數吸收並拉回。這是極具攻擊性的底部確認訊號。建議：可分批試單，以該根下影線最低點作為嚴格停損。');
            } else if (hasBaseBuilding && isAccumulationVolume) {
                light = 'green';
                signalTag = '隱蔽吸籌 (慢牛築底)';
                rules.push('股價在低檔已橫盤超過 10 天，且期間「紅K放量、黑K縮量」的結構非常明顯（量能比>1.5）。這顯示主力非常有耐心，正利用盤整溫和吸籌。爆發前可能毫無波瀾，但一旦發動漲勢通常穩健綿長。建議：可分批佈局 20%~30% 部位，耐心等待放量突破。');
            } else if (isVcpSqueeze) {
                light = 'green';
                signalTag = 'VCP 窒息量變盤倒數';
                rules.push('近期成交量極度萎縮，且K棒上下震幅比過去20天小了一半以上。這是浮額洗淨、「暴風雨前寧靜」的極致收斂型態。主力已將籌碼鎖定，隨時準備帶量發動。建議：提前卡位，等待帶量紅K出現即為發動點。');
            } else if (isHighTurnover) {
                if (isMaBearishAligned) {
                    light = 'yellow';
                    signalTag = '低位放量但趨勢向下';
                    rules.push('成交量放大，但 MA5 < MA20 < MA60，均線為空頭排列，趨勢尚未扭轉。放量可能是反彈賣壓而非主力進場。建議：觀望為主，等待均線由空轉多後再考慮介入。');
                } else {
                    light = 'green';
                    signalTag = isMaBullishAligned ? '低位放量建倉 (多頭確認)' : '低位放量建倉';
                    let maNote = isMaBullishAligned ? '；且 MA5>MA20>MA60 多頭排列，趨勢向上確認，可信度極高。' : '；均線尚未形成多頭排列，主力建倉信號屬中等。';
                    if (volumeRatio > 5) {
                        maNote += '（特別注意：今日爆出超過 5 日均量 5 倍以上的【天量】，顯示有極強力的資金強勢介入，但也伴隨極大波動風險）';
                    }
                    rules.push(`成交量明顯放大（超過近期均量2倍），主力正積極在低檔承接籌碼${maNote}建議：可分批買入，第一批買入30%部位，剩餘等量能持續放大後再加碼，以當日最低價為停損參考。`);
                }
            } else if (isMacdJustTurnedPositive) {
                light = 'green';
                signalTag = hasKDBottomDivergence ? '底部雙重確認 (強)' : 'MACD低位轉正';
                const kdNote = hasKDBottomDivergence ? '且同步出現 KD 超賣區底背離，是勝率極高的底部雙重確認訊號！' : '是技術面「由跌轉漲」的關鍵轉折訊號。';
                rules.push(`MACD動能指標剛從負值轉為正值，且股價處於極低位置，${kdNote}建議：可建立較積極的倉位（20%～30%），以20日均線為停損，確認量能跟上後再加碼。`);
            } else if (isModerateVolume && isMacdPositive) {
                light = 'green';
                signalTag = '底部量能回升';
                rules.push('底部成交量溫和回升（約為近期均量1.2~2倍），已有資金開始試探性進場，MACD動能轉正。建議：少量布局（10%～20%），若後續量能持續放大則逐步加碼至50%部位。');
            } else if (isShrinkingTurnover) {
                light = 'yellow';
                signalTag = '主力暗中佈局 (量縮)';
                rules.push('低位成交大幅縮小，市場浮額正在減少，有意願賣出的人越來越少，籌碼開始悄悄集中。這是主力可能正在暗中佈局的早期跡象，但MACD動能尚未確認轉正。建議：可用總資金5%~10%試探性建立少量倉位，停損設在近期低點下方，耐心等待MACD轉正或量能放大後再加碼。');
            } else {
                light = 'yellow';
                signalTag = '低位整理等待';
                rules.push('低位整理中，量能未有明顯變化，市場觀望情緒濃厚。目前尚無明確的主力介入跡象，但低位本身風險報酬比佳。建議：列入觀察清單，耐心等待量價結構改變（如VCP收斂或放量突破）後再考慮介入。');
            }
        } else if (positionPercent > 60) {
            // High position zone — 炒作尾聲警戒區 (放寬至 60% 監控緩跌出貨)
            rules.push(`目前股價處於近 ${period} 日相對高位（>${Math.round(positionPercent)}%）。`);
            
            if (isLevel2Alert) {
                light = 'red';
                signalTag = '籌碼極度發散 (大戶拋散戶接)';
                rules.push('🔴 【籌碼實錘預警】系統偵測到股價在高位區間，且真實籌碼出現「千張大戶持股連續下滑，但散戶融資餘額卻連續大增」的極度發散現象。這代表主力已經毫不掩飾地將手中持股倒給進場接盤的散戶。建議：不管技術線型多漂亮，這是主力出貨的絕對鐵證，請務必立即避開或清倉！');
            } else if (positionPercent > 70 && (isExtremelyHighTurnover || (isHighTurnover && hasLongUpperShadow))) {
                // Signal 2: 炒作尾聲 — 主力暴力出貨 (最高優先級)
                light = 'red';
                signalTag = hasLongUpperShadow ? '主力逢高倒貨 (避雷針)' : '主力高位暴力出貨';
                const vrWarning = volumeRatio > 5 ? '（今日爆出大於 5 倍均量的極端天量，拋售力道極為猛烈）' : '';
                if (hasLongUpperShadow) {
                    rules.push(`⚠️ 高位出現長上影線並伴隨放量${vrWarning}。這是主力趁市場熱情高漲大量賣出的典型訊號（俗稱「射擊之星」）。上影線越長，代表當日賣壓越強，大量散戶正在接盤。建議：無論獲利多少，必須立即減碼50%以上，切勿等待反彈。剩餘持股設嚴格停損，高位反彈即為出場機會。`);
                } else {
                    rules.push(`⚠️ 高位爆出超大量（超過近期均量4倍以上）${vrWarning}。這通常是主力藉助利多消息或市場狂熱，在最高點附近大量傾倒籌碼的訊號。散戶正在成為主力的接盤方。建議：見此訊號必須立即停損離場，寧可少賺，絕不在主力出貨時繼續持有。`);
                }
            } else if (distributionPrecursorCount >= 2) {
                // 次高優先級：動能衰竭/緩慢派發
                light = 'red';
                signalTag = '高位動能衰竭 (盤跌預警)';
                rules.push('⚠️ [趨勢風險] 股價出現多重衰退前兆 (如MACD頂背離、量能萎縮或高位滯漲)。主力可能正在利用盤整掩護，進行「溫水煮青蛙」式的緩慢派發。建議：提高警覺，跌破 20 日均線或跌破近期盤整區間底線時，必須立即停損/停利出場。');
            } else if (isTrending5DayHighTurnover && positionPercent > 70) {
                // Signal 5 in high zone: 對倒震盪 — 方向不明
                light = 'red';
                signalTag = '高位對倒震盪⛔';
                rules.push('⛔ 【高位勿追入】連續5日以上保持高換手，但股價在小範圍劇烈震盪而未有效突破。這可能是主力「左手換右手」製造熱鬧假象，或是在洗清短線浮額。高位追入風險極高，方向尚未明朗。建議：採觀望策略，不要追入熱鬧假象。若向下跌破支撐，立即離場。');
            } else if (distributionPrecursorCount === 1) {
                light = 'red';
                signalTag = '高位初現疲態⛔';
                rules.push('⛔ 【高位勿追入】高位出現單一衰退前兆 (如量能不濟或指標背離)。上漲動能已受阻，高位追入風險報酬比極差。建議：持股者縮緊移動停利空間，不宜再加碼。未持股者切勿追入。');
            } else if (isHighTurnover && positionPercent > 70) {
                // High turnover at high position, not extreme
                light = 'red';
                signalTag = '高位追漲風險⛔';
                rules.push('⛔ 【高位勿追入】高位出現明顯放量（超過均量2倍），多空激烈廝殺，往往是短期頂點特徵。高位追入風險極大。建議：持股者設定嚴格停利點（距成本+20%以上），絕對不追高加碼。若收盤出現長上影線，視為明確賣出訊號。');
            } else if (isShrinkingTurnover && positionPercent > 70) {
                // Signal 4 in high zone: 籌碼鎖定惜售
                light = 'red';
                signalTag = '高位量縮惜售⛔';
                rules.push('⛔ 【高位勿追入】高位量能萎縮，但股價未明顯下跌，籌碼鎖定，賣壓較輕。對未持股者而言，高位追入風險報酬比不佳。建議：未持股者不建議追高進場。持股者可繼續持有，設好移動停利保護獲利。若後續伴隨股價緩跌（大於3%），則為主力的「緩慢出貨」訊號。');
            } else {
                light = 'red';
                signalTag = '高位整理觀察⛔';
                rules.push('⛔ 【高位勿追入】股價在相對高位橫盤整理，量能平穩無特殊異常。高位追入風險報酬比不佳，目前不適合新資金進場。持股者繼續持有但需提高警戒，密切觀察是否出現出貨訊號，設好移動停利保護獲利。');
            }
        } else {
            // Middle position 30~60 — 炒作進行中觀察區
            rules.push(`目前股價處於近 ${period} 日中階位置（30%~60%）。`);
            if (isTrending5DayHighTurnover && !isHighTurnover) {
                // Signal 5 in middle zone: 連續換手但今日未特別放量
                light = 'yellow';
                signalTag = '中位對倒整理';
                rules.push('連續多日保持高換手，但股價在中間區間劇烈震盪。此為主力可能在洗清短線散戶浮額，是上漲途中常見的「中途洗盤」型態，也可能是主力開始減碼。建議：靜觀震盪結束後的突破方向。若帶量向上突破，是加碼信號；若跌破支撐，則需減碼。');            } else if (isHighTurnover) {
                // Signal 3: 炒作進行中 — 主力帶量突破
                light = 'green';
                signalTag = '主力突破拉升';
                rules.push('帶量突破盤整區，成交量超過近期均量2倍以上，是技術分析中最強力的買入訊號之一。「帶量」是關鍵——無量的突破隨時可能拉回，帶量突破代表大量買家在更高價格達成共識，上漲動能充沛。建議：可在突破當下追入30%部位，停損設在突破點下方。強勢突破往往不給回測機會，不要猶豫等待。');
            } else if (isShrinkingTurnover && isMacdPositive) {
                // Signal: 炒作中繼整理 — 中段縮量蓄勢（新增綠燈）
                light = 'green';
                signalTag = '中段縮量整理';
                rules.push('股價上漲一段後進入橫盤整理，成交量大幅萎縮（低於均量0.5倍），MACD動能持續為正。這是主力刻意壓盤洗清浮額的「中繼整理」型態，籌碼高度集中，主力並未出貨。建議：持股者耐心持有，這是最不應該賣出的時機。等待量能再度放大（超過均量1.5倍以上）、股價重新向上突破整理區間，通常迎來更強的第二波拉升。');
            } else if (isShrinkingTurnover) {
                // 中位量縮但MACD未確認
                light = 'yellow';
                signalTag = '中位量縮觀察';
                rules.push('中位成交量萎縮，股價暫時停頓。量縮本身不代表危險，但MACD動能尚未確認向上，方向仍不明朗。建議：已持股者可繼續持有，但暫不加碼。未持股者觀望為主，等待MACD轉正或量能放大後再評估進場時機。');
            } else {
                light = 'yellow';
                signalTag = '中位方向待定';
                rules.push('股價在中間位置橫盤，量能平穩無特殊變化，市場多空雙方都在等待驅動方向的訊號。建議：切忌在無量的中途隨意追入，等待帶量突破（向上）或量增跌破支撐（向下）後，再根據方向決定操作。');
            }
        }

        // 【強化6】大盤相對強弱附加說明
        if (isRelativeStrengthHigh && (light === 'green' || light === 'yellow')) {
            rules.push('🛡️ 【抗跌護盤】近期大盤走弱或盤整，但該股近5日多數時間表現優於大盤。逆勢抗跌通常代表主力資金在下方強勢護盤，後市一旦大盤回穩，有較高機率率先發動攻擊！');
            if (light === 'yellow') {
                signalTag = '逆勢抗跌 (主力護盤)';
            }
        }

        // Final strict red override: breaking below MA20 always = red
        if (ma20 && latestClose < ma20) {
            light = 'red';
            signalTag = null; // Reset signal tag when overridden to red
        }

        // Turnover rate display with dynamic baseline info
        if (totalShares && totalShares > 0) {
            if (avg20Turnover > 0) {
                rules.push(`(真實換手率: ${turnoverRate.toFixed(2)}%，20日均: ${avg20Turnover.toFixed(2)}%，為均值 ${turnoverMultiple.toFixed(1)} 倍)`);
            } else {
                rules.push(`(真實換手率: ${turnoverRate.toFixed(2)}%)`);
            }
        } else {
            rules.push(`(因缺少總股本資料，使用5日均量比對換手熱度)`);
        }

        // === 主力 AI 分析判斷與法人籌碼數據分析 ===
        let itConsecutiveBuyDays = 0;
        let foreignConsecutiveBuyDays = 0;
        let itAccumulation = 0;
        let foreignAccumulation = 0;

        try {
            if (institutionalBuySell && institutionalBuySell.length > 0) {
                const byDateAndName: Record<string, Record<string, number>> = {};
                institutionalBuySell.forEach((row: any) => {
                    const dt = row.date;
                    const net = (row.buy || 0) - (row.sell || 0);
                    if (!byDateAndName[dt]) {
                        byDateAndName[dt] = {};
                    }
                    byDateAndName[dt][row.name] = (byDateAndName[dt][row.name] || 0) + net;
                });

                const sortedDates = Object.keys(byDateAndName).sort((a, b) => b.localeCompare(a));

                // 投信連買
                for (let i = 0; i < sortedDates.length; i++) {
                    const dt = sortedDates[i];
                    const net = byDateAndName[dt]['Investment_Trust'] || 0;
                    if (net > 0) {
                        itConsecutiveBuyDays++;
                    } else if (net < 0) {
                        break;
                    }
                    if (net === 0 && i > 0) {
                        break;
                    }
                }

                // 外資連買
                for (let i = 0; i < sortedDates.length; i++) {
                    const dt = sortedDates[i];
                    const net = byDateAndName[dt]['Foreign_Investor'] || 0;
                    if (net > 0) {
                        foreignConsecutiveBuyDays++;
                    } else if (net < 0) {
                        break;
                    }
                    if (net === 0 && i > 0) {
                        break;
                    }
                }

                // 30日淨買超
                const last30Dates = sortedDates.slice(0, 30);
                last30Dates.forEach(dt => {
                    itAccumulation += byDateAndName[dt]['Investment_Trust'] || 0;
                    foreignAccumulation += byDateAndName[dt]['Foreign_Investor'] || 0;
                });
            }
        } catch (e) {
            console.error('[SmartNavigator Buy/Sell Parse Error]', e);
        }

        let masterStage: 'accumulation' | 'shakeout' | 'markup' | 'distribution' | 'none' = 'none';
        let confidence: 'high' | 'medium' | 'low' = 'low';
        let operationAdvice: 'buy' | 'hold' | 'sell' = 'hold';
        const stageEvidence: string[] = [];
        let masterPeriod = '5–15天';
        let masterLifeline = '5日均線(MA5)';

        if (masterType === 'insider') {
            masterPeriod = '5–15天';
            masterLifeline = '5日均線(MA5)';

            const isInsiderMarkup = !!(ma5 && latestClose > ma5 && volumeRatio > 1.5 && isMacdPositive && positionPercent >= 35);
            const isInsiderDistribution = !!(positionPercent > 60 && (distributionLevel === 'alert' || distributionLevel === 'fatal' || isViolentDistribution || (ma5 && latestClose < ma5 && isHighTurnover)));
            const isInsiderShakeout = !!((ma5 && latestClose < ma5) && (ma20 && latestClose >= ma20) && (isShrinkingTurnover || isVcpSqueeze || isWyckoffSpring));
            const isInsiderAccumulation = !!(positionPercent < 35 && (hasBaseBuilding || accumulationScore > 3 || isAccumulationVolume || isModerateVolume));

            if (isInsiderDistribution) {
                masterStage = 'distribution';
                operationAdvice = 'sell';
                if (isViolentDistribution) stageEvidence.push('高位出現暴力出貨，天量爆發');
                else if (ma5 && latestClose < ma5) stageEvidence.push('股價跌破5日生命線(MA5)');
                if (distributionLevel === 'alert' || distributionLevel === 'fatal') stageEvidence.push('主力動向預警顯示出貨狀態');
            } else if (isInsiderMarkup) {
                masterStage = 'markup';
                operationAdvice = 'buy';
                stageEvidence.push('股價穩站5日生命線(MA5)');
                stageEvidence.push('成交量明顯放大，拉抬動能充沛');
                if (isMaBullishAligned) stageEvidence.push('均線呈現多頭排列');
            } else if (isInsiderShakeout) {
                masterStage = 'shakeout';
                operationAdvice = 'hold';
                stageEvidence.push('股價跌破5MA，但守穩月線(MA20)');
                if (isShrinkingTurnover) stageEvidence.push('洗盤縮量，籌碼惜售');
                if (isVcpSqueeze) stageEvidence.push('VCP波動收斂，變盤在即');
            } else if (isInsiderAccumulation) {
                masterStage = 'accumulation';
                operationAdvice = 'buy';
                stageEvidence.push('股價處於低檔整理，主力低調吃貨');
                if (hasBaseBuilding) stageEvidence.push('低檔築底天數充足');
                if (accumulationScore > 3) stageEvidence.push(`主力累積吸籌 ${accumulationScore} 天`);
            } else {
                masterStage = 'none';
                operationAdvice = 'hold';
                stageEvidence.push('目前無明顯業內主力操盤跡象');
            }

            const insiderMatchCount = [
                isInsiderMarkup || isInsiderAccumulation || isInsiderShakeout || isInsiderDistribution,
                volumeRatio > 2,
                isMacdPositive,
                accumulationScore > 5
            ].filter(Boolean).length;
            confidence = insiderMatchCount >= 3 ? 'high' : insiderMatchCount === 2 ? 'medium' : 'low';

        } else if (masterType === 'institutional') {
            masterPeriod = '20–40天';
            masterLifeline = '10日均線(MA10)';

            const isInstMarkup = !!(itConsecutiveBuyDays >= 3 && ma10 && latestClose > ma10 && ma20 && latestClose > ma20);
            const isInstDistribution = !!((positionPercent > 60 && itAccumulation < 0) || (ma10 && latestClose < ma10 && itConsecutiveBuyDays === 0) || distributionLevel === 'alert');
            const isInstShakeout = !!((ma10 && latestClose < ma10) && (ma20 && latestClose >= ma20) && isShrinkingTurnover && itAccumulation > 0);
            const isInstAccumulation = !!(positionPercent < 50 && (itConsecutiveBuyDays > 0 || itAccumulation > 0) && (hasBaseBuilding || isAccumulationVolume));

            if (isInstDistribution) {
                masterStage = 'distribution';
                operationAdvice = 'sell';
                if (itAccumulation < 0) stageEvidence.push('投信近30日累積呈現淨賣超');
                if (ma10 && latestClose < ma10) stageEvidence.push('股價跌破10日生命線(MA10)');
                if (itConsecutiveBuyDays === 0) stageEvidence.push('投信買盤中斷或轉為賣超');
            } else if (isInstMarkup) {
                masterStage = 'markup';
                operationAdvice = 'buy';
                stageEvidence.push(`投信連續買超達 ${itConsecutiveBuyDays} 天`);
                stageEvidence.push('股價穩站10日生命線(MA10)與月線之上');
                if (isAccumulationVolume) stageEvidence.push('紅K帶量上漲，買氣暢旺');
            } else if (isInstShakeout) {
                masterStage = 'shakeout';
                operationAdvice = 'hold';
                stageEvidence.push('股價跌破10MA但月線(MA20)有撐');
                stageEvidence.push('成交量萎縮，投信並未大舉倒貨');
            } else if (isInstAccumulation) {
                masterStage = 'accumulation';
                operationAdvice = 'buy';
                stageEvidence.push('投信剛開始買超建倉');
                if (itAccumulation > 0) stageEvidence.push('投信近30日呈淨累積買超');
                if (hasBaseBuilding) stageEvidence.push('股價在低檔打底，浮額沈澱');
            } else {
                masterStage = 'none';
                operationAdvice = 'hold';
                stageEvidence.push('目前無投信認養與建倉跡象');
            }

            const instMatchCount = [
                itConsecutiveBuyDays >= 3,
                itAccumulation > 0,
                ma10 && latestClose > ma10,
                isAccumulationVolume
            ].filter(Boolean).length;
            confidence = instMatchCount >= 3 ? 'high' : instMatchCount === 2 ? 'medium' : 'low';

        } else if (masterType === 'foreign') {
            masterPeriod = '60–120天';
            masterLifeline = '60日均線(MA60/季線)';

            const prevMa60 = calculateSMA(reversedClose.slice(1), 60) || 0;
            const isForeignMarkup = !!(foreignConsecutiveBuyDays >= 5 && ma60 && latestClose > ma60 && ma60 > prevMa60);
            const isForeignDistribution = !!((positionPercent > 60 && foreignAccumulation < 0) || (ma60 && latestClose < ma60) || distributionLevel === 'alert');
            const isForeignShakeout = !!((ma20 && latestClose < ma20) && (ma60 && latestClose >= ma60) && isShrinkingTurnover && foreignAccumulation > 0);
            const isForeignAccumulation = !!(positionPercent < 50 && (foreignConsecutiveBuyDays > 0 || foreignAccumulation > 0) && (hasBaseBuilding || ma60));

            if (isForeignDistribution) {
                masterStage = 'distribution';
                operationAdvice = 'sell';
                if (ma60 && latestClose < ma60) stageEvidence.push('股價跌破60日生命線(季線)');
                if (foreignAccumulation < 0) stageEvidence.push('外資近期累積呈現淨倒貨');
            } else if (isForeignMarkup) {
                masterStage = 'markup';
                operationAdvice = 'buy';
                stageEvidence.push(`外資連續買超達 ${foreignConsecutiveBuyDays} 天`);
                stageEvidence.push('股價站穩季線(60MA)之上，且季線走平上揚');
                if (isMacdPositive) stageEvidence.push('長線趨勢與中線動能多頭確認');
            } else if (isForeignShakeout) {
                masterStage = 'shakeout';
                operationAdvice = 'hold';
                stageEvidence.push('股價回踩季線(60MA)或月線有撐');
                stageEvidence.push('高位拉回量縮，外資未見撤退');
            } else if (isForeignAccumulation) {
                masterStage = 'accumulation';
                operationAdvice = 'buy';
                stageEvidence.push('外資大資金於低檔默默建倉');
                if (hasBaseBuilding) stageEvidence.push('長線底部整理完成');
                if (foreignConsecutiveBuyDays > 0) stageEvidence.push(`外資開始溫和買進 ${foreignConsecutiveBuyDays} 天`);
            } else {
                masterStage = 'none';
                operationAdvice = 'hold';
                stageEvidence.push('目前無外資大波段建倉跡象');
            }

            const foreignMatchCount = [
                foreignConsecutiveBuyDays >= 5,
                foreignAccumulation > 0,
                ma60 && latestClose > ma60,
                isMacdPositive
            ].filter(Boolean).length;
            confidence = foreignMatchCount >= 3 ? 'high' : foreignMatchCount === 2 ? 'medium' : 'low';
        }

        // === 動態操作價格計算 (Dynamic Pricing) ===
        let displayBuyPrice: string | number = '觀望';
        let displayStopLoss: string | number = '--';
        let displayTp1: string | number = '觀望';
        let displayTp2: string | number = '觀望';

        if (operationAdvice === 'sell' || light === 'red' || distributionLevel === 'alert' || distributionLevel === 'warning') {
            // 紅燈、出貨中或主力建議賣出時，封鎖買點，防止散戶高位接刀
            displayBuyPrice = '觀望/避開';
            displayStopLoss = Number((ma20 || latestLow).toFixed(2)); // 已持股者維持停損線
            displayTp1 = '伺機停利';
            displayTp2 = '伺機停利';
        } else {
            // 綠燈或黃燈：根據型態給予實戰操作價
            let baseBuyPrice = (latestHigh + latestLow) / 2;
            let baseStopLoss = ma20 || latestLow;
            
            // 基礎波幅 (用來算等距停利)
            const atr = prices.length >= 10 ? 
                prices.slice(-10).reduce((sum, p) => sum + (p.max - p.min), 0) / 10 : 
                (latestHigh - latestLow || latestClose * 0.05);

            if (isWyckoffSpring) {
                // 破底翻：買價在收盤附近，嚴格停損設於下影線低點
                baseBuyPrice = latestClose;
                baseStopLoss = latestLow;
            } else if (isVcpSqueeze) {
                // VCP收斂：買在突破近5日高點，停損設於近5日低點
                const recent5High = Math.max(...prices.slice(-5).map(p => p.max));
                const recent5Low = Math.min(...prices.slice(-5).map(p => p.min));
                baseBuyPrice = recent5High;
                baseStopLoss = recent5Low;
            } else {
                // 預設多頭：若乖離過大，買價設於 5MA
                baseBuyPrice = ma5 ? Math.min(latestClose, ma5) : latestClose;
            }

            displayBuyPrice = Number(baseBuyPrice.toFixed(2));
            displayStopLoss = Number(baseStopLoss.toFixed(2));
            // 停利抓 3倍 與 6倍 波幅 (短中線)
            displayTp1 = Number((baseBuyPrice + atr * 3).toFixed(2));
            displayTp2 = Number((baseBuyPrice + atr * 6).toFixed(2));
        }

        return NextResponse.json({
            success: true,
            data: {
                stockId,
                stockName,
                light,
                signalTag,
                prices: {
                    buy: displayBuyPrice,
                    stopLoss: displayStopLoss,
                    tp1: displayTp1,
                    tp2: displayTp2,
                },
                metrics: {
                    close: latestClose,
                    ma5: ma5 ? Number(ma5.toFixed(2)) : null,
                    ma10: ma10 ? Number(ma10.toFixed(2)) : null,
                    ma20: ma20 ? Number(ma20.toFixed(2)) : null,
                    ma60: ma60 ? Number(ma60.toFixed(2)) : null,
                    isMaBullishAligned,
                    isMaBearishAligned,
                    positionPercent: Number(positionPercent.toFixed(1)),
                    isHighTurnover,
                    turnoverRate: turnoverRate > 0 ? Number(turnoverRate.toFixed(2)) : null,
                    avg20Turnover: avg20Turnover > 0 ? Number(avg20Turnover.toFixed(2)) : null,
                    turnoverMultiple: turnoverMultiple > 0 ? Number(turnoverMultiple.toFixed(1)) : null,
                    accumulationScore,
                    volumeRatio: Number(volumeRatio.toFixed(2)),
                    isStopLossFallback: !ma20
                },
                distribution: {
                    level: distributionLevel,
                    hasMacdDivergence,
                    isVolumeDeclineAtHigh,
                    isHighStagnant,
                    highStagnationDays,
                    precursorCount: distributionPrecursorCount,
                    isViolentDistribution,
                },
                interpretations: rules,
                // 新增主力AI分析判斷欄位
                masterType,
                masterStage,
                confidence,
                operationAdvice,
                stageEvidence,
                masterPeriod,
                masterLifeline,
                institutionalSignal: {
                    itConsecutiveBuyDays,
                    foreignConsecutiveBuyDays,
                    itAccumulation,
                    foreignAccumulation
                }
            }
        });
    } catch (error: any) {
        console.error('[SmartNavigator] Error:', error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
