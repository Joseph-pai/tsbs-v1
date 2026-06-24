import { FinMindClient, } from '@/lib/finmind';
import { FinMindExtras } from '@/lib/finmind';
import { ExchangeClient, normalizeAnyDate } from '@/lib/exchange';
import { evaluateStock, calculateVRatio, checkMaConstrict, checkVolumeIncreasing, checkGapUp, checkMarginSqueezeSignal } from './engine';
import { AnalysisResult, StockData } from '@/types';
import { format, subDays } from 'date-fns';
import { calculateSMA } from './indicators';

/**
 * Normalize date format: handles both ROC (民國 RRRY/MM/DD) and ISO (YYYY-MM-DD) formats
 * @param dateStr - Date string in ROC or ISO format
 * @returns ISO formatted date string (YYYY-MM-DD)
 */
function normalizeDate(dateStr: string): string {
    if (!dateStr) return dateStr;

    // Try ISO format first (YYYY-MM-DD)
    if (dateStr.match(/^\d{4}-\d{2}-\d{2}$/)) {
        return dateStr;
    }

    // Try ROC format (RRRY/MM/DD or RRR/MM/DD)
    const rocMatch = dateStr.match(/^(\d{2,3})\/(\d{2})\/(\d{2})$/);
    if (rocMatch) {
        const rocYear = parseInt(rocMatch[1]);
        const month = rocMatch[2];
        const day = rocMatch[3];
        const gregorianYear = rocYear + 1911;
        return `${gregorianYear}-${month}-${day}`;
    }

    // Return as-is if format unrecognized
    console.warn(`[normalizeDate] Unrecognized date format: ${dateStr}`);
    return dateStr;
}

/**
 * Normalize monthly revenue date to "YYYY-MM" format
 * Handles:
 *   - ISO month:   "2025-01"      → "2025-01"
 *   - ROC month:   "114/01"       → "2025-01"  (民國 114 + 1911 = 2025)
 *   - ROC full:    "114/01/01"    → "2025-01"
 *   - ISO full:    "2025-01-15"   → "2025-01"
 */
