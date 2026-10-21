import { cueLyricStyle } from './lyrics';

/**
 * MULTIPLE TEXT BOXES ON ONE LYRIC SLIDE.
 *
 * The slide's MAIN text keeps living on the cue's own fields (`text`, `box`,
 * and the flat style keys) — that is the shape every song in the DB, every
 * theme, every thumbnail and every renderer already understands, so nothing
 * that existed before changes behaviour. Additional boxes live in
 * `cue.texts[]` as cue-SHAPED mini-objects, which means `cueLyricStyle(obj)`
 * renders them through the exact same code path as the main text: no second
 * renderer, no drift between the editor and the wall.
 *
 * Persistence is free: `texts` is not one of `CUE_COLUMN_KEYS`, so
 * `cueStyleJson()` stores it inside `cues.style_json` and `getSongDetails()`
 * spreads it straight back onto the cue.
 *
 * Index convention everywhere: 0 = the main text (the cue's own fields),
 * 1..n = `cue.texts[n-1]`.
 */

export const MAIN_TEXT = 0;

let uid = 0;
const nextId = () => `tx${Date.now().toString(36)}${(uid++).toString(36)}`;

/** Extra boxes only (never the main text). Always an array. */
export const textObjectsOf = (cue) => (cue && Array.isArray(cue.texts) ? cue.texts.filter(Boolean) : []);

/** Every box on the slide, main first. */
export const allTextObjects = (cue) => (cue ? [cue, ...textObjectsOf(cue)] : []);

export const textObjectAt = (cue, idx) => allTextObjects(cue)[Number(idx)] || null;

/**
 * A new box inherits the slide's face so it looks like it belongs — the same
 * font/colour/tracking, at ~60% of the lyric size, parked in a kicker-sized
 * band across the top of the canvas.
 */
export const newTextObject = (main = {}, patch = {}) => {
  const mainSize = Number(main.size) || 64;
  return {
    id: nextId(),
    text: '',
    box: { x: 240, y: 76, w: 800, h: 132 },
    font: main.font,
    size: Math.max(18, Math.min(96, Math.round(mainSize * 0.62))),
    color: main.color || '#f5f5f4',
    align: main.align || 'center',
    valign: main.valign || 'middle',
    bold: main.bold !== false,
    italic: !!main.italic,
    lineHeight: main.lineHeight || 1.05,
    ...patch,
  };
};

/** Route a patch to object `idx` (0 → the cue's own fields). */
export const patchTextObject = (cue, idx, patch) => {
  if (!cue || !patch) return cue;
  const i = Number(idx) || 0;
  if (i <= 0) return { ...cue, ...patch };
  const texts = [...textObjectsOf(cue)];
  if (!texts[i - 1]) return cue;
  texts[i - 1] = { ...texts[i - 1], ...patch };
  return { ...cue, texts };
};

export const addTextObject = (cue, obj) => ({ ...cue, texts: [...textObjectsOf(cue), obj] });

/** The main text can never be deleted — only the boxes you added. */
export const removeTextObject = (cue, idx) => {
  const i = Number(idx) || 0;
  if (i <= 0) return cue;
  const texts = [...textObjectsOf(cue)];
  texts.splice(i - 1, 1);
  return texts.length ? { ...cue, texts } : { ...cue, texts: [] };
};

export const duplicateTextObject = (cue, idx) => {
  const src = textObjectAt(cue, idx);
  if (!src) return cue;
  const w = Number(src.box?.w) || 640;
  const h = Number(src.box?.h) || 120;
  const copy = {
    ...src,
    id: nextId(),
    box: {
      ...src.box,
      x: Math.max(0, Math.min(1280 - w, (Number(src.box?.x) || 0) + 28)),
      y: Math.max(0, Math.min(720 - h, (Number(src.box?.y) || 0) + 28)),
    },
  };
  const texts = [...textObjectsOf(cue)];
  texts.splice(Number(idx) || 0, 0, copy); // lands directly after the source
  return { ...cue, texts };
};

/** Z-order = array order (extras draw above the main text). */
export const moveTextObject = (cue, idx, dir) => {
  const i = Number(idx) || 0;
  if (i <= 0) return cue;
  const texts = [...textObjectsOf(cue)];
  const from = i - 1;
  const to = from + (dir === 'front' ? 1 : -1);
  if (to < 0 || to >= texts.length || from === to) return cue;
  const [it] = texts.splice(from, 1);
  texts.splice(to, 0, it);
  return { ...cue, texts };
};

/**
 * Payload shape for every LIVE surface (projector, stage feed, mobile):
 * `{ text, lyric }`, where `lyric` carries its own box — so a renderer only
 * needs `renderLyricsLayout(t.text, t.lyric, t.lyric.box)` / `<LyricsBlock>`.
 */
export const textObjectLayers = (cue) =>
  textObjectsOf(cue).map((o) => ({ text: o.text || '', lyric: cueLyricStyle(o) }));
