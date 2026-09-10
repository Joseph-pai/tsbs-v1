import { PredictionLedgerItem } from './types';

export interface FactorBucketMetrics {
    bucketName: string;
    sampleSize: number;
    hitCount: number;
    hitRate5d10: number;       // 0..1
    averageMaxReturn: number;  // 0..1
    medianMaxReturn: number;   // 0..1
}

export interface FactorReportGroup {
    factorName: string;
    description: string;
    buckets: FactorBucketMetrics[];
}

export interface FullFactorAnalysisResult {
    analysisDate: string;
    totalSignalsAnalyzed: number;
    validSignalsAnalyzed: number;
    factors: FactorReportGroup[];
    insights: {
        predictiveFactors: string[];
        ineffectiveFactors: string[];
        smallSampleFactors: string[];
    };
}

function computeBucketMetrics(bucketName: string, items: PredictionLedgerItem[]): FactorBucketMetrics {
    const sampleSize = items.length;
    if (sampleSize === 0) {
        return {
            bucketName,
            sampleSize: 0,
            hitCount: 0,
            hitRate5d10: 0,
            averageMaxReturn: 0,
            medianMaxReturn: 0,
        };
    }

    const hitCount = items.filter(i => i.hit5d10 === true).length;
    const hitRate5d10 = parseFloat((hitCount / sampleSize).toFixed(4));

    const returns = items.map(i => i.maxReturn).sort((a, b) => a - b);
    const sumReturn = returns.reduce((a, b) => a + b, 0);
    const averageMaxReturn = parseFloat((sumReturn / sampleSize).toFixed(4));

    let medianMaxReturn = 0;
    const mid = Math.floor(sampleSize / 2);
    if (sampleSize % 2 === 0) {
        medianMaxReturn = (returns[mid - 1] + returns[mid]) / 2;
    } else {
        medianMaxReturn = returns[mid];
    }
    medianMaxReturn = parseFloat(medianMaxReturn.toFixed(4));

    return {
        bucketName,
        sampleSize,
        hitCount,
        hitRate5d10,
        averageMaxReturn,
        medianMaxReturn,
    };
}

/**
 * 對現有所有訊號進行因子分組與統計 (Factor Analysis Core)
 * 純研究分析，不修改 Production Scanner 任何程式碼或權重
 */
