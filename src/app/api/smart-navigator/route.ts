import { NextResponse } from 'next/server';
import { ExchangeClient } from '@/lib/exchange';
import { getTotalShares } from '@/lib/shares';
import { calculateSMA, calculateMACD, calculateMACDFull, calculateKD } from '@/services/indicators';

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

        // Calculate 5MA, 20MA, 60MA
        const reversedClose = [...closePrices].reverse();
        const ma5  = calculateSMA(reversedClose, 5);
        const ma20 = calculateSMA(reversedClose, 20);
        const ma60 = calculateSMA(reversedClose, 60);

        // 【強剴1】均線排列判斷
        // 多頭排列：MA5 > MA20 > MA60 → 趨勢向上，綠燈可信度高
        // 空頭排列：MA5 < MA20 < MA60 → 趨勢向下，即使攞量也要降低可信度
        const isMaBullishAligned = !!(ma5 && ma20 && ma60 && ma5 > ma20 && ma20 > ma60);
        const isMaBearishAligned = !!(ma5 && ma20 && ma60 && ma5 < ma20 && ma20 < ma60);

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



        // 【強化3】籌碼集中度評分 (Accumulation Score)
        let accumulationScore = 0;
        if (totalShares && totalShares > 0 && prices.length >= 20) {
            const lookbackDays = Math.min(60, prices.length - 20);
            if (lookbackDays > 0) {
                const startIndex = prices.length - lookbackDays;
                for (let i = startIndex; i < prices.length; i++) {
                    const currentClose = prices[i].close;
                    const currentPos = periodMax === periodMin ? 0 : ((currentClose - periodMin) / (periodMax - periodMin)) * 100;
                    
                    const past20Turnover = prices.slice(i - 20, i).map(p => (p.Trading_Volume * 1000 / totalShares) * 100);
                    const avg20Turn = past20Turnover.reduce((a, b) => a + b, 0) / 20;
                    const currentTurn = (prices[i].Trading_Volume * 1000 / totalShares) * 100;
                    
                    if (currentPos < 35 && currentTurn > avg20Turn * 1.5) {
                        accumulationScore++;
                    }
                }
            }
        }

        // 【強化5】計算量比 (Volume Ratio)
        let volumeRatio = 0;
        if (volumesInShares.length >= 6) {
            const last5Vol = volumesInShares.slice(volumesInShares.length - 6, volumesInShares.length - 1);
            const vol5MA = last5Vol.reduce((a, b) => a + b, 0) / 5;
            volumeRatio = vol5MA > 0 ? latestVolumeShares / vol5MA : 0;
        }

        // 【強化6】大盤相對強弱 (Relative Strength)
        let isRelativeStrengthHigh = false;
        try {
            const taiexHistory = await ExchangeClient.getTaiexHistory(1);
            if (taiexHistory.length >= 6 && prices.length >= 6) {
                const recentPrices = prices.slice(-6);
                let rsPositiveDays = 0;
                let taiexTotalChange = 0;
                
                for (let i = 1; i < recentPrices.length; i++) {
                    const stockDate = recentPrices[i].date;
                    const prevStockDate = recentPrices[i-1].date;
                    
                    const tDay = taiexHistory.find(t => t.date === stockDate);
                    const tPrevDay = taiexHistory.find(t => t.date === prevStockDate);
                    
                    if (tDay && tPrevDay) {
                        const stockChange = ((recentPrices[i].close - recentPrices[i-1].close) / recentPrices[i-1].close) * 100;
                        const marketChange = ((tDay.close - tPrevDay.close) / tPrevDay.close) * 100;
                        taiexTotalChange += marketChange;
                        if (stockChange > marketChange) {
                            rsPositiveDays++;
                        }
                    }
                }
                
                // 大盤偏弱或盤整 (近5日總漲幅<=0.5%)，但個股有3天以上跑贏大盤，且處於低位
                if (taiexTotalChange <= 0.5 && rsPositiveDays >= 3 && positionPercent < 35) {
                    isRelativeStrengthHigh = true;
                }
            }
        } catch (e) {
            console.error("[Relative Strength] Error:", e);
        }

        // === Distribution Warning: Three Precursor Signals ===

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
        let isPriceDroppingWithVolumeDecline = false; // 【強化2】
        if (positionPercent > 60 && volumesInShares.length >= 10 && closePrices.length >= 5) {
            const last5Vol = volumesInShares.slice(-5);
            const decliningCount = last5Vol.filter((v, i) => i > 0 && v < last5Vol[i - 1]).length;
            const vol5Avg = last5Vol.reduce((a, b) => a + b, 0) / 5;
            const vol10Avg = volumesInShares.slice(-10).reduce((a, b) => a + b, 0) / 10;
            
            // 【強化2】股價方向區分
            const last5Close = closePrices.slice(-5);
            const priceDropPercent = ((last5Close[0] - last5Close[4]) / last5Close[0]) * 100;
            
            if (decliningCount >= 3 && vol5Avg < vol10Avg) {
                if (priceDropPercent > 3) {
                    isVolumeDeclineAtHigh = true;
                    isPriceDroppingWithVolumeDecline = true; // 量縮且價跌，緩慢出貨
                } else {
                    isVolumeDeclineAtHigh = false; // 量縮但價穩，鎖倉，不視為出貨前兆
                }
            }
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
        const basePrecursorCount = [hasMacdDivergence, isVolumeDeclineAtHigh, isHighStagnant].filter(Boolean).length;
        // 【強化2】若量縮且價跌，前兆數額外 +1
        const distributionPrecursorCount = basePrecursorCount + (isPriceDroppingWithVolumeDecline ? 1 : 0);
        
        // 新增暴力出貨布林值
        const isViolentDistribution = positionPercent > 70 && (isExtremelyHighTurnover || (isHighTurnover && hasLongUpperShadow));
        
        let distributionLevel: 'safe' | 'watch' | 'warning' | 'alert' = 'safe';
        if (positionPercent > 60) {
            if (isViolentDistribution || (distributionPrecursorCount >= 2 && (isHighTurnover || isExtremelyHighTurnover) && positionPercent > 70)) {
                distributionLevel = 'alert'; // 暴力出貨或放量衰退都屬於最高級別
            } else if (distributionPrecursorCount >= 2) {
                distributionLevel = 'warning';
            } else if (distributionPrecursorCount === 1) {
                distributionLevel = 'watch';
            } else {
                distributionLevel = 'safe'; // 高位但目前無出貨跡象
            }
        }
        // 低/中位（<=60%）：主力不在出貨區，一律標記為 safe

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

        // 【強化4】計算 KD 指標與底背離
        const kdData = calculateKD(prices);
        let hasKDBottomDivergence = false;
        if (kdData && prices.length >= 20) {
            const currentK = kdData.kArray[kdData.kArray.length - 1];
            if (currentK < 20) { // 超賣區
                const lookback = 20;
                let prevLowIdx = -1;
                let prevLowPrice = Infinity;
                for (let i = prices.length - lookback; i < prices.length - 3; i++) {
                    if (prices[i].min < prevLowPrice) {
                        prevLowPrice = prices[i].min;
                        prevLowIdx = i;
                    }
                }
                if (prevLowIdx !== -1) {
                    const currentLow = latestLow;
                    const prevKValue = kdData.kArray[prevLowIdx];
                    // 股價創新低或持平，但K值未創新低
                    if (currentLow <= prevLowPrice * 1.02 && currentK > prevKValue) {
                        hasKDBottomDivergence = true;
                    }
                }
            }
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
                if (isMaBearishAligned) {
                    // 年线空頭排列：即使低位出現放量也不可信，降級為黃燈
                    light = 'yellow';
                    signalTag = '低位放量但趨勢向下';
                    rules.push('成交量放大，但 MA5 < MA20 < MA60，均線為空頭排列，趨勢尚未羭轉。放量可能是反彈賣壓而非主力進場。建議：觀望為主，等待均線由空轉多後再考慮介入。');
                } else {
                    light = 'green';
                    signalTag = isMaBullishAligned ? '低位放量建倉 (多頭確認)' : '低位放量建倉';
                    let maNote = isMaBullishAligned ? '；且 MA5>MA20>MA60 多頭排列，趨勢向上確認，可信度極高。' : '；均線尚未形成多頭排列，主力建倉信話屬中等。';
                    if (volumeRatio > 5) {
                        maNote += '（特別注意：今日爆出超過 5 日均量 5 倍以上的【天量】，顯示有極強力的資金強勢介入，但也伴隨極大波動風險）';
                    }
                    rules.push(`成交量明顯放大（超過近期均量2倍），主力正積極在低檔承接籌碼${maNote}建議：可分批買入，第一批買入30%部位，剩餘等量能持續放大後再加碼，以當日最低價為停損參考。`);
                }
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
                signalTag = hasKDBottomDivergence ? '底部雙重確認 (強)' : 'MACD低位轉正';
                const kdNote = hasKDBottomDivergence ? '且同步出現 KD 超賣區底背離，是勝率極高的底部雙重確認訊號！' : '是技術面「由跌轉漲」的關鍵轉折訊號。';
                rules.push(`MACD動能指標剛從負值轉為正值，且股價處於極低位置，${kdNote}建議：可建立較積極的倉位（20%～30%），以20日均線為停損，確認量能跟上後再加碼。`);
            } else if (isShrinkingTurnover) {
                light = 'yellow';
                signalTag = '主力暗中佈局';
                rules.push('低位成交大幅縮小，市場浮額正在減少，有意願賣出的人越來越少，籌碼開始悄悄集中。這是主力可能正在暗中佈局的早期跡象，但MACD動能尚未確認轉正。建議：可用總資金5%~10%試探性建立少量倉位，停損設在近期低點下方，耐心等待MACD轉正或量能放大後再加碼。');
            } else {
                light = 'yellow';
                signalTag = '低位整理等待';
                rules.push('低位整理中，量能未有明顯變化，市場觀望情緒濃厚。目前尚無明確的主力介入跡象，但低位本身風險報酬比佳。建議：列入觀察清單，耐心等待成交量明顯放大（超過近期均量2倍）或MACD指標轉正後，再考慮介入。');
            }
        } else if (positionPercent > 60) {
            // High position zone — 炒作尾聲警戒區 (放寬至 60% 監控緩跌出貨)
            rules.push(`目前股價處於近 ${period} 日相對高位（>${Math.round(positionPercent)}%）。`);
            
            if (positionPercent > 70 && (isExtremelyHighTurnover || (isHighTurnover && hasLongUpperShadow))) {
                // Signal 2: 炒作尾聲 — 主力暴力出貨 (最高優先級)
                light = 'red';
                signalTag = hasLongUpperShadow ? '主力逢高倒貨 (避雷針)' : '主力高位暴力出貨';
                const vrWarning = volumeRatio > 5 ? '（今日爆出大於 5 倍均量的極端天量，拋售力道極為猛烈）' : '';
                if (hasLongUpperShadow) {
                    rules.push(`⚠️ 高位出現長上影線並伴隨放量${vrWarning}。這是主力趁市場熱情高漲大量賣出的典型訊號（俗稱「射擊之星」）。上影線越長，代表當日賣壓越強，大量散戶正在接盤。建議：無論獲利多少，必須立即減碼50%以上，切勿等待反彈。剩餘持股設嚴格停損，高位反彈即為出場機會。`);
                } else {
                    rules.push(`⚠️ 高位爆出超大量（超過近期均量4倍以上）${vrWarning}。這通常是主力藉助利多消息或市場狂熱，在最高點附近大量傾倒籌碼的訊號。散戶正在成為主力的接盤方。建議：見此訊號必須立即停損離場，寧可少賺，絕不在主力出貨時繼續持有。`);
                }
            } else if (distributionPrecursorCount >= 2) {
                // 次高優先級：動能衰竭/緩慢派發
                light = 'red';
                signalTag = '高位動能衰竭 (盤跌預警)';
                rules.push('⚠️ [趨勢風險] 股價出現多重衰退前兆 (如MACD頂背離、量能萎縮或高位滯漲)。主力可能正在利用盤整掩護，進行「溫水煮青蛙」式的緩慢派發。建議：提高警覺，跌破 20 日均線或跌破近期盤整區間底線時，必須立即停損/停利出場。');
            } else if (isTrending5DayHighTurnover && positionPercent > 70) {
                // Signal 5 in high zone: 對倒震盪 — 方向不明
                light = 'red';
                signalTag = '高位對倒震盪⛔';
                rules.push('⛔ 【高位勿追入】連續5日以上保持高換手，但股價在小範圍劇烈震盪而未有效突破。這可能是主力「左手換右手」製造熱鬧假象，或是在洗清短線浮額。高位追入風險極高，方向尚未明朗。建議：採觀望策略，不要追入熱鬧假象。若向下跌破支撐，立即離場。');
            } else if (distributionPrecursorCount === 1) {
                light = 'red';
                signalTag = '高位初現疲態⛔';
                rules.push('⛔ 【高位勿追入】高位出現單一衰退前兆 (如量能不濟或指標背離)。上漲動能已受阻，高位追入風險報酬比極差。建議：持股者縮緊移動停利空間，不宜再加碼。未持股者切勿追入。');
            } else if (isHighTurnover && positionPercent > 70) {
                // High turnover at high position, not extreme
                light = 'red';
                signalTag = '高位追漲風險⛔';
                rules.push('⛔ 【高位勿追入】高位出現明顯放量（超過均量2倍），多空激烈廝殺，往往是短期頂點特徵。高位追入風險極大。建議：持股者設定嚴格停利點（距成本+20%以上），絕對不追高加碼。若收盤出現長上影線，視為明確賣出訊號。');
            } else if (isShrinkingTurnover && positionPercent > 70) {
                // Signal 4 in high zone: 籌碼鎖定惜售
                light = 'red';
                signalTag = '高位量縮惜售⛔';
                rules.push('⛔ 【高位勿追入】高位量能萎縮，但股價未明顯下跌，籌碼鎖定，賣壓較輕。對未持股者而言，高位追入風險報酬比不佳。建議：未持股者不建議追高進場。持股者可繼續持有，設好移動停利保護獲利。若後續伴隨股價緩跌（大於3%），則為主力的「緩慢出貨」訊號。');
            } else {
                light = 'red';
                signalTag = '高位整理觀察⛔';
                rules.push('⛔ 【高位勿追入】股價在相對高位橫盤整理，量能平穩無特殊異常。高位追入風險報酬比不佳，目前不適合新資金進場。持股者繼續持有但需提高警戒，密切觀察是否出現出貨訊號，設好移動停利保護獲利。');
            }
        } else {
            // Middle position 30~60 — 炒作進行中觀察區
            rules.push(`目前股價處於近 ${period} 日中階位置（30%~60%）。`);
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

        // 【強化6】大盤相對強弱附加說明
        if (isRelativeStrengthHigh && (light === 'green' || light === 'yellow')) {
            rules.push('🛡️ 【抗跌護盤】近期大盤走弱或盤整，但該股近5日多數時間表現優於大盤。逆勢抗跌通常代表主力資金在下方強勢護盤，後市一旦大盤回穩，有較高機率率先發動攻擊！');
            if (light === 'yellow') {
                signalTag = '逆勢抗跌 (主力護盤)';
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
                    ma5: ma5 ? Number(ma5.toFixed(2)) : null,
                    ma20: ma20 ? Number(ma20.toFixed(2)) : null,
                    ma60: ma60 ? Number(ma60.toFixed(2)) : null,
                    isMaBullishAligned,
                    isMaBearishAligned,
                    positionPercent: Number(positionPercent.toFixed(1)),
                    isHighTurnover,
                    turnoverRate: turnoverRate > 0 ? Number(turnoverRate.toFixed(2)) : null,
                    avg20Turnover: avg20Turnover > 0 ? Number(avg20Turnover.toFixed(2)) : null,
                    turnoverMultiple: turnoverMultiple > 0 ? Number(turnoverMultiple.toFixed(1)) : null,
                    accumulationScore,
                    volumeRatio: Number(volumeRatio.toFixed(2)),
                    isStopLossFallback: !ma20
                },
                distribution: {
                    level: distributionLevel,
                    hasMacdDivergence,
                    isVolumeDeclineAtHigh,
                    isHighStagnant,
                    highStagnationDays,
                    precursorCount: distributionPrecursorCount,
                    isViolentDistribution,
                },
                interpretations: rules,
            }
        });
    } catch (error: any) {
        console.error('[SmartNavigator] Error:', error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
