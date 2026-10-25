/**
 * 学習メモ: クローニング機能のutilsに関するフロントエンド処理をまとめる。
 * 処理の位置づけ: アプリ内の他モジュールから参照され、担当する値または処理を提供する。
 */

import { Overhang } from '../../bindings/Overhang';
import { Fragment } from '../../bindings/Fragment';

/**
 * UI-level formatting for overhangs (e.g., "5' AATT")
 */
export function formatOverhang(overhang: Overhang | null): string {
    if (!overhang) return "Blunt";
    return `${overhang.is_5_prime ? "5'" : "3'"} ${overhang.sequence}`;
}

export interface CloningClipboard extends Fragment {
    isCloning: boolean;
    clipId: string;
}
