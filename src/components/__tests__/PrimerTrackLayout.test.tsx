import { fireEvent, render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { INDEX_COLUMN_WIDTH, type AppSettings, type Primer, type SequenceViewData } from '../../types';
import { getPrimerTrackGeometry } from '../../utils/primerLayout';
import { calculateRowLayout } from '../../utils/sequenceLayout';
import { PrimerArrow } from '../viewer/PrimerArrow';
import { SequenceRow } from '../SequenceRow';

const settings: AppSettings = { fontFamily: 'monospace', fontSize: 16, aminoAcidTheme: null };
const forward: Primer = {
    id: 'forward', name: 'Forward primer', sequence: 'ACGT', start: 10, end: 14,
    strand: 'Forward', tail5: '', tail3: '', color: null, mismatches: [1]
};
const reverse: Primer = {
    ...forward, id: 'reverse', name: 'Reverse primer', strand: 'Reverse', mismatches: [1]
};

describe('primer tracks', () => {
    it.each([forward, reverse])('keeps the name and direction above displaced bases for $strand', primer => {
        const geometry = getPrimerTrackGeometry(settings, primer.strand === 'Reverse');
        const { container } = render(<svg><PrimerArrow primer={primer} y={0}
            rowStartIndex={0} charWidth={12} settings={settings}
            rowStr={'A'.repeat(40)} onHover={vi.fn()} /></svg>);
        const name = [...container.querySelectorAll('text')].find(node =>
            node.textContent?.includes(primer.name))!;
        const displacedBase = [...container.querySelectorAll('text')].find(node =>
            node.getAttribute('fill') === '#f59e0b')!;

        expect(name.textContent).toBe(primer.strand === 'Reverse'
            ? `← ${primer.name}` : `${primer.name} →`);
        expect(Number(name.getAttribute('y'))).toBe(geometry.labelBaseline);
        expect(Number(displacedBase.getAttribute('y')) - geometry.baseFontSize)
            .toBeGreaterThan(geometry.labelBaseline + 2);
        expect(Number(displacedBase.getAttribute('y')) + 4).toBeLessThan(geometry.height);
        expect(container.querySelector('line[stroke-width="2"]')).toBeNull();
    });

    it('reserves a full track above and below the template sequence', () => {
        const data: SequenceViewData = {
            bases: 'A'.repeat(40), annotations: [], enzymes: [], primers: [forward, reverse]
        };
        const layout = calculateRowLayout(data, 0, 40, 12, settings, 0);
        const height = getPrimerTrackGeometry(settings, false).height;
        const forwardY = layout.trackY.primer_forward;
        const reverseY = layout.trackY.primer_reverse;

        expect(forwardY + height).toBeLessThan(layout.seqY);
        expect(reverseY).toBeGreaterThan(layout.seqY + settings.fontSize * 2.5);
        expect(reverseY + height).toBeLessThan(layout.height);
        expect(height).toBeLessThan(60);
    });

    it('does not reserve space for a primer with no bases in the row', () => {
        const data: SequenceViewData = {
            bases: 'A'.repeat(40), annotations: [], enzymes: [], primers: [
                { ...reverse, id: 'off-row', start: 50, end: 14 }
            ]
        };
        const emptyLayout = calculateRowLayout({ ...data, primers: [] }, 0, 40, 12, settings, 0);
        const layout = calculateRowLayout(data, 0, 40, 12, settings, 0);

        expect(layout.trackY.primer_off_row).toBeUndefined();
        expect(layout.height).toBe(emptyLayout.height);
    });

    it('selects the binding range on click and opens editing on double click', () => {
        const data: SequenceViewData = {
            bases: 'A'.repeat(40), annotations: [], enzymes: [], primers: [reverse]
        };
        const layout = calculateRowLayout(data, 0, 40, 12, settings, 0);
        const onSelectionChange = vi.fn();
        const onDoubleClickPrimer = vi.fn();
        const { container } = render(<SequenceRow
            rowStr={data.bases} rowStartIndex={0} restrictionSites={[]}
            selection={null} annotations={[]} primers={[reverse]} annotationTracks={{}}
            cdsTranslations={{}} sequenceLength={40} onMouseDown={vi.fn()}
            onMouseEnter={vi.fn()} onSelectionChange={onSelectionChange}
            onDoubleClickPrimer={onDoubleClickPrimer} hoveredEnzyme={null}
            onHoverEnzyme={vi.fn()} hoveredPrimer={null} onHoverPrimer={vi.fn()}
            hoveredAnnotation={null} onHoverAnnotation={vi.fn()} charWidth={12}
            settings={settings} rowMetrics={layout} isDark={false} charsPerRow={40}
        />);
        const overlay = container.querySelector('.sequence-interaction-overlay') as HTMLElement;
        vi.spyOn(overlay, 'getBoundingClientRect').mockReturnValue({ left: 0, top: 0 } as DOMRect);
        const hitBox = layout.hitBoxes.find(box => 'Primer' in box.target)!;
        const event = {
            clientX: INDEX_COLUMN_WIDTH + hitBox.x + 2,
            clientY: hitBox.y + 2,
            button: 0
        };

        fireEvent.mouseDown(overlay, event);
        expect(onSelectionChange).toHaveBeenCalledWith({ start: reverse.start, end: reverse.end });
        fireEvent.doubleClick(overlay, event);
        expect(onDoubleClickPrimer).toHaveBeenCalledWith(reverse);
    });
});
