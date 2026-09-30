import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useIsPresent } from 'motion/react';
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
  // White on the violet pill in both themes — theme text would flip dark in
  // light mode and sink into the PINK background (badge sits on slide tiles).
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: PINK, color: '#FFFFFF', borderRadius: '999px', padding: '1px 8px', fontSize: '9px', fontWeight: '800', letterSpacing: '0.5px' }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#FFFFFF' }} />{start ? formatCountdown(elapsed) : 'LIVE'}
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

// Fits a fixed 1280×720 design canvas into whatever space its parent has —
// the same contain-scale ProjectorDisplay applies to the output window, but
// measured from the element, because slide-grid tiles are fluid. Lyrics drawn
// inside therefore land at the exact proportion and position the projector
// will use. One ResizeObserver per tile; state writes are guarded so a
// repeated zero-size callback cannot loop a re-render.
export function TileCanvas({ children }) {
  const ref = useRef(null);
  const [scale, setScale] = useState(0);
  // Last measurable scale: a tile mounted at zero size (hidden panel,
  // display:none ancestor) keeps the previous scale instead of painting
  // scale(0) — invisible despite all layout work already done.
  const lastScaleRef = useRef(0.2);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const fit = () => {
      const w = el.clientWidth;
      const h = el.clientHeight;
      if (!w || !h) return;
      const s = Math.min(w / 1280, h / 720);
      lastScaleRef.current = s;
      setScale(prev => (Math.abs(prev - s) < 0.0005 ? prev : s));
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return (
    <div ref={ref} style={{ position: 'absolute', inset: 0, zIndex: 2, overflow: 'hidden', pointerEvents: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: 1280, height: 720, flexShrink: 0, position: 'relative', transform: `scale(${scale || lastScaleRef.current})`, transformOrigin: 'center center' }}>
        {children}
      </div>
    </div>
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

  // The live projection is NEVER touched by this guard. A fullscreen output
  // on another display (especially a focusable:false one) is routinely
  // reported by Chromium as hidden/occluded, so the guard would pause its
  // background loop and only resume it on a visibility event that may never
  // come — the video froze on the wall while the right-panel preview (same
  // markup, visible operator window) kept playing. Thumbnails still throttle;
  // the wall just runs.
  const isOutputLoop = (n) => !!(n && n.closest && n.closest('[data-kog-output]'));

  const watch = (node) => {
    if (!node || node.nodeType !== 1) return;
    if (node.tagName === 'VIDEO' && node.hasAttribute('autoplay') && !isOutputLoop(node)) io.observe(node);
    node.querySelectorAll?.('video[autoplay]').forEach(v => { if (!isOutputLoop(v)) io.observe(v); });
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

// How many thumbnail stills may seek at the same time.
//
// Freezing a tile to a representative frame is real decoder work — up to a
// second of 4K frames — and every cue tile in a song carrying a video
// background issues its seek the instant the song loads. Firing a dozen at
// once is one frame of peak decoder contention, which is exactly when the
// projector's incoming background starts dropping frames: the song switch
// hitches. Two at a time does the same total work spread over a few hundred
// milliseconds with no peak. The tiles look identical, they just fill in a
// beat apart instead of stampeding.
const STILL_SEEK_SLOTS = 2;
let stillSeeksInFlight = 0;
const stillSeekQueue = [];

function takeStillSeekSlot() {
  return new Promise((resolve) => {
    if (stillSeeksInFlight < STILL_SEEK_SLOTS) { stillSeeksInFlight++; resolve(); }
    else stillSeekQueue.push(resolve);
  });
}

function releaseStillSeekSlot() {
  const next = stillSeekQueue.shift();
  // Hand the slot straight on so the in-flight count stays at the cap.
  if (next) next();
  else stillSeeksInFlight = Math.max(0, stillSeeksInFlight - 1);
}

// Seek a paused element and resolve once the frame is actually decoded.
// `seeked` never fires when the element is already on that frame, and not at
// all if the element is torn down — so every exit is guarded. A wedged seek
// must never hold a slot and stall the queue behind it.
function seekToStill(v, target) {
  return new Promise((done) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(guard);
      v.removeEventListener('seeked', finish);
      v.removeEventListener('error', finish);
      try { v.pause(); } catch {}
      done();
    };
    const guard = setTimeout(finish, 600);
    v.addEventListener('seeked', finish, { once: true });
    v.addEventListener('error', finish, { once: true });
    try { v.currentTime = target; } catch { finish(); }
  });
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

    let cancelled = false;
    const freeze = () => {
      if (cancelled) return;
      const target = Math.min(1, Math.max(0.05, (v.duration || 2) * 0.15));
      // Already parked on (or beside) the representative frame: nothing to decode.
      if (Math.abs((v.currentTime || 0) - target) < 0.03) { try { v.pause(); } catch {} return; }
      (async () => {
        await takeStillSeekSlot();
        if (cancelled) { releaseStillSeekSlot(); return; }
        try { await seekToStill(v, target); }
        finally { releaseStillSeekSlot(); }
      })().catch(() => {});
    };

    if (v.readyState >= 1) freeze();
    else v.addEventListener('loadedmetadata', freeze, { once: true });
    return () => {
      cancelled = true;
      v.removeEventListener('loadedmetadata', freeze);
      // Any slot still held is released by the guarded seek above.
    };
  }, [src, animate]);
  return <video ref={ref} src={src} muted playsInline preload="metadata" autoPlay={animate} loop={animate} {...rest} />;
}

