import React, { useState, useEffect } from 'react';

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
  timeSize: 360,
  subtextSize: 40,
  bgType: 'gradient', // color | gradient | animated | media
  bgValue: 'linear-gradient(135deg, #052e16 0%, #166534 55%, #031a0d 100%)',
  // Custom Media mode (bgType 'media'): slideshow carousel and/or loop video.
  // URLs are media:// (persisted to userData, survive restarts) — never bytes.
  bgMedia: null, // { kind:'slideshow'|'video', images:[], slideSec:5, video:null, loop:true }
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
      { css: 'radial-gradient(circle, rgba(34,197,94,0.50) 0%, transparent 70%)', w: 900, h: 900, x: 8, y: 4, dx: 120, dy: 60, d: '11s' },
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
      { css: 'radial-gradient(circle, rgba(139,92,246,0.50) 0%, transparent 70%)', w: 900, h: 900, x: 6, y: 8, dx: 140, dy: 60, d: '13s' },
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
      { css: 'radial-gradient(circle, rgba(167,139,250,0.38) 0%, transparent 70%)', w: 740, h: 740, x: 56, y: 46, dx: 120, dy: -70, d: '10s' },
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

export function TimerFace({ timer, scale = 1 }) {
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
  const timeColor = (over && t.overtime) || urgent ? '#f87171' : '#ffffff';
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
  const zoom = Math.min(300, Math.max(25, Number.isFinite(Number(media?.scale)) ? Number(media.scale) : 100));
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
  const mediaEpoch = t.live?.startedAt ?? null;  const { list: slides, idx: slideIdx } = useCountdownCarousel(mediaOn && media.kind !== 'video' ? media.images : [], media?.slideSec, mediaEpoch, ticking);
  if (mediaOn) {
    const bannerH = 210 * k;
  // Slideshow watermark (logo badge): image overlay pinned to a corner of
  // the MEDIA area (never the banner), like a broadcast bug. Slideshow only.
  const wm = mediaOn && media.kind !== 'video' ? (media.watermark || null) : null;
  const wmOn = !!(wm && wm.url);
  const wmSize = Math.min(400, Math.max(32, Number.isFinite(Number(wm?.size)) ? Number(wm.size) : 160));
  const wmOpacity = Math.min(100, Math.max(10, Number.isFinite(Number(wm?.opacity)) ? Number(wm.opacity) : 100)) / 100;
  const wmPad = 24 * k;
  const wmCorner = { tl: { top: wmPad, left: wmPad }, tr: { top: wmPad, right: wmPad }, bl: { bottom: wmPad, left: wmPad }, br: { bottom: wmPad, right: wmPad } }[wm?.pos] || { top: wmPad, left: wmPad };
    return (
      <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', background: '#000', overflow: 'hidden', boxSizing: 'border-box' }}>
        <style>{'@keyframes kogUrgencyShake{0%,100%{transform:translateX(0)}25%{transform:translateX(-6px)}75%{transform:translateX(6px)}}'}</style>
        <div style={{ flex: 1, minHeight: 0, position: 'relative', overflow: 'hidden', background: '#000' }}>
          {media.kind === 'video' ? (
            <video
              key={`${media.video}|${mediaEpoch ?? 'idle'}`}
              src={media.video}
              autoPlay
              muted
              playsInline
              preload="auto"
              loop={media.loop !== false}
              style={{ ...frameStyle }}
            />
          ) : (
            slides.map((src, i) => (
              <img
                key={`${src}|${i}`}
                src={src}
                alt=""
                draggable={false}
                style={{ ...frameStyle, opacity: i === slideIdx ? 1 : 0, transition: 'opacity 0.9s ease-in-out' }}
              />
            ))
          )}
          {wmOn && (
            <img
              src={wm.url}
              alt=""
              draggable={false}
              title="Slideshow watermark"
              style={{ position: 'absolute', zIndex: 2, width: wmSize * k, height: wmSize * k, borderRadius: '50%', objectFit: 'cover', opacity: wmOpacity, pointerEvents: 'none', ...wmCorner }}
            />
          )}
        </div>
        <div style={{ height: bannerH, flexShrink: 0, background: '#000', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4 * k, padding: `0 ${24 * k}px`, boxSizing: 'border-box', overflow: 'hidden' }}>
          {t.title ? (
            <div style={{ fontFamily: face, fontSize: Math.max(8, Math.min(t.titleSize, 40) * k), fontWeight: 700, color: '#ffffff', textAlign: 'center', lineHeight: 1.15, textShadow: '0 4px 24px rgba(0,0,0,0.55)', maxWidth: '100%', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.title}</div>
          ) : null}
          <div style={{ fontFamily: face, fontSize: Math.max(12, Math.min(t.timeSize, 132) * k), fontWeight: 800, color: timeColor, lineHeight: 1, letterSpacing: '0.01em', textShadow: '0 6px 40px rgba(0,0,0,0.55)', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap', animation: urgent ? 'kogUrgencyShake 0.4s ease-in-out infinite' : undefined }}>
            {display}
            {suffix ? <span style={{ fontSize: '0.22em', fontWeight: 700, marginLeft: '0.25em', verticalAlign: 'baseline', opacity: 0.85 }}>{suffix}</span> : null}
          </div>
          {t.subtext ? (
            <div style={{ fontFamily: face, fontSize: Math.max(7, Math.min(t.subtextSize, 28) * k), fontWeight: 600, color: 'rgba(255,255,255,0.78)', textAlign: 'center', lineHeight: 1.3, textShadow: '0 2px 16px rgba(0,0,0,0.55)', maxWidth: '100%', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.subtext}</div>
          ) : null}
        </div>
      </div>
    );
  }
  return (
    <div style={{ position: 'absolute', inset: 0, background: anim ? anim.base : (t.bgValue || '#000'), display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10 * k, overflow: 'hidden', boxSizing: 'border-box', padding: 24 * k }}>
      <style>{'@keyframes kogUrgencyShake{0%,100%{transform:translateX(0)}25%{transform:translateX(-6px)}75%{transform:translateX(6px)}}@keyframes kogDrift{from{transform:translate(var(--kog-dx-neg,0px),var(--kog-dy-neg,0px))}to{transform:translate(var(--kog-dx,0px),var(--kog-dy,0px))}}'}</style>
      {anim && anim.blobs.map((b, i) => (
        <div
          key={b.css + i}
          style={{
            position: 'absolute',
            width: b.w * k,
            height: b.h * k,
            left: `${b.x}%`,
            top: `${b.y}%`,
            background: b.css,
            animation: `kogDrift ${b.d} ease-in-out infinite alternate`,
            ['--kog-dx']: `${b.dx * k}px`,
            ['--kog-dy']: `${b.dy * k}px`,
            ['--kog-dx-neg']: `${-b.dx * k}px`,
            ['--kog-dy-neg']: `${-b.dy * k}px`,
          }}
        />
      ))}
      {t.title ? (
        <div style={{ position: 'relative', zIndex: 1, fontFamily: face, fontSize: Math.max(8, t.titleSize * k), fontWeight: 700, color: '#ffffff', textAlign: 'center', lineHeight: 1.15, textShadow: '0 4px 24px rgba(0,0,0,0.55)', maxWidth: '100%' }}>{t.title}</div>
      ) : null}
      <div style={{ position: 'relative', zIndex: 1, fontFamily: face, fontSize: Math.max(12, t.timeSize * k), fontWeight: 800, color: timeColor, lineHeight: 1, letterSpacing: '0.01em', textShadow: '0 6px 40px rgba(0,0,0,0.55)', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap', animation: urgent ? 'kogUrgencyShake 0.4s ease-in-out infinite' : undefined }}>
        {display}
        {suffix ? <span style={{ fontSize: '0.22em', fontWeight: 700, marginLeft: '0.25em', verticalAlign: 'baseline', opacity: 0.85 }}>{suffix}</span> : null}
      </div>
      {t.subtext ? (
        <div style={{ position: 'relative', zIndex: 1, fontFamily: face, fontSize: Math.max(7, t.subtextSize * k), fontWeight: 600, color: 'rgba(255,255,255,0.78)', textAlign: 'center', lineHeight: 1.3, textShadow: '0 2px 16px rgba(0,0,0,0.55)', maxWidth: '100%' }}>{t.subtext}</div>
      ) : null}
    </div>
  );
}
