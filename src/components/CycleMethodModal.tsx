import React, { useMemo } from 'react';
import { X, TrendingUp, AlertTriangle, Minus, Loader2 } from 'lucide-react';
import { clsx } from 'clsx';
import { CycleResult } from '@/services/cycleScanner';

interface CycleMethodModalProps {
  isOpen: boolean;
  onClose: () => void;
  results: CycleResult[];
  isScanning: boolean;
}

export default function CycleMethodModal({ isOpen, onClose, results, isScanning }: CycleMethodModalProps) {
  if (!isOpen) return null;

  const buyResults = useMemo(() => results.filter(r => r.signal === 'BUY'), [results]);
  const exitResults = useMemo(() => results.filter(r => r.signal === 'EXIT'), [results]);
  const holdResults = useMemo(() => results.filter(r => r.signal === 'HOLD'), [results]);

  const renderStockList = (stocks: CycleResult[], emptyMessage: string) => {
    if (stocks.length === 0) {
      return (
        <div className="py-8 text-center text-slate-500 font-medium">
          {emptyMessage}
        </div>
      );
    }
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
        {stocks.map(stock => (
          <div key={stock.stock_id} className="bg-slate-900 border border-slate-700/50 rounded-xl p-4 flex flex-col gap-2">
            <div className="flex justify-between items-start">
              <div>
                <span className="text-white font-black text-lg">{stock.stock_name}</span>
                <span className="text-slate-400 text-sm ml-2">{stock.stock_id}</span>
              </div>
              <div className="text-right">
                <div className="text-white font-bold">{stock.close.toFixed(2)}</div>
                <div className={clsx(
                  "text-xs font-bold",
                  stock.changePercent > 0 ? "text-red-400" : stock.changePercent < 0 ? "text-green-400" : "text-slate-400"
                )}>
                  {stock.changePercent > 0 ? '+' : ''}{(stock.changePercent * 100).toFixed(2)}%
                </div>
              </div>
            </div>
            <div className="mt-2 text-xs font-medium text-slate-300 bg-slate-800/50 p-2 rounded-lg break-words">
              {stock.reason || '無特別說明'}
            </div>
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
      <div 
        className="absolute inset-0 bg-black/80 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />
      
      <div className="relative w-full max-w-6xl max-h-[90vh] bg-slate-950 border border-slate-800 rounded-3xl shadow-2xl flex flex-col overflow-hidden animate-in fade-in zoom-in duration-300">
        <div className="flex items-center justify-between p-5 border-b border-slate-800/80 bg-slate-900">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-emerald-500/20 rounded-xl">
              <TrendingUp className="w-6 h-6 text-emerald-400" />
            </div>
            <div>
              <h2 className="text-xl font-black text-white">短線週期掃描結果</h2>
              <p className="text-xs text-slate-400 font-medium">基於最新收盤價的進出場判斷</p>
            </div>
          </div>
          <button 
             onClick={onClose}
             className="p-2 bg-slate-800 hover:bg-slate-700 rounded-full text-slate-400 hover:text-white transition-all hover:rotate-90 duration-300"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-8">
          {isScanning ? (
            <div className="flex flex-col items-center justify-center py-20 space-y-4">
              <Loader2 className="w-12 h-12 text-emerald-500 animate-spin" />
              <div className="text-emerald-400 font-bold text-xl animate-pulse">正在掃描與計算中...</div>
              <p className="text-slate-500">這可能需要幾分鐘的時間，請稍候</p>
            </div>
          ) : (
            <>
              {/* 進場 */}
              <section>
                <div className="flex items-center gap-2 mb-4">
                  <div className="w-2 h-6 bg-red-500 rounded-full"></div>
                  <h3 className="text-xl font-black text-red-400">進場訊號 (BUY)</h3>
                  <span className="ml-2 px-2.5 py-0.5 rounded-full bg-red-500/10 text-red-400 text-sm font-bold">
                    {buyResults.length}
                  </span>
                </div>
                <div className="bg-red-950/10 border border-red-900/30 rounded-2xl p-4">
                  {renderStockList(buyResults, "今日無符合進場條件的股票")}
                </div>
              </section>

              {/* 出場 */}
              <section>
                <div className="flex items-center gap-2 mb-4">
                  <div className="w-2 h-6 bg-green-500 rounded-full"></div>
                  <h3 className="text-xl font-black text-green-400">出場訊號 (EXIT)</h3>
                  <span className="ml-2 px-2.5 py-0.5 rounded-full bg-green-500/10 text-green-400 text-sm font-bold">
                    {exitResults.length}
                  </span>
                </div>
                <div className="bg-green-950/10 border border-green-900/30 rounded-2xl p-4">
                  {renderStockList(exitResults, "今日無符合出場條件的股票")}
                </div>
              </section>

              {/* 持倉 */}
              <section>
                <div className="flex items-center gap-2 mb-4">
                  <div className="w-2 h-6 bg-slate-500 rounded-full"></div>
                  <h3 className="text-xl font-black text-slate-300">維持持倉 (HOLD)</h3>
                  <span className="ml-2 px-2.5 py-0.5 rounded-full bg-slate-800 text-slate-400 text-sm font-bold">
                    {holdResults.length}
                  </span>
                </div>
                <div className="bg-slate-900/30 border border-slate-800 rounded-2xl p-4">
                  {renderStockList(holdResults, "今日無持倉股票")}
                </div>
              </section>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
