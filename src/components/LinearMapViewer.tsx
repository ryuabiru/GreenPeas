import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { MapViewerProps } from './MapViewer';
import { getVisibleFeatureColor } from '../utils/colorUtils';
import { decodeHtmlEntities } from '../utils/textUtils';
import {
  buildLinearMapLayout, clampMapRange, panMapRange, zoomMapRange,
  type MapRange
} from '../utils/linearMapLayout';

const baseColors: Record<string, string> = {
  A: '#22c55e', C: '#60a5fa', G: '#fbbf24', T: '#f472b6', N: '#94a3b8'
};
const complement: Record<string, string> = { A: 'T', T: 'A', C: 'G', G: 'C', N: 'N' };

type LinearMapViewerProps = MapViewerProps & {
  initialRange?: MapRange;
  onBackToCircle?: () => void;
};

export const LinearMapViewer: React.FC<LinearMapViewerProps> = ({
  sequence, restrictionSites, excludedEnzymes, annotations, primers = [],
  enzymeCounts, onEditAnnotation, onSelectAnnotation, onEditPrimer, isDark = false,
  selection, onSelectionChange, maxCuts = 1000, topology,
  initialRange, onBackToCircle
}) => {
  const sequenceLength = Math.max(1, sequence.length);
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const dragX = useRef<number | null>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 560 });
  const [range, setRange] = useState<MapRange>(initialRange || { start: 0, end: sequenceLength });
  const [hoveredInfo, setHoveredInfo] = useState<string | null>(null);

  useEffect(() => {
    setRange(initialRange || { start: 0, end: sequenceLength });
  }, [sequenceLength, initialRange?.start, initialRange?.end]);

  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver(entries => {
      for (const entry of entries) {
        setDimensions({ width: entry.contentRect.width, height: entry.contentRect.height });
      }
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const preventScroll = (event: WheelEvent) => event.preventDefault();
    svg.addEventListener('wheel', preventScroll, { passive: false });
    return () => svg.removeEventListener('wheel', preventScroll);
  }, []);

  const filteredSites = useMemo(() => restrictionSites.filter(site =>
    !excludedEnzymes.includes(site.name) && (enzymeCounts[site.name] || 0) <= maxCuts
  ), [restrictionSites, excludedEnzymes, enzymeCounts, maxCuts]);
  const filteredAnnotations = useMemo(() => annotations.filter(annotation =>
    annotation.type.toLowerCase() !== 'source'
  ), [annotations]);

  const width = Math.max(280, dimensions.width);
  const plotLeft = width < 500 ? 36 : 56;
  const plotRight = width - (width < 500 ? 28 : 42);
  const plotWidth = plotRight - plotLeft;
  const span = range.end - range.start;
  const xFor = (position: number) => plotLeft + (position - range.start) * plotWidth / span;
  const layout = useMemo(() => buildLinearMapLayout(
    range, plotLeft, plotWidth, filteredAnnotations, primers,
    filteredSites, enzymeCounts, null, topology, sequenceLength
  ), [range, plotLeft, plotWidth, filteredAnnotations, primers, filteredSites, enzymeCounts, topology, sequenceLength]);

  const enzymeY = 94 + layout.siteLabelLaneCount * 19;
  const primerTop = enzymeY + 23;
  const axisY = primerTop + layout.primerLaneCount * 22 + 26;
  const showBaseColors = layout.pixelsPerBase >= 3;
  const showBaseLetters = layout.pixelsPerBase >= 11;
  const featureTop = axisY + (showBaseColors ? 79 : 42);
  const canvasHeight = Math.max(dimensions.height - 44,
    featureTop + layout.featureLaneCount * 28 + 62);
  const foreground = isDark ? '#e2e8f0' : '#1e293b';
  const muted = isDark ? '#94a3b8' : '#64748b';
  const border = isDark ? '#475569' : '#cbd5e1';
  const background = isDark ? '#0f172a' : '#ffffff';

  const zoom = (factor: number, fraction = 0.5) => {
    setRange(previous => zoomMapRange(previous, sequenceLength, fraction, factor));
  };
  const cursorFraction = (clientX: number) => {
    const rect = svgRef.current?.getBoundingClientRect();
    return Math.max(0, Math.min(1, (clientX - (rect?.left || 0) - plotLeft) / plotWidth));
  };
  const positionAtX = (clientX: number) => range.start + cursorFraction(clientX) * span;

  const handleWheel = (event: React.WheelEvent<SVGSVGElement>) => {
    event.preventDefault();
    const primaryDelta = Math.abs(event.deltaX) > Math.abs(event.deltaY)
      ? event.deltaX : event.deltaY;
    if (!primaryDelta) return;
    const deltaPixels = event.deltaMode === 1 ? primaryDelta * 16
      : event.deltaMode === 2 ? primaryDelta * plotWidth : primaryDelta;
    if (event.ctrlKey || event.metaKey) {
      const factor = Math.max(0.7, Math.min(1.4, Math.exp(deltaPixels * 0.002)));
      zoom(factor, cursorFraction(event.clientX));
    } else {
      setRange(previous => panMapRange(previous, sequenceLength,
        deltaPixels * (previous.end - previous.start) / plotWidth));
    }
  };
  const handleMouseMove = (event: React.MouseEvent<SVGSVGElement>) => {
    if (dragX.current === null) return;
    const delta = dragX.current - event.clientX;
    dragX.current = event.clientX;
    setRange(previous => panMapRange(previous, sequenceLength,
      delta * (previous.end - previous.start) / plotWidth));
  };
  const handleOverviewClick = (event: React.MouseEvent<SVGRectElement>) => {
    event.stopPropagation();
    const fullPosition = cursorFraction(event.clientX) * sequenceLength;
    setRange(previous => clampMapRange(
      fullPosition - (previous.end - previous.start) / 2,
      previous.end - previous.start, sequenceLength
    ));
  };

  const rulerTicks: number[] = [];
  const tickStart = Math.ceil(range.start / layout.rulerStep) * layout.rulerStep;
  for (let position = tickStart; position <= range.end; position += layout.rulerStep) {
    rulerTicks.push(position);
  }
  const firstBase = Math.max(0, Math.floor(range.start));
  const lastBase = Math.min(sequence.length, Math.ceil(range.end));
  const visibleBases = showBaseColors ? sequence.slice(firstBase, lastBase).toUpperCase() : '';

  return <div ref={containerRef} style={{ width: '100%', height: '100%', minHeight: 0,
    display: 'flex', flexDirection: 'column', background, color: foreground }}>
    <div style={{ minHeight: 44, display: 'flex', alignItems: 'center', gap: 8,
      padding: '0 14px', borderBottom: `1px solid ${border}`, fontSize: 12 }}>
      <strong style={{ fontSize: 13 }}>Map</strong>
      {onBackToCircle && <button type="button" onClick={onBackToCircle}>Circle overview</button>}
      <span data-testid="map-visible-range" style={{ color: muted, marginLeft: 6 }}>
        {Math.floor(range.start + 1).toLocaleString()}–{Math.ceil(range.end).toLocaleString()} / {sequence.length.toLocaleString()} bp
      </span>
      <span style={{ marginLeft: 'auto', color: muted }}>
        {layout.features.length} features · {layout.primers.length} primers · {layout.sites.length} cut positions
      </span>
      <button type="button" onClick={() => zoom(1.6)} title="Zoom out" aria-label="Zoom out">−</button>
      <button type="button" onClick={() => zoom(0.625)} title="Zoom in" aria-label="Zoom in">+</button>
      <button type="button" onClick={() => setRange({ start: 0, end: sequenceLength })}>Fit</button>
    </div>
    <div style={{ flex: 1, minHeight: 0, overflow: 'auto', position: 'relative' }}>
      <svg ref={svgRef} width={width} height={canvasHeight} viewBox={`0 0 ${width} ${canvasHeight}`}
        onWheel={handleWheel}
        onMouseDown={event => { if (event.button === 0) dragX.current = event.clientX; }}
        onMouseMove={handleMouseMove}
        onMouseUp={() => { dragX.current = null; }}
        onMouseLeave={() => { dragX.current = null; }}
        style={{ display: 'block', cursor: dragX.current === null ? 'grab' : 'grabbing', userSelect: 'none' }}>
        <rect x="0" y="0" width={width} height={canvasHeight} fill={background} />

        {/* Persistent overview: the pale window marks the currently visible bases. */}
        <rect x={plotLeft} y="31" width={plotWidth} height="10" rx="5" fill={border} opacity="0.5" />
        <rect x={plotLeft} y="27" width={plotWidth} height="18" fill="transparent"
          onMouseDown={event => event.stopPropagation()} onClick={handleOverviewClick}
          style={{ cursor: 'pointer' }} />
        <rect x={plotLeft + range.start / sequenceLength * plotWidth} y="29"
          width={Math.max(4, span / sequenceLength * plotWidth)} height="14" rx="4"
          fill="#3b82f6" opacity="0.8" pointerEvents="none" />
        <text x={plotLeft} y="21" fill={muted} fontSize="11">Full sequence</text>

        {/* Every cut stays visible as a tick; labels are chosen by the layout engine. */}
        {layout.sites.map(site => {
          const color = site.unique ? '#34d399' : '#fb7185';
          return <g key={site.position} onMouseDown={event => event.stopPropagation()}
            onMouseEnter={() => setHoveredInfo(`${site.names.join(', ')} · ${site.position + 1} bp`)}
            onMouseLeave={() => setHoveredInfo(null)}
            onClick={event => { event.stopPropagation(); onSelectionChange({ start: site.position, end: site.position }); }}
            style={{ cursor: 'pointer' }}>
            <title>{site.names.join(', ')} · {site.position + 1} bp</title>
            <line x1={site.x} x2={site.x} y1={enzymeY - 6} y2={enzymeY + 11}
              stroke={color} strokeWidth={site.unique ? 2 : 1.5} />
            {site.labelLane !== null && <>
              <line x1={site.x} x2={site.labelX} y1={enzymeY - 6}
                y2={69 + site.labelLane * 19} stroke={border} strokeWidth="1" opacity="0.55" />
              <text x={site.labelX} y={64 + site.labelLane * 19} textAnchor="middle"
                fill={color} fontSize="12" fontWeight={site.unique ? 700 : 500}>
                {site.label}
              </text>
            </>}
          </g>;
        })}

        {layout.primers.map(({ primer, part, x, width: primerWidth, lane, showLabel }) => {
          const y = primerTop + lane * 22;
          const color = primer.color || (primer.strand === 'Reverse' ? '#f43f5e' : '#10b981');
          const reverse = primer.strand === 'Reverse';
          const headX = reverse ? x : x + primerWidth;
          return <g key={`${primer.id}-${part}`} onMouseDown={event => event.stopPropagation()}
            onMouseEnter={() => setHoveredInfo(`${primer.name} · ${primer.start + 1}–${primer.end} · ${primer.strand}`)}
            onMouseLeave={() => setHoveredInfo(null)}
            onClick={event => { event.stopPropagation(); onSelectionChange({ start: primer.start, end: primer.end }); }}
            onDoubleClick={event => { event.stopPropagation(); onEditPrimer?.(primer); }}
            style={{ cursor: 'pointer' }}>
            <title>{primer.name} · {primer.strand} primer · {primer.start + 1}–{primer.end}</title>
            <line x1={x} x2={x + primerWidth} y1={y} y2={y} stroke={color} strokeWidth="5" strokeLinecap="round" />
            <line x1={x} x2={x + primerWidth} y1={y} y2={y} stroke="transparent" strokeWidth="16" />
            <polygon points={reverse
              ? `${headX},${y} ${headX + 9},${y - 5} ${headX + 9},${y + 5}`
              : `${headX},${y} ${headX - 9},${y - 5} ${headX - 9},${y + 5}`}
              fill={color} />
            {showLabel && <text x={x + primerWidth / 2} y={y - 8} textAnchor="middle"
              fill={color} fontSize="12" fontWeight="700">{primer.name}</text>}
          </g>;
        })}

        {selection && selection.start !== selection.end && (
          topology === 'Circular' && selection.start > selection.end
            ? [[selection.start, sequence.length], [0, selection.end]]
            : [[Math.min(selection.start, selection.end), Math.max(selection.start, selection.end)]]
        ).map(([start, end], index) => {
          const left = Math.max(start, range.start);
          const right = Math.min(end, range.end);
          return right > left ? <rect key={index} x={xFor(left)} y={axisY - 12}
            width={xFor(right) - xFor(left)} height="24" fill="#3b82f6" opacity="0.25"
            pointerEvents="none" /> : null;
        })}
        <line x1={plotLeft} x2={plotRight} y1={axisY} y2={axisY}
          stroke={border} strokeWidth="3" />
        {rulerTicks.map(position => <g key={position}>
          <line x1={xFor(position)} x2={xFor(position)} y1={axisY - 7} y2={axisY + 7}
            stroke={muted} strokeWidth="1" />
          <text x={xFor(position)} y={axisY + 22} textAnchor="middle" fill={muted} fontSize="11">
            {(position + 1).toLocaleString()}
          </text>
        </g>)}

        {showBaseColors && <>
          <rect x={plotLeft} y={axisY + 28} width={plotWidth} height="49" fill="transparent"
            onMouseDown={event => event.stopPropagation()}
            onClick={event => {
              event.stopPropagation();
              if (!sequence.length) return;
              const position = Math.min(sequence.length - 1, Math.floor(positionAtX(event.clientX)));
              onSelectionChange({ start: position, end: position + 1 });
            }} style={{ cursor: 'text' }} />
          {[...visibleBases].map((base, index) => {
            const position = firstBase + index;
            const x = xFor(position);
            const cellWidth = plotWidth / span;
            return <g key={position} pointerEvents="none">
              <rect x={x} y={axisY + 29} width={Math.max(1, cellWidth - 1)} height="16"
                fill={baseColors[base] || baseColors.N} opacity={showBaseLetters ? 0.15 : 0.8} />
              {showBaseLetters && <>
                <text x={x + cellWidth / 2} y={axisY + 42} textAnchor="middle"
                  fill={baseColors[base] || baseColors.N} fontSize="13" fontFamily="monospace" fontWeight="700">{base}</text>
                <text x={x + cellWidth / 2} y={axisY + 64} textAnchor="middle"
                  fill={muted} fontSize="12" fontFamily="monospace">{complement[base] || 'N'}</text>
              </>}
            </g>;
          })}
        </>}

        {layout.features.map(({ annotation, part, x, width: featureWidth, lane, showLabel }) => {
          const y = featureTop + lane * 28;
          const color = getVisibleFeatureColor(annotation.type, annotation.color || undefined, isDark);
          const name = decodeHtmlEntities(annotation.name);
          const selected = selection?.start === annotation.start && selection?.end === annotation.end;
          return <g key={`${annotation.id}-${part}`} onMouseDown={event => event.stopPropagation()}
            onMouseEnter={() => setHoveredInfo(`${name} (${annotation.type}) · ${annotation.start + 1}–${annotation.end}`)}
            onMouseLeave={() => setHoveredInfo(null)}
            onClick={event => { event.stopPropagation(); onSelectionChange({ start: annotation.start, end: annotation.end }); onSelectAnnotation?.(annotation); }}
            onDoubleClick={event => { event.stopPropagation(); onEditAnnotation?.(annotation); }}
            style={{ cursor: 'pointer' }}>
            <title>{name} ({annotation.type}) · {annotation.start + 1}–{annotation.end}</title>
            <rect x={x} y={y} width={featureWidth} height="19" rx="3" fill={color}
              opacity={selected || !isDark ? 1 : 0.8} stroke={selected ? foreground : 'none'} strokeWidth="2" />
            {annotation.display_shape === 'Arrow' && featureWidth >= 14 && <polygon
              points={annotation.strand === 'Reverse'
                ? `${x},${y + 9.5} ${x + 9},${y} ${x + 9},${y + 19}`
                : `${x + featureWidth},${y + 9.5} ${x + featureWidth - 9},${y} ${x + featureWidth - 9},${y + 19}`}
              fill={color} />}
            {showLabel && <text x={x + 7} y={y + 14} fill="#fff" fontSize="12" fontWeight="700"
              pointerEvents="none">{name}</text>}
          </g>;
        })}
      </svg>
      <div style={{ position: 'sticky', bottom: 0, minHeight: 25, padding: '3px 12px',
        background: isDark ? 'rgba(15,23,42,0.92)' : 'rgba(255,255,255,0.92)',
        color: muted, fontSize: 11, borderTop: `1px solid ${border}` }}>
        {hoveredInfo || (layout.pixelsPerBase < 0.5
          ? 'Overview · use + or pinch to reveal sequence detail'
          : 'Scroll to move left/right · pinch or Ctrl/⌘ + scroll to zoom')}
      </div>
    </div>
  </div>;
};
