/**
 * 学習メモ: RestrictionManagerModalダイアログの入力状態、検証、確定・取消操作を担当するReactコンポーネント。
 * 処理の位置づけ: 親コンポーネントからデータとコールバックを受け取り、描画と操作通知を担当する。
 */

import React, { useState, useEffect, useMemo } from 'react';
import { useEnzymeStore } from '../../../store/useEnzymeStore';
import { useUiStore } from '../../../store/useUiStore';
import { 
    Scissors, Search, Trash2, X, 
    BookOpen, Layers, Sparkles, FileUp, 
    ChevronRight, Save, CheckCircle2, ArrowLeft
} from 'lucide-react';
import { VisualCutter } from './VisualCutter';
import './RestrictionManager.css';
import { open } from '@tauri-apps/plugin-dialog';
import { readImportTextFile } from '../../../api';

interface RestrictionManagerModalProps {
    isOpen: boolean;
    onClose: () => void;
}

type Tab = 'sets' | 'library' | 'register' | 'import';

export const RestrictionManagerModal: React.FC<RestrictionManagerModalProps> = ({ isOpen, onClose }) => {
    const { 
        enzymes, enzymeSets, pendingImport,
        loadEnzymes, loadEnzymeSets, addEnzyme, setPendingImport
    } = useEnzymeStore();

    const managerInitialTab = useUiStore(s => s.managerInitialTab);
    const [activeTab, setActiveTab] = useState<Tab>(managerInitialTab);
    const [searchTerm, setSearchTerm] = useState('');
    
    // New Enzyme Form State
    const [editingId, setEditingId] = useState<number | null>(null);
    const [newName, setNewName] = useState('');
    const [newSite, setNewSite] = useState('');
    const [cutTop, setCutTop] = useState(1);
    const [cutBottom, setCutBottom] = useState(5);
    const [methylation, setMethylation] = useState('');
    const [optTemp, setOptTemp] = useState<number | undefined>(37);
    const [incTemp, setIncTemp] = useState<number | undefined>(65);
    const [supplier, setSupplier] = useState('');
    const [notes, setNotes] = useState('');
    
    const [resolvingEnzyme, setResolvingEnzyme] = useState<string | null>(null);
    const [showAdvanced, setShowAdvanced] = useState(false);

    // Create Set State
    const [isCreatingSet, setIsCreatingSet] = useState(false);
    const [newSetName, setNewSetName] = useState('');
    const [selectedEnzymes, setSelectedEnzymes] = useState<string[]>([]);
    const [expandedSetId, setExpandedSetId] = useState<number | null>(null);

    useEffect(() => {
        if (isOpen) {
            loadEnzymes();
            loadEnzymeSets();
            setActiveTab(managerInitialTab);
            setIsCreatingSet(false);
            resetForm();
        }
    }, [isOpen, loadEnzymes, loadEnzymeSets, managerInitialTab]);

    useEffect(() => {
        if (pendingImport) {
            setActiveTab('import');
            setIsCreatingSet(false);
        }
    }, [pendingImport]);

    // Reconciliation logic
    const importStatus = useMemo(() => {
        if (!pendingImport) return [];
        const libraryNames = new Set(enzymes.map(e => e.name));
        return pendingImport.enzymeNames.map(name => ({
            name,
            exists: libraryNames.has(name)
        }));
    }, [pendingImport, enzymes]);

    if (!isOpen) return null;

    const { createEnzymeSet, deleteEnzymeSet, updateEnzyme } = useEnzymeStore.getState();

    const resetForm = () => {
        setEditingId(null);
        setNewName('');
        setNewSite('');
        setCutTop(1);
        setCutBottom(5);
        setMethylation('');
        setOptTemp(37);
        setIncTemp(65);
        setSupplier('');
        setNotes('');
        setShowAdvanced(false);
    };

    const handleCreateSet = async () => {
        if (!newSetName || selectedEnzymes.length === 0) return;
        await createEnzymeSet(newSetName, selectedEnzymes);
        setNewSetName('');
        setSelectedEnzymes([]);
        setIsCreatingSet(false);
        await loadEnzymeSets();
    };

    const handleSaveEnzyme = async () => {
        if (!newName || !newSite) return;
        
        if (editingId) {
            await updateEnzyme(editingId, newName, newSite, cutTop, cutBottom, methylation || undefined, optTemp, incTemp, supplier || undefined, notes || undefined);
        } else {
            await addEnzyme(newName, newSite, cutTop, cutBottom, methylation || undefined, optTemp, incTemp, supplier || undefined, notes || undefined);
        }
        
        resetForm();
        if (resolvingEnzyme) {
            setResolvingEnzyme(null);
        } else {
            setActiveTab('library');
        }
    };

    const handleEditEnzyme = (enzyme: any) => {
        setEditingId(enzyme.id);
        setNewName(enzyme.name);
        setNewSite(enzyme.site);
        setCutTop(enzyme.cut_top);
        setCutBottom(enzyme.cut_bottom);
        setMethylation(enzyme.methylation_sensitivity || '');
        setOptTemp(enzyme.optimal_temp);
        setIncTemp(enzyme.inactivation_temp);
        setSupplier(enzyme.supplier || '');
        setNotes(enzyme.notes || '');
        
        // Auto-expand if there's any metadata
        if (enzyme.methylation_sensitivity || enzyme.optimal_temp || enzyme.inactivation_temp || enzyme.supplier || enzyme.notes) {
            setShowAdvanced(true);
        } else {
            setShowAdvanced(false);
        }
        
        setActiveTab('register');
    };

    const handlePickFile = async () => {
        try {
            const selected = await open({
                multiple: false,
                filters: [{ name: 'Text', extensions: ['txt'] }]
            });
            if (selected && typeof selected === 'string') {
                const content = await readImportTextFile(selected);
                const lines = content.split('\n').map(l => l.trim()).filter(l => l.length > 0);
                if (lines.length > 1) {
                    const setName = lines[0];
                    const enzymeNames = lines.slice(1)
                        .join(',')
                        .split(',')
                        .map(n => n.trim())
                        .filter(n => n.length > 0);
                    setPendingImport({ name: setName, enzymeNames });
                }
            }
        } catch (err) {
            console.error("Failed to pick or read file:", err);
        }
    };

    const handleFinishImport = async () => {
        setPendingImport(null);
        setActiveTab('library');
    };

    const filteredEnzymes = enzymes.filter(e =>
        e.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        e.site.toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
        <div className="rm-modal-overlay">
            <div className="rm-modal-container">
                {/* Header */}
                <div className="rm-header">
                    <div className="rm-header-content">
                        <div className="rm-icon-box">
                            <Scissors size={28} color="white" />
                        </div>
                        <div>
                            <h2 style={{ fontSize: '24px', fontWeight: 900, margin: 0, letterSpacing: '-0.02em' }}>
                                Restriction Manager
                                <span style={{ fontSize: '10px', marginLeft: '12px', padding: '2px 8px', background: 'rgba(255,255,255,0.1)', borderRadius: '10px', verticalAlign: 'middle', color: '#94a3b8' }}>v2.0</span>
                            </h2>
                            <p style={{ fontSize: '14px', color: '#64748b', margin: '4px 0 0' }}>Manage your master library and enzyme sets</p>
                        </div>
                    </div>
                    <button onClick={onClose} style={{ background: 'transparent', padding: '8px', borderRadius: '50%', cursor: 'pointer' }}>
                        <X size={28} color="#64748b" />
                    </button>
                </div>

                {/* Main Content Area */}
                <div className="rm-main">
                    {/* Navigation Sidebar */}
                    {!pendingImport && !isCreatingSet && (
                        <div className="rm-sidebar">
                            <NavButton 
                                active={activeTab === 'sets'} 
                                onClick={() => setActiveTab('sets')} 
                                icon={<Layers size={18} />} 
                                label="Enzyme Sets" 
                                count={enzymeSets.length}
                            />
                            <NavButton 
                                active={activeTab === 'library'} 
                                onClick={() => setActiveTab('library')} 
                                icon={<BookOpen size={18} />} 
                                label="Master Library" 
                                count={enzymes.length}
                            />
                            <NavButton 
                                active={activeTab === 'register'} 
                                onClick={() => setActiveTab('register')} 
                                icon={<Sparkles size={18} />} 
                                label="Register New" 
                            />
                            
                            <div style={{ marginTop: 'auto', padding: '16px', background: 'rgba(255,255,255,0.03)', borderRadius: '16px', border: '1px solid rgba(255,255,255,0.05)' }}>
                                <p style={{ fontSize: '9px', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#475569', marginBottom: '8px' }}>Pro Tip</p>
                                <p style={{ fontSize: '11px', color: '#64748b', margin: 0, lineHeight: 1.4 }}>
                                    Use native menu (Enzymes) for quick access from anywhere.
                                </p>
                            </div>
                        </div>
                    )}

                    {/* Tab Content */}
                    <div className="rm-content">
                        {activeTab === 'sets' && (
                            <div className="rm-section">
                                {isCreatingSet ? (
                                    <div className="animate-in slide-in-from-right-4 duration-300">
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px' }}>
                                            <div>
                                                <h3 style={{ fontSize: '18px', fontWeight: 700, margin: 0 }}>Create New Enzyme Set</h3>
                                                <p style={{ fontSize: '12px', color: '#64748b', margin: '4px 0 0' }}>Select enzymes to group them into a set</p>
                                            </div>
                                            <div style={{ display: 'flex', gap: '12px' }}>
                                                <button 
                                                    onClick={() => setIsCreatingSet(false)}
                                                    style={{ background: 'rgba(255,255,255,0.05)', color: '#94a3b8', cursor: 'pointer' }}
                                                >
                                                    Cancel
                                                </button>
                                                <button 
                                                    onClick={handleCreateSet}
                                                    disabled={!newSetName || selectedEnzymes.length === 0}
                                                    style={{ background: '#3b82f6', opacity: (!newSetName || selectedEnzymes.length === 0) ? 0.3 : 1, cursor: 'pointer' }}
                                                >
                                                    Save Set
                                                </button>
                                            </div>
                                        </div>

                                        <div style={{ marginBottom: '32px' }}>
                                            <label style={{ fontSize: '10px', fontWeight: 900, textTransform: 'uppercase', color: '#64748b', display: 'block', marginBottom: '8px' }}>Set Name</label>
                                            <input 
                                                type="text" 
                                                placeholder="e.g. My Favorites"
                                                className="rm-input"
                                                style={{ paddingLeft: '16px' }}
                                                value={newSetName}
                                                onChange={e => setNewSetName(e.target.value)}
                                            />
                                        </div>

                                        <div style={{ background: '#121212', borderRadius: '24px', border: '1px solid rgba(255,255,255,0.05)', overflow: 'hidden' }}>
                                            <div style={{ padding: '16px 24px', background: 'rgba(255,255,255,0.02)', display: 'flex', gap: '16px', alignItems: 'center' }}>
                                                <Search size={16} color="#64748b" />
                                                <input 
                                                    type="text" 
                                                    placeholder="Search library..." 
                                                    style={{ background: 'transparent', border: 'none', color: 'white', flex: 1, fontSize: '13px', outline: 'none' }}
                                                    onChange={e => setSearchTerm(e.target.value)}
                                                />
                                            </div>
                                            <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
                                                {filteredEnzymes.map(enzyme => (
                                                    <label key={enzyme.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 24px', borderTop: '1px solid rgba(255,255,255,0.03)', cursor: 'pointer' }}>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                                            <input 
                                                                type="checkbox" 
                                                                checked={selectedEnzymes.includes(enzyme.name)}
                                                                onChange={e => {
                                                                    if (e.target.checked) setSelectedEnzymes([...selectedEnzymes, enzyme.name]);
                                                                    else setSelectedEnzymes(selectedEnzymes.filter(n => n !== enzyme.name));
                                                                }}
                                                            />
                                                            <span style={{ fontWeight: 700 }}>{enzyme.name}</span>
                                                            <code style={{ fontSize: '11px', color: '#64748b' }}>{enzyme.site}</code>
                                                        </div>
                                                        <span style={{ fontSize: '10px', color: '#475569' }}>{ (enzyme as any).cut_top }/{ (enzyme as any).cut_bottom }</span>
                                                    </label>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                ) : (
                                    <>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                                            <h3 style={{ fontSize: '18px', fontWeight: 700, margin: 0 }}>Your Enzyme Sets</h3>
                                            <button 
                                                onClick={() => {
                                                    setIsCreatingSet(true);
                                                    setSearchTerm('');
                                                }}
                                                style={{ fontSize: '10px', fontWeight: 900, background: 'transparent', color: '#3b82f6', textTransform: 'uppercase', cursor: 'pointer' }}
                                            >
                                                + Create New Set
                                            </button>
                                        </div>
                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '16px' }}>
                                            {enzymeSets.map(set => {
                                                const isExpanded = expandedSetId === set.id;
                                                const visibleMembers = isExpanded ? set.member_names : set.member_names.slice(0, 12);
                                                const hasMore = set.member_names.length > 12;

                                                return (
                                                    <div key={set.id} className="rm-enzyme-card" style={{ flexDirection: 'column', alignItems: 'flex-start' }}>
                                                        <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', marginBottom: '16px' }}>
                                                            <div>
                                                                <h4 style={{ fontSize: '16px', fontWeight: 700, margin: 0 }}>{set.name}</h4>
                                                                <p style={{ fontSize: '12px', color: '#64748b', margin: '4px 0 0' }}>{set.member_names.length} Enzymes</p>
                                                            </div>
                                                            <button 
                                                                onClick={() => deleteEnzymeSet(set.id)}
                                                                style={{ background: 'rgba(255,255,255,0.05)', padding: '8px', borderRadius: '12px', cursor: 'pointer' }}
                                                            >
                                                                <Trash2 size={16} color="#ef4444" />
                                                            </button>
                                                        </div>
                                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                                                            {visibleMembers.map((m: string) => (
                                                                <span key={m} style={{ fontSize: '10px', padding: '4px 8px', background: 'rgba(255,255,255,0.05)', borderRadius: '6px', color: '#94a3b8' }}>{m}</span>
                                                            ))}
                                                            {hasMore && (
                                                                <button 
                                                                    onClick={() => setExpandedSetId(isExpanded ? null : set.id)}
                                                                    style={{ fontSize: '10px', padding: '4px 8px', background: 'rgba(59, 130, 246, 0.1)', border: '1px solid rgba(59, 130, 246, 0.2)', borderRadius: '6px', color: '#60a5fa', fontWeight: 700, cursor: 'pointer' }}
                                                                >
                                                                    {isExpanded ? 'Show less' : `+${set.member_names.length - 12} more`}
                                                                </button>
                                                            )}
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </>
                                )}
                            </div>
                        )}

                        {activeTab === 'library' && (
                            <>
                                <div className="rm-search-bar">
                                    <div className="rm-input-wrapper">
                                        <input 
                                            type="text" 
                                            placeholder="Search master library..." 
                                            className="rm-input"
                                            value={searchTerm}
                                            onChange={e => setSearchTerm(e.target.value)}
                                        />
                                        <Search size={18} />
                                    </div>
                                    <button 
                                        onClick={handlePickFile}
                                        style={{ background: 'rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}
                                    >
                                        <FileUp size={18} /> Import
                                    </button>
                                </div>
                                <div className="rm-item-list">
                                    {filteredEnzymes.map(enzyme => (
                                        <div key={enzyme.id} className="rm-enzyme-card">
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '24px' }}>
                                                <span style={{ width: '100px', fontWeight: 700 }}>{enzyme.name}</span>
                                                <code style={{ fontSize: '13px', color: '#60a5fa', letterSpacing: '0.1em' }}>{enzyme.site}</code>
                                                <span style={{ fontSize: '10px', padding: '4px 8px', background: 'rgba(255,255,255,0.05)', borderRadius: '6px', color: '#475569', fontWeight: 800 }}>
                                                    {(enzyme as any).cut_top}/{(enzyme as any).cut_bottom}
                                                </span>
                                                {enzyme.optimal_temp && <span style={{ fontSize: '10px', color: '#64748b' }}>{enzyme.optimal_temp}℃</span>}
                                            </div>
                                            <button 
                                                onClick={() => handleEditEnzyme(enzyme)}
                                                style={{ background: 'transparent', cursor: 'pointer' }}
                                            >
                                                <ChevronRight size={18} color="#475569" />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            </>
                        )}

                        {activeTab === 'register' && (
                            <div className="rm-section">
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px' }}>
                                    <h3 style={{ fontSize: '18px', fontWeight: 700, margin: 0 }}>
                                        {editingId ? `Edit Enzyme: ${newName}` : 'Register New Enzyme'}
                                    </h3>
                                    {editingId && (
                                        <button 
                                            onClick={resetForm}
                                            style={{ background: 'transparent', color: '#3b82f6', fontSize: '12px', fontWeight: 700, cursor: 'pointer' }}
                                        >
                                            Switch to New Registration
                                        </button>
                                    )}
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', marginBottom: '24px' }}>
                                    <div>
                                        <label style={{ fontSize: '10px', fontWeight: 900, textTransform: 'uppercase', color: '#64748b', display: 'block', marginBottom: '8px' }}>Enzyme Name</label>
                                        <input 
                                            type="text" 
                                            placeholder="e.g. EcoRI"
                                            className="rm-input"
                                            style={{ paddingLeft: '16px' }}
                                            value={newName}
                                            onChange={e => setNewName(e.target.value)}
                                        />
                                    </div>
                                    <div>
                                        <label style={{ fontSize: '10px', fontWeight: 900, textTransform: 'uppercase', color: '#64748b', display: 'block', marginBottom: '8px' }}>Recognition Sequence</label>
                                        <input 
                                            type="text" 
                                            placeholder="e.g. GAATTC"
                                            className="rm-input"
                                            style={{ paddingLeft: '16px', fontFamily: 'monospace', letterSpacing: '0.1em' }}
                                            value={newSite}
                                            onChange={e => setNewSite(e.target.value.toUpperCase())}
                                        />
                                    </div>
                                </div>

                                {/* Advanced Section Toggle */}
                                <div style={{ marginBottom: '24px' }}>
                                    <button 
                                        onClick={() => setShowAdvanced(!showAdvanced)}
                                        style={{ background: 'transparent', display: 'flex', alignItems: 'center', gap: '8px', color: '#94a3b8', fontSize: '12px', fontWeight: 700, cursor: 'pointer', padding: 0 }}
                                    >
                                        <ChevronRight size={16} style={{ transform: showAdvanced ? 'rotate(90deg)' : 'none', transition: 'transform 0.2s' }} />
                                        Advanced Settings (Metadata)
                                    </button>
                                    
                                    {showAdvanced && (
                                        <div style={{ marginTop: '24px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', padding: '24px', background: 'rgba(255,255,255,0.02)', borderRadius: '16px' }}>
                                            <div>
                                                <label style={{ fontSize: '10px', fontWeight: 900, textTransform: 'uppercase', color: '#64748b', display: 'block', marginBottom: '8px' }}>Methylation Sensitivity</label>
                                                <input type="text" placeholder="e.g. Dam, Dcm" className="rm-input" style={{ paddingLeft: '16px' }} value={methylation} onChange={e => setMethylation(e.target.value)} />
                                            </div>
                                            <div>
                                                <label style={{ fontSize: '10px', fontWeight: 900, textTransform: 'uppercase', color: '#64748b', display: 'block', marginBottom: '8px' }}>Supplier / Lab</label>
                                                <input type="text" placeholder="e.g. NEB" className="rm-input" style={{ paddingLeft: '16px' }} value={supplier} onChange={e => setSupplier(e.target.value)} />
                                            </div>
                                            <div>
                                                <label style={{ fontSize: '10px', fontWeight: 900, textTransform: 'uppercase', color: '#64748b', display: 'block', marginBottom: '8px' }}>Opt. Temp (℃)</label>
                                                <input type="number" className="rm-input" style={{ paddingLeft: '16px' }} value={optTemp} onChange={e => setOptTemp(Number(e.target.value))} />
                                            </div>
                                            <div>
                                                <label style={{ fontSize: '10px', fontWeight: 900, textTransform: 'uppercase', color: '#64748b', display: 'block', marginBottom: '8px' }}>Inactivation Temp (℃)</label>
                                                <input type="number" className="rm-input" style={{ paddingLeft: '16px' }} value={incTemp} onChange={e => setIncTemp(Number(e.target.value))} />
                                            </div>
                                            <div style={{ gridColumn: 'span 2' }}>
                                                <label style={{ fontSize: '10px', fontWeight: 900, textTransform: 'uppercase', color: '#64748b', display: 'block', marginBottom: '8px' }}>Custom Notes</label>
                                                <textarea className="rm-input" style={{ paddingLeft: '16px', height: '80px', resize: 'none' }} value={notes} onChange={e => setNotes(e.target.value)} />
                                            </div>
                                        </div>
                                    )}
                                </div>

                                {newSite.length > 0 && (
                                    <VisualCutter 
                                        sequence={newSite} 
                                        cutTop={cutTop} 
                                        cutBottom={cutBottom} 
                                        onChange={(t, b) => { setCutTop(t); setCutBottom(b); }}
                                    />
                                )}

                                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '40px' }}>
                                    <button 
                                        onClick={handleSaveEnzyme}
                                        disabled={!newName || !newSite}
                                        style={{ 
                                            padding: '16px 32px', 
                                            borderRadius: '16px', 
                                            display: 'flex', 
                                            alignItems: 'center', 
                                            gap: '12px',
                                            cursor: 'pointer',
                                            background: editingId ? '#10b981' : '#3b82f6',
                                            opacity: (!newName || !newSite) ? 0.3 : 1
                                        }}
                                    >
                                        <Save size={18} /> {editingId ? 'Update Enzyme Info' : 'Register to Master Library'}
                                    </button>
                                </div>
                            </div>
                        )}

                        {activeTab === 'import' && pendingImport && (
                            <div className="rm-section">
                                {resolvingEnzyme ? (
                                    <div className="animate-in slide-in-from-right-4 duration-300">
                                        <button 
                                            onClick={() => setResolvingEnzyme(null)}
                                            style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'transparent', color: '#64748b', fontSize: '12px', fontWeight: 700, marginBottom: '24px', cursor: 'pointer' }}
                                        >
                                            <ArrowLeft size={16} /> Back to Reconciliation
                                        </button>
                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', marginBottom: '40px' }}>
                                            <div>
                                                <label style={{ fontSize: '10px', fontWeight: 900, textTransform: 'uppercase', color: '#64748b', display: 'block', marginBottom: '8px' }}>Enzyme Name</label>
                                                <input 
                                                    type="text" 
                                                    readOnly
                                                    className="rm-input"
                                                    style={{ paddingLeft: '16px', opacity: 0.6 }}
                                                    value={newName}
                                                />
                                            </div>
                                            <div>
                                                <label style={{ fontSize: '10px', fontWeight: 900, textTransform: 'uppercase', color: '#64748b', display: 'block', marginBottom: '8px' }}>Recognition Sequence</label>
                                                <input 
                                                    type="text" 
                                                    placeholder="Input sequence for this enzyme"
                                                    className="rm-input"
                                                    style={{ paddingLeft: '16px', fontFamily: 'monospace', letterSpacing: '0.1em' }}
                                                    value={newSite}
                                                    onChange={e => setNewSite(e.target.value.toUpperCase())}
                                                />
                                            </div>
                                        </div>
                                        {newSite.length > 0 && (
                                            <VisualCutter 
                                                sequence={newSite} 
                                                cutTop={cutTop} 
                                                cutBottom={cutBottom} 
                                                onChange={(t, b) => { setCutTop(t); setCutBottom(b); }}
                                            />
                                        )}
                                        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '40px' }}>
                                            <button 
                                                onClick={handleSaveEnzyme}
                                                disabled={!newSite}
                                                style={{ padding: '16px 32px', borderRadius: '16px', display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer' }}
                                            >
                                                <Save size={18} /> Register & Continue
                                            </button>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="animate-in fade-in duration-300">
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px' }}>
                                            <div>
                                                <h3 style={{ fontSize: '18px', fontWeight: 700, margin: 0 }}>Import Reconciliation</h3>
                                                <p style={{ fontSize: '12px', color: '#64748b', margin: '4px 0 0' }}>Confirm all enzymes are in your master library</p>
                                            </div>
                                            <div style={{ display: 'flex', gap: '12px' }}>
                                                <button 
                                                    onClick={() => setPendingImport(null)}
                                                    style={{ background: 'rgba(255,255,255,0.05)', color: '#94a3b8', cursor: 'pointer' }}
                                                >
                                                    Discard
                                                </button>
                                                <button 
                                                    onClick={handleFinishImport}
                                                    style={{ 
                                                        display: 'flex', 
                                                        alignItems: 'center', 
                                                        gap: '8px', 
                                                        background: '#3b82f6',
                                                        cursor: 'pointer' 
                                                    }}
                                                >
                                                    <CheckCircle2 size={18} /> Done
                                                </button>
                                            </div>
                                        </div>

                                        <div style={{ background: '#121212', borderRadius: '24px', border: '1px solid rgba(255,255,255,0.05)', overflow: 'hidden' }}>
                                            <div style={{ padding: '16px 24px', background: 'rgba(255,255,255,0.02)', display: 'flex', justifyContent: 'space-between', fontSize: '10px', fontWeight: 900, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                                                <span>Enzyme Name ({pendingImport.enzymeNames.length})</span>
                                                <span>Status</span>
                                            </div>
                                            <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
                                                {importStatus.map(s => (
                                                    <div key={s.name} style={{ padding: '12px 24px', borderTop: '1px solid rgba(255,255,255,0.03)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                        <span style={{ fontWeight: 700, color: s.exists ? 'white' : '#ef4444' }}>{s.name}</span>
                                                        {s.exists ? (
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#4ade80', fontSize: '11px', fontWeight: 700 }}>
                                                                <CheckCircle2 size={14} /> Ready
                                                            </div>
                                                        ) : (
                                                            <button 
                                                                onClick={() => {
                                                                    setResolvingEnzyme(s.name);
                                                                    setNewName(s.name);
                                                                    setNewSite('');
                                                                }}
                                                                style={{ padding: '6px 12px', background: '#3b82f6', fontSize: '10px', fontWeight: 800, borderRadius: '8px', cursor: 'pointer' }}
                                                            >
                                                                Register Missing
                                                            </button>
                                                        )}
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>

                {/* Footer */}
                {!pendingImport && (
                    <div style={{ padding: '24px 40px', borderTop: '1px solid rgba(255,255,255,0.05)', background: '#1a1a1a', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '9px', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.2em', color: '#475569' }}>
                        <div style={{ display: 'flex', gap: '32px' }}>
                            <span>{enzymes.length} Master Items</span>
                            <span>{enzymeSets.length} Active Sets</span>
                        </div>
                        <span style={{ color: 'rgba(59, 130, 246, 0.4)' }}>GreenPeas Bio-Engineering Console</span>
                    </div>
                )}
            </div>
        </div>
    );
};

const NavButton: React.FC<{ active: boolean, onClick: () => void, icon: React.ReactNode, label: string, count?: number }> = ({ 
    active, onClick, icon, label, count 
}) => (
    <button 
        onClick={onClick}
        className={`rm-nav-item ${active ? 'active' : ''}`}
        style={{ cursor: 'pointer' }}
    >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            {icon}
            <span style={{ fontWeight: 700 }}>{label}</span>
        </div>
        {count !== undefined && <span className="rm-badge">{count}</span>}
    </button>
);
