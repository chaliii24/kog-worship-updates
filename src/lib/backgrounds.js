// Offline "download-free" background pack: vector CSS gradients (no image files,
// so they work with zero internet and add nothing to the installer size).
// Exactly 7 — the curated house set offered in every background picker
// (songs, slides, countdown, presentations). Saved songs store the css
// string itself, so trimming the pack never breaks old songs.
export const GRADIENT_PACK = [
  { id: 'g-midnight', name: 'Midnight', css: 'linear-gradient(135deg, #1C1C1E 0%, #3A3A3C 55%, #2C2C2E 100%)' },
  { id: 'g-ocean', name: 'Deep Ocean', css: 'linear-gradient(135deg, #2C2C2E 0%, #0e4b6e 55%, #071b2b 100%)' },
  { id: 'g-royal', name: 'Royal', css: 'linear-gradient(135deg, #2C2C2E 0%, #2A313A 55%, #160b2e 100%)' },
  { id: 'g-ember', name: 'Ember', css: 'linear-gradient(135deg, #2a0e05 0%, #7c2d12 55%, #1a0803 100%)' },
  { id: 'g-forest', name: 'Forest', css: 'linear-gradient(135deg, #1C1C1E 0%, #166534 55%, #031a0d 100%)' },
  { id: 'g-sunrise', name: 'Sunrise', css: 'linear-gradient(135deg, #2C2C2E 0%, #b45309 70%, #1C1C1E 100%)' },
  { id: 'g-violet', name: 'Violet Haze', css: 'radial-gradient(circle at 30% 20%, #2A313A 0%, #2C2C2E 60%)' }
];

/* ---------------------------------------------------------------- media tuning
   A slide that uses an image or video carries five extra fields beside
   bg_type/bg_value. They live on the cue (so they save with the song) and are
   copied onto the payload style, which is what the wall reads.

     bg_dim    0-100  black wash between the media and the lyrics
     bg_fit    cover | contain | stretch
     bg_loop   video only
     bg_muted  video only — background audio never rides the program mix
     bg_rate   0.5-2.0 playback speed for background video

   Normalised in one place so a hand-edited song file, an old slide with no
   fields, and a fresh pick all reach the renderer with the same shape. */
export const BG_FIT_MODES = [
  { k: 'cover', label: 'Cover / Fill' },
  { k: 'contain', label: 'Contain' },
  { k: 'stretch', label: 'Stretch' },
];

export const bgFitCss = (fit) => (fit === 'contain' ? 'contain' : fit === 'stretch' ? 'fill' : 'cover');

export const bgMediaFields = (cue) => ({
  bgDim: Math.max(0, Math.min(100, Number(cue?.bg_dim) || 0)),
  bgFit: BG_FIT_MODES.some((m) => m.k === cue?.bg_fit) ? cue.bg_fit : 'cover',
  bgLoop: cue?.bg_loop !== false,
  bgMuted: cue?.bg_muted !== false,
  bgRate: Math.max(0.5, Math.min(2, Number(cue?.bg_rate) || 1)),
});

export const PRESENTATION_LAYOUTS = [
  { id: 'title', name: 'Title', icon: 'T' },
  { id: 'title-bullets', name: 'Title + Bullets', icon: '☰' },
  { id: 'image-right', name: 'Text + Image', icon: '▐' },
  { id: 'image-left', name: 'Image + Text', icon: '▌' },
  { id: 'full-image', name: 'Full Image', icon: '▣' },
  { id: 'quote', name: 'Quote', icon: '❝' },
  { id: 'blank', name: 'Blank', icon: '□' }
];

export const PRESENTATION_FONTS = [
  { label: 'CMG Sans', value: "'CMG Sans', system-ui, sans-serif" },
  { label: 'CMG Sans Condensed', value: "'CMG Sans Condensed', 'CMG Sans', sans-serif" },
  { label: 'CMG Sans Light', value: "'CMG Sans Light', 'CMG Sans', sans-serif" },
  { label: 'CMG Sans Black', value: "'CMG Sans Black', 'CMG Sans', sans-serif" },
  { label: 'CMG Sans Rounded', value: "'CMG Sans Rounded', 'CMG Sans', sans-serif" },
  { label: 'CMG Sans Slab', value: "'CMG Sans Slab', 'CMG Sans', sans-serif" }
];

export const PRESENTATION_TRANSITIONS = [
  { id: 'fade', name: 'Fade' },
  { id: 'slide', name: 'Slide Up' },
  { id: 'zoom', name: 'Zoom' },
  { id: 'none', name: 'Cut' }
];

let slideCounter = 0;
export function newSlideId() {
  slideCounter += 1;
  return `ps${Date.now().toString(36)}${slideCounter}`;
}

export function defaultSlide(overrides = {}) {
  return {
    id: newSlideId(),
    layout: 'title-bullets',
    title: '',
    subtitle: '',
    body: '',
    bullets: [''],
    image: null,
    bg: { type: 'gradient', value: GRADIENT_PACK[0].css },
    textColor: '#FFFFFF',
    align: 'left',
    font: PRESENTATION_FONTS[0].value,
    titleSize: 42,
    bodySize: 24,
    transition: 'fade',
    notes: '',
    pos: {},
    ...overrides
  };
}

