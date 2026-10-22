import React, { useState } from 'react';
import { ListVideo, Presentation, Film, Music, BookOpen, Monitor, Settings, Timer, FileText, Mic, Clapperboard, Smartphone } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { DOCK_KIND, iconHue } from '../lib/icons';
import RemoteMenu from './modals/RemoteMenu';

const ICON_MAP = {
  'list-video': ListVideo,
  'presentation': Presentation,
  'film': Film,
  'clapperboard': Clapperboard,
  'music': Music,
  'book-open': BookOpen,
  'monitor': Monitor,
  'timer': Timer,
  'mic': Mic,
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

export default function BottomDock({ C, PINK, ACCENT, dockItems, dockTab, onSelect, activeId, iconTheme, onOutputs, outputDisplays, selectedOutputDisplay, selectOutputDisplay }) {
  const currentId = activeId ?? dockTab;
  const [remoteOpen, setRemoteOpen] = useState(false);
  const acc = ACCENT || C.heading;
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
        // Prism Slate: each tab's icon keeps its function hue in every state;
        // the active tab still reads through the bold label. Mono keeps the
        // old muted/purple behavior.
        const prism = iconTheme === 'prism';
        const iconColor = prism ? iconHue(DOCK_KIND[item.iconId], C) : (active ? '#FFC72C' : C.muted);
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
                color: prism ? C.text2 : (active ? '#FFC72C' : C.muted),
              }}
            >
              <Icon size={18} strokeWidth={active ? 2.4 : 1.8} color={iconColor} />
              <span style={{ fontSize: 10, fontWeight: active ? 800 : 600, letterSpacing: 0.3, lineHeight: 1 }}>{item.label}</span>
            </button>
          </DockTooltip>
        );
      })}
      <div style={{ flex: 1 }} />
      {/* OUTPUT CLUSTER — moved down from the top bar so the header stays a
          slim brand + status strip and the full height goes to workspace. */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
        <motion.button whileTap={{ scale: 0.94 }} onClick={onOutputs} title="Projector outputs" style={{ background: C.elevated2, border: '1px solid var(--ui-border2)', color: C.heading, padding: '6px 10px', borderRadius: 8, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5, fontSize: 11.5, fontWeight: 700 }}>
          <Monitor size={13} color={iconTheme === 'prism' ? iconHue('outputs', C) : undefined} /> Outputs
        </motion.button>
        <div style={{ position: 'relative' }}>
          <motion.button whileTap={{ scale: 0.94 }} onClick={() => setRemoteOpen(v => !v)} title="Phone remote (LAN)" style={{ background: remoteOpen ? C.elevated : C.elevated2, border: `1px solid ${remoteOpen ? acc : C.border2}`, color: remoteOpen ? acc : C.heading, padding: '6px 10px', borderRadius: 8, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5, fontSize: 11.5, fontWeight: 700 }}>
            <Smartphone size={13} color={iconTheme === 'prism' ? iconHue('remote', C) : undefined} /> Remote
          </motion.button>
          {remoteOpen && <div onClick={() => setRemoteOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 399 }} />}
          <AnimatePresence>
            {remoteOpen && <RemoteMenu key="remote" C={C} ACCENT={acc} dropUp onClose={() => setRemoteOpen(false)} />}
          </AnimatePresence>
        </div>
        <select
          value={selectedOutputDisplay ?? ''}
          onChange={(e) => selectOutputDisplay(e.target.value === '' ? null : Number(e.target.value))}
          disabled={!outputDisplays || outputDisplays.length === 0}
          title="Choose which display or projector the live output appears on"
          style={{ width: 168, maxWidth: '22vw', background: C.elevated2, border: '1px solid var(--ui-border2)', borderRadius: 8, color: C.text2, fontSize: 11, fontWeight: 600, padding: '6px 8px', cursor: (outputDisplays && outputDisplays.length > 0) ? 'pointer' : 'not-allowed', outline: 'none' }}
        >
          {(!outputDisplays || outputDisplays.length === 0) ? (
            <option value="">No external display detected</option>
          ) : (
            <>
              <option value="">Off — no output window</option>
              {outputDisplays.map(d => (
                <option key={d.id} value={d.id}>
                  {d.label}{d.primary ? ' (Primary)' : ''} · {d.width}×{d.height}
                </option>
              ))}
            </>
          )}
        </select>
      </div>
    </div>
  );
}
