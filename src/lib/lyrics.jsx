import React from 'react';
import { FONT_OPTIONS, transitionAnimation } from './constants';
import { normalizeGhost, textFxStyle } from './cinematic';

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
//   {mark=#fde047}                     highlighter behind the run (aliases: highlight, hl)
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
    } else if (k === 'mark' || k === 'highlight' || k === 'hl') {
      // Marker-pen background behind the run. Any CSS colour survives here
      // (hex is case-insensitive, so applyCaseTransform can't break it).
      out.mark = v;
    } else if (k === 'glow') {
      // {glow=#22d3ee} glows one word in that colour; {glow=1} rides the
      // slide's glow colour; {glow=off} clears it.
      const b = parseBool(v);
      if (b === false) out.glow = false;
      else if (b === true) out.glow = true;
      else out.glow = v;
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
// renderer "off" and "never mentioned" mean exactly the same thing. Weight /
// tracking compare EFFECTIVE values ({w=400} on default-bold text, {track=0}
// on untracked text) so identical-looking runs don't fragment into extra
// spans on every frame. Written out rather than looped because this runs for
// every adjacent pair of every line of every frame, on a machine that is
// already short of CPU.
const effWeight = (r) => (r.weight != null ? r.weight : (r.bold ? 700 : 400));
const effTrack = (r) => (r.track != null ? r.track : 0);
const sameRun = (a, b) => !!a.bold === !!b.bold
  && !!a.underline === !!b.underline
  && !!a.italic === !!b.italic
  && !!a.strike === !!b.strike
  && a.scale === b.scale && effWeight(a) === effWeight(b) && effTrack(a) === effTrack(b)
  && a.font === b.font && a.color === b.color && a.mark === b.mark && (a.glow || undefined) === (b.glow || undefined);

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
// Only real markers are stripped: a brace group whose body parses as style
// attributes (or is empty / `/`). A lyric that literally says `{thanks}` or
// `{choir}` keeps its words on stage, mobile and thumbnails instead of having
// them silently deleted.
const STRIP_KEYS = new Set(['size', 'scale', 'w', 'weight', 'track', 'ls', 'font', 'color', 'colour', 'glow']);
const isMarkerBody = (b) => {
  if (b === '' || b === '/') return true;
  for (const chunk of b.split(',')) {
    const kv = chunk.trim();
    if (!kv) continue;
    const eq = kv.indexOf('=');
    if (eq < 0) {
      // Bare flag ({bold}) or numeric shorthand ({0.55}); anything else is prose.
      if (BOOL_KEYS[kv.toLowerCase()]) continue;
      const n = parseFloat(kv);
      if (Number.isFinite(n) && n > 0) continue;
      return false;
    }
    // Unknown key=value ({foo=bar}) is prose too — the reader ignores it, so
    // stripping it here would delete words the renderer keeps.
    if (!STRIP_KEYS.has(kv.slice(0, eq).trim().toLowerCase())) return false;
  }
  return true;
};
const stripLine = (ln) => {
  const hadLead = /^[ \t]*\{[^{}\n]*\}/.test(ln);
  const out = ln.replace(/\{([^{}\n]*)\}/g, (m, body) => (isMarkerBody(String(body || '').trim()) ? '' : m))
    .replace(/\*\*([\s\S]+?)\*\*/g, '$1');
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
const SPAN_TEXT = ['font', 'color', 'glow', 'mark'];
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
  if (n.mark !== undefined) parts.push(`mark=${n.mark}`);
  if (n.glow !== undefined) parts.push(`glow=${n.glow === true ? 1 : n.glow}`);
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
      // No size found means leave the line alone: patching {scale:undefined}
      // would DELETE the size it already has.
      const end = matched ? sl.end : (tl.end / Math.max(1, tgtLen)) * srcLen;
      const v = profileAt(P, end, lo, hi);
      if (v !== undefined) spans = applySpanPatch(spans, tl.start, tl.end, { scale: v });
      continue;
    }
    if (!nS) {
      // The scope has no words to take a size off — one size fits all of it.
      const v = profileAt(P, sl.end, lo, hi);
      if (v !== undefined) spans = applySpanPatch(spans, tl.start, tl.end, { scale: v });
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
      if (ladder[k] !== undefined) spans = applySpanPatch(spans, from, to, { scale: ladder[k] });
    }
  }
  return emitSpans(ing.text, spans);
};

