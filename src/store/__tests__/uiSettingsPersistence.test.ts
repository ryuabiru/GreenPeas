/**
 * 学習メモ: uiSettingsPersistence.testの公開動作を固定し、変更による回帰を検出するテスト。
 * 処理の位置づけ: コンポーネントやHookから参照・更新され、画面全体で共有される状態の中心になる。
 */

import { describe, expect, it } from 'vitest';
import {
  DEFAULT_APP_SETTINGS,
  readPersistedUiSettings,
  serializeUiSettings,
  UI_SETTINGS_STORAGE_KEY
} from '../uiSettingsPersistence';

function storageWith(value: string | null): Pick<Storage, 'getItem'> {
  return {
    getItem: (key: string) => key === UI_SETTINGS_STORAGE_KEY ? value : null
  };
}

describe('UI settings persistence', () => {
  it('restores the current settings format', () => {
    const persisted = {
      darkMode: false,
      appSettings: {
        fontFamily: 'Menlo',
        fontSize: 18,
        aminoAcidTheme: 'taylor'
      }
    };

    expect(readPersistedUiSettings(storageWith(serializeUiSettings(persisted)))).toEqual(persisted);
  });

  it('restores the legacy app-settings-only format', () => {
    const legacy = {
      fontFamily: 'Monaco',
      fontSize: 14,
      aminoAcidTheme: 'chemistry'
    };

    expect(readPersistedUiSettings(storageWith(JSON.stringify(legacy)))).toEqual({
      darkMode: true,
      appSettings: legacy
    });
  });

  it('uses defaults for corrupt persisted data', () => {
    expect(readPersistedUiSettings(storageWith('{invalid'))).toEqual({
      darkMode: true,
      appSettings: DEFAULT_APP_SETTINGS
    });
  });
});
