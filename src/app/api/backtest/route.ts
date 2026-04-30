import { NextResponse } from 'next/server';
import { FinMindClient } from '@/lib/finmind';
import { format, subDays, parseISO, isValid } from 'date-fns';
import { ExchangeClient, normalizeAnyDate } from '@/lib/exchange';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

/**
 * GET /api/backtest?stockId=1785&fromDate=2026-04-15&toDate=2026-05-15
 */
export async function GET(req: Request) {
    const { searchParams } = new URL(req.url);
    const stockIdRaw = searchParams.get('stockId');
    const fromDateRaw = searchParams.get('fromDate');
    const toDateRaw = searchParams.get('toDate');
    const targetPriceRaw = searchParams.get('targetPrice');

    if (!stockIdRaw || !fromDateRaw || !toDateRaw) {
        return NextResponse.json({ success: false, error: 'Missing parameters stockId, fromDate, or toDate' }, { status: 400 });
    }

    // 1. Clean and Normalize inputs
    const stockId = stockIdRaw.trim();
    const fromDate = normalizeAnyDate(fromDateRaw.trim());
    const toDate = normalizeAnyDate(toDateRaw.trim());
    const targetPriceVal = targetPriceRaw ? parseFloat(targetPriceRaw) : null;

    console.log(`[Backtest API] Stock: "${stockId}" | Start: ${fromDate} (Raw: ${fromDateRaw}) | End: ${toDate} (Raw: ${toDateRaw})`);

    // Prevent same-day backtest fetching as there is no historical data yet
    if (fromDate === toDate) {
        return NextResponse.json({
            success: true, stockId, fromDate, toDate, peakPrice: null,
            message: `當日無歷史數據`
        });
    }

    try {
        // 2. Fetch History with Fallback Logic
        let history: any[] = [];
        let source = 'FinMind';

        // Buffer: fetch starting 10 days earlier just to be safe with market gaps
        const fetchStartDate = format(subDays(new Date(fromDate), 10), 'yyyy-MM-dd');
        const fetchEndDate = toDate;

        try {
            history = await FinMindClient.getDailyStats({ 
                stockId, 
                startDate: fetchStartDate, 
                endDate: fetchEndDate 
            });
            
            if (!history || history.length < 2) {
                console.warn(`[Backtest API] FinMind insufficient: ${history?.length || 0}, trying Exchange...`);
                history = await ExchangeClient.getStockHistory(stockId);
                source = 'Exchange';
            }
        } catch (e: any) {
            console.error(`[Backtest API] FinMind failed: ${e.message}, trying Exchange...`);
            history = await ExchangeClient.getStockHistory(stockId);
            source = 'Exchange';
        }

        if (!history || history.length === 0) {
            return NextResponse.json({
                success: true, stockId, fromDate, toDate, peakPrice: null,
                message: `No data found across all sources (${source})`
            });
        }

        // 3. Filter to trading days in range [fromDate, toDate]
        // Standardization is key here: ensuring both rowDate and fromDate are dash-separated YYYY-MM-DD
        const rangeHistory = history.filter(row => {
            const rowDate = normalizeAnyDate(row.date);
            return rowDate >= fromDate && rowDate <= toDate;
        });

        if (rangeHistory.length === 0) {
            const lastAvail = history.length > 0 ? normalizeAnyDate(history[history.length - 1].date) : 'N/A';
            return NextResponse.json({
                success: true, stockId, fromDate, toDate, peakPrice: null,
                message: `No trading days in range [${fromDate}, ${toDate}]. (Latest: ${lastAvail})`
            });
        }

        // 4. Calculate Peak Price & Hit Records
        let peakPrice = -1;
        let peakDate = '';
        let peakIndex = -1;
        const hitRecords: { date: string; high: number }[] = [];

        rangeHistory.forEach((row, idx) => {
            const high = row.max ?? row.close;
            if (high > peakPrice) {
                peakPrice = high;
                peakDate = normalizeAnyDate(row.date);
                peakIndex = idx;
            }

            if (targetPriceVal && high >= targetPriceVal) {
                hitRecords.push({
                    date: normalizeAnyDate(row.date),
                    high: high
                });
            }
        });

        return NextResponse.json({
            success: true,
            stockId,
            fromDate,
            toDate,
            source,
            peakPrice: peakPrice > 0 ? peakPrice : null,
            peakDate: peakDate || null,
            achievedDays: peakIndex,
            tradingDaysChecked: rangeHistory.length,
            hitRecords
        });

    } catch (error: any) {
        console.error('[Backtest API] Fatal Error:', error.message);
        return NextResponse.json(
            { success: false, error: `Backend Failure: ${error.message}` },
            { status: 500 }
        );
    }
}
