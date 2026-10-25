/**
 * 学習メモ: PrimerModalダイアログの入力状態、検証、確定・取消操作を担当するReactコンポーネント。
 * 処理の位置づけ: 親コンポーネントからデータとコールバックを受け取り、描画と操作通知を担当する。
 */

import React, { useState, useEffect } from 'react';
import { useSequenceStore } from '../../store/useSequenceStore';
import { analyzePrimer, upsertSequence } from '../../api';
import type { Primer } from '../../types';

interface PrimerModalProps {
    isOpen: boolean;
    onClose: () => void;
    selection: { start: number, end: number } | null;
    initialPrimer?: Primer | null;
}

function cleanDna(input: string): string {
    return input.toUpperCase().replace(/[^ATCGN]/g, '');
}

function reverseComplement(seq: string): string {
    const map: Record<string, string> = { A: 'T', T: 'A', C: 'G', G: 'C', N: 'N' };
    return seq.split('').reverse().map((b) => map[b] || 'N').join('');
}

function mismatchCount(a: string, b: string): number {
    let mismatches = 0;
    for (let i = 0; i < Math.min(a.length, b.length); i++) {
        const x = a[i];
        const y = b[i];
        if (x !== y && x !== 'N' && y !== 'N') mismatches++;
    }
    return mismatches + Math.abs(a.length - b.length);
}

function findBestPrimerBindingSite(
    template: string,
    primerSeq: string,
    strand: 'Forward' | 'Reverse',
    topology: 'Linear' | 'Circular'
): { start: number; end: number; probeLen: number; bestMismatch: number; candidateCount: number } | null {
    const tpl = cleanDna(template);
    const primer = cleanDna(primerSeq);
    if (!tpl || primer.length < 8) return null;

    const probeLen = Math.min(20, primer.length);
    const probe = primer.slice(primer.length - probeLen); // 3' annealing side
    const expected = strand === 'Forward' ? probe : reverseComplement(probe);
    const circular = topology === 'Circular';
    const maxStart = circular ? tpl.length : (tpl.length - probeLen + 1);
    if (maxStart <= 0) return null;

    const scan = circular ? tpl + tpl.slice(0, probeLen - 1) : tpl;
    let bestMismatch = Number.POSITIVE_INFINITY;
    let bestStart = 0;
    let candidateCount = 0;

    for (let i = 0; i < maxStart; i++) {
        const window = scan.slice(i, i + probeLen);
        const mm = mismatchCount(window, expected);
        if (mm < bestMismatch) {
            bestMismatch = mm;
            bestStart = i;
            candidateCount = 1;
        } else if (mm === bestMismatch) {
            candidateCount++;
        }
    }

    const maxReasonableMismatch = Math.max(2, Math.floor(probeLen * 0.2));
    if (bestMismatch > maxReasonableMismatch) return null;

    const rawEnd = bestStart + probeLen;
    const end = circular ? (rawEnd % tpl.length) : rawEnd;
    return { start: bestStart, end, probeLen, bestMismatch, candidateCount };
}

