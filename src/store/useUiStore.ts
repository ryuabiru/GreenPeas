/**
 * 学習メモ: 選択範囲、表示モード、検索、モーダル、設定など、UIだけの状態を管理するZustandストア。
 * 処理の位置づけ: コンポーネントやHookから参照・更新され、画面全体で共有される状態の中心になる。
 */

import { create } from 'zustand';
import { Selection, RestrictionSite, AppSettings, AlignmentTrackSettings, Topology, Annotation } from '../types';
import * as api from '../api';
import { readPersistedUiSettings } from './uiSettingsPersistence';

let latestRestrictionSiteReqId = 0;
let latestSearchReqId = 0;
const persistedUiSettings = readPersistedUiSettings();

interface UiStore {
  // Appearance & View
  activeTab: 'sequence' | 'map' | 'alignment';
  darkMode: boolean;
  maxCuts: number;
  appSettings: AppSettings;
  hoveredEnzyme: RestrictionSite | null;
  hoveredPrimer: any | null;
  hoveredAnnotation: Annotation | null;
  restrictionSites: RestrictionSite[];
  alignmentVisibility: Record<string, Record<number, AlignmentTrackSettings>>;
  cloningClipboard: any | null;

  // Selection
  selection: Selection | null;
  selectedFeatureId: string | null;
  lastJumpTime: number;

  // Modals
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
  pendingPaste: { sequence: string, selection: Selection | null, cloningClipboard?: any, options?: any } | null;
  managerInitialTab: 'sets' | 'library' | 'register' | 'import';
  editingId: string | null;

  // Search
  searchQuery: string;
  searchMode: 'dna' | 'protein';
  searchResults: any[];
  searchNotice: string | null;
  currentSearchIdx: number;
  isSearchVisible: boolean;

  // Actions
  setActiveTab: (tab: 'sequence' | 'map' | 'alignment') => void;
  setDarkMode: (dark: boolean | ((prev: boolean) => boolean)) => void;
  setMaxCuts: (cuts: number) => void;
  setHoveredEnzyme: (enzyme: RestrictionSite | null) => void;
  setHoveredPrimer: (primer: any | null) => void;
  setHoveredAnnotation: (ann: Annotation | null) => void;
  setSelection: (selection: Selection | null | ((prev: Selection | null) => Selection | null)) => void;
  setSelectedFeatureId: (id: string | null) => void;
  setLastJumpTime: (time: number) => void;
  setAppSettings: (settings: AppSettings) => void;
  setAlignmentVisibility: (sequenceId: string, visibility: Record<number, AlignmentTrackSettings> | ((prev: Record<number, AlignmentTrackSettings>) => Record<number, AlignmentTrackSettings>)) => void;

  // Modal Actions
  openModal: (modal: keyof UiStore['modals'], editingId?: string) => void;
  closeModal: (modal: keyof UiStore['modals']) => void;
  setCloningClipboard: (clipboard: any | null) => void;

  // Search Actions (Migrated from useSequenceSearch)
  setSearchVisible: (visible: boolean) => void;
  setSearchQuery: (query: string) => void;
  setSearchMode: (mode: 'dna' | 'protein') => void;
  handleSearch: (currentSequence: any, query: string, modeOverride?: 'dna' | 'protein') => Promise<void>;
  nextSearchHit: () => void;
  prevSearchHit: () => void;

  // Site Actions
  findRestrictionSites: (sequence: string, topology: Topology) => Promise<void>;
  setManagerInitialTab: (tab: 'sets' | 'library' | 'register' | 'import') => void;
  setPendingPaste: (data: UiStore['pendingPaste']) => void;
}