// Background loop for the projector and the monitor preview.
//
// The background layer crossfades by keeping the outgoing layer mounted for
// 0.6s while the incoming one fades in. Left alone the outgoing <video> keeps
// decoding through that whole fade — and the preview runs the exact same
// fade — so switching songs fired FOUR simultaneous video decodes (old + new
// x projector + monitor) plus two full-screen blends. That is the lag spike
// on transfer.
//
// A paused <video> keeps painting its last frame, so freezing the outgoing
// loop the instant it starts exiting looks identical to letting it run: only
// ONE stream decodes during the crossfade, same as steady state.
//
// useIsPresent only *reads* the AnimatePresence context — it does not
// register, so it can never block the exit from completing (usePresence()
// would, and the layer would never unmount).
export function BackgroundVideo({ src, style, ...rest }) {
  const ref = useRef(null);
  const isPresent = useIsPresent();

  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    if (isPresent) v.play().catch(() => {});
    else if (!v.paused) v.pause();
  }, [isPresent, src]);

  // Self-healing loop: the OS/Chromium can pause a backgrounded output
  // window's media without any input from us. Every pause while this layer
  // is live is immediately undone, and a slow net catches a stalled or
  // (should `loop` ever be dropped) ended element. The preview and the
  // projector then behave identically — loop forever, muted.
  //
  // Second job: catch the WEDGE. A decoder starving under load (opening views
  // fast mounts a burst of thumbnails that all fight for decode slots) leaves
  // the element reporting paused=false, ended=false — healthy by every check
  // above — while the last frame stays painted forever. That's the "video
  // frozen but lyrics still moving" state — invisible to pause/ended
  // listeners, so the old heal never fired. Two independent signals:
  //   · clock flat while claiming to play  → pipeline wedged;
  //   · clock moving but presented frames frozen (visible windows only — a
  //     hidden window paints nothing by design) → frame-drop starvation.
  // Flat = nudge (pause+play restarts the pipeline in place), still flat =
  // rebuild the media resource. Rebuilds back off (3s, 6s, 9s…) so a
  // transient stall gets repeated chances without a dead file looping. No
  // visibility gate: an output window can be misreported as hidden, and a
  // healthy hidden video still advances its clock — so clock-flat is only
  // ever true for a real stall, hidden or not.
  useEffect(() => {
    const v = ref.current;
    if (!v || !isPresent) return;

    let lastTime = v.currentTime;
    let lastFrames = 0;
    let framesLive = false;   // frame counter stays 0 on some platforms → ignore it
    let everAdvanced = lastTime > 0;
    let stillTicks = 0;
    let reloads = 0;
    let cooldown = 0;   // ticks to spend judging nothing after a rebuild

    const heal = () => {
      if (!v.paused && !v.ended) return;
      try { if (v.ended) v.currentTime = 0; } catch {}
      v.play().catch(() => {});
    };

    const tick = () => {
      if (v.paused || v.ended) { heal(); stillTicks = 0; return; }
      if (v.seeking) return;                    // frozen by design mid-seek
      const t = v.currentTime;
      const pf = v.getVideoPlaybackQuality ? v.getVideoPlaybackQuality() : null;
      const fr = pf ? pf.totalVideoFrames : 0;
      if (fr > 0) framesLive = true;
      // A rebuild zeroes both counters — absorb that window before judging,
      // or the reset reads as either spurious recovery (backoff collapses)
      // or a fresh stall (backoff burns).
      if (cooldown > 0) {
        cooldown--;
        lastTime = t;
        lastFrames = fr;
        stillTicks = 0;
        return;
      }
      const frameSig = framesLive && !document.hidden;
      const moved = t !== lastTime && (!frameSig || fr !== lastFrames);
      lastTime = t;
      lastFrames = fr;
      if (moved) {
        if (t > 0) everAdvanced = true;
        reloads = 0;
        stillTicks = 0;
        return;
      }
      if (!everAdvanced && v.readyState < 2) return;   // first load: give it time
      if (++stillTicks === 1) {                       // ~1.5s flat: nudge in place
        try { v.pause(); } catch {}
        v.play().catch(() => {});
        return;
      }
      if (stillTicks >= 2 + reloads * 2) {            // 3s, then 6s, 9s…: rebuild
        stillTicks = 0;
        reloads++;
        cooldown = 2;
        try { v.load(); } catch {}
        v.play().catch(() => {});
      }
    };

    const onPause = () => { if (isPresent) heal(); };
    v.addEventListener('pause', onPause);
    v.addEventListener('ended', onPause);
    const id = setInterval(tick, 1500);
    return () => {
      clearInterval(id);
      v.removeEventListener('pause', onPause);
      v.removeEventListener('ended', onPause);
    };
  }, [isPresent, src]);

  // preload="auto": the swap has no lead time (Go -> standby is the trigger),
  // so the incoming file must be ready to paint on its first frame.
  return <video ref={ref} src={src} autoPlay loop muted playsInline preload="auto" style={style} {...rest} />;
}
