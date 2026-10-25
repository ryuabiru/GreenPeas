/**
 * 学習メモ: export.testの公開動作を固定し、変更による回帰を検出するテスト。
 * 処理の位置づけ: React側から呼ばれ、Tauri invokeを通じてRustコマンドへ処理を渡す。
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { invoke } from '@tauri-apps/api/core';
import { exportGp } from '../export';
import { SequenceData } from '../../types';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

const sequence: SequenceData = {
  id: 'main',
  description: null,
  sequence: 'ATGC',
  annotations: [],
  primers: [],
  topology: 'Linear',
  trace: null,
  enzymes: null,
  enzymeSettings: null,
  debug_hex: 'private-debug-data',
  file_path: '/Users/private/main.gp',
  alignmentResults: [{
    id: 'sample',
    data: {
      id: 'sample',
      description: null,
      sequence: 'ATGC',
      annotations: [],
      primers: [],
      topology: 'Linear',
      trace: null,
      enzymes: null,
      enzymeSettings: null,
      alignmentResults: null,
      debug_hex: 'nested-private-debug-data',
      file_path: '/Users/private/sample.ab1'
    },
    x_start: 0,
    x_end: 4,
    y_start: 0,
    y_end: 4,
    aligned_query: 'ATGC',
    aligned_template: 'ATGC',
    strand: 'Forward',
    score: 4
  }]
};

describe('exportGp', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(invoke).mockResolvedValue(undefined);
  });

  it('removes local paths and debug data from the exported project', async () => {
    await exportGp('/tmp/shared.gp', sequence);

    const payload = vi.mocked(invoke).mock.calls[0][1] as { sequenceData: SequenceData };
    expect(payload.sequenceData.file_path).toBeNull();
    expect(payload.sequenceData.debug_hex).toBeNull();
    expect(payload.sequenceData.alignmentResults?.[0].data?.file_path).toBeNull();
    expect(payload.sequenceData.alignmentResults?.[0].data?.debug_hex).toBeNull();
    expect(JSON.stringify(payload.sequenceData)).not.toContain('/Users/private');
  });
});
