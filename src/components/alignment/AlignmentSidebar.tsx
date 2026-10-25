/**
 * 学習メモ: アラインメント画面のAlignmentSidebar部分を描画し、親ビューから渡されたデータと操作を扱うReactコンポーネント。
 * 処理の位置づけ: 親コンポーネントからデータとコールバックを受け取り、描画と操作通知を担当する。
 */

import React from 'react';
import { AlignmentResult, AlignmentTrackSettings, ChromTrace } from '../../types';

interface AlignmentSidebarProps {
    visibleTrackIndices: number[];
    results: AlignmentResult[];
    trackLayout: { height: number, top: number, visible: boolean, totalHeight: number }[];
    trackSettings: Record<number, AlignmentTrackSettings>;
    setTrackSettings: (v: Record<number, AlignmentTrackSettings> | ((prev: Record<number, AlignmentTrackSettings>) => Record<number, AlignmentTrackSettings>)) => void;
    allTraces: Record<string, ChromTrace>;
    onFetchTrace: (id: string, path: string) => void;
    totalTracksHeight: number;
    labelsScrollSyncRef: React.RefObject<HTMLDivElement | null>;
}

export const AlignmentSidebar: React.FC<AlignmentSidebarProps> = React.memo(({
    visibleTrackIndices, results, trackLayout, trackSettings, setTrackSettings, allTraces, onFetchTrace, totalTracksHeight, labelsScrollSyncRef
}) => {
    return (
        <div ref={labelsScrollSyncRef} style={{ width: '180px', flexShrink: 0, borderRight: '1px solid var(--border)', background: 'var(--bg-app)', overflow: 'hidden', display: 'flex', flexDirection: 'column', boxSizing: 'border-box' }}>
            <div style={{ height: `${totalTracksHeight}px`, position: 'relative', paddingTop: '20px', paddingBottom: '100px' }}>
                {visibleTrackIndices.map((ridx) => {
                    const res = results[ridx];
                    const layout = trackLayout[ridx];
                    const settings = trackSettings[ridx] || { visible: true, expanded: false, hideSeq: false };
                    const isExpanded = settings.expanded;
                    const isSeqHidden = settings.hideSeq;
                    const data = res.data;
                    if (!data || typeof data.id !== 'string' || data.id.length === 0 || typeof data.sequence !== 'string' || data.sequence.length === 0) {
                        return null;
                    }
                    
                    return (
                        <div key={ridx} style={{ position: 'absolute', top: `${layout.top}px`, left: 0, right: 0, height: `${layout.height}px`, padding: '0 12px', display: 'flex', flexDirection: 'column', justifyContent: 'flex-start' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', overflow: 'hidden' }}>
                                <span style={{ fontSize: '0.85rem', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{data.id}</span>
                                <span style={{ fontSize: '0.5rem', opacity: 0.5 }}>{res.strand === "Forward" ? 'FWD' : 'REV'}</span>
                            </div>
                            <div style={{ display: 'flex', gap: '4px', marginTop: '4px' }}>
                                <button onClick={() => setTrackSettings(prev => ({ ...prev, [ridx]: { ...(prev[ridx] || { visible: true, expanded: false, hideSeq: false }), hideSeq: !isSeqHidden } }))} style={{ fontSize: '8px', padding: '1px 4px', borderRadius: '3px', border: '1px solid #10b981', background: !isSeqHidden ? '#10b981' : 'transparent', color: !isSeqHidden ? '#fff' : '#10b981', cursor: 'pointer' }}>Seq</button>
                                <button onClick={() => { if (!allTraces[data.id]) onFetchTrace(data.id, data.file_path || ''); setTrackSettings(prev => ({ ...prev, [ridx]: { ...(prev[ridx] || { visible: true, expanded: false, hideSeq: false }), expanded: !isExpanded } })); }} disabled={isSeqHidden} style={{ fontSize: '8px', padding: '1px 4px', borderRadius: '3px', border: `1px solid ${isSeqHidden ? 'var(--border)' : '#3b82f6'}`, background: isSeqHidden ? 'transparent' : (isExpanded ? '#3b82f6' : 'transparent'), color: isSeqHidden ? 'var(--text-muted)' : (isExpanded ? '#fff' : '#3b82f6'), cursor: isSeqHidden ? 'not-allowed' : 'pointer' }}>Trace</button>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
});
