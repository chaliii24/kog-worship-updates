import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'motion/react';
import { COUNTDOWN_CLOCK_KEY, COUNTDOWN_CLOCK_FRESH_MS, countdownClockTarget } from '../lib/countdownClock';

// Shared countdown renderer: the tab preview, the live-output monitor, the
// projector window and the stage display all draw from this ONE component, so
// the time on every screen agrees. Sizes are in 1280×720 design px, scaled by
// `scale` (1 on the projector canvas, viewport/720 on stage, 1 inside a
// TileCanvas contain-fit for the tab preview).
//
// Clock math is absolute (endsAt timestamps), never tick-counted: every
// surface derives the same remaining time from Date.now(), so projector,
// stage and console cannot drift apart no matter when each one repaints.
export const DEFAULT_COUNTDOWN = {
  title: 'The service is about to start',
  subtext: 'Please take your seats',
  mode: 'duration', // duration | target | clock
  durationSec: 310,
  targetTime: '10:30',
  showOn: 'both', // both | main | stage
  overtime: false,
  titleSize: 64,
  timeSize: 120,
  subtextSize: 40,
  bgType: 'gradient', // color | gradient | animated | media
  bgValue: 'linear-gradient(135deg, #052e16 0%, #166534 55%, #031a0d 100%)',
  // Custom Media mode (bgType 'media'): slideshow carousel and/or loop video.
  // URLs are media:// (persisted to userData, survive restarts) — never bytes.
  // videoAudio (video kind only): { enabled, volume, muted, fadeSec, hasTrack, unsupported }.
  bgMedia: null, // { kind:'slideshow'|'video', images:[], slideSec:5, video:null, loop:true, videoAudio }
  live: null, // { endsAt, startedAt } while on air (endsAt null = wall clock)
};

// Animated gradient loops: layered radial blobs drifting on a dark base.
// Rendered live at the panel's native resolution (sharper than any shipped
// 1080p file, zero installer bytes, seamless loop). Transform-only motion,
// so it stays GPU-cheap on low-end boxes. bgValue stores "anim:<id>".
export const ANIMATED_GRADIENTS = [
  {
    id: 'aurora', name: 'Aurora',
    base: 'linear-gradient(135deg, #031a0d 0%, #052e16 60%, #02120a 100%)',
    blobs: [
      { css: 'radial-gradient(circle, rgba(54,201,130,0.50) 0%, transparent 70%)', w: 900, h: 900, x: 8, y: 4, dx: 120, dy: 60, d: '11s' },
      { css: 'radial-gradient(circle, rgba(45,212,191,0.38) 0%, transparent 70%)', w: 760, h: 760, x: 58, y: 42, dx: -140, dy: -70, d: '14s' },
    ],
  },
  {
    id: 'ember', name: 'Ember',
    base: 'linear-gradient(135deg, #1a0803 0%, #2a0e05 60%, #120401 100%)',
    blobs: [
      { css: 'radial-gradient(circle, rgba(249,115,22,0.48) 0%, transparent 70%)', w: 880, h: 880, x: 10, y: 40, dx: 130, dy: -60, d: '12s' },
      { css: 'radial-gradient(circle, rgba(234,179,8,0.34) 0%, transparent 70%)', w: 700, h: 700, x: 60, y: 6, dx: -120, dy: 80, d: '15s' },
    ],
  },
  {
    id: 'royal', name: 'Royal',
    base: 'linear-gradient(135deg, #160b2e 0%, #1e1b4b 60%, #0b0718 100%)',
    blobs: [
      { css: 'radial-gradient(circle, rgba(255,184,0,0.50) 0%, transparent 70%)', w: 900, h: 900, x: 6, y: 8, dx: 140, dy: 60, d: '13s' },
      { css: 'radial-gradient(circle, rgba(59,130,246,0.36) 0%, transparent 70%)', w: 740, h: 740, x: 60, y: 44, dx: -130, dy: -80, d: '10s' },
    ],
  },
  {
    id: 'ocean', name: 'Ocean',
    base: 'linear-gradient(135deg, #04121f 0%, #0b2f4a 60%, #02090f 100%)',
    blobs: [
      { css: 'radial-gradient(circle, rgba(34,211,238,0.42) 0%, transparent 70%)', w: 860, h: 860, x: 10, y: 30, dx: 130, dy: -70, d: '12s' },
      { css: 'radial-gradient(circle, rgba(59,130,246,0.40) 0%, transparent 70%)', w: 720, h: 720, x: 58, y: 10, dx: -120, dy: 80, d: '15s' },
    ],
  },
  {
    id: 'sunset', name: 'Sunset',
    base: 'linear-gradient(135deg, #1c0a12 0%, #3b0f1e 60%, #0d0408 100%)',
    blobs: [
      { css: 'radial-gradient(circle, rgba(251,146,60,0.46) 0%, transparent 70%)', w: 880, h: 880, x: 8, y: 36, dx: 140, dy: -60, d: '11s' },
      { css: 'radial-gradient(circle, rgba(244,114,182,0.34) 0%, transparent 70%)', w: 700, h: 700, x: 62, y: 8, dx: -130, dy: 70, d: '14s' },
    ],
  },
  {
    id: 'violet', name: 'Violet',
    base: 'linear-gradient(135deg, #150826 0%, #241040 60%, #0a0414 100%)',
    blobs: [
      { css: 'radial-gradient(circle, rgba(232,121,249,0.44) 0%, transparent 70%)', w: 900, h: 900, x: 12, y: 10, dx: -140, dy: 70, d: '13s' },
      { css: 'radial-gradient(circle, rgba(255,199,44,0.38) 0%, transparent 70%)', w: 740, h: 740, x: 56, y: 46, dx: 120, dy: -70, d: '10s' },
    ],
  },
  {
    id: 'mono', name: 'Mono',
    base: 'linear-gradient(135deg, #09090b 0%, #18181b 60%, #030304 100%)',
    blobs: [
      { css: 'radial-gradient(circle, rgba(161,161,170,0.30) 0%, transparent 70%)', w: 840, h: 840, x: 10, y: 20, dx: 120, dy: 60, d: '16s' },
      { css: 'radial-gradient(circle, rgba(82,82,91,0.34) 0%, transparent 70%)', w: 700, h: 700, x: 60, y: 40, dx: -110, dy: -60, d: '13s' },
    ],
  },
];

