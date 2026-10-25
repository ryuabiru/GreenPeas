/**
 * 学習メモ: アプリの主要レイアウト内でWorkspaceViewer領域を構成し、ストアの状態とユーザー操作を接続するReactコンポーネント。
 * 処理の位置づけ: 親コンポーネントからデータとコールバックを受け取り、描画と操作通知を担当する。
 */

import React from 'react';
import { SequenceViewer } from '../SequenceViewer';
import { MapViewer } from '../MapViewer';
import { AlignmentViewer } from '../AlignmentViewer';

import { SequenceData, Selection, RestrictionSite, Annotation, Primer, AppSettings } from '../../types';
import * as api from '../../api';
import { useUiStore } from '../../store/useUiStore';
import { FilePlus2, FolderOpen, Upload } from 'lucide-react';

interface WorkspaceViewerProps {
    activeTab: 'sequence' | 'map' | 'alignment';
    currentSequence: SequenceData | null;
    sequences: SequenceData[];
    selection: Selection | null;
    setSelection: (s: Selection | null | ((prev: Selection | null) => Selection | null)) => void;
    restrictionSites: RestrictionSite[];
    enzymeCounts: Record<string, number>;
    annotationTracks: Record<string, number>;
    maxCuts: number;
    setMaxCuts: (cuts: number) => void;
    currentTopology: 'Linear' | 'Circular';
    onToggleTopology: () => void;
    appSettings: AppSettings;
    darkMode: boolean;
    lastJumpTime: number;
    hoveredEnzyme: RestrictionSite | null;
    setHoveredEnzyme: (e: RestrictionSite | null) => void;
    hoveredPrimer: any | null;
    setHoveredPrimer: (p: any | null) => void;
    hoveredAnnotation: Annotation | null;
    onHoverAnnotation: (a: Annotation | null) => void;
    loading: boolean;
    allTraces: Record<string, any>;
    allAlignments: Record<string, any[]>;

    handleEditAnnotation: (ann: Annotation) => void;
    handleEditPrimer: (primer: Primer) => void;
    handleSequenceEdit: (start: number, len: number, text: string) => void;
    handleContextMenu: (e: React.MouseEvent) => void;
    handlePaste: (opt?: any) => void;
    handleCopy: () => void;
    handleCut: () => void;
    handleSelectAll: () => void;
    setAlignmentVisibility: (id: string, visibility: any) => void;
    alignmentVisibility: Record<string, any>;
    setAllTraces: (id: string, trace: any) => void;
    onOpenFile: () => void;
    onCreateSequence: () => void;
}

