import { NextResponse } from 'next/server';
import { ScannerService } from '@/services/scanner';
import { ExchangeClient } from '@/lib/exchange';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
// 短線掃描需要較長時間（含深度歷史分析），設定 maxDuration
export const maxDuration = 300;

export async function POST(req: Request) {
    try {
        const body = await req.json();
        const market = (body.market || 'TWSE') as 'TWSE' | 'TPEX';
        const stockIds = body.stockIds as string[] | undefined;
        const action = body.action as string | undefined;

        if (action === 'candidates') {
            console.log(`[ShortTermV31_API] 取得全市場候選代號: market=${market}`);
            const snapshot = await ExchangeClient.getAllMarketQuotes(market);
            const candidates = snapshot.filter(s =>
                s.Trading_Volume >= 300 &&
                s.close >= 5 &&
                s.close > 0
            ).map(s => s.stock_id);

            return NextResponse.json({
                success: true,
                candidates
            });
        }

        console.log(`[ShortTermV31_API] 開始短線過濾掃描 v3.1: market=${market}, 模式=${stockIds && stockIds.length > 0 ? '歷史模式' : '即時模式'}`);

        const { results, meta, timing } = await ScannerService.scanShortTermV31(market, stockIds);

        console.log(`[ShortTermV31_API] 完成: ${results.length} 支通過`);

        return NextResponse.json({
            success: true,
            data: results,
            meta,
            timing,
            count: results.length
        });

    } catch (error: any) {
        console.error('[ShortTermV31_API] Error:', error);
        return NextResponse.json(
            { success: false, error: error.message },
            { status: 500 }
        );
    }
}

export async function GET(req: Request) {
    try {
        const { searchParams } = new URL(req.url);
        const market = (searchParams.get('market') || 'TWSE') as 'TWSE' | 'TPEX';

        console.log(`[ShortTermV31_API] 開始短線過濾掃描 v3.1 (GET): market=${market}, 模式=即時模式`);

        const { results, meta, timing } = await ScannerService.scanShortTermV31(market);

        console.log(`[ShortTermV31_API] 完成: ${results.length} 支通過`);

        return NextResponse.json({
            success: true,
            data: results,
            meta,
            timing,
            count: results.length
        });

    } catch (error: any) {
        console.error('[ShortTermV31_API] Error:', error);
        return NextResponse.json(
            { success: false, error: error.message },
            { status: 500 }
        );
    }
}
