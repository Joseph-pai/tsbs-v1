import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export interface PerStockStatItem {
    stockId: string;
    stockName: string;
    market: string;
    signalCount: number;
    hitCount: number;
    hitRate: number;
    avgMaxReturn: number;
    medianMaxReturn: number;
    avgDaysToTarget: number | null;
    latestSignalDate: string;
    latestSignalClose: number;
    latestSignalTargetPrice: number;
    latestTechnicalScore: number;
    eventAlphaScore: number | null;
    eventAlphaStatus: string;
    rank: number;
}

export interface RankingMeta {
    generatedAt: string;
    backtestPeriod: { startDate: string; endDate: string };
    totalSignals: number;
    overallHitRate: number;
    prerequisites: {
        baseline: boolean;
        factorAnalysis: boolean;
        walkForward: boolean;
        eventAlphaABTest: boolean;
    };
    disclaimer: string[];
}

export interface RankingData {
    meta: RankingMeta;
    stocks: PerStockStatItem[];
}

export async function GET() {
    try {
        const rankingPath = path.join(process.cwd(), 'src', 'data', 'backtestPerStockStats.json');

        if (!fs.existsSync(rankingPath)) {
            return NextResponse.json({
                success: false,
                error: 'Ranking data not found. Please run `npm run backtest` first.',
                dataReady: false,
            }, { status: 404 });
        }

        const raw = fs.readFileSync(rankingPath, 'utf-8');
        const data: RankingData = JSON.parse(raw);

        return NextResponse.json({
            success: true,
            dataReady: true,
            data,
        });
    } catch (error: any) {
        return NextResponse.json({
            success: false,
            error: error.message,
        }, { status: 500 });
    }
}
