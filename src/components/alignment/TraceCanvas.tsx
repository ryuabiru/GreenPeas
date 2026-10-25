/**
 * 学習メモ: アラインメント画面のTraceCanvas部分を描画し、親ビューから渡されたデータと操作を扱うReactコンポーネント。
 * 処理の位置づけ: 親コンポーネントからデータとコールバックを受け取り、描画と操作通知を担当する。
 */

import React from 'react';
import { ChromTrace } from '../../types';

interface TraceCanvasProps {
    trace: ChromTrace;
    absQueryStart: number;
    charWidth: number;
    queryLen: number;
    strand: "Forward" | "Reverse";
    gappedQuery: string;
    offset: number;
}

const COLORS = {
  G: '#fbbf24', // Yellow
  A: '#f87171', // Red
  T: '#60a5fa', // Blue
  C: '#34d399', // Green
};

export const TraceCanvas: React.FC<TraceCanvasProps> = React.memo(({ 
    trace, absQueryStart, charWidth, queryLen, gappedQuery, offset 
}) => {
    const canvasRef = React.useRef<HTMLCanvasElement>(null);

    // 1. Pre-calculate coordinate mapping (Lookup Table)
    const baseMapping = React.useMemo(() => {
        const mapping: { baseX: number, startPt: number, range: number }[] = [];
        const ptsPerBase = trace.g.length / queryLen;
        let qIdx = absQueryStart;

        for (let i = 0; i < gappedQuery.length; i++) {
            const char = gappedQuery[i];
            if (char !== '-' && char !== ' ') {
                const peak = trace.peak_locations?.[qIdx] ?? (qIdx * ptsPerBase);
                const prevPeak = qIdx > 0 ? (trace.peak_locations?.[qIdx - 1] ?? (qIdx - 1) * ptsPerBase) : peak - ptsPerBase;
                const nextPeak = qIdx < queryLen - 1 ? (trace.peak_locations?.[qIdx + 1] ?? (qIdx + 1) * ptsPerBase) : peak + ptsPerBase;
                
                const startPt = (peak + prevPeak) / 2;
                const endPt = (peak + nextPeak) / 2;
                mapping.push({ 
                    baseX: i * charWidth, 
                    startPt, 
                    range: endPt - startPt 
                });
                qIdx++;
            }
        }
        return mapping;
    }, [trace.peak_locations, trace.g.length, queryLen, absQueryStart, gappedQuery, charWidth]);

    const dpr = window.devicePixelRatio || 1;
    const w = gappedQuery.length * charWidth;
    const h = 80;

    React.useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        
        const ctx = canvas.getContext('2d', { alpha: true });
        if (!ctx) return;
        
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.scale(dpr, dpr);
        ctx.clearRect(0, 0, w, h);
        
        const channels = [
            { data: trace.g, color: COLORS.G },
            { data: trace.a, color: COLORS.A },
            { data: trace.t, color: COLORS.T },
            { data: trace.c, color: COLORS.C },
        ];

        // Calculate localized maximums or windowed maximums
        const localWindow = 15; // window size in bases
        const baseMaxVals = baseMapping.map(({ startPt, range }) => {
            let maxVal = 10;
            channels.forEach(ch => {
                const data = ch.data;
                if (!data) return;
                for (let p = 0; p < range; p++) {
                    const idx = Math.floor(startPt + p);
                    if (idx >= 0 && idx < data.length) {
                        if (data[idx] > maxVal) maxVal = data[idx];
                    }
                }
            });
            return maxVal;
        });

        // Smooth the max values using a moving average window to avoid sudden scaling jumps
        const smoothedMaxVals = baseMaxVals.map((_, idx) => {
            const start = Math.max(0, idx - localWindow);
            const end = Math.min(baseMaxVals.length - 1, idx + localWindow);
            let sum = 0;
            for (let i = start; i <= end; i++) {
                sum += baseMaxVals[i];
            }
            return sum / (end - start + 1);
        });

        const minDistSq = 0.5;

        channels.forEach(ch => {
            const data = ch.data;
            if (!data || data.length === 0) return;
            
            ctx.beginPath();
            ctx.strokeStyle = ch.color;
            ctx.lineWidth = 1;

            let lastDrawX = -1;
            let lastDrawY = -1;

            baseMapping.forEach(({ baseX, startPt, range }, mappingIdx) => {
                const localMax = smoothedMaxVals[mappingIdx] || 10;
                const scaleY = (h * 0.65) / localMax;

                for (let p = 0; p < range; p++) {
                    const idx = Math.floor(startPt + p);
                    if (idx < 0 || idx >= data.length) continue;
                    
                    const val = data[idx] || 0;
                    const px = baseX + (p * charWidth / range);
                    const py = h - (val * scaleY);
                    
                    if (lastDrawX === -1) {
                        ctx.moveTo(px, py);
                        lastDrawX = px;
                        lastDrawY = py;
                    } else {
                        const dx = px - lastDrawX;
                        const dy = py - lastDrawY;
                        if (dx * dx + dy * dy > minDistSq) {
                            ctx.lineTo(px, py);
                            lastDrawX = px;
                            lastDrawY = py;
                        }
                    }
                }
            });
            ctx.stroke();
        });
        canvas.setAttribute('data-rendered', 'true');
    }, [baseMapping, trace.g, trace.a, trace.t, trace.c, charWidth, gappedQuery, absQueryStart, dpr, w, h]);

    return (
        <canvas 
            ref={canvasRef} 
            width={w * dpr}
            height={h * dpr}
            style={{ 
                position: 'absolute', 
                left: `${offset * charWidth}px`, 
                top: 0, 
                width: `${w}px`,
                height: `${h}px`, 
                opacity: 0.8, 
                pointerEvents: 'none',
                transition: 'opacity 0.1s ease-in'
            }} 
        />
    );
});

