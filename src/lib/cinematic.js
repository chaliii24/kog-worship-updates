// CINEMATIC LOOKS — the shared data layer for the "worship film" visuals.
//
// Everything here is DATA on the cue (stored automatically in style_json /
// title_cue_json), read by ONE renderer (ProjectorDisplay / SlideTextLayers)
// and previewed by the editor through the same helpers. No second rendering
// path, no schema migration: an old cue simply has no `fx` / `bg_fx` / `ghost`
// and gets the safe defaults below.
//
// Effects are CSS-only by design. Grain/noise/scanlines/glitch are static
// layers that animate with transform/opacity (GPU friendly); no JS timers per
// frame, so a wall with a video background keeps its playback uninterrupted.
import { FONT_OPTIONS } from './constants';

const FACE = (label) => (FONT_OPTIONS.find((f) => f.label === label) || FONT_OPTIONS[0]).value;

const num = (v, def, lo, hi) => {
  const n = Number(v);
  if (!Number.isFinite(n)) return def;
  return Math.min(hi, Math.max(lo, n));
};

const bool = (v, def = false) => (v == null ? def : !!v);

// ---------------------------------------------------------------------------
// Effect model
// ---------------------------------------------------------------------------
export const FX_DEFAULTS = {
  grain: 0,
  noise: 0,
  scanlines: 0,
  rgbSplit: 0,
  glitch: 0,
  flicker: 0,
  jitter: 0,
  scratches: 0,
  vignette: 0,
  contrast: 0,
  brightness: 0,
  saturation: 0,
  speed: 1,
  overText: true,
  blend: 'normal',
};

export const BG_FX_DEFAULTS = {
  grayscale: 0,
  contrast: 0,
  brightness: 0,
  saturation: 0,
  sepia: 0,
  blur: 0,
  zoom: 100,
  vignette: 0,
  tint: '#000000',
  tintOpacity: 0,
  overlay: 'none',
  overlayOpacity: 55,
};

const FX_RANGES = {
  grain: [0, 100], noise: [0, 100], scanlines: [0, 100], rgbSplit: [0, 100],
  glitch: [0, 100], flicker: [0, 100], jitter: [0, 100], scratches: [0, 100],
  vignette: [0, 100], contrast: [-40, 80], brightness: [-40, 40], saturation: [-100, 60],
  speed: [0.2, 3],
};

const BLEND_MODES = new Set(['normal', 'overlay', 'screen', 'soft-light', 'multiply', 'lighten', 'darken', 'color-dodge']);

export const normalizeFx = (raw) => {
  const f = raw && typeof raw === 'object' ? raw : {};
  const out = { ...FX_DEFAULTS };
  for (const k of Object.keys(FX_RANGES)) out[k] = num(f[k], FX_DEFAULTS[k], FX_RANGES[k][0], FX_RANGES[k][1]);
  out.overText = bool(f.overText, true);
  out.blend = BLEND_MODES.has(f.blend) ? f.blend : 'normal';
  return out;
};

export const normalizeBgFx = (raw) => {
  const b = raw && typeof raw === 'object' ? raw : {};
  return {
    grayscale: num(b.grayscale, 0, 0, 100),
    contrast: num(b.contrast, 0, -40, 100),
    brightness: num(b.brightness, 0, -50, 50),
    saturation: num(b.saturation, 0, -100, 80),
    sepia: num(b.sepia, 0, 0, 100),
    blur: num(b.blur, 0, 0, 24),
    zoom: num(b.zoom, 100, 100, 135),
    vignette: num(b.vignette, 0, 0, 100),
    tint: /^#[0-9a-f]{3,8}$/i.test(String(b.tint || '')) ? b.tint : '#000000',
    tintOpacity: num(b.tintOpacity, 0, 0, 100),
    overlay: ['none', 'grunge', 'paper', 'dust', 'ink'].includes(b.overlay) ? b.overlay : 'none',
    overlayOpacity: num(b.overlayOpacity, 0, 0, 100),
  };
};

export const cinematicOf = (cue) => ({
  fx: normalizeFx(cue && cue.fx),
  bgFx: normalizeBgFx(cue && cue.bg_fx),
});

