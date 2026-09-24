import { useEffect, useRef, useState } from 'react';
import { formatCountdown } from './constants';

// Ticks only inside the tiny components that actually show the clock.
// Previously a 500ms interval lived in App state and re-rendered the whole
// ~2900-line App tree every half second while any slide was live — the single
// biggest source of constant lag on low-end machines.
export function useElapsedSeconds(start) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (!start) { setElapsed(0); return; }
    const tick = () => setElapsed(Math.floor((Date.now() - start) / 1000));
    tick();
    const id = setInterval(tick, 500);
    return () => clearInterval(id);
  }, [start]);
  return elapsed;
}

// Pink LIVE pill on the monitor tile — identical markup, self-ticking.
export function LiveBadge({ start, C, PINK }) {
  const elapsed = useElapsedSeconds(start);
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: PINK, color: C.text, borderRadius: '999px', padding: '1px 8px', fontSize: '9px', fontWeight: '800', letterSpacing: '0.5px' }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: C.text }} />{start ? formatCountdown(elapsed) : 'LIVE'}
    </span>
  );
}

// Slide-timer readout in the right panel — self-ticking, includes the red
// overtime state. Isolated so only this <span> re-renders each tick.
export function TimerReadout({ start, duration, C, PINK }) {
  const elapsed = useElapsedSeconds(start);
  return (
    <span style={{ fontSize: 20, fontWeight: 800, fontFamily: 'monospace', color: duration > 0 && elapsed > duration ? '#ef4444' : (start ? PINK : C.faint) }}>
      {formatCountdown(elapsed)}{duration > 0 ? ` / ${formatCountdown(duration)}` : ''}
    </span>
  );
}

// Pauses autoplaying <video> elements that are outside the viewport (or when
// the window is hidden) and resumes the ones on screen. Grids of video
// thumbnails (media library, bible uploads, cue backgrounds in the editor)
// were all decoding simultaneously — on a low-end CPU that alone can make the
// app unusable. Off-screen videos are invisible, so pausing them is not a UI
// change; on-screen ones behave exactly as before.
export function installVideoGuard() {
  if (typeof window === 'undefined' || !('IntersectionObserver' in window)) return;
  if (window.__kogVideoGuard) return;
  window.__kogVideoGuard = true;

  const visible = new Set();
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      const v = e.target;
      if (e.isIntersecting) {
        visible.add(v);
        if (!document.hidden) v.play().catch(() => {});
      } else {
        visible.delete(v);
        if (!v.paused) v.pause();
      }
    }
  }, { rootMargin: '120px', threshold: 0.01 });

  const watch = (node) => {
    if (!node || node.nodeType !== 1) return;
    if (node.tagName === 'VIDEO' && node.hasAttribute('autoplay')) io.observe(node);
    node.querySelectorAll?.('video[autoplay]').forEach(v => io.observe(v));
  };

  const start = () => {
    watch(document.body);
    new MutationObserver((muts) => {
      for (const m of muts) {
        m.addedNodes.forEach(watch);
        m.removedNodes.forEach((n) => {
          if (n.nodeType !== 1) return;
          io.unobserve(n);
          visible.delete(n);
          n.querySelectorAll?.('video').forEach(v => { io.unobserve(v); visible.delete(v); });
        });
      }
    }).observe(document.body, { childList: true, subtree: true });

    document.addEventListener('visibilitychange', () => {
      if (document.hidden) visible.forEach(v => { if (!v.paused) v.pause(); });
      else visible.forEach(v => v.play().catch(() => {}));
    });
  };

  if (document.body) start();
  else document.addEventListener('DOMContentLoaded', start, { once: true });
}

// Slide-grid thumbnail video: only the LIVE tile keeps animating — every
// other tile shows a still frame. A background loop decodes at its NATIVE
// resolution no matter how small the tile is (a 4K loop decodes 4K frames
// per tile!), so a song with video backgrounds had a dozen full-res decodes
// running at once — the single biggest CPU drain with a song loaded.
export function TileVideo({ src, animate, ...rest }) {
  const ref = useRef(null);
  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    if (animate) { v.play().catch(() => {}); return; }
    const freeze = () => {
      try { v.currentTime = Math.min(1, Math.max(0.05, (v.duration || 2) * 0.15)); } catch {}
      v.pause();
    };
    if (v.readyState >= 1) freeze();
    else v.addEventListener('loadedmetadata', freeze, { once: true });
    return () => v.removeEventListener('loadedmetadata', freeze);
  }, [src, animate]);
  return <video ref={ref} src={src} muted playsInline preload="metadata" autoPlay={animate} loop={animate} {...rest} />;
}
