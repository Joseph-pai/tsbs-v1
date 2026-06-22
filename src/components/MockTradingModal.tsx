'use client';

import React, { useState, useEffect } from 'react';
import { X, Play, Plus, Trash2, TrendingUp, AlertTriangle, CheckCircle2, XCircle, Calculator, Activity, DollarSign, Clock } from 'lucide-react';
import { StockData } from '@/types';
import clsx from 'clsx';
import { format, subDays } from 'date-fns';

interface MockTradingModalProps {
    isOpen: boolean;
    onClose: () => void;
    snapshot: StockData[];
}

interface TradeRow {
    id: string;
    buyDate: string;
    stockId: string;
    stockName: string;
    buyPrice: string;
    buyShares: string;
    targetPercent: string;
    sellPrice: string;
    status: 'idle' | 'testing' | 'success' | 'failed' | 'error';
    profit: number | null;
    message: string | null;
}

// 台灣股市跳動檔位計算
function roundToTwseTick(price: number): number {
    if (price <= 0) return 0;
    if (price < 10) return Math.round(price * 100) / 100;
    if (price < 50) return Math.round(price * 20) / 20;
    if (price < 100) return Math.round(price * 10) / 10;
    if (price < 500) return Math.round(price * 2) / 2;
    if (price < 1000) return Math.round(price);
    return Math.round(price / 5) * 5;
}

