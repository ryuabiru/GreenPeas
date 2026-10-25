import type { Annotation, Topology } from '../types';

export interface CdsPathSegment {
    annotation: Annotation;
    startDistance: number;
    endDistance: number;
    codonAligned: boolean;
}

export interface CdsReadingPath {
    segments: CdsPathSegment[];
    stop: { codon: string; distance: number; segmentId: string | null } | null;
    scanLimitReached: boolean;
}

export interface CdsContinuation {
    ranges: { start: number; end: number }[];
    stopBaseIndex: number;
}

export interface CdsContinuationEntry {
    cdsId: string;
    geometry: CdsContinuation;
}

const STOP_CODONS = new Set(['TAA', 'TAG', 'TGA']);
const NON_CODING_TYPES = new Set([
    'source', 'promoter', 'terminator', 'rbs', 'rep_origin', 'regulatory',
    "5'utr", "3'utr", 'primer_bind', 'primer', 'intron'
]);
const MAX_EXTENSION_BASES = 3000;
const MAX_GAP_BASES = 90;

function featureLength(annotation: Annotation, sequenceLength: number): number {
    return annotation.start <= annotation.end
        ? annotation.end - annotation.start
        : sequenceLength - annotation.start + annotation.end;
}

function complement(base: string): string {
    switch (base.toUpperCase()) {
        case 'A': return 'T';
        case 'T': return 'A';
        case 'C': return 'G';
        case 'G': return 'C';
        default: return 'N';
    }
}

export function getCdsReadingPath(
    sequence: string,
    topology: Topology,
    cds: Annotation,
    annotations: Annotation[]
): CdsReadingPath | null {
    const n = sequence.length;
    if (!n || cds.type.toUpperCase() !== 'CDS' || cds.start < 0 || cds.end > n) return null;
    const circular = topology === 'Circular';
    if (!circular && cds.start >= cds.end) return null;
    const cdsLength = featureLength(cds, n);
    if (cdsLength <= 0 || cdsLength > n) return null;

    const reverse = cds.strand === 'Reverse';
    const origin = reverse ? (cds.end - 1 + n) % n : cds.start;
    const availableBases = circular ? n : reverse ? origin + 1 : n - origin;
    const scanBases = Math.min(availableBases, Math.ceil((cdsLength + MAX_EXTENSION_BASES) / 3) * 3);
    const atDistance = (distance: number): string => {
        const index = reverse ? (origin - distance + n) % n : (origin + distance) % n;
        const base = sequence[index];
        return reverse ? complement(base) : base.toUpperCase();
    };

    let stop: CdsReadingPath['stop'] = null;
    for (let distance = 0; distance + 2 < scanBases; distance += 3) {
        const codon = atDistance(distance) + atDistance(distance + 1) + atDistance(distance + 2);
        if (STOP_CODONS.has(codon)) {
            stop = { codon, distance, segmentId: null };
            break;
        }
    }

    const limit = stop ? stop.distance + 3 : scanBases;
    const candidates = annotations
        .filter(annotation => annotation.id !== cds.id && annotation.strand === cds.strand &&
            !NON_CODING_TYPES.has(annotation.type.toLowerCase()) &&
            annotation.start >= 0 && annotation.end <= n &&
            (circular || annotation.start < annotation.end))
        .map(annotation => {
            const startBase = reverse ? (annotation.end - 1 + n) % n : annotation.start;
            const startDistance = circular
                ? (reverse ? origin - startBase + n : startBase - origin + n) % n
                : reverse ? origin - startBase : startBase - origin;
            const length = featureLength(annotation, n);
            return {
                annotation, startDistance, endDistance: startDistance + length,
                codonAligned: startDistance % 3 === 0 && length % 3 === 0
            };
        })
        .filter(segment => segment.startDistance >= cdsLength &&
            segment.startDistance < limit && segment.endDistance > segment.startDistance)
        .sort((a, b) => a.startDistance - b.startDistance || a.endDistance - b.endDistance);

    const segments: CdsPathSegment[] = [{
        annotation: cds, startDistance: 0, endDistance: cdsLength,
        codonAligned: cdsLength % 3 === 0
    }];
    for (const candidate of candidates) {
        if (candidate.startDistance - segments[segments.length - 1].endDistance > MAX_GAP_BASES) break;
        if (candidate.startDistance < segments[segments.length - 1].endDistance) continue;
        segments.push(candidate);
    }
    if (stop) {
        stop.segmentId = segments.find(segment =>
            stop!.distance >= segment.startDistance && stop!.distance < segment.endDistance
        )?.annotation.id ?? null;
    }

    return { segments, stop, scanLimitReached: !stop && scanBases < availableBases };
}

export function getCdsContinuation(
    sequence: string, topology: Topology, cds: Annotation, annotations: Annotation[]
): CdsContinuation | null {
    const path = getCdsReadingPath(sequence, topology, cds, annotations);
    if (!path?.stop || path.stop.distance + 3 <= path.segments[0].endDistance) return null;

    const n = sequence.length;
    const reverse = cds.strand === 'Reverse';
    const origin = reverse ? cds.end - 1 : cds.start;
    const baseIndex = (distance: number) => ((origin + (reverse ? -distance : distance)) % n + n) % n;
    const ranges: CdsContinuation['ranges'] = [];
    for (let distance = path.segments[0].endDistance; distance < path.stop.distance + 3; distance++) {
        const index = baseIndex(distance);
        const last = ranges[ranges.length - 1];
        if (last && (reverse ? index + 1 === last.start : index === last.end)) {
            if (reverse) last.start = index;
            else last.end = index + 1;
        } else {
            ranges.push({ start: index, end: index + 1 });
        }
    }
    return { ranges, stopBaseIndex: baseIndex(path.stop.distance + 1) };
}

export function getVisibleCdsContinuations(
    sequence: string, topology: Topology, annotations: Annotation[],
    viewportStart: number, viewportEnd: number
): CdsContinuationEntry[] {
    const n = sequence.length;
    if (!n || viewportStart >= viewportEnd) return [];
    const visibleStart = Math.max(0, viewportStart);
    const visibleEnd = Math.min(n, viewportEnd);
    const intersects = (start: number, end: number) => start < visibleEnd && end > visibleStart;

    return annotations.flatMap(cds => {
        if (cds.type.toUpperCase() !== 'CDS') return [];
        const reverse = cds.strand === 'Reverse';
        const endpoint = reverse ? cds.start : cds.end;
        const extension = MAX_EXTENSION_BASES + 3;
        const mayReachViewport = topology === 'Circular'
            ? reverse
                ? intersects(Math.max(0, endpoint - extension), endpoint) ||
                    intersects(Math.max(0, n + endpoint - extension), n)
                : intersects(endpoint, Math.min(n, endpoint + extension)) ||
                    intersects(0, Math.max(0, endpoint + extension - n))
            : reverse
                ? intersects(Math.max(0, endpoint - extension), endpoint)
                : intersects(endpoint, Math.min(n, endpoint + extension));
        if (!mayReachViewport) return [];

        const geometry = getCdsContinuation(sequence, topology, cds, annotations);
        if (!geometry || !geometry.ranges.some(range => intersects(range.start, range.end))) return [];
        return [{ cdsId: cds.id, geometry }];
    });
}
