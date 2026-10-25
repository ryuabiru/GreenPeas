/**
 * 学習メモ: 配列ビュー内のSequenceRowCanvas要素を描画し、必要なポインター操作を親へ通知するReactコンポーネント。
 * 処理の位置づけ: 親コンポーネントからデータとコールバックを受け取り、描画と操作通知を担当する。
 */

import React, { useRef, useEffect } from 'react';
import { AppSettings } from '../../types';
import { renderingManager } from '../../utils/renderingManager';

interface SequenceRowCanvasProps {
    rowId: string;
    rowStr: string;
    charWidth: number;
    settings: AppSettings;
    isDark: boolean;
    seqHeight: number;
}


export const SequenceRowCanvas: React.FC<SequenceRowCanvasProps> = React.memo(({
    rowId, rowStr, charWidth, settings, isDark, seqHeight
}) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const transferredRef = useRef(false);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const dpr = window.devicePixelRatio || 1;
        const physicalWidth = Math.round(rowStr.length * charWidth * dpr);

        if (physicalWidth > 16384) {
            console.warn(`[DEBUG] Canvas width (${physicalWidth}px) exceeds potential WebKit limit (16384px) for row ${rowId}`);
        }

        let offscreen: OffscreenCanvas | null = null;
        if (!transferredRef.current) {
            try {
                offscreen = canvas.transferControlToOffscreen();
                transferredRef.current = true;
            } catch (err) {
                console.warn("Transfer failed, falling back to synchronous render", err);
            }
        }

        renderingManager.renderRow(rowId, offscreen, {
            rowStr, charWidth, settings, isDark, seqHeight, dpr
        });
    }, [rowStr, charWidth, settings, isDark, seqHeight, rowId, rowStr.length, window.devicePixelRatio]);

    return (
        <canvas
            ref={canvasRef}
            width={Math.round(rowStr.length * charWidth * (window.devicePixelRatio || 1))}
            height={Math.round(seqHeight * (window.devicePixelRatio || 1))}
            style={{
                display: 'block',
                pointerEvents: 'none',
                width: `${rowStr.length * charWidth}px`,
                height: `${seqHeight}px`
            }}
        />
    );
});
