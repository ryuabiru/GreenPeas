/**
 * 学習メモ: クローニング機能のapiに関するフロントエンド処理をまとめる。
 * 処理の位置づけ: アプリ内の他モジュールから参照され、担当する値または処理を提供する。
 */

import { invoke } from '@tauri-apps/api/core';
import { RestrictionSite } from '../../types';

export async function copyToInternalClipboard(id: string, fragment: any): Promise<string> {
    return await invoke('copy_to_internal_clipboard', { id, fragment });
}

export async function getInternalFragment(id: string): Promise<any> {
    return await invoke('get_internal_fragment', { id });
}

export async function assembleFragments(fragments: any[], topology: string): Promise<any> {
    return await invoke('assemble_fragments_cmd', { fragments, topology });
}

export async function getFragmentFromSelection(
    sequenceId: string,
    start: number,
    end: number,
    restrictionSites: RestrictionSite[]
): Promise<any> {
    return await invoke('get_fragment_from_selection', { sequenceId, start, end, restrictionSites });
}
