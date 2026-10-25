/**
 * 学習メモ: 線状配列ビューの1行分を構成し、塩基、注釈、酵素、プライマーを配置する。
 * 処理の位置づけ: 親コンポーネントからデータとコールバックを受け取り、描画と操作通知を担当する。
 */

import React, { useState } from 'react';
import { Annotation, Primer, Selection, INDEX_COLUMN_WIDTH, AppSettings, RestrictionSite, RowMetrics } from '../types';
import { EnzymeLabel, EnzymeHtmlLabel } from './viewer/EnzymeLabel';
import { FeatureBox } from './viewer/FeatureBox';
import { PrimerArrow } from './viewer/PrimerArrow';
import { CdsContinuationTrack } from './viewer/CdsContinuationTrack';
import type { CdsContinuationEntry } from '../utils/cdsReadingPath';
import { primerHasBasesInRow } from '../utils/primerLayout';



interface SequenceRowProps {
  rowStr: string;
  rowStartIndex: number;
  restrictionSites: RestrictionSite[];
  selection: Selection | null;
  annotations: Annotation[];
  primers: Primer[];
  annotationTracks: Record<string, number>;
  cdsTranslations: Record<string, string>;
  cdsContinuations?: CdsContinuationEntry[];
  enzymeCounts?: Record<string, number>;
  sequenceLength: number;
  onMouseDown: (index: number, shift?: boolean, isFragment?: boolean) => void;
  onMouseEnter: (index: number) => void;
  onSelectionChange: (selection: Selection | null) => void;
  onClickAnnotation?: (ann: Annotation) => void;
  onDoubleClickAnnotation?: (ann: Annotation) => void;
  onDoubleClickPrimer?: (primer: Primer) => void;
  hoveredEnzyme: RestrictionSite | null;
  onHoverEnzyme: (enzyme: RestrictionSite | null) => void;
  hoveredPrimer: any | null;
  onHoverPrimer: (primer: any | null) => void;
  hoveredAnnotation: Annotation | null;
  onHoverAnnotation: (ann: Annotation | null) => void;
  isFirstRow?: boolean;
  isLastRow?: boolean;
  charWidth: number;
  settings: AppSettings;
  rowMetrics: RowMetrics;
  isDark: boolean;
  charsPerRow: number;
  onHoverPos?: (pos: { x: number, y: number } | null) => void;
}

