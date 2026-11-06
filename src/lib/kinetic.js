// KINETIC TYPOGRAPHY — per-layer animation timelines.
//
// The app already supports several text boxes on one slide (src/lib/songTextObjects.js)
// and a per-box ENTRANCE (anim / speed / transDuration). What it could not do is
// TIME those boxes: three copies of "PRAISE!" all entered together, nothing ever
// left, and nothing moved continuously.
//
// This module adds exactly that, as one optional `kin` object per text box:
//
//   kin = {
//     v: 1,
//     in: 'scale', inDur: 0.55,     // entrance + its own duration
//     delay: 0,                     // seconds after the slide fires
//     out: 'fade', outDur: 0.5,     // exit
//     outAt: 0,                     // seconds; 0 = when the entrance finishes
//     ease: 'ease-out',
//     loop: 'float', loopDur: 4,    // continuous motion
//     amp: 1,                       // strength of the continuous motion, 0..2
//   }
//
// RULES THIS FILE KEEPS:
//   • Nothing here renders. It is pure data + CSS strings, so the editor and the
//     projector compute the identical timeline from the identical object.
//   • Absent/invalid config returns null. A cue without `kin` keeps the legacy
//     CSS-keyframe behaviour untouched — old songs cannot change appearance.
//   • All durations are seconds (a person types 0.6, not 600) and are clamped,
//     because these values are typed into number inputs.
//   • Animations never rely on keyframes declared elsewhere: KIN_STYLE_TAG
//     carries every frame it uses, injected by the renderer that needs them.
export const KIN_VERSION = 1;

// Font stacks for the presets, spelled out here (not imported from
// constants.js) so this module stays pure data + CSS: it is unit-tested under
// plain Node and read by the projector, where nothing else is loaded. The
// families are the app's own bundled faces; every entry keeps a generic
// fallback so a missing face degrades to something readable.
const FONT_FAMILIES = {
  'CMG Sans Wide': '"CMG Sans Wide", "CMG Sans", sans-serif',
  'CMG Sans Black': '"CMG Sans Black", "CMG Sans", sans-serif',
  'CMG Sans CAPS': '"CMG Sans CAPS", "CMG Sans", sans-serif',
  'CMG Sans CAPS Condensed': '"CMG Sans CAPS Condensed", "CMG Sans", sans-serif',
  'CMG Sans Wide Outline': '"CMG Sans Wide Outline", "CMG Sans", sans-serif',
  'CMG Sans ExtraLight': '"CMG Sans ExtraLight", "CMG Sans", sans-serif',
  'CMG Sans Light': '"CMG Sans Light", "CMG Sans", sans-serif',
  'CMG Sans Mono Digits': '"CMG Sans Mono Digits", "CMG Sans", sans-serif',
  Anton: '"Anton", Impact, sans-serif',
  'Cinzel Decorative': '"Cinzel Decorative", Georgia, serif',
};

const FONT = (label) => FONT_FAMILIES[label] || FONT_FAMILIES['CMG Sans Wide'];

// ---- catalogues ------------------------------------------------------------

export const KIN_EASES = [
  { key: 'ease-out', label: 'Ease Out', css: 'cubic-bezier(.16,1,.3,1)' },
  { key: 'ease-in-out', label: 'Ease In-Out', css: 'cubic-bezier(.65,0,.35,1)' },
  { key: 'ease-in', label: 'Ease In', css: 'cubic-bezier(.7,0,.84,0)' },
  { key: 'linear', label: 'Linear', css: 'linear' },
  { key: 'spring', label: 'Spring', css: 'cubic-bezier(.34,1.56,.64,1)' },
];

