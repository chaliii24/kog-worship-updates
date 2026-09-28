import React from 'react';
import { FONT_OPTIONS } from './constants';

export const applyCaseTransform = (t, mode) => {
  if (mode === 'upper') return t.toUpperCase();
  if (mode === 'title') return t.replace(/\b\w/g, c => c.toUpperCase());
  return t;
};

// ---- inline markup ---------------------------------------------------------
// Cue text stays a plain string (it is what the editor textarea edits and what
// the DB stores), so per-line / per-word typography is expressed inline:
//
//   **JESUS**                          bold — unchanged, already in old songs
//   {size=0.55}ONLY YOU                rest of that line at 55% of block size
//   {size=1.6}JESUS                    a bigger keyword line
//   {size=0.55,w=300,track=0.2}KICKER  weight + letter-spacing (em)
//   {font=CMG Sans|sans-serif}         '|' stands in for ',' inside a stack
//   {color=#f0b429}                    per-run colour
//   {/}                                end the run before end of line
//   {0.55}                             bare number == {size=0.55}
//
// Scales are RELATIVE, never px: computeLyricsFontSize auto-fits the block to
// its box, so absolute sizes would fight the fit while ratios ride along with
// it. The keys are spelled out rather than abbreviations and every value is
// numeric because applyCaseTransform() upper/title-cases the whole string
// BEFORE this ever runs — a letter-only marker would come back as {SM} or
// {Sm} and silently stop matching.
const clampScale = (n) => Math.min(8, Math.max(0.1, n));

// Per-run style flags. The long name is what the editor always WRITES and the
// single letters are accepted as shorthand for hand-typed markup. Every VALUE
// is a number or a plain word so applyCaseTransform()'s upper/title case — which
// runs over the whole string before any of this — can only ever change case we
// fold away on the read side (`{U=1}` -> `u=1`).
const BOOL_KEYS = {
  b: 'bold', bold: 'bold',
  u: 'underline', underline: 'underline',
  i: 'italic', italic: 'italic',
  s: 'strike', strike: 'strike',
};
const BOOL_WORDS = {
  '1': true, '0': false, true: true, false: false,
  on: true, off: false, yes: true, no: false, y: true, n: false,
};
const parseBool = (v) => {
  const t = String(v).trim().toLowerCase();
  return t in BOOL_WORDS ? BOOL_WORDS[t] : undefined;
};

const parseRunAttrs = (raw) => {
  const out = {};
  for (const chunk of raw.split(',')) {
    const kv = chunk.trim();
    if (!kv) continue;
    const eq = kv.indexOf('=');
    if (eq < 0) {
      // `{bold}` on its own is a flag, `{0.55}` is shorthand for {size=0.55}.
      const bare = BOOL_KEYS[kv.toLowerCase()];
      if (bare) { out[bare] = true; continue; }
      const n = parseFloat(kv);
      if (Number.isFinite(n) && n > 0) out.scale = clampScale(n);
      continue;
    }
    const k = kv.slice(0, eq).trim().toLowerCase();
    const v = kv.slice(eq + 1).trim();
    if (!k || !v) continue;
    if (k === 'size' || k === 'scale') {
      const n = parseFloat(v);
      if (Number.isFinite(n) && n > 0) out.scale = clampScale(n);
    } else if (k === 'w' || k === 'weight') {
      const n = parseInt(v, 10);
      if (Number.isFinite(n)) out.weight = Math.min(900, Math.max(100, Math.round(n / 100) * 100));
    } else if (k === 'track' || k === 'ls') {
      const n = parseFloat(v);
      if (Number.isFinite(n)) out.track = Math.min(2, Math.max(-0.3, n));
    } else if (k === 'font') {
      out.font = v.replace(/\|/g, ', ');
    } else if (k === 'color' || k === 'colour') {
      out.color = v;
    } else if (BOOL_KEYS[k]) {
      const b = parseBool(v);
      if (b !== undefined) out[BOOL_KEYS[k]] = b;
    }
  }
  return out;
};

// Ordered tokens: { text, bold } | { run: attrs } | { close: true }.
const tokenizeLine = (line, inBold) => {
  const tokens = [];
  const re = /\*\*([\s\S]+?)\*\*|\{([^{}]*)\}/g;
  let m, last = 0;
  while ((m = re.exec(line)) !== null) {
    if (m.index > last) tokens.push({ text: line.slice(last, m.index), bold: inBold });
    if (m[1] !== undefined) {
      // Recurse so a marker nested inside **bold** is still picked up.
      tokens.push(...tokenizeLine(m[1], true));
    } else {
      const raw = m[2].trim();
      if (raw === '' || raw === '/') tokens.push({ close: true });
      else tokens.push({ run: parseRunAttrs(raw) });
    }
    last = m.index + m[0].length;
  }
  if (last < line.length) tokens.push({ text: line.slice(last), bold: inBold });
  return tokens;
};

// Adjacent tokens merge into one <span> when every run key matches. The flags
// compare as booleans because parseSegments always spells `bold` out while the
// newer flags arrive as undefined-or-true from the marker scope — and to the
// renderer "off" and "never mentioned" mean exactly the same thing. Written out
// rather than looped because this runs for every adjacent pair of every line
// of every frame, on a machine that is already short of CPU.
const sameRun = (a, b) => !!a.bold === !!b.bold
  && !!a.underline === !!b.underline
  && !!a.italic === !!b.italic
  && !!a.strike === !!b.strike
  && a.scale === b.scale && a.weight === b.weight && a.track === b.track
  && a.font === b.font && a.color === b.color;

