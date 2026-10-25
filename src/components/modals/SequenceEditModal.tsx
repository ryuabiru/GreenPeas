/**
 * 学習メモ: SequenceEditModalダイアログの入力状態、検証、確定・取消操作を担当するReactコンポーネント。
 * 処理の位置づけ: 親コンポーネントからデータとコールバックを受け取り、描画と操作通知を担当する。
 */

import React, { useState, useEffect } from 'react';
import { useUiStore } from '../../store/useUiStore';
import { useSequenceStore } from '../../store/useSequenceStore';
import { Clipboard, Edit3 } from 'lucide-react';
import { PendingEdit } from '../../types';

interface SequenceEditModalProps {
    isOpen: boolean;
    onClose: () => void;
    // For manual edits (triggered from App.tsx)
    edit?: PendingEdit | null;
    onConfirmEdit?: (finalSeq: string) => void;
}

export const SequenceEditModal: React.FC<SequenceEditModalProps> = ({
    isOpen, onClose, edit, onConfirmEdit
}) => {
    const { modals, closeModal, pendingPaste, setPendingPaste } = useUiStore();
    const { executePaste } = useSequenceStore();
    
    const [localSeq, setLocalSeq] = useState("");
    
    // --- Hooks MUST be at top level ---
    const { restrictionSites } = useUiStore();
    const currentSequence = useSequenceStore(s => s.getCurrentSequence());
    
    // Determine mode: paste or manual edit
    const isPasteMode = !!(modals.pasteConfirmation && pendingPaste);
    const activeData = isPasteMode ? {
        type: 'insertion',
        start: pendingPaste?.selection ? Math.min(pendingPaste.selection.start, pendingPaste.selection.end) : 0,
        length: 0,
        oldSeq: "",
        newSeq: pendingPaste?.sequence || ""
    } : edit;

    const isCloning = isPasteMode && pendingPaste?.cloningClipboard?.isCloning;

    const junctions = React.useMemo(() => {
        if (!isCloning || !pendingPaste || !currentSequence) return null;
        
        const selection = pendingPaste.selection;
        const insert = pendingPaste.cloningClipboard;
        if (!selection) return null;

        const leftSite = restrictionSites.find(s => s.position + s.cut_after_top === selection.start);
        const rightSite = restrictionSites.find(s => s.position + s.cut_after_top === selection.end);
        
        // Helper to check match
        const checkMatch = (vSite: any, iOverhang: any) => {
            if (!vSite && !iOverhang) return true; // Blunt-Blunt
            if (!vSite || !iOverhang) return false; // Mixed
            
            const vCutTop = vSite.cut_after_top;
            const vCutBot = vSite.cut_after_bottom;
            const vIs5P = vCutTop < vCutBot;
            const vSeq = currentSequence.sequence.slice(Math.min(vSite.position + vCutTop, vSite.position + vCutBot), Math.max(vSite.position + vCutTop, vSite.position + vCutBot));
            
            return vIs5P === iOverhang.is_5_prime && vSeq === iOverhang.sequence;
        };

        const leftMatch = checkMatch(leftSite, insert.left_overhang);
        const rightMatch = checkMatch(rightSite, insert.right_overhang);

        return {
            left: {
                vector: leftSite?.name || "Blunt",
                insert: insert.left_overhang ? (insert.left_overhang.enzyme_name || "Sticky") : "Blunt",
                match: leftMatch
            },
            right: {
                vector: rightSite?.name || "Blunt",
                insert: insert.right_overhang ? (insert.right_overhang.enzyme_name || "Sticky") : "Blunt",
                match: rightMatch
            },
            allMatch: leftMatch && rightMatch
        };
    }, [isCloning, pendingPaste, restrictionSites, currentSequence]);

    useEffect(() => {
        if (isOpen && activeData) {
            setLocalSeq(activeData.newSeq);
        }
    }, [isOpen, activeData]);

    if (!isOpen || !activeData) return null;

    const { type, start, length, oldSeq } = activeData;

    const handleConfirm = async () => {
        if (isPasteMode) {
            await executePaste({ ...pendingPaste!, sequence: localSeq });
            setPendingPaste(null);
            closeModal('pasteConfirmation');
        } else if (onConfirmEdit) {
            onConfirmEdit(localSeq);
        }
    };

    const handleCancel = () => {
        if (isPasteMode) setPendingPaste(null);
        onClose();
    };

    return (
        <div className="modal-overlay" style={{ zIndex: 3000 }}>
            <div className="modal-content" style={{ maxWidth: '550px', border: '1px solid var(--accent)', boxShadow: '0 0 20px rgba(59, 130, 246, 0.2)' }}>
                <h2 style={{ marginTop: 0, marginBottom: '20px', color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '15px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '40px', height: '40px', background: 'rgba(59, 130, 246, 0.1)', borderRadius: '10px' }}>
                        {isPasteMode ? <Clipboard size={22} color="#3b82f6" /> : (type === 'deletion' ? <Edit3 size={22} color="#ef4444" /> : <Edit3 size={22} color="#10b981" />)}
                    </div>
                    {isCloning ? 'Apply Ligation to Sequence?' : (isPasteMode ? 'Insert Sequence' : (type === 'deletion' ? 'Delete Sequence Fragment' : 'Edit Sequence'))}
                </h2>

                <div style={{ marginBottom: '20px' }}>
                    <div style={{ marginBottom: '15px', fontSize: '0.9rem' }}>
                        <span style={{ color: 'var(--text-muted)' }}>Position:</span> <strong>{(start + 1).toLocaleString()}</strong>
                        {type !== 'insertion' && <span style={{ marginLeft: '12px' }}>Original Length: <strong>{length} bp</strong></span>}
                    </div>

                    {type !== 'insertion' && (
                        <div style={{ marginBottom: '15px' }}>
                            <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginBottom: '5px' }}>{type === 'deletion' ? 'Fragment to Delete:' : 'Current Fragment:'}</div>
                            <code style={{ display: 'block', padding: '10px', background: 'rgba(0,0,0,0.1)', borderRadius: '6px', color: '#ef4444', maxHeight: '80px', overflowY: 'auto', fontSize: '0.85rem' }}>
                                {oldSeq}
                            </code>
                        </div>
                    )}

                    {isCloning && junctions && (
                        <div style={{ marginBottom: '20px', padding: '15px', background: 'rgba(59, 130, 246, 0.05)', borderRadius: '10px', border: '1px solid rgba(59, 130, 246, 0.2)' }}>
                            <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--accent)', marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                Smart Ligation Preview
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px' }}>
                                <div style={{ flex: 1, background: 'rgba(255,255,255,0.05)', padding: '10px', borderRadius: '8px', textAlign: 'center' }}>
                                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: '4px' }}>Left Junction</div>
                                    <div style={{ fontSize: '0.9rem', fontWeight: 700 }}>
                                        {junctions.left.vector} <span style={{ color: junctions.left.match ? '#22c55e' : '#ef4444', margin: '0 4px' }}>→</span> {junctions.left.insert}
                                    </div>
                                    <div style={{ fontSize: '0.65rem', color: junctions.left.match ? '#22c55e' : '#ef4444', marginTop: '4px' }}>
                                        {junctions.left.match ? '✓ Compatible' : '✕ Mismatch'}
                                    </div>
                                </div>
                                <div style={{ flex: 1, background: 'rgba(255,255,255,0.05)', padding: '10px', borderRadius: '8px', textAlign: 'center' }}>
                                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: '4px' }}>Right Junction</div>
                                    <div style={{ fontSize: '0.9rem', fontWeight: 700 }}>
                                        {junctions.right.insert} <span style={{ color: junctions.right.match ? '#22c55e' : '#ef4444', margin: '0 4px' }}>→</span> {junctions.right.vector}
                                    </div>
                                    <div style={{ fontSize: '0.65rem', color: junctions.right.match ? '#22c55e' : '#ef4444', marginTop: '4px' }}>
                                        {junctions.right.match ? '✓ Compatible' : '✕ Mismatch'}
                                    </div>
                                </div>
                            </div>
                            {!junctions.allMatch && (
                                <div style={{ marginTop: '12px', padding: '8px', background: 'rgba(239, 68, 68, 0.1)', borderRadius: '6px', fontSize: '0.75rem', color: '#ef4444', textAlign: 'center' }}>
                                    Warning: Incompatible ends detected. Ligation will fail.
                                </div>
                            )}
                        </div>
                    )}

                    {type !== 'deletion' && (
                        <div style={{ marginBottom: '15px' }}>
                            <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginBottom: '8px' }}>New Sequence (Editable):</div>
                            <textarea 
                                value={localSeq}
                                onChange={(e) => setLocalSeq(e.target.value.toUpperCase().replace(/[^ATCGN]/g, ''))}
                                autoFocus
                                style={{ 
                                    width: '100%', 
                                    height: '140px', 
                                    padding: '12px', 
                                    background: 'rgba(0,0,0,0.2)', 
                                    border: '1px solid var(--accent)', 
                                    borderRadius: '8px', 
                                    color: isPasteMode ? '#3b82f6' : '#22c55e',
                                    fontSize: '1.05rem',
                                    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
                                    boxSizing: 'border-box',
                                    resize: 'vertical',
                                    outline: 'none',
                                    lineHeight: '1.4'
                                }}
                            />
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '6px' }}>
                                {localSeq.length.toLocaleString()} bp
                            </div>
                        </div>
                    )}
                </div>

                <div style={{ background: 'rgba(59, 130, 246, 0.05)', padding: '12px', borderRadius: '6px', marginBottom: '25px', borderLeft: '3px solid var(--accent)' }}>
                    <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-main)', opacity: 0.9 }}>
                        {isCloning ? (
                            <>Ligation changes will be applied at position <strong>{start + 1}</strong>. Undo is available.</>
                        ) : (
                            type === 'deletion' ? (
                                <>The selected fragment will be removed. Undo is available.</>
                            ) : (
                                <>Changes will be applied at position <strong>{start + 1}</strong>. Undo is available.</>
                            )
                        )}
                    </p>
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
                    <button className="btn-secondary" onClick={handleCancel} style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)' }}>
                        Cancel
                    </button>
                    <button 
                        className="btn-primary" 
                        onClick={handleConfirm} 
                        disabled={isCloning && !junctions?.allMatch}
                        style={{ 
                            minWidth: '130px',
                            background: type === 'deletion' ? '#ef4444' : (isCloning && !junctions?.allMatch ? 'var(--text-muted)' : 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)'),
                            border: 'none',
                            fontWeight: 'bold',
                            opacity: isCloning && !junctions?.allMatch ? 0.5 : 1,
                            cursor: isCloning && !junctions?.allMatch ? 'not-allowed' : 'pointer'
                        }}
                    >
                        {isCloning ? 'Apply Ligation' : (type === 'deletion' ? 'Delete Now' : 'Apply Changes')}
                    </button>
                </div>
            </div>
        </div>
    );
};