/** Entrances. `dur` is the default the UI writes when the effect is chosen. */
export const KIN_ENTRANCES = [
  { key: 'none', label: 'None', dur: 0 },
  { key: 'fade', label: 'Fade In', dur: 0.6 },
  { key: 'scale', label: 'Scale In', dur: 0.55 },
  { key: 'zoom', label: 'Zoom In', dur: 0.5 },
  { key: 'slide-up', label: 'Slide Up', dur: 0.6 },
  { key: 'slide-down', label: 'Slide Down', dur: 0.6 },
  { key: 'slide-left', label: 'Slide Left', dur: 0.6 },
  { key: 'slide-right', label: 'Slide Right', dur: 0.6 },
  { key: 'rotate', label: 'Rotate In', dur: 0.75 },
  { key: 'blur', label: 'Blur Reveal', dur: 0.7 },
  { key: 'tracking', label: 'Tracking Reveal', dur: 0.9 },
  { key: 'wipe', label: 'Wipe Up', dur: 0.7 },
  { key: 'flip', label: 'Flip In', dur: 0.8 },
];

export const KIN_EXITS = [
  { key: 'none', label: 'Stays', dur: 0 },
  { key: 'fade', label: 'Fade Out', dur: 0.5 },
  { key: 'scale', label: 'Scale Out', dur: 0.5 },
  { key: 'zoom', label: 'Zoom Out', dur: 0.45 },
  { key: 'slide-up', label: 'Slide Up Out', dur: 0.5 },
  { key: 'slide-down', label: 'Slide Down Out', dur: 0.5 },
  { key: 'slide-left', label: 'Slide Left Out', dur: 0.5 },
  { key: 'slide-right', label: 'Slide Right Out', dur: 0.5 },
  { key: 'rotate', label: 'Rotate Out', dur: 0.6 },
  { key: 'blur', label: 'Blur Out', dur: 0.55 },
  { key: 'wipe', label: 'Wipe Out', dur: 0.55 },
];

/** Continuous motion. `dir` is the CSS animation-direction. */
export const KIN_LOOPS = [
  { key: 'none', label: 'Still', dur: 0, dir: 'normal' },
  { key: 'float', label: 'Floating', dur: 4, dir: 'normal' },
  { key: 'breathe', label: 'Breathing', dur: 5, dir: 'normal' },
  { key: 'pulse', label: 'Pulsing', dur: 2.4, dir: 'normal' },
  { key: 'slow-zoom', label: 'Slow Zoom', dur: 8, dir: 'alternate' },
  { key: 'spin', label: 'Rotating', dur: 14, dir: 'normal' },
  { key: 'glow', label: 'Glowing', dur: 3.2, dir: 'normal' },
  { key: 'wave', label: 'Wave', dur: 3.6, dir: 'normal' },
  { key: 'drift-x', label: 'Horizontal Drift', dur: 9, dir: 'normal' },
  { key: 'drift-y', label: 'Vertical Drift', dur: 9, dir: 'normal' },
];

const IN_KEYS = new Set(KIN_ENTRANCES.map((e) => e.key));
const OUT_KEYS = new Set(KIN_EXITS.map((e) => e.key));
const LOOP_KEYS = new Set(KIN_LOOPS.map((l) => l.key));
const EASE_KEYS = new Set(KIN_EASES.map((e) => e.key));

const entryOf = (list, key) => list.find((x) => x.key === key) || list[0];

export const DEFAULT_KIN = {
  v: KIN_VERSION,
  in: 'fade',
  inDur: 0.6,
  delay: 0,
  out: 'none',
  outDur: 0.5,
  outAt: 0,
  ease: 'ease-out',
  loop: 'none',
  loopDur: 4,
  amp: 1,
};

const clampNum = (v, lo, hi, fallback) => {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(hi, Math.max(lo, n));
};

// ---- normalisation ---------------------------------------------------------

/**
 * Canonical `kin` config, or null when the box has none.
 *
 * null is meaningful: the renderer uses it to keep the legacy entrance path, so
 * a song saved before this feature renders byte-for-byte as it did. An object
 * that exists but holds junk is repaired rather than dropped — a half-typed
 * value in a number input must not silently switch a layer back to legacy.
 */