// CSS filter for the BACKGROUND layer only. Text is intentionally left sharp
// and readable — the cinematic grade belongs to the photo/video underneath.
export const bgFxFilter = (raw) => {
  const b = normalizeBgFx(raw);
  const parts = [];
  if (b.grayscale) parts.push(`grayscale(${b.grayscale / 100})`);
  if (b.sepia) parts.push(`sepia(${b.sepia / 100})`);
  if (b.contrast) parts.push(`contrast(${1 + b.contrast / 100})`);
  if (b.brightness) parts.push(`brightness(${1 + b.brightness / 100})`);
  if (b.saturation) parts.push(`saturate(${1 + b.saturation / 100})`);
  if (b.blur) parts.push(`blur(${b.blur}px)`);
  return parts.length ? parts.join(' ') : 'none';
};

export const bgFxTransform = (raw) => {
  const b = normalizeBgFx(raw);
  return b.zoom === 100 ? undefined : `scale(${b.zoom / 100})`;
};

// ---------------------------------------------------------------------------
// Ghost / watermark layer
// ---------------------------------------------------------------------------
export const DEFAULT_GHOST_BOX = { x: 64, y: 170, w: 1152, h: 380 };

export const GHOST_DEFAULTS = {
  on: false,
  text: '',
  source: 'custom',
  box: { ...DEFAULT_GHOST_BOX },
  font: '',
  size: 230,
  lineHeight: 0.95,
  letterSpacing: 6,
  align: 'center',
  valign: 'middle',
  case: 'upper',
  color: '#f5f5f4',
  opacity: 20,
  strokeColor: '#f5f5f4',
  strokeWidth: 2.5,
  // Hollow is the watermark default (outline only). Turning it off fills the
  // glyphs with `color`, so the Fill picker below is not a dead control.
  strokeOnly: true,
  blendMode: 'screen',
  scale: 1,
};

const safeBox = (b, fallback = DEFAULT_GHOST_BOX) => {
  const src = b && typeof b === 'object' ? b : {};
  const w = num(src.w, fallback.w, 80, 2400);
  const h = num(src.h, fallback.h, 40, 1600);
  return {
    x: num(src.x, fallback.x, -400, 1600),
    y: num(src.y, fallback.y, -400, 1200),
    w,
    h,
    ...(src.angle != null ? { angle: num(src.angle, 0, -180, 180) } : null),
  };
};

export const normalizeGhost = (raw) => {
  const g = raw && typeof raw === 'object' ? raw : {};
  return {
    on: bool(g.on, false),
    // Watermark text is the operator's choice (previous line, next line, or
    // typed). Hard-capped so a pasted verse cannot bloat every payload.
    text: String(g.text || '').slice(0, 600),
    source: ['custom', 'prev', 'next', 'this'].includes(g.source) ? g.source : 'custom',
    box: safeBox(g.box),
    font: typeof g.font === 'string' ? g.font : '',
    size: num(g.size, GHOST_DEFAULTS.size, 20, 520),
    lineHeight: num(g.lineHeight, GHOST_DEFAULTS.lineHeight, 0.5, 2.5),
    letterSpacing: num(g.letterSpacing, GHOST_DEFAULTS.letterSpacing, -5, 40),
    align: ['left', 'center', 'right', 'justify'].includes(g.align) ? g.align : 'center',
    valign: ['top', 'middle', 'bottom'].includes(g.valign) ? g.valign : 'middle',
    case: ['none', 'upper', 'lower', 'title'].includes(g.case) ? g.case : 'upper',
    color: /^#[0-9a-f]{3,8}$/i.test(String(g.color || '')) ? g.color : '#f5f5f4',
    opacity: num(g.opacity, GHOST_DEFAULTS.opacity, 0, 100),
    strokeColor: /^#[0-9a-f]{3,8}$/i.test(String(g.strokeColor || '')) ? g.strokeColor : '#f5f5f4',
    strokeWidth: num(g.strokeWidth, GHOST_DEFAULTS.strokeWidth, 0, 16),
    strokeOnly: bool(g.strokeOnly, true),
    blendMode: BLEND_MODES.has(g.blendMode) ? g.blendMode : 'screen',
    scale: num(g.scale, 1, 0.2, 3),
  };
};

// ---------------------------------------------------------------------------
// Built-in presets
// ---------------------------------------------------------------------------
const PRESET_CUE = {
  font: FACE('Anton'),
  size: 130,
  lineHeight: 0.98,
  letterSpacing: 1.5,
  bold: true,
  italic: false,
  underline: false,
  strike: false,
  case: 'upper',
  align: 'center',
  valign: 'middle',
  color: '#f5f5f4',
  shadow: true,
  shadowColor: '#000000',
  shadowBlur: 26,
  shadowOffsetX: 0,
  shadowOffsetY: 6,
  glow: false,
  gradient: false,
  outline: false,
  strokeColor: '#000000',
  strokeWidth: 1.5,
  strokeOnly: false,
  opacity: 100,
  blendMode: 'normal',
  anim: 'fade',
  speed: 0.35,
  transDuration: 0,
};

