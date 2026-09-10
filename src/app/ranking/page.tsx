'use client';

import { useEffect, useState, useCallback } from 'react';

// ─── Types ────────────────────────────────────────────────────────────────
interface PerStockStatItem {
    stockId: string;
    stockName: string;
    market: string;
    signalCount: number;
    hitCount: number;
    hitRate: number;
    avgMaxReturn: number;
    medianMaxReturn: number;
    avgDaysToTarget: number | null;
    latestSignalDate: string;
    latestSignalClose: number;
    latestSignalTargetPrice: number;
    latestTechnicalScore: number;
    eventAlphaScore: number | null;
    eventAlphaStatus: string;
    rank: number;
}

interface RankingMeta {
    generatedAt: string;
    backtestPeriod: { startDate: string; endDate: string };
    totalSignals: number;
    overallHitRate: number;
    prerequisites: {
        baseline: boolean;
        factorAnalysis: boolean;
        walkForward: boolean;
        eventAlphaABTest: boolean;
    };
    disclaimer: string[];
}

interface RankingData {
    meta: RankingMeta;
    stocks: PerStockStatItem[];
}

// ─── Helper ────────────────────────────────────────────────────────────────
function hitRateColor(rate: number): string {
    if (rate >= 70) return '#00e5a0';
    if (rate >= 50) return '#f0c040';
    if (rate >= 30) return '#ff8c42';
    return '#ff4d6d';
}

function rankBadge(rank: number) {
    if (rank === 1) return { bg: 'linear-gradient(135deg,#ffd700,#ff9500)', text: '#000' };
    if (rank === 2) return { bg: 'linear-gradient(135deg,#c0c0c0,#a0a0a0)', text: '#000' };
    if (rank === 3) return { bg: 'linear-gradient(135deg,#cd7f32,#a0522d)', text: '#fff' };
    return { bg: 'rgba(255,255,255,0.08)', text: '#c0caf5' };
}

function fmtDate(d: string) {
    if (!d) return '—';
    return d.replace(/-/g, '/');
}

function PrereqBadge({ ok, label }: { ok: boolean; label: string }) {
    return (
        <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 5,
            padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600,
            background: ok ? 'rgba(0,229,160,0.12)' : 'rgba(255,77,109,0.12)',
            color: ok ? '#00e5a0' : '#ff4d6d',
            border: `1px solid ${ok ? 'rgba(0,229,160,0.3)' : 'rgba(255,77,109,0.3)'}`,
        }}>
            {ok ? '✓' : '✗'} {label}
        </span>
    );
}