export const normalizeKin = (raw) => {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const inKey = IN_KEYS.has(raw.in) ? raw.in : DEFAULT_KIN.in;
  const outKey = OUT_KEYS.has(raw.out) ? raw.out : 'none';
  const loopKey = LOOP_KEYS.has(raw.loop) ? raw.loop : 'none';
  const loopDef = entryOf(KIN_LOOPS, loopKey);
  return {
    v: KIN_VERSION,
    in: inKey,
    // A 0-second entrance is allowed (None), but anything under 20ms would be a
    // flicker the operator cannot see, so the minimum for a real effect is 0.05.
    inDur: inKey === 'none' ? 0 : clampNum(raw.inDur, 0.05, 10, entryOf(KIN_ENTRANCES, inKey).dur),
    delay: clampNum(raw.delay, 0, 30, 0),
    out: outKey,
    outDur: outKey === 'none' ? 0 : clampNum(raw.outDur, 0.05, 10, entryOf(KIN_EXITS, outKey).dur),
    outAt: clampNum(raw.outAt, 0, 60, 0),
    ease: EASE_KEYS.has(raw.ease) ? raw.ease : DEFAULT_KIN.ease,
    loop: loopKey,
    loopDur: loopKey === 'none' ? 0 : clampNum(raw.loopDur, 0.4, 30, loopDef.dur),
    amp: clampNum(raw.amp, 0, 2, 1),
  };
};

export const hasKin = (obj) => !!(obj && obj.kin && typeof obj.kin === 'object');

/** New config for a box, inheriting nothing from the slide. */
export const newKin = (patch = {}) => normalizeKin({ ...DEFAULT_KIN, ...patch });

// ---- timing ----------------------------------------------------------------

/**
 * The layer's timeline in seconds. The exit cannot start before the entrance
 * ends — otherwise the two animations would overlap on the same box and the
 * last writer wins, which is exactly the kind of silent nonsense this function
 * exists to prevent. `outAt: 0` means "as soon as the entrance lands".
 */
export const kinTiming = (raw) => {
  const k = normalizeKin(raw);
  if (!k) return null;
  const inStart = k.delay;
  const inEnd = k.delay + k.inDur;
  const outStart = k.out === 'none' ? 0 : Math.max(k.outAt > 0 ? k.outAt : inEnd, inEnd);
  const outEnd = k.out === 'none' ? 0 : outStart + k.outDur;
  return {
    inStart,
    inEnd,
    outStart,
    outEnd,
    loopStart: inEnd,
    // How long this layer is worth watching: enough to see it leave.
    total: Math.max(inEnd, outEnd),
  };
};

const pascal = (key) => String(key).split('-').map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join('');
const ms = (seconds) => `${Math.max(1, Math.round(Number(seconds) * 1000))}ms`;

/**
 * The three animation shorthands the renderer puts on its three wrappers:
 * exit on the outside, entrance in the middle, continuous loop innermost.
 * Separate elements because two animations on one element both owning
 * `transform` would overwrite each other; separate wrapper layers compose.
 */
export const kinAnimations = (raw) => {
  const k = normalizeKin(raw);
  if (!k) return { enter: '', exit: '', loop: '' };
  const t = kinTiming(k);
  const ease = entryOf(KIN_EASES, k.ease).css;
  return {
    enter: k.in === 'none' ? '' : `kogKinIn${pascal(k.in)} ${ms(k.inDur)} ${ease} ${ms(k.delay)} both`,
    exit: k.out === 'none' ? '' : `kogKinOut${pascal(k.out)} ${ms(k.outDur)} ${ease} ${ms(t.outStart)} forwards`,
    loop: k.loop === 'none' ? '' : `kogKinLoop${pascal(k.loop)} ${ms(k.loopDur)} ease-in-out ${ms(t.loopStart)} infinite ${entryOf(KIN_LOOPS, k.loop).dir}`,
  };
};

