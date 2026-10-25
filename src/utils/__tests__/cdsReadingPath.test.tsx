import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { Annotation, AppSettings } from '../../types';
import { CdsContinuationTrack } from '../../components/viewer/CdsContinuationTrack';
import { SequenceRow } from '../../components/SequenceRow';
import { getCdsContinuation, getCdsReadingPath, getVisibleCdsContinuations } from '../cdsReadingPath';
import { calculateRowLayout } from '../sequenceLayout';

const forwardSequence = 'ATGGCTGGTGGTGCTTAA';

function feature(id: string, name: string, type: string, start: number, end: number, strand: 'Forward' | 'Reverse' = 'Forward'): Annotation {
    return { id, name, type, start, end, strand, color: null, display_shape: null };
}

describe('CDS reading path', () => {
    it('shows an in-frame protein–linker–tag path with the stop in the tag', () => {
        const annotations = [
            feature('protein', 'proteinA', 'CDS', 0, 6),
            feature('linker', 'linker', 'misc_feature', 6, 12),
            feature('tag', 'tag', 'misc_feature', 12, 18)
        ];
        const path = getCdsReadingPath(forwardSequence, 'Linear', annotations[0], annotations);
        expect(path?.segments.map(segment => [segment.annotation.name, segment.codonAligned])).toEqual([
            ['proteinA', true], ['linker', true], ['tag', true]
        ]);
        expect(path?.stop).toEqual({ codon: 'TAA', distance: 15, segmentId: 'tag' });

        expect(getCdsContinuation(forwardSequence, 'Linear', annotations[0], annotations)).toEqual({
            ranges: [{ start: 6, end: 18 }], stopBaseIndex: 16
        });
    });

    it('draws an inline continuation and stop after an unannotated CDS end, even across rows', () => {
        const annotations = [feature('protein', 'proteinA', 'CDS', 0, 6)];
        const continuation = getCdsContinuation(forwardSequence, 'Linear', annotations[0], annotations);
        expect(continuation).not.toBeNull();
        const { rerender } = render(<CdsContinuationTrack continuation={continuation!}
            rowStartIndex={6} rowStrLen={12} charWidth={10} y={30} />);
        expect(screen.getByLabelText('CDS translation continuation')).toHaveTextContent('in frame');
        expect(screen.getByLabelText('stop codon')).toHaveTextContent('*');
        rerender(<CdsContinuationTrack continuation={continuation!}
            rowStartIndex={12} rowStrLen={6} charWidth={10} y={30} />);
        expect(screen.getByLabelText('stop codon')).toHaveTextContent('*');
    });

    it('finds continuation paths in the visible range without a selected CDS', () => {
        const sequence = `${forwardSequence}GGG${forwardSequence}`;
        const annotations = [
            feature('first', 'proteinA', 'CDS', 0, 6),
            feature('second', 'proteinB', 'CDS', 21, 27)
        ];
        expect(getVisibleCdsContinuations(sequence, 'Linear', annotations, 0, 6)).toEqual([]);
        expect(getVisibleCdsContinuations(sequence, 'Linear', annotations, 6, 18)
            .map(continuation => continuation.cdsId)).toEqual(['first']);
        expect(getVisibleCdsContinuations(sequence, 'Linear', annotations, 27, 39)
            .map(continuation => continuation.cdsId)).toEqual(['second']);
        expect(getVisibleCdsContinuations(sequence, 'Linear', annotations, 0, 39)
            .map(continuation => continuation.cdsId)).toEqual(['first', 'second']);
    });

    it('renders the continuation without selecting its CDS', () => {
        const annotations = [feature('protein', 'proteinA', 'CDS', 0, 6)];
        const settings: AppSettings = { fontFamily: 'monospace', fontSize: 16, aminoAcidTheme: null };
        const rowStr = forwardSequence.slice(6);
        const layout = calculateRowLayout({ bases: rowStr, annotations: [], enzymes: [], primers: [] },
            6, rowStr.length, 12, settings, 0);
        render(<SequenceRow
            rowStr={rowStr} rowStartIndex={6} restrictionSites={[]} selection={null}
            annotations={[]} primers={[]} annotationTracks={{}} cdsTranslations={{}}
            cdsContinuations={getVisibleCdsContinuations(forwardSequence, 'Linear', annotations, 6, 18)}
            sequenceLength={forwardSequence.length} onMouseDown={vi.fn()} onMouseEnter={vi.fn()}
            onSelectionChange={vi.fn()} hoveredEnzyme={null} onHoverEnzyme={vi.fn()}
            hoveredPrimer={null} onHoverPrimer={vi.fn()} hoveredAnnotation={null}
            onHoverAnnotation={vi.fn()} charWidth={12} settings={settings}
            rowMetrics={layout} isDark={false} charsPerRow={rowStr.length}
        />);
        expect(screen.getByText('in frame')).toBeInTheDocument();
        expect(screen.getByLabelText('stop codon')).toHaveTextContent('*');
    });

    it('marks a split codon boundary instead of claiming the annotations are aligned', () => {
        const annotations = [
            feature('protein', 'proteinA', 'CDS', 0, 6),
            feature('linker', 'linker', 'misc_feature', 7, 12),
            feature('tag', 'tag', 'misc_feature', 12, 18)
        ];
        const path = getCdsReadingPath(forwardSequence, 'Linear', annotations[0], annotations);
        expect(path?.segments[1].codonAligned).toBe(false);
        expect(path?.stop?.segmentId).toBe('tag');
    });

    it('follows the reverse strand and a circular origin crossing', () => {
        const reverseComplement = forwardSequence.split('').reverse().map(base =>
            ({ A: 'T', T: 'A', G: 'C', C: 'G' })[base as 'A' | 'T' | 'G' | 'C']
        ).join('');
        const reverseAnnotations = [
            feature('protein', 'proteinA', 'CDS', 12, 18, 'Reverse'),
            feature('linker', 'linker', 'misc_feature', 6, 12, 'Reverse'),
            feature('tag', 'tag', 'misc_feature', 0, 6, 'Reverse')
        ];
        expect(getCdsReadingPath(reverseComplement, 'Linear', reverseAnnotations[0], reverseAnnotations)?.stop)
            .toEqual({ codon: 'TAA', distance: 15, segmentId: 'tag' });
        expect(getCdsContinuation(reverseComplement, 'Linear', reverseAnnotations[0], reverseAnnotations))
            .toEqual({ ranges: [{ start: 0, end: 12 }], stopBaseIndex: 1 });

        const circularSequence = forwardSequence.slice(12) + forwardSequence.slice(0, 12);
        const circularAnnotations = [
            feature('protein', 'proteinA', 'CDS', 6, 12),
            feature('linker', 'linker', 'misc_feature', 12, 18),
            feature('tag', 'tag', 'misc_feature', 0, 6)
        ];
        const circularPath = getCdsReadingPath(circularSequence, 'Circular', circularAnnotations[0], circularAnnotations);
        expect(circularPath?.segments.map(segment => segment.annotation.name)).toEqual(['proteinA', 'linker', 'tag']);
        expect(circularPath?.stop).toEqual({ codon: 'TAA', distance: 15, segmentId: 'tag' });
        expect(getCdsContinuation(circularSequence, 'Circular', circularAnnotations[0], circularAnnotations))
            .toEqual({ ranges: [{ start: 12, end: 18 }, { start: 0, end: 6 }], stopBaseIndex: 4 });
        expect(getVisibleCdsContinuations(circularSequence, 'Circular', circularAnnotations, 0, 6)
            .map(continuation => continuation.cdsId)).toEqual(['protein']);
    });

    it('reports an early stop within the named CDS', () => {
        const annotations = [feature('protein', 'proteinA', 'CDS', 0, 9)];
        const path = getCdsReadingPath('ATGTAAGCT', 'Linear', annotations[0], annotations);
        expect(path?.stop).toEqual({ codon: 'TAA', distance: 3, segmentId: 'protein' });
    });
});
