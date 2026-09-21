import React from 'react';
import { Plus, ListVideo, Presentation, Radio, Film, Music, BookOpen, Monitor, Settings } from 'lucide-react';
import { motion } from 'motion/react';

const ICON_MAP = {
  'list-video': ListVideo,
  'presentation': Presentation,
  'radio': Radio,
  'film': Film,
  'music': Music,
  'book-open': BookOpen,
  'monitor': Monitor,
  'settings': Settings,
};

export default function BottomDock({ C, PINK, dockItems, dockTab, onSelect, onNewSong, activeId }) {
  const currentId = activeId ?? dockTab;
  return (
    <motion.div className="dock-shell" initial={{ y: 64, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ type: 'spring', stiffness: 240, damping: 24, delay: 0.2 }} style={{ height: 56, flexShrink: 0, background: C.panel, borderTop: '1px solid #23233a', display: 'flex', alignItems: 'center', padding: '0 8px', gap: 2 }}>
      {dockItems.map(item => {
        const active = currentId === item.id;
        const Icon = ICON_MAP[item.iconId] || Settings;
        return (
          <motion.button
            key={item.id}
            className="dock-btn"
            data-active={active ? '1' : '0'}
            whileHover={{ y: -2, scale: 1.04 }}
            whileTap={{ scale: 0.94 }}
            onClick={() => onSelect(item)}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 3,
              minWidth: 62,
              height: 48,
              borderRadius: 10,
              cursor: 'pointer',
              background: active ? 'rgba(255,79,163,0.1)' : 'transparent',
              border: 'none',
              color: active ? PINK : C.muted,
              transition: 'color 0.15s, background 0.15s',
            }}
          >
            <Icon size={18} strokeWidth={active ? 2.4 : 1.8} />
            <span style={{ fontSize: 10, fontWeight: active ? 800 : 600, letterSpacing: 0.3, lineHeight: 1 }}>{item.label}</span>
          </motion.button>
        );
      })}
      <div style={{ flex: 1 }} />
      <motion.button
        whileHover={{ y: -2, scale: 1.03 }}
        whileTap={{ scale: 0.96 }}
        transition={{ type: 'spring', stiffness: 500, damping: 32 }}
        onClick={onNewSong}
        title="Add a new song to the library"
        className="dock-cta"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          background: C.elevated2,
          border: '1px solid ' + PINK,
          color: PINK,
          borderRadius: 8,
          padding: '7px 14px',
          fontSize: 11.5,
          fontWeight: 700,
          cursor: 'pointer',
          whiteSpace: 'nowrap',
        }}
      >
        <Plus size={14} strokeWidth={2.5} /> New Song
      </motion.button>
    </motion.div>
  );
}
