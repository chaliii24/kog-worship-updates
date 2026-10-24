// =====================================================================
// TITLE CARD TEMPLATES — the song's opening moment, in one pick.
//
// A song's title slide is `song.title_cue` (label 'Song Title'), and until
// now every song opened the same way: centred words in the default box, with
// "Song By: <artist>" tucked into the bottom-right corner. Real services open
// with a designed card — a stacked title, hairline rules, the artist across
// the top, an event line, the venue — and building that by hand meant moving
// a box, guessing a size and losing it on the next song.
//
// A template is DATA, exactly like SCRIPTURE_TEMPLATES and SONG_THEMES:
//   • `cue`    — the typography/geometry patch copied onto `title_cue`.
//   • `chrome` — the card's framing (rules + the small lines around the
//                title), drawn by ONE component (TitleCardChrome) so the
//                picker's thumbnails, the editor canvas and the wall can
//                never drift apart.
//
// Positions are absolute on the 1280x720 design canvas, like every other
// lyric box, and written out rather than derived: the picker, the canvas and
// the projector all read these same numbers, and a rule that is meant to sit
// 26px below the top edge says so.
//
// `card` (the id), `cardEvent` and `cardVenue` ride on `title_cue`, which is
// already stored as free-form JSON — no schema change, and songs saved before
// templates existed open on Classic, unchanged.
// =====================================================================
import { FONT_OPTIONS } from './constants.js';

const FACE = (label) => (FONT_OPTIONS.find((f) => f.label === label) || FONT_OPTIONS[0]).value;

export const DEFAULT_TITLE_CARD = 'classic';
export const TITLE_CARD_BOX = { x: 80, y: 140, w: 1120, h: 440 };

// The house look, unchanged: centred, middle-anchored, soft drop shadow, and
// the legacy "Song By" artist line. Applying Classic is therefore a real undo
// for a card the operator does not like.
const CLASSIC_CUE = {
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
  // Every template names its resize mode, Classic included: the mode rides on
  // the cue, so leaving it out would let a title left in Fill mode come back
  // still filling after the operator pressed Classic to undo a card.
  resizeMode: 'fit',
  box: { ...TITLE_CARD_BOX },
};

const EDGE = 34;   // how far the card's lines sit from the frame edge
const RULE = 2;    // hairline thickness

export const TITLE_CARD_TEMPLATES = [
  {
    id: 'classic',
    label: 'Classic',
    note: 'The house title slide — centred, no framing',
    cue: CLASSIC_CUE,
    // No chrome: the wall keeps drawing the old "Song By" corner line, so a
    // service saved before templates looks identical after this build.
    chrome: null,
  },
  {
    id: 'editorial',
    label: 'Editorial',
    note: 'Stacked title, hairline rules, artist and venue — the reference card',
    // The pasted reference: a narrow left column forces a two-word title to
    // stack ("Who" / "Else"), tight leading, no shadow — the rules carry the
    // contrast instead of a drop shadow. The box bottom is 586 so the last
    // line clears the lower rule at 604.
    cue: {
      font: FACE('CMG Sans Wide (Default)'),
      size: 150,
      lineHeight: 0.94,
      letterSpacing: -3,
      bold: true,
      italic: false,
      underline: false,
      strike: false,
      case: 'none',
      align: 'left',
      valign: 'bottom',
      color: '#ffffff',
      shadow: false,
      // The card's SIZE only means anything in Fit mode; a title left in Fill
      // mode would stretch to the box and lose the stacked proportion.
      resizeMode: 'fit',
      box: { x: EDGE, y: 196, w: 600, h: 390 },
    },
    chrome: {
      tone: '#ffffff',
      font: FACE('CMG Sans'),
      rules: [
        { x: EDGE - 6, y: 64, w: 1280 - (EDGE - 6) * 2, h: RULE, opacity: 0.55 },
        { x: EDGE - 6, y: 604, w: 1280 - (EDGE - 6) * 2, h: RULE, opacity: 0.55 },
      ],
      slots: [
        { x: EDGE, y: 28, align: 'left', key: 'artist', size: 17, caps: true, tracking: 0.18 },
        { x: EDGE, y: 28, align: 'right', key: 'event', caption: 'LIVE FROM', size: 17, caps: true, tracking: 0.16 },
        { x: EDGE, y: 620, align: 'right', key: 'venue', size: 21, caps: false, tracking: 0.01 },
      ],
    },
  },
  {
    id: 'lower-third',
    label: 'Lower Third',
    note: 'Title low over one rule, singer and venue small',
    cue: {
      font: FACE('CMG Sans ExtraBold'),
      size: 104,
      lineHeight: 0.98,
      letterSpacing: -1,
      bold: true,
      italic: false,
      underline: false,
      strike: false,
      case: 'none',
      align: 'left',
      valign: 'top',
      color: '#ffffff',
      shadow: true,
      shadowColor: '#000000',
      shadowBlur: 18,
      shadowOffsetX: 0,
      shadowOffsetY: 3,
      resizeMode: 'fit',
      box: { x: 56, y: 486, w: 860, h: 176 },
    },
    chrome: {
      tone: '#ffffff',
      font: FACE('CMG Sans'),
      rules: [{ x: 56, y: 470, w: 1280 - 112, h: RULE, opacity: 0.6 }],
      slots: [
        { x: 56, y: 28, align: 'left', key: 'artist', size: 17, caps: true, tracking: 0.18 },
        { x: 56, y: 668, align: 'left', key: 'event', caption: 'LIVE FROM', size: 15, caps: true, tracking: 0.14 },
        { x: 56, y: 668, align: 'right', key: 'venue', size: 17, caps: true, tracking: 0.12 },
      ],
    },
  },
  {
    id: 'spotlight',
    label: 'Spotlight',
    note: 'Centred title under one top rule, artist centred below',
    cue: {
      font: FACE('CMG Sans Wide (Default)'),
      size: 132,
      lineHeight: 1.0,
      letterSpacing: -2,
      bold: true,
      italic: false,
      underline: false,
      strike: false,
      case: 'none',
      align: 'center',
      valign: 'middle',
      color: '#ffffff',
      shadow: true,
      shadowColor: '#000000',
      shadowBlur: 20,
      shadowOffsetX: 0,
      shadowOffsetY: 4,
      resizeMode: 'fit',
      box: { x: 140, y: 214, w: 1000, h: 306 },
    },
    chrome: {
      tone: '#ffffff',
      font: FACE('CMG Sans'),
      rules: [{ x: 120, y: 92, w: 1280 - 240, h: RULE, opacity: 0.5 }],
      slots: [
        { x: 0, y: 30, align: 'center', key: 'artist', size: 17, caps: true, tracking: 0.24 },
        { x: 0, y: 668, align: 'center', key: 'venue', size: 16, caps: true, tracking: 0.18 },
      ],
    },
  },
];

