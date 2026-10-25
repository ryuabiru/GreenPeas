/**
 * 学習メモ: UI設定の既定値、localStorageからの安全な復元、保存用シリアライズを担当する。
 * 処理の位置づけ: コンポーネントやHookから参照・更新され、画面全体で共有される状態の中心になる。
 */

import { AppSettings } from '../types';

export const UI_SETTINGS_STORAGE_KEY = 'greenpeas-settings';

export const DEFAULT_APP_SETTINGS: AppSettings = {
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
  fontSize: 16,
  aminoAcidTheme: 'chemistry'
};

export interface PersistedUiSettings {
  darkMode: boolean;
  appSettings: AppSettings;
}

function parseAppSettings(value: unknown): AppSettings | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Partial<AppSettings>;
  if (typeof candidate.fontFamily !== 'string' || candidate.fontFamily.length === 0) return null;
  if (typeof candidate.fontSize !== 'number' || !Number.isFinite(candidate.fontSize) || candidate.fontSize <= 0) return null;
  if (candidate.aminoAcidTheme !== null && typeof candidate.aminoAcidTheme !== 'string') return null;
  return {
    fontFamily: candidate.fontFamily,
    fontSize: candidate.fontSize,
    aminoAcidTheme: candidate.aminoAcidTheme ?? null
  };
}

export function readPersistedUiSettings(storage?: Pick<Storage, 'getItem'> | null): PersistedUiSettings {
  try {
    const resolvedStorage = storage === undefined ? globalThis.localStorage : storage;
    const raw = resolvedStorage?.getItem(UI_SETTINGS_STORAGE_KEY);
    if (!raw) {
      return { darkMode: true, appSettings: DEFAULT_APP_SETTINGS };
    }

    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') {
      return { darkMode: true, appSettings: DEFAULT_APP_SETTINGS };
    }

    const candidate = parsed as { darkMode?: unknown; appSettings?: unknown };
    const appSettings = parseAppSettings(candidate.appSettings) ?? parseAppSettings(parsed) ?? DEFAULT_APP_SETTINGS;
    return {
      darkMode: typeof candidate.darkMode === 'boolean' ? candidate.darkMode : true,
      appSettings
    };
  } catch {
    return { darkMode: true, appSettings: DEFAULT_APP_SETTINGS };
  }
}

export function serializeUiSettings(settings: PersistedUiSettings): string {
  return JSON.stringify(settings);
}
