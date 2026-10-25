/**
 * 学習メモ: textUtilsに関する副作用の少ない計算・変換ヘルパーを提供する。
 * 処理の位置づけ: ストアやコンポーネントから呼ばれ、UIに依存しない計算結果を返す。
 */

let htmlDecoder: HTMLTextAreaElement | null = null;

export function decodeHtmlEntities(text: string): string {
  if (!text || !text.includes('&')) return text;

  // Browser-native decode handles named entities like &alpha; as well.
  if (typeof document !== 'undefined') {
    if (!htmlDecoder) {
      htmlDecoder = document.createElement('textarea');
    }
    htmlDecoder.innerHTML = text;
    return htmlDecoder.value;
  }

  // Fallback for non-DOM contexts.
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}
