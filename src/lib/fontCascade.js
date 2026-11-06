// FONT CASCADE — one line of text that re-sets its face on a fast clock.
//
// This is the "kinetic typography" hit where a single word flips between bold
// display faces several times a second. It is deliberately a HARD CUT: a font
// family is not an animatable property, and glyph outlines between families
// cannot interpolate, so the honest effect is the instant re-set.
//
// It is stored on the cue as `fontCycle`, next to `slideAnim`, so it persists
// through style_json like every other look field and needs no migration. Absent
// or `on: false` means the slide renders exactly as it did before.
//
// The palette lives here (not in the React component) because three different
// surfaces need the same list: the projector's renderer, the editor preview and
// the standalone cycler component.

/**
 * The faces. `stack` always ends in a real fallback: Anton is bundled with the
 * app and Impact is a Windows system face, so two of the five work offline; the
 * other three fall back down their stacks when there is no network.
 */
export const CASCADE_FONTS = [
  { id: 'bebas', label: 'Bebas Neue', stack: '"Bebas Neue", "CMG Sans Condensed", Impact, sans-serif' },
  { id: 'montserrat', label: 'Montserrat Black', stack: '"Montserrat", "CMG Sans", sans-serif' },
  { id: 'anton', label: 'Anton', stack: '"Anton", Impact, sans-serif' },
  { id: 'oswald', label: 'Oswald', stack: '"Oswald", "CMG Sans Condensed", sans-serif' },
  { id: 'impact', label: 'Impact', stack: 'Impact, Haettenschweiler, "Arial Narrow Bold", sans-serif' },
  // Handwriting/script face. The family ships with a single 400 weight, so a
  // slide with bold on gets the browser's synthesized bold — the same as Anton.
  // "Reenie Beanie" is the Google Fonts spelling; the fallbacks are handwriting
  // faces Windows and macOS actually ship.
  { id: 'reenie', label: 'Reenie Beanie', stack: '"Reenie Beanie", "Segoe Script", "Bradley Hand", cursive' },
];

export const CASCADE_ALL = CASCADE_FONTS.map((f) => f.id);

/** 150ms is the requested default; the slower steps exist because 150ms on a
 *  live wall is a strobe and some rooms/songs need it calmer. */
export const CASCADE_SPEEDS = [150, 250, 400];
export const DEFAULT_CASCADE_MS = 150;

const GOOGLE_FONTS_HREF =
  'https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Montserrat:wght@900&family=Oswald:wght@700&family=Reenie+Beanie&display=swap';

const fontById = (id) => CASCADE_FONTS.find((f) => f.id === id) || null;

/**
 * Canonical config, or null when the slide has no cascade (or it is switched
 * off). Ids are filtered against the palette so a preset saved before a face
 * was removed cannot produce a stack of `undefined`.
 */
export const normalizeCascade = (raw) => {
  if (!raw || typeof raw !== 'object') return null;
  if (raw.on === false) return null;
  const ms = Math.max(60, Math.min(2000, Number(raw.ms) || DEFAULT_CASCADE_MS));
  const ids = (Array.isArray(raw.fonts) ? raw.fonts : []).filter((id) => fontById(id));
  const useIds = ids.length >= 2 ? ids : CASCADE_ALL;
  return {
    v: 1,
    ms,
    ids: useIds,
    fonts: useIds.map((id) => fontById(id).stack),
    labels: useIds.map((id) => fontById(id).label),
  };
};

export const cascadeOn = (raw) => !!normalizeCascade(raw);

/** The face for the Nth tick, wrapping in both directions. */
export const cascadeFontAt = (raw, tick) => {
  const c = normalizeCascade(raw);
  if (!c) return null;
  const n = Number(tick) || 0;
  return c.fonts[((n % c.fonts.length) + c.fonts.length) % c.fonts.length];
};

let requested = false;

/**
 * Load the webfonts into THIS document. Each Electron window is its own
 * document — the console and the projector window both render lyrics — so the
 * renderer calls this rather than relying on index.html having the tag.
 */
export const ensureCascadeFonts = (doc) => {
  const d = doc || (typeof document !== 'undefined' ? document : null);
  if (!d || !d.head) return;
  if (d.querySelector('link[data-kog-cascade-fonts]')) { requested = true; return; }
  const link = d.createElement('link');
  link.rel = 'stylesheet';
  link.href = GOOGLE_FONTS_HREF;
  link.setAttribute('data-kog-cascade-fonts', '');
  d.head.appendChild(link);
  requested = true;
};

/** True once the fonts have been requested for the current document. */
export const cascadeFontsRequested = () => requested;
