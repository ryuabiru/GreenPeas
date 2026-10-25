/**
 * 学習メモ: pathUtilsに関する副作用の少ない計算・変換ヘルパーを提供する。
 * 処理の位置づけ: ストアやコンポーネントから呼ばれ、UIに依存しない計算結果を返す。
 */

export function ensurePathExtension(path: string, extension: string): string {
    const ext = extension.startsWith('.') ? extension : `.${extension}`;
    if (!path) return path;
    return path.toLowerCase().endsWith(ext.toLowerCase()) ? path : `${path}${ext}`;
}

export function stripLastExtension(name: string): string {
    return name.replace(/\.[^/.]+$/, "");
}