// ─── Main Page ─────────────────────────────────────────────────────────────
export default function RankingPage() {
    const [data, setData] = useState<RankingData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [sortKey, setSortKey] = useState<keyof PerStockStatItem>('rank');
    const [sortAsc, setSortAsc] = useState(true);
    const [filter, setFilter] = useState('');

    const fetchRanking = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await fetch('/api/scan/ranking');
            const json = await res.json();
            if (!json.success) throw new Error(json.error || 'Failed to load ranking');
            setData(json.data);
        } catch (e: any) {
            setError(e.message);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { fetchRanking(); }, [fetchRanking]);

    const handleSort = (key: keyof PerStockStatItem) => {
        if (sortKey === key) setSortAsc(p => !p);
        else { setSortKey(key); setSortAsc(false); }
    };

    const sortedStocks = data?.stocks
        .filter(s =>
            !filter ||
            s.stockId.includes(filter) ||
            s.stockName.includes(filter) ||
            s.market.toLowerCase().includes(filter.toLowerCase())
        )
        .sort((a, b) => {
            const av = a[sortKey] as any;
            const bv = b[sortKey] as any;
            if (av === null) return 1;
            if (bv === null) return -1;
            return sortAsc ? (av > bv ? 1 : -1) : (av < bv ? 1 : -1);
        }) ?? [];

    const meta = data?.meta;
    const prereqs = meta?.prerequisites;

    return (
        <div style={{
            minHeight: '100vh',
            background: 'linear-gradient(160deg, #0a0e1a 0%, #0d1228 50%, #0a1020 100%)',
            fontFamily: "'Inter', 'Noto Sans TC', system-ui, sans-serif",
            color: '#c0caf5',
            padding: '0',
        }}>
            {/* ── Header ── */}
            <header style={{
                borderBottom: '1px solid rgba(120,120,255,0.15)',
                background: 'rgba(10,14,26,0.85)',
                backdropFilter: 'blur(20px)',
                padding: '18px 32px',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                position: 'sticky', top: 0, zIndex: 100,
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                    <div style={{
                        width: 38, height: 38, borderRadius: 10,
                        background: 'linear-gradient(135deg,#7878ff,#a78bfa)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 18, fontWeight: 700, color: '#fff',
                    }}>T</div>
                    <div>
                        <div style={{ fontSize: 17, fontWeight: 700, color: '#e2e8f0' }}>TSBS · 5D +10% Ranking</div>
                        <div style={{ fontSize: 11, color: '#6272a4', letterSpacing: '0.05em' }}>
                            Historical Backtest · 歷史回測統計結果
                        </div>
                    </div>
                </div>
                <a href="/" style={{
                    padding: '7px 16px', borderRadius: 8,
                    background: 'rgba(120,120,255,0.1)', border: '1px solid rgba(120,120,255,0.25)',
                    color: '#a78bfa', textDecoration: 'none', fontSize: 13, fontWeight: 500,
                    transition: 'all 0.2s',
                }}>← 返回主頁</a>
            </header>

            <main style={{ maxWidth: 1280, margin: '0 auto', padding: '28px 24px 60px' }}>

                {/* ── Disclaimer Banner ── */}
                <div style={{
                    background: 'rgba(255,77,109,0.08)',
                    border: '1px solid rgba(255,77,109,0.25)',
                    borderRadius: 12, padding: '14px 20px', marginBottom: 24,
                    display: 'flex', alignItems: 'flex-start', gap: 12,
                }}>
                    <span style={{ fontSize: 18, flexShrink: 0 }}>⚠️</span>
                    <div>
                        <div style={{ fontWeight: 700, color: '#ff4d6d', fontSize: 13, marginBottom: 4 }}>
                            Historical Backtest — 非投資建議
                        </div>
                        <div style={{ fontSize: 12, color: '#8892b0', lineHeight: 1.6 }}>
                            本頁所有數據均為<strong style={{ color: '#c0caf5' }}>歷史回測統計結果</strong>。
                            「Historical 5D +10% Hit Rate」<strong style={{ color: '#ff4d6d' }}>不是未來上漲機率</strong>，
                            不代表未來績效，亦不構成任何投資建議。
                            投資人須自行承擔所有投資風險。
                        </div>
                    </div>
                </div>

                {/* ── Prerequisites Status ── */}
                {prereqs && (
                    <div style={{
                        background: 'rgba(120,120,255,0.05)',
                        border: '1px solid rgba(120,120,255,0.15)',
                        borderRadius: 12, padding: '14px 20px', marginBottom: 24,
                    }}>
                        <div style={{ fontSize: 12, color: '#6272a4', marginBottom: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                            Prerequisites Status
                        </div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                            <PrereqBadge ok={prereqs.baseline} label="Baseline" />
                            <PrereqBadge ok={prereqs.factorAnalysis} label="Factor Analysis" />
                            <PrereqBadge ok={prereqs.walkForward} label="Walk-forward Test" />
                            <PrereqBadge ok={prereqs.eventAlphaABTest} label="Event Alpha A/B Test" />
                        </div>
                        {!prereqs.walkForward && (
                            <div style={{ marginTop: 10, fontSize: 11, color: '#ff8c42' }}>
                                ⚠️ Walk-forward Test 尚未完成。排名仍可顯示，但統計結果需謹慎解讀。
                            </div>
                        )}
                    </div>
                )}

                {/* ── Summary Cards ── */}
                {meta && (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px,1fr))', gap: 14, marginBottom: 28 }}>
                        {[
                            { label: 'Backtest 期間', value: `${fmtDate(meta.backtestPeriod.startDate)} ~ ${fmtDate(meta.backtestPeriod.endDate)}` },
                            { label: '有效訊號總數', value: `${meta.totalSignals}`, sub: 'dataComplete signals' },
                            { label: '整體 Hit Rate', value: `${meta.overallHitRate.toFixed(1)}%`, sub: '5D +10% Historical' },
                            { label: '排名股票數', value: `${data?.stocks.length ?? 0}`, sub: 'n ≥ 2 signals' },
                            { label: '資料更新時間', value: new Date(meta.generatedAt).toLocaleDateString('zh-TW') },
                        ].map((card, i) => (
                            <div key={i} style={{
                                background: 'rgba(255,255,255,0.03)',
                                border: '1px solid rgba(120,120,255,0.12)',
                                borderRadius: 12, padding: '14px 16px',
                            }}>
                                <div style={{ fontSize: 11, color: '#6272a4', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                                    {card.label}
                                </div>
                                <div style={{ fontSize: 16, fontWeight: 700, color: '#e2e8f0' }}>{card.value}</div>
                                {card.sub && <div style={{ fontSize: 10, color: '#44475a', marginTop: 3 }}>{card.sub}</div>}
                            </div>
                        ))}
                    </div>
                )}

                {/* ── Search ── */}
                <div style={{ marginBottom: 16, display: 'flex', gap: 12, alignItems: 'center' }}>
                    <input
                        placeholder="🔍  搜尋股票代號 / 名稱 / 市場..."
                        value={filter}
                        onChange={e => setFilter(e.target.value)}
                        style={{
                            flex: 1, maxWidth: 340,
                            background: 'rgba(255,255,255,0.04)',
                            border: '1px solid rgba(120,120,255,0.2)',
                            borderRadius: 8, padding: '9px 14px',
                            color: '#c0caf5', fontSize: 13, outline: 'none',
                        }}
                    />
                    <span style={{ fontSize: 12, color: '#44475a' }}>
                        顯示 {sortedStocks.length} / {data?.stocks.length ?? 0} 支股票
                    </span>
                </div>

                {/* ── Loading / Error ── */}
                {loading && (
                    <div style={{ textAlign: 'center', padding: '80px 0', color: '#6272a4' }}>
                        <div style={{ fontSize: 32, marginBottom: 12 }}>⏳</div>
                        <div>載入排名資料中...</div>
                    </div>
                )}

                {error && (
                    <div style={{
                        background: 'rgba(255,77,109,0.08)', border: '1px solid rgba(255,77,109,0.25)',
                        borderRadius: 12, padding: 24, textAlign: 'center',
                    }}>
                        <div style={{ fontSize: 28, marginBottom: 10 }}>⚠️</div>
                        <div style={{ color: '#ff4d6d', fontWeight: 600, marginBottom: 8 }}>資料尚未就緒</div>
                        <div style={{ color: '#8892b0', fontSize: 13 }}>{error}</div>
                        <div style={{ marginTop: 12, fontSize: 12, color: '#6272a4' }}>
                            請先執行：<code style={{ background: 'rgba(255,255,255,0.06)', padding: '2px 8px', borderRadius: 4 }}>npm run backtest</code>
                        </div>
                    </div>
                )}

                {/* ── Table ── */}
                {!loading && !error && sortedStocks.length > 0 && (
                    <div style={{ overflowX: 'auto', borderRadius: 14, border: '1px solid rgba(120,120,255,0.12)' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                            <thead>
                                <tr style={{ background: 'rgba(120,120,255,0.08)' }}>
                                    {([
                                        ['rank', 'Rank', 60],
                                        ['stockId', '代號', 80],
                                        ['stockName', '名稱', 110],
                                        ['market', '市場', 70],
                                        ['latestTechnicalScore', 'Technical Score', 120],
                                        ['eventAlphaScore', 'Event Alpha Score', 130],
                                        ['hitRate', '5D +10% Hit Rate', 130],
                                        ['signalCount', '樣本數', 80],
                                        ['latestSignalClose', 'Signal Close', 110],
                                        ['latestSignalTargetPrice', 'Target Price', 110],
                                        ['avgDaysToTarget', 'Avg Days', 90],
                                        ['medianMaxReturn', 'Median Max Ret.', 120],
                                    ] as [keyof PerStockStatItem, string, number][]).map(([key, label, w]) => (
                                        <th key={key}
                                            onClick={() => handleSort(key)}
                                            style={{
                                                padding: '12px 14px', textAlign: 'left',
                                                fontSize: 11, fontWeight: 600, color: '#6272a4',
                                                textTransform: 'uppercase', letterSpacing: '0.06em',
                                                cursor: 'pointer', whiteSpace: 'nowrap', minWidth: w,
                                                userSelect: 'none',
                                                borderBottom: '1px solid rgba(120,120,255,0.12)',
                                            }}
                                        >
                                            {label}
                                            {sortKey === key && (
                                                <span style={{ marginLeft: 4, color: '#a78bfa' }}>
                                                    {sortAsc ? '↑' : '↓'}
                                                </span>
                                            )}
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {sortedStocks.map((s, i) => {
                                    const badge = rankBadge(s.rank);
                                    return (
                                        <tr key={s.stockId} style={{
                                            borderBottom: '1px solid rgba(120,120,255,0.07)',
                                            background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.015)',
                                            transition: 'background 0.15s',
                                        }}
                                            onMouseEnter={e => (e.currentTarget.style.background = 'rgba(120,120,255,0.07)')}
                                            onMouseLeave={e => (e.currentTarget.style.background = i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.015)')}
                                        >
                                            {/* Rank */}
                                            <td style={{ padding: '11px 14px' }}>
                                                <span style={{
                                                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                                                    width: 30, height: 30, borderRadius: 8,
                                                    background: badge.bg, color: badge.text,
                                                    fontWeight: 700, fontSize: 13,
                                                }}>
                                                    {s.rank}
                                                </span>
                                            </td>

                                            {/* 代號 */}
                                            <td style={{ padding: '11px 14px', fontWeight: 700, color: '#a78bfa', fontFamily: 'monospace', fontSize: 14 }}>
                                                {s.stockId}
                                            </td>

                                            {/* 名稱 */}
                                            <td style={{ padding: '11px 14px', color: '#e2e8f0', fontWeight: 500 }}>
                                                {s.stockName}
                                            </td>

                                            {/* 市場 */}
                                            <td style={{ padding: '11px 14px' }}>
                                                <span style={{
                                                    padding: '2px 8px', borderRadius: 6, fontSize: 11, fontWeight: 600,
                                                    background: s.market === 'TWSE' ? 'rgba(0,229,160,0.1)' : 'rgba(167,139,250,0.1)',
                                                    color: s.market === 'TWSE' ? '#00e5a0' : '#a78bfa',
                                                }}>
                                                    {s.market}
                                                </span>
                                            </td>

                                            {/* Technical Score */}
                                            <td style={{ padding: '11px 14px' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                    <div style={{
                                                        width: 48, height: 4, borderRadius: 2,
                                                        background: 'rgba(255,255,255,0.08)',
                                                        overflow: 'hidden',
                                                    }}>
                                                        <div style={{
                                                            width: `${Math.min(100, s.latestTechnicalScore)}%`,
                                                            height: '100%',
                                                            background: 'linear-gradient(90deg,#7878ff,#a78bfa)',
                                                        }} />
                                                    </div>
                                                    <span style={{ color: '#c0caf5', fontWeight: 600, fontSize: 13 }}>
                                                        {s.latestTechnicalScore.toFixed(0)}
                                                    </span>
                                                </div>
                                            </td>

                                            {/* Event Alpha Score */}
                                            <td style={{ padding: '11px 14px', textAlign: 'center' }}>
                                                <span style={{
                                                    padding: '3px 10px', borderRadius: 6, fontSize: 11,
                                                    background: 'rgba(255,255,255,0.04)',
                                                    border: '1px solid rgba(255,255,255,0.08)',
                                                    color: '#44475a',
                                                }}>
                                                    N/A
                                                </span>
                                                <div style={{ fontSize: 9, color: '#44475a', marginTop: 2 }}>尚無A/B證據</div>
                                            </td>

                                            {/* Hit Rate */}
                                            <td style={{ padding: '11px 14px' }}>
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                                        <span style={{ fontWeight: 700, fontSize: 15, color: hitRateColor(s.hitRate) }}>
                                                            {s.hitRate.toFixed(1)}%
                                                        </span>
                                                        <span style={{ fontSize: 10, color: '#44475a' }}>
                                                            {s.hitCount}/{s.signalCount}
                                                        </span>
                                                    </div>
                                                    <div style={{
                                                        height: 3, borderRadius: 2,
                                                        background: 'rgba(255,255,255,0.06)',
                                                        overflow: 'hidden',
                                                    }}>
                                                        <div style={{
                                                            width: `${s.hitRate}%`, height: '100%',
                                                            background: hitRateColor(s.hitRate),
                                                        }} />
                                                    </div>
                                                    <div style={{ fontSize: 9, color: '#44475a' }}>
                                                        Historical Backtest
                                                    </div>
                                                </div>
                                            </td>

                                            {/* 樣本數 */}
                                            <td style={{ padding: '11px 14px', color: '#8892b0', fontSize: 12 }}>
                                                n={s.signalCount}
                                            </td>

                                            {/* Signal Close */}
                                            <td style={{ padding: '11px 14px', color: '#e2e8f0', fontFamily: 'monospace' }}>
                                                <div>{s.latestSignalClose.toLocaleString()}</div>
                                                <div style={{ fontSize: 10, color: '#44475a' }}>{fmtDate(s.latestSignalDate)}</div>
                                            </td>

                                            {/* Target Price (+10%) */}
                                            <td style={{ padding: '11px 14px', color: '#00e5a0', fontFamily: 'monospace', fontWeight: 600 }}>
                                                {s.latestSignalTargetPrice.toLocaleString()}
                                                <div style={{ fontSize: 10, color: '#44475a', fontWeight: 400 }}>+10% Target</div>
                                            </td>

                                            {/* Avg Days to Target */}
                                            <td style={{ padding: '11px 14px', color: '#c0caf5', textAlign: 'center' }}>
                                                {s.avgDaysToTarget !== null ? (
                                                    <span>{s.avgDaysToTarget.toFixed(1)} 天</span>
                                                ) : '—'}
                                            </td>

                                            {/* Median Max Return */}
                                            <td style={{ padding: '11px 14px' }}>
                                                <span style={{
                                                    color: s.medianMaxReturn >= 10 ? '#00e5a0' :
                                                        s.medianMaxReturn >= 5 ? '#f0c040' : '#8892b0',
                                                    fontWeight: 600,
                                                }}>
                                                    {s.medianMaxReturn >= 0 ? '+' : ''}{s.medianMaxReturn.toFixed(1)}%
                                                </span>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}

                {/* ── Score Legend ── */}
                {!loading && !error && (
                    <div style={{
                        marginTop: 24, display: 'flex', flexWrap: 'wrap', gap: 20,
                        borderTop: '1px solid rgba(120,120,255,0.1)', paddingTop: 20,
                    }}>
                        <div>
                            <div style={{ fontSize: 11, color: '#6272a4', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                                Hit Rate 顏色說明
                            </div>
                            <div style={{ display: 'flex', gap: 12 }}>
                                {[['#00e5a0', '≥70%'], ['#f0c040', '50-69%'], ['#ff8c42', '30-49%'], ['#ff4d6d', '<30%']].map(([c, l]) => (
                                    <span key={l} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: '#8892b0' }}>
                                        <span style={{ width: 10, height: 10, borderRadius: 2, background: c, display: 'inline-block' }} />
                                        {l}
                                    </span>
                                ))}
                            </div>
                        </div>
                        <div>
                            <div style={{ fontSize: 11, color: '#6272a4', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                                Event Alpha Score
                            </div>
                            <div style={{ fontSize: 11, color: '#44475a' }}>
                                目前顯示 N/A（A/B Test 尚無統計證據支持，Technical Score 與 Event Alpha Score 完全分離）
                            </div>
                        </div>
                    </div>
                )}

                {/* ── Footnote ── */}
                <div style={{
                    marginTop: 32, padding: '16px 20px',
                    background: 'rgba(255,255,255,0.02)',
                    border: '1px solid rgba(255,255,255,0.05)',
                    borderRadius: 10, fontSize: 11, color: '#44475a', lineHeight: 1.7,
                }}>
                    <strong style={{ color: '#6272a4', display: 'block', marginBottom: 6 }}>
                        📋 統計說明 / Statistical Notes
                    </strong>
                    <ul style={{ margin: 0, paddingLeft: 16 }}>
                        <li>排名依據：Historical 5D +10% Hit Rate（歷史 5 日最高盤中價 ≥ 訊號收盤價 × 1.10 之比例）</li>
                        <li>僅計入 dataComplete=true 之訊號（5 個交易日完整資料），確保無 Look-ahead Bias</li>
                        <li>Technical Score：最新訊號之引擎評分（0-100 分）</li>
                        <li>Event Alpha Score：目前因 A/B Test 尚無統計證據（Event Alpha 暫無支持），顯示 N/A</li>
                        <li>Signal Close / Target Price：最近一次歷史回測訊號之收盤與目標價（+10%），非即時報價</li>
                        <li>本頁所有數據為歷史統計，不是未來上漲預測，不構成投資建議</li>
                    </ul>
                </div>
            </main>
        </div>
    );
}
