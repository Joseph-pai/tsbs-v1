import axios from 'axios';

let sharesCache: Record<string, number> | null = null;
let lastFetchTime = 0;
const CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours

export async function getTotalShares(stockId: string): Promise<number | null> {
    if (!sharesCache || (Date.now() - lastFetchTime) > CACHE_DURATION) {
        await fetchAllShares();
    }
    return sharesCache ? (sharesCache[stockId] || null) : null;
}

async function fetchAllShares() {
    try {
        const newCache: Record<string, number> = {};

        // 1. Fetch TWSE Total Shares (Open Data: Basic Info)
        try {
            const twseUrl = 'https://openapi.twse.com.tw/v1/opendata/t187ap03_L';
            const twseRes = await axios.get(twseUrl, { timeout: 20000 });
            if (Array.isArray(twseRes.data)) {
                twseRes.data.forEach((item: any) => {
                    const code = (item['公司代號'] || item['Code'])?.trim();
                    const sharesStr = item['已發行普通股數或TDR原股發行股數'];
                    if (code && sharesStr) {
                        newCache[code] = parseInt(sharesStr, 10);
                    }
                });
            }
        } catch (e) {
            console.error('[Shares] Failed to fetch TWSE shares:', e);
        }

        // 2. Fetch TPEx Total Shares (Open Data: Basic Info)
        try {
            const tpexUrl = 'https://www.tpex.org.tw/openapi/v1/mopsfin_t187ap03_O';
            const tpexRes = await axios.get(tpexUrl, { timeout: 20000 });
            if (Array.isArray(tpexRes.data)) {
                tpexRes.data.forEach((item: any) => {
                    const code = (item['SecuritiesCompanyCode'] || item['公司代號'])?.trim();
                    // TPEx doesn't have a direct "Issued Shares" field in this JSON, calculate from Capital
                    // Capital is in NTD, usually Par Value is 10.
                    const capital = item['Paidin.Capital.NTDollars'] || item['實收資本額'];
                    if (code && capital) {
                        newCache[code] = Math.floor(parseInt(capital, 10) / 10);
                    }
                });
            }
        } catch (e) {
            console.error('[Shares] Failed to fetch TPEx shares:', e);
        }

        if (Object.keys(newCache).length > 0) {
            sharesCache = newCache;
            lastFetchTime = Date.now();
            console.log(`[Shares] Successfully loaded ${Object.keys(newCache).length} stocks info.`);
        }
    } catch (error) {
        console.error('[Shares] Global error in fetchAllShares:', error);
    }
}
