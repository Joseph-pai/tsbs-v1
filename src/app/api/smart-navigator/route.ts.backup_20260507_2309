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

        // Fetch stock name (cached after first call per server instance)
        let stockName = stockId;
        try {
            await ExchangeClient.getIndustryMapping(); // populates _stockNameCache
            stockName = ExchangeClient.getStockName(stockId) || stockId;
        } catch (_) { /* fallback to stockId if name lookup fails */ }

        // Fetch Total Outstanding Shares
        const totalShares = await getTotalShares(stockId);
        
        // Calculate Real Turnover Rate (%)
        let turnoverRate = 0;
        if (totalShares && totalShares > 0) {
            turnoverRate = (latestVolumeShares / totalShares) * 100;
        }

        // Calculate 20-day average turnover rate as dynamic baseline
        let avg20Turnover = 0;
        if (totalShares && totalShares > 0) {
            const last20 = prices.slice(-20);
            const turnoverRates20 = last20.map(p => (p.Trading_Volume * 1000 / totalShares) * 100);
            avg20Turnover = turnoverRates20.reduce((a, b) => a + b, 0) / turnoverRates20.length;
        }

        // Calculate turnover multiple (current vs 20-day average)
        const turnoverMultiple = avg20Turnover > 0 ? turnoverRate / avg20Turnover : 0;

        // Calculate 5-day turnover trend for Signal 4 (洗盤縮量) & Signal 5 (對倒震盪)
        let last5TurnoverRates: number[] = [];
        if (totalShares && totalShares > 0) {
            last5TurnoverRates = prices.slice(-5).map(p => (p.Trading_Volume * 1000 / totalShares) * 100);
        }
        // Signal 5: All 5 days are above 1.5x average (persistent high turnover)
        const isTrending5DayHighTurnover = last5TurnoverRates.length === 5 && avg20Turnover > 0 &&
            last5TurnoverRates.every(r => r > avg20Turnover * 1.5);
        // Signal 4: Latest day turnover shrinks to below 0.5x average (locking chips)
        const isShrinkingTurnover = last5TurnoverRates.length > 0 && avg20Turnover > 0 &&
            last5TurnoverRates[last5TurnoverRates.length - 1] < avg20Turnover * 0.5;

        // Long upper shadow K-bar detection for Signal 2 refinement (高位長上影線)
        const latestOpen = latestData.open;
        const body = Math.abs(latestClose - latestOpen);
        const upperShadow = latestHigh - Math.max(latestClose, latestOpen);
        const hasLongUpperShadow = body > 0 && upperShadow > body * 2;

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

        // Calculate Turnover Heat (dynamic thresholds based on 20-day average)
        let isHighTurnover = false;
        let isExtremelyHighTurnover = false;

        if (totalShares && totalShares > 0 && avg20Turnover > 0) {
            // Dynamic: current > 2x 20-day average = high turnover
            isHighTurnover = turnoverRate > avg20Turnover * 2;
            // Dynamic: current > 4x 20-day average = extremely high turnover
            isExtremelyHighTurnover = turnoverRate > avg20Turnover * 4;
        } else if (totalShares && totalShares > 0) {
            // Static fallback when avg20 is unavailable
            isHighTurnover = turnoverRate > 5;
            isExtremelyHighTurnover = turnoverRate > 25;
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
        const tp1Price = Number((buyPrice * 1.25).toFixed(2));
        const tp2Price = Number((buyPrice * 1.50).toFixed(2));

        // Logic Status
        let light = 'red';
        const rules: string[] = [];

        // Rule: MA20 trend check
        if (ma20 && latestClose < ma20) {
            rules.push('股價跌破 20 日均線，趨勢偏弱，請嚴格執行停損或觀望。');
        } else {
            rules.push('股價穩站 20 日均線之上，多頭格局維持。');
        }

        // Rule: MACD momentum
        if (isMacdPositive) {
            rules.push('MACD 維持零軸之上，具備上漲動能。');
        }

        // Rule: Five Signal Detection (Position + Turnover relationship)
        if (positionPercent < 30) {
            // Low position zone
            rules.push(`目前股價處於近 ${period} 日相對低位（<30%）。`);
            if (isHighTurnover) {
                // Signal 1: Low position + high turnover = 主力吸籌建倉
                light = 'green';
                rules.push('主力積極換手，底部量增，建議分批佈局。');
            } else if (isShrinkingTurnover) {
                // Signal 4 in low zone: 縮量整理蓄勢
                light = 'yellow';
                rules.push('低位量縮整理，可逢低少量試單。');
            } else {
                light = 'yellow';
                rules.push('低位量縮整理，可逢低少量試單。');
            }
        } else if (positionPercent > 70) {
            // High position zone
            rules.push(`目前股價處於近 ${period} 日相對高位（>70%）。`);
            if (isExtremelyHighTurnover || (isHighTurnover && hasLongUpperShadow)) {
                // Signal 2: High position + extreme turnover or long upper shadow = 主力派發出貨
                light = 'red';
                if (hasLongUpperShadow) {
                    rules.push('高位長上影線放量，主力疑似出貨，請提高警覺嚴格停損！');
                } else {
                    rules.push('高位爆出天量，主力疑似出貨，請提高警覺嚴格停損！');
                }
            } else if (isTrending5DayHighTurnover) {
                // Signal 5 in high zone: 連續高換手震盪 = 對倒或洗盤
                light = 'yellow';
                rules.push('連續換手股價停滯，疑似主力對倒洗籌，觀察突破方向再決策。');
            } else if (isHighTurnover) {
                // High turnover at high position, not extreme
                light = 'yellow';
                rules.push('高位換手熱烈，請留意追高風險。');
            } else if (isShrinkingTurnover) {
                // Signal 4 in high zone: 籌碼鎖定惜售
                light = 'yellow';
                rules.push('高位量縮，籌碼相對穩定，建議持股續抱。');
            } else {
                light = 'yellow';
                rules.push('高位量縮，籌碼相對穩定，建議持股續抱。');
            }
        } else {
            // Middle position 30~70
            rules.push(`目前股價處於近 ${period} 日中階位置。`);
            if (isTrending5DayHighTurnover && !isHighTurnover) {
                // Signal 5 in middle zone: 連續換手但今日未特別放量
                light = 'yellow';
                rules.push('連續換手股價停滯，疑似主力對倒洗籌，觀察突破方向再決策。');
            } else if (isHighTurnover) {
                // Signal 3: Middle position + high turnover = 強勢突破拉升
                light = 'green';
                rules.push('帶量突破盤整區，動能轉強。');
            } else if (isShrinkingTurnover) {
                // Signal 4 in middle zone: 上漲中繼縮量洗盤
                light = 'yellow';
                rules.push('縮量洗盤，籌碼鎖定良好，靜待量增再起。');
            } else {
                light = 'yellow';
                rules.push('價穩量縮，方向待表態。');
            }
        }

        // Final strict red override: breaking below MA20 always = red
        if (ma20 && latestClose < ma20) {
            light = 'red';
        }

        // Turnover rate display with dynamic baseline info
        if (totalShares && totalShares > 0) {
            if (avg20Turnover > 0) {
                rules.push(`(真實換手率: ${turnoverRate.toFixed(2)}%，20日均: ${avg20Turnover.toFixed(2)}%，為均值 ${turnoverMultiple.toFixed(1)} 倍)`);
            } else {
                rules.push(`(真實換手率: ${turnoverRate.toFixed(2)}%)`);
            }
        } else {
            rules.push(`(因缺少總股本資料，使用5日均量比對換手熱度)`);
        }

        return NextResponse.json({
            success: true,
            data: {
                stockId,
                stockName,
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
                    turnoverRate: turnoverRate > 0 ? Number(turnoverRate.toFixed(2)) : null,
                    avg20Turnover: avg20Turnover > 0 ? Number(avg20Turnover.toFixed(2)) : null,
                    turnoverMultiple: turnoverMultiple > 0 ? Number(turnoverMultiple.toFixed(1)) : null,
                    isStopLossFallback: !ma20
                },
                interpretations: rules,
            }
        });
    } catch (error: any) {
        console.error('[SmartNavigator] Error:', error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
