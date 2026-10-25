/**
 * 学習メモ: 配列ビュー内のEnzymeLabel要素を描画し、必要なポインター操作を親へ通知するReactコンポーネント。
 * 処理の位置づけ: 親コンポーネントからデータとコールバックを受け取り、描画と操作通知を担当する。
 */

import React from 'react';
import { RestrictionSite, AppSettings } from '../../types';
import { decodeHtmlEntities } from '../../utils/textUtils';

interface EnzymeLabelProps {
  site: RestrictionSite;
  originalIdx: number;
  labelY: number;
  seqTop: number;
  seqHeight: number;
  left: number;
  charWidth: number;
  rowStartIndex: number;
  rowEndIndex: number;
  isUnique: boolean;
  isHovered: boolean;
  isSelected: boolean;
  onHover: (site: RestrictionSite | null) => void;
  onClick: (pos: number) => void;
  settings: AppSettings;
  isDark: boolean;
}

export const EnzymeLabel: React.FC<EnzymeLabelProps> = ({
  site, labelY, seqTop, seqHeight, left, charWidth, rowStartIndex, rowEndIndex, isUnique, isHovered, isSelected
}) => {
  const color = isUnique ? 'var(--enzyme-unique)' : 'var(--enzyme-common)';
  
  // Cut markers logic
  const sX = (site.position - rowStartIndex) * charWidth;
  const eX = (site.position + site.site.length - rowStartIndex) * charWidth;
  const width = eX - sX;
  const cutPosF = site.position + site.cut_after_top;
  const cutPosR = site.position + site.cut_after_bottom;
  const cutX = (cutPosF - rowStartIndex) * charWidth;
  const rcutX = (cutPosR - rowStartIndex) * charWidth;

  return (
    <>
      {/* 1. Guide Line (SVG) */}
      <line 
        x1={left} y1={labelY + 12} x2={left} y2={seqTop} 
        stroke={color} strokeWidth={isSelected ? 2 : 1} 
        opacity={(isHovered || isSelected) ? 0.8 : 0.2}
      />

      {/* 2. Cut Markers (SVG) - only if hovered or selected */}
      {(isHovered || isSelected) && (
        <g>
          <rect x={sX} y={seqTop + (seqHeight/2) - 2} width={width} height={4} fill={color} />
          {cutPosF >= rowStartIndex && cutPosF <= rowEndIndex && (
            <g>
              <line x1={cutX} y1={seqTop} x2={cutX} y2={seqTop + (seqHeight * 0.4)} stroke={color} strokeWidth={2} />
              <path d={`M ${cutX-3} ${seqTop-4} L ${cutX+3} ${seqTop-4} L ${cutX} ${seqTop} Z`} fill={color} />
            </g>
          )}
          {cutPosR >= rowStartIndex && cutPosR <= rowEndIndex && (
            <g>
              <line x1={rcutX} y1={seqTop + (seqHeight * 0.6)} x2={rcutX} y2={seqTop + seqHeight} stroke={color} strokeWidth={2} />
              <path d={`M ${rcutX-3} ${seqTop + seqHeight + 4} L ${rcutX+3} ${seqTop + seqHeight + 4} L ${rcutX} ${seqTop + seqHeight} Z`} fill={color} />
            </g>
          )}
        </g>
      )}

      {/* 3. Label (HTML/Absolute) - This will be rendered by the parent via a separate portal or logic if needed, 
          but for simplicity in SequenceRow, we might still render it in the same map.
          Wait, HTML elements can't be inside SVG. So we'll return only SVG parts here.
      */}
    </>
  );
};

// Separate component for the HTML label to be placed in the absolute container
export const EnzymeHtmlLabel: React.FC<Omit<EnzymeLabelProps, 'seqTop' | 'seqHeight' | 'charWidth' | 'rowEndIndex'>> = ({
    site, labelY, left, isUnique, isHovered, isSelected, onHover, onClick, settings, isDark
}) => {
    const displayName = decodeHtmlEntities(site.name);
    return (
        <div 
            onMouseEnter={() => onHover(site)} onMouseLeave={() => onHover(null)}
            onMouseDown={(e) => {
                e.stopPropagation(); // Prevent row selection from triggering
                onClick(site.position + site.cut_after_top);
            }}
            style={{ 
                position: 'absolute', left: `${left}px`, top: `${labelY}px`,
                fontSize: `${Math.max(10, settings.fontSize * 0.75)}px`, 
                color: isSelected ? '#fff' : (isUnique ? 'var(--enzyme-unique)' : 'var(--enzyme-common)'),
                background: isSelected ? (isUnique ? 'var(--enzyme-unique)' : 'var(--enzyme-common)') : (isDark ? 'rgba(15, 23, 42, 0.8)' : 'rgba(255, 255, 255, 0.8)'),
                fontWeight: (isUnique || isHovered || isSelected) ? 800 : 400, 
                borderLeft: isSelected ? 'none' : '1px solid currentColor', 
                padding: isSelected ? '0 4px' : '0 0 0 2px',
                borderRadius: isSelected ? '4px' : '0',
                boxShadow: isSelected ? '0 2px 4px rgba(0,0,0,0.3)' : 'none',
                whiteSpace: 'nowrap', cursor: 'pointer', zIndex: isSelected ? 10 : 1,
                transition: 'all 0.1s'
            }}>
            {displayName}
        </div>
    );
};
