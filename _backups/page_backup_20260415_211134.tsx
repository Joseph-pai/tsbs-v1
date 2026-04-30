'use client';

import { StockCard } from '@/components/dashboard/StockCard';
import { AnalysisResult, StockData, HistorySession } from '@/types';
import { SECTORS, MarketType, MARKET_NAMES } from '@/lib/sectors';
import { StockSearch } from '@/components/dashboard/StockSearch';
import { Search, TrendingUp, Sparkles, Filter, Loader2, Flame, Settings, Target, BarChart3, Info, BookOpen, X, HelpCircle, AlertTriangle, History, Trash2, Calendar } from 'lucide-react';
import { useState, useMemo, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { clsx } from 'clsx';

type ScanStage = 'idle' | 'fetching' | 'filtering' | 'analyzing' | 'complete';

interface ScanSettings {
  volumeRatio: number;
  maConstrict: number;
  breakoutPercent: number;
}

const DEFAULT_SETTINGS: ScanSettings = {
  volumeRatio: 3.5, // 同步後端預設基準
  maConstrict: 2.0,
  breakoutPercent: 3.0
};

export default function DashboardPage() {
  const router = useRouter();
  const [stage, setStage] = useState<ScanStage>('idle');
  const [results, setResults] = useState<AnalysisResult[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [timing, setTiming] = useState<any>(null);
  const [progress, setProgress] = useState({ current: 0, total: 0, phase: '' });
  const [settings, setSettings] = useState<ScanSettings>(DEFAULT_SETTINGS);
  const [showSettings, setShowSettings] = useState(false);
  const [hasScanned, setHasScanned] = useState(false);
  const [isAnalyzingSingle, setIsAnalyzingSingle] = useState(false); // 新增單股分析狀態
  const [showManual, setShowManual] = useState(false); // 新增使用說明狀態
  const [showHistory, setShowHistory] = useState(false); // 新增歷史紀錄狀態
  const [historyRecords, setHistoryRecords] = useState<HistorySession[]>([]);
  const [selectedStocks, setSelectedStocks] = useState<Record<string, string[]>>({});

  // 0. Load history from localStorage
  useEffect(() => {
    const savedHistory = localStorage.getItem('tsbs_scan_history');
    if (savedHistory) {
      try {
        setHistoryRecords(JSON.parse(savedHistory));
      } catch (e) {
        console.error('Failed to load scan history:', e);
      }
    }
  }, []);

  const [market, setMarket] = useState<MarketType>('TWSE');
  const [sector, setSector] = useState<string>('ALL');
  const [industryMap, setIndustryMap] = useState<Record<string, string>>({});
  const [snapshot, setSnapshot] = useState<StockData[]>([]);

  // 1. Core State Persistence (Session-based)
  useEffect(() => {
    const saved = sessionStorage.getItem('tsbs_scanner_state');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        setResults(parsed.results || []);
        setSettings(parsed.settings || DEFAULT_SETTINGS);
        setMarket(parsed.market || 'TWSE');
        setSector(parsed.sector || (parsed.market === 'TWSE' ? 'ALL' : 'AL'));
        setHasScanned(parsed.hasScanned || false);
        setTiming(parsed.timing || null);
      } catch (e) {
        console.error('Failed to load session state:', e);
      }
    }
  }, []);

  useEffect(() => {
    sessionStorage.setItem('tsbs_scanner_state', JSON.stringify({
      results, settings, market, sector, hasScanned, timing
    }));
  }, [results, settings, market, sector, hasScanned, timing]);

  // 2. Heavy Market Data Caching (Session-based)
  useEffect(() => {
    const init = async () => {
      try {
        const needsRefresh = sessionStorage.getItem('tsm_force_refresh') === 'true';

        // Check if industry map is cached
        const cachedMap = sessionStorage.getItem('tsbs_industry_map');
        if (cachedMap && !needsRefresh) {
          setIndustryMap(JSON.parse(cachedMap));
        } else {
          const mappingRes = await fetch(`/api/market/industry-mapping${needsRefresh ? '?refresh=true' : ''}`);
          const mappingJson = await mappingRes.json();
          if (mappingJson.success) {
            setIndustryMap(mappingJson.data);
            sessionStorage.setItem('tsbs_industry_map', JSON.stringify(mappingJson.data));
          }
        }

        // Check if initial snapshot is cached
        const cacheKey = `tsbs_snapshot_${market}_${sector}`;
        const cachedSnapshot = sessionStorage.getItem(cacheKey);
        if (cachedSnapshot && !needsRefresh) {
          setSnapshot(JSON.parse(cachedSnapshot));
        } else {
          const snapshotRes = await fetch(`/api/market/snapshot?market=${market}&sector=${sector}${needsRefresh ? '&refresh=true' : ''}`);
          const snapshotJson = await snapshotRes.json();
          if (snapshotJson.success) {
            setSnapshot(snapshotJson.data);
            sessionStorage.setItem(cacheKey, JSON.stringify(snapshotJson.data));
          }
        }

        if (needsRefresh) {
          sessionStorage.removeItem('tsm_force_refresh');
        }
      } catch (e) {
        console.error('Data initialization failed:', e);
      }
    };
    init();
  }, [market, sector]);

  const clearAllCache = () => {
    sessionStorage.clear();
    sessionStorage.setItem('tsm_force_refresh', 'true');
    window.location.reload();
  };

  // Reset sector when market changes
  useEffect(() => {
    setSector(market === 'TWSE' ? 'ALL' : 'AL');
  }, [market]);

  const currentSectorName = useMemo(() => {
    return SECTORS[market].find(s => s.id === sector)?.name || '該類股';
  }, [market, sector]);

  // Independent single-stock analysis for "三大信號" button
  const runSingleStockAnalysis = async (stockId: string) => {
    setIsAnalyzingSingle(true);
    setError(null);
    setResults([]);
    const t0 = Date.now();

    try {
      setProgress({ current: 0, total: 0, phase: `正在分析股票 ${stockId}...` });

      // Fetch single stock analysis
      const batchRes = await fetch('/api/scan/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          stocks: [{ id: stockId, name: stockId }],
          settings: settings
        })
      });

      const batchJson = await batchRes.json();
      if (!batchJson.success) throw new Error(batchJson.error || '分析失敗');

      const singleResult = batchJson.data && batchJson.data[0];
      if (!singleResult) {
        throw new Error(`找不到股票 ${stockId} 的數據`);
      }

      // Use sector_name from API directly
      const resolvedSector = singleResult.sector_name || (market === 'TWSE' ? '上市板' : '上櫃板');

      console.debug(`[StockAnalysis] Stock ${singleResult.stock_id}: API sector="${singleResult.sector_name}", final="${resolvedSector}"`);

      const augmentedResult = {
        ...singleResult,
        sector_name: resolvedSector
      };

      setResults([augmentedResult]);
      const t_end = Date.now();
      setTiming({
        snapshot: 0,
        analyze: t_end - t0,
        total: t_end - t0,
        candidatesCount: 1,
        totalStocks: 1
      });
      setHasScanned(true);
      setStage('complete');
      setTimeout(() => setStage('idle'), 3000);

    } catch (e: any) {
      console.error(e);
      setError(e.message);
      setStage('idle');
    }
  };

  const runScan = async (overrideTerm?: string, forceRefresh?: boolean) => {
    const activeTerm = overrideTerm || searchTerm;
    setStage('fetching');
    setHasScanned(false);
    setError(null);
    setResults([]);
    const t0 = Date.now();

    try {
      // Phase 1: Directed Fetch
      setProgress({ current: 0, total: 0, phase: `正在獲取 ${MARKET_NAMES[market]} - ${currentSectorName} 數據...` });

      const snapshotRes = await fetch(`/api/market/snapshot?market=${market}&sector=${sector}${forceRefresh ? '&refresh=true' : ''}`);
      const snapshotJson = await snapshotRes.json();
      if (!snapshotJson.success) throw new Error(snapshotJson.error);

      const snapshot: StockData[] = snapshotJson.data;
      setSnapshot(snapshot);
      const t1 = Date.now();

      // Phase 2: Candidate Filtering
      if (snapshot.length === 0) {
        throw new Error("沒找到任何股票，請確認市場與類股選擇是否正確。");
      }

      setStage('filtering');
      setProgress({ current: 0, total: snapshot.length, phase: '正在篩選潛力候選股...' });

      // Match exact stock ID for targeted analysis
      const targetTerm = activeTerm.trim();
      const isSearchId = targetTerm.length === 4 && !isNaN(parseInt(targetTerm));

      const candidates = snapshot
        .filter(s => {
          const isTarget = isSearchId && s.stock_id === targetTerm;
          // Pre-filter: Focus on stocks with volume and not crashing (spread >= 0)
          const isPotential = s.Trading_Volume > 0 && s.spread >= -0.1;
          return isTarget || isPotential;
        })
        .sort((a, b) => {
          const aIsTarget = isSearchId && a.stock_id === targetTerm;
          const bIsTarget = isSearchId && b.stock_id === targetTerm;
          if (aIsTarget && !bIsTarget) return -1;
          if (!aIsTarget && bIsTarget) return 1;
          return b.Trading_Volume - a.Trading_Volume;
        })
        .slice(0, 200); // Reduce ceiling to 200 for 3x faster scan

      // Phase 3: Batched Resonance Analysis
      setStage('analyzing');
      const BATCH_SIZE = 25; // Increase batch size for better throughput
      const allResults: AnalysisResult[] = [];

      for (let i = 0; i < candidates.length; i += BATCH_SIZE) {
        const batch = candidates.slice(i, i + BATCH_SIZE);
        setProgress({
          current: i + batch.length,
          total: candidates.length,
          phase: `指標數據分析中 (${i + batch.length}/${candidates.length})`
        });

        const batchRes = await fetch('/api/scan/analyze', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            stocks: batch.map(c => ({ id: c.stock_id, name: c.stock_name })),
            settings: settings
          })
        });

        const batchJson = await batchRes.json();
        if (batchJson.success && batchJson.data) {
          const augmented = batchJson.data.map((r: any) => {
            const resolvedSector = r.sector_name || (market === 'TWSE' ? '上市板' : '上櫃板');

            // Calculate Breakout Potential Score
            // Formula: (VolRatio * 0.4) + (PriceStrength * 0.4) + (SqueezeQuality * 0.2)
            const volScore = Math.min((r.volume_ratio / settings.volumeRatio) * 10, 15);
            const priceScore = Math.min(r.spread_percent * 2, 10);
            const squeezeScore = Math.max(10 - (r.ma_gap_percent * 2), 0);
            const potential_score = volScore + priceScore + squeezeScore;

            return {
              ...r,
              sector_name: resolvedSector,
              potential_score
            };
          });
          allResults.push(...augmented);
        }
      }

      const t_end = Date.now();
      // Only keep recommended stocks OR the specifically searched stock
      const filteredResults = allResults
        .filter(r => {
          const isTargetMatch = r.stock_id.includes(targetTerm) || r.stock_name.includes(targetTerm);
          return r.is_recommended || (targetTerm.length >= 2 && isTargetMatch);
        })
        .sort((a, b) => (b.potential_score || 0) - (a.potential_score || 0)); // Rank by potential breakout

      setResults(filteredResults);

      // Save to History (Auto-save)
      if (filteredResults.length > 0) {
        const newSession: HistorySession = {
          id: new Date().toISOString(),
          date: new Intl.DateTimeFormat('zh-TW', {
            month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit'
          }).format(new Date()),
          market,
          sector: currentSectorName,
          settings,
          results: filteredResults.map(r => ({
            ...r,
            // Capture specific values at scan time
            close: r.close,
            potential_score: r.potential_score
          }))
        };

        setHistoryRecords((prev: HistorySession[]) => {
          const updated = [newSession, ...prev].slice(0, 50); // Keep last 50 sessions
          localStorage.setItem('tsbs_scan_history', JSON.stringify(updated));
          return updated;
        });
      }

      setTiming({
        snapshot: t1 - t0,
        analyze: t_end - t1,
        total: t_end - t0,
        candidatesCount: candidates.length,
        totalStocks: snapshot.length
      });
      setHasScanned(true);
      setStage('complete');
      setTimeout(() => setStage('idle'), 3000);

    } catch (e: any) {
      console.error(e);
      setError(e.message);
      setStage('idle');
    }
  };

  const filteredResults = useMemo(() => {
    return results.filter(s =>
      s.stock_id.includes(searchTerm) || s.stock_name.includes(searchTerm)
    );
  }, [results, searchTerm]);

  const isWorking = stage !== 'idle' && stage !== 'complete';

  return (
    <div className="container mx-auto px-6 py-12 max-w-3xl">
      {/* Header */}
      <header className="mb-14 text-center">
        <div className="inline-flex items-center gap-3 px-6 py-2 rounded-full bg-blue-500/10 border-2 border-blue-500/30 mb-8 shadow-lg shadow-blue-500/10">
          <Sparkles className="w-6 h-6 text-blue-400" />
          <span className="text-lg font-black text-blue-400 uppercase tracking-widest">
            {results.length > 0 ? `發現 ${results.length} 支全信號共振股` : '定向定點掃描系統 v2.1'}
          </span>
        </div>
        <h1 className="text-6xl md:text-7xl font-black bg-gradient-to-br from-white via-white to-blue-500 bg-clip-text text-transparent mb-8 tracking-tighter">
          爆發信號定位器
        </h1>

        {/* 使用說明按鈕 */}
        <button
          onClick={() => setShowManual(true)}
          className="inline-flex items-center gap-2 px-5 py-2 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 hover:border-blue-500/50 transition-all text-blue-400 font-black mb-10 group"
        >
          <BookOpen className="w-5 h-5 group-hover:scale-110 transition-transform" />
          使用說明 & 勝率分析
        </button>

        <button
          onClick={() => setShowHistory(true)}
          className="inline-flex items-center gap-2 px-5 py-2 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 hover:border-blue-500/50 transition-all text-amber-400 font-black mb-10 ml-4 group"
        >
          <History className="w-5 h-5 group-hover:scale-110 transition-transform" />
          歷史紀錄
        </button>

        <p className="text-slate-400 text-2xl font-black max-w-2xl mx-auto leading-relaxed">
          量能激增・均線糾結・技術突破<br />
          <span className="text-white/60 text-lg font-medium">三大信號完美重疊，定位噴出奇點。</span>
        </p>
      </header>

      {/* Target Control Center */}
      <div className="bg-slate-900 border-2 border-slate-800 rounded-[3rem] p-10 mb-12 shadow-2xl space-y-8">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div className="space-y-4">
            <div className="flex items-center gap-2 mb-2">
              <Target className="w-5 h-5 text-blue-400" />
              <label className="text-xl font-black text-white">指定市場</label>
            </div>
            <div className="relative group">
              <select
                id="market-select"
                name="market"
                value={market}
                onChange={(e) => setMarket(e.target.value as MarketType)}
                className="w-full bg-slate-800 border-2 border-slate-700 rounded-2xl p-6 text-2xl font-black text-white focus:border-blue-500 outline-none transition-all appearance-none cursor-pointer shadow-xl"
              >
                <option value="TWSE">{MARKET_NAMES.TWSE}</option>
                <option value="TPEX">{MARKET_NAMES.TPEX}</option>
              </select>
              <div className="absolute right-6 top-1/2 -translate-y-1/2 pointer-events-none text-slate-500 text-xl">▼</div>
            </div>
          </div>

          <div className="space-y-4">
            <div className="flex items-center gap-2 mb-2">
              <BarChart3 className="w-5 h-5 text-amber-400" />
              <label className="text-xl font-black text-white">產業類型</label>
            </div>
            <div className="relative group">
              <select
                id="sector-select"
                name="sector"
                value={sector}
                onChange={(e) => setSector(e.target.value)}
                className="w-full bg-slate-800 border-2 border-slate-700 rounded-2xl p-6 text-2xl font-black text-white focus:border-blue-500 outline-none transition-all appearance-none cursor-pointer shadow-xl"
              >
                {SECTORS[market].map(s => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
              <div className="absolute right-6 top-1/2 -translate-y-1/2 pointer-events-none text-slate-500 text-xl">▼</div>
            </div>
          </div>
        </div>

        {/* Resonance Settings */}
        <div className="bg-black/20 rounded-[2.5rem] p-8 border border-white/5 space-y-8">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <Settings className="w-6 h-6 text-slate-500" />
              <span className="text-xl font-black text-slate-300">信號閾值配置</span>
            </div>
            <div className="flex items-center gap-4">
              <button
                onClick={clearAllCache}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-red-500/10 border border-red-500/30 text-sm font-black text-red-400 hover:bg-red-500/20 transition-all shadow-lg shadow-red-500/5 group"
                title="清除所有暫存並重新抓取"
              >
                <Loader2 className="w-4 h-4 group-hover:rotate-180 transition-transform duration-500" />
                全部數據更新
              </button>
              <button
                onClick={() => setSettings(DEFAULT_SETTINGS)}
                className="text-sm font-black text-blue-500 hover:text-blue-400 underline underline-offset-4"
              >
                恢復預設
              </button>
              <button
                onClick={() => setShowSettings(!showSettings)}
                className="px-4 py-2 rounded-xl bg-slate-800 border border-slate-700 text-sm font-black text-white hover:bg-slate-700 transition-colors"
              >
                {showSettings ? '隱藏配置' : '展開配置'}
              </button>
            </div>
          </div>

          {showSettings && (
            <div className="grid grid-cols-1 gap-12 animate-in fade-in slide-in-from-top-4 duration-300">
              {/* 1. Volume */}
              <div className="space-y-5">
                <div className="flex justify-between items-center">
                  <div className="flex flex-col">
                    <span className="text-lg font-black text-slate-300">❶ 量能激增倍數 (V-Ratio)</span>
                    <span className="text-xs font-bold text-slate-500">▶ 數值越高條件越嚴苛</span>
                  </div>
                  <span className="text-4xl font-black text-amber-400 font-mono">{settings.volumeRatio}x</span>
                </div>
                <input
                  id="volume-ratio-range"
                  name="volumeRatio"
                  type="range" min="1.0" max="6.0" step="0.5"
                  value={settings.volumeRatio}
                  onChange={(e) => setSettings({ ...settings, volumeRatio: parseFloat(e.target.value) })}
                  className="w-full h-4 bg-slate-800 rounded-full appearance-none cursor-pointer accent-amber-500"
                />
              </div>

              {/* 2. Squeeze */}
              <div className="space-y-5">
                <div className="flex justify-between items-center">
                  <div className="flex flex-col">
                    <span className="text-lg font-black text-slate-300">❷ 均線糾結度 (MA Gap)</span>
                    <span className="text-xs font-bold text-slate-500">▶ % 越低代表壓縮越緊，條件越 [極度嚴苛]</span>
                  </div>
                  <span className="text-4xl font-black text-purple-400 font-mono">{settings.maConstrict}%</span>
                </div>
                <input
                  id="ma-constrict-range"
                  name="maConstrict"
                  type="range" min="0.5" max="5.0" step="0.5"
                  value={settings.maConstrict}
                  onChange={(e) => setSettings({ ...settings, maConstrict: parseFloat(e.target.value) })}
                  className="w-full h-4 bg-slate-800 rounded-full appearance-none cursor-pointer accent-purple-500"
                />
              </div>

              {/* 3. Breakout */}
              <div className="space-y-5">
                <div className="flex justify-between items-center">
                  <div className="flex flex-col">
                    <span className="text-lg font-black text-slate-300">❸ 指標突破幅度 (今日漲幅)</span>
                    <span className="text-xs font-bold text-slate-500">▶ 數值越高條件越嚴苛</span>
                  </div>
                  <span className="text-4xl font-black text-emerald-400 font-mono">{settings.breakoutPercent}%</span>
                </div>
                <input
                  id="breakout-percent-range"
                  name="breakoutPercent"
                  type="range" min="1.0" max="8.0" step="0.5"
                  value={settings.breakoutPercent}
                  onChange={(e) => setSettings({ ...settings, breakoutPercent: parseFloat(e.target.value) })}
                  className="w-full h-4 bg-slate-800 rounded-full appearance-none cursor-pointer accent-emerald-500"
                />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Execute Button */}
      <button
        onClick={() => runScan()}
        disabled={isWorking}
        className={clsx(
          "w-full flex flex-col items-center justify-center p-10 rounded-[3rem] border-4 transition-all active:scale-[0.98] mb-12 group shadow-2xl relative overflow-hidden",
          isWorking
            ? "bg-slate-900 border-slate-800 cursor-not-allowed"
            : "bg-gradient-to-r from-blue-700 to-blue-500 border-blue-400 text-white shadow-blue-500/40 hover:scale-[1.02]"
        )}
      >
        {isWorking ? <Loader2 className="w-12 h-12 animate-spin mb-3" /> : <Flame className="w-12 h-12 mb-3 group-hover:scale-125 transition-transform" />}
        <span className="text-3xl font-black uppercase tracking-widest">啟動定點共振掃描</span>
        <span className="text-lg font-bold text-white/60 mt-3">
          已鎖定目標：{MARKET_NAMES[market]} - {currentSectorName}
        </span>
      </button>

      {/* Progress & Search (Integrated Panel) */}
      <div className="space-y-8 mb-12">
        {isWorking && (
          <div className="p-10 bg-slate-900 border-2 border-slate-800 rounded-[3rem] space-y-6 shadow-2xl">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-4 h-4 bg-blue-500 rounded-full animate-ping" />
                <span className="text-2xl font-black text-blue-400">{progress.phase}</span>
              </div>
              <span className="text-xl font-mono font-black text-slate-500 tracking-tighter">
                {Math.round((progress.current / progress.total) * 100 || 0)}%
              </span>
            </div>
            <div className="w-full bg-slate-800 rounded-full h-8 overflow-hidden border-2 border-white/5">
              <div
                className="h-full bg-gradient-to-r from-blue-600 via-purple-600 to-amber-500 transition-all duration-500 ease-out"
                style={{ width: progress.total > 0 ? `${(progress.current / progress.total) * 100}%` : '15%' }}
              />
            </div>
          </div>
        )}

        <StockSearch
          snapshot={snapshot}
          onSearch={(term) => {
            setSearchTerm(term);
            runSingleStockAnalysis(term);
          }}
          isWorking={isAnalyzingSingle} // 使用獨立的單股分析狀態
        />
      </div>

      {/* Results Container */}
      <div className="space-y-10">
        {error && (
          <div className="p-10 bg-rose-500/10 border-4 border-rose-500/20 rounded-[3rem] text-center">
            <p className="text-2xl font-black text-rose-400">{error}</p>
            <button onClick={() => runScan()} className="mt-4 text-rose-500 underline font-black">點擊重試</button>
          </div>
        )}

        {!hasScanned && !isWorking && !error ? (
          <div className="py-40 text-center border-4 border-dashed border-slate-900 rounded-[4rem] bg-slate-900/10 opacity-60">
            <TrendingUp className="w-24 h-24 text-slate-800 mx-auto mb-8" />
            <p className="text-3xl font-black text-slate-400">等待定點掃描任務</p>
            <p className="text-slate-600 text-xl font-black mt-4">請選定目標後按下啟動鈕</p>
          </div>
        ) : filteredResults.length === 0 && hasScanned && !isWorking ? (
          <div className="py-40 text-center border-4 border-dashed border-rose-900/30 rounded-[4rem] bg-rose-500/5 px-10">
            <div className="text-9xl mb-10">🔍</div>
            <p className="text-rose-400 font-black text-5xl mb-6 leading-tight">沒有找到符合條件的股票，請明天再試</p>
            <div className="max-w-md mx-auto space-y-6">
              <p className="text-slate-500 text-2xl font-black leading-relaxed">
                已深度分析 {timing?.candidatesCount} 支股票 (市場總量: {timing?.totalStocks} 支)，但在目前配置下未發現「完美共振」。
              </p>
              <div className="p-8 bg-blue-500/10 rounded-[2rem] border-2 border-blue-500/20 mt-8 text-left">
                <div className="flex items-center gap-3 mb-4">
                  <Info className="w-6 h-6 text-blue-400" />
                  <p className="text-blue-400 text-xl font-black">為什麼找不到？</p>
                </div>
                <ul className="text-slate-400 text-lg font-bold space-y-4">
                  <li>1. **均線糾結度**：當前設為 {settings.maConstrict}%，代表均線必須高度重疊。</li>
                  <li>2. **共振條件**：當前市場可能並無同時符合「{settings.volumeRatio}x 爆量」且「糾結」的股票。</li>
                  {settings.maConstrict <= 2.0 && (
                    <li className="text-blue-400 font-black mt-4">👉 建議：將「均線糾結度」調升至 3.0%~5.0% 試試看。</li>
                  )}
                </ul>
              </div>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-10 animate-in fade-in slide-in-from-bottom-8 duration-700">
            {filteredResults.map((stock, index) => (
              <div key={stock.stock_id} onClick={() => router.push(`/stock/${stock.stock_id}`)}>
                <StockCard data={stock} index={index + 1} />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Pro Timing Footer */}
      {timing && !isWorking && (
        <footer className="mt-20 pt-10 border-t border-white/5 flex flex-col items-center gap-6">
          <div className="flex flex-wrap justify-center gap-8 text-sm font-black font-mono text-slate-600 uppercase tracking-tighter">
            <span className="bg-slate-900 px-4 py-2 rounded-xl border border-white/5">SNAPSHOT: {timing.snapshot}MS</span>
            <span className="bg-slate-900 px-4 py-2 rounded-xl border border-white/5">DEEP_AI: {timing.analyze}MS</span>
            <span className="bg-slate-900 px-4 py-2 rounded-xl border border-white/5">SAMPLES: {timing.totalStocks}</span>
          </div>
          <div className="flex items-center gap-4 py-4 px-8 bg-blue-500/5 rounded-full border border-blue-500/10">
            <Sparkles className="w-5 h-5 text-blue-500" />
            <p className="text-slate-500 text-sm font-black tracking-widest uppercase">
              五維評分引擎 V8.2 | Joseph PAI @2026 | {new Date().toLocaleDateString()}
            </p>
          </div>
        </footer>
      )}

      {/* 使用說明 Modal */}
      {showManual && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6 sm:p-12">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/80 backdrop-blur-md"
            onClick={() => setShowManual(false)}
          />

          {/* Modal Content */}
          <div className="relative w-full max-w-2xl max-h-[85vh] overflow-y-auto bg-slate-900 border-2 border-slate-700 rounded-[3rem] p-10 shadow-2xl animate-in fade-in zoom-in duration-300">
            <button
              onClick={() => setShowManual(false)}
              className="absolute top-8 right-8 p-3 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors"
            >
              <X className="w-6 h-6" />
            </button>

            <div className="flex items-center gap-4 mb-8">
              <div className="p-4 rounded-2xl bg-blue-500/10 border border-blue-500/30">
                <BookOpen className="w-8 h-8 text-blue-400" />
              </div>
              <h2 className="text-4xl font-black text-white">使用說明 & 戰略引導</h2>
            </div>

            <div className="space-y-10">
              {/* 理論與實際 */}
              <section className="space-y-5">
                <div className="flex items-center gap-3 text-2xl font-black text-amber-400">
                  <TrendingUp className="w-6 h-6" />
                  <h3>勝率期望分析</h3>
                </div>
                <div className="bg-black/30 rounded-3xl p-8 border border-white/5 leading-relaxed">
                  <div className="space-y-4">
                    <p className="text-blue-400 font-bold mb-2">理論假設：</p>
                    <p className="text-white text-2xl font-black italic">信號出現 → 大概率飆漲</p>

                    <div className="mt-6 border-t border-white/10 pt-6">
                      <p className="text-slate-500 font-bold mb-4">實際統計概況：</p>
                      <ul className="space-y-4 text-xl font-black text-slate-300">
                        <li className="flex items-start gap-3">
                          <span className="text-emerald-400">✅</span>
                          <span>可能飆漲：30 - 40% 機率</span>
                        </li>
                        <li className="flex items-start gap-3">
                          <span className="text-amber-400">🟡</span>
                          <span>小漲後回落：40% 機率</span>
                        </li>
                        <li className="flex items-start gap-3">
                          <span className="text-rose-400">❌</span>
                          <span>假突破下跌：20 - 30% 機率</span>
                        </li>
                      </ul>
                    </div>
                  </div>
                </div>
              </section>

              {/* 使用策略 */}
              <section className="space-y-5">
                <div className="flex items-center gap-3 text-2xl font-black text-blue-400">
                  <HelpCircle className="w-6 h-6" />
                  <h3>💡 如何更好地使用這個 APP</h3>
                </div>
                <div className="grid gap-4">
                  {[
                    { title: "當作「雷達」而非「GPS」", desc: "它告訴你哪裡有動靜，但不代表目的地一定在那裡。" },
                    { title: "搭配多維度判斷", desc: "篩選出標的後，仍需手動診斷該股所屬產業趨勢與大盤環境。" },
                    { title: "嚴格執行停損", desc: "即使信號完美，一旦跌破關鍵支撐或進場價 5-8% 必須切斷風險。" },
                    { title: "分散佈局策略", desc: "切忌孤注一擲，應將資金分配在多支不同類別的信號共振股。" }
                  ].map((item, i) => (
                    <div key={i} className="flex gap-5 p-6 bg-slate-800/50 rounded-2xl border border-white/5">
                      <div className="flex-shrink-0 w-8 h-8 rounded-full bg-blue-500/20 text-blue-400 flex items-center justify-center font-black">
                        {i + 1}
                      </div>
                      <div>
                        <h4 className="text-xl font-black text-white mb-1">{item.title}</h4>
                        <p className="text-slate-400 font-medium">{item.desc}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              {/* 總結 */}
              <div className="p-8 bg-blue-500/10 rounded-[2.5rem] border-2 border-blue-500/20">
                <div className="flex items-center gap-3 mb-4">
                  <Info className="w-6 h-6 text-blue-400" />
                  <p className="text-blue-400 text-2xl font-black">核心總結</p>
                </div>
                <p className="text-slate-300 text-xl font-bold leading-relaxed">
                  這個 APP 是一個強大的<span className="text-white underline underline-offset-4 decoration-blue-500">「飆股候選篩選器」</span>，旨在極速縮小搜索範圍，提高選股效率。但在金融市場，信號不等於預測。
                </p>
                <div className="mt-6 flex items-center gap-2 p-3 bg-blue-500/20 rounded-xl border border-blue-500/30">
                  <span className="text-blue-400">✨</span>
                  <p className="text-blue-100 font-black">APP 的使命是：讓機率站在你這一邊。</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 歷史紀錄 Modal */}
      {showHistory && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6 sm:p-12">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/80 backdrop-blur-md"
            onClick={() => setShowHistory(false)}
          />

          {/* Modal Content */}
          <div className="relative w-full max-w-3xl max-h-[85vh] overflow-y-auto bg-slate-900 border-2 border-slate-700 rounded-[3rem] p-10 shadow-2xl animate-in fade-in zoom-in duration-300">
            <button
              onClick={() => setShowHistory(false)}
              className="absolute top-8 right-8 p-3 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors"
            >
              <X className="w-6 h-6" />
            </button>

            <div className="flex items-center justify-between mb-8">
              <div className="flex items-center gap-4">
                <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30">
                  <History className="w-8 h-8 text-amber-400" />
                </div>
                <h2 className="text-4xl font-black text-white">過去掃描歷史</h2>
              </div>
              {Object.keys(selectedStocks).length > 0 && (
                <button
                  onClick={() => {
                    const updated = historyRecords.map(session => {
                      const sessionSelected = selectedStocks[session.id] || [];
                      if (sessionSelected.length === 0) return session;
                      return {
                        ...session,
                        results: session.results.filter(r => !sessionSelected.includes(r.stock_id))
                      };
                    }).filter(session => session.results.length > 0);

                    setHistoryRecords(updated);
                    localStorage.setItem('tsbs_scan_history', JSON.stringify(updated));
                    setSelectedStocks({});
                  }}
                  className="px-6 py-3 bg-rose-500/10 border border-rose-500/30 rounded-2xl text-rose-500 font-black hover:bg-rose-500 hover:text-white transition-all flex items-center gap-2"
                >
                  <Trash2 className="w-5 h-5" />
                  刪除選取 ({Object.values(selectedStocks).flat().length})
                </button>
              )}
            </div>

            {historyRecords.length === 0 ? (
              <div className="py-20 text-center opacity-50">
                <Calendar className="w-16 h-16 mx-auto mb-4 text-slate-600" />
                <p className="text-2xl font-black text-slate-400">目前沒有歷史紀錄</p>
                <p className="text-slate-500 mt-2">完成掃描後將自動保存結果</p>
              </div>
            ) : (
              <div className="space-y-8">
                {(() => {
                  const frequency: Record<string, number> = {};
                  historyRecords.forEach(session => {
                    session.results.forEach(r => {
                      frequency[r.stock_id] = (frequency[r.stock_id] || 0) + 1;
                    });
                  });

                  return historyRecords.map((session) => {
                    const sessionSelectedCount = (selectedStocks[session.id] || []).length;
                    const isAllSelected = sessionSelectedCount === session.results.length && session.results.length > 0;
                    const isPartiallySelected = sessionSelectedCount > 0 && sessionSelectedCount < session.results.length;

                    return (
                      <div key={session.id} className={clsx(
                        "bg-slate-800/40 rounded-[2.5rem] border overflow-hidden transition-all",
                        sessionSelectedCount > 0 ? "border-rose-500/50 ring-1 ring-rose-500/20" : "border-white/5"
                      )}>
                        <div className="p-6 bg-slate-800/60 border-b border-white/5 flex items-center justify-between">
                          <div className="flex items-center gap-6">
                            <label className="relative flex items-center cursor-pointer">
                              <input
                                type="checkbox"
                                checked={isAllSelected}
                                ref={el => { if (el) el.indeterminate = isPartiallySelected; }}
                                onChange={(e) => {
                                  if (e.target.checked) {
                                    setSelectedStocks(prev => ({
                                      ...prev,
                                      [session.id]: session.results.map(r => r.stock_id)
                                    }));
                                  } else {
                                    setSelectedStocks(prev => {
                                      const next = { ...prev };
                                      delete next[session.id];
                                      return next;
                                    });
                                  }
                                }}
                                className="w-6 h-6 rounded-lg bg-slate-900 border-white/10 checked:bg-amber-500 transition-all cursor-pointer"
                              />
                            </label>
                            <div className="flex items-center gap-4">
                              <div className="px-4 py-1 rounded-full bg-amber-500/20 text-amber-400 text-sm font-black">
                                {session.date}
                              </div>
                              <span className="text-slate-400 font-bold">{session.market} · {session.sector}</span>
                            </div>
                          </div>
                          <button
                            onClick={() => {
                              const updated = historyRecords.filter(s => s.id !== session.id);
                              setHistoryRecords(updated);
                              localStorage.setItem('tsbs_scan_history', JSON.stringify(updated));
                            }}
                            className="p-2 text-rose-500 hover:bg-rose-500/10 rounded-xl transition-colors"
                            title="刪除此紀錄"
                          >
                            <Trash2 className="w-5 h-5" />
                          </button>
                        </div>

                        <div className="p-6 space-y-4">
                          {session.results.sort((a, b) => (b.potential_score || 0) - (a.potential_score || 0)).map((r, idx) => {
                            const isStockSelected = (selectedStocks[session.id] || []).includes(r.stock_id);

                            return (
                              <div key={r.stock_id} className={clsx(
                                "flex flex-col gap-3 p-5 bg-black/20 rounded-3xl border transition-all",
                                isStockSelected ? "border-rose-500/40 bg-rose-500/5" : "border-white/5 hover:border-blue-500/30"
                              )}>
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-4">
                                    <label className="relative flex items-center cursor-pointer">
                                      <input
                                        type="checkbox"
                                        checked={isStockSelected}
                                        onChange={(e) => {
                                          if (e.target.checked) {
                                            setSelectedStocks(prev => ({
                                              ...prev,
                                              [session.id]: [...(prev[session.id] || []), r.stock_id]
                                            }));
                                          } else {
                                            setSelectedStocks(prev => {
                                              const updatedList = (prev[session.id] || []).filter(id => id !== r.stock_id);
                                              if (updatedList.length === 0) {
                                                const next = { ...prev };
                                                delete next[session.id];
                                                return next;
                                              }
                                              return { ...prev, [session.id]: updatedList };
                                            });
                                          }
                                        }}
                                        className="w-5 h-5 rounded-md bg-slate-900 border-white/10 checked:bg-rose-500 transition-all cursor-pointer"
                                      />
                                    </label>
                                    <span className="text-slate-600 font-black text-lg">#{idx + 1}</span>
                                    <div className="flex flex-col">
                                      <div className="flex items-center gap-2">
                                        <span className="text-2xl font-black text-white">{r.stock_id}</span>
                                        <span className="text-lg font-bold text-slate-400">{r.stock_name}</span>
                                        {frequency[r.stock_id] > 1 && (
                                          <span className="px-2 py-0.5 rounded-lg bg-blue-500/10 border border-blue-500/30 text-[10px] font-black text-blue-400">
                                            出現 {frequency[r.stock_id]} 次
                                          </span>
                                        )}
                                      </div>
                                      <div className="text-sm font-bold text-slate-500 flex items-center gap-2">
                                        <span className="px-2 py-0.5 rounded-md bg-slate-800 border border-white/5">{r.sector_name || session.sector}</span>
                                      </div>
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-6">
                                    <div className="text-right">
                                      <div className="text-xs font-bold text-slate-500">當時現價</div>
                                      <div className="text-2xl font-black text-white">${r.close}</div>
                                      <div className={clsx(
                                        "text-sm font-black",
                                        (r.change_percent || 0) > 0 ? "text-rose-500" : (r.change_percent || 0) < 0 ? "text-emerald-500" : "text-slate-400"
                                      )}>
                                        {(r.change_percent || 0) > 0 ? "+" : ""}{(r.change_percent || 0).toFixed(2)}%
                                      </div>
                                    </div>
                                    <div className="text-right w-20">
                                      <div className="text-xs font-bold text-slate-500">爆發評分</div>
                                      <div className={clsx(
                                        "text-3xl font-black",
                                        (r.potential_score || 0) >= 25 ? "text-amber-400" : "text-blue-400"
                                      )}>
                                        {Math.round(r.potential_score || 0)}
                                      </div>
                                    </div>
                                  </div>
                                </div>

                                {/* 技術標籤 */}
                                <div className="flex flex-wrap gap-2 pt-2 border-t border-white/5">
                                  {r.v_ratio > 2 && (
                                    <span className="px-3 py-1 rounded-full bg-rose-500/10 border border-rose-500/30 text-[10px] font-black text-rose-400">量能激增</span>
                                  )}
                                  {r.is_ma_breakout && (
                                    <span className="px-3 py-1 rounded-full bg-blue-500/10 border border-blue-500/30 text-[10px] font-black text-blue-400">帶量突破</span>
                                  )}
                                  {r.is_ma_aligned && (
                                    <span className="px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-[10px] font-black text-emerald-400">均線糾結</span>
                                  )}
                                  {r.consecutive_buy > 0 && (
                                    <span className="px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/30 text-[10px] font-black text-amber-400">投信連續買超</span>
                                  )}
                                  {r.is_bullish && (
                                    <span className="px-3 py-1 rounded-full bg-purple-500/10 border border-purple-500/30 text-[10px] font-black text-purple-400">多頭排列</span>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  });
                })()}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
