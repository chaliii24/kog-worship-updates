import React from 'react';
import ProjectorDisplay from '../../components/ProjectorDisplay.jsx';
import { phoneSlide } from '../live.js';

// True miniature of the projected slide: the SAME renderer the wall runs, in
// framed mode, so the phone shows the real background, text boxes, deck and
// countdown instead of a hand-drawn approximation. `phoneSlide` rewrites the
// media:// URLs that only exist inside Electron to the paired LAN endpoint.
//
// Callers may pass the whole live slide (`slide`) or the legacy split props
// (text/style/timer/presentation); both resolve to the same currentSlide.
export default function MiniSlide({
  C, slide, text, style, timer, presentation, badge, aspect, aspectBadge,
  onCopy, draw, lift = 0, timestamp,
}) {
  const source = slide || {
    text: text || '',
    style: style || null,
    timer: timer || null,
    presentation: presentation || null,
    timestamp: timestamp || 0,
  };
  const currentSlide = phoneSlide(source);

  const copy = () => {
    const t = source.timer ? '' : (source.text || '');
    if (!t) return;
    try { navigator.clipboard?.writeText(t)?.catch?.(() => {}); } catch {}
    if (onCopy) onCopy();
  };

  // ProjectorDisplay's framed frame takes the exact shape the wall draws.
  // Non-ratio values (Fill/Auto/Native) fall back to the design reference;
  // outputShape already resolves Fill to the physical wall's ratio.
  const rawAspect = String(aspect || '').trim();
  const cssAspect = /^\d+(?:\.\d+)?\s*[:/]\s*\d+(?:\.\d+)?$/.test(rawAspect)
    ? rawAspect.replace(':', ' / ')
    : '16 / 9';

  return (
    <div>
      <div style={{ position: 'relative', width: '100%', aspectRatio: cssAspect, borderRadius: 10, overflow: 'hidden', background: '#000' }}>
        <div style={{ position: 'absolute', inset: 0 }}>
          <ProjectorDisplay
            framed
            frameAspect={cssAspect}
            currentSlide={currentSlide}
            draw={draw || null}
            lift={lift}
          />
        </div>
        {aspectBadge && (
          <span style={{ position: 'absolute', top: 6, left: 6, zIndex: 5, fontSize: 10, fontWeight: 800, color: '#d4d4d8', background: 'rgba(0,0,0,0.55)', borderRadius: 5, padding: '1px 7px', pointerEvents: 'none' }}>{aspectBadge}</span>
        )}
        <button
          onClick={copy}
          title="Copy text"
          style={{ position: 'absolute', top: 8, right: 8, zIndex: 5, background: 'rgba(0,0,0,0.55)', border: '1px solid rgba(255,255,255,0.16)', color: '#fff', borderRadius: 9, width: 40, height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', fontSize: 14, touchAction: 'manipulation' }}
        >⧉</button>
      </div>
      {badge ? (
        <div style={{ fontSize: 10, fontWeight: 900, letterSpacing: 1.6, textTransform: 'uppercase', color: (C && C.faint) || '#a1a1aa', marginTop: 7, paddingLeft: 2 }}>{badge}</div>
      ) : null}
    </div>
  );
}
