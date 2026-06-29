import React, { useState, useMemo } from 'react';
import { X, ChevronLeft, ChevronRight, CheckSquare, Square } from 'lucide-react';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, getDay, addMonths, subMonths } from 'date-fns';
import { clsx } from 'clsx';

interface ShortTermCalendarModalProps {
  isOpen: boolean;
  onClose: () => void;
  recordDates: Set<string>;
  selectedDates: Set<string>;
  onToggleDate: (date: string) => void;
  onClearAll: () => void;
}

export default function ShortTermCalendarModal({
  isOpen,
  onClose,
  recordDates,
  selectedDates,
  onToggleDate,
  onClearAll
}: ShortTermCalendarModalProps) {
  const [viewMonth, setViewMonth] = useState(() => new Date());

  const days = useMemo(() => {
    const start = startOfMonth(viewMonth);
    const end = endOfMonth(viewMonth);
    return eachDayOfInterval({ start, end });
  }, [viewMonth]);

  const leadingBlanks = getDay(startOfMonth(viewMonth)); // 0=Sun

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
      <div 
        className="absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />
      <div className="relative w-full max-w-sm bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl flex flex-col overflow-hidden animate-in fade-in zoom-in duration-300">
        <div className="flex items-center justify-between p-4 border-b border-slate-800/80">
          <h2 className="text-lg font-black text-orange-400">📅 選擇歷史日期</h2>
          <button 
             onClick={onClose}
             className="p-2 bg-slate-800 hover:bg-slate-700 rounded-full text-slate-400 hover:text-white transition-all hover:rotate-90 duration-300"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-5">
          <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4 mb-4">
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
            <div className="grid grid-cols-7 mb-1">
              {['日','一','二','三','四','五','六'].map(d => (
                <div key={d} className="text-center text-[10px] font-bold text-slate-500 py-1">{d}</div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-1">
              {Array.from({ length: leadingBlanks }).map((_, i) => (
                <div key={`blank-${i}`} />
              ))}
              {days.map(day => {
                const dateStr = format(day, 'yyyy-MM-dd');
                const hasRecord = recordDates.has(dateStr);
                const isSelected = selectedDates.has(dateStr);

                return (
                  <button
                    key={dateStr}
                    onClick={() => hasRecord && onToggleDate(dateStr)}
                    disabled={!hasRecord}
                    className={clsx(
                      "relative flex flex-col items-center justify-center h-9 w-full rounded-lg text-xs font-semibold border transition-all",
                      isSelected
                        ? "bg-orange-500 text-white border-orange-500"
                        : hasRecord
                          ? "text-slate-200 border-slate-700 hover:bg-orange-500/20 hover:border-orange-500/50 cursor-pointer"
                          : "text-slate-700 border-transparent cursor-default"
                    )}
                  >
                    <span>{day.getDate()}</span>
                    {hasRecord && (
                      <span className={clsx("absolute bottom-1 w-1 h-1 rounded-full", isSelected ? "bg-white" : "bg-orange-400")} />
                    )}
                  </button>
                );
              })}
            </div>
          </div>
          
          <div className="flex gap-2">
            <button
              onClick={onClearAll}
              disabled={selectedDates.size === 0}
              className="flex-1 py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            >
              <Square className="w-4 h-4" /> 清除全選
            </button>
            <button
              onClick={onClose}
              className="flex-1 py-3 rounded-xl bg-orange-600 hover:bg-orange-500 text-white font-black transition-colors"
            >
              確認選擇
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