export const WorkspaceViewer: React.FC<WorkspaceViewerProps> = React.memo(({
    activeTab, currentSequence, selection, setSelection,
    restrictionSites, enzymeCounts, annotationTracks,
    maxCuts, setMaxCuts, currentTopology, onToggleTopology, appSettings, darkMode, lastJumpTime,
    hoveredEnzyme, setHoveredEnzyme, hoveredPrimer, setHoveredPrimer, hoveredAnnotation, onHoverAnnotation, loading, allTraces, allAlignments,

    handleEditAnnotation, handleEditPrimer, handleSequenceEdit, handleContextMenu,
    handlePaste, handleCopy, handleCut, handleSelectAll,
    setAlignmentVisibility, alignmentVisibility, setAllTraces,
    onOpenFile, onCreateSequence
}) => {
    const viewerRef = React.useRef<HTMLDivElement>(null);
    if (!currentSequence) {
        return (
            <main className="empty-workspace" aria-labelledby="empty-workspace-title">
                <div className="empty-workspace-card">
                    <div className="empty-workspace-icon" aria-hidden="true"><Upload size={28} /></div>
                    <h1 id="empty-workspace-title">Start with a DNA sequence</h1>
                    <p>Open an existing file, create a sequence, or drop supported files anywhere in this window.</p>
                    <div className="empty-workspace-actions">
                        <button className="empty-primary-action" onClick={onOpenFile}>
                            <FolderOpen size={18} /> Open Sequence File
                        </button>
                        <button className="empty-secondary-action" onClick={onCreateSequence}>
                            <FilePlus2 size={18} /> New Sequence
                        </button>
                    </div>
                    <div className="empty-workspace-formats">
                        <span>Supported formats</span>
                        <strong>GenBank</strong><strong>FASTA</strong><strong>SnapGene DNA</strong><strong>AB1</strong><strong>GreenPeas</strong>
                    </div>
                    <p className="empty-workspace-note">Your files stay on this computer. GreenPeas does not upload sequence data. Keep a separate backup of important lab data during this beta.</p>
                </div>
            </main>
        );
    }

    return (
        <div className="viewer-container" ref={viewerRef} tabIndex={0} style={{ flexGrow: 1, position: 'relative', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            {loading && <div className="loading-overlay">Loading...</div>}

            {/* Contextual controls for sequence and map views */}
            {(activeTab === 'sequence' || activeTab === 'map') && (
                <div className="sub-toolbar" style={{ padding: '8px 16px', borderBottom: '1px solid var(--border)', background: 'var(--bg-sidebar)', display: 'flex', alignItems: 'center', gap: '15px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase' }}>Topology:</span>
                        <div style={{ display: 'flex', background: 'var(--bg-app)', borderRadius: '6px', padding: '2px', border: '1px solid var(--border)' }}>
                            <button
                                onClick={() => currentTopology === 'Circular' && onToggleTopology()}
                                style={{
                                    padding: '4px 10px',
                                    fontSize: '0.7rem',
                                    borderRadius: '4px',
                                    border: 'none',
                                    background: currentTopology === 'Linear' ? '#3b82f6' : 'transparent',
                                    color: currentTopology === 'Linear' ? '#fff' : 'var(--text-muted)',
                                    cursor: 'pointer',
                                    fontWeight: 600
                                }}
                            >
                                Linear
                            </button>
                            <button
                                onClick={() => currentTopology === 'Linear' && onToggleTopology()}
                                style={{
                                    padding: '4px 10px',
                                    fontSize: '0.7rem',
                                    borderRadius: '4px',
                                    border: 'none',
                                    background: currentTopology === 'Circular' ? '#3b82f6' : 'transparent',
                                    color: currentTopology === 'Circular' ? '#fff' : 'var(--text-muted)',
                                    cursor: 'pointer',
                                    fontWeight: 600
                                }}
                            >
                                Circular
                            </button>
                        </div>
                    </div>
                    <div style={{ height: '16px', width: '1px', background: 'var(--border)' }} />
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase' }}>Enzyme Filter:</span>
                        <select
                            value={maxCuts}
                            onChange={(e) => setMaxCuts(Number(e.target.value))}
                            style={{ fontSize: '0.75rem', padding: '2px 8px', borderRadius: '4px', border: '1px solid var(--border)', background: 'var(--bg-app)', color: 'var(--text-main)' }}
                        >
                            <option value={1000}>Show All</option>
                            {[1, 2, 3, 5].map(v => (
                                <option key={v} value={v}>
                                    {v === 1 ? 'Unique' : v === 2 ? 'Double' : v === 3 ? 'Rare' : 'Frequent'} Cutters (≤ {v})
                                </option>
                            ))}
                        </select>
                    </div>
                </div>
            )}

            <div className="viewer-content" style={{ display: 'flex', flexDirection: 'column', flexGrow: 1, position: 'relative', overflow: 'hidden', minHeight: 0 }}>
                {activeTab === 'sequence' && (
                    <SequenceViewer
                        sequenceData={currentSequence}
                        onSelectionChange={setSelection}
                        selection={selection}
                        annotations={(currentSequence.annotations || []).filter(a => a.type !== 'source')}
                        primers={currentSequence.primers || []}
                        restrictionSites={restrictionSites}
                        annotationTracks={annotationTracks}
                        excludedEnzymes={[]}
                        enzymeCounts={enzymeCounts}
                        maxCuts={maxCuts}
                        onEditAnnotation={handleEditAnnotation}
                        onEditPrimer={handleEditPrimer}
                        hoveredEnzyme={hoveredEnzyme}
                        onHoverEnzyme={setHoveredEnzyme}
                        hoveredPrimer={hoveredPrimer}
                        onHoverPrimer={setHoveredPrimer}
                        hoveredAnnotation={hoveredAnnotation}
                        onHoverAnnotation={onHoverAnnotation}
                        onContextMenu={handleContextMenu}
                        onPaste={handlePaste}
                        onEdit={handleSequenceEdit}
                        onCopy={handleCopy}
                        onCut={handleCut}
                        onSelectAll={handleSelectAll}
                        settings={appSettings}
                        isDark={darkMode}
                        lastJumpTime={lastJumpTime}
                    />
                )}
                {activeTab === 'map' && (
                    <MapViewer
                        sequence={currentSequence.sequence}
                        restrictionSites={restrictionSites}
                        excludedEnzymes={[]}
                        annotations={(currentSequence.annotations || []).filter(a => a.type !== 'source')}
                        primers={currentSequence.primers || []}
                        enzymeCounts={enzymeCounts}
                        annotationTracks={annotationTracks}
                        onEditAnnotation={handleEditAnnotation}
                        onSelectAnnotation={(ann) => {
                            useUiStore.getState().setSelectedFeatureId(ann.id);
                            viewerRef.current?.focus();
                        }}
                        onEditPrimer={handleEditPrimer}
                        isDark={darkMode}
                        topology={currentSequence.topology}
                        hoveredEnzyme={hoveredEnzyme}
                        onHoverEnzyme={setHoveredEnzyme}
                        selection={selection}
                        onSelectionChange={setSelection}
                        maxCuts={maxCuts}
                    />
                )}
                {activeTab === 'alignment' && (
                    <AlignmentViewer
                        template={currentSequence}
                        results={allAlignments[currentSequence.id] || []}
                        allTraces={allTraces}
                        onFetchTrace={async (id: string, path: string) => {
                            if (allTraces[id]) return;
                            const trace = await api.getTraceData(path);
                            if (trace) setAllTraces(id, trace);
                        }}
                        isDark={darkMode}
                        trackSettings={alignmentVisibility[currentSequence.id] || {}}
                        setTrackSettings={(v) => setAlignmentVisibility(currentSequence.id, v)}
                        onEditReference={handleSequenceEdit}
                    />
                )}
            </div>
        </div>
    );
});
