'use client';

import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { getScanRecords, getBacktestRecords, deleteScanRecordsByIds } from '@/services/firebaseDb';
import { useAuth } from '@/lib/firebase/context/AuthContext';
import { X, Clock, BarChart2, RefreshCw, ChevronLeft, ChevronRight, Trash2, Eye, CheckSquare, Square } from 'lucide-react';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, getDay, addMonths, subMonths, isSameMonth } from 'date-fns';

interface HistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
}

// ─── Mini Calendar Component ────────────────────────────────────────────────
interface MiniCalendarProps {
  recordDates: Set<string>;          // dates that have records (yyyy-MM-dd)
  selectedDates: Set<string>;        // currently selected dates
  onToggleDate: (date: string) => void;
  accentColor: 'blue' | 'emerald';
}

function MiniCalendar({ recordDates, selectedDates, onToggleDate, accentColor }: MiniCalendarProps) {
  const [viewMonth, setViewMonth] = useState(() => new Date());

  const days = useMemo(() => {
    const start = startOfMonth(viewMonth);
    const end = endOfMonth(viewMonth);
    return eachDayOfInterval({ start, end });
  }, [viewMonth]);

  // pad leading empty cells so week starts on Sunday
  const leadingBlanks = getDay(startOfMonth(viewMonth)); // 0=Sun

  const accent = accentColor === 'blue' ? {
    dot: 'bg-blue-400',
    selected: 'bg-blue-600 text-white border-blue-500',
    hover: 'hover:bg-blue-600/20 hover:border-blue-500/50',
    border: 'border-blue-500/50'
  } : {
    dot: 'bg-emerald-400',
    selected: 'bg-emerald-600 text-white border-emerald-500',
    hover: 'hover:bg-emerald-600/20 hover:border-emerald-500/50',
    border: 'border-emerald-500/50'
  };

  return (
    <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4">
      {/* Month Navigation */}
      <div className="flex items-center justify-between mb-3">
        <button
          onClick={() => setViewMonth(m => subMonths(m, 1))}
          className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <span className="text-sm font-bold text-white">
          {format(viewMonth, 'yyyy年 M月')}
        </span>
        <button
          onClick={() => setViewMonth(m => addMonths(m, 1))}
          className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      {/* Weekday Headers */}
      <div className="grid grid-cols-7 mb-1">
        {['日','一','二','三','四','五','六'].map(d => (
          <div key={d} className="text-center text-[10px] font-bold text-slate-500 py-1">{d}</div>
        ))}
      </div>

      {/* Date Grid */}
      <div className="grid grid-cols-7 gap-1">
        {/* Leading blanks */}
        {Array.from({ length: leadingBlanks }).map((_, i) => (
          <div key={`blank-${i}`} />
        ))}
        {/* Actual days */}
        {days.map(day => {
          const dateStr = format(day, 'yyyy-MM-dd');
          const hasRecord = recordDates.has(dateStr);
          const isSelected = selectedDates.has(dateStr);

          return (
            <button
              key={dateStr}
              onClick={() => hasRecord && onToggleDate(dateStr)}
              disabled={!hasRecord}
              className={`
                relative flex flex-col items-center justify-center h-9 w-full rounded-lg text-xs font-semibold border transition-all
                ${isSelected
                  ? `${accent.selected} border-opacity-100`
                  : hasRecord
                    ? `text-slate-200 border-slate-700 ${accent.hover} cursor-pointer`
                    : 'text-slate-700 border-transparent cursor-default'
                }
              `}
            >
              <span>{day.getDate()}</span>
              {hasRecord && (
                <span className={`absolute bottom-1 w-1 h-1 rounded-full ${isSelected ? 'bg-white' : accent.dot}`} />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── Main Modal ─────────────────────────────────────────────────────────────
export default function HistoryModal({ isOpen, onClose }: HistoryModalProps) {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<'scan' | 'backtest'>('scan');
  const [scanRecords, setScanRecords] = useState<any[]>([]);
  const [backtestRecords, setBacktestRecords] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Date filter state
  const [selectedDates, setSelectedDates] = useState<Set<string>>(new Set());
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);

  useEffect(() => {
    if (isOpen && user) {
      fetchRecords();
    }
    // Reset selection when modal closes
    if (!isOpen) {
      setSelectedDates(new Set());
      setDeleteConfirm(false);
    }
  }, [isOpen, user]);

  // Also reset selection when tab changes
  useEffect(() => {
    setSelectedDates(new Set());
    setDeleteConfirm(false);
  }, [activeTab]);

  const fetchRecords = async () => {
    console.log('[HistoryModal] Fetching records for user:', user?.uid);
    setLoading(true);
    setError(null);
    try {
      if (user) {
         const scans = await getScanRecords(user.uid);
         const backtests = await getBacktestRecords(user.uid);
         console.log('[HistoryModal] Fetched scans:', scans.length, 'backtests:', backtests.length);
         setScanRecords(scans);
         setBacktestRecords(backtests);
      } else {
         console.warn('[HistoryModal] No user found for fetching records');
      }
    } catch (e: any) {
      console.error('[HistoryModal] Fetch error:', e);
      setError(e.message || "讀取歷史紀錄失敗，請檢查網路連線或 Firebase 權限。");
    } finally {
      setLoading(false);
    }
  };

  // Compute set of dates that have scan records
  const scanRecordDates = useMemo<Set<string>>(() => {
    const s = new Set<string>();
    scanRecords.forEach(r => {
      if (r.createdAt?.seconds) {
        s.add(format(new Date(r.createdAt.seconds * 1000), 'yyyy-MM-dd'));
      }
    });
    return s;
  }, [scanRecords]);

  // Filtered scan records based on selection
  const filteredScanRecords = useMemo(() => {
    if (selectedDates.size === 0) return scanRecords;
    return scanRecords.filter(r => {
      if (!r.createdAt?.seconds) return false;
      const d = format(new Date(r.createdAt.seconds * 1000), 'yyyy-MM-dd');
      return selectedDates.has(d);
    });
  }, [scanRecords, selectedDates]);

  const toggleDate = useCallback((date: string) => {
    setSelectedDates(prev => {
      const next = new Set(prev);
      if (next.has(date)) {
        next.delete(date);
      } else {
        next.add(date);
      }
      return next;
    });
    setDeleteConfirm(false);
  }, []);

  const selectAll = useCallback(() => {
    setSelectedDates(new Set(scanRecordDates));
    setDeleteConfirm(false);
  }, [scanRecordDates]);

  const clearSelection = useCallback(() => {
    setSelectedDates(new Set());
    setDeleteConfirm(false);
  }, []);

  const handleDelete = async () => {
    if (!user || selectedDates.size === 0) return;

    // Collect IDs of records matching selected dates
    const idsToDelete = scanRecords
      .filter(r => {
        if (!r.createdAt?.seconds) return false;
        const d = format(new Date(r.createdAt.seconds * 1000), 'yyyy-MM-dd');
        return selectedDates.has(d);
      })
      .map(r => r.id);

    if (idsToDelete.length === 0) return;

    setIsDeleting(true);
    try {
      await deleteScanRecordsByIds(user.uid, idsToDelete);
      setSelectedDates(new Set());
      setDeleteConfirm(false);
      await fetchRecords(); // refresh
    } catch (e: any) {
      setError(e.message || '刪除失敗');
    } finally {
      setIsDeleting(false);
    }
  };

  if (!isOpen) return null;

  const sortedBacktests = [...backtestRecords].sort((a, b) => {
    const aVal = a.summary?.totalReturn ?? -999;
    const bVal = b.summary?.totalReturn ?? -999;
    return bVal - aVal;
  });

  const allDatesSelected = scanRecordDates.size > 0 && selectedDates.size === scanRecordDates.size;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />
      
      {/* Modal */}
      <div className="relative w-full max-w-4xl max-h-[90vh] bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl flex flex-col overflow-hidden">
        
        {/* Header */}
        <div className="flex flex-col sm:flex-row items-center justify-between p-4 border-b border-slate-800/80 gap-4">
          <div className="flex items-center gap-4">
            <div className="flex gap-2">
              <button
                 onClick={() => setActiveTab('scan')}
                 className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                   activeTab === 'scan' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:bg-slate-800'
                 }`}
              >
                <Clock className="w-4 h-4" />
                掃描紀錄
              </button>
              <button
                 onClick={() => setActiveTab('backtest')}
                 className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                   activeTab === 'backtest' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:bg-slate-800'
                 }`}
              >
                <BarChart2 className="w-4 h-4" />
                回測數據
              </button>
            </div>
            
            <button 
              onClick={fetchRecords} 
              disabled={loading}
              className="p-2 text-slate-400 hover:text-blue-400 disabled:opacity-30 transition-colors"
              title="重新整理數據"
            >
              <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>

          <div className="flex items-center gap-4 w-full sm:w-auto justify-end">
            <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-950 border-2 border-blue-500/50 rounded-lg shadow-[0_0_15px_rgba(59,130,246,0.3)]">
              <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-[11px] text-slate-400 font-mono uppercase tracking-wider">UID:</span>
              <span className="text-[11px] text-blue-400 font-mono font-bold tracking-tight">{user?.uid ? `${user.uid.slice(0, 12)}...` : '未偵測到'}</span>
            </div>
            <button 
               onClick={onClose}
               className="p-2 bg-slate-800 hover:bg-slate-700 rounded-full text-slate-400 hover:text-white transition-all hover:rotate-90 duration-300"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 min-h-[50vh]">
          {error && (
            <div className="bg-red-500/10 border border-red-500/50 text-red-400 p-4 rounded-xl text-sm mb-4">
              <p className="font-bold mb-1">發生錯誤：</p>
              <p className="break-all">{error}</p>
              {error.includes("index") && (
                <p className="mt-2 text-xs text-slate-400">
                  提示：這通常是因為 Firestore 需要建立索引。請點擊上方顯示的連結（如果有）前往 Firebase 控制台。
                </p>
              )}
            </div>
          )}
          {loading ? (
            <div className="flex justify-center items-center h-full">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
            </div>
          ) : activeTab === 'scan' ? (
            <div className="space-y-4">
              {/* ── Date Calendar Picker ── */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-bold text-slate-300">
                    選擇日期篩選
                    {selectedDates.size > 0 && (
                      <span className="ml-2 px-2 py-0.5 rounded-full bg-blue-600/30 text-blue-400 text-xs">
                        已選 {selectedDates.size} 天
                      </span>
                    )}
                  </span>
                  <div className="flex gap-2">
                    <button
                      onClick={allDatesSelected ? clearSelection : selectAll}
                      disabled={scanRecordDates.size === 0}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border border-blue-500/40 text-blue-400 hover:bg-blue-600/20 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      {allDatesSelected
                        ? <><Square className="w-3.5 h-3.5" /> 清空選擇</>
                        : <><CheckSquare className="w-3.5 h-3.5" /> 全選</>
                      }
                    </button>
                    {selectedDates.size > 0 && (
                      <button
                        onClick={clearSelection}
                        className="px-3 py-1.5 rounded-lg text-xs font-bold border border-slate-700 text-slate-400 hover:bg-slate-800 transition-colors"
                      >
                        清空
                      </button>
                    )}
                  </div>
                </div>

                <MiniCalendar
                  recordDates={scanRecordDates}
                  selectedDates={selectedDates}
                  onToggleDate={toggleDate}
                  accentColor="blue"
                />

                {/* Action Bar */}
                {selectedDates.size > 0 && (
                  <div className="flex gap-3 p-3 bg-slate-950 border border-slate-800 rounded-xl">
                    <div className="flex-1 text-sm text-slate-400">
                      已選取 <span className="text-white font-bold">{selectedDates.size}</span> 個日期，
                      共 <span className="text-white font-bold">{filteredScanRecords.length}</span> 筆紀錄
                    </div>
                    <button
                      onClick={() => { setSelectedDates(new Set(selectedDates)); }}
                      className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-blue-600/20 border border-blue-500/40 text-blue-400 text-sm font-bold hover:bg-blue-600/30 transition-colors"
                    >
                      <Eye className="w-4 h-4" />
                      顯示篩選
                    </button>
                    {!deleteConfirm ? (
                      <button
                        onClick={() => setDeleteConfirm(true)}
                        className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-red-600/20 border border-red-500/40 text-red-400 text-sm font-bold hover:bg-red-600/30 transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                        刪除
                      </button>
                    ) : (
                      <div className="flex gap-2 items-center">
                        <span className="text-xs text-red-400 font-bold">確認刪除？</span>
                        <button
                          onClick={handleDelete}
                          disabled={isDeleting}
                          className="px-3 py-1.5 rounded-lg bg-red-600 text-white text-sm font-bold hover:bg-red-500 transition-colors disabled:opacity-50"
                        >
                          {isDeleting ? '刪除中...' : '確認'}
                        </button>
                        <button
                          onClick={() => setDeleteConfirm(false)}
                          className="px-3 py-1.5 rounded-lg bg-slate-700 text-slate-300 text-sm font-bold hover:bg-slate-600 transition-colors"
                        >
                          取消
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Record List */}
              {filteredScanRecords.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {filteredScanRecords.map(record => (
                    <div key={record.id} className="bg-slate-950 p-4 rounded-xl border border-slate-800">
                      <div className="text-xs text-slate-400 mb-2">
                         {record.createdAt?.seconds ? format(new Date(record.createdAt.seconds * 1000), 'yyyy/MM/dd HH:mm:ss') : 'N/A'}
                      </div>
                      <div className="text-sm text-slate-300 font-medium mb-2 break-all line-clamp-2">
                         條件: {record.conditionDesc}
                      </div>
                      <div className="text-slate-500 text-xs">
                         掃描出 {record.data?.length || 0} 檔股票
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center text-slate-500 mt-10">
                  {selectedDates.size > 0 ? '所選日期無掃描紀錄' : '尚無掃描紀錄'}
                </div>
              )}
            </div>
          ) : (
             backtestRecords.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {sortedBacktests.map(record => (
                    <div key={record.id} className="bg-slate-950 p-4 rounded-xl border border-slate-800">
                      <div className="text-xs text-slate-400 mb-2">
                        掃描基準日: {record.backtestDetails?.fromDate || '未知'} (紀錄建立: {record.createdAt?.seconds ? format(new Date(record.createdAt.seconds * 1000), 'yyyy/MM/dd HH:mm') : 'N/A'})
                      </div>
                      <div className="text-sm font-bold text-white mb-1">
                         {record.targetStockId} 
                      </div>
                      {record.backtestDetails?.message === '當日無歷史數據' ? (
                          <div className="text-slate-500 text-sm mt-3 text-center py-2 bg-white/5 rounded-lg border border-slate-800">當日無歷史數據</div>
                      ) : (
                        <>
                          <div className="flex gap-4 mt-3 pb-3 border-b border-slate-800">
                             <div className="text-center">
                                <div className="text-slate-500 text-xs">總交易</div>
                                <div className="text-white text-sm font-semibold">{record.summary?.totalTrades}</div>
                             </div>
                             <div className="text-center">
                                <div className="text-slate-500 text-xs">勝率</div>
                                <div className="text-white text-sm font-semibold">{(record.summary?.winRate * 100).toFixed(1)}%</div>
                             </div>
                             <div className="text-center">
                                <div className="text-amber-500 text-xs font-bold">總報酬 (達標%)</div>
                                <div className={`text-sm font-semibold ${record.summary?.totalReturn > 0 ? 'text-red-400' : 'text-green-400'}`}>
                                   {record.summary?.totalReturn.toFixed(2)}%
                                </div>
                             </div>
                          </div>
                          <div className="mt-3 text-xs text-slate-400">
                              <div className="mb-2 font-semibold text-white bg-slate-900 border border-slate-800 px-3 py-1.5 rounded-lg">
                                系統達標總計: <span className="text-amber-400">{record.backtestDetails?.hitRecords?.length || 0}</span> 次
                              </div>
                              {record.backtestDetails?.hitRecords?.length > 0 && (
                                <div className="space-y-1 bg-slate-900/50 border border-slate-800 p-3 rounded-lg max-h-32 overflow-y-auto custom-scrollbar">
                                  {record.backtestDetails.hitRecords.map((hit: any, i: number) => (
                                    <div key={i} className="flex justify-between border-b border-slate-800/50 pb-1.5 pt-1.5 first:pt-0 last:border-0 last:pb-0">
                                      <span className="text-slate-300">{i + 1}. {hit.date}</span>
                                      <span className="text-amber-400 font-medium">最高價: ${hit.high}</span>
                                    </div>
                                  ))}
                                </div>
                              )}
                          </div>
                        </>
                      )}
                    </div>
                  ))}
                </div>
             ) : (
                <div className="text-center text-slate-500 mt-10">尚無回測紀錄</div>
             )
          )}
        </div>
      </div>
    </div>
  );
}
