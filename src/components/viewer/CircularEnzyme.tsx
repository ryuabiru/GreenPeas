/**
 * 学習メモ: 配列ビュー内のCircularEnzyme要素を描画し、必要なポインター操作を親へ通知するReactコンポーネント。
 * 処理の位置づけ: 親コンポーネントからデータとコールバックを受け取り、描画と操作通知を担当する。
 */

import React from 'react';
import { RestrictionSite } from '../../types';
import { getCircularCoordinates } from '../../utils/circularLayout';
import { decodeHtmlEntities } from '../../utils/textUtils';

interface CircularEnzymeProps {
  item: {
    position: number;
    names: string[];
    actualAngle: number;
    tier: number;
  };
  seqLength: number;
  radius: number;
  centerX: number;
  centerY: number;
  enzymeCounts: Record<string, number>;
  hoveredEnzyme: RestrictionSite | null;
  onHover: (site: RestrictionSite | null) => void;
  onClick: (pos: number, event: React.MouseEvent) => void;
  isDark: boolean;
  colors: any;
}

export const CircularEnzyme: React.FC<CircularEnzymeProps> = ({
  item, seqLength, radius, centerX, centerY, enzymeCounts, hoveredEnzyme, onHover, onClick, isDark, colors
}) => {
  const siteCoords = getCircularCoordinates(item.position, seqLength, radius, centerX, centerY);
  const elbowDist = radius + 25 + item.tier * 25;
  const labelDist = radius + 45 + item.tier * 65;
  
  const ex = centerX + elbowDist * Math.cos(item.actualAngle);
  const ey = centerY + elbowDist * Math.sin(item.actualAngle);
  const lx = centerX + labelDist * Math.cos(item.actualAngle);
  const ly = centerY + labelDist * Math.sin(item.actualAngle);
  const isRight = lx > centerX;

  return (
    <g style={{ transition: 'all 0.3s' }}>
      <path d={`M ${siteCoords.x} ${siteCoords.y} L ${ex} ${ey} L ${lx} ${ly}`} stroke={colors.muted} strokeWidth="1" fill="none" opacity={0.4} />
      <g transform={`translate(${lx}, ${ly})`}>
        {item.names.map((name, ni) => {
          const displayName = decodeHtmlEntities(name);
          const isUnique = enzymeCounts[name] === 1;
          const isHoveredGroup = hoveredEnzyme && name === hoveredEnzyme.name;
          
          return (
            <text key={ni} y={ni * 12} fill={isHoveredGroup ? '#fff' : (isUnique ? colors.unique : colors.common)} fontSize="11" 
              textAnchor={isRight ? "start" : "end"} 
              style={{ 
                fontWeight: 'bold',
                cursor: 'pointer',
                transition: 'all 0.1s',
                paintOrder: 'stroke',
                stroke: isHoveredGroup ? (isUnique ? colors.unique : colors.common) : (isDark ? colors.bg : '#fff'),
                strokeWidth: isHoveredGroup ? '4px' : '2px'
              }}
              onMouseEnter={() => onHover({ name, position: item.position } as any)}
              onMouseLeave={() => onHover(null)}
              onClick={(e) => onClick(item.position, e)}
            >
              {displayName}{enzymeCounts[name] > 1 ? ` (${enzymeCounts[name]})` : ''}
            </text>
          );
        })}
      </g>
    </g>
  );
};
