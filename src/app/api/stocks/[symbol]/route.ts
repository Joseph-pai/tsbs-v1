import { NextResponse } from 'next/server';
import { FinMindClient } from '@/lib/finmind';
import { format, subDays } from 'date-fns';

export async function GET(
    request: Request,
    { params }: { params: { symbol: string } }
) {
    const stockId = params.symbol;

    try {
        // Fetch last 100 days
        const startDate = format(subDays(new Date(), 150), 'yyyy-MM-dd');
        const data = await FinMindClient.getDailyStats({ stockId, startDate });

        return NextResponse.json({
            success: true,
            data: data
        });
    } catch (error: any) {
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
