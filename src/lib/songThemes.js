// SONG THEMES — a house "look" for a song, in one click.
//
// A theme is DATA, exactly like SCRIPTURE_TEMPLATES: the picker previews it,
// the editor copies its fields onto a slide (or every slide), and the projector
// keeps using cueLyricStyle, so there is no second rendering path to drift.
// Built-ins ship with the app; operators can save their own from a slide they
// already styled (localStorage — no schema change, no DB migration).
import { FONT_OPTIONS } from './constants';

const FACE = (label) => (FONT_OPTIONS.find((f) => f.label === label) || FONT_OPTIONS[0]).value;

export const SONG_THEMES_STORAGE = 'kog_song_themes';
export const SONG_THEME_STORAGE = 'kog_song_theme';
export const DEFAULT_SONG_THEME = 'house';

export const DEFAULT_SONG_BOX = { x: 80, y: 100, w: 1120, h: 480 };
export const DEFAULT_TITLE_BOX = { x: 80, y: 140, w: 1120, h: 440 };

// The visual fields a theme owns. Layout / timing / notes deliberately stay
// with the slide, so a theme never silently rewrites a service cue.
const BASE = {
  font: FACE('CMG Sans Wide (Default)'),
  size: 120,
  lineHeight: 1.05,
  letterSpacing: 0,
  bold: true,
  italic: false,
  underline: false,
  strike: false,
  case: 'none',
  align: 'center',
  valign: 'middle',
  color: '#f5f5f4',
  shadow: true,
  shadowColor: '#000000',
  shadowBlur: 14,
  shadowOffsetX: 0,
  shadowOffsetY: 4,
  glow: false,
  glowColor: '#22d3ee',
  glowBlur: 18,
  outline: false,
  strokeColor: '#000000',
  strokeWidth: 1.5,
  strokeOnly: false,
  opacity: 100,
  blendMode: 'normal',
  gradient: false,
  gradientColor1: '#f5f5f4',
  gradientColor2: '#93c5fd',
  gradientAngle: 180,
  highlight: false,
  hlOpacity: 40,
  resizeMode: 'fit',
  fillMin: 18,
  fillMax: 165,
  anim: 'fade',
  speed: 0.5,
  box: { ...DEFAULT_SONG_BOX },
  titleBox: { ...DEFAULT_TITLE_BOX },
  bgType: 'color',
  bgValue: '#000000',
  // Cinematic look (effects + background grade + optional ghost layer). Null
  // means "leave the slide's own values alone" when a theme is applied.
  fx: null,
  bg_fx: null,
  ghost: null,
};

const theme = (id, name, note, style, tags = []) => ({
  id,
  name,
  note,
  tags,
  style: {
    ...BASE,
    ...style,
    box: { ...(style.box || BASE.box) },
    titleBox: { ...(style.titleBox || BASE.titleBox) },
  },
});

export const SONG_THEMES = [
  theme('house', 'House', 'The default CMG look — bold, centred, shadowed.', {}),
  theme('anthem', 'Anthem', 'Caps, wide tracking, punchy stadium energy.', {
    font: FACE('CMG Sans CAPS'),
    size: 118,
    case: 'upper',
    letterSpacing: 2,
    shadowBlur: 20,
    anim: 'slide-up',
    speed: 0.35,
  }, ['big room']),
  theme('cinematic', 'Cinematic', 'Warm serif, generous leading, film-title mood.', {
    font: FACE('Cinzel Decorative'),
    size: 100,
    lineHeight: 1.16,
    letterSpacing: 2,
    color: '#f7efe3',
    shadowBlur: 22,
    shadowOffsetY: 6,
    anim: 'fade',
    speed: 0.8,
    box: { x: 90, y: 110, w: 1100, h: 460 },
    titleBox: { x: 90, y: 150, w: 1100, h: 400 },
    bgType: 'gradient',
    bgValue: 'linear-gradient(135deg, #0f172a 0%, #1e293b 55%, #0b1220 100%)',
  }, ['film']),
  theme('lower-third', 'Lower Third', 'Left-aligned, low on the wall — lyrics over the room.', {
    font: FACE('CMG Sans Condensed'),
    size: 58,
    lineHeight: 1.08,
    letterSpacing: 0.4,
    align: 'left',
    valign: 'bottom',
    shadowBlur: 16,
    anim: 'slide-up',
    speed: 0.3,
    box: { x: 64, y: 486, w: 1000, h: 180 },
    titleBox: { x: 64, y: 300, w: 1000, h: 220 },
  }, ['lower third', 'video']),
  theme('quiet', 'Quiet', 'Light type, wide air, no shouting.', {
    font: FACE('CMG Sans ExtraLight'),
    size: 104,
    lineHeight: 1.1,
    letterSpacing: 1,
    bold: false,
    color: '#f8fafc',
    shadowBlur: 10,
    shadowOffsetY: 3,
    anim: 'fade',
    speed: 0.65,
    bgType: 'gradient',
    bgValue: 'linear-gradient(160deg, #070b14 0%, #101827 58%, #05070d 100%)',
  }, ['minimal']),
  theme('neon', 'Neon', 'Gradient type, glow, animated colour — youth night.', {
    font: FACE('CMG Sans Rounded'),
    size: 112,
    case: 'upper',
    letterSpacing: 2.5,
    gradient: true,
    gradientColor1: '#22d3ee',
    gradientColor2: '#c084fc',
    gradientAngle: 180,
    glow: true,
    glowColor: '#22d3ee',
    glowBlur: 26,
    shadow: false,
    anim: 'neon',
    speed: 0.5,
    bgType: 'animated',
    bgValue: 'anim:violet',
  }, ['youth', 'glow']),
];

