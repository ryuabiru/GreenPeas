/**
 * 学習メモ: アラインメント結果、参照配列、AB1トレースを並べて閲覧する画面を統括する。
 * 処理の位置づけ: 親コンポーネントからデータとコールバックを受け取り、描画と操作通知を担当する。
 */

import React, { useState, useMemo, useRef } from 'react';
import { SequenceData, AlignmentResult, CHAR_WIDTH, ChromTrace, AlignmentTrackSettings } from '../types';
import { LinearMiniMap } from './LinearMiniMap';
import { AlignmentCoordinateEngine } from '../utils/AlignmentCoordinateEngine';
import { AlignmentTrackRow, AlignmentHeader, AlignmentSidebar } from './alignment/index.ts';

interface AlignmentViewerProps {
    template: SequenceData;
    results: AlignmentResult[];
    allTraces: Record<string, ChromTrace>;
    onFetchTrace: (id: string, path: string) => void;
    isDark?: boolean;
    trackSettings: Record<number, AlignmentTrackSettings>;
    setTrackSettings: (v: Record<number, AlignmentTrackSettings> | ((prev: Record<number, AlignmentTrackSettings>) => Record<number, AlignmentTrackSettings>)) => void;
    onEditReference?: (start: number, len: number, text: string) => void;
}