// A line becomes a short list of styled runs. Adjacent runs that share a style
// are merged, so a normal unmarked line is exactly one run — which is what
// keeps the rendered DOM identical to before this feature existed.
export const parseSegments = (line) => {
  const segs = [];
  let scope = {};
  for (const tk of tokenizeLine(line || '', false)) {
    if (tk.close) { scope = {}; continue; }
    if (tk.run) { scope = { ...scope, ...tk.run }; continue; }
    const seg = { bold: !!tk.bold, scale: 1, ...scope, t: tk.text };
    if (!seg.t) continue;
    const prev = segs[segs.length - 1];
    if (prev && sameRun(prev, seg)) prev.t += seg.t;
    else segs.push(seg);
  }
  return segs.length ? segs : [{ bold: false, scale: 1, t: '' }];
};

// Plain text for every surface that is NOT renderLyricsLayout — the stage
// monitor, the mobile views, cue lists and thumbnails. They print cue.text
// raw, so without this the markers would show up as literal `{size=0.55}` (and
// `**bold**` already leaks as literal asterisks today).
const stripLine = (ln) => {
  const hadLead = /^[ \t]*\{[^{}\n]*\}/.test(ln);
  const out = ln.replace(/\{[^{}\n]*\}/g, '').replace(/\*\*([\s\S]+?)\*\*/g, '$1');
  // A leading marker usually carries no space after it; drop the one that did.
  return hadLead ? out.replace(/^[ \t]+/, '') : out;
};
export const stripMarkup = (text) => (text || '').split('\n').map(stripLine).join('\n');

// ---------------------------------------------------------------------------
// Typography spans — the chip row and inline (selection) formatting
//
// cue.text keeps the markers, and that is deliberate: a marker rides along with
// its own characters, so splitting, deleting or pasting lines needs nothing
// else kept in sync, and every renderer already understands it.
//
// The EDITOR is the one exception. A textarea is plain text, so a marker would
// sit right in the middle of the words being typed — which is not something a
// volunteer should ever see. So the editor INGESTS cue.text into
// `{ clean text, spans[] }`, edits the clean text, and EMITS the markers back
// when it commits. The two are exact inverses, so nothing is lost either way.
//
//   spans: [{ from, to, attrs }] — half-open offsets into the CLEAN text that
//   never cross a newline. `attrs` is always explicit (never inherited), so one
//   range can be sized, bolded or underlined independently of everything
//   around it — a whole line is just a span that happens to cover the line,
//   which is why the chips and a drag-selection share a single code path.
//
//   A zero-length span is an ANCHOR: a style that starts at that exact spot and
//   has no characters yet. It is how a marker on an empty line survives the
//   round trip, and how typing into that line picks the style up.
// ---------------------------------------------------------------------------

// Presets on the chip row. 1 means "normal" and clears the marker.
export const LINE_SCALE_PRESETS = [0.55, 0.7, 1, 1.5, 2];

const SPAN_NUM = ['scale', 'weight', 'track'];
const SPAN_TEXT = ['font', 'color'];
const SPAN_BOOL = ['bold', 'underline', 'italic', 'strike'];
const SPAN_KEYS = [...SPAN_NUM, ...SPAN_TEXT, ...SPAN_BOOL];

/** Drop keys carrying no style, so `{bold:false}` and "no bold" compare equal. */
const normAttrs = (a) => {
  const o = {};
  if (!a) return o;
  for (const k of SPAN_KEYS) {
    const v = a[k];
    if (v === undefined || v === null || v === false) continue;
    o[k] = v;
  }
  return o;
};
const isEmptyAttrs = (a) => {
  const n = normAttrs(a);
  return SPAN_KEYS.every((k) => n[k] === undefined);
};
const sameAttrs = (a, b) => SPAN_KEYS.every((k) => normAttrs(a)[k] === normAttrs(b)[k]);
// Where two spans overlap the NARROWER one wins, so an inline style always
// overrides the line it sits in.
const byNarrow = (a, b) => (a.to - a.from) - (b.to - b.from);
const unionAttrs = (list) => {
  const out = {};
  for (const s of list) Object.assign(out, normAttrs(s.attrs));
  return out;
};

const isBoldOnly = (a) => {
  const n = normAttrs(a);
  return n.bold === true && SPAN_KEYS.every((k) => k === 'bold' || n[k] === undefined);
};

/** The `{…}` text for a set of attrs. Booleans are written longhand because
 *  applyCaseTransform can uppercase `{U}` and the reader folds case anyway. */
const markerOf = (a) => {
  const n = normAttrs(a);
  const parts = [];
  if (n.scale !== undefined) parts.push(`size=${clampScale(n.scale)}`);
  if (n.weight !== undefined) parts.push(`w=${n.weight}`);
  if (n.track !== undefined) parts.push(`track=${n.track}`);
  if (n.font !== undefined) parts.push(`font=${String(n.font).replace(/,\s*/g, '|')}`);
  if (n.color !== undefined) parts.push(`color=${n.color}`);
  if (n.bold) parts.push('bold=1');
  if (n.underline) parts.push('underline=1');
  if (n.italic) parts.push('italic=1');
  if (n.strike) parts.push('strike=1');
  return parts.length ? `{${parts.join(',')}}` : '';
};

const mergeSpans = (spans) => {
  const out = [];
  const sorted = [...(spans || [])].sort((a, b) => (a.from - b.from) || (a.to - b.to));
  for (const s of sorted) {
    if (s.to < s.from) continue;
    const attrs = normAttrs(s.attrs);
    if (isEmptyAttrs(attrs)) continue;
    const last = out[out.length - 1];
    if (last && last.to === s.from && sameAttrs(last.attrs, attrs)) {
      last.to = Math.max(last.to, s.to);
      continue;
    }
    out.push({ from: s.from, to: s.to, attrs });
  }
  return out;
};