// Unknown / legacy ids land on Classic rather than on nothing, so a title_cue
// saved by a build that knew a template this one does not is still readable.
export const titleCardOf = (cueOrId) => {
  const id = typeof cueOrId === 'string' ? cueOrId : cueOrId && cueOrId.card;
  return TITLE_CARD_TEMPLATES.find((t) => t.id === id) || TITLE_CARD_TEMPLATES[0];
};

export const titleCardIsClassic = (cueOrId) => titleCardOf(cueOrId).chrome == null;

/**
 * The framing to draw for a title cue, with the operator's own words resolved
 * in. Returns null for templates with no chrome (Classic), which is how the
 * wall knows to keep the legacy artist corner line instead.
 *
 * Empty slots are dropped, not drawn empty — a song with no event line simply
 * has no event line, it does not get a stray caption floating on the wall.
 * A caption ("LIVE FROM") only appears when its own line has words.
 */
export const titleCardChrome = (cueOrId, { artist = '', event = '', venue = '' } = {}) => {
  const tpl = titleCardOf(cueOrId);
  if (!tpl.chrome) return null;
  const text = { artist, event, venue };
  const slots = (tpl.chrome.slots || [])
    .map((s) => {
      const value = String(text[s.key] || '').trim();
      // A caption ("LIVE FROM") is a PREFIX, not a label: the operator typing
      // "LIVE FROM PASSION 2025" into the event line is describing the same
      // thing the card already prints, and drawing both read as a stutter on
      // the wall. Suppress the caption when the line already says it.
      const cap = String(s.caption || '').trim();
      const caption = cap && !value.toLowerCase().startsWith(cap.toLowerCase()) ? s.caption : '';
      return { ...s, text: value, caption };
    })
    .filter((s) => s.text);
  const rules = tpl.chrome.rules || [];
  if (!slots.length && !rules.length) return null;
  return { ...tpl.chrome, slots, rules };
};

/**
 * The full cue a pick writes: the template's typography/geometry plus its id,
 * keeping the words the title already carries (a card never renames a song)
 * and the operator's event/venue lines (which belong to the song, not to the
 * template).
 */
export const titleCardCue = (cue, id) => {
  const tpl = titleCardOf(id);
  const base = cue || {};
  return {
    ...base,
    ...tpl.cue,
    box: { ...tpl.cue.box },
    card: tpl.id,
    text: base.text || '',
  };
};
