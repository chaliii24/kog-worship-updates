// Chord chart tools for the Stage tab: transpose a chart on the fly and
// convert it to Nashville numbers. The grammar mirrors electron/songParse.js
// (uppercase root, enumerated qualities) so lyric words like "AMAZING" or
// "Grace" are NEVER mistaken for chords — every line has to look like a
// chart row before a single token moves.

export const KEYS = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

const SHARPS = KEYS;
const FLATS = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];

const pc = (name) => {
  if (!name) return null;
  const m = String(name).match(/^([A-G])([#b]?)$/);
  if (!m) return null;
  const base = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }[m[1]];
  if (base == null) return null;
  return (base + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0) + 12) % 12;
};

// Enumerated quality grammar — the same discipline as songParse: only these
// spellings count, so "mazing"/"race" fail the anchor and fall through as
// plain words.
const ALT = 'm|min|maj|dim|aug|sus|add';
const QUALITY =
  '(?:' + ALT + ')?' +
  '[0-9]*' +
  '(?:(' + ALT + ')[0-9]*)?' +
  '(?:\\((?:' + ALT + ')[0-9]*\\))?' +
  '(?:[#b][0-9]+)*';
const PIECE = '[A-G][#b]?' + QUALITY + '(?:\\/[A-G][#b]?' + QUALITY + ')?';
const CHORD_RE = new RegExp('^(?:N\\.?C\\.?|' + PIECE + ')$');
const BRACKET_RE = new RegExp('\\[(' + PIECE + ')\\]', 'g');
// Bar / separator junk that can share a chord row: "C | G | Am | F".
const BAR_RE = /^[|/\-–—:]+$/;

const isChordToken = (t) => CHORD_RE.test(t);
const isBar = (t) => BAR_RE.test(t);

// A line is transposed only when EVERY token is a chord or bar separator —
// the "all tokens" gate that keeps prose lines (even ones containing a lone
// "A" or "I") untouched.
function isChordLine(line) {
  const tokens = line.split(/\s+/).filter(Boolean);
  if (!tokens.length) return false;
  let chords = 0;
  for (const t of tokens) {
    if (isBar(t)) continue;
    if (isChordToken(t)) { chords += 1; continue; }
    return false;
  }
  return chords > 0;
}

function shiftNote(name, semis, preferFlats) {
  const p = pc(name);
  if (p == null) return name;
  const np = (((p + semis) % 12) + 12) % 12;
  return (preferFlats ? FLATS : SHARPS)[np];
}

function transposePiece(text, semis, preferFlats) {
  if (/^N\.?C\.?$/i.test(text)) return text;
  const m = text.match(/^([A-G][#b]?)([^/]*)(?:\/([A-G][#b]?)(.*))?$/);
  if (!m) return text;
  const [, root, qual, bass, bassQual] = m;
  const out = shiftNote(root, semis, preferFlats) + qual;
  if (bass == null) return out;
  // Slash bass: follow the same spelling preference as the root.
  const bassOut = shiftNote(bass, semis, preferFlats) + (bassQual || '');
  return `${out}/${bassOut}`;
}

// Semitones between two chart/play keys — the only input the panel needs.
export function keyOffset(fromKey, toKey) {
  const a = KEYS.indexOf(fromKey);
  const b = KEYS.indexOf(toKey);
  if (a < 0 || b < 0) return 0;
  return (b - a + 12) % 12;
}

// Transpose every chord LINE in a chart; bracketed chords ([C]) inside
// otherwise-lyric lines move too, because [x] is unambiguous notation.
// `preferFlats` keeps Bb charts in flat spelling instead of forcing A#.
export function transposeChart(text, semis, { preferFlats = false } = {}) {
  const src = text == null ? '' : String(text);
  if (!semis) return src;
  return src.split('\n').map((line) => {
    if (isChordLine(line)) {
      return line
        .split(/(\s+)/)
        .map((tok) => (tok.trim() && !isBar(tok) && isChordToken(tok) ? transposePiece(tok, semis, preferFlats) : tok))
        .join('');
    }
    // Lyric line: only bracketed chords move.
    return line.replace(BRACKET_RE, (whole, body) => `[${transposePiece(body, semis, preferFlats)}]`);
  }).join('\n');
}

const DEGREE = ['1', 'b2', '2', 'b3', '3', '4', 'b5', '5', 'b6', '6', 'b7', '7'];

function nashvillePiece(text, keyPc) {
  if (/^N\.?C\.?$/i.test(text)) return text;
  const m = text.match(/^([A-G][#b]?)([^/]*)(?:\/([A-G][#b]?)(.*))?$/);
  if (!m) return text;
  const [, root, qual, bass, bassQual] = m;
  const deg = (name) => {
    const p = pc(name);
    return p == null ? name : DEGREE[((p - keyPc + 12) % 12)];
  };
  const out = deg(root) + qual;
  if (bass == null) return out;
  return `${out}/${deg(bass)}${bassQual || ''}`;
}

// Nashville numbers are key-RELATIVE: chord N played in the song's key is
// always its degree of that key, no matter what key the band plays in. So
// the conversion runs against the play key after transposition (equivalent
// to running against the chart key before it).
export function toNashville(text, key) {
  const src = text == null ? '' : String(text);
  const keyPc = pc(key);
  if (keyPc == null) return src;
  return src.split('\n').map((line) => {
    if (isChordLine(line)) {
      return line
        .split(/(\s+)/)
        .map((tok) => (tok.trim() && !isBar(tok) && isChordToken(tok) ? nashvillePiece(tok, keyPc) : tok))
        .join('');
    }
    return line.replace(BRACKET_RE, (whole, body) => `[${nashvillePiece(body, keyPc)}]`);
  }).join('\n');
}