/** One raw line -> marker-free line + its spans in that line's own offsets. */
const scanLine = (raw) => {
  const pieces = [];
  let scope = {};
  for (const tk of tokenizeLine(raw || '', false)) {
    if (tk.close) { scope = {}; continue; }
    if (tk.run) { scope = { ...scope, ...tk.run }; continue; }
    if (!tk.text) continue;
    pieces.push({ t: tk.text, attrs: normAttrs({ ...scope, ...(tk.bold ? { bold: true } : null) }) });
  }
  let line = '';
  const spans = [];
  for (const p of pieces) {
    const from = line.length;
    line += p.t;
    const to = line.length;
    if (isEmptyAttrs(p.attrs)) continue;
    const last = spans[spans.length - 1];
    if (last && last.to === from && sameAttrs(last.attrs, p.attrs)) last.to = to;
    else spans.push({ from, to, attrs: p.attrs });
  }
  // A marker with nothing after it has no characters to carry — keep it as a
  // zero-length anchor so the style is not thrown away on the next commit.
  const tail = normAttrs(scope);
  if (!isEmptyAttrs(tail)) spans.push({ from: line.length, to: line.length, attrs: tail });
  return { line, spans };
};

/** Marker-laden cue.text -> `{ text, spans }` for the editor to work on. */
export const ingestSpans = (text) => {
  const src = text == null ? '' : String(text);
  const lines = src.split('\n');
  let clean = '';
  const spans = [];
  lines.forEach((ln, li) => {
    const base = clean.length + (li ? 1 : 0);
    const sc = scanLine(ln);
    for (const s of sc.spans) spans.push({ from: base + s.from, to: base + s.to, attrs: s.attrs });
    if (li) clean += '\n';
    clean += sc.line;
  });
  return { text: clean, spans: mergeSpans(spans) };
};

/** Emit one line: close and reopen a scope only when the scope cannot carry
 *  the next segment forward, so `{size=0.55}WORD` and `**BOLD**` come back out
 *  byte-identical instead of being rewritten into something uglier. */
const emitLine = (line, local) => {
  const real = local.filter((s) => s.to > s.from);
  const anchorMarker = (p) => {
    const list = local.filter((s) => s.to === s.from && s.from === p);
    if (!list.length) return '';
    return markerOf(unionAttrs(list));
  };
  if (!line.length) return anchorMarker(0);
  if (!real.length) return line + anchorMarker(line.length);

  const cuts = new Set([0, line.length]);
  for (const s of real) { cuts.add(s.from); cuts.add(s.to); }
  const bp = [...cuts].sort((a, b) => a - b);

  let out = '';
  let open = {};
  const carry = (target) => SPAN_KEYS.every((k) => open[k] === undefined || open[k] === target[k]);
  const add = (t, attrs) => {
    if (isEmptyAttrs(attrs)) {
      if (!isEmptyAttrs(open)) { out += '{/}'; open = {}; }
      out += t;
      return;
    }
    if (carry(attrs)) {
      const diff = {};
      for (const k of SPAN_KEYS) if (attrs[k] !== undefined && attrs[k] !== open[k]) diff[k] = attrs[k];
      if (isEmptyAttrs(diff)) { out += t; return; }
      if (isBoldOnly(diff)) { out += `**${t}**`; return; }
      const rest = { ...diff };
      delete rest.bold;
      if (diff.bold && !isEmptyAttrs(rest)) {
        out += `${markerOf(rest)}**${t}**`;
        open = { ...open, ...rest };
      } else if (diff.bold) {
        out += `**${t}**`;
      } else {
        out += `${markerOf(diff)}${t}`;
        open = { ...open, ...diff };
      }
      return;
    }
    if (!isEmptyAttrs(open)) { out += '{/}'; open = {}; }
    if (isBoldOnly(attrs)) { out += `**${t}**`; return; }
    const rest = { ...attrs };
    delete rest.bold;
    if (attrs.bold && !isEmptyAttrs(rest)) {
      out += `${markerOf(rest)}**${t}**`;
      open = { ...rest };
    } else if (attrs.bold) {
      out += `**${t}**`;
    } else {
      out += `${markerOf(attrs)}${t}`;
      open = { ...attrs };
    }
  };

  for (let i = 0; i < bp.length - 1; i++) {
    const a = bp[i], b = bp[i + 1];
    if (b <= a) continue;
    add(line.slice(a, b), unionAttrs(real.filter((s) => s.from <= a && s.to >= b).sort(byNarrow)));
  }

  // Trailing anchor: only if the emitted text would not already leave this
  // scope open at end-of-line (ingest regenerates it there anyway), and when it
  // does need stating it has to state its own attrs exactly — so break out of
  // whatever scope the visible text left open first.
  const tail = anchorMarker(line.length);
  if (tail) {
    const anchorAttrs = unionAttrs(local.filter((s) => s.to === s.from && s.from === line.length));
    if (!sameAttrs(open, anchorAttrs)) {
      const canCarry = SPAN_KEYS.every((k) => open[k] === undefined || open[k] === anchorAttrs[k]);
      out += (canCarry ? '' : '{/}') + tail;
    }
  }
  return out;
};

