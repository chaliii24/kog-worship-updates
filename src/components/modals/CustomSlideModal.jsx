import React from 'react';
import { motion } from 'motion/react';
import { modalOverlay, modalPanel, stubTap } from '../../lib/anim';

export default function CustomSlideModal({ C, ACCENT, newSlideData, setNewSlideData, onCancel, onAdd }) {
  return (
    <motion.div {...modalOverlay} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 9999 }}>
      <motion.div {...modalPanel} style={{ background: C.panel, border: '1px solid var(--ui-border2)', borderRadius: '14px', width: '440px', maxWidth: '92vw', maxHeight: 'calc(100vh - 80px)', overflowY: 'auto', padding: '22px', boxSizing: 'border-box' }}>
        <h2 style={{ margin: '0 0 16px 0', fontSize: '16px', fontWeight: '800' }}>Add Non-Song Slide</h2>
        <div style={{ display: 'grid', gap: '14px', marginBottom: '20px' }}>
          <div>
            <label style={{ fontSize: '11px', fontWeight: '700', color: C.faint, textTransform: 'uppercase', display: 'block', marginBottom: '4px' }}>Slide Title / Header</label>
            <input type="text" value={newSlideData.title} onChange={(e) => setNewSlideData({ ...newSlideData, title: e.target.value })} style={{ width: '100%', background: C.elevated2, border: '1px solid var(--ui-border2)', borderRadius: '8px', padding: '10px', color: C.text, fontSize: '14px', outline: 'none' }} />
          </div>
          <div>
            <label style={{ fontSize: '11px', fontWeight: '700', color: C.faint, textTransform: 'uppercase', display: 'block', marginBottom: '4px' }}>Category / Subtitle</label>
            <input type="text" value={newSlideData.subtitle} onChange={(e) => setNewSlideData({ ...newSlideData, subtitle: e.target.value })} style={{ width: '100%', background: C.elevated2, border: '1px solid var(--ui-border2)', borderRadius: '8px', padding: '10px', color: C.text, fontSize: '14px', outline: 'none' }} />
          </div>
          <div>
            <label style={{ fontSize: '11px', fontWeight: '700', color: C.faint, textTransform: 'uppercase', display: 'block', marginBottom: '4px' }}>Slide Content / Text</label>
            <textarea rows={4} value={newSlideData.content} onChange={(e) => setNewSlideData({ ...newSlideData, content: e.target.value })} placeholder="Type announcement or scripture text..." style={{ width: '100%', background: C.elevated2, border: '1px solid var(--ui-border2)', borderRadius: '8px', padding: '10px', color: C.text, fontSize: '14px', outline: 'none', resize: 'vertical' }} />
          </div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
          <motion.button {...stubTap} onClick={onCancel} style={{ background: C.border, border: 'none', color: C.text, padding: '10px 16px', borderRadius: '8px', fontSize: '13px', cursor: 'pointer' }}>Cancel</motion.button>
          <motion.button {...stubTap} onClick={onAdd} style={{ background: ACCENT, border: 'none', color: C.text, padding: '10px 20px', borderRadius: '8px', fontSize: '13px', fontWeight: '700', cursor: 'pointer' }}>Add to Service Plan</motion.button>
        </div>
      </motion.div>
    </motion.div>
  );
}
