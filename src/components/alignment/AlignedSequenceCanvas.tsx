/**
 * 学習メモ: アラインメント画面のAlignedSequenceCanvas部分を描画し、親ビューから渡されたデータと操作を扱うReactコンポーネント。
 * 処理の位置づけ: 親コンポーネントからデータとコールバックを受け取り、描画と操作通知を担当する。
 */

import React, { useRef } from 'react';

interface AlignedSequenceCanvasProps {
    sequence: string;
    comparison: string;
    offset: number;
    isDark?: boolean;
    isQuery?: boolean;
    isHeader?: boolean;
    charWidth: number;
}

export const AlignedSequenceCanvas: React.FC<AlignedSequenceCanvasProps> = React.memo(({ 
    sequence, comparison, offset, isDark, isQuery, isHeader, charWidth 
}) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);

    const dpr = window.devicePixelRatio || 1;
    const width = sequence.length * charWidth;
    const height = 22;
    const pixelWidth = Math.ceil(width);

    React.useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.scale(dpr, dpr);
        // Always clear before redraw to avoid stale glyph artifacts after hide/show toggles.
        ctx.clearRect(0, 0, pixelWidth, height);

        const fontSize = 16;
        const fontStyle = `bold ${fontSize}px ui-monospace, Menlo, Monaco, "Cascadia Mono", monospace`;
        ctx.font = fontStyle;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        const mismatchColor = isDark ? '#f87171' : '#dc2626';
        const mainTextColor = isDark ? '#e5e7eb' : '#1f2937';
        const mutedTextColor = isDark ? '#94a3b8' : '#4b5563';

        for (let i = 0; i < sequence.length; i++) {
            const char = sequence[i];
            const comp = comparison[i];
            const match = (char === comp) || (char === ' ');
            const isMismatch = !match && isQuery;
            
            const x = i * charWidth + (charWidth / 2);
            const y = height / 2;

            if (isMismatch) {
                ctx.fillStyle = mismatchColor;
                ctx.globalAlpha = 1.0;
            } else {
                ctx.fillStyle = isHeader ? mainTextColor : mutedTextColor;
                ctx.globalAlpha = isQuery ? 0.6 : 1.0;
            }

            if (char !== ' ') {
                ctx.fillText(char, x, y);
            }
        }
        canvas.setAttribute('data-rendered', 'true');
    }, [sequence, comparison, isDark, isQuery, isHeader, charWidth, offset, dpr, pixelWidth, height]);

    return (
        <canvas 
            ref={canvasRef} 
            width={pixelWidth * dpr}
            height={height * dpr}
            style={{ 
                display: 'block', 
                position: 'absolute',
                left: `${Math.round(offset * charWidth)}px`,
                top: isHeader ? '5px' : '0',
                width: `${pixelWidth}px`,
                height: `${height}px`,
                pointerEvents: 'none',
                // Optional: Fade in to avoid flash
                transition: 'opacity 0.1s ease-in'
            }} 
        />
    );
});
