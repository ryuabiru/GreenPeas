/**
 * 学習メモ: AnnotationModalダイアログの入力状態、検証、確定・取消操作を担当するReactコンポーネント。
 * 処理の位置づけ: 親コンポーネントからデータとコールバックを受け取り、描画と操作通知を担当する。
 */

import React, { useState, useEffect } from 'react';
import { Annotation, Strand, DisplayShape } from '../../types';

interface AnnotationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (annotation: Annotation, isEdit: boolean) => void;
  onDelete?: (featureId: string) => Promise<boolean>;
  initialFeature?: Annotation | null;
  defaultStart?: number;
  defaultEnd?: number;
}

export const AnnotationModal: React.FC<AnnotationModalProps> = ({
  isOpen, onClose, onSave, onDelete, initialFeature, defaultStart, defaultEnd
}) => {
  const [name, setName] = useState("");
  const [type, setType] = useState<string>('misc_feature');
  const [start, setStart] = useState(0);
  const [end, setEnd] = useState(0);
  const [strand, setStrand] = useState<Strand>("Forward");
  const [shape, setShape] = useState<DisplayShape>("Rect");
  const [color, setColor] = useState('#8b5cf6');

  useEffect(() => {
    if (isOpen) {
      if (initialFeature) {
        setName(initialFeature.name);
        setType(initialFeature.type);
        setStart(initialFeature.start);
        setEnd(initialFeature.end);
        setStrand(initialFeature.strand);
        setShape(initialFeature.display_shape || "Rect");
        setColor(initialFeature.color || '#8b5cf6');
      } else {
        setName(`Feature ${((defaultStart||0)+1)}..${(defaultEnd || ((defaultStart||0) + 1))}`);
        setType('misc_feature');
        setStart(defaultStart || 0);
        setEnd(defaultEnd || 0);
        setStrand("Forward");
        setShape("Rect");
        setColor('#8b5cf6');
      }
    }
  }, [isOpen, initialFeature, defaultStart, defaultEnd]);

  if (!isOpen) return null;

  const handleSave = () => {
    onSave({
      id: initialFeature ? initialFeature.id : Date.now().toString(),
      name, 
      type, 
      start, 
      end, 
      strand, 
      display_shape: shape, 
      color: color || null
    }, !!initialFeature);
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content">
        <h2 style={{ marginTop: 0, marginBottom: '24px', color: 'var(--text-main)', fontSize: '1.4rem' }}>Annotate Sequence</h2>
        <div className="form-group" style={{ marginBottom: '20px' }}>
          <label htmlFor="annotation-name">Feature Name</label>
          <input id="annotation-name" type="text" value={name} onChange={e => setName(e.target.value)} autoFocus style={{ width: '100%', padding: '10px', background: 'var(--bg-app)', border: '1px solid var(--border)', borderRadius: '6px', color: 'var(--text-main)' }} />
        </div>
        <div style={{ display: 'flex', gap: '20px', marginBottom: '20px' }}>
          <div className="form-group" style={{ flex: 1 }}>
            <label htmlFor="annotation-start">Start</label>
            <input id="annotation-start" type="number" value={start + 1} onChange={e => setStart(Number(e.target.value) - 1)} />
          </div>
          <div className="form-group" style={{ flex: 1 }}>
            <label htmlFor="annotation-end">End</label>
            <input id="annotation-end" type="number" value={end} onChange={e => setEnd(Number(e.target.value))} />
          </div>
        </div>
        <div style={{ display: 'flex', gap: '20px', marginBottom: '20px' }}>
          <div className="form-group" style={{ flex: 1 }}>
            <label htmlFor="annotation-type">Type</label>
            <select id="annotation-type" value={type} onChange={e => setType(e.target.value)}>
              <option value="CDS">CDS</option>
              <option value="gene">Gene</option>
              <option value="promoter">Promoter</option>
              <option value="terminator">Terminator</option>
              <option value="RBS">RBS (Ribosome Binding Site)</option>
              <option value="mRNA">mRNA</option>
              <option value="exon">Exon</option>
              <option value="intron">Intron</option>
              <option value="5'UTR">5'UTR</option>
              <option value="3'UTR">3'UTR</option>
              <option value="rep_origin">Replication Origin (rep_origin)</option>
              <option value="enhancer">Enhancer</option>
              <option value="regulatory">Regulatory</option>
              <option value="primer_bind">Primer Bind (primer_bind)</option>
              <option value="primer">Primer</option>
              <option value="misc_feature">Misc Feature</option>
              {!['CDS', 'gene', 'promoter', 'terminator', 'RBS', 'mRNA', 'exon', 'intron', "5'UTR", "3'UTR", 'rep_origin', 'enhancer', 'regulatory', 'primer_bind', 'primer', 'misc_feature'].includes(type) && (
                <option value={type}>{type}</option>
              )}
            </select>
          </div>
          <div className="form-group" style={{ flex: 1 }}>
            <label>Shape & Strand</label>
            <div style={{ display: 'flex', background: 'var(--bg-app)', padding: '4px', borderRadius: '6px', border: '1px solid var(--border)', gap: '4px' }}>
              <button className="shape-btn" onClick={() => setShape("Rect")} style={{ flex: 1, padding: '6px', background: shape === "Rect" ? '#334155' : 'transparent', border: 'none', color: 'var(--text-main)', fontSize: '0.8rem', borderRadius: '4px' }}>|---|</button>
              <button className="shape-btn" onClick={() => { setShape("Arrow"); setStrand("Forward"); }} style={{ flex: 1, padding: '6px', background: (shape === "Arrow" && strand === "Forward") ? '#334155' : 'transparent', border: 'none', color: 'var(--text-main)', fontSize: '0.8rem', borderRadius: '4px' }}>{'---->'}</button>
              <button className="shape-btn" onClick={() => { setShape("Arrow"); setStrand("Reverse"); }} style={{ flex: 1, padding: '6px', background: (shape === "Arrow" && strand === "Reverse") ? '#334155' : 'transparent', border: 'none', color: 'var(--text-main)', fontSize: '0.8rem', borderRadius: '4px' }}>{'<----'}</button>
            </div>
          </div>
        </div>
        <div className="form-group" style={{ marginBottom: '25px' }}>
          <label style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '8px', display: 'block' }}>Feature Color</label>
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
            {['#ef4444', '#f97316', '#eab308', '#22c55e', '#06b6d4', '#3b82f6', '#8b5cf6', '#ec4899', '#64748b', '#ffffff'].map(c => (
              <button 
                key={c} 
                className="color-btn"
                onClick={() => setColor(c)}
                style={{ 
                  width: '28px', height: '28px', backgroundColor: c, borderRadius: '50%',
                  border: color.toLowerCase() === c.toLowerCase() ? '2px solid var(--border)' : '2px solid transparent',
                  padding: 0, cursor: 'pointer', boxShadow: '0 2px 4px rgba(0,0,0,0.2)', transition: 'transform 0.1s'
                }}
                title={c}
              />
            ))}
            <div style={{ width: '1px', height: '20px', background: 'var(--border)', margin: '0 5px' }} />
            <input type="color" value={color} onChange={e => setColor(e.target.value)} style={{ width: '32px', height: '32px', padding: 0, border: 'none', background: 'transparent', cursor: 'pointer' }} />
          </div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '30px' }}>
          {initialFeature && onDelete && (
            <button className="btn-secondary" onClick={() => void onDelete(initialFeature.id)}
              style={{ marginRight: 'auto', color: '#ef4444' }}>Delete Feature</button>
          )}
          <button className="btn-secondary" onClick={onClose} style={{ background: 'transparent', color: 'var(--text-muted)' }}>Cancel</button>
          <button className="btn-primary" onClick={handleSave} style={{ minWidth: '120px' }}>{initialFeature ? 'Update Feature' : 'Add Feature'}</button>
        </div>
      </div>
    </div>
  );
};
