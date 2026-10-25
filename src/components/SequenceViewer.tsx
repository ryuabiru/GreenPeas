/**
 * 学習メモ: 線状配列ビュー全体を統括し、仮想スクロール、選択、Canvas描画、注釈操作を調停する。
 * 処理の位置づけ: 親コンポーネントからデータとコールバックを受け取り、描画と操作通知を担当する。
 */

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Selection, RestrictionSite, Annotation, Primer, AppSettings, RowMetrics, SequenceData, FullLayout } from '../types';
import { SequenceRow } from './SequenceRow';
import { LinearMiniMap } from './LinearMiniMap';
import * as api from '../api';
import { SequenceViewportCanvas } from './viewer/SequenceViewportCanvas';
import { useUiStore } from '../store/useUiStore';
import { calculateRowLayout } from '../utils/sequenceLayout';
import { getVisibleCdsContinuations } from '../utils/cdsReadingPath';
import { primerHasBasesInRow } from '../utils/primerLayout';
import { listen } from '@tauri-apps/api/event';

interface SequenceViewerProps {
    sequenceData: SequenceData;
    onEdit: (start: number, deleteCount: number, insertText: string) => void;
    onSelectionChange: React.Dispatch<React.SetStateAction<Selection | null>>;
    visibleFrames?: number[];
    excludedEnzymes?: string[];
    annotations?: Annotation[];
    primers?: Primer[];
    restrictionSites?: RestrictionSite[];
    annotationTracks?: Record<string, number>;
    enzymeCounts?: Record<string, number>;
    onEditAnnotation?: (ann: Annotation) => void;
    onEditPrimer?: (primer: Primer) => void;
    selection: Selection | null;
    hoveredEnzyme?: RestrictionSite | null;
    onHoverEnzyme: (site: RestrictionSite | null) => void;
    hoveredPrimer?: any | null;
    onHoverPrimer?: (primer: any | null) => void;
    hoveredAnnotation?: Annotation | null;
    onHoverAnnotation?: (ann: Annotation | null) => void;
    onContextMenu?: (e: React.MouseEvent) => void;
    onPaste?: () => void;
    onCopy?: () => void;
    onCut?: () => void;
    onSelectAll?: () => void;
    settings: AppSettings;
    isDark: boolean;
    maxCuts?: number;
    lastJumpTime?: number;
}

