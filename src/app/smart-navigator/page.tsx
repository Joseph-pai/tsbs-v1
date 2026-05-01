'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { Compass, Loader2, ArrowLeft, TrendingUp, AlertTriangle, HelpCircle, AlertCircle, Calendar as CalendarIcon, ChevronLeft, ChevronRight, X, Play, Filter } from 'lucide-react';
import { useRouter } from 'next/navigation';
import AuthGuard from '@/components/layout/AuthGuard';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, getDay, addMonths, subMonths } from 'date-fns';
import { getScanRecords } from '@/services/firebaseDb';
import { useAuth } from '@/lib/firebase/context/AuthContext';

// --- Constants & Dictionary ---
const INTERPRETATION_DETAILS: Record<string, string> = {
    '高位量縮，籌碼相對穩定': '高位量縮代表股價雖處於近期高點，但成交量縮小，顯示主力惜售，賣壓極輕。這種情況下趨勢往往能維持或進入橫盤，對於持股者而言是籌碼安定的正面訊號。',
    '高位爆出天量，主力疑似出貨': '「天量」是指成交量異常巨大。在股價高位出現天量，通常是主力趁利多消息將手中大量籌碼轉嫁給散戶的特徵（割韭菜），是極其危險的翻轉訊號。',
    '高位換手熱烈，請留意追高風險': '代表高檔位置買賣雙方力道都很大，雖然股價還沒崩跌，但波動會加劇。此時追高風險極大，建議觀察是否能站穩成交密集區。',
    '帶量突破盤整區，動能轉強': '股價盤整多日後，今天買盤強力湧入且推升價格（量價齊揚）。這代表多頭共識達成，通常是新一波漲勢的啟動點。',
    '主力積極換手，底部量增': '股價在低位跌不動後開始出現大成交量，表示有新的主力進場吃貨並吸收掉散戶的停損單，是底部翻轉、準備起漲的徵兆。',
    '低位量縮整理，可逢低少量試單': '代表賣盤已經吐盡（賣壓枯竭），股價雖然還沒開始漲，但下行空間有限。此時適合在支撐位附近小量佈局，等待發動。',
    '價穩量縮，方向待表態': '股價波動變小且成交量委縮，代表市場正在等待下一個驅動消息。目前多空平衡，建議觀察股價會往哪個方向突破再做決定。'
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

// --- Mini Calendar Component ---
interface MiniCalendarProps {
    recordDates: Set<string>;
    selectedDate: string | null;
    onSelectDate: (date: string) => void;
}

function MiniCalendar({ recordDates, selectedDate, onSelectDate }: MiniCalendarProps) {
    const [viewMonth, setViewMonth] = useState(() => new Date());
    const days = useMemo(() => {
        const start = startOfMonth(viewMonth);
        const end = endOfMonth(viewMonth);
        return eachDayOfInterval({ start, end });
    }, [viewMonth]);
    const leadingBlanks = getDay(startOfMonth(viewMonth));

    return (
        <div className="bg-black/40 border border-slate-700 rounded-2xl p-4">
            <div className="flex items-center justify-between mb-3">
                <button onClick={() => setViewMonth(m => subMonths(m, 1))} className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors">
                    <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="text-sm font-bold text-white">{format(viewMonth, 'yyyy年 M月')}</span>
                <button onClick={() => setViewMonth(m => addMonths(m, 1))} className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors">
                    <ChevronRight className="w-4 h-4" />
                </button>
            </div>
            <div className="grid grid-cols-7 mb-1">
                {['日','一','二','三','四','五','六'].map(d => <div key={d} className="text-center text-[10px] font-bold text-slate-500 py-1">{d}</div>)}
            </div>
            <div className="grid grid-cols-7 gap-1">
                {Array.from({ length: leadingBlanks }).map((_, i) => <div key={`blank-${i}`} />)}
                {days.map(day => {
                    const dateStr = format(day, 'yyyy-MM-dd');
                    const hasRecord = recordDates.has(dateStr);
                    const isSelected = selectedDate === dateStr;
                    return (
                        <button
                            key={dateStr}
                            onClick={() => hasRecord && onSelectDate(dateStr)}
                            disabled={!hasRecord}
                            className={`relative flex flex-col items-center justify-center h-9 w-full rounded-lg text-xs font-semibold border transition-all ${
                                isSelected ? 'bg-indigo-600 text-white border-indigo-500 shadow-[0_0_15px_rgba(79,70,229,0.5)]' :
                                hasRecord ? 'text-slate-200 border-slate-700 hover:bg-indigo-600/20 hover:border-indigo-500/50 cursor-pointer' :
                                'text-slate-700 border-transparent cursor-default'
                            }`}
                        >
                            <span>{day.getDate()}</span>
                            {hasRecord && <span className={`absolute bottom-1 w-1 h-1 rounded-full ${isSelected ? 'bg-white' : 'bg-indigo-400'}`} />}
                        </button>
                    );
                })}
            </div>
        </div>
    );
}

// --- Result Card Component ---
function ResultCard({ result, stockId, stockName }: { result: any, stockId: string, stockName?: string }) {
    const [showDetails, setShowDetails] = useState(false);
    const [activeTooltip, setActiveTooltip] = useState<string | null>(null);

    return (
        <div className="animate-in fade-in slide-in-from-bottom-8 duration-700 space-y-6 mb-12">
            {/* Title for Auto Filter Results */}
            {stockName && (
                <div className="flex items-center gap-3 mb-2">
                    <div className="bg-indigo-500/20 text-indigo-400 px-4 py-2 rounded-xl font-black border border-indigo-500/30 text-xl">
                        {stockId}
                    </div>
                    <div className="text-2xl font-black text-white">{stockName}</div>
                </div>
            )}

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
                        const matchingKey = Object.keys(INTERPRETATION_DETAILS).find(key => text.includes(key));
                        const detail = matchingKey ? INTERPRETATION_DETAILS[matchingKey] : null;

                        return (
                            <div key={idx} className="relative flex flex-col bg-black/40 p-4 rounded-xl border border-white/5">
                                <div className="flex gap-3">
                                    <div className="text-indigo-400 mt-0.5">•</div>
                                    <div className="text-slate-300 font-medium leading-relaxed flex items-center gap-2 flex-wrap">
                                        {text}
                                        {detail && (
                                            <button 
                                                onClick={() => setActiveTooltip(activeTooltip === text ? null : text)}
                                                className="text-indigo-400 hover:text-white transition-colors inline-flex"
                                            >
                                                <HelpCircle className="w-4 h-4" />
                                            </button>
                                        )}
                                    </div>
                                </div>
                                {activeTooltip === text && detail && (
                                    <div className="mt-3 p-4 bg-indigo-500/10 border border-indigo-500/20 rounded-lg text-xs text-slate-300 leading-loose animate-in slide-in-from-top-2 duration-300">
                                        <div className="text-white font-bold mb-1">💡 專家解讀：</div>
                                        {detail}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}

export default function SmartNavigatorPage() {
    const router = useRouter();
    const { user } = useAuth();
    
    // Default Search State
    const [stockId, setStockId] = useState('');
    const [period, setPeriod] = useState('30');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [result, setResult] = useState<any>(null);

    // Auto Filter State
    const [showAutoFilter, setShowAutoFilter] = useState(false);
    const [autoPeriod, setAutoPeriod] = useState('30');
    const [maxPosition, setMaxPosition] = useState('70');
    const [scanRecords, setScanRecords] = useState<any[]>([]);
    const [selectedDate, setSelectedDate] = useState<string | null>(null);
    const [isFiltering, setIsFiltering] = useState(false);
    const [filterProgress, setFilterProgress] = useState({ current: 0, total: 0, phase: '' });
    const [filterResults, setFilterResults] = useState<Array<{stockId: string, stockName: string, data: any}>>([]);
    const [filterCompleted, setFilterCompleted] = useState(false);

    // Load history records
    useEffect(() => {
        if (user && showAutoFilter) {
            getScanRecords(user.uid).then(records => {
                setScanRecords(records);
            }).catch(e => {
                console.error("Failed to load history", e);
            });
        }
    }, [user, showAutoFilter]);

    const recordDates = useMemo<Set<string>>(() => {
        const s = new Set<string>();
        scanRecords.forEach(r => {
            if (r.createdAt?.seconds) {
                s.add(format(new Date(r.createdAt.seconds * 1000), 'yyyy-MM-dd'));
            }
        });
        return s;
    }, [scanRecords]);

    const handleSearch = async () => {
        if (!stockId) return;
        setIsLoading(true);
        setError(null);
        setResult(null);
        setShowAutoFilter(false);

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

    const handleAutoFilter = async () => {
        if (!selectedDate) return;
        setIsFiltering(true);
        setError(null);
        setFilterResults([]);
        setFilterCompleted(false);
        setResult(null);

        try {
            // Find all stocks scanned on the selected date
            const targetRecords = scanRecords.filter(r => {
                if (!r.createdAt?.seconds) return false;
                return format(new Date(r.createdAt.seconds * 1000), 'yyyy-MM-dd') === selectedDate;
            });

            // Extract unique stocks
            const stockMap = new Map<string, string>(); // stockId -> stockName
            targetRecords.forEach(r => {
                const items = r.data || r.results || [];
                items.forEach((item: any) => {
                    if (item.stock_id) stockMap.set(item.stock_id, item.stock_name || '');
                });
            });

            const uniqueStocks = Array.from(stockMap.entries()).map(([id, name]) => ({ id, name }));

            if (uniqueStocks.length === 0) {
                setFilterCompleted(true);
                setIsFiltering(false);
                return;
            }

            const BATCH_SIZE = 5;
            const validResults = [];
            const maxPosPercent = parseInt(maxPosition, 10);

            for (let i = 0; i < uniqueStocks.length; i += BATCH_SIZE) {
                const batch = uniqueStocks.slice(i, i + BATCH_SIZE);
                setFilterProgress({
                    current: i,
                    total: uniqueStocks.length,
                    phase: `正在分析 ${i + 1} ~ ${Math.min(i + BATCH_SIZE, uniqueStocks.length)} 檔股票...`
                });

                const batchPromises = batch.map(async (stock) => {
                    try {
                        const res = await fetch(`/api/smart-navigator?stockId=${stock.id}&period=${autoPeriod}`);
                        const json = await res.json();
                        if (json.success && json.data) {
                            // Progressive Filter
                            // 1. Easy filter: max position
                            if (json.data.metrics && json.data.metrics.positionPercent <= maxPosPercent) {
                                // 2. Green light filter
                                if (json.data.light === 'green') {
                                    return {
                                        stockId: stock.id,
                                        stockName: stock.name,
                                        data: json.data
                                    };
                                }
                            }
                        }
                    } catch (e) {
                        console.error(`Failed to analyze ${stock.id}`, e);
                    }
                    return null;
                });

                const resolved = await Promise.all(batchPromises);
                validResults.push(...resolved.filter(r => r !== null));
            }

            setFilterProgress({ current: uniqueStocks.length, total: uniqueStocks.length, phase: '分析完成' });
            setFilterResults(validResults as any);
            setFilterCompleted(true);

        } catch (e: any) {
            setError(e.message || '自動篩選失敗');
        } finally {
            setIsFiltering(false);
        }
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
                <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 mb-8 shadow-2xl relative overflow-hidden">
                    <div className="flex flex-col md:flex-row flex-wrap gap-4 relative z-10">
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
                            className="bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 disabled:text-slate-500 text-white font-black px-6 py-4 rounded-xl transition-all flex items-center justify-center gap-2 min-w-[120px]"
                        >
                            {isLoading ? <Loader2 className="w-6 h-6 animate-spin" /> : '開始導航'}
                        </button>
                        <button
                            onClick={() => setShowAutoFilter(!showAutoFilter)}
                            className={`px-4 py-4 rounded-xl font-black transition-all flex items-center justify-center gap-2 border-2 ${showAutoFilter ? 'bg-amber-500/20 text-amber-400 border-amber-500/50' : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700'}`}
                            title="自動篩選"
                        >
                            <Filter className="w-5 h-5" />
                            自動篩選
                        </button>
                    </div>

                    {/* Auto Filter Panel */}
                    {showAutoFilter && (
                        <div className="mt-6 pt-6 border-t border-slate-800 animate-in slide-in-from-top-4 fade-in duration-300">
                            <div className="flex items-center gap-2 mb-4 text-amber-400 font-bold">
                                <SparklesIcon className="w-5 h-5" />
                                歷史數據自動篩選 (僅顯示綠燈)
                            </div>
                            
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                {/* Left: Calendar */}
                                <div>
                                    <div className="text-sm text-slate-400 mb-2 font-medium flex items-center gap-2">
                                        <CalendarIcon className="w-4 h-4" />
                                        1. 選擇歷史掃描日期
                                    </div>
                                    <MiniCalendar 
                                        recordDates={recordDates} 
                                        selectedDate={selectedDate} 
                                        onSelectDate={setSelectedDate} 
                                    />
                                </div>
                                
                                {/* Right: Settings */}
                                <div className="space-y-4">
                                    <div>
                                        <div className="text-sm text-slate-400 mb-2 font-medium">2. 數據日期區間</div>
                                        <div className="grid grid-cols-4 gap-2">
                                            {['30', '60', '90', '120'].map(p => (
                                                <button
                                                    key={p}
                                                    onClick={() => setAutoPeriod(p)}
                                                    className={`py-2 rounded-lg text-sm font-bold border transition-colors ${autoPeriod === p ? 'bg-indigo-600/20 border-indigo-500 text-indigo-400' : 'bg-black/40 border-slate-700 text-slate-400 hover:bg-slate-800'}`}
                                                >
                                                    {p}天
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                    <div>
                                        <div className="text-sm text-slate-400 mb-2 font-medium">3. 過濾條件: 相對高位小於</div>
                                        <div className="grid grid-cols-3 gap-2">
                                            {['50', '60', '70'].map(pos => (
                                                <button
                                                    key={pos}
                                                    onClick={() => setMaxPosition(pos)}
                                                    className={`py-2 rounded-lg text-sm font-bold border transition-colors ${maxPosition === pos ? 'bg-amber-500/20 border-amber-500 text-amber-400' : 'bg-black/40 border-slate-700 text-slate-400 hover:bg-slate-800'}`}
                                                >
                                                    {pos}%
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                    
                                    <button
                                        onClick={handleAutoFilter}
                                        disabled={isFiltering || !selectedDate}
                                        className="w-full mt-4 bg-amber-600 hover:bg-amber-500 disabled:bg-slate-800 disabled:text-slate-500 text-white font-black py-3 rounded-xl transition-all flex items-center justify-center gap-2 shadow-[0_0_20px_rgba(217,119,6,0.3)] disabled:shadow-none"
                                    >
                                        {isFiltering ? (
                                            <>
                                                <Loader2 className="w-5 h-5 animate-spin" />
                                                篩選中...
                                            </>
                                        ) : (
                                            <>
                                                <Play className="w-5 h-5 fill-current" />
                                                開始篩選
                                            </>
                                        )}
                                    </button>
                                </div>
                            </div>

                            {/* Progress */}
                            {isFiltering && (
                                <div className="mt-6 bg-black/40 rounded-xl p-4 border border-slate-800">
                                    <div className="flex justify-between text-sm mb-2">
                                        <span className="text-slate-400">{filterProgress.phase}</span>
                                        <span className="text-amber-400 font-bold">{filterProgress.current} / {filterProgress.total}</span>
                                    </div>
                                    <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
                                        <div 
                                            className="h-full bg-amber-500 transition-all duration-300"
                                            style={{ width: `${filterProgress.total > 0 ? (filterProgress.current / filterProgress.total) * 100 : 0}%` }}
                                        />
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {error && (
                        <div className="mt-4 p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 flex items-center gap-2">
                            <AlertCircle className="w-5 h-5" />
                            {error}
                        </div>
                    )}
                </div>

                {/* Result Area (Single Search) */}
                {result && !showAutoFilter && (
                    <ResultCard result={result} stockId={stockId} />
                )}

                {/* Result Area (Auto Filter) */}
                {showAutoFilter && filterCompleted && (
                    <div className="animate-in fade-in slide-in-from-bottom-8 duration-700">
                        <div className="flex items-center gap-3 mb-8">
                            <div className="h-[1px] flex-1 bg-slate-800"></div>
                            <div className="text-amber-400 font-black tracking-widest text-lg">
                                篩選結果 ({filterResults.length} 檔)
                            </div>
                            <div className="h-[1px] flex-1 bg-slate-800"></div>
                        </div>

                        {filterResults.length > 0 ? (
                            <div className="space-y-4">
                                {filterResults.map((res, idx) => (
                                    <ResultCard 
                                        key={`${res.stockId}-${idx}`} 
                                        result={res.data} 
                                        stockId={res.stockId} 
                                        stockName={res.stockName} 
                                    />
                                ))}
                            </div>
                        ) : (
                            <div className="bg-slate-900 border border-slate-800 rounded-3xl p-12 text-center shadow-2xl">
                                <div className="w-20 h-20 bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-4">
                                    <AlertTriangle className="w-10 h-10 text-slate-500" />
                                </div>
                                <h3 className="text-2xl font-black text-slate-300 mb-2">無符合條件</h3>
                                <p className="text-slate-500">
                                    在選定日期的掃描紀錄中，沒有找到符合目前綠燈標準的股票。<br />
                                    您可以嘗試放寬「數據日期區間」或「相對高位%值」，或者選擇其他日期。
                                </p>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </AuthGuard>
    );
}

function SparklesIcon(props: any) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z" />
      <path d="M5 3v4" />
      <path d="M19 17v4" />
      <path d="M3 5h4" />
      <path d="M17 19h4" />
    </svg>
  )
}
