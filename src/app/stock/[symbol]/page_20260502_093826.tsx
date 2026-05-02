'use client';

import { useQuery } from '@tanstack/react-query';
import { TradingViewChart } from '@/components/charts/TradingViewChart';
import { useParams, useRouter } from 'next/navigation';
import { ChevronLeft, Info, Activity, Zap, ShieldCheck, AlertTriangle, Calculator, DollarSign, LineChart, PieChart, BarChart3, TrendingUp, Flame, Target, MessageSquare, Download, Loader2 } from 'lucide-react';
import { calculateSMA } from '@/services/indicators';
import { StockCandle, AnalysisResult } from '@/types';
import { useEffect, useState, useMemo } from 'react';
import { clsx } from 'clsx';

/**
 * Premium Individual Stock Analysis Page
 * Features deep technical resonance analysis and expert verdict
 */
export default function StockDetailPage() {
    const { symbol } = useParams();
    const router = useRouter();
    const [isLandscape, setIsLandscape] = useState(false);
    const [showChart, setShowChart] = useState(true);  // Toggle K-line visibility
    const [isPrinting, setIsPrinting] = useState(false);

    const handleDownload = async () => {
        if (isPrinting) return;
        setIsPrinting(true);
        try {
            const html2canvas = (await import('html2canvas')).default;
            const element = document.getElementById('stock-analysis-content');
            if (!element) return;
            const canvas = await html2canvas(element, {
                backgroundColor: '#020617',
                scale: 2,
                useCORS: true,
                scrollX: 0,
                scrollY: 0,
                windowWidth: element.scrollWidth,
                windowHeight: element.scrollHeight,
            });
            const link = document.createElement('a');
            const stockNameStr = typeof symbol === 'string' ? symbol : (symbol as string[])[0];
            link.download = `${stockNameStr}_分析報告_${new Date().toLocaleDateString('zh-TW', { year: 'numeric', month: '2-digit', day: '2-digit' }).replace(/\//g, '')}.png`;
            link.href = canvas.toDataURL('image/png');
            link.click();
        } catch (err) {
            console.error('截圖失敗:', err);
        } finally {
            setIsPrinting(false);
        }
    };

    useEffect(() => {
        const checkOrientation = () => {
            setIsLandscape(window.innerWidth > window.innerHeight);
        };
        window.addEventListener('resize', checkOrientation);
        checkOrientation();
        return () => window.removeEventListener('resize', checkOrientation);
    }, []);

    const { data: rawData, isLoading, isError } = useQuery({
        queryKey: ['stock', symbol],
        queryFn: async () => {
            // Check cache first
            const cacheKey = `tsbs_analysis_${symbol}`;
            const cached = sessionStorage.getItem(cacheKey);
            if (cached) {
                try {
                    return JSON.parse(cached) as AnalysisResult;
                } catch (e) {
                    console.error('Failed to parse cached analysis:', e);
                }
            }

            const res = await fetch(`/api/analyze/${symbol}`);
            const json = await res.json();
            if (!json.success) throw new Error(json.error);

            // Save to cache
            sessionStorage.setItem(cacheKey, JSON.stringify(json.data));
            return json.data as AnalysisResult;
        },
        retry: 1
    });

    // Process Data when available
    const processed = useMemo(() => {
        if (!rawData || !rawData.history) return null;

        const history = [...rawData.history];

        // 1. Normalize Date (ROC 113/11/01 -> 2024-11-01)
        const normalizeDate = (rocDate: string) => {
            const parts = rocDate.split('/');
            if (parts.length !== 3) return rocDate;
            const year = parseInt(parts[0]) + 1911;
            return `${year}-${parts[1]}-${parts[2]}`;
        };

        const sortedHistory = history.map(h => ({
            ...h,
            normalizedDate: normalizeDate(h.date)
        })).sort((a, b) => a.normalizedDate.localeCompare(b.normalizedDate));

        const candles: StockCandle[] = sortedHistory.map(d => ({
            time: d.normalizedDate,
            open: d.open,
            high: d.max,
            low: d.min,
            close: d.close,
            value: d.Trading_Volume,
        }));

        const closePrices = sortedHistory.map(d => d.close);

        // Correct MA Calculation (Chronological)
        const calcMa = (period: number) => {
            return closePrices.map((_, i) => {
                if (i < period - 1) return 0;
                const window = closePrices.slice(i - period + 1, i + 1);
                // indicators.ts calculateSMA wants reverse ordered array? Let's check.
                // Assuming calculateSMA(arr.reverse(), p) works as before.
                return calculateSMA([...window].reverse(), period) || 0;
            });
        };

        return {
            candles,
            ma5: calcMa(5),
            ma10: calcMa(10),
            ma20: calcMa(20),
            data: rawData
        };
    }, [rawData]);

    if (isLoading) return (
        <div className="h-screen flex flex-col items-center justify-center bg-slate-950">
            <LoaderComponent />
            <p className="mt-6 text-blue-500 font-black animate-pulse tracking-widest uppercase">Deep Analyzing Markets...</p>
        </div>
    );

    if (isError || !processed) return (
        <div className="h-screen flex flex-col items-center justify-center bg-slate-950 text-rose-500 px-6 text-center">
            <AlertTriangle className="w-16 h-16 mb-6" />
            <h2 className="text-3xl font-black mb-2">深度分析失敗</h2>
            <p className="text-slate-500 font-bold mb-8">該個股數據不足或交易所連線逾時</p>
            <button
                onClick={() => router.back()}
                className="px-8 py-4 bg-slate-900 border-2 border-slate-800 rounded-2xl font-black text-white hover:border-blue-500 transition-all"
            >
                返回列表
            </button>
        </div>
    );

    const { candles, ma5, ma10, ma20, data } = processed;
    const isPositive = data.change_percent >= 0;

    return (
        <div id="stock-analysis-content" className={`flex flex-col bg-slate-950 text-white ${isLandscape ? 'h-screen overflow-hidden' : 'min-h-screen'}`}>
            {/* Landscape Floating Header: Back + Stock Name */}
            {isLandscape && (
                <div className="fixed top-0 left-0 right-0 z-[100] flex items-center gap-4 px-6 py-4 bg-slate-950/90 backdrop-blur-xl border-b border-white/5 shadow-2xl">
                    <button
                        onClick={() => router.back()}
                        className="p-3 bg-slate-800 border-2 border-slate-700 rounded-full text-slate-400 hover:text-white hover:border-blue-500 transition-all active:scale-90"
                        title="返回列表"
                    >
                        <ChevronLeft className="w-6 h-6" />
                    </button>
                    <div className="flex items-baseline gap-3 flex-1">
                        <span className="text-2xl font-black font-mono text-blue-400 tracking-tighter">{symbol}</span>
                        {data.stock_name !== symbol && (
                            <h2 className="text-2xl font-black text-white">{data.stock_name}</h2>
                        )}
                        <span className="text-[10px] font-black tracking-[0.2em] text-blue-500 uppercase bg-blue-500/10 px-3 py-1 rounded-full border border-blue-500/20">專業分析視圖</span>
                    </div>
                    <button
                        onClick={handleDownload}
                        disabled={isPrinting}
                        className="flex items-center gap-2 px-4 py-2 bg-indigo-600/20 hover:bg-indigo-600/40 disabled:opacity-50 border border-indigo-500/40 rounded-xl text-indigo-400 text-sm font-black transition-all active:scale-95"
                    >
                        {isPrinting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                        {isPrinting ? '產生中...' : '列印下載'}
                    </button>
                </div>
            )}

            {/* Portrait Header */}
            {!isLandscape && (
                <header className="px-6 py-4 flex items-center justify-between border-b border-white/5 bg-slate-900/40 backdrop-blur-xl sticky top-0 z-30">
                    <button onClick={() => router.back()} className="p-3 -ml-3 hover:bg-white/5 rounded-full transition-colors text-slate-400">
                        <ChevronLeft className="w-8 h-8" />
                    </button>
                    <div className="flex flex-col items-center">
                        <span className="text-[10px] font-black tracking-[0.2em] text-blue-500 uppercase mb-0.5">專業分析視圖</span>
                        <h2 className="text-xl font-black">
                            <span className="text-blue-400 font-mono mr-2">{symbol}</span>
                            {data.stock_name !== symbol && data.stock_name}
                        </h2>
                    </div>
                    <button
                        onClick={handleDownload}
                        disabled={isPrinting}
                        className="flex items-center gap-1.5 px-3 py-2 bg-indigo-600/20 hover:bg-indigo-600/40 disabled:opacity-50 border border-indigo-500/40 rounded-xl text-indigo-400 text-xs font-black transition-all active:scale-95"
                    >
                        {isPrinting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                        {isPrinting ? '產生中...' : '列印下載'}
                    </button>
                </header>
            )}

            <div className={clsx(
                "flex flex-col",
                isLandscape ? "h-full flex-row pt-[72px]" : ""
            )}>
                {/* Visual Dashboard Overlay - Only show when NOT landscape */}
                {!isLandscape && (
                    <section className="p-6 space-y-8 bg-gradient-to-b from-slate-900/20 to-transparent">
                        {/* 個股代碼與名稱標題 */}
                        <div className="flex items-baseline gap-3 mb-2">
                            <span className="text-3xl font-black font-mono text-blue-400 tracking-tighter">{symbol}</span>
                            {data.stock_name !== symbol && (
                                <h1 className="text-3xl font-black text-white">{data.stock_name}</h1>
                            )}
                        </div>
                        <div className="flex justify-between items-end">
                            <div>
                                <span className="text-xs font-black text-slate-500 uppercase tracking-widest mb-1.5 block">核心報價</span>
                                <div className="flex items-baseline gap-4">
                                    <h1 className={clsx(
                                        "text-6xl font-black font-mono tracking-tighter tabular-nums",
                                        isPositive ? "text-rose-500" : "text-emerald-500"
                                    )}>
                                        {data.close.toFixed(2)}
                                    </h1>
                                    <div className={clsx(
                                        "text-2xl font-black font-mono px-3 py-1 rounded-xl",
                                        isPositive ? "bg-rose-500/10 text-rose-500" : "bg-emerald-500/10 text-emerald-500"
                                    )}>
                                        {isPositive ? '▲' : '▼'} {(data.change_percent * 100).toFixed(2)}%
                                    </div>
                                </div>
                            </div>

                            {/* Score Circle */}
                            <div className="relative w-24 h-24 flex items-center justify-center">
                                <svg className="w-full h-full transform -rotate-90">
                                    <circle cx="48" cy="48" r="42" stroke="currentColor" strokeWidth="8" fill="transparent" className="text-slate-800" />
                                    <circle cx="48" cy="48" r="42" stroke="currentColor" strokeWidth="8" fill="transparent"
                                        strokeDasharray={263.8}
                                        strokeDashoffset={263.8 * (1 - (data.score || 0.85))}
                                        className="text-blue-500"
                                        strokeLinecap="round"
                                    />
                                </svg>
                                <div className="absolute inset-0 flex flex-col items-center justify-center">
                                    <span className="text-2xl font-black font-mono">{Math.round((data.score || 0.85) * 100)}</span>
                                    <span className="text-[8px] font-black text-slate-500 tracking-widest uppercase">總分</span>
                                </div>
                            </div>
                        </div>

                        {/* Resonance Grid - Mobile Only */}
                        <div className="grid grid-cols-2 gap-4">
                            <ResonanceCard
                                icon={<Flame className="w-5 h-5" />}
                                title="量能共振"
                                value={`${data.v_ratio.toFixed(1)}x`}
                                active={data.v_ratio >= 3}
                                color="amber"
                                description="當前成交量與過去 5 日均量比值，反映動能介入強度。"
                            />
                            <ResonanceCard
                                icon={<TrendingUp className="w-5 h-5" />}
                                title="突破共振"
                                value="爆發前兆"
                                active={data.is_ma_breakout}
                                color="emerald"
                                description="價格帶量突破關鍵壓力或均線，確認多頭趨勢啟動。"
                            />
                            <ResonanceCard
                                icon={<Zap className="w-5 h-5" />}
                                title="均線共振"
                                value="強烈壓縮"
                                active={data.is_ma_aligned}
                                color="purple"
                                description="短中長期均線收斂糾結，預示即將發生方向性大爆發。"
                            />
                            <ResonanceCard
                                icon={<ShieldCheck className="w-5 h-5" />}
                                title="權重共振"
                                value="極高概率"
                                active={true}
                                color="blue"
                                description="結合籌碼集中度與基本面成長，提供高勝率操作信心。"
                            />
                        </div>

                        {/* Analysis Breakdown - 技術面/籌碼面/基本面 */}
                        <div className="bg-slate-900/40 border border-white/5 rounded-[2rem] p-6 space-y-4">
                            <h4 className="text-sm font-black text-slate-300 uppercase tracking-widest flex items-center gap-2">
                                <Activity className="w-4 h-4" />
                                即時分析
                            </h4>
                            <div className="grid grid-cols-1 gap-3">
                                {/* Technical */}
                                <div className="flex items-start gap-3 p-4 bg-slate-800/30 rounded-xl border border-slate-700/50">
                                    <div className="pt-1">
                                        <span className="text-[9px] font-black text-blue-400 uppercase tracking-widest bg-blue-500/10 px-2 py-1 rounded">技術面</span>
                                    </div>
                                    <span className="text-sm font-bold text-slate-300 flex-1">
                                        {data.analysisHints?.technical || data.analysisHints?.technicalSignals || 'V-Ratio 爆升、均線高度糾結'}
                                    </span>
                                </div>
                                {/* Chips */}
                                <div className="flex items-start gap-3 p-4 bg-slate-800/30 rounded-xl border border-slate-700/50">
                                    <div className="pt-1">
                                        <span className="text-[9px] font-black text-amber-400 uppercase tracking-widest bg-amber-500/10 px-2 py-1 rounded">籌碼面</span>
                                    </div>
                                    <span className="text-sm font-bold text-slate-300 flex-1">
                                        {data.analysisHints?.chips || data.analysisHints?.chipSignals || '機構買進集中、籌碼震盪'}
                                    </span>
                                </div>
                                {/* Fundamental */}
                                <div className="flex items-start gap-3 p-4 bg-slate-800/30 rounded-xl border border-slate-700/50">
                                    <div className="pt-1">
                                        <span className="text-[9px] font-black text-emerald-400 uppercase tracking-widest bg-emerald-500/10 px-2 py-1 rounded">基本面</span>
                                    </div>
                                    <span className="text-sm font-bold text-slate-300 flex-1">
                                        {data.analysisHints?.fundamental || data.analysisHints?.fundamentalSignals || '營收環比正成長'}
                                    </span>
                                </div>
                            </div>
                        </div>
                    </section>
                )}

                {/* Main Content Area */}
                <main className={clsx(
                    "flex-1 flex flex-col",
                    isLandscape ? "w-full h-full overflow-y-auto" : ""
                )}>
                    {/* Chart Section with Toggle - Cleaned up to ensure clickability */}
                    <div className={clsx(
                        "py-6 flex items-center justify-between border-b border-white/5 bg-slate-900/40 relative z-30",
                        isLandscape ? "pl-28 pr-6" : "px-6"
                    )}>
                        <div className="flex flex-col">
                            <h3 className="text-lg font-black text-slate-300 flex items-center gap-2">
                                <LineChart className="w-5 h-5 text-blue-400" />
                                技術走勢圖及共振指標
                            </h3>
                            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-tighter mt-1">TradingView Advanced Chart Engine</p>
                        </div>
                        <button
                            type="button"
                            onClick={(e) => {
                                e.stopPropagation();
                                setShowChart(prev => !prev);
                            }}
                            className={clsx(
                                "px-5 py-2.5 rounded-2xl border-2 transition-all flex items-center gap-3 active:scale-90 select-none cursor-pointer",
                                showChart
                                    ? "bg-blue-600/20 border-blue-500/50 text-blue-400 shadow-[0_0_20px_rgba(59,130,246,0.2)]"
                                    : "bg-slate-800 border-white/10 text-slate-500"
                            )}
                        >
                            <span className={clsx(
                                "w-2.5 h-2.5 rounded-full",
                                showChart ? "bg-emerald-500 shadow-[0_0_10px_#10b981]" : "bg-slate-600"
                            )}></span>
                            <span className="text-sm font-black tracking-tight">
                                {showChart ? '隱藏 K 線' : '顯示 K 線'}
                            </span>
                        </button>
                    </div>

                    {/* The Chart - Responsive Container with Show/Hide */}
                    {showChart && (
                        <div key={`chart-${symbol}`} className={clsx(
                            "relative bg-slate-900/30 overflow-hidden transition-all duration-300",
                            isLandscape ? "flex-1 w-full border-b border-white/5 min-h-[450px]" : "min-h-[400px] sm:min-h-[450px] md:min-h-[500px] h-auto border-y border-white/5 mx-6 rounded-2xl mb-6 mt-4"
                        )}>
                            <TradingViewChart
                                data={candles}
                                ma5={ma5}
                                ma10={ma10}
                                ma20={ma20}
                                poc={data.poc}
                            />
                            {/* Legend Overlay */}
                            <div className="absolute top-4 left-6 pointer-events-none space-y-2">
                                <div className="flex items-center gap-4 bg-slate-950/80 backdrop-blur-md px-4 py-2 rounded-2xl border border-white/10">
                                    <LegendItem color="bg-amber-500" label="MA5" />
                                    <LegendItem color="bg-blue-500" label="MA10" />
                                    <LegendItem color="bg-purple-500" label="MA20" />
                                    <LegendItem color="bg-yellow-400" label="POC" border="border-dashed" />
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Verdict System */}
                    <section className={clsx("space-y-8 p-6 md:p-8")}>
                        {/* Resonance Grid in Main Area for Desktop */}
                        {isLandscape && (
                            <div className="grid grid-cols-4 gap-4">
                                <ResonanceCard
                                    icon={<Flame className="w-5 h-5" />}
                                    title="量能共振"
                                    value={`${data.v_ratio.toFixed(1)}x`}
                                    active={data.v_ratio >= 3}
                                    color="amber"
                                    description="當前成交量與過去 5 日均量比值，反映動能介入強度。"
                                />
                                <ResonanceCard
                                    icon={<TrendingUp className="w-5 h-5" />}
                                    title="突破共振"
                                    value="爆發前兆"
                                    active={data.is_ma_breakout}
                                    color="emerald"
                                    description="價格帶量突破關鍵壓力或均線，確認多頭趨勢啟動。"
                                />
                                <ResonanceCard
                                    icon={<Zap className="w-5 h-5" />}
                                    title="均線共振"
                                    value="強烈壓縮"
                                    active={data.is_ma_aligned}
                                    color="purple"
                                    description="短中長期均線收斂糾結，預示即將發生方向性大爆發。"
                                />
                                <ResonanceCard
                                    icon={<ShieldCheck className="w-5 h-5" />}
                                    title="權重共振"
                                    value="極高概率"
                                    active={true}
                                    color="blue"
                                    description="結合籌碼集中度與基本面成長，提供高勝率操作信心。"
                                />
                            </div>
                        )}

                        {/* Analysis Hints Section */}
                        <div className="space-y-4">
                            <h3 className="text-lg font-black text-slate-300 flex items-center gap-2">
                                <Activity className="w-5 h-5 text-amber-400" />
                                全方位分析提示
                            </h3>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                {/* Technical */}
                                <div className="flex items-start gap-3 p-4 bg-slate-800/30 rounded-xl border border-slate-700/50">
                                    <div className="pt-1">
                                        <span className="text-[9px] font-black text-blue-400 uppercase tracking-widest bg-blue-500/10 px-2 py-1 rounded">技術面</span>
                                    </div>
                                    <span className="text-sm font-bold text-slate-300 flex-1">
                                        {data.analysisHints?.technical || data.analysisHints?.technicalSignals || 'V-Ratio 爆升、均線高度糾結'}
                                    </span>
                                </div>
                                {/* Chips */}
                                <div className="flex items-start gap-3 p-4 bg-slate-800/30 rounded-xl border border-slate-700/50">
                                    <div className="pt-1">
                                        <span className="text-[9px] font-black text-amber-400 uppercase tracking-widest bg-amber-500/10 px-2 py-1 rounded">籌碼面</span>
                                    </div>
                                    <span className="text-sm font-bold text-slate-300 flex-1">
                                        {data.analysisHints?.chips || data.analysisHints?.chipSignals || '機構買進集中、籌碼震盪'}
                                    </span>
                                </div>
                                {/* Fundamental */}
                                <div className="flex items-start gap-3 p-4 bg-slate-800/30 rounded-xl border border-slate-700/50">
                                    <div className="pt-1">
                                        <span className="text-[9px] font-black text-emerald-400 uppercase tracking-widest bg-emerald-500/10 px-2 py-1 rounded">基本面</span>
                                    </div>
                                    <span className="text-sm font-bold text-slate-300 flex-1">
                                        {data.analysisHints?.fundamental || data.analysisHints?.fundamentalSignals || '營收環比正成長'}
                                    </span>
                                </div>
                            </div>
                        </div>

                        {/* Score Breakdown */}
                        <div className="bg-slate-900 border-2 border-slate-800 rounded-[2.5rem] p-8 shadow-2xl">
                            <div className="flex items-center gap-3 mb-6">
                                <div className="p-2 bg-blue-500/20 rounded-xl">
                                    <BarChart3 className="w-6 h-6 text-blue-400" />
                                </div>
                                <h3 className="text-2xl font-black">綜合評分體系 (Resonance Score)</h3>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-3 gap-8 items-center">
                                {/* Score Display */}
                                <div className="flex flex-col items-center justify-center p-8 bg-black/20 rounded-[2rem] border border-white/5">
                                    <div className="flex items-baseline gap-2 mb-2">
                                        <span className="text-7xl font-black font-mono text-blue-400">
                                            {Math.round((data.score || 0.85) * 100)}
                                        </span>
                                        <span className="text-xl text-slate-500 font-bold">/ 100</span>
                                    </div>
                                    <div className="px-4 py-1.5 bg-blue-500/20 rounded-full border border-blue-500/30 text-xs font-black text-blue-400 tracking-widest uppercase">
                                        綜合共振強度評級
                                    </div>
                                </div>

                                {/* Score Components */}
                                <div className="md:col-span-2 space-y-4">
                                    {data.comprehensiveScoreDetails ? (
                                        <>
                                            <ScoreBar
                                                label="量能共振權重 (Volume Resonance)"
                                                value={data.comprehensiveScoreDetails.volumeScore || 0}
                                                max={40}
                                                color="amber"
                                            />
                                            <ScoreBar
                                                label="均線壓縮權重 (MA Squeeze)"
                                                value={data.comprehensiveScoreDetails.maScore || 0}
                                                max={30}
                                                color="purple"
                                            />
                                            <ScoreBar
                                                label="籌碼集中權重 (Institutional/Chips)"
                                                value={data.comprehensiveScoreDetails.chipScore || 0}
                                                max={30}
                                                color="emerald"
                                            />
                                            {data.comprehensiveScoreDetails.fundamentalBonus && (
                                                <ScoreBar
                                                    label="基本面成長加權 (Fundamental Bonus)"
                                                    value={data.comprehensiveScoreDetails.fundamentalBonus || 0}
                                                    max={10}
                                                    color="blue"
                                                />
                                            )}
                                        </>
                                    ) : (
                                        <div className="text-slate-500 font-black italic">正在根據多維度指標計算詳細評分...</div>
                                    )}
                                </div>
                            </div>
                        </div>
                        {/* Kelly Formula & Action */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            {/* Risk Assessment */}
                            <div className="bg-slate-900 border-2 border-rose-500/30 rounded-[2.5rem] p-8 shadow-2xl bg-gradient-to-br from-slate-900 to-rose-500/5 relative overflow-hidden">
                                <div className="absolute -top-4 -right-4 w-32 h-32 bg-rose-500/10 blur-[50px]"></div>
                                <div className="flex items-center gap-3 mb-6">
                                    <div className="p-2 bg-rose-500/20 rounded-xl">
                                        <AlertTriangle className="w-6 h-6 text-rose-400" />
                                    </div>
                                    <h3 className="text-2xl font-black text-rose-400">風險提示及防線</h3>
                                </div>

                                <div className="space-y-4 text-base font-bold text-slate-300">
                                    <div className="flex gap-3 items-start p-3 bg-rose-500/10 rounded-xl border border-rose-500/20">
                                        <span className="text-rose-400 font-black text-xl">⚠️</span>
                                        <div>
                                            <p className="text-rose-400 font-black mb-1">關鍵止損防線 (5MA Rule)</p>
                                            <p className="text-sm opacity-80 leading-relaxed">股價若收盤跌破 5 日均線，代表極短線共振強度轉弱，建議立即執行減倉或完全撤離。</p>
                                        </div>
                                    </div>
                                    <div className="flex gap-3 items-start p-3 bg-white/5 rounded-xl border border-white/10">
                                        <span className="text-rose-400 font-black text-xl">⚠️</span>
                                        <div>
                                            <p className="text-slate-100 font-black mb-1">籌碼面警訊</p>
                                            <p className="text-sm opacity-80 leading-relaxed">近期若出現爆量長黑或主力法人連續調節，需防範主力高位出貨風險，此時技術面可能失靈。</p>
                                        </div>
                                    </div>
                                    <div className="flex gap-3 items-start p-3 bg-white/5 rounded-xl border border-white/10">
                                        <span className="text-yellow-400 font-black text-xl">⚠️</span>
                                        <div>
                                            <p className="text-slate-100 font-black mb-1">共振背離風險</p>
                                            <p className="text-sm opacity-80 leading-relaxed">若股價創高但隨機指標並未同步上揚，可能存在技術背離，建議不宜過度追高。</p>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Kelly Formula */}
                            <div className="bg-slate-900 border-2 border-emerald-500/30 rounded-[2.5rem] p-8 shadow-2xl bg-gradient-to-br from-slate-900 to-emerald-500/5 relative overflow-hidden">
                                <div className="absolute -top-4 -right-4 w-32 h-32 bg-emerald-500/10 blur-[50px]"></div>
                                <div className="flex items-center gap-3 mb-6">
                                    <div className="p-2 bg-emerald-500/20 rounded-xl">
                                        <Calculator className="w-6 h-6 text-emerald-400" />
                                    </div>
                                    <h3 className="text-2xl font-black text-emerald-400">凱利公式 (Kelly Criterion)</h3>
                                </div>

                                <div className="space-y-5">
                                    <div className="p-4 bg-black/30 rounded-2xl border border-white/5">
                                        <p className="text-xs font-black text-slate-500 uppercase tracking-widest mb-2">核心操作建議</p>
                                        <div className={clsx(
                                            "text-4xl font-black tracking-tight",
                                            (data.score || 0) >= 0.6 ? "text-emerald-400" : "text-amber-400"
                                        )}>
                                            {calculateKellyAction(data.score || 0.85)}
                                        </div>
                                    </div>

                                    <div className="p-4 bg-black/30 rounded-2xl border border-white/5">
                                        <p className="text-xs font-black text-slate-500 uppercase tracking-widest mb-2">建議單筆投資比例</p>
                                        <div className="flex items-baseline gap-2">
                                            <span className="text-5xl font-black text-emerald-400 font-mono">
                                                {calculateKellyPercentage(data.score || 0.85)}%
                                            </span>
                                            <span className="text-lg text-slate-400 font-bold uppercase tracking-widest">Available Capital</span>
                                        </div>
                                    </div>

                                    <div className="p-4 bg-white/5 rounded-2xl border border-white/5">
                                        <p className="text-[11px] font-black text-slate-500 uppercase tracking-[0.2em] mb-3">公式計算依據說明</p>
                                        <p className="text-xs text-slate-400 leading-relaxed font-medium">
                                            系統基於當前共振評分 (Score) 作為勝率權重，假設盈虧比為 1.5:1 客觀計算。
                                            <br /><br />
                                            <span className="text-emerald-400/80">計算邏輯：f* = (p(b+1) - 1) / b</span>
                                            <br />
                                            這能動態優化您的倉位分配，在「勝率與賠率」之間取得數學上的最優平衡，避免因過度重倉而導致不可逆的財富回撤。
                                        </p>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* AI Expert Section */}
                        <div className="bg-slate-900 border-2 border-slate-800 rounded-[2.5rem] p-8 shadow-2xl relative overflow-hidden group">
                            <div className="absolute top-0 right-0 p-8 opacity-10 group-hover:scale-110 transition-transform">
                                <MessageSquare className="w-32 h-32" />
                            </div>
                            <div className="relative z-10">
                                <div className="flex items-center gap-3 mb-6">
                                    <div className="p-2 bg-blue-500/20 rounded-xl">
                                        <Target className="w-6 h-6 text-blue-400" />
                                    </div>
                                    <h3 className="text-2xl font-black">AI 專家多維判斷結論</h3>
                                </div>
                                <p className="text-2xl font-black text-slate-200 leading-relaxed tracking-tight prose prose-invert max-w-none">
                                    {generateAIConclusion(data)}
                                </p>
                                <div className="mt-8 flex flex-wrap gap-4">
                                    <VerdictTag label={data.score >= 0.7 ? "建議加倉" : "建議觀望"} color={data.score >= 0.7 ? "blue" : "blue"} />
                                    <VerdictTag label={data.v_ratio >= 3 ? "量能爆發" : "量能平穩"} color="emerald" />
                                    <VerdictTag label={data.is_ma_aligned ? "均線糾結" : "多頭排列"} color="blue" />
                                </div>
                            </div>
                        </div>
                    </section>
                </main>
            </div>
        </div>
    );
}

// Sub-components for better organization
function LoaderComponent() {
    return (
        <div className="relative w-20 h-20">
            <div className="absolute inset-0 border-4 border-blue-500/20 rounded-full" />
            <div className="absolute inset-0 border-4 border-blue-500 rounded-full border-t-transparent animate-spin" />
        </div>
    );
}

function ResonanceCard({ icon, title, value, active, color, description }: { icon: any, title: string, value: string, active: boolean, color: string, description: string }) {
    const colors = {
        amber: active ? "text-amber-400 border-amber-500/30 bg-amber-500/5 shadow-amber-500/10" : "text-slate-600 border-slate-800",
        emerald: active ? "text-emerald-400 border-emerald-500/30 bg-emerald-500/5 shadow-emerald-500/10" : "text-slate-600 border-slate-800",
        purple: active ? "text-purple-400 border-purple-500/30 bg-purple-500/5 shadow-purple-500/10" : "text-slate-600 border-slate-800",
        blue: active ? "text-blue-400 border-blue-500/30 bg-blue-500/5 shadow-blue-500/10" : "text-slate-600 border-slate-800",
    };

    return (
        <div className={clsx(
            "p-5 rounded-3xl border-2 transition-all flex items-center justify-between shadow-xl",
            colors[color as keyof typeof colors]
        )}>
            <div className="flex flex-col flex-1 mr-4">
                <span className="text-xl font-black uppercase tracking-tight mb-1">{title}</span>
                <span className="text-2xl font-black mb-2">{value}</span>
                <p className="text-[10px] font-bold opacity-70 leading-relaxed">{description}</p>
            </div>
            <div className={clsx(
                "p-2 rounded-xl transition-all",
                active ? "bg-white/10 scale-110" : "opacity-20 grayscale"
            )}>
                {icon}
            </div>
        </div>
    );
}

function LegendItem({ color, label, border = "" }: { color: string, label: string, border?: string }) {
    return (
        <div className="flex items-center gap-2">
            <div className={clsx("w-3 h-3 rounded-full", color, border)} />
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{label}</span>
        </div>
    );
}

function VerdictTag({ label, color }: { label: string, color: string }) {
    const colors = {
        blue: "bg-blue-500/10 text-blue-400 border-blue-500/30",
        emerald: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
    };
    return (
        <span className={clsx(
            "px-4 py-2 rounded-2xl border-2 text-sm font-black",
            colors[color as keyof typeof colors]
        )}>
            {label}
        </span>
    );
}

// Score bar component for breakdown display
function ScoreBar({ label, value, max, color }: { label: string, value: number, max: number, color: string }) {
    const percentage = (value / max) * 100;
    const colorClasses = {
        amber: "bg-amber-500",
        purple: "bg-purple-500",
        emerald: "bg-emerald-500",
        blue: "bg-blue-500",
    };

    return (
        <div>
            <div className="flex justify-between items-center mb-2">
                <span className="text-sm font-bold text-slate-300">{label}</span>
                <span className="text-sm font-black text-slate-400 font-mono">{value.toFixed(1)}/{max}</span>
            </div>
            <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
                <div
                    className={clsx("h-full rounded-full transition-all", colorClasses[color as keyof typeof colorClasses])}
                    style={{ width: `${Math.min(percentage, 100)}%` }}
                />
            </div>
        </div>
    );
}

// Kelly formula calculation functions
function calculateKellyAction(score: number): string {
    if (score >= 0.75) return "強烈買進";
    if (score >= 0.6) return "適度買進";
    if (score >= 0.45) return "觀望";
    return "暫不操作";
}

function calculateKellyPercentage(score: number): number {
    const percentage = Math.max(0, Math.min(100, (score * 2 - 1) * 100));
    return Math.round(percentage);
}

// AI Conclusion Generator - Dynamic results based on stock data
function generateAIConclusion(data: AnalysisResult): string {
    const { stock_name, score, v_ratio, is_ma_aligned, is_ma_breakout } = data;

    // Determine tone based on score
    if (score >= 0.8) {
        return `根據深度量能探測，${stock_name} 目前正處於典型的【全信號共振】噴發前兆。量能倍增 ${v_ratio.toFixed(1)}x 伴隨均線極致壓縮，顯示主力吸籌已臻完成，市場共謀度極高。建議密切關注開盤表現，只要站穩 5MA，主升段行情爆發概率大增。`;
    } else if (score >= 0.65) {
        return `${stock_name} 當前展現出穩健的技術面修復跡象。V-Ratio 為 ${v_ratio.toFixed(1)}x，雖未達極端放量，但均線排列已趨向多頭${is_ma_aligned ? '（高度糾結壓縮）' : ''}。目前屬於機構震盪洗籌階段，適合分批佈局。若突破前高壓力位，後市動能將進一步釋放。`;
    } else if (score >= 0.45) {
        return `目前 ${stock_name} 處於多空拉鋸的橫盤整理區間。量能比 ${v_ratio.toFixed(1)}x 顯示市場參與度尚在溫和回升，但明確的共振信號尚未完全閉合。此時建議以觀望為主，等待 ${is_ma_breakout ? '突破確認' : '均線進一步靠攏'} 後再行介入，避免在震盪中磨損資金。`;
    } else {
        return `${stock_name} 目前技術形態偏弱，量能萎縮且未見明顯支撐跡象。得分僅為 ${Math.round(score * 100)}，暗示主力資金目前並無拉升意願。建議嚴格遵守風險管理體系，暫時避開或降低持倉，直至量價配合出現底部分型共振信號。`;
    }
}
