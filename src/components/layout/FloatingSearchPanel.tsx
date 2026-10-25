/**
 * 学習メモ: アプリの主要レイアウト内でFloatingSearchPanel領域を構成し、ストアの状態とユーザー操作を接続するReactコンポーネント。
 * 処理の位置づけ: 親コンポーネントからデータとコールバックを受け取り、描画と操作通知を担当する。
 */

import React from "react";
import { Search, ChevronUp, ChevronDown, X } from 'lucide-react';

interface FloatingSearchPanelProps {
    isSearchVisible: boolean;
    setIsSearchVisible: (visible: boolean) => void;
    searchMode: 'dna' | 'protein';
    setSearchMode: (mode: 'dna' | 'protein') => void;
    searchQuery: string;
    handleSearch: (query: string, modeOverride?: 'dna' | 'protein') => void;
    searchResults: any[];
    searchNotice: string | null;
    currentSearchIdx: number;
    nextSearchHit: () => void;
    prevSearchHit: () => void;
    searchInputRef: React.RefObject<HTMLInputElement | null>;
}

export const FloatingSearchPanel: React.FC<FloatingSearchPanelProps> = ({
    isSearchVisible,
    setIsSearchVisible,
    searchMode,
    setSearchMode,
    searchQuery,
    handleSearch,
    searchResults,
    searchNotice,
    currentSearchIdx,
    nextSearchHit,
    prevSearchHit,
    searchInputRef
}) => {
    if (!isSearchVisible) return null;

    return (
        <div className="search-bar-floating" style={{
            position: 'fixed',
            top: '80px',
            right: '60px',
            zIndex: 1500,
            backgroundColor: 'var(--bg-sidebar)',
            border: '1px solid var(--border)',
            borderRadius: '12px',
            padding: '8px 12px',
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
            backdropFilter: 'blur(8px)',
            animation: 'slideIn 0.2s ease-out'
        }}>
            <div style={{ display: 'flex', background: 'var(--bg-app)', borderRadius: '6px', padding: '2px', border: '1px solid var(--border)' }}>
                <button 
                    onClick={() => { setSearchMode('dna'); handleSearch(searchQuery, 'dna'); }}
                    style={{ 
                        padding: '2px 8px', fontSize: '0.65rem', borderRadius: '4px', border: 'none', 
                        background: searchMode === 'dna' ? '#3b82f6' : 'transparent', 
                        color: searchMode === 'dna' ? '#fff' : 'var(--text-muted)', 
                        cursor: 'pointer', fontWeight: 600 
                    }}>DNA</button>
                <button 
                    onClick={() => { setSearchMode('protein'); handleSearch(searchQuery, 'protein'); }}
                    style={{ 
                        padding: '2px 8px', fontSize: '0.65rem', borderRadius: '4px', border: 'none', 
                        background: searchMode === 'protein' ? '#10b981' : 'transparent', 
                        color: searchMode === 'protein' ? '#fff' : 'var(--text-muted)', 
                        cursor: 'pointer', fontWeight: 600 
                    }}>Protein</button>
            </div>

            <div style={{ width: '1px', height: '20px', background: 'var(--border)' }} />

            <Search size={16} style={{ color: searchMode === 'protein' ? '#10b981' : 'var(--text-muted)' }} />
            <input
                ref={searchInputRef}
                type="text"
                placeholder="Search sequence..."
                value={searchQuery}
                onChange={(e) => handleSearch(e.target.value)}
                onKeyDown={(e) => {
                    if (e.key === 'Enter') nextSearchHit();
                    if (e.key === 'Escape') setIsSearchVisible(false);
                }}
                style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--text-main)',
                    fontSize: '0.9rem',
                    outline: 'none',
                    width: '200px'
                }}
            />
            
            {searchResults.length > 0 && (
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', minWidth: '60px', textAlign: 'center' }}>
                    {currentSearchIdx + 1} / {searchResults.length}
                </div>
            )}
            {searchNotice && <span role="status" title={searchNotice}
                style={{ maxWidth: 220, color: 'var(--text-muted)', fontSize: '0.7rem' }}>
                {searchNotice}
            </span>}

            <div style={{ display: 'flex', gap: '4px' }}>
                <button onClick={prevSearchHit} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '4px' }}><ChevronUp size={16} /></button>
                <button onClick={nextSearchHit} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '4px' }}><ChevronDown size={16} /></button>
            </div>

            <div style={{ width: '1px', height: '20px', background: 'var(--border)' }} />

            <button 
                onClick={() => { setIsSearchVisible(false); }}
                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '4px' }}
            >
                <X size={16} />
            </button>
        </div>
    );
};
