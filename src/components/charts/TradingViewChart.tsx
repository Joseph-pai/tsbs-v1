'use client';

import React, { useEffect, useRef } from 'react';
import { createChart, ColorType, ISeriesApi, CandlestickData, WhitespaceData, Time, CrosshairMode } from 'lightweight-charts';
import { StockCandle } from '@/types';

interface ChartProps {
    data: StockCandle[];
    ma5?: number[];
    ma10?: number[];
    ma20?: number[];
    poc?: number;
}

/**
 * Professional Grade Trading Chart
 * Balanced visuals with deep technical indicators
 */
export const TradingViewChart: React.FC<ChartProps> = ({ data, ma5, ma10, ma20, poc }) => {
    const chartContainerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!chartContainerRef.current) return;

        const container = chartContainerRef.current;
        const width = container.clientWidth;
        const height = container.clientHeight || 450;

        const chart = createChart(container, {
            layout: {
                background: { type: ColorType.Solid, color: 'transparent' },
                textColor: '#64748b',
                fontSize: 12,
                fontFamily: 'JetBrains Mono, Geist Mono, Inter',
            },
            grid: {
                vertLines: { color: 'rgba(255, 255, 255, 0.03)' },
                horzLines: { color: 'rgba(255, 255, 255, 0.03)' },
            },
            crosshair: {
                mode: CrosshairMode.Normal,
                vertLine: { color: '#3b82f6', width: 1, style: 2, labelBackgroundColor: '#1e40af' },
                horzLine: { color: '#3b82f6', width: 1, style: 2, labelBackgroundColor: '#1e40af' },
            },
            width,
            height,
            timeScale: {
                borderColor: 'rgba(255, 255, 255, 0.05)',
                timeVisible: true,
                secondsVisible: false,
                barSpacing: 10,
            },
            rightPriceScale: {
                borderColor: 'rgba(255, 255, 255, 0.05)',
                autoScale: true,
                alignLabels: true,
            },
        });

        const candlestickSeries = chart.addCandlestickSeries({
            upColor: '#f43f5e',
            downColor: '#10b981',
            borderVisible: false,
            wickUpColor: '#f43f5e',
            wickDownColor: '#10b981',
        });

        // Ensure data is sorted for lightweight-charts
        const sortedData = [...data].sort((a, b) => a.time.localeCompare(b.time));
        candlestickSeries.setData(sortedData as CandlestickData<Time>[]);

        // Render POC Line - Make it more prominent
        if (poc) {
            candlestickSeries.createPriceLine({
                price: poc,
                color: '#facc15',
                lineWidth: 2,
                lineStyle: 2,
                axisLabelVisible: true,
                title: 'POC (支撐價)',
            });
        }

        // Professional Histograms for Volume
        const volumeSeries = chart.addHistogramSeries({
            color: '#334155',
            priceFormat: { type: 'volume' },
            priceScaleId: '',
        });

        volumeSeries.priceScale().applyOptions({
            scaleMargins: { top: 0.8, bottom: 0 },
        });

        volumeSeries.setData(sortedData.map(d => ({
            time: d.time,
            value: d.value || 0,
            color: d.close >= d.open ? 'rgba(244, 63, 94, 0.2)' : 'rgba(16, 185, 129, 0.2)',
        })) as any);

        // MAs with smooth colors and Chinese labels
        if (ma5) {
            const ma5Series = chart.addLineSeries({ color: '#f59e0b', lineWidth: 2, title: 'MA5 (5日均線)', crosshairMarkerVisible: false });
            const ma5Data = sortedData.map((d, i) => (ma5[i] ? { time: d.time, value: ma5[i] } : null)).filter(Boolean);
            ma5Series.setData(ma5Data as any);
        }
        if (ma10) {
            const ma10Series = chart.addLineSeries({ color: '#3b82f6', lineWidth: 2, title: 'MA10 (10日均線)', crosshairMarkerVisible: false });
            const ma10Data = sortedData.map((d, i) => (ma10[i] ? { time: d.time, value: ma10[i] } : null)).filter(Boolean);
            ma10Series.setData(ma10Data as any);
        }
        if (ma20) {
            const ma20Series = chart.addLineSeries({ color: '#a855f7', lineWidth: 2, title: 'MA20 (20日均線)', crosshairMarkerVisible: false });
            const ma20Data = sortedData.map((d, i) => (ma20[i] ? { time: d.time, value: ma20[i] } : null)).filter(Boolean);
            ma20Series.setData(ma20Data as any);
        }

        chart.timeScale().fitContent();

        const handleResize = () => {
            if (chartContainerRef.current) {
                const newWidth = chartContainerRef.current.clientWidth;
                const newHeight = chartContainerRef.current.clientHeight;
                if (newWidth > 0 && newHeight > 0) {
                    chart.applyOptions({ width: newWidth, height: newHeight });
                }
            }
        };

        // Use ResizeObserver for more reliable resize detection
        const resizeObserver = new ResizeObserver(() => handleResize());
        resizeObserver.observe(chartContainerRef.current);
        window.addEventListener('resize', handleResize);

        return () => {
            window.removeEventListener('resize', handleResize);
            resizeObserver.disconnect();
            chart.remove();
        };
    }, [data, ma5, ma10, ma20, poc]);

    return (
        <div className="w-full h-full relative group">
            <div ref={chartContainerRef} className="w-full h-full border border-white/10 rounded-2xl overflow-hidden" />
            <div className="absolute inset-0 pointer-events-none border border-white/5 rounded-2xl group-hover:border-white/10 transition-colors" />
        </div>
    );
};
