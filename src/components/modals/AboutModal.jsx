import React from 'react';
import { RefreshCw, BookOpen, Download, RotateCw } from 'lucide-react';
import { motion } from 'motion/react';
import { modalOverlay, modalPanel, stubTap } from '../../lib/anim';
import logoImage from '../../assets/logo.png';

const FEATURES = [
  ['Scripture Browser', 'Fast 3-column Bible lookup with support for custom offline translations.'],
  ['Service Order Planner', 'Flexible playlist management for songs, presentations, and local media.'],
  ['Multi-Display Control', 'Independent output routing for main projectors, side displays, and stage confidence monitors.']
];

function formatBytes(bytes) {
  if (!bytes || bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return (bytes / Math.pow(1024, i)).toFixed(1) + ' ' + units[i];
}

function formatSpeed(bytesPerSec) {
  if (!bytesPerSec) return '';
  return formatBytes(bytesPerSec) + '/s';
}

export default function AboutModal({ C, ACCENT, PINK, version, status, updateReady, updateProgress, onCheckUpdates, onDownloadUpdate, onInstallUpdate, onOpenGuide, onClose }) {
  return (
    <motion.div {...modalOverlay} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 9999 }} onClick={onClose}>
      <motion.div {...modalPanel} onClick={(e) => e.stopPropagation()} style={{ background: C.panel, border: '1px solid var(--ui-border2)', borderRadius: '14px', width: '540px', maxWidth: '92vw', maxHeight: 'calc(100vh - 80px)', overflowY: 'auto', padding: '24px', boxSizing: 'border-box' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <img src={logoImage} alt="KOGWorship" style={{ width: 44, height: 44, objectFit: 'contain', borderRadius: '9px' }} />
          <div>
            <h2 style={{ margin: 0, fontSize: '20px', fontWeight: 900, letterSpacing: 0.4 }}>KOG<span style={{ color: PINK }}>Worship</span></h2>
            <div style={{ fontSize: '12px', color: C.muted, fontWeight: 700, marginTop: 2 }}>Version {version}</div>
          </div>
        </div>

        <p style={{ fontSize: '13px', lineHeight: 1.7, color: C.text2, margin: '16px 0 0 0' }}>
          KOGWorship is a modern, reliable worship presentation software designed for seamless service management, live media playback, and multi-display projection control.
        </p>

        <h3 style={{ fontSize: '11.5px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: 1.2, color: C.accLine, margin: '22px 0 10px 0' }}>Core Features</h3>
        <div style={{ display: 'grid', gap: '8px' }}>
          {FEATURES.map(([title, desc]) => (
            <div key={title} style={{ background: C.elevated2, border: '1px solid var(--ui-border2)', borderRadius: '8px', padding: '10px 14px' }}>
              <div style={{ fontSize: '12.5px', fontWeight: 800 }}>{title}</div>
              <div style={{ fontSize: '12px', color: C.text2, marginTop: 3, lineHeight: 1.6 }}>{desc}</div>
            </div>
          ))}
        </div>

        <h3 style={{ fontSize: '11.5px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: 1.2, color: C.accLine, margin: '22px 0 10px 0' }}>Credits</h3>
        <p style={{ fontSize: '13px', lineHeight: 1.7, color: C.text2, margin: 0 }}>
          Designed and Developed by Charles Darius Arradaza, a servant of God.
        </p>

        {updateProgress && (
          <div style={{ marginTop: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: C.muted, marginBottom: '6px' }}>
              <span>{formatBytes(updateProgress.transferred)} of {formatBytes(updateProgress.total)}</span>
              <span>{Math.round(updateProgress.percent)}%</span>
            </div>
            <div style={{ width: '100%', height: '6px', background: C.elevated2, borderRadius: '3px', overflow: 'hidden' }}>
              <div style={{ width: `${updateProgress.percent}%`, height: '100%', background: ACCENT, borderRadius: '3px', transition: 'width 0.3s ease' }} />
            </div>
            {updateProgress.bytesPerSecond > 0 && (
              <div style={{ fontSize: '11px', color: C.muted, marginTop: '4px', textAlign: 'center' }}>{formatSpeed(updateProgress.bytesPerSecond)}</div>
            )}
          </div>
        )}

        {status && !updateProgress && (
          <div style={{ marginTop: '16px', fontSize: '12px', color: C.muted, textAlign: 'center' }}>{status}</div>
        )}

        {updateReady === 'downloaded' && (
          <div style={{ marginTop: '12px', textAlign: 'center' }}>
            <motion.button {...stubTap} onClick={onInstallUpdate} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: ACCENT, border: 'none', color: '#fff', padding: '10px 20px', borderRadius: '8px', fontSize: '13px', fontWeight: 700, cursor: 'pointer' }}>
              <RotateCw size={13} /> Restart & Install
            </motion.button>
          </div>
        )}

<div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '22px', flexWrap: 'wrap' }}>
          {updateReady === 'available' && !updateProgress && (
            <motion.button {...stubTap} onClick={onDownloadUpdate} style={{ display: 'flex', alignItems: 'center', gap: 6, background: ACCENT, border: 'none', color: '#fff', padding: '10px 16px', borderRadius: '8px', fontSize: '13px', fontWeight: 700, cursor: 'pointer' }}>
              <Download size={13} /> Download Update
            </motion.button>
          )}
          <motion.button {...stubTap} onClick={onCheckUpdates} style={{ display: 'flex', alignItems: 'center', gap: 6, background: C.elevated2, border: '1px solid var(--ui-border2)', color: C.text, padding: '10px 16px', borderRadius: '8px', fontSize: '13px', fontWeight: 700, cursor: 'pointer' }}>
            <RefreshCw size={13} /> Check for Updates
          </motion.button>
          <motion.button {...stubTap} onClick={onOpenGuide} style={{ display: 'flex', alignItems: 'center', gap: 6, background: C.elevated2, border: '1px solid var(--ui-border2)', color: C.text, padding: '10px 16px', borderRadius: '8px', fontSize: '13px', fontWeight: 700, cursor: 'pointer' }}>
            <BookOpen size={13} /> User Guide
          </motion.button>
          <motion.button {...stubTap} onClick={onClose} style={{ background: ACCENT, border: 'none', color: '#fff', padding: '10px 20px', borderRadius: '8px', fontSize: '13px', fontWeight: 700, cursor: 'pointer' }}>Close</motion.button>
        </div>
      </motion.div>
    </motion.div>
  );
}
