import { NextResponse } from 'next/server';
import { ScannerService } from '@/services/scanner';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function POST(req: Request) {
    try {
        const { stage, stockIds, stockId, settings, market = 'TWSE' } = await req.json();

        // Stage 1: Discovery (量能激增+均線糾結)
        if (stage === 'discovery') {
            const { results, timing } = await ScannerService.scanMarket(market as 'TWSE' | 'TPEX', settings);
            return NextResponse.json({
                success: true,
                data: results,
                timing,
                count: results.length
            });
        }

        // Stage 2: Filtering (投信連買+技術確認)
        if (stage === 'filter' && Array.isArray(stockIds)) {
            const { results, timing } = await ScannerService.filterStocks(stockIds, settings);
            return NextResponse.json({
                success: true,
                data: results,
                timing,
                count: results.length
            });
        }

        // Stage 3: Individual Analysis (個股完整分析)
        if (stage === 'expert' && stockId) {
            const result = await ScannerService.analyzeStock(stockId, settings);
            return NextResponse.json({ success: true, data: result });
        }

        return NextResponse.json({ success: false, error: 'Invalid stage or missing parameters' }, { status: 400 });

    } catch (error: any) {
        console.error('Scan API Error:', error);
        return NextResponse.json({
            success: false,
            error: error.message,
            stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
        }, { status: 500 });
    }
}

// Legacy GET support for backward compatibility
export async function GET() {
    try {
        const { results, timing } = await ScannerService.scanMarket();
        return NextResponse.json({
            success: true,
            count: results.length,
            timing,
            data: results
        });
    } catch (error: any) {
        return NextResponse.json({
            success: false,
            error: error.message,
            timing: {},
            stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
        }, { status: 500 });
    }
}
