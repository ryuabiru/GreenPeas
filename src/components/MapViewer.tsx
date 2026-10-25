/**
 * 学習メモ: 環状または線状の全体マップをSVGで描画し、選択や注釈編集の操作を受け付ける。
 * 処理の位置づけ: 親コンポーネントからデータとコールバックを受け取り、描画と操作通知を担当する。
 */

import React, { useMemo, useState, useEffect, useRef } from 'react';
import { RestrictionSite, Annotation, Primer, Selection } from '../types';
import { getCircularCoordinates, describeCircularArc } from '../utils/circularLayout';
import { decodeHtmlEntities } from '../utils/textUtils';
import { CircularFeature } from './viewer/CircularFeature';
import { CircularEnzyme } from './viewer/CircularEnzyme';
import { MapPrimer } from './viewer/MapPrimer';
import { LinearMapViewer } from './LinearMapViewer';
import { clampMapRange } from '../utils/linearMapLayout';

export interface MapViewerProps {
  sequence: string;
  restrictionSites: RestrictionSite[];
  excludedEnzymes: string[];
  annotations: Annotation[];
  primers?: Primer[];
  enzymeCounts: Record<string, number>;
  annotationTracks: Record<string, number>;
  onEditAnnotation?: (ann: Annotation) => void;
  onSelectAnnotation?: (ann: Annotation) => void;
  onEditPrimer?: (primer: Primer) => void;
  isDark?: boolean;
  topology: 'Linear' | 'Circular';
  hoveredEnzyme?: RestrictionSite | null;
  onHoverEnzyme?: (site: RestrictionSite | null) => void;
  selection: Selection | null;
  onSelectionChange: (sel: Selection | null) => void;
  maxCuts?: number;
}

