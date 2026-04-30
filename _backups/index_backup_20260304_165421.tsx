export interface StockData {
    stock_id: string;
    stock_name: string;
    date: string;
    open: number;
    max: number;
    min: number;
    close: number;
    Trading_Volume: number; // shares
    Trading_money: number;
    spread: number;
    Trading_turnover: number;
}

export interface InstitutionalData {
    stock_id: string;
    stock_name: string;
    date: string;
    buy: number;
    sell: number;
    name: "Foreign_Investor" | "Investment_Trust" | "Dealer_Self" | "Dealer_Hedging";
}

export interface FinMindResponse<T> {
    msg: string;
    status: number;
    data: T[];
}

export interface AnalysisResult {
    stock_id: string;
    stock_name: string;
    close: number;
    change_percent: number; // (close - prevClose) / prevClose

    // Breakout Factors
    score: number;
    v_ratio: number;           // Volume / MA20_Volume
    is_ma_aligned: boolean;    // MA5/10/20 squeezed
    is_ma_breakout: boolean;   // Price > Max(MA)
    is_bullish: boolean;      // MA5 > MA20 (Bullish Arrangement)
    consecutive_buy: number;   // Investment Trust buy streak

    // Expert System
    poc: number;               // Point of Control Price
    verdict: string;           // Human readable analysis (e.g. "Bullish Breakout")

    // Flags
    tags: ('VOLUME_EXPLOSION' | 'MA_SQUEEZE' | 'INST_BUYING' | 'BREAKOUT' | 'LIMITED_SCAN' | 'VOLUME_INCREASING' | 'DISCOVERY' | 'RED_K' | 'BASIC_SUPPORT' | 'MARGIN_SQUEEZE' | 'GAP_UP' | 'REVENUE_NEW_HIGH')[];

    // Detailed History (Optional, for Charting)
    history?: StockData[];

    // Enhanced Analysis Fields
    dailyVolumeTrend?: number[]; // Last 10 days volume
    kellyResult?: {
        action: 'Invest' | 'Wait' | 'Avoid';
        percentage: number;      // % of capital to invest
        winRate: number;         // Estimated probability
        riskRewardRatio: number;
    };
    riskWarning?: string;        // e.g. "Price below 5MA"
    warnings?: string[];         // Data integrity or logic warnings (e.g. "Missing Chip Data")
    comprehensiveScoreDetails?: {
        volumeScore: number;
        maScore: number;
        chipScore: number; // Institutional
        marginScore?: number; // 融資軋空
        fundamentalBonus?: number; // Revenue YoY/MoM bonus
        total: number;
    };
    is_recommended?: boolean;   // Activated after Stage 3 analysis
    analysisHints?: {
        technicalSignals?: string;
        chipSignals?: string;
        fundamentalSignals?: string;
        marginSignals?: string;
        technical?: string;
        chips?: string;
        fundamental?: string;
    };
    // 專業分析數據
    maConstrictValue?: number;   // 均線糾結度 (0-1)
    volumeIncreasing?: boolean;  // 成交量連續遞增
    today_volume?: number;       // 今日成交量 (張)
    sector_name?: string;      // 產業名稱
    potential_score?: number;   // 爆發潛力評分
    marginSqueezeSignal?: boolean;   // 融資軋空信號
    marginTrend?: 'increasing' | 'stable' | 'decreasing';
    isGapUp?: boolean;            // 跳空缺口
    isRevenueNewHigh?: boolean;   // 營收創近期新高
}

export interface StockCandle {
    time: string; // 'yyyy-mm-dd'
    open: number;
    high: number;
    low: number;
    close: number;
    value?: number; // volume
    color?: string;
}

export interface HistorySession {
    id: string; // ISO timestamp
    date: string; // Display date
    market: string;
    sector: string;
    settings: {
        volumeRatio: number;
        maConstrict: number;
        breakoutPercent: number;
    };
    results: AnalysisResult[];
}