export const animatedPresetOf = (bgValue) => {
  const id = String(bgValue || '').replace(/^anim:/, '');
  return ANIMATED_GRADIENTS.find((g) => g.id === id) || ANIMATED_GRADIENTS[0];
};

// Shared media clock for the countdown video lives in lib/countdownClock.js.

export const formatCountdownTime = (ms) => {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h > 0
    ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
    : `${m}:${String(s).padStart(2, '0')}`;
};

export const computeCountdown = (timer, now) => {
  const t = timer || {};
  const at = Number(now);
  const clockNow = Number.isFinite(at) ? at : Date.now();
  if (t.mode === 'clock') {
    const d = new Date(clockNow);
    const ap = d.getHours() >= 12 ? 'PM' : 'AM';
    const h = d.getHours() % 12 || 12;
    return { display: `${h}:${String(d.getMinutes()).padStart(2, '0')}`, suffix: ap, over: false };
  }
  if (t.live && t.live.endsAt != null) {
    // Paused (video countdown transport): the clock is frozen at the paused
    // remainder — every surface derives the SAME stopped number, so no screen
    // ticks ahead while the operator holds. Only video mode ever sets these.
    if (t.live.pausedAt != null && t.live.pausedRemain != null) {
      return { display: formatCountdownTime(t.live.pausedRemain), over: false, remaining: t.live.pausedRemain, paused: true };
    }
    const rem = t.live.endsAt - clockNow;
    if (rem <= 0) {
      if (t.overtime) return { display: formatCountdownTime(-rem), over: true };
      return { display: '0:00', over: true, done: true };
    }
    return { display: formatCountdownTime(rem), over: false, remaining: rem };
  }
  // Idle preview: frozen full duration (or frozen target gap), never ticking.
  if (t.mode === 'target' && t.targetTime) {
    const end = nextTargetTime(t.targetTime, clockNow);
    if (end != null) return { display: formatCountdownTime(Math.max(0, end - clockNow)), over: false, frozen: true };
  }
  return { display: formatCountdownTime((Number(t.durationSec) || 0) * 1000), over: false, frozen: true };
};

// Next occurrence of an "HH:MM" target: today if still ahead, otherwise
// tomorrow (evening setup for a morning service). Garbage input → null, never
// a silent midnight.
export const nextTargetTime = (targetTime, now) => {
  const m = String(targetTime || '').trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const hh = Number(m[1]);
  const mm = Number(m[2]);
  if (hh > 23 || mm > 59) return null;
  const at = Number.isFinite(Number(now)) ? Number(now) : Date.now();
  const d = new Date(at);
  d.setHours(hh, mm, 0, 0);
  if (d.getTime() <= at) d.setDate(d.getDate() + 1);
  return d.getTime();
};

// ---------------------------------------------------------------------------
// VIDEO-UPLOAD COUNTDOWN MODE
// Everything below is scoped to bgType 'media' + kind 'video' with a picked
// file (isVideoCountdown). Normal countdown and slideshow modes never call
// into it, so their timing, layout and completion paths are untouched.
// ---------------------------------------------------------------------------

// Phase timeline (absolute-clock derived, never tick-counted):
//   splash 0→3s   big, centered, cinematic fade+scale-in from 85%
//   corner 3s→+5s from the end, 800ms ease-in-out glide to top-right, smaller
//   final  last 5s, 800ms glide back to center, one gentle pulse per second
// Short countdowns (≤5s) land directly in `final` — the ending wins over the
// opening so the two animations can never fight.
export const VIDEO_SPLASH_MS = 3000;
export const VIDEO_RETURN_AT_MS = 5000;
export const VIDEO_MOVE_MS = 800;
export const VIDEO_CORNER_INSET = 3.5;   // % from the top/right output edges
export const VIDEO_CORNER_SCALE = 0.42;  // corner size relative to splash size

export const isVideoCountdown = (t) => {
  if (!t || t.bgType !== 'media') return false;
  const m = t.bgMedia || null;
  return !!(m && m.kind === 'video' && m.video);
};