// One styled run. A run only becomes a <span> when it genuinely differs from
// its container — an unmarked line renders as a bare text node, so the DOM for
// every song written before this feature existed is byte-for-byte unchanged.
// `ratio` is s.scale / lineMax: the container carries lineMax as its own font
// size, so runs express themselves in `em` relative to it.
const runSpan = (s, ratio, key, stroke, under) => {
  // Run-level decoration/style, chosen without allocating: both replace whatever
  // the container had, and the useful direction is "this slide is plain, this
  // one word is underlined" — which is exactly what the selection chips produce.
  const deco = s.underline
    ? (s.strike ? 'underline line-through' : 'underline')
    : (s.strike ? 'line-through' : null);
  const italic = s.italic ? 'italic' : null;
  // Per-word glow: a child replaces the container's text-shadow for its own
  // glyphs, so the slide shadow is re-applied underneath the word's own glow.
  // glow=true rides the slide's glow colour; a colour value glows that word
  // alone even when the slide-level glow is off.
  const runGlowColor = s.glow === true ? (under && under.glowColor) : (s.glow || null);
  const runGlowBlur = (under && under.glowBlur) || 18;
  const runGlow = s.glow && runGlowColor
    ? `0 0 ${Math.max(2, Math.round(runGlowBlur / 3))}px ${runGlowColor}, 0 0 ${runGlowBlur}px ${runGlowColor}`
    : '';
  const runShadow = s.glow ? [under && under.shadow, runGlow].filter(Boolean).join(', ') : '';
  if (ratio === 1 && !s.weight && s.track == null && !s.font && !s.color && !s.mark && !s.glow && !deco && !italic) {
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
        // Marker-pen highlight behind the run. boxDecorationBreak keeps the
        // background on every wrapped fragment, not just the first box.
        background: s.mark || undefined,
        borderRadius: s.mark ? '0.3em' : undefined,
        padding: s.mark ? '0 0.2em' : undefined,
        boxDecorationBreak: s.mark ? 'clone' : undefined,
        WebkitBoxDecorationBreak: s.mark ? 'clone' : undefined,
        // Needed alongside `color` so a per-run colour survives a gradient,
        // whose parent span forces WebkitTextFillColor to transparent.
        WebkitTextFillColor: s.color || undefined,
        WebkitTextStroke: stroke,
        textShadow: runShadow || undefined,
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

// The default lyric size: what every cue without an explicit size renders at,
// and what the Size field, manual builder and both parsers create blocks with.
export const DEFAULT_LYRIC_SIZE = 120;

// Padding follows the font size: 120 → 12px, 400 → 40px. A fixed 10px gutter
// is fine at small sizes and claustrophobic once the type grows, so an unset
// pad derives from the size instead. An explicit cue.pad always wins.
export const autoPadForSize = (size) =>
  Math.round(Math.max(4, Math.min(80, (Number(size) || DEFAULT_LYRIC_SIZE) * 0.1)));

// A buffer can never swallow the box it lives in. Past ~40% of the box's own
// short side there is nothing left to set the words IN — they used to be
// squeezed into a zero-width strip and clipped instead of getting breathing
// room. Every surface resolves padding through this ceiling, so the number
// the sidebar shows is the number that actually draws.
export const padCeilingForBox = (box) => {
  const b = box || {};
  const w = Math.max(1, Number(b.w) || 1280);
  const h = Math.max(1, Number(b.h) || 640);
  return Math.max(0, Math.floor(Math.min(w, h) * 0.4));
};

export const clampPad = (pad, box) =>
  Math.max(0, Math.min(Math.round(Number(pad) || 0), padCeilingForBox(box)));

/**
 * THE padding a cue draws with — one answer for the renderer, the fitter and
 * the sidebar slider, so they can never disagree:
 *   • an EXPLICIT pad always wins, in every resize mode. Fill used to throw
 *     it away and hard-code 6px, which is why the slider did nothing the
 *     moment Resize was set to Fill.
 *   • no pad set → auto: it tracks the font size (so the gutter grows with
 *     the type), or a tight 6px in fill mode where the box drives the size.
 *   • whatever is asked for is then capped by the box (clampPad above).
 */
export const resolvePad = (st = {}, box = null) => {
  const b = box || {};
  const size = Math.max(FONT_SIZE_MIN, Math.min(Number(st.size) || DEFAULT_LYRIC_SIZE, FONT_SIZE_MAX));
  const asked = st.pad != null && st.pad !== '' && Number.isFinite(Number(st.pad)) ? Number(st.pad) : null;
  const want = asked != null ? asked : (st.fill ? 6 : autoPadForSize(size));
  return clampPad(want, { w: Number(b.w) || 1280, h: Number(b.h) || 640 });
};

// Box metrics shared by the renderer and by the editor's textarea, so the box
// you type into and the box that lands on the projector are sized identically.
// Null/zero boxes (bad drag, corrupt cue) fall back to stock instead of
// throwing on box.w or silently rendering at full-canvas size.
export const lyricsLayoutMetrics = (st, box) => {
  const b = box || {};
  const baseSize = Math.max(FONT_SIZE_MIN, Math.min(Number(st.size) || DEFAULT_LYRIC_SIZE, FONT_SIZE_MAX));
  const pad = resolvePad(st, box);
  // The REAL inner width. The old 200px floor could hand the fitter a row
  // WIDER than the padded area: at a big pad the words were measured as if
  // the buffer did not exist, wrapped as if it did not exist, and painted
  // straight over the padding. 1 keeps the wrap solver's divide safe.
  const boxW = Math.max(1, (Number(b.w) || 1280) - pad * 2 - (st.highlight ? 24 : 0));
  const boxH = Number(b.h) || 640;
  const maxH = Math.max(1, Math.min(boxH - pad * 2, 700));
  return { pad, boxW, boxH, baseSize, maxH };
};

// --- real glyph measurement ------------------------------------------------
// The old chars-per-line guess (0.55em per char) under-counts wraps on wide
// faces: "CMG Sans Wide" runs ~0.75em+, so a line it wrapped to 2 rows really
// draws as 3 — every box "fitted to its text" came out too short and the
// canvas (and the projector) clipped the top line, while the plain thumbnail,
// which ignores the box entirely, looked fine. Measure the actual glyph
// widths instead. Width scales linearly with font size for a face, so each
// string is measured ONCE at a reference size and scaled from there — after
// the first pass the fill solver's ~17 evaluations are pure arithmetic.
let _measureCtx = null;
const measureCtx = () => {
  if (typeof document === 'undefined') return null;
  if (!_measureCtx) _measureCtx = document.createElement('canvas').getContext('2d');
  return _measureCtx;
};

const MEASURE_REF_PX = 100;
let _measureGen = 0; // bumped when webfonts finish loading — invalidates all refs
const _measureCache = new Map(); // `${weight}|${style}|${family}|${text}` → width @100px

// Reference width of `text` at 100px, or null when there is no DOM to measure
// with — the caller then falls back to the old heuristic.
const measureRef = (text, weight, style, family) => {
  const ctx = measureCtx();
  if (!ctx || !text) return null;
  const key = `${weight}|${style}|${family}|${text}`;
  let ref = _measureCache.get(key);
  if (ref === undefined) {
    ctx.font = `${style ? `${style} ` : ''}${weight} ${MEASURE_REF_PX}px ${family}`;
    ref = ctx.measureText(text).width;
    if (_measureCache.size > 8000) _measureCache.clear();
    _measureCache.set(key, ref);
  }
  return ref;
};

// A face finishing its load changes every width measured with its fallback —
// drop the cache and every per-token reference in one go.
if (typeof document !== 'undefined' && document.fonts && document.fonts.addEventListener) {
  document.fonts.addEventListener('loadingdone', () => {
    _measureGen += 1;
    _measureCache.clear();
  });
}

// The ONE font size for the whole block: top-anchored at box.x/box.y, shrunk
// only when it overflows the box (or, in fill mode, scaled to use the full
// height). Inline runs are measured per line first:
//   maxScale — the biggest run, because that run sets the CSS line-box strut
//              and therefore how tall the line actually is.
//   tokens   — the line split into words and spaces with each run's scale,
//              face, weight and tracking, so wrapped rows can be counted
//              against the real glyph widths (measureRef above).
// Parsed OUTSIDE the closure below: the fill solver evaluates totalHeight ~17
// times and re-parsing per evaluation would multiply the cost for nothing.
const lineShape = (line) => {
  const segs = parseSegments(line);
  let maxScale = 0, chars = 0, weighted = 0;
  const tokens = [];
  for (const s of segs) {
    if (s.scale > maxScale) maxScale = s.scale;
    chars += s.t.length;
    weighted += s.t.length * s.scale;
    // Words and the spaces between them. A word can span runs (markup may
    // switch mid-word), so pieces stay separate — only spaces are break
    // opportunities, exactly like the browser's own line breaker.
    for (const part of s.t.split(/(\s+)/)) {
      if (!part) continue;
      if (/^\s+$/.test(part)) tokens.push({ sp: true, t: ' ', sc: s.scale || 1, f: s.font, w: s.weight, it: s.italic, tr: s.track, n: part.length });
      else tokens.push({ t: part, sc: s.scale || 1, f: s.font, w: s.weight, bold: s.bold, it: s.italic, tr: s.track, n: part.length });
    }
  }
  return {
    plain: segs.map((s) => s.t).join(''),
    maxScale: maxScale || 1,
    avgScale: chars ? weighted / chars : (maxScale || 1),
    tokens,
    _st: null, // style identity the token references were measured for
    _g: -1,    // measurement generation those references belong to
  };
};

// Wrapped row count for one line inside boxW at `base` px — greedy at spaces,
// where the browser breaks, with every piece measured in its own face, weight
// and scale. Falls back to the old chars-per-line heuristic only when there is
// no DOM to measure with (SSR/tests).
const wrapRows = (shape, boxW, base, st) => {
  const tokens = shape.tokens;
  const stKey = `${(st && st.font) || ''}\u0001${st && st.bold !== false ? 1 : 0}\u0001${st && st.italic ? 1 : 0}\u0001${(st && st.letterSpacing) || 0}`;
  if (shape._st !== stKey || shape._g !== _measureGen) {
    shape._st = stKey;
    shape._g = _measureGen;
    if (tokens) for (let i = 0; i < tokens.length; i++) tokens[i].ref = undefined;
  }
  const heuristic = () => {
    const cpl = Math.max(6, boxW / (base * shape.avgScale * 0.55));
    return Math.max(1, Math.ceil(shape.plain.length / cpl));
  };
  if (!tokens || !tokens.length) return 1;
  const ls = (st && Number(st.letterSpacing)) || 0;
  const cWeight = st && st.bold !== false ? 700 : 400;
  const cStyle = st && st.italic ? 'italic' : '';
  const cFamily = (st && st.font) || FONT_OPTIONS[0].value;

  let rows = 1; // the current (partly filled) row
  let cur = 0; // its used width
  let gapW = 0; // collapsed space waiting before the next word
  let wordW = 0; // width of the word currently assembling
  let open = false;

  // Place the finished word. A word that fits joins the current row; otherwise
  // it starts a fresh row and, if it is still wider than the line (break-word),
  // shatters across as many rows as it needs — an exact multiple leaves the
  // row full (cur = boxW), never empty, so the next word still wraps.
  const commit = () => {
    if (cur > 0 && cur + gapW + wordW <= boxW) { cur += gapW + wordW; }
    else {
      if (cur > 0) { rows += 1; cur = 0; }
      let rest = wordW;
      while (rest > boxW) { rows += 1; rest -= boxW; }
      cur = rest;
    }
    gapW = 0;
    wordW = 0;
    open = false;
  };

  for (let i = 0; i < tokens.length; i++) {
    const tk = tokens[i];
    const px = base * (tk.sc || 1);
    if (tk.ref === undefined) {
      const ref = measureRef(
        tk.t,
        tk.w != null ? tk.w : (tk.bold ? 700 : cWeight),
        tk.it ? 'italic' : cStyle,
        tk.f || cFamily,
      );
      if (ref == null) return heuristic();
      tk.ref = ref;
    }
    const w = (tk.ref * px) / MEASURE_REF_PX + tk.n * ((tk.tr != null ? tk.tr * px : 0) + ls);
    if (tk.sp) {
      if (open) commit();
      // Whitespace collapses: the widest single space wins.
      if (gapW < w) gapW = w;
    } else {
      wordW += w;
      open = true;
    }
  }
  if (open) commit();
  return rows;
};

// Rendered height of a block at `base` px inside boxW. Shared by the shrink
// pass below and by fitBoxToText, so "does it fit" is answered by ONE
// estimator — a box fitted by fitBoxToText is a box the renderer won't shrink.
const blockHeightAt = (shapes, boxW, lh, base, st) => shapes.reduce((h, l) => {
  if (!l.plain.trim()) return h + base * lh * 0.7;
  const wrapped = wrapRows(l, boxW, base, st);
  return h + wrapped * base * l.maxScale * lh;
}, 0);

export const computeLyricsFontSize = (text, st, box) => {
  const lh = st.lineHeight || 1.05;
  const { boxW, baseSize, maxH } = lyricsLayoutMetrics(st, box);
  const lines = (applyCaseTransform(text || '', st.caseMode || 'none')).split('\n');
  const shapes = lines.map(lineShape);
  const totalHeight = (base) => blockHeightAt(shapes, boxW, lh, base, st);
  if (st.fixedSize) return Math.round(baseSize);
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

/**
 * Grow/shrink a cue's BOX to its text at `size` — the inverse of the renderer's
 * shrink pass. Instead of the font being cut down to a fixed box (120 → 107px,
 * "why is my size ignored?"), the box becomes tall enough for the text to draw
 * at exactly the requested size; only content that genuinely exceeds the 720px
 * canvas falls back to the shrink pass, and that pass is a fit — never a cut.
 *
 * Keeps x/w/angle from the incoming box (placement stays yours), adjusts only
 * h and keeps the box's own vertical center (it grows/shrinks symmetrically
 * around where you put it). The height is measured against the real glyph
 * widths (wrapRows), so the fit is exact for any face — 6% slack covers line
 * box rounding and highlight padding. Fill mode is skipped: there the box
 * drives the size, not the other way round. Blank text returns the box
 * untouched.
 */
export const fitBoxToText = (text, st = {}, box) => {
  const cur = box || { x: 80, y: 100, w: 1120, h: 480 };
  if (st.fill) return cur;
  const shapes = (applyCaseTransform(text || '', st.caseMode || 'none')).split('\n').map(lineShape);
  if (!shapes.some(s => s.plain.trim())) return cur;
  const base = Math.max(FONT_SIZE_MIN, Math.min(Number(st.size) || DEFAULT_LYRIC_SIZE, FONT_SIZE_MAX));
  const lh = st.lineHeight || 1.05;
  // Same padding the renderer will use (explicit → auto → box-capped), and the
  // same real inner width — otherwise the fitted height was measured against a
  // box the words never actually get, and the bottom line came up clipped.
  const pad = resolvePad(st, cur);
  const w = Number(cur.w) || 1120;
  const boxW = Math.max(1, w - pad * 2 - (st.highlight ? 24 : 0));
  const need = blockHeightAt(shapes, boxW, lh, base, st) * 1.06 + pad * 2;
  const h = Math.round(Math.max(96, Math.min(700, need)));
  const centerY = (Number(cur.y) || 0) + (Number(cur.h) || 480) / 2;
  const y = Math.round(Math.max(10, Math.min(710 - h, centerY - h / 2)));
  return { ...cur, y, h };
};

/**
 * Typing variant: the box may GROW to keep new text visible at full size, but
 * never shrinks under the operator's hands — a box they deliberately made
 * compact (or resized, which already scales the font with it) stays compact
 * while they fix a typo.
 */
export const growBoxToText = (text, st = {}, box) => {
  const fitted = fitBoxToText(text, st, box);
  return fitted.h > (Number(box && box.h) || 0) ? fitted : box;
};

/**
 * Parse-time normalisation for BOTH parsers (Smart Auto-Paste and the manual
 * builder/split): give the block the default size and maximum coverage.
 *
 * Fresh parses carry no box — they get nearly the whole 1280×720 canvas, so
 * lyrics spread across the full projection at the full default size instead
 * of huddling in a corner. Cues that already HAVE a box (split chunks carry
 * their source's) keep the fitted behavior, so hand placement survives a
 * split and nothing ever shrinks under the operator.
 */
// Near-full canvas with a small overscan-safe margin.
export const PARSE_BOX = { x: 40, y: 32, w: 1200, h: 656 };
export const fitParsedCue = (cue) => {
  if (!cue || typeof cue !== 'object') return cue;
  const size = Number(cue.size) || DEFAULT_LYRIC_SIZE;
  if (!cue.box) return { ...cue, size, box: { ...PARSE_BOX } };
  // Face, weight, italic and tracking all move the wrap points — fitting
  // without them measured the wrong font and the box came out short.
  const st = {
    font: cue.font,
    size,
    lineHeight: cue.lineHeight,
    caseMode: cue.case,
    pad: cue.pad,
    bold: cue.bold,
    italic: cue.italic,
    letterSpacing: cue.letterSpacing,
    highlight: cue.highlight,
    fill: cue.resizeMode === 'fill',
  };
  return { ...cue, size, box: fitBoxToText(cue.text || '', st, cue.box) };
};

/**
 * LED-WALL LIFT — push a lyric box UP by canvas pixels so a band standing in
 * front of the bottom of the wall never covers the words.
 *
 * Pure offset in the shared 1280×720 output space (the same coordinates the
 * editor's box uses), clamped at the top edge so a lift can never push text
 * off the top of the wall — the operator can run it to the ceiling and no
 * further. No box and no lift means the box comes back untouched.
 */
export const LED_WALL_CANVAS = { w: 1280, h: 720 };
export const liftBox = (box, lift) => {
  const px = Number(lift) || 0;
  if (!px || !box) return box;
  const y = Number(box.y) || 0;
  const h = Number(box.h) || 0;
  // Never above the top edge; never so far that a box taller than the canvas
  // would be thrown clean off it either.
  const min = Math.min(0, LED_WALL_CANVAS.h - h - 40);
  return { ...box, y: Math.max(min, y - px) };
};

/**
 * The shared cue → lyric-style mapping: ONE place that decides how a cue
 * renders (face, size, padding, shadow, fill, box…). App's projector paths,
 * the slide grid and the editor's slide strip all build their style from this,
 * so a thumbnail can never drift from what the output draws.
 */
const LYRIC_BLEND_MODES = new Set(['normal', 'overlay', 'screen', 'soft-light', 'multiply', 'lighten', 'darken', 'color-dodge']);

export const cueLyricStyle = (cue) => ({
  font: cue?.font || FONT_OPTIONS[0].value,
  size: cue?.size != null ? cue.size : DEFAULT_LYRIC_SIZE,
  lineHeight: cue?.lineHeight || 1.05,
  align: cue?.align || 'center',
  color: cue?.color || '#f5f5f4',
  caseMode: cue?.case || 'none',
  bold: cue?.bold !== false,
  italic: !!cue?.italic,
  underline: !!cue?.underline,
  strike: !!cue?.strike,
  letterSpacing: Number(cue?.letterSpacing) || 0,
  valign: cue?.valign || 'middle',
  // A text box may be a solid foreground layer or a hollow "ghost" layer.
  // strokeOnly keeps the stroke but makes the fill see-through.
  strokeOnly: !!(cue?.strokeOnly),
  // 0–100 on the cue (the editor slider's units); 0–1 in the render style.
  opacity: cue?.opacity != null ? Math.min(1, Math.max(0, Number(cue.opacity) / 100)) : 1,
  blendMode: LYRIC_BLEND_MODES.has(cue?.blendMode) ? cue.blendMode : 'normal',
  // null = auto: padding derives from the font size in
  // lyricsLayoutMetrics, so the gutter grows with the type.
  pad: cue?.pad != null ? Number(cue.pad) : null,
  shadow: !!(cue?.shadow),
  shadowColor: cue?.shadowColor || '#000000',
  shadowBlur: cue?.shadowBlur != null ? Number(cue.shadowBlur) : 14,
  shadowOffsetX: cue?.shadowOffsetX != null ? Number(cue.shadowOffsetX) : 0,
  shadowOffsetY: cue?.shadowOffsetY != null ? Number(cue.shadowOffsetY) : 4,
  glow: !!(cue?.glow),
  glowColor: cue?.glowColor || '#22d3ee',
  glowBlur: cue?.glowBlur != null ? Number(cue.glowBlur) : 18,
  outline: !!(cue?.outline),
  strokeColor: cue?.strokeColor || '#000000',
  strokeWidth: cue?.strokeWidth != null ? Number(cue.strokeWidth) : 1.5,
  gradient: !!(cue?.gradient),
  gradientColor1: cue?.gradientColor1 || '#f5f5f4',
  gradientColor2: cue?.gradientColor2 || '#93c5fd',
  gradientAngle: cue?.gradientAngle != null ? Number(cue.gradientAngle) : 180,
  highlight: !!(cue?.highlight),
  hlOpacity: cue?.hlOpacity ?? 40,
  resizeMode: cue?.resizeMode === 'fill' ? 'fill' : cue?.resizeMode === 'scale' ? 'scale' : 'fit',
  fill: cue?.resizeMode === 'fill',
  // A watermark is an independent background layer: its Size slider must map
  // 1:1 to the drawn font size. Normal lyric boxes shrink to stay inside
  // their box; a ghost at 520px used to wrap, overflow, and get fitted back
  // down smaller than it was at 300px. fixedSize opts out of that fit.
  fixedSize: !!cue?.fixedSize,
  fillMax: cue?.fillMax != null ? Number(cue.fillMax) : 165,
  fillMin: cue?.fillMin != null ? Number(cue.fillMin) : 18,
  layoutMode: cue?.layoutMode === 'ticker' ? 'ticker' : 'static',
  tickerSpeed: cue?.tickerSpeed != null ? Number(cue.tickerSpeed) : 18,
  tickerDir: cue?.tickerDir === 'rtl' ? 'rtl' : 'ltr',
  box: cue?.box || { x: 80, y: 100, w: 1120, h: 480 },
  // TITLE CARD: the card id and its two lines travel WITH the lyric style, so
  // every surface that already receives style.lyric (projector, live previews)
  // can draw the framing without a second payload field to keep in sync.
  card: cue?.card || null,
  cardEvent: cue?.cardEvent || '',
  cardVenue: cue?.cardVenue || '',
});

/**
 * GHOST / WATERMARK LAYER — the huge hollow echo line behind the foreground.
 *
 * It is part of the cue (`cue.ghost`), so it travels with the slide through
 * style_json exactly like the extra text boxes. It renders through the SAME
 * cueLyricStyle → LyricsBlock chain, with outline on and fill off by default
 * (the Hollow toggle can fill it), which keeps the wall and editor identical.
 */
export const ghostLayerOf = (cue) => {
  const g = normalizeGhost(cue && cue.ghost);
  if (!g.on || !g.text.trim()) return null;
  const lyric = cueLyricStyle({
    font: g.font || cue?.font,
    size: g.size,
    lineHeight: g.lineHeight,
    letterSpacing: g.letterSpacing,
    align: g.align,
    valign: g.valign,
    case: g.case,
    bold: true,
    italic: false,
    color: g.color,
    shadow: false,
    glow: false,
    gradient: false,
    outline: true,
    strokeOnly: g.strokeOnly !== false,
    strokeColor: g.strokeColor,
    strokeWidth: g.strokeWidth,
    opacity: g.opacity,
    blendMode: g.blendMode,
    box: g.box,
    fixedSize: true,
  });
  return { text: g.text, lyric };
};

// Shared renderer: editor canvas, projector and live-output monitor all draw
// from this ONE function, so letter positions are identical everywhere — and
// so the inline run markup below only ever has to be implemented once.
export const renderLyricsLayout = (text, st, box, sizeOverride) => {
  const lines = (applyCaseTransform(text || '', st.caseMode || 'none')).split('\n');
  const lh = st.lineHeight || 1.05;
  const { pad } = lyricsLayoutMetrics(st, box);
  // `sizeOverride` is the browser-verified size from <LyricsBlock> below; the
  // estimate alone can be a hair optimistic at a wrap boundary.
  const size = sizeOverride != null ? sizeOverride : computeLyricsFontSize(text, st, box);
  const isJustify = st.align === 'justify';
  const bold = st.bold !== false;
  const deco = [st.underline ? 'underline' : null, st.strike ? 'line-through' : null].filter(Boolean).join(' ') || 'none';
  const strokeW = Number(st.strokeWidth) || 0;
  const shadowOn = !!st.shadow && ((Number(st.shadowBlur) || 0) > 0 || (Number(st.shadowOffsetX) || 0) !== 0 || (Number(st.shadowOffsetY) || 0) !== 0);
  const glowOn = !!st.glow && (Number(st.glowBlur) || 0) > 0;
  // Glow is a zero-offset colored blur stacked UNDER the shadow (first layer
  // paints on top), with a tight core pass so small text still reads.
  const glowLayers = glowOn ? `0 0 ${Math.max(2, Math.round((Number(st.glowBlur) || 18) / 3))}px ${st.glowColor || '#22d3ee'}, 0 0 ${Number(st.glowBlur) || 18}px ${st.glowColor || '#22d3ee'}` : '';
  const shadowLayer = shadowOn ? `${Number(st.shadowOffsetX) || 0}px ${Number(st.shadowOffsetY) || 0}px ${Number(st.shadowBlur) || 0}px ${st.shadowColor || '#000000'}` : '';
  const textShadow = [shadowLayer, glowLayers].filter(Boolean).join(', ') || 'none';
  // What glowing runs inherit from: the slide shadow stays under a word's own
  // glow, and glow=true rides the slide colour/strength.
  const runUnder = { shadow: shadowLayer, glowColor: st.glowColor || '#22d3ee', glowBlur: Number(st.glowBlur) || 18 };
  const gradOn = !!st.gradient;
  const gradAngle = Number(st.gradientAngle);
  // Hollow type: keep the outline, drop the fill. Only when a stroke actually
  // exists — strokeOnly with a zero stroke would render nothing at all.
  const hollow = !!st.strokeOnly && strokeW > 0;
  const rootFx = {
    opacity: st.opacity != null ? Math.min(1, Math.max(0, Number(st.opacity))) : 1,
    mixBlendMode: st.blendMode && st.blendMode !== 'normal' ? st.blendMode : undefined,
  };
  const gradSpanStyle = gradOn && !hollow ? {
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
      color: hollow ? 'transparent' : gradOn ? undefined : (st.color || '#f5f5f4'),
      WebkitTextFillColor: hollow ? 'transparent' : undefined,
      fontFamily: st.font || FONT_OPTIONS[0].value,
      // Chromium rejects the shorthand value `none` for -webkit-text-stroke,
      // so React cannot clear a previously painted outline with it. A zero
      // width is valid and always overwrites the old stroke.
      WebkitTextStroke: st.outline && strokeW > 0 ? `${strokeW}px ${st.strokeColor || '#000000'}` : '0px transparent',
      textShadow,
      background: st.highlight ? `rgba(70,45,15,${(st.hlOpacity ?? 40) / 100})` : 'transparent',
      borderRadius: 8,
      padding: st.highlight ? '3px 12px' : 0,
      whiteSpace: 'nowrap',
      boxSizing: 'border-box',
      flexShrink: 0,
      marginRight: 72,
    };
    return (
      <div style={{ width: '100%', height: '100%', overflow: 'hidden', display: 'flex', flexDirection: 'column', justifyContent: st.valign === 'top' ? 'flex-start' : st.valign === 'bottom' ? 'flex-end' : 'center', alignItems: 'flex-start', padding: pad, boxSizing: 'border-box', ...rootFx }}>
        <style>{'@keyframes kogTicker{from{transform:translateX(0)}to{transform:translateX(-50%)}}'}</style>
        <div style={{ display: 'flex', width: 'max-content', flexShrink: 0, willChange: 'transform', animation: `kogTicker ${dur}s linear infinite`, animationDirection: rtl ? 'reverse' : 'normal' }}>
          {[0, 1].map(i => (
            <span key={i} style={runStyle}>
              <span style={gradSpanStyle || undefined}>
                {segs.map((s, si) => runSpan(s, s.scale / tickerMax, si, undefined, runUnder))}
              </span>
            </span>
          ))}
        </div>
      </div>
    );
  }
  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: st.valign === 'top' ? 'flex-start' : st.valign === 'bottom' ? 'flex-end' : 'center', alignItems: st.align === 'left' ? 'flex-start' : st.align === 'right' ? 'flex-end' : 'center', textAlign: st.align || 'center', padding: pad, boxSizing: 'border-box', overflow: st.fixedSize ? 'visible' : 'hidden', ...rootFx }}>
      {lines.map((ln, li) => {
        const segs = parseSegments(ln);
        // A line box is exactly as tall as its biggest run, because that run
        // sets the strut. Put that size on the container and scale each run
        // DOWN from it — otherwise a fully small line still reserves a
        // full-size line box and leaves a dead gap above the big keyword.
        const lineMax = segs.reduce((m, s) => Math.max(m, s.scale), 0) || 1;
        const strokeOn = st.outline && strokeW > 0;
        return (
          <div key={li} style={{ display: 'inline-block', width: '100%', fontSize: size * lineMax, fontWeight: bold ? 700 : 400, fontStyle: st.italic ? 'italic' : 'normal', textDecoration: deco, letterSpacing: st.letterSpacing ? `${st.letterSpacing}px` : undefined, textAlignLast: isJustify ? 'justify' : undefined, lineHeight: lh, color: hollow ? 'transparent' : gradOn ? undefined : (st.color || '#f5f5f4'), WebkitTextFillColor: hollow ? 'transparent' : undefined, fontFamily: st.font || FONT_OPTIONS[0].value, WebkitTextStroke: strokeOn ? `${strokeW}px ${st.strokeColor || '#000000'}` : '0px transparent', textShadow, background: st.highlight ? `rgba(70,45,15,${(st.hlOpacity ?? 40) / 100})` : 'transparent', borderRadius: 8, padding: st.highlight ? '3px 12px' : 0, boxSizing: 'border-box', overflowWrap: 'break-word', wordBreak: 'break-word' }}>
            <span style={gradSpanStyle}>
              {segs.map((s, si) => runSpan(
                s,
                s.scale / lineMax,
                si,
                // Outline is in px, so a 0.55x run needs a 0.55x stroke or the
                // small lead line gets a chunky outline the big word doesn't.
                strokeOn && s.scale !== lineMax ? `${strokeW * (s.scale / lineMax)}px ${st.strokeColor || '#000000'}` : undefined,
                runUnder
              ))}
            </span>
          </div>
        );
      })}
    </div>
  );
};

