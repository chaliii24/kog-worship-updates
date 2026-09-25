import React from 'react';
import { HelpCircle } from 'lucide-react';
import { motion } from 'motion/react';
import { modalOverlay, modalPanel, stubTap } from '../../lib/anim';

const SHORTCUTS = [
  ['Space / →', 'Advance to the next slide'],
  ['←', 'Go to previous slide (or song title card)'],
  ['L', 'Clear the lyrics, keep the background'],
  ['B', 'Clear all output (words and background)'],
  ['?', 'Toggle this shortcut guide'],
  ['Click a slide', 'Send it live to projector'],
  ['★ star', 'Favorite a song for quick access']
];

export default function HotkeysModal({ C, ACCENT, onClose }) {
  return (
    <motion.div {...modalOverlay} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 9999 }} onClick={onClose}>
      <motion.div {...modalPanel} onClick={(e) => e.stopPropagation()} style={{ background: C.panel, border: '1px solid var(--ui-border2)', borderRadius: '14px', width: '420px', maxWidth: '92vw', maxHeight: 'calc(100vh - 80px)', overflowY: 'auto', padding: '22px', boxSizing: 'border-box' }}>
        <h2 style={{ margin: '0 0 14px 0', fontSize: '16px', fontWeight: '800', display: 'flex', alignItems: 'center', gap: '8px' }}><HelpCircle size={16} color={C.accLine} /> Keyboard Shortcuts</h2>
        <div style={{ display: 'grid', gap: '8px', marginBottom: '22px' }}>
          {SHORTCUTS.map(([key, desc]) => (
            <div key={key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: C.elevated2, border: '1px solid var(--ui-border2)', borderRadius: '8px', padding: '10px 14px' }}>
              <code style={{ background: C.input, border: '1px solid ' + ACCENT, color: C.accLine, padding: '3px 10px', borderRadius: '5px', fontSize: '12px', fontWeight: '700', fontFamily: 'monospace' }}>{key}</code>
              <span style={{ fontSize: '12px', color: C.text2 }}>{desc}</span>
            </div>
          ))}
        </div>
<div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <motion.button {...stubTap} onClick={onClose} style={{ background: ACCENT, border: 'none', color: C.text, padding: '10px 20px', borderRadius: '8px', fontSize: '13px', fontWeight: '700', cursor: 'pointer' }}>Close</motion.button>
        </div>
      </motion.div>
    </motion.div>
  );
}
