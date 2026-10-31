import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useIsPresent } from 'motion/react';
import { formatCountdown } from './constants';
import { LazyVideo } from './lazyVideo';

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
  // White on the live-green pill in both themes — theme text would flip dark
  // in light mode and sink into the PINK background (badge sits on slide tiles).
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
    <span style={{ fontSize: 20, fontWeight: 800, fontFamily: 'monospace', color: duration > 0 && elapsed > duration ? '#FF4545' : (start ? PINK : C.faint) }}>
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
export function TileCanvas({ children, stretch = 1 }) {
  const ref = useRef(null);
  const [scale, setScale] = useState(0);
  // Last measurable scale: a tile mounted at zero size (hidden panel,
  // display:none ancestor) keeps the previous scale instead of painting
  // scale(0) — invisible despite all layout work already done.
  const lastScaleRef = useRef(0.2);
  const k = Number(stretch) || 1;
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const fit = () => {
      const w = el.clientWidth;
      const h = el.clientHeight;
      if (!w || !h) return;
      const s = Math.min(w / (1280 * k), h / 720);
      lastScaleRef.current = s;
      setScale(prev => (Math.abs(prev - s) < 0.0005 ? prev : s));
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, [k]);
  return (
    <div ref={ref} style={{ position: 'absolute', inset: 0, zIndex: 2, overflow: 'hidden', pointerEvents: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: 1280 * k, height: 720, flexShrink: 0, position: 'relative', transform: `scale(${scale || lastScaleRef.current})`, transformOrigin: 'center center' }}>
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

// How wide a captured still may be. Tiles are a few hundred CSS px wide (the
// Up Next card is the biggest at ~480), so ~2× of a dense grid stays crisp
// while the blob stays well under 100KB per tile.
const STILL_MAX_W = 960;

// Draw the CURRENT frame of a decoded <video> into a small JPEG blob URL.
// Calls back with null when the frame cannot be read (file not decoded yet,
// or a canvas the browser considers tainted) — callers then keep the element
// instead, which is exactly the behaviour the app had before captures existed.
function grabStillFrame(v, done) {
  try {
    const w = v.videoWidth;
    const h = v.videoHeight;
    if (!w || !h || v.readyState < 2) { done(null); return; }
    const k = Math.min(1, STILL_MAX_W / w);
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(w * k));
    c.height = Math.max(1, Math.round(h * k));
    c.getContext('2d', { alpha: false }).drawImage(v, 0, 0, c.width, c.height);
    c.toBlob((b) => {
      // Free the backing store right away; the bytes now live in the blob.
      c.width = c.height = 0;
      done(b ? URL.createObjectURL(b) : null);
    }, 'image/jpeg', 0.72);
  } catch { done(null); }
}

// Slide-grid thumbnail video: only the LIVE tile keeps animating — every
// other tile shows a still frame. A background loop decodes at its NATIVE
// resolution no matter how small the tile is (a 4K loop decodes 4K frames
// per tile!), so a song with video backgrounds had a dozen full-res decodes
// running at once — the single biggest CPU drain with a song loaded.
//
// Since v1.1.39 the element itself is lazy (see lib/lazyVideo.jsx): off-screen
// tiles hold a placeholder, and the live tile jumps the queue for a slot.
//
// A frozen tile needs its <video> only long enough to DECODE one frame: the
// frame is captured into an <img> and the element unmounts, which hands the
// global slot straight back to the pool. That is what lets a 23-slide song
// show 23 stills (and the Up Next card show its face) while only a handful of
// decoders exist at once — the budget then covers what is still decoding
// instead of permanently reserving one slot per visible card.
export function TileVideo({ src, animate, style, ...rest }) {
  const videoRef = useRef(null);
  const [el, setEl] = useState(null);
  // Captured still (blob URL) for the frozen state. While it exists the
  // <video> is not needed and MUST unmount, or the slot stays checked out.
  const [still, setStill] = useState(null);
  const stillRef = useRef(null);
  // media:// files are served by this app with an Access-Control-Allow-Origin
  // header (electron/main.js) precisely so the canvas stays readable. If an
  // older main process never added it, the load below fails CORS — retry once
  // WITHOUT the attribute: the still cannot be captured then, but the frozen
  // element still shows the frame instead of nothing.
  const [corsBroken, setCorsBroken] = useState(false);
  const [retryKey, setRetryKey] = useState(0);

  // Callback ref so the seek/freeze effect starts when the lazy element
  // actually appears, not when the placeholder was first rendered.
  const attach = useCallback((node) => {
    videoRef.current = node;
    setEl(node);
  }, []);

  const keepStill = useCallback((url) => {
    if (stillRef.current) { try { URL.revokeObjectURL(stillRef.current); } catch {} }
    stillRef.current = url;
    setStill(url);
  }, []);

  useEffect(() => () => {
    if (stillRef.current) { try { URL.revokeObjectURL(stillRef.current); } catch {} stillRef.current = null; }
  }, []);

  // A new file is a new frame.
  useEffect(() => {
    setStill(null);
    if (stillRef.current) { try { URL.revokeObjectURL(stillRef.current); } catch {} stillRef.current = null; }
  }, [src]);

  useEffect(() => {
    const v = el;
    if (!v) return undefined;
    if (animate) { v.play().catch(() => {}); return undefined; }

    let cancelled = false;
    const capture = () => {
      if (cancelled || stillRef.current) return;
      grabStillFrame(v, (url) => {
        if (cancelled || stillRef.current) return;
        // Unreadable frame: keep the element mounted and frozen instead — but
        // try once more when the decoder actually has data. A tile must never
        // sit black for the rest of the session over one timing miss.
        if (!url) {
          const retry = () => { v.removeEventListener('loadeddata', retry); capture(); };
          v.addEventListener('loadeddata', retry, { once: true });
          return;
        }
        keepStill(url);
      });
    };
    const freeze = () => {
      if (cancelled) return;
      const target = Math.min(1, Math.max(0.05, (v.duration || 2) * 0.15));
      // Already parked on (or beside) the representative frame with a readable
      // frame in hand: nothing to decode. readyState < 2 means there is
      // nothing to DRAW yet, so fall through to the real seek instead of
      // freezing on a black card.
      if (v.readyState >= 2 && Math.abs((v.currentTime || 0) - target) < 0.03) {
        try { v.pause(); } catch {}
        capture();
        return;
      }
      (async () => {
        await takeStillSeekSlot();
        if (cancelled) { releaseStillSeekSlot(); return; }
        try { await seekToStill(v, target); capture(); }
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
  }, [el, src, animate, keepStill]);

  // Until a still exists the element is the only way to show the frame; the
  // moment it does, the element unmounts and its global slot is released.
  const wantElement = animate || !still;

  return (
    <LazyVideo
      key={`tv-${retryKey}`}
      src={src}
      videoRef={attach}
      style={style}
      rootMargin="320px"
      priority={animate}
      enabled={wantElement}
      muted
      playsInline
      preload="metadata"
      autoPlay={animate}
      loop={animate}
      crossOrigin={corsBroken || !/^media:/i.test(String(src || '')) ? undefined : 'anonymous'}
      onError={() => { if (!corsBroken) { setCorsBroken(true); setRetryKey((k) => k + 1); } }}
      fallback={still ? <img src={still} alt="" draggable={false} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} /> : null}
      {...rest}
    />
  );
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
export function BackgroundVideo({ src, style, loop = true, muted = true, rate = 1, ...rest }) {
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

  // Playback rate is a property, not an attribute — re-apply on every render
  // that could have changed it (the slide's media drawer) and again on the
  // element's own loadstart, because load()/heal() resets it to 1.
  useEffect(() => {
    const v = ref.current;
    if (!v) return undefined;
    const apply = () => { try { v.playbackRate = Number(rate) || 1; } catch {} };
    apply();
    v.addEventListener('loadstart', apply);
    return () => v.removeEventListener('loadstart', apply);
  }, [src, rate]);

  // preload="auto": the swap has no lead time (Go -> standby is the trigger),
  // so the incoming file must be ready to paint on its first frame.
  return <video ref={ref} src={src} autoPlay loop={loop} muted={muted} playsInline preload="auto" style={style} {...rest} />;
}

// An overlay is "on air" with words, a media bug, or both — every gate
// (wall, preview, panel badge, hotkey, snapshot) asks this, never `.text`.
export function overlayOnAir(ov) {
  return !!(ov && (String(ov.text || '').trim() || (ov.media && typeof ov.media.url === 'string' && ov.media.url)));
}

// Audience message overlay (ProPresenter-Messages style): plain absolutely-
// positioned divs in DESIGN px, so the projector (inside its scaled canvas)
// and the booth preview (inside its scaled 1280 box) render byte-identical
// markup — one face, two surfaces. Callers wrap it in their own
// AnimatePresence keyed on overlay.stamp (kept out of here so AnimatePresence
// tracks a real motion child, not a custom component).
export function OverlayFace({ overlay }) {
  const t = String((overlay && overlay.text) || '');
  const mediaUrl = overlay && overlay.media && typeof overlay.media.url === 'string' ? overlay.media.url : '';
  if (!overlay || (!t.trim() && !mediaUrl)) return null;
  const pos = overlay.media && overlay.media.pos;
  const corner = pos === 'tl' ? { top: 36, left: 36 } : pos === 'tr' ? { top: 36, right: 36 } : pos === 'bl' ? { bottom: 36, left: 36 } : { bottom: 36, right: 36 };
  const bug = mediaUrl ? (
    <img src={mediaUrl} alt="" draggable={false} style={{ position: 'absolute', width: 200, borderRadius: 10, boxShadow: '0 6px 30px rgba(0,0,0,0.6)', border: '1px solid rgba(255,255,255,0.22)', background: '#000', objectFit: 'cover', pointerEvents: 'none', ...corner }} />
  ) : null;
  if (overlay.style === 'center') {
    return (
      <>
        {t.trim() ? (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
            <div style={{ maxWidth: 1020, background: 'rgba(0,0,0,0.78)', borderRadius: 18, padding: '36px 52px', fontSize: 58, fontWeight: 800, color: '#ffffff', textAlign: 'center', lineHeight: 1.25, whiteSpace: 'pre-wrap', overflow: 'hidden', textShadow: '0 2px 18px rgba(0,0,0,0.8)' }}>{t}</div>
          </div>
        ) : null}
        {bug}
      </>
    );
  }
  if (overlay.style === 'banner') {
    return (
      <>
        {t.trim() ? (
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, background: 'rgba(0,0,0,0.8)', borderBottom: '2px solid rgba(255,255,255,0.25)', padding: '16px 48px', fontSize: 32, fontWeight: 800, color: '#ffffff', textAlign: 'center', lineHeight: 1.3, whiteSpace: 'pre-wrap', overflow: 'hidden', pointerEvents: 'none', textShadow: '0 2px 12px rgba(0,0,0,0.8)' }}>{t}</div>
        ) : null}
        {bug}
      </>
    );
  }
  return (
    <>
      {t.trim() ? (
        <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.75)', borderTop: '3px solid #FFB800', padding: '22px 60px', fontSize: 42, fontWeight: 800, color: '#ffffff', textAlign: 'center', lineHeight: 1.3, whiteSpace: 'pre-wrap', overflow: 'hidden', pointerEvents: 'none', textShadow: '0 2px 14px rgba(0,0,0,0.8)' }}>{t}</div>
      ) : null}
      {bug}
    </>
  );
}

// Live sermon/feature video for outputs (projector, monitor preview).
//
// The booth VideoPanel is the transport master — it plays picture AND sound.
// Every surface here plays the SAME file MUTED, so one machine never doubles
// its own audio (booth speakers would echo against the projector's). Play
// seeks to the booth's position first, so a mid-video join lands in sync;
// pause holds the frame; loop follows the booth's repeat toggle; the parent
// unmounts on stop (black). Contain, never cover: sermon content must never
// lose its edges to a crop.
//
// Staying in sync has two layers: transport pushes (play/pause/seek, rare)
// land coarsely, then the follower loop below chases the booth's master
// clock (localStorage `kog-video-clock`, written 4×/s — see VideoPanel
// scheduleSync) with playback-rate nudges, so corrections are inaudible and
// cost zero re-renders on either side.
export function LiveVideo({ video }) {
  const ref = useRef(null);
  const appliedRef = useRef(null);
  const v = video || {};
  useEffect(() => {
    const el = ref.current;
    if (!el || !v.url) return;
    // el.src resolves absolute — comparing raw strings would reload every
    // push. The ref remembers what this element was actually given.
    if (appliedRef.current !== v.url) {
      try { el.src = v.url; } catch {}
      appliedRef.current = v.url;
    }
    try { el.loop = !!v.loop; } catch {}
    try { el.muted = true; } catch {}
    // Tighten to ~a frame-and-a-half: the booth re-pushes its clock on every
    // transport action plus a periodic drift guard, so anything past this is
    // real drift worth one small hop — anything under it is left alone so
    // the picture never micro-stutters.
    const pos = Math.max(0, Number(v.position) || 0);
    if (v.action === 'pause') {
      try { if (Math.abs((el.currentTime || 0) - pos) > 0.15) el.currentTime = pos; } catch {}
      try { el.pause(); } catch {}
    } else {
      try { if (Math.abs((el.currentTime || 0) - pos) > 0.15) el.currentTime = pos; } catch {}
      el.play().catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [v.url, v.action, v.position, v.loop, v.stamp]);
  useEffect(() => {
    // Follower loop — see header. Extrapolates the booth clock across the
    // write→read latency so the target leads correctly; past a full second
    // apart it hard-seeks once, inside that it bends the rate (±8% is
    // inaudible on speech) and snaps back to 1x on arrival. Stale clock
    // (booth paused/closed/tab left) resets the rate and gets out of the way.
    if (!v.url || v.action !== 'play') return undefined;
    const id = setInterval(() => {
      const el = ref.current;
      if (!el) return;
      let clock = null;
      try { clock = JSON.parse(localStorage.getItem('kog-video-clock') || 'null'); } catch {}
      const fresh = clock && clock.url === v.url && (Date.now() - (clock.ts || 0)) < 3000;
      try {
        if (!fresh) {
          if (el.playbackRate !== 1) el.playbackRate = 1;
          return;
        }
        if (el.paused) { el.play().catch(() => {}); return; }
        const target = Math.max(0, clock.position + (Date.now() - clock.ts) / 1000);
        const diff = target - (el.currentTime || 0);
        if (Math.abs(diff) > 1.0) {
          el.currentTime = target;
          if (el.playbackRate !== 1) el.playbackRate = 1;
        } else if (diff > 0.12) {
          if (el.playbackRate !== 1.08) el.playbackRate = 1.08;
        } else if (diff < -0.12) {
          if (el.playbackRate !== 0.92) el.playbackRate = 0.92;
        } else if (el.playbackRate !== 1) {
          el.playbackRate = 1;
        }
      } catch {}
    }, 500);
    return () => clearInterval(id);
  }, [v.url, v.action, v.stamp]);
  if (!v.url) return null;
  return <video ref={ref} src={v.url} muted playsInline preload="auto" style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block', background: '#000' }} />;
}
