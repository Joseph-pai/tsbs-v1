import React from 'react';
import { AnalysisResult } from '@/types';
import { Activity, Zap, ShieldCheck, TrendingUp, Flame } from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}

interface StockCardProps {
    data: AnalysisResult;
    index?: number;
    onClick?: () => void;
}

/**
 * Enhanced Stock Card with High Readability
 * Focused on professional-grade visualization for TA signals
 */
export const StockCard: React.FC<StockCardProps> = ({ data, index, onClick }) => {
    const isPositive = data.change_percent >= 0;
    const volTrend = data.dailyVolumeTrend || [];
    const maxVol = Math.max(...volTrend, 1);

    // Identify Resonance Signals
    const hasVolumeExplosion = data.v_ratio >= 3.0;
    const hasMaSqueeze = data.tags.includes('MA_SQUEEZE');
    const hasBreakout = data.tags.includes('BREAKOUT');
    const hasMarginSqueeze = data.tags.includes('MARGIN_SQUEEZE');
    const hasGapUp = data.tags.includes('GAP_UP');
    const hasRevenueNewHigh = data.tags.includes('REVENUE_NEW_HIGH');

    return (
        <div
            onClick={onClick}
            className="group relative overflow-hidden rounded-[2.5rem] bg-white/5 p-8 backdrop-blur-xl border border-white/10 transition-all hover:bg-white/10 hover:scale-[1.01] cursor-pointer shadow-2xl active:scale-[0.99]"
        >
            <div className="flex items-start justify-between relative z-10">
                <div className="flex gap-6 items-center">
                    {/* Position Number - Large & Bold */}
                    {index !== undefined && (
                        <div className="flex items-center justify-center w-14 h-14 rounded-2xl bg-slate-800/80 border border-white/10 text-xl font-black text-slate-400 group-hover:text-amber-400 group-hover:border-amber-500/50 transition-colors">
                            {index}
                        </div>
                    )}
                    <div>
                        {/* Improved Header: ID, Name, Sector */}
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                            <span className="text-3xl font-black text-blue-400 font-mono tracking-tighter tabular-nums">
                                {data.stock_id}
                            </span>
                            <h3 className="text-4xl font-black text-white group-hover:text-blue-200 transition-colors tracking-tight">
                                {data.stock_name}
                            </h3>
                            {data.sector_name && (
                                <span className={cn(
                                    "text-sm font-black px-3 py-1.5 rounded-lg border font-mono tracking-widest",
                                    // Highlight if it's a specific industry (not generic board name)
                                    !data.sector_name?.includes('板') && isNaN(parseInt(data.sector_name))
                                        ? "bg-blue-500/10 text-blue-400 border-blue-500/30"
                                        : "bg-slate-800/80 text-slate-500 border-white/5"
                                )}>
                                    {/* Double-check mapping if server sent ID instead of name */}
                                    {(!isNaN(parseInt(data.sector_name)) && data.sector_name.length <= 2)
                                        ? (require('@/lib/sectors').INDUSTRY_MAP[data.sector_name] || data.sector_name)
                                        : data.sector_name}
                                </span>
                            )}
                        </div>

                        {/* Resonance Tags - Scaled up for readability */}
                        <div className="flex flex-wrap gap-2 mt-5">
                            {hasVolumeExplosion && (
                                <span className="flex items-center gap-1.5 text-xs font-black bg-amber-500/10 text-amber-400 px-3 py-1 rounded-full border border-amber-500/30 font-mono">
                                    <Flame className="w-4 h-4" />
                                    量能激增 {data.v_ratio.toFixed(1)}x
                                </span>
                            )}
                            {hasMaSqueeze && (
                                <span className="flex items-center gap-1.5 text-xs font-black bg-purple-500/10 text-purple-400 px-3 py-1 rounded-full border border-purple-500/30">
                                    📉 均線糾結 {(data.maConstrictValue! * 100).toFixed(1)}%
                                </span>
                            )}
                            {hasBreakout && (
                                <span className="flex items-center gap-1.5 text-xs font-black bg-emerald-500/10 text-emerald-400 px-3 py-1 rounded-full border border-emerald-500/30">
                                    <TrendingUp className="w-4 h-4" />
                                    帶量突破
                                </span>
                            )}
                            {hasMarginSqueeze && (
                                <span className="flex items-center gap-1.5 text-xs font-black bg-rose-500/10 text-rose-400 px-3 py-1 rounded-full border border-rose-500/30">
                                    <ShieldCheck className="w-4 h-4" />
                                    融資軋空
                                </span>
                            )}
                            {hasGapUp && (
                                <span className="flex items-center gap-1.5 text-xs font-black bg-sky-500/10 text-sky-400 px-3 py-1 rounded-full border border-sky-500/30">
                                    ⬆️ 跳空缺口
                                </span>
                            )}
                            {hasRevenueNewHigh && (
                                <span className="flex items-center gap-1.5 text-xs font-black bg-teal-500/10 text-teal-400 px-3 py-1 rounded-full border border-teal-500/30">
                                    📊 營收新高
                                </span>
                            )}
                        </div>
                    </div>
                </div>

                <div className="text-right flex flex-col items-end">
                    <div className="text-xs text-slate-500 font-black uppercase tracking-widest mb-1.5 opacity-60">現價</div>
                    <div className={cn(
                        "text-5xl font-black font-mono leading-none tracking-tighter tabular-nums",
                        isPositive ? "text-rose-500 shadow-rose-500/20" : "text-emerald-500 shadow-emerald-500/20"
                    )}>
                        {data.close?.toFixed(2) || '---'}
                    </div>
                    <div className={cn(
                        "mt-3 text-lg font-black font-mono flex items-center gap-1 rounded-lg px-3 py-1",
                        isPositive ? "bg-rose-500/10 text-rose-500" : "bg-emerald-500/10 text-emerald-500"
                    )}>
                        {isPositive ? '▲' : '▼'} {(data.change_percent * 100).toFixed(2)}%
                    </div>
                    {data.potential_score != null && (
                        <div className="mt-2 flex items-center gap-1.5 bg-blue-500/10 border border-blue-500/30 rounded-lg px-3 py-1">
                            <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">評分</span>
                            <span className="text-base font-black font-mono text-blue-400">{Math.round(data.potential_score)}</span>
                        </div>
                    )}
                </div>
            </div>

            {/* Indicator Grid - Enhanced for User Request */}
            <div className="mt-8 grid grid-cols-3 gap-6 border-t border-white/5 pt-8">
                <div className="flex flex-col gap-1 group/tooltip relative">
                    <div className="flex items-center gap-2 mb-1 cursor-help">
                        <Flame className={cn("w-5 h-5", data.v_ratio >= 1.5 ? "text-amber-400" : "text-slate-700")} />
                        <span className="text-xs uppercase tracking-[0.2em] text-gray-500 font-black border-b border-dotted border-gray-600">量能倍數</span>
                    </div>
                    <span className={cn("text-3xl font-black font-mono italic", data.v_ratio >= 1.5 ? "text-white" : "text-slate-700")}>
                        {(data.v_ratio * 100).toFixed(0)}%
                    </span>
                    <p className="text-[10px] text-slate-500 font-bold mt-1 leading-tight">
                        數值越大代表買盤越積極 (建議 {'>'} 300%)
                    </p>
                </div>

                <div className="flex flex-col gap-1 group/tooltip relative">
                    <div className="flex items-center gap-2 mb-1 cursor-help">
                        <Activity className={cn("w-5 h-5", (data.maConstrictValue || 1) <= 0.05 ? "text-purple-400" : "text-slate-700")} />
                        <span className="text-xs uppercase tracking-[0.2em] text-gray-500 font-black border-b border-dotted border-gray-600">均線糾結</span>
                    </div>
                    <span className={cn("text-3xl font-black font-mono", (data.maConstrictValue || 1) <= 0.05 ? "text-white" : "text-slate-700")}>
                        {data.maConstrictValue ? `${(data.maConstrictValue * 100).toFixed(1)}%` : '--'}
                    </span>
                    <p className="text-[10px] text-slate-500 font-bold mt-1 leading-tight">
                        數值越小代表壓縮越極致 (建議 {'<'} 5%)
                    </p>
                </div>

                <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-2 mb-1">
                        <Zap className={cn("w-5 h-5", (data.change_percent || 0) >= 0.03 ? "text-blue-400" : "text-slate-700")} />
                        <span className="text-xs uppercase tracking-[0.2em] text-gray-500 font-black">今日漲幅</span>
                    </div>
                    <span className={cn("text-2xl font-black font-mono", (data.change_percent || 0) >= 0.03 ? "text-white" : "text-slate-700")}>
                        {((data.change_percent || 0) * 100).toFixed(2)}%
                    </span>
                    <p className="text-[10px] text-slate-500 font-bold mt-1 leading-tight">
                        帶量突破關鍵價位 (建議 {'>'} 3%)
                    </p>
                </div>
            </div>

            {/* Sparkline Volume Histogram */}
            {volTrend.length > 0 && (
                <div className="mt-6 flex justify-between items-end h-10 gap-[3px] opacity-30 group-hover:opacity-60 transition-opacity">
                    {volTrend.map((v, i) => (
                        <div
                            key={i}
                            className={cn(
                                "flex-1 rounded-t-sm transition-all duration-500",
                                i === volTrend.length - 1 ? "bg-amber-400" : "bg-slate-600"
                            )}
                            style={{ height: `${(v / maxVol) * 100}%` }}
                        />
                    ))}
                </div>
            )}
        </div>
    );
};
