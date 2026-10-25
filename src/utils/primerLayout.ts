import type { AppSettings, Primer } from '../types';

export function getPrimerSequenceRange(primer: Primer) {
    const tailLength = primer.strand === 'Reverse'
        ? primer.tail3?.length || 0 : primer.tail5?.length || 0;
    const start = primer.start - tailLength;
    return { start, end: start + primer.sequence.length };
}

export function primerHasBasesInRow(primer: Primer, rowStart: number, rowEnd: number) {
    const range = getPrimerSequenceRange(primer);
    return range.start < rowEnd && range.end > rowStart;
}

// The direction sits with the label, leaving only two vertical lanes.
export function getPrimerTrackGeometry(settings: AppSettings, isReverse: boolean) {
    const baseFontSize = settings.fontSize * 0.85;
    const labelFontSize = Math.max(11, settings.fontSize * 0.78);
    const tailOffset = settings.fontSize * 0.8;
    const mismatchOffset = settings.fontSize * 0.4;
    const labelBaseline = labelFontSize + 2;
    const forwardBaseBaseline = labelBaseline + tailOffset + baseFontSize + 6;
    const reverseBaseBaseline = labelBaseline + baseFontSize + 7;
    const baseBaseline = isReverse ? reverseBaseBaseline : forwardBaseBaseline;
    const height = Math.ceil(Math.max(
        forwardBaseBaseline + baseFontSize * 0.2,
        reverseBaseBaseline + tailOffset + baseFontSize * 0.2
    ) + 6);

    return { baseFontSize, labelFontSize, tailOffset, mismatchOffset,
        labelBaseline, baseBaseline, height };
}

export function getPrimerLabelWidth(name: string, settings: AppSettings) {
    const labelFontSize = Math.max(11, settings.fontSize * 0.78);
    return (name.length + 2) * labelFontSize * 0.62 + 8;
}
