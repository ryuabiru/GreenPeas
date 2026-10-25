/**
 * 学習メモ: AB1クロマトグラムのトレースデータをRust側から取得する薄いAPIラッパー。
 * 処理の位置づけ: React側から呼ばれ、Tauri invokeを通じてRustコマンドへ処理を渡す。
 */

import { invoke } from "@tauri-apps/api/core";
import { ChromTrace } from "../types";

export async function getTraceData(path: string): Promise<ChromTrace | null> {
    return await invoke('get_trace_data', { path });
}
