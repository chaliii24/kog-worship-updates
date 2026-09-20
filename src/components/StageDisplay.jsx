import React from 'react';

export default function StageDisplay({ currentSlide, C }) {
  const stage = currentSlide && typeof currentSlide === 'object' && currentSlide.current ? currentSlide : { current: { title: 'KOG Worship', label: 'Waiting…', text: '' }, next: null };
  const current = stage.current || {};
  const nextSlide = stage.next || null;
  return (
    <div style={{ position: 'fixed', inset: 0, background: C.panel, color: C.text, fontFamily: 'system-ui, sans-serif', display: 'flex', flexDirection: 'column', padding: '48px 64px', boxSizing: 'border-box', overflow: 'hidden' }}>
      <style>{`
        html, body, #root {
          margin: 0 !important; padding: 0 !important;
          width: 100vw !important; height: 100vh !important;
          overflow: hidden !important; background: ${C.panel} !important;
        }
      `}</style>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', background: 'rgba(34,197,94,0.15)', border: '1px solid rgba(34,197,94,0.4)', color: '#4ade80', padding: '6px 14px', borderRadius: '999px', fontSize: '12px', fontWeight: '800', letterSpacing: '1px' }}>
            <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#22c55e', boxShadow: '0 0 10px #22c55e' }}></span>LIVE
          </span>
          <h1 style={{ margin: 0, fontSize: '26px', fontWeight: '900', letterSpacing: '1px' }}>Stage Display</h1>
        </div>
      </div>

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
        <div style={{ fontSize: '13px', fontWeight: '800', color: '#6366f1', textTransform: 'uppercase', letterSpacing: '2px', marginBottom: '8px' }}>{current.title ? `${current.title}  ·  ` : ''}{current.label || 'Current'}</div>
        <p style={{ margin: 0, fontSize: '42px', lineHeight: '1.28', fontWeight: '700', whiteSpace: 'pre-line', color: C.text, textShadow: '0 2px 20px rgba(99,102,241,0.25)' }}>{current.text || 'Blackout'}</p>
      </div>

      <div style={{ borderTop: '1px solid #24243a', paddingTop: '22px', minHeight: '150px' }}>
        <div style={{ fontSize: '13px', fontWeight: '800', color: C.faint, textTransform: 'uppercase', letterSpacing: '2px', marginBottom: '8px' }}>Next</div>
        {nextSlide ? (
          <>
            <div style={{ fontSize: '12px', fontWeight: '800', color: C.accLine, textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '6px' }}>{nextSlide.title ? `${nextSlide.title}  ·  ` : ''}{nextSlide.label}</div>
            <p style={{ margin: 0, fontSize: '24px', lineHeight: '1.3', fontWeight: '600', whiteSpace: 'pre-line', color: '#a1a1aa' }}>{nextSlide.text}</p>
          </>
        ) : (
          <p style={{ margin: 0, fontSize: '20px', color: C.faint2 }}>— Nothing queued —</p>
        )}
      </div>
    </div>
  );
}