/** CSS custom properties the loop keyframes scale themselves with. */
export const kinVars = (raw) => {
  const k = normalizeKin(raw);
  return k ? { '--kog-kin-amp': String(k.amp) } : {};
};

/**
 * How long the whole stack is worth watching: the latest layer end, with a
 * floor so a slide made entirely of 0.4s fades still has a scrub range. Used by
 * the editor's preview clock and its track bars, so the bars, the playhead and
 * the real animations all share one length.
 */
export const kinStackTotal = (layers, floor = 4) => {
  const list = Array.isArray(layers) ? layers : [];
  let total = 0;
  for (const l of list) {
    const t = kinTiming(l && l.kin);
    if (t && t.total > total) total = t.total;
  }
  const f = Number.isFinite(Number(floor)) ? Math.max(0, Number(floor)) : 4;
  return Math.max(f, total);
};

/** One-line description for layer lists and chips. */
export const summarizeKin = (raw) => {
  const k = normalizeKin(raw);
  if (!k) return 'No animation';
  const parts = [];
  if (k.in !== 'none') parts.push(entryOf(KIN_ENTRANCES, k.in).label);
  if (k.loop !== 'none') parts.push(entryOf(KIN_LOOPS, k.loop).label);
  if (k.out !== 'none') parts.push(entryOf(KIN_EXITS, k.out).label);
  return parts.length ? parts.join(' · ') : 'Holds';
};

// ---- keyframes -------------------------------------------------------------

/**
 * Every frame this engine uses, shipped with the renderer that needs it.
 *
 * Not in App's global stylesheet on purpose: the wall document, the console and
 * thumbnails are different documents/roots, and a keyframe that only exists in
 * one of them is the classic "editor animates, projector sits still" bug.
 * Names are prefixed `kogKin*` so they can never collide with the older
 * transition keyframes.
 */
