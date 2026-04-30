import axios from 'axios';
import { format, subMonths, startOfMonth, endOfMonth, parse } from 'date-fns';
import { StockData } from '@/types';
import { SECTORS } from './sectors';

/**
 * Utility to normalize various date formats to ISO YYYY-MM-DD
 */
export function normalizeAnyDate(dateStr: string): string {
    if (!dateStr) return '';
    const clean = dateStr.trim();

    // 1. ROC Format: 113/02/04 or 113/2/4
    const rocMatch = clean.match(/^(\d{2,3})\/(\d{1,2})\/(\d{1,2})$/);
    if (rocMatch) {
        const y = parseInt(rocMatch[1]) + 1911;
        const m = rocMatch[2].padStart(2, '0');
        const d = rocMatch[3].padStart(2, '0');
        return `${y}-${m}-${d}`;
    }

    // 2. ISO-ish Format: 2024-02-04 or 2024/02/04
    const isoMatch = clean.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
    if (isoMatch) {
        return `${isoMatch[1]}-${isoMatch[2].padStart(2, '0')}-${isoMatch[3].padStart(2, '0')}`;
    }

    // 3. Compact Format: 20240204 (Often used in old session IDs)
    const compactMatch = clean.match(/^(\d{4})(\d{2})(\d{2})$/);
    if (compactMatch) {
        return `${compactMatch[1]}-${compactMatch[2]}-${compactMatch[3]}`;
    }

    return clean;
}

/**
 * Enhanced Exchange Client
 * Supports targeted market and sector scanning
 */
