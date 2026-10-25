/**
 * 学習メモ: アプリの主要レイアウト内でMainContextMenu領域を構成し、ストアの状態とユーザー操作を接続するReactコンポーネント。
 * 処理の位置づけ: 親コンポーネントからデータとコールバックを受け取り、描画と操作通知を担当する。
 */

import React from "react";
import { 
    Undo2, Redo2, FilePlus, Save, Zap, Copy, Tag, 
    ClipboardPaste, RotateCcw, Trash2, Circle 
} from 'lucide-react';
import { SequenceData, Selection } from "../../types";

interface MainContextMenuProps {
    contextMenu: { x: number, y: number, visible: boolean } | null;
    closeContextMenu: () => void;
    undo: () => void;
    redo: () => void;
    canUndo: boolean;
    canRedo: boolean;
    createNewFile: () => void;
    saveCurrentFile: () => void;
    cutSelection: () => void;
    copySelection: () => void;
    copyAsAA: () => void;
    handlePaste: (options?: { isRC?: boolean }) => void;
    deleteSelection: () => void;
    selectAll: () => void;
    selection: Selection | null;
    reverseComplementSelection: () => void;
    openAddFeatureModal: () => void;
    handleReverseComplementAction: () => void;
    toggleTopology: () => void;
    currentSequence: SequenceData | null;
    onExport: (format: 'fasta' | 'gbk' | 'gp') => void;
    openModal: (modal: any) => void;
}

