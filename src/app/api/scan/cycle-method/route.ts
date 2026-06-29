import { NextResponse } from 'next/server';
import { CycleScannerService } from '@/services/cycleScanner';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const maxDuration = 300;

export async function POST(req: Request) {
    try {
        const body = await req.json();
        const { entries } = body as { entries: { stockId: string, stockName: string, entryDate: string }[] };

        console.log(`[CycleMethod_API] 開始短線週期掃描: ${entries.length} 支股票`);

        const results = [];
        let processedCount = 0;

        // Process in chunks to avoid overwhelming the API
        const chunkSize = 10;
        for (let i = 0; i < entries.length; i += chunkSize) {
            const chunk = entries.slice(i, i + chunkSize);
            const chunkPromises = chunk.map(entry => 
                CycleScannerService.analyzeStock(entry.stockId, entry.stockName, entry.entryDate)
            );
            
            const chunkResults = await Promise.all(chunkPromises);
            
            for (const res of chunkResults) {
                if (res) results.push(res);
            }
            
            processedCount += chunk.length;
            console.log(`[CycleMethod_API] 進度: ${processedCount}/${entries.length}`);
            
            if (i + chunkSize < entries.length) {
                await new Promise(r => setTimeout(r, 1000)); // Rate limiting pause
            }
        }

        console.log(`[CycleMethod_API] 完成`);

        return NextResponse.json({
            success: true,
            data: results,
            count: results.length
        });

    } catch (error: any) {
        console.error('[CycleMethod_API] Error:', error);
        return NextResponse.json(
            { success: false, error: error.message },
            { status: 500 }
        );
    }
}
