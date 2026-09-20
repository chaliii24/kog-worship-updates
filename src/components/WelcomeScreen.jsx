import React, { useRef } from 'react';
import { Plus, Square, Folder, ArrowUpRight } from 'lucide-react';
import { motion } from 'motion/react';

function Word({ C, size = 2.5 }) {
  return (
    <span style={{ fontFamily: 'system-ui, sans-serif', fontSize: `${size}rem`, fontWeight: 900, letterSpacing: '-0.03em', display: 'inline-block', lineHeight: 1.05 }}>
      {'KOGWorship'.split('').map((c, i) => (
        <motion.span
          key={i}
          initial={{ opacity: 0, y: 26, filter: 'blur(10px)' }}
          animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
          transition={{ delay: 0.15 + i * 0.05, type: 'spring', stiffness: 320, damping: 26 }}
          style={{ display: 'inline-block', color: i < 3 ? '#ffffff' : C.accLine, willChange: 'transform' }}
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
      background: 'linear-gradient(180deg, #3b82f6, #2563eb)',
      color: '#ffffff',
      boxShadow: '0 10px 30px rgba(59,130,246,0.35)',
    },
    ghost: {
      ...base,
      border: '1px solid rgba(129,140,248,0.35)',
      background: 'rgba(129,140,248,0.05)',
      color: '#e5e7eb',
      boxShadow: 'none',
    },
    muted: {
      ...base,
      border: '1px solid rgba(255,255,255,0.08)',
      background: 'transparent',
      color: '#9ca3af',
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
  const recentShows = [...(services || [])].sort((a, b) => String(b.date || '').localeCompare(String(a.date || ''))).slice(0, 6);

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
      style={{ position: 'fixed', inset: 0, background: '#050509', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', zIndex: 9998, fontFamily: 'system-ui, sans-serif', color: C.text, overflowY: 'auto', padding: 24, boxSizing: 'border-box' }}
    >
      {/* Ambient top glow */}
      <div style={{ position: 'absolute', top: -180, left: '50%', width: 760, height: 420, transform: 'translateX(-50%)', background: `radial-gradient(closest-side, ${C.accLine}1f, transparent 70%)`, filter: 'blur(44px)', pointerEvents: 'none', zIndex: 0 }} />

      {/* Cursor-tracking spotlight flash */}
      <div ref={spotRef} style={{ position: 'fixed', left: -520, top: -520, width: 520, height: 520, borderRadius: '50%', background: 'radial-gradient(circle, rgba(129,140,248,0.10) 0%, transparent 65%)', pointerEvents: 'none', zIndex: 0 }} />

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
          <FlashButton onClick={onOpenSavedShows} variant="muted" icon={<Folder size={15} />}>Open a Saved Show</FlashButton>
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
                  whileHover={{ x: 4, backgroundColor: 'rgba(129,140,248,0.08)' }}
                  onClick={() => onOpenRecent(svc.id)}
                  style={{ textAlign: 'left', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', color: C.text, padding: '10px 13px', borderRadius: 10, cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, transition: 'backgroundColor 0.2s ease' }}
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

        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.3, duration: 0.6 }} style={{ fontSize: 11, color: C.faint, marginTop: 30 }}>
          Designed &amp; Built by <span style={{ color: '#f3f4f6', fontWeight: 700 }}>Charles Arradaza</span>
        </motion.div>
      </motion.div>
    </motion.div>
  );
}