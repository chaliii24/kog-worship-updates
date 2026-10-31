import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Stage, Layer, Group, Rect, Transformer } from 'react-konva';
import { renderLyricsLayout, cueLyricStyle, LyricsBlock, computeLyricsFontSize, lyricsLayoutMetrics, FONT_SIZE_MIN, FONT_SIZE_MAX, LINE_SCALE_PRESETS, ingestSpans, emitSpans, remapSpans, applySpanPatch, rangeAttrs, spanCovers, lineSpanRange, lineIndexAt } from '../lib/lyrics';
import { transitionAnimation, FONT_OPTIONS } from '../lib/constants';
import { bgFitCss } from '../lib/backgrounds';
import AnimatedBg from './AnimatedBg';
import { CinematicBackdrop, CinematicOverlay, CinematicText } from './CinematicLayer';
import TitleCardChrome from './TitleCardChrome';
import {
  SLIDE_WIDTH,
  SLIDE_HEIGHT,
  MIN_BOX_W,
  MIN_BOX_H,
  DEFAULT_BOX as CANONICAL_DEFAULT_BOX,
  normalizeBox,
  boxToCss,
  boxFitsCanvas,
  boxFromKonvaNode,
  applyBoxToKonvaNode,
  clientToSlide,
  topBoxAt as topBoxIndexAt,
  // THE fit — the very same helper the projector output runs (see the stage
  // contain-fit below), so the editor preview and the live wall can never
  // scale the design differently.
  designCanvasInFrame,
} from '../lib/slideGeometry';
import { useSongEditorStore } from '../store/useSongEditorStore';

const CANVAS_W = SLIDE_WIDTH;
const CANVAS_H = SLIDE_HEIGHT;
const ACCENT = '#00aaff';
// A text box goes wherever the operator puts it — including past the edge of
// the slide. There used to be two walls (a live clamp while dragging, and a
// Transformer bound that refused to grow a box off-canvas); both punished
// deliberate placement, so they are gone. What protects the operator now is
// the OFF-SLIDE badge below, which says out loud that whatever hangs over the
// edge will be clipped on the wall.

const DEFAULT_BOX = CANONICAL_DEFAULT_BOX;

// The inline-style half of the chip row: [key, label, tooltip label].
const STYLE_TOGGLES = [
  ['bold', 'B', 'Bold'],
  ['italic', 'I', 'Italic'],
  ['underline', 'U', 'Underline'],
  ['strike', 'S', 'Strikethrough'],
  ['glow', '✦', 'Glow'],
];

// Inline run styling. The chip row already owns size + B/I/U/S/glow; these add
// the two controls operators ask for next — a face and a colour for ONE word
// (or one line) without changing the rest of the slide. Buttons only, because
// the textarea must keep focus for the highlight to survive the click.
const SEL_COLORS = ['#ffffff', '#fde68a', '#FF8A8A', '#a5f3fc', '#FFC72C', '#86efac'];
const SEL_FONTS = [
  FONT_OPTIONS.find((f) => f.label === 'CMG Sans Wide (Default)'),
  FONT_OPTIONS.find((f) => f.label === 'CMG Sans CAPS'),
  FONT_OPTIONS.find((f) => f.label === 'CMG Sans Condensed'),
  FONT_OPTIONS.find((f) => f.label === 'CMG Sans Rounded'),
  FONT_OPTIONS.find((f) => f.label === 'Cinzel Decorative'),
].filter(Boolean);

// ---------------------------------------------------------------------------
// WYSIWYG caret bridge
//
// While the box is being typed into, z1 draws the preview renderer itself on
// the live (uncommitted) text, so the picture you type into and the picture
// that goes to output are the same one. The caret still lives in the textarea
// underneath — that is what keeps native undo, IME and every browser-handled
// key working for free. These translate between textarea character offsets and
// rectangles in the rendered layer, so the caret lands on the glyph it edits:
// the two layouts disagree the moment a line is scaled.
//
// The renderer writes one element per source line and no '\n' text, so the
// newline between lines has to be counted by hand.
// ---------------------------------------------------------------------------

const lineElsOf = (root) => {
  const outer = root ? root.firstElementChild : null;
  return outer ? Array.prototype.slice.call(outer.children) : [];
};

// One pass over the rendered layer: every line with the textarea offset it
// starts at, plus every text run with the offset its first character has.
const layoutIndex = (root) => {
  const lines = [];
  const runs = [];
  let acc = 0;
  const els = lineElsOf(root);
  for (let i = 0; i < els.length; i++) {
    const el = els[i];
    lines.push({ el, start: acc, len: (el.textContent || '').length });
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    let n;
    while ((n = walker.nextNode())) {
      if (n.nodeValue.length) runs.push({ node: n, start: acc });
      acc += n.nodeValue.length;
    }
    acc += 1; // the '\n' that follows this line
  }
  return { lines, runs };
};

// A caret sitting ON the '\n' belongs at the end of the line it came from.
const lineForOffset = (lines, off) => {
  for (let i = 0; i < lines.length; i++) {
    if (off <= lines[i].start + lines[i].len) return i;
  }
  return lines.length - 1;
};

const textTotal = (lines) => (lines.length ? lines[lines.length - 1].start + lines[lines.length - 1].len : 0);

// Where an EMPTY line's text would start, which is where its caret belongs:
// the renderer puts alignment on the block, so it has to be read off the
// parent (it is an inline style there, no getComputedStyle needed).
const emptyLineX = (lineEl) => {
  const b = lineEl.getBoundingClientRect();
  const align = lineEl.parentElement ? lineEl.parentElement.style.textAlign : '';
  return {
    rect: b,
    x: align === 'right' ? b.right - 1 : align === 'center' ? b.left + b.width / 2 : b.left + 1,
  };
};

const posAtOffset = (runs, off) => {
  for (let i = 0; i < runs.length; i++) {
    const len = runs[i].node.nodeValue.length;
    if (off < runs[i].start + len) {
      const offset = off - runs[i].start;
      // Negative means the offset points at an EMPTY line, which has no text
      // node to stand in for it — the caller parks the caret on the line box.
      return offset < 0 ? null : { node: runs[i].node, offset };
    }
    if (off === runs[i].start + len) {
      // Exactly on a boundary: prefer the next run when it continues the same
      // line, so a caret at a wrap point takes the NEXT character's leading
      // edge — the row that character actually landed on.
      const next = runs[i + 1];
      if (next && next.start === off) return { node: next.node, offset: 0 };
      return { node: runs[i].node, offset: len };
    }
  }
  return null;
};

// The LEFT edge of the character the caret precedes, so at a wrap point it
// sits at the start of the row that character landed in. End of line hangs it
// off the right edge of the last character instead.
const caretRect = (idx, off) => {
  const { lines, runs } = idx;
  if (!lines.length) return null;
  const line = lines[lineForOffset(lines, off)];
  const p = posAtOffset(runs, off);
  if (p) {
    const r = document.createRange();
    if (p.offset < p.node.nodeValue.length) {
      r.setStart(p.node, p.offset);
      r.setEnd(p.node, p.offset + 1);
      const rr = r.getClientRects()[0];
      if (rr && rr.height) return { left: rr.left, top: rr.top, height: rr.height };
    } else if (p.offset > 0) {
      r.setStart(p.node, p.offset - 1);
      r.setEnd(p.node, p.offset);
      const rr = r.getClientRects()[0];
      if (rr && rr.height) return { left: rr.right, top: rr.top, height: rr.height };
    }
  }
  if (line && !line.len) {
    // An empty line has no characters to measure: put the caret where its
    // text would start, the way the renderer would centre or flush it.
    const e = emptyLineX(line.el);
    return { left: e.x, top: e.rect.top, height: e.rect.height || 14 };
  }
  return null;
};

// One strip per line the range touches — a Range spanning the '\n' would have
// nowhere to put the gap between the two rows it crosses.
const selectionRects = (idx, from, to) => {
  const out = [];
  const { lines, runs } = idx;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const a = Math.max(from, line.start);
    const b = Math.min(to, line.start + line.len);
    if (b < a) continue;
    if (b === a) {
      // Only this line's newline is selected: an empty line still deserves a
      // mark, a non-empty one has nothing between its text and the next row.
      if (!line.len && from <= line.start && to > line.start) {
        const e = emptyLineX(line.el);
        out.push({ left: e.x - 1, top: e.rect.top, width: 2, height: e.rect.height || 14 });
      }
      continue;
    }
    const pa = posAtOffset(runs, a);
    const pb = posAtOffset(runs, b);
    if (!pa || !pb) continue;
    try {
      const r = document.createRange();
      r.setStart(pa.node, pa.offset);
      r.setEnd(pb.node, pb.offset);
      const rects = r.getClientRects();
      for (let j = 0; j < rects.length; j++) {
        const rr = rects[j];
        if (rr.width && rr.height) out.push({ left: rr.left, top: rr.top, width: rr.width, height: rr.height });
      }
    } catch (_) { /* endpoints stopped lining up — skip that strip */ }
  }
  return out;
};

