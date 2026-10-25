/**
 * 学習メモ: 線状配列を行へ分割し、各行の高さや表示範囲を計算する。
 * 処理の位置づけ: ストアやコンポーネントから呼ばれ、UIに依存しない計算結果を返す。
 */

import { AppSettings, SequenceViewData, RowMetrics, HitBox } from '../types';
import { getPrimerLabelWidth, getPrimerSequenceRange, getPrimerTrackGeometry, primerHasBasesInRow } from './primerLayout';

export const LayoutMetrics = {
    getAaTrackHeight: (settings: AppSettings) => Math.max(18, settings.fontSize * 1.2),
    getBoxHeight: (settings: AppSettings) => Math.max(22, settings.fontSize * 1.4),
    getEnzymeTrackHeight: (settings: AppSettings) => Math.max(16, settings.fontSize * 1.1),
    getSequenceHeight: (settings: AppSettings) => settings.fontSize * 2.5,
    needsLabel: (width: number, nameLength: number, settings: AppSettings) => width < nameLength * (settings.fontSize * 0.45),
    EXTRA_LABEL_HEIGHT: 12,
    AA_MARGIN_BOTTOM: 6,
    ENZYME_WIDTH_PADDING: 8,
    ROW_GAP: 20,
    INDEX_COLUMN_WIDTH: 40,
};

