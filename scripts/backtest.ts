import fs from 'fs';
import path from 'path';
import { runMarketBacktest } from '../src/backtest/backtestRunner';
import { generateTextReport, generateJSONReport, generateCSVReport } from '../src/backtest/report';
import { analyzeFactors, generateFactorAnalysisMarkdown } from '../src/backtest/factorAnalysis';
import { runEventAlphaABBacktest, generateEventAlphaBacktestMarkdown } from '../src/backtest/eventAlphaBacktest';

// =====================================================================
// 股票名稱對照表（供 Per-Stock Ranking 顯示用）
// =====================================================================
const STOCK_NAME_MAP: Record<string, string> = {
    '2330': '台積電',    '2303': '聯電',       '2454': '聯發科',  '2344': '華邦電',
    '3711': '日月光投控','2408': '南亞科',      '6770': '力積電',  '2379': '瑞昱',
    '2317': '鴻海',      '3231': '緯創',        '2382': '廣達',    '2324': '仁寶',
    '2356': '英業達',    '2357': '華碩',        '2353': '宏碁',    '2308': '台達電',
    '2327': '國巨',      '3008': '大立光',      '2393': '億光',    '2301': '光寶科',
    '3037': '欣興',      '3481': '群創',        '2412': '中華電',  '2882': '國泰金',
    '2886': '兆豐金',    '2884': '玉山金',      '2207': '和泰車',  '2002': '中鋼',
    '1301': '台塑',      '1303': '南亞',        '6488': '環球晶',  '8069': '元太',
    '3034': '聯詠',      '5347': '世界先進',    '4919': '新唐',    '3443': '創意',
    '5269': '祥碩',      '3533': '嘉澤',        '6415': '矽力-KY', '4966': '譜瑞-KY',
};