// Video-mode clock text: MM:SS, padded minutes, clamped at 00:00 — the spec
// forbids negative time in this mode (shared formatCountdownTime stays as-is
// for every other mode).
export const fmtVideoClock = (ms) => {
  const total = Math.max(0, Math.floor((Number(ms) || 0) / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
};

// Pure phase derivation from the LIVE snapshot — identical inputs on every
// surface (projector, stage, preview, phone), so they all move at the same
// moment. Pause freezes `elapsed` (pausedAt anchors it) and remaining alike.
export function computeVideoPhase(t, now) {
  if (!isVideoCountdown(t) || !t.live || t.live.endsAt == null) return null;
  const live = t.live;
  const isPaused = live.pausedAt != null && live.pausedRemain != null;
  const at = Number.isFinite(Number(now)) ? Number(now) : Date.now();
  const clock = isPaused ? live.pausedAt : at;
  const started = live.startedAt != null ? live.startedAt : clock;
  const elapsed = Math.max(0, clock - started);
  const remaining = isPaused ? Math.max(0, live.pausedRemain) : Math.max(0, live.endsAt - at);
  // endsAt − startedAt is pause-invariant (resume re-anchors endsAt by the
  // pause span), so the return-to-center boundary stays consistent.
  const durationMs = Math.max(0, live.endsAt - started);
  const returnAt = Math.max(0, durationMs - VIDEO_RETURN_AT_MS);
  let phase;
  if (elapsed >= returnAt) phase = 'final';        // final wins on overlap
  else if (elapsed < VIDEO_SPLASH_MS) phase = 'splash';
  else phase = 'corner';
  const pulseSec = Math.max(0, Math.ceil(remaining / 1000));
  return { phase, elapsed, remaining, durationMs, returnAt, paused: isPaused, pulseSec };
}

// Phase hook: derives the phase from Date.now() and wakes the component
// EXACTLY on each boundary (splash end, 5s return, every final second, zero)
// so transitions fire on time instead of up to a tick late. No schedule
// while paused — the phase is frozen until resume re-renders it.
export function useVideoPhase(timer) {
  const [, setWake] = useState(0);
  const phase = computeVideoPhase(timer, Date.now());
  const live = timer && timer.live;
  useEffect(() => {
    if (!phase || phase.paused || !live || live.endsAt == null) return undefined;
    const now = Date.now();
    const started = live.startedAt != null ? live.startedAt : now;
    const cand = [];
    if (phase.phase === 'splash') cand.push(started + VIDEO_SPLASH_MS - now);
    if (phase.phase === 'splash' || phase.phase === 'corner') cand.push(started + phase.durationMs - VIDEO_RETURN_AT_MS - now);
    if (phase.phase === 'final') cand.push((phase.remaining % 1000) || 1000);
    cand.push(live.endsAt - now + 40); // land just past zero → 00:00 + completion
    const wait = Math.min(...cand.filter((x) => x > 0));
    if (!Number.isFinite(wait)) return undefined;
    const id = setTimeout(() => setWake((x) => x + 1), Math.max(40, wait));
    return () => clearTimeout(id);
  }); // no dep array: every render re-arms the wake against fresh wall time
  return phase;
}

// Does the file actually carry an audio track? Chromium hides audioTracks, so
// we ask the element's capture stream (its track list mirrors the container).
// { hasAudio: true|false|null, unsupported } — null = couldn't tell (playback
// still works; audio simply plays or stays silent), unsupported = the file
// format isn't playable in this environment (some MOV variants).
export function probeVideoAudio(url) {
  return new Promise((resolve) => {
    if (!url || typeof document === 'undefined') { resolve({ hasAudio: null, unsupported: false }); return; }
    const v = document.createElement('video');
    let settled = false;
    const done = (hasAudio, unsupported) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try { v.onloadedmetadata = null; v.onerror = null; v.pause(); v.removeAttribute('src'); v.load(); } catch {}
      resolve({ hasAudio, unsupported });
    };
    const timer = setTimeout(() => done(null, false), 6000);
    v.preload = 'metadata';
    v.muted = true;
    v.onloadedmetadata = () => {
      try {
        const at = v.audioTracks;
        if (at && typeof at.length === 'number') { done(at.length > 0, false); return; }
      } catch {}
      try {
        const cap = typeof v.captureStream === 'function' ? v.captureStream() : null;
        if (cap) {
          const n = (cap.getAudioTracks ? cap.getAudioTracks() : []).length;
          try { (cap.getTracks ? cap.getTracks() : []).forEach((tr) => tr.stop && tr.stop()); } catch {}
          done(n > 0, false);
          return;
        }
      } catch {}
      done(null, false);
    };
    v.onerror = () => done(null, true);
    try { v.src = url; } catch { done(null, true); }
  });
}

// Carousel index for slideshow backgrounds, derived from a SHARED epoch —
// the same absolute-clock trick the countdown time itself uses — so preview,
// projector, monitor, stage and phone show the SAME slide at the same
// moment instead of each counting from its own mount time.
//   * live (Go pressed): epoch = live.startedAt, identical on every surface;
//   * idle preview: a local epoch, reset whenever the image set changes
//     (nothing else is showing it, so local is exact).
// `ticking` tells the hook the parent already repaints (live 500ms tick):
// idle previews get their own cheap 1s repaint instead.
export function useCountdownCarousel(images, slideSec, epoch, ticking) {
  const list = Array.isArray(images) ? images.filter(Boolean) : [];
  const key = list.join('|');
  const ms = Math.max(1000, (Number(slideSec) || 5) * 1000);
  const [localEpoch, setLocalEpoch] = useState(() => Date.now());
  useEffect(() => { setLocalEpoch(Date.now()); }, [key]);
  const [, setPaint] = useState(0);
  useEffect(() => {
    if (ticking || list.length < 2) return undefined;
    const id = setInterval(() => setPaint((x) => x + 1), 1000);
    return () => clearInterval(id);
  }, [ticking, list.length, key]); // eslint-disable-line react-hooks/exhaustive-deps
  const base = Number.isFinite(Number(epoch)) ? Number(epoch) : localEpoch;
  const idx = list.length ? Math.floor(Math.max(0, Date.now() - base) / ms) % list.length : 0;
  return { list, idx };
}

export function TimerFace({ timer, scale = 1, fluid = false, surface = 'preview' }) {
  const t = { ...DEFAULT_COUNTDOWN, ...(timer || {}) };
  // The interval exists only while something visibly moves (live countdown or
  // wall clock). Idle previews are frozen frames — no standing timers on any
  // output, per the stutter-free engine rules.
  const ticking = t.mode === 'clock' || !!(t.live && t.live.endsAt != null);
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!ticking) return undefined;
    const id = setInterval(() => setTick((x) => x + 1), 500);
    return () => clearInterval(id);
  }, [ticking, t.live && t.live.endsAt, t.mode]);
  const { display, suffix, over, remaining } = computeCountdown(t, Date.now());
  const k = Number(scale) || 1;
  // Final-5-seconds urgency: red time with a small shake on every surface.
  // Transform-only (GPU-cheap), and it self-clears at zero / on stop.
  const urgent = !over && remaining != null && remaining <= 5000 && remaining > 0;
  const timeColor = (over && t.overtime) || urgent ? '#FF4545' : '#ffffff';
  const face = "'CMG Sans', system-ui, sans-serif";
  const anim = t.bgType === 'animated' ? animatedPresetOf(t.bgValue) : null;
  // Custom Media mode: Lower Third Ticker layout — media fills the top, the
  // timer rides a fixed black banner at the bottom. Empty media falls back
  // to the centered layout on black (never a broken frame).
  const media = t.bgType === 'media' ? (t.bgMedia || null) : null;
  // Custom Media framing: position (object-position %) + zoom. Cover fills
  // the frame; these nudge/zoom it so any screen shape fits the setup.
  const posX = Number.isFinite(Number(media?.posX)) ? Number(media.posX) : 50;
  const posY = Number.isFinite(Number(media?.posY)) ? Number(media.posY) : 50;
  const zoom = Math.min(300, Math.max(100, Number.isFinite(Number(media?.scale)) ? Number(media.scale) : 100));
  const frameStyle = {
    position: 'absolute', inset: 0, width: '100%', height: '100%',
    objectFit: 'cover', objectPosition: `${posX}% ${posY}%`,
    transform: `scale(${zoom / 100})`, transformOrigin: 'center',
  };
  const mediaOn = !!media && (media.kind === 'video' ? !!media.video : (media.images || []).filter(Boolean).length > 0);
  // Shared media epoch: live.startedAt travels in the timer payload to every
  // surface (phone snapshots carry it too — stamp does NOT, so epoch keys on
  // startedAt, never stamp). Live config edits keep the same startedAt, so
  // media never restarts under an edit — only Go starts a new epoch.
  const mediaEpoch = t.live?.startedAt ?? null;
  const { list: slides, idx: slideIdx } = useCountdownCarousel(mediaOn && media.kind !== 'video' ? media.images : [], media?.slideSec, mediaEpoch, ticking);
  // Video-mode animation phases (center splash → top-right → final five).
  // The hook returns null unless this is a LIVE video countdown, so every
  // other mode schedules nothing and behaves exactly as before.
  const vphase = useVideoPhase(t);
  if (mediaOn && media.kind === 'video') {
    // VIDEO-UPLOAD MODE: the video fills the whole frame and the animated
    // timer floats above it as its own element. The <video> is keyed only on
    // (src, startedAt) — timer position, pause and phase changes re-render
    // this surface without ever recreating the media element.
    return (
      <VideoTimerSurface timer={t} media={media} mediaEpoch={mediaEpoch} frameStyle={frameStyle} scale={k} fluid={fluid} surface={surface} phase={vphase} />
    );
  }
  // Slideshow watermark (logo badge): pinned to a frame corner over the
  // picture, like a broadcast bug. Slideshow only.
  const wm = mediaOn && media.kind !== 'video' ? (media.watermark || null) : null;
  const wmOn = !!(wm && wm.url);
  const wmSize = Math.min(400, Math.max(32, Number.isFinite(Number(wm?.size)) ? Number(wm.size) : 160));
  const wmOpacity = Math.min(100, Math.max(10, Number.isFinite(Number(wm?.opacity)) ? Number(wm.opacity) : 100)) / 100;
  const wmPad = 24 * k;
  const wmCorner = { tl: { top: wmPad, left: wmPad }, tr: { top: wmPad, right: wmPad }, bl: { bottom: wmPad, left: wmPad }, br: { bottom: wmPad, right: wmPad } }[wm?.pos] || { top: wmPad, left: wmPad };
  // Fluid sizing (previews): every size expressed against the box height, so
  // the face fills ANY aspect — 16:9, ultrawide walls, phone minis — with
  // identical proportions. Fixed contexts (projector, stage, phone) keep
  // exact px sizing (fluid defaults off).
  const fh = (px) => (fluid ? `calc(${px} * 100cqh / 720)` : `${px * k}px`);
  const wmQ = fluid ? '3.33cqh' : wmPad;
  const wmCornerF = { tl: { top: wmQ, left: wmQ }, tr: { top: wmQ, right: wmQ }, bl: { bottom: wmQ, left: wmQ }, br: { bottom: wmQ, right: wmQ } }[wm?.pos] || { top: wmQ, left: wmQ };
  if (mediaOn) {
    const bannerH = fluid ? fh(170) : `${170 * k}px`;
    const tTitle = Math.min(t.titleSize, 30);
    const tTime = Math.min(t.timeSize, 100);
    const tSub = Math.min(t.subtextSize, 22);
    return (
      <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', background: '#000', overflow: 'hidden', boxSizing: 'border-box' }}>
        <style>{'@keyframes kogUrgencyShake{0%,100%{transform:translateX(0)}25%{transform:translateX(-6px)}75%{transform:translateX(6px)}}'}</style>
        <div style={{ flex: 1, minHeight: 0, position: 'relative', overflow: 'hidden', background: '#000' }}>
          {/* Slideshow only — the video kind returned above. */}
          {slides.map((src, i) => (
            <img
              key={`${src}|${i}`}
              src={src}
              alt=""
              draggable={false}
              style={{ ...frameStyle, opacity: i === slideIdx ? 1 : 0, transition: 'opacity 0.9s ease-in-out' }}
            />
          ))}
          {wmOn && (
            <img
              src={wm.url}
              alt=""
              draggable={false}
              title="Slideshow watermark"
              style={{ position: 'absolute', zIndex: 2, width: fluid ? `calc(${wmSize} * 100cqh / 720)` : wmSize * k, height: fluid ? `calc(${wmSize} * 100cqh / 720)` : wmSize * k, borderRadius: '50%', objectFit: 'cover', opacity: wmOpacity, pointerEvents: 'none', ...(fluid ? wmCornerF : wmCorner) }}
            />
          )}
        </div>
        <div style={{ height: bannerH, flexShrink: 0, background: '#000', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: fluid ? 'calc(3 * 100cqh / 720)' : 3 * k, padding: fluid ? '0 3.33cqh' : `0 ${24 * k}px`, boxSizing: 'border-box', overflow: 'hidden' }}>
          {t.title ? (
            <div style={{ fontFamily: face, fontSize: fluid ? `calc(${tTitle} * 100cqh / 720)` : Math.max(8, tTitle * k), fontWeight: 700, color: '#ffffff', textAlign: 'center', lineHeight: 1.15, textShadow: '0 4px 24px rgba(0,0,0,0.55)', maxWidth: '100%', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.title}</div>
          ) : null}
          <div style={{ fontFamily: face, fontSize: fluid ? `calc(${tTime} * 100cqh / 720)` : Math.max(12, tTime * k), fontWeight: 800, color: timeColor, lineHeight: 1, letterSpacing: '0.01em', textShadow: '0 6px 40px rgba(0,0,0,0.55)', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap', animation: urgent ? 'kogUrgencyShake 0.4s ease-in-out infinite' : undefined }}>
            {display}
            {suffix ? <span style={{ fontSize: '0.22em', fontWeight: 700, marginLeft: '0.25em', verticalAlign: 'baseline', opacity: 0.85 }}>{suffix}</span> : null}
          </div>
          {t.subtext ? (
            <div style={{ fontFamily: face, fontSize: fluid ? `calc(${tSub} * 100cqh / 720)` : Math.max(7, tSub * k), fontWeight: 600, color: 'rgba(255,255,255,0.78)', textAlign: 'center', lineHeight: 1.3, textShadow: '0 2px 16px rgba(0,0,0,0.55)', maxWidth: '100%', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.subtext}</div>
          ) : null}
        </div>
      </div>
    );
  }
  return (
    <div style={{ position: 'absolute', inset: 0, background: anim ? anim.base : (t.bgValue || '#000'), display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: fluid ? 'calc(10 * 100cqh / 720)' : 10 * k, overflow: 'hidden', boxSizing: 'border-box', padding: fluid ? 'calc(24 * 100cqh / 720)' : 24 * k }}>
      <style>{'@keyframes kogUrgencyShake{0%,100%{transform:translateX(0)}25%{transform:translateX(-6px)}75%{transform:translateX(6px)}}@keyframes kogDrift{from{transform:translate(var(--kog-dx-neg,0px),var(--kog-dy-neg,0px))}to{transform:translate(var(--kog-dx,0px),var(--kog-dy,0px))}}'}</style>
      {anim && anim.blobs.map((b, i) => (
        <div
          key={b.css + i}
          style={{
            position: 'absolute',
            width: fluid ? `calc(${b.w} * 100cqh / 720)` : b.w * k,
            height: fluid ? `calc(${b.h} * 100cqh / 720)` : b.h * k,
            left: `${b.x}%`,
            top: `${b.y}%`,
            background: b.css,
            animation: `kogDrift ${b.d} ease-in-out infinite alternate`,
            ['--kog-dx']: fluid ? `calc(${b.dx} * 100cqh / 720)` : `${b.dx * k}px`,
            ['--kog-dy']: fluid ? `calc(${b.dy} * 100cqh / 720)` : `${b.dy * k}px`,
            ['--kog-dx-neg']: fluid ? `calc(${-b.dx} * 100cqh / 720)` : `${-b.dx * k}px`,
            ['--kog-dy-neg']: fluid ? `calc(${-b.dy} * 100cqh / 720)` : `${-b.dy * k}px`,
          }}
        />
      ))}
      {t.title ? (
        <div style={{ position: 'relative', zIndex: 1, fontFamily: face, fontSize: fluid ? `calc(${t.titleSize} * 100cqh / 720)` : Math.max(8, t.titleSize * k), fontWeight: 700, color: '#ffffff', textAlign: 'center', lineHeight: 1.15, textShadow: '0 4px 24px rgba(0,0,0,0.55)', maxWidth: '100%' }}>{t.title}</div>
      ) : null}
      <div style={{ position: 'relative', zIndex: 1, fontFamily: face, fontSize: fluid ? `calc(${t.timeSize} * 100cqh / 720)` : Math.max(12, t.timeSize * k), fontWeight: 800, color: timeColor, lineHeight: 1, letterSpacing: '0.01em', textShadow: '0 6px 40px rgba(0,0,0,0.55)', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap', animation: urgent ? 'kogUrgencyShake 0.4s ease-in-out infinite' : undefined }}>
        {display}
        {suffix ? <span style={{ fontSize: '0.22em', fontWeight: 700, marginLeft: '0.25em', verticalAlign: 'baseline', opacity: 0.85 }}>{suffix}</span> : null}
      </div>
      {t.subtext ? (
        <div style={{ position: 'relative', zIndex: 1, fontFamily: face, fontSize: fluid ? `calc(${t.subtextSize} * 100cqh / 720)` : Math.max(7, t.subtextSize * k), fontWeight: 600, color: 'rgba(255,255,255,0.78)', textAlign: 'center', lineHeight: 1.3, textShadow: '0 2px 16px rgba(0,0,0,0.55)', maxWidth: '100%' }}>{t.subtext}</div>
      ) : null}
    </div>
  );
}

// VIDEO-UPLOAD COUNTDOWN SURFACE — video fills the frame, the animated timer
// floats above it as a SEPARATE element (VideoTimerOverlay). Exactly one
// surface in the app plays the original audio, decided by `surface` + showOn:
// the main output (or the stage only when the countdown routes stage-only),
// so preview, stage mirror, monitor and phone can never double the room sound.
// That same surface is the media-clock master; every silent copy follows its
// position (lib/countdownClock.js) so picture and sound stay locked for hours.
function VideoTimerSurface({ timer, media, mediaEpoch, frameStyle, scale, fluid, surface, phase }) {
  const videoRef = useRef(null);
  const fadedRef = useRef(false);
  const audio = (media && media.videoAudio) || {};
  const baseVol = Math.min(1, Math.max(0, Number.isFinite(Number(audio.volume)) ? Number(audio.volume) : 0.9));
  const audioOn = audio.enabled !== false && audio.hasTrack !== false; // no-track → graceful silence
  const showOn = (timer.live && timer.live.showOn) || timer.showOn || 'both';
  // Exactly ONE surface may play the original track. `audioOwner` is stamped
  // per window by the main process (the oldest output of each role), so a
  // second wall / monitor / preview can never play the same file underneath
  // the first and turn the room into an echo. Absent flag (console payloads,
  // older builds) falls back to the showOn routing unchanged.
  const roleOwnsAudio = surface === 'main'
    ? (showOn === 'both' || showOn === 'main')
    : surface === 'stage' ? showOn === 'stage'
    : false;
  const ownsAudio = timer.audioOwner === false ? false : roleOwnsAudio;
  const audible = !!(ownsAudio && audioOn && !audio.muted);
  const fadeSec = Math.max(0, Number(audio.fadeSec) || 0);
  const remaining = phase ? phase.remaining : null;
  const paused = !!(phase && phase.paused);
  const looping = media.loop !== false;

  // A fresh epoch (Go Live / Restart) re-arms the end fade.
  useEffect(() => { fadedRef.current = false; }, [mediaEpoch, media.video]);

  // COUNTDOWN TRANSPORT OWNS THE MEDIA: a paused timer must freeze the video
  // and its sound too. Otherwise the picture (and the track) keeps running
  // under a frozen clock, and on Resume the media has moved on without the
  // timer — the classic "the audio is ahead of the countdown" complaint.
  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    try {
      if (paused) {
        if (!el.paused) el.pause();
      } else if (el.paused) {
        const p = el.play();
        if (p && p.catch) p.catch(() => {});
      }
    } catch {}
    // src/epoch belong here too: editing the background or Restarting mounts a
    // fresh <video autoPlay>, and a still-paused timer must re-freeze it.
  }, [paused, media.video, mediaEpoch]);

  // SHARED MEDIA CLOCK — keep every copy of the video on the wall's timeline.
  //   master (the one surface that owns the countdown) → publish currentTime;
  //   every preview / mirror / extra wall            → chase it.
  // Extrapolating from `time + (now − ts)` means the 500ms sample interval
  // never costs accuracy; small differences are absorbed with ±8% rate nudges
  // (followers are muted, so nothing is audible), and only a real drift of
  // more than a second gets one hard seek. Loop wraps are taken modulo the
  // duration so the wrap point can never cause a panic seek.
  useEffect(() => {
    const el = videoRef.current;
    if (!el) return undefined;

    if (ownsAudio) {
      const publish = () => {
        const d = Number(el.duration) || 0;
        if (!(d > 0)) return;
        try {
          localStorage.setItem(COUNTDOWN_CLOCK_KEY, JSON.stringify({
            url: media.video,
            epoch: mediaEpoch ?? null,
            time: Number(el.currentTime) || 0,
            duration: d,
            playing: !el.paused && !el.ended,
            loop: looping,
            ts: Date.now(),
          }));
        } catch {}
      };
      // The master is the room's only sound source, so it must never sit
      // silently frozen while the timer runs. Undo a stray OS/Chromium pause
      // and nudge a decoder that reports playing but has stopped advancing
      // (pause+play re-primes it in place, keeping the position).
      let lastTime = el.currentTime;
      let stalled = 0;
      const heal = () => {
        if (paused || el.ended) { lastTime = el.currentTime; stalled = 0; return; }
        if (el.paused) {
          const p = el.play();
          if (p && p.catch) p.catch(() => {});
          lastTime = el.currentTime; stalled = 0;
          return;
        }
        if (el.seeking) { lastTime = el.currentTime; stalled = 0; return; }
        if (el.currentTime !== lastTime) { lastTime = el.currentTime; stalled = 0; return; }
        if (++stalled >= 2) {
          stalled = 0;
          try { el.pause(); } catch {}
          const p = el.play();
          if (p && p.catch) p.catch(() => {});
        }
      };
      const tick = () => { heal(); publish(); };
      tick();
      const id = setInterval(tick, 500);
      return () => clearInterval(id);
    }

    const follow = () => {
      let clock = null;
      try { clock = JSON.parse(localStorage.getItem(COUNTDOWN_CLOCK_KEY) || 'null'); } catch {}
      const fresh = clock
        && clock.url === media.video
        && (clock.epoch ?? null) === (mediaEpoch ?? null)
        && (Date.now() - (Number(clock.ts) || 0)) < COUNTDOWN_CLOCK_FRESH_MS;
      if (!fresh) {
        try { if (el.playbackRate !== 1) el.playbackRate = 1; } catch {}
        return;
      }
      // Transport mirrors the master, so an OS-paused or finished wall can
      // never leave a preview looping ahead of the room. A locally paused
      // timer is authoritative: never resurrect it from a stale "playing"
      // record (the clock is only rewritten twice a second).
      if (!paused) {
        if (clock.playing && el.paused) {
          const p = el.play();
          if (p && p.catch) p.catch(() => {});
        } else if (!clock.playing && !el.paused) {
          try { el.pause(); } catch {}
        }
      }
      const d = Number(clock.duration) || Number(el.duration) || 0;
      const solved = countdownClockTarget(clock, Date.now(), el.currentTime, d);
      if (!solved) return;
      const { target, diff } = solved;
      try {
        if (Math.abs(diff) > 1) {
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
    };
    follow();
    const id = setInterval(follow, 500);
    return () => {
      clearInterval(id);
      try { el.playbackRate = 1; } catch {}
    };
  }, [ownsAudio, media.video, mediaEpoch, looping, paused]);

  // React does not apply `muted`/`volume` as settable attributes — write the
  // DOM properties directly. Runs on mount too, so the initial state is exact.
  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    try { el.muted = !audible; } catch {}
    if (audible && !fadedRef.current) {
      try { el.volume = baseVol; } catch {}
      if (!paused && el.paused) { const p = el.play(); if (p && p.catch) p.catch(() => {}); }
    }
  }, [audible, baseVol, paused]);

  // Optional end-of-countdown fade: ramps the audio down over the last
  // `fadeSec` seconds so it reaches silence exactly on 00:00 and stays there
  // through the output's exit transition. `remaining` freezes while paused
  // (derived from the paused clock), so the ramp freezes with it. This effect
  // also re-arms playback every tick — a stray pause can't strand the wall
  // silent. Loop events never touch it: the video loops itself.
  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    if (audible && !fadedRef.current) {
      if (!paused && el.paused) { const p = el.play(); if (p && p.catch) p.catch(() => {}); }
      if (fadeSec > 0 && remaining != null && remaining > 0 && remaining <= fadeSec * 1000) {
        try { el.volume = baseVol * Math.max(0, Math.min(1, remaining / (fadeSec * 1000))); } catch {}
      } else if (remaining != null && remaining <= 0) {
        // Zero reached: silence immediately and hold it through the output's
        // exit transition, whether or not an end fade was configured.
        fadedRef.current = true;
        try { el.volume = 0; } catch {}
      } else {
        try { el.volume = baseVol; } catch {}
      }
    }
  }, [audible, baseVol, fadeSec, remaining, paused]);

  return (
    <div style={{ position: 'absolute', inset: 0, background: '#000', overflow: 'hidden', boxSizing: 'border-box' }}>
      {/* ONE video element for the whole countdown: keyed on src + start
          epoch only (a Restart is a new epoch on purpose; every other state
          change re-renders in place). Loop keeps video AND its original audio
          running until the timer — never the other way around. */}
      <video
        key={`${media.video}|${mediaEpoch ?? 'idle'}`}
        ref={videoRef}
        src={media.video}
        autoPlay
        muted={!audible}
        playsInline
        preload="auto"
        loop={media.loop !== false}
        style={{ ...frameStyle }}
      />
      <VideoTimerOverlay timer={timer} scale={scale} fluid={fluid} phase={phase} />
    </div>
  );
}

// The floating timer for video mode — the ONLY thing that moves. One Motion
// element travels center → top-right → center; position/scale live here, so
// the video underneath is never touched. Keyed on the live stamp: starting or
// restarting mounts a fresh cinematic splash, pause/resume keeps the element
// alive, and ordinary re-renders (the 500ms tick) can't re-trigger anything.
function VideoTimerOverlay({ timer, scale, fluid, phase }) {
  const t = { ...DEFAULT_COUNTDOWN, ...(timer || {}) };
  const live = t.live || null;
  const stampKey = live ? String(live.stamp ?? live.startedAt ?? 'live') : 'idle';
  const corner = !!(phase && phase.phase === 'corner');
  // Anchor math: the element sits at `left/top` percentages with an
  // compensating translate (percent of its own box) so that after the corner
  // scale its RIGHT/TOP edges land exactly on the inset (3.5%) of the output.
  const S = VIDEO_CORNER_SCALE;
  const center = { left: '50%', top: '50%', x: '-50%', y: '-50%', scale: 1 };
  const near = {
    left: `${100 - VIDEO_CORNER_INSET}%`,
    top: `${VIDEO_CORNER_INSET}%`,
    x: `${-(50 + 50 * S)}%`,
    y: `${-50 * (1 - S)}%`,
    scale: S,
  };
  const target = corner ? near : center;
  // Splash-in on mount, 800ms ease-in-out for every travel after that.
  const transition = !live
    ? { duration: 0.25 }
    : (phase && phase.phase === 'splash')
      ? { duration: 0.7, ease: [0.16, 1, 0.3, 1] }
      : { duration: VIDEO_MOVE_MS / 1000, ease: [0.4, 0, 0.2, 1] };
  // Display: MM:SS clamped at 00:00 while a countdown runs (spec: no
  // negatives in video mode); idle preview mirrors the configured duration,
  // wall-clock mode keeps its clock face.
  const cd = computeCountdown(t, Date.now());
  let display = cd.display;
  if (phase) display = fmtVideoClock(phase.remaining);
  else if (t.mode === 'target' && t.targetTime) {
    const end = nextTargetTime(t.targetTime, Date.now());
    display = fmtVideoClock(end ? Math.max(0, end - Date.now()) : 0);
  } else if (t.mode !== 'clock') {
    display = fmtVideoClock((Number(t.durationSec) || 0) * 1000);
  }
  // One gentle scale pulse per second through the final five — keyed on the
  // whole second, so re-renders inside the same second never replay it and a
  // paused clock never pulses.
  const pulseSec = phase && phase.phase === 'final' && !phase.paused ? phase.pulseSec : null;
  const k = Number(scale) || 1;
  const px = Math.max(12, Math.min(720, Number(t.timeSize) || 360));
  const fontSize = fluid ? `calc(${px} * 100cqh / 720)` : `${px * k}px`;
  const face = "'CMG Sans', system-ui, sans-serif";
  // Title / subtext keep their content in video mode, but they ride the
  // CENTER phases only — in the corner the timer stands alone like a
  // broadcast bug. Absolutely positioned so a long line never widens the
  // timer box (which would skew the corner anchor).
  const capGap = fluid ? 'calc(8 * 100cqh / 720)' : `${8 * k}px`;
  const cap = (sizePx) => ({
    position: 'absolute', left: '50%', transform: 'translateX(-50%)',
    fontFamily: face, maxWidth: '60ch', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
    fontSize: fluid ? `calc(${sizePx} * 100cqh / 720)` : Math.max(8, sizePx * k),
    color: '#ffffff', lineHeight: 1.2, textAlign: 'center',
    textShadow: '0 2px 18px rgba(0,0,0,0.55)',
    opacity: corner ? 0 : 1, transition: 'opacity 0.35s ease',
  });
  return (
    <motion.div
      key={stampKey}
      initial={live ? { opacity: 0, scale: 0.85, ...center } : { opacity: 1, scale: 1, ...center }}
      animate={{ opacity: 1, ...target }}
      transition={transition}
      style={{ position: 'absolute', zIndex: 3, pointerEvents: 'none', textAlign: 'center', whiteSpace: 'nowrap', willChange: 'transform, opacity, left, top' }}
    >
      {t.title ? (
        <div style={{ ...cap(t.titleSize), bottom: `calc(100% + ${capGap})` }}>{t.title}</div>
      ) : null}
      <motion.div
        key={pulseSec != null ? `pulse${pulseSec}` : 'pulse-idle'}
        initial={pulseSec != null ? { scale: 1.07 } : false}
        animate={{ scale: 1 }}
        transition={{ type: 'spring', stiffness: 360, damping: 16, mass: 0.5 }}
        style={{ display: 'inline-block', fontFamily: face, fontSize, fontWeight: 800, color: '#ffffff', lineHeight: 1, letterSpacing: '0.01em', fontVariantNumeric: 'tabular-nums', textShadow: '0 0 26px rgba(255,255,255,0.30), 0 4px 30px rgba(0,0,0,0.65)' }}
      >
        {display}
      </motion.div>
      {t.subtext ? (
        <div style={{ ...cap(t.subtextSize), top: `calc(100% + ${capGap})` }}>{t.subtext}</div>
      ) : null}
    </motion.div>
  );
}
