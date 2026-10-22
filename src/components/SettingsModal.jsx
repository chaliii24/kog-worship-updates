import React, { useEffect } from 'react';
import { Settings as SettingsIcon, X } from 'lucide-react';
import { motion } from 'motion/react';
import { modalOverlay, modalPanel } from '../lib/anim';
import SettingsPanel from './SettingsPanel';

// Settings used to be a destination in the left column, which forced every
// preference, library and maintenance control into a 264px strip. It is a
// workspace-level dialog now: the section rail gets room to breathe and the
// content pane can lay controls out on a real page instead of wrapping every
// row. Everything still comes from the same SettingsPanel / App context.
export default function SettingsModal({ C, onClose }) {
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <motion.div
      {...modalOverlay}
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: 'rgba(5,5,9,0.76)', backdropFilter: 'blur(7px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 20, boxSizing: 'border-box',
      }}
    >
      <motion.div
        {...modalPanel}
        role="dialog"
        aria-modal="true"
        aria-label="Settings"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 'min(960px, 96vw)',
          height: 'min(700px, 88vh)',
          display: 'flex',
          flexDirection: 'column',
          background: C.panel,
          border: '1px solid var(--ui-border2)',
          borderRadius: 16,
          overflow: 'hidden',
          boxShadow: '0 30px 90px rgba(0,0,0,0.62)',
        }}
      >
        <header style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '15px 18px', borderBottom: '1px solid var(--ui-border)', flexShrink: 0 }}>
          <span style={{ width: 36, height: 36, borderRadius: 10, background: 'var(--kog-accent-bg)', border: '1px solid rgba(255,184,0,0.35)', color: 'var(--kog-accent-hover)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <SettingsIcon size={18} />
          </span>
          <div style={{ minWidth: 0 }}>
            <h2 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: C.text, lineHeight: 1.2 }}>Settings</h2>
            <p style={{ margin: '3px 0 0 0', fontSize: 11.5, color: C.muted }}>Preferences, library content and app maintenance</p>
          </div>
          <span style={{ flex: 1 }} />
          <button
            type="button"
            onClick={onClose}
            title="Close settings (Esc)"
            aria-label="Close settings"
            style={{ width: 30, height: 30, borderRadius: 8, background: 'transparent', border: '1px solid var(--ui-border2)', color: C.muted, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
          >
            <X size={15} />
          </button>
        </header>
        <SettingsPanel />
      </motion.div>
    </motion.div>
  );
}