export const SequenceViewer: React.FC<SequenceViewerProps> = React.memo(({
    sequenceData, onEdit, onSelectionChange, excludedEnzymes = [], annotations = [], primers = [],
    restrictionSites = [], annotationTracks = {}, enzymeCounts = {}, onEditAnnotation, onEditPrimer, selection, hoveredEnzyme, onHoverEnzyme,
    hoveredPrimer, onHoverPrimer = () => { }, hoveredAnnotation, onHoverAnnotation, onContextMenu, onPaste, onCopy, onCut, onSelectAll, settings, isDark, maxCuts, lastJumpTime
}) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const [scrollTop, setScrollTop] = useState(0);
    const [containerHeight, setContainerHeight] = useState(800);
    const [rowLayout, setRowLayout] = useState<FullLayout>({ rows: [], totalHeight: 0 });
    const [sequenceCache, setSequenceCache] = useState<Map<number, string>>(new Map());
    const [isDragging, setIsDragging] = useState(false);
    const [cdsTranslations, setCdsTranslations] = useState<Record<string, string>>({});
    const [mutationCount, setMutationCount] = useState(0);
    const [hoverPos, setHoverPos] = useState<{ x: number, y: number } | null>(null);
    const isInitialLoad = useRef(true);
    const layoutKeyRef = useRef<string | null>(null);
    const handledJumpTimeRef = useRef(0);

    useEffect(() => {
        isInitialLoad.current = true;
    }, [sequenceData.id, mutationCount]);

    const filteredSites = useMemo(() =>
        restrictionSites.filter(s => !excludedEnzymes.includes(s.name) && (!maxCuts || (enzymeCounts[s.name] || 0) <= maxCuts)),
        [restrictionSites, excludedEnzymes, maxCuts, enzymeCounts]
    );

    const charWidth = settings.fontSize * 0.72;
    const [charsPerRow, setCharsPerRow] = useState(80);

    // 1. Dynamic CharsPerRow & Resize Handling
    useEffect(() => {
        if (!containerRef.current) return;

        const observer = new ResizeObserver(entries => {
            for (let entry of entries) {
                const width = entry.contentRect.width - 100; // Left(40) + Right(60) Margin
                const newChars = Math.max(20, Math.floor(width / charWidth));
                setCharsPerRow((prev: number) => {
                    if (prev !== newChars) {
                        setSequenceCache(new Map());
                        return newChars;
                    }
                    return prev;
                });
                setContainerHeight(entry.contentRect.height);
            }
        });

        observer.observe(containerRef.current);
        return () => observer.disconnect();
    }, [charWidth]);

    // 2. Keep measured row heights when an edit changes only the sequence length.
    useEffect(() => {
        const count = Math.ceil(sequenceData.sequence.length / charsPerRow);
        const defaultRowHeight = settings.fontSize * 10;
        const layoutKey = `${sequenceData.id}:${charsPerRow}:${settings.fontSize}`;
        const needsNewLayout = layoutKeyRef.current !== layoutKey;
        layoutKeyRef.current = layoutKey;
        const placeholderRow = (offset: number): RowMetrics => ({
            height: defaultRowHeight, offset, trackY: {}, seqY: 10, hitBoxes: []
        });

        setRowLayout(previous => {
            if (needsNewLayout) {
                const rows = Array.from({ length: count }, (_, i) => placeholderRow(i * defaultRowHeight));
                return { rows, totalHeight: count * defaultRowHeight };
            }
            if (previous.rows.length === count) return previous;
            if (previous.rows.length > count) {
                const rows = previous.rows.slice(0, count);
                const last = rows[rows.length - 1];
                return { rows, totalHeight: last ? last.offset + last.height : 0 };
            }
            const rows = [...previous.rows];
            let offset = previous.totalHeight;
            while (rows.length < count) {
                rows.push(placeholderRow(offset));
                offset += defaultRowHeight;
            }
            return { rows, totalHeight: offset };
        });
    }, [sequenceData.id, sequenceData.sequence.length, charsPerRow, settings.fontSize]);

    // Viewport Calculation with Overscan for macOS reliability
    const { startIndex, totalRows } = useMemo(() => {
        const OVERSCAN_ROWS = 10;
        const VIEWPORT_BUFFER = 1000; // px

        let start = 0;
        let accumulated = 0;

        // Find the first row that is currently visible
        while (start < rowLayout.rows.length && accumulated + rowLayout.rows[start].height < scrollTop) {
            accumulated += rowLayout.rows[start].height;
            start++;
        }

        // Apply upward overscan
        const overscanStart = Math.max(0, start - OVERSCAN_ROWS);

        // Calculate how many rows to show (including downward buffer)
        let count = 0;

        // We calculate from overscanStart to ensure we cover the whole required area
        let currentIdx = overscanStart;
        let runningHeight = 0;
        const targetVisibleHeight = containerHeight + (scrollTop - accumulated) + VIEWPORT_BUFFER;

        while (currentIdx < rowLayout.rows.length && runningHeight < targetVisibleHeight) {
            runningHeight += rowLayout.rows[currentIdx].height;
            currentIdx++;
            count++;
        }

        return { startIndex: overscanStart, totalRows: count + OVERSCAN_ROWS };
    }, [rowLayout.rows, scrollTop, containerHeight]);

    const visibleRows = useMemo(() => {
        const rowsIdx = [];
        let i = 0;
        while (i < totalRows && startIndex + i < rowLayout.rows.length) {
            rowsIdx.push(startIndex + i);
            i++;
        }
        return rowsIdx;
    }, [startIndex, totalRows, rowLayout]);

    const cdsContinuations = useMemo(() => getVisibleCdsContinuations(
        sequenceData.sequence, sequenceData.topology, annotations,
        startIndex * charsPerRow, (startIndex + totalRows) * charsPerRow
    ), [sequenceData.sequence, sequenceData.topology, annotations, startIndex, totalRows, charsPerRow]);

    // 4. Dedicated Translation Effect (Independent of viewport fetch)
    useEffect(() => {
        let cancelled = false;
        const updateTranslations = async () => {
            const viewportAnns = annotations.filter(ann => {
                if (ann.type !== 'CDS') return false;
                // Basic viewport filtering to avoid over-translating
                const rowStartIdx = startIndex * charsPerRow;
                const rowEndIdx = (startIndex + totalRows) * charsPerRow;
                if (ann.start <= ann.end) {
                    return ann.start < rowEndIdx && ann.end > rowStartIdx;
                } else {
                    return (rowStartIdx < ann.end) || (rowStartIdx >= ann.start) || (rowEndIdx > ann.start) || (rowEndIdx <= ann.end);
                }
            });

            if (viewportAnns.length > 0) {
                const trans = await api.translateAnnotations(sequenceData.sequence, viewportAnns);
                if (cancelled) return;

                setCdsTranslations(prev => {
                    const next = { ...prev };
                    let changed = false;
                    trans.forEach(([id, aa]) => {
                        if (next[id] !== aa) {
                            next[id] = aa;
                            changed = true;
                        }
                    });
                    return changed ? next : prev;
                });
            }
        };

        updateTranslations();
        return () => { cancelled = true; };
    }, [annotations, sequenceData.sequence, startIndex, totalRows, charsPerRow, mutationCount]);

    // 5. Main View Data Effect (Scrolling & Layout)
    useEffect(() => {
        let cancelled = false;
        const fetchDetailedData = async () => {
            try {
                const startIdx = Math.max(0, startIndex * charsPerRow - 100);
                const endIdx = (startIndex + totalRows) * charsPerRow + 100;

                const viewData = await api.getSequenceViewData(sequenceData.id, startIdx, endIdx);
                if (cancelled) return;

                // Helper to slice 1D view data into 1D row data
                const sliceRowData = (v: any, rs: number, len: number) => ({
                    bases: v.bases.slice(rs - startIdx, rs - startIdx + len),
                    annotations: v.annotations.filter((a: any) => a.type !== 'source' && a.start < rs + len && a.end > rs),
                    enzymes: v.enzymes.filter((e: any) => e.position >= rs && e.position < rs + len),
                    primers: v.primers.filter((p: any) => primerHasBasesInRow(p, rs, rs + len))
                });

                // 1. Populate the new sequence cache FIRST (synchronously)
                const newSequenceCache = new Map<number, string>();
                for (let i = 0; i < totalRows; i++) {
                    const rowIndex = startIndex + i;
                    const rowStartIndex = rowIndex * charsPerRow;
                    const rowData = sliceRowData(viewData, rowStartIndex, charsPerRow);
                    newSequenceCache.set(rowIndex, rowData.bases);
                }

                // 2. Immutably update the sequence cache to guarantee a re-render
                if (newSequenceCache.size > 0) {
                    setSequenceCache(prev => {
                        const next = new Map(prev);
                        newSequenceCache.forEach((bases, idx) => next.set(idx, bases));
                        return next;
                    });
                }

                // 3. Update rows using functional update to get freshest layout state
                setRowLayout(prev => {
                    const newRows = [...prev.rows];
                    let totalDelta = 0;
                    let lastUpdatedIdx = -1;

                    for (let i = 0; i < totalRows; i++) {
                        const rowIndex = startIndex + i;
                        if (rowIndex >= newRows.length) break;

                        const rowStartIndex = rowIndex * charsPerRow;
                        const rowData = sliceRowData(viewData, rowStartIndex, charsPerRow);
                        const oldMetric = newRows[rowIndex];
                        
                        const metrics = calculateRowLayout(rowData, rowStartIndex, charsPerRow, charWidth, settings, oldMetric.offset + totalDelta);
                        newRows[rowIndex] = metrics;
                        totalDelta += metrics.height - oldMetric.height;
                        lastUpdatedIdx = rowIndex;
                    }

                    if (lastUpdatedIdx < 0) return prev;

                    // Shift subsequent rows
                    if (totalDelta !== 0) {
                        for (let j = lastUpdatedIdx + 1; j < newRows.length; j++) {
                            if (newRows[j]) {
                                newRows[j] = { ...newRows[j], offset: newRows[j].offset + totalDelta };
                            }
                        }
                    }

                    return { rows: newRows, totalHeight: prev.totalHeight + totalDelta };
                });
            } catch (e) {
                if (!cancelled) console.error("View data fetch failed:", e);
            }
        };

        const timer = setTimeout(fetchDetailedData, isInitialLoad.current ? 0 : 60);
        isInitialLoad.current = false;

        return () => {
            cancelled = true;
            clearTimeout(timer);
        };
    }, [startIndex, totalRows, sequenceData.id, charsPerRow, settings, mutationCount]);

    // 5. Global Event Listener for Mutations
    useEffect(() => {
        const unlisten = (async () => {
            return await listen('sequence-mutated', () => {
                setSequenceCache(new Map());
                setMutationCount(c => c + 1);
            });
        })();
        return () => { unlisten.then(u => u()); };
    }, []);

    // 6. Scroll to selection on lastJumpTime change (Search jump / navigation)
    useEffect(() => {
        if (!lastJumpTime || lastJumpTime === handledJumpTimeRef.current || !selection || !containerRef.current) return;

        const targetRowIdx = Math.floor(selection.start / charsPerRow);
        const row = rowLayout.rows[targetRowIdx];
        if (!row) return;

        const targetScrollTop = Math.max(0, row.offset - containerHeight / 3);
        handledJumpTimeRef.current = lastJumpTime;
        containerRef.current.scrollTo({
            top: targetScrollTop,
            behavior: 'smooth'
        });
    }, [lastJumpTime, selection, charsPerRow, rowLayout.rows, containerHeight]);


    const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => setScrollTop(e.currentTarget.scrollTop), []);

    const handleMouseDown = useCallback((index: number, shift: boolean = false, isFragment: boolean = false) => {
        setIsDragging(true);
        if (shift && selection) {
            onSelectionChange({ ...selection, end: index, isFragment: isFragment || selection.isFragment });
        } else {
            onSelectionChange({ start: index, end: index, isFragment });
        }
    }, [selection, onSelectionChange]);

    const handleMouseEnter = useCallback((index: number) => {
        if (isDragging && selection) {
            // Dragging usually implies text-like selection intent, 
            // but we preserve the fragment intent if it was explicitly started from an enzyme
            onSelectionChange({ ...selection, end: index });
        }
    }, [isDragging, selection, onSelectionChange]);

    const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
        if ((e.metaKey || e.ctrlKey) && e.key === 'c') { e.preventDefault(); onCopy?.(); }
        if ((e.metaKey || e.ctrlKey) && e.key === 'v') { e.preventDefault(); onPaste?.(); }
        if ((e.metaKey || e.ctrlKey) && e.key === 'x') { e.preventDefault(); onCut?.(); }
        if ((e.metaKey || e.ctrlKey) && e.key === 'a') { e.preventDefault(); onSelectAll?.(); }

        // DNA Character Input
        if (/^[atcgn]$/i.test(e.key) && !e.metaKey && !e.ctrlKey && !e.altKey) {
            if (useUiStore.getState().selectedFeatureId) {
                e.preventDefault();
                return;
            }
            if (selection) {
                e.preventDefault();
                const s = Math.min(selection.start, selection.end);
                const len = Math.abs(selection.start - selection.end);
                onEdit(s, len, e.key.toUpperCase());
            }
        }

        if (e.key === 'Backspace' || e.key === 'Delete') {
            if (useUiStore.getState().selectedFeatureId) {
                e.preventDefault();
                return;
            }
            if (selection && selection.start !== selection.end) {
                e.preventDefault();
                const s = Math.min(selection.start, selection.end);
                const len = Math.abs(selection.start - selection.end);
                onEdit(s, len, '');
            }
        }
    }, [selection, onCopy, onPaste, onCut, onSelectAll, onEdit]);

    useEffect(() => {
        const handleGlobalMouseUp = () => setIsDragging(false);
        window.addEventListener('mouseup', handleGlobalMouseUp);
        return () => window.removeEventListener('mouseup', handleGlobalMouseUp);
    }, []);


    return (
        <div
            className="sequence-viewer-wrapper"
            ref={containerRef}
            onScroll={handleScroll}
            onKeyDown={handleKeyDown}
            tabIndex={0}
            onContextMenu={onContextMenu}
            style={{
                flexGrow: 1, overflowY: 'auto', outline: 'none', background: 'var(--bg-app)',
                position: 'relative'
            }}
        >
            <div style={{ position: 'sticky', top: 0, zIndex: 10, background: 'var(--bg-app)' }}>
                <LinearMiniMap
                    sequenceLength={sequenceData.sequence.length}
                    selection={selection}
                    viewportRange={visibleRows.length > 0 ? {
                        start: visibleRows[0] * charsPerRow,
                        end: (visibleRows[visibleRows.length - 1] + 1) * charsPerRow
                    } : null}
                    onJumpTo={(pos) => onSelectionChange({ start: pos, end: pos })}
                    annotations={annotations}
                    isDark={isDark}
                />
            </div>

            <div className="sequence-rows-container" style={{ height: `${rowLayout.totalHeight}px`, position: 'relative', width: '100%' }}>
                <SequenceViewportCanvas
                    visibleRows={visibleRows}
                    rowLayoutRows={rowLayout.rows}
                    sequenceCache={sequenceCache}
                    charsPerRow={charsPerRow}
                    charWidth={charWidth}
                    settings={settings}
                    isDark={isDark}
                    scrollTop={scrollTop}
                    containerHeight={containerHeight}
                    viewportWidth={containerRef.current?.clientWidth || 800}
                    totalHeight={rowLayout.totalHeight}
                />
                {visibleRows.map((rowIndex) => {
                    const row = rowLayout.rows[rowIndex];
                    if (!row) return null;
                    const rowStartIndex = rowIndex * charsPerRow;
                    const rowStr = sequenceCache.get(rowIndex) || " ".repeat(charsPerRow);
                    return (
                        <div key={rowIndex} style={{ position: 'absolute', top: `${row.offset}px`, left: 0, right: 0 }}>
                            <SequenceRow
                                rowStr={rowStr}
                                rowStartIndex={rowStartIndex}
                                restrictionSites={filteredSites}
                                selection={selection}
                                annotations={annotations}
                                primers={primers}
                                annotationTracks={annotationTracks}
                                cdsTranslations={cdsTranslations}
                                cdsContinuations={cdsContinuations}
                                sequenceLength={sequenceData.sequence.length}
                                onMouseDown={handleMouseDown}
                                onMouseEnter={handleMouseEnter}
                                onSelectionChange={onSelectionChange}
                                onClickAnnotation={(ann) => {
                                    useUiStore.getState().setSelectedFeatureId(ann.id);
                                    containerRef.current?.focus();
                                }}
                                onDoubleClickAnnotation={onEditAnnotation}
                                onDoubleClickPrimer={onEditPrimer}
                                hoveredEnzyme={hoveredEnzyme || null}
                                onHoverEnzyme={onHoverEnzyme}
                                hoveredPrimer={hoveredPrimer || null}
                                onHoverPrimer={onHoverPrimer}
                                hoveredAnnotation={hoveredAnnotation || null}
                                onHoverAnnotation={onHoverAnnotation || (() => { })}
                                onHoverPos={setHoverPos}
                                isFirstRow={rowIndex === 0}
                                isLastRow={rowIndex === rowLayout.rows.length - 1}
                                charWidth={charWidth}
                                settings={settings}
                                rowMetrics={row}
                                isDark={isDark}
                                charsPerRow={charsPerRow}
                                enzymeCounts={enzymeCounts}
                            />
                        </div>
                    );
                })}
            </div>

            {hoveredPrimer && hoverPos && (
                <div
                    style={{
                        position: 'fixed', left: hoverPos.x + 15, top: hoverPos.y + 15, zIndex: 1000,
                        background: isDark ? 'rgba(30, 41, 59, 0.95)' : 'rgba(255, 255, 255, 0.95)',
                        backdropFilter: 'blur(8px)',
                        border: '1px solid var(--border)',
                        borderRadius: '12px',
                        padding: '12px',
                        boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
                        minWidth: '240px',
                        pointerEvents: 'none',
                        fontSize: '13px'
                    }}
                >
                    <div style={{ fontWeight: 800, color: 'var(--text-main)', marginBottom: '4px', display: 'flex', justifyContent: 'space-between' }}>
                        <span>{hoveredPrimer.name}</span>
                        <span style={{ color: 'var(--text-muted)', fontSize: '11px' }}>{hoveredPrimer.sequence.length} bp</span>
                    </div>
                    <div style={{
                        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
                        wordBreak: 'break-all',
                        color: 'var(--text-muted)',
                        lineHeight: 1.4,
                        marginBottom: '8px',
                        background: isDark ? 'rgba(0,0,0,0.2)' : 'rgba(0,0,0,0.03)',
                        padding: '6px',
                        borderRadius: '6px'
                    }}>
                        {hoveredPrimer.sequence}
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                            <span style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Type</span>
                            <span style={{ fontWeight: 600 }}>{hoveredPrimer.strand === "Reverse" || hoveredPrimer.strand === -1 ? 'Reverse' : 'Forward'}</span>
                        </div>
                        {hoveredPrimer.tm && (
                            <div style={{ display: 'flex', flexDirection: 'column' }}>
                                <span style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Tm</span>
                                <span style={{ fontWeight: 600, color: '#f43f5e' }}>{hoveredPrimer.tm.toFixed(1)}°C</span>
                            </div>
                        )}
                    </div>
                    <div style={{ marginTop: '8px', color: 'var(--text-muted)', fontSize: '11px' }}>
                        Arrow shows 5' → 3' direction · {hoveredPrimer.tail5?.length || 0} bp 5' tail
                    </div>
                    {hoveredPrimer.mismatches && hoveredPrimer.mismatches.length > 0 && (
                        <div style={{ marginTop: '8px', borderTop: '1px solid var(--border)', paddingTop: '8px' }}>
                            <span style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Mismatches</span>
                            <div style={{ color: '#f59e0b', fontWeight: 600 }}>{hoveredPrimer.mismatches.length} sites</div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
});
