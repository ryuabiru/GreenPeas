/**
 * 学習メモ: アプリ全体の状態を各ストアから受け取り、ヘッダー、サイドバー、閲覧領域、モーダルを組み立てる最上位Reactコンポーネント。
 * 処理の位置づけ: main.tsxから1度だけ描画され、各ストア・Hook・レイアウト部品を結ぶ画面側の司令塔になる。
 */

import { useState, useEffect, useRef, useCallback } from "react";
import "./App.css";

// Layout Components
import { Sidebar } from "./components/Sidebar";
import { MainHeader } from "./components/layout/MainHeader";
import { MainToolbar } from "./components/layout/MainToolbar";
import { MainContextMenu } from "./components/layout/MainContextMenu";
import { FloatingSearchPanel } from "./components/layout/FloatingSearchPanel";
import { WorkspaceViewer } from "./components/layout/WorkspaceViewer";
import { AppModals } from "./components/layout/AppModals";


// Hooks
import { useSequenceStore } from "./store/useSequenceStore";
import { useUiStore } from "./store/useUiStore";
import { useTauriIntegration } from "./hooks/useTauriIntegration";
import { useDerivedSequenceData } from "./hooks/useDerivedSequenceData";
import { ask, open as openDialog, save as saveDialog, message } from "@tauri-apps/plugin-dialog";

// API & Utils
import * as api from "./api";
import { Annotation, Primer, SequenceData } from "./types";
import { ensurePathExtension, stripLastExtension } from "./utils/pathUtils";
import { serializeUiSettings, UI_SETTINGS_STORAGE_KEY } from "./store/uiSettingsPersistence";


