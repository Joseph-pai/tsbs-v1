'use client';

import { StockCard } from '@/components/dashboard/StockCard';
import { AnalysisResult, StockData, HistorySession } from '@/types';
import { SECTORS, MarketType, MARKET_NAMES } from '@/lib/sectors';
import { StockSearch } from '@/components/dashboard/StockSearch';
import { Search, TrendingUp, Sparkles, Filter, Loader2, Flame, Settings, Target, BarChart3, Info, BookOpen, X, HelpCircle, AlertTriangle, History, Trash2, Calendar, FlaskConical, CheckCircle2, XCircle, LogOut, RefreshCw, Download, ChevronLeft, ChevronRight, CheckSquare, Square, Compass, Zap } from 'lucide-react';
import { useState, useMemo, useEffect } from 'react';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, getDay, addMonths, subMonths } from 'date-fns';
import { useRouter } from 'next/navigation';
import { clsx } from 'clsx';
import AuthGuard from '@/components/layout/AuthGuard';
import HistoryModal from '@/components/HistoryModal';
import { useAuth } from '@/lib/firebase/context/AuthContext';
import { saveScanRecord, saveBacktestRecord, getScanRecords, deleteScanRecord, updateScanRecord } from '@/services/firebaseDb';
import { auth } from '@/lib/firebase/config';
import { signOut } from 'firebase/auth';
import { exportToPDF } from '@/lib/pdfUtils';

interface BacktestResult {
  sessionDate: string;
  sessionId: string;
  stock_id: string;
  stock_name: string;
  sector_name?: string;
  scanPrice: number;
  targetPrice: number;
  fromDate: string;      // 掃描日 (YYYY-MM-DD)
  backtestDate: string;  // 點擊回測當天日期 (YYYY-MM-DD)
  peakPrice: number | null;
  peakDate: string | null;
  achievedDays: number | null;
  success: boolean;
  gainPercent: number | null;
  hitRecords?: { date: string; high: number }[];
  score?: number;
  flags?: any;
  message?: string;
}

type ScanStage = 'idle' | 'fetching' | 'filtering' | 'analyzing' | 'complete';

export interface ScanSettings {
  volumeWeight: number;
  maWeight: number;
  breakoutWeight: number;
  rsWeight: number;
}

const DEFAULT_SETTINGS: ScanSettings = {
  volumeWeight: 30,
  maWeight: 20,
  breakoutWeight: 30,
  rsWeight: 20
};