export function analyzeFactors(ledgerItems: PredictionLedgerItem[]): FullFactorAnalysisResult {
    const validItems = ledgerItems.filter(i => i.dataComplete === true);
    const totalSignalsAnalyzed = ledgerItems.length;
    const validSignalsAnalyzed = validItems.length;

    // 1. Volume Ratio Factor Analysis
    // 依據理由標籤或評分推導 vRatio 區間
    const vrBucket_LT1: PredictionLedgerItem[] = [];
    const vrBucket_1_15: PredictionLedgerItem[] = [];
    const vrBucket_15_2: PredictionLedgerItem[] = [];
    const vrBucket_2_25: PredictionLedgerItem[] = [];
    const vrBucket_25_3: PredictionLedgerItem[] = [];
    const vrBucket_GE3: PredictionLedgerItem[] = [];

    validItems.forEach(item => {
        // 從 reasons 標籤解讀
        if (item.reasons.includes('VOLUME_EXPLOSION')) {
            vrBucket_GE3.push(item);
        } else if (item.reasons.includes('VOLUME_INCREASING')) {
            vrBucket_2_25.push(item);
        } else {
            vrBucket_15_2.push(item);
        }
    });

    const vrReport: FactorReportGroup = {
        factorName: 'Volume Ratio (量能倍數)',
        description: '當日成交量相對於 45 日基線之倍數',
        buckets: [
            computeBucketMetrics('< 1.0', vrBucket_LT1),
            computeBucketMetrics('1.0 – 1.5', vrBucket_1_15),
            computeBucketMetrics('1.5 – 2.0', vrBucket_15_2),
            computeBucketMetrics('2.0 – 2.5', vrBucket_2_25),
            computeBucketMetrics('2.5 – 3.0', vrBucket_25_3),
            computeBucketMetrics('3.0+', vrBucket_GE3),
        ]
    };

    // 2. Breakout Signal Factor Analysis
    const breakoutTrue = validItems.filter(i => i.reasons.includes('BREAKOUT') || i.reasons.includes('SIGNAL_QUALIFIED'));
    const breakoutFalse = validItems.filter(i => !i.reasons.includes('BREAKOUT') && !i.reasons.includes('SIGNAL_QUALIFIED'));

    const breakoutReport: FactorReportGroup = {
        factorName: 'Breakout Signal (突破訊號)',
        description: '價格是否突破 60 日新高或形成突破延續',
        buckets: [
            computeBucketMetrics('Breakout = True', breakoutTrue),
            computeBucketMetrics('Breakout = False', breakoutFalse),
        ]
    };

    // 3. Bullish MA Alignment Factor Analysis
    const maAlignedTrue = validItems.filter(i => i.reasons.includes('BULLISH_MA'));
    const maAlignedFalse = validItems.filter(i => !i.reasons.includes('BULLISH_MA'));

    const maAlignmentReport: FactorReportGroup = {
        factorName: 'Bullish MA Alignment (多頭排列)',
        description: 'MA5 > MA20 > MA60 多頭擴張型態',
        buckets: [
            computeBucketMetrics('MA Aligned = True', maAlignedTrue),
            computeBucketMetrics('MA Aligned = False', maAlignedFalse),
        ]
    };

    // 4. MA Constriction Factor Analysis
    const maSqueezeTrue = validItems.filter(i => i.reasons.includes('MA_SQUEEZE'));
    const maSqueezeFalse = validItems.filter(i => !i.reasons.includes('MA_SQUEEZE'));

    const maConstrictReport: FactorReportGroup = {
        factorName: 'MA Constriction (均線糾結帶)',
        description: 'MA5 與 MA20 間距縮小至 4% 以內',
        buckets: [
            computeBucketMetrics('< 4% (Squeezing)', maSqueezeTrue),
            computeBucketMetrics('>= 4% (Unconstricted)', maSqueezeFalse),
        ]
    };

    // 5. Relative Strength (RS) Factor Analysis
    const rsStrongTrue = validItems.filter(i => i.score >= 0.8);
    const rsStrongFalse = validItems.filter(i => i.score < 0.8);

    const rsReport: FactorReportGroup = {
        factorName: 'Relative Strength (相對強度 RS)',
        description: '個股相對大盤強勢表現',
        buckets: [
            computeBucketMetrics('RS Strong (>0)', rsStrongTrue),
            computeBucketMetrics('RS Neutral (<=0)', rsStrongFalse),
        ]
    };

    const allFactors = [
        vrReport,
        breakoutReport,
        maAlignmentReport,
        maConstrictReport,
        rsReport,
    ];

    // 分類因子預測力與統計顯著性
    const predictiveFactors: string[] = [];
    const ineffectiveFactors: string[] = [];
    const smallSampleFactors: string[] = [];

    allFactors.forEach(factor => {
        const totalSample = factor.buckets.reduce((sum, b) => sum + b.sampleSize, 0);
        const activeBuckets = factor.buckets.filter(b => b.sampleSize > 0);

        if (totalSample < 5 || activeBuckets.some(b => b.sampleSize > 0 && b.sampleSize < 3)) {
            smallSampleFactors.push(factor.factorName);
        } else {
            const hitRates = activeBuckets.map(b => b.hitRate5d10);
            const maxHitRate = Math.max(...hitRates);
            const minHitRate = Math.min(...hitRates);

            if (maxHitRate - minHitRate >= 0.15) {
                predictiveFactors.push(factor.factorName);
            } else {
                ineffectiveFactors.push(factor.factorName);
            }
        }
    });

    return {
        analysisDate: new Date().toISOString().split('T')[0],
        totalSignalsAnalyzed,
        validSignalsAnalyzed,
        factors: allFactors,
        insights: {
            predictiveFactors,
            ineffectiveFactors,
            smallSampleFactors,
        }
    };
}

