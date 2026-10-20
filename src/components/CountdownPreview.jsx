import React, { useEffect, useRef } from 'react';
import { TimerFace } from './CountdownFace';

// The tab preview and the live-output mini render through THIS and nothing
// else: same box, same aspect source, same face wiring. If the two ever
// disagree on screen again, the timer OBJECTS differ — and the [countdown]
// proof lines say exactly how (same compact shape as the push log in App),
// so it settles in devtools instead of screenshots.
//
// Sizing is pure CSS container queries — no ResizeObserver measuring, no
// cached scale state that can go stale and strand the face tiny and
// centered (which is exactly what the old JS-measured TileCanvas did here
// whenever it sampled a zero-size box). The 1280×720 face always scales to
// contain its box; Chromium (Electron) supports cqw units natively.
export function countdownProof(timer) {
  const t = timer || {};
  const m = t.bgMedia || {};
  return JSON.stringify([
    t.bgType,
    m.kind,
    (m.images || []).length,
    String(m.video || '').slice(-28),
    m.slideSec,
    t.title,
    t.timeSize,
    t.live ? t.live.endsAt : null,
    t.live ? t.live.startedAt : null,
    t.live ? (t.live.pausedAt ?? null) : null,
  ]);
}

export default function CountdownPreview({ timer, aspect = '16 / 9', framed = true, badge = null, where = '?' }) {
  const sigRef = useRef(null);
  const sig = countdownProof(timer);
  useEffect(() => {
    if (sigRef.current === sig) return;
    sigRef.current = sig;
    try { console.info('[countdown] preview', where, sig); } catch {}
  }, [sig, where]);
  return (
    <div style={{ position: 'relative', width: '100%', aspectRatio: aspect, borderRadius: framed ? 12 : 0, overflow: 'hidden', background: '#000', border: framed ? '1px solid var(--ui-border2)' : 'none', containerType: 'size', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      {badge && (
        <span style={{ position: 'absolute', top: 6, right: 8, zIndex: 5, fontSize: 10, fontWeight: 800, color: '#a1a1aa', background: 'rgba(0,0,0,0.55)', borderRadius: 5, padding: '1px 7px', pointerEvents: 'none' }}>{badge}</span>
      )}
      <TimerFace timer={timer} scale={1} fluid />
    </div>
  );
}
