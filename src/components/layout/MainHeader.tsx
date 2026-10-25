/**
 * 学習メモ: アプリの主要レイアウト内でMainHeader領域を構成し、ストアの状態とユーザー操作を接続するReactコンポーネント。
 * 処理の位置づけ: 親コンポーネントからデータとコールバックを受け取り、描画と操作通知を担当する。
 */

import React from "react";
import { SequenceData, AlignmentResult } from "../../types";

interface MainHeaderProps {
    currentSequence: SequenceData | null;
    activeTab: 'sequence' | 'map' | 'alignment';
    setActiveTab: (tab: 'sequence' | 'map' | 'alignment') => void;
    selectionInfo: {
        active: boolean;
        start: number;
        end: number;
        len: number;
        tm: number;
    };
    allAlignments: Record<string, AlignmentResult[]>;
    onSave: () => void;
    onSaveAs: () => void;
    onExport: (format: 'fasta' | 'gbk' | 'gp') => void;
    isExportMenuOpen: boolean;
    setIsExportMenuOpen: (open: boolean) => void;
    isDirty: boolean;
    saveState: 'idle' | 'saving' | 'saved' | 'error';
}

export const MainHeader: React.FC<MainHeaderProps> = ({
    currentSequence,
    activeTab,
    setActiveTab,
    selectionInfo,
    allAlignments,
    onSave,
    onSaveAs,
    onExport,
    isExportMenuOpen,
    setIsExportMenuOpen,
    isDirty,
    saveState
}) => {
    return (
        <div className="header">
            <div className="file-info">
                {currentSequence ? (
                    <>
                        <span className="file-id-text" title={currentSequence.id}>
                            {currentSequence.id}{isDirty ? ' •' : ''}
                        </span>
                        <span style={{ fontSize: '0.8rem', opacity: 0.7, whiteSpace: 'nowrap' }}>{currentSequence.sequence.length.toLocaleString()} bp</span>
                        <span
                            role="status"
                            style={{
                                fontSize: '0.72rem',
                                color: saveState === 'error' ? '#ef4444' : saveState === 'saved' ? '#10b981' : 'var(--text-muted)',
                                whiteSpace: 'nowrap'
                            }}
                        >
                            {saveState === 'saving' ? 'Saving…' : saveState === 'saved' ? 'Saved' : saveState === 'error' ? 'Save failed' : isDirty ? 'Unsaved' : ''}
                        </span>
                    </>
                ) : (<span>No file open</span>)}
            </div>

            <div role="tablist" aria-label="Sequence views" className="tabs" style={{ display: 'flex', gap: '2px', background: 'var(--bg-app)', padding: '4px', borderRadius: '8px', alignItems: 'center', flexWrap: 'nowrap' }}>
                <button role="tab" aria-selected={activeTab === 'sequence'} onClick={() => setActiveTab('sequence')} style={{ padding: '6px 20px', fontSize: '0.85rem', background: activeTab === 'sequence' ? 'var(--bg-sidebar)' : 'transparent', borderRadius: '6px', border: 'none', color: activeTab === 'sequence' ? '#3b82f6' : 'var(--text-muted)', boxShadow: activeTab === 'sequence' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none', fontWeight: activeTab === 'sequence' ? 'bold' : 'normal' }}>Sequence</button>
                <button role="tab" aria-selected={activeTab === 'map'} onClick={() => setActiveTab('map')} style={{ padding: '6px 20px', fontSize: '0.85rem', background: activeTab === 'map' ? 'var(--bg-sidebar)' : 'transparent', borderRadius: '6px', border: 'none', color: activeTab === 'map' ? '#3b82f6' : 'var(--text-muted)', boxShadow: activeTab === 'map' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none', fontWeight: activeTab === 'map' ? 'bold' : 'normal' }}>Map</button>
                {currentSequence && allAlignments[currentSequence.id] && allAlignments[currentSequence.id].length > 0 && (
                    <button role="tab" aria-selected={activeTab === 'alignment'} onClick={() => setActiveTab('alignment')} style={{ padding: '6px 20px', fontSize: '0.85rem', background: activeTab === 'alignment' ? 'var(--bg-sidebar)' : 'transparent', borderRadius: '6px', border: 'none', color: activeTab === 'alignment' ? '#34d399' : 'var(--text-muted)', boxShadow: activeTab === 'alignment' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none', fontWeight: activeTab === 'alignment' ? 'bold' : 'normal' }}>Alignment</button>
                )}
            </div>

            <div className="header-actions" style={{ display: 'flex', alignItems: 'center', gap: '8px', justifySelf: 'end', flexWrap: 'nowrap', justifyContent: 'flex-end' }}>
                <div style={{ fontSize: '0.75rem', backgroundColor: 'var(--bg-app)', padding: '5px 12px', borderRadius: '8px', color: selectionInfo.active ? '#60a5fa' : 'var(--text-muted)', display: 'flex', gap: '12px', border: '1px solid var(--border)', whiteSpace: 'nowrap' }}>
                    <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                        <span style={{ color: 'var(--text-muted)', fontSize: '0.6rem', textTransform: 'uppercase' }}>Pos</span>
                        <span style={{ fontWeight: 600 }}>{selectionInfo.active ? `${selectionInfo.start}..${selectionInfo.end}` : '--'}</span>
                    </div>
                    <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                        <span style={{ color: 'var(--text-muted)', fontSize: '0.6rem', textTransform: 'uppercase' }}>Len</span>
                        <span style={{ fontWeight: 600 }}>{selectionInfo.active ? `${selectionInfo.len} bp` : '--'}</span>
                    </div>
                    {selectionInfo.active && (
                        <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                            <span style={{ color: 'var(--text-muted)', fontSize: '0.6rem', textTransform: 'uppercase' }}>Tm</span>
                            <span style={{ fontWeight: 600 }}>{selectionInfo.tm.toFixed(1)}°C</span>
                        </div>
                    )}
                </div>
                {currentSequence && (
                    <div style={{ display: 'flex', gap: '4px' }}>
                        <button
                            onClick={onSave}
                            style={{
                                padding: '6px 12px',
                                fontSize: '0.75rem',
                                backgroundColor: 'var(--bg-app)',
                                color: 'var(--text-main)',
                                border: '1px solid var(--border)',
                                borderRadius: '4px',
                                cursor: 'pointer'
                            }}
                        >
                            Save
                        </button>
                        <div className="export-group" style={{ position: 'relative' }}>
                                <button
                                    aria-haspopup="menu"
                                    aria-expanded={isExportMenuOpen}
                                    style={{ padding: '6px 10px', fontSize: '0.75rem', backgroundColor: '#10b981', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
                                    onClick={() => setIsExportMenuOpen(!isExportMenuOpen)}
                                >Export… ▾</button>
                                {isExportMenuOpen && (
                                    <div role="menu" className="dropdown-menu" style={{ position: 'absolute', right: 0, top: '100%', marginTop: '4px', background: 'var(--bg-sidebar)', border: '1px solid var(--border)', borderRadius: '6px', boxShadow: '0 8px 20px rgba(0,0,0,0.18)', zIndex: 1000, minWidth: '250px', padding: '4px' }}>
                                        <button role="menuitem" onClick={onSaveAs} style={{ width: '100%', padding: '9px 10px', textAlign: 'left', background: 'none', border: 'none', color: 'var(--text-main)', fontSize: '0.8rem', cursor: 'pointer' }}><strong>Save As…</strong><br/><span style={{ color: 'var(--text-muted)', fontSize: '0.7rem' }}>Choose a new working file</span></button>
                                        <div style={{ height: '1px', background: 'var(--border)', margin: '4px 0' }}></div>
                                        <button role="menuitem" onClick={() => onExport('gbk')} style={{ width: '100%', padding: '9px 10px', textAlign: 'left', background: 'none', border: 'none', color: 'var(--text-main)', fontSize: '0.8rem', cursor: 'pointer' }}><strong>Export GenBank</strong><br/><span style={{ color: 'var(--text-muted)', fontSize: '0.7rem' }}>Sequence, features, and primers</span></button>
                                        <button role="menuitem" onClick={() => onExport('fasta')} style={{ width: '100%', padding: '9px 10px', textAlign: 'left', background: 'none', border: 'none', color: 'var(--text-main)', fontSize: '0.8rem', cursor: 'pointer' }}><strong>Export FASTA</strong><br/><span style={{ color: 'var(--text-muted)', fontSize: '0.7rem' }}>Sequence only</span></button>
                                        <button role="menuitem" onClick={() => onExport('gp')} style={{ width: '100%', padding: '9px 10px', textAlign: 'left', background: 'none', border: 'none', color: 'var(--text-main)', fontSize: '0.8rem', cursor: 'pointer' }}><strong>Export GreenPeas copy</strong><br/><span style={{ color: 'var(--text-muted)', fontSize: '0.7rem' }}>Complete GreenPeas workspace data</span></button>
                                    </div>
                                )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};
