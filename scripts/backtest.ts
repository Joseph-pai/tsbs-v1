import fs from 'fs';
import path from 'path';
import { runMarketBacktest } from '../src/backtest/backtestRunner';
import { generateTextReport, generateJSONReport, generateCSVReport } from '../src/backtest/report';
import { analyzeFactors, generateFactorAnalysisMarkdown } from '../src/backtest/factorAnalysis';
import { runEventAlphaABBacktest, generateEventAlphaBacktestMarkdown } from '../src/backtest/eventAlphaBacktest';

async function main() {
    console.log('==========================================================');
    console.log('           Starting Baseline Historical Backtest          ');
    console.log('==========================================================');

    // ================================================================
    // 擴大基準股票 Universe（多產業覆蓋，目標取得 n >= 100 有效樣本）
    // 上市 (TWSE) + 上櫃 (TPEX) 涵蓋：半導體、電子製造、零組件、
    // 電信、金融、工業、面板、TPEX 成長股
    // ================================================================
    const benchmarkStocks = [
        // === 半導體 / IC 設計 ===
        '2330', // 台積電 (TWSE)
        '2303', // 聯電 (TWSE)
        '2454', // 聯發科 (TWSE)
        '2344', // 華邦電 (TWSE)
        '3711', // 日月光投控 (TWSE)
        '2408', // 南亞科 (TWSE)
        '6770', // 力積電 (TWSE)
        '2379', // 瑞昱 (TWSE)

        // === 電子製造 / EMS / ODM ===
        '2317', // 鴻海 (TWSE)
        '3231', // 緯創 (TWSE)
        '2382', // 廣達 (TWSE)
        '2324', // 仁寶 (TWSE)
        '2356', // 英業達 (TWSE)
        '2357', // 華碩 (TWSE)
        '2353', // 宏碁 (TWSE)

        // === 電子零組件 / 被動元件 ===
        '2308', // 台達電 (TWSE)
        '2327', // 國巨 (TWSE)
        '3008', // 大立光 (TWSE)
        '2393', // 億光 (TWSE)
        '2301', // 光寶科 (TWSE)
        '3037', // 欣興 (TWSE)

        // === 面板 / 顯示 ===
        '3481', // 群創 (TWSE)
        '2412', // 中華電 (TWSE)

        // === 金融 ===
        '2882', // 國泰金 (TWSE)
        '2886', // 兆豐金 (TWSE)
        '2884', // 玉山金 (TWSE)

        // === 工業 / 原材料 ===
        '2207', // 和泰車 (TWSE)
        '2002', // 中鋼 (TWSE)
        '1301', // 台塑 (TWSE)
        '1303', // 南亞 (TWSE)

        // === TPEX 成長型 ===
        '6488', // 環球晶 (TPEX)
        '8069', // 元太 (TPEX)
        '3034', // 聯詠 (TPEX)
        '5347', // 世界先進 (TPEX)
        '4919', // 新唐 (TPEX)
        '3443', // 創意 (TPEX)
        '5269', // 祥碩 (TPEX)
        '3533', // 嘉澤 (TPEX)
        '6415', // 矽力-KY (TPEX)
        '4966', // 譜瑞-KY (TPEX)
    ];

    const months = 12; // 從 6 個月擴大至 12 個月，目標取得 n >= 100 有效訊號
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

    // 進行 Event Alpha A/B Backtest
    // Control 組: 所有 Technical Scanner 訊號 (不過濾)
    // Treatment 組: 同一組訊號 (在 runEventAlphaABBacktest 內部依 Event 進行過濾)
    // eventItems: 目前無真實事件資料，使用空陣列 (正確實證行為，結論將為暫無證據支持)
    console.log('[Backtest] 正在執行 Event Alpha A/B Backtest (Future Leakage Guard 已啟用)...');
    const abResult = runEventAlphaABBacktest({
        controlLedger: result.ledgerItems,
        treatmentLedger: result.ledgerItems,
        eventItems: [], // 真實 Event 資料來源由 Scrapling Service 提供，目前為空陣列
    });
    const abMdReport = generateEventAlphaBacktestMarkdown(abResult);

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
    const abJsonPath = path.join(outputDir, 'event-alpha-ab-backtest.json');
    const abMdPath = path.join(docsDir, 'EVENT_ALPHA_BACKTEST.md');

    fs.writeFileSync(txtPath, textReport, 'utf-8');
    fs.writeFileSync(jsonPath, jsonReport, 'utf-8');
    fs.writeFileSync(csvPath, csvReport, 'utf-8');
    fs.writeFileSync(factorJsonPath, JSON.stringify(factorAnalysisResult, null, 2), 'utf-8');
    fs.writeFileSync(factorMdPath, factorMdReport, 'utf-8');
    fs.writeFileSync(abJsonPath, JSON.stringify(abResult, null, 2), 'utf-8');
    fs.writeFileSync(abMdPath, abMdReport, 'utf-8');

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
    console.log(`[A/B Result] 結論: ${abResult.conclusion}`);
    console.log('==========================================================');
}

main().catch(err => {
    console.error('[Backtest Script Error]:', err);
    process.exit(1);
});