const preset = (id, name, note, cue, fx = {}, bgFx = {}, ghost = null, tags = []) => ({
  id,
  name,
  note,
  tags,
  cue: { ...PRESET_CUE, ...cue },
  fx: normalizeFx({ ...FX_DEFAULTS, ...fx }),
  bg_fx: normalizeBgFx({ ...BG_FX_DEFAULTS, ...bgFx }),
  ghost: ghost ? { ...GHOST_DEFAULTS, ...ghost, on: true, text: '' } : null,
});

export const CINEMATIC_PRESETS = [
  preset('cine-grunge', 'Cinematic Grunge', 'Dirty film grain, hard type, heavy contrast.', {
    size: 138, letterSpacing: 1, shadowBlur: 30, shadowOffsetY: 9,
    anim: 'glitch', speed: 0.3,
  }, {
    grain: 48, scratches: 28, vignette: 40, contrast: 22, brightness: -4, saturation: -18, speed: 0.9,
  }, {
    grayscale: 35, contrast: 35, brightness: -8, vignette: 42, overlay: 'grunge', overlayOpacity: 42,
  }, null, ['film', 'dirty']),

  preset('cine-mono', 'Monochrome Photo', 'Black-and-white photograph, clean bold words.', {
    font: FACE('Anton'), size: 128, color: '#ffffff', shadowBlur: 20, shadowOffsetY: 5,
    anim: 'fade', speed: 0.55,
  }, {
    grain: 22, scanlines: 6, vignette: 30, contrast: 10, speed: 0.7,
  }, {
    grayscale: 100, contrast: 34, brightness: -6, vignette: 34,
  }, null, ['mono', 'photo']),

  preset('cine-rgb', 'RGB Glitch', 'Chromatic split, signal noise, digital hits.', {
    font: FACE('CMG Sans Black'), size: 126, letterSpacing: 1, anim: 'glitch', speed: 0.22,
  }, {
    rgbSplit: 62, glitch: 46, scanlines: 20, grain: 16, flicker: 10, noise: 18, speed: 1.7,
  }, {
    contrast: 24, saturation: 12, vignette: 22,
  }, null, ['glitch', 'rgb', 'youth']),

  preset('cine-distressed', 'Distressed Bold', 'Torn poster texture behind huge condensed type.', {
    font: FACE('Anton'), size: 142, letterSpacing: 0.5, shadowBlur: 34, shadowOffsetY: 10,
    anim: 'zoom-in', speed: 0.28,
  }, {
    grain: 58, scratches: 46, vignette: 46, contrast: 26, brightness: -6, speed: 0.8,
  }, {
    grayscale: 22, contrast: 30, brightness: -10, vignette: 50, overlay: 'grunge', overlayOpacity: 70,
  }, null, ['grunge', 'poster']),

  preset('cine-clean', 'Clean Minimal', 'Quiet type, no texture, nothing between words.', {
    font: FACE('CMG Sans Wide (Default)'), size: 108, lineHeight: 1.08, letterSpacing: 0.5,
    case: 'none', shadow: false, anim: 'fade', speed: 0.45,
  }, {
    speed: 1,
  }, {
    contrast: 6,
  }, null, ['minimal', 'clean']),

  preset('cine-contrast', 'High Contrast', 'Maximum separation — white type, deep blacks.', {
    font: FACE('CMG Sans Black'), size: 136, letterSpacing: 1, color: '#ffffff',
    outline: true, strokeColor: '#000000', strokeWidth: 3, shadow: true, shadowBlur: 10,
    anim: 'fade', speed: 0.25,
  }, {
    vignette: 28, grain: 14, contrast: 18, speed: 0.7,
  }, {
    grayscale: 45, contrast: 68, brightness: -12, vignette: 30,
  }, null, ['contrast', 'loud']),

  preset('cine-atmos', 'Atmospheric Motion', 'Soft focus, air and slow movement.', {
    font: FACE('Cinzel Decorative'), size: 100, lineHeight: 1.16, letterSpacing: 2.5,
    case: 'none', shadowBlur: 24, shadowOffsetY: 6, anim: 'fade', speed: 0.9,
  }, {
    grain: 30, vignette: 34, brightness: 2, saturation: -10, speed: 0.5,
  }, {
    blur: 5, brightness: -12, contrast: 16, saturation: -12, zoom: 108, vignette: 38, overlay: 'dust', overlayOpacity: 38,
  }, null, ['atmos', 'soft']),

  preset('cine-ghost', 'Modern Ghost Bold', 'Solid foreground type over huge hollow echo lines.', {
    font: FACE('Anton'), size: 132, lineHeight: 0.98, letterSpacing: 2.5,
    case: 'upper', color: '#ffffff', shadow: true, shadowBlur: 24, shadowOffsetY: 7,
    anim: 'fade', speed: 0.3,
  }, {
    grain: 18, vignette: 26, contrast: 12, speed: 0.8,
  }, {
    grayscale: 28, contrast: 24, brightness: -8, vignette: 30,
  }, {
    on: true, source: 'prev', box: { x: 40, y: 20, w: 1200, h: 690 },
    size: 260, lineHeight: 0.9, letterSpacing: 8, opacity: 18,
    strokeColor: '#f5f5f4', strokeWidth: 3, blendMode: 'screen',
  }, ['ghost', 'layered', 'modern']),
];

