import { NextResponse } from 'next/server';
import { FinMindClient } from '@/lib/finmind';
import { format, subDays } from 'date-fns';
import { calculateSMA, calculateMACD } from '@/services/indicators';

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const stockId = searchParams.get('stockId');
        const periodStr = searchParams.get('period') || '30';
        const period = parseInt(periodStr, 10);

        if (!stockId) {
            return NextResponse.json({ success: false, error: 'Missing stockId' }, { status: 400 });
        }

        // Fetch enough data for 120-day position calculation and 26-day MACD/20MA (so around 150 days to be safe)
        const startDate = format(subDays(new Date(), 200), 'yyyy-MM-dd');
        const prices = await FinMindClient.getDailyStats({ stockId, startDate });

        if (!prices || prices.length === 0) {
            return NextResponse.json({ success: false, error: '無此股票代號的交易數據' }, { status: 404 });
        }

        // Extract close prices and volumes (ordered from oldest to newest)
        const closePrices = prices.map(p => p.close);
        const volumes = prices.map(p => p.Trading_Volume);

        const latestData = prices[prices.length - 1];
        const latestClose = latestData.close;
        const latestHigh = latestData.max;
        const latestLow = latestData.min;
        const latestVolume = latestData.Trading_Volume;

        // Calculate 20MA
        const reversedClose = [...closePrices].reverse();
        const ma20 = calculateSMA(reversedClose, 20);

        // Calculate 5MA for volume
        const reversedVolume = [...volumes].reverse();
        const vol5MA = calculateSMA(reversedVolume, 5);

        // Calculate MACD
        const macdData = calculateMACD(closePrices);
        const macdLine = macdData?.osc ?? 0; // OSC is histogram, dif is MACD line, let's use OSC or DIF > 0
        // Wait, "MACD Line > 0" usually means DIF > 0 or OSC > 0. Let's use DIF > 0 as MACD > 0 and OSC for crossover
        const isMacdPositive = macdData ? macdData.dif > 0 : false;

        // Calculate Position %
        const periodPrices = reversedClose.slice(0, period);
        const periodMax = Math.max(...periodPrices);
        const periodMin = Math.min(...periodPrices);
        const positionPercent = periodMax === periodMin ? 0 : ((latestClose - periodMin) / (periodMax - periodMin)) * 100;

        // Calculate Turnover Heat (Is volume > 2x 5MA?)
        const isHighTurnover = vol5MA ? latestVolume > (vol5MA * 2) : false;
        const isExtremelyHighTurnover = vol5MA ? latestVolume > (vol5MA * 4) : false; // 爆量

        // Prices
        const buyPrice = Number(((latestHigh + latestLow) / 2).toFixed(2));
        const stopLossPrice = Number((ma20 || latestLow).toFixed(2));
        const tp1Price = Number((buyPrice * 1.3).toFixed(2));
        const tp2Price = Number((buyPrice * 1.7).toFixed(2));

        // Logic Status
        let light = 'red';
        const rules: string[] = [];

        // Rules text generation
        if (ma20 && latestClose < ma20) {
            rules.push('股價跌破 20 日均線，趨勢偏弱，請嚴格執行停損或觀望。');
        } else {
            rules.push('股價穩站 20 日均線之上，多頭格局維持。');
        }

        if (isMacdPositive) {
            rules.push('MACD 維持零軸之上，具備上漲動能。');
        }

        if (positionPercent < 30) {
            rules.push(`目前股價處於近 ${period} 日相對低位（<30%）。`);
            if (isHighTurnover) {
                light = 'green';
                rules.push('主力積極換手，底部量增，建議分批佈局。');
            } else {
                light = 'yellow';
                rules.push('低位量縮整理，可逢低少量試單。');
            }
        } else if (positionPercent > 70) {
            rules.push(`目前股價處於近 ${period} 日相對高位（>70%）。`);
            if (isExtremelyHighTurnover) {
                light = 'red';
                rules.push('高位爆出天量，主力疑似出貨，請提高警覺嚴格停損！');
            } else if (isHighTurnover) {
                light = 'yellow'; // High position, high turnover can be risky
                rules.push('高位換手熱烈，請留意追高風險。');
            } else {
                light = 'yellow';
                rules.push('高位量縮，籌碼相對穩定，建議持股續抱。');
            }
        } else {
            // Middle position 30~70
            rules.push(`目前股價處於近 ${period} 日中階位置。`);
            if (isHighTurnover) {
                light = 'green';
                rules.push('帶量突破盤整區，動能轉強。');
            } else {
                light = 'yellow';
                rules.push('價穩量縮，方向待表態。');
            }
        }

        // Final strict red overrides
        if (ma20 && latestClose < ma20) {
            light = 'red';
        }

        return NextResponse.json({
            success: true,
            data: {
                stockId,
                light,
                prices: {
                    buy: buyPrice,
                    stopLoss: stopLossPrice,
                    tp1: tp1Price,
                    tp2: tp2Price,
                },
                metrics: {
                    close: latestClose,
                    ma20: ma20 ? Number(ma20.toFixed(2)) : null,
                    positionPercent: Number(positionPercent.toFixed(1)),
                    isHighTurnover,
                },
                interpretations: rules,
            }
        });
    } catch (error: any) {
        console.error('[SmartNavigator] Error:', error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
