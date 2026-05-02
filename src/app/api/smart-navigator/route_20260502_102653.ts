import { NextResponse } from 'next/server';
import { ExchangeClient } from '@/lib/exchange';
import { getTotalShares } from '@/lib/shares';
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

        // Fetch 6 months of data directly from Exchange to avoid FinMind API limits
        const prices = await ExchangeClient.getStockHistory(stockId, 6);

        if (!prices || prices.length === 0) {
            return NextResponse.json({ success: false, error: '無法獲取該股票的歷史交易數據，請確認代號是否正確。' }, { status: 404 });
        }

        // Extract close prices and volumes (ordered from oldest to newest)
        const closePrices = prices.map(p => p.close);
        // Convert Volume back to shares (ExchangeClient returns volume in thousands (張), except TPEx History API sometimes returns shares. 
        // Wait, ExchangeClient normalizes volume to "thousands (張)" for TWSE, but let's check its logic: 
        // TWSE daily: `parseNum(row[1]) / 1000`
        // TPEx daily: `parseNum(row[1])` (Wait, TPEx history returns volume in thousands (仟股)? Yes, `parseNum(row[1])` means thousands. So both are in thousands. We need to multiply by 1000 to get shares).
        const volumesInShares = prices.map(p => p.Trading_Volume * 1000);

        const latestData = prices[prices.length - 1];
        const latestClose = latestData.close;
        const latestHigh = latestData.max;
        const latestLow = latestData.min;
        const latestVolumeShares = latestData.Trading_Volume * 1000;

        // Fetch Total Outstanding Shares
        const totalShares = await getTotalShares(stockId);
        
        // Calculate Real Turnover Rate (%)
        let turnoverRate = 0;
        if (totalShares && totalShares > 0) {
            turnoverRate = (latestVolumeShares / totalShares) * 100;
        }

        // Calculate 20MA
        const reversedClose = [...closePrices].reverse();
        const ma20 = calculateSMA(reversedClose, 20);

        // Calculate MACD
        const macdData = calculateMACD(closePrices);
        const isMacdPositive = macdData ? macdData.dif > 0 : false;

        // Calculate Position %
        const periodPrices = reversedClose.slice(0, period);
        const periodMax = Math.max(...periodPrices);
        const periodMin = Math.min(...periodPrices);
        const positionPercent = periodMax === periodMin ? 0 : ((latestClose - periodMin) / (periodMax - periodMin)) * 100;

        // Calculate Turnover Heat
        // Fallback to relative volume if totalShares is unavailable
        let isHighTurnover = false;
        let isExtremelyHighTurnover = false;
        
        if (totalShares && totalShares > 0) {
            isHighTurnover = turnoverRate > 5; // > 5%
            isExtremelyHighTurnover = turnoverRate > 25; // > 25%
        } else {
            // Fallback: compare to 5MA volume
            const reversedVolume = [...volumesInShares].reverse();
            const vol5MA = calculateSMA(reversedVolume, 5);
            isHighTurnover = vol5MA ? latestVolumeShares > (vol5MA * 2) : false;
            isExtremelyHighTurnover = vol5MA ? latestVolumeShares > (vol5MA * 4) : false;
        }

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

        if (totalShares && totalShares > 0) {
            rules.push(`(真實換手率: ${turnoverRate.toFixed(2)}%)`);
        } else {
            rules.push(`(因缺少總股本資料，使用5日均量比對換手熱度)`);
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
                    turnoverRate: turnoverRate > 0 ? Number(turnoverRate.toFixed(2)) : null
                },
                interpretations: rules,
            }
        });
    } catch (error: any) {
        console.error('[SmartNavigator] Error:', error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
