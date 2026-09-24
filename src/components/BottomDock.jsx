import React, { useState } from 'react';
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

const tooltipVariants = {
  hidden: { opacity: 0, y: 8 },
  show: { opacity: 1, y: 0 },
};

function DockTooltip({ label, children }) {
  const [open, setOpen] = useState(false);
  return (
    <motion.div
      className="dock-tip-wrap"
      onHoverStart={() => setOpen(true)}
      onHoverEnd={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
      whileHover={{ y: -8, scale: 1.15 }}
      whileTap={{ scale: 0.9 }}
      transition={{ type: 'spring', stiffness: 400, damping: 17 }}
      style={{ position: 'relative', display: 'inline-flex' }}
    >
      {children}
      {open && (
        <motion.span
          className="dock-tip"
          variants={tooltipVariants}
          initial="hidden"
          animate="show"
          transition={{ duration: 0.18 }}
        >
          {label}
        </motion.span>
      )}
    </motion.div>
  );
}

export default function BottomDock({ C, PINK, dockItems, dockTab, onSelect, onNewSong, activeId }) {
  const currentId = activeId ?? dockTab;
  return (
    <motion.div
      className="dock-shell"
      initial={{ y: 64, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.5, delay: 0.2 }}
      style={{
        height: 56,
        flexShrink: 0,
        background: C.panel,
        borderTop: '1px solid var(--ui-border2)',
        display: 'flex',
        alignItems: 'center',
        padding: '0 8px',
        gap: 2,
      }}
    >
      {dockItems.map(item => {
        const active = currentId === item.id;
        const Icon = ICON_MAP[item.iconId] || Settings;
        return (
          <DockTooltip key={item.id} label={item.label}>
            <button
              className="dock-btn"
              data-active={active ? '1' : '0'}
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
                background: 'transparent',
                border: '1px solid transparent',
                color: active ? '#93C5FD' : C.muted,
              }}
            >
              <Icon size={18} strokeWidth={active ? 2.4 : 1.8} />
              <span style={{ fontSize: 10, fontWeight: active ? 800 : 600, letterSpacing: 0.3, lineHeight: 1 }}>{item.label}</span>
            </button>
          </DockTooltip>
        );
      })}
      <div style={{ flex: 1 }} />
      <DockTooltip label="New Song">
        <motion.button
          whileHover={{ scale: 1.03, y: -2 }}
          whileTap={{ scale: 0.96 }}
          transition={{ type: 'spring', stiffness: 500, damping: 32 }}
          onClick={onNewSong}
          className="dock-cta"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            background: 'rgba(59,130,246,0.08)',
            border: '1px solid rgba(96,165,250,0.55)',
            color: '#93C5FD',
            borderRadius: 8,
            padding: '7px 14px',
            fontSize: 11.5,
            fontWeight: 700,
            cursor: 'pointer',
            whiteSpace: 'nowrap',
            boxShadow: '0 0 14px rgba(59,130,246,0.22)',
          }}
        >
          <Plus size={14} strokeWidth={2.5} /> New Song
        </motion.button>
      </DockTooltip>
    </motion.div>
  );
}
