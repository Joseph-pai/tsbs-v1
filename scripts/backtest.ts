import fs from 'fs';
import path from 'path';
import { runMarketBacktest } from '../src/backtest/backtestRunner';
import { generateTextReport, generateJSONReport, generateCSVReport } from '../src/backtest/report';
import { analyzeFactors, generateFactorAnalysisMarkdown } from '../src/backtest/factorAnalysis';

async function main() {
    console.log('==========================================================');
    console.log('           Starting Baseline Historical Backtest          ');
    console.log('==========================================================');

    // 基準代表標的列表 (涵蓋上市/上櫃代表權重與強勢標的)
    const benchmarkStocks = [
        '2330', // 台積電 (TWSE)
        '2317', // 鴻海 (TWSE)
        '2454', // 聯發科 (TWSE)
        '2308', // 台達電 (TWSE)
        '6488', // 環球晶 (TPEX)
        '8069', // 元太 (TPEX)
        '3037', // 欣興 (TWSE)
        '2379', // 瑞昱 (TWSE)
        '3231', // 緯創 (TWSE)
        '2382', // 廣達 (TWSE)
    ];

    const months = 6;
    console.log(`[Backtest] 正在對 ${benchmarkStocks.length} 支基準股票進行 ${months} 個月歷史 5D10% 回測...`);

    const result = await runMarketBacktest(benchmarkStocks, {
        months,
        scoreThreshold: 0.7,
        enhanced: true,
    });

    const startDate = result.ledgerItems.length > 0 ? result.ledgerItems[0].signalDate : '2026-03-01';
    const endDate = result.ledgerItems.length > 0 ? result.ledgerItems[result.ledgerItems.length - 1].signalDate : '2026-09-10';

    const periodOpts = {
        startDate,
        endDate,
        stocksCount: result.processedStocksCount,
    };

    const textReport = generateTextReport(result.metrics, periodOpts);
    const jsonReport = generateJSONReport(result.metrics, result.ledgerItems, periodOpts);
    const csvReport = generateCSVReport(result.ledgerItems);

    // 進行 Factor Analysis
    const factorAnalysisResult = analyzeFactors(result.ledgerItems);
    const factorMdReport = generateFactorAnalysisMarkdown(factorAnalysisResult);

    // 建立輸出目錄 backtest-results/
    const outputDir = path.join(process.cwd(), 'backtest-results');
    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
    }

    const docsDir = path.join(process.cwd(), 'docs');
    if (!fs.existsSync(docsDir)) {
        fs.mkdirSync(docsDir, { recursive: true });
    }

    const txtPath = path.join(outputDir, 'summary.txt');
    const jsonPath = path.join(outputDir, 'summary.json');
    const csvPath = path.join(outputDir, 'ledger.csv');
    const factorJsonPath = path.join(outputDir, 'factor-analysis.json');
    const factorMdPath = path.join(docsDir, 'FACTOR_ANALYSIS.md');

    fs.writeFileSync(txtPath, textReport, 'utf-8');
    fs.writeFileSync(jsonPath, jsonReport, 'utf-8');
    fs.writeFileSync(csvPath, csvReport, 'utf-8');
    fs.writeFileSync(factorJsonPath, JSON.stringify(factorAnalysisResult, null, 2), 'utf-8');
    fs.writeFileSync(factorMdPath, factorMdReport, 'utf-8');

    console.log('\n' + textReport + '\n');
    console.log('==========================================================');
    console.log(`[Backtest] 報告與因子分析匯出完成：`);
    console.log(` - 文字報告: ${txtPath}`);
    console.log(` - JSON 報告: ${jsonPath}`);
    console.log(` - CSV  明細: ${csvPath}`);
    console.log(` - Factor JSON: ${factorJsonPath}`);
    console.log(` - Factor Markdown: ${factorMdPath}`);
    console.log('==========================================================');
}

main().catch(err => {
    console.error('[Backtest Script Error]:', err);
    process.exit(1);
});
