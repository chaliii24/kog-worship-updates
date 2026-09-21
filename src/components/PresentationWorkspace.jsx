import React, { useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { Plus, Edit3, Square, ChevronLeft, ChevronRight, MonitorPlay } from 'lucide-react';
import { useApp } from '../context/AppContext';
import PresentationSlide from './PresentationSlide';
import { stubTap } from '../lib/anim';

function PresentationTile({ slide, num, isLive, onClick, PINK, C }) {
  const ref = useRef(null);
  const [scale, setScale] = useState(0.2);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => setScale(Math.max(0.05, el.clientWidth / 1280));
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 320, damping: 28 }}
      whileHover={{ scale: 1.02, y: -2 }}
      whileTap={{ scale: 0.98 }}
      onClick={onClick}
      title={`Slide ${num} — click to project`}
      style={{ cursor: 'pointer', minWidth: 0 }}
    >
      <div
        ref={ref}
        style={{
          position: 'relative',
          aspectRatio: '16 / 9',
          borderRadius: 10,
          overflow: 'hidden',
          background: '#000',
          border: isLive ? `2px solid ${PINK}` : '1px solid rgba(255,255,255,0.08)',
          boxShadow: isLive ? `0 0 0 2px rgba(255,79,163,0.25), 0 8px 24px rgba(0,0,0,0.45)` : '0 4px 14px rgba(0,0,0,0.35)',
          boxSizing: 'border-box'
        }}
      >
        <div style={{ width: 1280, height: 720, transform: `scale(${scale})`, transformOrigin: 'top left', pointerEvents: 'none' }}>
          <PresentationSlide slide={slide} />
        </div>
        {isLive && (
          <span style={{ position: 'absolute', top: 6, left: 8, display: 'inline-flex', alignItems: 'center', gap: 4, background: PINK, color: '#fff', borderRadius: '999px', padding: '2px 8px', fontSize: 9, fontWeight: 800, letterSpacing: 0.5, zIndex: 2 }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#fff' }} />LIVE
          </span>
        )}
        <span style={{ position: 'absolute', top: 6, right: 8, background: 'rgba(0,0,0,0.45)', color: isLive ? PINK : C.heading, borderRadius: 6, padding: '1px 6px', fontSize: 9, fontWeight: 800, zIndex: 2 }}>
          #{num}
        </span>
      </div>
    </motion.div>
  );
}

export default function PresentationWorkspace() {
  const {
    C, PINK, ACCENT,
    activePresentation,
    firePresentationSlide,
    openPresentationEditor,
    stopPresentation
  } = useApp();

  const deck = activePresentation?.deck || null;
  const slides = (deck && deck.slides) || [];
  const liveIndex = activePresentation ? activePresentation.index : -1;

  const go = (i) => { if (deck && slides[i]) firePresentationSlide(deck, i, 'ws'); };

  return (
    <motion.div
      key="presentation"
      initial={{ opacity: 0, x: 26 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -26 }}
      transition={{ type: 'spring', stiffness: 300, damping: 30 }}
      style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: '#050509', height: '100%' }}
    >
      <div style={{ padding: '12px 18px 8px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexShrink: 0 }}>
        <div style={{ minWidth: 0 }}>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{deck ? deck.title : 'Presentations'}</h2>
          <p style={{ margin: '3px 0 0 0', fontSize: 11.5, color: C.faint }}>{deck ? `${slides.length} slide${slides.length === 1 ? '' : 's'}` : 'Present a deck to navigate its slides from here.'}</p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
          {activePresentation ? (
            <>
              <span style={{ fontSize: 11, fontWeight: 700, color: C.muted, background: C.elevated2, border: '1px solid #2b2b44', borderRadius: 999, padding: '4px 10px' }}>Slide {liveIndex + 1}/{slides.length}</span>
              <motion.button {...stubTap} onClick={() => go(liveIndex - 1)} disabled={liveIndex <= 0} title="Previous slide (or ←)" style={{ width: 30, height: 30, background: C.elevated2, border: '1px solid #2b2b44', color: liveIndex <= 0 ? '#475569' : C.text2, borderRadius: 8, cursor: liveIndex <= 0 ? 'default' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><ChevronLeft size={14} /></motion.button>
              <motion.button {...stubTap} onClick={() => go(liveIndex + 1)} disabled={liveIndex >= slides.length - 1} title="Next slide (or →)" style={{ width: 30, height: 30, background: C.elevated2, border: '1px solid #2b2b44', color: liveIndex >= slides.length - 1 ? '#475569' : C.text2, borderRadius: 8, cursor: liveIndex >= slides.length - 1 ? 'default' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><ChevronRight size={14} /></motion.button>
              <motion.button {...stubTap} onClick={stopPresentation} title="Stop navigating this presentation (live output stays until you send something else)" style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.35)', color: '#F87171', padding: '6px 11px', borderRadius: 8, fontSize: 11.5, fontWeight: 700, cursor: 'pointer' }}><Square size={11} /> Stop</motion.button>
            </>
          ) : null}
          <motion.button {...stubTap} onClick={() => openPresentationEditor(deck)} style={{ background: C.elevated2, border: '1px solid #2b2b44', color: C.text2, padding: '6px 12px', borderRadius: 8, fontSize: 11.5, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}><Edit3 size={12} /> {deck ? 'Edit' : 'New'}</motion.button>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '8px 18px 16px 18px' }}>
        {slides.length ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(215px, 1fr))', gap: 14, alignContent: 'start' }}>
            {slides.map((s, i) => (
              <PresentationTile key={s.id || i} slide={s} num={i + 1} isLive={activePresentation && i === liveIndex} onClick={() => go(i)} PINK={PINK} C={C} />
            ))}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14, color: C.faint2, borderRadius: 14, minHeight: '100%' }}>
            <div style={{ width: '100%', maxWidth: 720, aspectRatio: '16 / 9', background: '#000', border: '1px solid #1e1e2e', borderRadius: 14, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24, boxSizing: 'border-box' }}>
              <div style={{ width: 58, height: 58, borderRadius: 16, background: 'radial-gradient(140% 140% at 30% 20%, #3b1d6e, #1a0c30)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><MonitorPlay size={28} color={PINK} /></div>
              <div style={{ fontSize: 14, fontWeight: 700, color: C.muted }}>No presentation is live</div>
              <div style={{ fontSize: 12, textAlign: 'center', maxWidth: 380, lineHeight: 1.5, color: C.faint2 }}>Press <b style={{ color: C.text }}>Present</b> on a deck in the list, or start a new presentation — its slides appear here to navigate like lyrics.</div>
              <motion.button {...stubTap} onClick={() => openPresentationEditor(null)} style={{ display: 'flex', alignItems: 'center', gap: 6, background: ACCENT, border: 'none', color: '#fff', padding: '9px 16px', borderRadius: 9, fontSize: 12, fontWeight: 800, cursor: 'pointer' }}><Plus size={13} /> New Presentation</motion.button>
            </div>
          </div>
        )}
      </div>
    </motion.div>
  );
}