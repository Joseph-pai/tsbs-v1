import { normalizeAnyDate, ExchangeClient } from '@/lib/exchange';

export interface NormalizedBar {
    date: string;  // ISO YYYY-MM-DD
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
}

export interface NormalizationResult {
    bars: NormalizedBar[];
    dataComplete: boolean;
    totalRawBarsCount: number;
    invalidBarsDroppedCount: number;
    duplicateBarsDroppedCount: number;
}

/**
 * 解析並清理單一數值欄位，若無效或 <= 0（成交量允許 0）則傳回 NaN
 */
function parseNumeric(val: any, allowZero: boolean = false): number {
    if (typeof val === 'number') {
        if (!Number.isFinite(val)) return NaN;
        if (val < 0) return NaN;
        if (!allowZero && val === 0) return NaN;
        return val;
    }
    if (typeof val === 'string') {
        const clean = val.replace(/,/g, '').trim();
        if (clean === '' || clean === '--') return NaN;
        const parsed = parseFloat(clean);
        if (!Number.isFinite(parsed)) return NaN;
        if (parsed < 0) return NaN;
        if (!allowZero && parsed === 0) return NaN;
        return parsed;
    }
    return NaN;
}

/**
 * 將各種歷史資料來源 (TWSE/TPEX/FinMind/StockData) 正規化為標準 OHLCV 格式
 * 
 * @param rawBars 原始資料陣列
 * @param options 選項 (minRequiredBars: 最小要求交易日數，預設 5)
 */
export function normalizeHistoricalBars(
    rawBars: any[],
    options?: { minRequiredBars?: number }
): NormalizationResult {
    const minRequiredBars = options?.minRequiredBars ?? 5;

    if (!Array.isArray(rawBars) || rawBars.length === 0) {
        return {
            bars: [],
            dataComplete: false,
            totalRawBarsCount: 0,
            invalidBarsDroppedCount: 0,
            duplicateBarsDroppedCount: 0,
        };
    }

    let invalidCount = 0;
    let duplicateCount = 0;
    const validBarsMap = new Map<string, NormalizedBar>();

    for (const raw of rawBars) {
        if (!raw || typeof raw !== 'object') {
            invalidCount++;
            continue;
        }

        // 1. 日期正規化 (重用 normalizeAnyDate)
        const rawDateStr = String(raw.date || raw.Date || raw.dateStr || '').trim();
        const date = normalizeAnyDate(rawDateStr);

        // 驗證 ISO YYYY-MM-DD 格式
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
            invalidCount++;
            continue;
        }

        // 2. 欄位映射與數值驗證
        const open = parseNumeric(raw.open ?? raw.Open ?? raw.OpeningPrice);
        const high = parseNumeric(raw.max ?? raw.high ?? raw.High ?? raw.HighestPrice);
        const low = parseNumeric(raw.min ?? raw.low ?? raw.Low ?? raw.LowestPrice);
        const close = parseNumeric(raw.close ?? raw.Close ?? raw.ClosingPrice);
        const volume = parseNumeric(raw.Trading_Volume ?? raw.volume ?? raw.Volume ?? raw.TradeVolume ?? raw.TradeQty ?? raw.TradingShares, true);

        // 檢查是否有必填 OHLCV 數值無效 (不補 0、不自建不存在數值)
        if (isNaN(open) || isNaN(high) || isNaN(low) || isNaN(close) || isNaN(volume)) {
            invalidCount++;
            continue;
        }

        // 檢查 OHLC 邏輯合理性 (High 不得小於 Open/Close/Low，Low 不得大於 Open/Close/High)
        if (high < Math.max(open, close, low) || low > Math.min(open, close, high)) {
            invalidCount++;
            continue;
        }

        const bar: NormalizedBar = {
            date,
            open: parseFloat(open.toFixed(4)),
            high: parseFloat(high.toFixed(4)),
            low: parseFloat(low.toFixed(4)),
            close: parseFloat(close.toFixed(4)),
            volume: parseFloat(volume.toFixed(4)),
        };

        // 3. 去除重複日期 (若已存在，則保留第一筆有效 Bar，丟棄後續重複)
        if (validBarsMap.has(date)) {
            duplicateCount++;
        } else {
            validBarsMap.set(date, bar);
        }
    }

    // 4. 按日期升遞排序 (Ascending Order)
    const sortedBars = Array.from(validBarsMap.values()).sort((a, b) => a.date.localeCompare(b.date));

    // 5. 判斷資料完整性 (交易日數 >= minRequiredBars)
    const dataComplete = sortedBars.length >= minRequiredBars;

    return {
        bars: sortedBars,
        dataComplete,
        totalRawBarsCount: rawBars.length,
        invalidBarsDroppedCount: invalidCount,
        duplicateBarsDroppedCount: duplicateCount,
    };
}

/**
 * 整合 FinMind API 取得股票歷史資料並進行正規化 (Backtest Adapter)
 *
 * 策略：
 *   Primary  → FinMind TaiwanStockPrice (支援 2-3 年歷史，日 K OHLCV)
 *   Fallback → ExchangeClient.getStockHistory (TWSE/TPEX，僅 6 個月)
 *
 * FinMind TaiwanStockPrice 回傳欄位：
 *   date, stock_id, Trading_Volume, open, max, min, close, spread, Trading_money
 *
 * 這些欄位直接對應 normalizeHistoricalBars 支援的 raw 格式。
 */
export async function fetchAndNormalizeStockHistory(
    stockId: string,
    options?: { months?: number; minRequiredBars?: number }
): Promise<NormalizationResult> {
    const months = options?.months ?? 6;
    const minRequiredBars = options?.minRequiredBars ?? 20;

    // === 1. 計算日期範圍 ===
    const endDate = new Date();
    const startDate = new Date();
    startDate.setMonth(startDate.getMonth() - months);
    // FinMind 需要額外 60 天的歷史資料供 MA60/VRatio 計算使用
    startDate.setDate(startDate.getDate() - 65);

    const startDateStr = startDate.toISOString().split('T')[0];
    const endDateStr = endDate.toISOString().split('T')[0];

    // === 2. 嘗試使用 FinMind API (Primary) ===
    try {
        const { FinMindClient } = await import('@/lib/finmind');
        const rawData = await FinMindClient.getDailyStats({
            stockId,
            startDate: startDateStr,
            endDate: endDateStr,
        });

        if (rawData && rawData.length >= minRequiredBars) {
            console.log(`[FinMind] ${stockId}: ${rawData.length} bars (${startDateStr} ~ ${endDateStr})`);
            return normalizeHistoricalBars(rawData, { minRequiredBars });
        }

        // FinMind 回傳資料不足，fallback
        console.warn(`[FinMind] ${stockId}: 資料不足 (${rawData?.length ?? 0} bars)，改用 TWSE/TPEX`);
    } catch (err: any) {
        // FINMIND_TIER_RESTRICTION 代表 API 等級限制，直接 fallback
        if (err?.message?.includes('FINMIND_TIER_RESTRICTION')) {
            console.warn(`[FinMind] ${stockId}: API 等級限制，改用 TWSE/TPEX`);
        } else {
            console.warn(`[FinMind] ${stockId}: 取得失敗 (${err?.message ?? err})，改用 TWSE/TPEX`);
        }
    }

    // === 3. Fallback: TWSE/TPEX ExchangeClient ===
    const rawHistory = await ExchangeClient.getStockHistory(stockId, months);
    return normalizeHistoricalBars(rawHistory, { minRequiredBars });
}

