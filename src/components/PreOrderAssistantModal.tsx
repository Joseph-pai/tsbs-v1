'use client';

import React, { useState } from 'react';
import { X, Clock, Search, Copy, Check, AlertTriangle, TrendingUp, ShieldAlert, DollarSign, Activity } from 'lucide-react';

interface PreOrderAssistantModalProps {
    isOpen: boolean;
    onClose: () => void;
}

interface DiagnosisData {
    stock_id: string;
    stock_name: string;
    close: number;
    ma5: number;
    advice: 'HOLD' | 'SELL';
    reason: string;
    bestPresetSellPrice: number;
    bestStopPrice: number;
    historicalVolatility: string;
    formulaDetails: {
        avgUpperShadowPercent: string;
        suggestedPremiumPercent: string;
        isBelow5MA: boolean;
        score: number;
    };
}

export default function PreOrderAssistantModal({ isOpen, onClose }: PreOrderAssistantModalProps) {
    const [stockId, setStockId] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [data, setData] = useState<DiagnosisData | null>(null);
    const [copied, setCopied] = useState(false);

    if (!isOpen) return null;

    const handleSearch = async (targetId?: string) => {
        const queryId = (targetId || stockId).trim();
        if (!queryId) return;

        setLoading(true);
        setError(null);
        setData(null);
        setCopied(false);

        try {
            const res = await fetch(`/api/pre-order-advice?stockId=${queryId}`);
            const json = await res.json();

            if (json.success) {
                setData(json.data);
            } else {
                setError(json.error || '診斷失敗，請確認該股票代碼在台股市場是否存在。');
            }
        } catch (e: any) {
            console.error('Fetch pre-order advice error:', e);
            setError('網路連線失敗或伺服器異常，請稍後再試。');
        } finally {
            setLoading(false);
        }
    };

    const copyToClipboard = (text: string) => {
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 overflow-y-auto">
            {/* Backdrop with strong blur and dimming */}
            <div 
                className="absolute inset-0 bg-black/75 backdrop-blur-md transition-opacity"
                onClick={onClose}
            />

            {/* Modal Box */}
            <div className="relative w-full max-w-xl bg-slate-900/95 border border-slate-800 rounded-3xl shadow-[0_0_50px_rgba(0,0,0,0.8)] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                {/* Visual Accent Glow (changes with state) */}
                <div className={`absolute top-0 left-0 right-0 h-1.5 ${
                    data 
                        ? data.advice === 'HOLD' 
                            ? 'bg-gradient-to-r from-emerald-500 to-teal-400' 
                            : 'bg-gradient-to-r from-rose-500 to-orange-400'
                        : 'bg-gradient-to-r from-pink-500 to-indigo-500'
                }`} />

                {/* Header */}
                <div className="flex items-center justify-between p-6 border-b border-slate-800/80">
                    <div className="flex items-center gap-3">
                        <div className={`p-2 rounded-xl ${
                            data 
                                ? data.advice === 'HOLD' 
                                    ? 'bg-emerald-500/10 text-emerald-400' 
                                    : 'bg-rose-500/10 text-rose-400'
                                : 'bg-pink-500/10 text-pink-400'
                        }`}>
                            <Clock className="w-5 h-5 animate-pulse" />
                        </div>
                        <div>
                            <h3 className="text-lg font-black text-white tracking-tight">12H 預約賣出決策助手</h3>
                            <p className="text-xs text-slate-400">提前12小時部署盤中極致情緒高點</p>
                        </div>
                    </div>
                    <button 
                        onClick={onClose}
                        className="p-2 bg-slate-800/50 hover:bg-slate-800 rounded-full text-slate-400 hover:text-white transition-all hover:rotate-90 duration-300"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Content */}
                <div className="p-6 space-y-6 overflow-y-auto max-h-[75vh]">
                    {/* Search Field */}
                    <div className="space-y-3">
                        <label className="text-xs font-black text-slate-400 uppercase tracking-widest block">請輸入您持有的台股代號</label>
                        <div className="flex gap-2">
                            <div className="relative flex-1">
                                <Search className="absolute left-4 top-3.5 w-5 h-5 text-slate-500" />
                                <input
                                    type="text"
                                    placeholder="例如：3090、2478、4916"
                                    value={stockId}
                                    onChange={(e) => setStockId(e.target.value)}
                                    onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                                    className="w-full bg-slate-950/80 border border-slate-800 rounded-2xl pl-12 pr-4 py-3 text-white placeholder-slate-600 focus:outline-none focus:border-pink-500/60 focus:ring-1 focus:ring-pink-500/30 transition-all font-mono font-bold"
                                />
                            </div>
                            <button
                                onClick={() => handleSearch()}
                                disabled={loading}
                                className="px-6 py-3 bg-gradient-to-r from-pink-600 to-indigo-600 hover:from-pink-500 hover:to-indigo-500 text-white font-black rounded-2xl shadow-lg hover:shadow-pink-500/10 disabled:opacity-40 disabled:cursor-not-allowed transition-all flex items-center gap-2"
                            >
                                {loading ? (
                                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                ) : 'AI 診斷'}
                            </button>
                        </div>

                        {/* Quick Test Stocks */}
                        <div className="flex flex-wrap items-center gap-2 pt-1">
                            <span className="text-[11px] text-slate-500 font-bold">熱門測試股票：</span>
                            {[
                                { id: '3090', name: '耀華' },
                                { id: '2478', name: '大毅' },
                                { id: '4916', name: '事欣科' }
                            ].map(item => (
                                <button
                                    key={item.id}
                                    onClick={() => {
                                        setStockId(item.id);
                                        handleSearch(item.id);
                                    }}
                                    className="px-2.5 py-1 text-[11px] font-semibold text-slate-400 bg-slate-950 border border-slate-800 rounded-lg hover:border-pink-500/40 hover:text-white transition-all"
                                >
                                    {item.id} {item.name}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Error Box */}
                    {error && (
                        <div className="bg-rose-500/10 border border-rose-500/30 rounded-2xl p-4 flex gap-3 text-rose-400 text-sm">
                            <AlertTriangle className="w-5 h-5 flex-shrink-0" />
                            <div>
                                <p className="font-bold">診斷受阻</p>
                                <p className="text-xs text-rose-400/80 mt-1">{error}</p>
                            </div>
                        </div>
                    )}

                    {/* Diagnosis Result */}
                    {data && (
                        <div className="space-y-6 animate-in fade-in-50 slide-in-from-bottom-4 duration-300">
                            
                            {/* Diagnosis Status Bar */}
                            <div className={`relative overflow-hidden rounded-2xl border p-5 ${
                                data.advice === 'HOLD'
                                    ? 'bg-emerald-950/20 border-emerald-500/30 shadow-[0_0_15px_rgba(16,185,129,0.05)]'
                                    : 'bg-rose-950/20 border-rose-500/30 shadow-[0_0_15px_rgba(244,63,94,0.05)]'
                            }`}>
                                <div className="flex items-center justify-between mb-3">
                                    <span className="text-xs font-black uppercase tracking-widest text-slate-400">診斷結果</span>
                                    <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black tracking-wide ${
                                        data.advice === 'HOLD'
                                            ? 'bg-emerald-500/10 text-emerald-400'
                                            : 'bg-rose-500/10 text-rose-400'
                                    }`}>
                                        <span className={`w-2 h-2 rounded-full ${
                                            data.advice === 'HOLD' ? 'bg-emerald-400 animate-pulse' : 'bg-rose-400 animate-pulse'
                                        }`} />
                                        {data.stock_id} {data.stock_name} • {data.advice === 'HOLD' ? '繼續持倉' : '建議減倉'}
                                    </span>
                                </div>
                                <h4 className={`text-base font-black mb-2 ${
                                    data.advice === 'HOLD' ? 'text-emerald-400' : 'text-rose-400'
                                }`}>
                                    {data.advice === 'HOLD' ? '🟢 趨勢強勁，抱緊獲利' : '🔴 短線走弱，避開回吐'}
                                </h4>
                                <p className="text-xs leading-relaxed text-slate-300">{data.reason}</p>
                            </div>

                            {/* Key Stats Grid */}
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                                <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-3 text-center">
                                    <span className="text-[10px] text-slate-500 font-bold block mb-1">最新收盤價</span>
                                    <span className="text-base font-mono font-black text-white">${data.close}</span>
                                </div>
                                <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-3 text-center">
                                    <span className="text-[10px] text-slate-500 font-bold block mb-1">生命線 5MA</span>
                                    <span className="text-base font-mono font-black text-white">${data.ma5}</span>
                                </div>
                                <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-3 text-center">
                                    <span className="text-[10px] text-slate-500 font-bold block mb-1">歷史波幅上影線</span>
                                    <span className="text-base font-mono font-black text-amber-400">{data.formulaDetails.avgUpperShadowPercent}</span>
                                </div>
                                <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-3 text-center">
                                    <span className="text-[10px] text-slate-500 font-bold block mb-1">共振強度評分</span>
                                    <span className="text-base font-mono font-black text-indigo-400">{data.formulaDetails.score}分</span>
                                </div>
                            </div>

                            {/* Distance to 5MA Lifeline Visual Bar */}
                            <div className="bg-slate-950/80 border border-slate-800 p-4 rounded-2xl space-y-2">
                                <div className="flex justify-between items-center text-xs">
                                    <span className="text-slate-400 font-bold flex items-center gap-1.5">
                                        <Activity className="w-3.5 h-3.5 text-pink-500" />
                                        生命線支撐安全度
                                    </span>
                                    <span className={`font-bold ${data.formulaDetails.isBelow5MA ? 'text-rose-400' : 'text-emerald-400'}`}>
                                        {data.formulaDetails.isBelow5MA 
                                            ? `已跌破 5MA ($${data.ma5})` 
                                            : `高於 5MA +${((data.close - data.ma5) / data.ma5 * 100).toFixed(1)}%`}
                                    </span>
                                </div>
                                <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
                                    <div 
                                        className={`h-full transition-all duration-500 ${
                                            data.formulaDetails.isBelow5MA 
                                                ? 'bg-rose-500 w-1/4' 
                                                : 'bg-gradient-to-r from-teal-500 to-emerald-500 w-3/4'
                                        }`} 
                                    />
                                </div>
                            </div>

                            {/* 12H Pre-Set Order Strategy Box */}
                            <div className="bg-slate-950 border-2 border-indigo-500/30 rounded-3xl p-5 relative overflow-hidden shadow-2xl">
                                {/* Elegant Background Glow */}
                                <div className="absolute top-0 right-0 w-24 h-24 bg-indigo-500/10 rounded-full blur-2xl" />

                                <div className="flex items-center gap-2 mb-4">
                                    <DollarSign className="w-5 h-5 text-indigo-400" />
                                    <span className="text-xs font-black uppercase tracking-widest text-indigo-400">12H 預約掛單決策方案</span>
                                </div>

                                {/* Recommended Price Block */}
                                <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-slate-900 border border-slate-800/80 p-4 rounded-2xl mb-4">
                                    <div>
                                        <span className="text-[10px] text-slate-500 font-bold block uppercase tracking-wider">
                                            {data.advice === 'HOLD' ? '建議盤中衝高預約停利價' : '建議開盤衝高反彈賣出價'}
                                        </span>
                                        <span className="text-2xl font-mono font-black text-white">
                                            ${data.bestPresetSellPrice}
                                        </span>
                                        <span className="text-[11px] text-slate-400 ml-2">
                                            (約較收盤溢價 +{data.formulaDetails.suggestedPremiumPercent})
                                        </span>
                                    </div>
                                    <button
                                        onClick={() => copyToClipboard(data.bestPresetSellPrice.toString())}
                                        className={`w-full sm:w-auto px-4 py-2.5 font-black text-xs rounded-xl flex items-center justify-center gap-1.5 transition-all ${
                                            copied 
                                                ? 'bg-emerald-600 text-white' 
                                                : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-md'
                                        }`}
                                    >
                                        {copied ? (
                                            <><Check className="w-4 h-4" /> 已複製</>
                                        ) : (
                                            <><Copy className="w-4 h-4" /> 一鍵複製掛單價</>
                                        )}
                                    </button>
                                </div>

                                {/* Step-by-Step掛單指南 */}
                                <div className="space-y-3">
                                    <span className="text-[11px] font-black text-slate-400 uppercase tracking-widest block">券商 APP 掛單具體操作指引</span>
                                    
                                    <div className="space-y-2 text-[11px] text-slate-300">
                                        <div className="flex items-start gap-2">
                                            <div className="w-4 h-4 rounded-full bg-slate-900 text-indigo-400 flex items-center justify-center font-bold text-[9px] mt-0.5 flex-shrink-0">1</div>
                                            <p>
                                                在<strong className="text-white">今晚 20:00 至明早 08:30</strong> 盤前非交易時段，打開您的券商 APP (如三竹、國泰、富邦、元大等)。
                                            </p>
                                        </div>
                                        <div className="flex items-start gap-2">
                                            <div className="w-4 h-4 rounded-full bg-slate-900 text-indigo-400 flex items-center justify-center font-bold text-[9px] mt-0.5 flex-shrink-0">2</div>
                                            <p>
                                                選擇 <strong className="text-white">【整股委託】</strong> 並進入委託掛單界面。
                                            </p>
                                        </div>
                                        <div className="flex items-start gap-2">
                                            <div className="w-4 h-4 rounded-full bg-slate-900 text-indigo-400 flex items-center justify-center font-bold text-[9px] mt-0.5 flex-shrink-0">3</div>
                                            <p>
                                                設定為 <strong className="text-indigo-400">【限價賣出】</strong>，價格輸入剛剛複製的極限目標價 <strong className="text-white font-mono font-bold">${data.bestPresetSellPrice}</strong> 並送出。
                                            </p>
                                        </div>
                                        {data.advice === 'HOLD' ? (
                                            <div className="flex items-start gap-2 bg-emerald-950/20 border border-emerald-500/10 p-2.5 rounded-lg mt-2">
                                                <TrendingUp className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0 mt-0.5" />
                                                <p className="text-emerald-400">
                                                    <strong>多頭持有心法</strong>：多頭強勢股常在早盤或盤中因散戶情緒爆發衝高，掛此價格可極大概率成交在「日內極致高點」，避免收盤回吐！
                                                </p>
                                            </div>
                                        ) : (
                                            <div className="flex items-start gap-2 bg-rose-950/20 border border-rose-500/10 p-2.5 rounded-lg mt-2">
                                                <ShieldAlert className="w-3.5 h-3.5 text-rose-400 flex-shrink-0 mt-0.5" />
                                                <p className="text-rose-400">
                                                    <strong>防守撤離提示</strong>：此股短線生命線已破，建議設定防守價位 <strong className="text-white">${data.bestStopPrice}</strong>，若明日確認收盤再次跌破，請於後天早盤市價開盤賣出，嚴控風險。
                                                </p>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
