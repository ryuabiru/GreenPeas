/**
 * 学習メモ: アラインメント画面のAlignmentHeader部分を描画し、親ビューから渡されたデータと操作を扱うReactコンポーネント。
 * 処理の位置づけ: 親コンポーネントからデータとコールバックを受け取り、描画と操作通知を担当する。
 */

import React, { useMemo } from 'react';
import { Annotation } from '../../types';
import { AlignmentCoordinateEngine } from '../../utils/AlignmentCoordinateEngine';
import { AlignedSequenceCanvas } from './AlignedSequenceCanvas.tsx';
import { decodeHtmlEntities } from '../../utils/textUtils';

interface AlignmentHeaderProps {
    engine: AlignmentCoordinateEngine;
    startIdx: number;
    endIdx: number;
    charWidth: number;
    isDark?: boolean;
    tieredAnnotations: Annotation[][];
    maxLayerUsed: number;
    onEditReference?: (start: number, len: number, text: string) => void;
}

const CHUNK_SIZE = 500;

export const AlignmentHeader: React.FC<AlignmentHeaderProps> = React.memo(({
    engine, startIdx, endIdx, charWidth, isDark, tieredAnnotations, maxLayerUsed, onEditReference
}) => {
    const visibleChunks = useMemo(() => {
        const chunks = [];
        const startChunk = Math.floor(startIdx / CHUNK_SIZE);
        const endChunk = Math.floor(endIdx / CHUNK_SIZE);
        for (let i = startChunk; i <= endChunk; i++) {
            chunks.push(i);
        }
        return chunks;
    }, [startIdx, endIdx]);

    const coordinateLabels = useMemo(() => {
        const labels = [];
        const pStart = engine.findTemplateIndexForGlobal(Math.max(0, startIdx - 50));
        const pEnd = engine.findTemplateIndexForGlobal(Math.min(engine.globalLength, endIdx + 50));
        
        for (let p = pStart; p <= pEnd; p++) {
            if (p % 10 === 0) {
                const gIdx = engine.mapAbsoluteToGlobal[p] + engine.maxGaps[p];
                if (gIdx >= startIdx - 50 && gIdx <= endIdx + 50) {
                    labels.push(
                        <div key={p} style={{ position: 'absolute', left: `${Math.round(gIdx * charWidth)}px`, fontSize: '9px', color: 'var(--text-muted)', borderLeft: '1px solid var(--border)', paddingLeft: '3px', height: '8px' }}>
                            {p + 1}
                        </div>
                    );
                }
            }
        }
        return labels;
    }, [engine, startIdx, endIdx, charWidth]);

    return (
        <div style={{ width: `${engine.globalLength * charWidth}px`, padding: '10px 0 0 0', position: 'relative', boxSizing: 'border-box' }}>
            {/* Coordinate Labels */}
            <div style={{ position: 'relative', height: '16px', marginBottom: '4px' }}>
                {coordinateLabels}
            </div>

            {/* Chunked Reference Sequence */}
            <div 
                style={{ position: 'relative', height: '30px', cursor: 'pointer' }}
                onDoubleClick={(e) => {
                    const rect = e.currentTarget.getBoundingClientRect();
                    const clickX = e.clientX - rect.left;
                    const globalIdx = Math.floor(clickX / charWidth);
                    const templateIdx = engine.findTemplateIndexForGlobal(globalIdx);
                    if (templateIdx >= 0 && templateIdx < engine.template.sequence.length) {
                        const originalChar = engine.template.sequence[templateIdx];
                        onEditReference?.(templateIdx, 1, originalChar);
                    }
                }}
            >
                <div style={{ position: 'absolute', left: 10, top: 0, zIndex: 10, fontSize: '0.6rem', fontWeight: 800, color: '#3b82f6', letterSpacing: '0.1em' }}>REFERENCE</div>
                {visibleChunks.map(chunkIdx => {
                    const cStart = chunkIdx * CHUNK_SIZE;
                    const cEnd = Math.min(engine.globalLength, (chunkIdx + 1) * CHUNK_SIZE);
                    const refSlice = engine.getRefSlice(cStart, cEnd);
                    return (
                        <AlignedSequenceCanvas 
                            key={chunkIdx}
                            sequence={refSlice} 
                            comparison={refSlice} 
                            offset={cStart} 
                            isDark={isDark} 
                            isHeader={true} 
                            charWidth={charWidth} 
                        />
                    );
                })}
            </div>

            {/* Annotations Layer */}
            <div style={{ position: 'relative', height: `${Math.max(1, maxLayerUsed) * 22}px`, borderTop: '1px dashed var(--border)', paddingTop: '8px' }}>
                {tieredAnnotations.flat().map(ann => {
                    const gStart = engine.mapAbsoluteToGlobal[ann.start] + engine.maxGaps[ann.start];
                    const gEnd = engine.mapAbsoluteToGlobal[ann.end];
                    if (gEnd < startIdx || gStart > endIdx) return null;
                    const left = gStart * charWidth;
                    const width = (gEnd - gStart) * charWidth;
                    const top = (ann as any).level * 22;
                    const color = ann.color || '#3b82f6';
                    return (
                        <div key={ann.id} style={{ position: 'absolute', top: `${top}px`, left: `${left}px`, width: `${width}px`, height: '18px', backgroundColor: `${color}22`, border: `1px solid ${color}`, borderRadius: '3px', fontSize: '9px', display: 'flex', alignItems: 'center', padding: '0 4px', overflow: 'hidden', whiteSpace: 'nowrap', color: color, fontWeight: 600, transition: 'all 0.2s' }}>
                            {decodeHtmlEntities(ann.name)}
                        </div>
                    );
                })}
            </div>
        </div>
    );
});
