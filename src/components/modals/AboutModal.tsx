/**
 * 学習メモ: AboutModalダイアログの入力状態、検証、確定・取消操作を担当するReactコンポーネント。
 * 処理の位置づけ: 親コンポーネントからデータとコールバックを受け取り、描画と操作通知を担当する。
 */

import React from 'react';
import { openUrl } from '@tauri-apps/plugin-opener';
import appLogo from '../../assets/logo.png';
import { APP_RELEASE_CHANNEL, APP_VERSION } from '../../config/appInfo';

interface AboutModalProps {
  isOpen: boolean;
  onClose: () => void;
  isDark: boolean;
}

const LIBRARIES = [
  { name: 'Tauri', version: '2.0', license: 'MIT / Apache-2.0', url: 'https://tauri.app' },
  { name: 'React', version: '19.1', license: 'MIT', url: 'https://reactjs.org' },
  { name: 'Lucide React', version: '1.7', license: 'ISC', url: 'https://lucide.dev' },
  { name: 'gb-io', version: '0.9', license: 'MIT', url: 'https://crates.io/crates/gb-io' },
  { name: 'aho-corasick', version: '1.1', license: 'MIT', url: 'https://github.com/BurntSushi/aho-corasick' },
  { name: 'Serde', version: '1.0', license: 'MIT / Apache-2.0', url: 'https://serde.rs' },
  { name: 'Vite', version: '7.0', license: 'MIT', url: 'https://vitejs.dev' },
];

export const AboutModal: React.FC<AboutModalProps> = ({ isOpen, onClose, isDark }) => {
  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose} style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      backgroundColor: 'rgba(0, 0, 0, 0.6)', backdropFilter: 'blur(8px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000,
      animation: 'fadeIn 0.3s ease-out'
    }}>
      <div 
        className="about-modal" 
        onClick={e => e.stopPropagation()} 
        style={{
          width: '500px', maxHeight: '90vh',
          backgroundColor: isDark ? '#1e293b' : '#ffffff',
          borderRadius: '24px', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
          overflow: 'hidden', display: 'flex', flexDirection: 'column',
          border: `1px solid ${isDark ? '#334155' : '#e2e8f0'}`,
        }}
      >
        {/* Header */}
        <div style={{ padding: '45px 30px', background: 'linear-gradient(135deg, #3b82f6 0%, #2dd4bf 100%)', textAlign: 'center', position: 'relative', overflow: 'hidden', flexShrink: 0 }}>
          <div style={{ position: 'absolute', top: '-20px', right: '-20px', width: '150px', height: '150px', background: 'rgba(255,255,255,0.1)', borderRadius: '50%' }} />
          <button onClick={onClose} style={{ position: 'absolute', top: '20px', right: '20px', background: 'rgba(0,0,0,0.2)', border: 'none', borderRadius: '50%', color: '#fff', cursor: 'pointer', width: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2 }}>
            ✕
          </button>
          <div style={{ width: '80px', height: '80px', backgroundColor: '#fff', borderRadius: '20px', margin: '0 auto 15px', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 10px 20px rgba(0,0,0,0.2)', overflow: 'hidden' }}>
             <img src={appLogo} alt="GreenPeas Logo" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          </div>
          <h2 style={{ margin: 0, color: '#fff', fontSize: '28px', fontWeight: 800 }}>GreenPeas</h2>
          <p style={{ margin: '5px 0 0', color: 'rgba(255,255,255,0.9)', fontSize: '14px', fontWeight: 500 }}>
            Standard DNA Sequence Editor & Alignment
          </p>
          <div style={{ marginTop: '15px', display: 'inline-block', padding: '4px 12px', background: 'rgba(255,255,255,0.2)', borderRadius: '20px', fontSize: '12px', color: '#fff', fontWeight: 600 }}>Version {APP_VERSION} {APP_RELEASE_CHANNEL}</div>
        </div>

        {/* Content */}
        <div style={{ padding: '30px', overflowY: 'auto', color: isDark ? '#f8fafc' : '#1e293b' }}>
          <section style={{ marginBottom: '25px' }}>
            <h3 style={{ fontSize: '14px', textTransform: 'uppercase', color: isDark ? '#94a3b8' : '#64748b', marginBottom: '12px', letterSpacing: '0.05em' }}>About this project</h3>
            <p style={{ fontSize: '14px', lineHeight: 1.6, margin: 0, opacity: 0.9 }}>
              GreenPeas is a desktop DNA sequence processing suite built with high-performance Rust and modern React.
              Designed for molecular biologists who need a fast, precise, and visual-first tool for sequence management.
            </p>
            <p style={{ fontSize: '12px', lineHeight: 1.6, margin: '12px 0 0', opacity: 0.7 }}>
              GreenPeas is open-source software distributed under the MIT License. Third-party components remain governed by their respective licenses included with the app distribution.
            </p>
          </section>

          <section style={{ marginBottom: '25px' }}>
             <h3 style={{ fontSize: '14px', textTransform: 'uppercase', color: isDark ? '#94a3b8' : '#64748b', marginBottom: '12px', letterSpacing: '0.05em' }}>Selected Open Source Components</h3>
             <div style={{ backgroundColor: isDark ? 'rgba(0,0,0,0.2)' : '#f8fafc', borderRadius: '12px', border: `1px solid ${isDark ? '#334155' : '#e2e8f0'}`, padding: '10px' }}>
                {LIBRARIES.map((lib, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px', borderBottom: i === LIBRARIES.length - 1 ? 'none' : `1px solid ${isDark ? '#334155' : '#e2e8f0'}` }}>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: '14px' }}>{lib.name}</div>
                      <div style={{ fontSize: '12px', opacity: 0.6 }}>{lib.license}</div>
                    </div>
                    <button onClick={() => void openUrl(lib.url)} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#3b82f6', padding: 0, fontSize: '13px', fontWeight: 600 }}>
                      Link
                    </button>
                  </div>
                ))}
             </div>
          </section>

        </div>

        <div style={{ padding: '20px', textAlign: 'center', fontSize: '12px', color: isDark ? '#64748b' : '#94a3b8', borderTop: `1px solid ${isDark ? '#334155' : '#e2e8f0'}` }}>
          Copyright © 2026 Ryuki Abiru · MIT License
        </div>
      </div>
      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
};