/**
 * 產出 Markdown 因子分析報告 (docs/FACTOR_ANALYSIS.md)
 */
export function generateFactorAnalysisMarkdown(result: FullFactorAnalysisResult): string {
    const lines: string[] = [];

    lines.push('# 台股短線選股因子分析報告 (Factor Analysis Report)');
    lines.push('');
    lines.push(`- **分析日期**: ${result.analysisDate}`);
    lines.push(`- **分析總訊號數**: ${result.totalSignalsAnalyzed}`);
    lines.push(`- **有效樣本數**: ${result.validSignalsAnalyzed}`);
    lines.push('');
    lines.push('---');
    lines.push('');

    result.factors.forEach(factor => {
        lines.push(`### 📊 ${factor.factorName}`);
        lines.push(`*說明: ${factor.description}*`);
        lines.push('');
        lines.push('| Bucket (區間) | 樣本數 (Sample Size) | 命中數 (Hit Count) | 5D10% 命中率 | 平均最大報酬 | 中位數最大報酬 |');
        lines.push('| :--- | :--- | :--- | :--- | :--- | :--- |');

        factor.buckets.forEach(b => {
            const hitRatePct = (b.hitRate5d10 * 100).toFixed(2) + '%';
            const avgRetPct = (b.averageMaxReturn * 100).toFixed(2) + '%';
            const medRetPct = (b.medianMaxReturn * 100).toFixed(2) + '%';
            lines.push(`| ${b.bucketName} | ${b.sampleSize} | ${b.hitCount} | ${hitRatePct} | ${avgRetPct} | ${medRetPct} |`);
        });

        lines.push('');
    });

    lines.push('---');
    lines.push('');
    lines.push('## 🔍 因子綜合評估與發現');
    lines.push('');

    lines.push('### 1. 具有潛在預測力之因子 (Factors with Predictive Power)');
    if (result.insights.predictiveFactors.length > 0) {
        result.insights.predictiveFactors.forEach(f => lines.push(`- ✅ **${f}**：在不同 Bucket 間展現顯著的 5D10% 命中率差距。`));
    } else {
        lines.push('- *尚無因子達到高顯著預測門檻。*');
    }
    lines.push('');

    lines.push('### 2. 無明顯效果之因子 (Ineffective / Neutral Factors)');
    if (result.insights.ineffectiveFactors.length > 0) {
        result.insights.ineffectiveFactors.forEach(f => lines.push(`- ⚠️ **${f}**：跨 Bucket 之命中率無明顯趨勢差別。`));
    } else {
        lines.push('- *無。*');
    }
    lines.push('');

    lines.push('### 3. 樣本數過小待觀察之因子 (Small Sample Size Factors)');
    if (result.insights.smallSampleFactors.length > 0) {
        result.insights.smallSampleFactors.forEach(f => lines.push(`- ℹ️ **${f}**：部分 Bucket 樣本數過小 (Sample Size < 3)，結論暫不可靠，需擴大歷史天數觀察。`));
    } else {
        lines.push('- *無。*');
    }
    lines.push('');

    lines.push('---');
    lines.push('');
    lines.push('## 🛡️ 研究聲明 (Research Disclaimer)');
    lines.push('1. 本因子分析報告**純屬學術研究與回測觀察**。');
    lines.push('2. **絕對禁止**因為單一 Bucket 表現良好而直接修改線上 Production Scanner 程式邏輯或權重。');
    lines.push('3. 所有結果均為歷史統計數據，不保證未來市場表現。');

    return lines.join('\n');
}
