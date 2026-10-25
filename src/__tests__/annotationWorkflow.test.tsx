import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { invoke } from '@tauri-apps/api/core';
import { open, save, message, ask } from '@tauri-apps/plugin-dialog';
import App from '../App';
import { useSequenceStore } from '../store/useSequenceStore';
import { useUiStore } from '../store/useUiStore';
import type { SequenceData } from '../types';

vi.mock('@tauri-apps/plugin-dialog', () => ({
    open: vi.fn(),
    save: vi.fn(),
    ask: vi.fn(),
    message: vi.fn(),
}));
vi.mock('../hooks/useTauriIntegration', () => ({ useTauriIntegration: () => {} }));
vi.mock('../components/layout/WorkspaceViewer', () => ({
    WorkspaceViewer: ({ currentSequence, setSelection, handleEditAnnotation, handleSequenceEdit, onToggleTopology }: {
        currentSequence: SequenceData | null;
        setSelection: (selection: { start: number; end: number }) => void;
        handleEditAnnotation: (annotation: SequenceData['annotations'][number]) => void;
        handleSequenceEdit: (start: number, length: number, text: string) => void;
        onToggleTopology: () => void;
    }) => currentSequence ? (
        <div className="viewer-container" tabIndex={0}>
            <button onClick={() => setSelection({ start: 1, end: 5 })}>Select bases 2–5</button>
            <button onClick={() => handleSequenceEdit(3, 1, 'A')}>Change base 4 to A</button>
            <button onClick={() => handleSequenceEdit(0, 0, 'GG')}>Insert GG at origin</button>
            <button onClick={onToggleTopology}>Toggle topology</button>
            {currentSequence.annotations.map((annotation) => (
                <span key={annotation.id}>
                    <button onClick={(event) => {
                        setSelection({ start: annotation.start, end: annotation.end });
                        useUiStore.getState().setSelectedFeatureId(annotation.id);
                        event.currentTarget.closest<HTMLElement>('.viewer-container')?.focus();
                    }}>Select {annotation.name}</button>
                    <button onClick={() => handleEditAnnotation(annotation)}>Edit {annotation.name}</button>
                </span>
            ))}
        </div>
    ) : <div>No sequence</div>,
}));

const path = '/tmp/annotation-workflow.gbk';
const otherPath = '/tmp/other-sequence.gbk';
const original: SequenceData = {
    id: 'sample',
    description: null,
    sequence: 'ACGTACGTACGT',
    annotations: [],
    primers: [],
    topology: 'Linear',
    trace: null,
    enzymes: null,
    enzymeSettings: null,
    alignmentResults: null,
    debug_hex: null,
    file_path: path,
};