const CircularMapViewer: React.FC<MapViewerProps & { onInspectAt: (position: number) => void }> = ({ sequence, restrictionSites, excludedEnzymes, annotations, primers = [], enzymeCounts, annotationTracks, onEditAnnotation, onSelectAnnotation, onEditPrimer, isDark = false, topology, hoveredEnzyme = null, onHoverEnzyme = () => {}, selection, onSelectionChange, maxCuts = 1000, onInspectAt }) => {
  const seqLength = sequence.length || 1;
  const [dimensions, setDimensions] = useState({ width: 800, height: 800 });
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) setDimensions({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  // Prevent default wheel behavior (scrolling) natively to avoid passive listener issues
  useEffect(() => {
    const svgEl = svgRef.current;
    if (!svgEl) return;
    const preventDefaultWheel = (e: WheelEvent) => {
      e.preventDefault();
    };
    svgEl.addEventListener('wheel', preventDefaultWheel, { passive: false });
    return () => {
      svgEl.removeEventListener('wheel', preventDefaultWheel);
    };
  }, []);

  const inspectAtPointer = (clientX: number, clientY: number) => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect || !rect.width || !rect.height) return;
    const x = (clientX - rect.left) * 1000 / rect.width - 500;
    const y = (clientY - rect.top) * 1000 / rect.height - 500;
    const angle = (Math.atan2(y, x) + Math.PI / 2 + 2 * Math.PI) % (2 * Math.PI);
    onInspectAt(Math.round(angle / (2 * Math.PI) * seqLength) % seqLength);
  };

  const handleWheel = (event: React.WheelEvent<SVGSVGElement>) => {
    event.preventDefault();
    if ((event.ctrlKey || event.metaKey) && event.deltaY < 0) {
      inspectAtPointer(event.clientX, event.clientY);
    }
  };

  const radius = 320;
  const centerX = 500; 
  const centerY = 500;
  const trackWidth = 14;

  const isSmall = dimensions.width < 600;
  const featureThreshold = isSmall && annotations.length > 500 ? Math.max(20, seqLength / 250) : 0;
  
  const filteredSites = useMemo(() => restrictionSites.filter(s => !excludedEnzymes.includes(s.name) && enzymeCounts[s.name] <= maxCuts), [restrictionSites, excludedEnzymes, enzymeCounts, maxCuts]);
  const filteredAnnotations = useMemo(() => annotations.filter(ann => ann.type.toLowerCase() !== 'source' && (ann.start <= ann.end ? ann.end - ann.start : (seqLength - ann.start + ann.end)) >= featureThreshold), [annotations, featureThreshold, seqLength]);

  const enzymeGroups = useMemo(() => {
    const groups: Record<number, string[]> = {};
    filteredSites.forEach(site => { if (!groups[site.position]) groups[site.position] = []; groups[site.position].push(site.name); });
    return Object.entries(groups).map(([pos, names]) => ({ position: Number(pos), names }))
      .sort((a, b) => a.position - b.position);
  }, [filteredSites]);

  const layoutEnzymeLabels = useMemo(() => {
    const items = enzymeGroups.filter(group =>
      group.names.some(name => enzymeCounts[name] === 1)
    ).map(group => ({ ...group,
      actualAngle: (group.position / seqLength) * 2 * Math.PI - Math.PI / 2,
      tier: 0
    }));
    const minAngularDiff = (2 * Math.PI) / (isSmall ? 60 : 100);
    for (let iter = 0; iter < 50; iter++) {
      for (let i = 0; i < items.length; i++) {
        const next = (i + 1) % items.length;
        let diff = items[next].actualAngle - items[i].actualAngle;
        while (diff < 0) diff += 2 * Math.PI;
        if (diff < minAngularDiff) { const force = (minAngularDiff - diff) / 2; items[i].actualAngle -= force; items[next].actualAngle += force; }
      }
    }
    for (let i = 0; i < items.length; i++) {
      const prev = (i - 1 + items.length) % items.length;
      let diff = items[i].actualAngle - items[prev].actualAngle;
      while (diff < 0) diff += 2 * Math.PI;
      items[i].tier = diff < (2 * Math.PI) / 60 ? (items[prev].tier + 1) % 3 : 0;
    }
    return items;
  }, [enzymeGroups, enzymeCounts, seqLength, isSmall]);
  const enzymeLabelByPosition = new Map(layoutEnzymeLabels.map(item => [item.position, item]));

  const colors = {
    bg: isDark ? '#0f172a' : '#ffffff', text: isDark ? '#f8fafc' : '#1e293b', muted: isDark ? '#94a3b8' : '#64748b', border: isDark ? '#334155' : '#e2e8f0', unique: isDark ? '#4ade80' : '#059669', common: isDark ? '#f87171' : '#db2777'
  };

  const handleSiteClick = (pos: number, event: React.MouseEvent) => {
    event.stopPropagation();
    onSelectionChange(event.shiftKey && selection ? { start: selection.start, end: pos } : { start: pos, end: pos });
  };

  const [hoveredAnnotationId, setHoveredAnnotationId] = useState<string | null>(null);
  const [hoveredPrimerId, setHoveredPrimerId] = useState<string | null>(null);
  const selectionActive = selection !== null && selection.start !== selection.end;
  const selectionArc = selectionActive && selection ? describeCircularArc(selection.start, selection.end, seqLength, radius, centerX, centerY, topology) : "";

  // Linear Map calculations
  const mapX = (pos: number) => 100 + (pos / seqLength) * 800;
  const lineY = 500;

  const linearAnnotationLayout = useMemo(() => {
      const layers: number[] = [];
      return filteredAnnotations.map(ann => {
          const x1 = mapX(ann.start);
          const x2 = mapX(ann.end);
          const left = Math.min(x1, x2);
          const right = Math.max(x1, x2);
          
          let layer = layers.findIndex(lastRight => lastRight < left - 10);
          if (layer === -1) {
              layer = layers.length;
              layers.push(right);
          } else {
              layers[layer] = right;
          }
          return { ann, left, width: Math.max(2, right - left), layer };
      });
  }, [filteredAnnotations, seqLength]);

  const linearEnzymeLayout = useMemo(() => {
      const groups: Record<number, string[]> = {};
      filteredSites.forEach(site => {
          if (!groups[site.position]) groups[site.position] = [];
          groups[site.position].push(site.name);
      });

      const sortedPositions = Object.keys(groups).map(Number).sort((a, b) => a - b);
      const items = sortedPositions.map((pos, idx) => {
          const x = mapX(pos);
          return {
              position: pos,
              names: groups[pos],
              x,
              tier: idx % 3
          };
      });
      return items;
  }, [filteredSites, seqLength]);

  return (
    <div 
      ref={containerRef} 
      style={{ 
        width: '100%', 
        height: '100%', 
        display: 'flex', 
        justifyContent: 'center', 
        alignItems: 'center', 
        background: colors.bg, 
        overflow: 'hidden',
        position: 'relative'
      }}
    >
      <div 
        style={{ 
          position: 'absolute', 
          bottom: '12px', 
          left: '12px', 
          fontSize: '0.7rem', 
          color: colors.muted, 
          pointerEvents: 'none', 
          userSelect: 'none',
          backgroundColor: isDark ? 'rgba(15, 23, 42, 0.6)' : 'rgba(255, 255, 255, 0.6)',
          padding: '4px 8px',
          borderRadius: '4px',
          backdropFilter: 'blur(4px)',
          zIndex: 10
        }}
      >
        Pinch or Ctrl/⌘ + scroll up, or double click to inspect a region
      </div>
      <svg 
        ref={svgRef}
        width={Math.min(dimensions.width, dimensions.height)} 
        height={Math.min(dimensions.width, dimensions.height)} 
        viewBox="0 0 1000 1000"
        onWheel={handleWheel}
        onDoubleClick={(event) => inspectAtPointer(event.clientX, event.clientY)}
        style={{ cursor: 'zoom-in', userSelect: 'none' }}
      >
        <g>
          {topology === 'Circular' ? (
            <>
              <defs>
                {filteredAnnotations.map((ann) => {
                   const trackIdx = annotationTracks[ann.id] || 0;
                   const featureLength = ann.start <= ann.end ? ann.end - ann.start : seqLength - ann.start + ann.end;
                   const isShort = (featureLength / seqLength) * 2 * Math.PI * radius <= 80;
                   const d = describeCircularArc(ann.start, ann.end, seqLength, (isShort ? radius - 45 : radius) - (trackIdx * trackWidth), centerX, centerY, topology);
                   return <path key={ann.id} id={`path-${ann.id}`} d={d} />;
                })}
              </defs>

              <circle cx={centerX} cy={centerY} r={radius} fill="none" stroke={colors.border} strokeWidth="2" strokeDasharray="4 4" opacity="0.5" />
              
              {selectionActive && <path d={selectionArc} fill="none" stroke="#3b82f6" strokeWidth={16} opacity="0.3" pointerEvents="none" />}
              {selectionActive && [selection!.start, selection!.end].map((pos, pidx) => {
                const c = getCircularCoordinates(pos, seqLength, radius, centerX, centerY);
                return <line key={pidx} x1={centerX + (radius - 12) * Math.cos(c.angleRad)} y1={centerY + (radius - 12) * Math.sin(c.angleRad)} x2={centerX + (radius + 12) * Math.cos(c.angleRad)} y2={centerY + (radius + 12) * Math.sin(c.angleRad)} stroke="#3b82f6" strokeWidth="2" />;
              })}

              {filteredAnnotations.map((ann) => (
                <CircularFeature 
                  key={ann.id} ann={ann} seqLength={seqLength} radius={radius} centerX={centerX} centerY={centerY} 
                  trackIdx={annotationTracks[ann.id] || 0} trackWidth={trackWidth} topology={topology} isDark={isDark} 
                  isHovered={hoveredAnnotationId === ann.id} onHover={setHoveredAnnotationId} 
                  onClick={(a) => { onSelectionChange({ start: a.start, end: a.end }); onSelectAnnotation?.(a); }} onDoubleClick={(a) => onEditAnnotation?.(a)}
                />
              ))}

              {primers.map((primer, index) => <MapPrimer key={primer.id} primer={primer}
                sequenceLength={seqLength} topology="Circular" index={index}
                hovered={hoveredPrimerId === primer.id} onHover={setHoveredPrimerId}
                onSelect={(selected) => onSelectionChange({ start: selected.start, end: selected.end })}
                onEdit={onEditPrimer} />)}

              <text x={centerX} y={centerY} textAnchor="middle" fill={colors.text} fontSize="20" fontWeight="800" dominantBaseline="middle">{seqLength.toLocaleString()} <tspan fontSize="12" fill={colors.muted}>bp</tspan></text>

              {enzymeGroups.map((group, i) => {
                const item = enzymeLabelByPosition.get(group.position);
                if (item) {
                  return <CircularEnzyme
                    key={i} item={item} seqLength={seqLength} radius={radius} centerX={centerX} centerY={centerY}
                    enzymeCounts={enzymeCounts} hoveredEnzyme={hoveredEnzyme} onHover={onHoverEnzyme}
                    onClick={(pos, event) => handleSiteClick(pos, event)} isDark={isDark} colors={colors}
                  />;
                }
                const inner = getCircularCoordinates(group.position, seqLength, radius - 6, centerX, centerY);
                const outer = getCircularCoordinates(group.position, seqLength, radius + 10, centerX, centerY);
                return <g key={i} style={{ cursor: 'pointer' }}
                  onMouseEnter={() => {
                    const site = filteredSites.find(site => site.position === group.position);
                    if (site) onHoverEnzyme(site);
                  }}
                  onMouseLeave={() => onHoverEnzyme(null)}
                  onClick={event => handleSiteClick(group.position, event)}>
                  <title>{group.names.join(', ')} · {group.position + 1} bp</title>
                  <line x1={inner.x} y1={inner.y} x2={outer.x} y2={outer.y}
                    stroke={colors.common} strokeWidth="2" />
                </g>;
              })}

              {hoveredEnzyme && filteredSites.filter(s => s.name === hoveredEnzyme.name).map((site, si) => {
                const c = getCircularCoordinates(site.position, seqLength, radius, centerX, centerY);
                return <circle key={`hover-${si}`} cx={c.x} cy={c.y} r="5" fill={enzymeCounts[site.name] === 1 ? colors.unique : colors.common} stroke="#fff" strokeWidth="2" />;
              })}
            </>
          ) : (
            <>
              {/* Linear Map Layout */}
              <line x1="100" y1={lineY} x2="900" y2={lineY} stroke={colors.border} strokeWidth="4" />
              <text x="100" y={lineY + 28} fill={colors.text} fontSize="14" fontWeight="600" textAnchor="middle">1</text>
              <text x="900" y={lineY + 28} fill={colors.text} fontSize="14" fontWeight="600" textAnchor="middle">{seqLength.toLocaleString()} bp</text>

              {/* Selection area in Linear Map */}
              {selectionActive && selection && (() => {
                const startX = mapX(Math.min(selection.start, selection.end));
                const endX = mapX(Math.max(selection.start, selection.end));
                return <rect x={startX} y={lineY - 15} width={Math.max(2, endX - startX)} height="30" fill="#3b82f6" opacity="0.2" pointerEvents="none" />;
              })()}

              {/* Linear Annotations */}
              {linearAnnotationLayout.map(({ ann, left, width, layer }) => {
                  const y = lineY + 50 + (layer * 28);
                  const color = ann.color || '#3b82f6';
                  const isHovered = hoveredAnnotationId === ann.id;
                  return (
                      <g 
                          key={ann.id} 
                          cursor="pointer"
                          onMouseEnter={() => setHoveredAnnotationId(ann.id)}
                          onMouseLeave={() => setHoveredAnnotationId(null)}
                          onClick={() => { onSelectionChange({ start: ann.start, end: ann.end }); onSelectAnnotation?.(ann); }}
                          onDoubleClick={() => onEditAnnotation?.(ann)}
                      >
                          <title>{`${decodeHtmlEntities(ann.name)} (${ann.type}) · ${ann.start + 1}..${ann.end} · ${ann.strand}`}</title>
                          {ann.display_shape === 'Arrow' && width >= 12
                            ? <path d={ann.strand === 'Reverse'
                                ? `M ${left + 8} ${y} L ${left + width} ${y} L ${left + width} ${y + 18} L ${left + 8} ${y + 18} L ${left} ${y + 9} Z`
                                : `M ${left} ${y} L ${left + width - 8} ${y} L ${left + width} ${y + 9} L ${left + width - 8} ${y + 18} L ${left} ${y + 18} Z`}
                                fill={color} opacity={isHovered ? 0.95 : 0.75} />
                            : <rect x={left} y={y} width={width} height="18" rx="4"
                                fill={color} opacity={isHovered ? 0.95 : 0.75} />}
                          {width >= 32 && <text
                              x={left + 5} 
                              y={y + 13} 
                              fill="#fff" 
                              fontSize="11" 
                              fontWeight="bold"
                          >
                              {(() => {
                                const displayName = decodeHtmlEntities(ann.name);
                                return displayName.length * 6 > width ? `${displayName.slice(0, Math.max(1, Math.floor(width / 6)))}..` : displayName;
                              })()}
                          </text>}
                          {width < 32 && isHovered && <text x={left} y={y - 6} fill={colors.text}
                            stroke={colors.bg} strokeWidth="3" paintOrder="stroke" fontSize="12" fontWeight="700">
                            {decodeHtmlEntities(ann.name)}
                          </text>}
                      </g>
                  );
              })}

              {primers.map((primer, index) => <MapPrimer key={primer.id} primer={primer}
                sequenceLength={seqLength} topology="Linear" index={index}
                hovered={hoveredPrimerId === primer.id} onHover={setHoveredPrimerId}
                onSelect={(selected) => onSelectionChange({ start: selected.start, end: selected.end })}
                onEdit={onEditPrimer} />)}

              {/* Linear Restriction Sites */}
              {linearEnzymeLayout.map((item, idx) => {
                  const labelY = lineY - 60 - (item.tier * 28);
                  const isHovered = hoveredEnzyme && item.names.includes(hoveredEnzyme.name);
                  const isUnique = item.names.some(name => enzymeCounts[name] === 1);
                  const color = isUnique ? colors.unique : colors.common;

                  return (
                      <g 
                          key={idx} 
                          cursor="pointer"
                          onMouseEnter={() => {
                              const site = filteredSites.find(s => s.position === item.position);
                              if (site) onHoverEnzyme(site);
                          }}
                          onMouseLeave={() => onHoverEnzyme(null)}
                          onClick={(e) => handleSiteClick(item.position, e)}
                      >
                          <line x1={item.x} y1={lineY - 12} x2={item.x} y2={lineY + 12} stroke={isHovered ? '#3b82f6' : colors.border} strokeWidth="2" />
                          <line x1={item.x} y1={lineY - 12} x2={item.x} y2={labelY + 12} stroke={isHovered ? '#3b82f6' : colors.border} strokeWidth="1" strokeDasharray="3 3" opacity="0.5" />
                          
                          <text 
                              x={item.x} 
                              y={labelY} 
                              fill={isHovered ? '#3b82f6' : color} 
                              fontSize="12" 
                              fontWeight={isUnique ? '800' : '600'}
                              textAnchor="middle"
                          >
                              {item.names.map((name) => decodeHtmlEntities(name)).join(', ')}
                          </text>
                      </g>
                  );
              })}
            </>
          )}
        </g>
      </svg>
      {primers.length > 0 && <div aria-label="Primers" style={{
        position: 'absolute', top: '12px', right: '12px', maxWidth: '220px',
        maxHeight: '30%', overflowY: 'auto', padding: '7px', borderRadius: '8px',
        border: `1px solid ${colors.border}`, background: colors.bg, zIndex: 10,
        boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
      }}>
        <div style={{ fontSize: '11px', fontWeight: 700, color: colors.muted, marginBottom: '4px' }}>Primers</div>
        {primers.map(primer => <button key={primer.id} type="button"
          onMouseEnter={() => setHoveredPrimerId(primer.id)}
          onMouseLeave={() => setHoveredPrimerId(null)}
          onClick={() => onSelectionChange({ start: primer.start, end: primer.end })}
          onDoubleClick={() => onEditPrimer?.(primer)}
          title={`${primer.name} · ${primer.strand} · ${primer.mismatches.length} mismatches`}
          style={{
            display: 'flex', width: '100%', alignItems: 'center', gap: '6px',
            padding: '3px 5px', background: hoveredPrimerId === primer.id ? colors.border : 'transparent',
            color: colors.text, border: 'none', borderRadius: '4px', cursor: 'pointer',
            fontSize: '11px', textAlign: 'left'
          }}>
          <span style={{ color: primer.color || (primer.strand === 'Reverse' ? '#f43f5e' : '#10b981'), fontWeight: 800 }}>
            {primer.strand === 'Reverse' ? '←' : '→'}
          </span>
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{primer.name}</span>
          {primer.mismatches.length > 0 && <span style={{ color: '#d97706' }}>•{primer.mismatches.length}</span>}
        </button>)}
      </div>}
    </div>
  );
};

export const MapViewer: React.FC<MapViewerProps> = props => {
  const [focusedPosition, setFocusedPosition] = useState<number | null>(null);
  useEffect(() => setFocusedPosition(null), [props.topology, props.sequence.length]);

  if (props.topology === 'Linear') return <LinearMapViewer {...props} />;
  if (focusedPosition !== null) {
    const span = Math.min(Math.max(120, props.sequence.length * 0.15), props.sequence.length);
    const initialRange = clampMapRange(focusedPosition - span / 2, span, props.sequence.length);
    return <LinearMapViewer {...props} initialRange={initialRange}
      onBackToCircle={() => setFocusedPosition(null)} />;
  }
  return <CircularMapViewer {...props} onInspectAt={setFocusedPosition} />;
};
