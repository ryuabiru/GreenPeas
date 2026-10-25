/**
 * 学習メモ: colorUtilsに関する副作用の少ない計算・変換ヘルパーを提供する。
 * 処理の位置づけ: ストアやコンポーネントから呼ばれ、UIに依存しない計算結果を返す。
 */

export const DEFAULT_COLORS: Record<string, string> = {
  'cds': '#ef4444',          // Red
  'gene': '#3b82f6',         // Blue
  'promoter': '#22c55e',     // Green
  'primer': '#f97316',       // Orange
  'miscfeature': '#8b5cf6',  // Violet
  'terminator': '#ec4899',   // Pink
  'reporigin': '#eab308',    // Yellow
  'regulatory': '#06b6d4',   // Cyan
  'source': '#94a3b8',       // Slate
  'variation': '#f43f5e',    // Rose
  'mrna': '#0ea5e9',         // Sky
  'trna': '#10b981',         // Emerald
  'rrna': '#f59e0b',         // Amber
};

export const getFeatureColor = (type: string, color?: string): string => {
  if (color) {
    const trimmed = color.trim();
    if (trimmed.startsWith('#') && /^#[0-9a-fA-F]{3,8}$/.test(trimmed)) {
       return trimmed;
    }
  }
  const normalizedType = type.toLowerCase().replace(/[^a-z0-9]/g, '');
  return DEFAULT_COLORS[normalizedType] || DEFAULT_COLORS['miscfeature'] || '#8b5cf6';
};
