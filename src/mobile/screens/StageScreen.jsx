import React, { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { Smartphone } from 'lucide-react';

// A phone-sized mirror of the physical stage display: same content, same
// viewport-relative sizing, so a singer reads it from 2-3 m just like they
// would the stage monitor — and it scales correctly on any phone resolution.
export default function StageScreen({ C, state, status, onSwitchRole }) {
  const [view, setView] = useState(() => ({ h: window.innerHeight }));
  useEffect(() => {
    const onResize = () => setView({ h: window.innerHeight });
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const stage = state?.stage || null;
  const live = state?.live || null;
  const current = stage?.current || (live ? { title: live.title, label: live.label, text: live.text } : null);
  const next = stage?.next || null;
  const cleared = !(current && (current.text || current.title));

  const h = view.h || 800;
  const fitSize = (base, floor, budget, lines) =>
    Math.max(h * floor, Math.min(h * base, (h * budget) / (Math.max(1, lines) * 1.3)));

  const nextLines = Math.max(1, String(next?.text || '').split('\n').length);
  const nextSize = fitSize(0.038, 0.020, 0.22, nextLines);
  const nextRatio = Math.min(0.42, 0.14 + 0.07 + (nextLines * nextSize * 1.3) / h);
  const curBudget = Math.max(0.24, 1 - 0.16 - 0.06 - nextRatio);
  const curSize = fitSize(0.070, 0.028, curBudget, String(current?.text || '').split('\n').length);

  const offline = status !== 'online';

  return (
    <div style={{ minHeight: '100dvh', background: C.panel, color: C.text, display: 'flex', flexDirection: 'column', padding: 'calc(16px + env(safe-area-inset-top)) 20px calc(16px + env(safe-area-inset-bottom))' }}>
      {/* Header: kept quiet — this screen is for reading, not tapping. */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: '2.5vh' }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, background: 'rgba(34,197,94,0.14)', border: '1px solid rgba(34,197,94,0.4)', color: '#4ade80', padding: '5px 12px', borderRadius: 999, fontSize: 11, fontWeight: 900, letterSpacing: 1.2 }}>
          <span style={{ width: 7, height: 7, borderRadius: '50%', background: cleared ? C.faint2 : '#22c55e', boxShadow: cleared ? 'none' : '0 0 8px #22c55e' }} />
          {cleared ? 'CLEARED' : 'LIVE'}
        </span>
        <button onClick={() => onSwitchRole('control')} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'transparent', border: 'none', color: C.accLine, fontSize: 12.5, fontWeight: 800, cursor: 'pointer', padding: 6, fontFamily: 'inherit' }}>
          <Smartphone size={14} /> Control
        </button>
      </div>

      {/* Current lyric */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', minHeight: 0 }}>
        <div style={{ fontSize: '1.7vh', fontWeight: 900, color: C.accLine, textTransform: 'uppercase', letterSpacing: 1.6, marginBottom: '1vh' }}>
          {current?.title ? `${current.title} · ` : ''}{current?.label || ''}
        </div>
        {cleared ? (
          <p style={{ margin: 0, fontSize: `${Math.max(20, h * 0.034)}px`, fontWeight: 800, color: C.faint }}>
            {status === 'online' ? 'Nothing on air' : 'Waiting for the computer…'}
          </p>
        ) : (
          <p style={{ margin: 0, fontSize: `${curSize}px`, lineHeight: 1.3, fontWeight: 800, whiteSpace: 'pre-line', overflow: 'hidden', textShadow: '0 2px 18px rgba(99,102,241,0.22)' }}>
            {current?.text}
          </p>
        )}
      </div>

      {/* Next block */}
      <div style={{ borderTop: `1px solid ${C.border2}`, paddingTop: '2vh', minHeight: '14vh', flexShrink: 0 }}>
        <div style={{ fontSize: '1.6vh', fontWeight: 900, color: C.faint, textTransform: 'uppercase', letterSpacing: 1.8, marginBottom: '0.9vh' }}>Next</div>
        {next ? (
          <>
            <div style={{ fontSize: '1.4vh', fontWeight: 900, color: C.accLine, textTransform: 'uppercase', letterSpacing: 1.2, marginBottom: '0.7vh' }}>
              {next.title ? `${next.title} · ` : ''}{next.label}
            </div>
            <p style={{ margin: 0, fontSize: `${nextSize}px`, lineHeight: 1.3, fontWeight: 700, whiteSpace: 'pre-line', color: C.muted, overflow: 'hidden' }}>{next.text}</p>
          </>
        ) : (
          <p style={{ margin: 0, fontSize: '1.7vh', color: C.faint2 }}>— Nothing queued —</p>
        )}
      </div>

      {offline && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          style={{ position: 'fixed', left: 0, right: 0, bottom: 'calc(10px + env(safe-area-inset-bottom))', textAlign: 'center', fontSize: 12, fontWeight: 800, color: '#f87171' }}
        >
          Connection lost — reconnecting…
        </motion.div>
      )}
    </div>
  );
}
