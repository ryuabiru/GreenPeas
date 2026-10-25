/**
 * 学習メモ: アラインメント座標と元配列座標の相互変換を一箇所に集約する。
 * 処理の位置づけ: ストアやコンポーネントから呼ばれ、UIに依存しない計算結果を返す。
 */

import { SequenceData, AlignmentResult, AlignmentTrackSettings } from '../types';

interface TrackPoint {
    char: string;
    qIdx: number; // Index in the original query sequence (absolute)
}

interface TrackData {
    mapping: TrackPoint[];
}

export class AlignmentCoordinateEngine {
    public template: SequenceData;
    private results: AlignmentResult[];
    private trackSettings: Record<number, AlignmentTrackSettings>;
    
    public globalLength: number = 0;
    public mapAbsoluteToGlobal: number[] = [];
    public maxGaps: number[] = [];
    
    // The "Nuclear Option": Pre-calculate everything
    private trackData: (TrackData | null)[] = [];
    private refMapping: string[] = [];

    private rowSliceCache: Map<string, { slice: string, absQueryStart: number }> = new Map();

    constructor(template: SequenceData, results: AlignmentResult[], trackSettings: Record<number, AlignmentTrackSettings>) {
        this.template = template;
        this.results = results;
        this.trackSettings = trackSettings;
        this.calculateConsensus();
        this.calculateAllMappings();
    }

    private calculateConsensus() {
        const L = this.template.sequence.length;
        const gaps = new Array(L + 1).fill(0);
        this.maxGaps = gaps;
        this.mapAbsoluteToGlobal = new Array(L + 1).fill(0);

        const activeResults = this.results.filter((_, i) => {
            const settings = (this.trackSettings as any)[i];
            return settings?.visible !== false;
        });

        activeResults.forEach(res => {
            const aTemp = res.aligned_template || "";
            const tStart = res.y_start || 0;
            let currentAbsPos = tStart;
            let currentGapRun = 0;

            for (let i = 0; i < aTemp.length; i++) {
                if (aTemp[i] === '-') {
                    currentGapRun++;
                } else {
                    if (currentAbsPos <= L && currentGapRun > gaps[currentAbsPos]) {
                        gaps[currentAbsPos] = currentGapRun;
                    }
                    currentGapRun = 0;
                    currentAbsPos++;
                }
            }
            if (currentAbsPos <= L && currentGapRun > gaps[currentAbsPos]) {
                gaps[currentAbsPos] = currentGapRun;
            }
        });

        let gIdx = 0;
        for (let p = 0; p <= L; p++) {
            this.mapAbsoluteToGlobal[p] = gIdx;
            gIdx += gaps[p]; 
            if (p < L) gIdx++; 
        }
        this.globalLength = gIdx;
    }

    private calculateAllMappings() {
        const L = this.template.sequence.length;
        const GL = this.globalLength;

        // 1. Reference Mapping
        this.refMapping = new Array(GL).fill("-");
        for (let p = 0; p < L; p++) {
            const gBase = this.mapAbsoluteToGlobal[p] + this.maxGaps[p];
            this.refMapping[gBase] = this.template.sequence[p];
        }

        // 2. Track Mappings
        this.trackData = this.results.map(res => {
            if (!res.aligned_template) return null;
            
            const mapping: TrackPoint[] = new Array(GL).fill(null).map(() => ({ char: " ", qIdx: 0 }));
            const aTemp = res.aligned_template;
            const aQuery = res.aligned_query || "";
            const tStart = res.y_start || 0;
            const xStart = res.x_start || 0;

            let currT = tStart;
            let currQ = 0;
            let trackGapOffset = 0;

            for (let i = 0; i < aTemp.length; i++) {
                const isInsertion = aTemp[i] === '-';
                
                if (isInsertion) {
                    const gStart = this.mapAbsoluteToGlobal[currT];
                    const gIdx = gStart + trackGapOffset;
                    if (gIdx < GL) {
                        mapping[gIdx] = { 
                            char: aQuery[i], 
                            qIdx: currQ + xStart 
                        };
                    }
                    trackGapOffset++;
                } else {
                    const gStart = this.mapAbsoluteToGlobal[currT];
                    const gGaps = this.maxGaps[currT];
                    const gBase = gStart + gGaps;

                    // Fill any skipped consensus gaps with '-' for this track
                    for (let g = trackGapOffset; g < gGaps; g++) {
                        if (gStart + g < GL) {
                            mapping[gStart + g] = { char: "-", qIdx: currQ + xStart };
                        }
                    }

                    // Place the template base
                    if (gBase < GL) {
                        mapping[gBase] = { 
                            char: aQuery[i], 
                            qIdx: currQ + xStart 
                        };
                    }
                    
                    currT++;
                    trackGapOffset = 0;
                }
                if (aQuery[i] !== '-') currQ++;
            }

            return { mapping };
        });
    }

    public findTemplateIndexForGlobal(globalIdx: number): number {
        let low = 0, high = this.mapAbsoluteToGlobal.length - 1;
        while (low <= high) {
            const mid = (low + high) >> 1;
            if (this.mapAbsoluteToGlobal[mid] <= globalIdx) low = mid + 1;
            else high = mid - 1;
        }
        return Math.max(0, low - 1);
    }

    public getRefSlice(start: number, end: number): string {
        return this.refMapping.slice(start, end).join("");
    }

    public getRowSlice(ridx: number, rangeStart: number, rangeEnd: number): { slice: string, absQueryStart: number } {
        const cacheKey = `${ridx}-${rangeStart}-${rangeEnd}`;
        const cached = this.rowSliceCache.get(cacheKey);
        if (cached) return cached;

        const data = this.trackData[ridx];
        if (!data) return { slice: "", absQueryStart: 0 };

        let slice = "";
        let absQueryStart = -1;

        for (let g = rangeStart; g < rangeEnd; g++) {
            if (g >= data.mapping.length) {
                slice += " ";
                continue;
            }
            const pt = data.mapping[g];
            slice += pt.char;
            if (absQueryStart === -1 && pt.char !== ' ' && pt.char !== '-') {
                absQueryStart = pt.qIdx;
            }
        }

        const result = { slice, absQueryStart: absQueryStart === -1 ? 0 : absQueryStart };
        this.rowSliceCache.set(cacheKey, result);
        return result;
    }
}
