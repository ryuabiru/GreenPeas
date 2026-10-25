/**
 * 学習メモ: BugReportModalダイアログの入力状態、検証、確定・取消操作を担当するReactコンポーネント。
 * 処理の位置づけ: 親コンポーネントからデータとコールバックを受け取り、描画と操作通知を担当する。
 */

import React, { useMemo, useState } from 'react';
import { message } from '@tauri-apps/plugin-dialog';
import { openUrl } from '@tauri-apps/plugin-opener';
import { GITHUB_NEW_ISSUE_URL } from '../../config/appConfig';
import { APP_RELEASE_CHANNEL, APP_RELEASE_TAG, APP_VERSION } from '../../config/appInfo';

interface BugReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  activeTab: 'sequence' | 'map' | 'alignment';
  currentSequenceId?: string | null;
  currentSequenceLength?: number;
  darkMode: boolean;
}

export const BugReportModal: React.FC<BugReportModalProps> = ({
  isOpen,
  onClose,
  activeTab,
  currentSequenceId,
  darkMode
}) => {
  const [title, setTitle] = useState('');
  const [steps, setSteps] = useState('');
  const [expected, setExpected] = useState('');
  const [actual, setActual] = useState('');

  const diagnostics = useMemo(() => {
    const now = new Date().toISOString();
    return [
      `timestamp: ${now}`,
      `app_version: ${APP_VERSION}`,
      `release_channel: ${APP_RELEASE_CHANNEL}`,
      `release_tag: ${APP_RELEASE_TAG}`,
      `active_tab: ${activeTab}`,
      `sequence_loaded: ${String(Boolean(currentSequenceId))}`,
      `user_agent: ${navigator.userAgent}`
    ].join('\n');
  }, [activeTab, currentSequenceId]);

  const reportBody = useMemo(() => {
    return [
      '# Bug Report',
      '',
      `## Title`,
      title || '(please fill)',
      '',
      `## Steps to Reproduce`,
      steps || '(please fill)',
      '',
      `## Expected`,
      expected || '(please fill)',
      '',
      `## Actual`,
      actual || '(please fill)',
      '',
      `## Diagnostics`,
      '```txt',
      diagnostics,
      '```'
    ].join('\n');
  }, [title, steps, expected, actual, diagnostics]);

  const githubIssueUrl = useMemo(() => {
    const params = new URLSearchParams({
      title: `[Bug]: ${title || 'Describe the issue'}`,
      body: reportBody,
      labels: 'bug',
    });
    return `${GITHUB_NEW_ISSUE_URL}?${params.toString()}`;
  }, [title, reportBody]);

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-content"
        onClick={e => e.stopPropagation()}
        style={{ maxWidth: '760px', width: '95%', maxHeight: '90vh', overflow: 'auto' }}
      >
        <h2 style={{ marginTop: 0 }}>Bug Report</h2>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
          Please report issues with reproducible steps and the expected behavior. The report is public, so do not include DNA sequences, file paths, personal information, or other sensitive data.
        </p>

        <div style={{ display: 'grid', gap: '10px' }}>
          <input
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="Short title (e.g. Feature label rendering issue)"
            style={{ padding: '10px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg-app)', color: 'var(--text-main)' }}
          />
          <textarea
            value={steps}
            onChange={e => setSteps(e.target.value)}
            placeholder="Steps to reproduce"
            rows={4}
            style={{ padding: '10px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg-app)', color: 'var(--text-main)', resize: 'vertical' }}
          />
          <textarea
            value={expected}
            onChange={e => setExpected(e.target.value)}
            placeholder="Expected behavior"
            rows={2}
            style={{ padding: '10px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg-app)', color: 'var(--text-main)', resize: 'vertical' }}
          />
          <textarea
            value={actual}
            onChange={e => setActual(e.target.value)}
            placeholder="Actual behavior"
            rows={2}
            style={{ padding: '10px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg-app)', color: 'var(--text-main)', resize: 'vertical' }}
          />
        </div>

        <div style={{ marginTop: '14px', marginBottom: '6px' }}>
          <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '6px' }}>Preview</div>
          <pre style={{ margin: 0, padding: '10px', border: '1px solid var(--border)', borderRadius: '6px', background: darkMode ? '#0b1220' : '#f8fafc', maxHeight: '180px', overflow: 'auto', fontSize: '0.75rem' }}>
            {reportBody}
          </pre>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '16px', gap: '10px', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
            <button
              onClick={() => void openUrl(githubIssueUrl)}
              style={{ padding: 0, border: 'none', background: 'transparent', fontSize: '0.85rem', color: '#3b82f6', cursor: 'pointer' }}
            >
              Open GitHub Issue
            </button>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              onClick={async () => {
                const { writeText } = await import('@tauri-apps/plugin-clipboard-manager');
                await writeText(reportBody);
                await message('Bug report copied to clipboard.', { title: 'Copied', kind: 'info' });
              }}
              style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg-app)', color: 'var(--text-main)' }}
            >
              Copy Report
            </button>
            <button
              onClick={onClose}
              style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg-app)', color: 'var(--text-main)' }}
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
