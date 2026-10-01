import React, { useState } from 'react';
import { ListVideo, Presentation, Radio, Film, Music, BookOpen, Monitor, Settings, Timer, FileText } from 'lucide-react';
import { motion } from 'motion/react';

const ICON_MAP = {
  'list-video': ListVideo,
  'presentation': Presentation,
  'radio': Radio,
  'film': Film,
  'music': Music,
  'book-open': BookOpen,
  'monitor': Monitor,
  'timer': Timer,
  'file-text': FileText,
  'settings': Settings,
};

// Opacity ONLY — a `y` variant would make motion write an inline transform
// that wipes out the CSS `translateX(-50%)` centering on .dock-tip, shoving
// the chip sideways under the slide tiles.
const tooltipVariants = {
  hidden: { opacity: 0 },
  show: { opacity: 1 },
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

export default function BottomDock({ C, PINK, dockItems, dockTab, onSelect, activeId }) {
  const currentId = activeId ?? dockTab;
  return (
    // No entrance animation — same as the right panel: the console remounts
    // on boot and on every editor close, and a fade-up with a 0.2s delay
    // flashed a dark strip over this slot on every load.
    <div
      className="dock-shell"
      style={{
        // The slide tiles' internal z-indexes (bg img z1, badges z2) escape
        // to the root stacking context once motion settles to transform:none,
        // so they painted OVER the hover chip above the dock. Lift the whole
        // dock to z10 — above the escaped tile z's, below modals/scrims (z50+).
        position: 'relative',
        zIndex: 10,
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
                color: active ? '#C4B5FD' : C.muted,
              }}
            >
              <Icon size={18} strokeWidth={active ? 2.4 : 1.8} />
              <span style={{ fontSize: 10, fontWeight: active ? 800 : 600, letterSpacing: 0.3, lineHeight: 1 }}>{item.label}</span>
            </button>
          </DockTooltip>
        );
      })}
      <div style={{ flex: 1 }} />
    </div>
  );
}