export const ExchangeClient = {
    /**
     * Get Daily Quotes by Market and Sector
     */
    getQuotesBySector: async (market: 'TWSE' | 'TPEX', sectorId: string): Promise<StockData[]> => {
        try {
            if (market === 'TWSE') {
                const url = `https://www.twse.com.tw/exchangeReport/MI_INDEX?response=json&type=${sectorId}`;
                const res = await axios.get(url, { timeout: 8000 });
                const data = res.data;

                // TWSE Specific: Handle tables array for specific sector queries
                let stocks: string[][] = [];
                if (data.tables && Array.isArray(data.tables)) {
                    const tableWithData = data.tables.find((t: any) => t.data && Array.isArray(t.data) && t.data.length > 0);
                    if (tableWithData) stocks = tableWithData.data;
                } else {
                    const tables = Object.values(data).filter(v => Array.isArray(v) && v.length > 0 && Array.isArray(v[0]) && v[0].length >= 10);
                    if (tables.length > 0) stocks = tables[0] as string[][];
                }

                if (stocks.length === 0) return [];

                const parseNum = (val: string) => parseFloat(val.replace(/,/g, '').replace(/--/g, '0'));
                return stocks
                    .filter(row => row[0].trim().length === 4)
                    .map(row => ({
                        stock_id: row[0].trim(),
                        stock_name: row[1].trim(),
                        date: format(new Date(), 'yyyy-MM-dd'),
                        open: parseNum(row[5]),
                        max: parseNum(row[6]),
                        min: parseNum(row[7]),
                        close: parseNum(row[8]),
                        spread: parseNum(row[10]),
                        Trading_Volume: parseNum(row[2]) / 1000,
                        Trading_money: parseNum(row[4]),
                        Trading_turnover: parseNum(row[3]),
                    }))
                    .filter(s => s.close > 0);
            } else {
                const url = `https://www.tpex.org.tw/web/stock/aftertrading/otc_quotes_no14/stk_orderby_result.php?l=zh-tw&se=${sectorId}`;
                const res = await axios.get(url, { timeout: 8000 });
                const data = res.data.aaData || [];
                const parseNum = (val: string) => parseFloat(val.replace(/,/g, ''));
                return data
                    .filter((row: any) => row[0].trim().length === 4)
                    .map((row: any) => ({
                        stock_id: row[0].trim(),
                        stock_name: row[1].trim(),
                        date: format(new Date(), 'yyyy-MM-dd'),
                        close: parseNum(row[2]),
                        spread: parseNum(row[3]),
                        open: parseNum(row[4]),
                        max: parseNum(row[5]),
                        min: parseNum(row[6]),
                        Trading_Volume: parseNum(row[7]) / 1000,
                        Trading_money: parseNum(row[8]),
                        Trading_turnover: parseNum(row[9]),
                    }))
                    .filter((s: any) => s.close > 0);
            }
        } catch (error) {
            console.error(`[Exchange] Error fetching ${market} ${sectorId}:`, error);
            return [];
        }
    },

    getAllMarketQuotes: async (market: 'TWSE' | 'TPEX'): Promise<StockData[]> => {
        if (market === 'TWSE') {
            const url = `https://openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY_ALL`;
            const res = await axios.get(url);
            const parseNum = (val: any) => {
                if (typeof val === 'number') return val;
                if (!val) return 0;
                const parsed = parseFloat(String(val).replace(/,/g, ''));
                return isNaN(parsed) ? 0 : parsed;
            };

            return res.data.map((item: any) => ({
                stock_id: item.Code?.trim(),
                stock_name: item.Name?.trim(),
                date: format(new Date(), 'yyyy-MM-dd'),
                open: parseNum(item.OpeningPrice),
                max: parseNum(item.HighestPrice),
                min: parseNum(item.LowestPrice),
                close: parseNum(item.ClosingPrice),
                spread: parseNum(item.Change),
                Trading_Volume: parseNum(item.TradeVolume) / 1000,
                Trading_money: parseNum(item.TradeValue),
                Trading_turnover: parseNum(item.Transaction),
            })).filter((s: any) => s.close > 0 && s.stock_id && s.stock_id.length === 4);
        } else {
            const url = `https://www.tpex.org.tw/openapi/v1/tpex_mainboard_daily_close_quotes`;
            const res = await axios.get(url);

            if (!Array.isArray(res.data)) {
                console.error(`[Exchange] TPEX OpenAPI returned invalid data:`, res.data);
                return [];
            }

            const parseNum = (val: any) => {
                if (typeof val === 'number') return val;
                if (!val) return 0;
                const parsed = parseFloat(String(val).replace(/,/g, ''));
                return isNaN(parsed) ? 0 : parsed;
            };

            return res.data.map((item: any) => {
                // TPEX OpenAPI field names vary by endpoint/version
                const vol = parseNum(item.TradeQty) || parseNum(item.TradingShares) || parseNum(item.Volume) || parseNum(item.TradeVolume) || 0;

                return {
                    stock_id: item.SecuritiesCompanyCode?.trim() || item.Code?.trim(),
                    stock_name: item.CompanyName?.trim() || item.Name?.trim(),
                    date: format(new Date(), 'yyyy-MM-dd'),
                    close: parseNum(item.Close) || parseNum(item.ClosingPrice),
                    spread: parseNum(item.Change),
                    open: parseNum(item.Open) || parseNum(item.OpeningPrice),
                    max: parseNum(item.High) || parseNum(item.HighestPrice),
                    min: parseNum(item.Low) || parseNum(item.LowestPrice),
                    Trading_Volume: vol / 1000,
                    Trading_money: 0,
                    Trading_turnover: 0,
                };
            }).filter((s: any) => s.close > 0 && s.stock_id && s.stock_id.length === 4);
        }
    },

    getStockHistory: async (stockId: string, months: number = 6): Promise<StockData[]> => {
        try {
            const isTPEX = await ExchangeClient.isTpexStock(stockId);
            const monthsToFetch = months; // Increased from 3 to support 'All History' backtesting
            const allData: StockData[] = [];

            for (let i = 0; i < monthsToFetch; i++) {
                try {
                    const targetDate = subMonths(new Date(), i);
                    let monthlyData: StockData[] = [];

                    if (!isTPEX) {
                        // TWSE Logic
                        const dateStr = format(targetDate, 'yyyyMM01');
                        const url = `https://www.twse.com.tw/exchangeReport/STOCK_DAY?response=json&date=${dateStr}&stockNo=${stockId}`;
                        const res = await axios.get(url, { timeout: 10000 });
                        if (res.data && res.data.data) {
                            const parseNum = (val: string) => parseFloat(val.replace(/,/g, ''));
                            monthlyData = res.data.data.map((row: any) => ({
                                stock_id: stockId,
                                stock_name: '', // Added to match interface
                                date: normalizeAnyDate(row[0]),
                                Trading_Volume: parseNum(row[1]) / 1000,
                                open: parseNum(row[3]),
                                max: parseNum(row[4]),
                                min: parseNum(row[5]),
                                close: parseNum(row[6]),
                                spread: 0,
                                Trading_money: 0,
                                Trading_turnover: 0
                            }));
                        }
                    } else {
                        // TPEX Logic
                        const rocYearMonth = `${targetDate.getFullYear() - 1911}/${format(targetDate, 'MM')}`;
                        const url = `https://www.tpex.org.tw/web/stock/aftertrading/daily_trading_info/stk_quote_result.php?l=zh-tw&d=${rocYearMonth}&stkno=${stockId}`;
                        const res = await axios.get(url, { timeout: 10000 });
                        if (res.data && res.data.aaData) {
                            const parseNum = (val: string) => parseFloat(val.replace(/,/g, ''));
                            monthlyData = res.data.aaData.map((row: any) => ({
                                stock_id: stockId,
                                stock_name: '', // Added to match interface
                                date: normalizeAnyDate(row[0]),
                                Trading_Volume: parseNum(row[1]),
                                open: parseNum(row[3]),
                                max: parseNum(row[4]),
                                min: parseNum(row[5]),
                                close: parseNum(row[6]),
                                spread: 0,
                                Trading_money: 0,
                                Trading_turnover: 0
                            }));
                        }
                    }
                    allData.push(...monthlyData);
                } catch (e) {
                    console.warn(`[Exchange] Failed to fetch month ${i} for ${stockId}, skipping...`);
                }
            }

            // Deduplicate, sort by date ascending
            const unique = Array.from(new Map(allData.map(item => [item.date, item])).values());
            return unique.sort((a, b) => a.date.localeCompare(b.date));
        } catch (error) {
            console.error(`[Exchange] History failed for ${stockId}:`, error);
            return [];
        }
    },

    /**
     * Helper to determine market — checks if stock exists in TWSE Snapshot
     * This avoids TWSE network block/rate-limits caused by probing
     */
    isTpexStock: async (stockId: string): Promise<boolean> => {
        // 5-digit codes are always TPEX/emerging market
        if (stockId.length >= 5) return true;

        // Known TPEX stocks (hard-coded fast path)
        const knownOTC = [
            '6488', '8069', '5483', '3293', '3105', '6147', '6274', '5347', '3529',
            '8908', '3224', '8931', '1294', '6419', '6621', '6508'
        ];
        if (knownOTC.includes(stockId)) {
            // Special check: Some like 6508 are actually TWSE, but commonly confusing
            const forSureTwse = ['6508', '2330', '2317', '2303', '2454', '2308'];
            if (forSureTwse.includes(stockId)) return false;
            return true;
        }

        // Use TWSE Snapshot. If it fails, fallback to true.
        try {
            const twseStocks = await ExchangeClient.getAllMarketQuotes('TWSE');
            const isTwse = twseStocks.some(s => s.stock_id === stockId);
            if (isTwse) return false;
        } catch (_) {
            // Error fetching snapshot, assume TPEX
        }
        return true;
    },

    /**
     * Internal cache for industry mapping to avoid repeated heavy API calls
     */
    _industryMappingCache: null as Record<string, string> | null,
    _stockNameCache: {} as Record<string, string>,

    /**
     * Get stock name by ID (uses cache from mapping sync)
     */
    getStockName: (stockId: string): string | null => {
        return ExchangeClient._stockNameCache[stockId.trim()] || null;
    },

    /**
     * Fetch industry mapping for all stocks
     */
    getIndustryMapping: async (): Promise<Record<string, string>> => {
        if (ExchangeClient._industryMappingCache) {
            return ExchangeClient._industryMappingCache;
        }

        const mapping: Record<string, string> = {};
        const { INDUSTRY_MAP } = await import('./sectors');

        // Robust Fallback / Hard-fixes for common stocks
        const HARD_FIXES: Record<string, string> = {
            '2887': '金融保險',        // 台新新光金
            '6426': '通信網路',        // 統新
            '6451': '半導體業',
            '5483': '半導體業',        // 中美晶
            '2330': '半導體業',
            '2317': '其他電子',
            '1721': '化學工業',
            '3323': '電腦週邊',
            '3630': '光電業',
            '3615': '光電業',
            '3663': '光電業',
            '6584': '電子零組件',      // 南俊國際
            '5905': '觀光餐旅',        // 南仁湖
            '8069': '半導體業',        // 元太
            '6488': '半導體業',        // 環球晶
        };
        Object.assign(mapping, HARD_FIXES);

        try {
            // 1. TWSE Listing Info
            const twseUrl = `https://openapi.twse.com.tw/v1/opendata/t187ap03_L`;
            const twseRes = await axios.get(twseUrl, { timeout: 15000 });
            if (Array.isArray(twseRes.data)) {
                twseRes.data.forEach((item: any) => {
                    const code = (item['公司代號'] || item['Code'] || item['證券代號'])?.trim();
                    const sectorId = (item['產業別'] || item['Sector'] || item['產業別名稱'])?.trim();
                    const name = (item['公司簡稱'] || item['Name'] || item['簡稱'] || item['公司名稱'])?.trim();
                    if (code) {
                        if (sectorId) mapping[code] = INDUSTRY_MAP[sectorId] || sectorId;
                        if (name) ExchangeClient._stockNameCache[code] = name;
                    }
                });
            }

            // 2. TPEX Listing Info (MOPS Basic Info)
            const tpexUrl = `https://www.tpex.org.tw/openapi/v1/mopsfin_t187ap03_O`;
            const tpexRes = await axios.get(tpexUrl, { timeout: 15000 });
            if (Array.isArray(tpexRes.data)) {
                tpexRes.data.forEach((item: any) => {
                    const code = (item.SecuritiesCompanyCode || item['證券代號'] || item['公司代號'] || item['代號'])?.trim();
                    const sectorId = (item.SecuritiesIndustryCode || item['掛牌類別'] || item.Sector || item['產業別'])?.trim();
                    const name = (item.CompanyName || item['簡稱'] || item['公司名稱'] || item['公司簡稱'])?.trim();
                    if (code) {
                        if (sectorId) mapping[code] = INDUSTRY_MAP[sectorId] || sectorId;
                        if (name) ExchangeClient._stockNameCache[code] = name;
                    }
                });
            }

            // Re-apply hard fixes
            Object.assign(mapping, HARD_FIXES);

            console.log(`[Exchange] Loaded industry mapping for ${Object.keys(mapping).length} stocks (including ${Object.keys(HARD_FIXES).length} hard-fixes).`);
            ExchangeClient._industryMappingCache = mapping;
            return mapping;
        } catch (e) {
            console.error('[Exchange] Mapping synchronization failed:', e);
            // Return at least the hard-fixes
            console.log(`[Exchange] Returning ${Object.keys(mapping).length} hard-fixed stocks as fallback.`);
            return mapping;
        }
    }
};
