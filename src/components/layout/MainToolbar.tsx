/**
 * 学習メモ: アプリの主要レイアウト内でMainToolbar領域を構成し、ストアの状態とユーザー操作を接続するReactコンポーネント。
 * 処理の位置づけ: 親コンポーネントからデータとコールバックを受け取り、描画と操作通知を担当する。
 */

import React from "react";
import {
    Undo2, Redo2, Copy, ClipboardPaste, RotateCcw,
    Search, Tag, Dna, ChevronDown
} from 'lucide-react';
import { SequenceData, Selection } from "../../types";

interface MainToolbarProps {
    undo: () => void;
    redo: () => void;
    canUndo: boolean;
    canRedo: boolean;
    copySelection: () => void;
    handlePaste: (options?: { isRC?: boolean }) => void;
    selection: Selection | null;
    currentSequence: SequenceData | null;
    isPasteMenuOpen: boolean;
    setIsPasteMenuOpen: (open: boolean) => void;
    isSearchVisible: boolean;
    setIsSearchVisible: (visible: boolean) => void;
    openAddFeatureModal: () => void;
    runAlignment: () => void;
    addAlignmentSample: () => void;
    activeTab: 'sequence' | 'map' | 'alignment';
    hasAlignmentResults: boolean;
    searchInputRef: React.RefObject<HTMLInputElement | null>;
}

