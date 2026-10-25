/**
 * 学習メモ: 配列文字列の軽量Canvas描画を行う。
 * 処理の位置づけ: 親コンポーネントからデータとコールバックを受け取り、描画と操作通知を担当する。
 */

import React, { useRef, useEffect } from 'react';

interface SequenceCanvasProps {
    sequence: string;
    reference?: string; // If provided, highlights mismatches against this
    offset?: number;    // Global offset (for aligned tracks)
    scrollLeft: number;
    viewportWidth: number;
    charWidth: number;
    zoom: number;
    isDark?: boolean;
    height: number;
    showBases?: boolean;
    highlightDiffs?: boolean;
    paddingLeft?: number;
}


export const SequenceCanvas: React.FC<SequenceCanvasProps> = ({ 
    sequence, reference, offset = 0, scrollLeft, viewportWidth, charWidth, zoom, isDark, height, showBases = true, highlightDiffs = false, paddingLeft = 0 
}) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        // Handle Device Pixel Ratio (Retina display support)
        const dpr = window.devicePixelRatio || 1;
        canvas.width = viewportWidth * dpr;
        canvas.height = height * dpr;
        
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.scale(dpr, dpr);
        ctx.clearRect(0, 0, viewportWidth, height);

        const fontSize = Math.floor(zoom * 16);
        ctx.font = `bold ${fontSize}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        const startIdx = Math.max(0, Math.floor(((scrollLeft - paddingLeft) / charWidth) - offset));
        const endIdx = Math.min(sequence.length, Math.ceil(((scrollLeft - paddingLeft + viewportWidth) / charWidth) - offset));

        const diffColor = isDark ? '#f87171' : '#dc2626';
        const diffBg = isDark ? '#450a0a' : '#fee2e2';
        const mainText = isDark ? '#e5e7eb' : '#1f2937';

        for (let i = startIdx; i < endIdx; i++) {
            const base = sequence[i];
            const refBase = reference ? reference[i] : null;
            const isDifferent = highlightDiffs && refBase && base !== refBase;
            const isGap = base === '-';

            const x = paddingLeft + (offset + i) * charWidth - scrollLeft + (charWidth / 2);
            const y = height / 2;

            // 1. Draw Background for mismatches
            if (isDifferent && !isGap) {
                ctx.fillStyle = diffBg;
                ctx.fillRect(x - charWidth / 2, 0, charWidth, height);
            }

            // 2. Draw Base Text
            if (showBases) {
                if (isDifferent) {
                    ctx.fillStyle = diffColor;
                } else {
                    ctx.fillStyle = mainText;
                    if (!reference) ctx.globalAlpha = 1.0;
                    else ctx.globalAlpha = 0.5;
                }
                ctx.fillText(base, x, y);
                ctx.globalAlpha = 1.0;
            }

            // 3. Draw Gap indicator
            if (isGap && highlightDiffs) {
                ctx.strokeStyle = diffColor;
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.moveTo(x - charWidth / 3, height - 2);
                ctx.lineTo(x + charWidth / 3, height - 2);
                ctx.stroke();
            }
        }
    }, [sequence, reference, offset, scrollLeft, viewportWidth, charWidth, zoom, isDark, height, showBases, highlightDiffs]);

    return (
        <canvas 
            ref={canvasRef} 
            style={{ 
                position: 'absolute',
                left: `${scrollLeft}px`,
                top: 0,
                display: 'block',
                width: `${viewportWidth}px`, 
                height: `${height}px`
            }} 
        />
    );
};