const clean = (v) => String(v || '').trim();

const validStyle = (s) => s && typeof s === 'object' && s.box && Number(s.size) > 0;

export const readCustomSongThemes = () => {
  try {
    if (typeof localStorage === 'undefined') return [];
    const raw = localStorage.getItem(SONG_THEMES_STORAGE);
    const arr = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(arr)) return [];
    return arr.filter((t) => t && t.custom && clean(t.id) && clean(t.name) && validStyle(t.style));
  } catch {
    return [];
  }
};

const writeCustomSongThemes = (list) => {
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(SONG_THEMES_STORAGE, JSON.stringify(list));
    return true;
  } catch {
    return false;
  }
};

export const allSongThemes = (custom = readCustomSongThemes()) => [...SONG_THEMES, ...custom];

export const songThemeOf = (id, custom) => allSongThemes(custom).find((t) => t.id === id) || null;

export const lastSongThemeId = () => {
  try { return (typeof localStorage !== 'undefined' && localStorage.getItem(SONG_THEME_STORAGE)) || DEFAULT_SONG_THEME; } catch { return DEFAULT_SONG_THEME; }
};

export const rememberSongTheme = (id) => {
  try { if (typeof localStorage !== 'undefined') localStorage.setItem(SONG_THEME_STORAGE, id); } catch { /* private mode */ }
};