export const MainToolbar: React.FC<MainToolbarProps> = ({
    undo,
    redo,
    canUndo,
    canRedo,
    copySelection,
    handlePaste,
    selection,
    currentSequence,
    isPasteMenuOpen,
    setIsPasteMenuOpen,
    isSearchVisible,
    setIsSearchVisible,
    openAddFeatureModal,
    runAlignment,
    addAlignmentSample,
    activeTab,
    hasAlignmentResults,
    searchInputRef
}) => {
    const canAddAlignmentSample = activeTab === 'alignment' && hasAlignmentResults;
    const modifier = /Windows/i.test(navigator.userAgent) ? 'Ctrl' : 'Cmd';
    return (
        <div className="toolbar" style={{ display: 'flex', gap: '12px', padding: '8px 16px', background: 'var(--bg-app)', borderBottom: '1px solid var(--border)', alignItems: 'center', flexWrap: 'nowrap' }}>
            {/* History */}
            <div className="toolbar-group" style={{ display: 'flex', gap: '4px', borderRight: '1px solid var(--border)', paddingRight: '12px' }}>
                <button className="btn-toolbar" onClick={() => undo()} disabled={!canUndo} title={`Undo (${modifier}+Z)`} style={{ background: 'none', color: 'var(--text-main)', padding: '6px 8px', border: 'none', cursor: 'pointer', opacity: !canUndo ? 0.3 : 1 }}><Undo2 size={16} /></button>
                <button className="btn-toolbar" onClick={() => redo()} disabled={!canRedo} title={`Redo (${modifier}+Shift+Z)`} style={{ background: 'none', color: 'var(--text-main)', padding: '6px 8px', border: 'none', cursor: 'pointer', opacity: !canRedo ? 0.3 : 1 }}><Redo2 size={16} /></button>
            </div>

            {/* Clipboard */}
            <div className="toolbar-group" style={{ display: 'flex', gap: '4px', borderRight: '1px solid var(--border)', paddingRight: '12px' }}>
                <button className="btn-toolbar" onClick={() => copySelection()} disabled={!selection} title="Copy Selection" style={{ display: 'flex', alignItems: 'center', gap: '10px', background: 'none', color: 'var(--text-main)', fontSize: '0.85rem', padding: '8px 12px', opacity: !selection ? 0.4 : 1, border: 'none', borderRadius: '4px', cursor: 'pointer' }}><Copy size={18} /> Copy</button>

                <div style={{ position: 'relative', display: 'flex' }}>
                    <button className="btn-toolbar" onClick={() => handlePaste()} disabled={!currentSequence} title="Paste Sequence (Normal)" style={{ display: 'flex', alignItems: 'center', gap: '10px', background: 'none', color: 'var(--text-main)', fontSize: '0.85rem', padding: '8px 12px', opacity: !currentSequence ? 0.4 : 0.8, border: 'none', borderRadius: '4px 0 0 4px', cursor: 'pointer' }}><ClipboardPaste size={18} /> Paste</button>
                    <button className="btn-toolbar" disabled={!currentSequence} style={{ padding: '8px 6px', fontSize: '0.85rem', background: 'none', color: 'var(--text-muted)', border: 'none', borderLeft: '1px solid var(--border)', borderRadius: '0 4px 4px 0', cursor: 'pointer', opacity: !currentSequence ? 0.4 : 1 }} onClick={() => setIsPasteMenuOpen(!isPasteMenuOpen)}><ChevronDown size={14} /></button>
                    {isPasteMenuOpen && (
                        <div className="dropdown-menu" style={{ position: 'absolute', left: 0, top: '100%', marginTop: '4px', background: 'var(--bg-sidebar)', border: '1px solid var(--border)', borderRadius: '4px', boxShadow: '0 4px 6px rgba(0,0,0,0.1)', zIndex: 1000, minWidth: '180px' }}>
                            <button onClick={() => { handlePaste(); setIsPasteMenuOpen(false); }} style={{ width: '100%', padding: '10px 14px', textAlign: 'left', background: 'none', border: 'none', color: 'var(--text-main)', fontSize: '0.85rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '10px' }}><ClipboardPaste size={16} /> Standard Paste</button>
                            <button onClick={() => { handlePaste({ isRC: true }); setIsPasteMenuOpen(false); }} style={{ width: '100%', padding: '10px 14px', textAlign: 'left', background: 'none', border: 'none', color: 'var(--text-main)', fontSize: '0.85rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '10px' }}><RotateCcw size={16} /> Paste as RC</button>
                        </div>
                    )}
                </div>
            </div>

            {/* Analysis & Annotations */}
            <div className="toolbar-group toolbar-group-analysis" style={{ display: 'flex', gap: '8px', paddingLeft: '4px', marginLeft: 'auto' }}>
                <button
                    className="btn-toolbar"
                    onClick={() => {
                        setIsSearchVisible(!isSearchVisible);
                        if (!isSearchVisible) setTimeout(() => searchInputRef.current?.focus(), 100);
                    }}
                    title={`Find in Sequence (${modifier}+F)`}
                    style={{ 
                        display: 'flex', 
                        alignItems: 'center', 
                        gap: '10px', 
                        background: isSearchVisible ? 'rgba(59, 130, 246, 0.1)' : 'none', 
                        color: isSearchVisible ? '#3b82f6' : 'var(--text-main)', 
                        fontSize: '0.85rem', 
                        padding: '8px 12px', 
                        border: '1px solid var(--border)', 
                        borderRadius: '4px', 
                        cursor: 'pointer',
                        transition: 'all 0.2s',
                        borderColor: isSearchVisible ? '#3b82f6' : 'var(--border)'
                    }}
                >
                    <Search size={18} /> Search
                </button>
                <button
                    className="btn-toolbar"
                    onClick={openAddFeatureModal}
                    disabled={!selection}
                    title="Add Feature at Selection"
                    style={{ display: 'flex', alignItems: 'center', gap: '10px', background: 'none', color: 'var(--text-main)', fontSize: '0.85rem', padding: '8px 12px', opacity: !selection ? 0.4 : 1, border: '1px solid var(--border)', borderRadius: '4px', cursor: 'pointer' }}
                >
                    <Tag size={18} /> Add Feature
                </button>
                <button
                    className="btn-toolbar"
                    onClick={canAddAlignmentSample ? addAlignmentSample : runAlignment}
                    disabled={!currentSequence}
                    title={canAddAlignmentSample ? "Add Sample to Current Alignment" : "Run Sequence Alignment"}
                    style={{ display: 'flex', alignItems: 'center', gap: '10px', background: 'var(--bg-app)', color: '#10b981', fontSize: '0.85rem', padding: '8px 16px', opacity: !currentSequence ? 0.4 : 1, border: '1px solid var(--border)', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}
                >
                    <Dna size={18} /> {canAddAlignmentSample ? 'Add Alignment Sample' : 'Run Alignment'}
                </button>
            </div>
        </div>
    );
};