// ---------------------------------------------------------------------------
// <LyricsBlock> — the wall/monitor renderer WITH a browser-verified fit.
//
// computeLyricsFontSize predicts height from canvas glyph widths. That is
// exact for most blocks, but right at a wrap boundary it can be one word (a
// whole row) optimistic — and because the box clips, the cost was the last
// line of a long verse silently losing its words. The browser's own layout is
// the only ground truth, so this component paints the estimated size, reads
// the REAL line boxes in a layout effect (before the frame is shown) and, on
// overflow, re-renders one step smaller until every row is inside the box.
//
// It also re-renders when a webfont finishes loading: the first paint of a
// face measures its fallback, so the estimate was made against the wrong
// glyph widths and nothing used to re-run it.
// ---------------------------------------------------------------------------
export const LyricsBlock = ({ text, st, box }) => {
  const hostRef = React.useRef(null);
  const seed = computeLyricsFontSize(text, st, box);
  const guessKey = [
    seed, text, box && box.w, box && box.h,
    st && st.font, st && st.lineHeight, st && st.align, st && st.valign,
    st && st.caseMode, st && st.highlight ? 1 : 0,
  ].join('\u0001');
  const [fit, setFit] = React.useState(null);
  const [fontEpoch, setFontEpoch] = React.useState(0);
  const size = fit && fit.key === guessKey + '\u0001' + fontEpoch ? fit.size : seed;

  React.useEffect(() => {
    if (typeof document === 'undefined' || !document.fonts) return undefined;
    let alive = true;
    const bump = () => { if (alive) setFontEpoch((n) => n + 1); };
    document.fonts.addEventListener('loadingdone', bump);
    if (document.fonts.ready) document.fonts.ready.then(bump).catch(() => {});
    return () => {
      alive = false;
      document.fonts.removeEventListener('loadingdone', bump);
    };
  }, []);

  React.useLayoutEffect(() => {
    // The ghost layer is an oversized watermark, not a fitted lyric box:
    // never measure it back down. Its Size slider is the source of truth.
    if (st && st.fixedSize) return;
    const host = hostRef.current;
    const cont = host && host.firstElementChild;
    if (!cont) return;
    const { pad } = lyricsLayoutMetrics(st, box);
    const cr = cont.getBoundingClientRect();
    // SCALE-NORMALISE the measurement. getBoundingClientRect() reports
    // SCREEN px, but `pad` and `size` are design px (1280x720 space) — and
    // every surface draws this canvas through a CSS transform scale that is
    // wildly different per surface: the wall ~1.5x (1920/1280), the console's
    // live-output card ~0.25x, slide-grid tiles even smaller. Comparing a
    // scaled height against an unscaled pad made the fit scale-dependent:
    // on the tiny preview card pad*2 ate a huge share of the measured
    // height, so the block shrank far more there than on the wall — the
    // monitor was NOT a picture of the output. Dividing every measurement
    // back through the element's own scale makes all surfaces compute the
    // identical design-px size, so the live card mirrors the wall exactly.
    // offsetWidth is layout px (transforms never touch it), so the ratio
    // recovers the transform scale. (A rotated box inflates its bounding
    // rect slightly — same as before this fix, and rare enough to accept.)
    const k = cont.offsetWidth > 0 && cr.width > 0 ? cr.width / cont.offsetWidth : 1;
    const kids = Array.from(cont.children);
    if (!kids.length) return;
    let top = Infinity;
    let bottom = -Infinity;
    for (const el of kids) {
      const r = el.getBoundingClientRect();
      if (!(r.height > 0)) continue;
      if (r.top < top) top = r.top;
      if (r.bottom > bottom) bottom = r.bottom;
    }
    if (!Number.isFinite(top) || !Number.isFinite(bottom)) return;
    // Everything below is in design px again — identical on wall, preview
    // card, editor canvas and thumbnails.
    const avail = cr.height / k - pad * 2;
    const used = (bottom - top) / k;
    const overflowing = used > avail + 0.5
      || (top - cr.top) / k < pad - 0.5
      || (bottom - cr.top) / k > cr.height / k - pad - 0.5;
    if (!overflowing) return;
    // Height scales with size for a fixed wrap; one correction is usually
    // enough and the next pass cleans up the rest. Never grow back here.
    const next = Math.max(8, Math.floor(size * ((avail - 1) / Math.max(1, used)) * 0.995));
    if (next < size) setFit({ key: guessKey + '\u0001' + fontEpoch, size: next });
  });

  return (
    <div ref={hostRef} style={{ width: '100%', height: '100%' }}>
      {renderLyricsLayout(text, st, box, size)}
    </div>
  );
};

