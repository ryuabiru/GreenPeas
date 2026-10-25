import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Primer, SequenceData } from '../../types';
import { useSequenceStore } from '../../store/useSequenceStore';
import { analyzePrimer, upsertSequence } from '../../api';
import { PrimerModal } from '../modals/PrimerModal';

vi.mock('../../api', () => ({
    analyzePrimer: vi.fn(),
    upsertSequence: vi.fn()
}));

const primer: Primer = {
    id: 'primer-1', name: 'Reverse primer', sequence: 'ACGTACGT',
    start: 10, end: 18, strand: 'Reverse', tail5: '', tail3: '',
    color: '#ff00aa', mismatches: [2]
};

function document(): SequenceData {
    return {
        id: 'sample', description: null, sequence: 'A'.repeat(40),
        annotations: [], primers: [primer], topology: 'Linear', trace: null,
        enzymes: null, enzymeSettings: null, alignmentResults: null,
        debug_hex: null, file_path: null
    };
}

beforeEach(() => {
    vi.clearAllMocks();
    useSequenceStore.setState({
        sequences: [document()], currentIndex: 0, dirtySequenceIds: {}
    });
});

describe('editing a primer', () => {
    it('replaces the primer with its ID and custom color intact', async () => {
        vi.mocked(upsertSequence).mockResolvedValue(undefined as never);
        const onClose = vi.fn();
        render(<PrimerModal isOpen onClose={onClose} selection={null} initialPrimer={primer} />);

        fireEvent.change(screen.getByDisplayValue('Reverse primer'), {
            target: { value: 'Renamed primer' }
        });
        fireEvent.click(screen.getByRole('button', { name: 'Save Primer' }));

        await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
        const saved = useSequenceStore.getState().getCurrentSequence()!.primers;
        expect(saved).toHaveLength(1);
        expect(saved[0]).toMatchObject({
            id: primer.id, name: 'Renamed primer', color: primer.color,
            start: primer.start, end: primer.end, mismatches: primer.mismatches
        });
        expect(upsertSequence).toHaveBeenCalledWith(expect.objectContaining({ primers: saved }));
        expect(useSequenceStore.getState().dirtySequenceIds.sample).toBe(true);
    });

    it('keeps the original primer and the editor open when syncing fails', async () => {
        vi.mocked(upsertSequence).mockRejectedValue(new Error('sync failed'));
        const onClose = vi.fn();
        render(<PrimerModal isOpen onClose={onClose} selection={null} initialPrimer={primer} />);

        fireEvent.change(screen.getByDisplayValue('Reverse primer'), {
            target: { value: 'Renamed primer' }
        });
        fireEvent.click(screen.getByRole('button', { name: 'Save Primer' }));

        await waitFor(() => expect(screen.getByText(/Could not save primer/)).toBeInTheDocument());
        expect(onClose).not.toHaveBeenCalled();
        expect(useSequenceStore.getState().getCurrentSequence()!.primers).toEqual([primer]);
    });

    it('reanalyzes an edited sequence at the existing binding site', async () => {
        vi.mocked(analyzePrimer).mockResolvedValue({
            ...primer, id: '', name: 'New Primer', sequence: 'ACGTACGA', mismatches: [7]
        });
        vi.mocked(upsertSequence).mockResolvedValue(undefined as never);
        render(<PrimerModal isOpen onClose={vi.fn()} selection={null} initialPrimer={primer} />);

        fireEvent.change(screen.getByDisplayValue(primer.sequence), {
            target: { value: 'ACGTACGA' }
        });
        await waitFor(() => expect(analyzePrimer).toHaveBeenCalledWith(
            'A'.repeat(40), 'ACGTACGA', primer.start, primer.end, primer.strand
        ));
        fireEvent.click(screen.getByRole('button', { name: 'Save Primer' }));

        await waitFor(() => expect(useSequenceStore.getState().getCurrentSequence()!.primers[0])
            .toMatchObject({ id: primer.id, sequence: 'ACGTACGA', mismatches: [7] }));
    });
});