// Turn a pasted sermon outline / script into slides.
// First non-empty line of a block = title; subsequent lines = bullets.
// Blank lines separate slides. "1." / "-" / "•" prefixes are stripped.
export function parseOutline(text) {
  const clean = String(text || '').replace(/\r\n?/g, '\n');
  const blocks = clean.split(/\n\s*\n/).map(b => b.split('\n').map(l => l.trim()).filter(Boolean)).filter(b => b.length);
  if (!blocks.length) return [defaultSlide()];
  return blocks.map((lines, i) => {
    const strip = (s) => s.replace(/^\s*(?:[-*•●▪◦]|\d+[.)]|[a-z][.)])\s+/i, '').trim();
    const title = strip(lines[0]);
    const bullets = lines.slice(1).map(strip).filter(Boolean);
    return defaultSlide({
      layout: bullets.length ? 'title-bullets' : 'title',
      title,
      subtitle: bullets.length ? '' : (lines[1] ? strip(lines[1]) : ''),
      bullets: bullets.length ? bullets : [''],
      transition: 'fade'
    });
  });
}

// A .pptx import result becomes deck slides: pictures become full-bleed image
// slides, extracted words become ordinary editable slides. Shared by the
// editor's Import button and the Presentations list so both behave the same.
export function slidesFromPptx(rows = []) {
  return rows.map((sl) => (sl.image
    ? defaultSlide({ layout: 'full-image', image: sl.image, title: '', subtitle: '', body: '', bullets: [''] })
    : defaultSlide({
        layout: (sl.bullets || []).length ? 'title-bullets' : 'title',
        title: sl.title || '',
        subtitle: '',
        bullets: (sl.bullets || []).length ? sl.bullets : [''],
      })));
}

// ---- Free text positioning (design space is always 1280 x 720) ----
const PAD = 72;

// Default boxes per layout. Users can override any of these via slide.pos[key].
export function defaultRects(layout) {
  switch (layout) {
    case 'title':
      return {
        title: { x: 120, y: 250, w: 1040, h: 130, v: 'top' },
        subtitle: { x: 180, y: 400, w: 920, h: 80, v: 'top' },
        body: { x: 180, y: 500, w: 920, h: 120, v: 'top' }
      };
    case 'image-left':
      return {
        title: { x: 700, y: 120, w: 500, h: 130, v: 'top' },
        bullets: { x: 700, y: 275, w: 500, h: 330, v: 'top' },
        subtitle: { x: 700, y: 620, w: 500, h: 70, v: 'top' },
        body: { x: 700, y: 620, w: 500, h: 90, v: 'top' }
      };
    case 'image-right':
      return {
        title: { x: 80, y: 120, w: 500, h: 130, v: 'top' },
        bullets: { x: 80, y: 275, w: 500, h: 330, v: 'top' },
        subtitle: { x: 80, y: 620, w: 500, h: 70, v: 'top' },
        body: { x: 80, y: 620, w: 500, h: 90, v: 'top' }
      };
    case 'full-image':
      return {
        title: { x: PAD, y: 500, w: 1136, h: 120, v: 'top' },
        subtitle: { x: PAD, y: 630, w: 1136, h: 70, v: 'top' },
        body: { x: PAD, y: 630, w: 1136, h: 90, v: 'top' }
      };
    case 'quote':
      return {
        body: { x: 140, y: 170, w: 1000, h: 280, v: 'top' },
        subtitle: { x: 300, y: 480, w: 680, h: 80, v: 'top' },
        title: { x: 140, y: 170, w: 1000, h: 120, v: 'top' }
      };
    case 'blank':
      return {};
    case 'title-bullets':
    default:
      return {
        title: { x: PAD, y: 70, w: 1136, h: 120, v: 'top' },
        bullets: { x: PAD, y: 220, w: 1136, h: 340, v: 'top' },
        subtitle: { x: PAD, y: 600, w: 1136, h: 70, v: 'top' },
        body: { x: PAD, y: 600, w: 1136, h: 90, v: 'top' }
      };
  }
}

// Merge per-slide overrides on top of layout defaults.
export function resolveRects(slide) {
  const base = defaultRects(slide && slide.layout);
  const pos = (slide && slide.pos) || {};
  const out = {};
  Object.keys(base).forEach(k => { out[k] = { ...base[k], ...(pos[k] || {}) }; });
  return out;
}

// Which text boxes should be shown/draggable for the current content + layout.
export function visibleElements(slide) {
  if (!slide) return [];
  const rects = resolveRects(slide);
  const out = [];
  if (rects.title && slide.title && slide.layout !== 'quote') out.push('title');
  if (rects.subtitle && slide.subtitle) out.push('subtitle');
  if (rects.bullets && (slide.bullets || []).some(b => String(b).trim())) out.push('bullets');
  if (rects.body && (slide.body || (slide.layout === 'quote' && slide.title))) out.push('body');
  return out;
}

// Human label for a media file. Library uploads used to be stored as
// "<timestamp>-<rand>-<original>.<ext>" (and older ones as a bare
// "<timestamp>-<rand>"), which leaked ugly hashes into the pickers — strip
// the extension, then the hash prefix. A name that is *only* the hash has
// nothing readable left, so fall back to the caller's default.
export function mediaLabel(name, fallback = 'Media') {
  if (!name) return fallback;
  let s = String(name).replace(/\.[^.]+$/, '');
  s = s.replace(/^\d{10,}-[a-z0-9]+-/, '');
  if (/^\d{10,}-[a-z0-9]+$/.test(s)) s = '';
  return s || fallback;
}

