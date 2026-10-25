import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { ask } from '@tauri-apps/plugin-dialog';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { readText } from '@tauri-apps/plugin-clipboard-manager';
import { useTauriIntegration } from '../useTauriIntegration';
import { useSequenceStore } from '../../store/useSequenceStore';
import { NewSequenceModal } from '../../components/modals/NewSequenceModal';

vi.mock('@tauri-apps/api/event', () => ({ listen: vi.fn() }));
vi.mock('@tauri-apps/plugin-dialog', () => ({ ask: vi.fn(), open: vi.fn() }));
vi.mock('@tauri-apps/api/window', () => ({ getCurrentWindow: vi.fn() }));
vi.mock('@tauri-apps/plugin-clipboard-manager', () => ({ readText: vi.fn() }));

function HookHost() {
    useTauriIntegration();
    return null;
}

describe('unsaved window close', () => {
    const destroy = vi.fn(async () => {});
    const onCloseRequested = vi.fn();

    beforeEach(() => {
        vi.clearAllMocks();
        useSequenceStore.setState({ dirtySequenceIds: { sample: true } });
        vi.mocked(invoke).mockResolvedValue([]);
        vi.mocked(listen).mockResolvedValue(() => {});
        onCloseRequested.mockResolvedValue(() => {});
        vi.mocked(getCurrentWindow).mockReturnValue({ onCloseRequested, destroy } as any);
    });

    it('keeps the window open after cancellation and closes it only after discard is accepted', async () => {
        render(<HookHost />);
        await waitFor(() => expect(onCloseRequested).toHaveBeenCalledTimes(1));
        const closeHandler = onCloseRequested.mock.calls[0][0] as (event: { preventDefault: () => void }) => Promise<void>;
        const preventDefault = vi.fn();
        vi.mocked(ask).mockResolvedValueOnce(false).mockResolvedValueOnce(true);

        await closeHandler({ preventDefault });
        expect(preventDefault).toHaveBeenCalledTimes(1);
        expect(destroy).not.toHaveBeenCalled();
        expect(useSequenceStore.getState().dirtySequenceIds).toEqual({ sample: true });

        await closeHandler({ preventDefault });
        expect(preventDefault).toHaveBeenCalledTimes(2);
        expect(ask).toHaveBeenCalledWith(expect.stringContaining('1 sequence'),
            expect.objectContaining({ okLabel: 'Discard and Quit', cancelLabel: 'Keep Working' }));
        expect(destroy).toHaveBeenCalledTimes(1);
    });

    it('updates the new sequence length when the Paste menu inserts DNA', async () => {
        const onCreate = vi.fn();
        vi.mocked(readText).mockResolvedValue('ACGTNN');
        render(<><HookHost /><NewSequenceModal isOpen onClose={vi.fn()} onCreate={onCreate} defaultName="Untitled_1" /></>);
        const textarea = screen.getByPlaceholderText('Paste DNA sequence here...');
        textarea.focus();
        await waitFor(() => expect(vi.mocked(listen).mock.calls.some(([name]) => name === 'menu-paste')).toBe(true));
        const pasteHandler = vi.mocked(listen).mock.calls.find(([name]) => name === 'menu-paste')![1];

        await act(async () => { await pasteHandler({} as never); });

        expect(textarea).toHaveValue('ACGTNN');
        expect(screen.getByText(/6 bp/)).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Create Sequence' }));
        expect(onCreate).toHaveBeenCalledWith('Untitled_1', 'ACGTNN', 'Linear');
    });

    it('waits for an in-flight edit before deciding whether closing discards changes', async () => {
        const sequence = {
            id: 'sample', sequence: 'ACGT', topology: 'Linear' as const,
            annotations: [], primers: [], description: null, alignmentResults: null,
            trace: null, enzymes: null, enzymeSettings: null, debug_hex: null, file_path: null
        };
        useSequenceStore.setState({ sequences: [sequence], currentIndex: 0,
            history: [], redoStack: [], dirtySequenceIds: {} });
        let finishEdit!: (value: unknown) => void;
        vi.mocked(invoke).mockImplementationOnce(() => new Promise(resolve => { finishEdit = resolve; }));
        const editing = useSequenceStore.getState().performEdit(0, 1, 'G');
        await waitFor(() => expect(finishEdit).toBeTypeOf('function'));
        render(<HookHost />);
        await waitFor(() => expect(onCloseRequested).toHaveBeenCalledTimes(1));
        const closeHandler = onCloseRequested.mock.calls[0][0] as
            (event: { preventDefault: () => void }) => Promise<void>;
        const preventDefault = vi.fn();
        vi.mocked(ask).mockResolvedValue(false);

        const closing = closeHandler({ preventDefault });
        expect(preventDefault).toHaveBeenCalledOnce();
        expect(ask).not.toHaveBeenCalled();
        finishEdit({ ...sequence, sequence: 'GCGT' });
        await Promise.all([editing, closing]);

        expect(ask).toHaveBeenCalledWith(expect.stringContaining('1 sequence'), expect.anything());
        expect(destroy).not.toHaveBeenCalled();
    });
});
