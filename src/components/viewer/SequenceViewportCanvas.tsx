/**
 * 学習メモ: 配列ビュー内のSequenceViewportCanvas要素を描画し、必要なポインター操作を親へ通知するReactコンポーネント。
 * 処理の位置づけ: 親コンポーネントからデータとコールバックを受け取り、描画と操作通知を担当する。
 */

import React, { useRef, useEffect } from 'react';
import { RowMetrics, AppSettings } from '../../types';
import { renderingManager } from '../../utils/renderingManager';

interface SequenceViewportCanvasProps {
    visibleRows: number[];
    rowLayoutRows: RowMetrics[];
    sequenceCache: Map<number, string>;
    charsPerRow: number;
    charWidth: number;
    settings: AppSettings;
    isDark: boolean;
    scrollTop: number;
    containerHeight: number;
    viewportWidth: number;
    totalHeight: number;
}

export const SequenceViewportCanvas: React.FC<SequenceViewportCanvasProps> = ({
    visibleRows,
    rowLayoutRows,
    sequenceCache,
    charsPerRow,
    charWidth,
    settings,
    isDark,
    scrollTop,
    containerHeight,
    viewportWidth,
    totalHeight
}) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const transferredRef = useRef(false);
    
    // We use a "Window" that is larger than the viewport to allow native scrolling sync.
    // The canvas moves only when we scroll past a certain threshold.
    const windowHeight = Math.min(containerHeight * 2, totalHeight - (Math.floor(scrollTop / containerHeight) * containerHeight));
    const windowOffset = Math.floor(scrollTop / containerHeight) * containerHeight;

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const dpr = window.devicePixelRatio || 1;
        
        let offscreen: OffscreenCanvas | null = null;
        if (!transferredRef.current) {
            try {
                offscreen = canvas.transferControlToOffscreen();
                transferredRef.current = true;
            } catch (err) {
                console.warn("Viewport Canvas transfer failed", err);
            }
        }

        // Prepare data for all rows that fall within the current window
        const seqHeight = settings.fontSize * 2.5;
        const rowsData = visibleRows.map(idx => {
            const row = rowLayoutRows[idx];
            const rowStr = sequenceCache.get(idx) || " ".repeat(charsPerRow);
            return {
                y: Math.round(row.offset - windowOffset + row.seqY + (seqHeight / 2)),
                seqY: 0, // Already added to y above
                rowStr
            };
        });

        renderingManager.renderViewport(offscreen, {
            width: viewportWidth,
            height: windowHeight,
            dpr,
            isDark,
            settings,
            charWidth,
            rows: rowsData
        });

    }, [windowOffset, visibleRows, rowLayoutRows, sequenceCache, charsPerRow, charWidth, settings, isDark, containerHeight, viewportWidth]);

    return (
        <canvas
            ref={canvasRef}
            style={{
                position: 'absolute',
                top: `${windowOffset}px`,
                left: 0,
                width: '100%',
                height: `${windowHeight}px`,
                pointerEvents: 'none',
                zIndex: 1,
                display: 'block'
            }}
        />
    );
};
