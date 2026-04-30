import { NextResponse } from 'next/server';
import { ScannerService } from '@/services/scanner';
import { redis } from '@/lib/redis';

const TTL = 43200; // 12 hours (Result cache)

export async function GET(
    request: Request,
    { params }: { params: { id: string } }
) {
    const id = params.id;
    if (!id) {
        return NextResponse.json({ success: false, error: 'Stock ID required' }, { status: 400 });
    }

    try {
        const cacheKey = `tsbs:ai:res:${id}`; // Key for the final analysis result

        // 1. Try Result Cache (fastest)
        try {
            const cached = await redis.get(cacheKey);
            if (cached) {
                return NextResponse.json({
                    success: true,
                    data: JSON.parse(cached),
                    cached: true
                });
            }
        } catch (e) { }

        // 2. Compute Fresh (uses internal raw data cache)
        const result = await ScannerService.analyzeStock(id, undefined);

        if (!result) {
            return NextResponse.json({
                success: false,
                error: 'Analysis failed or insufficient data'
            }, { status: 404 });
        }

        // 3. Save to Result Cache
        try {
            await redis.set(cacheKey, JSON.stringify(result), 'EX', TTL);
        } catch (e) { }

        return NextResponse.json({
            success: true,
            data: result
        });
    } catch (error: any) {
        console.error(`Analysis Error [${id}]:`, error);
        return NextResponse.json({
            success: false,
            error: error.message,
            details: error.toString()
        }, { status: 500 });
    }
}
