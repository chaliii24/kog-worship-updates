// CUSTOM / NON-SONG SLIDES
//
// A custom slide is one text box with its own look. The projector has ALWAYS
// supported a per-item `style` (fireServiceItemLive passes `item.style ||
// stageStyle`), so this file only defines what goes in that object and how to
// keep older slides — saved before per-slide styling existed — looking sane.
import { FONT_OPTIONS } from './constants';

export const CUSTOM_SLIDE_BOX = { x: 90, y: 150, w: 1100, h: 420 };

export const CUSTOM_SLIDE_DEFAULT_TITLE = 'Welcome / Announcements';
export const CUSTOM_SLIDE_DEFAULT_SUBTITLE = 'Service Slide';

export const defaultCustomSlideLyric = () => ({
  font: FONT_OPTIONS[0].value,
  size: 64,
  lineHeight: 1.12,
  align: 'center',
  valign: 'middle',
  color: '#ffffff',
  caseMode: 'none',
  bold: true,
  italic: false,
  underline: false,
  strike: false,
  letterSpacing: 0,
  pad: null,
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
  gradient: false,
  gradientColor1: '#f5f5f4',
  gradientColor2: '#93c5fd',
  gradientAngle: 180,
  highlight: false,
  hlOpacity: 40,
  box: { ...CUSTOM_SLIDE_BOX },
});

export const defaultCustomSlideStyle = () => {
  const lyric = defaultCustomSlideLyric();
  return {
    fontFamily: lyric.font,
    fontColor: lyric.color,
    textAlign: lyric.align,
    backgroundType: 'color',
    backgroundValue: '#000000',
    transition: 'fade',
    speed: '500ms',
    lyric,
  };
};

export const defaultCustomSlideData = () => ({
  title: CUSTOM_SLIDE_DEFAULT_TITLE,
  subtitle: CUSTOM_SLIDE_DEFAULT_SUBTITLE,
  content: '',
  style: defaultCustomSlideStyle(),
});

const num = (v, fallback) => (Number.isFinite(Number(v)) ? Number(v) : fallback);
const str = (v, fallback) => (typeof v === 'string' && v.trim() ? v : fallback);

// Merge anything on disk (or nothing at all) with today's defaults. Never
// throws: a bare/legacy item simply gets the default look.
export const normalizeCustomSlideStyle = (style) => {
  const base = defaultCustomSlideStyle();
  if (!style || typeof style !== 'object') return base;
  const l = (style.lyric && typeof style.lyric === 'object') ? style.lyric : {};
  const box = l.box && Number.isFinite(Number(l.box.w)) && Number(l.box.w) > 0
    ? { x: num(l.box.x, CUSTOM_SLIDE_BOX.x), y: num(l.box.y, CUSTOM_SLIDE_BOX.y), w: num(l.box.w, CUSTOM_SLIDE_BOX.w), h: num(l.box.h, CUSTOM_SLIDE_BOX.h) }
    : { ...CUSTOM_SLIDE_BOX };
  const lyric = {
    ...base.lyric,
    ...l,
    font: str(l.font, style.fontFamily || base.lyric.font),
    size: Math.max(12, num(l.size, base.lyric.size)),
    lineHeight: Math.max(0.5, num(l.lineHeight, base.lyric.lineHeight)),
    align: ['left', 'center', 'right', 'justify'].includes(l.align) ? l.align : (style.textAlign || base.lyric.align),
    valign: ['top', 'middle', 'bottom'].includes(l.valign) ? l.valign : base.lyric.valign,
    color: str(l.color, style.fontColor || base.lyric.color),
    caseMode: ['none', 'title', 'upper'].includes(l.caseMode) ? l.caseMode : (l.case || 'none'),
    box,
  };
  return {
    ...base,
    ...style,
    backgroundType: style.backgroundType || style.bg_type || 'color',
    backgroundValue: style.backgroundValue || style.bg_value || '#000000',
    transition: style.transition || 'fade',
    speed: style.speed || '500ms',
    lyric,
  };
};

export const customSlideStyleForItem = (item) => normalizeCustomSlideStyle(item && item.style);