export const KIN_STYLE_TAG = `
@keyframes kogKinInFade { from { opacity: 0 } to { opacity: 1 } }
@keyframes kogKinInScale { from { opacity: 0; transform: scale(.8) } to { opacity: 1; transform: scale(1) } }
@keyframes kogKinInZoom { from { opacity: 0; transform: scale(1.38) } to { opacity: 1; transform: scale(1) } }
@keyframes kogKinInSlideUp { from { opacity: 0; transform: translateY(56px) } to { opacity: 1; transform: translateY(0) } }
@keyframes kogKinInSlideDown { from { opacity: 0; transform: translateY(-56px) } to { opacity: 1; transform: translateY(0) } }
@keyframes kogKinInSlideLeft { from { opacity: 0; transform: translateX(60px) } to { opacity: 1; transform: translateX(0) } }
@keyframes kogKinInSlideRight { from { opacity: 0; transform: translateX(-60px) } to { opacity: 1; transform: translateX(0) } }
@keyframes kogKinInRotate { from { opacity: 0; transform: rotate(-14deg) scale(.88) } to { opacity: 1; transform: rotate(0deg) scale(1) } }
@keyframes kogKinInBlur { from { opacity: 0; filter: blur(18px) } to { opacity: 1; filter: blur(0) } }
@keyframes kogKinInTracking { from { opacity: 0; letter-spacing: .42em } to { opacity: 1; letter-spacing: 0 } }
@keyframes kogKinInWipe { from { clip-path: inset(100% 0 0 0) } to { clip-path: inset(0 0 0 0) } }
@keyframes kogKinInFlip { from { opacity: 0; transform: perspective(900px) rotateX(82deg) } to { opacity: 1; transform: perspective(900px) rotateX(0deg) } }

@keyframes kogKinOutFade { from { opacity: 1 } to { opacity: 0 } }
@keyframes kogKinOutScale { from { opacity: 1; transform: scale(1) } to { opacity: 0; transform: scale(.78) } }
@keyframes kogKinOutZoom { from { opacity: 1; transform: scale(1) } to { opacity: 0; transform: scale(1.42) } }
@keyframes kogKinOutSlideUp { from { opacity: 1; transform: translateY(0) } to { opacity: 0; transform: translateY(-64px) } }
@keyframes kogKinOutSlideDown { from { opacity: 1; transform: translateY(0) } to { opacity: 0; transform: translateY(64px) } }
@keyframes kogKinOutSlideLeft { from { opacity: 1; transform: translateX(0) } to { opacity: 0; transform: translateX(-72px) } }
@keyframes kogKinOutSlideRight { from { opacity: 1; transform: translateX(0) } to { opacity: 0; transform: translateX(72px) } }
@keyframes kogKinOutRotate { from { opacity: 1; transform: rotate(0deg) scale(1) } to { opacity: 0; transform: rotate(12deg) scale(.86) } }
@keyframes kogKinOutBlur { from { opacity: 1; filter: blur(0) } to { opacity: 0; filter: blur(20px) } }
@keyframes kogKinOutWipe { from { clip-path: inset(0 0 0 0) } to { clip-path: inset(0 0 100% 0) } }

@keyframes kogKinLoopFloat { 0%, 100% { transform: translateY(calc(var(--kog-kin-amp, 1) * -9px)) } 50% { transform: translateY(calc(var(--kog-kin-amp, 1) * 9px)) } }
@keyframes kogKinLoopBreathe { 0%, 100% { transform: scale(1) } 50% { transform: scale(calc(1 + .04 * var(--kog-kin-amp, 1))) } }
@keyframes kogKinLoopPulse { 0%, 100% { opacity: 1 } 50% { opacity: calc(1 - .32 * var(--kog-kin-amp, 1)) } }
@keyframes kogKinLoopSlowZoom { from { transform: scale(1) } to { transform: scale(calc(1 + .08 * var(--kog-kin-amp, 1))) } }
@keyframes kogKinLoopSpin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }
@keyframes kogKinLoopGlow { 0%, 100% { filter: drop-shadow(0 0 0 rgba(255,255,255,0)) } 50% { filter: drop-shadow(0 0 calc(var(--kog-kin-amp, 1) * 20px) rgba(255,255,255,.6)) } }
@keyframes kogKinLoopWave { 0%, 100% { transform: translateY(0) rotate(-.7deg) } 50% { transform: translateY(calc(var(--kog-kin-amp, 1) * -7px)) rotate(.7deg) } }
@keyframes kogKinLoopDriftX { 0%, 100% { transform: translateX(calc(var(--kog-kin-amp, 1) * -14px)) } 50% { transform: translateX(calc(var(--kog-kin-amp, 1) * 14px)) } }
@keyframes kogKinLoopDriftY { 0%, 100% { transform: translateY(calc(var(--kog-kin-amp, 1) * -14px)) } 50% { transform: translateY(calc(var(--kog-kin-amp, 1) * 14px)) } }
`;

// ---- presets ---------------------------------------------------------------

let uid = 0;
const nextId = () => `kx${Date.now().toString(36)}${(uid++).toString(36)}`;

/**
 * A layer is a cue-shaped text object (so `cueLyricStyle` renders it with no
 * special casing) plus its own `kin` timeline. `text` is filled from the slide
 * when the preset is applied, which is what makes these "the same word in
 * several treatments" rather than canned placeholder copy.
 */
const layer = (cue, spec) => ({
  id: nextId(),
  text: cue.text || '',
  font: spec.font,
  size: spec.size,
  color: spec.color || '#ffffff',
  align: 'center',
  valign: 'middle',
  bold: spec.bold !== false,
  italic: !!spec.italic,
  lineHeight: spec.lineHeight || 1,
  letterSpacing: spec.letterSpacing || 0,
  opacity: spec.opacity == null ? 100 : spec.opacity,
  blendMode: spec.blendMode || 'normal',
  box: spec.box,
  ...(spec.gradient ? { gradient: true, gradientColor1: spec.gradient[0], gradientColor2: spec.gradient[1], gradientAngle: spec.gradientAngle || 180 } : {}),
  ...(spec.outline ? { outline: true, strokeColor: spec.strokeColor || '#ffffff', strokeWidth: spec.strokeWidth || 2 } : {}),
  kin: newKin(spec.kin),
});

