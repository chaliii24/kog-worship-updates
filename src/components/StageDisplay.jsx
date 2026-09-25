import React, { useEffect, useState } from 'react';

export default function StageDisplay({ currentSlide, C }) {
  const stage = currentSlide && typeof currentSlide === 'object' && currentSlide.current ? currentSlide : { current: { title: 'KOG Worship', label: 'Waiting…', text: '' }, next: null };
  const current = stage.current || {};
  const nextSlide = stage.next || null;

  // The stage monitor is read from 2-3 m away AND runs at the display's own
  // native resolution. Fixed px sizes therefore looked half-size on a 4K panel
  // and cramped on anything above laptop resolution — which is why singers
  // could barely make the words out. Every size below is a fraction of the
  // viewport height instead, so the apparent size is the same whatever
  // resolution the output window opens at (80 px of text at 1080p).
  const [view, setView] = useState(() => ({ w: window.innerWidth, h: window.innerHeight }));
  useEffect(() => {
    const onResize = () => setView({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const h = view.h || 1080;

  // Fixed overheads, as a share of the viewport height: 4.5vh of padding top
  // and bottom, the LIVE/header row, and the current slide's section label.
  // Everything left over belongs to the lyric — so a long NEXT block (which
  // grows past its 14vh minimum) eats into it before the current slide ever
  // starts clipping off the bottom edge.
  const fitSize = (base, floor, budget, lines) =>
    Math.max(h * floor, Math.min(h * base, (h * budget) / (Math.max(1, lines) * 1.3)));

  const nextSize = fitSize(0.041, 0.022, 0.20, String(nextSlide?.text || '').split('\n').length);
  const nextLines = Math.max(1, String(nextSlide?.text || '').split('\n').length);
  const nextRatio = Math.min(0.40, 0.14 + 0.075 + (nextLines * nextSize * 1.3) / h);
  const curBudget = Math.max(0.22, 1 - 0.09 - 0.07 - 0.025 - nextRatio);
  const curSize = fitSize(0.074, 0.030, curBudget, String(current.text || '').split('\n').length);

  return (
    <div style={{ position: 'fixed', inset: 0, background: C.panel, color: C.text, fontFamily: 'system-ui, sans-serif', display: 'flex', flexDirection: 'column', padding: '4.5vh 3.5vw', boxSizing: 'border-box', overflow: 'hidden' }}>
      <style>{`
        html, body, #root {
          margin: 0 !important; padding: 0 !important;
          width: 100vw !important; height: 100vh !important;
          overflow: hidden !important; background: ${C.panel} !important;
        }
      `}</style>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2vh' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', background: 'rgba(34,197,94,0.15)', border: '1px solid rgba(34,197,94,0.4)', color: '#4ade80', padding: '0.6vh 1.3vh', borderRadius: '999px', fontSize: '1.2vh', fontWeight: '800', letterSpacing: '1px' }}>
            <span style={{ width: '0.8vh', height: '0.8vh', borderRadius: '50%', background: '#22c55e', boxShadow: '0 0 10px #22c55e' }}></span>LIVE
          </span>
          <h1 style={{ margin: 0, fontSize: '2.4vh', fontWeight: '900', letterSpacing: '1px' }}>Stage Display</h1>
        </div>
      </div>

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', minHeight: 0 }}>
        <div style={{ fontSize: '1.6vh', fontWeight: '800', color: '#6366f1', textTransform: 'uppercase', letterSpacing: '2px', marginBottom: '0.9vh' }}>{current.title ? `${current.title}  ·  ` : ''}{current.label || 'Current'}</div>
        <p style={{ margin: 0, fontSize: `${curSize}px`, lineHeight: 1.3, fontWeight: '800', whiteSpace: 'pre-line', color: C.text, textShadow: '0 2px 20px rgba(99,102,241,0.25)', overflow: 'hidden' }}>{current.text || 'Blackout'}</p>
      </div>

      <div style={{ borderTop: '1px solid #24243a', paddingTop: '2vh', minHeight: '14vh', flexShrink: 0 }}>
        <div style={{ fontSize: '1.6vh', fontWeight: '800', color: C.faint, textTransform: 'uppercase', letterSpacing: '2px', marginBottom: '0.9vh' }}>Next</div>
        {nextSlide ? (
          <>
            <div style={{ fontSize: '1.4vh', fontWeight: '800', color: C.accLine, textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '0.7vh' }}>{nextSlide.title ? `${nextSlide.title}  ·  ` : ''}{nextSlide.label}</div>
            <p style={{ margin: 0, fontSize: `${nextSize}px`, lineHeight: 1.3, fontWeight: '700', whiteSpace: 'pre-line', color: '#a1a1aa', overflow: 'hidden' }}>{nextSlide.text}</p>
          </>
        ) : (
          <p style={{ margin: 0, fontSize: '1.9vh', color: C.faint2 }}>— Nothing queued —</p>
        )}
      </div>
    </div>
  );
}
