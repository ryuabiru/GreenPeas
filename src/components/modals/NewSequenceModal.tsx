/**
 * 学習メモ: NewSequenceModalダイアログの入力状態、検証、確定・取消操作を担当するReactコンポーネント。
 * 処理の位置づけ: 親コンポーネントからデータとコールバックを受け取り、描画と操作通知を担当する。
 */

import React, { useState, useEffect } from 'react';
import * as api from '../../api';
import { Topology } from '../../types';

interface NewSequenceModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (name: string, sequence: string, topology: Topology) => void;
  defaultName: string;
}

export const NewSequenceModal: React.FC<NewSequenceModalProps> = ({
  isOpen, onClose, onCreate, defaultName
}) => {
  const [name, setName] = useState(defaultName);
  const [sequence, setSequence] = useState("");
  const [topology, setTopology] = useState<Topology>('Linear');
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setName(defaultName);
      setSequence("");
      setTopology('Linear');
    }
  }, [isOpen, defaultName]);

  if (!isOpen) return null;

  const handleReverseComplement = async () => {
    if (!sequence.trim()) return;
    try {
      setIsProcessing(true);
      const rc: string = await api.getReverseComplement(sequence.toUpperCase());
      setSequence(rc);
    } catch (err) {
      console.error("Reverse complement failed:", err);
    } finally {
      setIsProcessing(false);
    }
  };

  const cleanSequence = (val: string) => {
    // Remove numbers, spaces, and other non-DNA characters
    return val.replace(/[^atgcnATGCN]/g, '').toUpperCase();
  };

  const handleCreate = () => {
    const cleaned = cleanSequence(sequence);
    onCreate(name || defaultName, cleaned, topology);
    onClose();
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content" style={{ maxWidth: '600px', width: '90%' }}>
        <h2 style={{ marginTop: 0, marginBottom: '24px', color: 'var(--text-main)', fontSize: '1.4rem' }}>Create New Sequence</h2>
        
        <div className="form-group" style={{ marginBottom: '20px' }}>
          <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-muted)' }}>Sequence Name</label>
          <input 
            type="text" 
            value={name} 
            onChange={e => setName(e.target.value)} 
            placeholder="e.g. pUC19, MyPrimer_F"
            autoFocus 
            style={{ 
              width: '100%', 
              padding: '12px', 
              background: 'var(--bg-app)', 
              border: '1px solid var(--border)', 
              borderRadius: '8px', 
              color: 'var(--text-main)',
              fontSize: '1rem',
              boxSizing: 'border-box'
            }} 
          />
        </div>

        <div className="form-group" style={{ marginBottom: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <label style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-muted)' }}>Sequence Data (DNA)</label>
            <button 
              onClick={handleReverseComplement} 
              disabled={!sequence || isProcessing}
              style={{ 
                padding: '4px 10px', 
                fontSize: '0.75rem', 
                background: 'rgba(59, 130, 246, 0.1)', 
                color: '#3b82f6', 
                border: '1px solid #3b82f6', 
                borderRadius: '4px',
                cursor: 'pointer',
                opacity: (!sequence || isProcessing) ? 0.5 : 1
              }}
            >
              🔄 Reverse Complement
            </button>
          </div>
          <textarea 
            value={sequence} 
            onChange={e => setSequence(e.target.value)} 
            placeholder="Paste DNA sequence here..."
            style={{ 
              width: '100%', 
              height: '150px', 
              padding: '12px', 
              background: 'var(--bg-app)', 
              border: '1px solid var(--border)', 
              borderRadius: '8px', 
              color: 'var(--text-main)',
              fontSize: '0.9rem',
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
              resize: 'vertical',
              boxSizing: 'border-box'
            }} 
          />
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '4px' }}>
            {cleanSequence(sequence).length} bp (Characters other than ATCGN will be ignored)
          </div>
        </div>

        <div className="form-group" style={{ marginBottom: '25px' }}>
          <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-muted)' }}>Topology</label>
          <div style={{ display: 'flex', gap: '10px' }}>
            <button 
              onClick={() => setTopology('Linear')}
              style={{ 
                flex: 1, 
                padding: '10px', 
                background: topology === 'Linear' ? '#3b82f6' : 'var(--bg-app)', 
                color: topology === 'Linear' ? 'white' : 'var(--text-main)',
                border: `1px solid ${topology === 'Linear' ? '#3b82f6' : 'var(--border)'}`,
                borderRadius: '8px',
                cursor: 'pointer'
              }}
            >
              Linear
            </button>
            <button 
              onClick={() => setTopology('Circular')}
              style={{ 
                flex: 1, 
                padding: '10px', 
                background: topology === 'Circular' ? '#3b82f6' : 'var(--bg-app)', 
                color: topology === 'Circular' ? 'white' : 'var(--text-main)',
                border: `1px solid ${topology === 'Circular' ? '#3b82f6' : 'var(--border)'}`,
                borderRadius: '8px',
                cursor: 'pointer'
              }}
            >
              Circular
            </button>
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '30px' }}>
          <button 
            className="btn-secondary" 
            onClick={onClose} 
            style={{ background: 'transparent', color: 'var(--text-muted)', border: 'none', fontWeight: 600 }}
          >
            Cancel
          </button>
          <button 
            className="btn-primary" 
            onClick={handleCreate} 
            style={{ minWidth: '140px', padding: '10px 24px', borderRadius: '8px', boxShadow: '0 4px 6px -1px rgba(59, 130, 246, 0.5)' }}
          >
            Create Sequence
          </button>
        </div>
      </div>
    </div>
  );
};