export default function MockTradingModal({ isOpen, onClose, snapshot }: MockTradingModalProps) {
    // 預設給一個空列，日期為前一個交易日（簡單以昨天代替）
    const defaultDate = format(subDays(new Date(), 1), 'yyyy-MM-dd');
    const createEmptyRow = (): TradeRow => ({
        id: Math.random().toString(36).substring(2, 9),
        buyDate: defaultDate,
        stockId: '',
        stockName: '',
        buyPrice: '',
        buyShares: '1000',
        targetPercent: '5', // 預設 +5%
        sellPrice: '',
        status: 'idle',
        profit: null,
        message: null
    });

    const [rows, setRows] = useState<TradeRow[]>([]);
    const [isTesting, setIsTesting] = useState(false);

    useEffect(() => {
        if (isOpen && rows.length === 0) {
            setRows([createEmptyRow()]);
        }
    }, [isOpen]);

    if (!isOpen) return null;

    const handleAddRow = () => {
        setRows([...rows, createEmptyRow()]);
    };

    const handleRemoveRow = (id: string) => {
        setRows(rows.filter(r => r.id !== id));
    };

    const updateRow = (id: string, updates: Partial<TradeRow>) => {
        setRows(prev => prev.map(r => {
            if (r.id !== id) return r;
            const updated = { ...r, ...updates };

            // 自動尋找股票名稱
            if (updates.stockId !== undefined) {
                const found = snapshot.find(s => s.stock_id === updated.stockId);
                updated.stockName = found ? found.stock_name : '';
            }

            // 自動計算賣出價
            if (updates.buyPrice !== undefined || updates.targetPercent !== undefined) {
                const buyP = parseFloat(updated.buyPrice);
                if (!isNaN(buyP) && updated.targetPercent !== 'manual') {
                    const percent = parseFloat(updated.targetPercent) / 100;
                    updated.sellPrice = roundToTwseTick(buyP * (1 + percent)).toString();
                } else if (updated.targetPercent === 'manual' && updates.targetPercent !== undefined) {
                    // 切換到手動時不清空，保留最後的數值讓用戶修改
                }
            }

            return updated;
        }));
    };

    const handleRunBacktest = async () => {
        setIsTesting(true);
        const todayStr = format(new Date(), 'yyyy-MM-dd');

        // 先把狀態都改成 testing
        setRows(prev => prev.map(r => ({ ...r, status: 'testing', profit: null, message: null })));

        const updatedRows = [...rows];

        for (let i = 0; i < updatedRows.length; i++) {
            const row = updatedRows[i];
            // 驗證輸入
            if (!row.stockId || !row.buyDate || !row.buyPrice || !row.sellPrice || !row.buyShares) {
                updatedRows[i] = { ...row, status: 'error', message: '請填寫完整資訊' };
                setRows([...updatedRows]);
                continue;
            }

            const buyP = parseFloat(row.buyPrice);
            const sellP = parseFloat(row.sellPrice);
            const shares = parseInt(row.buyShares, 10);

            if (isNaN(buyP) || isNaN(sellP) || isNaN(shares) || shares <= 0) {
                updatedRows[i] = { ...row, status: 'error', message: '數值格式錯誤' };
                setRows([...updatedRows]);
                continue;
            }

            try {
                const res = await fetch(`/api/backtest?stockId=${row.stockId}&fromDate=${row.buyDate}&toDate=${todayStr}&targetPrice=${sellP}`);
                const data = await res.json();

                if (!res.ok) {
                    updatedRows[i] = { ...row, status: 'error', message: data.error || '連線失敗' };
                } else if (data.peakPrice === null) {
                    updatedRows[i] = { ...row, status: 'error', message: data.message || '無歷史數據' };
                } else {
                    const hitTarget = data.peakPrice >= sellP;
                    if (hitTarget) {
                        const profit = (sellP - buyP) * shares;
                        updatedRows[i] = { 
                            ...row, 
                            status: 'success', 
                            profit: profit, 
                            message: `於 ${data.hitRecords?.[0]?.date || '區間內'} 達標 ($${data.peakPrice})` 
                        };
                    } else {
                        updatedRows[i] = { 
                            ...row, 
                            status: 'failed', 
                            profit: 0, 
                            message: `最高僅達 $${data.peakPrice}` 
                        };
                    }
                }
            } catch (e: any) {
                updatedRows[i] = { ...row, status: 'error', message: '請求發生錯誤' };
            }
            // 每次跑完一行就更新 UI
            setRows([...updatedRows]);
        }
        setIsTesting(false);
    };

    const totalProfit = rows.reduce((sum, r) => sum + (r.profit || 0), 0);
    const successCount = rows.filter(r => r.status === 'success').length;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
            <div className="absolute inset-0 bg-black/80 backdrop-blur-sm transition-opacity" onClick={onClose} />

            <div className="relative w-full max-w-7xl bg-slate-900 border border-slate-800 rounded-3xl shadow-[0_0_50px_rgba(0,0,0,0.8)] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200 max-h-[90vh]">
                {/* Visual Accent Glow */}
                <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-emerald-500 to-teal-500" />

                {/* Header */}
                <div className="flex items-center justify-between p-6 border-b border-slate-800/80 bg-slate-900/50">
                    <div className="flex items-center gap-3">
                        <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-400">
                            <Activity className="w-6 h-6" />
                        </div>
                        <div>
                            <h3 className="text-xl font-black text-white tracking-tight flex items-center gap-2">
                                歷史模擬交易沙盒
                                <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 text-[10px] uppercase font-bold tracking-widest border border-emerald-500/30">Beta</span>
                            </h3>
                            <p className="text-xs text-slate-400">驗證買點與停利策略，自動計算潛在獲利</p>
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
                <div className="p-6 overflow-y-auto space-y-6 flex-1">
                    
                    {/* 說明區塊 */}
                    <div className="bg-slate-950/50 border border-slate-800 rounded-2xl p-4 flex gap-3 text-sm">
                        <Clock className="w-5 h-5 text-teal-400 flex-shrink-0 mt-0.5" />
                        <div className="text-slate-300">
                            <p className="font-bold text-teal-400 mb-1">如何使用模擬交易？</p>
                            <p className="text-xs">輸入您過去實際買入或設想買入的記錄（日期、股價、股數、目標利潤），系統會利用每日的歷史高低點進行回測比對。只要期間內有任何一天的「盤中最高價」達到您的目標價，即判定為「停利成功」並結算獲利。</p>
                        </div>
                    </div>

                    {/* 表格標頭區 (Desktop) */}
                    <div className="hidden lg:grid lg:grid-cols-[1.4fr_1.8fr_1.2fr_1.2fr_1fr_1.2fr_1.8fr_1.2fr_0.6fr] gap-3 px-4 text-sm font-black text-slate-400 uppercase tracking-widest text-center">
                        <div className="text-left">買入日期</div>
                        <div className="text-left">股票代碼</div>
                        <div>買入價</div>
                        <div>股數</div>
                        <div>目標 %</div>
                        <div>目標價</div>
                        <div>狀態</div>
                        <div className="text-right">獲利</div>
                        <div>操作</div>
                    </div>

                    {/* 行列表 */}
                    <div className="space-y-3">
                        {rows.map((row, idx) => (
                            <div key={row.id} className="relative bg-slate-950 border border-slate-800 hover:border-slate-700 rounded-2xl p-4 lg:p-2 lg:px-4 transition-colors">
                                <div className="grid grid-cols-1 lg:grid-cols-[1.4fr_1.8fr_1.2fr_1.2fr_1fr_1.2fr_1.8fr_1.2fr_0.6fr] gap-4 lg:gap-3 items-center">
                                    {/* 手機版顯示標籤，桌面版隱藏 */}
                                    
                                    <div className="flex flex-col gap-1">
                                        <label className="lg:hidden text-xs text-slate-400 font-bold uppercase">買入日期</label>
                                        <input type="date" value={row.buyDate} onChange={e => updateRow(row.id, { buyDate: e.target.value })} disabled={isTesting}
                                            className="w-full bg-slate-900 border border-slate-800 rounded-xl px-2 py-2.5 text-base text-white font-mono font-bold focus:border-teal-500 focus:outline-none" />
                                    </div>
                                    
                                    <div className="flex flex-col gap-1">
                                        <label className="lg:hidden text-xs text-slate-400 font-bold uppercase">股票代碼</label>
                                        <div className="flex flex-col xl:flex-row gap-2 items-start xl:items-center">
                                            <input type="text" placeholder="代碼" value={row.stockId} onChange={e => updateRow(row.id, { stockId: e.target.value })} disabled={isTesting}
                                                className="w-full xl:w-24 bg-slate-900 border border-slate-800 rounded-xl px-3 py-2.5 text-base text-white font-mono font-bold focus:border-teal-500 focus:outline-none text-center" />
                                            {row.stockName && <span className="text-sm font-black text-teal-400 hidden sm:block whitespace-nowrap">{row.stockName}</span>}
                                        </div>
                                    </div>

                                    <div className="flex flex-col gap-1">
                                        <label className="lg:hidden text-xs text-slate-400 font-bold uppercase">買入價</label>
                                        <input type="number" placeholder="價格" value={row.buyPrice} onChange={e => updateRow(row.id, { buyPrice: e.target.value })} disabled={isTesting}
                                            className="w-full bg-slate-900 border border-slate-800 rounded-xl px-2 py-2.5 text-base text-white font-mono font-bold focus:border-teal-500 focus:outline-none text-center" />
                                    </div>

                                    <div className="flex flex-col gap-1">
                                        <label className="lg:hidden text-xs text-slate-400 font-bold uppercase">買入股數</label>
                                        <input type="number" placeholder="股數" value={row.buyShares} onChange={e => updateRow(row.id, { buyShares: e.target.value })} disabled={isTesting}
                                            className="w-full bg-slate-900 border border-slate-800 rounded-xl px-2 py-2.5 text-base text-white font-mono font-bold focus:border-teal-500 focus:outline-none text-center" />
                                    </div>

                                    <div className="flex flex-col gap-1">
                                        <label className="lg:hidden text-xs text-slate-400 font-bold uppercase">停利目標 %</label>
                                        <select value={row.targetPercent} onChange={e => updateRow(row.id, { targetPercent: e.target.value })} disabled={isTesting}
                                            className="w-full bg-slate-900 border border-slate-800 rounded-xl px-1 py-2.5 text-base text-white font-mono font-bold focus:border-teal-500 focus:outline-none text-center appearance-none">
                                            <option value="2">+2%</option>
                                            <option value="3">+3%</option>
                                            <option value="5">+5%</option>
                                            <option value="10">+10%</option>
                                            <option value="15">+15%</option>
                                            <option value="20">+20%</option>
                                            <option value="manual">手動</option>
                                        </select>
                                    </div>

                                    <div className="flex flex-col gap-1">
                                        <label className="lg:hidden text-xs text-slate-400 font-bold uppercase">預計賣出價</label>
                                        <input type="number" placeholder="目標價" value={row.sellPrice} disabled={isTesting || row.targetPercent !== 'manual'}
                                            onChange={e => updateRow(row.id, { sellPrice: e.target.value })}
                                            className={clsx(
                                                "w-full rounded-xl px-2 py-2.5 text-base font-mono font-black text-center focus:outline-none",
                                                row.targetPercent === 'manual' 
                                                    ? "bg-slate-900 border border-slate-800 text-white focus:border-teal-500" 
                                                    : "bg-slate-800/50 border border-transparent text-teal-400"
                                            )} />
                                    </div>

                                    <div className="flex flex-col items-center justify-center gap-1">
                                        {row.status === 'idle' && <span className="text-sm text-slate-500 font-bold">尚未回測</span>}
                                        {row.status === 'testing' && <span className="text-sm text-teal-400 flex items-center gap-1 font-bold"><div className="w-4 h-4 border-2 border-teal-500/30 border-t-teal-400 rounded-full animate-spin" /> 回測中</span>}
                                        {row.status === 'success' && (
                                            <div className="flex flex-col items-center">
                                                <span className="text-sm text-emerald-400 font-black flex items-center gap-1"><CheckCircle2 className="w-4 h-4" /> 賣出成功</span>
                                                <span className="text-xs text-slate-400 truncate max-w-[120px] font-medium">{row.message}</span>
                                            </div>
                                        )}
                                        {row.status === 'failed' && (
                                            <div className="flex flex-col items-center">
                                                <span className="text-sm text-rose-400 font-bold flex items-center gap-1"><XCircle className="w-4 h-4" /> 未達標</span>
                                                <span className="text-xs text-slate-400 truncate max-w-[120px] font-medium">{row.message}</span>
                                            </div>
                                        )}
                                        {row.status === 'error' && (
                                            <div className="flex flex-col items-center">
                                                <span className="text-sm text-amber-400 font-bold flex items-center gap-1"><AlertTriangle className="w-4 h-4" /> 錯誤</span>
                                                <span className="text-xs text-slate-400 truncate max-w-[120px] font-medium">{row.message}</span>
                                            </div>
                                        )}
                                    </div>

                                    <div className="flex flex-col gap-1 items-end lg:items-center">
                                        <label className="lg:hidden text-xs text-slate-400 font-bold uppercase">單筆獲利</label>
                                        <span className={clsx(
                                            "text-lg font-black font-mono",
                                            row.profit && row.profit > 0 ? "text-emerald-400" : row.profit === 0 ? "text-slate-500" : "text-slate-600"
                                        )}>
                                            {row.profit !== null ? `$${Math.round(row.profit).toLocaleString()}` : '-'}
                                        </span>
                                    </div>

                                    <div className="flex justify-end lg:justify-center">
                                        <button onClick={() => handleRemoveRow(row.id)} disabled={isTesting}
                                            className="p-2 bg-slate-900 border border-slate-800 hover:bg-rose-500/10 hover:border-rose-500/30 hover:text-rose-400 text-slate-500 rounded-xl transition-all disabled:opacity-50">
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>

                    <button onClick={handleAddRow} disabled={isTesting}
                        className="w-full py-4 border-2 border-dashed border-slate-800 hover:border-teal-500/50 rounded-2xl flex items-center justify-center gap-2 text-sm font-bold text-slate-400 hover:text-teal-400 transition-all disabled:opacity-50 bg-slate-900/50 hover:bg-slate-900">
                        <Plus className="w-4 h-4" /> 新增股票
                    </button>

                </div>

                {/* Footer */}
                <div className="p-6 border-t border-slate-800/80 bg-slate-950 flex flex-col sm:flex-row items-center justify-between gap-4">
                    <div className="flex items-center gap-6 w-full sm:w-auto bg-slate-900 px-6 py-4 rounded-2xl border border-slate-800">
                        <div>
                            <span className="text-[10px] text-slate-500 font-bold uppercase tracking-widest block mb-1">達標勝率</span>
                            <span className="text-xl font-black text-white">{rows.length > 0 ? Math.round((successCount / rows.length) * 100) : 0}%</span>
                            <span className="text-xs text-slate-400 ml-2">({successCount}/{rows.length})</span>
                        </div>
                        <div className="w-px h-10 bg-slate-800"></div>
                        <div>
                            <span className="text-[10px] text-slate-500 font-bold uppercase tracking-widest block mb-1">總計模擬獲利</span>
                            <span className={clsx("text-2xl font-black font-mono", totalProfit > 0 ? "text-emerald-400" : "text-white")}>
                                ${totalProfit.toLocaleString()}
                            </span>
                        </div>
                    </div>

                    <button 
                        onClick={handleRunBacktest}
                        disabled={isTesting || rows.length === 0}
                        className="w-full sm:w-auto px-8 py-4 bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-500 hover:to-emerald-500 text-white font-black rounded-2xl shadow-lg hover:shadow-teal-500/20 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2 text-base"
                    >
                        {isTesting ? (
                            <><div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> 回測中...</>
                        ) : (
                            <><Play className="w-5 h-5" /> 開始全面回測</>
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
}
