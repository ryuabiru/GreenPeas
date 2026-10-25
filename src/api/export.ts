/**
 * 学習メモ: 表示中の配列をGP、FASTA、GenBank形式で保存する前処理とTauri呼び出しを担当する。
 * 処理の位置づけ: React側から呼ばれ、Tauri invokeを通じてRustコマンドへ処理を渡す。
 */

import { invoke } from "@tauri-apps/api/core";
import { Annotation, Topology, SequenceData } from "../types";
import { stripLastExtension } from "../utils/pathUtils";

function sanitizeForGpExport(sequenceData: SequenceData): SequenceData {
    const sanitizedAlignmentResults = sequenceData.alignmentResults
        ? sequenceData.alignmentResults.map((result, idx) => {
            const srcData = result.data;
            const alignedQuery = typeof result.aligned_query === 'string' ? result.aligned_query : '';
            const fallbackSeq = alignedQuery.replace(/-/g, '');
            const filePath = srcData?.file_path || null;
            const fileBasedId = filePath
                ? stripLastExtension(filePath.split(/[/\\]/).pop() || filePath)
                : '';
            const sourceId = (srcData?.id || '').trim();
            const resultId = (result.id || '').trim();
            const id = sourceId || fileBasedId || resultId || `sample-${idx + 1}`;
            const sequence = (srcData?.sequence || fallbackSeq || '').trim();

            return {
                ...result,
                // Keep a stable label so reload never falls back to Forward/Reverse.
                id,
                // Keep a minimal sequence object (no nested alignments/traces) for safe reload.
                data: {
                    id,
                    description: srcData?.description ?? null,
                    sequence,
                    annotations: [],
                    primers: [],
                    topology: srcData?.topology ?? "Linear",
                    trace: null,
                    enzymes: null,
                    enzymeSettings: null,
                    alignmentResults: null,
                    debug_hex: null,
                    file_path: null
                }
            };
        })
        : null;

    return {
        ...sequenceData,
        trace: sequenceData.trace ?? null,
        alignmentResults: sanitizedAlignmentResults,
        enzymes: sequenceData.enzymes ?? null,
        enzymeSettings: sequenceData.enzymeSettings ?? null,
        debug_hex: null,
        file_path: null
    };
}

export async function exportFasta(
    path: string, 
    id: string, 
    description: string | null, 
    sequence: string
): Promise<void> {
    return await invoke('export_fasta', { path, id, description, sequence });
}

export async function exportGbk(
    path: string, 
    sequence: string, 
    annotations: Annotation[], 
    primers: any[],
    topology: Topology,
    id?: string,
    description?: string | null,
): Promise<void> {
    return await invoke('export_gbk', { path, sequence, annotations, primers, topology, id, description });
}

export async function exportGp(path: string, sequenceData: SequenceData): Promise<void> {
    const sanitized = sanitizeForGpExport(sequenceData);
    return await invoke('export_gp', { path, sequenceData: sanitized });
}
