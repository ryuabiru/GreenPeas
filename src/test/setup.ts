/**
 * 学習メモ: setupに関する処理をまとめる。
 * 処理の位置づけ: Vitestから実行され、対象モジュールの期待動作を検証する。
 */

import '@testing-library/jest-dom';
import { vi } from 'vitest';

// Mock Tauri API
vi.mock('@tauri-apps/api/core', () => ({
    invoke: vi.fn(),
}));
