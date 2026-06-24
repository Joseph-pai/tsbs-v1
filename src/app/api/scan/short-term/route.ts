import { NextResponse } from 'next/server';
import { ScannerService } from '@/services/scanner';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
// 短線掃描需要較長時間（含深度歷史分析），設定 maxDuration
export const maxDuration = 300;

export async function GET(req: Request) {
    try {
        const { searchParams } = new URL(req.url);
        const market = (searchParams.get('market') || 'TWSE') as 'TWSE' | 'TPEX';
        const sector = searchParams.get('sector') || undefined;
        const mode = (searchParams.get('mode') || 'auto') as 'auto' | 'loose' | 'medium' | 'strict';

        console.log(`[ShortTermAPI] 開始短線過濾掃描: market=${market}, mode=${mode}`);

        const { results, meta, timing } = await ScannerService.scanShortTerm(market, sector, mode);

        console.log(`[ShortTermAPI] 完成: ${results.length} 支通過，品質等級: ${meta.qualityLevel}`);

        return NextResponse.json({
            success: true,
            data: results,
            meta,
            timing,
            count: results.length
        });

    } catch (error: any) {
        console.error('[ShortTermAPI] Error:', error);
        return NextResponse.json(
            { success: false, error: error.message },
            { status: 500 }
        );
    }
}
