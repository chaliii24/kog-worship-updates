import React from 'react';
import { Plus } from 'lucide-react';
import { motion } from 'motion/react';

export default function BottomDock({ C, PINK, dockItems, dockTab, viewMode, onSelect, onNewSong, activeId }) {
  const currentId = activeId ?? dockTab;
  return (
    <motion.div className="dock-shell" initial={{ y: 64, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ type: 'spring', stiffness: 240, damping: 24, delay: 0.2 }} style={{ height: 54, flexShrink: 0, background: C.panel, borderTop: '1px solid #23233a', display: 'flex', alignItems: 'center', padding: '0 12px', gap: 4 }}>
      {dockItems.map(item => {
        const active = currentId === item.id && viewMode === 'show';
        return (
          <motion.button key={item.id} className="dock-btn" data-active={active ? '1' : '0'} whileHover={{ y: -3 }} whileTap={{ scale: 0.94 }} onClick={() => onSelect(item)} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2, minWidth: 58, height: 46, borderRadius: 10, cursor: 'pointer' }}>
            <span className="dock-icon" style={{ fontSize: 15, lineHeight: 1 }}>{item.icon}</span>
            <span style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: 0.3 }}>{item.label}</span>
          </motion.button>
        );
      })}
      <div style={{ flex: 1 }} />
      <motion.button {...{ whileHover: { y: -2 }, whileTap: { scale: 0.96 }, transition: { type: 'spring', stiffness: 500, damping: 32 } }} onClick={onNewSong} title="Add a new song to the library" className="dock-cta" style={{ display: 'flex', alignItems: 'center', gap: 6, background: C.elevated2, border: '1px solid ' + PINK, color: PINK, borderRadius: 8, padding: '6px 12px', fontSize: 11, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}><Plus size={13} /> New Song</motion.button>
    </motion.div>
  );
}
