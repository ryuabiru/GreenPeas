import type { Annotation, Topology } from '../types';

type Interval = { start: number; end: number };

function insertionIndex(intervals: Interval[], start: number): number {
    let low = 0;
    let high = intervals.length;
    while (low < high) {
        const middle = (low + high) >>> 1;
        if (intervals[middle].start < start) low = middle + 1;
        else high = middle;
    }
    return low;
}

function overlaps(intervals: Interval[], interval: Interval): boolean {
    const index = insertionIndex(intervals, interval.start);
    return (index > 0 && intervals[index - 1].end > interval.start)
        || (index < intervals.length && intervals[index].start < interval.end);
}

export function assignAnnotationTracks(
    annotations: Annotation[], topology: Topology, sequenceLength: number
): Record<string, number> {
    const tracks: Record<string, number> = {};
    const lanes: Interval[][] = [];
    const sorted = annotations.filter(annotation => annotation.type.toLowerCase() !== 'source')
        .sort((a, b) => a.start - b.start ||
            (a.type === 'CDS' ? -1 : 0) - (b.type === 'CDS' ? -1 : 0) ||
            (b.end - b.start) - (a.end - a.start));

    for (const annotation of sorted) {
        const parts: Interval[] = annotation.start <= annotation.end
            ? [{ start: annotation.start, end: annotation.end }]
            : topology === 'Circular'
                ? [{ start: 0, end: annotation.end },
                    { start: annotation.start, end: sequenceLength }]
                : [];
        if (parts.length === 0) continue;
        let lane = 0;
        while (lane < lanes.length && parts.some(part => overlaps(lanes[lane], part))) lane++;
        if (!lanes[lane]) lanes[lane] = [];
        for (const part of parts) {
            lanes[lane].splice(insertionIndex(lanes[lane], part.start), 0, part);
        }
        tracks[annotation.id] = lane;
    }
    return tracks;
}
