/**
 * 学習メモ: aaColorsに関する副作用の少ない計算・変換ヘルパーを提供する。
 * 処理の位置づけ: ストアやコンポーネントから呼ばれ、UIに依存しない計算結果を返す。
 */

import { AminoAcidTheme } from '../types';

export const getAminoAcidColor = (aa: string, theme: AminoAcidTheme = 'chemistry'): string => {
  const code = aa.toUpperCase();
  
  if (theme === 'chemistry') {
    // Acidic (Red)
    if (['D', 'E'].includes(code)) return '#ef4444';
    // Basic (Blue)
    if (['R', 'K', 'H'].includes(code)) return '#3b82f6';
    // Polar Uncharged (Green)
    if (['S', 'T', 'N', 'Q', 'Y', 'C'].includes(code)) return '#10b981';
    // Non-polar (Grayish Orange)
    if (['A', 'V', 'L', 'I', 'P', 'F', 'W', 'M', 'G'].includes(code)) return '#94a3b8';
    // Stop codon
    if (code === '*') return '#f59e0b';
  }
  
  if (theme === 'hydrophobicity') {
    // Hydrophobic (Blue to Cyan)
    if (['I', 'V', 'L', 'F', 'C', 'M', 'A', 'W'].includes(code)) return '#2563eb';
    // Intermediate
    if (['G', 'T', 'S', 'Y', 'P', 'H'].includes(code)) return '#64748b';
    // Hydrophilic (Red to Pink)
    if (['R', 'K', 'E', 'D', 'N', 'Q'].includes(code)) return '#ec4899';
    if (code === '*') return '#f59e0b';
  }

  if (theme === 'taylor') {
    const taylor: Record<string, string> = {
      'D': '#FF0000', 'E': '#FF0000', 'R': '#0000FF', 'K': '#0000FF', 'H': '#0000FF',
      'N': '#00FF00', 'Q': '#00FF00', 'S': '#00FF00', 'T': '#00FF00', 'Y': '#00FF00',
      'A': '#808080', 'G': '#808080', 'I': '#808080', 'L': '#808080', 'M': '#808080',
      'F': '#808080', 'P': '#808080', 'W': '#808080', 'V': '#808080', 'C': '#00FFFF'
    };
    return taylor[code] || 'var(--text-main)';
  }

  return 'var(--text-main)';
};
