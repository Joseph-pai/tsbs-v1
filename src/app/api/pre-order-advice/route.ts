import { NextResponse } from 'next/server';
import { ScannerService } from '@/services/scanner';
import { redis } from '@/lib/redis';

// Round a price according to Taiwan Stock Exchange (TWSE) tick sizes
function roundToTwseTick(price: number): number {
    if (price <= 0) return 0;
    if (price < 10) {
        return Math.round(price * 100) / 100;
    } else if (price < 50) {
        return Math.round(price * 20) / 20;
    } else if (price < 100) {
        return Math.round(price * 10) / 10;
    } else if (price < 500) {
        return Math.round(price * 2) / 2;
    } else if (price < 1000) {
        return Math.round(price);
    } else {
        return Math.round(price / 5) * 5;
    }
}

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const stockId = searchParams.get('stockId');

    if (!stockId) {
        return NextResponse.json({ success: false, error: '缺少股票代碼 (stockId required)' }, { status: 400 });
    }

    try {
        const todayStr = new Date().toISOString().split('T')[0];
        const cacheKey = `tsbs:pre-order:${stockId}:${todayStr}`;

        // 1. Try Cache
        try {
            const cached = await redis.get(cacheKey);
            if (cached) {
                return NextResponse.json({
                    success: true,
                    data: JSON.parse(cached),
                    cached: true
                });
            }
        } catch (e) {
            console.warn('Redis cache read failed for pre-order:', e);
        }

        // 2. Fetch Analysis and Price History via ScannerService
        // We use true for enhanced to get the most precise chip and revenue parameters if needed
        const result = await ScannerService.analyzeStock(stockId, undefined, undefined, undefined, undefined, true);

        if (!result) {
            return NextResponse.json({
                success: false,
                error: '查無此股票或歷史數據不足，無法進行 12H 預約賣出診斷。'
            }, { status: 404 });
        }

        const prices = result.history || [];
        if (prices.length < 5) {
            return NextResponse.json({
                success: false,
                error: '個股歷史價格數據不足 5 日，無法計算均線生命線。'
            }, { status: 400 });
        }

        // 3. Compute 5-day Moving Average (5MA)
        const last5Days = prices.slice(-5);
        const ma5 = last5Days.reduce((sum, p) => sum + p.close, 0) / 5;

        // 4. Compute 10-day Average Upper Shadow
        // Upper Shadow % = (High - Max(Open, Close)) / Close
        const last10Days = prices.slice(-10);
        const upperShadows = last10Days.map(day => {
            const bodyMax = Math.max(day.open, day.close);
            const shadow = day.max - bodyMax;
            return shadow / day.close;
        });
        const avgUpperShadow = upperShadows.length > 0
            ? upperShadows.reduce((sum, s) => sum + s, 0) / upperShadows.length
            : 0.03; // 3% fallback

        // Determine historical volatility category
        let historicalVolatility = '偏低';
        if (avgUpperShadow > 0.04) {
            historicalVolatility = '極高';
        } else if (avgUpperShadow > 0.02) {
            historicalVolatility = '中等偏高';
        }

        // 5. Decision Logic
        const close = result.close;
        const score = result.score; // 0.0 to 1.0
        const isBelow5MA = close <= ma5;
        const scorePercent = Math.round(score * 100);

        let advice: 'HOLD' | 'SELL' = 'HOLD';
        let reason = '';
        let bestPresetSellPrice = 0;
        let bestStopPrice = roundToTwseTick(ma5);
        let suggestedPremiumPercent = 0;

        if (isBelow5MA) {
            advice = 'SELL';
            reason = `【生命線告急】股價最新收盤價 $${close} 已跌破 5日均線生命線 $${ma5.toFixed(2)}，短線趨勢轉空！籌碼共振分僅 ${scorePercent} 分。`;
            // Conservative rebound target: close + 1.0% (rounded to nearest TWSE tick)
            bestPresetSellPrice = roundToTwseTick(close * 1.01);
            suggestedPremiumPercent = 1.0;
        } else if (scorePercent < 50) {
            advice = 'SELL';
            reason = `【動能減弱】雖然股價守在 5日均線 $${ma5.toFixed(2)} 之上，但籌碼與強度得分偏低 (${scorePercent} 分)，主力動能不足。`;
            bestPresetSellPrice = roundToTwseTick(close * 1.015);
            suggestedPremiumPercent = 1.5;
        } else {
            advice = 'HOLD';
            reason = `【強勢多頭】股價完美站穩 5日均線生命線 $${ma5.toFixed(2)}，且籌碼共振評分高達 ${scorePercent} 分，短線多頭結構健全。`;
            // Bullish target-setting formula: Close * (1 + AvgUpperShadow + 1.5% premium buffer)
            const premium = avgUpperShadow + 0.015;
            bestPresetSellPrice = roundToTwseTick(close * (1 + premium));
            suggestedPremiumPercent = Math.round(premium * 1000) / 10;
        }

        // Double check: if target price is somehow less than or equal to close, make sure it is at least 1 tick higher (if holding)
        if (advice === 'HOLD' && bestPresetSellPrice <= close) {
            bestPresetSellPrice = roundToTwseTick(close * 1.02);
            suggestedPremiumPercent = 2.0;
        }

        const data = {
            stock_id: result.stock_id,
            stock_name: result.stock_name,
            close,
            ma5: parseFloat(ma5.toFixed(2)),
            advice,
            reason,
            bestPresetSellPrice,
            bestStopPrice,
            historicalVolatility,
            formulaDetails: {
                avgUpperShadowPercent: `${(avgUpperShadow * 100).toFixed(1)}%`,
                suggestedPremiumPercent: `${suggestedPremiumPercent.toFixed(1)}%`,
                isBelow5MA,
                score: scorePercent
            }
        };

        // Cache results for 12 hours (43200 seconds)
        try {
            await redis.set(cacheKey, JSON.stringify(data), 'EX', 43200);
        } catch (e) {
            console.warn('Redis cache write failed for pre-order:', e);
        }

        return NextResponse.json({
            success: true,
            data
        });
    } catch (error: any) {
        console.error('Pre-order Advisor API Error:', error);
        return NextResponse.json({
            success: false,
            error: error.message || '無法取得個股決策建議，請檢查股票代碼是否正確。'
        }, { status: 500 });
    }
}