function normalizeMonthlyDate(dateStr: string): string {
    if (!dateStr) return '';
    const s = dateStr.trim();

    // ISO YYYY-MM (e.g. "2025-01")
    if (/^\d{4}-\d{2}$/.test(s)) return s;

    // ISO YYYY-MM-DD (e.g. "2025-01-15")
    const isoFull = s.match(/^(\d{4})-(\d{2})-\d{2}$/);
    if (isoFull) return `${isoFull[1]}-${isoFull[2]}`;

    // ROC RRR/MM or RRR/MM/DD (e.g. "114/01" or "114/01/01", 民國年)
    const rocMatch = s.match(/^(\d{2,3})\/(\d{1,2})(?:\/\d{1,2})?$/);
    if (rocMatch) {
        const gregorianYear = parseInt(rocMatch[1]) + 1911; // 民國年 + 1911 = 西元年
        const month = rocMatch[2].padStart(2, '0');
        return `${gregorianYear}-${month}`;
    }

    console.warn(`[normalizeMonthlyDate] Unrecognized monthly date format: ${dateStr}`);
    return s;
}
export const ScannerService = {
    /**
     * Stage 1: Discovery (兩階段篩選 - 避免超時)
     * 
     * Phase 1: 快速預篩（使用快照數據）
     * - 成交量 > 2000 股
     * - 紅 K 線（收盤 > 開盤）
     * - 按成交量排序，取前 200 名
     * 
     * Phase 2: 嚴格篩選（獲取完整歷史）
     * - 量能激增 3.5x
     * - 均線糾結 <2%
     * - 突破 3%
     * 
     * 寧缺毋濫：返回所有符合條件的股票（可能 0-15 支）
     */
    scanMarket: async (market: 'TWSE' | 'TPEX' = 'TWSE', settings?: { volumeWeight?: number, maWeight?: number, breakoutWeight?: number, rsWeight?: number }): Promise<{ results: AnalysisResult[], timing: any }> => {
        const t0 = Date.now();
        console.log(`[Scanner] Stage 1: Discovery (${market}) - 兩階段篩選（快速預篩 + 嚴格驗證）...`);

        // Load industry mapping
        const industryMapping = await ExchangeClient.getIndustryMapping();

        // Phase 1: 快速預篩（使用快照數據）
        const snapshot = await ExchangeClient.getAllMarketQuotes(market);
        const t1 = Date.now();

        if (snapshot.length === 0) {
            throw new Error('Market data not found. Please try again later.');
        }

        console.log(`[Scanner] Phase 1: Snapshot fetched - ${snapshot.length} stocks in ${t1 - t0}ms`);

        // 預篩選優化：調降成交量門檻至 1000 股，並按成交量排序
        const preFiltered = snapshot
            .filter(s => s.Trading_Volume > 1000 && s.close > s.open)
            .sort((a, b) => b.Trading_Volume - a.Trading_Volume)
            .slice(0, 200);

        const t2 = Date.now();
        console.log(`[Scanner] Phase 1: Pre-filtered to ${preFiltered.length} candidates in ${t2 - t1}ms`);

        // Phase 2: 對候選股票進行嚴格篩選（獲取完整歷史）
        const candidates: AnalysisResult[] = [];
        let processedCount = 0;
        let errorCount = 0;

        // 批次處理，每次 20 支（降低批次大小以避免超時）
        const batchSize = 20;
        for (let i = 0; i < preFiltered.length; i += batchSize) {
            const batch = preFiltered.slice(i, i + batchSize);

            const batchResults = await Promise.allSettled(
                batch.map(async (stock) => {
                    try {
                        // 獲取完整歷史數據（30 天）
                        const history = await ExchangeClient.getStockHistory(stock.stock_id);

                        if (history.length < 20) {
                            return null;
                        }

                        // 計算 MA5 和 MA20
                        const closes = history.map(s => s.close);
                        const ma5 = calculateSMA(closes.slice(-5), 5);
                        const ma20 = calculateSMA(closes.slice(-20), 20);

                        if (!ma5 || !ma20) return null;

                        // 計算量能倍數 (優化演算法：3日平均 vs 45日基線)
                        const volumes = history.map(s => s.Trading_Volume);
                        const vRatio = calculateVRatio(volumes);

                        const volThreshold = 2.5; // 動能爆發基本門檻設定為至少 2.5倍
                        const squeezeThreshold = 0.04; // 均線糾結帶統一設定為 4%
                        const breakoutThreshold = 0.035; // 突破幅度統一要求至少 3.5%

                        const maData = checkMaConstrict(ma5, ma20, squeezeThreshold);
                        const isBullish = ma5 > ma20;
                        const today = history[history.length - 1];
                        const prevClose = history[history.length - 2].close;
                        const changePercent = (today.close - prevClose) / prevClose;

                        const isBreakout = today.close > Math.max(ma5, ma20) && changePercent >= breakoutThreshold;

                        // 三大信號共振（參考傳入設定或預設值）
                        if (vRatio >= volThreshold && maData.isSqueezing && isBreakout && isBullish) {
                            console.log(`[Scanner] ✓ Found: ${stock.stock_id} ${stock.stock_name} - V:${vRatio.toFixed(1)}x, MA:${(maData.constrictValue * 100).toFixed(1)}%, Break:${(changePercent * 100).toFixed(1)}%`);

                            const result: AnalysisResult = {
                                stock_id: stock.stock_id,
                                stock_name: stock.stock_name,
                                sector_name: industryMapping[stock.stock_id.trim()] || '其他',
                                close: today.close,
                                change_percent: changePercent,
                                score: 0, // Placeholder
                                v_ratio: parseFloat(vRatio.toFixed(2)),
                                is_ma_aligned: maData.isSqueezing,
                                is_ma_breakout: isBreakout,
                                is_bullish: isBullish,
                                consecutive_buy: 0,
                                poc: today.close,
                                verdict: '三大信號共振 - 爆發前兆',
                                tags: ['DISCOVERY', 'VOLUME_EXPLOSION', 'MA_SQUEEZE', 'BREAKOUT'],
                                dailyVolumeTrend: volumes.slice(-10),
                                maConstrictValue: maData.constrictValue,
                                today_volume: today.Trading_Volume,
                                volumeIncreasing: checkVolumeIncreasing(volumes),
                                warnings: [],
                                comprehensiveScoreDetails: {
                                    volumeScore: 0,
                                    maScore: 0,
                                    chipScore: 0,
                                    total: 0
                                }
                            };
                            return result;
                        }

                        return null;
                    } catch (error) {
                        console.warn(`[Scanner] Error processing ${stock.stock_id}:`, error);
                        return null;
                    }
                })
            );

            // 收集結果
            batchResults.forEach(result => {
                processedCount++;
                if (result.status === 'fulfilled' && result.value) {
                    candidates.push(result.value);
                } else if (result.status === 'rejected') {
                    errorCount++;
                }
            });

            console.log(`[Scanner] Phase 2: Progress ${processedCount}/${preFiltered.length} (Found: ${candidates.length})`);
        }

        const t3 = Date.now();

        console.log(`[Scanner] Stage 1 完成：發現 ${candidates.length} 支符合三大信號共振的股票`);
        console.log(`[Scanner] 總耗時: ${t3 - t0}ms (預篩: ${t2 - t1}ms, 深度: ${t3 - t2}ms)`);

        // 按量能倍數排序
        const sorted = candidates.sort((a, b) => b.v_ratio - a.v_ratio);

        return {
            results: sorted,
            timing: {
                snapshot: t1 - t0,
                preFilter: t2 - t1,
                deepAnalysis: t3 - t2,
                total: t3 - t0,
                processed: processedCount,
                errors: errorCount,
                preFilteredCount: preFiltered.length
            }
        };
    },

    /**
     * Stage 2: Filtering (投信連買 + 法人同步 + 量能遞增)
     */
    filterStocks: async (stockIds: string[], settings?: { volumeWeight?: number, maWeight?: number, breakoutWeight?: number, rsWeight?: number }): Promise<{ results: AnalysisResult[], timing: any }> => {
        const t0 = Date.now();
        console.log(`[Scanner] Stage 2: Filtering - 深度篩選 ${stockIds.length} 支股票...`);

        const filtered: AnalysisResult[] = [];

        for (const stockId of stockIds) {
            try {
                const result = await ScannerService.analyzeStock(stockId, settings);
                if (!result) continue;

                // Stage 2 篩選條件
                const hasInstBuying = result.consecutive_buy >= 3;
                const hasVolumeIncreasing = result.volumeIncreasing === true;
                const isAboveMA = result.is_ma_breakout;

                // 綜合評分 > 0.4 或滿足任意兩個條件
                const passCount = [hasInstBuying, hasVolumeIncreasing, isAboveMA].filter(Boolean).length;

                if (result.score > 0.4 || passCount >= 2) {
                    filtered.push(result);
                }
            } catch (error) {
                console.warn(`[Scanner] Error filtering ${stockId}:`, error);
            }
        }

        // 按綜合評分排序，取前 30 名
        const top30 = filtered
            .sort((a, b) => b.score - a.score)
            .slice(0, 30);

        const t1 = Date.now();
        console.log(`[Scanner] Stage 2 完成：篩選出 ${top30.length} 支強勢股`);

        return {
            results: top30,
            timing: { total: t1 - t0 }
        };
    },

    /**
     * Stage 3: Individual Analysis (個股完整分析)
     * Optimized with Redis Raw Data Caching
     */
    /**
     * 短線過濾掃描（六大改進策略）
     * 完全獨立，不影響任何現有掃描邏輯。
     *
     * 策略一：大盤位階濾網（動態門檻）
     * 策略二：掃出數量品質控制
     * 策略三：VCP 波動率收縮（必要條件）
     * 策略四：RS 相對強度硬性排除
     * 策略五：60 日股價位階硬性過濾
     * 策略六：成交量型態質化
     */
    scanShortTerm: async (
        market: 'TWSE' | 'TPEX' = 'TWSE',
        sector?: string,
        userMode: 'auto' | 'loose' | 'medium' | 'strict' = 'auto'
    ): Promise<{
        results: AnalysisResult[];
        meta: {
            marketLevel: number;
            marketMode: 'normal' | 'strict' | 'extreme';
            qualityLevel: 'gold' | 'normal' | 'warning' | 'danger';
            qualityLabel: string;
            totalFiltered: number;
            fallbackMode: boolean;
            indexFailedWarning?: string;
        };
        timing: any;
    }> => {
        const t0 = Date.now();
        console.log(`[ShortTermScan] 開始短線過濾掃描 (${market})...`);

        // ── 策略一：取得大盤位階 ────────────────────────────────
        let marketLevel = 0.5; // 預設中性（fallback 到嚴格模式）
        let fallbackMode = false;
        let indexFailedWarning: string | undefined;
        let taiexHistory: any[] = [];

        try {
            const todayStr = format(new Date(), 'yyyy-MM-dd');
            const redis = (await import('@/lib/redis')).redis;

            // 嘗試從 Redis 快取取得大盤資料（TTL 4 小時）
            const indexCacheKey = `tsbs:raw:index:TAIEX60:${todayStr}`;
            try {
                const cached = await redis.get(indexCacheKey);
                if (cached) taiexHistory = JSON.parse(cached);
            } catch (_) {}

            if (taiexHistory.length < 10) {
                const startDate = format(subDays(new Date(), 90), 'yyyy-MM-dd');
                taiexHistory = await FinMindClient.getDailyStats({
                    stockId: 'TAIEX',
                    startDate,
                    endDate: todayStr
                });
                if (taiexHistory.length > 0) {
                    try { await redis.set(indexCacheKey, JSON.stringify(taiexHistory), 'EX', 14400); } catch (_) {}
                }
            }

            if (taiexHistory.length >= 60) {
                const recent60 = taiexHistory.slice(-60);
                const closes60 = recent60.map((d: any) => d.close || d.Close || 0).filter((v: number) => v > 0);
                if (closes60.length >= 10) {
                    const min60 = Math.min(...closes60);
                    const max60 = Math.max(...closes60);
                    const currentClose = closes60[closes60.length - 1];
                    marketLevel = max60 > min60 ? (currentClose - min60) / (max60 - min60) : 0.5;
                }
            } else if (taiexHistory.length >= 10) {
                // 資料不足 60 日時用現有資料估算
                const closes = taiexHistory.slice(-Math.min(taiexHistory.length, 60)).map((d: any) => d.close || d.Close || 0).filter((v: number) => v > 0);
                const min = Math.min(...closes);
                const max = Math.max(...closes);
                const current = closes[closes.length - 1];
                marketLevel = max > min ? (current - min) / (max - min) : 0.5;
            }
        } catch (e: any) {
            fallbackMode = true;
            indexFailedWarning = '無法取得大盤資料，已切換至嚴格模式';
            marketLevel = 0.65; // fallback 到嚴格模式邊界
            console.warn('[ShortTermScan] 大盤資料獲取失敗，使用 fallback 嚴格模式:', e.message);
        }

        // 根據大盤位階決定動態門檻
        let marketMode: 'normal' | 'strict' | 'extreme';
        let volThreshold: number;   // 量能門檻倍數
        let breakoutThreshold: number; // 突破幅度門檻

        if (userMode === 'loose') {
            marketMode = 'normal';
            volThreshold = 2.5;
            breakoutThreshold = 0.035;
        } else if (userMode === 'medium') {
            marketMode = 'strict';
            volThreshold = 3.5;
            breakoutThreshold = 0.05;
        } else if (userMode === 'strict') {
            marketMode = 'extreme';
            volThreshold = 5.0;
            breakoutThreshold = 0.05;
        } else {
            // 自動模式：依據大盤位階決定
            if (marketLevel < 0.60) {
                marketMode = 'normal';
                volThreshold = 2.5;
                breakoutThreshold = 0.035;
            } else if (marketLevel <= 0.80) {
                marketMode = 'strict';
                volThreshold = 3.5;
                breakoutThreshold = 0.05;
            } else {
                marketMode = 'extreme';
                volThreshold = 5.0;
                breakoutThreshold = 0.05;
            }
        }

        console.log(`[ShortTermScan] 大盤位階: ${(marketLevel * 100).toFixed(1)}% → 模式: ${marketMode} (V門檻: ${volThreshold}x, 突破: ${(breakoutThreshold * 100).toFixed(1)}%)`);

        // ── 取得大盤 10 日漲幅（供策略四 RS 計算）──────────────
        let indexReturn10 = 0;
        if (taiexHistory.length >= 10) {
            const idx10 = taiexHistory.slice(-10);
            const idxCloses = idx10.map((d: any) => d.close || d.Close || 0).filter((v: number) => v > 0);
            if (idxCloses.length >= 2) {
                indexReturn10 = (idxCloses[idxCloses.length - 1] - idxCloses[0]) / idxCloses[0];
            }
        }

        // ── 取得市場快照 ────────────────────────────────────────
        const snapshot = await ExchangeClient.getAllMarketQuotes(market);
        const t1 = Date.now();

        if (snapshot.length === 0) {
            throw new Error('市場資料取得失敗');
        }

        // 預篩：紅 K + 成交量 > 1000，按成交量排序取前 200
        const preFiltered = snapshot
            .filter(s => s.Trading_Volume > 1000 && s.close > s.open)
            .sort((a, b) => b.Trading_Volume - a.Trading_Volume)
            .slice(0, 200);

        console.log(`[ShortTermScan] 預篩完成：${preFiltered.length} 支候選`);

        // Load industry mapping
        const industryMapping = await ExchangeClient.getIndustryMapping();

        // ── 深度篩選（逐股應用六大策略）────────────────────────
        const passed: AnalysisResult[] = [];
        let processedCount = 0;

        const batchSize = 20;
        for (let i = 0; i < preFiltered.length; i += batchSize) {
            const batch = preFiltered.slice(i, i + batchSize);

            const batchResults = await Promise.allSettled(
                batch.map(async (stock) => {
                    try {
                        // 獲取 60 日歷史（使用 Redis 快取，與其他掃描共享）
                        const todayStr = format(new Date(), 'yyyy-MM-dd');
                        const redis = (await import('@/lib/redis')).redis;

                        let prices: any[] = [];
                        const priceCacheKey = `tsbs:raw:hist:${stock.stock_id}:${todayStr}`;
                        try {
                            const cached = await redis.get(priceCacheKey);
                            if (cached) prices = JSON.parse(cached);
                        } catch (_) {}

                        if (prices.length < 25) {
                            const startDate = format(subDays(new Date(), 90), 'yyyy-MM-dd');
                            try {
                                prices = await FinMindClient.getDailyStats({
                                    stockId: stock.stock_id,
                                    startDate,
                                    endDate: todayStr
                                });
                            } catch (_) {
                                prices = await ExchangeClient.getStockHistory(stock.stock_id);
                            }
                            if (prices.length > 0) {
                                try { await redis.set(priceCacheKey, JSON.stringify(prices), 'EX', 14400); } catch (_) {}
                            }
                        }

                        if (prices.length < 20) return null;

                        const closes = prices.map((p: any) => p.close);
                        const volumes = prices.map((p: any) => p.Trading_Volume);
                        const today = prices[prices.length - 1];
                        const prevClose = prices[prices.length - 2]?.close || today.close;
                        const changePercent = prevClose > 0 ? (today.close - prevClose) / prevClose : 0;

                        // ── 策略五：60 日股價位階硬性過濾 ──────────────
                        const lookback = Math.min(prices.length, 60);
                        const recent60Closes = closes.slice(-lookback);
                        const min60 = Math.min(...recent60Closes);
                        const max60 = Math.max(...recent60Closes);
                        const positionRatio = max60 > min60 ? (today.close - min60) / (max60 - min60) : 0.5;

                        // 極嚴格模式：只接受 60 日位階 < 40% 的股票
                        if (marketMode === 'extreme' && positionRatio >= 0.40) return null;
                        // 一般過濾：位階 > 80% 直接排除
                        if (positionRatio > 0.80) return null;

                        // ── 建立突破前（不含今日）的歷史陣列 ──────────────
                        const priorVolumes = volumes.slice(0, -1);
                        const priorPrices = prices.slice(0, -1);

                        // ── 策略六：成交量型態質化 ───────────────────────
                        // 均量計算均不包含「今日（突破日）」，才能真實反映突破前的收縮狀態
                        const priorVol20Avg = priorVolumes.length >= 20 ? priorVolumes.slice(-20).reduce((a: number, b: number) => a + b, 0) / 20 : 0;
                        const priorVol45Avg = priorVolumes.length > 0 ? priorVolumes.slice(-45).reduce((a: number, b: number) => a + b, 0) / Math.min(priorVolumes.length, 45) : 0;

                        // 條件 1：今日量 > 突破前 45 日均量 × volThreshold
                        const todayVol = today.Trading_Volume;
                        if (priorVol45Avg <= 0 || todayVol < priorVol45Avg * volThreshold) return null;

                        // 條件 2：前 2-3 日為縮量（前日量 < 突破前 20 日均量 × 0.8）
                        const prevVol1 = priorVolumes[priorVolumes.length - 1] || 0; // 昨天
                        const prevVol2 = priorVolumes[priorVolumes.length - 2] || 0; // 前天
                        const hasPriorShrink = prevVol1 < priorVol20Avg * 0.8 || prevVol2 < priorVol20Avg * 0.8;
                        if (!hasPriorShrink) return null;

                        // 條件 3：突破日陽線，上影線 < 實體 50%
                        const openPrice = today.open !== undefined ? today.open : prevClose;
                        const body = Math.abs(today.close - openPrice);
                        const upperShadow = today.max - Math.max(today.close, openPrice);
                        const isBullishCandle = today.close > openPrice;
                        if (!isBullishCandle) return null;
                        if (body > 0 && upperShadow > body * 0.5) return null;

                        // ── 策略三：VCP 波動率收縮（四條件全滿足）──────────
                        const getAtr = (slice: any[]) =>
                            slice.reduce((sum, p) => sum + (p.max > 0 && p.close > 0 ? (p.max - p.min) / p.close : 0), 0) / slice.length;

                        // 同樣使用排除今日的 priorPrices 計算突破前的收縮情形
                        const recent5Atr = priorPrices.length >= 5 ? getAtr(priorPrices.slice(-5)) : 999;
                        const recent20Atr = priorPrices.length >= 20 ? getAtr(priorPrices.slice(-20)) : 999;
                        const priorVol5Avg = priorVolumes.length >= 5 ? priorVolumes.slice(-5).reduce((a: number, b: number) => a + b, 0) / 5 : 0;

                        // VCP 條件 1：突破前 5 日 ATR < 突破前 20 日 ATR × 60%
                        if (recent5Atr >= recent20Atr * 0.60) return null;
                        // VCP 條件 2：突破前 5 日均量 < 突破前 20 日均量 × 70%
                        if (priorVol5Avg >= priorVol20Avg * 0.70) return null;
                        // VCP 條件 3：突破日爆量 > 突破前 20 日均量 × 2.5
                        if (todayVol < priorVol20Avg * 2.5) return null;

                        // ── 策略四：RS 相對強度硬性排除 ──────────────────
                        let stockReturn10 = 0;
                        if (prices.length >= 10) {
                            const stock10 = closes.slice(-10);
                            stockReturn10 = stock10[0] > 0 ? (stock10[stock10.length - 1] - stock10[0]) / stock10[0] : 0;
                        }

                        // 個股 10 日漲幅 < 大盤 10 日漲幅 - 2% → 直接排除
                        if (indexReturn10 !== 0 && stockReturn10 < indexReturn10 - 0.02) return null;

                        // RS 加分
                        let rsBonus = 0;
                        if (stockReturn10 > indexReturn10 + 0.03) rsBonus = 5;

                        // ── 計算綜合評分 ──────────────────────────────────
                        const vRatio = priorVol45Avg > 0 ? todayVol / priorVol45Avg : 0;

                        // 位階加分：低位優先
                        const positionBonus = positionRatio < 0.40 ? 10 : positionRatio < 0.60 ? 5 : 0;

                        // 突破幅度評分
                        const breakoutScore = changePercent >= breakoutThreshold ? 30 : changePercent >= breakoutThreshold * 0.7 ? 15 : 0;

                        // 量能評分
                        const volumeScore = vRatio >= volThreshold * 1.5 ? 40 : vRatio >= volThreshold ? 25 : 0;

                        // VCP 收縮程度評分
                        const vcpScore = recent20Atr > 0 ? Math.max(0, 10 - (recent5Atr / recent20Atr) * 10) : 0;

                        const totalScore = volumeScore + breakoutScore + positionBonus + vcpScore + rsBonus;

                        // 最低門檻：至少 55 分才輸出
                        if (totalScore < 55) return null;

                        const ma5 = closes.slice(-5).reduce((a: number, b: number) => a + b, 0) / 5;
                        const ma20 = closes.length >= 20 ? closes.slice(-20).reduce((a: number, b: number) => a + b, 0) / 20 : ma5;
                        const isMaAligned = today.close > ma5 && ma5 > ma20;

                        const tags: string[] = ['SHORT_TERM', 'VCP_SQUEEZE', 'VOLUME_EXPLOSION'];
                        if (positionRatio < 0.40) tags.push('LOW_POSITION');
                        if (rsBonus > 0) tags.push('RS_STRONG');
                        if (hasPriorShrink) tags.push('PRIOR_SHRINK');

                        const result: AnalysisResult = {
                            stock_id: stock.stock_id,
                            stock_name: stock.stock_name,
                            sector_name: industryMapping[stock.stock_id.trim()] || '其他',
                            close: today.close,
                            change_percent: changePercent,
                            score: Math.min(1, totalScore / 100),
                            v_ratio: parseFloat(vRatio.toFixed(2)),
                            is_ma_aligned: isMaAligned,
                            is_ma_breakout: changePercent >= breakoutThreshold,
                            is_bullish: isMaAligned,
                            consecutive_buy: 0,
                            poc: today.close,
                            verdict: `VCP收縮+爆量突破 | 位階${(positionRatio * 100).toFixed(0)}% | ${marketMode === 'normal' ? '正常市場' : marketMode === 'strict' ? '嚴格市場' : '極嚴格市場'}`,
                            tags: tags as any,
                            warnings: [],
                            dailyVolumeTrend: volumes.slice(-10),
                            maConstrictValue: ma20 > 0 ? Math.abs(ma5 - ma20) / ma20 : 0,
                            today_volume: todayVol,
                            volumeIncreasing: false,
                            is_recommended: true,
                            comprehensiveScoreDetails: {
                                volumeScore: parseFloat(volumeScore.toFixed(2)),
                                maScore: parseFloat(vcpScore.toFixed(2)),
                                chipScore: parseFloat(breakoutScore.toFixed(2)),
                                rsScore: parseFloat((rsBonus + positionBonus).toFixed(2)),
                                total: parseFloat(totalScore.toFixed(2))
                            }
                        };

                        return result;
                    } catch (e) {
                        console.warn(`[ShortTermScan] Error processing ${stock.stock_id}:`, e);
                        return null;
                    }
                })
            );

            batchResults.forEach(r => {
                processedCount++;
                if (r.status === 'fulfilled' && r.value) {
                    passed.push(r.value);
                }
            });

            console.log(`[ShortTermScan] 進度 ${processedCount}/${preFiltered.length}，已通過 ${passed.length} 支`);
        }

        const t2 = Date.now();

        // ── 策略二：數量品質警示與自動控制 ─────────────────────
        let qualityLevel: 'gold' | 'normal' | 'warning' | 'danger';
        let qualityLabel: string;
        const totalFiltered = passed.length;

        let finalResults = [...passed].sort((a, b) =>
            (b.comprehensiveScoreDetails?.total || 0) - (a.comprehensiveScoreDetails?.total || 0)
        );

        if (totalFiltered < 20) {
            qualityLevel = 'gold';
            qualityLabel = '🥇 黃金時機：掃出數量少，品質精純';
        } else if (totalFiltered <= 50) {
            qualityLevel = 'normal';
            qualityLabel = '✅ 正常品質';
        } else if (totalFiltered <= 80) {
            qualityLevel = 'warning';
            qualityLabel = '⚠️ 市場過熱：取高分前 30 支';
            finalResults = finalResults.slice(0, 30);
        } else {
            qualityLevel = 'danger';
            qualityLabel = '🚨 嚴重警示：高位假突破風險，僅顯示前 15 支';
            finalResults = finalResults.slice(0, 15);
        }

        console.log(`[ShortTermScan] 完成：${finalResults.length} 支通過（原始 ${totalFiltered} 支）`);
        console.log(`[ShortTermScan] 總耗時: ${t2 - t0}ms`);

        return {
            results: finalResults,
            meta: {
                marketLevel,
                marketMode,
                qualityLevel,
                qualityLabel,
                totalFiltered,
                fallbackMode,
                ...(indexFailedWarning ? { indexFailedWarning } : {})
            },
            timing: {
                snapshot: t1 - t0,
                deepFilter: t2 - t1,
                total: t2 - t0,
                processed: processedCount,
                preFilteredCount: preFiltered.length
            }
        };
    },

    analyzeStock: async (
        stockId: string, 
        settings?: { volumeWeight?: number, maWeight?: number, breakoutWeight?: number, rsWeight?: number }, 
        stockName?: string, 
        industryMapping?: Record<string, string>, 
        indexData?: any,
        enhanced?: boolean
    ): Promise<AnalysisResult | null> => {
        const warnings: string[] = [];
        try {
            const todayStr = format(new Date(), 'yyyy-MM-dd');
            const redis = (await import('@/lib/redis')).redis;

            // 1. Fetch Price History (Cache: 4h)
            let prices: StockData[] = [];
            const priceCacheKey = `tsbs:raw:hist:${stockId}:${todayStr}`;
            try {
                const cached = await redis.get(priceCacheKey);
                if (cached) prices = JSON.parse(cached);
            } catch (e) { console.warn('Redis read error (price):', e); }

            if (prices.length < 25) {
                try {
                    const endDate = todayStr;
                    const startDate = format(subDays(new Date(), 60), 'yyyy-MM-dd');
                    prices = await FinMindClient.getDailyStats({ stockId, startDate, endDate });
                } catch (e) {
                    console.warn(`[Analyze] FinMind price failed for ${stockId}, fallback to Exchange...`);
                }
                if (prices.length < 25) {
                    console.warn(`[Analyze] FinMind returned insufficient data (${prices.length} days) for ${stockId}, using Exchange fallback...`);
                    warnings.push('Price data fallback to secondary source');
                    try {
                        prices = await ExchangeClient.getStockHistory(stockId);
                    } catch (e) {
                        console.error(`[Analyze] Exchange fallback also failed for ${stockId}:`, e);
                    }
                }
                if (prices.length > 0) {
                    try { await redis.set(priceCacheKey, JSON.stringify(prices), 'EX', 14400); } catch (e) { }
                }
            }

            // 1. Fetch Prices already done in analyzeStock entry logic or within this try block
            // 2. Fetch Institutional Flow (Cache: 4h)
            let insts: any[] = [];
            const instCacheKey = `tsbs:raw:inst:${stockId}:${todayStr}`;
            try {
                const cached = await redis.get(instCacheKey);
                if (cached) insts = JSON.parse(cached);
            } catch (e) { console.warn('Redis read error (inst):', e); }

            if (insts.length === 0) {
                try {
                    insts = await FinMindClient.getInstitutional({
                        stockId,
                        startDate: format(subDays(new Date(), 10), 'yyyy-MM-dd'),
                        endDate: todayStr
                    });
                    if (insts.length > 0) {
                        try { await redis.set(instCacheKey, JSON.stringify(insts), 'EX', 14400); } catch (e) { }
                    }
                } catch (e) {
                    console.warn(`[Analyze] Inst fetch failed for ${stockId}`);
                    warnings.push('Missing institutional flow data (FinMind error)');
                }
            }

            // 3. Fetch Monthly Revenue (Cache: 12h)
            let rev: any[] = [];
            const revCacheKey = `tsbs:raw:rev:${stockId}:${todayStr}`;
            try {
                const cached = await redis.get(revCacheKey);
                if (cached) rev = JSON.parse(cached);
            } catch (e) { console.warn('Redis read error (rev):', e); }

            if (rev.length === 0) {
                try {
                    const revStart = format(subDays(new Date(), 400), 'yyyy-MM-dd');
                    rev = await FinMindExtras.getMonthlyRevenue({ stockId, startDate: revStart, endDate: todayStr });
                    if (rev.length > 0) {
                        try { await redis.set(revCacheKey, JSON.stringify(rev), 'EX', 43200); } catch (e) { }
                    }
                } catch (e) {
                    console.warn(`[Analyze] Revenue fetch failed for ${stockId}`);
                    warnings.push('Monthly revenue data unavailable');
                }
            }

            // 4. Fetch Margin Trading Data (Cache: 4h)
            let marginData: any[] = [];
            const marginCacheKey = `tsbs:raw:margin:${stockId}:${todayStr}`;
            try {
                const cached = await redis.get(marginCacheKey);
                if (cached) marginData = JSON.parse(cached);
            } catch (e) { console.warn('Redis read error (margin):', e); }

            if (marginData.length === 0) {
                try {
                    marginData = await FinMindExtras.getMarginTrading({
                        stockId,
                        startDate: format(subDays(new Date(), 10), 'yyyy-MM-dd'),
                        endDate: todayStr
                    });
                    if (marginData.length > 0) {
                        try { await redis.set(marginCacheKey, JSON.stringify(marginData), 'EX', 14400); } catch (e) { }
                    }
                } catch (e) { console.warn(`[Analyze] Margin fetch failed for ${stockId}`); }
            }

            if (prices.length < 3) {
                console.warn(`[Analyze] Insufficient data for ${stockId} (${prices.length} days found)`);
                return null;
            }

            // Load industry mapping (use passed one if available, else fetch/cache)
            const mapping = industryMapping || await ExchangeClient.getIndustryMapping();

            const isTpex = await ExchangeClient.isTpexStock(stockId);
            const result = evaluateStock(prices, settings, indexData, isTpex ? 'TPEX' : 'TWSE', enhanced);
            if (!result) return null;

            const today = prices[prices.length - 1];

            // Analyze institutional flow (投信連買)
            let consecutiveBuy = 0;
            let instScore = 0;
            try {
                const invTrust = insts.filter((d: any) => d.name === 'Investment_Trust');
                const byDate: Record<string, number> = {};
                invTrust.forEach((row: any) => {
                    const dt = row.date;
                    const net = (row.buy || 0) - (row.sell || 0);
                    byDate[dt] = (byDate[dt] || 0) + net;
                });
                const dates = Object.keys(byDate).sort((a, b) => b.localeCompare(a));
                for (let i = 0; i < dates.length; i++) {
                    const d = dates[i];
                    if ((byDate[d] || 0) > 0) consecutiveBuy++; else break;
                }
                instScore = Math.min(consecutiveBuy / 5, 1) * 30;
            } catch (e) {
                consecutiveBuy = 0;
                instScore = 0;
            }

            // Fundamental check
            let revenueSupport = false;
            let revenueBonusPoints = 0;
            let isRevenueNewHigh = false;
            try {
                if (Array.isArray(rev) && rev.length >= 2) {
                    const getRevenue = (r: any) => r.revenue || r.monthly_revenue || r.MonthlyRevenue || r['營業收入'] || r['Revenue'] || 0;

                    // 使用 normalizeMonthlyDate 統一轉換（支援 YYYY-MM、YYYY-MM-DD、民國RRR/MM）
                    const normalized = rev.map((r: any) => ({
                        ...r,
                        date: normalizeMonthlyDate(r.date)
                    })).filter((r: any) => r.date); // 過濾掉無效日期

                    const sorted = [...normalized].sort((a: any, b: any) => a.date.localeCompare(b.date));
                    const latest = sorted[sorted.length - 1];
                    const latestRev = Number(getRevenue(latest)) || 0;

                    let momScore = 0;
                    if (sorted.length >= 3) {
                        const prev = sorted[sorted.length - 2];
                        const prevprev = sorted[sorted.length - 3];
                        const revPrev = Number(getRevenue(prev)) || 0;
                        const revPrevPrev = Number(getRevenue(prevprev)) || 0;
                        const mom1 = revPrev > 0 ? (latestRev - revPrev) / revPrev : 0;
                        const mom2 = revPrevPrev > 0 ? (revPrev - revPrevPrev) / revPrevPrev : 0;
                        const pos1 = Math.max(0, mom1);
                        const pos2 = Math.max(0, mom2);
                        momScore = Math.min(1, ((pos1 > 0 ? Math.min(pos1 / 0.2, 1) : 0) + (pos2 > 0 ? Math.min(pos2 / 0.2, 1) : 0)) / 2);
                    }

                    let yoyScore = 0;
                    if (sorted.length >= 13) {
                        // 直接解析 "YYYY-MM" 字串，避免 new Date() 跨平台解析問題
                        const latestDateNorm = normalizeMonthlyDate(latest.date);
                        const parts = latestDateNorm.split('-');
                        const latestYear = parseInt(parts[0]);
                        const latestMonth = parseInt(parts[1]);
                        if (latestYear && latestMonth) {
                            const prevYearNum = latestYear - 1;
                            const yearKey = `${prevYearNum}-${String(latestMonth).padStart(2, '0')}`;
                            const match = sorted.find((r: any) => normalizeMonthlyDate(r.date).startsWith(yearKey));
                            if (match) {
                                const revYear = Number(getRevenue(match)) || 0;
                                const yoy = revYear > 0 ? (latestRev - revYear) / revYear : 0;
                                yoyScore = Math.max(0, Math.min(1, yoy / 0.2));
                            }
                        }
                    }

                    // 新高判斷：最新營收是否為近 6 個月最高
                    if (sorted.length >= 6) {
                        const recent6 = sorted.slice(-6).map((r: any) => Number(getRevenue(r)) || 0);
                        isRevenueNewHigh = latestRev >= Math.max(...recent6) && latestRev > 0;
                    }

                    revenueBonusPoints = Math.round((momScore * 5 + yoyScore * 5 + (isRevenueNewHigh ? 3 : 0)) * 100) / 100;
                    revenueSupport = revenueBonusPoints > 0.5;
                }
            } catch (e) {
                warnings.push('Monthly revenue analysis unsuccessful');
            }

            // Analyze margin squeeze signal
            const marginSignal = checkMarginSqueezeSignal(marginData, prices);
            const marginScore = marginSignal.score * 11; // weight 11

            // Analyze gap-up
            const prevDay = prices[prices.length - 2];
            const gapResult = checkGapUp(today.min, prevDay.max);

            // 為了隱性流動性防護：要求成交量>500 或 成交額 > 3000萬
            const turnover = today.Trading_Volume * today.close * 1000;
            const hasLiquidity = today.Trading_Volume >= 500 || turnover >= 30000000;

            if (!hasLiquidity) return null; // 直接過濾缺乏流動性的標的

            // 綜合評分：主要取決於 evaluateStock 的四大共振權重總和
            const engineDetails = result.comprehensiveScoreDetails || { volumeScore: 0, maScore: 0, chipScore: 0, rsScore: 0, total: 0 };
            const baseResonanceScore = engineDetails.total || 0;
            
            let bonus: number;
            if (enhanced) {
                // 強化模式：月營收加重（YoY 成長好的股票給予更高分）
                // 計算 yoyScore（需從上方的 revenueBonusPoints 相關邏輯推算，這裡用 revenueBonusPoints 反推）
                // revenueBonusPoints = momScore*5 + yoyScore*5 + (newHigh?3:0)，最高 13
                // 強化版：YoY 成長部分上限提升至 15 分
                const enhancedRevenueBonus =
                    revenueBonusPoints >= 10 ? 15 :  // 高成長（yoyScore 接近滿分）
                    revenueBonusPoints >= 6  ? 10 :  // 中成長
                    revenueBonusPoints >= 2  ? 5  :  // 低成長
                    0;
                // 強化版：法人(投信連買)權重提升，反映大資金保護的作用
                bonus = Math.min((instScore / 30) * 12 + (marginScore / 11) * 3, 15) + enhancedRevenueBonus;
            } else {
                // 原始模式：維持原有邏輯不變
                bonus = Math.min((instScore / 30) * 10 + (marginScore / 11) * 5 + (revenueBonusPoints / 13) * 5, 20);
            }
            
            const finalScore = Math.min(1, Math.max(0, (baseResonanceScore + bonus) / 100));
            
            const finalWinRateScore = Math.min(100, Math.max(0, (result.win_rate_score || 0) + bonus));
            const finalExplosiveScore = Math.min(100, Math.max(0, (result.explosive_score || 0) + bonus));

            // 更新 comprehensiveScoreDetails 使其反映真實使用的分數, 以利前端 UI 讀取 (前端直接取 total 顯示)
            engineDetails.total = baseResonanceScore + bonus;

            const volThreshold = settings?.volumeWeight ? 2.5 : 3.0;
            const squeezeThreshold = settings?.maWeight ? 0.05 : 0.04;
            const breakoutThreshold = 0.035;

            const tags: AnalysisResult['tags'] = ['DISCOVERY'];
            if (result.isBreakout) tags.push('BREAKOUT');
            if (result.maData.isSqueezing) tags.push('MA_SQUEEZE');
            if (result.vRatio >= volThreshold) tags.push('VOLUME_EXPLOSION');
            if (revenueSupport) tags.push('BASIC_SUPPORT');
            if (marginSignal.hasSignal) tags.push('MARGIN_SQUEEZE');
            if (gapResult.isGapUp) tags.push('GAP_UP');
            if (isRevenueNewHigh) tags.push('REVENUE_NEW_HIGH');

            const finalStockName = stockName || today.stock_name || ExchangeClient.getStockName(stockId) || stockId;

            return {
                stock_id: stockId,
                stock_name: finalStockName,
                sector_name: (mapping as Record<string, string>)[stockId.trim()] || '其他',
                close: today.close,
                change_percent: result.changePercent,
                score: finalScore,
                win_rate_score: finalWinRateScore,
                explosive_score: finalExplosiveScore,
                v_ratio: result.vRatio,
                is_ma_aligned: result.maData.isSqueezing,
                is_ma_breakout: result.isBreakout,
                is_bullish: result.is_bullish,
                consecutive_buy: consecutiveBuy,
                poc: today.close,
                verdict: warnings.length > 1 ? `分析受限: ${warnings.join(', ')}` : (finalScore >= 0.6 ? '高概率爆發候選' : ((result.vRatio >= volThreshold && result.maData.constrictValue <= squeezeThreshold && result.changePercent >= breakoutThreshold) ? '三大信號共振 - 爆發前兆' : '分析完成')),
                tags,
                warnings,
                history: prices,
                maConstrictValue: result.maData.constrictValue,
                today_volume: today.Trading_Volume,
                dailyVolumeTrend: prices.map(p => p.Trading_Volume).slice(-10),
                volumeIncreasing: checkVolumeIncreasing(prices.map(p => p.Trading_Volume)),
                marginSqueezeSignal: marginSignal.hasSignal,
                marginTrend: marginSignal.marginTrend,
                isGapUp: gapResult.isGapUp,
                isRevenueNewHigh,
                comprehensiveScoreDetails: {
                    volumeScore: engineDetails.volumeScore ?? 0,
                    maScore: engineDetails.maScore ?? 0,
                    chipScore: engineDetails.chipScore ?? 0, // This holds breakout resonance score
                    rsScore: engineDetails.rsScore ?? 0,     // Relative strength score
                    marginScore: parseFloat((marginScore).toFixed(2)),
                    fundamentalBonus: parseFloat(bonus.toFixed(2)),
                    total: engineDetails.total ?? 0
                },
                is_recommended: (finalScore >= 0.6 || (result.vRatio >= volThreshold && result.maData.constrictValue <= squeezeThreshold && result.changePercent >= breakoutThreshold)) && result.is_bullish,
                analysisHints: {
                    technicalSignals: `V-Ratio ${result.vRatio.toFixed(1)}x${result.maData.isSqueezing ? ' • 均線糾結' : ''}${result.is_bullish ? ' • 多頭排列' : ' • 空頭慣性'}`,
                    chipSignals: consecutiveBuy > 0 ? `法人連買 ${consecutiveBuy} 日` : '籌碼動能待轉強',
                    fundamentalSignals: revenueBonusPoints > 0 ? `營收環比+${revenueBonusPoints.toFixed(1)}分 • 有所支撐` : '基本面動能略顯平淡',
                    marginSignals: marginSignal.hasSignal ? `資增價漲 • 具備軋空動能` : '無融資軋空跡象',
                    technical: gapResult.isGapUp ? '向上跳空' : (result.is_bullish ? '底部墊高' : '低檔盤整'),
                    chips: consecutiveBuy >= 3 ? '投信密集佈局' : '量縮震盪',
                    fundamental: revenueSupport ? '營收趨勢向上' : '數據待觀察'
                }
            };
        } catch (error: any) {
            console.error(`Analysis failed for ${stockId}:`, error.message);
            throw error;
        }
    }
};
