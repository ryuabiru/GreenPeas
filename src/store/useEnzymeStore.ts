/**
 * 学習メモ: 制限酵素と酵素セットをRust側SQLiteデータベースと同期して管理するZustandストア。
 * 処理の位置づけ: コンポーネントやHookから参照・更新され、画面全体で共有される状態の中心になる。
 */

import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';
import { DbEnzyme } from '../bindings/DbEnzyme';
import { EnzymeSetWithMembers } from '../bindings/EnzymeSetWithMembers';

interface EnzymeState {
    enzymes: DbEnzyme[];
    enzymeSets: EnzymeSetWithMembers[];
    pendingImport: { name: string, enzymeNames: string[] } | null;
    activeSetId: number | null;
    isLoading: boolean;
    error: string | null;

    loadEnzymes: () => Promise<void>;
    loadEnzymeSets: () => Promise<void>;
    toggleEnzyme: (id: number, active: boolean) => Promise<void>;
    addEnzyme: (
        name: string, site: string, cutTop: number, cutBottom: number,
        methylation?: string, optTemp?: number, incTemp?: number, supplier?: string, notes?: string
    ) => Promise<void>;
    updateEnzyme: (
        id: number, name: string, site: string, cutTop: number, cutBottom: number,
        methylation?: string, optTemp?: number, incTemp?: number, supplier?: string, notes?: string
    ) => Promise<void>;
    deleteEnzyme: (id: number) => Promise<void>;
    createEnzymeSet: (name: string, enzymeNames: string[]) => Promise<void>;
    deleteEnzymeSet: (id: number) => Promise<void>;
    setPendingImport: (data: { name: string, enzymeNames: string[] } | null) => void;
}

export const useEnzymeStore = create<EnzymeState>((set, get) => ({
    enzymes: [],
    enzymeSets: [],
    pendingImport: null,
    activeSetId: null,
    isLoading: false,
    error: null,

    loadEnzymes: async () => {
        set({ isLoading: true, error: null });
        try {
            const enzymes = await invoke<DbEnzyme[]>('get_enzymes');
            set({ enzymes, isLoading: false });
        } catch (err) {
            set({ error: String(err), isLoading: false });
        }
    },

    loadEnzymeSets: async () => {
        set({ isLoading: true, error: null });
        try {
            const enzymeSets = await invoke<EnzymeSetWithMembers[]>('get_enzyme_sets');
            const activeSet = enzymeSets.find(s => s.is_active);
            set({ enzymeSets, activeSetId: activeSet?.id || null, isLoading: false });
        } catch (err) {
            set({ error: String(err), isLoading: false });
        }
    },

    toggleEnzyme: async (id, active) => {
        try {
            await invoke('toggle_enzyme', { id, active });
            await invoke('refresh_enzymes');
            await get().loadEnzymes();
        } catch (err) {
            set({ error: String(err) });
        }
    },

    addEnzyme: async (name, site, cutTop, cutBottom, methylation, optTemp, incTemp, supplier, notes) => {
        try {
            await invoke('add_enzyme', { name, site, cutTop, cutBottom, methylation, optTemp, incTemp, supplier, notes });
            await invoke('refresh_enzymes');
            await get().loadEnzymes();
        } catch (err) {
            set({ error: String(err) });
        }
    },

    updateEnzyme: async (id, name, site, cutTop, cutBottom, methylation, optTemp, incTemp, supplier, notes) => {
        try {
            await invoke('update_enzyme', { id, name, site, cutTop, cutBottom, methylation, optTemp, incTemp, supplier, notes });
            await invoke('refresh_enzymes');
            await get().loadEnzymes();
        } catch (err) {
            set({ error: String(err) });
        }
    },

    deleteEnzyme: async (id) => {
        try {
            await invoke('delete_enzyme', { id });
            await invoke('refresh_enzymes');
            await get().loadEnzymes();
        } catch (err) {
            set({ error: String(err) });
        }
    },

    createEnzymeSet: async (name, enzymeNames) => {
        try {
            await invoke('create_enzyme_set', { name, enzymeNames });
            await get().loadEnzymeSets();
        } catch (err) {
            set({ error: String(err) });
        }
    },

    deleteEnzymeSet: async (id) => {
        try {
            await invoke('delete_enzyme_set', { id });
            await get().loadEnzymeSets();
        } catch (err) {
            set({ error: String(err) });
        }
    },

    setPendingImport: (pendingImport) => set({ pendingImport }),
}));
