/**
 * 学習メモ: 配列の読込、解析、編集、ウィンドウ間操作に関するTauriコマンドを型付き関数として公開する。
 * 処理の位置づけ: React側から呼ばれ、Tauri invokeを通じてRustコマンドへ処理を渡す。
 */

import { invoke } from "@tauri-apps/api/core";
import { SequenceData, RestrictionSite, Topology } from "../types";

export interface SearchResult {
  start: number;
  end: number;
  strand: number;
}

export interface FullLayout {
    rows: any[];
    totalHeight: number;
}

export async function listAllSequences(path: string): Promise<SequenceData[]> {
    return await invoke('list_all_sequences', { path });
}

export async function readImportTextFile(path: string): Promise<string> {
    return await invoke('read_import_text_file', { path });
}

export async function openSequenceSession(path: string): Promise<string[]> {
    return await invoke('open_sequence_session', { path });
}

export async function openPathsInNewWindow(paths: string[]): Promise<void> {
    return await invoke('open_paths_in_new_window', { paths });
}

export async function beginSidebarDrag(id: string, sourceWindowId: string, path: string): Promise<void> {
    return await invoke('begin_sidebar_drag', { id, sourceWindowId, path });
}

export async function takeSidebarDragPath(targetWindowId: string): Promise<string | null> {
    return await invoke('take_sidebar_drag_path', { targetWindowId });
}

export async function finishSidebarDrag(id: string): Promise<boolean> {
    return await invoke('finish_sidebar_drag', { id });
}

export async function dropSidebarDragAtScreenPosition(
    id: string,
    path: string,
    screenX: number,
    screenY: number,
    sidebarWidth: number,
): Promise<boolean> {
    return await invoke('drop_sidebar_drag_at_screen_position', { id, path, screenX, screenY, sidebarWidth });
}

export async function getSequenceMetadata(id: string): Promise<SequenceData> {
    return await invoke('get_sequence_metadata', { id });
}

export async function findRestrictionSites(
    sequence: string, 
    topology: Topology, 
    maxCuts: number | null
): Promise<RestrictionSite[]> {
    return await invoke('find_restriction_sites', { sequence, topology, maxCuts });
}

export async function searchSequence(
    sequence: string, 
    query: string, 
    topology: Topology
): Promise<SearchResult[]> {
    return await invoke('search_sequence', { sequence, query, topology });
}

export async function searchProtein(
    sequence: string, 
    query: string, 
    annotations: any[]
): Promise<SearchResult[]> {
    return await invoke('search_protein', { sequence, query, annotations });
}

export async function getSequenceViewData(
    id: string,
    start: number,
    end: number,
): Promise<any> {
    return await invoke('get_sequence_view_data', { id, start, end });
}

export async function getSequenceFragment(
    sequenceId: string,
    start: number,
    end: number,
): Promise<string> {
    return await invoke('get_sequence_fragment', { sequenceId, start, end });
}

export async function translateDna(sequence: string, frame: number): Promise<string> {
    return await invoke('translate_dna', { sequence, frame });
}

export async function getReverseComplement(sequence: string): Promise<string> {
    return await invoke('get_reverse_complement', { sequence });
}

export async function translateAnnotations(sequence: string, annotations: any[]): Promise<[string, string][]> {
    return await invoke('translate_annotations', { sequence, annotations });
}

export async function getPendingFiles(): Promise<string[]> {
    return await invoke('get_pending_files');
}

export async function analyzePrimer(
    template: string,
    primerSequence: string,
    start: number,
    end: number,
    strand: string,
): Promise<any> {
    return await invoke('analyze_primer', { template, primerSequence, start, end, strand });
}

export async function reanalyzePrimers(
    template: string,
    primers: any[],
): Promise<any[]> {
    return await invoke('reanalyze_primers', { template, primers });
}

export async function applySequenceEdit(
    sequenceId: string,
    op: { type: 'insert' | 'delete' | 'replace', pos: number, len?: number, sequence?: string }
): Promise<SequenceData> {
    return await invoke('apply_sequence_edit', { sequenceId, op });
}

export async function getSequenceFragmentBinary(
    sequenceId: string,
    start: number,
    end: number,
): Promise<Uint8Array> {
    return await invoke('get_sequence_fragment_binary', { sequenceId, start, end });
}


export async function upsertSequence(sequence: SequenceData): Promise<string> {
    return await invoke('upsert_sequence', { sequence });
}