/** The inverse: put the markers back on commit. */
export const emitSpans = (text, spans) => {
  const src = text == null ? '' : String(text);
  const list = mergeSpans(spans || []);
  const lines = src.split('\n');
  let start = 0;
  const out = lines.map((ln, i) => {
    const s0 = i ? start + 1 : start;
    const s1 = s0 + ln.length;
    start = s1;
    // emitLine works in the line's own offsets. A selection can span lines, so
    // CLIP rather than drop: each line keeps the part that belongs to it, and
    // the newline itself simply matches no line and evaporates.
    const local = list
      .filter((s) => (s.from === s.to ? (s.from >= s0 && s.from <= s1) : (s.from < s1 && s.to > s0)))
      .map((s) => ({ from: Math.max(s.from, s0) - s0, to: Math.min(s.to, s1) - s0, attrs: s.attrs }));
    return emitLine(ln, local);
  });
  return out.join('\n');
};

/**
 * Re-align the spans after an edit.
 *
 * A textarea edit is always one contiguous replacement, so the old and new
 * strings share a head and a tail and the piece between them is exactly what
 * changed — every offset outside that piece maps by a simple shift. Offsets
 * INSIDE it are trimmed back to the nearest surviving edge: text you replace
 * does not keep the styling of what it overwrote, but the styling on either
 * side of the edit stays put. Anchors expand instead when text is typed
 * exactly at their spot, which is how an empty line's style follows the words
 * typed into it.
 */
export const remapSpans = (prev, next, spans) => {
  const list = spans || [];
  if (prev === next) return mergeSpans(list);
  const a = prev || '', b = next || '';
  if (!list.length) return [];
  const al = a.length, bl = b.length;
  let p = 0;
  while (p < al && p < bl && a.charCodeAt(p) === b.charCodeAt(p)) p++;
  let s = 0;
  while (s < al - p && s < bl - p && a.charCodeAt(al - 1 - s) === b.charCodeAt(bl - 1 - s)) s++;
  const cutA = p;
  const endA = al - s;
  const endB = bl - s;
  const removed = endA - cutA;
  const added = endB - cutA;
  const shift = added - removed;
  const map = (pos, isEnd) => {
    if (pos <= cutA) return pos;
    if (pos >= endA) return pos + shift;
    return isEnd ? cutA : endB;
  };
  const out = [];
  for (const sp of list) {
    if (sp.from === sp.to) {
      if (added > 0 && removed === 0 && sp.from === cutA) out.push({ from: cutA, to: endB, attrs: sp.attrs });
      else {
        const f = map(sp.from, false);
        out.push({ from: f, to: Math.max(f, map(sp.to, true)), attrs: sp.attrs });
      }
      continue;
    }
    const f = map(sp.from, false);
    const t = map(sp.to, true);
    if (t > f) out.push({ from: f, to: t, attrs: sp.attrs });
  }
  return mergeSpans(out);
};

const splitAt = (list, pos) => {
  const out = [];
  for (const s of list) {
    if (pos <= s.from || pos >= s.to) { out.push(s); continue; }
    out.push({ from: s.from, to: pos, attrs: s.attrs });
    out.push({ from: pos, to: s.to, attrs: s.attrs });
  }
  return out;
};

/**
 * Set (or, with a `false` value, clear) attrs over `[from, to)`.
 *
 * This is what a chip or a B/I/U button does: it never touches the string, so
 * the caret cannot move and there is no marker for the next keystroke to land
 * inside of. `from === to` writes an anchor instead, for an empty line.
 */
export const applySpanPatch = (spans, from, to, patch) => {
  const list = spans || [];
  const set = normAttrs(patch);
  const cleared = Object.keys(patch || {}).filter((k) => patch[k] === false || patch[k] === null || patch[k] === undefined);
  if (to === from) {
    const keep = list.filter((s) => !(s.from === s.to && s.from === from));
    if (!isEmptyAttrs(set)) keep.push({ from, to, attrs: set });
    return mergeSpans(keep);
  }
  if (!(to > from)) return mergeSpans(list);
  const split = splitAt(splitAt(list, from), to);
  const inside = split.filter((s) => s.from >= from && s.to <= to);
  const out = split.map((s) => {
    if (s.from < from || s.to > to) return s;
    const attrs = { ...s.attrs };
    for (const k of cleared) delete attrs[k];
    Object.assign(attrs, set);
    return { from: s.from, to: s.to, attrs };
  });
  // Whatever the range covered with no span of its own still needs the new
  // style — cover exactly those gaps, so no two spans ever disagree about the
  // same characters.
  if (!isEmptyAttrs(set)) {
    let pos = from;
    const gaps = [];
    for (const s of [...inside].sort((a, b) => a.from - b.from)) {
      if (s.from > pos) gaps.push([pos, s.from]);
      pos = Math.max(pos, s.to);
    }
    if (pos < to) gaps.push([pos, to]);
    for (const [a, b] of gaps) if (b > a) out.push({ from: a, to: b, attrs: set });
  }
  return mergeSpans(out);
};

/** Effective attrs over a range — narrower spans override wider ones. */
export const rangeAttrs = (spans, from, to) => {
  const hit = to > from
    ? (s) => s.from < to && s.to > from
    : (s) => s.from <= from && s.to >= from;
  return unionAttrs((spans || []).filter(hit).sort(byNarrow));
};

/** True when `key` is on across the WHOLE range — what a toggle button needs. */
export const spanCovers = (spans, from, to, key) => {
  const list = (spans || []).filter((s) => s.to > s.from && normAttrs(s.attrs)[key]);
  if (!(to > from)) return list.some((s) => s.from <= from && s.to >= from);
  const runs = list.filter((s) => s.from < to && s.to > from).sort((a, b) => a.from - b.from);
  let pos = from;
  for (const s of runs) {
    if (s.from > pos) return false;
    pos = Math.max(pos, s.to);
    if (pos >= to) return true;
  }
  return false;
};

