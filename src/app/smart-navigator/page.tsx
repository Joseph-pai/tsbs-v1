'use client';

import { useState } from 'react';
import { Compass, Loader2, ArrowLeft, TrendingUp, AlertTriangle, HelpCircle, AlertCircle } from 'lucide-react';
import { useRouter } from 'next/navigation';
import AuthGuard from '@/components/layout/AuthGuard';

export default function SmartNavigatorPage() {
    const router = useRouter();
    const [stockId, setStockId] = useState('');
    const [period, setPeriod] = useState('30');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [result, setResult] = useState<any>(null);
    const [showDetails, setShowDetails] = useState(false);
    const [activeTooltip, setActiveTooltip] = useState<string | null>(null);

    const handleSearch = async () => {
        if (!stockId) return;
        setIsLoading(true);
        setError(null);
        setResult(null);

        try {
            const res = await fetch(`/api/smart-navigator?stockId=${stockId}&period=${period}`);
            const json = await res.json();

            if (!json.success) {
                throw new Error(json.error || '查詢失敗');
            }

            setResult(json.data);
        } catch (e: any) {
            setError(e.message);
        } finally {
            setIsLoading(false);
        }
    };

    const lightColors = {
        green: 'bg-emerald-500 shadow-[0_0_30px_rgba(16,185,129,0.8)]',
        yellow: 'bg-amber-500 shadow-[0_0_30px_rgba(245,158,11,0.8)]',
        red: 'bg-rose-500 shadow-[0_0_30px_rgba(244,63,94,0.8)]',
    };

    const lightText = {
        green: '訊號極佳',
        yellow: '謹慎觀察',
        red: '風險警告',
    };

    return (
        <AuthGuard>
            <div className="container mx-auto px-6 py-12 max-w-2xl min-h-screen">
                {/* Header */}
                <button
                    onClick={() => router.push('/')}
                    className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors mb-8"
                >
                    <ArrowLeft className="w-5 h-5" />
                    返回主控台
                </button>

                <div className="text-center mb-12">
                    <div className="inline-flex items-center gap-3 px-6 py-2 rounded-full bg-indigo-500/10 border border-indigo-500/30 mb-6 shadow-lg shadow-indigo-500/10">
                        <Compass className="w-6 h-6 text-indigo-400" />
                        <span className="text-lg font-black text-indigo-400 tracking-widest">SMART NAVIGATOR</span>
                    </div>
                    <h1 className="text-5xl font-black text-white mb-4">智能選股導航</h1>
                    <p className="text-slate-400">極簡化操作，一鍵獲取白話佈局建議</p>
                </div>

                {/* Input Area */}
                <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 mb-8 shadow-2xl">
                    <div className="flex flex-col md:flex-row gap-4">
                        <input
                            type="text"
                            placeholder="輸入股票代號 (例如: 2330)"
                            className="flex-1 bg-black/50 border border-slate-700 rounded-xl px-6 py-4 text-xl font-bold text-white focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all"
                            value={stockId}
                            onChange={(e) => setStockId(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                        />
                        <select
                            value={period}
                            onChange={(e) => setPeriod(e.target.value)}
                            className="bg-black/50 border border-slate-700 rounded-xl px-6 py-4 text-lg font-bold text-white focus:outline-none focus:border-indigo-500 transition-all cursor-pointer"
                        >
                            <option value="30">近 30 日</option>
                            <option value="60">近 60 日</option>
                            <option value="90">近 90 日</option>
                            <option value="120">近 120 日</option>
                        </select>
                        <button
                            onClick={handleSearch}
                            disabled={isLoading || !stockId}
                            className="bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 disabled:text-slate-500 text-white font-black px-8 py-4 rounded-xl transition-all flex items-center justify-center gap-2 min-w-[120px]"
                        >
                            {isLoading ? <Loader2 className="w-6 h-6 animate-spin" /> : '開始導航'}
                        </button>
                    </div>
                    {error && (
                        <div className="mt-4 p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 flex items-center gap-2">
                            <AlertCircle className="w-5 h-5" />
                            {error}
                        </div>
                    )}
                </div>

                {/* Result Area */}
                {result && (
                    <div className="animate-in fade-in slide-in-from-bottom-8 duration-700 space-y-6">
                        
                        {/* Traffic Light */}
                        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-8 shadow-2xl flex flex-col items-center justify-center relative overflow-hidden">
                            <div className="flex items-center gap-2 mb-6">
                                <div className="text-slate-400 font-black tracking-widest text-sm uppercase">目前狀態燈號</div>
                                <button 
                                    onClick={() => setShowDetails(!showDetails)}
                                    className="text-slate-500 hover:text-indigo-400 transition-colors"
                                >
                                    <HelpCircle className="w-4 h-4" />
                                </button>
                            </div>

                            {showDetails && (
                                <div className="absolute inset-0 bg-slate-900/95 z-10 p-6 flex flex-col overflow-y-auto animate-in fade-in duration-300">
                                    <div className="flex justify-between items-center mb-4">
                                        <h3 className="text-indigo-400 font-bold text-lg">燈號判定標準</h3>
                                        <button onClick={() => setShowDetails(false)} className="text-slate-400 hover:text-white">
                                            <ArrowLeft className="w-5 h-5" />
                                        </button>
                                    </div>
                                    <div className="space-y-4 text-sm text-slate-300">
                                        <div>
                                            <p className="text-white font-bold mb-1">【核心大前提】</p>
                                            <ul className="list-disc list-inside space-y-1 opacity-80">
                                                <li>站穩月線：股價必須在 20MA 之上。</li>
                                                <li>非高檔區：股價位階 (Position %) 必須低於 70%。</li>
                                            </ul>
                                        </div>
                                        <div>
                                            <p className="text-emerald-400 font-bold mb-1">【綠燈觸發情境】</p>
                                            <ul className="list-disc list-inside space-y-1 opacity-80">
                                                <li>低檔轉強：位階 &lt; 30% 且換手率 &gt; 5%。</li>
                                                <li>中檔突破：位階 30-70% 且換手率 &gt; 5%。</li>
                                            </ul>
                                        </div>
                                        <p className="text-rose-400 text-xs italic">* 註：若跌破 20MA 或位階過高，系統會強制顯示紅燈或黃燈警示。</p>
                                    </div>
                                </div>
                            )}
                            <div className="flex gap-4 p-4 bg-black/40 rounded-full border border-white/5 mb-6">
                                <div className={`w-12 h-12 rounded-full border-2 ${result.light === 'red' ? lightColors.red + ' border-rose-300' : 'bg-slate-800 border-slate-700 opacity-30'} transition-all duration-500`} />
                                <div className={`w-12 h-12 rounded-full border-2 ${result.light === 'yellow' ? lightColors.yellow + ' border-amber-300' : 'bg-slate-800 border-slate-700 opacity-30'} transition-all duration-500`} />
                                <div className={`w-12 h-12 rounded-full border-2 ${result.light === 'green' ? lightColors.green + ' border-emerald-300' : 'bg-slate-800 border-slate-700 opacity-30'} transition-all duration-500`} />
                            </div>
                            <div className={`text-2xl font-black ${result.light === 'green' ? 'text-emerald-400' : result.light === 'yellow' ? 'text-amber-400' : 'text-rose-400'}`}>
                                {lightText[result.light as keyof typeof lightText]}
                            </div>
                        </div>

                        {/* Prices */}
                        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-8 shadow-2xl">
                            <div className="text-slate-400 font-black mb-6 tracking-widest text-sm text-center">智能操作價格</div>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="bg-black/40 rounded-2xl p-4 border border-white/5 text-center">
                                    <div className="text-slate-500 font-bold mb-1 text-sm">買入建議</div>
                                    <div className="text-3xl font-black text-indigo-400">{result.prices.buy}</div>
                                </div>
                                <div className="bg-black/40 rounded-2xl p-4 border border-rose-500/20 text-center">
                                    <div className="text-rose-500 font-bold mb-1 text-sm">防守停損</div>
                                    <div className="text-3xl font-black text-rose-400">{result.prices.stopLoss}</div>
                                </div>
                                <div className="bg-black/40 rounded-2xl p-4 border border-emerald-500/20 text-center">
                                    <div className="text-emerald-500 font-bold mb-1 text-sm">第一批停利 (30%)</div>
                                    <div className="text-3xl font-black text-emerald-400">{result.prices.tp1}</div>
                                </div>
                                <div className="bg-black/40 rounded-2xl p-4 border border-emerald-500/20 text-center">
                                    <div className="text-emerald-500 font-bold mb-1 text-sm">第二批停利 (70%)</div>
                                    <div className="text-3xl font-black text-emerald-400">{result.prices.tp2}</div>
                                </div>
                            </div>
                        </div>

                        {/* Interpretations */}
                        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-8 shadow-2xl">
                            <div className="text-slate-400 font-black mb-6 tracking-widest text-sm flex items-center gap-2">
                                <TrendingUp className="w-4 h-4" />
                                主力動態白話解讀
                            </div>
                            <div className="space-y-4">
                                {result.interpretations.map((text: string, idx: number) => {
                                    const isTargetText = text.includes('高位量縮，籌碼相對穩定');
                                    return (
                                        <div key={idx} className="relative flex flex-col bg-black/40 p-4 rounded-xl border border-white/5">
                                            <div className="flex gap-3">
                                                <div className="text-indigo-400 mt-0.5">•</div>
                                                <div className="text-slate-300 font-medium leading-relaxed flex items-center gap-2 flex-wrap">
                                                    {text}
                                                    {isTargetText && (
                                                        <button 
                                                            onClick={() => setActiveTooltip(activeTooltip === text ? null : text)}
                                                            className="text-indigo-400 hover:text-white transition-colors inline-flex"
                                                        >
                                                            <HelpCircle className="w-4 h-4" />
                                                        </button>
                                                    )}
                                                </div>
                                            </div>
                                            {activeTooltip === text && isTargetText && (
                                                <div className="mt-3 p-4 bg-indigo-500/10 border border-indigo-500/20 rounded-lg text-xs text-slate-300 leading-loose animate-in slide-in-from-top-2 duration-300">
                                                    <div className="text-white font-bold mb-1">💡 專家解讀：</div>
                                                    高位量縮代表股價雖處於近期高點，但成交量卻縮小（想賣的人更少），顯示主力惜售，賣壓極輕。這種情況趨勢往往能維持或進入橫盤，雖然不宜追高，但對於持股者而言是籌碼安定的正面訊號。
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>

                    </div>
                )}
            </div>
        </AuthGuard>
    );
}