// Which character sits under a screen point, so a click lands on the glyph you
// aimed at instead of wherever the textarea's own (differently scaled) layout
// would have put it.
const offsetFromPoint = (idx, x, y) => {
  const { lines, runs } = idx;
  const total = textTotal(lines);
  if (!lines.length) return 0;
  // An empty line has no text node to hit, so test the blank rows first: a
  // click on one has to land ON that row, not on whatever text follows it.
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].len) continue;
    const b = lines[i].el.getBoundingClientRect();
    if (b.height && y >= b.top - 1 && y <= b.bottom + 1) return Math.min(total, lines[i].start);
  }
  if (!runs.length) {
    // Nothing but empty lines and the point was clear of all of them — take
    // the nearest row, and the same offset for all of them anyway.
    let best = lines[0];
    let bestD = Infinity;
    for (let i = 0; i < lines.length; i++) {
      const b = lines[i].el.getBoundingClientRect();
      const d = Math.abs(y - (b.top + b.height / 2));
      if (d < bestD) { bestD = d; best = lines[i]; }
    }
    return Math.min(total, best.start);
  }
  // Every rendered row (a wrapped line contributes several).
  const rows = [];
  for (let i = 0; i < runs.length; i++) {
    const r = document.createRange();
    r.selectNodeContents(runs[i].node);
    const rects = r.getClientRects();
    for (let j = 0; j < rects.length; j++) {
      if (rects[j].height) rows.push({ run: runs[i], rect: rects[j] });
    }
  }
  if (!rows.length) return 0;
  // 1) the visual row the point is on. A press near a row boundary — or in
  // the gap between two rows — falls in the tolerance of TWO rows at once,
  // and breaking that tie by document order handed the click to the line
  // ABOVE (aiming at a short centred line lit the wide line over it).
  // Nearest row centre wins instead, and a row containing the point always
  // beats one that is merely nearby.
  let chosenRect = null;
  {
    let nearD = Infinity;
    let inEntry = null;
    let inD = Infinity;
    for (let i = 0; i < rows.length; i++) {
      const rc = rows[i].rect;
      const d = Math.abs(y - (rc.top + rc.height / 2));
      if (d < nearD) { nearD = d; chosenRect = rows[i]; }
      if (y >= rc.top - 1 && y <= rc.bottom + 1 && d < inD) { inD = d; inEntry = rows[i]; }
    }
    if (inEntry) chosenRect = inEntry;
  }
  // 2) ... then which run on THAT row the point actually falls inside. Only
  // segments sharing the row may answer, so a wide neighbouring line can no
  // longer win on x when the point sits inside a short centred row.
  const onLine = rows.filter((r) => r.rect.bottom > chosenRect.rect.top - 1 && r.rect.top < chosenRect.rect.bottom + 1);
  let chosen = onLine[0] || chosenRect;
  {
    let bd = Infinity;
    for (let i = 0; i < onLine.length; i++) {
      const r = onLine[i].rect;
      const d = x >= r.left - 1 && x <= r.right + 1 ? 0 : Math.abs(x - (r.left + r.width / 2));
      if (d < bd) { bd = d; chosen = onLine[i]; }
    }
  }
  // 3) walk that run's characters to the exact boundary.
  const node = chosen.run.node;
  const len = node.nodeValue.length;
  let off = null;
  const r = document.createRange();
  for (let i = 0; i < len; i++) {
    r.setStart(node, i);
    r.setEnd(node, i + 1);
    const cr = r.getClientRects()[0];
    if (!cr || !cr.height) continue;
    // Flow is forward: once a character drops below the chosen row, the rest
    // of this run wrapped further down and is no longer ours.
    if (cr.top > chosen.rect.top + chosen.rect.height * 0.5) break;
    if (!(cr.bottom > chosen.rect.top && cr.top < chosen.rect.bottom)) continue;
    if (x <= cr.left + cr.width / 2) { off = chosen.run.start + i; break; }
    off = chosen.run.start + i + 1;
  }
  if (off == null) off = chosen.run.start;
  return Math.max(0, Math.min(total, off));
};

// ---- what a press should select -------------------------------------------
// Deliberately GONE: a custom hit-tester used to turn every press and drag
// into text offsets by measuring the rendered glyphs, and it kept landing a
// line off on multi-line cues. The textarea holds the exact same string the
// renderer draws (same font, size, width, padding, alignment), so the
// browser's own selection IS the mapping — press, drag, double-click a
// word, triple-click a line and Shift+click all come free, pixel-accurate,
// with zero measuring. offsetFromPoint survives only for presses that miss
// the textarea entirely (the empty box area around centred text).

/**
 * WYSIWYG lyric-box editor.
 *
 * Layer stack (bottom -> top):
 *   z0 background (colour / image / video)
 *   z1 the ACTUAL lyrics, rendered by renderLyricsLayout — the exact same
 *      function the projector and live monitor use, so what you see here is
 *      literally what goes to output. While typing it renders the LIVE text
 *      (taText/taSpans), so the edit view and the preview are one picture.
 *   z2 a transparent Konva stage holding an invisible hit-rect + <Transformer>
 *      (drag / 8 resize handles / rotate) — interaction only, draws nothing
 *   z3 a real <textarea> overlay, shown only while typing. While typing it is
 *      text-invisible: it is the input engine (keystrokes can never be
 *      swallowed, native undo/IME come free) and z1 supplies the picture.
 *      It is ALSO the selection engine: it carries the same string, font,
 *      size, width, padding and alignment as z1, so the browser's native
 *      press/drag/double-click/triple-click/Shift+click selection breaks
 *      lines exactly where the glyphs break — no custom hit-testing.
 *   z4 mode badges + the "Edit text" chip
 *   z5 the caret + selection, measured off z1's rendered glyphs
 *
 * Text entry is a native textarea, so keystrokes can never be swallowed, and
 * geometry lives in React state so the box simply stays where you drop it.
 */