describe('annotation UI workflow', () => {
    let disk: SequenceData;
    let workspace: SequenceData;
    let otherDisk: SequenceData;
    let otherWorkspace: SequenceData;
    let failUpsert: boolean;
    let failExport: boolean;
    let failOpenPath: string | null;

    beforeEach(() => {
        vi.clearAllMocks();
        Object.defineProperty(window, 'localStorage', {
            configurable: true,
            value: { getItem: vi.fn(() => null), setItem: vi.fn(), removeItem: vi.fn(), clear: vi.fn() },
        });
        disk = structuredClone(original);
        workspace = structuredClone(original);
        otherDisk = { ...structuredClone(original), id: 'other', sequence: 'GGGGCCCC', file_path: otherPath };
        otherWorkspace = structuredClone(otherDisk);
        failUpsert = false;
        failExport = false;
        failOpenPath = null;
        useSequenceStore.setState({
            sequences: [], currentIndex: -1, loading: false,
            allTraces: {}, allAlignments: {}, history: [], redoStack: [],
            dirtySequenceIds: {}, saveState: 'idle',
        });
        useUiStore.setState((state) => ({
            activeTab: 'sequence', selection: null, selectedFeatureId: null, editingId: null,
            restrictionSites: [],
            modals: Object.fromEntries(Object.keys(state.modals).map((key) => [key, false])) as typeof state.modals,
        }));
        vi.mocked(open).mockResolvedValue(path);
        vi.mocked(invoke).mockImplementation(async (command, args: any) => {
            switch (command) {
                case 'open_sequence_session':
                    if (args.path === failOpenPath) throw new Error('malformed GenBank record');
                    if (args.path === otherPath) {
                        otherWorkspace = structuredClone(otherDisk);
                        return [otherWorkspace.id] as any;
                    }
                    workspace = structuredClone(disk);
                    return [workspace.id] as any;
                case 'get_sequence_metadata':
                    return structuredClone(args.id === 'other' ? otherWorkspace : workspace) as any;
                case 'upsert_sequence':
                    if (failUpsert) throw new Error('workspace unavailable');
                    if (args.sequence.id === 'other') otherWorkspace = structuredClone(args.sequence);
                    else workspace = structuredClone(args.sequence);
                    return args.sequence.id as any;
                case 'export_gbk':
                    if (failExport) throw new Error('disk full');
                    disk = { ...structuredClone(workspace), sequence: args.sequence,
                        annotations: structuredClone(args.annotations), primers: structuredClone(args.primers),
                        topology: args.topology, file_path: args.path };
                    return undefined as any;
                case 'find_restriction_sites':
                    return [] as any;
                case 'apply_sequence_edit': {
                    const current = args.sequenceId === 'other' ? otherWorkspace : workspace;
                    const { pos, len, sequence } = args.op;
                    if (current.topology === 'Circular' && pos === 0 && sequence === 'GG') {
                        const updated = { ...current, sequence: `GG${current.sequence}`,
                            annotations: current.annotations.map((annotation) => ({ ...annotation,
                                start: annotation.start + 2, end: annotation.end + 2 })),
                            primers: current.primers.map((primer) => ({ ...primer,
                                start: primer.start + 2, end: primer.end + 2 })) };
                        workspace = updated;
                        return structuredClone(updated) as any;
                    }
                    const nextSequence = current.sequence.slice(0, pos) + (sequence ?? '')
                        + current.sequence.slice(pos + (len ?? 0));
                    const updated = { ...current, sequence: nextSequence,
                        primers: current.primers.map((primer) => ({ ...primer,
                            mismatches: Array.from({ length: primer.sequence.length }, (_, index) => index)
                                .filter((index) => primer.sequence[index] !== nextSequence[primer.start + index]) })) };
                    if (args.sequenceId === 'other') otherWorkspace = updated;
                    else workspace = updated;
                    return structuredClone(updated) as any;
                }
                default:
                    throw new Error(`Unexpected Tauri command: ${command}`);
            }
        });
    });

    it('keeps the Rust workspace and the active document topology in sync', async () => {
        render(<App />);
        fireEvent.click(screen.getByRole('button', { name: /^Open$/ }));
        await screen.findByRole('button', { name: 'Toggle topology' });
        fireEvent.click(screen.getByRole('button', { name: 'Toggle topology' }));
        await waitFor(() => expect(workspace.topology).toBe('Circular'));
        expect(useSequenceStore.getState().getCurrentSequence()?.topology).toBe('Circular');

        failUpsert = true;
        fireEvent.click(screen.getByRole('button', { name: 'Toggle topology' }));
        await waitFor(() => expect(message).toHaveBeenCalledWith(
            expect.stringContaining('Could not change topology'), expect.anything()));
        expect(useSequenceStore.getState().getCurrentSequence()?.topology).toBe('Circular');
    });

    it('opens a file, adds and edits an annotation, then preserves it across saves and reloads', async () => {
        render(<App />);

        fireEvent.click(screen.getByRole('button', { name: /^Open$/ }));
        await screen.findByRole('button', { name: 'Select bases 2–5' });
        fireEvent.click(screen.getByRole('button', { name: 'Select bases 2–5' }));
        fireEvent.click(screen.getByRole('button', { name: /^Add Feature$/ }));
        fireEvent.change(screen.getByLabelText('Feature Name'), { target: { value: 'Initial' } });
        fireEvent.click(within(screen.getByText('Annotate Sequence').closest('.modal-content') as HTMLElement)
            .getByRole('button', { name: 'Add Feature' }));

        await waitFor(() => expect(workspace.annotations).toHaveLength(1));
        expect(useSequenceStore.getState().dirtySequenceIds.sample).toBe(true);
        fireEvent.click(screen.getByRole('button', { name: /^Save$/ }));
        await waitFor(() => expect(disk.annotations[0]?.name).toBe('Initial'));
        expect(useSequenceStore.getState().dirtySequenceIds).toEqual({});

        fireEvent.click(screen.getByRole('button', { name: 'Close sample' }));
        fireEvent.click(screen.getByRole('button', { name: /^Open$/ }));
        await screen.findByRole('button', { name: 'Edit Initial' });
        fireEvent.click(screen.getByRole('button', { name: 'Edit Initial' }));
        fireEvent.change(screen.getByLabelText('Feature Name'), { target: { value: 'Updated' } });
        fireEvent.change(screen.getByLabelText('Start'), { target: { value: '7' } });
        fireEvent.change(screen.getByLabelText('End'), { target: { value: '11' } });
        fireEvent.click(screen.getByRole('button', { name: '<----' }));
        fireEvent.click(screen.getByRole('button', { name: 'Update Feature' }));

        await waitFor(() => expect(workspace.annotations[0]?.name).toBe('Updated'));
        fireEvent.click(screen.getByRole('button', { name: /^Save$/ }));
        await waitFor(() => expect(disk.annotations[0]?.name).toBe('Updated'));
        fireEvent.click(screen.getByRole('button', { name: 'Close sample' }));
        fireEvent.click(screen.getByRole('button', { name: /^Open$/ }));
        await screen.findByRole('button', { name: 'Edit Updated' });

        expect(useSequenceStore.getState().getCurrentSequence()?.sequence).toBe(original.sequence);
        expect(useSequenceStore.getState().getCurrentSequence()?.topology).toBe('Linear');
        expect(useSequenceStore.getState().getCurrentSequence()?.annotations).toEqual([
            expect.objectContaining({ name: 'Updated', type: 'misc_feature', start: 6, end: 11, strand: 'Reverse' }),
        ]);
        expect(useSequenceStore.getState().dirtySequenceIds).toEqual({});
    });

    it('deletes the selected feature with Backspace without deleting bases, and can undo it', async () => {
        disk.annotations = [{ id: 'feature-1', name: 'Feature 1', type: 'gene',
            start: 1, end: 5, strand: 'Forward', color: null, display_shape: 'Rect' }];
        const { container } = render(<App />);
        fireEvent.click(screen.getByRole('button', { name: /^Open$/ }));
        await screen.findByRole('button', { name: 'Select Feature 1' });

        fireEvent.click(screen.getByRole('button', { name: 'Select Feature 1' }));
        fireEvent.keyDown(screen.getByRole('button', { name: 'Select Feature 1' }), { key: 'Backspace' });
        expect(workspace.annotations).toHaveLength(1);
        fireEvent.keyDown(container.querySelector('.viewer-container')!, { key: 'Backspace' });

        await waitFor(() => expect(workspace.annotations).toEqual([]));
        expect(workspace.sequence).toBe(original.sequence);
        expect(useSequenceStore.getState().getCurrentSequence()?.sequence).toBe(original.sequence);
        expect(useSequenceStore.getState().dirtySequenceIds.sample).toBe(true);
        expect(useUiStore.getState().selectedFeatureId).toBeNull();

        await useSequenceStore.getState().undo();
        expect(workspace.annotations).toHaveLength(1);
        expect(workspace.sequence).toBe(original.sequence);
    });

    it('keeps the feature editor open if deletion fails, then deletes the feature on retry', async () => {
        disk.annotations = [{ id: 'feature-1', name: 'Feature 1', type: 'gene',
            start: 1, end: 5, strand: 'Forward', color: null, display_shape: 'Rect' }];
        render(<App />);
        fireEvent.click(screen.getByRole('button', { name: /^Open$/ }));
        await screen.findByRole('button', { name: 'Edit Feature 1' });
        fireEvent.click(screen.getByRole('button', { name: 'Edit Feature 1' }));

        failUpsert = true;
        fireEvent.click(screen.getByRole('button', { name: 'Delete Feature' }));
        await waitFor(() => expect(message).toHaveBeenCalledWith(
            expect.stringContaining('Could not delete the feature'), expect.anything()));
        expect(screen.getByRole('button', { name: 'Delete Feature' })).toBeInTheDocument();
        expect(workspace.annotations).toHaveLength(1);

        failUpsert = false;
        fireEvent.click(screen.getByRole('button', { name: 'Delete Feature' }));
        await waitFor(() => expect(workspace.annotations).toEqual([]));
        expect(workspace.sequence).toBe(original.sequence);
        expect(screen.queryByRole('button', { name: 'Delete Feature' })).not.toBeInTheDocument();
    });

    it('saves and closes one edited tab without changing the other tab', async () => {
        vi.mocked(open).mockResolvedValue([path, otherPath]);
        render(<App />);
        fireEvent.click(screen.getByRole('button', { name: /^Open$/ }));
        await waitFor(() => expect(useSequenceStore.getState().sequences).toHaveLength(2));

        fireEvent.click(screen.getByRole('button', { name: 'Select bases 2–5' }));
        fireEvent.click(screen.getByRole('button', { name: /^Add Feature$/ }));
        fireEvent.change(screen.getByLabelText('Feature Name'), { target: { value: 'Only sample' } });
        fireEvent.click(within(screen.getByText('Annotate Sequence').closest('.modal-content') as HTMLElement)
            .getByRole('button', { name: 'Add Feature' }));
        await waitFor(() => expect(workspace.annotations).toHaveLength(1));
        fireEvent.click(screen.getByRole('button', { name: /^Save$/ }));
        await waitFor(() => expect(useSequenceStore.getState().dirtySequenceIds).toEqual({}));
        fireEvent.click(screen.getByRole('button', { name: 'Close sample' }));

        await waitFor(() => expect(useSequenceStore.getState().sequences.map((sequence) => sequence.id))
            .toEqual(['other']));
        expect(useSequenceStore.getState().currentIndex).toBe(0);
        expect(useSequenceStore.getState().getCurrentSequence()?.annotations).toEqual([]);
        expect(otherWorkspace).toEqual(otherDisk);
        expect(vi.mocked(invoke).mock.calls.filter(([command]) => command === 'export_gbk'))
            .toEqual([['export_gbk', expect.objectContaining({ path })]]);
    });

    it('keeps the annotation dialog open and the document unchanged when backend sync fails', async () => {
        render(<App />);
        fireEvent.click(screen.getByRole('button', { name: /^Open$/ }));
        await screen.findByRole('button', { name: 'Select bases 2–5' });
        fireEvent.click(screen.getByRole('button', { name: 'Select bases 2–5' }));
        fireEvent.click(screen.getByRole('button', { name: /^Add Feature$/ }));
        fireEvent.change(screen.getByLabelText('Feature Name'), { target: { value: 'Should not appear' } });
        failUpsert = true;
        fireEvent.click(within(screen.getByText('Annotate Sequence').closest('.modal-content') as HTMLElement)
            .getByRole('button', { name: 'Add Feature' }));

        await waitFor(() => expect(message).toHaveBeenCalledWith(
            expect.stringContaining('workspace unavailable'),
            expect.objectContaining({ title: 'Annotation Error', kind: 'error' })
        ));
        expect(screen.getByText('Annotate Sequence')).toBeInTheDocument();
        expect(useSequenceStore.getState().getCurrentSequence()?.annotations).toEqual([]);
        expect(useSequenceStore.getState().dirtySequenceIds).toEqual({});
    });

    it('asks before closing an unsaved tab and keeps it open when cancelled', async () => {
        render(<App />);
        fireEvent.click(screen.getByRole('button', { name: /^Open$/ }));
        await screen.findByRole('button', { name: 'Select bases 2–5' });
        fireEvent.click(screen.getByRole('button', { name: 'Select bases 2–5' }));
        fireEvent.click(screen.getByRole('button', { name: /^Add Feature$/ }));
        fireEvent.click(within(screen.getByText('Annotate Sequence').closest('.modal-content') as HTMLElement)
            .getByRole('button', { name: 'Add Feature' }));
        await waitFor(() => expect(useSequenceStore.getState().dirtySequenceIds.sample).toBe(true));
        vi.mocked(ask).mockResolvedValueOnce(false).mockResolvedValueOnce(true);

        fireEvent.click(screen.getByRole('button', { name: 'Close sample' }));
        await waitFor(() => expect(ask).toHaveBeenCalledTimes(1));
        expect(useSequenceStore.getState().sequences).toHaveLength(1);
        expect(useSequenceStore.getState().dirtySequenceIds.sample).toBe(true);

        fireEvent.click(screen.getByRole('button', { name: 'Close sample' }));
        await waitFor(() => expect(useSequenceStore.getState().sequences).toHaveLength(0));
        expect(useSequenceStore.getState().dirtySequenceIds).toEqual({});
    });

    it('keeps the original path and dirty state after Save As cancellation and export failure', async () => {
        render(<App />);
        fireEvent.click(screen.getByRole('button', { name: /^Open$/ }));
        await screen.findByRole('button', { name: 'Select bases 2–5' });
        fireEvent.click(screen.getByRole('button', { name: 'Select bases 2–5' }));
        fireEvent.click(screen.getByRole('button', { name: /^Add Feature$/ }));
        fireEvent.click(within(screen.getByText('Annotate Sequence').closest('.modal-content') as HTMLElement)
            .getByRole('button', { name: 'Add Feature' }));
        await waitFor(() => expect(useSequenceStore.getState().dirtySequenceIds.sample).toBe(true));
        vi.mocked(save).mockResolvedValueOnce(null).mockResolvedValueOnce('/tmp/new-location.gbk');

        fireEvent.click(screen.getByRole('button', { name: /Export…/ }));
        fireEvent.click(screen.getByRole('menuitem', { name: /Save As/ }));
        await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
        expect(useSequenceStore.getState().getCurrentSequence()?.file_path).toBe(path);
        expect(useSequenceStore.getState().dirtySequenceIds.sample).toBe(true);
        expect(vi.mocked(invoke).mock.calls.filter(([command]) => command === 'export_gbk')).toHaveLength(0);

        failExport = true;
        fireEvent.click(screen.getByRole('button', { name: /Export…/ }));
        fireEvent.click(screen.getByRole('menuitem', { name: /Save As/ }));
        await waitFor(() => expect(message).toHaveBeenCalledWith(
            expect.stringContaining('disk full'), expect.objectContaining({ title: 'Save Error' })
        ));
        expect(screen.getByRole('status')).toHaveTextContent('Save failed');
        expect(useSequenceStore.getState().getCurrentSequence()?.file_path).toBe(path);
        expect(useSequenceStore.getState().dirtySequenceIds.sample).toBe(true);
        expect(disk.annotations).toEqual([]);
    });

    it('recalculates primer mismatches after a UI edit and retains them after save and reload', async () => {
        disk.primers = [{
            id: 'primer-1', name: 'Forward primer', sequence: 'ACGT', start: 0, end: 4,
            strand: 'Forward', tail5: '', tail3: '', color: null, mismatches: [],
        }];
        render(<App />);
        fireEvent.click(screen.getByRole('button', { name: /^Open$/ }));
        await screen.findByRole('button', { name: 'Change base 4 to A' });
        fireEvent.click(screen.getByRole('button', { name: 'Change base 4 to A' }));
        fireEvent.click(screen.getByRole('button', { name: 'Apply Changes' }));

        await waitFor(() => expect(useSequenceStore.getState().getCurrentSequence()?.primers[0].mismatches).toEqual([3]));
        expect(useSequenceStore.getState().getCurrentSequence()?.sequence).toBe('ACGAACGTACGT');
        fireEvent.click(screen.getByRole('button', { name: /^Save$/ }));
        await waitFor(() => expect(useSequenceStore.getState().dirtySequenceIds).toEqual({}));
        fireEvent.click(screen.getByRole('button', { name: 'Close sample' }));
        fireEvent.click(screen.getByRole('button', { name: /^Open$/ }));
        await screen.findByRole('button', { name: 'Change base 4 to A' });

        expect(useSequenceStore.getState().getCurrentSequence()?.sequence).toBe('ACGAACGTACGT');
        expect(useSequenceStore.getState().getCurrentSequence()?.primers[0].mismatches).toEqual([3]);
    });

    it('offers a feature-preserving format when saving annotations opened from FASTA', async () => {
        const fastaPath = '/tmp/annotation-workflow.fasta';
        disk = { ...disk, file_path: fastaPath, description: 'Synthetic study' };
        vi.mocked(open).mockResolvedValue(fastaPath);
        vi.mocked(save).mockResolvedValue('/tmp/annotated.gbk');
        render(<App />);
        fireEvent.click(screen.getByRole('button', { name: /^Open$/ }));
        await screen.findByRole('button', { name: 'Select bases 2–5' });
        fireEvent.click(screen.getByRole('button', { name: 'Select bases 2–5' }));
        fireEvent.click(screen.getByRole('button', { name: /^Add Feature$/ }));
        fireEvent.change(screen.getByLabelText('Feature Name'), { target: { value: 'Preserved' } });
        fireEvent.click(within(screen.getByText('Annotate Sequence').closest('.modal-content') as HTMLElement)
            .getByRole('button', { name: 'Add Feature' }));
        await waitFor(() => expect(useSequenceStore.getState().dirtySequenceIds.sample).toBe(true));

        fireEvent.click(screen.getByRole('button', { name: /^Save$/ }));
        await waitFor(() => expect(disk.annotations[0]?.name).toBe('Preserved'));
        expect(save).toHaveBeenCalledWith(expect.objectContaining({ defaultPath: 'annotation-workflow.gbk' }));
        expect(disk.file_path).toBe('/tmp/annotated.gbk');
        expect(useSequenceStore.getState().getCurrentSequence()?.file_path).toBe('/tmp/annotated.gbk');
        expect(useSequenceStore.getState().dirtySequenceIds).toEqual({});
        expect(vi.mocked(invoke).mock.calls.filter(([command]) => command === 'export_fasta')).toHaveLength(0);
        expect(invoke).toHaveBeenCalledWith('export_gbk', expect.objectContaining({
            id: 'sample', description: 'Synthetic study',
        }));
    });

    it('keeps circular feature and primer coordinates through edit, undo, redo, save, and reload', async () => {
        disk = { ...disk, topology: 'Circular',
            annotations: [{ id: 'origin-feature', name: 'Origin', type: 'misc_feature',
                start: 9, end: 3, strand: 'Reverse', color: null, display_shape: null }],
            primers: [{ id: 'origin-primer', name: 'Origin primer', sequence: 'GTAC',
                start: 10, end: 2, strand: 'Forward', tail5: '', tail3: '',
                color: null, mismatches: [] }] };
        render(<App />);
        fireEvent.click(screen.getByRole('button', { name: /^Open$/ }));
        await screen.findByRole('button', { name: 'Insert GG at origin' });
        fireEvent.click(screen.getByRole('button', { name: 'Insert GG at origin' }));
        fireEvent.click(screen.getByRole('button', { name: 'Apply Changes' }));
        await waitFor(() => expect(useSequenceStore.getState().getCurrentSequence()?.sequence).toBe('GGACGTACGTACGT'));

        fireEvent.click(screen.getByTitle(/^Undo/));
        await waitFor(() => expect(useSequenceStore.getState().getCurrentSequence()?.sequence).toBe('ACGTACGTACGT'));
        fireEvent.click(screen.getByTitle(/^Redo/));
        await waitFor(() => expect(useSequenceStore.getState().getCurrentSequence()?.sequence).toBe('GGACGTACGTACGT'));
        fireEvent.click(screen.getByRole('button', { name: /^Save$/ }));
        await waitFor(() => expect(useSequenceStore.getState().dirtySequenceIds).toEqual({}));
        fireEvent.click(screen.getByRole('button', { name: 'Close sample' }));
        fireEvent.click(screen.getByRole('button', { name: /^Open$/ }));
        await screen.findByRole('button', { name: 'Edit Origin' });

        const reloaded = useSequenceStore.getState().getCurrentSequence();
        expect(reloaded?.topology).toBe('Circular');
        expect(reloaded?.sequence).toBe('GGACGTACGTACGT');
        expect(reloaded?.annotations).toEqual([
            expect.objectContaining({ name: 'Origin', start: 11, end: 5, strand: 'Reverse' }),
        ]);
        expect(reloaded?.primers).toEqual([
            expect.objectContaining({ name: 'Origin primer', start: 12, end: 4, strand: 'Forward' }),
        ]);
    });

    it('reports an invalid file without dropping an already edited tab', async () => {
        render(<App />);
        fireEvent.click(screen.getByRole('button', { name: /^Open$/ }));
        await screen.findByRole('button', { name: 'Select bases 2–5' });
        fireEvent.click(screen.getByRole('button', { name: 'Select bases 2–5' }));
        fireEvent.click(screen.getByRole('button', { name: /^Add Feature$/ }));
        fireEvent.click(within(screen.getByText('Annotate Sequence').closest('.modal-content') as HTMLElement)
            .getByRole('button', { name: 'Add Feature' }));
        await waitFor(() => expect(useSequenceStore.getState().dirtySequenceIds.sample).toBe(true));

        failOpenPath = '/tmp/broken.gbk';
        vi.mocked(open).mockResolvedValue(failOpenPath);
        fireEvent.click(screen.getByRole('button', { name: /^Open$/ }));
        await waitFor(() => expect(message).toHaveBeenCalledWith(
            expect.stringContaining('broken.gbk'),
            expect.objectContaining({ title: 'Open Failed', kind: 'error' })
        ));
        expect(useSequenceStore.getState().sequences).toHaveLength(1);
        expect(useSequenceStore.getState().getCurrentSequence()?.annotations).toHaveLength(1);
        expect(useSequenceStore.getState().dirtySequenceIds.sample).toBe(true);
    });
});