// ---------------------------------------------------------------------------
// Cue patches / custom presets
// ---------------------------------------------------------------------------
export const CUE_LOOK_KEYS = [
  'font', 'size', 'lineHeight', 'letterSpacing', 'bold', 'italic', 'underline', 'strike',
  'case', 'align', 'valign', 'color', 'shadow', 'shadowColor', 'shadowBlur', 'shadowOffsetX',
  'shadowOffsetY', 'glow', 'glowColor', 'glowBlur', 'outline', 'strokeColor', 'strokeWidth',
  'strokeOnly', 'opacity', 'blendMode', 'gradient', 'gradientColor1', 'gradientColor2',
  'gradientAngle', 'highlight', 'hlOpacity', 'anim', 'speed', 'transDuration',
];

// A preset has TWO kinds of look, and they live on different objects:
//   * type keys belong to a text box (the main cue or cue.texts[n])
//   * transition keys belong to the SLIDE, never to an individual box
// Keeping them separate is what lets "apply to Box 2" change its type without
// silently changing the slide's transition (or the main lyric's type).
export const SLIDE_TRANSITION_KEYS = ['anim', 'speed', 'transDuration'];

export const TEXT_LOOK_KEYS = CUE_LOOK_KEYS.filter((k) => !SLIDE_TRANSITION_KEYS.includes(k));

const pickLookKeys = (src, keys) => {
  const out = {};
  const s = src && typeof src === 'object' ? src : {};
  for (const k of keys) if (s[k] !== undefined) out[k] = s[k];
  return out;
};

export const cinematicTextPatch = (p) => pickLookKeys(p && p.cue, TEXT_LOOK_KEYS);

export const cinematicTransitionPatch = (p) => pickLookKeys(p && p.cue, SLIDE_TRANSITION_KEYS);

export const cinematicCuePatch = (p) => {
  if (!p) return {};
  const cue = {};
  const src = p.cue || {};
  for (const k of CUE_LOOK_KEYS) if (src[k] !== undefined) cue[k] = src[k];
  cue.fx = normalizeFx(p.fx);
  cue.bg_fx = normalizeBgFx(p.bg_fx);
  if (p.ghost) {
    // A preset carries the ghost LOOK, never its words: text always comes from
    // this slide (or the chosen context line), so applying a preset can never
    // overwrite a lyric.
    cue.ghost = { ...normalizeGhost(p.ghost), on: true, text: '' };
  }
  return cue;
};