export function calculateRowLayout(
    data: SequenceViewData,
    rowStartIndex: number,
    charsPerRow: number,
    charWidth: number,
    settings: AppSettings,
    offset: number
): RowMetrics {
    const trackY: Record<string, number> = {};
    const hitBoxes: HitBox[] = [];

    // 1. Enzyme Track Allocation
    let maxEnzymeTrack = -1;
    const enzymeTracks: number[] = []; // End X of each track
    
    // Sort enzymes by position to be deterministic
    const rowEnzymes = [...data.enzymes].sort((a, b) => a.position - b.position);
    
    rowEnzymes.forEach((site) => {
        const x = (site.position - rowStartIndex) * charWidth;
        const width = site.name.length * (settings.fontSize * 0.6) + LayoutMetrics.ENZYME_WIDTH_PADDING;
        
        let trackIdx = 0;
        while (trackIdx < enzymeTracks.length && enzymeTracks[trackIdx] > x) {
            trackIdx++;
        }
        
        if (trackIdx >= enzymeTracks.length) {
            enzymeTracks.push(0);
        }
        enzymeTracks[trackIdx] = x + width;
        maxEnzymeTrack = Math.max(maxEnzymeTrack, trackIdx);
        
        const y = trackIdx * LayoutMetrics.getEnzymeTrackHeight(settings);
        trackY[`enzyme_${site.name}_${site.position}`] = y;
        
        hitBoxes.push({
            x, y, w: width, h: LayoutMetrics.getEnzymeTrackHeight(settings),
            target: { "RestrictionSite": [site.name, site.position] }
        });
    });

    const enzymeSectionHeight = (maxEnzymeTrack + 1) * LayoutMetrics.getEnzymeTrackHeight(settings);
    
    // 2. F-Primer Track Allocation (Above Sequence, needs to be calculated BEFORE seqY)
    const visiblePrimers = data.primers.filter(p =>
        primerHasBasesInRow(p, rowStartIndex, rowStartIndex + data.bases.length));
    const fPrimers = visiblePrimers.filter(p => p.strand === "Forward");
    const fPrimerTracks: number[] = [];
    const fPrimerTrackIndices: Map<string, number> = new Map();
    
    fPrimers.forEach((p: any) => {
        const primerFullStart = getPrimerSequenceRange(p).start;
        const fullLen = p.sequence.length;
        const x = (primerFullStart - rowStartIndex) * charWidth;
        const width = fullLen * charWidth;
        
        let trackIdx = 0;
        while (trackIdx < fPrimerTracks.length && fPrimerTracks[trackIdx] > x) {
            trackIdx++;
        }
        if (trackIdx >= fPrimerTracks.length) fPrimerTracks.push(0);
        fPrimerTracks[trackIdx] = x + Math.max(width, getPrimerLabelWidth(p.name, settings)) + 12;
        fPrimerTrackIndices.set(p.id, trackIdx);
    });

    const primerTrackHeight = getPrimerTrackGeometry(settings, false).height;
    const fPrimerSectionHeight = fPrimerTracks.length * primerTrackHeight;
    const seqY = enzymeSectionHeight + fPrimerSectionHeight + 12;
    const seqHeight = LayoutMetrics.getSequenceHeight(settings);

    // Now assign F-Primer actual Y coordinates
    fPrimers.forEach((p: any) => {
        const trackIdx = fPrimerTrackIndices.get(p.id) ?? 0;
        const y = enzymeSectionHeight + (fPrimerTracks.length - trackIdx - 1) * primerTrackHeight;
        trackY[`primer_${p.id}`] = y;
        
        const primerFullStart = getPrimerSequenceRange(p).start;
        const x = (primerFullStart - rowStartIndex) * charWidth;
        const width = p.sequence.length * charWidth;

        hitBoxes.push({
            x, y, w: Math.max(width, getPrimerLabelWidth(p.name, settings)), h: primerTrackHeight,
            target: { "Primer": p.id }
        });
    });

    // 3. Base Hitboxes
    for (let i = 0; i < data.bases.length; i++) {
        hitBoxes.push({
            x: i * charWidth,
            y: seqY,
            w: charWidth,
            h: seqHeight,
            target: { "Base": rowStartIndex + i }
        });
    }

    // 4. Annotation Track Allocation (Below Sequence)
    let currentY = seqY + seqHeight + 15;
    const featureTracks: number[] = []; // End X of each track
    const trackOffsets: number[] = [0]; // Accumulative Y offset for each track
    
    const rowAnns = [...data.annotations].sort((a, b) => {
        const aLen = Math.abs(a.end - a.start);
        const bLen = Math.abs(b.end - b.start);
        if (a.type === 'CDS' && b.type !== 'CDS') return -1;
        if (a.type !== 'CDS' && b.type === 'CDS') return 1;
        return bLen - aLen;
    });

    let maxTrackY = currentY;

    rowAnns.forEach((ann) => {
        const startX = Math.max(0, (ann.start - rowStartIndex) * charWidth);
        const endX = Math.min(charsPerRow * charWidth, (ann.end - rowStartIndex) * charWidth);
        const width = Math.max(5, endX - startX);

        let trackIdx = 0;
        while (trackIdx < featureTracks.length && featureTracks[trackIdx] > startX) {
            trackIdx++;
        }
        if (trackIdx >= featureTracks.length) {
            featureTracks.push(0);
            trackOffsets.push(trackOffsets[trackIdx] + LayoutMetrics.getBoxHeight(settings) + 18);
        }
        
        const hasAA = ann.type === 'CDS';
        const boxHeight = LayoutMetrics.getBoxHeight(settings);
        const aaHeight = LayoutMetrics.getAaTrackHeight(settings);
        const labelHeight = 16; // Approximate label height
        
        const y = currentY + trackOffsets[trackIdx];
        
        if (hasAA) {
            // AA on top
            const aaY = y;
            trackY[`ann_${ann.id}_aa`] = aaY;
            trackY[`ann_${ann.id}_box`] = aaY + aaHeight + 4;
            trackY[`ann_${ann.id}_label`] = aaY + aaHeight + 4 + boxHeight + 2;
            
            hitBoxes.push({
                x: startX, 
                y: aaY,
                w: width,
                h: aaHeight,
                target: { "AnnotationAA": ann.id }
            });
        } else {
            // Standard order - more compact
            trackY[`ann_${ann.id}_box`] = y;
            trackY[`ann_${ann.id}_label`] = y + boxHeight + 2;
        }

        // Box HitBox
        const boxY = trackY[`ann_${ann.id}_box`];
        hitBoxes.push({
            x: startX, 
            y: boxY, 
            w: width, 
            h: boxHeight + labelHeight,
            target: { "Annotation": ann.id }
        });

        const featureHeight = boxHeight + labelHeight + (hasAA ? aaHeight + 8 : 0);

        // Update track offset for the NEXT track to be below the TALLEST item in current track
        if (trackIdx + 1 >= trackOffsets.length) {
            trackOffsets.push(trackOffsets[trackIdx] + featureHeight + 6);
        } else {
            trackOffsets[trackIdx + 1] = Math.max(trackOffsets[trackIdx + 1], trackOffsets[trackIdx] + featureHeight + 6);
        }

        const labelWidth = ann.name.length * settings.fontSize * 0.55 + 12;
        const occupiedEnd = LayoutMetrics.needsLabel(width, ann.name.length, settings)
            ? Math.max(endX, startX + labelWidth)
            : endX;
        featureTracks[trackIdx] = occupiedEnd + 12;
        maxTrackY = Math.max(maxTrackY, y + featureHeight);
    });

    // 5. R-Primer Track Allocation (Below Annotations)
    const rPrimerTracks: number[] = [];
    const reversePrimerStartY = maxTrackY + 12;
    visiblePrimers.filter(p => p.strand === "Reverse").forEach((p: any) => {
        const primerFullStart = getPrimerSequenceRange(p).start;
        const fullLen = p.sequence.length;
        
        const x = (primerFullStart - rowStartIndex) * charWidth;
        const width = fullLen * charWidth;
        const occupiedLeft = x + Math.min(0, width - getPrimerLabelWidth(p.name, settings));
        const occupiedRight = x + width;
        
        let trackIdx = 0;
        while (trackIdx < rPrimerTracks.length && rPrimerTracks[trackIdx] > occupiedLeft) {
            trackIdx++;
        }
        if (trackIdx >= rPrimerTracks.length) rPrimerTracks.push(0);
        rPrimerTracks[trackIdx] = occupiedRight + 12;
        
        const y = reversePrimerStartY + trackIdx * primerTrackHeight;
        trackY[`primer_${p.id}`] = y;
        
        hitBoxes.push({
            x: occupiedLeft, y, w: occupiedRight - occupiedLeft, h: primerTrackHeight,
            target: { "Primer": p.id }
        });
        
    });

    if (rPrimerTracks.length > 0) {
        maxTrackY = reversePrimerStartY + rPrimerTracks.length * primerTrackHeight;
    }

    const totalHeight = Math.max(maxTrackY + LayoutMetrics.ROW_GAP, seqY + seqHeight + 40);

    return {
        height: totalHeight,
        offset,
        trackY,
        seqY,
        hitBoxes
    };
}