export const SequenceRow: React.FC<SequenceRowProps> = React.memo(({ 
  rowStr, rowStartIndex, restrictionSites, selection, annotations, primers, cdsTranslations, cdsContinuations = [],
  enzymeCounts = {}, onMouseDown, onMouseEnter, onSelectionChange, onClickAnnotation, onDoubleClickAnnotation, onDoubleClickPrimer, hoveredEnzyme,
  onHoverEnzyme, hoveredPrimer, onHoverPrimer, hoveredAnnotation, onHoverAnnotation, isFirstRow, isLastRow, charWidth, settings, rowMetrics, isDark, onHoverPos
}) => {
  const [isHoveringClickable, setIsHoveringClickable] = useState(false);
  const rowEndIndex = rowStartIndex + rowStr.length;
  const isCaret = selection && selection.start === selection.end;
  
  const labelsSites = restrictionSites.filter(s => s.position >= rowStartIndex && s.position < rowEndIndex);
  const rowAnnotations = annotations.filter((ann: Annotation) => {
    if (ann.start <= ann.end) {
        return (ann.start >= rowStartIndex && ann.start < rowEndIndex) || (ann.end > rowStartIndex && ann.end <= rowEndIndex) || (ann.start < rowStartIndex && ann.end > rowEndIndex);
    } else {
        return (rowEndIndex > ann.start) || (rowStartIndex < ann.end);
    }
  });

  const { trackY, height: rowHeight, seqY } = rowMetrics;
  const seqTop = seqY;
  const seqHeight = settings.fontSize * 2.5;

  return (
    <div className="sequence-row-block" style={{ 
        position: 'relative', paddingLeft: `${INDEX_COLUMN_WIDTH}px`, height: `${rowHeight}px`,
        fontFamily: settings.fontFamily, fontSize: `${settings.fontSize}px`, overflow: 'visible',
        userSelect: 'none', WebkitUserSelect: 'none'
    }}>
      {/* --- RENDER LAYERS (Pointer-events: none) --- */}
      
      {/* 1. SVG Layer */}
      <div style={{ position: 'absolute', left: `${INDEX_COLUMN_WIDTH}px`, top: 0, width: 'calc(100% - 40px)', height: '100%', pointerEvents: 'none', zIndex: 0 }}>
        <svg style={{ width: '100%', height: '100%' }}>
          {/* Selection Highlight */}
          {selection && selection.start !== selection.end && (() => {
            const sStart = Math.min(selection.start, selection.end);
            const sEnd = Math.max(selection.start, selection.end);
            if (sEnd > rowStartIndex && sStart < rowEndIndex) {
              const sX = Math.max(0, (sStart - rowStartIndex) * charWidth);
              const eX = Math.min(rowStr.length * charWidth, (sEnd - rowStartIndex) * charWidth);
              return <rect x={sX} y={seqTop} width={eX - sX} height={seqHeight} fill="var(--selection)" />;
            }
            return null;
          })()}

          {/* Enzyme Guides & Primers */}
          {labelsSites.map((site) => {
            const originalIdx = restrictionSites.indexOf(site);
            return (
              <EnzymeLabel 
              key={`enz-${site.name}-${site.position}`} site={site} originalIdx={originalIdx}
              labelY={trackY[`enzyme_${site.name}_${site.position}`] || 0} seqTop={seqY} seqHeight={seqHeight} 
              charWidth={charWidth}
              rowStartIndex={rowStartIndex} rowEndIndex={rowEndIndex}
              left={(site.position - rowStartIndex) * charWidth}
              isUnique={enzymeCounts[site.name] === 1} isHovered={hoveredEnzyme?.name === site.name}
              isSelected={selection ? (selection.start === (site?.position ?? -1) + (site?.cut_after_top ?? 0) || selection.end === (site?.position ?? -1) + (site?.cut_after_top ?? 0)) : false}
              onHover={onHoverEnzyme} onClick={(pos) => onMouseDown(pos, false)} settings={settings} isDark={isDark}
            />
            );
          })}

          {primers.filter(p => primerHasBasesInRow(p, rowStartIndex, rowEndIndex)).map((p) => (
            <PrimerArrow 
              key={p.id} primer={p} y={trackY[`primer_${p.id}`] || 0} 
              rowStartIndex={rowStartIndex} 
              charWidth={charWidth} settings={settings} rowStr={rowStr}
              onHover={onHoverPrimer}
              isHovered={hoveredPrimer?.id === p.id}
            />
          ))}

          {/* Caret */}
          {isCaret && selection && selection.start >= rowStartIndex && selection.start <= rowEndIndex && (
            <rect x={(selection.start - rowStartIndex) * charWidth - 1} y={seqTop} width={2} height={settings.fontSize * 1.5} fill="var(--caret)" className="caret-blink" />
          )}
        </svg>
      </div>

      {/* 2. DNA Bases are now rendered by a single viewport-wide canvas in SequenceViewer */}

      {/* 3. HTML Labels (Enzymes, Features) */}
      <div style={{ position: 'absolute', left: 0, top: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 2 }}>
        {cdsContinuations.filter(({ geometry }) => geometry.ranges.some(range =>
          range.start < rowEndIndex && range.end > rowStartIndex
        )).map(({ cdsId, geometry }) => <CdsContinuationTrack
          key={cdsId} continuation={geometry}
          rowStartIndex={rowStartIndex} rowStrLen={rowStr.length} charWidth={charWidth}
          y={trackY[`ann_${cdsId}_box`] !== undefined
            ? trackY[`ann_${cdsId}_box`] + settings.fontSize * 0.7
            : seqY + seqHeight + 8}
        />)}
        {labelsSites.map((site) => {
          const originalIdx = restrictionSites.indexOf(site);
          return (
            <EnzymeHtmlLabel 
              key={`enz-lbl-${site.name}-${site.position}`} site={site} originalIdx={originalIdx}
              labelY={trackY[`enzyme_${site.name}_${site.position}`] || 0} left={(site.position - rowStartIndex) * charWidth + INDEX_COLUMN_WIDTH}
              rowStartIndex={rowStartIndex} isUnique={enzymeCounts[site.name] === 1} isHovered={hoveredEnzyme?.name === site.name}
              isSelected={selection ? (selection.start === site.position + site.cut_after_top || selection.end === site.position + site.cut_after_top) : false}
              onHover={onHoverEnzyme} onClick={(pos) => onMouseDown(pos, (window.event as any)?.shiftKey, true)} settings={settings} isDark={isDark}
            />
          );
        })}
        {rowAnnotations.map((ann) => {
          const startX = Math.max(0, (ann.start - rowStartIndex) * charWidth);
          const endX = Math.min(rowStr.length * charWidth, (ann.end - rowStartIndex) * charWidth);
          const boxY = trackY[`ann_${ann.id}_box`];
          if (boxY === undefined) return null;

          return (
            <FeatureBox 
              key={ann.id} ann={ann} startX={startX + INDEX_COLUMN_WIDTH} width={Math.max(2, endX - startX)} 
              boxY={boxY} labelY={trackY[`ann_${ann.id}_label`]} aaY={trackY[`ann_${ann.id}_aa`]}
              translation={cdsTranslations[ann.id]} rowStartIndex={rowStartIndex} rowStrLen={rowStr.length}
              charWidth={charWidth} settings={settings} isDark={isDark}
              onClick={() => {
                onSelectionChange({ start: ann.start, end: ann.end });
                onClickAnnotation?.(ann);
              }}
              isHovered={hoveredAnnotation?.id === ann.id}
              onMouseDownIdx={onMouseDown}
              onMouseEnterIdx={onMouseEnter}
            />
          );
        })}

        {isFirstRow && <div style={{ position: 'absolute', left: '10px', top: `${seqTop}px`, fontSize: '10px', fontWeight: 700, color: 'var(--text-muted)' }}>5'</div>}
        {isLastRow && <div style={{ position: 'absolute', left: `${rowStr.length * charWidth + INDEX_COLUMN_WIDTH + 5}px`, top: `${seqTop}px`, fontSize: '10px', fontWeight: 700, color: 'var(--text-muted)' }}>3'</div>}
        <div style={{ 
          position: 'absolute', 
          left: `${rowStr.length * charWidth + INDEX_COLUMN_WIDTH + (isLastRow ? 25 : 10)}px`, 
          top: `${seqTop + (settings.fontSize * 0.2)}px`, 
          fontSize: `${Math.max(10, settings.fontSize * 0.7)}px`, 
          color: 'var(--text-muted)', 
          fontWeight: 700, 
          opacity: 0.8, 
          width: '50px', 
          textAlign: 'left' 
        }}>
          {rowEndIndex.toLocaleString()}
        </div>
      </div>

      {/* --- INTERACTION LAYER (Unified) --- */}
      <div 
        className="sequence-interaction-overlay"
        onMouseDown={(e) => {
          if (e.button !== 0) return;
          const rect = e.currentTarget.getBoundingClientRect();
          const x = e.clientX - rect.left - INDEX_COLUMN_WIDTH;
          const y = e.clientY - rect.top;
          
          const hit = rowMetrics.hitBoxes.find(hb => 
              x >= hb.x && x <= hb.x + hb.w && y >= hb.y && y <= hb.y + hb.h
          );

          if (hit) {
              const target = hit.target as any;
              if ('Annotation' in target) {
                  const ann = annotations.find(a => a.id === target.Annotation);
                  if (ann) {
                      onSelectionChange({ start: ann.start, end: ann.end });
                      onClickAnnotation?.(ann);
                  }
              } else if ('AnnotationAA' in target) {
                  const ann = annotations.find(a => a.id === target.AnnotationAA);
                  if (ann) {
                      const dnaIdx = Math.floor(x / charWidth) + rowStartIndex;
                      const isF = ann.strand === "Forward";
                      const relativePos = isF ? (dnaIdx - ann.start) : (ann.end - 1 - dnaIdx);
                      const codonIdx = Math.floor(relativePos / 3);
                      const codonStart = isF ? ann.start + (codonIdx * 3) : ann.end - (codonIdx * 3);
                      const codonEnd = isF ? codonStart + 3 : codonStart - 3;
                      
                      onMouseDown(codonStart, e.shiftKey);
                      onSelectionChange({ start: codonStart, end: codonEnd });
                  }
              } else if ('RestrictionSite' in target) {
                  const [name, pos] = target.RestrictionSite;
                  const site = restrictionSites.find(s => s.name === name && s.position === pos);
                  if (site) {
                      const cutPos = site.position + site.cut_after_top;
                      onMouseDown(cutPos, e.shiftKey, true);
                  }
              } else if ('Base' in target) {
                  onMouseDown(target.Base, e.shiftKey);
              } else if ('Primer' in target) {
                  const p = primers.find(p => p.id === target.Primer);
                  if (p) onSelectionChange({ start: p.start, end: p.end });
              }
          } else {
              // Fallback for clicking slightly outside bases (end of row)
              const idx = Math.max(0, Math.min(rowStr.length, Math.round(x / charWidth)));
              onMouseDown(rowStartIndex + idx, e.shiftKey);
          }
        }}
        onMouseMove={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const x = e.clientX - rect.left - INDEX_COLUMN_WIDTH;
          const y = e.clientY - rect.top;
          onHoverPos?.({ x: e.clientX, y: e.clientY });
          
          const hit = rowMetrics.hitBoxes.find(hb => 
              x >= hb.x && x <= hb.x + hb.w && y >= hb.y && y <= hb.y + hb.h
          );

          if (hit) {
              const target = hit.target as any;
              if ('Annotation' in target) {
                  const ann = annotations.find(a => a.id === target.Annotation);
                  onHoverAnnotation(ann || null);
                  onHoverEnzyme(null);
                  onHoverPrimer(null);
              } else if ('RestrictionSite' in target) {
                  const [name, pos] = target.RestrictionSite;
                  const site = restrictionSites.find(s => s.name === name && s.position === pos);
                  onHoverEnzyme(site || null);
                  onHoverAnnotation(null);
                  onHoverPrimer(null);
              } else if ('Primer' in target) {
                  const p = primers.find(p => p.id === target.Primer);
                  onHoverPrimer(p || null);
                  onHoverAnnotation(null);
                  onHoverEnzyme(null);
              } else if ('AnnotationAA' in target) {
                  const ann = annotations.find(a => a.id === target.AnnotationAA);
                  if (ann) {
                      const dnaIdx = Math.floor(x / charWidth) + rowStartIndex;
                      const isF = ann.strand === "Forward";
                      const relativePos = isF ? (dnaIdx - ann.start) : (ann.end - 1 - dnaIdx);
                      const codonIdx = Math.floor(relativePos / 3);
                      const codonStart = isF ? ann.start + (codonIdx * 3) : ann.end - (codonIdx * 3);
                      const codonEnd = isF ? codonStart + 3 : codonStart - 3;
                      
                      onMouseEnter(codonEnd);
                      onHoverAnnotation(ann);
                      onHoverEnzyme(null);
                      onHoverPrimer(null);
                  }
              } else if ('Base' in target) {
                  onMouseEnter(target.Base);
                  onHoverAnnotation(null);
                  onHoverEnzyme(null);
                  onHoverPrimer(null);
              }
          } else {
              onHoverAnnotation(null);
              onHoverEnzyme(null);
              onHoverPrimer(null);
              // Fallback for base selection at edges
              const idx = Math.max(0, Math.min(rowStr.length, Math.round(x / charWidth)));
              onMouseEnter(rowStartIndex + idx);
          }
          setIsHoveringClickable(!!hit && !('Base' in (hit.target as any)));
        }}
        onMouseLeave={() => {
          onHoverEnzyme(null);
          onHoverPrimer(null);
          onHoverAnnotation(null);
          setIsHoveringClickable(false);
        }}
        onDoubleClick={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const x = e.clientX - rect.left - INDEX_COLUMN_WIDTH;
          const y = e.clientY - rect.top;
          
          const hit = rowMetrics.hitBoxes.find(hb => 
              x >= hb.x && x <= hb.x + hb.w && y >= hb.y && y <= hb.y + hb.h
          );

          if (hit && 'Annotation' in (hit.target as any)) {
              const ann = annotations.find(a => a.id === (hit.target as any).Annotation);
              if (ann) onDoubleClickAnnotation?.(ann);
          } else if (hit && 'Primer' in (hit.target as any)) {
            const primer = primers.find(p => p.id === (hit.target as any).Primer);
            if (primer) onDoubleClickPrimer?.(primer);
          }
        }}
        style={{ 
          position: 'absolute', left: 0, top: 0, width: '100%', height: '100%', 
          zIndex: 10, cursor: isHoveringClickable ? 'pointer' : 'text',
          userSelect: 'none', WebkitUserSelect: 'none'
        }} 
      />
    </div>
  );
});
