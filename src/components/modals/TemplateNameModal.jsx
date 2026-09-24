import React from 'react';
import { LayoutGrid } from 'lucide-react';
import { motion } from 'motion/react';
import { modalOverlay, modalPanel, stubTap } from '../../lib/anim';

export default function TemplateNameModal({ C, ACCENT, value, setValue, onCancel, onConfirm }) {
  return (
    <motion.div {...modalOverlay} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 9999 }}>
      <motion.div {...modalPanel} style={{ background: C.panel, border: '1px solid var(--ui-border2)', borderRadius: '14px', width: '380px', maxWidth: '92vw', padding: '22px', boxSizing: 'border-box' }}>
        <h2 style={{ margin: '0 0 14px 0', fontSize: '16px', fontWeight: '800', display: 'flex', alignItems: 'center', gap: '8px' }}><LayoutGrid size={16} color={C.accLine} /> Save as Template</h2>
        <input
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') onConfirm(); }}
          placeholder="e.g. Sunday Worship Template"
          autoFocus
          style={{ width: '100%', background: C.elevated2, border: '1px solid var(--ui-border2)', borderRadius: '8px', padding: '10px', color: C.text, fontSize: '14px', outline: 'none', marginBottom: '20px' }}
        />
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
          <motion.button {...stubTap} onClick={onCancel} style={{ background: C.border, border: 'none', color: C.text, padding: '10px 16px', borderRadius: '8px', fontSize: '13px', cursor: 'pointer' }}>Cancel</motion.button>
          <motion.button {...stubTap} onClick={onConfirm} style={{ background: ACCENT, border: 'none', color: C.text, padding: '10px 20px', borderRadius: '8px', fontSize: '13px', fontWeight: '700', cursor: 'pointer' }}>Save Template</motion.button>
        </div>
      </motion.div>
    </motion.div>
  );
}
