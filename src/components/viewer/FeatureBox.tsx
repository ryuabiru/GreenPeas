/**
 * 学習メモ: 配列ビュー内のFeatureBox要素を描画し、必要なポインター操作を親へ通知するReactコンポーネント。
 * 処理の位置づけ: 親コンポーネントからデータとコールバックを受け取り、描画と操作通知を担当する。
 */

import React from 'react';
import { Annotation, AppSettings, INDEX_COLUMN_WIDTH } from '../../types';
import { getFeatureColor } from '../../utils/colorUtils';
import { getAminoAcidColor } from '../../utils/aaColors';
import { LayoutMetrics } from '../../utils/sequenceLayout';
import { decodeHtmlEntities } from '../../utils/textUtils';

interface FeatureBoxProps {
  ann: Annotation;
  startX: number; // This already includes INDEX_COLUMN_WIDTH from SequenceRow
  width: number;
  boxY: number;
  labelY?: number;
  aaY?: number;
  translation?: string;
  rowStartIndex: number;
  rowStrLen: number;
  charWidth: number;
  settings: AppSettings;
  isDark: boolean;
  onClick?: (ann: Annotation) => void;
  onDoubleClick?: (ann: Annotation) => void;
  hoveredCodon?: { start: number; end: number } | null;
  onHoverCodon?: (codon: { start: number; end: number } | null) => void;
  onMouseDownIdx?: (index: number, shift?: boolean) => void;
  onMouseEnterIdx?: (index: number) => void;
  isHovered?: boolean;
}

