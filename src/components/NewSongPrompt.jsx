import React, { useEffect } from 'react';
import { motion } from 'motion/react';
import { Wand2, PenLine, X } from 'lucide-react';
import { modalOverlay, modalPanel, stubTap, iconBtnTap } from '../lib/anim';
import { useApp } from '../context/AppContext';

// The option cards live at module scope — an inline component definition
// would get a fresh identity on every context re-render (the app context
// is a plain object) and remount the buttons mid-hover.
function OptionCard({ mode, Icon, title, desc, tag, accent, C, onChoose }) {
  return (
    <motion.button
      {...stubTap}
      onClick={() => onChoose(mode)}
      style={{ flex: '1 1 215px', display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 7, padding: '15px 16px 13px', background: C.elevated, border: '1px solid var(--ui-border2)', borderRadius: 12, cursor: 'pointer', color: C.text, textAlign: 'left' }}
    >
      <span style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
        <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 30, height: 30, borderRadius: 9, background: 'rgba(59,130,246,0.14)', border: '1px solid rgba(59,130,246,0.32)', flexShrink: 0 }}>
          <Icon size={15} color={accent} />
        </span>
        <span style={{ fontSize: 13.5, fontWeight: 800 }}>{title}</span>
      </span>
      <span style={{ fontSize: 11.5, color: C.muted, lineHeight: 1.55, fontWeight: 500 }}>{desc}</span>
      <span style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: 0.7, textTransform: 'uppercase', color: accent, marginTop: 2 }}>{tag}</span>
    </motion.button>
  );
}

// New Song flow, step 1: pick the start method BEFORE the editor opens.
//   'manual' → canvas Manual Builder (blank song, build slide by slide)
//   'auto'   → Smart Auto-Paste (lyrics / chord chart / lyrics-site link)
// The editor header tabs still allow switching afterwards.
export default function NewSongPrompt({ onChoose, onCancel }) {
  const { ACCENT, C } = useApp();

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onCancel(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);

  return (
    <motion.div {...modalOverlay} onClick={onCancel} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.84)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 10000 }}>
      <motion.div {...modalPanel} onClick={(e) => e.stopPropagation()} style={{ background: C.panel, border: '1px solid var(--ui-border2)', borderRadius: 14, width: 'min(540px, 92vw)', padding: '20px 20px 15px', boxShadow: '0 24px 80px rgba(0,0,0,0.75)', position: 'relative' }}>
        <motion.button {...iconBtnTap} onClick={onCancel} title="Cancel" style={{ position: 'absolute', top: 11, right: 11, background: 'transparent', border: 'none', color: C.faint, cursor: 'pointer', padding: 4, display: 'flex' }}>
          <X size={16} />
        </motion.button>
        <h2 style={{ margin: '0 0 3px', fontSize: 15.5, fontWeight: 800, color: C.text }}>Create New Song</h2>
        <div style={{ fontSize: 12, color: C.muted }}>How do you want to start?</div>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 16 }}>
          <OptionCard mode="manual" Icon={PenLine} title="Manual Builder" desc="Start with one blank slide and build every verse, chorus and bridge by hand — full control over each box." tag="Build by hand" accent={ACCENT} C={C} onChoose={onChoose} />
          <OptionCard mode="auto" Icon={Wand2} title="Smart Paste" desc="Paste plain lyrics, a chord chart, or a link from a lyrics site — sections are detected and slides are built for you." tag="Auto-generate" accent={ACCENT} C={C} onChoose={onChoose} />
        </div>
        <div style={{ marginTop: 13, fontSize: 10.5, color: C.faint, textAlign: 'center' }}>
          You can switch between them any time in the editor header · Esc to cancel
        </div>
      </motion.div>
    </motion.div>
  );
}
