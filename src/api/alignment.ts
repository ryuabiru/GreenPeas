/**
 * 学習メモ: 配列アラインメントをRust側へ依頼する薄いAPIラッパー。
 * 処理の位置づけ: React側から呼ばれ、Tauri invokeを通じてRustコマンドへ処理を渡す。
 */

import { invoke } from "@tauri-apps/api/core";
import { AlignmentResult, AlignmentMode } from "../types";

export async function alignSequences(template: string, query: string, mode?: AlignmentMode): Promise<AlignmentResult[]> {
    return await invoke('align_sequences', { template, query, mode: mode || "Automatic" });
}
