import { NextResponse } from 'next/server';
import { ExchangeClient } from '@/lib/exchange';
import { format } from 'date-fns';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        console.log('[BulkSync API] Starting one-click full market data packaging...');
        const t0 = Date.now();

        const [twseQuotes, tpexQuotes, industryMapping] = await Promise.all([
            ExchangeClient.getAllMarketQuotes('TWSE'),
            ExchangeClient.getAllMarketQuotes('TPEX'),
            ExchangeClient.getIndustryMapping()
        ]);

        const syncTime = format(new Date(), 'yyyy-MM-dd HH:mm:ss');
        const t1 = Date.now();

        console.log(`[BulkSync API] Package ready in ${t1 - t0}ms: TWSE=${twseQuotes.length}, TPEX=${tpexQuotes.length}`);

        return NextResponse.json({
            success: true,
            syncTime,
            data: {
                TWSE: twseQuotes,
                TPEX: tpexQuotes,
                industryMapping
            },
            count: twseQuotes.length + tpexQuotes.length
        });
    } catch (error: any) {
        console.error('[BulkSync API] Error packaging market data:', error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
