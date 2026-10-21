// =====================================================================
// SCRIPTURE TEMPLATES — one pick decides where the words sit on the wall
// and which face they wear.
//
// A scripture slide is a lyric block (`style.lyric`) plus a background.
// Before templates every passage got the same fixed look: a near-fullscreen
// box anchored top-left, so short verses floated off to one side and the
// operator had no way to make scripture read like scripture instead of like
// a song lyric. A template is the LAYOUT of that block — box, alignment,
// vertical anchor, line height and how far the fill-fitter may grow the
// type — plus where (and whether) the passage reference is drawn.
//
// Two rules keep this honest:
//   • The operator's FontPicker/colour still win when set — a template
//     supplies the default FACE, never an override of an explicit choice.
//   • Templates are data, not components. The projector, the console
//     preview and the scripture template picker all read this one table, so
//     a thumbnail can never drift from what the wall actually draws.
//
// Boxes are in the 1280x720 design canvas, like every other lyric box.
// =====================================================================

export const DEFAULT_SCRIPTURE_TEMPLATE = 'default';

export const SCRIPTURE_TEMPLATES = [
  {
    id: 'default',
    label: 'Default',
    note: 'The original look — reference on top, words fill the frame',
    // NO face of its own: the default keeps whatever the stage/operator font
    // is, exactly like it did before templates existed. Forcing a wide face
    // here silently shrank every fitted passage (wider glyphs wrap into more
    // rows, so the fill solver picks a smaller size) — the default must stay
    // pixel-for-pixel the look the operator already knows.
    font: null,
    // EXACT pre-template geometry. Kept first and by default so a passage
    // rendered by an older build, and every service saved before templates,
    // lands on the same box/size/line height it was authored with.
    ref: { pos: 'inline' },
    // valign is deliberately left undefined: the old block centred vertically
    // inside its box, and the renderer treats undefined as middle.
    lyric: { align: 'left', lineHeight: 1.12, fillMax: 165, fillMin: 18, box: { x: 32, y: 20, w: 1216, h: 680 } },
  },
  {
    id: 'header',
    label: 'Header',
    note: 'Reference top-left, words below it',
    font: '"CMG Sans Wide", "CMG Sans", sans-serif',
    ref: { pos: 'top-left', size: 40, opacity: 0.8, translation: false },
    lyric: { align: 'left', valign: 'top', lineHeight: 1.16, fillMax: 160, fillMin: 18, box: { x: 56, y: 128, w: 1168, h: 556 } },
  },
  {
    id: 'centered',
    label: 'Centered',
    note: 'Centered words, reference bottom-right',
    font: '"Cinzel Decorative", Georgia, serif',
    ref: { pos: 'bottom-right', size: 30, opacity: 0.78, translation: true },
    lyric: { align: 'center', valign: 'middle', lineHeight: 1.34, fillMax: 110, fillMin: 18, box: { x: 120, y: 92, w: 1040, h: 520 } },
  },
  {
    id: 'top-center',
    label: 'Top Center',
    note: 'Reference on top, words centered below',
    font: '"CMG Sans Wide", "CMG Sans", sans-serif',
    ref: { pos: 'top-center', size: 36, opacity: 0.8, translation: false },
    lyric: { align: 'center', valign: 'top', lineHeight: 1.3, fillMax: 116, fillMin: 18, box: { x: 120, y: 158, w: 1040, h: 494 } },
  },
  {
    id: 'lower-third',
    label: 'Lower Third',
    note: 'Words sit low, for a live camera behind',
    font: '"CMG Sans", system-ui, sans-serif',
    // Top-right, NOT bottom-right: the block is bottom-anchored here, so a
    // bottom corner reference would sit on the last line of the verse.
    ref: { pos: 'top-right', size: 26, opacity: 0.74, translation: true },
    lyric: { align: 'left', valign: 'bottom', lineHeight: 1.26, fillMax: 110, fillMin: 16, box: { x: 64, y: 428, w: 1152, h: 228 } },
  },
  {
    id: 'statement',
    label: 'Statement',
    note: 'One huge centered line, no reference',
    font: '"CMG Sans Wide ExtraBold", "CMG Sans Wide", sans-serif',
    ref: { pos: 'hidden' },
    lyric: { align: 'center', valign: 'middle', lineHeight: 1.1, fillMax: 190, fillMin: 20, box: { x: 108, y: 108, w: 1064, h: 504 } },
  },
];

// Unknown / legacy ids land on Default rather than on nothing, so a payload
// saved by a build that knew a template this one does not is still readable.
export const scriptureTemplateOf = (id) =>
  SCRIPTURE_TEMPLATES.find((t) => t.id === id) || SCRIPTURE_TEMPLATES[0];

// Where the reference sits: 'inline' (a line inside the passage text, the
// original behaviour), a corner, or 'hidden'. The renderer uses this to
// decide whether the reference is stripped out of the text at all.
export const scriptureRefPos = (id) => {
  const tpl = scriptureTemplateOf(id);
  return (tpl.ref && tpl.ref.pos) || 'hidden';
};

/**
 * The lyric style a scripture slide renders with: the template's layout with
 * the operator's font/colour (when set) layered on top — the same precedence
 * scripture has always had over the stage style.
 */
export const scriptureLyricFor = (tpl, fmt = {}, stage = {}) => ({
  font: (typeof fmt.font === 'string' && fmt.font) || tpl.font || stage.fontFamily || 'system-ui, sans-serif',
  size: 110,
  lineHeight: tpl.lyric.lineHeight,
  align: tpl.lyric.align,
  valign: tpl.lyric.valign,
  color: (typeof fmt.color === 'string' && fmt.color) || stage.fontColor || '#ffffff',
  caseMode: 'none',
  fill: true,
  fillMax: tpl.lyric.fillMax,
  fillMin: tpl.lyric.fillMin,
  box: { ...tpl.lyric.box },
});

/**
 * The reference line, split back OUT of the payload text.
 *
 * buildBiblePayload still writes `"<ref>\n\n<body>"` into content (every other
 * surface — cue lists, stage monitor, thumbnails — prints it raw and must
 * keep the reference), while the projection draws the reference as its own
 * element so a template can move it to a corner and size it separately. Old
 * payloads carry the same shape, so one strip covers both: anything that
 * still has the reference as its first line loses it here and gains the
 * template's element instead.
 *
 * The Default template keeps 'inline', so it never calls this — its text is
 * drawn exactly as it always was.
 */
export const stripScriptureRef = (text, ref) => {
  const t = String(text || '');
  const r = String(ref || '').trim();
  if (!r || !t.startsWith(r)) return t;
  return t.slice(r.length).replace(/^[ \t]*\n+/, '');
};
