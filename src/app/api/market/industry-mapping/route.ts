import { NextResponse } from 'next/server';
import { ExchangeClient } from '@/lib/exchange';
import { redis } from '@/lib/redis';

export const dynamic = 'force-dynamic';

const CACHE_KEY = 'tsbs:map:industry:v9';
const TTL = 60 * 60 * 24 * 7; // 7 days

export async function GET(req: Request) {
    try {
        const { searchParams } = new URL(req.url);
        const refresh = searchParams.get('refresh') === 'true';

        // 1. Try Cache
        if (!refresh) {
            try {
                const cached = await redis.get(CACHE_KEY);
                if (cached) {
                    return NextResponse.json({
                        success: true,
                        data: JSON.parse(cached)
                    });
                }
            } catch (redisError) {
                console.warn('[Industry Mapping API] Redis error:', redisError);
            }
        }

        // 2. Fetch Fresh
        const mapping = await ExchangeClient.getIndustryMapping();

        // 3. Save to Cache
        if (mapping && Object.keys(mapping).length > 0) {
            try {
                await redis.set(CACHE_KEY, JSON.stringify(mapping), 'EX', TTL);
            } catch (redisError) {
                console.warn('[Industry Mapping API] Redis set failed:', redisError);
            }
        }

        return NextResponse.json({
            success: true,
            data: mapping,
            refreshed: refresh
        });
    } catch (error: any) {
        console.error('[Industry Mapping API] Error:', error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