/** `[start, end]` offsets of line `li` inside `text`. */
export const lineSpanRange = (text, li) => {
  const lines = (text == null ? '' : String(text)).split('\n');
  const i = Math.max(0, Math.min(Math.max(0, Number(li) || 0), lines.length - 1));
  let start = 0;
  for (let k = 0; k < i; k++) start += lines[k].length + 1;
  return [start, start + lines[i].length];
};

// 0-based index of the line containing `pos`.
export const lineIndexAt = (text, pos) => Math.max(0, (text || '').slice(0, Math.max(0, Number(pos) || 0)).split('\n').length - 1);

// ---------------------------------------------------------------------------
// Line-scale MAP — what "make these slides look like that one" needs.
//
// The scale lives inside cue.text as `{size=…}`, so it has to be read out of
// the source slide and written into the target without ever touching either
// string's WORDS: the lyrics differ slide to slide, the look must not.
// ---------------------------------------------------------------------------

// Per-line scale of a marker-laden cue text; `undefined` = normal size.
// This reads the size the WHOLE line wears — a style that only covers part of
// the line is a WORD style, not the line's own (Apply reads those through
// scaleProfile instead). Cached by string: the same handful of cue texts come
// round again and again.
const lineScaleCache = new Map();
const computeLineScales = (src) => {
  const ing = ingestSpans(src);
  return ing.text.split('\n').map((_, li) => {
    const [a, b] = lineSpanRange(ing.text, li);
    let best;
    let width = Infinity;
    for (const s of ing.spans) {
      const v = s && s.attrs ? s.attrs.scale : undefined;
      // 1 is "normal" — the preset that clears the marker — so it reads as
      // unscaled, and a run covering only part of the line is a WORD style,
      // not the line's own size.
      if (typeof v !== 'number' || !(v > 0) || v === 1) continue;
      if (s.from <= a && s.to >= b && s.to - s.from < width) { width = s.to - s.from; best = v; }
    }
    return best;
  });
};
export const lineScales = (text) => {
  const key = text == null ? '' : String(text);
  const hit = lineScaleCache.get(key);
  if (hit) return hit;
  const out = computeLineScales(key);
  if (lineScaleCache.size > 500) lineScaleCache.clear();
  lineScaleCache.set(key, out);
  return out;
};

/**
 * Which size every CHARACTER of the source carries, flattened to an array —
 * a word run sitting inside a line-wide run, a newline that owns none.
 *
 * This is deliberately NOT lineScales(): a slide like
 * `{size=0.7}way laing {/}{size=1.5}simbahon` is ONE physical line whose two
 * sizes WRAP into two visual lines on the projector, so per line it reports
 * nothing at all and "make the others look like this" copies nothing. The
 * widest span is written first so the narrowest overwrites it — the same
 * precedence the renderer gives an inline style over the line it sits in.
 */
const scaleProfile = (src) => {
  const ing = ingestSpans(src);
  const chars = new Array(ing.text.length).fill(undefined);
  const runs = (ing.spans || [])
    .filter((s) => {
      const v = s && s.attrs ? s.attrs.scale : undefined;
      return typeof v === 'number' && v > 0 && v !== 1;
    })
    .sort((a, b) => (b.to - b.from) - (a.to - a.from));
  let anchor;
  for (const s of runs) {
    // A zero-width span is an anchor — the size an EMPTY line wears — so it
    // has no characters to write but is still worth remembering.
    if (!(s.to > s.from)) { if (anchor === undefined) anchor = s.attrs.scale; continue; }
    for (let i = Math.max(0, s.from); i < Math.min(chars.length, s.to); i++) chars[i] = s.attrs.scale;
  }
  return { chars, anchor, text: ing.text, has: anchor !== undefined || chars.some((c) => c !== undefined) };
};

// Character offsets of every line of `text`, newline excluded.
const lineBounds = (text) => {
  const out = [];
  let pos = 0;
  for (const ln of String(text).split('\n')) { out.push({ start: pos, end: pos + ln.length }); pos += ln.length + 1; }
  return out;
};

// Word runs of `text[start, end)` as ABSOLUTE [from, to) pairs. Absolute
// matters: a patch computed from line-local offsets lands on line 1 when it
// means line 3, and silently styles the wrong words.
const wordsIn = (text, start, end) => {
  const seg = text.slice(start, end);
  const found = seg.match(/\S+/g);
  if (!found) return [];
  const out = [];
  let at = 0;
  for (const w of found) { const s = seg.indexOf(w, at); out.push([start + s, start + s + w.length]); at = s + w.length; }
  return out;
};

/**
 * The size over `pos` in a profile: that exact character when it carries one,
 * otherwise the NEAREST sized character inside [lo, hi). A newline between two
 * runs owns no size of its own, and [lo, hi) is what stops one line borrowing
 * the next one's size when lines are matched one for one.
 */
const profileAt = (P, pos, lo, hi) => {
  const n = P.chars.length;
  const from = Math.max(0, Math.min(n, lo));
  const to = Math.max(from, Math.min(n, hi));
  if (to <= from) return P.anchor;
  const i = Math.max(from, Math.min(to - 1, Math.floor(pos)));
  if (P.chars[i] !== undefined) return P.chars[i];
  let best;
  let bestD = Infinity;
  for (let k = from; k < to; k++) {
    if (P.chars[k] === undefined) continue;
    const d = Math.abs(k - pos);
    if (d < bestD) { bestD = d; best = P.chars[k]; }
  }
  return best === undefined ? P.anchor : best;
};

