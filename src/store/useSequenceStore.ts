/**
 * 学習メモ: 開いている配列、編集履歴、保存状態、アラインメントを一元管理するZustandストア。
 * 処理の位置づけ: コンポーネントやHookから参照・更新され、画面全体で共有される状態の中心になる。
 */

import { create } from 'zustand';
import { SequenceData, ChromTrace, AlignmentResult, Selection, Annotation } from '../types';
import * as api from '../api';
import * as cloningApi from '../features/cloning';
import { useUiStore } from './useUiStore';
import { open as openDialog, save as saveDialog, message } from '@tauri-apps/plugin-dialog';
import { translateDna } from '../utils/translationUtils';
import { ensurePathExtension, stripLastExtension } from '../utils/pathUtils';

const MAX_HISTORY_LENGTH = 20;
const SAFE_TOPOLOGY = (v: any) => (v === 'Circular' ? 'Circular' : 'Linear');
const normalizePathKey = (p: string | null | undefined) =>
    (p || '')
        .trim()
        .replace(/^file:\/\//i, '')
        .replace(/\\/g, '/')
        .toLowerCase();

function normalizeAlignmentResults(results: any): AlignmentResult[] | null {
    if (!Array.isArray(results)) return null;
    const normalized = results.map((r: any, idx: number) => {
        if (!r || typeof r !== 'object') return null;
        const alignedQuery = typeof r.aligned_query === 'string' ? r.aligned_query : '';
        const fallbackSeq = alignedQuery.replace(/-/g, '');
        const srcData = (r.data && typeof r.data === 'object') ? r.data : {};
        const filePath = typeof srcData.file_path === 'string' ? srcData.file_path : '';
        const fileBasedId = filePath ? stripLastExtension(filePath.split(/[/\\]/).pop() || filePath) : '';
        const sourceId = typeof srcData.id === 'string' ? srcData.id : '';
        const resultId = typeof r.id === 'string' ? r.id : '';
        const id = sourceId || fileBasedId || resultId || `sample-${idx + 1}`;
        const sequence = typeof srcData.sequence === 'string'
            ? srcData.sequence
            : fallbackSeq;

        if (!sequence) return null;

        return {
            ...r,
            id: typeof r.id === 'string' ? r.id : id,
            aligned_query: alignedQuery,
            aligned_template: typeof r.aligned_template === 'string' ? r.aligned_template : '',
            strand: r.strand === 'Reverse' ? 'Reverse' : 'Forward',
            score: typeof r.score === 'number' ? r.score : 0,
            data: {
                id,
                description: typeof srcData.description === 'string' ? srcData.description : null,
                sequence,
                annotations: Array.isArray(srcData.annotations) ? srcData.annotations : [],
                primers: Array.isArray(srcData.primers) ? srcData.primers : [],
                topology: SAFE_TOPOLOGY(srcData.topology),
                trace: srcData.trace ?? null,
                enzymes: srcData.enzymes ?? null,
                enzymeSettings: srcData.enzymeSettings ?? null,
                alignmentResults: null,
                debug_hex: srcData.debug_hex ?? null,
                file_path: typeof srcData.file_path === 'string' ? srcData.file_path : null
            }
        } as AlignmentResult;
    }).filter(Boolean) as AlignmentResult[];

    return normalized.length > 0 ? normalized : null;
}

async function synchronizeChangedSequences(target: SequenceData[], source: SequenceData[]): Promise<void> {
    for (let i = 0; i < target.length; i += 1) {
        if (target[i] !== source[i]) {
            await api.upsertSequence(target[i]);
        }
    }
}

interface SequenceStore {
    // State
    sequences: SequenceData[];
    currentIndex: number;
    loading: boolean;
    allTraces: Record<string, ChromTrace>;
    allAlignments: Record<string, AlignmentResult[]>;
    history: SequenceData[][];
    redoStack: SequenceData[][];
    dirtySequenceIds: Record<string, true>;
    saveState: 'idle' | 'saving' | 'saved' | 'error';

    // Computed
    getCurrentSequence: () => SequenceData | null;

    // Basic Actions
    setSequences: (sequences: SequenceData[]) => void;
    setCurrentIndex: (index: number) => void;
    setLoading: (loading: boolean) => void;
    setTrace: (id: string, trace: ChromTrace) => void;
    markSequenceDirty: (id: string) => void;
    
    // Core Data Actions
    updateCurrentSequenceData: (data: Partial<SequenceData>) => void;
    loadFile: (path?: string | string[]) => Promise<void>;
    deleteSequence: (index: number) => void;
    saveFile: (options?: { forceSaveAs?: boolean }) => Promise<void>;
    waitForPendingEdits: () => Promise<void>;
    hasPendingEdits: () => boolean;

    // History Actions
    saveToHistory: (index?: number) => void;
    undo: () => Promise<void>;
    redo: () => Promise<void>;

    // Cloning Logic (Migrated from useCloningOperations)
    performEdit: (start: number, length: number, newSeq: string) => Promise<void>;
    cutSelection: (selection: Selection | null) => Promise<void>;
    deleteSelection: (selection: Selection | null) => Promise<void>;
    handlePaste: (selection: Selection | null, cloningClipboard: any, options?: { isRC?: boolean }) => Promise<void>;
    executePaste: (data: { sequence: string, selection: Selection | null, cloningClipboard?: any, options?: any }) => Promise<void>;
    reverseComplementSelection: (selection: Selection | null) => Promise<void>;
    copyToClipboard: (selection: Selection | null) => Promise<void>;
    copyAsAAToClipboard: (selection: Selection | null) => Promise<void>;
    deleteAlignmentResult: (sequenceId: string, ridx: number) => void;
}

let lastClipboardAction = 0;
const CLIPBOARD_GUARD_MS = 150;
let editQueue: Promise<void> = Promise.resolve();
let pendingEditCount = 0;

export const useSequenceStore = create<SequenceStore>((set, get) => ({
    // State
    sequences: [],
    currentIndex: -1,
    loading: false,
    allTraces: {},
    allAlignments: {},
    history: [],
    redoStack: [],
    dirtySequenceIds: {},
    saveState: 'idle',

    // Computed
    getCurrentSequence: () => {
        const { sequences, currentIndex } = get();
        return currentIndex >= 0 ? sequences[currentIndex] : null;
    },

    // Actions
    setSequences: (sequences) => set((state) => {
        const dirtySequenceIds = { ...state.dirtySequenceIds };
        sequences.forEach((sequence, index) => {
            if (state.sequences[index] !== sequence) dirtySequenceIds[sequence.id] = true;
        });
        return { sequences, dirtySequenceIds, saveState: 'idle' };
    }),
    setCurrentIndex: (currentIndex) => {
        set({ currentIndex });
        useUiStore.getState().setSelection(null);
    },
    setLoading: (loading: boolean) => set({ loading }),
    setTrace: (id, trace) => set(state => ({ allTraces: { ...state.allTraces, [id]: trace } })),
    markSequenceDirty: (id) => set((state) => ({
        dirtySequenceIds: { ...state.dirtySequenceIds, [id]: true },
        saveState: 'idle',
    })),

    updateCurrentSequenceData: (data) => set((state) => {
        if (state.currentIndex < 0) return state;
        const nextSeqs = [...state.sequences];
        nextSeqs[state.currentIndex] = { ...nextSeqs[state.currentIndex], ...data };
        return {
            sequences: nextSeqs,
            dirtySequenceIds: { ...state.dirtySequenceIds, [nextSeqs[state.currentIndex].id]: true },
            saveState: 'idle',
        };
    }),

    loadFile: async (path?: string | string[]) => {
        let targetPaths: string[] = [];
        try {
            if (!path) {
                const selected = await openDialog({
                    multiple: true,
                    filters: [{ 
                        name: 'Sequence Files', 
                        extensions: ['fasta', 'fa', 'gbk', 'gb', 'dna', 'ab1', 'gp'] 
                    }]
                });
                if (!selected) return;
                targetPaths = Array.isArray(selected) ? selected : [selected];
            } else {
                targetPaths = Array.isArray(path) ? path : [path];
            }

            set({ loading: true });
            const allLoadedSeqs: any[] = [];
            const failedFiles: string[] = [];
            let focusIndex: number | null = null;
            
            for (const p of targetPaths) {
                const pathKey = normalizePathKey(p);
                const existingIndex = get().sequences.findIndex(
                    seq => normalizePathKey(seq.file_path) === pathKey
                );
                if (existingIndex >= 0) {
                    if (focusIndex === null) focusIndex = existingIndex;
                    continue;
                }

                try {
                    const sessionIds = await api.openSequenceSession(p);
                    for (const id of sessionIds) {
                        const seqData = await api.getSequenceMetadata(id);
                        const base = { ...seqData, file_path: p };
                        
                        if (base.trace) {
                            set(state => ({ allTraces: { ...state.allTraces, [base.id]: base.trace! } }));
                        }
                        const normalizedAlignments = normalizeAlignmentResults(base.alignmentResults);
                        if (normalizedAlignments) {
                            set(state => ({ allAlignments: { ...state.allAlignments, [base.id]: normalizedAlignments } }));
                        }
                        allLoadedSeqs.push({ 
                            ...base, 
                            trace: base.trace || null, 
                            alignmentResults: normalizedAlignments,
                            enzymes: base.enzymes || null,
                            enzymeSettings: base.enzymeSettings || null,
                            debug_hex: base.debug_hex || null,
                        });
                    }
                } catch (err) {
                    console.error(`Failed to load file ${p}:`, err);
                    failedFiles.push(p.split(/[/\\]/).pop() || p);
                }
            }

            if (allLoadedSeqs.length > 0) {
                set(state => {
                    const updated = [...state.sequences, ...allLoadedSeqs];
                    const firstNewIndex = state.sequences.length;
                    return { 
                        sequences: updated, 
                        currentIndex: focusIndex ?? firstNewIndex
                    };
                });
            } else if (focusIndex !== null) {
                set({ currentIndex: focusIndex });
            }
            set({ loading: false });
            if (failedFiles.length > 0) {
                await message(
                    `Could not open ${failedFiles.length === 1 ? 'this file' : 'these files'}:\n\n${failedFiles.join('\n')}\n\nThe file may be damaged, unsupported, or inaccessible.`,
                    { title: allLoadedSeqs.length > 0 ? 'Some Files Were Not Opened' : 'Open Failed', kind: allLoadedSeqs.length > 0 ? 'warning' : 'error' }
                );
            }
        } catch (err) {
            console.error("Failed to load files:", err);
            set({ loading: false });
        }
    },

    deleteSequence: (index) => set((state) => {
        const removedId = state.sequences[index]?.id;
        const next = state.sequences.filter((_, i) => i !== index);
        const dirtySequenceIds = { ...state.dirtySequenceIds };
        if (removedId) delete dirtySequenceIds[removedId];
        let nextIndex = state.currentIndex;
        if (next.length === 0) {
            nextIndex = -1;
        } else if (index === state.currentIndex) {
            nextIndex = Math.min(index, next.length - 1);
        } else if (index < state.currentIndex) {
            nextIndex = state.currentIndex - 1;
        }
        return { sequences: next, currentIndex: nextIndex, dirtySequenceIds };
    }),

    saveFile: async (options) => {
        await editQueue;
        const current = get().getCurrentSequence();
        if (!current) return;

        try {
            set({ loading: true, saveState: 'saving' });
            let path = current.file_path;
            const needsGp = Boolean(
                (get().allAlignments[current.id]?.length || current.alignmentResults?.length || 0) > 0 ||
                get().allTraces[current.id] || current.trace ||
                current.enzymes?.length || current.enzymeSettings?.length
            );
            const needsFeatures = (current.annotations?.length || 0) > 0 || (current.primers?.length || 0) > 0;
            const lowPath = (path || '').toLowerCase();
            const currentFormat = lowPath.match(/\.(gp|gbk|gb|fasta|fa)$/)?.[1] || null;
            const canSaveInFormat = (format: string | null) => format === 'gp' ||
                (!needsGp && (format === 'gbk' || format === 'gb')) ||
                (!needsGp && !needsFeatures && (format === 'fasta' || format === 'fa'));
            const needsSavePrompt = options?.forceSaveAs === true || !path || !canSaveInFormat(currentFormat);

            if (needsSavePrompt) {
                const ext = needsGp ? 'gp' : needsFeatures ? 'gbk' : currentFormat || 'gbk';
                const defaultName = path 
                    ? stripLastExtension(path.split(/[/\\]/).pop() || path) + `.${ext}`
                    : `${current.id}.${ext}`;
                const filters = [{ name: 'GreenPeas', extensions: ['gp'] }];
                if (!needsGp) filters.push({ name: 'GenBank', extensions: ['gbk', 'gb'] });
                if (!needsGp && !needsFeatures) filters.push({ name: 'Fasta', extensions: ['fasta', 'fa'] });
                const selectedPath = await saveDialog({ 
                    defaultPath: defaultName, 
                    filters: filters 
                });
                
                if (!selectedPath) {
                    set({ loading: false, saveState: 'idle' });
                    return;
                }
                path = /\.(gp|gbk|gb|fasta|fa)$/i.test(selectedPath)
                    ? selectedPath
                    : ensurePathExtension(selectedPath, `.${ext}`);
                const selectedFormat = path.toLowerCase().match(/\.(gp|gbk|gb|fasta|fa)$/)?.[1] || null;
                if (!canSaveInFormat(selectedFormat)) {
                    set({ loading: false, saveState: 'idle' });
                    await message(
                        needsGp
                            ? 'This sequence includes data that requires GreenPeas format. Choose a .gp file to keep it.'
                            : 'FASTA cannot store annotations or primers. Choose a GenBank or GreenPeas file to keep them.',
                        { title: 'Choose a Format That Keeps Your Data', kind: 'warning' }
                    );
                    return;
                }
            }

            const finalLowPath = path!.toLowerCase();
            if (finalLowPath.endsWith('.fasta') || finalLowPath.endsWith('.fa')) {
                await api.exportFasta(path!, current.id, current.description, current.sequence);
            } else if (finalLowPath.endsWith('.gbk') || finalLowPath.endsWith('.gb')) {
                await api.exportGbk(path!, current.sequence, current.annotations || [], current.primers || [], current.topology, current.id, current.description);
            } else if (finalLowPath.endsWith('.gp')) {
                const fullData: SequenceData = {
                    ...current,
                    file_path: path,
                    trace: get().allTraces[current.id] || current.trace || null,
                    alignmentResults: get().allAlignments[current.id]?.length
                        ? get().allAlignments[current.id]
                        : current.alignmentResults || []
                };
                await api.exportGp(path!, fullData);
            } else {
                set({ loading: false });
                throw new Error("Cannot overwrite binary or unknown file types.");
            }
            set((state) => {
                const dirtySequenceIds = { ...state.dirtySequenceIds };
                const index = state.sequences.findIndex((sequence) => sequence.id === current.id);
                const sameDocument = index >= 0 && state.sequences[index] === current;
                if (sameDocument) delete dirtySequenceIds[current.id];
                const sequences = [...state.sequences];
                if (sameDocument) sequences[index] = { ...current, file_path: path };
                return {
                    sequences,
                    history: sameDocument ? [] : state.history,
                    redoStack: sameDocument ? [] : state.redoStack,
                    loading: false,
                    dirtySequenceIds,
                    saveState: sameDocument ? 'saved' : 'idle',
                };
            });
            console.log("💾 File saved.");
        } catch (err) {
            console.error(err);
            set({ loading: false, saveState: 'error' });
            await message(
                `Save failed.\n${(err as any)?.message ?? String(err)}`,
                { title: "Save Error", kind: "error" }
            );
            throw err;
        }
    },

    waitForPendingEdits: () => editQueue,
    hasPendingEdits: () => pendingEditCount > 0,

    saveToHistory: (index) => set((state) => {
        const editedIndex = index ?? state.currentIndex;
        const snapshot = state.sequences.map((seq, i) => 
            i === editedIndex ? { ...seq } : seq
        );
        return {
            history: [snapshot, ...state.history.slice(0, MAX_HISTORY_LENGTH - 1)],
            redoStack: []
        };
    }),

    undo: async () => {
        await editQueue;
        const before = get();
        if (before.history.length === 0) return;

        const [previous, ...rest] = before.history;
        const snapshot = before.sequences.map((seq, i) =>
            i === before.currentIndex ? { ...seq } : seq
        );

        set({
            sequences: previous,
            redoStack: [snapshot, ...before.redoStack.slice(0, MAX_HISTORY_LENGTH - 1)],
            history: rest
        });

        try {
            await synchronizeChangedSequences(previous, before.sequences);
            set((state) => {
                const dirtySequenceIds = { ...state.dirtySequenceIds };
                previous.forEach((sequence, index) => {
                    if (sequence !== before.sequences[index]) dirtySequenceIds[sequence.id] = true;
                });
                return { dirtySequenceIds, saveState: 'idle' };
            });
        } catch (err) {
            set({
                sequences: before.sequences,
                history: before.history,
                redoStack: before.redoStack
            });
            console.error("Failed to synchronize undo with Rust backend:", err);
        }
    },

    redo: async () => {
        await editQueue;
        const before = get();
        if (before.redoStack.length === 0) return;

        const [next, ...rest] = before.redoStack;
        const snapshot = before.sequences.map((seq, i) =>
            i === before.currentIndex ? { ...seq } : seq
        );

        set({
            sequences: next,
            history: [snapshot, ...before.history.slice(0, MAX_HISTORY_LENGTH - 1)],
            redoStack: rest
        });

        try {
            await synchronizeChangedSequences(next, before.sequences);
            set((state) => {
                const dirtySequenceIds = { ...state.dirtySequenceIds };
                next.forEach((sequence, index) => {
                    if (sequence !== before.sequences[index]) dirtySequenceIds[sequence.id] = true;
                });
                return { dirtySequenceIds, saveState: 'idle' };
            });
        } catch (err) {
            set({
                sequences: before.sequences,
                history: before.history,
                redoStack: before.redoStack
            });
            console.error("Failed to synchronize redo with Rust backend:", err);
        }
    },

    // Logic Migrations
    performEdit: (start, length, newSeq) => {
        const targetId = get().getCurrentSequence()?.id;
        if (!targetId) return Promise.resolve();
        const run = async () => {
            const current = get().sequences.find(sequence => sequence.id === targetId);
            if (!current) return;
            try {
            const op = length === 0 
                ? { type: 'insert', pos: start, sequence: newSeq }
                : (newSeq === "" 
                    ? { type: 'delete', pos: start, len: length }
                    : { type: 'replace', pos: start, len: length, sequence: newSeq });

            // Rust side handles everything: sequence, annotations, primers
            const updated = await api.applySequenceEdit(current.id, op as any);
            const targetIndex = get().sequences.findIndex(sequence => sequence.id === targetId);
            if (targetIndex < 0) return;
            get().saveToHistory(targetIndex);
            set(state => {
                const sequences = [...state.sequences];
                sequences[targetIndex] = { ...sequences[targetIndex], ...updated };
                return {
                    sequences,
                    dirtySequenceIds: { ...state.dirtySequenceIds, [targetId]: true },
                    saveState: 'idle'
                };
            });

            if (get().currentIndex === targetIndex) {
                useUiStore.getState().setSelection({ start, end: start + newSeq.length });
            }
            } catch (err) {
                console.error("Failed to apply edit in Rust:", err);
                await message('Edit failed. The sequence was not changed. Please try again.',
                    { title: 'Edit Error', kind: 'error' });
            }
        };
        pendingEditCount++;
        const pending = editQueue.then(run).finally(() => { pendingEditCount--; });
        editQueue = pending.catch(() => {});
        return pending;
    },

    cutSelection: async (selection: Selection | null) => {
        const now = Date.now();
        if (now - lastClipboardAction < CLIPBOARD_GUARD_MS) return;
        lastClipboardAction = now;

        const current = get().getCurrentSequence();
        if (!current || !selection) return;
        const start = Math.min(selection.start, selection.end);
        const end = Math.max(selection.start, selection.end);
        if (start === end) return;
        const sub = current.sequence.slice(start, end);
        
        const { writeText } = await import('@tauri-apps/plugin-clipboard-manager');
        await writeText(sub);
        
        await get().performEdit(start, end - start, "");
    },

    deleteSelection: async (selection: Selection | null) => {
        const current = get().getCurrentSequence();
        if (!current || !selection) return;
        const start = Math.min(selection.start, selection.end);
        const end = Math.max(selection.start, selection.end);
        if (start === end) return;
        await get().performEdit(start, end - start, "");
    },

    handlePaste: async (selection, cloningClipboard, options) => {
        const now = Date.now();
        if (now - lastClipboardAction < CLIPBOARD_GUARD_MS) return;
        lastClipboardAction = now;

        const current = get().getCurrentSequence();
        if (!current) return;
        try {
            const { readText } = await import('@tauri-apps/plugin-clipboard-manager');
            const text = await readText();
            if (!text) return;

            let cleaned = text.toUpperCase().replace(/[^ATCGN]/g, '');
            if (options?.isRC) {
                cleaned = await api.getReverseComplement(cleaned);
            }

            const { setPendingPaste, openModal, cloningClipboard: currentCloningData } = useUiStore.getState();
            
            // Prefer the rich biological fragment from our internal state if available
            const finalCloningData = cloningClipboard || currentCloningData;
            
            setPendingPaste({ 
                sequence: cleaned, 
                selection, 
                cloningClipboard: finalCloningData, 
                options 
            });
            openModal('pasteConfirmation');
        } catch (err) {
            console.error("Paste failed:", err);
        }
    },

    executePaste: async (data) => {
        const { sequence: cleaned, selection, cloningClipboard } = data;
        const current = get().getCurrentSequence();
        if (!current) return;

        const start = selection ? Math.min(selection.start, selection.end) : current.sequence.length;
        const end = selection ? Math.max(selection.start, selection.end) : start;

        // 1. Check for Internal Clipboard (Internal Clipboard Manager)
        let donorFragment = null;
        if (cloningClipboard?.clipId) {
            try {
                donorFragment = await cloningApi.getInternalFragment(cloningClipboard.clipId);
            } catch (e) {
                console.warn("Internal clipboard fetch failed, falling back to text:", e);
            }
        }

        // 2. Perform Assembly (Ligation) ONLY if intent is biological cloning
        if (cloningClipboard?.isCloning && cloningClipboard?.clipId) {
            try {
                const { restrictionSites } = useUiStore.getState();
                
                // Vector Left Fragment
                const f1 = await cloningApi.getFragmentFromSelection(
                    current.id,
                    0,
                    start,
                    restrictionSites
                );

                // Vector Right Fragment
                const f3 = await cloningApi.getFragmentFromSelection(
                    current.id,
                    end,
                    current.sequence.length,
                    restrictionSites
                );

                // Insert Fragment (Donor)
                const f2 = donorFragment || {
                    sequence: cleaned,
                    left_overhang: cloningClipboard.left_overhang,
                    right_overhang: cloningClipboard.right_overhang,
                    annotations: cloningClipboard.annotations
                };

                // 3. Invoke N-Fragment Assembly Engine
                const res = await cloningApi.assembleFragments([f1, f2, f3], current.topology);
                
                if (!res.success) {
                    throw new Error(res.error_message);
                }

                const finalData = res.data;
                if (!finalData || !finalData.sequence) {
                    throw new Error("Assembly engine returned empty sequence");
                }

                const productSeq = finalData.sequence;
                const updatedSeq: SequenceData = {
                    ...current,
                    sequence: productSeq,
                    annotations: (finalData.annotations || []).map((ann: Annotation) => ({
                        ...ann,
                        id: `ann_${Math.random().toString(36).slice(2, 11)}`
                    })),
                    enzymes: finalData.enzymes || [],
                    enzymeSettings: (finalData as any).enzyme_settings || finalData.enzymeSettings || [],
                    primers: finalData.primers || [],
                    trace: finalData.trace || null,
                    alignmentResults: finalData.alignmentResults || []
                };

                const nextSeqs = [...get().sequences];
                nextSeqs[get().currentIndex] = updatedSeq;
                
                // Synchronize with Rust backend SSoT
                await api.upsertSequence(updatedSeq);

                set({ 
                    sequences: nextSeqs
                });

                // Safely update selection for the sequence context after the store has updated
                setTimeout(() => {
                    const insertLen = f2.sequence?.length || cleaned.length;
                    useUiStore.getState().setSelection({ 
                        start: Math.min(start, productSeq.length), 
                        end: Math.min(start + insertLen, productSeq.length) 
                    });
                }, 0);
                
                return;
            } catch (err: any) {
                console.error("Assembly failed:", err);
                alert(`Assembly Error: ${err.message}`);
                return;
            }
        }

        // 4. Fallback to simple edit (Text-based paste)
        await get().performEdit(start, end - start, cleaned);
    },

    reverseComplementSelection: async (selection) => {
        const current = get().getCurrentSequence();
        if (!current || !selection) return;
        try {
            const start = Math.min(selection.start, selection.end);
            const end = Math.max(selection.start, selection.end);
            const selected = current.sequence.slice(start, end);
            const rcSelected = await api.getReverseComplement(selected);
            get().performEdit(start, end - start, rcSelected);
        } catch (err) { console.error(err); }
    },
    copyToClipboard: async (selection: Selection | null) => {
        const now = Date.now();
        if (now - lastClipboardAction < CLIPBOARD_GUARD_MS) return;
        lastClipboardAction = now;

        const current = get().getCurrentSequence();
        if (!current || !selection) return;
        
        const s = Math.min(selection.start, selection.end);
        const e = Math.max(selection.start, selection.end);
        const seq = current.sequence.slice(s, e);
        
        // 1. Always write plain text to OS clipboard
        const { writeText } = await import('@tauri-apps/plugin-clipboard-manager');
        await writeText(seq);

        const { restrictionSites, setCloningClipboard } = useUiStore.getState();

        if (selection.isFragment) {
            // 2. Intent: Biological Cloning -> Generate Rich Fragment
            try {
                const fragment = await cloningApi.getFragmentFromSelection(
                    current.id,
                    s,
                    e,
                    restrictionSites
                );

                const clipId = `gp-clip:${crypto.randomUUID()}`;
                await cloningApi.copyToInternalClipboard(clipId, fragment);

                setCloningClipboard({
                    ...fragment,
                    isCloning: true,
                    clipId
                });
            } catch (err) {
                console.error("Failed to generate rich fragment for internal clipboard:", err);
                setCloningClipboard(null);
            }
        } else {
            // 2. Intent: Standard Text -> Explicitly clear internal cloning state
            setCloningClipboard(null);
        }
    },
    copyAsAAToClipboard: async (selection: Selection | null) => {
        const now = Date.now();
        if (now - lastClipboardAction < CLIPBOARD_GUARD_MS) return;
        lastClipboardAction = now;

        const current = get().getCurrentSequence();
        if (!current || !selection) return;
        const s = Math.min(selection.start, selection.end);
        const e = Math.max(selection.start, selection.end);
        const dna = current.sequence.slice(s, e);
        if (dna.length >= 3) {
            const aa = translateDna(dna);
            const { writeText } = await import('@tauri-apps/plugin-clipboard-manager');
            await writeText(aa);
        }
    },
    deleteAlignmentResult: (sequenceId, ridx) => set((state) => {
        const nextSeqs = state.sequences.map(s => {
            if (s.id === sequenceId && s.alignmentResults) {
                return {
                    ...s,
                    alignmentResults: s.alignmentResults.filter((_, idx) => idx !== ridx)
                };
            }
            return s;
        });

        const currentAlignments = state.allAlignments[sequenceId] || [];
        const nextAlignments = currentAlignments.filter((_, idx) => idx !== ridx);

        return {
            sequences: nextSeqs,
            allAlignments: {
                ...state.allAlignments,
                [sequenceId]: nextAlignments
            },
            dirtySequenceIds: { ...state.dirtySequenceIds, [sequenceId]: true },
            saveState: 'idle',
        };
    }),
}));