export default function DashboardPage() {
  const router = useRouter();
  const { user } = useAuth();
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
  const [showBacktest, setShowBacktest] = useState(false);
  const [backtestTarget, setBacktestTarget] = useState(50);
  const [backtestResults, setBacktestResults] = useState<BacktestResult[]>([]);
  const [isBacktesting, setIsBacktesting] = useState(false);
  const [backtestProgress, setBacktestProgress] = useState({ current: 0, total: 0 });
  const [isRetrying, setIsRetrying] = useState(false);
  const [isExportingPDF, setIsExportingPDF] = useState(false);
  const [backtestSelectedDates, setBacktestSelectedDates] = useState<Set<string>>(new Set());
  const [backtestCalViewMonth, setBacktestCalViewMonth] = useState(() => new Date());
  const [historySelectedDates, setHistorySelectedDates] = useState<Set<string>>(new Set());
  const [historyCalViewMonth, setHistoryCalViewMonth] = useState(() => new Date());

  // ── 強化評分掃描 ──
  const [enhancedResults, setEnhancedResults] = useState<AnalysisResult[]>([]);
  const [isEnhancedScanning, setIsEnhancedScanning] = useState(false);
  const [enhancedProgress, setEnhancedProgress] = useState({ current: 0, total: 0, phase: '' });
  const [activeTab, setActiveTab] = useState<'original' | 'enhanced'>('original');
  const [backtestScanMode, setBacktestScanMode] = useState<'original' | 'enhanced'>('original');

  const handleLogout = async () => {
    try {
      await signOut(auth);
      router.push('/login');
    } catch (e) {
      console.error('Logout failed:', e);
    }
  };

  // 0. 從 Firebase 載入歷史掃描紀錄（支援跨設備、跨瀏覽器）
  // Firebase 儲存格式使用 'data'，但 HistorySession 使用 'results'，需在此做映射
  useEffect(() => {
    if (user) {
      getScanRecords(user.uid)
        .then((records: any[]) => {
          const mapped = records.map(r => ({
            ...r,
            // Firebase stores stocks as 'data', HistorySession expects 'results'
            results: r.results || r.data || [],
            // Derive display date from Firebase timestamp if not already set
            date: r.date || (r.createdAt?.seconds
              ? format(new Date(r.createdAt.seconds * 1000), 'MM/dd HH:mm')
              : ''),
            scanDate: r.scanDate || (r.createdAt?.seconds
              ? format(new Date(r.createdAt.seconds * 1000), 'yyyy-MM-dd')
              : ''),
          }));
          setHistoryRecords(mapped as HistorySession[]);
        })
        .catch(e => console.error('[History] Failed to load scan history from Firebase:', e));
    }
  }, [user]);

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
        setEnhancedResults(parsed.enhancedResults || []);
        setActiveTab(parsed.activeTab || 'original');
      } catch (e) {
        console.error('Failed to load session state:', e);
      }
    }
  }, []);

  useEffect(() => {
    sessionStorage.setItem('tsbs_scanner_state', JSON.stringify({
      results, settings, market, sector, hasScanned, timing, enhancedResults, activeTab
    }));
  }, [results, settings, market, sector, hasScanned, timing, enhancedResults, activeTab]);

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

  const runBacktest = async () => {
    setIsBacktesting(true);
    setBacktestResults([]);

    // 記錄點擊回測的當天日期作為截止日 (使用當地時間避免 UTC 導致日期落後一天)
    const todayStr = format(new Date(), 'yyyy-MM-dd');

    // 獲取歷史紀錄: 優先從 Firebase 取得，若無則降級使用本機紀錄
    let scanHistoryToUse: any[] = [];
    if (user) {
      try {
        scanHistoryToUse = await getScanRecords(user.uid);
        if (!scanHistoryToUse || scanHistoryToUse.length === 0) {
           scanHistoryToUse = historyRecords;
        }
      } catch (e) {
        console.error("Failed to fetch scan DB for backtest", e);
        scanHistoryToUse = historyRecords;
      }
    } else {
      scanHistoryToUse = historyRecords;
    }

    // Collect stocks, keeping only the EARLIEST session per stock_id
    // 使用最早一次掃描的價格與日期，讓回測反映從「首次發現」到「今日」的最大潛在漲幅
    const earliestScanMap = new Map<string, {
      sessionId: string;
      sessionDate: string;
      stock_id: string;
      stock_name: string;
      sector_name?: string;
      scanPrice: number;
      fromDate: string;
      score: number;
      flags: any;
    }>();

    scanHistoryToUse.forEach(session => {
      let fromDate = todayStr;
      let sessionDateStr = '';
      let sessionIdStr = session.id;
      let items: any[] = [];

      if (session.createdAt) {
        // Firebase structure
        fromDate = format(new Date(session.createdAt.seconds * 1000), 'yyyy-MM-dd');
        sessionDateStr = format(new Date(session.createdAt.seconds * 1000), 'yyyy/MM/dd HH:mm:ss');
        items = session.data || [];
      } else {
        // LocalStorage structure (Fallback)
        fromDate = session.scanDate || session.id.split('T')[0];
        sessionDateStr = session.date;
        items = session.results || [];
      }

      // ── 日期篩選：若用戶有選取日期，只處理選中日期的 session ──
      if (backtestSelectedDates.size > 0 && !backtestSelectedDates.has(fromDate)) return;

      // ── 掃描模式篩選：依用戶選擇的來源（原始/強化）過濾 ──
      // 舊紀錄（沒有 scanMode 欄位）視為 'original'（向後兼容）
      const sessionMode = session.scanMode || 'original';
      if (sessionMode !== backtestScanMode) return;

      items.forEach(r => {
        // 🔧 過濾當日掃描：fromDate === todayStr 時，API 一定回傳「當日無歷史數據」，直接跳過
        if (fromDate === todayStr) return;
        const existing = earliestScanMap.get(r.stock_id);
        // 保留 fromDate 最早的那一筆，讓基準價格為首次掃描當日收盤價
        if (!existing || fromDate < existing.fromDate) {
          const rawScore = r.potential_score || r.comprehensiveScoreDetails?.total || r.score || 0;
          const displayScore = Math.round(rawScore > 2 ? rawScore : rawScore * 100);

          earliestScanMap.set(r.stock_id, {
            sessionId: sessionIdStr,
            sessionDate: sessionDateStr,
            stock_id: r.stock_id,
            stock_name: r.stock_name,
            sector_name: r.sector_name || session.sector,
            scanPrice: r.close,
            fromDate,
            score: displayScore,
            flags: {
              v_ratio: r.v_ratio || 0,
              is_ma_breakout: !!r.is_ma_breakout,
              is_ma_aligned: !!r.is_ma_aligned,
              consecutive_buy: r.consecutive_buy || 0,
              is_bullish: !!r.is_bullish,
              marginSqueezeSignal: !!r.marginSqueezeSignal,
              isRevenueNewHigh: !!r.isRevenueNewHigh
            }
          });
        }
      });
    });

    // 將 Map 轉換為 tasks 陣列
    const tasks = Array.from(earliestScanMap.values());

    setBacktestProgress({ current: 0, total: tasks.length });
    const collectedResults: BacktestResult[] = [];
    const BATCH = 5;

    for (let i = 0; i < tasks.length; i += BATCH) {
      const batch = tasks.slice(i, i + BATCH);
      const batchSettled = await Promise.allSettled(
        batch.map(async task => {
          const targetPrice = parseFloat((task.scanPrice * (1 + backtestTarget / 100)).toFixed(2));
          
          // 傳遞 fromDate（掃描日）、toDate（今天，點擊回測日）與 targetPrice
          const res = await fetch(
            `/api/backtest?stockId=${task.stock_id}&fromDate=${task.fromDate}&toDate=${todayStr}&targetPrice=${targetPrice}`
          );
          const data = await res.json();
          
          if (!res.ok) {
            console.error('[Backtest] API Error:', data.error);
            return {
              sessionId: task.sessionId,
              sessionDate: task.sessionDate,
              stock_id: task.stock_id,
              stock_name: task.stock_name,
              sector_name: task.sector_name,
              scanPrice: task.scanPrice,
              targetPrice,
              fromDate: task.fromDate,
              backtestDate: todayStr,
              peakPrice: null,
              peakDate: null,
              achievedDays: null,
              success: false,
              gainPercent: null,
              error: data.error || 'API Connection Failed'
            } as any;
          }

          const success = data.success && data.peakPrice != null && data.peakPrice >= targetPrice;
          const gainPercent = data.peakPrice != null
            ? parseFloat(((data.peakPrice - task.scanPrice) / task.scanPrice * 100).toFixed(1))
            : null;
            
          return {
            sessionId: task.sessionId,
            sessionDate: task.sessionDate,
            stock_id: task.stock_id,
            stock_name: task.stock_name,
            sector_name: task.sector_name,
            scanPrice: task.scanPrice,
            targetPrice,
            fromDate: task.fromDate,
            backtestDate: todayStr,
            peakPrice: data.peakPrice ?? null,
            peakDate: data.peakDate ?? null,
            achievedDays: data.achievedDays ?? null,
            hitRecords: data.hitRecords || [],
            score: task.score,
            flags: task.flags,
            success,
            gainPercent,
            message: data.message
          } as BacktestResult;
        })
      );
      batchSettled.forEach(r => { if (r.status === 'fulfilled') collectedResults.push(r.value); });
      setBacktestProgress({ current: Math.min(i + BATCH, tasks.length), total: tasks.length });
    }

    setBacktestResults(collectedResults);
    setIsBacktesting(false);

    if (user && collectedResults.length > 0) {
      collectedResults.forEach(res => {
         saveBacktestRecord(user.uid, {
             targetStockId: res.stock_id,
             summary: {
                 totalTrades: 1,
                 winRate: res.success ? 1 : 0,
                 totalReturn: res.gainPercent || 0
             },
             backtestDetails: res
         }).catch(console.error);
      });
    }
  };

  // 🔄 再次回測：只針對 peakPrice === null（無資料）的股票重試
  const retryFailedBacktest = async () => {
    const failedTasks = backtestResults.filter(r => r.peakPrice === null && !(r as any).message?.includes('當日無歷史數據'));
    if (failedTasks.length === 0) return;

    setIsRetrying(true);
    const todayStr = format(new Date(), 'yyyy-MM-dd');
    const BATCH = 5;
    const updatedResults = [...backtestResults];

    for (let i = 0; i < failedTasks.length; i += BATCH) {
      const batch = failedTasks.slice(i, i + BATCH);
      const batchSettled = await Promise.allSettled(
        batch.map(async (task) => {
          const targetPrice = parseFloat((task.scanPrice * (1 + backtestTarget / 100)).toFixed(2));
          const res = await fetch(
            `/api/backtest?stockId=${task.stock_id}&fromDate=${task.fromDate}&toDate=${todayStr}&targetPrice=${targetPrice}`
          );
          const data = await res.json();
          if (!res.ok || data.peakPrice === null) return null;
          const success = data.peakPrice >= targetPrice;
          const gainPercent = parseFloat(((data.peakPrice - task.scanPrice) / task.scanPrice * 100).toFixed(1));
          return {
            ...task,
            backtestDate: todayStr,
            peakPrice: data.peakPrice ?? null,
            peakDate: data.peakDate ?? null,
            achievedDays: data.achievedDays ?? null,
            hitRecords: data.hitRecords || [],
            success,
            gainPercent,
            message: data.message
          } as BacktestResult;
        })
      );

      batchSettled.forEach((r, idx) => {
        if (r.status === 'fulfilled' && r.value !== null) {
          const newResult = r.value as BacktestResult;
          const targetIdx = updatedResults.findIndex(x => x.stock_id === newResult.stock_id);
          if (targetIdx !== -1) updatedResults[targetIdx] = newResult;
        }
      });
    }

    setBacktestResults(updatedResults);
    setIsRetrying(false);
  };

  // Reset sector when market changes
  useEffect(() => {
    setSector(market === 'TWSE' ? 'ALL' : 'AL');
  }, [market]);

  const currentSectorName = useMemo(() => {
    return SECTORS[market].find(s => s.id === sector)?.name || '該類股';
  }, [market, sector]);

  // Independent single-stock analysis for "共振掃描" button
  const runSingleStockAnalysis = async (stockId: string, stockName?: string) => {
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
          stocks: [{ id: stockId, name: stockName || stockId }],
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
    } finally {
      setIsAnalyzingSingle(false);
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

            // Use the comprehensive score directly from the backend
            const potential_score = r.comprehensiveScoreDetails?.total ?? ((r.score || 0) * 100);

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
          scanDate: format(new Date(), 'yyyy-MM-dd'),
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
          return [newSession, ...prev].slice(0, 50); // Keep last 50 sessions
        });

        // Save to Firebase
        if (user) {
          const conditionDesc = `V${settings.volumeWeight} MA${settings.maWeight} B${settings.breakoutWeight} RS${settings.rsWeight}`;
          saveScanRecord(user.uid, {
            market,
            sector: currentSectorName,
            scanMode: 'original',
            data: filteredResults.map(r => ({
              ...r,
              score: r.potential_score
            }))
          }, conditionDesc).catch(console.error);
        }
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

  // ────────────────────────────────────────────────
  //  強化評分掃描（獨立於原始掃描，不影響任何現有邏輯）
  // ────────────────────────────────────────────────
  const runEnhancedScan = async () => {
    setIsEnhancedScanning(true);
    setActiveTab('enhanced');
    setEnhancedProgress({ current: 0, total: 0, phase: '正在獲取市場快照...' });
    const t0 = Date.now();

    try {
      const snapshotRes = await fetch(`/api/market/snapshot?market=${market}&sector=${sector}`);
      const snapshotJson = await snapshotRes.json();
      if (!snapshotJson.success) throw new Error(snapshotJson.error);
      const snap: StockData[] = snapshotJson.data;
      const t1 = Date.now();

      setEnhancedProgress({ current: 0, total: snap.length, phase: '強化篩選候選股（成交金額排序）...' });

      const targetTerm = searchTerm.trim();
      const isSearchId = targetTerm.length === 4 && !isNaN(parseInt(targetTerm));

      // Phase 1：改用成交金額（量×價）排序，讓小股本被公平評估
      const candidates = snap
        .filter(s => {
          const isTarget = isSearchId && s.stock_id === targetTerm;
          const isPotential = s.Trading_Volume > 0 && s.spread >= -0.1;
          return isTarget || isPotential;
        })
        .sort((a, b) => {
          const aIsTarget = isSearchId && a.stock_id === targetTerm;
          const bIsTarget = isSearchId && b.stock_id === targetTerm;
          if (aIsTarget && !bIsTarget) return -1;
          if (!aIsTarget && bIsTarget) return 1;
          // 成交金額 = 量 × 收盤價（間接換手率正規化）
          const aTurnover = (a as any).Trading_money || a.Trading_Volume * a.close;
          const bTurnover = (b as any).Trading_money || b.Trading_Volume * b.close;
          return bTurnover - aTurnover;
        })
        .slice(0, 250); // 比原始多 50 支，覆蓋更多小股本

      setEnhancedProgress({ current: 0, total: candidates.length, phase: '強化指標深度分析中...' });

      const BATCH_SIZE = 25;
      const allEnhancedResults: AnalysisResult[] = [];

      for (let i = 0; i < candidates.length; i += BATCH_SIZE) {
        const batch = candidates.slice(i, i + BATCH_SIZE);
        setEnhancedProgress({
          current: i + batch.length,
          total: candidates.length,
          phase: `強化分析中 (${i + batch.length}/${candidates.length})`
        });

        const batchRes = await fetch('/api/scan/analyze', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            stocks: batch.map(c => ({ id: c.stock_id, name: c.stock_name })),
            settings: settings,
            enhanced: true  // 啟用強化評分模式
          })
        });

        const batchJson = await batchRes.json();
        if (batchJson.success && batchJson.data) {
          const augmented = batchJson.data.map((r: any) => ({
            ...r,
            sector_name: r.sector_name || (market === 'TWSE' ? '上市板' : '上櫃板'),
            potential_score: r.comprehensiveScoreDetails?.total ?? ((r.score || 0) * 100)
          }));
          allEnhancedResults.push(...augmented);
        }
      }

      const t_end = Date.now();
      const filteredEnhanced = allEnhancedResults
        .filter(r => {
          const isTargetMatch = r.stock_id.includes(targetTerm) || r.stock_name.includes(targetTerm);
          return r.is_recommended || (targetTerm.length >= 2 && isTargetMatch);
        })
        .sort((a, b) => (b.potential_score || 0) - (a.potential_score || 0));

      setEnhancedResults(filteredEnhanced);

      // 儲存至 Firebase（標記為 enhanced 模式）
      if (user && filteredEnhanced.length > 0) {
        const conditionDesc = `[強化] V${settings.volumeWeight} MA${settings.maWeight} B${settings.breakoutWeight} RS${settings.rsWeight}`;
        saveScanRecord(user.uid, {
          market,
          sector: currentSectorName,
          scanMode: 'enhanced',
          data: filteredEnhanced.map(r => ({ ...r, score: r.potential_score }))
        }, conditionDesc).catch(console.error);
      }

      setEnhancedProgress({
        current: candidates.length,
        total: candidates.length,
        phase: `強化掃描完成：找到 ${filteredEnhanced.length} 支`
      });

    } catch (e: any) {
      console.error('[EnhancedScan]', e);
    } finally {
      setIsEnhancedScanning(false);
    }
  };

  const filteredResults = useMemo(() => {
    return results.filter(s =>
      s.stock_id.includes(searchTerm) || s.stock_name.includes(searchTerm)
    );
  }, [results, searchTerm]);

  const filteredEnhancedResults = useMemo(() => {
    return enhancedResults.filter(s =>
      s.stock_id.includes(searchTerm) || s.stock_name.includes(searchTerm)
    );
  }, [enhancedResults, searchTerm]);

  const isWorking = stage !== 'idle' && stage !== 'complete';

  return (
    <AuthGuard>
      <HistoryModal isOpen={showHistory} onClose={() => setShowHistory(false)} />
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

        {/* 智能選股導航按鈕 */}
        <button
          onClick={() => router.push('/smart-navigator')}
          className="inline-flex items-center gap-2 px-5 py-2 rounded-xl bg-indigo-500/10 border border-indigo-500/30 hover:bg-indigo-500/20 hover:border-indigo-500/60 transition-all text-indigo-400 font-black mb-10 mr-4 group shadow-lg shadow-indigo-500/10"
        >
          <Compass className="w-5 h-5 group-hover:scale-110 transition-transform" />
          智能選股導航
        </button>

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

        <button
          onClick={() => setShowBacktest(true)}
          className="inline-flex items-center gap-2 px-5 py-2 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 hover:border-emerald-500/50 transition-all text-emerald-400 font-black mb-10 ml-4 group"
        >
          <FlaskConical className="w-5 h-5 group-hover:scale-110 transition-transform" />
          準確率回測
        </button>

        <button
          onClick={handleLogout}
          className="inline-flex items-center gap-2 px-5 py-2 rounded-xl bg-red-500/10 border border-red-500/20 hover:bg-red-500/20 hover:border-red-500/50 transition-all text-red-400 font-black mb-10 ml-4 group"
        >
          <LogOut className="w-5 h-5 group-hover:scale-110 transition-transform" />
          登出系統
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
            <div className="animate-in fade-in slide-in-from-top-4 duration-300">
              <div className="w-full overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-white/10">
                      <th className="py-4 px-4 text-sm font-bold text-slate-400">共振類型</th>
                      <th className="py-4 px-4 text-sm font-bold text-slate-400">偵測指標範例</th>
                      <th className="py-4 px-4 text-sm font-bold text-slate-400 w-32">預警權重</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {/* 1. 量能 */}
                    <tr className="hover:bg-white/[0.02] transition-colors">
                      <td className="py-5 px-4 text-base font-black text-slate-200 whitespace-nowrap">量能</td>
                      <td className="py-5 px-4 text-sm text-slate-400">當日量 {'>'} 5日均量 2倍 & 周量創 4周新高</td>
                      <td className="py-5 px-4">
                        <div className="relative flex items-center">
                          <input
                            type="number" min="0" max="100"
                            value={settings.volumeWeight}
                            onChange={(e) => setSettings({ ...settings, volumeWeight: Number(e.target.value) })}
                            className="w-full bg-slate-900 border border-slate-700 rounded-lg py-2 pl-3 pr-8 text-white font-bold focus:border-amber-500 focus:outline-none"
                          />
                          <span className="absolute right-3 text-slate-500">%</span>
                        </div>
                      </td>
                    </tr>
                    {/* 2. 均線 */}
                    <tr className="hover:bg-white/[0.02] transition-colors">
                      <td className="py-5 px-4 text-base font-black text-slate-200 whitespace-nowrap">均線</td>
                      <td className="py-5 px-4 text-sm text-slate-400">5, 20, 60 均線糾結後開花，股價站上</td>
                      <td className="py-5 px-4">
                        <div className="relative flex items-center">
                          <input
                            type="number" min="0" max="100"
                            value={settings.maWeight}
                            onChange={(e) => setSettings({ ...settings, maWeight: Number(e.target.value) })}
                            className="w-full bg-slate-900 border border-slate-700 rounded-lg py-2 pl-3 pr-8 text-white font-bold focus:border-amber-500 focus:outline-none"
                          />
                          <span className="absolute right-3 text-slate-500">%</span>
                        </div>
                      </td>
                    </tr>
                    {/* 3. 突破 */}
                    <tr className="hover:bg-white/[0.02] transition-colors">
                      <td className="py-5 px-4 text-base font-black text-slate-200 whitespace-nowrap">突破</td>
                      <td className="py-5 px-4 text-sm text-slate-400">股價 {'>'} 過去 60 日最高價 (Donchian Channel 突破)</td>
                      <td className="py-5 px-4">
                        <div className="relative flex items-center">
                          <input
                            type="number" min="0" max="100"
                            value={settings.breakoutWeight}
                            onChange={(e) => setSettings({ ...settings, breakoutWeight: Number(e.target.value) })}
                            className="w-full bg-slate-900 border border-slate-700 rounded-lg py-2 pl-3 pr-8 text-white font-bold focus:border-amber-500 focus:outline-none"
                          />
                          <span className="absolute right-3 text-slate-500">%</span>
                        </div>
                      </td>
                    </tr>
                    {/* 4. 權重 */}
                    <tr className="hover:bg-white/[0.02] transition-colors">
                      <td className="py-5 px-4 text-base font-black text-slate-200 whitespace-nowrap">權重</td>
                      <td className="py-5 px-4 text-sm text-slate-400">該產業類別指數漲幅 {'>'} 大盤漲幅 (Relative Strength)</td>
                      <td className="py-5 px-4">
                        <div className="relative flex items-center">
                          <input
                            type="number" min="0" max="100"
                            value={settings.rsWeight}
                            onChange={(e) => setSettings({ ...settings, rsWeight: Number(e.target.value) })}
                            className="w-full bg-slate-900 border border-slate-700 rounded-lg py-2 pl-3 pr-8 text-white font-bold focus:border-amber-500 focus:outline-none"
                          />
                          <span className="absolute right-3 text-slate-500">%</span>
                        </div>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <div className="mt-4 flex justify-end">
                <span className={clsx(
                  "text-sm font-black",
                  (settings.volumeWeight + settings.maWeight + settings.breakoutWeight + settings.rsWeight) === 100 
                    ? "text-emerald-400" 
                    : "text-red-400"
                )}>
                  當前總和: {settings.volumeWeight + settings.maWeight + settings.breakoutWeight + settings.rsWeight}%
                  {(settings.volumeWeight + settings.maWeight + settings.breakoutWeight + settings.rsWeight) !== 100 && " (請確保總和為 100%)"}
                </span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Execute Buttons */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        {/* 原始共振掃描按鈕 */}
        <button
          onClick={() => { setActiveTab('original'); runScan(); }}
          disabled={isWorking || isEnhancedScanning}
          className={clsx(
            "flex flex-col items-center justify-center p-8 rounded-[3rem] border-4 transition-all active:scale-[0.98] group shadow-2xl relative overflow-hidden",
            isWorking
              ? "bg-slate-900 border-slate-800 cursor-not-allowed"
              : "bg-gradient-to-r from-blue-700 to-blue-500 border-blue-400 text-white shadow-blue-500/40 hover:scale-[1.02]"
          )}
        >
          {isWorking ? <Loader2 className="w-10 h-10 animate-spin mb-2" /> : <Flame className="w-10 h-10 mb-2 group-hover:scale-125 transition-transform" />}
          <span className="text-xl font-black uppercase tracking-widest">定點共振掃描</span>
          <span className="text-sm font-bold text-white/60 mt-1">原始評分模式</span>
        </button>

        {/* 強化評分掃描按鈕 */}
        <button
          onClick={runEnhancedScan}
          disabled={isEnhancedScanning || isWorking}
          className={clsx(
            "flex flex-col items-center justify-center p-8 rounded-[3rem] border-4 transition-all active:scale-[0.98] group shadow-2xl relative overflow-hidden",
            isEnhancedScanning
              ? "bg-slate-900 border-slate-800 cursor-not-allowed"
              : "bg-gradient-to-r from-purple-700 to-purple-500 border-purple-400 text-white shadow-purple-500/40 hover:scale-[1.02]"
          )}
        >
          {isEnhancedScanning ? <Loader2 className="w-10 h-10 animate-spin mb-2" /> : <Zap className="w-10 h-10 mb-2 group-hover:scale-125 transition-transform" />}
          <span className="text-xl font-black uppercase tracking-widest">強化評分掃描</span>
          <span className="text-sm font-bold text-white/60 mt-1">位階×月營收×成交金額</span>
        </button>
      </div>

      {/* Enhanced Scan Progress */}
      {isEnhancedScanning && (
        <div className="p-8 bg-purple-900/20 border-2 border-purple-500/30 rounded-[2rem] mb-6 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-3 h-3 bg-purple-400 rounded-full animate-ping" />
              <span className="text-lg font-black text-purple-300">{enhancedProgress.phase}</span>
            </div>
            <span className="text-base font-mono font-black text-purple-500">
              {Math.round((enhancedProgress.current / (enhancedProgress.total || 1)) * 100)}%
            </span>
          </div>
          <div className="w-full bg-slate-800 rounded-full h-6 overflow-hidden border border-white/5">
            <div
              className="h-full bg-gradient-to-r from-purple-600 to-pink-500 transition-all duration-500"
              style={{ width: enhancedProgress.total > 0 ? `${(enhancedProgress.current / enhancedProgress.total) * 100}%` : '10%' }}
            />
          </div>
        </div>
      )}

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
          onSearch={(stockId, stockName) => {
            setSearchTerm(stockId);
            runSingleStockAnalysis(stockId, stockName);
          }}
          isWorking={isAnalyzingSingle} // 使用獨立的單股分析狀態
        />
      </div>

      {/* Results Container */}
      <div className="space-y-6">
        {error && (
          <div className="p-10 bg-rose-500/10 border-4 border-rose-500/20 rounded-[3rem] text-center">
            <p className="text-2xl font-black text-rose-400">{error}</p>
            <button onClick={() => runScan()} className="mt-4 text-rose-500 underline font-black">點擊重試</button>
          </div>
        )}

        {/* Tab 切換（只有至少一組結果時顯示） */}
        {(hasScanned || enhancedResults.length > 0) && !isWorking && !isEnhancedScanning && (
          <div className="flex gap-3">
            <button
              onClick={() => setActiveTab('original')}
              className={clsx(
                "flex-1 py-3 px-4 rounded-2xl font-black text-base transition-all border-2",
                activeTab === 'original'
                  ? "bg-blue-500/20 border-blue-500/60 text-blue-400"
                  : "bg-slate-900 border-slate-800 text-slate-500 hover:border-slate-600"
              )}
            >
              🔥 原始共振掃描 {results.length > 0 && `(${results.length}支)`}
            </button>
            <button
              onClick={() => setActiveTab('enhanced')}
              className={clsx(
                "flex-1 py-3 px-4 rounded-2xl font-black text-base transition-all border-2",
                activeTab === 'enhanced'
                  ? "bg-purple-500/20 border-purple-500/60 text-purple-400"
                  : "bg-slate-900 border-slate-800 text-slate-500 hover:border-slate-600"
              )}
            >
              ⚡ 強化評分掃描 {enhancedResults.length > 0 && `(${enhancedResults.length}支)`}
            </button>
          </div>
        )}

        {/* 原始掃描結果 */}
        {activeTab === 'original' && (
          <>
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
                      <li>1. **總合門檻嚴格**：系統預設綜合評分需達 70 分才算具備動能共振爆發力。</li>
                      <li>2. **流動性防護**：市場中可能缺乏同時具備「良好流動性」與「高 {settings.volumeWeight}% 量能共振」的標的。</li>
                      <li className="text-blue-400 font-black mt-4">👉 建議：大盤可能處於量縮盤整或系統性走弱，請耐心等待多頭趨勢或放寬權重分布。</li>
                    </ul>
                  </div>
                </div>
              </div>
            ) : filteredResults.length > 0 ? (
              <div className="relative animate-in fade-in slide-in-from-bottom-8 duration-700">
                <div className="flex justify-end mb-4 pr-2">
                  <button
                    onClick={async () => {
                      setIsExportingPDF(true);
                      await new Promise(r => setTimeout(r, 100));
                      try {
                        const dateStr = format(new Date(), 'yyyyMMdd_HHmm');
                        await exportToPDF('scan-results-container', `共振掃描結果_${dateStr}.pdf`);
                      } finally {
                        setIsExportingPDF(false);
                      }
                    }}
                    disabled={isExportingPDF}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 border border-blue-500/30 rounded-xl transition-all font-black text-sm disabled:opacity-50"
                  >
                    {isExportingPDF ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                    {isExportingPDF ? '生成中...' : '匯出為 PDF'}
                  </button>
                </div>
                <div id="scan-results-container" className="grid grid-cols-1 gap-10 bg-slate-950 p-[2px] rounded-[3rem]">
                  {filteredResults.map((stock, index) => (
                    <div key={stock.stock_id} onClick={() => router.push(`/stock/${stock.stock_id}`)}>
                      <StockCard data={stock} index={index + 1} />
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </>
        )}

        {/* 強化評分結果 */}
        {activeTab === 'enhanced' && (
          <>
            {filteredEnhancedResults.length === 0 && !isEnhancedScanning ? (
              <div className="py-40 text-center border-4 border-dashed border-purple-900/30 rounded-[4rem] bg-purple-500/5 px-10">
                <div className="text-8xl mb-8">⚡</div>
                <p className="text-purple-400 font-black text-4xl mb-4">尚未執行強化掃描</p>
                <p className="text-slate-500 text-xl font-black">請按「強化評分掃描」按鈕</p>
              </div>
            ) : filteredEnhancedResults.length > 0 ? (
              <div className="relative animate-in fade-in slide-in-from-bottom-8 duration-700">
                <div className="flex justify-end mb-4 pr-2">
                  <button
                    onClick={async () => {
                      setIsExportingPDF(true);
                      await new Promise(r => setTimeout(r, 100));
                      try {
                        const dateStr = format(new Date(), 'yyyyMMdd_HHmm');
                        await exportToPDF('enhanced-results-container', `強化掃描結果_${dateStr}.pdf`);
                      } finally {
                        setIsExportingPDF(false);
                      }
                    }}
                    disabled={isExportingPDF}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-purple-500/10 hover:bg-purple-500/20 text-purple-400 border border-purple-500/30 rounded-xl transition-all font-black text-sm disabled:opacity-50"
                  >
                    {isExportingPDF ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                    {isExportingPDF ? '生成中...' : '匯出為 PDF'}
                  </button>
                </div>
                <div id="enhanced-results-container" className="grid grid-cols-1 gap-10 bg-slate-950 p-[2px] rounded-[3rem]">
                  {filteredEnhancedResults.map((stock, index) => (
                    <div key={stock.stock_id} onClick={() => router.push(`/stock/${stock.stock_id}`)}>
                      <StockCard data={stock} index={index + 1} />
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </>
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
                  onClick={async () => {
                    const updated = historyRecords.map(session => {
                      const sessionSelected = selectedStocks[session.id] || [];
                      if (sessionSelected.length === 0) return session;
                      return {
                        ...session,
                        results: session.results.filter(r => !sessionSelected.includes(r.stock_id))
                      };
                    }).filter(session => session.results.length > 0);

                    // Sync to Firebase
                    if (user) {
                      try {
                        for (const session of historyRecords) {
                          const sessionSelected = selectedStocks[session.id] || [];
                          if (sessionSelected.length > 0) {
                            const newResults = session.results.filter(r => !sessionSelected.includes(r.stock_id));
                            if (newResults.length === 0) {
                              await deleteScanRecord(user.uid, session.id);
                            } else {
                              // Firebase stores results in array named 'data' or 'results'. 
                              // Current saving uses 'data', so we sync both to be safe or just 'data'.
                              await updateScanRecord(user.uid, session.id, { data: newResults, results: newResults });
                            }
                          }
                        }
                      } catch (err) {
                        console.error('刪除同步失敗:', err);
                        alert('同步刪除至資料庫失敗，請確認網路連線。');
                        return; // 發生錯誤則不更新本地端狀態
                      }
                    }

                    setHistoryRecords(updated);
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
                  const hsRecordDates = new Set<string>();
                  historyRecords.forEach(session => {
                    if (session.scanDate) hsRecordDates.add(session.scanDate);
                  });
                  const hsDays = eachDayOfInterval({
                    start: startOfMonth(historyCalViewMonth),
                    end: endOfMonth(historyCalViewMonth)
                  });
                  const hsLeading = getDay(startOfMonth(historyCalViewMonth));
                  const hsAllSelected = hsRecordDates.size > 0 && historySelectedDates.size === hsRecordDates.size;
                  
                  const filteredRecords = historyRecords.filter(session => {
                    if (historySelectedDates.size === 0) return true;
                    return session.scanDate && historySelectedDates.has(session.scanDate);
                  });

                  const frequency: Record<string, number> = {};
                  filteredRecords.forEach(session => {
                    session.results.forEach(r => {
                      frequency[r.stock_id] = (frequency[r.stock_id] || 0) + 1;
                    });
                  });

                  return (
                    <>
                      {/* ── History Date Picker ── */}
                      <div className="bg-black/30 rounded-[2rem] p-8 border border-white/5 mb-6">
                        <div className="flex items-center justify-between mb-4">
                          <div>
                            <span className="text-lg font-black text-slate-300">選擇日期篩選</span>
                            <span className="text-xs font-bold text-slate-500 ml-2">（不選則顯示全部日期）</span>
                          </div>
                          <div className="flex items-center gap-2">
                            {historySelectedDates.size > 0 && (
                              <span className="px-2 py-0.5 rounded-full bg-blue-600/30 text-blue-400 text-xs font-bold">
                                已選 {historySelectedDates.size} 天
                              </span>
                            )}
                            <button
                              onClick={() => {
                                if (hsAllSelected) setHistorySelectedDates(new Set());
                                else setHistorySelectedDates(new Set(hsRecordDates));
                              }}
                              disabled={hsRecordDates.size === 0}
                              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border border-blue-500/40 text-blue-400 hover:bg-blue-600/20 transition-colors disabled:opacity-40"
                            >
                              {hsAllSelected ? <><Square className="w-3.5 h-3.5" /> 清空</> : <><CheckSquare className="w-3.5 h-3.5" /> 全選</>}
                            </button>
                            {historySelectedDates.size > 0 && !hsAllSelected && (
                              <button
                                onClick={() => setHistorySelectedDates(new Set())}
                                className="px-3 py-1.5 rounded-lg text-xs font-bold border border-slate-700 text-slate-400 hover:bg-slate-800 transition-colors"
                              >
                                清空
                              </button>
                            )}
                          </div>
                        </div>

                        <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4">
                          <div className="flex items-center justify-between mb-3">
                            <button onClick={() => setHistoryCalViewMonth(m => subMonths(m, 1))} className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"><ChevronLeft className="w-4 h-4" /></button>
                            <span className="text-sm font-bold text-white">{format(historyCalViewMonth, 'yyyy年 M月')}</span>
                            <button onClick={() => setHistoryCalViewMonth(m => addMonths(m, 1))} className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"><ChevronRight className="w-4 h-4" /></button>
                          </div>
                          <div className="grid grid-cols-7 mb-1">
                            {['日','一','二','三','四','五','六'].map(d => <div key={d} className="text-center text-[10px] font-bold text-slate-500 py-1">{d}</div>)}
                          </div>
                          <div className="grid grid-cols-7 gap-1">
                            {Array.from({ length: hsLeading }).map((_, i) => <div key={`h${i}`} />)}
                            {hsDays.map(day => {
                              const ds = format(day, 'yyyy-MM-dd');
                              const hasRec = hsRecordDates.has(ds);
                              const isSel = historySelectedDates.has(ds);
                              return (
                                <button
                                  key={ds}
                                  onClick={() => {
                                    if (!hasRec) return;
                                    setHistorySelectedDates(prev => {
                                      const next = new Set(prev);
                                      if (next.has(ds)) next.delete(ds); else next.add(ds);
                                      return next;
                                    });
                                  }}
                                  disabled={!hasRec}
                                  className={`
                                    relative flex flex-col items-center justify-center h-9 w-full rounded-lg text-xs font-semibold border transition-all
                                    ${isSel ? 'bg-blue-600 text-white border-blue-500' : hasRec ? 'text-slate-200 border-slate-700 hover:bg-blue-600/20 hover:border-blue-500/50 cursor-pointer' : 'text-slate-700 border-transparent cursor-default'}
                                  `}
                                >
                                  <span>{day.getDate()}</span>
                                  {hasRec && <span className={`absolute bottom-1 w-1 h-1 rounded-full ${isSel ? 'bg-white' : 'bg-blue-400'}`} />}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      </div>

                      {filteredRecords.length === 0 ? (
                        <div className="py-10 text-center opacity-50">
                          <p className="text-xl font-bold text-slate-400">所選日期無紀錄</p>
                        </div>
                      ) : (
                        filteredRecords.map((session) => {
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
                            onClick={async () => {
                              try {
                                if (user) {
                                  await deleteScanRecord(user.uid, session.id);
                                }
                                const updated = historyRecords.filter(s => s.id !== session.id);
                                setHistoryRecords(updated);
                              } catch (err) {
                                console.error('刪除此紀錄同步失敗:', err);
                                alert('同步刪除至資料庫失敗，請稍後再試。');
                              }
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
                                    <div className="text-right flex flex-col items-end min-w-[5rem]">
                                      <div className="text-xs font-bold text-slate-500 mb-1">爆發評分</div>
                                      {(() => {
                                        const rawScore = r.potential_score || r.comprehensiveScoreDetails?.total || r.score || 0;
                                        // 修正乘號 Bug：如果 rawScore <= 2，代表是系統舊制 (0~1 小數)，需乘 100
                                        const displayScore = Math.round(rawScore > 2 ? rawScore : rawScore * 100);
                                        const scoreColor = displayScore >= 80 ? "text-amber-400" : displayScore >= 60 ? "text-blue-400" : "text-slate-500";
                                        return (
                                          <div className={clsx("text-3xl font-black flex items-baseline gap-1", scoreColor)}>
                                            {displayScore}
                                            <span className="text-sm font-bold opacity-70">分</span>
                                          </div>
                                        );
                                      })()}
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
                  })
                )}
                    </>
                  );
                })()}
              </div>
            )}
          </div>
        </div>
      )}

      {/* 準確率回測 Modal */}
      {showBacktest && (
        <div className={clsx(
          "z-50 flex justify-center p-6 sm:p-12",
          isExportingPDF
            ? "relative w-full items-start bg-slate-950"
            : "fixed inset-0 items-center"
        )}>
          {!isExportingPDF && (
            <div className="absolute inset-0 bg-black/80 backdrop-blur-md" onClick={() => !isBacktesting && setShowBacktest(false)} />
          )}
          <div id="backtest-modal-panel" className={clsx(
            "relative w-full max-w-3xl bg-slate-900 border-2 border-slate-700 rounded-[3rem] p-10 shadow-2xl",
            !isExportingPDF && "animate-in fade-in zoom-in duration-300 max-h-[85vh] overflow-y-auto"
          )}>
            <button onClick={() => setShowBacktest(false)} disabled={isBacktesting}
              className="absolute top-8 right-8 p-3 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors disabled:opacity-40">
              <X className="w-6 h-6" />
            </button>
            <div className="flex items-center justify-between mb-8">
              <div className="flex items-center gap-4">
                <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/30">
                  <FlaskConical className="w-8 h-8 text-emerald-400" />
                </div>
                <div>
                  <h2 className="text-4xl font-black text-white">準確率回測</h2>
                  <p className="text-slate-400 text-sm mt-1">驗證歷史掃描標的的實際後續表現</p>
                </div>
              </div>
              {backtestResults.length > 0 && !isBacktesting && (
                <button
                  onClick={async () => {
                    // Step 1: 設定狀態，讓 Modal 切換成文件流定位（移除 fixed 與 overflow 限制）
                    setIsExportingPDF(true);
                    // Step 2: 等待 React re-render 完成，確保 DOM 已展開
                    await new Promise(r => setTimeout(r, 350));
                    try {
                      const dateStr = format(new Date(), 'yyyyMMdd_HHmm');
                      await exportToPDF('backtest-modal-panel', `準確率回測報告_${dateStr}.pdf`);
                    } finally {
                      setIsExportingPDF(false);
                    }
                  }}
                  disabled={isExportingPDF}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded-xl transition-all font-black text-sm disabled:opacity-50 mr-8"
                >
                  {isExportingPDF ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                  {isExportingPDF ? '生成中...' : '匯出報表'}
                </button>
              )}
            </div>

            {/* ── 掃描模式選擇器（回測資料來源） ── */}
            <div className="bg-black/30 rounded-[2rem] p-6 border border-white/5 mb-6 flex items-center justify-between">
              <div>
                <span className="text-lg font-black text-slate-300">資料來源模式</span>
                <span className="text-xs font-bold text-slate-500 ml-2">（獨立對比兩種模式的勝率）</span>
              </div>
              <div className="flex bg-slate-900 rounded-xl p-1 border border-white/10">
                <button
                  onClick={() => setBacktestScanMode('original')}
                  className={clsx(
                    "px-6 py-2 rounded-lg font-black transition-all",
                    backtestScanMode === 'original' 
                      ? "bg-blue-500/20 text-blue-400 border border-blue-500/50" 
                      : "text-slate-500 hover:text-slate-300"
                  )}
                >
                  🔥 原始共振掃描
                </button>
                <button
                  onClick={() => setBacktestScanMode('enhanced')}
                  className={clsx(
                    "px-6 py-2 rounded-lg font-black transition-all",
                    backtestScanMode === 'enhanced' 
                      ? "bg-purple-500/20 text-purple-400 border border-purple-500/50" 
                      : "text-slate-500 hover:text-slate-300"
                  )}
                >
                  ⚡ 強化評分掃描
                </button>
              </div>
            </div>

            {/* ── Backtest Date Picker ── */}
            {(() => {
              // Compute which dates have scan records
              const btRecordDates = new Set<string>();
              historyRecords.forEach(s => {
                const d = (s as any).scanDate || ((s as any).createdAt?.seconds
                  ? format(new Date((s as any).createdAt.seconds * 1000), 'yyyy-MM-dd')
                  : '');
                if (d) btRecordDates.add(d);
              });

              const btDays = eachDayOfInterval({
                start: startOfMonth(backtestCalViewMonth),
                end: endOfMonth(backtestCalViewMonth)
              });
              const btLeading = getDay(startOfMonth(backtestCalViewMonth));
              const allSelected = btRecordDates.size > 0 && backtestSelectedDates.size === btRecordDates.size;

              return (
                <div className="bg-black/30 rounded-[2rem] p-8 border border-white/5 mb-6">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <span className="text-lg font-black text-slate-300">選擇回測日期</span>
                      <span className="text-xs font-bold text-slate-500 ml-2">（不選則回測全部日期）</span>
                    </div>
                    <div className="flex items-center gap-2">
                      {backtestSelectedDates.size > 0 && (
                        <span className="px-2 py-0.5 rounded-full bg-emerald-600/30 text-emerald-400 text-xs font-bold">
                          已選 {backtestSelectedDates.size} 天
                        </span>
                      )}
                      <button
                        onClick={() => {
                          if (allSelected) {
                            setBacktestSelectedDates(new Set());
                          } else {
                            setBacktestSelectedDates(new Set(btRecordDates));
                          }
                        }}
                        disabled={isBacktesting || btRecordDates.size === 0}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border border-emerald-500/40 text-emerald-400 hover:bg-emerald-600/20 transition-colors disabled:opacity-40"
                      >
                        {allSelected
                          ? <><Square className="w-3.5 h-3.5" /> 清空</>
                          : <><CheckSquare className="w-3.5 h-3.5" /> 全選</>
                        }
                      </button>
                      {backtestSelectedDates.size > 0 && !allSelected && (
                        <button
                          onClick={() => setBacktestSelectedDates(new Set())}
                          disabled={isBacktesting}
                          className="px-3 py-1.5 rounded-lg text-xs font-bold border border-slate-700 text-slate-400 hover:bg-slate-800 transition-colors"
                        >
                          清空
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Mini Calendar */}
                  <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4">
                    {/* Month Nav */}
                    <div className="flex items-center justify-between mb-3">
                      <button
                        onClick={() => setBacktestCalViewMonth(m => subMonths(m, 1))}
                        disabled={isBacktesting}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors disabled:opacity-40"
                      >
                        <ChevronLeft className="w-4 h-4" />
                      </button>
                      <span className="text-sm font-bold text-white">
                        {format(backtestCalViewMonth, 'yyyy年 M月')}
                      </span>
                      <button
                        onClick={() => setBacktestCalViewMonth(m => addMonths(m, 1))}
                        disabled={isBacktesting}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors disabled:opacity-40"
                      >
                        <ChevronRight className="w-4 h-4" />
                      </button>
                    </div>
                    {/* Weekday headers */}
                    <div className="grid grid-cols-7 mb-1">
                      {['日','一','二','三','四','五','六'].map(d => (
                        <div key={d} className="text-center text-[10px] font-bold text-slate-500 py-1">{d}</div>
                      ))}
                    </div>
                    {/* Date grid */}
                    <div className="grid grid-cols-7 gap-1">
                      {Array.from({ length: btLeading }).map((_, i) => <div key={`b${i}`} />)}
                      {btDays.map(day => {
                        const ds = format(day, 'yyyy-MM-dd');
                        const hasRec = btRecordDates.has(ds);
                        const isSel = backtestSelectedDates.has(ds);
                        return (
                          <button
                            key={ds}
                            onClick={() => {
                              if (!hasRec || isBacktesting) return;
                              setBacktestSelectedDates(prev => {
                                const next = new Set(prev);
                                if (next.has(ds)) next.delete(ds); else next.add(ds);
                                return next;
                              });
                            }}
                            disabled={!hasRec || isBacktesting}
                            className={`
                              relative flex flex-col items-center justify-center h-9 w-full rounded-lg text-xs font-semibold border transition-all
                              ${isSel
                                ? 'bg-emerald-600 text-white border-emerald-500'
                                : hasRec
                                  ? 'text-slate-200 border-slate-700 hover:bg-emerald-600/20 hover:border-emerald-500/50 cursor-pointer'
                                  : 'text-slate-700 border-transparent cursor-default'
                              }
                            `}
                          >
                            <span>{day.getDate()}</span>
                            {hasRec && (
                              <span className={`absolute bottom-1 w-1 h-1 rounded-full ${isSel ? 'bg-white' : 'bg-emerald-400'}`} />
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {backtestSelectedDates.size > 0 && (
                    <p className="text-xs font-bold text-emerald-400/70 mt-3 text-center">
                      將只回測 {backtestSelectedDates.size} 個選取日期的掃描紀錄
                    </p>
                  )}
                </div>
              );
            })()}

            <div className="bg-black/30 rounded-[2rem] p-8 border border-white/5 mb-8">
              <div className="flex justify-between items-center mb-4">
                <div>
                  <span className="text-lg font-black text-slate-300">目標漲幅</span>
                  <span className="text-xs font-bold text-slate-500 ml-2">（掃描現價上漲幾 % 視為成功達標）</span>
                </div>
                <span className="text-4xl font-black text-emerald-400 font-mono">{backtestTarget}%</span>
              </div>
              <input type="range" min={10} max={200} step={10} value={backtestTarget}
                onChange={e => setBacktestTarget(parseInt(e.target.value))}
                disabled={isBacktesting}
                className="w-full h-4 bg-slate-800 rounded-full appearance-none cursor-pointer accent-emerald-500" />
              <div className="flex justify-between text-xs font-bold text-slate-600 mt-1">
                <span>10%</span><span>100%</span><span>200%</span>
              </div>
              <button onClick={runBacktest} disabled={isBacktesting || historyRecords.length === 0}
                className="mt-6 w-full flex items-center justify-center gap-3 p-5 rounded-2xl bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-800 disabled:text-slate-600 text-white font-black text-xl transition-all active:scale-[0.98]">
                {isBacktesting
                  ? <><Loader2 className="w-6 h-6 animate-spin" /> 回測中，請稍候…</>
                  : <><FlaskConical className="w-6 h-6" /> 開始回測</>}
              </button>
              {isBacktesting && backtestProgress.total > 0 && (
                <div className="mt-4">
                  <div className="flex justify-between text-xs font-black text-slate-400 mb-2">
                    <span>正在比對 K 線資料…</span>
                    <span>{backtestProgress.current}/{backtestProgress.total}</span>
                  </div>
                  <div className="w-full bg-slate-800 rounded-full h-3 overflow-hidden">
                    <div className="h-full bg-gradient-to-r from-emerald-600 to-emerald-400 transition-all duration-500"
                      style={{ width: `${(backtestProgress.current / backtestProgress.total) * 100}%` }} />
                  </div>
                </div>
              )}
            </div>

            {backtestResults.length > 0 && !isBacktesting && (() => {
              const successList = backtestResults.filter(r => r.success);
              const failList = backtestResults.filter(r => !r.success);
              const noDataList = backtestResults.filter(r => r.peakPrice === null && !(r as any).message?.includes('當日無歷史數據'));
              const hasDataList = backtestResults.filter(r => r.peakPrice !== null);
              const successRate = hasDataList.length > 0 ? Math.round((successList.length / hasDataList.length) * 100) : 0;
              return (
                <div id="backtest-results-container" className="space-y-8 p-[2px] rounded-3xl bg-slate-900 border border-slate-900 pt-2 -mx-2 px-2">
                  <div className="grid grid-cols-3 gap-4">
                    {[
                      { label: '有效回測', value: hasDataList.length, color: 'text-white' },
                      { label: '成功達標', value: successList.length, color: 'text-emerald-400' },
                      { label: '成功率', value: `${successRate}%`, color: successRate >= 50 ? 'text-emerald-400' : 'text-amber-400' }
                    ].map((s, i) => (
                      <div key={i} className="bg-slate-800/60 rounded-2xl p-5 text-center border border-white/5">
                        <div className={`text-3xl font-black ${s.color}`}>{s.value}</div>
                        <div className="text-xs font-bold text-slate-500 mt-1">{s.label}</div>
                      </div>
                    ))}
                  </div>

                  {/* 再次回測按鈕：只在有無資料股票時顯示 */}
                  {noDataList.length > 0 && (
                    <button
                      onClick={retryFailedBacktest}
                      disabled={isRetrying}
                      className="w-full flex items-center justify-center gap-2 p-4 rounded-2xl bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 text-amber-400 font-black text-base transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isRetrying
                        ? <><Loader2 className="w-5 h-5 animate-spin" /> 重試中…</>
                        : <><RefreshCw className="w-5 h-5" /> 再次回測（{noDataList.length} 支無資料）</>}
                    </button>
                  )}

                  {successList.length > 0 && (
                    <div>
                      <div className="flex items-center gap-2 mb-4">
                        <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                        <span className="text-xl font-black text-emerald-400">成功達標 ({successList.length})</span>
                      </div>
                      <div className="space-y-3">
                        {successList.map((r, i) => (
                          <div key={`s-${i}`} className="flex items-center justify-between p-5 bg-emerald-500/5 border border-emerald-500/20 rounded-2xl">
                            <div className="flex-1 pr-4">
                              <div className="flex items-center gap-3 flex-wrap">
                                <span className="text-xl font-black text-white">{r.stock_id}</span>
                                <span className="text-sm font-bold text-slate-400">{r.stock_name}</span>
                                {r.sector_name && <span className="px-2 py-0.5 rounded-md bg-slate-800 border border-white/5 text-xs font-bold text-slate-500">{r.sector_name}</span>}
                                {r.score != null && (
                                  <span className={clsx("px-2 py-0.5 rounded-md border font-black text-xs", r.score >= 80 ? "border-amber-500/50 text-amber-400 bg-amber-500/10" : "border-blue-500/50 text-blue-400 bg-blue-500/10")}>
                                    評分: {r.score}
                                  </span>
                                )}
                                {r.flags?.v_ratio > 2 && <span className="px-2 py-0.5 rounded-md bg-rose-500/10 border border-rose-500/30 text-[10px] font-black text-rose-400">量能激增{r.flags.v_ratio.toFixed(1)}x</span>}
                                {r.flags?.is_ma_breakout && <span className="px-2 py-0.5 rounded-md bg-blue-500/10 border border-blue-500/30 text-[10px] font-black text-blue-400">帶量突破</span>}
                                {r.flags?.marginSqueezeSignal && <span className="px-2 py-0.5 rounded-md bg-amber-500/10 border border-amber-500/30 text-[10px] font-black text-amber-400">融資軋空</span>}
                                {r.flags?.isRevenueNewHigh && <span className="px-2 py-0.5 rounded-md bg-purple-500/10 border border-purple-500/30 text-[10px] font-black text-purple-400">營收新高</span>}
                              </div>
                              <div className="text-xs font-bold text-slate-500 mt-1">
                                <span className="text-emerald-400/70">掃描</span> {r.sessionDate}{' '}｜{' '}
                                <span className="text-blue-400/70">回測至</span> {r.backtestDate}
                                <span className="mx-1 text-slate-600">·</span>
                                現價 ${r.scanPrice} → 目標 ${r.targetPrice.toFixed(1)}
                              </div>
                              {r.hitRecords && r.hitRecords.length > 0 && (
                                <div className="mt-3 pt-3 border-t border-emerald-500/20">
                                  <div className="text-[10px] font-bold text-emerald-400/80 mb-1.5 flex items-center gap-1">
                                    <Sparkles className="w-3 h-3" /> 達標軌跡 (最高價 ≥ ${r.targetPrice.toFixed(1)})
                                  </div>
                                  <div className="flex flex-wrap gap-2">
                                    {r.hitRecords.map((hit, hi) => (
                                      <div key={hi} className="px-2 py-1 bg-emerald-500/10 border border-emerald-500/20 rounded text-[10px] font-black text-emerald-300">
                                        {hit.date} | <span className="text-white">${hit.high.toFixed(1)}</span>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>
                            <div className="text-right flex-shrink-0 ml-4">
                              <div className="text-2xl font-black text-emerald-400">+{r.gainPercent}%</div>
                              <div className="text-xs font-bold text-slate-500">${r.peakPrice} @ {r.peakDate}</div>
                              {r.achievedDays && <div className="text-xs font-bold text-emerald-500">{r.achievedDays} 個交易日達標</div>}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {failList.length > 0 && (
                    <div>
                      <div className="flex items-center gap-2 mb-4">
                        <XCircle className="w-5 h-5 text-rose-400" />
                        <span className="text-xl font-black text-rose-400">未達標 ({failList.length})</span>
                      </div>
                      <div className="space-y-2">
                        {failList.map((r, i) => (
                          <div key={`f-${i}`} className="flex items-center justify-between p-4 bg-rose-500/5 border border-rose-500/10 rounded-2xl">
                            <div className="flex-1 pr-4">
                              <div className="flex items-center gap-3 flex-wrap">
                                <span className="text-lg font-black text-white">{r.stock_id}</span>
                                <span className="text-sm font-bold text-slate-400">{r.stock_name}</span>
                                {r.score != null && (
                                  <span className={clsx("px-2 py-0.5 rounded-md border font-black text-xs", r.score >= 80 ? "border-amber-500/50 text-amber-400 bg-amber-500/10" : "border-blue-500/50 text-blue-400 bg-blue-500/10")}>
                                    評分: {r.score}
                                  </span>
                                )}
                                {r.flags?.v_ratio > 2 && <span className="px-2 py-0.5 rounded-md bg-rose-500/10 border border-rose-500/30 text-[10px] font-black text-rose-400">量能激增{r.flags.v_ratio.toFixed(1)}x</span>}
                                {r.flags?.is_ma_breakout && <span className="px-2 py-0.5 rounded-md bg-blue-500/10 border border-blue-500/30 text-[10px] font-black text-blue-400">帶量突破</span>}
                                {r.flags?.marginSqueezeSignal && <span className="px-2 py-0.5 rounded-md bg-amber-500/10 border border-amber-500/30 text-[10px] font-black text-amber-400">融資軋空</span>}
                                {r.flags?.isRevenueNewHigh && <span className="px-2 py-0.5 rounded-md bg-purple-500/10 border border-purple-500/30 text-[10px] font-black text-purple-400">營收新高</span>}
                              </div>
                              <div className="text-xs font-bold text-slate-500 mt-0.5">
                                <span className="text-amber-400/70">掃描</span> {r.sessionDate}{' '}｜{' '}
                                <span className="text-blue-400/70">回測至</span> {r.backtestDate}
                                <span className="mx-1 text-slate-600">·</span>
                                現價 ${r.scanPrice} → 目標 ${r.targetPrice.toFixed(1)}
                              </div>
                            </div>
                            <div className="text-right flex-shrink-0 ml-4">
                              {r.peakPrice != null ? (
                                <>
                                  <div className="text-lg font-black text-slate-400">
                                    {r.gainPercent != null && r.gainPercent >= 0 ? '+' : ''}{r.gainPercent}%
                                  </div>
                                  <div className="text-xs font-bold text-slate-600">最高 ${r.peakPrice}</div>
                                  <div className="text-xs font-bold text-rose-400">
                                    距目標差 {((r.targetPrice - r.peakPrice) / r.targetPrice * 100).toFixed(1)}%
                                  </div>
                                </>
                              ) : (
                                <div className="text-xs font-bold text-slate-600">
                                  {(r as any).error || (r as any).message || '資料不足'}
                                </div>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })()}

            {backtestResults.length === 0 && !isBacktesting && (
              <div className="py-16 text-center opacity-40">
                <FlaskConical className="w-16 h-16 mx-auto mb-4 text-slate-600" />
                <p className="text-slate-400 font-black text-lg">設定目標漲幅後點擊「開始回測」</p>
                <p className="text-slate-600 text-sm mt-2">系統將自動比對所有歷史掃描紀錄的後續最高價表現</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
    </AuthGuard>
  );
}