export const MainContextMenu: React.FC<MainContextMenuProps> = ({
    contextMenu,
    closeContextMenu,
    undo,
    redo,
    canUndo,
    canRedo,
    createNewFile,
    saveCurrentFile,
    cutSelection,
    copySelection,
    copyAsAA,
    handlePaste,
    deleteSelection,
    selectAll,
    selection,
    reverseComplementSelection,
    openAddFeatureModal,
    handleReverseComplementAction,
    toggleTopology,
    currentSequence,
    onExport,
    openModal
}) => {
    if (!contextMenu || !contextMenu.visible) return null;

    const isInputActive = document.activeElement instanceof HTMLInputElement || document.activeElement instanceof HTMLTextAreaElement;
    const isWindows = /Windows/i.test(navigator.userAgent);
    const modifier = isWindows ? 'Ctrl+' : '⌘';
    const shift = isWindows ? 'Shift+' : '⇧';
    const menuTop = Math.max(8, Math.min(contextMenu.y, window.innerHeight - 400));
    const menuLeft = Math.max(8, Math.min(contextMenu.x, window.innerWidth - 240));

    return (
        <div
            style={{
                position: 'fixed',
                top: menuTop,
                left: menuLeft,
                backgroundColor: 'var(--bg-sidebar)',
                border: '1px solid var(--border)',
                borderRadius: '8px',
                boxShadow: '0 12px 30px rgba(0,0,0,0.4)',
                zIndex: 2000,
                minWidth: '220px',
                maxWidth: 'calc(100vw - 16px)',
                boxSizing: 'border-box',
                padding: '6px',
                maxHeight: `calc(100vh - ${menuTop + 8}px)`,
                overflowY: 'auto'
            }}
            onContextMenu={(e) => e.preventDefault()}
        >
            <div className="context-menu-item" onClick={() => { undo(); closeContextMenu(); }} style={{ padding: '10px 14px', cursor: 'pointer', fontSize: '0.9rem', opacity: !canUndo ? 0.3 : 1, display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderRadius: '4px' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '10px' }}><Undo2 size={16} /> Undo</span>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{modifier}Z</span>
            </div>
            <div className="context-menu-item" onClick={() => { redo(); closeContextMenu(); }} style={{ padding: '10px 14px', cursor: 'pointer', fontSize: '0.9rem', opacity: !canRedo ? 0.3 : 1, display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderRadius: '4px' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '10px' }}><Redo2 size={16} /> Redo</span>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{modifier}{shift}Z</span>
            </div>
            <div style={{ height: '1px', backgroundColor: 'var(--border)', margin: '4px 6px' }}></div>
            <div className="context-menu-item" onClick={() => { createNewFile(); closeContextMenu(); }} style={{ padding: '10px 14px', cursor: 'pointer', fontSize: '0.9rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderRadius: '4px' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '10px' }}><FilePlus size={16} /> New Sequence</span>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{modifier}N</span>
            </div>
            <div className="context-menu-item" onClick={() => { saveCurrentFile(); closeContextMenu(); }} style={{ padding: '10px 14px', cursor: 'pointer', fontSize: '0.9rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderRadius: '4px' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '10px' }}><Save size={16} /> Save</span>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{modifier}S</span>
            </div>
            <div style={{ height: '1px', backgroundColor: 'var(--border)', margin: '4px 6px' }}></div>
            <div className="context-menu-item" onClick={() => { cutSelection(); closeContextMenu(); }} style={{ padding: '10px 14px', cursor: 'pointer', fontSize: '0.9rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', opacity: !selection && !isInputActive ? 0.3 : 1, borderRadius: '4px' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '10px' }}><Zap size={16} /> Cut</span>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{modifier}X</span>
            </div>
            <div className="context-menu-item" onClick={() => { copySelection(); closeContextMenu(); }} style={{ padding: '10px 14px', cursor: 'pointer', fontSize: '0.9rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', opacity: !selection && !isInputActive ? 0.3 : 1, borderRadius: '4px' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '10px' }}><Copy size={16} /> Copy DNA</span>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{modifier}C</span>
            </div>
            <div className="context-menu-item" onClick={() => { copyAsAA(); closeContextMenu(); }} style={{ padding: '10px 14px', cursor: 'pointer', fontSize: '0.9rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', opacity: !selection ? 0.3 : 1, borderRadius: '4px' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '10px' }}><Tag size={16} /> Copy as Amino Acids</span>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{modifier}{shift}C</span>
            </div>
            <div className="context-menu-item" onClick={() => { handlePaste(); closeContextMenu(); }} style={{ padding: '10px 14px', cursor: 'pointer', fontSize: '0.9rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderRadius: '4px' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '10px' }}><ClipboardPaste size={16} /> Paste</span>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{modifier}V</span>
            </div>
            <div className="context-menu-item" onClick={() => { handlePaste({ isRC: true }); closeContextMenu(); }} style={{ padding: '10px 14px', cursor: 'pointer', fontSize: '0.9rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderRadius: '4px' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '10px' }}><RotateCcw size={16} /> Paste as RC</span>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{modifier}{shift}V</span>
            </div>
            <div className="context-menu-item" onClick={() => { deleteSelection(); closeContextMenu(); }} style={{ padding: '10px 14px', cursor: 'pointer', fontSize: '0.9rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', opacity: !selection && !isInputActive ? 0.3 : 1, borderRadius: '4px' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '10px' }}><Trash2 size={16} /> Delete</span>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{isWindows ? 'Del' : '⌫'}</span>
            </div>
            <div style={{ height: '1px', backgroundColor: 'var(--border)', margin: '4px 6px' }}></div>
            <div className="context-menu-item" onClick={() => { selectAll(); closeContextMenu(); }} style={{ padding: '10px 14px', cursor: 'pointer', fontSize: '0.9rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderRadius: '4px' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '10px' }}><Circle size={16} /> Select All</span>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{modifier}A</span>
            </div>
            {selection && selection.start !== selection.end && (
                <>
                    <div style={{ height: '1px', backgroundColor: 'var(--border)', margin: '4px 6px' }}></div>
                    <div className="context-menu-item" onClick={() => { reverseComplementSelection(); closeContextMenu(); }} style={{ padding: '10px 14px', cursor: 'pointer', fontSize: '0.9rem', color: '#3b82f6', borderRadius: '4px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <RotateCcw size={16} /> RC Selection
                    </div>
                    <div className="context-menu-item" onClick={() => { openAddFeatureModal(); closeContextMenu(); }} style={{ padding: '10px 14px', cursor: 'pointer', fontSize: '0.9rem', color: '#10b981', borderRadius: '4px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <Tag size={16} /> Add Feature
                    </div>
                </>
            )}
            <div className="context-menu-item" onClick={() => { openModal('primer'); closeContextMenu(); }} style={{ padding: '10px 14px', cursor: 'pointer', fontSize: '0.9rem', color: '#ec4899', borderRadius: '4px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                <Zap size={16} /> Register Primer
            </div>
            <div style={{ height: '1px', backgroundColor: 'var(--border)', margin: '4px 6px' }}></div>
            <div className="context-menu-item" onClick={() => { handleReverseComplementAction(); closeContextMenu(); }} style={{ padding: '10px 14px', cursor: 'pointer', fontSize: '0.9rem', borderRadius: '4px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                <RotateCcw size={16} /> Reverse Complement All
            </div>
            <div className="context-menu-item" onClick={() => { toggleTopology(); closeContextMenu(); }} style={{ padding: '10px 14px', cursor: 'pointer', fontSize: '0.9rem', borderRadius: '4px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                <Circle size={16} /> {currentSequence?.topology === 'Circular' ? 'Make Linear' : 'Make Circular'}
            </div>
            <div style={{ height: '1px', backgroundColor: 'var(--border)', margin: '4px 6px' }}></div>
            <div className="context-menu-item" onClick={() => { onExport('gp'); closeContextMenu(); }} style={{ padding: '10px 14px', cursor: 'pointer', fontSize: '0.9rem', color: '#10b981', fontWeight: 'bold', borderRadius: '4px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{ width: '16px', height: '16px', borderRadius: '50%', background: '#10b981' }} /> Save as GreenPeas (.gp)
            </div>
            <div className="context-menu-item" onClick={() => { onExport('gbk'); closeContextMenu(); }} style={{ padding: '10px 14px', cursor: 'pointer', fontSize: '0.9rem', borderRadius: '4px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                <Save size={16} /> Export GenBank (.gbk)
            </div>
        </div>
    );
};