/**
 * Rewrite `tgtText` so it wears `srcText`'s sizes — the LOOK, never the words.
 *
 * The source's size pattern is handed over WORD by word, because that is what
 * the operator is actually asking for: "that slide has a small lead-in over a
 * big keyword, give the others the same shape". Both sides are split into
 * word ladders and each target word picks its size by WHERE IT ENDS on the
 * source's ladder — never by characters, which would split `Ikaw lang Ginoo`
 * straight through the lead-in. So `way laing simbahon` → `hangtud may
 * gininhawa` lands 0.7 on the lead-in and 1.5 on the keyword, and a
 * one-word target falls through to the last size (the keyword) instead of
 * shrinking to a stamp.
 *
 * When both sides have the same number of lines the mapping runs line for
 * line, so a size can never leak from one line to the next; when they differ
 * the pattern spreads over the whole text, which is what lets a single-line
 * source style a target that wrapped differently. A source with no sizes at
 * all leaves the target untouched.
 */
export const restyleLineScales = (srcText, tgtText) => {
  const raw = tgtText == null ? '' : String(tgtText);
  const src = String(srcText == null ? '' : srcText);
  // An empty source slide carries no sizes to copy — leave the target as it
  // is rather than reading "blank" as "everything is normal-sized".
  if (!src.trim()) return raw;
  const P = scaleProfile(src);
  if (!P.has) return raw;

  const ing = ingestSpans(raw);
  const tgtLines = lineBounds(ing.text);
  const srcLines = lineBounds(P.text);
  // Same shape → line for line; otherwise the pattern spans the whole text.
  const matched = tgtLines.length === srcLines.length;
  const srcLen = P.chars.length;
  const tgtLen = ing.text.length;
  let spans = ing.spans;

  const tgtWordsAll = wordsIn(ing.text, 0, ing.text.length);
  const ladderAll = wordsIn(P.text, 0, P.text.length).map(([, we]) => profileAt(P, we, 0, srcLen));
  let base = 0; // how many target words precede this line (whole-text mode)

  for (let li = 0; li < tgtLines.length; li++) {
    const tl = tgtLines[li];
    const sl = matched ? srcLines[li] : { start: 0, end: srcLen };
    const lo = sl.start;
    const hi = sl.end;

    const tgtWords = wordsIn(ing.text, tl.start, tl.end);
    // Line for line the index restarts at each line; spread across the text
    // it counts every word BEFORE this line, so a one-word line cannot jump
    // to the last size on its own.
    const g0 = matched ? 0 : base;
    base += tgtWords.length;
    // The source's own words in this scope, each wearing the size that lands
    // over its last character — that ladder is what the target climbs. Word
    // ladders, not character fractions: "way laing simbahon" is 56% lead-in
    // by characters but 2 of its 3 words are, and 2 of 3 is what lands
    // "Ikaw lang Ginoo" on the keyword instead of splitting it in half.
    const ladder = matched ? wordsIn(P.text, sl.start, sl.end).map(([, we]) => profileAt(P, we, lo, hi)) : ladderAll;
    const nS = ladder.length;
    const nT = matched ? tgtWords.length : tgtWordsAll.length;

    if (!tgtWords.length) {
      // A blank line still gets an anchor, so the words typed into it arrive
      // already dressed — and a blank source line simply reads its own size.
      const end = matched ? sl.end : (tl.end / Math.max(1, tgtLen)) * srcLen;
      spans = applySpanPatch(spans, tl.start, tl.end, { scale: profileAt(P, end, lo, hi) });
      continue;
    }
    if (!nS) {
      // The scope has no words to take a size off — one size fits all of it.
      spans = applySpanPatch(spans, tl.start, tl.end, { scale: profileAt(P, sl.end, lo, hi) });
      continue;
    }

    for (let w = 0; w < tgtWords.length; w++) {
      const [ws] = tgtWords[w];
      // Which source word this one lands on, taken from where the target word
      // ENDS: a one-word target lands on the LAST source word — the keyword —
      // rather than shrinking to the size of a lead-in.
      const g = g0 + w;
      const k = Math.max(0, Math.min(nS - 1, Math.ceil(((g + 1) / nT) * nS) - 1));
      // The word takes the size, and so does the space after it — which is
      // how the source writes it, and what lets neighbouring words that share
      // a size merge back into ONE marker instead of one per word.
      const from = w === 0 ? tl.start : ws;
      const to = w + 1 < tgtWords.length ? tgtWords[w + 1][0] : tl.end;
      spans = applySpanPatch(spans, from, to, { scale: ladder[k] });
    }
  }
  return emitSpans(ing.text, spans);
};

// One styled run. A run only becomes a <span> when it genuinely differs from
// its container — an unmarked line renders as a bare text node, so the DOM for
// every song written before this feature existed is byte-for-byte unchanged.
// `ratio` is s.scale / lineMax: the container carries lineMax as its own font
// size, so runs express themselves in `em` relative to it.
const runSpan = (s, ratio, key, stroke) => {
  // Run-level decoration/style, chosen without allocating: both replace whatever
  // the container had, and the useful direction is "this slide is plain, this
  // one word is underlined" — which is exactly what the selection chips produce.
  const deco = s.underline
    ? (s.strike ? 'underline line-through' : 'underline')
    : (s.strike ? 'line-through' : null);
  const italic = s.italic ? 'italic' : null;
  if (ratio === 1 && !s.weight && s.track == null && !s.font && !s.color && !deco && !italic) {
    return s.bold ? <b key={key}>{s.t}</b> : s.t;
  }
  return (
    <span
      key={key}
      style={{
        fontSize: `${ratio}em`,
        fontWeight: s.weight != null ? s.weight : (s.bold ? 700 : undefined),
        letterSpacing: s.track != null ? `${s.track}em` : undefined,
        fontFamily: s.font || undefined,
        color: s.color || undefined,
        // Needed alongside `color` so a per-run colour survives a gradient,
        // whose parent span forces WebkitTextFillColor to transparent.
        WebkitTextFillColor: s.color || undefined,
        WebkitTextStroke: stroke,
        textDecoration: deco || undefined,
        fontStyle: italic || undefined,
      }}
    >{s.t}</span>
  );
};

