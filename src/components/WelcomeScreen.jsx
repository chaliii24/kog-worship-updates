import React, { useRef, useState } from 'react';
import { Plus, Square, Folder, ArrowUpRight, Search, X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

function Word({ C, size = 2.5 }) {
  return (
    <span style={{ fontFamily: 'var(--font-sans)', fontSize: `${size}rem`, fontWeight: 900, letterSpacing: '-0.03em', display: 'inline-block', lineHeight: 1.05 }}>
      {'KOGWorship'.split('').map((c, i) => (
        <motion.span
          key={i}
          initial={{ opacity: 0, y: 26, filter: 'blur(10px)' }}
          animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
          transition={{ delay: 0.15 + i * 0.05, type: 'spring', stiffness: 320, damping: 26 }}
          style={{ display: 'inline-block', color: i < 3 ? 'var(--ui-text)' : C.accLine, willChange: 'transform' }}
        >
          {c}
        </motion.span>
      ))}
    </span>
  );
}

function FlashButton({ children, onClick, variant = 'primary', icon }) {
  const base = {
    position: 'relative',
    overflow: 'hidden',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: '14px 18px',
    borderRadius: 14,
    fontSize: 13.5,
    fontWeight: 800,
    cursor: 'pointer',
    width: '100%',
  };
  const styles = {
    primary: {
      ...base,
      border: 'none',
      background: 'linear-gradient(180deg, #8b5cf6, #7c3aed)',
      color: '#ffffff',
      boxShadow: '0 10px 30px rgba(139,92,246,0.35)',
    },
    ghost: {
      ...base,
      border: '1px solid rgba(167,139,250,0.35)',
      background: 'rgba(167,139,250,0.05)',
      color: 'var(--ui-text2)',
      boxShadow: 'none',
    },
    muted: {
      ...base,
      border: '1px solid var(--ui-blight)',
      background: 'transparent',
      color: 'var(--ui-muted)',
      boxShadow: 'none',
    },
  };
  return (
    <motion.button
      whileHover={{ y: -3 }}
      whileTap={{ scale: 0.97 }}
      transition={{ type: 'spring', stiffness: 420, damping: 24 }}
      onClick={onClick}
      style={styles[variant]}
    >
      {icon}
      {children}
      <motion.span
        initial={{ opacity: 0, x: -90 }}
        whileHover={{ opacity: 1, x: 130 }}
        transition={{ duration: 0.55, ease: 'easeOut' }}
        style={{ position: 'absolute', top: 0, left: 0, width: '40%', height: '100%', background: 'linear-gradient(100deg, transparent, rgba(255,255,255,0.35), transparent)', pointerEvents: 'none' }}
      />
    </motion.button>
  );
}

export default function WelcomeScreen({ services, C, PINK, ACCENT, logoImage, onStartNewShow, onOpenSavedShows, onStartBlank, onOpenRecent }) {
  const spotRef = useRef(null);
  const sortedShows = [...(services || [])].sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
  // Welcome shows a taste (max 3) — the full library lives behind
  // "Open a Saved Show", which pops the browse modal below.
  const recentShows = sortedShows.slice(0, 3);
  const [browseOpen, setBrowseOpen] = useState(false);
  const [browseQuery, setBrowseQuery] = useState('');
  const openBrowse = () => { setBrowseQuery(''); setBrowseOpen(true); };
  const closeBrowse = () => setBrowseOpen(false);
  const q = browseQuery.trim().toLowerCase();
  const browseList = q
    ? sortedShows.filter((s) => `${s.name || ''} ${s.category || ''} ${s.date || ''}`.toLowerCase().includes(q))
    : sortedShows;

  const handleMove = (e) => {
    if (spotRef.current) {
      spotRef.current.style.left = `${e.clientX - 260}px`;
      spotRef.current.style.top = `${e.clientY - 260}px`;
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.4 }}
      onMouseMove={handleMove}
      style={{ position: 'fixed', inset: 0, background: 'var(--ui-bg)', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', zIndex: 9998, fontFamily: 'var(--font-sans)', color: C.text, overflowY: 'auto', padding: 24, boxSizing: 'border-box' }}
    >
      {/* Ambient top glow */}
      <div style={{ position: 'absolute', top: -180, left: '50%', width: 760, height: 420, transform: 'translateX(-50%)', background: `radial-gradient(closest-side, ${C.accLine}1f, transparent 70%)`, filter: 'blur(44px)', pointerEvents: 'none', zIndex: 0 }} />

      {/* Cursor-tracking spotlight flash */}
      <div ref={spotRef} style={{ position: 'fixed', left: -520, top: -520, width: 520, height: 520, borderRadius: '50%', background: 'radial-gradient(circle, rgba(167,139,250,0.10) 0%, transparent 65%)', pointerEvents: 'none', zIndex: 0 }} />

      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.5 }} style={{ position: 'relative', zIndex: 1, width: '100%', maxWidth: 600, textAlign: 'center' }}>
        <motion.div initial={{ opacity: 0, scale: 0.6 }} animate={{ opacity: 1, scale: 1 }} transition={{ type: 'spring', stiffness: 220, damping: 18, delay: 0.05 }} style={{ display: 'inline-block' }}>
          <motion.img animate={{ y: [0, -7, 0] }} transition={{ duration: 4.2, repeat: Infinity, ease: 'easeInOut' }} src={logoImage} alt="KOG Worship Logo" style={{ width: 84, height: 84, objectFit: 'contain', borderRadius: 20, boxShadow: `0 0 44px ${C.accLine}44`, marginBottom: 22 }} />
        </motion.div>
        <Word C={C} />
        <motion.p initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.7, duration: 0.5 }} style={{ fontSize: '0.85rem', color: C.accLine, fontWeight: 700, margin: '12px 0 10px 0', textTransform: 'uppercase', letterSpacing: '5px' }}>Presentation Suite</motion.p>
        <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.85, duration: 0.5 }} style={{ fontSize: 13, color: C.muted, margin: '0 0 6px 0' }}>Start a new show, open a saved one, or begin with a blank workspace.</motion.p>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, maxWidth: 460, margin: '30px auto 0 auto' }}>
          <FlashButton onClick={onStartNewShow} variant="primary" icon={<Plus size={16} />}>Start a New Show</FlashButton>
          <FlashButton onClick={onStartBlank} variant="ghost" icon={<Square size={14} />}>Start Blank</FlashButton>
        </div>
        <div style={{ maxWidth: 460, margin: '10px auto 0 auto' }}>
          <FlashButton onClick={openBrowse} variant="muted" icon={<Folder size={15} />}>Open a Saved Show</FlashButton>
        </div>

        {recentShows.length > 0 && (
          <div style={{ maxWidth: 460, margin: '26px auto 0 auto', textAlign: 'left' }}>
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 1.0, duration: 0.5 }} style={{ fontSize: 10.5, fontWeight: 800, color: C.faint, textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 8 }}>Recent Shows</motion.div>
            <div style={{ display: 'grid', gap: 6 }}>
              {recentShows.map(svc => (
                <motion.button
                  key={svc.id}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 1.1 + recentShows.indexOf(svc) * 0.06, duration: 0.4 }}
                  whileHover={{ x: 4, backgroundColor: 'rgba(167,139,250,0.08)' }}
                  onClick={() => onOpenRecent(svc.id)}
                  style={{ textAlign: 'left', background: 'rgba(255,255,255,0.02)', border: '1px solid var(--ui-blight)', color: C.text, padding: '10px 13px', borderRadius: 10, cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, transition: 'backgroundColor 0.2s ease' }}
                >
                  <span style={{ minWidth: 0 }}>
                    <span style={{ fontWeight: 700, fontSize: 12.5, display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{svc.name}</span>
                    <span style={{ fontSize: 10.5, color: C.faint }}>{svc.category || 'Worship'} • {svc.date || ''}</span>
                  </span>
                  <ArrowUpRight size={14} style={{ color: C.accLine, flexShrink: 0 }} />
                </motion.button>
              ))}
            </div>
          </div>
        )}

      </motion.div>

      {/* ===== SAVED-SHOWS BROWSER — "Open a Saved Show" pops this instead of
          jumping straight into the workspace. Same row look as Recent Shows,
          plus search; picking one loads it via the usual path. Esc or the
          backdrop dismisses. The footer link keeps the old jump-to-library
          behaviour one click away. */}
      <AnimatePresence>
        {browseOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.16 }}
            onClick={(e) => { if (e.target === e.currentTarget) closeBrowse(); }}
            onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); closeBrowse(); } }}
            style={{ position: 'fixed', inset: 0, zIndex: 10001, background: 'rgba(5,5,9,0.72)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
          >
            <motion.div
              initial={{ scale: 0.96, y: 10 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.97, opacity: 0 }}
              transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
              role="dialog"
              aria-modal="true"
              aria-label="Open a saved show"
              style={{ width: 'min(520px, 100%)', maxHeight: 'min(560px, 86vh)', display: 'flex', flexDirection: 'column', background: C.panel, border: '1px solid var(--ui-border2)', borderRadius: 14, boxShadow: '0 24px 70px rgba(0,0,0,0.55)', padding: '18px 18px 14px 18px' }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0, marginBottom: 12 }}>
                <span style={{ fontSize: 15, fontWeight: 800, color: C.text }}>Saved Shows{browseList.length ? ` · ${browseList.length}` : ''}</span>
                <span style={{ flex: 1 }} />
                <button onClick={closeBrowse} title="Close (Esc)" style={{ background: 'transparent', border: '1px solid var(--ui-border2)', color: C.muted, borderRadius: 8, padding: 6, cursor: 'pointer', display: 'flex' }}><X size={14} /></button>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: C.input, border: '1px solid var(--ui-border2)', borderRadius: 9, padding: '9px 12px', flexShrink: 0, marginBottom: 10 }}>
                <Search size={14} color={C.faint} style={{ flexShrink: 0 }} />
                <input autoFocus value={browseQuery} onChange={(e) => setBrowseQuery(e.target.value)} onKeyDown={(e) => { if (e.key === 'Escape') closeBrowse(); }} placeholder="Search by name, category, date…" style={{ background: 'transparent', border: 'none', outline: 'none', color: C.text, fontSize: 13, width: '100%' }} />
              </div>
              <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', display: 'grid', gap: 6, alignContent: 'start', paddingRight: 2 }}>
                {browseList.length === 0 ? (
                  <div style={{ fontSize: 12.5, color: C.faint, textAlign: 'center', padding: '26px 10px', lineHeight: 1.7 }}>
                    {q ? 'Nothing matches — try another search.' : 'No saved shows yet. Start a new show and save the plan.'}
                  </div>
                ) : browseList.map((svc) => (
                  <button
                    key={svc.id}
                    onClick={() => onOpenRecent(svc.id)}
                    style={{ textAlign: 'left', background: 'rgba(255,255,255,0.02)', border: '1px solid var(--ui-blight)', color: C.text, padding: '10px 13px', borderRadius: 10, cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}
                  >
                    <span style={{ minWidth: 0 }}>
                      <span style={{ fontWeight: 700, fontSize: 12.5, display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{svc.name}</span>
                      <span style={{ fontSize: 10.5, color: C.faint }}>{svc.category || 'Worship'} • {svc.date || ''}</span>
                    </span>
                    <ArrowUpRight size={14} style={{ color: C.accLine, flexShrink: 0 }} />
                  </button>
                ))}
              </div>
              <button onClick={() => { closeBrowse(); onOpenSavedShows(); }} title="Dismiss and open the full shows library in the workspace" style={{ flexShrink: 0, marginTop: 10, background: 'transparent', border: 'none', color: C.accLine, fontSize: 11.5, fontWeight: 700, cursor: 'pointer', padding: '6px 4px' }}>
                Browse in the full workspace →
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}