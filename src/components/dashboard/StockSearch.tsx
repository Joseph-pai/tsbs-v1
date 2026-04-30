import React, { useState, useEffect, useRef } from 'react';
import { Search, Loader2, Sparkles } from 'lucide-react';
import { clsx } from 'clsx';
import { StockData } from '@/types';

interface StockSearchProps {
    snapshot: StockData[];
    onSearch: (stockId: string, stockName: string) => void;
    isWorking: boolean;
}

export const StockSearch: React.FC<StockSearchProps> = ({ snapshot, onSearch, isWorking }) => {
    const [searchTerm, setSearchTerm] = useState('');
    const [isOpen, setIsOpen] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);

    const suggestions = React.useMemo(() => {
        if (!searchTerm.trim() || searchTerm.length < 1) return [];
        const term = searchTerm.toLowerCase();
        // Always show suggestions if data exists, or fallback to try-parse stock ID
        if (snapshot && snapshot.length > 0) {
            return snapshot
                .filter(s => s.stock_id.includes(term) || s.stock_name.toLowerCase().includes(term))
                .slice(0, 10);
        }
        // Fallback: allow direct stock ID entry even without snapshot
        if (/^\d{4}$/.test(term)) {
            return [{ stock_id: term, stock_name: '(輸入代碼)', date: '', close: 0, open: 0, max: 0, min: 0, Trading_Volume: 0, Trading_money: 0, spread: 0, Trading_turnover: 0 }];
        }
        return [];
    }, [searchTerm, snapshot]);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleSelect = (stock: StockData) => {
        setSearchTerm(`${stock.stock_id} ${stock.stock_name}`);
        setIsOpen(false);
    };

    const handleTrigger = () => {
        if (!searchTerm.trim()) return;
        // 取第一個 token 作為純代號（支援直接輸入代號或從下拉選單選取「代號 名稱」格式）
        const stockId = searchTerm.trim().split(/\s+/)[0];
        // 從 snapshot 找到對應的股票名稱，若找不到則用空字串（API 會自行解析）
        const matched = snapshot?.find(s => s.stock_id === stockId);
        const stockName = matched?.stock_name || '';
        onSearch(stockId, stockName);
        setIsOpen(false);
    };

    return (
        <div className="relative w-full group space-y-4" ref={dropdownRef}>
            <div className="flex gap-4">
                <div className="relative flex-1 group shadow-2xl">
                    <Search className="absolute left-8 top-1/2 -translate-y-1/2 w-8 h-8 text-slate-500 group-focus-within:text-blue-400 transition-colors" />
                    <input
                        type="text"
                        placeholder="輸入股票代碼或名稱..."
                        value={searchTerm}
                        onChange={(e) => {
                            setSearchTerm(e.target.value);
                            setIsOpen(true);
                        }}
                        onFocus={() => setIsOpen(true)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') handleTrigger();
                        }}
                        className="w-full bg-slate-900 border-4 border-slate-800 rounded-[2.5rem] py-8 pl-20 pr-10 text-3xl font-black focus:border-blue-500 outline-none transition-all placeholder:text-slate-600 text-white"
                    />

                    {/* Autocomplete Dropdown */}
                    {isOpen && suggestions.length > 0 && (
                        <div className="absolute z-50 left-0 right-0 mt-4 bg-slate-900 border-2 border-slate-800 rounded-[2rem] shadow-2xl overflow-hidden backdrop-blur-xl animate-in fade-in slide-in-from-top-4 duration-200">
                            {suggestions.map((s) => (
                                <div
                                    key={s.stock_id}
                                    onClick={() => handleSelect(s)}
                                    className="px-8 py-6 hover:bg-white/5 cursor-pointer border-b border-white/5 last:border-0 flex justify-between items-center group/item transition-colors"
                                >
                                    <div className="flex items-center gap-4">
                                        <span className="text-2xl font-black text-blue-400 font-mono tracking-tighter">
                                            {s.stock_id}
                                        </span>
                                        <span className="text-2xl font-black text-white group-hover/item:text-blue-200 transition-colors">
                                            {s.stock_name}
                                        </span>
                                    </div>
                                    <span className="text-sm font-black text-slate-500 uppercase tracking-widest opacity-0 group-hover/item:opacity-100 transition-opacity">
                                        選擇
                                    </span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Signals Button */}
                <button
                    onClick={handleTrigger}
                    disabled={isWorking || !searchTerm.trim()}
                    className={clsx(
                        "px-10 rounded-[2.5rem] border-4 transition-all active:scale-[0.95] flex items-center gap-4 group shadow-xl",
                        isWorking || !searchTerm.trim()
                            ? "bg-slate-900 border-slate-800 text-slate-600 cursor-not-allowed"
                            : "bg-gradient-to-br from-amber-600 to-amber-400 border-amber-300 text-white shadow-amber-500/20 hover:scale-[1.02] hover:shadow-amber-500/40"
                    )}
                >
                    {isWorking ? (
                        <Loader2 className="w-8 h-8 animate-spin" />
                    ) : (
                        <Sparkles className="w-8 h-8 group-hover:rotate-12 transition-transform" />
                    )}
                    <span className="text-2xl font-black whitespace-nowrap">共振掃描</span>
                </button>
            </div>
        </div>
    );
};