export const presetFromCue = (cue) => {
  const c = cue || {};
  const out = {
    id: `u-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    custom: true,
    tags: ['custom'],
    cue: { ...PRESET_CUE },
    fx: normalizeFx(c.fx),
    bg_fx: normalizeBgFx(c.bg_fx),
    ghost: null,
  };
  for (const k of CUE_LOOK_KEYS) if (c[k] !== undefined) out.cue[k] = c[k];
  if (c.ghost && normalizeGhost(c.ghost).on) out.ghost = { ...normalizeGhost(c.ghost), text: '' };
  return out;
};

export const CINEMATIC_STORAGE = 'kog_cinematic_presets';

const clean = (v) => String(v || '').trim();

const validPreset = (p) => p && clean(p.id) && clean(p.name) && p.cue && typeof p.cue === 'object';

export const readCustomCinematicPresets = () => {
  try {
    if (typeof localStorage === 'undefined') return [];
    const raw = localStorage.getItem(CINEMATIC_STORAGE);
    const arr = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(arr)) return [];
    return arr.filter((p) => validPreset(p) && p.custom).map((p) => ({
      ...p,
      fx: normalizeFx(p.fx),
      bg_fx: normalizeBgFx(p.bg_fx),
      ghost: p.ghost ? normalizeGhost(p.ghost) : null,
    }));
  } catch {
    return [];
  }
};

const writeCustom = (list) => {
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(CINEMATIC_STORAGE, JSON.stringify(list));
    return true;
  } catch {
    return false;
  }
};

export const allCinematicPresets = (custom = readCustomCinematicPresets()) => [...CINEMATIC_PRESETS, ...custom];

export const saveCustomCinematicPreset = (name, data) => {
  const list = readCustomCinematicPresets();
  const item = {
    ...data,
    id: data && data.id ? data.id : `u-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    name: clean(name) || 'My Cinematic Look',
    note: 'Saved from this slide on this computer.',
    custom: true,
    tags: ['custom'],
    cue: { ...PRESET_CUE, ...((data && data.cue) || {}) },
    fx: normalizeFx(data && data.fx),
    bg_fx: normalizeBgFx(data && data.bg_fx),
    ghost: data && data.ghost ? normalizeGhost(data.ghost) : null,
  };
  writeCustom([...list, item]);
  return item;
};

export const deleteCustomCinematicPreset = (id) => {
  const list = readCustomCinematicPresets();
  if (!list.some((p) => p.id === id)) return false;
  writeCustom(list.filter((p) => p.id !== id));
  return true;
};

// ---------------------------------------------------------------------------
// Texture assets (one encoded SVG each, reused by every effect layer)
// ---------------------------------------------------------------------------
const svgUrl = (body) => `url("data:image/svg+xml,${encodeURIComponent(body)}")`;

export const GRAIN_TEXTURE = svgUrl(
  `<svg xmlns="http://www.w3.org/2000/svg" width="180" height="180"><filter id="g"><feTurbulence type="fractalNoise" baseFrequency="0.82" numOctaves="3" stitchTiles="stitch"/><feColorMatrix type="saturate" values="0"/></filter><rect width="100%" height="100%" filter="url(#g)" opacity="0.62"/></svg>`
);

export const NOISE_TEXTURE = svgUrl(
  `<svg xmlns="http://www.w3.org/2000/svg" width="140" height="140"><filter id="n"><feTurbulence type="fractalNoise" baseFrequency="1.35" numOctaves="2" stitchTiles="stitch"/><feColorMatrix type="saturate" values="0"/></filter><rect width="100%" height="100%" filter="url(#n)" opacity="0.72"/></svg>`
);

export const GRUNGE_TEXTURE = svgUrl(
  `<svg xmlns="http://www.w3.org/2000/svg" width="420" height="420"><filter id="d"><feTurbulence type="fractalNoise" baseFrequency="0.012 0.03" numOctaves="4" seed="11"/><feColorMatrix type="saturate" values="0"/><feComponentTransfer><feFuncA type="table" tableValues="0 0.85 0.15 0.6 0"/></feComponentTransfer></filter><rect width="100%" height="100%" filter="url(#d)" opacity="0.65"/></svg>`
);

// ---------------------------------------------------------------------------
// Per-cue text effect (RGB split + jitter) — applied to the TEXT wrapper only,
// so the background video keeps playing untouched.
// ---------------------------------------------------------------------------
export const textFxStyle = (raw) => {
  const f = normalizeFx(raw);
  const out = {};
  if (f.rgbSplit > 0) {
    const px = Math.max(0.5, (f.rgbSplit / 100) * 6);
    out.filter = `drop-shadow(${px.toFixed(2)}px 0 0 rgba(255,42,96,0.55)) drop-shadow(${(-px).toFixed(2)}px 0 0 rgba(44,225,255,0.55))`;
  }
  if (f.jitter > 0) {
    const amp = Math.max(0.5, (f.jitter / 100) * 4);
    const dur = Math.max(0.12, 0.6 / Math.max(0.2, f.speed));
    out.animation = `kogJitter ${dur.toFixed(2)}s steps(2) infinite`;
    out['--kog-jitter'] = `${amp.toFixed(2)}px`;
  }
  return out;
};
