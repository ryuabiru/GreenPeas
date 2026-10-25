/**
 * 学習メモ: 長い配列の全体像と現在位置を縮小表示し、クリック移動を提供する。
 * 処理の位置づけ: 親コンポーネントからデータとコールバックを受け取り、描画と操作通知を担当する。
 */

import React, { useRef } from 'react';
import { Selection, Annotation } from '../types';
import { decodeHtmlEntities } from '../utils/textUtils';

interface LinearMiniMapProps {
  sequenceLength: number;
  selection: Selection | null;
  viewportRange?: { start: number, end: number } | null;
  annotations?: Annotation[];
  onJumpTo: (pos: number) => void;
  height?: number;
  isDark?: boolean;
}

export const LinearMiniMap: React.FC<LinearMiniMapProps> = ({ 
  sequenceLength, 
  selection, 
  viewportRange,
  annotations = [], 
  onJumpTo, 
  height = 30,
  isDark = false 
}) => {
  const containerRef = useRef<HTMLDivElement>(null);

  const handleClick = (e: React.MouseEvent) => {
    if (!containerRef.current || sequenceLength === 0) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const pos = Math.floor((x / rect.width) * sequenceLength);
    onJumpTo(Math.max(0, Math.min(sequenceLength, pos)));
  };

  const selStart = selection ? Math.min(selection.start, selection.end) : 0;
  const selEnd = selection ? Math.max(selection.start, selection.end) : 0;
  const hasSelection = selection && selStart !== selEnd;

  return (
    <div 
      ref={containerRef}
      onClick={handleClick}
      className="mini-map-container"
      style={{ 
        width: '100%', 
        height: `${height}px`, 
        background: isDark ? '#0f172a' : '#f1f5f9', 
        borderBottom: '1px solid var(--border)',
        position: 'relative',
        cursor: 'pointer',
        overflow: 'hidden',
        userSelect: 'none'
      }}
    >
      {/* Background Bar */}
      <div style={{ 
        position: 'absolute', 
        top: '50%', 
        left: '0', 
        right: '0', 
        height: '2px', 
        background: isDark ? '#334155' : '#cbd5e1', 
        transform: 'translateY(-50%)' 
      }} />

      {/* Viewport Range shadow */}
      {viewportRange && sequenceLength > 0 && (
        <div style={{
          position: 'absolute',
          top: 0,
          bottom: 0,
          left: `${(viewportRange.start / sequenceLength) * 100}%`,
          width: `${((viewportRange.end - viewportRange.start) / sequenceLength) * 100}%`,
          background: isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.03)',
          borderLeft: '1px solid var(--border)',
          borderRight: '1px solid var(--border)',
          pointerEvents: 'none'
        }} />
      )}

      {/* Annotations */}
      {sequenceLength > 0 && annotations.map(ann => {
        const left = (ann.start / sequenceLength) * 96 + 2;
        const width = ((ann.end - ann.start) / sequenceLength) * 96;
        return (
          <div 
            key={ann.id}
            style={{
              position: 'absolute',
              top: '50%',
              left: `${left}%`,
              width: `${Math.max(2, width)}%`,
              height: '8px',
              background: ann.color || '#3b82f6',
              opacity: 0.6,
              borderRadius: '1px',
              transform: 'translateY(-50%)',
              pointerEvents: 'none'
            }}
            title={decodeHtmlEntities(ann.name)}
          />
        );
      })}

      {/* Selection Highlight */}
      {hasSelection && sequenceLength > 0 && (
        <div style={{
          position: 'absolute',
          top: 0,
          bottom: 0,
          left: `${(selStart / sequenceLength) * 96 + 2}%`,
          width: `${((selEnd - selStart) / sequenceLength) * 96}%`,
          background: 'rgba(59, 130, 246, 0.2)',
          borderLeft: '1px solid #3b82f6',
          borderRight: '1px solid #3b82f6',
          pointerEvents: 'none'
        }} />
      )}

      {/* Caret / Specific Position */}
      {selection && !hasSelection && sequenceLength > 0 && (
        <div style={{
          position: 'absolute',
          top: 0,
          bottom: 0,
          left: `${(selStart / sequenceLength) * 96 + 2}%`,
          width: '2px',
          background: '#ef4444',
          pointerEvents: 'none'
        }} />
      )}
    </div>
  );
};