async function main() {
    console.log('==========================================================');
    console.log('           Starting Baseline Historical Backtest          ');
    console.log('==========================================================');

    const benchmarkStocks = [
        // === 半導體 / IC 設計 ===
        '2330', '2303', '2454', '2344', '3711', '2408', '6770', '2379',
        // === 電子製造 / EMS / ODM ===
        '2317', '3231', '2382', '2324', '2356', '2357', '2353',
        // === 電子零組件 / 被動元件 ===
        '2308', '2327', '3008', '2393', '2301', '3037',
        // === 面板 / 顯示 ===
        '3481', '2412',
        // === 金融 ===
        '2882', '2886', '2884',
        // === 工業 / 原材料 ===
        '2207', '2002', '1301', '1303',
        // === TPEX 成長型 ===
        '6488', '8069', '3034', '5347', '4919', '3443', '5269', '3533', '6415', '4966',
    ];

    const months = 12;
    console.log(`[Backtest] 正在對 ${benchmarkStocks.length} 支基準股票進行 ${months} 個月歷史 5D10% 回測...`);

    const result = await runMarketBacktest(benchmarkStocks, {
        months,
        scoreThreshold: 0.7,
        enhanced: true,
    });

    const startDate = result.ledgerItems.length > 0 ? result.ledgerItems[0].signalDate : '2026-03-01';
    const endDate = result.ledgerItems.length > 0 ? result.ledgerItems[result.ledgerItems.length - 1].signalDate : '2026-09-10';

    const periodOpts = { startDate, endDate, stocksCount: result.processedStocksCount };

    const textReport = generateTextReport(result.metrics, periodOpts);
    const jsonReport = generateJSONReport(result.metrics, result.ledgerItems, periodOpts);
    const csvReport = generateCSVReport(result.ledgerItems);

    // Factor Analysis
    const factorAnalysisResult = analyzeFactors(result.ledgerItems);
    const factorMdReport = generateFactorAnalysisMarkdown(factorAnalysisResult);

    // Event Alpha A/B Backtest
    console.log('[Backtest] 正在執行 Event Alpha A/B Backtest (Future Leakage Guard 已啟用)...');
    const abResult = runEventAlphaABBacktest({
        controlLedger: result.ledgerItems,
        treatmentLedger: result.ledgerItems,
        eventItems: [],
    });
    const abMdReport = generateEventAlphaBacktestMarkdown(abResult);

    // ================================================================
    // Per-Stock 歷史統計（供 5D+10% Ranking 頁面）
    // 只計算 dataComplete=true 的訊號，嚴格避免 look-ahead bias
    // ================================================================
    const completeItems = result.ledgerItems.filter(item => item.dataComplete);
    const byStock: Record<string, typeof completeItems> = {};
    for (const item of completeItems) {
        if (!byStock[item.stockId]) byStock[item.stockId] = [];
        byStock[item.stockId].push(item);
    }

    const perStockStats = Object.entries(byStock)
        .filter(([, items]) => items.length >= 2)
        .map(([stockId, items]) => {
            const hitItems = items.filter(i => i.hit5d10);
            const hitRate = hitItems.length / items.length;
            const returns = items.map(i => i.maxReturn).sort((a, b) => a - b);
            const avgMaxReturn = returns.reduce((s, r) => s + r, 0) / returns.length;
            const midIdx = Math.floor(returns.length / 2);
            const medianMaxReturn = returns.length % 2 === 0
                ? (returns[midIdx - 1] + returns[midIdx]) / 2
                : returns[midIdx];
            const daysArr = hitItems.map(i => i.daysToTarget).filter((d): d is number => d !== null);
            const avgDaysToTarget = daysArr.length > 0
                ? daysArr.reduce((s, d) => s + d, 0) / daysArr.length : null;
            const sorted = [...items].sort((a, b) => b.signalDate.localeCompare(a.signalDate));
            const latest = sorted[0];
            return {
                stockId,
                stockName: STOCK_NAME_MAP[stockId] || stockId,
                market: latest.market,
                signalCount: items.length,
                hitCount: hitItems.length,
                hitRate: parseFloat((hitRate * 100).toFixed(2)),
                avgMaxReturn: parseFloat((avgMaxReturn * 100).toFixed(2)),
                medianMaxReturn: parseFloat((medianMaxReturn * 100).toFixed(2)),
                avgDaysToTarget: avgDaysToTarget !== null ? parseFloat(avgDaysToTarget.toFixed(2)) : null,
                latestSignalDate: latest.signalDate,
                latestSignalClose: latest.signalClose,
                latestSignalTargetPrice: parseFloat((latest.signalClose * 1.1).toFixed(2)),
                latestTechnicalScore: parseFloat((latest.score * 100).toFixed(1)),
                eventAlphaScore: null as null,   // 尚無 A/B 統計證據
                eventAlphaStatus: abResult.conclusion,
            };
        })
        .sort((a, b) => {
            if (b.hitRate !== a.hitRate) return b.hitRate - a.hitRate;
            return b.avgMaxReturn - a.avgMaxReturn;
        })
        .map((stat, idx) => ({ ...stat, rank: idx + 1 }));

    const rankingMeta = {
        generatedAt: new Date().toISOString(),
        backtestPeriod: { startDate, endDate },
        totalSignals: completeItems.length,
        overallHitRate: parseFloat((result.metrics.hitRate5d10 * 100).toFixed(2)),
        prerequisites: {
            baseline: true,
            factorAnalysis: true,
            walkForward: false,  // 尚未實作
            eventAlphaABTest: true,
        },
        disclaimer: [
            'Historical 5D +10% Hit Rate 為歷史回測統計結果',
            '不是未來上漲機率，不是投資保證，不構成投資建議',
            'Event Alpha Score 尚無 A/B Test 統計證據支持，目前顯示 N/A',
        ],
    };

    // 建立輸出目錄
    const outputDir = path.join(process.cwd(), 'backtest-results');
    if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });
    const docsDir = path.join(process.cwd(), 'docs');
    if (!fs.existsSync(docsDir)) fs.mkdirSync(docsDir, { recursive: true });
    const srcDataDir = path.join(process.cwd(), 'src', 'data');
    if (!fs.existsSync(srcDataDir)) fs.mkdirSync(srcDataDir, { recursive: true });

    const txtPath = path.join(outputDir, 'summary.txt');
    const jsonPath = path.join(outputDir, 'summary.json');
    const csvPath = path.join(outputDir, 'ledger.csv');
    const factorJsonPath = path.join(outputDir, 'factor-analysis.json');
    const factorMdPath = path.join(docsDir, 'FACTOR_ANALYSIS.md');
    const abJsonPath = path.join(outputDir, 'event-alpha-ab-backtest.json');
    const abMdPath = path.join(docsDir, 'EVENT_ALPHA_BACKTEST.md');
    const rankingPath = path.join(srcDataDir, 'backtestPerStockStats.json');

    fs.writeFileSync(txtPath, textReport, 'utf-8');
    fs.writeFileSync(jsonPath, jsonReport, 'utf-8');
    fs.writeFileSync(csvPath, csvReport, 'utf-8');
    fs.writeFileSync(factorJsonPath, JSON.stringify(factorAnalysisResult, null, 2), 'utf-8');
    fs.writeFileSync(factorMdPath, factorMdReport, 'utf-8');
    fs.writeFileSync(abJsonPath, JSON.stringify(abResult, null, 2), 'utf-8');
    fs.writeFileSync(abMdPath, abMdReport, 'utf-8');
    fs.writeFileSync(rankingPath, JSON.stringify({ meta: rankingMeta, stocks: perStockStats }, null, 2), 'utf-8');

    console.log('\n' + textReport + '\n');
    console.log('==========================================================');
    console.log(`[Backtest] 報告與因子分析匯出完成：`);
    console.log(` - 文字報告: ${txtPath}`);
    console.log(` - JSON 報告: ${jsonPath}`);
    console.log(` - CSV  明細: ${csvPath}`);
    console.log(` - Factor JSON: ${factorJsonPath}`);
    console.log(` - Factor Markdown: ${factorMdPath}`);
    console.log(` - Event Alpha A/B JSON: ${abJsonPath}`);
    console.log(` - Event Alpha A/B Markdown: ${abMdPath}`);
    console.log(` - Per-Stock Ranking: ${rankingPath}`);
    console.log(`[A/B Result] 結論: ${abResult.conclusion}`);
    console.log('==========================================================');
}

main().catch(err => {
    console.error('[Backtest Script Error]:', err);
    process.exit(1);
});