// Font-size bounds shared by the renderer, the canvas editor and the Size
// field, so the number you type is the number that actually draws. 720 is the
// full canvas height — only a "really big" value ever hits the ceiling.
export const FONT_SIZE_MIN = 12;
export const FONT_SIZE_MAX = 720;

// Box metrics shared by the renderer and by the editor's textarea, so the box
// you type into and the box that lands on the projector are sized identically.
export const lyricsLayoutMetrics = (st, box) => {
  const pad = st.fill ? 6 : Math.max(0, Number(st.pad ?? 10) || 0);
  const boxW = Math.max(200, (box.w || 1280) - pad * 2);
  const boxH = box.h || 640;
  const baseSize = Math.max(FONT_SIZE_MIN, Math.min(Number(st.size) || 110, FONT_SIZE_MAX));
  const maxH = Math.max(40, Math.min(boxH - pad * 2, 700));
  return { pad, boxW, boxH, baseSize, maxH };
};

// The ONE font size for the whole block: top-anchored at box.x/box.y, shrunk
// only when it overflows the box (or, in fill mode, scaled to use the full
// height). Inline runs are measured per line first:
//   maxScale — the biggest run, because that run sets the CSS line-box strut
//              and therefore how tall the line actually is.
//   avgScale — length-weighted mean, because a 1.6x word eats far more
//              horizontal room than a 0.55x word and drives where it wraps.
// Parsed OUTSIDE the closure below: the fill solver evaluates totalHeight ~17
// times and re-parsing per evaluation would multiply the cost for nothing.
const lineShape = (line) => {
  const segs = parseSegments(line);
  let maxScale = 0, chars = 0, weighted = 0;
  for (const s of segs) {
    if (s.scale > maxScale) maxScale = s.scale;
    chars += s.t.length;
    weighted += s.t.length * s.scale;
  }
  return {
    plain: segs.map((s) => s.t).join(''),
    maxScale: maxScale || 1,
    avgScale: chars ? weighted / chars : (maxScale || 1),
  };
};

export const computeLyricsFontSize = (text, st, box) => {
  const lh = st.lineHeight || 1.05;
  const { boxW, baseSize, maxH } = lyricsLayoutMetrics(st, box);
  const lines = (applyCaseTransform(text || '', st.caseMode || 'none')).split('\n');
  const shapes = lines.map(lineShape);
  const totalHeight = (base) => shapes.reduce((h, l) => {
    if (!l.plain.trim()) return h + base * lh * 0.7;
    const cpl = Math.max(6, boxW / (base * l.avgScale * 0.55));
    const wrapped = Math.max(1, Math.ceil(l.plain.length / cpl));
    return h + wrapped * base * l.maxScale * lh;
  }, 0);
  let fs = baseSize;
  if (st.fill) {
    // Fill mode (scripture): scale UP or DOWN so the block uses the full box
    // height. fillMax/fillMin bound the range; a final shrink pass guarantees
    // we never overflow even when many lines exceed fillMin.
    const fillMax = Math.max(baseSize, Math.min(Number(st.fillMax) || 160, FONT_SIZE_MAX));
    const fillMin = Math.max(14, Math.min(Number(st.fillMin) || 18, fillMax));
    let lo = fillMin;
    let hi = fillMax;
    for (let i = 0; i < 12; i++) {
      const mid = (lo + hi) / 2;
      if (totalHeight(mid) <= maxH) lo = mid;
      else hi = mid;
    }
    fs = lo;
    for (let i = 0; i < 5; i++) {
      const actual = totalHeight(fs);
      if (!actual || actual <= maxH) break;
      fs = Math.max(12, fs * (maxH / actual) * 0.97);
    }
  } else {
    for (let i = 0; i < 5; i++) {
      const actual = totalHeight(fs);
      if (!actual || actual <= maxH) break;
      fs = Math.max(14, fs * (maxH / actual));
    }
  }
  return Math.round(fs);
};

