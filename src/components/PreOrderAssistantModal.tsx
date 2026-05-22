'use client';

import React, { useState } from 'react';
import { X, Clock, Search, Copy, Check, AlertTriangle, TrendingUp, ShieldAlert, DollarSign, Activity, Download, Loader2, Plus, Trash2, RefreshCw } from 'lucide-react';
import { exportToPDF } from '@/lib/pdfUtils';
import clsx from 'clsx';

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

interface DiagnosisResult {
    stock_id: string;
    success: boolean;
    data?: DiagnosisData;
    error?: string;
    loading?: boolean;
}

export default function PreOrderAssistantModal({ isOpen, onClose }: PreOrderAssistantModalProps) {
    const [inputValue, setInputValue] = useState('');
    const [stockIds, setStockIds] = useState<string[]>([]);
    const [loading, setLoading] = useState(false);
    const [isExportingPDF, setIsExportingPDF] = useState(false);
    const [results, setResults] = useState<DiagnosisResult[]>([]);
    const [copiedStates, setCopiedStates] = useState<Record<string, boolean>>({});

    if (!isOpen) return null;

    // 將輸入框中的股票代號加入清單
    const handleAddStock = (input?: string) => {
        const text = (input || inputValue).trim();
        if (!text) return;

        // 支援多種分隔符（逗號、空格、中文逗號、換行）
        const tokens = text.split(/[\s,，\n]+/).map(t => t.trim()).filter(Boolean);
        const newIds = [...stockIds];

        tokens.forEach(id => {
            if (!newIds.includes(id)) {
                newIds.push(id);
            }
        });

        setStockIds(newIds);
        if (!input) setInputValue('');
    };

    // 移除清單中的股票
    const handleRemoveStock = (idToRemove: string) => {
        setStockIds(stockIds.filter(id => id !== idToRemove));
    };

    // 清空清單
    const handleClearAll = () => {
        setStockIds([]);
        setResults([]);
    };

    // 批次診斷
    const handleDiagnoseAll = async () => {
        if (stockIds.length === 0) return;

        setLoading(true);
        setResults([]);

        try {
            const queryParam = stockIds.join(',');
            const res = await fetch(`/api/pre-order-advice?stockId=${queryParam}`);
            const json = await res.json();

            if (json.success && json.results) {
                setResults(json.results);
            } else {
                const errorMsg = json.error || '批次診斷失敗';
                setResults(stockIds.map(id => ({
                    stock_id: id,
                    success: false,
                    error: errorMsg
                })));
            }
        } catch (e: any) {
            console.error('Batch diagnosis error:', e);
            setResults(stockIds.map(id => ({
                stock_id: id,
                success: false,
                error: '連線伺服器失敗，請稍後重試。'
            })));
        } finally {
            setLoading(false);
        }
    };

    // 單股再次診斷 (Retry)
    const handleRetrySingle = async (stockId: string) => {
        setResults(prev => prev.map(item => 
            item.stock_id === stockId ? { ...item, loading: true } : item
        ));

        try {
            const res = await fetch(`/api/pre-order-advice?stockId=${stockId}`);
            const json = await res.json();

            if (json.success && json.results && json.results.length > 0) {
                const singleResult = json.results[0];
                setResults(prev => prev.map(item => 
                    item.stock_id === stockId ? singleResult : item
                ));
            } else {
                const errorMsg = json.error || '診斷重試失敗';
                setResults(prev => prev.map(item => 
                    item.stock_id === stockId ? { stock_id: stockId, success: false, error: errorMsg, loading: false } : item
                ));
            }
        } catch (e: any) {
            console.error(`Retry error for stock ${stockId}:`, e);
            setResults(prev => prev.map(item => 
                item.stock_id === stockId ? { stock_id: stockId, success: false, error: '重試連線失敗。', loading: false } : item
            ));
        }
    };

    // 複製特定掛單價格
    const copyToClipboard = (stockId: string, text: string) => {
        navigator.clipboard.writeText(text);
        setCopiedStates(prev => ({ ...prev, [stockId]: true }));
        setTimeout(() => {
            setCopiedStates(prev => ({ ...prev, [stockId]: false }));
        }, 2000);
    };

    // PDF 完整匯出
    const handleExportPDF = async () => {
        if (isExportingPDF) return;
        setIsExportingPDF(true);
        // 等待 React DOM 重繪，將 Modal 展開
        await new Promise(r => setTimeout(r, 450));
        try {
            const today = new Date();
            const dateStr = `${today.getFullYear()}${(today.getMonth() + 1).toString().padStart(2, '0')}${today.getDate().toString().padStart(2, '0')}_${today.getHours().toString().padStart(2, '0')}${today.getMinutes().toString().padStart(2, '0')}`;
            await exportToPDF('pre-order-modal-panel', `12H預約賣出決策報告_${dateStr}.pdf`);
        } catch (err) {
            console.error('PDF export failed:', err);
        } finally {
            setIsExportingPDF(false);
        }
    };

    return (
        <div className={clsx(
            "z-50 flex justify-center p-4 sm:p-6",
            isExportingPDF
                ? "relative w-full items-start bg-slate-950"
                : "fixed inset-0 items-center overflow-y-auto"
        )}>
            {/* Backdrop with strong blur and dimming */}
            {!isExportingPDF && (
                <div 
                    className="absolute inset-0 bg-black/75 backdrop-blur-md transition-opacity"
                    onClick={onClose}
                />
            )}

            {/* Modal Box */}
            <div 
                id="pre-order-modal-panel" 
                className={clsx(
                    "relative w-full bg-slate-900/95 border border-slate-800 rounded-3xl shadow-[0_0_50px_rgba(0,0,0,0.8)] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200",
                    isExportingPDF ? "w-full max-w-3xl" : "max-w-xl"
                )}
            >
                {/* Visual Accent Glow */}
                <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-pink-500 to-indigo-500" />

                {/* Header */}
                <div className="flex items-center justify-between p-6 border-b border-slate-800/80">
                    <div className="flex items-center gap-3">
                        <div className="p-2 rounded-xl bg-pink-500/10 text-pink-400">
                            <Clock className="w-5 h-5 animate-pulse" />
                        </div>
                        <div>
                            <h3 className="text-lg font-black text-white tracking-tight">12H 預約賣出決策助手</h3>
                            <p className="text-xs text-slate-400">提前12小時部署盤中極致情緒高點</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        {results.length > 0 && (
                            <button
                                onClick={handleExportPDF}
                                disabled={isExportingPDF}
                                className="px-3.5 py-1.5 bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-400 border border-indigo-500/30 rounded-xl transition-all font-black text-xs disabled:opacity-50 flex items-center gap-1.5"
                            >
                                {isExportingPDF ? (
                                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                ) : (
                                    <Download className="w-3.5 h-3.5" />
                                )}
                                {isExportingPDF ? '匯出中...' : '匯出報表'}
                            </button>
                        )}
                        {!isExportingPDF && (
                            <button 
                                onClick={onClose}
                                className="p-2 bg-slate-800/50 hover:bg-slate-800 rounded-full text-slate-400 hover:text-white transition-all hover:rotate-90 duration-300"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        )}
                    </div>
                </div>

                {/* Content */}
                <div className={clsx(
                    "p-6 space-y-6",
                    isExportingPDF ? "h-auto max-h-none" : "overflow-y-auto max-h-[75vh]"
                )}>
                    {/* 輸入與清單管理區 */}
                    <div className="space-y-3">
                        <label className="text-xs font-black text-slate-400 uppercase tracking-widest block">請輸入您的持股代號</label>
                        <div className="flex gap-2">
                            <div className="relative flex-1">
                                <Search className="absolute left-4 top-3.5 w-5 h-5 text-slate-500" />
                                <input
                                    type="text"
                                    placeholder="例如：3090, 2478 (可用空格或逗號分隔)"
                                    value={inputValue}
                                    onChange={(e) => setInputValue(e.target.value)}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter') {
                                            e.preventDefault();
                                            handleAddStock();
                                        }
                                    }}
                                    className="w-full bg-slate-950/80 border border-slate-800 rounded-2xl pl-12 pr-4 py-3 text-white placeholder-slate-600 focus:outline-none focus:border-pink-500/60 focus:ring-1 focus:ring-pink-500/30 transition-all font-mono font-bold"
                                />
                            </div>
                            <button
                                onClick={() => handleAddStock()}
                                className="px-4 bg-slate-800 hover:bg-slate-700 text-white font-bold rounded-2xl border border-slate-700 transition-all flex items-center gap-1.5 text-sm"
                            >
                                <Plus className="w-4 h-4" /> 加入
                            </button>
                            <button
                                onClick={handleDiagnoseAll}
                                disabled={loading || stockIds.length === 0}
                                className="px-6 py-3 bg-gradient-to-r from-pink-600 to-indigo-600 hover:from-pink-500 hover:to-indigo-500 text-white font-black rounded-2xl shadow-lg hover:shadow-pink-500/10 disabled:opacity-40 disabled:cursor-not-allowed transition-all flex items-center gap-2"
                            >
                                {loading ? (
                                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                ) : 'AI 診斷'}
                            </button>
                        </div>

                        {/* 股票清單展示 */}
                        {stockIds.length > 0 && (
                            <div className="bg-slate-950/60 border border-slate-800/80 p-3 rounded-2xl space-y-2">
                                <div className="flex justify-between items-center text-[10px] text-slate-500 font-bold uppercase tracking-wider">
                                    <span>待診斷股票清單 ({stockIds.length})</span>
                                    <button 
                                        onClick={handleClearAll}
                                        className="text-slate-400 hover:text-rose-400 flex items-center gap-1 transition-all"
                                    >
                                        <Trash2 className="w-3.5 h-3.5" /> 清空
                                    </button>
                                </div>
                                <div className="flex flex-wrap gap-2">
                                    {stockIds.map(id => (
                                        <span 
                                            key={id} 
                                            className="inline-flex items-center gap-1.5 px-3 py-1 bg-slate-900 border border-slate-800 hover:border-slate-700 rounded-xl text-xs font-mono font-bold text-white transition-all"
                                        >
                                            {id}
                                            <button 
                                                onClick={() => handleRemoveStock(id)}
                                                className="p-0.5 rounded-full hover:bg-slate-800 text-slate-500 hover:text-rose-400 transition-colors"
                                            >
                                                <X className="w-3 h-3" />
                                            </button>
                                        </span>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Quick Test Stocks */}
                        <div className="flex flex-wrap items-center gap-2 pt-1">
                            <span className="text-[11px] text-slate-500 font-bold">快速加入測試：</span>
                            {[
                                { id: '3090', name: '耀華' },
                                { id: '2478', name: '大毅' },
                                { id: '4916', name: '事欣科' }
                            ].map(item => (
                                <button
                                    key={item.id}
                                    onClick={() => handleAddStock(item.id)}
                                    className="px-2.5 py-1 text-[11px] font-semibold text-slate-400 bg-slate-950 border border-slate-800 rounded-lg hover:border-pink-500/40 hover:text-white transition-all"
                                >
                                    + {item.id} {item.name}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* 診斷結果清單 */}
                    {results.length > 0 && (
                        <div className="space-y-6">
                            <div className="border-t border-slate-800/80 pt-4 flex justify-between items-center">
                                <span className="text-xs font-black uppercase tracking-widest text-slate-400">AI 診斷報告列表</span>
                                <span className="text-[10px] text-slate-500 font-bold">共 {results.length} 檔個股</span>
                            </div>

                            {results.map((result) => {
                                const { stock_id, success, error: singleError, data: itemData, loading: itemLoading } = result;

                                if (itemLoading) {
                                    return (
                                        <div key={stock_id} className="bg-slate-950/60 border border-slate-800/80 rounded-2xl p-6 flex flex-col items-center justify-center gap-3 text-slate-400 min-h-[150px]">
                                            <Loader2 className="w-8 h-8 animate-spin text-pink-500" />
                                            <p className="text-xs font-bold font-mono text-slate-400">正在重新診斷股票 {stock_id}...</p>
                                        </div>
                                    );
                                }

                                if (!success || !itemData) {
                                    return (
                                        <div key={stock_id} className="bg-rose-500/5 border border-rose-500/20 rounded-2xl p-5 space-y-3">
                                            <div className="flex items-center justify-between">
                                                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black tracking-wide bg-rose-500/10 text-rose-400">
                                                    <span className="w-2 h-2 rounded-full bg-rose-400 animate-pulse" />
                                                    {stock_id} • 診斷失敗
                                                </span>
                                                <button
                                                    onClick={() => handleRetrySingle(stock_id)}
                                                    className="px-3 py-1 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 rounded-xl transition-all font-black text-xs flex items-center gap-1"
                                                >
                                                    <RefreshCw className="w-3.5 h-3.5" /> 再次診斷
                                                </button>
                                            </div>
                                            <div className="flex gap-3 text-rose-400 text-sm">
                                                <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5" />
                                                <div>
                                                    <p className="font-bold">個股數據不足或網絡超時</p>
                                                    <p className="text-xs text-rose-400/80 mt-1">{singleError || '查無此股票或歷史數據不足。'}</p>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                }

                                const isCopied = !!copiedStates[stock_id];
                                return (
                                    <div key={stock_id} className="space-y-4 border border-slate-800/60 p-5 bg-slate-900/60 rounded-2xl relative overflow-hidden animate-in fade-in-50 slide-in-from-bottom-4 duration-300">
                                        
                                        {/* Diagnosis Status Bar */}
                                        <div className={`relative overflow-hidden rounded-2xl border p-5 ${
                                            itemData.advice === 'HOLD'
                                                ? 'bg-emerald-950/20 border-emerald-500/30 shadow-[0_0_15px_rgba(16,185,129,0.05)]'
                                                : 'bg-rose-950/20 border-rose-500/30 shadow-[0_0_15px_rgba(244,63,94,0.05)]'
                                        }`}>
                                            <div className="flex items-center justify-between mb-3">
                                                <span className="text-xs font-black uppercase tracking-widest text-slate-400">診斷結果</span>
                                                <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black tracking-wide ${
                                                    itemData.advice === 'HOLD'
                                                        ? 'bg-emerald-500/10 text-emerald-400'
                                                        : 'bg-rose-500/10 text-rose-400'
                                                }`}>
                                                    <span className={`w-2 h-2 rounded-full ${
                                                        itemData.advice === 'HOLD' ? 'bg-emerald-400 animate-pulse' : 'bg-rose-400 animate-pulse'
                                                    }`} />
                                                    {itemData.stock_id} {itemData.stock_name} • {itemData.advice === 'HOLD' ? '繼續持倉' : '建議減倉'}
                                                </span>
                                            </div>
                                            <h4 className={`text-base font-black mb-2 ${
                                                itemData.advice === 'HOLD' ? 'text-emerald-400' : 'text-rose-400'
                                            }`}>
                                                {itemData.advice === 'HOLD' ? '🟢 趨勢強勁，抱緊獲利' : '🔴 短線走弱，避開回吐'}
                                            </h4>
                                            <p className="text-xs leading-relaxed text-slate-300">{itemData.reason}</p>
                                        </div>

                                        {/* Key Stats Grid */}
                                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                                            <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-3 text-center">
                                                <span className="text-[10px] text-slate-500 font-bold block mb-1">最新收盤價</span>
                                                <span className="text-base font-mono font-black text-white">${itemData.close}</span>
                                            </div>
                                            <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-3 text-center">
                                                <span className="text-[10px] text-slate-500 font-bold block mb-1">生命線 5MA</span>
                                                <span className="text-base font-mono font-black text-white">${itemData.ma5}</span>
                                            </div>
                                            <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-3 text-center">
                                                <span className="text-[10px] text-slate-500 font-bold block mb-1">歷史波幅上影線</span>
                                                <span className="text-base font-mono font-black text-amber-400">{itemData.formulaDetails.avgUpperShadowPercent}</span>
                                            </div>
                                            <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-3 text-center">
                                                <span className="text-[10px] text-slate-500 font-bold block mb-1">共振強度評分</span>
                                                <span className="text-base font-mono font-black text-indigo-400">{itemData.formulaDetails.score}分</span>
                                            </div>
                                        </div>

                                        {/* Distance to 5MA Lifeline Visual Bar */}
                                        <div className="bg-slate-950/80 border border-slate-800 p-4 rounded-2xl space-y-2">
                                            <div className="flex justify-between items-center text-xs">
                                                <span className="text-slate-400 font-bold flex items-center gap-1.5">
                                                    <Activity className="w-3.5 h-3.5 text-pink-500" />
                                                    生命線支撐安全度
                                                </span>
                                                <span className={`font-bold ${itemData.formulaDetails.isBelow5MA ? 'text-rose-400' : 'text-emerald-400'}`}>
                                                    {itemData.formulaDetails.isBelow5MA 
                                                        ? `已跌破 5MA ($${itemData.ma5})` 
                                                        : `高於 5MA +${((itemData.close - itemData.ma5) / itemData.ma5 * 100).toFixed(1)}%`}
                                                </span>
                                            </div>
                                            <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
                                                <div 
                                                    className={`h-full transition-all duration-500 ${
                                                        itemData.formulaDetails.isBelow5MA 
                                                            ? 'bg-rose-500 w-1/4' 
                                                            : 'bg-gradient-to-r from-teal-500 to-emerald-500 w-3/4'
                                                    }`} 
                                                />
                                            </div>
                                        </div>

                                        {/* 12H Pre-Set Order Strategy Box */}
                                        <div className="bg-slate-950 border border-indigo-500/20 rounded-3xl p-5 relative overflow-hidden shadow-2xl">
                                            <div className="absolute top-0 right-0 w-24 h-24 bg-indigo-500/5 rounded-full blur-2xl" />

                                            <div className="flex items-center gap-2 mb-4">
                                                <DollarSign className="w-5 h-5 text-indigo-400" />
                                                <span className="text-xs font-black uppercase tracking-widest text-indigo-400">12H 預約掛單決策方案</span>
                                            </div>

                                            {/* Recommended Price Block */}
                                            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-slate-900 border border-slate-800/80 p-4 rounded-2xl mb-4">
                                                <div>
                                                    <span className="text-[10px] text-slate-500 font-bold block uppercase tracking-wider">
                                                        {itemData.advice === 'HOLD' ? '建議盤中衝高預約停利價' : '建議開盤衝高反彈賣出價'}
                                                    </span>
                                                    <span className="text-2xl font-mono font-black text-white">
                                                        ${itemData.bestPresetSellPrice}
                                                    </span>
                                                    <span className="text-[11px] text-slate-400 ml-2">
                                                        (約較收盤溢價 +{itemData.formulaDetails.suggestedPremiumPercent})
                                                    </span>
                                                </div>
                                                <button
                                                    onClick={() => copyToClipboard(stock_id, itemData.bestPresetSellPrice.toString())}
                                                    className={`w-full sm:w-auto px-4 py-2.5 font-black text-xs rounded-xl flex items-center justify-center gap-1.5 transition-all ${
                                                        isCopied 
                                                            ? 'bg-emerald-600 text-white' 
                                                            : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-md'
                                                    }`}
                                                >
                                                    {isCopied ? (
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
                                                            在<strong className="text-white">今晚 20:00 至明早 08:30</strong> 盤前非交易時段，打開您的券商 APP。
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
                                                            設定為 <strong className="text-indigo-400">【限價賣出】</strong>，價格輸入剛剛複製的極限目標價 <strong className="text-white font-mono font-bold">${itemData.bestPresetSellPrice}</strong> 並送出。
                                                        </p>
                                                    </div>
                                                    {itemData.advice === 'HOLD' ? (
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
                                                                <strong>防守撤離提示</strong>：此股短線生命線已破，建議設定防守價位 <strong className="text-white">${itemData.bestStopPrice}</strong>，若明日確認收盤再次跌破，請於後天早盤市價開盤賣出，嚴控風險。
                                                            </p>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
