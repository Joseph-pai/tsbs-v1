import { NextResponse } from 'next/server';
import { ExchangeClient } from '@/lib/exchange';
import { getTotalShares } from '@/lib/shares';
import { calculateSMA, calculateMACD, calculateMACDFull } from '@/services/indicators';

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

        // === Distribution Warning: Three Precursor Signals ===
        // (Placed after positionPercent & isHighTurnover to avoid 'used before declaration' error)

        // Precursor A: MACD Top Divergence (MACD頂背離)
        // Price at or above a recent high, but DIF is lower than at that peak
        let hasMacdDivergence = false;
        const macdFull = calculateMACDFull(closePrices);
        if (macdFull && closePrices.length >= 26) {
            const lookback = 20;
            const recentPrices = closePrices.slice(-lookback);
            const recentDif = macdFull.difArray.slice(-lookback);
            let prevPeakIdx = -1;
            let prevPeakPrice = -Infinity;
            for (let i = 1; i < lookback - 2; i++) {
                if (recentPrices[i] > recentPrices[i - 1] && recentPrices[i] >= recentPrices[i + 1]) {
                    if (recentPrices[i] > prevPeakPrice) {
                        prevPeakPrice = recentPrices[i];
                        prevPeakIdx = i;
                    }
                }
            }
            if (prevPeakIdx !== -1) {
                const currentPrice = recentPrices[lookback - 1];
                const currentDif = recentDif[lookback - 1];
                const prevPeakDif = recentDif[prevPeakIdx];
                hasMacdDivergence = currentPrice >= prevPeakPrice * 0.98 && currentDif < prevPeakDif;
            }
        }

        // Precursor B: Volume Decline at High Position (高位量能遞減)
        let isVolumeDeclineAtHigh = false;
        if (positionPercent > 60 && volumesInShares.length >= 10) {
            const last5Vol = volumesInShares.slice(-5);
            const decliningCount = last5Vol.filter((v, i) => i > 0 && v < last5Vol[i - 1]).length;
            const vol5Avg = last5Vol.reduce((a, b) => a + b, 0) / 5;
            const vol10Avg = volumesInShares.slice(-10).reduce((a, b) => a + b, 0) / 10;
            isVolumeDeclineAtHigh = decliningCount >= 3 && vol5Avg < vol10Avg;
        }

        // Precursor C: High Position Stagnation (高位橫盤滞漲)
        let highStagnationDays = 0;
        if (positionPercent > 60 && prices.length >= 10) {
            const recentPricesSlice = prices.slice(-10);
            const maxHighInSlice = Math.max(...recentPricesSlice.map(p => p.max));
            const lastIndexOfHigh = recentPricesSlice.map(p => p.max).lastIndexOf(maxHighInSlice);
            highStagnationDays = recentPricesSlice.length - 1 - lastIndexOfHigh;
        }
        const isHighStagnant = highStagnationDays >= 5;

        // Composite Distribution Warning Level
        const distributionPrecursorCount = [hasMacdDivergence, isVolumeDeclineAtHigh, isHighStagnant].filter(Boolean).length;
        let distributionLevel: 'none' | 'watch' | 'warning' | 'alert' = 'none';
        if (positionPercent > 60) {
            if (distributionPrecursorCount >= 2 && (isHighTurnover || isExtremelyHighTurnover) && positionPercent > 70) {
                distributionLevel = 'alert';
            } else if (distributionPrecursorCount >= 2) {
                distributionLevel = 'warning';
            } else if (distributionPrecursorCount === 1) {
                distributionLevel = 'watch';
            }
        }

        // === Early Accumulation Signals ===
        // Moderate volume: turnover 1.2x ~ 2x avg (warming up, not yet high)
        const isModerateVolume = avg20Turnover > 0
            ? turnoverRate > avg20Turnover * 1.2 && turnoverRate <= avg20Turnover * 2
            : false;
        // MACD just turned positive: prev DIF < 0, current DIF >= 0
        let isMacdJustTurnedPositive = false;
        if (macdFull && macdFull.difArray.length >= 2) {
            const prevDif = macdFull.difArray[macdFull.difArray.length - 2];
            const currDif = macdFull.difArray[macdFull.difArray.length - 1];
            isMacdJustTurnedPositive = prevDif < 0 && currDif >= 0;
        }

        // Prices
        const buyPrice = Number(((latestHigh + latestLow) / 2).toFixed(2));
        const stopLossPrice = Number((ma20 || latestLow).toFixed(2));
        const tp1Price = Number((buyPrice * 1.25).toFixed(2));
        const tp2Price = Number((buyPrice * 1.50).toFixed(2));

        // Logic Status
        let signalTag: string | null = null;
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
                light = 'green';
                signalTag = '低位放量建倉';
                rules.push('成交量明顯放大（超過近期均量2倍），主力正積極在低檔承接籌碼。建議：可分批買入，第一批買入30%部位，剩餘等量能持續放大後再加碼，以當日最低價為停損參考。');
            } else if (isShrinkingTurnover && isMacdPositive) {
                light = 'green';
                signalTag = '低位縮量蓄勢';
                rules.push('低位成交量大幅縮小，代表願意賣出的人越來越少，籌碼正在集中。MACD動能指標為正，顯示趨勢轉多。建議：少量試單（10%～20%部位），耐心等待成交量明顯放大再積極加碼。');
            } else if (isModerateVolume && isMacdPositive) {
                light = 'green';
                signalTag = '底部量能回升';
                rules.push('底部成交量溫和回升（約為近期均量1.2~2倍），已有資金開始試探性進場，MACD動能轉正。建議：少量布局（10%～20%），若後續量能持續放大則逐步加碼至50%部位。');
            } else if (isMacdJustTurnedPositive && positionPercent < 20) {
                light = 'green';
                signalTag = 'MACD低位轉正';
                rules.push('MACD動能指標剛從負值轉為正值，且股價處於極低位置，是技術面「由跌轉漲」的關鍵轉折訊號。建議：少量試單（10%～15%），以20日均線為停損，確認量能跟上後再加碼。');
            } else if (isShrinkingTurnover) {
                light = 'yellow';
                signalTag = '主力暗中佈局';
                rules.push('低位成交大幅縮小，市場浮額正在減少，有意願賣出的人越來越少，籌碼開始悄悄集中。這是主力可能正在暗中佈局的早期跡象，但MACD動能尚未確認轉正。建議：可用總資金5%~10%試探性建立少量倉位，停損設在近期低點下方，耐心等待MACD轉正或量能放大後再加碼。');
            } else {
                light = 'yellow';
                signalTag = '低位整理等待';
                rules.push('低位整理中，量能未有明顯變化，市場觀望情緒濃厚。目前尚無明確的主力介入跡象，但低位本身風險報酬比佳。建議：列入觀察清單，耐心等待成交量明顯放大（超過近期均量2倍）或MACD指標轉正後，再考慮介入。');
            }
        } else if (positionPercent > 70) {
            // High position zone — 炒作尾聲警戒區
            rules.push(`目前股價處於近 ${period} 日相對高位（>70%）。`);
            if (isExtremelyHighTurnover || (isHighTurnover && hasLongUpperShadow)) {
                // Signal 2: 炒作尾聲 — 主力大量出貨
                light = 'red';
                signalTag = '主力高位出貨';
                if (hasLongUpperShadow) {
                    rules.push('⚠️ 高位出現長上影線並伴隨放量。這是主力趁市場熱情高漲大量賣出的典型訊號（俗稱「射擊之星」）。上影線越長，代表當日賣壓越強，大量散戶正在接盤。建議：無論獲利多少，必須立即減碼50%以上，切勿等待反彈。剩餘持股設嚴格停損，高位反彈即為出場機會。');
                } else {
                    rules.push('⚠️ 高位爆出超大量（超過近期均量4倍以上）。這通常是主力藉助利多消息或市場狂熱，在最高點附近大量傾倒籌碼的訊號。散戶正在成為主力的接盤方。建議：見此訊號必須立即停損離場，寧可少賺，絕不在主力出貨時繼續持有。');
                }
            } else if (isTrending5DayHighTurnover) {
                // Signal 5 in high zone: 對倒震盪 — 方向不明
                light = 'yellow';
                signalTag = '高位對倒震盪';
                rules.push('連續5日以上保持高換手，但股價在小範圍劇烈震盪而未有效突破。這可能是主力「左手換右手」製造熱鬧假象，或是在洗清短線浮額。在高位出現此訊號風險較大，方向尚未明朗。建議：採觀望策略，不要追入熱鬧假象。若後續放量向上突破壓力，可少量跟進；若向下跌破支撐，立即離場。');
            } else if (isHighTurnover) {
                // High turnover at high position, not extreme
                light = 'yellow';
                signalTag = '高位追漲風險';
                rules.push('高位出現明顯放量（超過均量2倍），代表有人在積極賣出，同時也有人積極買入，多空激烈廝殺。在高位出現此現象往往是短期頂點特徵。建議：持股者設定嚴格停利點（距成本+20%以上），絕對不追高加碼。若收盤出現長上影線，視為明確賣出訊號。');
            } else if (isShrinkingTurnover) {
                // Signal 4 in high zone: 籌碼鎖定惜售
                light = 'yellow';
                signalTag = '高位量縮惜售';
                rules.push('高位量能萎縮，代表主力惜售，沒有人急著在高位拋售，賣壓很輕。這是「強者恆強」的高位特徵，股價容易維持高位或緩步盤升。建議：持股者可繼續持有，不必急於獲利了結。但請設定移動停利（trailing stop），一旦量能突然放大且出現大陰線，必須立即停利出場。');
            } else {
                light = 'yellow';
                signalTag = '高位整理觀察';
                rules.push('股價在相對高位橫盤整理，量能平穩無特殊異常。目前尚無明確出貨跡象，但高位本身追漲風險較高。建議：未持股者不建議追高進場，風險報酬比不佳。持股者繼續持有但需提高警戒，密切觀察「出貨預警」卡片是否出現黃橙紅訊號，設好移動停利保護獲利。');
            }
        } else {
            // Middle position 30~70 — 炒作進行中觀察區
            rules.push(`目前股價處於近 ${period} 日中階位置（30%~70%）。`);
            if (isTrending5DayHighTurnover && !isHighTurnover) {
                // Signal 5 in middle zone: 連續換手但今日未特別放量
                light = 'yellow';
                signalTag = '中位對倒整理';
                rules.push('連續多日保持高換手，但股價在中間區間劇烈震盪。此為主力可能在洗清短線散戶浮額，是上漲途中常見的「中途洗盤」型態，也可能是主力開始減碼。建議：靜觀震盪結束後的突破方向。若帶量向上突破，是加碼信號；若跌破支撐，則需減碼。');            } else if (isHighTurnover) {
                // Signal 3: 炒作進行中 — 主力帶量突破
                light = 'green';
                signalTag = '主力突破拉升';
                rules.push('帶量突破盤整區，成交量超過近期均量2倍以上，是技術分析中最強力的買入訊號之一。「帶量」是關鍵——無量的突破隨時可能拉回，帶量突破代表大量買家在更高價格達成共識，上漲動能充沛。建議：可在突破當下追入30%部位，停損設在突破點下方。強勢突破往往不給回測機會，不要猶豫等待。');
            } else if (isShrinkingTurnover && isMacdPositive) {
                // Signal: 炒作中繼整理 — 中段縮量蓄勢（新增綠燈）
                light = 'green';
                signalTag = '中段縮量整理';
                rules.push('股價上漲一段後進入橫盤整理，成交量大幅萎縮（低於均量0.5倍），MACD動能持續為正。這是主力刻意壓盤洗清浮額的「中繼整理」型態，籌碼高度集中，主力並未出貨。建議：持股者耐心持有，這是最不應該賣出的時機。等待量能再度放大（超過均量1.5倍以上）、股價重新向上突破整理區間，通常迎來更強的第二波拉升。');
            } else if (isShrinkingTurnover) {
                // 中位量縮但MACD未確認
                light = 'yellow';
                signalTag = '中位量縮觀察';
                rules.push('中位成交量萎縮，股價暫時停頓。量縮本身不代表危險，但MACD動能尚未確認向上，方向仍不明朗。建議：已持股者可繼續持有，但暫不加碼。未持股者觀望為主，等待MACD轉正或量能放大後再評估進場時機。');
            } else {
                light = 'yellow';
                signalTag = '中位方向待定';
                rules.push('股價在中間位置橫盤，量能平穩無特殊變化，市場多空雙方都在等待驅動方向的訊號。建議：切忌在無量的中途隨意追入，等待帶量突破（向上）或量增跌破支撐（向下）後，再根據方向決定操作。');
            }
        }

        // Final strict red override: breaking below MA20 always = red
        if (ma20 && latestClose < ma20) {
            light = 'red';
            signalTag = null; // Reset signal tag when overridden to red
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
                signalTag,
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
                distribution: {
                    level: distributionLevel,
                    hasMacdDivergence,
                    isVolumeDeclineAtHigh,
                    isHighStagnant,
                    highStagnationDays,
                    precursorCount: distributionPrecursorCount,
                },
                interpretations: rules,
            }
        });
    } catch (error: any) {
        console.error('[SmartNavigator] Error:', error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