export const useUiStore = create<UiStore>((set, get) => ({
  // State
  activeTab: 'sequence',
  darkMode: persistedUiSettings.darkMode,
  maxCuts: 3,
  appSettings: persistedUiSettings.appSettings,
  hoveredEnzyme: null,
  hoveredPrimer: null,
  hoveredAnnotation: null,
  restrictionSites: [],
  alignmentVisibility: {},
  cloningClipboard: null,
  selection: null,
  selectedFeatureId: null,
  lastJumpTime: 0,
  modals: {
    annotation: false,
    settings: false,
    about: false,
    bugReport: false,
    newSequence: false,
    editConfirmation: false,
    enzymeManager: false,
    primer: false,
    pasteConfirmation: false
  },
  pendingPaste: null,
  managerInitialTab: 'sets',
  editingId: null,
  searchQuery: "",
  searchMode: 'dna',
  searchResults: [],
  searchNotice: null,
  currentSearchIdx: -1,
  isSearchVisible: false,

  // Actions
  setActiveTab: (activeTab) => set({ activeTab, selectedFeatureId: null }),
  setDarkMode: (dark) => set((state) => ({ 
    darkMode: typeof dark === 'function' ? dark(state.darkMode) : dark 
  })),
  setMaxCuts: (maxCuts) => set({ maxCuts }),
  setHoveredEnzyme: (hoveredEnzyme) => set({ hoveredEnzyme }),
  setHoveredPrimer: (hoveredPrimer) => set({ hoveredPrimer }),
  setHoveredAnnotation: (hoveredAnnotation) => set({ hoveredAnnotation }),
  setSelection: (selection) => set((state) => ({ 
    selection: typeof selection === 'function' ? selection(state.selection) : selection,
    selectedFeatureId: null,
  })),
  setSelectedFeatureId: (selectedFeatureId) => set({ selectedFeatureId }),
  setLastJumpTime: (lastJumpTime) => set({ lastJumpTime }),
  setAppSettings: (appSettings) => set({ appSettings }),
  
  setAlignmentVisibility: (sequenceId, v) => set((state) => ({
    alignmentVisibility: {
      ...state.alignmentVisibility,
      [sequenceId]: typeof v === 'function' ? v(state.alignmentVisibility[sequenceId] || {}) : v
    }
  })),

  openModal: (modal, editingId) => set((state) => ({
    modals: { ...state.modals, [modal]: true },
    editingId: editingId || state.editingId
  })),
  closeModal: (modal) => set((state) => ({
    modals: { ...state.modals, [modal]: false },
    editingId: modal === 'annotation' ? null : state.editingId
  })),
  setCloningClipboard: (cloningClipboard) => set({ cloningClipboard }),

  // Search Logic
  setSearchVisible: (isSearchVisible) => set({ isSearchVisible }),
  setSearchQuery: (searchQuery) => set({ searchQuery }),
  setSearchMode: (searchMode) => set({ searchMode }),

  handleSearch: async (currentSequence, query, modeOverride) => {
    const reqId = ++latestSearchReqId;
    const mode = modeOverride || get().searchMode;
    set({ searchQuery: query });
    if (!currentSequence || !query) {
      set({ searchResults: [], currentSearchIdx: -1, searchNotice: null });
      return;
    }
    try {
      let results: any[] = [];
      if (mode === 'dna') {
        results = await api.searchSequence(currentSequence.sequence, query, currentSequence.topology);
      } else {
        results = await api.searchProtein(currentSequence.sequence, query, currentSequence.annotations || []);
      }
      if (reqId === latestSearchReqId) {
          set({ searchResults: results, searchNotice: results.length >= 10_000
            ? 'Showing the first 10,000 matches. Use a longer query to narrow the search.'
            : null });
          if (results.length > 0) {
            set({ currentSearchIdx: 0, selection: { start: results[0].start, end: results[0].end }, lastJumpTime: Date.now() });
          } else {
            set({ currentSearchIdx: -1 });
          }
      }
    } catch (e) {
      console.error("Search failed:", e);
      if (reqId === latestSearchReqId) {
        set({ searchResults: [], currentSearchIdx: -1,
          searchNotice: 'Search failed. Try a different query.' });
      }
    }
  },

  nextSearchHit: () => {
    const { searchResults, currentSearchIdx } = get();
    if (searchResults.length === 0) return;
    const nextIdx = (currentSearchIdx + 1) % searchResults.length;
    const hit = searchResults[nextIdx];
    set({ currentSearchIdx: nextIdx, selection: { start: hit.start, end: hit.end }, lastJumpTime: Date.now() });
  },

  prevSearchHit: () => {
    const { searchResults, currentSearchIdx } = get();
    if (searchResults.length === 0) return;
    const prevIdx = (currentSearchIdx - 1 + searchResults.length) % searchResults.length;
    const hit = searchResults[prevIdx];
    set({ currentSearchIdx: prevIdx, selection: { start: hit.start, end: hit.end }, lastJumpTime: Date.now() });
  },

  findRestrictionSites: async (sequence, topology) => {
    const reqId = ++latestRestrictionSiteReqId;
    const { maxCuts } = get();
    try {
      const sites = await api.findRestrictionSites(
        sequence.toUpperCase(), 
        topology, 
        maxCuts < 1000 ? maxCuts : null
      );
      if (reqId === latestRestrictionSiteReqId) {
          set({ restrictionSites: sites });
      }
    } catch (e) { console.error(e); }
  },
  setManagerInitialTab: (managerInitialTab) => set({ managerInitialTab }),
  setPendingPaste: (pendingPaste) => set({ pendingPaste })
}));
