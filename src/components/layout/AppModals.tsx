/**
 * 学習メモ: アプリの主要レイアウト内でAppModals領域を構成し、ストアの状態とユーザー操作を接続するReactコンポーネント。
 * 処理の位置づけ: 親コンポーネントからデータとコールバックを受け取り、描画と操作通知を担当する。
 */

import React from 'react';
import { AnnotationModal } from '../modals/AnnotationModal';
import { SettingsModal } from '../modals/SettingsModal';
import { SequenceEditModal } from '../modals/SequenceEditModal';
import { NewSequenceModal } from '../modals/NewSequenceModal';
import { AboutModal } from '../modals/AboutModal';
import { RestrictionManagerModal } from '../modals/RestrictionManager/RestrictionManagerModal';
import { PrimerModal } from '../modals/PrimerModal';
import { BugReportModal } from '../modals/BugReportModal';
import { SequenceData, Annotation, Primer, AppSettings } from '../../types';
import * as api from '../../api';

interface AppModalsProps {
    modals: {
        annotation: boolean;
        settings: boolean;
        about: boolean;
        bugReport: boolean;
        newSequence: boolean;
        editConfirmation: boolean;
        enzymeManager: boolean;
        primer: boolean;
        pasteConfirmation: boolean;
    };
    closeModal: (modal: any) => void;
    editingId: string | null;
    editingPrimer: Primer | null;
    onClosePrimer: () => void;
    currentSequence: SequenceData | null;
    selection: { start: number, end: number } | null;
    handleSaveFeature: (savedFeature: Annotation, isEdit: boolean) => void;
    handleDeleteFeature: (featureId: string) => Promise<boolean>;
    appSettings: AppSettings;
    setAppSettings: (s: AppSettings) => void;
    pendingEdit: any;
    performEdit: (start: number, len: number, text: string) => void;
    pendingPaste: any;
    executePaste: (data: any) => Promise<void>;
    sequences: SequenceData[];
    setSequences: (seqs: SequenceData[]) => void;
    setCurrentIndex: (idx: number) => void;
    darkMode: boolean;
    activeTab: 'sequence' | 'map' | 'alignment';
}

export const AppModals: React.FC<AppModalsProps> = React.memo(({
    modals, closeModal, editingId, editingPrimer, onClosePrimer, currentSequence, selection,
    handleSaveFeature, handleDeleteFeature, appSettings, setAppSettings,
    pendingEdit, performEdit,
    pendingPaste, executePaste,
    sequences, setSequences, setCurrentIndex, darkMode, activeTab
}) => {
    return (
        <>
            <AnnotationModal 
                isOpen={modals.annotation} 
                onClose={() => closeModal('annotation')} 
                onSave={handleSaveFeature} 
                onDelete={handleDeleteFeature}
                initialFeature={editingId && currentSequence ? currentSequence.annotations?.find(a => a.id === editingId) : null} 
                defaultStart={selection ? Math.min(selection.start, selection.end) : 0} 
                defaultEnd={selection ? Math.max(selection.start, selection.end) : 0} 
            />
            
            <SettingsModal 
                isOpen={modals.settings} 
                onClose={() => closeModal('settings')} 
                settings={appSettings as any} 
                onSave={(s) => { setAppSettings(s as any); closeModal('settings'); }} 
            />
            
            {/* Unified Modal for both manual edits and paste confirmation */}
            <SequenceEditModal 
                isOpen={modals.editConfirmation || modals.pasteConfirmation} 
                onClose={() => {
                    if (modals.editConfirmation) closeModal('editConfirmation');
                    if (modals.pasteConfirmation) closeModal('pasteConfirmation');
                }} 
                onConfirmEdit={(finalSeq) => { 
                    if (modals.editConfirmation && pendingEdit) { 
                        performEdit(pendingEdit.start, pendingEdit.length, finalSeq); 
                        closeModal('editConfirmation'); 
                    } else if (modals.pasteConfirmation && pendingPaste) {
                        executePaste({ ...pendingPaste, sequence: finalSeq });
                        closeModal('pasteConfirmation');
                    }
                }} 
                edit={modals.editConfirmation ? pendingEdit : pendingPaste} 
            />
            
            <NewSequenceModal 
                isOpen={modals.newSequence} 
                onClose={() => closeModal('newSequence')} 
                onCreate={async (name, sequence, topology) => {
                    const baseName = name.trim() || `Untitled_${sequences.length + 1}`;
                    let uniqueName = baseName;
                    let suffix = 2;
                    while (sequences.some(existing => existing.id === uniqueName)) {
                        uniqueName = `${baseName} (${suffix++})`;
                    }
                    const newSeq: SequenceData = { 
                        id: uniqueName,
                        sequence, 
                        topology, 
                        annotations: [], 
                        primers: [],
                        description: null, 
                        alignmentResults: null,
                        trace: null,
                        enzymes: null,
                        enzymeSettings: null,
                        debug_hex: null,
                        file_path: null
                    };
                    const nextSeqs = [...sequences, newSeq];
                    setSequences(nextSeqs);
                    setCurrentIndex(nextSeqs.length - 1);
                    
                    try {
                        await api.upsertSequence(newSeq);
                    } catch (err) {
                        console.error("Failed to sync new sequence to backend:", err);
                    }
                    
                    closeModal('newSequence');
                }} 
                defaultName={`Untitled_${sequences.length + 1}`} 
            />
            
            <AboutModal 
                isOpen={modals.about} 
                onClose={() => closeModal('about')} 
                isDark={darkMode} 
            />

            <RestrictionManagerModal 
                isOpen={modals.enzymeManager} 
                onClose={() => closeModal('enzymeManager')} 
            />

            <PrimerModal 
                isOpen={modals.primer} 
                onClose={onClosePrimer}
                selection={selection}
                initialPrimer={editingPrimer}
            />

            <BugReportModal
                isOpen={modals.bugReport}
                onClose={() => closeModal('bugReport')}
                activeTab={activeTab}
                currentSequenceId={currentSequence?.id || null}
                currentSequenceLength={currentSequence?.sequence.length || 0}
                darkMode={darkMode}
            />
        </>
    );
});