export default function LyricsCanvasEditor({
  text = '',
  fontFamily = '"CMG Sans Wide", "CMG Sans", sans-serif',
  fontSize = 110,
  fontColor = '#ffffff',
  textAlign = 'center',
  lineHeight = 1.05,
  letterSpacing = 0,
  strokeColor = '#000000',
  strokeWidth = 1.5,
  shadowColor = '#000000',
  shadowBlur = 14,
  shadowOffsetX = 0,
  shadowOffsetY = 4,
  glow = false,
  glowColor = '#22d3ee',
  glowBlur = 18,
  gradient = false,
  gradientColor1 = '#f5f5f4',
  gradientColor2 = '#93c5fd',
  gradientAngle = 180,
  box: boxProp = DEFAULT_BOX,
  bgType = 'color',
  bgValue = '#000000',
  // Cinematic preview: the SAME cue fields the projector receives, so the
  // editor canvas is a true picture of the wall.
  fx = null,
  bgFx = null,
  bgDim = 0,
  bgFit = 'cover',
  ghost = null,
  // The cue's own style, straight from cueLyricStyle — see the merge on
  // `lyricSt` below. Optional, so any caller that does not pass it renders
  // from the individual props exactly as before.
  lyricStyle = null,
  // Title-card framing (rules + artist/event/venue lines) for the song's
  // opening slide. Drawn under the words on the same 1280x720 canvas the wall
  // uses, so the operator sees the finished card while editing it.
  card = null,
  cardArtist = '',
  cardEvent = '',
  cardVenue = '',
  onTextChange,
  onBoxChange,
  onSizeChange,
  // --- multiple text boxes -------------------------------------------------
  // `objects` is EVERY box on the slide — index 0 is the main lyric, 1..n the
  // extras. The ACTIVE one is NOT drawn from this array: it is drawn by the
  // single-box machinery above (its text/style/box arrive as the ordinary
  // props), so the textarea, handles and chips all operate on whatever box is
  // selected. The inactive ones render read-only below and become active on
  // click.
  objects = [],
  activeObj = 0,
  onSelectObj,
  onObjBoxChange,
  // Imperative handle for the song editor's Typography panel, plus a report of
  // what the caret/selection currently covers so those buttons can show their
  // own state instead of the whole slide's.
  apiRef = null,
  onSelectionChange,
  cueLocked = false,
  highlight = false,
  hlOpacity = 40,
  caseMode = 'none',
  bold = true,
  italic = false,
  underline = false,
  strike = false,
  valign = 'middle',
  // No default: undefined keeps pad on AUTO — lyricsLayoutMetrics derives it
  // from the font size, matching what the projector does with the same cue.
  pad,
  fill = false,
  fillMax = 165,
  fillMin = 18,
  layoutMode = 'static',
  tickerSpeed = 18,
  tickerDir = 'ltr',
  resizeMode = 'fit',
  previewAnim = null,
  previewTick = 0,
  previewSpeed = 0.5,
}) {
  const box = boxProp || DEFAULT_BOX;
  const angle = box.angle || 0;

  const wrapRef = useRef(null);
  const displayBoxRef = useRef(null);
  const editBoxRef = useRef(null);
  const taRef = useRef(null);
  const groupRef = useRef(null);
  const trRef = useRef(null);
  const committedRef = useRef(box);
  const startBoxRef = useRef(box);
  // Latched while a drag/transform is running: mid-gesture React re-renders
  // must not write stale box geometry back over the live gesture.
  const gestureRef = useRef(false);

  const [scale, setScale] = useState(1);
  const [editing, setEditing] = useState(false);
  const [trNode, setTrNode] = useState(null);

  // Canvas text metrics are measured with the real face. If a face finishes
  // loading after the first paint, the cached widths and the textarea's own
  // wrap would otherwise stay on the fallback font until some unrelated
  // render. This bump gives the whole editor one deterministic re-measure.
  const [, setFontEpoch] = useState(0);
  useEffect(() => {
    if (typeof document === 'undefined' || !document.fonts) return undefined;
    let alive = true;
    const bump = () => { if (alive) setFontEpoch((n) => n + 1); };
    document.fonts.addEventListener?.('loadingdone', bump);
    document.fonts.ready?.then(bump).catch(() => {});
    return () => {
      alive = false;
      document.fonts.removeEventListener?.('loadingdone', bump);
    };
  }, []);

  // Typing commits to App state on a 150ms trailing edge. Every keystroke used
  // to round-trip setEditingSong → full-app re-render (plain-object context),
  // re-rendering the entire song grid underneath — the main typing lag with a
  // song loaded. The textarea stays local = zero-latency typing.
  // The textarea edits MARKER-FREE text. `{size=0.55}` lives in cue.text but
  // must never be visible in the box the volunteer is typing into — that was
  // the bug. ingestSpans splits cue.text into the clean string plus the
  // parallel `taSpans` array the chips write to; emitSpans splices the markers
  // back when we commit.
  const [seed] = useState(() => ingestSpans(text));
  const [taText, setTaText] = useState(seed.text);
  const [taSpans, setTaSpans] = useState(seed.spans);
  const taTimerRef = useRef(null);
  const taPendingRef = useRef(null);
  const taExpectedRef = useRef(text);
  const onTextChangeRef = useRef(onTextChange);
  onTextChangeRef.current = onTextChange;
  const sendTa = () => {
    if (taTimerRef.current) { clearTimeout(taTimerRef.current); taTimerRef.current = null; }
    const v = taPendingRef.current;
    if (v == null || v === taExpectedRef.current) return;
    taPendingRef.current = null;
    taExpectedRef.current = v;
    onTextChangeRef.current?.(v);
  };
  useEffect(() => {
    // External text change (switched slide, AI rebuild): pending local edits
    // belong to the OLD text — drop them and adopt the new value. When the
    // change matches our own last commit, do nothing (keeps newer local text).
    if (text !== taExpectedRef.current) {
      if (taTimerRef.current) { clearTimeout(taTimerRef.current); taTimerRef.current = null; }
      taPendingRef.current = null;
      taExpectedRef.current = text;
      const ing = ingestSpans(text);
      setTaText(ing.text);
      setTaSpans(ing.spans);
      // A new slide or an AI rebuild invalidates the old highlight.
      setSel({ start: 0, end: 0 });
      if (editing) {
        // Switching to ANOTHER TEXT BOX while typing: the textarea keeps its
        // focus, so the caret would otherwise stay pinned where the OLD text
        // ended. Park it at the end of the new box's text once React paints.
        requestAnimationFrame(() => {
          const ta = taRef.current;
          if (!ta) return;
          const n = ta.value.length;
          try { ta.setSelectionRange(n, n); } catch (_) { /* noop */ }
          setSel({ start: n, end: n });
        });
      }
    }
  }, [text]);
  useEffect(() => () => sendTa(), []);

  // ---- chip row: line scale + inline (selection) typography ---------------
  // `sel` tracks the textarea's caret/selection so the row can say what it
  // would act on. `onSelect` covers every natural caret move; a chip leaves the
  // selection where it was, so there is nothing to restore.
  const [sel, setSel] = useState({ start: 0, end: 0 });
  const hasSel = sel.end > sel.start;
  // The target is the highlighted range when there is one, and otherwise the
  // whole line under the caret — so every control in the row works on a
  // selection without needing a second set of buttons.
  const [tgtFrom, tgtTo] = hasSel
    ? [sel.start, sel.end]
    : lineSpanRange(taText, lineIndexAt(taText, sel.start));
  const tgtOn = (k) => spanCovers(taSpans, tgtFrom, tgtTo, k);
  const tgtScale = tgtOn('scale') ? (rangeAttrs(taSpans, tgtFrom, tgtTo).scale ?? 1) : 1;
  const tgtAttrs = rangeAttrs(taSpans, tgtFrom, tgtTo);
  const tgtTrack = Number(tgtAttrs.track) || 0;
  const cycleSelFont = () => {
    const at = SEL_FONTS.findIndex((f) => f.value === tgtAttrs.font);
    const next = SEL_FONTS[(at + 1) % SEL_FONTS.length];
    if (next) applyStyle({ font: next.value });
  };
  const nudgeSelTrack = (dir) => {
    const next = Math.max(-0.2, Math.min(1.2, Math.round((tgtTrack + dir * 0.1) * 100) / 100));
    applyStyle({ track: next || false });
  };
  const clearSelStyle = () => applyStyle({ scale: false, weight: false, track: false, font: false, color: false, glow: false, mark: false, bold: false, underline: false, italic: false, strike: false });

  // A chip never edits the string — only the parallel span array — so no
  // character is inserted, the caret cannot move, and there is nothing for the
  // next keystroke to land inside of. It still has to read the textarea's own
  // (possibly uncommitted) text rather than the `text` prop, or it would drop
  // the last 150ms of typing.
  //
  // Span writes go through a ref mirror, not the render-scope `taSpans`: two
  // chips clicked back-to-back (sidebar B then canvas I, sidebar glow then a
  // chip) otherwise compute the second patch from the pre-first array and the
  // first patch is silently lost.
  const taSpansRef = useRef(null);
  taSpansRef.current = taSpans;
  const applyStyle = (patch) => {
    const ta = taRef.current;
    const value = ta ? ta.value : taText;
    const start = ta ? (ta.selectionStart ?? sel.start) : sel.start;
    const end = ta ? (ta.selectionEnd ?? start) : sel.end;
    let from = start;
    let to = end;
    if (!(to > from)) [from, to] = lineSpanRange(value, lineIndexAt(value, start));
    applyStyleToRange(patch, from, to);
    setSel({ start, end });
  };

  // Explicit-range twin: sidebar controls (e.g. the glow colour swatch) blur
  // the textarea — onBlur ends edit mode and wipes the live selection — so by
  // the time their onChange fires there is no selection left to read. Callers
  // pass the offsets they latched while the highlight was still alive.
  const applyStyleToRange = (patch, from, to) => {
    const ta = taRef.current;
    const value = ta ? ta.value : taText;
    const spans = applySpanPatch(taSpansRef.current || [], from, to, patch);
    setTaSpans(spans);
    taPendingRef.current = emitSpans(value, spans);
    sendTa();
  };

  // Drag-preview for the slide glow colour: the sidebar swatch paints here per
  // input event WITHOUT committing to the cue, so a drag never round-trips
  // setEditingSong → full-app re-render + all slide thumbs per tick. rAF
  // coalesces the event storm to one canvas-only repaint per frame; the dialog
  // close (onChange) commits for real.
  const glowPrevRef = useRef(null);
  const glowRafRef = useRef(0);
  const [glowPrev, setGlowPrev] = useState(null);
  const previewGlow = (color) => {
    glowPrevRef.current = color;
    if (glowRafRef.current) return;
    glowRafRef.current = requestAnimationFrame(() => {
      glowRafRef.current = 0;
      setGlowPrev(glowPrevRef.current);
    });
  };
  const clearGlowPreview = () => {
    if (glowRafRef.current) { cancelAnimationFrame(glowRafRef.current); glowRafRef.current = 0; }
    glowPrevRef.current = null;
    setGlowPrev(null);
  };
  useEffect(() => () => { if (glowRafRef.current) cancelAnimationFrame(glowRafRef.current); }, []);
  const effGlowColor = glowPrev ?? glowColor;

  // The song editor's sidebar Typography panel drives this same thing, so
  // highlighting a word and clicking B there bolds that word, not the slide.
  if (apiRef) apiRef.current = { applyStyle, applyStyleToRange, previewGlow, clearGlowPreview, hasSelection: () => sel.end > sel.start, flush: sendTa };

  // Tell the sidebar what its buttons should light up on. Keyed on the ANSWER,
  // not on the caret, so moving the cursor never re-renders the whole modal.
  // Deps are the actual inputs (selection, spans, text) — the old dep-less
  // version re-ran (and re-ran rangeAttrs over the spans) on EVERY render.
  const selReportRef = useRef('');
  useEffect(() => {
    const state = { bold: tgtOn('bold'), italic: tgtOn('italic'), underline: tgtOn('underline'), strike: tgtOn('strike'), glow: tgtOn('glow') };
    const selGlowColor = rangeAttrs(taSpans, tgtFrom, tgtTo).glow;
    const key = `${hasSel}|${state.bold}|${state.italic}|${state.underline}|${state.strike}|${state.glow}|${String(selGlowColor)}|${tgtScale}`;
    if (key === selReportRef.current) return;
    selReportRef.current = key;
    onSelectionChange?.({ active: hasSel, attrs: { ...state, scale: tgtScale, glowColor: selGlowColor }, from: sel.start, to: sel.end });
  }, [sel.start, sel.end, hasSel, tgtFrom, tgtTo, tgtScale, taSpans, taText]);

  // ---- WYSIWYG typing surface --------------------------------------------
  // z1 keeps rendering (the live text, not the 150ms-lagged prop) and the
  // textarea underneath goes text-invisible: it stays the input engine, z1
  // supplies the picture, and the caret is painted off z1's glyphs. Ticker
  // cues are excluded — the ticker merges every line into one animated strip,
  // so textarea offsets have nothing to line up against.
  const layoutRef = useRef(null);
  const caretRef = useRef(null);
  const selBoxRef = useRef(null);
  const overlayRef = useRef(null);
  const paintRef = useRef(() => {});

  const caseTransform = caseMode === 'upper' ? 'uppercase' : caseMode === 'title' ? 'capitalize' : 'none';
  const overlayOn = editing && layoutMode !== 'ticker';

  // from/to default to the state selection so every existing caller keeps
  // working; the drag path passes the LIVE offsets so the paint does not
  // wait for the re-render (the canvas subtree is heavy and the highlight
  // would trail the pointer by frames).
  const paintOverlay = (from = sel.start, to = sel.end) => {
    const root = layoutRef.current;
    const selBox = selBoxRef.current;
    const caret = caretRef.current;
    const overlay = overlayRef.current;
    if (!root || !selBox || !caret || !overlay) return;
    // The overlay is inset:0 inside the canvas frame, so its own rect is the
    // padding box — the exact origin z1's absolutely-positioned layer uses
    // (the frame's 1px border would otherwise skew every coordinate).
    const wr = overlay.getBoundingClientRect();

    // Clip everything to the box itself, using its axis-aligned bounds so a
    // rotated box still clips to what you actually see.
    const cx = box.x + box.w / 2;
    const cy = box.y + box.h / 2;
    const rad = (angle * Math.PI) / 180;
    const hw = (Math.abs(Math.cos(rad)) * box.w + Math.abs(Math.sin(rad)) * box.h) / 2;
    const hh = (Math.abs(Math.sin(rad)) * box.w + Math.abs(Math.cos(rad)) * box.h) / 2;
    const lx = (cx - hw) * scale;
    const ly = (cy - hh) * scale;
    overlay.style.clipPath = `inset(${Math.max(0, ly)}px ${Math.max(0, wr.width - (lx + hw * 2 * scale))}px ${Math.max(0, wr.height - (ly + hh * 2 * scale))}px ${Math.max(0, lx)}px)`;

    const idx = layoutIndex(root);
    selBox.textContent = '';
    if (to > from) {
      const frag = document.createDocumentFragment();
      const strips = selectionRects(idx, from, to);
      for (let i = 0; i < strips.length; i++) {
        const s = strips[i];
        const d = document.createElement('div');
        d.className = 'kog-selrect';
        d.style.left = `${s.left - wr.left}px`;
        d.style.top = `${s.top - wr.top}px`;
        d.style.width = `${s.width}px`;
        d.style.height = `${s.height}px`;
        frag.appendChild(d);
      }
      selBox.appendChild(frag);
    }

    // An empty box shows its placeholder instead — a caret parked on top of
    // the hint would just read as noise.
    const c = to === from && taText ? caretRect(idx, from) : null;
    if (c) {
      caret.style.display = 'block';
      caret.style.left = `${c.left - wr.left - 1}px`;
      caret.style.top = `${c.top - wr.top}px`;
      caret.style.height = `${Math.max(9, c.height)}px`;
    } else {
      caret.style.display = 'none';
    }
  };
  paintRef.current = paintOverlay;

  // Drag paints, coalesced to one per frame: native select events fire faster
  // than the screen redraws, and each full paint re-walks the text. The state
  // update (chips, sidebar) still goes through onSelect every time — only the
  // pixels wait for the frame.
  const paintRafRef = useRef(0);
  const paintPendingRef = useRef(null);
  const paintSoon = (from, to) => {
    paintPendingRef.current = [from, to];
    if (paintRafRef.current) return;
    paintRafRef.current = requestAnimationFrame(() => {
      paintRafRef.current = 0;
      const p = paintPendingRef.current;
      paintPendingRef.current = null;
      if (p) paintRef.current(p[0], p[1]);
    });
  };
  useEffect(() => () => { if (paintRafRef.current) cancelAnimationFrame(paintRafRef.current); }, []);

  // Sweep selection: while the button is held and the pointer moves, the
  // browser continuously re-hit-tests and grows the native range. `select`
  // events can arrive coarser than the pointer, so this document-level
  // `selectionchange` feed paints every step of the sweep — paint-only, no
  // state, so it can never fight onSelect's reporting. Scoped to our own
  // focused textarea; anything else selecting is none of our business.
  useEffect(() => {
    if (!overlayOn) return undefined;
    const onDocSel = () => {
      const ta = taRef.current;
      if (!ta || document.activeElement !== ta) return;
      try {
        paintSoon(ta.selectionStart ?? 0, ta.selectionEnd ?? ta.selectionStart ?? 0);
      } catch (_) { /* noop */ }
    };
    document.addEventListener('selectionchange', onDocSel);
    return () => document.removeEventListener('selectionchange', onDocSel);
  }, [overlayOn]);

  useLayoutEffect(() => {
    if (!overlayOn) return;
    paintOverlay();
  });

  useEffect(() => {
    if (!overlayOn) return undefined;
    const h = () => paintRef.current();
    // Scrolling an ancestor moves the whole box, and only a repaint puts the
    // caret back on its glyph.
    window.addEventListener('scroll', h, true);
    window.addEventListener('resize', h);
    return () => {
      window.removeEventListener('scroll', h, true);
      window.removeEventListener('resize', h);
    };
  }, [overlayOn]);

  const selectRange = (from, to) => {
    const ta = taRef.current;
    if (!ta) return;
    try { ta.setSelectionRange(from, to); } catch (_) { /* noop */ }
    setSel({ start: from, end: to });
  };

  const offsetAtPoint = (clientX, clientY) => {
    const root = layoutRef.current;
    if (!root) return 0;
    return offsetFromPoint(layoutIndex(root), clientX, clientY);
  };

  // preventDefault does two jobs: it stops the browser placing the caret from
  // the TEXTAREA's (differently scaled) layout, and it keeps focus, so the
  // selection below is the only one that exists.
  //
  // Native selection does all of this now (see the note above
  // "what a press should select"): the press, the drag, the word snap, the
  // line take and Shift+click are the browser's own, so there is no custom
  // mousemove machinery left to drift a line off.
  //
  // Presses that MISS the textarea (the empty box area above/below centred
  // text) still need a caret: map those against the rendered glyphs. Presses
  // on text never reach here — e.target is the textarea then, and the
  // browser is already selecting natively.
  const onEditAreaMouseDown = (e) => {
    if (e.button !== 0 || e.target !== e.currentTarget) return;
    // A press that lands on a box drawn ON TOP of this one belongs to THAT
    // box, not to the one being typed in — the lyric box covers most of the
    // canvas, so a click on a kicker would otherwise just drop a caret in the
    // lyrics. Select the box under the pointer instead.
    const top = topBoxAt(e.clientX, e.clientY);
    if (top >= 0 && top !== actIdx) {
      e.preventDefault();
      selectObj(top);
      return;
    }
    e.preventDefault();
    const ta = taRef.current;
    if (!ta) return;
    try { ta.focus({ preventScroll: true }); } catch (_) { ta.focus(); }
    const o = offsetAtPoint(e.clientX, e.clientY);
    selectRange(o, o);
  };

  const onOverlayScroll = (e) => {
    // The textarea hugs its content, so a tall cue scrolls this flex
    // container — never the textarea itself. The rendered layer lives in the
    // display box (the actual overflow: hidden scroller over there), so that
    // is what follows. (The old target, the renderer's inner div, is not a
    // scroll container at all — the sync silently did nothing.)
    const boxEl = displayBoxRef.current;
    const src = e ? e.currentTarget : null;
    if (boxEl && src && boxEl !== src) boxEl.scrollTop = src.scrollTop;
    paintOverlay();
  };

  committedRef.current = box;

  const previewing = !!previewAnim && previewAnim !== 'none';

  const propSt = {
    font: fontFamily,
    size: fontSize,
    lineHeight,
    align: textAlign,
    color: fontColor,
    caseMode,
    bold: bold !== false,
    italic,
    underline,
    strike,
    letterSpacing,
    valign,
    pad,
    shadow: shadowBlur > 0,
    shadowColor,
    shadowBlur,
    shadowOffsetX,
    shadowOffsetY,
    glow,
    glowColor: effGlowColor,
    glowBlur,
    outline: strokeWidth > 0,
    strokeColor,
    strokeWidth,
    gradient,
    gradientColor1,
    gradientColor2,
    gradientAngle,
    highlight,
    hlOpacity,
    fill,
    fillMax,
    fillMin,
    layoutMode,
    tickerSpeed,
    tickerDir,
  };

  // THE CUE'S OWN STYLE — `cueLyricStyle(c)`, the ONE mapping the projector,
  // the stage and every thumbnail already render from. It is merged over the
  // individual props above so this canvas draws exactly what the wall draws:
  // hollow type (strokeOnly), box opacity, blend mode, fixedSize, the padding /
  // fill bounds and the colour default all travel here instead of being
  // re-typed prop by prop — that re-typing is how the two surfaces drifted
  // apart (a cue the wall drew hollow came out filled on the canvas, a
  // translucent box looked opaque here). Optional: a caller that passes nothing
  // keeps rendering from the props, exactly as before.
  const lyricSt = lyricStyle ? { ...propSt, ...lyricStyle } : propSt;

  // ---- stage contain-fit + canvas <-> viewport scale ----------------------
  // The stage takes the LARGEST 16:9 that fits its parent's content box —
  // width-limited on wide columns, height-limited (availH × 16/9) when the
  // toolbar + pager leave little height — so it is centered and can never
  // slide under the footer. Size and scale are written imperatively like the
  // box geometry below; React must not diff these px values away.
  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return undefined;
    const apply = () => {
      const parent = el.parentElement;
      if (!parent) return;
      const cs = getComputedStyle(parent);
      const availW = parent.clientWidth - (parseFloat(cs.paddingLeft) || 0) - (parseFloat(cs.paddingRight) || 0);
      const availH = parent.clientHeight - (parseFloat(cs.paddingTop) || 0) - (parseFloat(cs.paddingBottom) || 0);
      if (!(availW > 0) || !(availH > 0)) return;
      // EXACTLY the projector's fit: designCanvasInFrame (contain the design
      // canvas in the available box, uniform scale, centred) — the same
      // function ProjectorDisplay uses for its content band, so this preview
      // is scaled by the same logic as the live output at every window size.
      const fit = designCanvasInFrame(availW, availH);
      if (!(fit.s > 0)) return;
      el.style.width = `${fit.cw}px`;
      el.style.height = `${fit.ch}px`;
      setScale((prev) => (Math.abs(prev - fit.s) < 0.0002 ? prev : fit.s));
    };
    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(el);
    if (el.parentElement) ro.observe(el.parentElement);
    return () => ro.disconnect();
  }, []);

  // ---- geometry: React is the source of truth ----------------------------
  // `boxToCss` is the ONE logical -> DOM conversion; the DOM layer itself is
  // scaled by CSS, never the stored coordinates.
  const applyBoxToDom = useCallback((b) => {
    const next = boxToCss(b);
    if (displayBoxRef.current) Object.assign(displayBoxRef.current.style, next);
    if (editBoxRef.current) Object.assign(editBoxRef.current.style, next);
  }, []);

  // Runs after every commit so imperative gesture writes can never go stale
  // against the props. It also collapses any leftover Konva scale into the
  // logical box, so save/reload and React re-renders describe the same rect.
  useLayoutEffect(() => {
    if (gestureRef.current) return;
    applyBoxToDom(box);
    if (groupRef.current) applyBoxToKonvaNode(groupRef.current, box);
  });

  // Keeps the OFF-SLIDE badge honest when geometry changes WITHOUT a gesture:
  // undo/redo, switching slides, a text refit, Apply-to-all. Skipped mid-
  // gesture on purpose — the prop there is the stale committed rectangle and
  // paintGuides is already reporting the live one.
  useLayoutEffect(() => {
    if (gestureRef.current) return;
    setOffSlide(!boxFitsCanvas(box) || otherOff(actIdx));
  });

  const trNodes = useMemo(() => (trNode ? [trNode] : []), [trNode]);

  // Callback ref so the Transformer gets the Group node however react-konva
  // schedules child mounting (its children mount inside a layout effect).
  const attachGroup = useCallback((node) => {
    groupRef.current = node;
    setTrNode((prev) => (prev === node ? prev : node));
  }, []);

  // Handles render at a constant size on screen no matter the canvas zoom.
  const uiScale = Math.max(scale, 0.05);
  const anchorSize = Math.max(6, Math.round(11 / uiScale));
  const borderWidth = Math.max(1, 2 / uiScale);

  // Resize keeps ONLY the minimum box size (Konva's contract: same rect
  // shape in, same rect shape out, rotation in RADIANS). No canvas fit any
  // more — a handle may push the box off the slide, exactly like a drag.
  const boundBox = useCallback((oldBox, newBox) => {
    if (!newBox) return oldBox;
    const rawW = newBox.width !== undefined ? newBox.width : newBox.w;
    const rawH = newBox.height !== undefined ? newBox.height : newBox.h;
    const wNum = Number(rawW);
    const hNum = Number(rawH);
    if (!Number.isFinite(wNum) || !Number.isFinite(hNum) || wNum < MIN_BOX_W || hNum < MIN_BOX_H) return oldBox;
    return newBox;
  }, []);

  // Reconstructs the logical box from the node's current transform. Used live
  // during a gesture (to move the DOM lyrics under the cursor) and on end (to
  // commit). Does NOT mutate the node — scaling stays intact until commit.
  // The helper works purely in logical units: node scale is canvas zoom's
  // business, never part of the saved coordinates.
  const boxFromNode = useCallback(() => (
    boxFromKonvaNode(groupRef.current, startBoxRef.current)
  ), []);

  const emitBox = useCallback((b) => {
    applyBoxToDom(b);
    onBoxChange?.(b);
  }, [applyBoxToDom, onBoxChange]);

  // ---- extra text boxes ---------------------------------------------------
  // Their DOM nodes are moved DIRECTLY during a drag (React state only lands on
  // dragEnd), so dragging a second box never round-trips the whole app at
  // mousemove rate — the same reason the main box animates in the DOM first.
  const extraDomRef = useRef({});
  const moveExtraDom = (i, b) => {
    const el = extraDomRef.current[i];
    if (!el) return;
    el.style.left = `${b.x}px`;
    el.style.top = `${b.y}px`;
  };
  // Land the last 150ms of typing on the box we are LEAVING before the parent
  // repoints the textarea at the new one — otherwise switching boxes eats the
  // tail of what was just typed.
  const selectObj = (i) => {
    if (i === activeObj) { setOutline(true); return; }
    sendTa();
    setOutline(true);
    onSelectObj?.(i);
  };

  // THE SELECTION OUTLINE — the handles around the box being edited. It
  // shows while a box is picked and disappears when the operator clicks away
  // on the canvas, so a stray outline never sits over the slide. The box
  // stays the active one (the sidebar still styles it); only the handles go.
  const [outline, setOutline] = useState(true);
  useEffect(() => { setOutline(true); }, [activeObj]);
  const onStageClick = (e) => {
    const t = e && e.target;
    if (!t) return;
    if (t === t.getStage?.() || t.getClassName?.() === 'Layer') {
      setOutline(false);
      // A press on the EMPTY canvas background must also close the typing
      // textbox. It used not to: Konva preventDefaults desktop mousedown on
      // its stage (drag/canvas protection), which suppresses the textarea's
      // blur — and blur was the ONLY thing that ended edit mode, so the
      // textbox just sat there while the operator clicked away. The press
      // still reaches this Konva click handler, so end the edit here
      // explicitly. (Clicks on a BOX are handled by that box's own
      // onClick / the textarea's mousedown routing above — those switch or
      // keep the box, they never mean "done typing this one" except through
      // blur, which the sidebar chips deliberately preventDefault.)
      if (editing) endEdit();
    }
  };
  // Clicking ANYWHERE outside the canvas (sidebar, toolbar, panel chrome…)
  // drops the selection outline. The click on the canvas background itself
  // is handled above; this covers the rest of the editor.
  useEffect(() => {
    const onDown = (e) => {
      const root = wrapRef.current;
      if (root && !root.contains(e.target)) setOutline(false);
    };
    document.addEventListener('mousedown', onDown, true);
    return () => document.removeEventListener('mousedown', onDown, true);
  }, []);
  // The boxes on this slide in DRAW order (0 = the main lyric). The ACTIVE
  // one is drawn by the single-box machinery; the rest are drawn read-only.
  // Both the DOM layer and the Konva layer order themselves by this index
  // (CSS z-index / Konva zIndex), so the box you SEE on top is always the
  // box you can grab — a click must never land on a different box, and the
  // canvas must draw them in the same order the projector does.
  const objList = (objects && objects.length) ? objects : [null];
  const actIdx = Math.max(0, Math.min(Number(activeObj) || 0, objList.length - 1));
  // Which box does a press belong to? The TOP-MOST box in draw order that
  // contains the point wins — the same stacking the projector uses, so the
  // box you can SEE on top is the box you can grab. The boxes overlap (the
  // lyric box covers most of the canvas), which is exactly why this has to
  // be decided by draw order and not by "whatever was drawn last".
  const topBoxAt = (clientX, clientY) => {
    const el = wrapRef.current;
    const content = el && el.querySelector('.konvajs-content');
    if (!content) return -1;
    // Real bounding rect, not the React scale value: after a window resize the
    // observer can lag one frame, and using stale scale made clicks land off.
    const p = clientToSlide(clientX, clientY, content.getBoundingClientRect(), CANVAS_W, CANVAS_H);
    const boxes = objList.map((o) => (o ? (o.box || DEFAULT_BOX) : null));
    return topBoxIndexAt(boxes, p.x, p.y);
  };

  // Every drag/resize is wrapped in one editor-store gesture. The live node and
  // DOM move imperatively for responsiveness; the store receives only the
  // final logical box on mouse-up, so SQLite writes and React never chase the
  // pointer and one Ctrl+Z takes back the whole gesture.
  const beginEditorGesture = () => useSongEditorStore.getState().beginGesture();
  const endEditorGesture = () => useSongEditorStore.getState().endGesture();

  // ---- DRAG ALIGNMENT GRID ------------------------------------------------
  // While a text box is being dragged, a grid appears over the slide: thirds
  // plus the centre cross, and a cross riding the box's own centre. Lines the
  // box actually sits on light up gold and a chip says CENTERED — so "is this
  // centred?" is answered by looking, not by guessing. Nothing is dragged, it
  // is not rendered at all (the layer starts display:none and is only ever
  // shown between dragstart and dragend).
  // Every update is a direct style write: a React state set here would
  // re-render the whole canvas subtree on every mousemove, which is exactly
  // what the imperative node/DOM moves below exist to avoid.
  const guidesRef = useRef(null);
  const vRef = useRef(null);
  const hRef = useRef(null);
  const crossVRef = useRef(null);
  const crossHRef = useRef(null);
  const chipRef = useRef(null);
  const GUIDE_TOL = 6; // design px — within this, the box counts as centred

  // ---- OFF-SLIDE warning (the replacement for the edge wall) -------------
  // A box may now rest past the edge on purpose, so the old guarantee had to
  // become information instead of force: this badge lights while any box on
  // the slide hangs over — live during a drag, from the committed geometry
  // when idle. Direct style writes again: a state set per mousemove would
  // re-render the whole canvas subtree.
  const offRef = useRef(null);
  const setOffSlide = (out) => { const el = offRef.current; if (el) el.style.display = out ? 'inline-flex' : 'none'; };
  // Everything ELSE on this slide that hangs over. The box the caller is
  // moving (srcIdx) is excluded: mid-gesture its prop is still the stale
  // committed rectangle, so counting it would report last frame's answer.
  const otherOff = (srcIdx) => (objects || []).some((o, i) => i !== srcIdx && o && o.box && !boxFitsCanvas(o.box));

  const showGuides = () => { const el = guidesRef.current; if (el) el.style.display = 'block'; };
  const hideGuides = () => { const el = guidesRef.current; if (el) el.style.display = 'none'; };
  const paintGuides = (b, srcIdx = actIdx) => {
    setOffSlide(!boxFitsCanvas(b) || otherOff(srcIdx));
    if (!guidesRef.current) return;
    const cx = (Number(b && b.x) || 0) + (Number(b && b.w) || 0) / 2;
    const cy = (Number(b && b.y) || 0) + (Number(b && b.h) || 0) / 2;
    const onX = Math.abs(cx - CANVAS_W / 2) <= GUIDE_TOL;
    const onY = Math.abs(cy - CANVAS_H / 2) <= GUIDE_TOL;
    if (crossVRef.current) crossVRef.current.style.left = `${cx}px`;
    if (crossHRef.current) crossHRef.current.style.top = `${cy}px`;
    const axis = (el, on) => {
      if (!el) return;
      el.style.background = on ? '#FFC72C' : 'rgba(255,255,255,0.4)';
      el.style.boxShadow = on ? '0 0 8px rgba(255,199,44,0.9)' : 'none';
    };
    axis(vRef.current, onX);
    axis(hRef.current, onY);
    if (chipRef.current) {
      chipRef.current.style.opacity = onX && onY ? '1' : '0';
      chipRef.current.style.transform = onX && onY ? 'translate(-50%, 0) scale(1)' : 'translate(-50%, 0) scale(0.94)';
    }
  };

  const handleDragStart = () => {
    startBoxRef.current = committedRef.current;
    gestureRef.current = true;
    beginEditorGesture();
    showGuides();
    paintGuides(committedRef.current);
  };

  const handleDragMove = () => {
    if (!groupRef.current) return;
    const b = boxFromNode();
    applyBoxToDom(b);
    paintGuides(b);
  };

  const handleDragEnd = () => {
    const g = groupRef.current;
    hideGuides();
    if (!g) { gestureRef.current = false; endEditorGesture(); return; }
    // Commit exactly what was dragged — no settle, no clamp. If it hangs over
    // the edge that is the operator's placement; the OFF-SLIDE badge is the
    // only response (paintGuides already lit it during the drag).
    const next = boxFromNode();
    setOffSlide(!boxFitsCanvas(next) || otherOff(actIdx));
    gestureRef.current = false;
    // Collapse any node transform into the committed geometry BEFORE React
    // repaints, so the node and the incoming props describe one rectangle.
    applyBoxToKonvaNode(g, next);
    emitBox(next);
    endEditorGesture();
  };

  const handleTransformStart = () => {
    startBoxRef.current = committedRef.current;
    gestureRef.current = true;
    beginEditorGesture();
  };

  const handleTransform = () => {
    applyBoxToDom(boxFromNode());
  };

  const handleTransformEnd = () => {
    const g = groupRef.current;
    if (!g) { gestureRef.current = false; endEditorGesture(); return; }
    const next = boxFromNode();
    // "Scale text" mode reads the vertical scale BEFORE it is collapsed.
    const sy = g.scaleY();
    gestureRef.current = false;

    // Text boxes resize their BOX; the font is not implicitly scaled in
    // fit/fill modes. Scale mode explicitly writes a new font size below.
    applyBoxToKonvaNode(g, next);
    emitBox({ ...next, angle: next.angle });

    // "Scale text" mode: dragging a handle writes the font size directly.
    // Fit/Fill leave the size alone — the shared auto-fit recomputes it.
    // Kept INSIDE the gesture so box + font size are one undo step.
    if (resizeMode === 'scale') {
      const nextSize = Math.round(Math.max(FONT_SIZE_MIN, Math.min(FONT_SIZE_MAX, fontSize * sy)));
      if (nextSize !== fontSize) onSizeChange?.(nextSize);
    }

    endEditorGesture();
  };

  // ---- text editing -------------------------------------------------------
  const startEdit = useCallback(() => setEditing(true), []);
  const endEdit = useCallback(() => { sendTa(); setSel({ start: 0, end: 0 }); setEditing(false); }, []);

  const syncTaHeight = useCallback(() => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = `${ta.scrollHeight}px`;
  }, []);

  useEffect(() => {
    if (!editing) return;
    const ta = taRef.current;
    if (!ta) return;
    try { ta.focus({ preventScroll: true }); } catch (_) { ta.focus(); }
    const n = ta.value.length;
    try { ta.setSelectionRange(n, n); } catch (_) { /* noop */ }
    setSel({ start: n, end: n });
  }, [editing]);

  useLayoutEffect(() => {
    // The textarea hugs its content in every mode now (native selection needs
    // the text block to sit exactly where the rendered glyphs sit, so the
    // flex parent can centre both identically). Empty-box presses are caught
    // by the container fallback below.
    if (editing) syncTaHeight();
  });

  // ---- shared sizing ------------------------------------------------------
  const { pad: layoutPad } = useMemo(() => lyricsLayoutMetrics(lyricSt, box), [lyricSt, box]);
  const taSize = useMemo(() => computeLyricsFontSize(text, lyricSt, box), [text, lyricSt, box]);

  const deco = [underline ? 'underline' : null, strike ? 'line-through' : null].filter(Boolean).join(' ') || 'none';
  // Mirror renderLyricsLayout's own gate: shadow is only real when it is
  // switched on (shadowBlur > 0) AND actually displaces or blurs something.
  const shadowOn = !!lyricSt.shadow && ((Number(shadowBlur) || 0) > 0 || (Number(shadowOffsetX) || 0) !== 0 || (Number(shadowOffsetY) || 0) !== 0);
  const glowOn = !!glow && (Number(glowBlur) || 0) > 0;
  const glowLayers = glowOn ? `0 0 ${Math.max(2, Math.round((Number(glowBlur) || 18) / 3))}px ${effGlowColor || '#22d3ee'}, 0 0 ${Number(glowBlur) || 18}px ${effGlowColor || '#22d3ee'}` : '';
  const shadowLayer = shadowOn ? `${Number(shadowOffsetX) || 0}px ${Number(shadowOffsetY) || 0}px ${Number(shadowBlur) || 0}px ${shadowColor || '#000000'}` : '';
  const taTextShadow = [shadowLayer, glowLayers].filter(Boolean).join(', ') || 'none';
  const animCSS = previewing ? transitionAnimation(previewAnim, previewSpeed) : '';

  const boxTransform = angle ? `rotate(${angle}deg)` : 'none';

  const pillTop = box.y >= 34 ? box.y - 26 : box.y + box.h + 4;

  return (
    <div ref={wrapRef} style={{ boxSizing: 'border-box', position: 'relative', overflow: 'hidden', borderRadius: 12, boxShadow: '0 12px 44px rgba(0,0,0,0.45)', border: '1px solid var(--ui-border2)' }}>
      {/* z0 — background layer, graded by the same bg_fx the wall uses.
          The video keeps its key and stays mounted: changing a grade only
          changes this wrapper, never the <video>. */}
      <div style={{ position: 'absolute', inset: 0, zIndex: 0, overflow: 'hidden' }}>
        <CinematicBackdrop bgFx={bgFx}>
          {bgType === 'color' && (
            <div style={{ position: 'absolute', inset: 0, backgroundColor: bgValue || '#000000' }} />
          )}
          {bgType === 'image' && bgValue && (
            <img src={bgValue} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: bgFitCss(bgFit), backgroundColor: '#000' }} draggable={false} />
          )}
          {bgType === 'video' && bgValue && (
            <video key={`bg-${bgValue}`} src={bgValue} autoPlay loop muted playsInline preload="metadata" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: bgFitCss(bgFit), backgroundColor: '#000' }} />
          )}
          {bgType === 'gradient' && !!bgValue && (
            <div style={{ position: 'absolute', inset: 0, background: bgValue }} />
          )}
          {bgType === 'animated' && (
            <AnimatedBg value={bgValue} k={1} />
          )}
          {/* Same dimmer the wall applies — the canvas is the picture the
              operator is judging, so it must wash identically. */}
          {Number(bgDim) > 0 && (
            <div style={{ position: 'absolute', inset: 0, background: '#000', opacity: Math.min(1, Number(bgDim) / 100), pointerEvents: 'none' }} />
          )}
        </CinematicBackdrop>
      </div>

      {/* z1 — the real lyrics, same renderer as the projector */}
      <div style={{ position: 'absolute', left: 0, top: 0, width: CANVAS_W, height: CANVAS_H, zIndex: 1, pointerEvents: 'none', transformOrigin: 'top left', transform: `scale(${scale})` }}>
        {/* The card's rules and small lines sit behind the title itself, and
            OUTSIDE CinematicText: framing must not inherit the lyric's text
            effects (a shaking rule on a glitch preset reads as a broken wall). */}
        {card ? <TitleCardChrome card={card} artist={cardArtist} event={cardEvent} venue={cardVenue} /> : null}
        <CinematicText fx={fx}>
        {/* Ghost / watermark text sits BEHIND everything, through the same
            renderer as the projector. Read-only here — its box is edited from
            the Layered Text panel. */}
        {ghost && ghost.lyric && (
          <div style={{ position: 'absolute', left: ghost.lyric.box?.x ?? 64, top: ghost.lyric.box?.y ?? 170, width: ghost.lyric.box?.w ?? 1152, height: ghost.lyric.box?.h ?? 380, transform: ghost.lyric.box?.angle ? `rotate(${ghost.lyric.box.angle}deg)` : undefined, transformOrigin: 'center center' }}>
            <LyricsBlock text={ghost.text || ''} st={ghost.lyric} box={ghost.lyric.box || { x: 64, y: 170, w: 1152, h: 380 }} />
          </div>
        )}
        <div style={{ width: '100%', height: '100%', position: 'relative' }}>
          <div
            ref={displayBoxRef}
            style={{ position: 'absolute', left: box.x, top: box.y, width: box.w, height: box.h, transform: boxTransform, transformOrigin: 'center center', overflow: 'hidden', zIndex: actIdx }}
          >
            {/* Preview the entrance on the box being styled ONLY — the other
                boxes on the slide stay still, so hovering a transition shows
                exactly what that text box will do. */}
            <div key={previewing ? `${previewAnim}-${previewTick}` : 'lyrics'} style={{ width: '100%', height: '100%', animation: previewing ? animCSS : undefined }}>
              {editing ? (
                overlayOn ? (
                  // WYSIWYG: the canvas renders the LIVE text through the same
                  // function the projector uses, so typing and output are one
                  // picture. caseMode is passed as CSS instead of the renderer's
                  // JS fold so the characters in the DOM stay 1:1 with the
                  // textarea offsets the caret maps in (both transform the same
                  // way on screen — this is exactly what the textarea did).
                  <div ref={layoutRef} style={{ width: '100%', height: '100%', textTransform: caseTransform }}>
                    {renderLyricsLayout(emitSpans(taText, taSpans), { ...lyricSt, caseMode: 'none' }, box)}
                    {/* Sibling of the renderer, never inside it: the caret bridge
                        indexes `firstElementChild`'s children as lines, so this
                        must stay out of that tree — and it gives the empty box
                        the same centred hint the textarea used to paint. */}
                    {!taText && (
                      <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily, fontSize: Math.min(taSize, 56), fontWeight: bold !== false ? 700 : 400, color: 'rgba(245,245,244,0.34)', pointerEvents: 'none' }}>
                        Type your lyrics…
                      </div>
                    )}
                  </div>
                ) : null
              ) : (
                // The SAME component the wall draws with (measured fit), so the
                // editor canvas and the output are one picture — not two
                // different fits of the same words.
                <LyricsBlock text={text} st={lyricSt} box={box} />
              )}
            </div>
          </div>
          {/* The OTHER text boxes on this slide: the same renderer the
              projector uses, drawn read-only — Konva gives each one a hit box
              in the layer below for select / drag / double-click-to-type. */}
          {objList.map((o, i) => {
            if (!o || i === actIdx) return null;
            const ob = o.box || DEFAULT_BOX;
            return (
              <div
                key={o.id || `tx-${i}`}
                ref={(el) => { if (el) extraDomRef.current[i] = el; else delete extraDomRef.current[i]; }}
                style={{ position: 'absolute', left: ob.x, top: ob.y, width: ob.w, height: ob.h, transform: ob.angle ? `rotate(${ob.angle}deg)` : undefined, transformOrigin: 'center center', overflow: 'hidden', zIndex: i }}
              >
                <LyricsBlock text={o.text || ''} st={cueLyricStyle(o)} box={ob} />
              </div>
            );
          })}        </div>
        </CinematicText>
      </div>

      {/* Cinematic texture pass, above the words, below the interaction layer. */}
      <CinematicOverlay fx={fx} zIndex={1.5} />

      {/* z2 — Konva interaction layer (transparent) */}
      <Stage
        width={CANVAS_W}
        height={CANVAS_H}
        onClick={onStageClick}
        style={{ position: 'absolute', left: 0, top: 0, width: CANVAS_W, height: CANVAS_H, zIndex: 2, transformOrigin: 'top left', transform: `scale(${scale})` }}
      >
        <Layer>
          <Group
            ref={attachGroup}
            x={box.x + box.w / 2}
            y={box.y + box.h / 2}
            offsetX={box.w / 2}
            offsetY={box.h / 2}
            rotation={angle}
            zIndex={actIdx}
            draggable={!cueLocked}
            onDragStart={handleDragStart}
            onDragMove={handleDragMove}
            onDragEnd={handleDragEnd}
            onTransformStart={handleTransformStart}
            onTransform={handleTransform}
            onTransformEnd={handleTransformEnd}
            onDblClick={startEdit}
            onDblTap={startEdit}
            // This group IS the active box (whatever is selected), so a click
            // on it must keep THAT box selected — never jump to the main
            // lyric. Clicking the box you are on and having the selection
            // jump elsewhere is what made a drag move the wrong box.
            onClick={() => selectObj(actIdx)}
            onTap={() => selectObj(actIdx)}
          >
            {/* Invisible on the scene canvas, opaque colourKey on the hit
                canvas — this is what makes the whole box grabbable. */}
            <Rect width={box.w} height={box.h} fill="rgba(0,0,0,0.001)" />
          </Group>
          {/* Inactive boxes: click selects (the machinery above then becomes
              THAT box), drag moves it, double-click jumps straight to typing.
              zIndex keeps the hit order identical to the draw order, so a
              click always lands on the box that is drawn on top. */}
          {objList.map((o, i) => {
            if (!o || i === actIdx) return null;
            const ob = normalizeBox(o.box || DEFAULT_BOX);
            return (
              <Group
                key={o.id || `tx-${i}`}
                x={ob.x + ob.w / 2}
                y={ob.y + ob.h / 2}
                offsetX={ob.w / 2}
                offsetY={ob.h / 2}
                rotation={ob.angle}
                zIndex={i}
                draggable={!cueLocked}
                // Same rule as the main box: place it anywhere, it stays.
                onClick={() => selectObj(i)}
                onTap={() => selectObj(i)}
                onDblClick={() => { selectObj(i); startEdit(); }}
                onDblTap={() => { selectObj(i); startEdit(); }}
                onDragStart={() => { beginEditorGesture(); showGuides(); paintGuides(ob, i); }}
                onDragMove={(e) => {
                  const nb = boxFromKonvaNode(e.target, ob);
                  moveExtraDom(i, nb);
                  paintGuides(nb, i);
                }}
                onDragEnd={(e) => {
                  const g = e.target;
                  hideGuides();
                  // Commit as placed (no settle), then collapse the node back
                  // onto that box so no transient transform survives.
                  const nb = boxFromKonvaNode(g, ob);
                  setOffSlide(!boxFitsCanvas(nb) || otherOff(i));
                  applyBoxToKonvaNode(g, nb);
                  moveExtraDom(i, nb);
                  sendTa();
                  onObjBoxChange?.(i, nb);
                  endEditorGesture();
                }}
              >
                <Rect width={ob.w} height={ob.h} fill="rgba(0,0,0,0.001)" />
              </Group>
            );
          })}
          <Transformer
            ref={trRef}
            nodes={trNodes}
            visible={!cueLocked && !editing && outline}
            zIndex={10000}
            rotateEnabled
            flipEnabled={false}
            keepRatio={false}
            borderEnabled
            borderStroke={ACCENT}
            borderWidth={borderWidth}
            anchorSize={anchorSize}
            anchorCornerRadius={0}
            anchorStroke="#0b3d5c"
            anchorFillColor={ACCENT}
            rotateAnchorOffset={Math.max(14, Math.round(26 / uiScale))}
            padding={4 / uiScale}
            boundBoxFunc={boundBox}
          />
        </Layer>
      </Stage>

      {/* ALIGNMENT GRID — only exists between dragstart and dragend of a text
          box (display:none the rest of the time). Thirds + the centre cross,
          with a cross riding the box's own centre: when the two cross hairs
          land on the centre line it lights gold and the chip says CENTERED.
          Sits above the Konva hit layer and never takes pointer events, so it
          cannot swallow the drag it is measuring. */}
      <div
        ref={guidesRef}
        style={{ position: 'absolute', left: 0, top: 0, width: CANVAS_W, height: CANVAS_H, zIndex: 4, pointerEvents: 'none', transformOrigin: 'top left', transform: `scale(${scale})`, display: 'none' }}
      >
        {[CANVAS_W / 3, (CANVAS_W * 2) / 3].map((x) => (
          <div key={`gv${x}`} style={{ position: 'absolute', left: x, top: 0, width: 1, height: '100%', background: 'rgba(255,255,255,0.13)' }} />
        ))}
        {[CANVAS_H / 3, (CANVAS_H * 2) / 3].map((y) => (
          <div key={`gh${y}`} style={{ position: 'absolute', top: y, left: 0, height: 1, width: '100%', background: 'rgba(255,255,255,0.13)' }} />
        ))}
        {/* the slide's own centre — the target */}
        <div ref={vRef} style={{ position: 'absolute', left: CANVAS_W / 2, top: 0, width: 1, height: '100%', background: 'rgba(255,255,255,0.4)' }} />
        <div ref={hRef} style={{ position: 'absolute', top: CANVAS_H / 2, left: 0, height: 1, width: '100%', background: 'rgba(255,255,255,0.4)' }} />
        {/* the box's centre — moves with it (drawn last, so it reads on top) */}
        <div ref={crossVRef} style={{ position: 'absolute', left: CANVAS_W / 2, top: 0, width: 1, height: '100%', background: 'rgba(255,199,44,0.75)' }} />
        <div ref={crossHRef} style={{ position: 'absolute', top: CANVAS_H / 2, left: 0, height: 1, width: '100%', background: 'rgba(255,199,44,0.75)' }} />
        <div
          ref={chipRef}
          style={{ position: 'absolute', left: '50%', top: 12, transform: 'translate(-50%, 0)', opacity: 0, background: 'rgba(9,10,15,0.92)', border: `1px solid ${ACCENT}`, color: '#FFC72C', borderRadius: 999, padding: '3px 11px', fontSize: 12, fontWeight: 800, letterSpacing: 1.2, whiteSpace: 'nowrap', boxShadow: '0 2px 10px rgba(0,0,0,0.5)', transition: 'opacity 120ms ease, transform 120ms ease' }}
        >CENTERED</div>
      </div>

      {/* z3 — native textarea, only while typing */}
      {editing && (
        <div style={{ position: 'absolute', left: 0, top: 0, width: CANVAS_W, height: CANVAS_H, zIndex: 3, pointerEvents: 'none', transformOrigin: 'top left', transform: `scale(${scale})` }}>
          <div
            ref={editBoxRef}
            style={{ position: 'absolute', left: box.x, top: box.y, width: box.w, height: box.h, transform: boxTransform, transformOrigin: 'center center', pointerEvents: 'auto' }}
          >
            <div
              // Empty-area presses (above/below centred text, where the hugging
              // textarea does not reach) land here: the fallback maps one caret
              // against the rendered glyphs. Presses on text land on the
              // textarea itself and select natively — they never reach this.
              onMouseDown={overlayOn ? onEditAreaMouseDown : undefined}
              onScroll={overlayOn ? onOverlayScroll : undefined}
              style={{
              width: '100%',
              height: '100%',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: valign === 'top' ? 'flex-start' : valign === 'bottom' ? 'flex-end' : 'center',
              textAlign: textAlign || 'center',
              // Stays unpadded: the padding lives on the textarea itself so
              // its wrapping matches the renderer's line for line.
              padding: overlayOn ? 0 : layoutPad,
              boxSizing: 'border-box',
              overflow: 'hidden',
            }}>
              <textarea
                ref={taRef}
                value={taText}
                data-kog-canvas="1"
                className={overlayOn ? 'lyr-edit-ghost' : undefined}
                onChange={(e) => {
                  const v = e.target.value;
                  // Spans ride along with their characters: a textarea edit is
                  // one contiguous replacement, so everything outside it just
                  // shifts and nothing can land on the wrong word.
                  const spans = remapSpans(taText, v, taSpans);
                  setTaText(v);
                  setTaSpans(spans);
                  taPendingRef.current = emitSpans(v, spans);
                  if (taTimerRef.current) clearTimeout(taTimerRef.current);
                  taTimerRef.current = setTimeout(() => { taTimerRef.current = null; sendTa(); }, 150);
                }}
                onBlur={endEdit}
                onInput={syncTaHeight}
                onMouseDown={(e) => {
                  // Same rule as the empty area above: the box drawn ON TOP
                  // at this point owns the press. The editing textarea is
                  // invisible and sits over the whole lyric box, so without
                  // this a click on a kicker that overlaps the lyrics would
                  // silently edit the lyrics instead.
                  if (e.button !== 0) return;
                  const top = topBoxAt(e.clientX, e.clientY);
                  if (top >= 0 && top !== actIdx) {
                    e.preventDefault();
                    selectObj(top);
                  }
                }}
                // Native selection IS the highlight mapping now: the browser
                // places the caret, drags the range, snaps words on
                // double-press, takes lines on triple-press and extends on
                // Shift+click — onSelect below reports it and z5 paints it on
                // the rendered glyphs. No custom mouse handlers: they were the
                // things landing a line off.
                onSelect={(ev) => {
                  const s = ev.target.selectionStart ?? 0;
                  const e2 = ev.target.selectionEnd ?? s;
                  setSel({ start: s, end: e2 });
                  // Paint NOW from the live offsets, not after the re-render:
                  // that is what makes the highlight stick to the pointer
                  // mid-drag instead of trailing it.
                  paintSoon(s, e2);
                }}
                onKeyDown={(e) => {
                  // Only Escape is swallowed locally: leaving the modal open is
                  // the whole point of "click away to commit".
                  if (e.key === 'Escape') {
                    e.preventDefault();
                    e.stopPropagation();
                    endEdit();
                  }
                }}
                // In overlay mode z1 owns the picture, placeholder included.
                placeholder={overlayOn ? undefined : 'Type your lyrics…'}
                spellCheck={false}
                rows={1}
                style={{
                  display: 'block',
                  width: '100%',
                  flexShrink: 0,
                  margin: 0,
                  border: 'none',
                  outline: 'none',
                  resize: 'none',
                  overflow: 'hidden',
                  boxSizing: 'border-box',
                  // Same padding the renderer draws with: identical width,
                  // identical font, identical wrap — so the browser's native
                  // selection breaks lines exactly where the glyphs break.
                  padding: overlayOn ? layoutPad : (highlight ? '3px 12px' : 0),
                  borderRadius: 8,
                  // The highlight background belongs to the renderer, so in
                  // overlay mode it must not be painted twice.
                  background: overlayOn ? 'transparent' : (highlight ? `rgba(70,45,15,${(hlOpacity ?? 40) / 100})` : 'transparent'),
                  boxShadow: '0 0 0 1px rgba(0,170,255,0.55)',
                  fontFamily: fontFamily,
                  fontSize: taSize,
                  fontWeight: bold !== false ? 700 : 400,
                  fontStyle: italic ? 'italic' : 'normal',
                  textDecoration: deco,
                  // Display-only transform so the textbox shows the same case
                  // as the canvas preview; the stored text stays as typed.
                  textTransform: caseTransform,
                  letterSpacing: letterSpacing ? `${letterSpacing}px` : undefined,
                  lineHeight: lineHeight || 1.05,
                  textAlign: textAlign || 'center',
                  // In overlay mode the glyphs are z1's: hide this textarea's
                  // own text, caret and stroke so nothing paints in the wrong
                  // place, and let the painted caret show through.
                  color: overlayOn ? 'transparent' : (gradient ? (gradientColor1 || '#f5f5f4') : (fontColor || '#f5f5f4')),
                  caretColor: overlayOn ? 'transparent' : (fontColor || '#ffffff'),
                  WebkitTextStroke: !overlayOn && strokeWidth > 0 ? `${strokeWidth}px ${strokeColor || '#000000'}` : undefined,
                  textShadow: !overlayOn ? taTextShadow : 'none',
                  whiteSpace: 'pre-wrap',
                  overflowWrap: 'break-word',
                  wordBreak: 'break-word',
                  cursor: 'text',
                }}
              />
            </div>
          </div>
        </div>
      )}

      {/* z5 — caret + selection, measured off z1's rendered glyphs. The
          textarea's own caret/selection are transparent in overlay mode: they
          would draw against a different line layout than the one on screen. */}
      {overlayOn && (
        <div ref={overlayRef} style={{ position: 'absolute', inset: 0, zIndex: 5, pointerEvents: 'none' }}>
          <div ref={selBoxRef} style={{ position: 'absolute', inset: 0 }} />
          <div
            ref={caretRef}
            style={{
              position: 'absolute',
              width: 2,
              borderRadius: 1,
              background: fontColor || '#ffffff',
              boxShadow: '0 0 0 1px rgba(0,0,0,0.55)',
              display: 'none',
              animation: 'kogCaretBlink 1.06s step-end infinite',
            }}
          />
        </div>
      )}

      {/* z4 — mode badges + edit affordance. OFF-SLIDE lives in this row too:
          it is the warning that replaced the edge wall, so it rides with the
          other state flags instead of being tied to a mode being on. */}
      <div style={{ position: 'absolute', top: 8, left: 8, zIndex: 4, display: 'flex', gap: 6, pointerEvents: 'none' }}>
        <span ref={offRef} style={{ ...badgeStyle.red, display: 'none' }}>OFF-SLIDE</span>
        {fill && <span style={badgeStyle.green}>FILL</span>}
        {layoutMode === 'ticker' && <span style={badgeStyle.cyan}>TICKER</span>}
        {resizeMode === 'scale' && <span style={badgeStyle.amber}>SCALE TEXT</span>}
      </div>
      {/* Line-scale chips. Only exist while editing, because they need a caret
          to say which line they mean — and they sit at top-right, where the
          FILL/TICKER badges (left) can never collide with them. */}
      {editing && (
        <div
          style={{ position: 'absolute', top: 8, right: 8, zIndex: 6, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', flexWrap: 'wrap', rowGap: 3, gap: 3, maxWidth: 'calc(100% - 20px)', background: 'rgba(9,10,15,0.94)', border: '1px solid var(--ui-border2)', borderRadius: 12, padding: '3px 4px 3px 10px', boxShadow: '0 2px 10px rgba(0,0,0,0.5)' }}
          // A mousedown here must not blur the textarea: onBlur ends edit mode,
          // which would fire before the click and swallow it.
          onMouseDown={(ev) => ev.preventDefault()}
          title="Highlighting: drag for a phrase · double-click a word · triple-click a whole line · Shift+click grows the highlight"
        >
          <span title={hasSel
            ? `Sizes the HIGHLIGHTED text. Only that phrase changes — the rest of the slide keeps its size. Highlight by dragging a phrase, double-clicking a word, or triple-clicking a whole line.`
            : 'Scales the line under the caret. Put each phrase on its own line (Enter) to size lines differently — or triple-click a line to highlight it first.'}
          style={{ fontSize: 9, fontWeight: 800, letterSpacing: 1, color: hasSel ? '#ffffff' : '#FFC72C', whiteSpace: 'nowrap', cursor: 'help' }}>
            {hasSel ? 'SELECTION' : 'LINE SIZE'}
          </span>
          {LINE_SCALE_PRESETS.map((v) => {
            const on = Math.abs(tgtScale - v) < 0.001;
            return (
              <button
                key={v}
                type="button"
                title={v === 1 ? 'Normal — back to full size' : `${hasSel ? 'Scale the selection' : 'Scale this line'} to ${v}× of Size`}
                onClick={() => applyStyle({ scale: v === 1 ? false : v })}
                style={{ minWidth: 32, background: on ? ACCENT : 'rgba(255,255,255,0.07)', border: `1px solid ${on ? ACCENT : 'rgba(255,255,255,0.16)'}`, color: on ? '#1C1C1E' : '#F1F2F3', borderRadius: 999, padding: '3px 7px', fontSize: 10, fontWeight: 800, cursor: 'pointer', lineHeight: 1.4, fontFamily: 'inherit' }}
              >
                {v}
              </button>
            );
          })}
          <span style={{ width: 1, height: 15, background: 'rgba(255,255,255,0.2)', margin: '0 3px', flexShrink: 0 }} />
          {STYLE_TOGGLES.map(([k, lbl, tip]) => {
            const on = tgtOn(k);
            return (
              <button
                key={k}
                type="button"
                title={`${tip} — the highlighted text, or the line under the caret if nothing is selected`}
                onClick={() => applyStyle({ [k]: !on })}
                style={{
                  minWidth: 26,
                  background: on ? ACCENT : 'rgba(255,255,255,0.07)',
                  border: `1px solid ${on ? ACCENT : 'rgba(255,255,255,0.16)'}`,
                  color: on ? '#1C1C1E' : '#F1F2F3',
                  borderRadius: 999,
                  padding: '3px 6px',
                  fontSize: 10,
                  lineHeight: 1.4,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  fontWeight: k === 'bold' ? 900 : 700,
                  fontStyle: k === 'italic' ? 'italic' : 'normal',
                  textDecoration: k === 'underline' ? 'underline' : k === 'strike' ? 'line-through' : 'none',
                }}
              >
                {lbl}
              </button>
            );
          })}
          <span style={{ width: 1, height: 15, background: 'rgba(255,255,255,0.2)', margin: '0 3px', flexShrink: 0 }} />
          {SEL_COLORS.map((c) => {
            const on = (tgtAttrs.color || '').toLowerCase() === c.toLowerCase();
            return (
              <button
                key={c}
                type="button"
                title={`Colour the highlighted text ${c}`}
                onClick={() => applyStyle({ color: c })}
                style={{ width: 17, height: 17, borderRadius: '50%', background: c, border: `1px solid ${on ? '#ffffff' : 'rgba(255,255,255,0.35)'}`, boxShadow: on ? `0 0 0 2px ${ACCENT}` : 'none', cursor: 'pointer', padding: 0, flexShrink: 0 }}
              />
            );
          })}
          <button type="button" title="Clear the highlighted text’s colour (back to the slide colour)" onClick={() => applyStyle({ color: false })} style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.16)', color: '#F1F2F3', borderRadius: 999, padding: '1px 5px', fontSize: 10, fontWeight: 800, cursor: 'pointer', lineHeight: 1.4 }}>×</button>
          <span style={{ width: 1, height: 15, background: 'rgba(255,255,255,0.2)', margin: '0 3px', flexShrink: 0 }} />
          <button type="button" title={`Cycle the highlighted text’s face${tgtAttrs.font ? ` (now: ${(SEL_FONTS.find((f) => f.value === tgtAttrs.font) || {}).label || 'custom'})` : ''}`} onClick={cycleSelFont} style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.16)', color: '#F1F2F3', borderRadius: 999, padding: '2px 7px', fontSize: 10, fontWeight: 800, cursor: 'pointer', lineHeight: 1.4, fontFamily: 'Georgia, serif' }}>Aa</button>
          <button type="button" title="Tighter tracking on the highlighted text" onClick={() => nudgeSelTrack(-1)} style={{ minWidth: 22, background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.16)', color: '#F1F2F3', borderRadius: 999, padding: '2px 6px', fontSize: 10, fontWeight: 800, cursor: 'pointer', lineHeight: 1.4 }}>−</button>
          <button type="button" title="Wider tracking on the highlighted text" onClick={() => nudgeSelTrack(1)} style={{ minWidth: 22, background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.16)', color: '#F1F2F3', borderRadius: 999, padding: '2px 6px', fontSize: 10, fontWeight: 800, cursor: 'pointer', lineHeight: 1.4 }}>+</button>
          <button type="button" title="Clear all inline styling on the highlighted text" onClick={clearSelStyle} style={{ background: 'rgba(255,69,69,0.14)', border: '1px solid rgba(255,69,69,0.4)', color: '#FF8A8A', borderRadius: 999, padding: '2px 6px', fontSize: 9.5, fontWeight: 800, cursor: 'pointer', lineHeight: 1.4 }}>Clear</button>
        </div>
      )}

      {!editing && (
        // Own scaled layer: box.x/box.y are logical 1280x720 units, so the chip
        // has to live under the same transform as the box it labels. It sits
        // above the Konva layer so the click reaches the button, not the drag.
        <div style={{ position: 'absolute', left: 0, top: 0, width: CANVAS_W, height: CANVAS_H, zIndex: 5, pointerEvents: 'none', transformOrigin: 'top left', transform: `scale(${scale})` }}>
          <div style={{ position: 'absolute', left: box.x, top: Math.max(2, pillTop) }}>
            <button
              onClick={startEdit}
              style={{ pointerEvents: 'auto', background: 'rgba(9,10,15,0.82)', border: `1px solid ${ACCENT}`, color: '#FFC72C', borderRadius: 999, padding: '2px 9px', fontSize: 10, fontWeight: 800, letterSpacing: 0.4, cursor: 'pointer', whiteSpace: 'nowrap', lineHeight: 1.5, boxShadow: '0 2px 8px rgba(0,0,0,0.5)' }}
            >
              &#9998; Edit text
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

const badgeStyle = {
  red: { fontSize: 9, fontWeight: 800, letterSpacing: 1, padding: '3px 8px', borderRadius: 999, background: 'rgba(255,69,69,0.16)', color: '#FF8A8A', border: '1px solid rgba(255,69,69,0.45)' },
  green: { fontSize: 9, fontWeight: 800, letterSpacing: 1, padding: '3px 8px', borderRadius: 999, background: 'rgba(255,184,0,0.16)', color: '#FFB800', border: '1px solid rgba(255,184,0,0.45)' },
  cyan: { fontSize: 9, fontWeight: 800, letterSpacing: 1, padding: '3px 8px', borderRadius: 999, background: 'rgba(161,161,170,0.16)', color: '#d4d4d8', border: '1px solid rgba(161,161,170,0.45)' },
  amber: { fontSize: 9, fontWeight: 800, letterSpacing: 1, padding: '3px 8px', borderRadius: 999, background: 'rgba(245,158,11,0.16)', color: '#fcd34d', border: '1px solid rgba(245,158,11,0.45)' },
};