// ---------------------------------------------------------------------------
// SLIDE TEXT LAYERS — every live surface draws a slide's text through THIS.
//
// The main lyric box first, then each extra text box in the slide's own order
// (see src/lib/songTextObjects.js). The projector and the console's
// live-output preview both call it, so the monitor is a true picture of the
// wall — and the wall is a true picture of the editor canvas, which draws
// the same boxes with the same renderer.
//
// `stretch` widens the design space sideways (the wall is wider than 16:9):
// the boxes spread and their type keeps its size, so the picture fills the
// screen without cropping a word and without distorting the letters.
//
// `animate` gives EVERY BOX ITS OWN ENTRANCE. The main box uses the slide's
// transition (the cue's own anim/speed, i.e. the main text box), while each
// extra box reads the transition stored on that object. `animKey` remounts the
// inner wrappers when a new slide is fired so a CSS animation restarts instead
// of sitting already-finished on the next cue. Static surfaces (tiles, editor
// thumbs, "up next") leave animate off and never pay for keyframes.
// ---------------------------------------------------------------------------
export const SlideTextLayers = ({ style, text, st, lift = 0, stretch = 1, animate = false, animKey = 'slide' }) => {
  const mainSt = st || (style && style.lyric) || null;
  if (!mainSt) return null;
  const k = Number(stretch) || 1;
  const widen = (b) => (k === 1 ? b : { ...b, x: Math.round(b.x * k), w: Math.round(b.w * k) });
  const mainBox = widen(liftBox(mainSt.box || { x: 80, y: 100, w: 1120, h: 480 }, lift));
  const ghost = style && style.ghost ? style.ghost : null;
  const gb = ghost && ghost.lyric ? widen(liftBox(ghost.lyric.box || { x: 64, y: 170, w: 1152, h: 380 }, lift)) : null;
  const animCss = (tr) => {
    if (!animate || !tr) return '';
    return transitionAnimation(tr.anim, tr.transDuration || tr.speed);
  };
  const slideTr = {
    anim: (style && (style.transition || style.anim)) || 'none',
    speed: style && style.speed,
    transDuration: 0,
  };
  const animated = (key, css, node) => (
    animate ? (
      <div key={key} style={{ width: '100%', height: '100%', animation: css || undefined }}>
        {node}
      </div>
    ) : node
  );
  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', ...textFxStyle(style && style.fx) }}>
      {/* Watermark first: it is the BACKGROUND text layer, behind everything. */}
      {ghost && gb && (
        <div style={{ position: 'absolute', left: gb.x, top: gb.y, width: gb.w, height: gb.h, transform: gb.angle ? `rotate(${gb.angle}deg)` : undefined, transformOrigin: 'center center' }}>
          {animated(`ghost-${animKey}`, animCss(slideTr), <LyricsBlock text={ghost.text || ''} st={ghost.lyric} box={gb} />)}
        </div>
      )}
      <div style={{ position: 'absolute', left: mainBox.x, top: mainBox.y, width: mainBox.w, height: mainBox.h, transform: mainBox.angle ? `rotate(${mainBox.angle}deg)` : undefined, transformOrigin: 'center center' }}>
        {animated(`main-${animKey}`, animCss(slideTr), <LyricsBlock text={text || ''} st={mainSt} box={mainBox} />)}
      </div>
      {((style && style.texts) || []).map((t, i) => {
        const tl = t && t.lyric ? t.lyric : null;
        if (!tl) return null;
        const tb = widen(liftBox(tl.box || { x: 80, y: 100, w: 1120, h: 480 }, lift));
        const tr = (t && t.transition) || slideTr;
        return (
          <div key={`tx-${i}`} style={{ position: 'absolute', left: tb.x, top: tb.y, width: tb.w, height: tb.h, transform: tb.angle ? `rotate(${tb.angle}deg)` : undefined, transformOrigin: 'center center' }}>
            {animated(`tx-${i}-${animKey}`, animCss(tr), <LyricsBlock text={t.text || ''} st={tl} box={tb} />)}
          </div>
        );
      })}
    </div>
  );
};

