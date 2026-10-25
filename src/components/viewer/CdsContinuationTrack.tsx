import React from 'react';
import { INDEX_COLUMN_WIDTH } from '../../types';
import type { CdsContinuation } from '../../utils/cdsReadingPath';

interface Props {
  continuation: CdsContinuation;
  rowStartIndex: number;
  rowStrLen: number;
  charWidth: number;
  y: number;
}

export const CdsContinuationTrack: React.FC<Props> = ({
  continuation, rowStartIndex, rowStrLen, charWidth, y
}) => {
  const rowEndIndex = rowStartIndex + rowStrLen;
  const stopVisible = continuation.stopBaseIndex >= rowStartIndex &&
    continuation.stopBaseIndex < rowEndIndex;

  return <div aria-label="CDS translation continuation" style={{
    position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 1
  }}>
    {continuation.ranges.map((range, index) => {
      const start = Math.max(range.start, rowStartIndex);
      const end = Math.min(range.end, rowEndIndex);
      if (start >= end) return null;
      const width = (end - start) * charWidth;
      return <div key={index} style={{
        position: 'absolute', left: INDEX_COLUMN_WIDTH + (start - rowStartIndex) * charWidth,
        top: y, width, borderTop: '1px dashed var(--text-muted)'
      }}>
        {width >= 90 && <span style={{
          position: 'absolute', left: '50%', top: '-8px', transform: 'translateX(-50%)',
          padding: '0 4px', background: 'var(--bg-app)', color: 'var(--text-muted)',
          fontSize: 10, whiteSpace: 'nowrap'
        }}>in frame</span>}
      </div>;
    })}
    {stopVisible && <span aria-label="stop codon" style={{
      position: 'absolute',
      left: INDEX_COLUMN_WIDTH + (continuation.stopBaseIndex - rowStartIndex + 0.5) * charWidth,
      top: y - 10, transform: 'translateX(-50%)',
      padding: '0 2px', background: 'var(--bg-app)', color: 'var(--text-muted)',
      fontSize: 14, lineHeight: 1
    }}>*</span>}
  </div>;
};
