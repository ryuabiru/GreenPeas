/**
 * 学習メモ: アラインメント画面のAlignmentTrackRow部分を描画し、親ビューから渡されたデータと操作を扱うReactコンポーネント。
 * 処理の位置づけ: 親コンポーネントからデータとコールバックを受け取り、描画と操作通知を担当する。
 */

import React, { useMemo } from 'react';
import { AlignmentResult, ChromTrace, AlignmentTrackSettings } from '../../types';
import { AlignmentCoordinateEngine } from '../../utils/AlignmentCoordinateEngine';
import { AlignedSequenceCanvas } from './AlignedSequenceCanvas.tsx';
import { TraceCanvas } from './TraceCanvas.tsx';

interface AlignmentTrackRowProps {
    ridx: number;
    res: AlignmentResult;
    layout: { height: number, top: number, totalHeight: number };
    settings: AlignmentTrackSettings;
    startIdx: number;
    endIdx: number;
    charWidth: number;
    isDark?: boolean;
    allTraces: Record<string, ChromTrace>;
    reversedTraces: Record<string, ChromTrace>;
    engine: AlignmentCoordinateEngine;
}

const CHUNK_SIZE = 500; // Increased from 200 for better performance

export const AlignmentTrackRow: React.FC<AlignmentTrackRowProps> = React.memo(({
    ridx, res, layout, settings, startIdx, endIdx, charWidth, isDark, 
    allTraces, reversedTraces, engine 
}) => {
    const isExpanded = settings.expanded;
    const isSeqHidden = settings.hideSeq;
    const data = res.data;
    if (!data || typeof data.id !== 'string' || data.id.length === 0 || typeof data.sequence !== 'string' || data.sequence.length === 0) {
        return null;
    }

    // Calculate which chunks are visible based on the throttled startIdx/endIdx
    const visibleChunks = useMemo(() => {
        const chunks = [];
        const startChunk = Math.floor(startIdx / CHUNK_SIZE);
        const endChunk = Math.floor(endIdx / CHUNK_SIZE);
        
        for (let i = startChunk; i <= endChunk; i++) {
            chunks.push(i);
        }
        return chunks;
    }, [startIdx, endIdx]);

    // Layer A: Background Grid using CSS
    const gridStyle: React.CSSProperties = {
        position: 'absolute',
        top: '25px', // Below the label spacer
        left: 0,
        right: 0,
        height: '22px',
        backgroundImage: `linear-gradient(90deg, var(--border) 1px, transparent 1px)`,
        backgroundSize: `${charWidth}px 100%`,
        pointerEvents: 'none',
        opacity: isDark ? 0.2 : 0.4,
    };

    return (
        <div style={{ position: 'absolute', top: `${layout.top}px`, left: 0, right: 0, height: `${layout.height}px` }}>
            <div style={{ height: '25px', display: 'flex', alignItems: 'center' }}>
                <span style={{ fontSize: '0.85rem', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{data.id}</span>
            </div>
            
            {/* Background Grid Layer */}
            {!isSeqHidden && <div style={gridStyle} />}

            {!isSeqHidden && (
                <>
                    <div style={{ position: 'relative', height: '22px' }}>
                        {visibleChunks.map(chunkIdx => {
                            const cStart = chunkIdx * CHUNK_SIZE;
                            const cEnd = Math.min(engine.globalLength, (chunkIdx + 1) * CHUNK_SIZE);
                            const { slice } = engine.getRowSlice(ridx, cStart, cEnd);
                            const refSlice = engine.getRefSlice(cStart, cEnd);
                            
                            return (
                                <AlignedSequenceCanvas 
                                    key={chunkIdx}
                                    sequence={slice} 
                                    comparison={refSlice} 
                                    offset={cStart} 
                                    isDark={isDark} 
                                    isQuery={true} 
                                    charWidth={charWidth} 
                                />
                            );
                        })}
                    </div>
                    {isExpanded && (allTraces[data.id] || reversedTraces[data.id]) && (
                        <div style={{ height: '90px', marginTop: '4px', background: isDark ? 'rgba(0,0,0,0.2)' : 'rgba(0,0,0,0.03)', borderRadius: '4px', border: '1px solid var(--border)', overflow: 'hidden', position: 'relative' }}>
                            {visibleChunks.map(chunkIdx => {
                                const cStart = chunkIdx * CHUNK_SIZE;
                                const cEnd = Math.min(engine.globalLength, (chunkIdx + 1) * CHUNK_SIZE);
                                const { slice, absQueryStart } = engine.getRowSlice(ridx, cStart, cEnd);
                                const trace = res.strand === "Reverse" ? reversedTraces[data.id] : allTraces[data.id];
                                if (!trace) return null;

                                return (
                                    <TraceCanvas 
                                        key={`${chunkIdx}-${data.id}-${trace.g?.length}`}
                                        trace={trace} 
                                        absQueryStart={absQueryStart} 
                                        charWidth={charWidth} 
                                        queryLen={data.sequence.length} 
                                        strand={res.strand} 
                                        gappedQuery={slice} 
                                        offset={cStart} 
                                    />
                                );
                            })}
                        </div>
                    )}
                </>
            )}
        </div>
    );
});
