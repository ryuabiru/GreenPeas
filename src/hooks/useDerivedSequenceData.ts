/**
 * 学習メモ: 現在の配列から、制限酵素サイトや翻訳など表示用の派生データを非同期に取得する。
 * 処理の位置づけ: コンポーネントから呼ばれ、ストア・API・ブラウザ/Tauriイベント間の副作用を整理する。
 */

import { useMemo } from 'react';
import { SequenceData, Selection, RestrictionSite } from '../types';
import { assignAnnotationTracks } from '../utils/annotationTracks';

interface DerivedData {
    enzymeCounts: Record<string, number>;
    annotationTracks: Record<string, number>;
    selectionInfo: {
        active: boolean;
        start: number;
        end: number;
        len: number;
        tm: number;
        gc: number;
    };
}

export function useDerivedSequenceData(
    currentSequence: SequenceData | null,
    selection: Selection | null,
    restrictionSites: RestrictionSite[]
): DerivedData {
    
    const enzymeCounts = useMemo(() => {
        const counts: Record<string, number> = {};
        restrictionSites.forEach(s => counts[s.name] = (counts[s.name] || 0) + 1);
        return counts;
    }, [restrictionSites]);

    const annotationTracks = useMemo(() => {
        if (!currentSequence) return {};
        return assignAnnotationTracks(currentSequence.annotations || [],
            currentSequence.topology, currentSequence.sequence.length);
    }, [currentSequence]);

    const selectionInfo = useMemo(() => {
        const start = selection ? Math.min(selection.start, selection.end) : 0;
        const end = selection ? Math.max(selection.start, selection.end) : 0;
        const len = Math.abs(end - start);
        const sub = currentSequence?.sequence.slice(start, end) || "";
        let tm = 0;
        if (len > 0) {
            const gc = (sub.match(/[GC]/gi)?.length || 0);
            const at = (sub.match(/[AT]/gi)?.length || 0);
            // Basic Wallace rule for short, more complex for long
            tm = len < 14 ? 2 * at + 4 * gc : 64.9 + 41 * (gc - 16.4) / (at + gc);
        }
        return { 
            active: !!selection, 
            start: start + 1, 
            end, 
            len, 
            tm, 
            gc: len > 0 ? (sub.match(/[GC]/gi)?.length || 0) / len * 100 : 0 
        };
    }, [selection, currentSequence]);

    return { enzymeCounts, annotationTracks, selectionInfo };
}
