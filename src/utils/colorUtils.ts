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
    if (/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(trimmed)) {
       return trimmed;
    }
  }
  const normalizedType = type.toLowerCase().replace(/[^a-z0-9]/g, '');
  return DEFAULT_COLORS[normalizedType] || DEFAULT_COLORS['miscfeature'] || '#8b5cf6';
};

/** Keep user-selected hues while making feature outlines and labels legible on light surfaces. */
export const getVisibleFeatureColor = (type: string, color: string | undefined, isDark: boolean): string => {
  const featureColor = getFeatureColor(type, color);
  if (isDark) return featureColor;

  const hex = featureColor.slice(1);
  const channels = hex.length <= 4
    ? [0, 1, 2].map(index => parseInt(hex[index] + hex[index], 16))
    : [0, 2, 4].map(index => parseInt(hex.slice(index, index + 2), 16));
  const luminance = (rgb: number[]) => rgb.reduce((sum, channel, index) => {
    const value = channel / 255;
    const linear = value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
    return sum + linear * [0.2126, 0.7152, 0.0722][index];
  }, 0);
  const opaqueColor = `#${channels.map(channel => channel.toString(16).padStart(2, '0')).join('')}`;
  if ((1.05 / (luminance(channels) + 0.05)) >= 4.5) return opaqueColor;

  let low = 0;
  let high = 1;
  for (let step = 0; step < 12; step++) {
    const factor = (low + high) / 2;
    const darkened = channels.map(channel => Math.floor(channel * factor));
    if (1.05 / (luminance(darkened) + 0.05) >= 4.5) low = factor;
    else high = factor;
  }
  return `#${channels.map(channel => Math.floor(channel * low).toString(16).padStart(2, '0')).join('')}`;
};