export const AlignmentViewer: React.FC<AlignmentViewerProps> = ({ 
  template, results, allTraces, onFetchTrace, isDark, trackSettings, setTrackSettings, onEditReference 
}) => {
  console.log("🔭 AlignmentViewer Results Count:", results.length);
  const charWidth = CHAR_WIDTH;

  const dashboardRef = useRef<HTMLDivElement>(null);
  const headerScrollRef = useRef<HTMLDivElement>(null);
  const tracksScrollRef = useRef<HTMLDivElement>(null);
  const labelsScrollSyncRef = useRef<HTMLDivElement>(null);

  // Throttled state for heavy virtualization logic
  const [virtualScrollLeft, setVirtualScrollLeft] = useState(0);
  const [virtualScrollTop, setVirtualScrollTop] = useState(0);
  const [viewportWidth, setViewportWidth] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(0);

  // --- 1. Alignment Coordinate Engine ---
  const engine = useMemo(() => {
    return new AlignmentCoordinateEngine(template, results, trackSettings);
  }, [template, results, trackSettings]);

  const { globalLength, mapAbsoluteToGlobal, maxGaps } = engine;

  const reversedTraces = useMemo(() => {
    const cached: Record<string, ChromTrace> = {};
    results.forEach(res => {
        if (res.strand === "Reverse" && res.data && typeof res.data.id === 'string' && allTraces[res.data.id]) {
            const id = res.data.id;
            if (cached[id]) return;
            const t = allTraces[id];
            cached[id] = {
                ...t,
                a: [...t.t].reverse(),
                t: [...t.a].reverse(),
                g: [...t.c].reverse(),
                c: [...t.g].reverse(),
                peak_locations: t.peak_locations ? [...t.peak_locations].reverse().map(p => t.g.length - 1 - p) : []
            };
        }
    });
    return cached;
  }, [results, allTraces]);

  React.useEffect(() => {
    const updateSize = () => {
      if (tracksScrollRef.current) {
        setViewportWidth(tracksScrollRef.current.clientWidth);
        setViewportHeight(tracksScrollRef.current.clientHeight);
      }
    };
    updateSize();
    window.addEventListener('resize', updateSize);
    return () => window.removeEventListener('resize', updateSize);
  }, []);

  // Virtualization boundaries - Use virtualScroll state
  // We add a very large buffer (overscan) to prevent frequent updates
  const startIdx = Math.max(0, Math.floor(virtualScrollLeft / charWidth) - 1500);
  const endIdx = Math.min(globalLength || 0, Math.ceil((virtualScrollLeft + viewportWidth) / charWidth) + 1500);

  // --- 2. Annotation Stacking Logic ---
  const MAX_FEATURE_LAYERS = 5;
  const { tieredAnnotations, maxLayerUsed } = useMemo(() => {
    if (!template.annotations) return { tieredAnnotations: [], maxLayerUsed: 0 };
    
    const sorted = [...template.annotations].sort((a, b) => a.start - b.start);
    const layers: number[] = []; 
    const tiered: (typeof template.annotations[0] & { level: number })[] = [];
    let hidden = 0;

    sorted.forEach(ann => {
        const start = mapAbsoluteToGlobal[ann.start];
        const end = mapAbsoluteToGlobal[ann.end];
        let level = layers.findIndex(lastEnd => lastEnd < start);
        
        if (level === -1) {
            if (layers.length < MAX_FEATURE_LAYERS) {
                level = layers.length;
                layers.push(end);
                tiered.push({ ...ann, level });
            } else {
                hidden++;
            }
        } else {
            layers[level] = end;
            tiered.push({ ...ann, level });
        }
    });

    return { tieredAnnotations: tiered, maxLayerUsed: layers.length };
  }, [template.annotations, mapAbsoluteToGlobal]);

  const { trackLayout, totalTracksHeight } = useMemo(() => {
    let currentY = 0;
    const layout = results.map((res, i) => {
        const settings = trackSettings[i] || { visible: true, expanded: false, hideSeq: false };
        if (
          settings.visible === false ||
          !res.data ||
          typeof res.data.id !== 'string' ||
          typeof res.data.sequence !== 'string' ||
          res.data.sequence.length === 0
        ) {
          return { height: 0, top: 0, visible: false, totalHeight: 0 };
        }
        
        let h = 25; 
        if (!settings.hideSeq) {
            h += 25; 
            if (settings.expanded) h += 90; 
        }
        const top = currentY;
        const totalHeight = h + 15; 
        currentY += totalHeight;
        return { height: h, top, visible: true, totalHeight };
    });
    return { trackLayout: layout, totalTracksHeight: currentY };
  }, [results, trackSettings]);

  const visibleTrackIndices = useMemo(() => {
    return trackLayout.map((l, i) => ({ ...l, index: i }))
        .filter(l => l.visible && l.top + l.totalHeight > virtualScrollTop - 1500 && l.top < virtualScrollTop + viewportHeight + 1500)
        .map(l => l.index);
  }, [trackLayout, virtualScrollTop, viewportHeight]);

  const handleJumpTo = (pos: number) => {
    const globalPos = mapAbsoluteToGlobal[pos] + maxGaps[pos];
    const scrollPos = Math.round(globalPos * charWidth);
    if (tracksScrollRef.current) tracksScrollRef.current.scrollLeft = scrollPos;
    // Force sync virtualization state
    setVirtualScrollLeft(scrollPos);
  };

  const lastScrollUpdate = useRef(0);
  const rafId = useRef<number | null>(null);

  const handleScroll = (forceOrEvent: boolean | React.UIEvent = false) => {
    const force = typeof forceOrEvent === 'boolean' ? forceOrEvent : false;
    if (tracksScrollRef.current && dashboardRef.current) {
        const left = tracksScrollRef.current.scrollLeft;
        const top = tracksScrollRef.current.scrollTop;
        
        // 1. Instant GPU update via CSS variables
        dashboardRef.current.style.setProperty('--scroll-left', `${left}px`);
        dashboardRef.current.style.setProperty('--scroll-top', `${top}px`);
        
        // 2. Sync Header and Sidebar (Non-React, synchronous)
        if (headerScrollRef.current) headerScrollRef.current.scrollLeft = left;
        if (labelsScrollSyncRef.current) labelsScrollSyncRef.current.scrollTop = top;

        // 3. Throttled Virtualization Update (using rAF)
        if (rafId.current && !force) return;

        const update = () => {
            rafId.current = null;
            const now = Date.now();
            const dx = Math.abs(left - virtualScrollLeft);
            const dy = Math.abs(top - virtualScrollTop);
            
            // Critical: Remove startTransition for virtualization state to ensure immediate rendering
            if (force || dx > 50 || dy > 50 || (now - lastScrollUpdate.current > 200)) {
                setVirtualScrollLeft(left);
                setVirtualScrollTop(top);
                lastScrollUpdate.current = now;
            }
        };

        if (force) {
            update();
        } else {
            rafId.current = requestAnimationFrame(update);
        }
    }
  };

  // Use useLayoutEffect to ensure coordination before the browser paints
  React.useLayoutEffect(() => {
    handleScroll(true); 
    const id = requestAnimationFrame(() => handleScroll(true));
    return () => cancelAnimationFrame(id);
  }, [allTraces, totalTracksHeight, trackSettings, viewportWidth, viewportHeight]);
  const labelWidth = 180;

  return (
    <div 
        ref={dashboardRef}
        className="alignment-dashboard" 
        style={{ 
            display: 'flex', 
            flexDirection: 'column', 
            flex: '1 1 0%', 
            minHeight: 0, 
            width: '100%', 
            overflow: 'hidden', 
            background: 'var(--bg-app)', 
            color: 'var(--text-main)',
            // Initialize CSS variables
            '--scroll-left': '0px',
            '--scroll-top': '0px'
        } as any}
    >
      {/* Dashboard Top Header */}
      <div style={{ padding: '8px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: '20px', background: 'var(--bg-sidebar)', justifyContent: 'space-between', zIndex: 110 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
            <h3 style={{ margin: 0, fontSize: '0.85rem', fontWeight: 600 }}>MSA View</h3>
        </div>
        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            Aligned Length: {globalLength} bp
        </div>
      </div>

      <LinearMiniMap 
        sequenceLength={globalLength}
        selection={null}
        viewportRange={{ start: startIdx, end: endIdx }}
        annotations={template.annotations}
        isDark={isDark}
        onJumpTo={handleJumpTo}
        height={24}
      />

      {/* Main Grid: Header Area */}
      <div style={{ display: 'flex', background: 'var(--bg-app)', borderBottom: '1px solid var(--border)', zIndex: 100, boxSizing: 'border-box' }}>
         {/* Top-Left Corner Piece */}
         <div style={{ width: `${labelWidth}px`, flexShrink: 0, borderRight: '1px solid var(--border)', background: 'var(--bg-sidebar)', display: 'flex', alignItems: 'center', padding: '0 12px', boxSizing: 'border-box' }}>
            <span style={{ fontSize: '0.65rem', fontWeight: 800, color: 'var(--text-muted)', letterSpacing: '0.05em' }}>TRACKS</span>
         </div>
         
         {/* Top-Right Horizontal Scroll Header (Synced) */}
         <div ref={headerScrollRef} style={{ flex: 1, overflow: 'hidden', position: 'relative', boxSizing: 'border-box' }}>
            <AlignmentHeader 
                engine={engine}
                startIdx={startIdx}
                endIdx={endIdx}
                charWidth={charWidth}
                isDark={isDark}
                tieredAnnotations={tieredAnnotations as any}
                maxLayerUsed={maxLayerUsed}
                onEditReference={onEditReference}
            />
         </div>
      </div>

      {/* Main Content: Body Area */}
      <div style={{ display: 'flex', flex: '1 1 0%', minHeight: 0, overflow: 'hidden', boxSizing: 'border-box' }}>
        <AlignmentSidebar 
            visibleTrackIndices={visibleTrackIndices}
            results={results}
            trackLayout={trackLayout}
            trackSettings={trackSettings}
            setTrackSettings={setTrackSettings}
            allTraces={allTraces}
            onFetchTrace={onFetchTrace}
            totalTracksHeight={totalTracksHeight}
            labelsScrollSyncRef={labelsScrollSyncRef}
        />

        {/* Right Scrollable Tracks (Vertical + Horizontal) */}
        <div ref={tracksScrollRef} onScroll={handleScroll} style={{ flex: 1, overflow: 'auto', background: 'var(--bg-app)', boxSizing: 'border-box' }}>
            <div style={{ 
                width: `${globalLength * charWidth}px`, 
                height: `${totalTracksHeight}px`, 
                position: 'relative', 
                paddingTop: '20px', 
                paddingBottom: '100px', 
                paddingLeft: 0, 
                boxSizing: 'border-box',
                willChange: 'transform' // Hint for GPU acceleration
            }}>
                {visibleTrackIndices.map((ridx) => (
                    <AlignmentTrackRow 
                        key={`${results[ridx]?.data?.file_path || results[ridx]?.data?.id || results[ridx]?.id || ridx}-${results[ridx]?.strand || 'unknown'}-${ridx}-${trackSettings[ridx]?.hideSeq ? 'hidden' : 'shown'}`}
                        ridx={ridx}
                        res={results[ridx]}
                        layout={trackLayout[ridx]}
                        settings={trackSettings[ridx] || { visible: true, expanded: false, hideSeq: false }}
                        startIdx={startIdx}
                        endIdx={endIdx}
                        charWidth={charWidth}
                        isDark={isDark}
                        allTraces={allTraces}
                        reversedTraces={reversedTraces}
                        engine={engine}
                    />
                ))}
            </div>
        </div>
      </div>
    </div>
  );
};