export const PrimerModal: React.FC<PrimerModalProps> = ({ isOpen, onClose, selection, initialPrimer = null }) => {
    const currentSequence = useSequenceStore(s => s.getCurrentSequence());
    const updateCurrentSequenceData = useSequenceStore(s => s.updateCurrentSequenceData);
    
    const [name, setName] = useState('New Primer');
    const [sequence, setSequence] = useState('');
    const [strand, setStrand] = useState<'Forward' | 'Reverse'>('Forward');
    const [analyzing, setAnalyzing] = useState(false);
    const [preview, setPreview] = useState<Primer | null>(null);
    const [analysisNote, setAnalysisNote] = useState('');

    useEffect(() => {
        if (isOpen) {
            setName(initialPrimer?.name || `Primer_${Date.now().toString().slice(-5)}`);
            setPreview(initialPrimer);
            setAnalysisNote('');
        }
        if (isOpen && currentSequence) {
            if (initialPrimer) {
                setSequence(initialPrimer.sequence);
                setStrand(initialPrimer.strand);
            } else if (selection && selection.start !== selection.end) {
                const s = Math.min(selection!.start, selection!.end);
                const e = Math.max(selection!.start, selection!.end);
                const sub = currentSequence.sequence.slice(s, e);
                setSequence(cleanDna(sub));
            } else {
                setSequence('');
            }
            if (!initialPrimer) setStrand('Forward');
        }
    }, [isOpen, selection, currentSequence, initialPrimer]);

    useEffect(() => {
        if (!isOpen) return;
        let cancelled = false;
        const runAnalysis = async () => {
            if (!currentSequence) return;
            const cleaned = cleanDna(sequence);
            if (initialPrimer && cleaned === initialPrimer.sequence && strand === initialPrimer.strand) {
                setPreview(initialPrimer);
                setAnalysisNote('Using the existing binding site.');
                return;
            }
            setPreview(null);
            if (cleaned.length < 8) {
                setAnalysisNote('Enter at least 8 bases.');
                return;
            }

            setAnalyzing(true);
            try {
                let s = 0;
                let e = 0;
                const hasRange = !!selection && selection.start !== selection.end;

                if (initialPrimer) {
                    s = initialPrimer.start;
                    e = initialPrimer.end;
                    setAnalysisNote('Using the existing binding site.');
                } else if (hasRange) {
                    s = Math.min(selection!.start, selection!.end);
                    e = Math.max(selection!.start, selection!.end);
                    setAnalysisNote('Using selected range as binding site.');
                } else {
                    const guessed = findBestPrimerBindingSite(
                        currentSequence.sequence,
                        cleaned,
                        strand,
                        currentSequence.topology
                    );
                    if (!guessed) {
                        setPreview(null);
                        setAnalysisNote('No plausible binding site found. Select a range or adjust primer sequence.');
                        return;
                    }
                    s = guessed.start;
                    e = guessed.end;
                    setAnalysisNote(
                        guessed.candidateCount > 1
                            ? `Auto-detected binding (best mismatch ${guessed.bestMismatch}, ${guessed.candidateCount} candidates; using first).`
                            : `Auto-detected binding (best mismatch ${guessed.bestMismatch}).`
                    );
                }

                const result = await analyzePrimer(currentSequence.sequence, cleaned, s, e, strand);
                if (!cancelled) setPreview(result);
            } catch (err) {
                console.error(err);
                if (!cancelled) {
                    setPreview(null);
                    setAnalysisNote('Failed to analyze primer.');
                }
            } finally {
                if (!cancelled) setAnalyzing(false);
            }
        };
        const timer = setTimeout(runAnalysis, 300);
        return () => { cancelled = true; clearTimeout(timer); };
    }, [isOpen, sequence, strand, currentSequence, selection, initialPrimer]);

    if (!isOpen) return null;

    const handleSave = async () => {
        if (!currentSequence || !preview) return;
        const trimmedName = name.trim();
        if (!trimmedName) {
            setAnalysisNote('Enter a primer name.');
            return;
        }
        const savedPrimer: Primer = {
            ...preview,
            id: initialPrimer?.id || `primer-${Date.now()}`,
            name: trimmedName,
            color: initialPrimer && strand === initialPrimer.strand
                ? initialPrimer.color : (strand === 'Forward' ? '#10b981' : '#f43f5e')
        };
        if (initialPrimer && JSON.stringify(savedPrimer) === JSON.stringify(initialPrimer)) {
            onClose();
            return;
        }
        const updatedPrimers = initialPrimer
            ? (currentSequence.primers || []).map(primer => primer.id === initialPrimer.id ? savedPrimer : primer)
            : [...(currentSequence.primers || []), savedPrimer];

        try {
            await upsertSequence({
                ...currentSequence,
                primers: updatedPrimers
            });
            updateCurrentSequenceData({ primers: updatedPrimers });
            onClose();
        } catch (err) {
            console.error("Failed to sync primer to backend:", err);
            setAnalysisNote(`Could not save primer. Please try again. ${(err as Error)?.message ?? String(err)}`);
        }
    };

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content premium-glass" onClick={e => e.stopPropagation()} style={{ width: '500px' }}>
                <h2 style={{ marginBottom: '20px', color: 'var(--text-bright)' }}>{initialPrimer ? 'Edit Primer' : 'Register New Primer'}</h2>
                
                <div className="form-group" style={{ marginBottom: '15px' }}>
                    <label>Primer Name</label>
                    <input 
                        type="text" value={name} onChange={e => setName(e.target.value)}
                        placeholder="e.g. Forward Primer 1"
                        style={{ width: '100%', padding: '8px', background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: '4px', color: 'var(--text)' }}
                    />
                </div>

                <div className="form-group" style={{ marginBottom: '15px' }}>
                    <label>Sequence (5' → 3')</label>
                    <textarea 
                        value={sequence} onChange={e => { setSequence(cleanDna(e.target.value)); setPreview(null); }}
                        style={{ width: '100%', height: '80px', padding: '8px', background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: '4px', color: 'var(--text)', fontFamily: 'monospace' }}
                    />
                </div>

                <div className="form-group" style={{ marginBottom: '15px', display: 'flex', gap: '20px' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                        <input type="radio" checked={strand === 'Forward'} onChange={() => { setStrand('Forward'); setPreview(null); }} /> Forward
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                        <input type="radio" checked={strand === 'Reverse'} onChange={() => { setStrand('Reverse'); setPreview(null); }} /> Reverse
                    </label>
                </div>

                <div style={{ marginBottom: '12px', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                    {analysisNote}
                </div>

                {preview && (
                    <div style={{ padding: '12px', background: 'rgba(0,0,0,0.2)', borderRadius: '6px', marginBottom: '20px', fontSize: '0.9rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                            <span>Binding: <strong>{preview.start} - {preview.end}</strong></span>
                            <span>Mismatches: <strong style={{ color: preview.mismatches.length > 0 ? '#f59e0b' : '#10b981' }}>{preview.mismatches.length}</strong></span>
                        </div>
                        <div style={{ display: 'flex', gap: '10px', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                           {preview.tail5 && <span>5' Tail: {preview.tail5.length}bp</span>}
                           {preview.tail3 && <span>3' Tail: {preview.tail3.length}bp</span>}
                        </div>
                    </div>
                )}

                <div className="modal-actions" style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                    <button className="btn-secondary" onClick={onClose}>Cancel</button>
                    <button 
                        className="btn-primary" 
                        disabled={analyzing || !preview}
                        onClick={handleSave}
                        style={{ background: 'var(--accent)', color: '#fff', border: 'none', padding: '8px 20px', borderRadius: '4px', cursor: 'pointer' }}
                    >
                        {initialPrimer ? 'Save Primer' : 'Register Primer'}
                    </button>
                </div>
            </div>
        </div>
    );
};
