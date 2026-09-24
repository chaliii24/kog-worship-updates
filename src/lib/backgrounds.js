// Offline "download-free" background pack: vector CSS gradients (no image files,
// so they work with zero internet and add nothing to the installer size).
export const GRADIENT_PACK = [
  { id: 'g-midnight', name: 'Midnight', css: 'linear-gradient(135deg, #0f172a 0%, #1e293b 55%, #0b1220 100%)' },
  { id: 'g-ocean', name: 'Deep Ocean', css: 'linear-gradient(135deg, #0b1220 0%, #0e4b6e 55%, #071b2b 100%)' },
  { id: 'g-royal', name: 'Royal', css: 'linear-gradient(135deg, #1e1b4b 0%, #4c1d95 55%, #160b2e 100%)' },
  { id: 'g-ember', name: 'Ember', css: 'linear-gradient(135deg, #2a0e05 0%, #7c2d12 55%, #1a0803 100%)' },
  { id: 'g-forest', name: 'Forest', css: 'linear-gradient(135deg, #052e16 0%, #166534 55%, #031a0d 100%)' },
  { id: 'g-rose', name: 'Rose', css: 'linear-gradient(135deg, #3f0d2b 0%, #9d174d 55%, #210616 100%)' },
  { id: 'g-slate', name: 'Slate', css: 'linear-gradient(135deg, #111827 0%, #334155 55%, #0b1220 100%)' },
  { id: 'g-gold', name: 'Gold', css: 'linear-gradient(135deg, #1c1917 0%, #78350f 55%, #0c0a09 100%)' },
  { id: 'g-violet', name: 'Violet Haze', css: 'radial-gradient(circle at 30% 20%, #4c1d95 0%, #0b1220 60%)' },
  { id: 'g-glow', name: 'Blue Glow', css: 'radial-gradient(circle at 50% 15%, #1d4ed8 0%, #0b1220 62%)' },
  { id: 'g-sunrise', name: 'Sunrise', css: 'linear-gradient(135deg, #1e1b4b 0%, #b45309 70%, #0f172a 100%)' },
  { id: 'g-mono', name: 'Mono', css: 'linear-gradient(135deg, #000000 0%, #1f2937 60%, #000000 100%)' }
];

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
  { label: 'Poppins', value: "'Poppins', system-ui, sans-serif" },
  { label: 'Montserrat', value: "'Montserrat', system-ui, sans-serif" },
  { label: 'Barlow', value: "'Barlow', system-ui, sans-serif" },
  { label: 'Plus Jakarta Sans', value: "'Plus Jakarta Sans', system-ui, sans-serif" },
  { label: 'Nunito Sans', value: "'Nunito Sans', system-ui, sans-serif" },
  { label: 'Geist', value: "'Geist Variable', system-ui, sans-serif" },
  { label: 'Serif', value: "Georgia, 'Times New Roman', serif" },
  { label: 'Monospace', value: "ui-monospace, Menlo, Consolas, monospace" }
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