export const FeatureBox: React.FC<FeatureBoxProps> = ({
  ann, startX, width, boxY, labelY, aaY, translation, rowStartIndex, rowStrLen, charWidth, settings, isDark, 
  onClick, onDoubleClick, hoveredCodon, onHoverCodon, onMouseDownIdx, onMouseEnterIdx, isHovered
}) => {
  const color = getFeatureColor(ann.type, ann.color || undefined);
  const displayName = decodeHtmlEntities(ann.name);
  const needsLabel = LayoutMetrics.needsLabel(width, displayName.length, settings);
  const rowWidth = rowStrLen * charWidth;
  const labelWidth = Math.min(rowWidth, Math.max(48, displayName.length * settings.fontSize * 0.55 + 12));
  const labelLeft = Math.max(INDEX_COLUMN_WIDTH, Math.min(startX, INDEX_COLUMN_WIDTH + rowWidth - labelWidth));
  const featureTitle = `${displayName} (${ann.type}) · ${ann.start + 1}..${ann.end} · ${ann.strand}`;
  
  const originalAALen = Math.floor((ann.end - ann.start) / 3);

  const getFeatureStyle = (): React.CSSProperties => {
    const isArrow = ann.display_shape === "Arrow";
    const isReverse = ann.strand === "Reverse";
    let clipPath = 'none';
    if (isArrow) {
      if (isReverse) {
        clipPath = 'polygon(8px 0%, 100% 0%, 100% 100%, 8px 100%, 0% 50%)';
      } else {
        clipPath = 'polygon(0% 0%, calc(100% - 8px) 0%, 100% 50%, calc(100% - 8px) 100%, 0% 100%)';
      }
    }
    return {
      clipPath,
      WebkitClipPath: clipPath,
      backgroundColor: isHovered ? (isDark ? `${color}66` : `${color}44`) : (isDark ? `${color}44` : `${color}22`),
      border: isHovered ? `2px solid ${color}` : `1px solid ${color}`,
      height: `${LayoutMetrics.getBoxHeight(settings)}px`,
      borderRadius: '2px',
      boxSizing: 'border-box',
      color: isDark ? '#fff' : color,
      fontWeight: isDark ? 400 : 700,
      cursor: 'pointer',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontSize: `${Math.max(10, settings.fontSize * 0.75)}px`,
      overflow: 'hidden',
      zIndex: 2,
      position: 'absolute',
      left: `${startX}px`,
      top: `${boxY}px`,
      width: `${width}px`
    };
  };

  return (
    <React.Fragment>
      {/* 1. The Box */}
      <div 
        title={featureTitle}
        onClick={(e) => { e.stopPropagation(); onClick?.(ann); }}
        onDoubleClick={(e) => { e.stopPropagation(); onDoubleClick?.(ann); }} 
        style={getFeatureStyle()}
      >
        {!needsLabel && <span style={{ padding: '0 4px' }}>{displayName}</span>}
      </div>

      {/* 2. The Label (if needed) */}
      {needsLabel && labelY !== undefined && (
        <div title={featureTitle} style={{
            position: 'absolute', left: `${labelLeft}px`, top: `${labelY}px`,
            maxWidth: `${rowWidth}px`, padding: '1px 4px', boxSizing: 'border-box',
            fontSize: `${Math.max(10, settings.fontSize * 0.7)}px`,
            fontWeight: 700, color, whiteSpace: 'nowrap', overflow: 'hidden',
            textOverflow: 'ellipsis', borderLeft: `2px solid ${color}`,
            background: 'var(--bg-app)', borderRadius: '2px',
            zIndex: 1, pointerEvents: 'none'
        }}>
           {displayName}
        </div>
      )}

      {/* 3. AA Translation (if CDS) */}
      {ann.type === 'CDS' && translation && aaY !== undefined && (
        <div style={{ position: 'absolute', top: `${aaY}px`, left: `${INDEX_COLUMN_WIDTH}px`, width: `${rowStrLen * charWidth}px`, height: `${LayoutMetrics.getAaTrackHeight(settings)}px` }}>
           {translation.split('').map((aa, idx) => {
              const dnaStartIdx = ann.strand === "Forward" ? ann.start + (idx * 3) : ann.end - (idx + 1) * 3;
              const aaStartX = (dnaStartIdx - rowStartIndex) * charWidth;
              const aaWidth = charWidth * 3;
              if (aaStartX + aaWidth < 0 || aaStartX > rowStrLen * charWidth) return null;
              
              const isHovered = hoveredCodon && hoveredCodon.start === dnaStartIdx;
              const isExtAA = idx >= originalAALen;
              const dStart = Math.max(0, aaStartX);
              const dEnd = Math.min(rowStrLen * charWidth, aaStartX + aaWidth);
              const aaIndex = idx + 1;
              const showMarker = aaIndex === 1 || aaIndex % 5 === 0;

              return (
                <div key={idx} 
                  onMouseDown={(e) => { 
                    if (e.button !== 0) return; 
                    e.stopPropagation(); 
                    const isF = ann.strand === "Forward"; 
                    onMouseDownIdx?.(isF ? dnaStartIdx : dnaStartIdx + 3, e.shiftKey); 
                    onMouseEnterIdx?.(isF ? dnaStartIdx + 3 : dnaStartIdx); 
                  }}
                  onMouseEnter={(e) => { 
                    onHoverCodon?.({ start: dnaStartIdx, end: dnaStartIdx + 3 }); 
                    if (e.buttons === 1) {
                        const isF = ann.strand === "Forward"; 
                        onMouseEnterIdx?.(isF ? dnaStartIdx + 3 : dnaStartIdx); 
                    }
                  }} 
                  onMouseLeave={() => onHoverCodon?.(null)} 
                  title={isExtAA ? `${displayName} (Extended Translation)` : undefined}
                  style={{ 
                      position: 'absolute', left: `${dStart}px`, width: `${dEnd - dStart}px`, height: '100%', 
                      backgroundColor: isHovered ? 'rgba(59, 130, 246, 0.2)' : 'transparent',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', 
                      fontSize: `${Math.max(10, settings.fontSize * 0.8)}px`, 
                      opacity: isExtAA ? 0.7 : 1,
                      fontWeight: 700, color: getAminoAcidColor(aa, (settings.aminoAcidTheme as any) || undefined), 
                      cursor: 'text' 
                  }}
                >
                  {showMarker && (
                    <div style={{ position: 'absolute', top: `${-(settings.fontSize * 0.8)}px`, left: '50%', transform: 'translateX(-50%)', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                      <span style={{ fontSize: `${Math.max(8, settings.fontSize * 0.6)}px`, color: 'var(--text-muted)' }}>{aaIndex}</span>
                      <div style={{ width: '1px', height: '4px', backgroundColor: 'var(--border)' }} />
                    </div>
                  )}
                  <span>{aa}</span>
                </div>
              );
           })}
        </div>
      )}
    </React.Fragment>
  );
};
