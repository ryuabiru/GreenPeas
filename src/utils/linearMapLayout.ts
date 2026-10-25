import type { Annotation, Primer, RestrictionSite } from '../types';

export interface MapRange { start: number; end: number }

export function clampMapRange(start: number, span: number, sequenceLength: number): MapRange {
    const length = Math.max(1, sequenceLength);
    const width = Math.min(length, Math.max(Math.min(20, length), span));
    const left = Math.max(0, Math.min(length - width, start));
    return { start: left, end: left + width };
}

export function zoomMapRange(
    range: MapRange, sequenceLength: number, cursorFraction: number, factor: number
): MapRange {
    const fraction = Math.max(0, Math.min(1, cursorFraction));
    const currentSpan = range.end - range.start;
    const length = Math.max(1, sequenceLength);
    const nextSpan = Math.min(length, Math.max(Math.min(20, length), currentSpan * factor));
    if (Math.abs(nextSpan - currentSpan) < 1e-9) return range;
    const focus = range.start + fraction * currentSpan;
    return clampMapRange(focus - fraction * nextSpan, nextSpan, sequenceLength);
}

export function panMapRange(range: MapRange, sequenceLength: number, deltaBases: number): MapRange {
    return clampMapRange(range.start + deltaBases, range.end - range.start, sequenceLength);
}

export interface PlacedFeature {
    annotation: Annotation;
    part: number;
    x: number;
    width: number;
    lane: number;
    showLabel: boolean;
}

export interface PlacedPrimer {
    primer: Primer;
    part: number;
    x: number;
    width: number;
    lane: number;
    showLabel: boolean;
}

export interface PlacedSite {
    position: number;
    names: string[];
    label: string;
    x: number;
    labelX: number;
    unique: boolean;
    labelLane: number | null;
}

export interface LinearMapLayout {
    features: PlacedFeature[];
    primers: PlacedPrimer[];
    sites: PlacedSite[];
    featureLaneCount: number;
    primerLaneCount: number;
    siteLabelLaneCount: number;
    pixelsPerBase: number;
    rulerStep: number;
}

function assignLanes<T extends { x: number; width: number }>(items: T[], gap: number): Array<T & { lane: number }> {
    const laneEnds: number[] = [];
    return [...items].sort((a, b) => a.x - b.x).map(item => {
        let lane = laneEnds.findIndex(end => end + gap <= item.x);
        if (lane < 0) {
            lane = laneEnds.length;
            laneEnds.push(0);
        }
        laneEnds[lane] = item.x + item.width;
        return { ...item, lane };
    });
}

function niceRulerStep(raw: number): number {
    const magnitude = 10 ** Math.floor(Math.log10(Math.max(1, raw)));
    const multiple = [1, 2, 5, 10].find(value => value * magnitude >= raw) || 10;
    return multiple * magnitude;
}

export function buildLinearMapLayout(
    range: MapRange,
    plotLeft: number,
    plotWidth: number,
    annotations: Annotation[],
    primers: Primer[],
    restrictionSites: RestrictionSite[],
    enzymeCounts: Record<string, number>,
    hoveredSitePosition: number | null = null,
    topology: 'Linear' | 'Circular' = 'Linear',
    sequenceLength = range.end
): LinearMapLayout {
    const span = Math.max(1, range.end - range.start);
    const pixelsPerBase = plotWidth / span;
    const xFor = (position: number) => plotLeft + (position - range.start) * pixelsPerBase;
    const visible = (start: number, end: number) => end > range.start && start < range.end;

    const parts = (start: number, end: number): Array<[number, number]> =>
        topology === 'Circular' && start > end
            ? [[start, sequenceLength], [0, end]] : [[start, end]];
    const features = assignLanes(annotations.flatMap(annotation =>
        parts(annotation.start, annotation.end).flatMap(([start, end], part) => {
            if (!visible(start, end)) return [];
            const x = xFor(Math.max(range.start, start));
            const width = Math.max(2, xFor(Math.min(range.end, end)) - x);
            return [{ annotation, part, x, width,
                showLabel: width >= annotation.name.length * 7 + 20 }];
        })
    ), 8);

    const placedPrimers = assignLanes(primers.flatMap(primer =>
        parts(primer.start, primer.end).flatMap(([start, end], part) => {
            if (!visible(start, end)) return [];
            const x = xFor(Math.max(range.start, start));
            const width = Math.max(3, xFor(Math.min(range.end, end)) - x);
            return [{ primer, part, x, width,
                showLabel: width >= primer.name.length * 7 + 26 }];
        })
    ), 8);

    const siteGroups = new Map<number, string[]>();
    restrictionSites.forEach(site => {
        if (site.position < range.start || site.position >= range.end) return;
        const names = siteGroups.get(site.position) || [];
        if (!names.includes(site.name)) names.push(site.name);
        siteGroups.set(site.position, names);
    });
    const sites: PlacedSite[] = [...siteGroups].sort(([a], [b]) => a - b).map(([position, names]) => {
        const label = names.length > 1 ? `${names[0]} +${names.length - 1}` : names[0];
        return {
            position, names, x: xFor(position), labelX: xFor(position),
            label: label.length > 18 ? `${label.slice(0, 17)}…` : label,
            unique: names.some(name => enzymeCounts[name] === 1),
            labelLane: null
        };
    });

    // Every cut remains a tick. Text is added only when it fits at the current scale.
    const showCommonLabels = pixelsPerBase >= 0.5;
    const maxLabelLanes = 2;
    const labelLaneIntervals: Array<Array<[number, number]>> = Array.from(
        { length: maxLabelLanes }, () => []
    );
    const candidates = sites.filter(site => showCommonLabels || site.unique ||
        site.position === hoveredSitePosition).sort((a, b) => {
        const priority = (site: PlacedSite) =>
            (site.position === hoveredSitePosition ? 4 : 0) + (site.unique ? 2 : 0);
        return priority(b) - priority(a) || a.position - b.position;
    });
    candidates.forEach(site => {
        const labelWidth = Math.min(150, site.label.length * 7 + 12);
        const left = Math.max(plotLeft, Math.min(plotLeft + plotWidth - labelWidth, site.x - labelWidth / 2));
        const right = left + labelWidth;
        const lane = labelLaneIntervals.findIndex(intervals =>
            intervals.every(([occupiedLeft, occupiedRight]) =>
                right + 8 < occupiedLeft || left > occupiedRight + 8));
        if (lane >= 0) {
            labelLaneIntervals[lane].push([left, right]);
            site.labelLane = lane;
            site.labelX = left + labelWidth / 2;
        }
    });

    return {
        features, primers: placedPrimers, sites,
        featureLaneCount: Math.max(0, ...features.map(item => item.lane + 1)),
        primerLaneCount: Math.max(0, ...placedPrimers.map(item => item.lane + 1)),
        siteLabelLaneCount: Math.max(0, ...sites.map(item => item.labelLane === null ? 0 : item.labelLane + 1)),
        pixelsPerBase,
        rulerStep: niceRulerStep(span * 100 / plotWidth)
    };
}