export const saveCustomSongTheme = (name, style) => {
  const custom = readCustomSongThemes();
  const item = {
    id: `u-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    name: clean(name) || 'My Theme',
    note: 'Saved from a slide on this computer.',
    custom: true,
    tags: ['custom'],
    style: { ...BASE, ...style, box: { ...(style.box || BASE.box) }, titleBox: { ...(style.titleBox || BASE.titleBox) } },
  };
  writeCustomSongThemes([...custom, item]);
  return item;
};

export const updateCustomSongTheme = (id, patch) => {
  const custom = readCustomSongThemes();
  let next = null;
  const list = custom.map((t) => {
    if (t.id !== id) return t;
    next = {
      ...t,
      ...patch,
      style: patch.style
        ? { ...BASE, ...patch.style, box: { ...(patch.style.box || t.style.box) }, titleBox: { ...(patch.style.titleBox || t.style.titleBox || BASE.titleBox) } }
        : t.style,
    };
    return next;
  });
  writeCustomSongThemes(list);
  return next;
};

export const deleteCustomSongTheme = (id) => {
  const custom = readCustomSongThemes();
  if (!custom.some((t) => t.id === id)) return false;
  writeCustomSongThemes(custom.filter((t) => t.id !== id));
  return true;
};

// Cue-level slice a theme writes. Everything here is a field cueLyricStyle
// already understands, so applying a theme is the same as styling by hand.
export const songThemeCuePatch = (t) => {
  const s = (t && t.style) || BASE;
  const out = {};
  for (const k of [
    'font', 'size', 'lineHeight', 'letterSpacing', 'bold', 'italic', 'underline', 'strike',
    'case', 'align', 'valign', 'color', 'shadow', 'shadowColor', 'shadowBlur', 'shadowOffsetX',
    'shadowOffsetY', 'glow', 'glowColor', 'glowBlur', 'outline', 'strokeColor', 'strokeWidth',
    'strokeOnly', 'opacity', 'blendMode',
    'gradient', 'gradientColor1', 'gradientColor2', 'gradientAngle', 'highlight', 'hlOpacity',
    'resizeMode', 'fillMin', 'fillMax', 'anim', 'speed', 'transDuration',
  ]) {
    if (s[k] !== undefined) out[k] = s[k];
  }
  if (s.fx) out.fx = { ...s.fx };
  if (s.bg_fx) out.bg_fx = { ...s.bg_fx };
  // A theme stores the ghost LOOK, never its words — applying it can never
  // overwrite the lyrics of the slide it lands on.
  if (s.ghost) out.ghost = { ...s.ghost, text: '' };
  // A theme's box is part of the look (lower third is a placement, not just a
  // font). Pad goes back to AUTO so the gutter re-derives from the new size.
  out.box = { ...(s.box || DEFAULT_SONG_BOX) };
  out.pad = null;
  return out;
};

// Build a theme from what a slide looks like RIGHT NOW — "save this look".
export const themeStyleFromCue = (cue, song, titleCue) => {
  const s = cue || {};
  // A cue may override the song background; "save this look" must capture what
  // is actually behind the text, not the song's fallback. Black-on-color is the
  // app's "plain" marker for "no override" (isPlainBg), so fall through to the
  // song for it just like the projector does.
  const plain = (type, value) => (type == null || type === 'color') && (!value || String(value).toLowerCase() === '#000000');
  const cueBg = !plain(s.bg_type, s.bg_value);
  const bgType = cueBg ? s.bg_type : ((song && song.bg_type) || 'color');
  const bgValue = cueBg ? s.bg_value : ((song && song.bg_value) || '#000000');
  return {
    ...BASE,
    font: s.font || FACE('CMG Sans Wide (Default)'),
    size: Number(s.size) || 120,
    lineHeight: Number(s.lineHeight) || 1.05,
    letterSpacing: Number(s.letterSpacing) || 0,
    bold: s.bold !== false,
    italic: !!s.italic,
    underline: !!s.underline,
    strike: !!s.strike,
    case: s.case || 'none',
    align: s.align || 'center',
    valign: s.valign || 'middle',
    color: s.color || '#f5f5f4',
    shadow: !!s.shadow,
    shadowColor: s.shadowColor || '#000000',
    shadowBlur: s.shadowBlur ?? 14,
    shadowOffsetX: s.shadowOffsetX ?? 0,
    shadowOffsetY: s.shadowOffsetY ?? 4,
    glow: !!s.glow,
    glowColor: s.glowColor || '#22d3ee',
    glowBlur: s.glowBlur ?? 18,
    outline: !!s.outline,
    strokeColor: s.strokeColor || '#000000',
    strokeWidth: s.strokeWidth ?? 1.5,
    strokeOnly: !!s.strokeOnly,
    opacity: s.opacity ?? 100,
    blendMode: s.blendMode || 'normal',
    gradient: !!s.gradient,
    gradientColor1: s.gradientColor1 || '#f5f5f4',
    gradientColor2: s.gradientColor2 || '#93c5fd',
    gradientAngle: s.gradientAngle ?? 180,
    highlight: !!s.highlight,
    hlOpacity: s.hlOpacity ?? 40,
    resizeMode: s.resizeMode || 'fit',
    fillMin: s.fillMin ?? 18,
    fillMax: s.fillMax ?? 165,
    anim: s.anim || 'fade',
    speed: s.speed ?? 0.5,
    transDuration: s.transDuration ?? 0,
    fx: s.fx ? { ...s.fx } : null,
    bg_fx: s.bg_fx ? { ...s.bg_fx } : null,
    ghost: s.ghost ? { ...s.ghost, text: '' } : null,
    box: { ...(s.box || DEFAULT_SONG_BOX) },
    titleBox: { ...(titleCue && titleCue.box ? titleCue.box : DEFAULT_TITLE_BOX) },
    bgType,
    bgValue,
  };
};

// A speaker-friendly background spec for the preview card.
export const songThemeBackgroundCss = (style) => {
  if (!style) return '#000000';
  if (style.bgType === 'gradient' || style.bgType === 'color') return style.bgValue || '#000000';
  return 'linear-gradient(135deg, #0f172a 0%, #1e293b 55%, #0b1220 100%)';
};
