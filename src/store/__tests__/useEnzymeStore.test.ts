/**
 * 学習メモ: useEnzymeStore.testの公開動作を固定し、変更による回帰を検出するテスト。
 * 処理の位置づけ: コンポーネントやHookから参照・更新され、画面全体で共有される状態の中心になる。
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useEnzymeStore } from '../useEnzymeStore';
import { invoke } from '@tauri-apps/api/core';

vi.mock('@tauri-apps/api/core', () => ({
    invoke: vi.fn(),
}));

describe('useEnzymeStore', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        // Reset zustand store if possible or just use a fresh state
        useEnzymeStore.setState({ enzymes: [], error: null, isLoading: false });
    });

    it('should load enzymes from backend', async () => {
        const mockEnzymes = [
            { id: 1, name: 'EcoRI', site: 'GAATTC', cut: 1, is_active: true, is_custom: false, overhang_type: null, methylation_sensitivity: null, supplier: null }
        ];
        (invoke as any).mockResolvedValue(mockEnzymes);

        await useEnzymeStore.getState().loadEnzymes();

        expect(invoke).toHaveBeenCalledWith('get_enzymes');
        expect(useEnzymeStore.getState().enzymes).toEqual(mockEnzymes);
    });

    it('should toggle enzyme and refresh engine', async () => {
        (invoke as any).mockResolvedValue([]);

        await useEnzymeStore.getState().toggleEnzyme(1, false);

        expect(invoke).toHaveBeenCalledWith('toggle_enzyme', { id: 1, active: false });
        expect(invoke).toHaveBeenCalledWith('refresh_enzymes');
    });

    it('should handle errors', async () => {
        (invoke as any).mockRejectedValue('Database error');

        await useEnzymeStore.getState().loadEnzymes();

        expect(useEnzymeStore.getState().error).toBe('Database error');
    });
});