const box = (x, y, w, h, angle = 0) => ({ x, y, w, h, angle });

export const KIN_PRESETS = [
  {
    key: 'bold-praise',
    label: 'Bold Praise',
    blurb: 'Condensed display type stacked with an offset colour hit.',
    build: (cue) => ({
      main: {
        font: FONT('Anton'),
        size: 190,
        bold: true,
        color: '#ffffff',
        letterSpacing: 0,
        kin: { in: 'scale', inDur: 0.5, ease: 'spring', loop: 'breathe', loopDur: 5, amp: 0.6 },
      },
      layers: [
        layer(cue, {
          font: FONT('CMG Sans CAPS Condensed'), size: 210, color: '#FFC72C', letterSpacing: 4,
          box: box(40, 96, 1200, 300, -4),
          kin: { in: 'slide-up', inDur: 0.55, delay: 0.12, loop: 'drift-x', loopDur: 7, amp: 0.5 },
        }),
        layer(cue, {
          font: FONT('CMG Sans Black'), size: 84, color: '#ffffff', opacity: 68, letterSpacing: 14,
          box: box(120, 470, 1040, 150),
          kin: { in: 'fade', inDur: 0.7, delay: 0.3, out: 'fade', outDur: 0.6, outAt: 4.2 },
        }),
      ],
    }),
  },
  {
    key: 'cinematic-worship',
    label: 'Cinematic Worship',
    blurb: 'Elegant serif, slow fades, one breathing layer.',
    build: (cue) => ({
      main: {
        font: FONT('Cinzel Decorative'),
        size: 96,
        bold: false,
        color: '#f7f3ec',
        letterSpacing: 6,
        kin: { in: 'blur', inDur: 1.2, ease: 'ease-out', loop: 'slow-zoom', loopDur: 12, amp: 0.35 },
      },
      layers: [
        layer(cue, {
          font: FONT('CMG Sans Light'), size: 46, color: '#f7f3ec', opacity: 55, letterSpacing: 18,
          box: box(140, 520, 1000, 90),
          kin: { in: 'tracking', inDur: 1.4, delay: 0.8, loop: 'float', loopDur: 9, amp: 0.3 },
        }),
      ],
    }),
  },
  {
    key: 'kinetic-typography',
    label: 'Kinetic Typography',
    blurb: 'Four treatments of the same word, staggered and overlapping.',
    build: (cue) => ({
      main: {
        font: FONT('Anton'),
        size: 200,
        color: '#ffffff',
        kin: { in: 'zoom', inDur: 0.45, ease: 'spring', loop: 'drift-y', loopDur: 8, amp: 0.35 },
      },
      layers: [
        layer(cue, {
          font: FONT('CMG Sans Wide Outline'), size: 260, color: '#ffffff', bold: true,
          box: box(40, 60, 1200, 360, 3),
          kin: { in: 'flip', inDur: 0.7, delay: 0.18, loop: 'float', loopDur: 6, amp: 0.4, out: 'scale', outDur: 0.5, outAt: 5 },
        }),
        layer(cue, {
          font: FONT('CMG Sans CAPS Condensed'), size: 130, color: '#FFC72C', letterSpacing: 8,
          box: box(80, 400, 1120, 170, -6),
          kin: { in: 'slide-left', inDur: 0.55, delay: 0.36, loop: 'drift-x', loopDur: 5, amp: 0.7 },
        }),
        layer(cue, {
          font: FONT('CMG Sans Mono Digits'), size: 52, color: '#ffffff', opacity: 45, letterSpacing: 22,
          box: box(200, 560, 880, 90),
          kin: { in: 'tracking', inDur: 0.9, delay: 0.54, out: 'blur', outDur: 0.5, outAt: 4.5 },
        }),
      ],
    }),
  },
  {
    key: 'modern-worship',
    label: 'Modern Worship',
    blurb: 'Clean sans with a gradient fill and a subtle halo line.',
    build: (cue) => ({
      main: {
        font: FONT('CMG Sans Wide'),
        size: 128,
        color: '#ffffff',
        gradient: ['#ffffff', '#8fd8ff'],
        kin: { in: 'fade', inDur: 0.7, loop: 'glow', loopDur: 4.5, amp: 0.5 },
      },
      layers: [
        layer(cue, {
          font: FONT('CMG Sans ExtraLight'), size: 54, color: '#8fd8ff', opacity: 60, letterSpacing: 10,
          box: box(160, 500, 960, 100),
          kin: { in: 'slide-up', inDur: 0.7, delay: 0.25, loop: 'float', loopDur: 7, amp: 0.4 },
        }),
      ],
    }),
  },
  {
    key: 'energetic-praise',
    label: 'Energetic Praise',
    blurb: 'Large, rotated, fast — built for a loud chorus.',
    build: (cue) => ({
      main: {
        font: FONT('CMG Sans Black'),
        size: 180,
        color: '#ffffff',
        kin: { in: 'scale', inDur: 0.3, ease: 'spring', loop: 'pulse', loopDur: 1.8, amp: 0.8 },
      },
      layers: [
        layer(cue, {
          font: FONT('Anton'), size: 240, color: '#FF4D6D', letterSpacing: 2,
          box: box(60, 110, 1180, 320, -8),
          kin: { in: 'rotate', inDur: 0.35, delay: 0.08, ease: 'spring', loop: 'wave', loopDur: 2.6, amp: 1, out: 'rotate', outDur: 0.4, outAt: 4 },
        }),
        layer(cue, {
          font: FONT('CMG Sans CAPS'), size: 96, color: '#FFC72C', letterSpacing: 16,
          box: box(80, 440, 1120, 130, 5),
          kin: { in: 'slide-right', inDur: 0.3, delay: 0.2, loop: 'drift-x', loopDur: 3, amp: 1, out: 'zoom', outDur: 0.35, outAt: 4.4 },
        }),
        layer(cue, {
          font: FONT('CMG Sans Wide Outline'), size: 300, color: '#ffffff',
          box: box(20, 40, 1240, 420),
          kin: { in: 'fade', inDur: 0.5, delay: 0.4, loop: 'spin', loopDur: 22, amp: 0.4, out: 'fade', outDur: 0.5, outAt: 4.8 },
        }),
      ],
    }),
  },
];

export const kinPresetOf = (key) => KIN_PRESETS.find((p) => p.key === key) || null;

/**
 * Apply a kinetic preset to ONE slide.
 *
 * The slide's text is preserved (every layer is stamped with cue.text), its
 * background/notes/timing are untouched, and the extra boxes it had are
 * replaced by the preset's stack — a template defines the composition, so
 * merging it into a previous stack would produce neither.
 */
export const applyKineticPreset = (cue, presetKey) => {
  if (!cue || typeof cue !== 'object') return cue;
  const preset = kinPresetOf(presetKey);
  if (!preset) return cue;
  const built = preset.build(cue);
  return {
    ...cue,
    ...built.main,
    kin: newKin(built.main.kin),
    texts: (built.layers || []).map((l) => ({ ...l, text: cue.text || l.text || '' })),
    kinPreset: preset.key,
  };
};

/** Strip kinetic config from a slide and its boxes (back to legacy motion). */
export const clearKinetic = (cue) => {
  if (!cue || typeof cue !== 'object') return cue;
  const { kin, kinPreset, ...rest } = cue;
  return {
    ...rest,
    texts: (cue.texts || []).map((t) => {
      const { kin: _k, ...plain } = t || {};
      return plain;
    }),
  };
};
