/**
 * 学習メモ: SettingsModalダイアログの入力状態、検証、確定・取消操作を担当するReactコンポーネント。
 * 処理の位置づけ: 親コンポーネントからデータとコールバックを受け取り、描画と操作通知を担当する。
 */

import React from 'react';

interface Settings {
    fontFamily: string;
    fontSize: number;
    aminoAcidTheme?: 'none' | 'chemistry' | 'hydrophobicity' | 'taylor';
}

interface SettingsModalProps {
    isOpen: boolean;
    onClose: () => void;
    settings: Settings;
    onSave: (newSettings: Settings) => void;
}

const FONT_OPTIONS = [
    { name: 'Monospace (Default)', value: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace' },
    { name: 'Roboto Mono', value: '"Roboto Mono", monospace' },
    { name: 'JetBrains Mono', value: '"JetBrains Mono", monospace' },
    { name: 'Fira Code', value: '"Fira Code", monospace' },
    { name: 'Courier', value: '"Courier New", Courier, monospace' }
];

const AA_THEME_OPTIONS = [
    { name: 'None (Monochrome)', value: 'none' },
    { name: 'Chemistry (Acid/Base/Polar)', value: 'chemistry' },
    { name: 'Hydrophobicity', value: 'hydrophobicity' },
    { name: 'Taylor Palette', value: 'taylor' }
];

export const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose, settings, onSave }) => {
    const [localSettings, setLocalSettings] = React.useState<Settings>(settings);

    React.useEffect(() => {
        if (isOpen) setLocalSettings(settings);
    }, [isOpen, settings]);

    if (!isOpen) return null;

    return (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 3000 }}>
            <div style={{ backgroundColor: 'var(--bg-modal)', borderRadius: '12px', width: '400px', padding: '24px', boxShadow: 'var(--shadow-modal)', border: '1px solid var(--border)' }}>
                <h2 style={{ fontSize: '1.2rem', marginBottom: '20px', color: 'var(--text-main)', marginTop: 0 }}>Application Settings</h2>
                
                <div style={{ marginBottom: '20px' }}>
                    <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '8px', textTransform: 'uppercase', fontWeight: 700 }}>Sequence Font</label>
                    <select 
                        value={localSettings.fontFamily} 
                        onChange={(e) => setLocalSettings({ ...localSettings, fontFamily: e.target.value })}
                        style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg-app)', color: 'var(--text-main)', fontSize: '0.9rem' }}
                    >
                        {FONT_OPTIONS.map(opt => (
                            <option key={opt.value} value={opt.value}>{opt.name}</option>
                        ))}
                    </select>
                </div>

                <div style={{ marginBottom: '24px' }}>
                    <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '8px', textTransform: 'uppercase', fontWeight: 700 }}>
                        Font Size: <span style={{ color: '#3b82f6' }}>{localSettings.fontSize}px</span>
                    </label>
                    <input 
                        type="range" 
                        min="10" 
                        max="24" 
                        step="1"
                        value={localSettings.fontSize}
                        onChange={(e) => setLocalSettings({ ...localSettings, fontSize: parseInt(e.target.value) })}
                        style={{ width: '100%', cursor: 'pointer' }}
                    />
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                        <span>Smaller</span>
                        <span>Larger</span>
                    </div>
                </div>

                <div style={{ marginBottom: '24px' }}>
                    <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '8px', textTransform: 'uppercase', fontWeight: 700 }}>Amino Acid Theme</label>
                    <select 
                        value={localSettings.aminoAcidTheme || 'chemistry'} 
                        onChange={(e) => setLocalSettings({ ...localSettings, aminoAcidTheme: e.target.value as any })}
                        style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg-app)', color: 'var(--text-main)', fontSize: '0.9rem' }}
                    >
                        {AA_THEME_OPTIONS.map(opt => (
                            <option key={opt.value} value={opt.value}>{opt.name}</option>
                        ))}
                    </select>
                </div>

                <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
                    <button onClick={onClose} style={{ padding: '8px 16px', borderRadius: '6px', border: '1px solid var(--border)', background: 'none', color: 'var(--text-main)', cursor: 'pointer' }}>Cancel</button>
                    <button 
                        onClick={() => onSave(localSettings)} 
                        style={{ padding: '8px 20px', borderRadius: '6px', border: 'none', background: '#3b82f6', color: 'white', fontWeight: 600, cursor: 'pointer' }}
                    >
                        Apply Settings
                    </button>
                </div>
            </div>
        </div>
    );
};