function App() {
    const [editingPrimerId, setEditingPrimerId] = useState<string | null>(null);
    // Store selectors
    const currentSequence = useSequenceStore(s => s.getCurrentSequence());
    const sequences = useSequenceStore(s => s.sequences);
    const currentIndex = useSequenceStore(s => s.currentIndex);
    const loading = useSequenceStore(s => s.loading);
    const allTraces = useSequenceStore(s => s.allTraces);
    const allAlignments = useSequenceStore(s => s.allAlignments);
    const history = useSequenceStore(s => s.history);
    const redoStack = useSequenceStore(s => s.redoStack);
    const dirtySequenceIds = useSequenceStore(s => s.dirtySequenceIds);
    const saveState = useSequenceStore(s => s.saveState);

    const activeTab = useUiStore(s => s.activeTab);
    const selection = useUiStore(s => s.selection);
    const darkMode = useUiStore(s => s.darkMode);
    const maxCuts = useUiStore(s => s.maxCuts);
    const restrictionSites = useUiStore(s => s.restrictionSites);
    const appSettings = useUiStore(s => s.appSettings);
    const modals = useUiStore(s => s.modals);
    const alignmentVisibility = useUiStore(s => s.alignmentVisibility);
    const searchResults = useUiStore(s => s.searchResults);
    const searchNotice = useUiStore(s => s.searchNotice);
    const pendingPaste = useUiStore(s => s.pendingPaste);
    const searchQuery = useUiStore(s => s.searchQuery);
    const searchMode = useUiStore(s => s.searchMode);
    const currentSearchIdx = useUiStore(s => s.currentSearchIdx);
    const isSearchVisible = useUiStore(s => s.isSearchVisible);
    const hoveredEnzyme = useUiStore(s => s.hoveredEnzyme);
    const hoveredPrimer = useUiStore(s => s.hoveredPrimer);
    const hoveredAnnotation = useUiStore(s => s.hoveredAnnotation);
    const lastJumpTime = useUiStore(s => s.lastJumpTime);
    const editingId = useUiStore(s => s.editingId);
    const cloningClipboard = useUiStore(s => s.cloningClipboard);

    const setDarkMode = useUiStore(s => s.setDarkMode);
    const setSelection = useUiStore(s => s.setSelection);
    const setMaxCuts = useUiStore(s => s.setMaxCuts);
    const setHoveredEnzyme = useUiStore(s => s.setHoveredEnzyme);
    const setHoveredPrimer = useUiStore(s => s.setHoveredPrimer);
    const setHoveredAnnotation = useUiStore(s => s.setHoveredAnnotation);
    const setAppSettings = useUiStore(s => s.setAppSettings);
    const setAlignmentVisibility = useUiStore(s => s.setAlignmentVisibility);
    const openModal = useUiStore(s => s.openModal);
    const closeModal = useUiStore(s => s.closeModal);
    const findRestrictionSites = useUiStore(s => s.findRestrictionSites);
    const setActiveTab = useUiStore(s => s.setActiveTab);
    const setSearchVisible = useUiStore(s => s.setSearchVisible);
    const setSearchMode = useUiStore(s => s.setSearchMode);
    const handleSearch = useUiStore(s => s.handleSearch);
    const nextSearchHit = useUiStore(s => s.nextSearchHit);
    const prevSearchHit = useUiStore(s => s.prevSearchHit);

    const setCurrentIndex = useSequenceStore(s => s.setCurrentIndex);
    const setLoading = useSequenceStore(s => s.setLoading);
    const setSequences = useSequenceStore(s => s.setSequences);
    const loadFile = useSequenceStore(s => s.loadFile);
    const saveFile = useSequenceStore(s => s.saveFile);
    const undo = useSequenceStore(s => s.undo);
    const redo = useSequenceStore(s => s.redo);
    const performEdit = useSequenceStore(s => s.performEdit);
    const cutSelection = useSequenceStore(s => s.cutSelection);
    const executePaste = useSequenceStore(s => s.executePaste);
    const deleteSelection = useSequenceStore(s => s.deleteSelection);
    const handlePaste = useSequenceStore(s => s.handlePaste);
    const reverseComplementSelection = useSequenceStore(s => s.reverseComplementSelection);
    const deleteSequence = useSequenceStore(s => s.deleteSequence);
    const copyAsAAToClipboard = useSequenceStore(s => s.copyAsAAToClipboard);
    const setTrace = useSequenceStore(s => s.setTrace);
    const deleteAlignmentResult = useSequenceStore(s => s.deleteAlignmentResult);

    // Local UI state
    const [contextMenu, setContextMenu] = useState<{ x: number, y: number, visible: boolean } | null>(null);
    const [isExportMenuOpen, setIsExportMenuOpen] = useState(false);
    const [isPasteMenuOpen, setIsPasteMenuOpen] = useState(false);

    const [pendingEdit, setPendingEdit] = useState<any>(null);

    const searchInputRef = useRef<HTMLInputElement>(null);
    const deletingFeatureRef = useRef(false);

    // Derived Data (extracted logic)
    const { enzymeCounts, annotationTracks, selectionInfo } = useDerivedSequenceData(
        currentSequence,
        selection,
        restrictionSites
    );

    // Tauri Integration Hook
    useTauriIntegration();

    // Event Handlers
    const copySelection = useCallback(async () => {
        await useSequenceStore.getState().copyToClipboard(selection);
    }, [selection]);

    const copyAsAA = useCallback(async () => {
        await copyAsAAToClipboard(selection);
    }, [selection, copyAsAAToClipboard]);

    const runAlignment = useCallback(async (append = false) => {
        if (!currentSequence) return;
        try {
            const selected = await openDialog({
                multiple: true,
                filters: [{ name: 'Sequence Files', extensions: ['fasta', 'fa', 'dna', 'ab1', 'gbk', 'gb', 'gp'] }]
            });
            if (selected && Array.isArray(selected)) {
                setLoading(true);
                const allResults: any[] = [];
                const failedFiles: string[] = [];

                for (const path of selected) {
                    const filename = path.split(/[/\\]/).pop() || path;
                    try {
                        const content: SequenceData[] = await api.listAllSequences(path);
                        let fileHasSuccess = false;
                        for (const q of content) {
                            try {
                                const results: any[] = await api.alignSequences(currentSequence.sequence, q.sequence);
                                if (results && results.length > 0) {
                                    const sampleFilePath = q.file_path || path;
                                    const sampleLabel = sampleFilePath
                                        ? stripLastExtension(sampleFilePath.split(/[/\\]/).pop() || sampleFilePath)
                                        : stripLastExtension(q.id || filename);
                                    const compactData: SequenceData = {
                                        id: sampleLabel,
                                        description: q.description ?? null,
                                        sequence: q.sequence,
                                        annotations: [],
                                        primers: [],
                                        topology: q.topology || 'Linear',
                                        trace: null,
                                        enzymes: null,
                                        enzymeSettings: null,
                                        alignmentResults: null,
                                        debug_hex: null,
                                        file_path: sampleFilePath
                                    };
                                    results.forEach(res => allResults.push({ ...res, id: sampleLabel, data: compactData }));
                                    fileHasSuccess = true;
                                }
                            } catch (e) {
                                console.error(e);
                            }
                        }
                        if (!fileHasSuccess) {
                            failedFiles.push(filename);
                        }
                    } catch (err) {
                        console.error(err);
                        failedFiles.push(filename);
                    }
                }

                if (allResults.length === 0) {
                    const errorMsg = failedFiles.length > 0
                        ? `Alignment failed for all selected files:\n${failedFiles.join('\n')}\n\nThis might be due to poor sequence quality, short read length, or mismatch with the reference.`
                        : "No significant alignments found. This might be due to poor sequence quality, short read length, or mismatch with the reference.";
                    await message(errorMsg, { title: "Alignment Failed", kind: "error" });
                    setLoading(false);
                    return;
                }

                if (failedFiles.length > 0) {
                    await message(
                        `Some files could not be aligned:\n${failedFiles.join('\n')}\n\nThese samples will not be shown in the alignment view.`,
                        { title: "Alignment Warning", kind: "warning" }
                    );
                }

                const existingResults = append ? (allAlignments[currentSequence.id] || []) : [];
                const mergedResults = append
                    ? (() => {
                        const merged = new Map<string, any>();
                        for (const result of existingResults) {
                            const sampleKey = result?.data?.file_path || result?.data?.id || result?.id || 'unknown';
                            const strandKey = result?.strand || 'unknown';
                            merged.set(`${sampleKey}::${strandKey}`, result);
                        }
                        for (const result of allResults) {
                            const sampleKey = result?.data?.file_path || result?.data?.id || result?.id || 'unknown';
                            const strandKey = result?.strand || 'unknown';
                            merged.set(`${sampleKey}::${strandKey}`, result);
                        }
                        return Array.from(merged.values());
                    })()
                    : allResults;
                setSequences(sequences.map(s => s.id === currentSequence.id ? { ...s, alignmentResults: mergedResults } : s));
                allAlignments[currentSequence.id] = mergedResults;
                setActiveTab('alignment');
                setLoading(false);
            }
        } catch (err) { console.error(err); setLoading(false); }
    }, [currentSequence, sequences, setLoading, setSequences, setActiveTab, allAlignments]);

    const exportSequence = useCallback(async (format: 'fasta' | 'gbk' | 'gp') => {
        setIsExportMenuOpen(false);
        if (!currentSequence) return;
        try {
            const filterMap = { fasta: { name: 'Fasta', extensions: ['fasta', 'fa'] }, gbk: { name: 'GenBank', extensions: ['gbk', 'gb'] }, gp: { name: 'GreenPeas', extensions: ['gp'] } };
            const baseName = currentSequence.file_path
                ? stripLastExtension(currentSequence.file_path.split(/[/\\]/).pop() || currentSequence.file_path)
                : stripLastExtension(currentSequence.id);
            const selectedPath = await saveDialog({ defaultPath: `${baseName}.${format}`, filters: [filterMap[format]] });
            if (selectedPath) {
                const path = format === 'fasta'
                    ? ensurePathExtension(selectedPath, '.fasta')
                    : ensurePathExtension(selectedPath, `.${format}`);
                if (format === 'fasta') {
                    await api.exportFasta(path, currentSequence.id, currentSequence.description, currentSequence.sequence);
                } else if (format === 'gbk') {
                    await api.exportGbk(path, currentSequence.sequence, currentSequence.annotations || [], currentSequence.primers || [], currentSequence.topology, currentSequence.id, currentSequence.description);
                } else {
                    const fullData = { ...currentSequence, trace: allTraces[currentSequence.id], alignmentResults: allAlignments[currentSequence.id] };
                    await api.exportGp(path, fullData);
                }
            }
        } catch (err: any) {
            console.error(err);
            await message(
                `Export failed.\n${err?.message ?? String(err)}`,
                { title: "Export Error", kind: "error" }
            );
        }
    }, [currentSequence, allTraces, allAlignments]);

    // Appearance Sync Effect
    useEffect(() => {
        document.documentElement.setAttribute('data-theme', darkMode ? 'dark' : 'light');
        localStorage.setItem(UI_SETTINGS_STORAGE_KEY, serializeUiSettings({ darkMode, appSettings }));
    }, [darkMode, appSettings]);

    // Data Sync Effects
    useEffect(() => {
        if (currentSequence) {
            findRestrictionSites(currentSequence.sequence, currentSequence.topology);
        }
    }, [currentSequence?.id, currentSequence?.sequence, currentSequence?.topology, maxCuts, findRestrictionSites]);

    useEffect(() => {
        if (activeTab === 'alignment' && currentSequence) {
            const alignments = allAlignments[currentSequence.id] || [];
            if (alignments.length === 0) {
                setActiveTab('sequence');
            }
        }
    }, [currentIndex, currentSequence, activeTab, allAlignments, setActiveTab]);

    const handleSaveFeature = async (savedFeature: Annotation, isEdit: boolean) => {
        if (!currentSequence) return;
        const anns = currentSequence.annotations || [];
        const updatedAnns = isEdit ? anns.map(a => a.id === savedFeature.id ? savedFeature : a) : [...anns, savedFeature];

        try {
            await api.upsertSequence({
                ...currentSequence,
                annotations: updatedAnns
            });
            useSequenceStore.setState((state) => {
                const index = state.sequences.findIndex((sequence) => sequence.id === currentSequence.id);
                if (index < 0) return state;
                const sequences = [...state.sequences];
                sequences[index] = { ...sequences[index], annotations: updatedAnns };
                return {
                    sequences,
                    dirtySequenceIds: { ...state.dirtySequenceIds, [currentSequence.id]: true },
                    saveState: 'idle',
                };
            });
            closeModal('annotation');
        } catch (err) {
            console.error("Failed to sync sequence annotations to backend:", err);
            await message(
                `Could not save the annotation. Please try again.\n${(err as Error)?.message ?? String(err)}`,
                { title: 'Annotation Error', kind: 'error' }
            );
        }
    };

    const handleDeleteFeature = useCallback(async (featureId: string): Promise<boolean> => {
        if (deletingFeatureRef.current) return false;
        deletingFeatureRef.current = true;
        try {
            await useSequenceStore.getState().waitForPendingEdits();
            const current = useSequenceStore.getState().getCurrentSequence();
            if (!current || !current.annotations.some(annotation => annotation.id === featureId)) return false;

            const annotations = current.annotations.filter(annotation => annotation.id !== featureId);
            await api.upsertSequence({ ...current, annotations });

            const index = useSequenceStore.getState().sequences.findIndex(sequence => sequence.id === current.id);
            if (index < 0) return false;
            useSequenceStore.getState().saveToHistory(index);
            useSequenceStore.setState(state => {
                const sequences = [...state.sequences];
                sequences[index] = { ...sequences[index], annotations };
                return {
                    sequences,
                    dirtySequenceIds: { ...state.dirtySequenceIds, [current.id]: true },
                    saveState: 'idle',
                };
            });
            if (useSequenceStore.getState().getCurrentSequence()?.id === current.id) {
                useUiStore.getState().setSelection(null);
                useUiStore.getState().closeModal('annotation');
            }
            return true;
        } catch (err) {
            console.error('Failed to delete feature:', err);
            await message(
                `Could not delete the feature. Please try again.\n${(err as Error)?.message ?? String(err)}`,
                { title: 'Feature Error', kind: 'error' }
            );
            return false;
        } finally {
            deletingFeatureRef.current = false;
        }
    }, []);

    useEffect(() => {
        const handleFeatureDeleteKey = (event: KeyboardEvent) => {
            if (event.key !== 'Backspace' && event.key !== 'Delete') return;
            if (event.metaKey || event.ctrlKey || event.altKey) return;
            if (!(event.target instanceof Element) || !event.target.closest('.viewer-container')) return;
            if (event.target.closest('button, input, textarea, select, [contenteditable]')) return;
            const ui = useUiStore.getState();
            if (Object.values(ui.modals).some(Boolean) || !ui.selectedFeatureId) return;
            event.preventDefault();
            if (!event.repeat) void handleDeleteFeature(ui.selectedFeatureId);
        };
        window.addEventListener('keydown', handleFeatureDeleteKey);
        return () => window.removeEventListener('keydown', handleFeatureDeleteKey);
    }, [handleDeleteFeature]);

    const toggleTopology = useCallback(async () => {
        await useSequenceStore.getState().waitForPendingEdits();
        const current = useSequenceStore.getState().getCurrentSequence();
        if (!current) return;
        const topology = current.topology === 'Linear' ? 'Circular' : 'Linear';
        try {
            await api.upsertSequence({ ...current, topology });
            useSequenceStore.setState(state => {
                const index = state.sequences.findIndex(sequence => sequence.id === current.id);
                if (index < 0) return state;
                const sequences = [...state.sequences];
                sequences[index] = { ...sequences[index], topology };
                return {
                    sequences,
                    dirtySequenceIds: { ...state.dirtySequenceIds, [current.id]: true },
                    saveState: 'idle'
                };
            });
        } catch (err) {
            await message(`Could not change topology. ${(err as Error)?.message ?? String(err)}`,
                { title: 'Topology Error', kind: 'error' });
        }
    }, []);

    const handleSequenceEdit = useCallback((start: number, len: number, text: string) => {
        setPendingEdit({
            type: len === 0 ? 'insertion' : (text === '' ? 'deletion' : 'substitution'),
            start,
            length: len,
            oldSeq: currentSequence?.sequence.slice(start, start + len) || '',
            newSeq: text
        });
        openModal('editConfirmation');
    }, [performEdit, currentSequence, openModal]);

    const openFilesInNewWindow = useCallback(async () => {
        const selected = await openDialog({
            multiple: true,
            filters: [{
                name: 'Sequence Files',
                extensions: ['fasta', 'fa', 'gbk', 'gb', 'dna', 'ab1', 'gp']
            }]
        });
        if (!selected) return;
        await api.openPathsInNewWindow(Array.isArray(selected) ? selected : [selected]);
    }, []);

    const openSequenceInNewWindow = useCallback(async (index: number, detach: boolean) => {
        const sequence = sequences[index];
        if (!sequence?.file_path) return;
        if (detach) {
            await useSequenceStore.getState().waitForPendingEdits();
            if (useSequenceStore.getState().dirtySequenceIds[sequence.id]) {
                const shouldDetach = await ask(
                    `\"${sequence.id}\" has unsaved changes. Move it to a new window using the last saved file and discard those changes?`,
                    { title: 'Unsaved Changes', kind: 'warning', okLabel: 'Discard and Move', cancelLabel: 'Keep Here' }
                );
                if (!shouldDetach) return;
            }
        }
        await api.openPathsInNewWindow([sequence.file_path]);
        if (detach) {
            const currentIndex = useSequenceStore.getState().sequences.findIndex(item => item.id === sequence.id);
            if (currentIndex >= 0) deleteSequence(currentIndex);
        }
    }, [sequences, deleteSequence]);

    const requestCloseSequence = useCallback(async (index: number) => {
        const sequence = sequences[index];
        if (!sequence) return;
        await useSequenceStore.getState().waitForPendingEdits();
        const currentState = useSequenceStore.getState();
        const currentIndex = currentState.sequences.findIndex(item => item.id === sequence.id);
        if (currentIndex < 0) return;
        if (currentState.dirtySequenceIds[sequence.id]) {
            const shouldClose = await ask(
                `\"${sequence.id}\" has unsaved changes. Close it and discard those changes?`,
                { title: 'Unsaved Changes', kind: 'warning', okLabel: 'Discard Changes', cancelLabel: 'Keep Open' }
            );
            if (!shouldClose) return;
        }
        const finalIndex = useSequenceStore.getState().sequences.findIndex(item => item.id === sequence.id);
        if (finalIndex >= 0) deleteSequence(finalIndex);
    }, [sequences, deleteSequence]);

    const handleEditPrimer = useCallback((primer: Primer) => {
        setEditingPrimerId(primer.id);
        openModal('primer');
    }, [openModal]);

    return (
        <div className="app-container" onClick={() => setContextMenu(null)}>
            <Sidebar
                darkMode={darkMode} setDarkMode={(d) => setDarkMode(d)}
                sequences={sequences} currentIndex={currentIndex} setCurrentIndex={(i) => setCurrentIndex(i)}
                openFile={() => loadFile("")} openFileInNewWindow={openFilesInNewWindow} createNewFile={() => openModal('newSequence')}
                onImportPaths={(paths) => loadFile(paths)}
                onOpenSequenceInNewWindow={openSequenceInNewWindow}
                onOpenSettings={() => openModal('settings')}
                onOpenBugReport={() => openModal('bugReport')}
                onDeleteSequence={(i) => { void requestCloseSequence(i); }}
                activeTab={activeTab}
                alignmentResults={currentSequence ? (allAlignments[currentSequence.id] || []) : []}
                visibility={currentSequence ? (alignmentVisibility[currentSequence.id] || {}) : {}}
                setVisibility={(v) => { if (currentSequence) setAlignmentVisibility(currentSequence.id, v); }}
                onDeleteAlignmentSample={(ridx) => { if (currentSequence) deleteAlignmentResult(currentSequence.id, ridx); }}
                dirtySequenceIds={dirtySequenceIds}
            />

            <div className="main-content">
                <MainHeader
                    currentSequence={currentSequence} activeTab={activeTab} setActiveTab={(t) => setActiveTab(t)}
                    selectionInfo={selectionInfo} allAlignments={allAlignments}
                    onSave={() => { void saveFile().catch(() => {}); }} onExport={exportSequence}
                    onSaveAs={() => { setIsExportMenuOpen(false); void saveFile({ forceSaveAs: true }).catch(() => {}); }}
                    isExportMenuOpen={isExportMenuOpen} setIsExportMenuOpen={setIsExportMenuOpen}
                    isDirty={Boolean(currentSequence && dirtySequenceIds[currentSequence.id])}
                    saveState={saveState}
                />

                {currentSequence && <MainToolbar
                    undo={() => undo()} redo={() => redo()} canUndo={history.length > 0} canRedo={redoStack.length > 0}
                    copySelection={copySelection} handlePaste={(opt) => handlePaste(selection, cloningClipboard, opt)}
                    selection={selection} currentSequence={currentSequence}
                    isPasteMenuOpen={isPasteMenuOpen} setIsPasteMenuOpen={setIsPasteMenuOpen}
                    isSearchVisible={isSearchVisible} setIsSearchVisible={(v) => setSearchVisible(v)}
                    openAddFeatureModal={() => openModal('annotation')}
                    runAlignment={() => runAlignment(false)}
                    addAlignmentSample={() => runAlignment(true)}
                    activeTab={activeTab}
                    hasAlignmentResults={Boolean(currentSequence && (allAlignments[currentSequence.id]?.length || 0) > 0)}
                    searchInputRef={searchInputRef}
                />}

                <WorkspaceViewer
                    activeTab={activeTab}
                    currentSequence={currentSequence} sequences={sequences} selection={selection} setSelection={(s) => setSelection(s)}
                    restrictionSites={restrictionSites} enzymeCounts={enzymeCounts} annotationTracks={annotationTracks}
                    maxCuts={maxCuts} setMaxCuts={(c) => setMaxCuts(c)}
                    currentTopology={currentSequence?.topology || 'Linear'}
                    onToggleTopology={() => { void toggleTopology(); }}
                    appSettings={appSettings} darkMode={darkMode} lastJumpTime={lastJumpTime}
                    hoveredEnzyme={hoveredEnzyme} setHoveredEnzyme={(e) => setHoveredEnzyme(e)}
                    hoveredPrimer={hoveredPrimer} setHoveredPrimer={(p) => setHoveredPrimer(p)}
                    hoveredAnnotation={hoveredAnnotation} onHoverAnnotation={(a) => setHoveredAnnotation(a)}
                    loading={loading} allTraces={allTraces} allAlignments={allAlignments}

                    handleEditAnnotation={(ann) => openModal('annotation', ann.id)}
                    handleEditPrimer={handleEditPrimer}
                    handleSequenceEdit={handleSequenceEdit} handleContextMenu={(e) => { e.preventDefault(); setContextMenu({ x: e.clientX, y: e.clientY, visible: true }); }}
                    handlePaste={() => handlePaste(selection, cloningClipboard)}
                    handleCopy={copySelection} handleCut={() => cutSelection(selection)} handleSelectAll={() => { if (currentSequence) setSelection({ start: 0, end: currentSequence.sequence.length }); }}
                    setAlignmentVisibility={(id, v) => setAlignmentVisibility(id, v)} alignmentVisibility={alignmentVisibility}
                    setAllTraces={(id, t) => setTrace(id, t)}
                    onOpenFile={() => loadFile("")}
                    onCreateSequence={() => openModal('newSequence')}
                />
            </div>

            <MainContextMenu
                contextMenu={contextMenu} closeContextMenu={() => setContextMenu(null)}
                undo={() => undo()} redo={() => redo()} canUndo={history.length > 0} canRedo={redoStack.length > 0}
                createNewFile={() => openModal('newSequence')} saveCurrentFile={() => { void saveFile().catch(() => {}); }}
                cutSelection={() => cutSelection(selection)} copySelection={copySelection} copyAsAA={copyAsAA}
                handlePaste={(opt) => handlePaste(selection, cloningClipboard, opt)} deleteSelection={() => deleteSelection(selection)}
                selectAll={() => { if (currentSequence) setSelection({ start: 0, end: currentSequence.sequence.length }); }}
                selection={selection} reverseComplementSelection={() => reverseComplementSelection(selection)}
                openAddFeatureModal={() => openModal('annotation')}
                handleReverseComplementAction={() => reverseComplementSelection(selection)}
                toggleTopology={() => { void toggleTopology(); }}
                currentSequence={currentSequence} onExport={exportSequence}
                openModal={openModal}
            />

            <FloatingSearchPanel
                isSearchVisible={isSearchVisible} setIsSearchVisible={(v) => setSearchVisible(v)}
                searchMode={searchMode} setSearchMode={(m) => setSearchMode(m)}
                searchQuery={searchQuery}
                handleSearch={(q, m) => handleSearch(currentSequence, q, m)} searchResults={searchResults}
                searchNotice={searchNotice}
                currentSearchIdx={currentSearchIdx} nextSearchHit={() => nextSearchHit()}
                prevSearchHit={() => prevSearchHit()} searchInputRef={searchInputRef}
            />

            <AppModals
                modals={{ ...modals }} closeModal={(m) => closeModal(m)} editingId={editingId}
                editingPrimer={currentSequence?.primers?.find(p => p.id === editingPrimerId) || null}
                onClosePrimer={() => { closeModal('primer'); setEditingPrimerId(null); }}
                currentSequence={currentSequence} selection={selection}
                handleSaveFeature={handleSaveFeature}
                handleDeleteFeature={handleDeleteFeature}
                appSettings={appSettings} setAppSettings={(s) => setAppSettings(s)}
                pendingEdit={pendingEdit} performEdit={(start, len, text) => performEdit(start, len, text)}
                pendingPaste={pendingPaste} executePaste={executePaste}
                sequences={sequences} setSequences={(s) => setSequences(s)}
                setCurrentIndex={(i) => setCurrentIndex(i)} darkMode={darkMode} activeTab={activeTab}
            />


        </div>
    );
}

export default App;
