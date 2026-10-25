/**
 * 学習メモ: VisualCutterダイアログの入力状態、検証、確定・取消操作を担当するReactコンポーネント。
 * 処理の位置づけ: 親コンポーネントからデータとコールバックを受け取り、描画と操作通知を担当する。
 */

import React, { useMemo } from 'react';
import { AlertCircle } from 'lucide-react';
import './RestrictionManager.css';

interface VisualCutterProps {
    sequence: string;
    cutTop: number;
    cutBottom: number;
    onChange: (top: number, bottom: number) => void;
}

export const VisualCutter: React.FC<VisualCutterProps> = ({
    sequence,
    cutTop,
    cutBottom,
    onChange
}) => {
    const seq = useMemo(() => sequence.toUpperCase().replace(/[^ATCGNRYWSKMBDHV]/g, ''), [sequence]);
    const revSeq = useMemo(() => {
        return seq.split('').map(b => {
            const complement: Record<string, string> = {
                'A': 'T', 'T': 'A', 'C': 'G', 'G': 'C',
                'N': 'N', 'R': 'Y', 'Y': 'R', 'M': 'K', 'K': 'M',
                'S': 'S', 'W': 'W', 'H': 'D', 'D': 'H', 'B': 'V', 'V': 'B'
            };
            return complement[b] || b;
        }).join('');
    }, [seq]);

    const overhang = cutBottom - cutTop;
    const overhangType = overhang > 0 ? "5'" : overhang < 0 ? "3'" : "Blunt";

    return (
        <div className="vc-container">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '32px' }}>
                <div>
                    <div style={{ fontSize: '10px', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.2em', color: '#3b82f6' }}>Visual Cutting Editor</div>
                    <h3 style={{ fontSize: '20px', fontWeight: 700, margin: '4px 0', color: 'white' }}>Set Cut Positions</h3>
                </div>
                <div style={{ display: 'flex', gap: '16px' }}>
                    <InfoBadge label="Type" value={overhangType} color={overhang === 0 ? '#4ade80' : '#60a5fa'} />
                    <InfoBadge label="Length" value={`${Math.abs(overhang)} bp`} />
                </div>
            </div>

            <div className="vc-sequence-box">
                {/* Forward Strand */}
                <div className="vc-strand">
                    <span style={{ fontSize: '12px', fontWeight: 900, color: '#475569', marginRight: '16px' }}>5'</span>
                    {seq.split('').map((base, i) => (
                        <React.Fragment key={`top-${i}`}>
                            {i === 0 && <Gap active={cutTop === 0} onClick={() => onChange(0, cutBottom)} />}
                            <BaseCell base={base} isTop />
                            <Gap active={cutTop === i + 1} onClick={() => onChange(i + 1, cutBottom)} />
                        </React.Fragment>
                    ))}
                    <span style={{ fontSize: '12px', fontWeight: 900, color: '#475569', marginLeft: '16px' }}>3'</span>
                </div>

                {/* Vertical Spacing */}
                <div style={{ height: '16px' }} />

                {/* Reverse Strand */}
                <div className="vc-strand">
                    <span style={{ fontSize: '12px', fontWeight: 900, color: '#475569', marginRight: '16px' }}>3'</span>
                    {revSeq.split('').map((base, i) => (
                        <React.Fragment key={`bot-${i}`}>
                            {i === 0 && <Gap active={cutBottom === 0} onClick={() => onChange(cutTop, 0)} />}
                            <BaseCell base={base} isTop={false} />
                            <Gap active={cutBottom === i + 1} onClick={() => onChange(cutTop, i + 1)} />
                        </React.Fragment>
                    ))}
                    <span style={{ fontSize: '12px', fontWeight: 900, color: '#475569', marginLeft: '16px' }}>5'</span>
                </div>

                {/* SVG Overlay for the cut line */}
                <svg style={{ position: 'absolute', inset: 0, pointerEvents: 'none', width: '100%', height: '100%' }}>
                    <line 
                        x1={calculateX(cutTop, seq.length)} y1="35%" 
                        x2={calculateX(cutTop, seq.length)} y2="45%" 
                        stroke="#ef4444" strokeWidth="3" strokeLinecap="round" 
                    />
                    <line 
                        x1={calculateX(cutBottom, seq.length)} y1="55%" 
                        x2={calculateX(cutBottom, seq.length)} y2="65%" 
                        stroke="#ef4444" strokeWidth="3" strokeLinecap="round" 
                    />
                    {cutTop !== cutBottom && (
                        <line 
                            x1={calculateX(cutTop, seq.length)} y1="50%" 
                            x2={calculateX(cutBottom, seq.length)} y2="50%" 
                            stroke="#ef4444" strokeWidth="2" strokeDasharray="4 2"
                        />
                    )}
                </svg>
            </div>

            <div style={{ display: 'flex', gap: '16px', padding: '16px', background: 'rgba(59, 130, 246, 0.05)', borderRadius: '16px', border: '1px solid rgba(59, 130, 246, 0.1)' }}>
                <AlertCircle style={{ color: '#3b82f6', flexShrink: 0 }} size={18} />
                <p style={{ fontSize: '11px', color: '#94a3b8', margin: 0, lineHeight: 1.5 }}>
                    Click on the spaces between bases to set where the enzyme cuts each strand. 
                    The Red indicators show the precise phosphodiester bond cleavage sites.
                </p>
            </div>
        </div>
    );
};

const InfoBadge: React.FC<{ label: string, value: string, color?: string }> = ({ label, value, color = 'white' }) => (
    <div style={{ background: '#1a1a1a', padding: '8px 16px', borderRadius: '12px', border: '1px solid rgba(255, 255, 255, 0.05)', minWidth: '80px', textAlign: 'center' }}>
        <div style={{ fontSize: '9px', fontWeight: 900, color: '#64748b', textTransform: 'uppercase' }}>{label}</div>
        <div style={{ fontSize: '14px', fontWeight: 700, color }}>{value}</div>
    </div>
);

const BaseCell: React.FC<{ base: string, isTop: boolean }> = ({ base, isTop }) => (
    <div style={{ width: '40px', height: '56px', display: 'flex', alignItems: 'center', justifySelf: 'center', justifyContent: 'center', color: isTop ? 'white' : '#94a3b8', fontWeight: isTop ? 700 : 500, userSelect: 'none' }}>
        {base}
    </div>
);

const Gap: React.FC<{ active: boolean, onClick: () => void }> = ({ active, onClick }) => (
    <div className={`vc-gap ${active ? 'active' : ''}`} onClick={onClick}>
        <div className="vc-gap-hit" />
        <div className="vc-gap-line" />
    </div>
);

const calculateX = (index: number, total: number) => {
    // 40px per base + 4px per gap. 
    // This is a rough estimation for the SVG overlay.
    const baseWidth = 40;
    const gapWidth = 4;
    const offsetFromCenter = (index - total / 2) * (baseWidth + gapWidth);
    return `calc(50% + ${offsetFromCenter}px)`;
};