// Shared renderer: editor canvas, projector and live-output monitor all draw
// from this ONE function, so letter positions are identical everywhere — and
// so the inline run markup below only ever has to be implemented once.
export const renderLyricsLayout = (text, st, box) => {
  const lines = (applyCaseTransform(text || '', st.caseMode || 'none')).split('\n');
  const lh = st.lineHeight || 1.05;
  const { pad } = lyricsLayoutMetrics(st, box);
  const size = computeLyricsFontSize(text, st, box);
  const isJustify = st.align === 'justify';
  const bold = st.bold !== false;
  const deco = [st.underline ? 'underline' : null, st.strike ? 'line-through' : null].filter(Boolean).join(' ') || 'none';
  const strokeW = Number(st.strokeWidth) || 0;
  const shadowOn = !!st.shadow && ((Number(st.shadowBlur) || 0) > 0 || (Number(st.shadowOffsetX) || 0) !== 0 || (Number(st.shadowOffsetY) || 0) !== 0);
  const gradOn = !!st.gradient;
  const gradAngle = Number(st.gradientAngle);
  const gradSpanStyle = gradOn ? {
    // backgroundImage (longhand) NOT `background`: the shorthand resets
    // background-clip when React patches it on rerender, which unclips the
    // gradient off the text (React warns background vs backgroundClip too).
    backgroundImage: `linear-gradient(${Number.isFinite(gradAngle) ? gradAngle : 180}deg, ${st.gradientColor1 || '#f5f5f4'}, ${st.gradientColor2 || '#93c5fd'})`,
    WebkitBackgroundClip: 'text',
    backgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
    color: 'transparent',
  } : null;
  if (st.layoutMode === 'ticker') {
    const dur = Math.max(2, Number(st.tickerSpeed) || 18);
    const rtl = st.tickerDir === 'rtl';
    const parts = lines.filter(l => l.trim().length);
    const content = parts.length ? parts.join('  ·  ') : (text || ' ');
    const segs = parseSegments(content);
    // The ticker is one continuous strip in a fixed-height bar, so size the
    // whole strip to its biggest run and let every run scale down from there —
    // otherwise a 1.6x word would clip against the bar.
    const tickerMax = segs.reduce((m, s) => Math.max(m, s.scale), 0) || 1;
    const runStyle = {
      fontSize: size * tickerMax,
      fontWeight: bold ? 700 : 400,
      fontStyle: st.italic ? 'italic' : 'normal',
      textDecoration: deco,
      letterSpacing: st.letterSpacing ? `${st.letterSpacing}px` : undefined,
      lineHeight: lh,
      color: gradOn ? undefined : (st.color || '#f5f5f4'),
      fontFamily: st.font || FONT_OPTIONS[0].value,
      WebkitTextStroke: st.outline && strokeW > 0 ? `${strokeW}px ${st.strokeColor || '#000000'}` : 'none',
      textShadow: shadowOn ? `${Number(st.shadowOffsetX) || 0}px ${Number(st.shadowOffsetY) || 0}px ${Number(st.shadowBlur) || 0}px ${st.shadowColor || '#000000'}` : 'none',
      background: st.highlight ? `rgba(70,45,15,${(st.hlOpacity ?? 40) / 100})` : 'transparent',
      borderRadius: 8,
      padding: st.highlight ? '3px 12px' : 0,
      whiteSpace: 'nowrap',
      boxSizing: 'border-box',
      flexShrink: 0,
      marginRight: 72,
    };
    return (
      <div style={{ width: '100%', height: '100%', overflow: 'hidden', display: 'flex', flexDirection: 'column', justifyContent: st.valign === 'top' ? 'flex-start' : st.valign === 'bottom' ? 'flex-end' : 'center', alignItems: 'flex-start', padding: pad, boxSizing: 'border-box' }}>
        <style>{'@keyframes kogTicker{from{transform:translateX(0)}to{transform:translateX(-50%)}}'}</style>
        <div style={{ display: 'flex', width: 'max-content', flexShrink: 0, willChange: 'transform', animation: `kogTicker ${dur}s linear infinite`, animationDirection: rtl ? 'reverse' : 'normal' }}>
          {[0, 1].map(i => (
            <span key={i} style={runStyle}>
              <span style={gradSpanStyle || undefined}>
                {segs.map((s, si) => runSpan(s, s.scale / tickerMax, si))}
              </span>
            </span>
          ))}
        </div>
      </div>
    );
  }
  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: st.valign === 'top' ? 'flex-start' : st.valign === 'bottom' ? 'flex-end' : 'center', alignItems: st.align === 'left' ? 'flex-start' : st.align === 'right' ? 'flex-end' : 'center', textAlign: st.align || 'center', padding: pad, boxSizing: 'border-box', overflow: 'hidden' }}>
      {lines.map((ln, li) => {
        const segs = parseSegments(ln);
        // A line box is exactly as tall as its biggest run, because that run
        // sets the strut. Put that size on the container and scale each run
        // DOWN from it — otherwise a fully small line still reserves a
        // full-size line box and leaves a dead gap above the big keyword.
        const lineMax = segs.reduce((m, s) => Math.max(m, s.scale), 0) || 1;
        const strokeOn = st.outline && strokeW > 0;
        return (
          <div key={li} style={{ display: 'inline-block', width: '100%', fontSize: size * lineMax, fontWeight: bold ? 700 : 400, fontStyle: st.italic ? 'italic' : 'normal', textDecoration: deco, letterSpacing: st.letterSpacing ? `${st.letterSpacing}px` : undefined, textAlignLast: isJustify ? 'justify' : undefined, lineHeight: lh, color: gradOn ? undefined : (st.color || '#f5f5f4'), fontFamily: st.font || FONT_OPTIONS[0].value, WebkitTextStroke: strokeOn ? `${strokeW}px ${st.strokeColor || '#000000'}` : 'none', textShadow: shadowOn ? `${Number(st.shadowOffsetX) || 0}px ${Number(st.shadowOffsetY) || 0}px ${Number(st.shadowBlur) || 0}px ${st.shadowColor || '#000000'}` : 'none', background: st.highlight ? `rgba(70,45,15,${(st.hlOpacity ?? 40) / 100})` : 'transparent', borderRadius: 8, padding: st.highlight ? '3px 12px' : 0, boxSizing: 'border-box', overflowWrap: 'break-word', wordBreak: 'break-word' }}>
            <span style={gradSpanStyle}>
              {segs.map((s, si) => runSpan(
                s,
                s.scale / lineMax,
                si,
                // Outline is in px, so a 0.55x run needs a 0.55x stroke or the
                // small lead line gets a chunky outline the big word doesn't.
                strokeOn && s.scale !== lineMax ? `${strokeW * (s.scale / lineMax)}px ${st.strokeColor || '#000000'}` : undefined
              ))}
            </span>
          </div>
        );
      })}
    </div>
  );
};
