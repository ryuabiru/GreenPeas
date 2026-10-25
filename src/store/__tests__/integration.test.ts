/**
 * 学習メモ: integration.testの公開動作を固定し、変更による回帰を検出するテスト。
 * 処理の位置づけ: コンポーネントやHookから参照・更新され、画面全体で共有される状態の中心になる。
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useSequenceStore } from '../useSequenceStore';
import { invoke } from '@tauri-apps/api/core';
import { upsertSequence } from '../../api';
import { save as saveDialog, message } from '@tauri-apps/plugin-dialog';

// Mock Tauri invoke
vi.mock('@tauri-apps/api/core', () => ({
    invoke: vi.fn(),
}));
vi.mock('@tauri-apps/plugin-dialog', () => ({
    open: vi.fn(),
    save: vi.fn(),
    message: vi.fn(),
}));

describe('SSoT Backend Integration', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        useSequenceStore.setState({
            sequences: [
                {
                    id: 'test-seq-1',
                    sequence: 'ATGCTAGCTAGCTAGCTA',
                    topology: 'Linear',
                    annotations: [],
                    primers: [],
                    description: null,
                    alignmentResults: null,
                    trace: null,
                    enzymes: null,
                    enzymeSettings: null,
                    debug_hex: null,
                    file_path: null
                }
            ],
            currentIndex: 0,
            loading: false,
            history: [],
            redoStack: [],
            dirtySequenceIds: {},
            saveState: 'idle'
        });
    });

    it('should invoke upsert_sequence on backend when upsertSequence API is called', async () => {
        const mockSeq = useSequenceStore.getState().sequences[0];
        (invoke as any).mockResolvedValue('test-seq-1');

        await upsertSequence(mockSeq);

        expect(invoke).toHaveBeenCalledWith('upsert_sequence', { sequence: mockSeq });
    });

    it('should allow modifying sequence annotations in store and syncing with upsertSequence', async () => {
        const store = useSequenceStore.getState();
        const currentSeq = store.getCurrentSequence();
        expect(currentSeq).toBeDefined();
        if (!currentSeq) return;

        // Mock feature addition
        const newAnnotation = {
            id: 'ann-1',
            name: 'GFP',
            type: 'CDS',
            start: 0,
            end: 9,
            strand: 'Forward' as const,
            color: '#00ff00',
            display_shape: null
        };

        const updatedAnns = [...currentSeq.annotations, newAnnotation];
        
        // Simulate App.tsx handleSaveFeature logic
        store.updateCurrentSequenceData({ annotations: updatedAnns });
        
        const updatedSeq = useSequenceStore.getState().getCurrentSequence();
        expect(updatedSeq?.annotations).toContainEqual(newAnnotation);

        // Sync to backend
        (invoke as any).mockResolvedValue('test-seq-1');
        await upsertSequence(updatedSeq!);

        expect(invoke).toHaveBeenCalledWith('upsert_sequence', { sequence: updatedSeq });
    });

    it('should allow adding primers in store and syncing with upsertSequence', async () => {
        const store = useSequenceStore.getState();
        const currentSeq = store.getCurrentSequence();
        expect(currentSeq).toBeDefined();
        if (!currentSeq) return;

        // Mock primer addition
        const newPrimer = {
            id: 'primer-1',
            name: 'Fwd-1',
            sequence: 'ATGCTAGC',
            start: 0,
            end: 7,
            strand: 'Forward' as const,
            color: '#10b981',
            mismatches: [] as number[],
            tail5: '',
            tail3: ''
        };

        const updatedPrimers = [...currentSeq.primers, newPrimer];

        // Simulate PrimerModal handleSave logic
        store.updateCurrentSequenceData({ primers: updatedPrimers });

        const updatedSeq = useSequenceStore.getState().getCurrentSequence();
        expect(updatedSeq?.primers).toContainEqual(newPrimer);

        // Sync to backend
        (invoke as any).mockResolvedValue('test-seq-1');
        await upsertSequence(updatedSeq!);

        expect(invoke).toHaveBeenCalledWith('upsert_sequence', { sequence: updatedSeq });
    });

    it('marks edited sequences as unsaved without changing primer behavior', () => {
        const store = useSequenceStore.getState();
        const current = store.getCurrentSequence()!;
        store.updateCurrentSequenceData({
            primers: [...current.primers, {
                id: 'mismatch-primer',
                name: 'Mismatch primer',
                sequence: 'ATGATAGC',
                start: 0,
                end: 7,
                strand: 'Forward',
                color: '#10b981',
                mismatches: [3],
                tail5: '',
                tail3: ''
            }]
        });

        const state = useSequenceStore.getState();
        expect(state.dirtySequenceIds['test-seq-1']).toBe(true);
        expect(state.getCurrentSequence()?.primers[0].mismatches).toEqual([3]);
    });

    it('clears unsaved state when a sequence is closed', () => {
        useSequenceStore.setState({ dirtySequenceIds: { 'test-seq-1': true } });
        useSequenceStore.getState().deleteSequence(0);

        expect(useSequenceStore.getState().dirtySequenceIds).toEqual({});
        expect(useSequenceStore.getState().currentIndex).toBe(-1);
    });

    it('should synchronize undo and redo snapshots with the Rust workspace', async () => {
        const original = useSequenceStore.getState().sequences[0];
        const edited = { ...original, sequence: 'GGGG' };
        useSequenceStore.setState({
            sequences: [edited],
            history: [[original]],
            redoStack: []
        });
        (invoke as any).mockResolvedValue('test-seq-1');

        await useSequenceStore.getState().undo();
        expect(useSequenceStore.getState().getCurrentSequence()?.sequence).toBe(original.sequence);
        expect(invoke).toHaveBeenLastCalledWith('upsert_sequence', { sequence: original });

        await useSequenceStore.getState().redo();
        expect(useSequenceStore.getState().getCurrentSequence()?.sequence).toBe(edited.sequence);
        expect(invoke).toHaveBeenLastCalledWith('upsert_sequence', { sequence: edited });
    });

    it('should roll back an undo if Rust workspace synchronization fails', async () => {
        const edited = { ...useSequenceStore.getState().sequences[0], sequence: 'GGGG' };
        const original = useSequenceStore.getState().sequences[0];
        useSequenceStore.setState({
            sequences: [edited],
            history: [[original]],
            redoStack: []
        });
        (invoke as any).mockRejectedValue(new Error('sync failed'));

        await useSequenceStore.getState().undo();

        expect(useSequenceStore.getState().getCurrentSequence()?.sequence).toBe(edited.sequence);
        expect(useSequenceStore.getState().history).toEqual([[original]]);
        expect(useSequenceStore.getState().redoStack).toEqual([]);
    });

    it('should synchronize the sequence changed by undo even after switching tabs', async () => {
        const original = useSequenceStore.getState().sequences[0];
        const edited = { ...original, sequence: 'GGGG' };
        const other = { ...original, id: 'test-seq-2', sequence: 'CCCC' };
        useSequenceStore.setState({
            sequences: [edited, other],
            currentIndex: 1,
            history: [[original, other]],
            redoStack: []
        });
        (invoke as any).mockResolvedValue('test-seq-1');

        await useSequenceStore.getState().undo();

        expect(useSequenceStore.getState().sequences[0].sequence).toBe(original.sequence);
        expect(invoke).toHaveBeenCalledTimes(1);
        expect(invoke).toHaveBeenCalledWith('upsert_sequence', { sequence: original });
    });

    it('keeps undo history and the document unchanged when an edit fails', async () => {
        const original = useSequenceStore.getState().getCurrentSequence()!;
        vi.mocked(invoke).mockRejectedValueOnce(new Error('backend rejected edit'));

        await useSequenceStore.getState().performEdit(0, 1, 'G');

        expect(useSequenceStore.getState().getCurrentSequence()).toBe(original);
        expect(useSequenceStore.getState().history).toEqual([]);
        expect(useSequenceStore.getState().dirtySequenceIds).toEqual({});
        expect(message).toHaveBeenCalledWith(expect.stringContaining('Edit failed'),
            expect.objectContaining({ kind: 'error' }));
    });

    it('applies a pending edit to its original tab after switching tabs', async () => {
        const original = useSequenceStore.getState().getCurrentSequence()!;
        const other = { ...original, id: 'other', sequence: 'CCCC' };
        useSequenceStore.setState({ sequences: [original, other], currentIndex: 0 });
        let finishEdit!: (value: unknown) => void;
        vi.mocked(invoke).mockImplementationOnce(() => new Promise(resolve => { finishEdit = resolve; }));

        const editing = useSequenceStore.getState().performEdit(0, 1, 'G');
        await vi.waitFor(() => expect(invoke).toHaveBeenCalledWith('apply_sequence_edit',
            expect.objectContaining({ sequenceId: original.id })));
        useSequenceStore.getState().setCurrentIndex(1);
        finishEdit({ ...original, sequence: `G${original.sequence.slice(1)}` });
        await editing;

        const state = useSequenceStore.getState();
        expect(state.sequences[0].sequence).toBe(`G${original.sequence.slice(1)}`);
        expect(state.sequences[1]).toEqual(other);
        expect(state.currentIndex).toBe(1);
        expect(state.dirtySequenceIds).toEqual({ [original.id]: true });
    });

    it('sends rapid edits to the Rust workspace in order', async () => {
        const original = useSequenceStore.getState().getCurrentSequence()!;
        const resolvers: Array<(value: unknown) => void> = [];
        vi.mocked(invoke).mockImplementation(() => new Promise(resolve => { resolvers.push(resolve); }));

        const first = useSequenceStore.getState().performEdit(0, 0, 'C');
        const second = useSequenceStore.getState().performEdit(1, 0, 'G');
        await vi.waitFor(() => expect(resolvers).toHaveLength(1));
        resolvers[0]({ ...original, sequence: `C${original.sequence}` });
        await vi.waitFor(() => expect(resolvers).toHaveLength(2));
        resolvers[1]({ ...original, sequence: `CG${original.sequence}` });
        await Promise.all([first, second]);

        expect(useSequenceStore.getState().getCurrentSequence()?.sequence).toBe(`CG${original.sequence}`);
        expect(useSequenceStore.getState().history).toHaveLength(2);
    });

    it('saves the completed edit when Save is pressed during a pending edit', async () => {
        const original = useSequenceStore.getState().getCurrentSequence()!;
        let finishEdit!: (value: unknown) => void;
        vi.mocked(invoke).mockImplementationOnce(() => new Promise(resolve => { finishEdit = resolve; }));
        vi.mocked(invoke).mockResolvedValue(undefined);
        vi.mocked(saveDialog).mockResolvedValue('/tmp/edited.gbk');

        const editing = useSequenceStore.getState().performEdit(0, 1, 'G');
        await vi.waitFor(() => expect(invoke).toHaveBeenCalledWith('apply_sequence_edit', expect.anything()));
        const saving = useSequenceStore.getState().saveFile();
        expect(saveDialog).not.toHaveBeenCalled();
        const updated = { ...original, sequence: `G${original.sequence.slice(1)}` };
        finishEdit(updated);
        await Promise.all([editing, saving]);

        expect(invoke).toHaveBeenCalledWith('export_gbk', expect.objectContaining({
            sequence: updated.sequence
        }));
        expect(useSequenceStore.getState().dirtySequenceIds).toEqual({});
    });

    it('keeps an unsaved sequence dirty when the Save As dialog is cancelled', async () => {
        useSequenceStore.getState().markSequenceDirty('test-seq-1');
        vi.mocked(saveDialog).mockResolvedValue(null);

        await useSequenceStore.getState().saveFile();

        const state = useSequenceStore.getState();
        expect(state.dirtySequenceIds['test-seq-1']).toBe(true);
        expect(state.sequences[0].file_path).toBeNull();
        expect(state.saveState).toBe('idle');
        expect(invoke).not.toHaveBeenCalled();
    });

    it('keeps the original path and dirty state when Save As export fails', async () => {
        const original = useSequenceStore.getState().sequences[0];
        useSequenceStore.getState().markSequenceDirty(original.id);
        vi.mocked(saveDialog).mockResolvedValue('/tmp/new-name.gbk');
        vi.mocked(invoke).mockRejectedValue(new Error('disk full'));

        await expect(useSequenceStore.getState().saveFile()).rejects.toThrow('disk full');

        const state = useSequenceStore.getState();
        expect(state.sequences[0]).toBe(original);
        expect(state.dirtySequenceIds[original.id]).toBe(true);
        expect(state.saveState).toBe('error');
        expect(message).toHaveBeenCalledWith(expect.stringContaining('disk full'), expect.objectContaining({ kind: 'error' }));
    });

    it('saves only the selected tab and leaves the other tab dirty', async () => {
        const first = { ...useSequenceStore.getState().sequences[0], file_path: '/tmp/first.gbk' };
        const second = { ...first, id: 'test-seq-2', sequence: 'GGGG', file_path: '/tmp/second.gbk' };
        useSequenceStore.setState({
            sequences: [first, second],
            currentIndex: 0,
            dirtySequenceIds: { [first.id]: true, [second.id]: true },
        });
        vi.mocked(invoke).mockResolvedValue(undefined);

        await useSequenceStore.getState().saveFile();

        expect(invoke).toHaveBeenCalledWith('export_gbk', expect.objectContaining({ path: '/tmp/first.gbk', sequence: first.sequence }));
        expect(useSequenceStore.getState().dirtySequenceIds).toEqual({ [second.id]: true });
        expect(useSequenceStore.getState().sequences[1]).toBe(second);
        useSequenceStore.getState().deleteSequence(0);
        expect(useSequenceStore.getState().sequences).toEqual([second]);
        expect(useSequenceStore.getState().dirtySequenceIds).toEqual({ [second.id]: true });
    });

    it('does not clear dirty state if the document changes while export is running', async () => {
        const original = { ...useSequenceStore.getState().sequences[0], file_path: '/tmp/first.gbk' };
        useSequenceStore.setState({ sequences: [original], dirtySequenceIds: { [original.id]: true } });
        let completeExport!: () => void;
        vi.mocked(invoke).mockImplementation(() => new Promise<void>((resolve) => { completeExport = resolve; }));

        const saving = useSequenceStore.getState().saveFile();
        await vi.waitFor(() => expect(completeExport).toBeTypeOf('function'));
        useSequenceStore.getState().updateCurrentSequenceData({ sequence: 'CCCC' });
        completeExport();
        await saving;

        const state = useSequenceStore.getState();
        expect(state.sequences[0].sequence).toBe('CCCC');
        expect(state.dirtySequenceIds[original.id]).toBe(true);
        expect(state.saveState).toBe('idle');
    });

    it('offers GenBank instead of overwriting an annotated FASTA file', async () => {
        const original = useSequenceStore.getState().sequences[0];
        const fasta = { ...original, file_path: '/tmp/sample.fasta', annotations: [{
            id: 'feature-1', name: 'Gene', type: 'gene', start: 0, end: 4,
            strand: 'Forward' as const, color: null, display_shape: null,
        }] };
        useSequenceStore.setState({ sequences: [fasta], dirtySequenceIds: { [fasta.id]: true } });
        vi.mocked(saveDialog).mockResolvedValue('/tmp/annotated.gbk');
        vi.mocked(invoke).mockResolvedValue(undefined);

        await useSequenceStore.getState().saveFile();

        expect(saveDialog).toHaveBeenCalledWith(expect.objectContaining({
            defaultPath: 'sample.gbk',
            filters: expect.not.arrayContaining([expect.objectContaining({ name: 'Fasta' })]),
        }));
        expect(invoke).toHaveBeenCalledWith('export_gbk', expect.objectContaining({
            path: '/tmp/annotated.gbk', annotations: fasta.annotations,
        }));
        expect(invoke).not.toHaveBeenCalledWith('export_fasta', expect.anything());
        expect(useSequenceStore.getState().getCurrentSequence()?.file_path).toBe('/tmp/annotated.gbk');
        expect(useSequenceStore.getState().dirtySequenceIds).toEqual({});
    });

    it('keeps annotated FASTA unsaved if the format change is cancelled or FASTA is selected', async () => {
        const original = useSequenceStore.getState().sequences[0];
        const fasta = { ...original, file_path: '/tmp/sample.fasta', annotations: [{
            id: 'feature-1', name: 'Gene', type: 'gene', start: 0, end: 4,
            strand: 'Forward' as const, color: null, display_shape: null,
        }] };
        useSequenceStore.setState({ sequences: [fasta], dirtySequenceIds: { [fasta.id]: true } });
        vi.mocked(saveDialog).mockResolvedValueOnce(null).mockResolvedValueOnce('/tmp/unsafe.fasta');

        await useSequenceStore.getState().saveFile();
        await useSequenceStore.getState().saveFile();

        expect(invoke).not.toHaveBeenCalled();
        expect(message).toHaveBeenCalledWith(expect.stringContaining('FASTA cannot store annotations'),
            expect.objectContaining({ kind: 'warning' }));
        expect(useSequenceStore.getState().getCurrentSequence()).toBe(fasta);
        expect(useSequenceStore.getState().dirtySequenceIds).toEqual({ [fasta.id]: true });
    });

    it('requires GP when an existing GenBank sequence has workspace settings', async () => {
        const original = useSequenceStore.getState().sequences[0];
        const gbk = { ...original, file_path: '/tmp/sample.gbk', enzymeSettings: [3] };
        useSequenceStore.setState({ sequences: [gbk], dirtySequenceIds: { [gbk.id]: true } });
        vi.mocked(saveDialog).mockResolvedValue('/tmp/sample.gp');
        vi.mocked(invoke).mockResolvedValue(undefined);

        await useSequenceStore.getState().saveFile();

        expect(saveDialog).toHaveBeenCalledWith(expect.objectContaining({
            defaultPath: 'sample.gp', filters: [{ name: 'GreenPeas', extensions: ['gp'] }],
        }));
        expect(invoke).toHaveBeenCalledWith('export_gp', expect.objectContaining({ path: '/tmp/sample.gp' }));
        expect(useSequenceStore.getState().getCurrentSequence()?.file_path).toBe('/tmp/sample.gp');
    });

    it('keeps alignment and trace data in GP when cache entries are empty', async () => {
        const original = useSequenceStore.getState().sequences[0];
        const result = {
            id: 'read-1', data: null, x_start: 0, x_end: 4, y_start: 0, y_end: 4,
            aligned_query: 'ATGC', aligned_template: 'ATGC', strand: 'Forward' as const, score: 4,
        };
        const gbk = { ...original, file_path: '/tmp/sample.gbk',
            trace: { a: [1], c: [2], g: [3], t: [4], peak_locations: [0] },
            alignmentResults: [result] };
        useSequenceStore.setState({ sequences: [gbk], allAlignments: { [gbk.id]: [] }, dirtySequenceIds: { [gbk.id]: true } });
        vi.mocked(saveDialog).mockResolvedValue('/tmp/sample.gp');
        vi.mocked(invoke).mockResolvedValue(undefined);

        await useSequenceStore.getState().saveFile();

        expect(invoke).toHaveBeenCalledWith('export_gp', expect.objectContaining({
            sequenceData: expect.objectContaining({
                trace: gbk.trace,
                alignmentResults: [expect.objectContaining({ id: 'read-1' })],
            }),
        }));
        expect(useSequenceStore.getState().dirtySequenceIds).toEqual({});
    });
});
