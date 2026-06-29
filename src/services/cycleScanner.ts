import { FinMindClient } from '@/lib/finmind';
import { StockData } from '@/types';
import { format, subDays } from 'date-fns';

export interface CycleResult {
    stock_id: string;
    stock_name: string;
    signal: 'BUY' | 'EXIT' | 'HOLD';
    close: number;
    changePercent: number;
    reason: string;
    high20?: number;
    low10?: number;
    vol5Avg?: number;
    todayVol?: number;
    entryLow?: number;
}

export const CycleScannerService = {
    analyzeStock: async (stockId: string, stockName: string, entryDate: string): Promise<CycleResult | null> => {
        try {
            // Need data for today, plus enough historical data (at least 25 trading days)
            // Fetch ~40 days to ensure we have 25 trading days.
            const endDateStr = format(new Date(), 'yyyy-MM-dd');
            const startDateStr = format(subDays(new Date(), 60), 'yyyy-MM-dd');

            // 1. Fetch Klines
            const klines = await FinMindClient.getDailyStats({
                stockId,
                startDate: startDateStr,
                endDate: endDateStr
            });

            if (!klines || klines.length < 20) {
                return { stock_id: stockId, stock_name: stockName, signal: 'HOLD', close: 0, changePercent: 0, reason: '歷史數據不足' };
            }

            const today = klines[klines.length - 1];
            const yesterday = klines[klines.length - 2];
            if (!yesterday) return null;

            const close = today.close;
            const changePercent = (today.close - yesterday.close) / yesterday.close;
            const todayVol = today.Trading_Volume / 1000;

            // 2. Fetch entry date Kline
            const entryKlines = await FinMindClient.getDailyStats({
                stockId,
                date: entryDate
            });
            const entryLow = entryKlines && entryKlines.length > 0 ? entryKlines[0].min : 0;

            // 3. Calculate indicators
            // high20 (excluding today)
            const past20 = klines.slice(-21, -1);
            if (past20.length < 20) {
                 return { stock_id: stockId, stock_name: stockName, signal: 'HOLD', close, changePercent, reason: '歷史數據不足' };
            }
            const high20 = Math.max(...past20.map((k: StockData) => k.max));

            // low10 (including today or excluding today? "跌破過去10個交易日最低價" usually excludes today, but let's assume past 10 days excluding today for the threshold)
            const past10 = klines.slice(-11, -1);
            const low10 = Math.max(0, Math.min(...past10.map((k: StockData) => k.min)));

            // vol5Avg (excluding today)
            const past5 = klines.slice(-6, -1);
            const vol5Avg = past5.reduce((sum: number, k: StockData) => sum + (k.Trading_Volume / 1000), 0) / 5;

            // 4. Evaluate signals
            let signal: 'BUY' | 'EXIT' | 'HOLD' = 'HOLD';
            const reasons: string[] = [];

            // BUY Signal:
            // A: close > high20
            // B: todayVol >= vol5Avg * 1.5
            // C: todayVol > 1000
            const condA = close > high20;
            const condB = todayVol >= vol5Avg * 1.5;
            const condC = todayVol > 1000;

            // EXIT Signal:
            // D: close < low10
            // E: close < entryLow
            const condD = low10 > 0 && close < low10;
            const condE = entryLow > 0 && close < entryLow;

            if (condD || condE) {
                signal = 'EXIT';
                if (condD) reasons.push(`跌破10日低(${low10.toFixed(2)})`);
                if (condE) reasons.push(`跌破進場低(${entryLow.toFixed(2)})`);
            } else if (condA && condB && condC) {
                signal = 'BUY';
                reasons.push(`突破20日高(${high20.toFixed(2)})`);
                reasons.push(`放量(${todayVol.toFixed(0)}張)`);
            } else {
                signal = 'HOLD';
                reasons.push('未觸發進出場');
            }

            return {
                stock_id: stockId,
                stock_name: stockName,
                signal,
                close,
                changePercent,
                reason: reasons.join(' · '),
                high20,
                low10,
                vol5Avg,
                todayVol,
                entryLow
            };
        } catch (error: any) {
            console.error(`[CycleScanner] Error analyzing ${stockId}:`, error.message);
            return { stock_id: stockId, stock_name: stockName, signal: 'HOLD', close: 0, changePercent: 0, reason: '分析失敗' };
        }
    }
};
