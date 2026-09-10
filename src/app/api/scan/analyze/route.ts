import { NextResponse } from 'next/server';
import { ScannerService } from '@/services/scanner';
import { AnalysisResult } from '@/types';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function POST(req: Request) {
    const startTime = Date.now();
    try {
        const { stocks, settings, enhanced } = await req.json(); // stocks: { id, name }[]

        if (!Array.isArray(stocks) || stocks.length === 0) {
            return NextResponse.json({ success: false, error: 'Empty stock list' }, { status: 400 });
        }

        console.log(`[Deep Analysis] Processing batch of ${stocks.length} stocks...`);

        // Pre-fetch industry mapping once for the entire batch to avoid redundant heavy API calls
        const { ExchangeClient } = await import('@/lib/exchange');
        const mapping = await ExchangeClient.getIndustryMapping();

        // ── 大盤指數：使用 Redis 快取（TTL 4 小時），每天只抓一次，不隨每批重複呼叫 ──
        const { format, subDays } = await import('date-fns');
        const { FinMindClient } = await import('@/lib/finmind');
        const { redis } = await import('@/lib/redis');
        const todayStr = format(new Date(), 'yyyy-MM-dd');
        const fetchStartDate = format(subDays(new Date(), 30), 'yyyy-MM-dd');

        const indexCacheKey = `tsbs:index:daily:${todayStr}`;
        let indexData: { TAIEX: any[]; TPEX: any[] } = { TAIEX: [], TPEX: [] };

        try {
            const cachedIndex = await redis.get(indexCacheKey);
            if (cachedIndex) {
                indexData = JSON.parse(cachedIndex);
                console.log('[Analyze API] Index data loaded from Redis cache.');
            }
        } catch (_) {}

        if (indexData.TAIEX.length === 0) {
            console.log('[Analyze API] Fetching index data from FinMind...');
            const [taiexHistory, tpexHistory] = await Promise.all([
                FinMindClient.getDailyStats({ stockId: 'TAIEX', startDate: fetchStartDate, endDate: todayStr }).catch(() => []),
                FinMindClient.getDailyStats({ stockId: 'IX0043', startDate: fetchStartDate, endDate: todayStr }).catch(() => [])
            ]);
            indexData = {
                TAIEX: taiexHistory,
                TPEX: tpexHistory.length > 0 ? tpexHistory : taiexHistory
            };
            // 快取 4 小時（14400 秒）
            if (taiexHistory.length > 0) {
                try { await redis.set(indexCacheKey, JSON.stringify(indexData), 'EX', 14400); } catch (_) {}
            }
        }

        // Use the optimized ScannerService which handles Redis caching internally
        const results: AnalysisResult[] = [];

        // 方案 A 最佳化：一次最多 20 支（前端已預篩），並行處理，8 秒逾時保護
        const batchSize = 20;
        for (let i = 0; i < stocks.length; i += batchSize) {
            // 防護 Netlify 10 秒硬性逾時：接近 8 秒即提前返回既有結果
            if (Date.now() - startTime > 8000) {
                console.warn(`[Analyze API] Approaching 8s timeout limit (${Date.now() - startTime}ms), returning early with ${results.length} results.`);
                break;
            }

            const batch = stocks.slice(i, i + batchSize);
            const batchResults = await Promise.allSettled(
                batch.map(async (stock: { id: string, name: string }) => {
                    return await ScannerService.analyzeStock(stock.id, settings, stock.name, mapping, indexData, enhanced);
                })
            );

            batchResults.forEach((r, idx) => {
                if (r.status === 'fulfilled' && r.value) {
                    results.push(r.value);
                } else if (r.status === 'rejected') {
                    console.warn(`[Analyze API] Failed to analyze ${batch[idx]?.id}:`, r.reason);
                }
            });
        }

        console.log(`[Analyze API] Batch complete: ${results.length}/${stocks.length} analyzed in ${Date.now() - startTime}ms`);

        return NextResponse.json({
            success: true,
            data: results,
            count: results.length
        });

    } catch (error: any) {
        console.error('[Analyze API] Error:', error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
