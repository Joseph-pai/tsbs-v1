import { NextResponse } from 'next/server';
import { ExchangeClient } from '@/lib/exchange';
import { redis } from '@/lib/redis';

export const dynamic = 'force-dynamic';

const TTL = 3600; // 1 hour

export async function GET(req: Request) {
    try {
        const { searchParams } = new URL(req.url);
        const market = searchParams.get('market') as 'TWSE' | 'TPEX';
        const sector = searchParams.get('sector') || (market === 'TWSE' ? 'ALL' : 'AL');
        const refresh = searchParams.get('refresh') === 'true';

        const cacheKey = `tsbs:snap:v2:${market}:${sector}`;

        // 1. Try Cache (unless refresh requested)
        if (!refresh) {
            try {
                const cached = await redis.get(cacheKey);
                if (cached) {
                    const parsed = JSON.parse(cached);
                    return NextResponse.json({
                        success: true,
                        data: parsed,
                        count: parsed.length,
                        cached: true
                    });
                }
            } catch (redisError) {
                console.warn('[Snapshot API] Redis error (falling back to direct fetch):', redisError);
            }
        }

        console.log(`[Snapshot API] ${refresh ? 'Force Refresh' : 'Cache Miss'}: Targeting ${market} - SubSector: ${sector}`);

        let data = [];
        if (sector === 'ALL' || sector === 'AL') {
            data = await ExchangeClient.getAllMarketQuotes(market);
        } else {
            data = await ExchangeClient.getQuotesBySector(market, sector);
        }

        // 2. Save to Cache (if data found)
        if (data && data.length > 0) {
            try {
                await redis.set(cacheKey, JSON.stringify(data), 'EX', TTL);
            } catch (redisError) {
                console.warn('[Snapshot API] Redis set failed:', redisError);
            }
        }

        return NextResponse.json({
            success: true,
            data,
            count: data.length,
            refreshed: refresh
        });
    } catch (error: any) {
        console.error('[Snapshot API] Fatal Error:', error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
