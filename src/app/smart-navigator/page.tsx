'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { Compass, Loader2, ArrowLeft, TrendingUp, AlertTriangle, HelpCircle, AlertCircle, Calendar as CalendarIcon, ChevronLeft, ChevronRight, X, Play, Filter, Download, BookOpen } from 'lucide-react';
import { useRouter } from 'next/navigation';
import AuthGuard from '@/components/layout/AuthGuard';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, getDay, addMonths, subMonths } from 'date-fns';
import { getScanRecords } from '@/services/firebaseDb';
import { useAuth } from '@/lib/firebase/context/AuthContext';

// --- Constants & Dictionary ---
type InterpretationDetail = { analysis: string; action: string; };

const INTERPRETATION_DETAILS: Record<string, InterpretationDetail> = {
    '股價穩站 20 日均線': {
        analysis: '20日均線（月線）是技術分析中最核心的趨勢分水嶺。當股價站穩月線，代表中期買方力道強過賣方，多頭格局成立。專業分析師以「站穩月線」作為持股的基本門檻，並以此作為停損判斷的關鍵防線。',
        action: '持股者可安心持有，等待下一個催化劑推升。未持股者可在股價回測月線時分批低接，風險報酬比較佳。',
    },
    '股價跌破 20 日均線': {
        analysis: '跌破月線是最直接的趨勢轉弱訊號。法人機構普遍將「收盤跌破20MA」設為自動停損觸發點。跌破後，原本的支撐線反轉成壓力線，後續反彈到均線附近往往遭到賣壓壓制，越晚出場損失越大。',
        action: '嚴格執行減倉或停損，切勿抱持「等反彈」心態。先保留資金，待股價重新站穩20MA後再評估重新進場時機。',
    },
    'MACD 維持零軸之上': {
        analysis: 'MACD的DIF線在零軸之上，代表快速均線高於慢速均線，短期趨勢明確向上，上漲動能充沛。這是確認多頭行情的輔助指標，與均線站穩搭配使用能大幅提升信號可靠度。',
        action: '動能方向確認偏多，配合量能放大，是追蹤強勢股的正面佐證。做多方向風險相對較低。',
    },
    '相對低位': {
        analysis: '「位階」是指目前股價在近期高低點之間的相對位置。低於30%代表股價仍處於相對谷底，距離近期高點空間巨大。分析師喜歡在低位佈局，因為風險報酬比最佳：下跌空間有限（跌不動），上漲潛力大（籌碼乾淨）。',
        action: '這是最理想的佈局位置。結合換手率訊號，若出現量增即是絕佳進場時機。建議分批買入，停損設在近期低點之下。',
    },
    '相對高位': {
        analysis: '股價位階超過70%代表已接近近期高點，追漲風險大幅提升。此時市場情緒偏向樂觀，但統計上高位入場的盈虧比不佳。法人在此位置通常不加碼，而是評估是否分批獲利了結。',
        action: '未持股者不建議追高，風險報酬比過低。持股者應提高警覺，設定移動停利點（trailing stop），準備分批出場。',
    },
    '中階位置': {
        analysis: '30%~70%是多空力量最為均衡的中間地帶。股價在此區域往往呈現盤整，市場參與者都在等待下一個明確方向。分析師在中階位置不會輕易下決定，而是耐心等待量能和方向的確認信號。',
        action: '採觀望策略，切忌在無量的中途隨意追入。等待帶量突破或放量跌破支撐後，再決定操作方向。',
    },
    '主力積極換手，底部量增': {
        analysis: '「底部量增」是主力吸籌最明顯的特徵。主力在低位大量買入，吸收掉市場上所有想停損的散戶籌碼。成交量放大代表資金積極進場，而股價同時跌不下去，說明每一筆賣盤都被強力承接，是籌碼轉移的關鍵訊號。',
        action: '這是最接近底部的買入機會，風險報酬比極佳。建議積極分批布局，停損設在最近一個明顯低點之下。',
    },
    '低位量縮整理': {
        analysis: '低位量縮代表市場賣壓已徹底枯竭，有意願賣出的投資人都已賣光。雖然目前缺乏買方力道（量小），但下跌空間極為有限。分析師稱此現象為「洗盤完成、蓄勢待發」——是靜待啟動的等待階段。',
        action: '可以非常輕倉（部位的10-20%）在支撐區試單，停損設在低點之下。等待量能放大確認啟動後，再積極加碼追買。',
    },
    '帶量突破盤整區': {
        analysis: '帶量突破是技術分析中最強力的買入信號之一，「帶量」是關鍵。無量的突破稱為「假突破」，隨時可能拉回。帶量突破代表大量買家在更高價格達成共識，顯示市場信心強烈，是新一波上升趨勢的啟動確認。',
        action: '這是追入的最佳時機。專業操作是突破時直接追入，停損設在突破點之下。切記不要等回測，真正強勢突破往往不給回測的機會。',
    },
    '價穩量縮，方向待表態': {
        analysis: '量縮代表市場觀望情緒濃厚，多空雙方都在等待驅動消息。股價穩定但沒有方向。分析師在此情況下刻意不操作，因為在無量環境下交易的勝率和效率都很低，等待信號才是正確策略。',
        action: '保持觀望，不要在無量盤整中浪費資金。等待量能放大並確認方向（向上突破或向下跌破支撐）後再行動。',
    },
    '高位換手熱烈': {
        analysis: '高位出現大量換手代表有人在積極賣出，同時也有人在積極買入。這種多空激烈廝殺在高位出現時，往往是短期頂點的特徵。分析師對此保持高度警戒，因為主力可能趁熱鬧出貨，如收長上影線則是明確賣出訊號。',
        action: '持股者應設定嚴格停利點，拒絕再加碼。未持股者絕對不要追高。若當日收長上影線（高開低收），是明確的賣出信號。',
    },
    '高位量縮，籌碼相對穩定': {
        analysis: '高位量縮是「籌碼集中」的象徵。主力惜售，沒有人急著在高位拋售，賣壓自然很輕。分析師稱此現象為「強者恆強」——強勢股在高位都是這種特徵，股價容易維持高位或緩步盤升。',
        action: '持股者可安心持有，不必急於獲利了結。但需注意：一旦量能突然放大且出現長陰線，必須立即停利，那代表籌碼穩定格局已被打破。',
    },
    '高位爆出天量': {
        analysis: '這是最危險的技術信號之一。「天量」指成交量異常巨大，遠超過平日均量。在高位出現天量，最常見原因是主力趁利多消息大量出貨。主力賣出的對手方恰好是市場上興奮追買的散戶（俗稱割韭菜），是極其危險的翻轉訊號。',
        action: '不管目前持有多少，見到此信號必須堅決停損離場。這是資金保全的生死抉擇，寧可少賺，絕對不可大虧。',
    },
    '真實換手率': {
        analysis: '「換手率」代表當天成交股數佔總發行股數的比例。數值越高，代表市場交投越熱絡、籌碼流動越快。分析師判斷換手率的邏輯是「結合股價位階」：在低檔區出現高換手（>5%），代表主力可能在吸籌、籌碼大換血；在高檔區出現高換手，則極可能是主力在出貨、籌碼開始鬆動。',
        action: '換手率是「熱度指標」，不代表絕對的買賣點，請與上方的「位階狀態」合併參考。低位高換手可偏多看待，高位高換手請提高警覺。',
    },
    '換手熱度': {
        analysis: '當缺乏精確的總股本資料時，分析師會改用「當日成交量與5日均量」做比較來評估熱度。若當日量大於5日均量2倍以上，即視為換手熱烈。與真實換手率一樣，其意義必須結合「股價位階」來判斷。',
        action: '這是一個輔助熱度的指標。如果在底部爆量（大於均量2倍），是潛在的起漲信號；如果在高檔爆量，則是危險的警訊。',
    },
    '高位長上影線放量': {
        analysis: '高位出現長上影線（開盤後一度大漲，但收盤大幅回落），配合放量，是主力趁市場熱情高漲時大量出貨的典型特徵。上影線越長，代表當日賣壓越強烈，主力持股意願已明顯下降。技術分析師將此型態稱為「射擊之星」或「高位長陰線」，是最直觀的轉折警訊之一。',
        action: '見到此訊號必須嚴格執行減碼或停損，不要抱有「等下次反彈」心態。第一時間保留資金最重要，寧可少賺也絕對不可在主力出貨時成為接盤方。',
    },
    '連續換手股價停滯': {
        analysis: '連續數日（近5日）保持高換手率（超過20日均值1.5倍），但股價卻在小範圍內劇烈震盪，沒有明顯上漲。分析師稱此為「對倒洗盤」：主力可能左手換右手虛增交易量，目的是吸引散戶注意或洗清短線浮額。此訊號具有雙向不確定性，方向尚未明朗。',
        action: '採觀望策略，不要輕易追入熱鬧假象。等待震盪結束後的突破方向：若放量向上突破壓力，則是洗盤結束、積極買入；若向下跌破支撐，則是出貨確認、立即離場。',
    },
    '縮量洗盤，籌碼鎖定良好': {
        analysis: '股價在拉升一段後進入橫盤震盪，但換手率從高點快速萎縮（低於近20日均值的一半）。這代表籌碼集中度高，主力並未出貨，市場浮額已被充分洗清。分析師視此為行情「充電整備期」——主力刻意不作為，讓意志不堅的短線客下車，為下一波拉升積蓄動能。',
        action: '持股者切勿輕易下車，這是最不應該賣出的時機。耐心等待後續量能再度放大、股價重回突破點之上，通常會迎來更強的第二波拉升行情。',
    },
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
            {/* Stock Title */}
            <div className="flex items-center gap-3 mb-2 flex-wrap">
                <div className="bg-indigo-500/20 text-indigo-400 px-4 py-2 rounded-xl font-black border border-indigo-500/30 text-xl">
                    {stockId}
                </div>
                {stockName && <div className="text-2xl font-black text-white">{stockName}</div>}
                {result.signalTag && (
                    <div className={`px-3 py-1.5 rounded-xl font-black text-sm border flex items-center gap-1.5 ${
                        result.light === 'green'
                            ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
                            : result.light === 'red'
                            ? 'bg-rose-500/15 border-rose-500/40 text-rose-300'
                            : 'bg-amber-500/15 border-amber-500/40 text-amber-300'
                    }`}>
                        <span>{result.light === 'green' ? '🟢' : result.light === 'red' ? '🔴' : '🟡'}</span>
                        {result.signalTag}
                    </div>
                )}
            </div>

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

            {/* Distribution Warning Card */}
            {result.distribution && result.distribution.level !== 'none' && (() => {
                const dist = result.distribution;
                const lvl = dist.level as 'watch' | 'warning' | 'alert';
                const isAlert = lvl === 'alert';
                const isWarning = lvl === 'warning';

                const borderColor = isAlert ? 'border-rose-500/50' : isWarning ? 'border-orange-500/50' : 'border-amber-500/40';
                const bgColor = isAlert ? 'bg-rose-500/5' : isWarning ? 'bg-orange-500/5' : 'bg-amber-500/5';
                const glowStyle = isAlert ? '0 0 25px rgba(244,63,94,0.18)' : isWarning ? '0 0 25px rgba(249,115,22,0.18)' : '';
                const titleColor = isAlert ? 'text-rose-400' : isWarning ? 'text-orange-400' : 'text-amber-400';
                const dotColor = isAlert ? 'bg-rose-400' : isWarning ? 'bg-orange-400' : 'bg-amber-400';
                const actionBg = isAlert ? 'bg-rose-500/10 border-rose-500/20' : isWarning ? 'bg-orange-500/10 border-orange-500/20' : 'bg-amber-500/10 border-amber-500/20';

                const levelLabel = isAlert ? '🔴 出貨進行中' : isWarning ? '🟠 出貨準備前兆' : '🟡 留意觀察';

                const explanation = isAlert
                    ? '多重前兆同時觸發，且當日出現高換手放量。主力正借助市場熱情大量倒貨給散戶，散戶此時正在成為接盤方。這是最危險的籌碼轉移訊號，股價隨時可能急轉直下。'
                    : isWarning
                    ? '多個主力撤退前兆同時出現，顯示主力可能已開始慢慢分批出貨，但尚未進入大規模傾倒階段。此為早期預警窗口，是最後可以從容規劃出場的時機。'
                    : '出現一個主力動態異常跡象。單一訊號尚不構成警報，但在高位出現任何異常均不可忽視，需提高警覺並停止追加買入。';

                const actionText = isAlert
                    ? '立即停損離場，不等反彈、不抱僥倖。見到此訊號，資金保全優先於任何獲利期待。寧可少賺，絕不讓已有獲利大量縮水。'
                    : isWarning
                    ? '分批縮減持倉 30%~50%，將剩餘部位的停利點上移，設置移動停利保護獲利。在警報解除前絕對不追加買入。'
                    : '停止追加買入，開始規劃停利計畫。將停利點上移至成本 +15% 以上，密切觀察後續量價變化，若再出現一個前兆訊號即升級為橙色警報。';

                const signals: { text: string; desc: string }[] = [];
                if (dist.hasMacdDivergence) signals.push({ text: 'MACD 頂背離', desc: '股價創高但動能指標衰退，上漲後繼不足' });
                if (dist.isVolumeDeclineAtHigh) signals.push({ text: '高位量能遞減', desc: `近 5 日成交量持續萎縮，買方力道逐漸枯竭` });
                if (dist.isHighStagnant) signals.push({ text: `高位橫盤 ${dist.highStagnationDays} 日`, desc: '多方無力再攻頂，高位出現滯漲現象' });

                return (
                    <div
                        className={`rounded-3xl p-6 shadow-2xl border ${borderColor} ${bgColor} animate-in fade-in duration-500`}
                        style={glowStyle ? { boxShadow: glowStyle } : {}}
                    >
                        <div className={`font-black text-base mb-1 flex items-center gap-2 ${titleColor}`}>
                            <AlertTriangle className="w-5 h-5" />
                            主力動向預警
                        </div>
                        <div className={`text-xl font-black mb-5 ${titleColor}`}>{levelLabel}</div>

                        {/* Triggered signals */}
                        <div className="space-y-2 mb-5">
                            {signals.map((s, i) => (
                                <div key={i} className="flex items-start gap-2.5 text-sm bg-black/20 rounded-xl p-3">
                                    <div className={`w-2 h-2 rounded-full flex-shrink-0 mt-1.5 ${dotColor}`} />
                                    <div>
                                        <span className="text-slate-100 font-black">{s.text}</span>
                                        <span className="text-slate-400 ml-2">{s.desc}</span>
                                    </div>
                                </div>
                            ))}
                        </div>

                        {/* Explanation */}
                        <div className="bg-black/30 rounded-xl p-4 mb-3 border border-white/5">
                            <div className="text-xs font-black tracking-widest text-slate-400 uppercase mb-2">📊 市場解讀</div>
                            <p className="text-sm text-slate-300 leading-relaxed">{explanation}</p>
                        </div>

                        {/* Action */}
                        <div className={`rounded-xl p-4 border ${actionBg}`}>
                            <div className={`text-xs font-black tracking-widest uppercase mb-2 ${titleColor}`}>💡 操作建議</div>
                            <p className="text-sm text-slate-300 leading-relaxed">{actionText}</p>
                        </div>
                    </div>
                );
            })()}

            {/* Prices */}
            <div className="bg-slate-900 border border-slate-800 rounded-3xl p-8 shadow-2xl">
                <div className="text-slate-400 font-black mb-6 tracking-widest text-sm text-center">智能操作價格</div>
                <div className="grid grid-cols-2 gap-4">
                    <div className="bg-black/40 rounded-2xl p-4 border border-white/5 text-center">
                        <div className="text-slate-500 font-bold mb-1 text-sm">買入建議</div>
                        <div className="text-3xl font-black text-indigo-400">{result.prices.buy}</div>
                    </div>
                    <div className="bg-black/40 rounded-2xl p-4 border border-rose-500/20 text-center">
                        <div className="text-rose-500 font-bold mb-1 text-sm flex flex-col items-center">
                            <span>防守停損</span>
                            {result.metrics?.isStopLossFallback && (
                                <span className="text-[10px] text-rose-500/70 font-normal">(以最新一日最低價計算)</span>
                            )}
                        </div>
                        <div className="text-3xl font-black text-rose-400">{result.prices.stopLoss}</div>
                    </div>
                    <div className="bg-black/40 rounded-2xl p-4 border border-emerald-500/20 text-center">
                        <div className="text-emerald-500 font-bold mb-1 text-sm">第一批停利 (25%)</div>
                        <div className="text-3xl font-black text-emerald-400">{result.prices.tp1}</div>
                    </div>
                    <div className="bg-black/40 rounded-2xl p-4 border border-emerald-500/20 text-center">
                        <div className="text-emerald-500 font-bold mb-1 text-sm">第二批停利 (50%)</div>
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
                        const isOpen = activeTooltip === text;

                        return (
                            <div key={idx} className="flex flex-col bg-black/40 rounded-xl border border-white/5 overflow-hidden">
                                <div className="flex gap-3 p-4">
                                    <div className="text-indigo-400 mt-0.5 flex-shrink-0">•</div>
                                    <div className="text-slate-300 font-medium leading-relaxed flex-1">
                                        {text}
                                    </div>
                                </div>
                                {detail && (
                                    <div className="px-4 pb-3">
                                        <button
                                            onClick={() => setActiveTooltip(isOpen ? null : text)}
                                            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-black tracking-wide border transition-all ${
                                                isOpen
                                                    ? 'bg-indigo-500/30 border-indigo-400/50 text-indigo-300'
                                                    : 'bg-indigo-500/10 border-indigo-500/25 text-indigo-400 hover:bg-indigo-500/25'
                                            }`}
                                        >
                                            <BookOpen className="w-3 h-3" />
                                            專業解讀
                                            <span className={`ml-0.5 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}>▾</span>
                                        </button>
                                    </div>
                                )}
                                {isOpen && detail && (
                                    <div className="mx-4 mb-4 rounded-xl border border-indigo-500/20 bg-indigo-500/5 overflow-hidden animate-in slide-in-from-top-2 duration-300">
                                        <div className="p-4 border-b border-indigo-500/15">
                                            <div className="flex items-center gap-1.5 text-indigo-300 font-black text-xs tracking-widest uppercase mb-2">
                                                <span>📊</span> 分析師怎麼看
                                            </div>
                                            <p className="text-sm text-slate-300 leading-relaxed">{detail.analysis}</p>
                                        </div>
                                        <div className="p-4">
                                            <div className="flex items-center gap-1.5 text-emerald-400 font-black text-xs tracking-widest uppercase mb-2">
                                                <span>💡</span> 操作建議參考
                                            </div>
                                            <p className="text-sm text-slate-300 leading-relaxed">{detail.action}</p>
                                        </div>
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
    const [filterResults, setFilterResults] = useState<Array<{stockId: string, stockName: string, data: any, distributionLevel?: string | null}>>([]);
    const [filterCompleted, setFilterCompleted] = useState(false);
    const [filterMode, setFilterMode] = useState<'green' | 'distribution'>('green');
    const [lightFilter, setLightFilter] = useState<'all' | 'green' | 'yellow' | 'red'>('all');
    const [distributionFilter, setDistributionFilter] = useState<'all' | 'alert' | 'warning' | 'watch'>('all');

    // Print State
    const [isPrinting, setIsPrinting] = useState(false);

    const handleDownload = async () => {
        if (isPrinting) return;
        setIsPrinting(true);
        try {
            const html2canvas = (await import('html2canvas')).default;
            const element = document.getElementById('smart-navigator-content');
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
            link.download = `智能選股導航_分析報告_${new Date().toLocaleDateString('zh-TW', { year: 'numeric', month: '2-digit', day: '2-digit' }).replace(/\//g, '')}.png`;
            link.href = canvas.toDataURL('image/png');
            link.click();
        } catch (err) {
            console.error('截圖失敗:', err);
        } finally {
            setIsPrinting(false);
        }
    };

    const hasResults = (result && !showAutoFilter) || (showAutoFilter && filterCompleted && filterResults.length > 0);

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
            const validResults: any[] = [];
            const maxPosPercent = parseInt(maxPosition, 10);
            const levelOrder: Record<string, number> = { alert: 0, warning: 1, watch: 2 };

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
                            if (json.data.signalTag !== null && json.data.signalTag !== undefined) {
                                return { stockId: stock.id, stockName: stock.name, data: json.data, distributionLevel: json.data.distribution?.level };
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

            const lightOrder: Record<string, number> = { green: 0, yellow: 1, red: 2 };
            validResults.sort((a, b) => (lightOrder[a.data.light] ?? 1) - (lightOrder[b.data.light] ?? 1));

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
            <div id="smart-navigator-content" className="container mx-auto px-6 py-12 max-w-2xl min-h-screen">
                {/* Header */}
                <div className="flex items-center justify-between mb-8">
                    <button
                        onClick={() => router.push('/')}
                        className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors"
                    >
                        <ArrowLeft className="w-5 h-5" />
                        返回主控台
                    </button>
                    {hasResults && (
                        <button
                            onClick={handleDownload}
                            disabled={isPrinting}
                            className="flex items-center gap-2 px-4 py-2 bg-indigo-600/20 hover:bg-indigo-600/40 disabled:opacity-50 border border-indigo-500/40 rounded-xl text-indigo-400 text-sm font-black transition-all active:scale-95"
                        >
                            {isPrinting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                            {isPrinting ? '產生中...' : '列印下載'}
                        </button>
                    )}
                </div>

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
                                歷史數據自動篩選
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
                                    {/* Mode Toggle */}
                                    <div>
                                    </div>
                                    <div>
                                        <div className="text-sm text-slate-400 mb-2 font-medium">1. 數據日期區間</div>
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
                                    <div className="bg-indigo-500/5 border border-indigo-500/20 rounded-xl p-3 text-xs text-indigo-300/70">
                                        📌 篩選出所有帶有主力動向訊號的股票，依 🟢 綠燈 → 🟡 黃燈 → 🔴 紅燈排序。跌破20日均線的股票不顯示。
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
                    <ResultCard result={result} stockId={stockId} stockName={result.stockName} />
                )}

                {/* Result Area (Auto Filter) */}
                {showAutoFilter && filterCompleted && (
                    <div className="animate-in fade-in slide-in-from-bottom-8 duration-700">
                        <div className="flex items-center gap-3 mb-6">
                            <div className="h-[1px] flex-1 bg-slate-800"></div>
                            <div className={`font-black tracking-widest text-lg text-indigo-400`}>
                                主力動向篩選結果 ({filterResults.length} 檔)
                            </div>
                            <div className="h-[1px] flex-1 bg-slate-800"></div>
                        </div>

                        {/* 燈號顏色過濾器 */}
                        {filterResults.length > 0 && (
                            <div className="mb-6 flex items-center gap-3 flex-wrap">
                                <span className="text-xs font-black text-slate-400 tracking-widest uppercase">依燈號篩選：</span>
                                {([
                                    { key: 'all', label: '全部', emoji: '⚪', activeCls: 'bg-slate-700 border-slate-500 text-white', inactiveCls: 'bg-black/40 border-slate-700 text-slate-400' },
                                    { key: 'green', label: '綠燈', emoji: '🟢', activeCls: 'bg-emerald-500/20 border-emerald-500 text-emerald-400 shadow-[0_0_12px_rgba(16,185,129,0.3)]', inactiveCls: 'bg-black/40 border-slate-700 text-slate-400 hover:bg-emerald-500/10 hover:border-emerald-500/40 hover:text-emerald-400' },
                                    { key: 'yellow', label: '黃燈', emoji: '🟡', activeCls: 'bg-amber-500/20 border-amber-500 text-amber-400 shadow-[0_0_12px_rgba(245,158,11,0.3)]', inactiveCls: 'bg-black/40 border-slate-700 text-slate-400 hover:bg-amber-500/10 hover:border-amber-500/40 hover:text-amber-400' },
                                    { key: 'red', label: '紅燈', emoji: '🔴', activeCls: 'bg-rose-500/20 border-rose-500 text-rose-400 shadow-[0_0_12px_rgba(244,63,94,0.3)]', inactiveCls: 'bg-black/40 border-slate-700 text-slate-400 hover:bg-rose-500/10 hover:border-rose-500/40 hover:text-rose-400' },
                                ] as { key: 'all'|'green'|'yellow'|'red', label: string, emoji: string, activeCls: string, inactiveCls: string }[]).map(({ key, label, emoji, activeCls, inactiveCls }) => {
                                    const count = key === 'all'
                                        ? filterResults.length
                                        : filterResults.filter(r => r.data.light === key).length;
                                    return (
                                        <button
                                            key={key}
                                            onClick={() => setLightFilter(key)}
                                            className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-black border transition-all ${
                                                lightFilter === key ? activeCls : inactiveCls
                                            }`}
                                        >
                                            <span>{emoji}</span>
                                            <span>{label}</span>
                                            <span className={`ml-1 text-xs px-1.5 py-0.5 rounded-md ${
                                                lightFilter === key ? 'bg-white/10' : 'bg-slate-800'
                                            }`}>{count}</span>
                                        </button>
                                    );
                                })}
                            </div>
                        )}

                        {filterResults.length > 0 ? (
                            <div className="space-y-4">
                                {filterResults
                                    .filter((res: any) => lightFilter === 'all' || res.data.light === lightFilter)
                                    .map((res: any, idx: number) => {
                                    const lvl = res.distributionLevel;
                                    const badge = lvl === 'alert'
                                        ? { text: '🔴 出貨進行中', cls: 'text-rose-400 border-rose-500/40 bg-rose-500/10' }
                                        : lvl === 'warning'
                                        ? { text: '🟠 出貨準備前兆', cls: 'text-orange-400 border-orange-500/40 bg-orange-500/10' }
                                        : lvl === 'watch'
                                        ? { text: '🟡 留意觀察', cls: 'text-amber-400 border-amber-500/40 bg-amber-500/10' }
                                        : null;
                                    // 主力進場模式的 badge
                                    const greenBadge = filterMode === 'green' && res.data.signalTag ? {
                                        text: `${res.data.light === 'green' ? '🟢' : res.data.light === 'red' ? '🔴' : '🟡'} ${res.data.signalTag}`,
                                        cls: res.data.light === 'green'
                                            ? 'text-emerald-400 border-emerald-500/40 bg-emerald-500/10'
                                            : res.data.light === 'red'
                                            ? 'text-rose-400 border-rose-500/40 bg-rose-500/10'
                                            : 'text-amber-400 border-amber-500/40 bg-amber-500/10'
                                    } : null;
                                    return (
                                        <div key={`${res.stockId}-${idx}`}>
                                            {badge && filterMode === 'distribution' && (
                                                <div className={`mb-2 px-4 py-2 rounded-xl border font-black text-sm ${badge.cls}`}>
                                                    {badge.text}
                                                </div>
                                            )}
                                            {greenBadge && (
                                                <div className={`mb-2 px-4 py-2 rounded-xl border font-black text-sm ${greenBadge.cls}`}>
                                                    {greenBadge.text}
                                                </div>
                                            )}
                                            <ResultCard result={res.data} stockId={res.stockId} stockName={res.stockName} />
                                        </div>
                                    );
                                })}
                                {/* 過濾後無結果提示 */}
                                {filterMode === 'green' && lightFilter !== 'all' &&
                                    filterResults.filter((r: any) => r.data.light === lightFilter).length === 0 && (
                                    <div className="bg-slate-900 border border-slate-800 rounded-3xl p-10 text-center">
                                        <div className="text-4xl mb-4">
                                            {lightFilter === 'green' ? '🟢' : lightFilter === 'yellow' ? '🟡' : '🔴'}
                                        </div>
                                        <h3 className="text-xl font-black text-slate-300 mb-2">此燈號無符合股票</h3>
                                        <p className="text-slate-500 text-sm">選擇「全部」或其他燈號查看結果。</p>
                                    </div>
                                )}
                                {filterMode === 'distribution' && distributionFilter !== 'all' &&
                                    filterResults.filter((r: any) => r.distributionLevel === distributionFilter).length === 0 && (
                                    <div className="bg-slate-900 border border-slate-800 rounded-3xl p-10 text-center">
                                        <div className="text-4xl mb-4">
                                            {distributionFilter === 'alert' ? '🔴' : distributionFilter === 'warning' ? '🟠' : '🟡'}
                                        </div>
                                        <h3 className="text-xl font-black text-slate-300 mb-2">此等級無符合股票</h3>
                                        <p className="text-slate-500 text-sm">選擇「全部」或其他警示等級查看結果。</p>
                                    </div>
                                )}
                            </div>
                        ) : (
                            <div className="bg-slate-900 border border-slate-800 rounded-3xl p-12 text-center shadow-2xl">
                                <div className="w-20 h-20 bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-4">
                                    <AlertTriangle className="w-10 h-10 text-slate-500" />
                                </div>
                                <h3 className="text-2xl font-black text-slate-300 mb-2">無符合條件</h3>
                                <p className="text-slate-500">
                                    {filterMode === 'distribution'
                                        ? '在選定日期的掃描紀錄中，沒有發現出現出貨預警訊號的股票。可嘗試選擇其他日期。'
                                        : '在選定日期的掃描紀錄中，沒有發現任何帶有主力動向訊號的股票。可嘗試選擇其他日期或調整「數據日期區間」。'
                                    }
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
