/**
 * 学習メモ: Sidebar表示を構成し、親コンポーネントやストアとユーザー操作を接続するReactコンポーネント。
 * 処理の位置づけ: 親コンポーネントからデータとコールバックを受け取り、描画と操作通知を担当する。
 */

import React from 'react';
import { SequenceData, AlignmentTrackSettings } from '../types';
import { 
  Sun, Moon, Plus, FolderOpen, 
  FileText, X, Settings, Bug, ExternalLink
} from 'lucide-react';
import * as api from '../api';

const GREENPEAS_FILE_PATH_MIME = 'application/x-greenpeas-file-path';
const DEBUG_SIDEBAR_DRAG = import.meta.env.DEV;
const SIDEBAR_DROP_WIDTH = 280;

function logSidebarDrag(message: string, data?: Record<string, unknown>) {
  if (!DEBUG_SIDEBAR_DRAG) return;
  if (data) {
    console.debug(`[GreenPeas sidebar drag] ${message}`, data);
  } else {
    console.debug(`[GreenPeas sidebar drag] ${message}`);
  }
}

function createDragId() {
  return window.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function pathsFromDrop(event: React.DragEvent): string[] {
  const paths = [
    event.dataTransfer.getData(GREENPEAS_FILE_PATH_MIME),
    event.dataTransfer.getData('text/uri-list')
      .split(/\r?\n/)
      .find(line => line && !line.startsWith('#')) || '',
  ]
    .map(path => path.trim())
    .filter(Boolean)
    .map(path => path.startsWith('file://') ? decodeURIComponent(path.replace(/^file:\/\//i, '')) : path);

  for (const file of Array.from(event.dataTransfer.files)) {
    const path = (file as File & { path?: string }).path;
    if (path) paths.push(path);
  }

  return Array.from(new Set(paths));
}

interface SidebarProps {
  darkMode: boolean;
  setDarkMode: (d: boolean) => void;
  sequences: SequenceData[];
  currentIndex: number;
  setCurrentIndex: (i: number) => void;
  openFile: () => void;
  openFileInNewWindow: () => void;
  createNewFile: () => void;
  onImportPaths: (paths: string[]) => void;
  onOpenSequenceInNewWindow: (index: number, detach: boolean) => void;
  onOpenSettings: () => void;
  onOpenBugReport: () => void;
  onDeleteSequence: (index: number) => void;
  activeTab: string;
  alignmentResults: any[];
  visibility: Record<number, AlignmentTrackSettings>;
  setVisibility: (v: Record<number, AlignmentTrackSettings> | ((prev: Record<number, AlignmentTrackSettings>) => Record<number, AlignmentTrackSettings>)) => void;
  onDeleteAlignmentSample: (index: number) => void;
  dirtySequenceIds: Record<string, true>;
}

export const Sidebar: React.FC<SidebarProps> = ({
  darkMode, setDarkMode, sequences, currentIndex, setCurrentIndex, openFile, openFileInNewWindow, createNewFile, onImportPaths, onOpenSequenceInNewWindow, onOpenSettings, onOpenBugReport, onDeleteSequence,
  activeTab, alignmentResults, visibility, setVisibility, onDeleteAlignmentSample, dirtySequenceIds
}) => {
  const windowInstanceId = React.useRef(createDragId());
  const activeDragId = React.useRef<string | null>(null);
  const lastDragOverLogAt = React.useRef(0);

  const isOutsideWindow = (event: React.DragEvent) => {
    const margin = 8;
    return event.clientX <= margin
      || event.clientY <= margin
      || event.clientX >= window.innerWidth - margin
      || event.clientY >= window.innerHeight - margin;
  };

  return (
    <div
      className="sidebar"
      onDragEnter={(e) => {
        logSidebarDrag('dragenter sidebar', {
          windowInstanceId: windowInstanceId.current,
          types: Array.from(e.dataTransfer.types),
          clientX: e.clientX,
          clientY: e.clientY
        });
      }}
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        const now = Date.now();
        if (now - lastDragOverLogAt.current > 750) {
          lastDragOverLogAt.current = now;
          logSidebarDrag('dragover sidebar accepted', {
            windowInstanceId: windowInstanceId.current,
            types: Array.from(e.dataTransfer.types),
            dropEffect: e.dataTransfer.dropEffect,
            clientX: e.clientX,
            clientY: e.clientY
          });
        }
      }}
      onDrop={async (e) => {
        e.preventDefault();
        e.stopPropagation();
        const paths = pathsFromDrop(e);
        logSidebarDrag('drop sidebar', {
          windowInstanceId: windowInstanceId.current,
          types: Array.from(e.dataTransfer.types),
          directPaths: paths,
          clientX: e.clientX,
          clientY: e.clientY
        });
        if (paths.length === 0) {
          const path = await api.takeSidebarDragPath(windowInstanceId.current);
          logSidebarDrag('drop fallback takeSidebarDragPath', {
            windowInstanceId: windowInstanceId.current,
            path
          });
          if (path) paths.push(path);
        }
        if (paths.length === 0) {
          logSidebarDrag('drop ignored: no paths', {
            windowInstanceId: windowInstanceId.current
          });
          return;
        }
        logSidebarDrag('drop importing paths', {
          windowInstanceId: windowInstanceId.current,
          paths
        });
        onImportPaths(paths);
      }}
    >
      <div style={{ padding: '20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h2 style={{ fontSize: '1.2rem', margin: 0, fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--text-main)' }}>GreenPeas</h2>
        <button aria-label={darkMode ? 'Use light theme' : 'Use dark theme'} onClick={() => setDarkMode(!darkMode)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'color 0.2s' }}>
          {darkMode ? <Sun size={20} /> : <Moon size={20} />}
        </button>
      </div>
      
      <div style={{ padding: '10px', flex: 1, overflowY: 'auto' }}>
        <div style={{ padding: '10px' }}>
          <div style={{ display: 'flex', gap: '8px', marginBottom: '20px' }}>
            <button className="btn-secondary" onClick={createNewFile} style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', background: 'var(--bg-app)', color: '#3b82f6', border: '1px solid #3b82f6', fontWeight: 700, fontSize: '0.8rem', padding: '8px', borderRadius: '6px' }}>
              <Plus size={16} /> New
            </button>
            <button className="btn-secondary" onClick={openFile} style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', background: 'var(--bg-app)', color: 'var(--text-main)', border: '1px solid var(--border)', fontSize: '0.8rem', padding: '8px', borderRadius: '6px' }}>
              <FolderOpen size={16} /> Open
            </button>
            <button className="btn-secondary" onClick={openFileInNewWindow} title="Open in new window" style={{ width: '36px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-app)', color: 'var(--text-main)', border: '1px solid var(--border)', fontSize: '0.8rem', padding: '8px', borderRadius: '6px' }}>
              <ExternalLink size={16} />
            </button>
          </div>
          
            <div className="sequence-list">
              <h3 style={{ fontSize: '0.7rem', textTransform: 'uppercase', color: 'var(--text-muted)', marginLeft: '10px', marginBottom: '10px', letterSpacing: '0.1em', fontWeight: 700 }}>Sequences</h3>
              {sequences.map((s, i) => (
                <React.Fragment key={i}>
                <div
                  className={`sidebar-item ${i === currentIndex ? 'active' : ''}`}
                  onClick={() => setCurrentIndex(i)}
                  role="button"
                  tabIndex={0}
                  aria-current={i === currentIndex ? 'true' : undefined}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      setCurrentIndex(i);
                    }
                  }}
                  draggable={!!s.file_path && !dirtySequenceIds[s.id]}
                  onDragStart={(e) => {
                    if (!s.file_path) return;
                    const dragId = createDragId();
                    activeDragId.current = dragId;
                    logSidebarDrag('dragstart sequence', {
                      windowInstanceId: windowInstanceId.current,
                      dragId,
                      sequenceId: s.id,
                      path: s.file_path
                    });
                    void api.beginSidebarDrag(dragId, windowInstanceId.current, s.file_path)
                      .then(() => logSidebarDrag('beginSidebarDrag ok', {
                        windowInstanceId: windowInstanceId.current,
                        dragId
                      }))
                      .catch((error) => logSidebarDrag('beginSidebarDrag failed', {
                        windowInstanceId: windowInstanceId.current,
                        dragId,
                        error: String(error)
                      }));
                    e.dataTransfer.effectAllowed = 'move';
                    e.dataTransfer.setData(GREENPEAS_FILE_PATH_MIME, s.file_path);
                    e.dataTransfer.setData('application/x-greenpeas-sequence-index', String(i));
                  }}
                  onDragEnd={async (e) => {
                    if (!s.file_path) return;
                    let dragWasConsumed = false;
                    if (activeDragId.current) {
                      dragWasConsumed = await api.dropSidebarDragAtScreenPosition(
                        activeDragId.current,
                        s.file_path,
                        e.screenX,
                        e.screenY,
                        SIDEBAR_DROP_WIDTH
                      ).catch((error) => {
                        logSidebarDrag('dropSidebarDragAtScreenPosition failed', {
                          windowInstanceId: windowInstanceId.current,
                          dragId: activeDragId.current,
                          error: String(error)
                        });
                        return false;
                      });
                      if (!dragWasConsumed) {
                        dragWasConsumed = await api.finishSidebarDrag(activeDragId.current).catch(() => false);
                      }
                      logSidebarDrag('finishSidebarDrag result', {
                        windowInstanceId: windowInstanceId.current,
                        dragId: activeDragId.current,
                        consumed: dragWasConsumed
                      });
                      activeDragId.current = null;
                    }

                    if (dragWasConsumed) {
                      logSidebarDrag('dragend removing source sequence after cross-window consume', {
                        windowInstanceId: windowInstanceId.current,
                        sequenceId: s.id,
                        path: s.file_path
                      });
                      onDeleteSequence(i);
                      return;
                    }

                    const outside = isOutsideWindow(e);
                    logSidebarDrag('dragend sequence', {
                      windowInstanceId: windowInstanceId.current,
                      sequenceId: s.id,
                      path: s.file_path,
                      outside,
                      dropEffect: e.dataTransfer.dropEffect,
                      clientX: e.clientX,
                      clientY: e.clientY
                    });
                    if (!outside || e.dataTransfer.dropEffect !== 'none') return;
                    onOpenSequenceInNewWindow(i, true);
                  }}
                  title={dirtySequenceIds[s.id] ? 'Save changes before moving this sequence to another window' : s.file_path ? 'Drag outside the window to tear off' : undefined}
                  style={{ padding: '8px 12px', cursor: 'pointer', fontSize: '0.9rem', borderRadius: '6px', margin: '2px 5px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', transition: 'all 0.2s' }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', overflow: 'hidden' }}>
                    <FileText size={16} style={{ flexShrink: 0, opacity: 0.7 }} />
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: i === currentIndex ? 600 : 400 }}>{s.id}{dirtySequenceIds[s.id] ? ' •' : ''}</span>
                  </div>
                  <button
                    aria-label={`Open ${s.id} in a new window`}
                    onClick={(e) => { e.stopPropagation(); onOpenSequenceInNewWindow(i, false); }}
                    disabled={!s.file_path}
                    title={s.file_path ? 'Open in new window' : 'Save this sequence before opening it in a new window'}
                    style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: s.file_path ? 'pointer' : 'not-allowed', fontSize: '0.8rem', padding: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: s.file_path ? 1 : 0.35 }}
                    className="delete-btn"
                  >
                    <ExternalLink size={14} />
                  </button>
                  <button 
                    aria-label={`Close ${s.id}`}
                    onClick={(e) => { e.stopPropagation(); onDeleteSequence(i); }} 
                    style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '0.8rem', padding: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                    className="delete-btn"
                  >
                    <X size={14} />
                  </button>
                </div>
                
                {/* Nested Queries Tree for Alignment Mode */}
                {i === currentIndex && activeTab === 'alignment' && (alignmentResults?.length || 0) > 0 && (
                  <div style={{ marginLeft: '25px', marginTop: '4px', marginBottom: '8px', borderLeft: '1px solid var(--border)', paddingLeft: '8px' }}>
                    <div style={{ fontSize: '0.65rem', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '8px', fontWeight: 700, opacity: 0.8, letterSpacing: '0.05em' }}>
                      Aligned Queries ({alignmentResults?.length})
                    </div>
                    {alignmentResults?.map((res, ridx) => (
                      <div key={ridx} style={{ 
                        display: 'flex', alignItems: 'center', gap: '8px', padding: '4px 8px', fontSize: '0.8rem', borderRadius: '4px', 
                        cursor: 'pointer', background: visibility[ridx]?.visible !== false ? 'rgba(59, 130, 246, 0.08)' : 'transparent',
                        margin: '1px 0', border: '1px solid transparent', transition: 'all 0.1s'
                      }}
                      role="button"
                      tabIndex={0}
                      onClick={(e) => {
                        e.stopPropagation();
                        setVisibility(prev => {
                          const current = prev[ridx] || { visible: true, expanded: false, hideSeq: false };
                          return { ...prev, [ridx]: { ...current, visible: !current.visible } };
                        });
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          setVisibility(prev => {
                            const current = prev[ridx] || { visible: true, expanded: false, hideSeq: false };
                            return { ...prev, [ridx]: { ...current, visible: !current.visible } };
                          });
                        }
                      }}>
                        <input 
                          type="checkbox" 
                          checked={visibility[ridx]?.visible !== false} 
                          aria-label={`Show ${res.data.id}`}
                          onChange={() => {}} // Controlled by div onClick
                          style={{ cursor: 'pointer', width: '12px', height: '12px' }}
                        />
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', opacity: visibility[ridx]?.visible !== false ? 1 : 0.6, flex: 1 }}>
                          {res.data.id}
                        </span>
                        <button 
                          aria-label={`Remove alignment sample ${res.data.id}`}
                          onClick={(e) => { e.stopPropagation(); onDeleteAlignmentSample(ridx); }} 
                          style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '0.8rem', padding: '2px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                          className="delete-btn"
                          title="Delete alignment sample"
                        >
                          <X size={12} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </React.Fragment>
            ))}
            </div>
        </div>
      </div>

      <div style={{ padding: '16px', borderTop: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <p role="note" style={{ margin: '0 0 4px', fontSize: '0.72rem', lineHeight: 1.4, color: 'var(--text-muted)' }}>
          Beta: Keep a separate backup of important lab data.
        </p>
        <button
          onClick={onOpenBugReport}
          style={{ width: '100%', padding: '10px', background: 'transparent', border: 'none', borderRadius: '8px', color: 'var(--text-main)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', fontSize: '0.85rem', fontWeight: 500 }}
        >
          <Bug size={18} style={{ opacity: 0.8 }} /> Report Bug
        </button>
        <button 
          onClick={onOpenSettings} 
          style={{ width: '100%', padding: '10px', background: 'transparent', border: 'none', borderRadius: '8px', color: 'var(--text-main)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', fontSize: '0.85rem', fontWeight: 500 }}
          className="sidebar-settings-btn"
        >
          <Settings size={18} style={{ opacity: 0.8 }} /> Settings
        </button>
      </div>
    </div>
  );
};
