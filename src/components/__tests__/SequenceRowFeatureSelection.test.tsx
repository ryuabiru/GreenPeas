import { fireEvent, render } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import type { Annotation, RowMetrics } from '../../types';
import { useUiStore } from '../../store/useUiStore';
import { SequenceRow } from '../SequenceRow';

it('selects a feature by identity on its first click', () => {
    const annotation: Annotation = {
        id: 'feature-1', name: 'Feature 1', type: 'gene', start: 1, end: 5,
        strand: 'Forward', color: null, display_shape: 'Rect'
    };
    const rowMetrics: RowMetrics = {
        height: 100, offset: 0, trackY: {}, seqY: 10,
        hitBoxes: [{ x: 0, y: 0, w: 100, h: 20, target: { Annotation: annotation.id } }]
    };
    const onSelectionChange = vi.fn();
    const onClickAnnotation = vi.fn();
    const { container } = render(<SequenceRow
        rowStr="ACGTACGT" rowStartIndex={0} restrictionSites={[]}
        selection={null} annotations={[annotation]} primers={[]}
        annotationTracks={{}} cdsTranslations={{}} sequenceLength={8}
        onMouseDown={vi.fn()} onMouseEnter={vi.fn()}
        onSelectionChange={onSelectionChange} onClickAnnotation={onClickAnnotation}
        hoveredEnzyme={null} onHoverEnzyme={vi.fn()}
        hoveredPrimer={null} onHoverPrimer={vi.fn()}
        hoveredAnnotation={null} onHoverAnnotation={vi.fn()}
        charWidth={10} settings={useUiStore.getState().appSettings}
        rowMetrics={rowMetrics} isDark={false} charsPerRow={8}
    />);

    fireEvent.mouseDown(container.querySelector('.sequence-interaction-overlay')!, {
        button: 0, clientX: 45, clientY: 5
    });

    expect(onSelectionChange).toHaveBeenCalledWith({ start: 1, end: 5 });
    expect(onClickAnnotation).toHaveBeenCalledWith(annotation);
});
