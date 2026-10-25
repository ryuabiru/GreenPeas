/**
 * 学習メモ: 配列ビュー内のPrimerArrow要素を描画し、必要なポインター操作を親へ通知するReactコンポーネント。
 * 処理の位置づけ: 親コンポーネントからデータとコールバックを受け取り、描画と操作通知を担当する。
 */

import React, { useState } from 'react';
import { AppSettings, Primer } from '../../types';
import { getPrimerLabelWidth, getPrimerSequenceRange, getPrimerTrackGeometry } from '../../utils/primerLayout';

interface PrimerArrowProps {
  primer: Primer;
  y: number;
  rowStartIndex: number;
  charWidth: number;
  settings: AppSettings;
  rowStr: string; // The template sequence for this row
  onHover: (hovered: Primer | null) => void;
  isHovered?: boolean;
}

export const PrimerArrow: React.FC<PrimerArrowProps> = ({
  primer, y, rowStartIndex, charWidth, settings, rowStr, onHover, isHovered: externalHovered
}) => {
  const [internalHovered, setInternalHovered] = useState(false);
  const isHovered = externalHovered || internalHovered;
  
  const isReverse = primer.strand === "Reverse";
  const geometry = getPrimerTrackGeometry(settings, isReverse);
  const color = primer.color || (isReverse ? '#f43f5e' : '#10b981');

  // Calculate the range of the primer (including tails) relative to template
  const tail5Len = primer.tail5?.length || 0;
  const tail3Len = primer.tail3?.length || 0;
  
  // Coordinate of the first base of the FULL primer sequence on the template
  const primerFullStart = getPrimerSequenceRange(primer).start;
  const fullSeq = primer.sequence;
  const primerFullEnd = primerFullStart + fullSeq.length;
  
  const renderBases = [];
  for (let i = 0; i < fullSeq.length; i++) {
      const templateIdx = primerFullStart + i;
      if (templateIdx >= rowStartIndex && templateIdx < rowStartIndex + rowStr.length) {
          const x = (templateIdx - rowStartIndex) * charWidth;
          const char = isReverse ? fullSeq[fullSeq.length - 1 - i] : fullSeq[i];
          
          // Determine type and offset
          let type: 'match' | 'mismatch' | 'tail' = 'match';
          let offset = 0;
          
          const mismatchIdx = isReverse ? fullSeq.length - 1 - i : i;
          const isTail = mismatchIdx < tail5Len || mismatchIdx >= fullSeq.length - tail3Len;
          const isMismatch = primer.mismatches?.includes(mismatchIdx);
          
          if (isTail) {
              type = 'tail';
              offset = isReverse ? geometry.tailOffset : -geometry.tailOffset;
          } else if (isMismatch) {
              type = 'mismatch';
              offset = isReverse ? geometry.mismatchOffset : -geometry.mismatchOffset;
          }
          
          renderBases.push(
              <g key={i}>
                  {/* Connecting line for mismatches/tails */}
                  {offset !== 0 && (
                      <line 
                        x1={x + charWidth/2} y1={y + geometry.baseBaseline}
                        x2={x + charWidth/2} y2={y + geometry.baseBaseline + offset}
                        stroke={color} strokeWidth={1} strokeDasharray="1,1" opacity={0.6}
                      />
                  )}
                  <text 
                    x={x + charWidth/2} 
                    y={y + geometry.baseBaseline + offset}
                    textAnchor="middle" 
                    fill={type === 'match' ? color : (type === 'mismatch' ? '#f59e0b' : '#3b82f6')}
                    style={{ 
                        fontSize: `${geometry.baseFontSize}px`,
                        fontWeight: (type === 'match' ? 500 : 800),
                        fontFamily: 'monospace',
                        textShadow: isHovered ? '0 0 2px rgba(255,255,255,1.0)' : 'none'
                    }}
                  >
                    {char}
                  </text>
              </g>
          );
      }
  }

  if (renderBases.length === 0) return null;

  const rowEndIndex = rowStartIndex + rowStr.length;
  const labelAnchor = isReverse ? primerFullEnd - 1 : primerFullStart;
  const showLabel = labelAnchor >= rowStartIndex && labelAnchor < rowEndIndex;
  const labelWidth = Math.min(rowStr.length * charWidth, getPrimerLabelWidth(primer.name, settings));
  const labelX = Math.max(0, Math.min(
    (labelAnchor - rowStartIndex) * charWidth - (isReverse ? labelWidth - charWidth : 0),
    rowStr.length * charWidth - labelWidth
  ));

  const handleMouseEnter = () => {
    setInternalHovered(true);
    onHover(primer);
  };

  const handleMouseLeave = () => {
    setInternalHovered(false);
    onHover(null);
  };

  return (
    <g 
      style={{ cursor: 'pointer' }}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <title>{`${primer.name} · ${isReverse ? 'Reverse' : 'Forward'} primer · ${primer.mismatches.length} mismatches · 5' tail ${tail5Len} bp`}</title>
      {renderBases}
      {showLabel && <text x={labelX} y={y + geometry.labelBaseline} fill={color}
        style={{ fontSize: `${geometry.labelFontSize}px`, fontWeight: 700 }}>
        {isReverse ? `← ${primer.name}` : `${primer.name} →`}
      </text>}
    </g>
  );
};
