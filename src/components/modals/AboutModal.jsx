import React from 'react';
import { motion } from 'motion/react';
import { modalOverlay, modalPanel, stubTap } from '../../lib/anim';
import logoImage from '../../assets/logo.png';

// Product card only — the updater used to live here; it moved to
// Settings → Application. No dead buttons: the User Guide stub is gone too.
const HIGHLIGHTS = [
  ['Medleys & Arrangements', 'Chain songs into one continuous flow, or reorder any song per service — verses, choruses, repeats.'],
  ['Live outputs', 'Projector, stage and monitor feeds with DeckLink SDI, edge blending and per-output aspects.'],
  ['Sermon layer', 'Drive PowerPoint beneath the lyrics with a crossfade — no minimize, no flash.'],
  ['Countdown & Scripture', 'Synced timers on every screen, offline Bible lookup, and a LAN remote for phones.'],
];

export default function AboutModal({ C, ACCENT, PINK, version, onClose }) {
  return (
    <motion.div {...modalOverlay} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 9999 }} onClick={onClose}>
      <motion.div {...modalPanel} onClick={(e) => e.stopPropagation()} style={{ background: C.panel, border: '1px solid var(--ui-border2)', borderRadius: '16px', width: '520px', maxWidth: '92vw', maxHeight: 'calc(100vh - 80px)', overflowY: 'auto', padding: 0, boxSizing: 'border-box', overflow: 'hidden' }}>
        {/* Banner */}
        <div style={{ background: 'radial-gradient(130% 160% at 20% 0%, rgba(139,92,246,0.35), rgba(139,92,246,0.05) 55%, transparent 80%), var(--ui-elev)', borderBottom: '1px solid var(--ui-border)', padding: '26px 26px 20px 26px', display: 'flex', alignItems: 'center', gap: 14 }}>
          <img src={logoImage} alt="KOGWorship" style={{ width: 56, height: 56, objectFit: 'contain', borderRadius: 12 }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <h2 style={{ margin: 0, fontSize: 22, fontWeight: 900, letterSpacing: 0.4 }}>KOG<span style={{ color: PINK }}>Worship</span></h2>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
              <span style={{ fontSize: 11, fontWeight: 800, color: '#fff', background: ACCENT, borderRadius: 999, padding: '2px 10px' }}>v{version}</span>
              <span style={{ fontSize: 11.5, color: C.muted, fontWeight: 600 }}> Presentation Suite</span>
            </div>
          </div>
        </div>

        <div style={{ padding: '18px 26px 24px 26px' }}>
          <p style={{ fontSize: 13, lineHeight: 1.7, color: C.text2, margin: '0 0 16px 0' }}>
            Built for zero-distraction Sundays: plan the service, project every lyric and verse with confidence, and keep the stage in sync — all from one machine.
          </p>

          <div style={{ display: 'grid', gap: 8 }}>
            {HIGHLIGHTS.map(([title, desc]) => (
              <div key={title} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                <span style={{ width: 7, height: 7, borderRadius: 999, background: ACCENT, marginTop: 6, flexShrink: 0 }} />
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 800, color: C.text }}>{title}</div>
                  <div style={{ fontSize: 12, color: C.text2, lineHeight: 1.6 }}>{desc}</div>
                </div>
              </div>
            ))}
          </div>

          <div style={{ fontSize: 12, color: C.faint2, lineHeight: 1.7, marginTop: 16 }}>
            Designed and developed by <b style={{ color: C.text2 }}>Charles Darius Arradaza</b>, a servant of God.
          </div>
          <div style={{ fontSize: 11.5, color: C.faint2, marginTop: 6 }}>
            Updates live in Settings → Application.
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 18 }}>
            <motion.button {...stubTap} onClick={onClose} style={{ background: ACCENT, border: 'none', color: '#fff', padding: '10px 26px', borderRadius: '8px', fontSize: '13px', fontWeight: 700, cursor: 'pointer' }}>Close</motion.button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
