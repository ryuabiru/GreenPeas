/**
 * 学習メモ: 配列ビュー内のCircularFeature要素を描画し、必要なポインター操作を親へ通知するReactコンポーネント。
 * 処理の位置づけ: 親コンポーネントからデータとコールバックを受け取り、描画と操作通知を担当する。
 */

import React from 'react';
import { Annotation } from '../../types';
import { getVisibleFeatureColor } from '../../utils/colorUtils';
import { getCircularCoordinates, describeCircularArc } from '../../utils/circularLayout';
import { decodeHtmlEntities } from '../../utils/textUtils';

interface CircularFeatureProps {
  ann: Annotation;
  seqLength: number;
  radius: number;
  centerX: number;
  centerY: number;
  trackIdx: number;
  trackWidth: number;
  topology: 'Linear' | 'Circular';
  isDark: boolean;
  isHovered: boolean;
  onHover: (id: string | null) => void;
  onClick: (ann: Annotation) => void;
  onDoubleClick: (ann: Annotation) => void;
}

export const CircularFeature: React.FC<CircularFeatureProps> = ({
  ann, seqLength, radius, centerX, centerY, trackIdx, trackWidth, topology, isDark, isHovered, onHover, onClick, onDoubleClick
}) => {
  const displayName = decodeHtmlEntities(ann.name);
  const featureLength = ann.start <= ann.end ? ann.end - ann.start : seqLength - ann.start + ann.end;
  const arcLengthOnMain = (featureLength / seqLength) * 2 * Math.PI * radius;
  const isShort = arcLengthOnMain <= 80;
  const baseRadius = isShort ? radius - 45 : radius;
  const currentRadius = baseRadius - (trackIdx * trackWidth);
  
  const arcPath = describeCircularArc(ann.start, ann.end, seqLength, currentRadius, centerX, centerY, topology);
  const headIdx = ann.strand === "Forward" ? ann.end : ann.start;
  const headCoords = getCircularCoordinates(headIdx, seqLength, currentRadius, centerX, centerY);
  const direction = ann.strand === 'Reverse' ? -1 : 1;
  const tangentX = -Math.sin(headCoords.angleRad) * direction;
  const tangentY = Math.cos(headCoords.angleRad) * direction;
  const arrowBaseX = headCoords.x - tangentX * 12;
  const arrowBaseY = headCoords.y - tangentY * 12;
  const arrowPoints = `${headCoords.x},${headCoords.y} ` +
    `${arrowBaseX - tangentY * 6},${arrowBaseY + tangentX * 6} ` +
    `${arrowBaseX + tangentY * 6},${arrowBaseY - tangentX * 6}`;
  const midpoint = getCircularCoordinates((ann.start + featureLength / 2) % seqLength, seqLength, currentRadius, centerX, centerY);
  
  const color = getVisibleFeatureColor(ann.type, ann.color || undefined, isDark);

  return (
    <g 
      onClick={(e) => { e.stopPropagation(); onClick(ann); }}
      onDoubleClick={(e) => { e.stopPropagation(); onDoubleClick(ann); }} 
      onMouseEnter={() => onHover(ann.id)}
      onMouseLeave={() => onHover(null)}
      style={{ cursor: 'pointer' }}>
      <title>{`${displayName} (${ann.type}) · ${ann.start + 1}..${ann.end} · ${ann.strand}`}</title>
      
      <path d={arcPath} fill="none" stroke={color} strokeWidth={isHovered ? 18 : 12} style={{ opacity: isHovered ? 1 : (isDark ? 0.8 : 1), transition: 'all 0.2s' }} />
      {arcLengthOnMain < 10 && <circle cx={midpoint.x} cy={midpoint.y} r={isHovered ? 7 : 5} fill={color} />}
      
      {ann.display_shape === "Arrow" && (
        <polygon points={arrowPoints} fill={color} />
      )}

      {!isShort && (
        <text dy="4" style={{ 
            pointerEvents: 'none', fontSize: '11px', fontWeight: 'bold', 
            fill: isDark ? '#fff' : color, textShadow: isDark ? '0 1px 3px rgba(0,0,0,0.6)' : 'none' 
        }}>
          <textPath xlinkHref={`#path-${ann.id}`} startOffset="50%" textAnchor="middle">
            {displayName}
          </textPath>
        </text>
      )}

      {isHovered && (
        <g transform={`translate(${headCoords.x}, ${headCoords.y})`}>
          <rect x="-90" y="-40" width="180" height="26" rx="6" fill="rgba(15, 23, 42, 0.9)" />
          <text y="-23" textAnchor="middle" fill="#fff" fontSize="11" fontWeight="bold">
            {displayName.length > 25 ? `${displayName.slice(0, 22)}…` : displayName}
          </text>
        </g>
      )}
    </g>
  );
};
