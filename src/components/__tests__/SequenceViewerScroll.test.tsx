import { render, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SequenceViewer } from '../SequenceViewer';
import { useUiStore } from '../../store/useUiStore';
import type { SequenceData } from '../../types';
import * as api from '../../api';

vi.mock('../../api', () => ({
    getSequenceViewData: vi.fn(),
    translateAnnotations: vi.fn(),
}));
vi.mock('@tauri-apps/api/event', () => ({ listen: vi.fn(async () => () => {}) }));
vi.mock('../SequenceRow', () => ({ SequenceRow: () => null }));
vi.mock('../LinearMiniMap', () => ({ LinearMiniMap: () => null }));
vi.mock('../viewer/SequenceViewportCanvas', () => ({ SequenceViewportCanvas: () => null }));

const scrollTo = vi.fn();

beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(HTMLElement.prototype, 'scrollTo', { configurable: true, value: scrollTo });
    vi.stubGlobal('ResizeObserver', class {
        observe() {}
        disconnect() {}
    });
    vi.mocked(api.getSequenceViewData).mockImplementation(async (_id, start, end) => ({
        bases: 'A'.repeat(Math.max(0, end - start)),
        annotations: [], enzymes: [], primers: []
    } as Awaited<ReturnType<typeof api.getSequenceViewData>>));
});

function documentWithLength(length: number): SequenceData {
    return {
        id: 'sample', description: null, sequence: 'A'.repeat(length),
        annotations: [], primers: [], topology: 'Linear', trace: null,
        enzymes: null, enzymeSettings: null, alignmentResults: null,
        debug_hex: null, file_path: null
    };
}

describe('SequenceViewer scroll position during edits', () => {
    it('preserves measured row heights and does not replay an earlier search jump on insertion', async () => {
        const settings = useUiStore.getState().appSettings;
        const props = {
            sequenceData: documentWithLength(159),
            onEdit: vi.fn(), onSelectionChange: vi.fn(),
            selection: { start: 80, end: 80 },
            onHoverEnzyme: vi.fn(), settings, isDark: false,
            lastJumpTime: 123
        };
        const { container, rerender } = render(<SequenceViewer {...props} />);
        const rows = container.querySelector('.sequence-rows-container') as HTMLElement;
        await waitFor(() => expect(rows.style.height).not.toBe(`${settings.fontSize * 20}px`));
        const measuredHeight = rows.style.height;
        expect(scrollTo).toHaveBeenCalledTimes(1);

        rerender(<SequenceViewer {...props} sequenceData={documentWithLength(160)} selection={{ start: 81, end: 81 }} />);
        expect(rows.style.height).toBe(measuredHeight);
        expect(scrollTo).toHaveBeenCalledTimes(1);

        rerender(<SequenceViewer {...props} sequenceData={documentWithLength(161)} selection={{ start: 81, end: 81 }} />);
        expect(rows.style.height).toBe(`${parseFloat(measuredHeight) + settings.fontSize * 10}px`);
        expect(scrollTo).toHaveBeenCalledTimes(1);
    });
});
