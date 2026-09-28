import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Stage, Layer, Group, Rect, Transformer } from 'react-konva';
import { renderLyricsLayout, computeLyricsFontSize, lyricsLayoutMetrics, FONT_SIZE_MIN, FONT_SIZE_MAX, LINE_SCALE_PRESETS, ingestSpans, emitSpans, remapSpans, applySpanPatch, rangeAttrs, spanCovers, lineSpanRange, lineIndexAt } from '../lib/lyrics';
import { transitionAnimation } from '../lib/constants';

const CANVAS_W = 1280;
const CANVAS_H = 720;
const ACCENT = '#00aaff';
const MIN_W = 80;
const MIN_H = 48;
// Keep at least this many logical px of the box on-canvas while dragging, so a
// box can never be lost off-screen — but it stays effectively free-moving.
const KEEP_IN = 80;

const DEFAULT_BOX = { x: 80, y: 100, w: 1120, h: 480 };

// The inline-style half of the chip row: [key, label, tooltip label].
const STYLE_TOGGLES = [
  ['bold', 'B', 'Bold'],
  ['italic', 'I', 'Italic'],
  ['underline', 'U', 'Underline'],
  ['strike', 'S', 'Strikethrough'],
];

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
  // 1) the visual line the point is on ...
  let onLine = rows.filter((r) => y >= r.rect.top - 1 && y <= r.rect.bottom + 1);
  if (!onLine.length) {
    let bd = Infinity;
    for (let i = 0; i < rows.length; i++) {
      const d = Math.abs(y - (rows[i].rect.top + rows[i].rect.height / 2));
      if (d < bd) { bd = d; onLine = [rows[i]]; }
    }
  }
  // 2) ... then which run on that line the point actually falls inside.
  let chosen = onLine[0];
  let bd = Infinity;
  for (let i = 0; i < onLine.length; i++) {
    const r = onLine[i].rect;
    const d = x >= r.left - 1 && x <= r.right + 1 ? 0 : Math.abs(x - (r.left + r.width / 2));
    if (d < bd) { bd = d; chosen = onLine[i]; }
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
  gradient = false,
  gradientColor1 = '#f5f5f4',
  gradientColor2 = '#93c5fd',
  gradientAngle = 180,
  box: boxProp = DEFAULT_BOX,
  bgType = 'color',
  bgValue = '#000000',
  onTextChange,
  onBoxChange,
  onSizeChange,
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
  pad = 10,
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

  // A chip never edits the string — only the parallel span array — so no
  // character is inserted, the caret cannot move, and there is nothing for the
  // next keystroke to land inside of. It still has to read the textarea's own
  // (possibly uncommitted) text rather than the `text` prop, or it would drop
  // the last 150ms of typing.
  const applyStyle = (patch) => {
    const ta = taRef.current;
    const value = ta ? ta.value : taText;
    const start = ta ? (ta.selectionStart ?? sel.start) : sel.start;
    const end = ta ? (ta.selectionEnd ?? start) : sel.end;
    let from = start;
    let to = end;
    if (!(to > from)) [from, to] = lineSpanRange(value, lineIndexAt(value, start));
    const spans = applySpanPatch(taSpans, from, to, patch);
    setTaSpans(spans);
    taPendingRef.current = emitSpans(value, spans);
    sendTa();
    setSel({ start, end });
  };

  // The song editor's sidebar Typography panel drives this same thing, so
  // highlighting a word and clicking B there bolds that word, not the slide.
  if (apiRef) apiRef.current = { applyStyle, hasSelection: () => sel.end > sel.start };

  // Tell the sidebar what its buttons should light up on. Keyed on the ANSWER,
  // not on the caret, so moving the cursor never re-renders the whole modal.
  const selReportRef = useRef('');
  useEffect(() => {
    const state = { bold: tgtOn('bold'), italic: tgtOn('italic'), underline: tgtOn('underline'), strike: tgtOn('strike') };
    const key = `${hasSel}|${state.bold}|${state.italic}|${state.underline}|${state.strike}|${tgtScale}`;
    if (key === selReportRef.current) return;
    selReportRef.current = key;
    onSelectionChange?.({ active: hasSel, attrs: { ...state, scale: tgtScale } });
  });

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
  const dragRef = useRef(null);

  const caseTransform = caseMode === 'upper' ? 'uppercase' : caseMode === 'title' ? 'capitalize' : 'none';
  const overlayOn = editing && layoutMode !== 'ticker';

  const paintOverlay = () => {
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
    if (sel.end > sel.start) {
      const frag = document.createDocumentFragment();
      const strips = selectionRects(idx, sel.start, sel.end);
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
    const c = sel.end === sel.start && taText ? caretRect(idx, sel.start) : null;
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
      const d = dragRef.current;
      if (d) {
        window.removeEventListener('mousemove', d.move);
        window.removeEventListener('mouseup', d.up);
      }
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
  const onOverlayMouseDown = (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const ta = taRef.current;
    if (!ta) return;
    try { ta.focus({ preventScroll: true }); } catch (_) { ta.focus(); }
    const anchor = offsetAtPoint(e.clientX, e.clientY);
    selectRange(anchor, anchor);
    const move = (ev) => {
      const o2 = offsetAtPoint(ev.clientX, ev.clientY);
      selectRange(Math.min(anchor, o2), Math.max(anchor, o2));
    };
    const up = () => {
      dragRef.current = null;
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
    };
    dragRef.current = { move, up };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  };

  // Native double-click word selection runs off the textarea's own layout, so
  // it is suppressed with the rest of the defaults — re-expand it by text.
  const onOverlayDoubleClick = () => {
    const ta = taRef.current;
    if (!ta) return;
    const v = ta.value;
    const c = ta.selectionStart ?? 0;
    const isWord = (ch) => !!ch && /[\p{L}\p{N}'’-]/u.test(ch);
    let from = c;
    while (from > 0 && isWord(v[from - 1])) from -= 1;
    let to = c;
    while (to < v.length && isWord(v[to])) to += 1;
    if (to > from) selectRange(from, to);
  };

  const onOverlayScroll = () => {
    const ta = taRef.current;
    const root = layoutRef.current;
    // A cue taller than the box scrolls the textarea to reach the caret; the
    // rendered layer has to follow or text and caret split apart.
    if (ta && root && root.firstElementChild) root.firstElementChild.scrollTop = ta.scrollTop;
    paintOverlay();
  };

  committedRef.current = box;

  const previewing = !!previewAnim && previewAnim !== 'none';

  const lyricSt = {
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

  // ---- canvas <-> viewport scale -----------------------------------------
  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return undefined;
    const apply = () => {
      const w = el.clientWidth;
      if (!w) return;
      const s = w / CANVAS_W;
      setScale((prev) => (Math.abs(prev - s) < 0.0002 ? prev : s));
    };
    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // ---- geometry: React is the source of truth ----------------------------
  const applyBoxToDom = useCallback((b) => {
    const next = {
      left: `${b.x}px`,
      top: `${b.y}px`,
      width: `${b.w}px`,
      height: `${b.h}px`,
      transform: b.angle ? `rotate(${b.angle}deg)` : 'none',
    };
    if (displayBoxRef.current) Object.assign(displayBoxRef.current.style, next);
    if (editBoxRef.current) Object.assign(editBoxRef.current.style, next);
  }, []);

  // Runs after every commit so imperative gesture writes can never go stale
  // against the props (React skips a style write when its own diff sees no
  // change, which would otherwise leave the DOM parked at a dropped position).
  useLayoutEffect(() => {
    if (!gestureRef.current) applyBoxToDom(box);
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

  const boundBox = useCallback((oldBox, newBox) => {
    if (newBox.width < MIN_W || newBox.height < MIN_H) return oldBox;
    if (newBox.x + newBox.width < MIN_W) return oldBox;
    if (newBox.y + newBox.height < MIN_H) return oldBox;
    if (newBox.x > CANVAS_W - MIN_W) return oldBox;
    if (newBox.y > CANVAS_H - MIN_H) return oldBox;
    return newBox;
  }, []);

  const dragBound = useCallback((pos) => {
    const s = startBoxRef.current;
    const halfW = s.w / 2;
    const halfH = s.h / 2;
    const minX = KEEP_IN - halfW;
    const maxX = CANVAS_W - KEEP_IN + halfW;
    const minY = KEEP_IN - halfH;
    const maxY = CANVAS_H - KEEP_IN + halfH;
    return {
      x: Math.min(maxX, Math.max(minX, pos.x)),
      y: Math.min(maxY, Math.max(minY, pos.y)),
    };
  }, []);

  // Reconstructs the logical box from the node's current transform. Used live
  // during a gesture (to move the DOM lyrics under the cursor) and on end (to
  // commit). Does NOT mutate the node — scaling stays intact until commit.
  const boxFromNode = useCallback(() => {
    const g = groupRef.current;
    const s = startBoxRef.current;
    if (!g) return s;
    const w = Math.max(MIN_W, Math.round(s.w * g.scaleX()));
    const h = Math.max(MIN_H, Math.round(s.h * g.scaleY()));
    const cx = g.x();
    const cy = g.y();
    return {
      x: Math.round(cx - w / 2),
      y: Math.round(cy - h / 2),
      w,
      h,
      angle: Math.round((g.rotation() || 0) * 10) / 10,
    };
  }, []);

  const emitBox = useCallback((b) => {
    applyBoxToDom(b);
    onBoxChange?.(b);
  }, [applyBoxToDom, onBoxChange]);

  const handleDragStart = () => {
    startBoxRef.current = committedRef.current;
    gestureRef.current = true;
  };

  const handleDragMove = () => {
    const g = groupRef.current;
    const s = startBoxRef.current;
    if (!g) return;
    applyBoxToDom({
      x: Math.round(g.x() - s.w / 2),
      y: Math.round(g.y() - s.h / 2),
      w: s.w,
      h: s.h,
      angle: Math.round((g.rotation() || 0) * 10) / 10,
    });
  };

  const handleDragEnd = () => {
    gestureRef.current = false;
    const g = groupRef.current;
    const s = startBoxRef.current;
    if (!g) return;
    emitBox({
      x: Math.round(g.x() - s.w / 2),
      y: Math.round(g.y() - s.h / 2),
      w: s.w,
      h: s.h,
      angle: Math.round((g.rotation() || 0) * 10) / 10,
    });
  };

  const handleTransformStart = () => {
    startBoxRef.current = committedRef.current;
    gestureRef.current = true;
  };

  const handleTransform = () => {
    applyBoxToDom(boxFromNode());
  };

  const handleTransformEnd = () => {
    gestureRef.current = false;
    const g = groupRef.current;
    if (!g) return;
    const next = boxFromNode();
    const sy = g.scaleY();

    // Collapse the scale back into the box/font before React re-renders, so
    // the node and the incoming props describe the same geometry (no jump).
    g.scaleX(1);
    g.scaleY(1);
    g.offset({ x: next.w / 2, y: next.h / 2 });
    g.position({ x: next.x + next.w / 2, y: next.y + next.h / 2 });

    emitBox(next);

    // "Scale text" mode: dragging a handle writes the font size directly.
    // Fit/Fill leave the size alone — the shared auto-fit recomputes it.
    if (resizeMode === 'scale') {
      const nextSize = Math.round(Math.max(FONT_SIZE_MIN, Math.min(FONT_SIZE_MAX, fontSize * sy)));
      if (nextSize !== fontSize) onSizeChange?.(nextSize);
    }
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
    // In overlay mode the textarea fills the box instead of hugging its text —
    // its own geometry is invisible, and a full-height surface means a click
    // anywhere in the box lands on the caret instead of starting a drag.
    if (editing && !overlayOn) syncTaHeight();
  });

  // ---- shared sizing ------------------------------------------------------
  const { pad: layoutPad } = useMemo(() => lyricsLayoutMetrics(lyricSt, box), [lyricSt, box]);
  const taSize = useMemo(() => computeLyricsFontSize(text, lyricSt, box), [text, lyricSt, box]);

  const deco = [underline ? 'underline' : null, strike ? 'line-through' : null].filter(Boolean).join(' ') || 'none';
  // Mirror renderLyricsLayout's own gate: shadow is only real when it is
  // switched on (shadowBlur > 0) AND actually displaces or blurs something.
  const shadowOn = !!lyricSt.shadow && ((Number(shadowBlur) || 0) > 0 || (Number(shadowOffsetX) || 0) !== 0 || (Number(shadowOffsetY) || 0) !== 0);
  const animCSS = previewing ? transitionAnimation(previewAnim, previewSpeed) : '';

  const boxTransform = angle ? `rotate(${angle}deg)` : 'none';

  const pillTop = box.y >= 34 ? box.y - 26 : box.y + box.h + 4;

  return (
    <div ref={wrapRef} style={{ width: '100%', aspectRatio: '16 / 9', position: 'relative', overflow: 'hidden', borderRadius: 12, boxShadow: '0 12px 44px rgba(0,0,0,0.45)', border: '1px solid var(--ui-border2)' }}>
      {/* z0 — background layer */}
      {bgType === 'color' && (
        <div style={{ position: 'absolute', inset: 0, backgroundColor: bgValue || '#000000', zIndex: 0 }} />
      )}
      {bgType === 'image' && bgValue && (
        <img src={bgValue} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', zIndex: 0 }} draggable={false} />
      )}
      {bgType === 'video' && bgValue && (
        <video key={`bg-${bgValue}`} src={bgValue} autoPlay loop muted playsInline preload="metadata" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', zIndex: 0 }} />
      )}

      {/* z1 — the real lyrics, same renderer as the projector */}
      <div style={{ position: 'absolute', left: 0, top: 0, width: CANVAS_W, height: CANVAS_H, zIndex: 1, pointerEvents: 'none', transformOrigin: 'top left', transform: `scale(${scale})` }}>
        <div key={previewing ? `${previewAnim}-${previewTick}` : 'lyrics'} style={{ width: '100%', height: '100%', position: 'relative', animation: previewing ? animCSS : undefined }}>
          <div
            ref={displayBoxRef}
            style={{ position: 'absolute', left: box.x, top: box.y, width: box.w, height: box.h, transform: boxTransform, transformOrigin: 'center center', overflow: 'hidden' }}
          >
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
              renderLyricsLayout(text, lyricSt, box)
            )}
          </div>
        </div>
      </div>

      {/* z2 — Konva interaction layer (transparent) */}
      <Stage
        width={CANVAS_W}
        height={CANVAS_H}
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
            draggable={!cueLocked}
            dragBoundFunc={dragBound}
            onDragStart={handleDragStart}
            onDragMove={handleDragMove}
            onDragEnd={handleDragEnd}
            onTransformStart={handleTransformStart}
            onTransform={handleTransform}
            onTransformEnd={handleTransformEnd}
            onDblClick={startEdit}
            onDblTap={startEdit}
          >
            {/* Invisible on the scene canvas, opaque colourKey on the hit
                canvas — this is what makes the whole box grabbable. */}
            <Rect width={box.w} height={box.h} fill="rgba(0,0,0,0.001)" />
          </Group>
          <Transformer
            ref={trRef}
            nodes={trNodes}
            visible={!cueLocked && !editing}
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

      {/* z3 — native textarea, only while typing */}
      {editing && (
        <div style={{ position: 'absolute', left: 0, top: 0, width: CANVAS_W, height: CANVAS_H, zIndex: 3, pointerEvents: 'none', transformOrigin: 'top left', transform: `scale(${scale})` }}>
          <div
            ref={editBoxRef}
            style={{ position: 'absolute', left: box.x, top: box.y, width: box.w, height: box.h, transform: boxTransform, transformOrigin: 'center center', pointerEvents: 'auto' }}
          >
            <div style={{
              width: '100%',
              height: '100%',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: valign === 'top' ? 'flex-start' : valign === 'bottom' ? 'flex-end' : 'center',
              textAlign: textAlign || 'center',
              // In overlay mode the renderer owns the padding (it draws with
              // its own), and an unpadded textarea fills the whole box — so
              // every click inside it lands on the caret, never on the drag
              // layer underneath.
              padding: overlayOn ? 0 : layoutPad,
              boxSizing: 'border-box',
              overflow: 'hidden',
            }}>
              <textarea
                ref={taRef}
                value={taText}
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
                onInput={overlayOn ? undefined : syncTaHeight}
                onSelect={(ev) => setSel({ start: ev.target.selectionStart ?? 0, end: ev.target.selectionEnd ?? 0 })}
                onMouseDown={overlayOn ? onOverlayMouseDown : undefined}
                onDoubleClick={overlayOn ? onOverlayDoubleClick : undefined}
                onScroll={overlayOn ? onOverlayScroll : undefined}
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
                  height: overlayOn ? '100%' : undefined,
                  flexShrink: 0,
                  margin: 0,
                  border: 'none',
                  outline: 'none',
                  resize: 'none',
                  overflow: 'hidden',
                  boxSizing: 'border-box',
                  padding: overlayOn ? 0 : (highlight ? '3px 12px' : 0),
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
                  textShadow: !overlayOn && shadowOn ? `${Number(shadowOffsetX) || 0}px ${Number(shadowOffsetY) || 0}px ${Number(shadowBlur) || 0}px ${shadowColor || '#000000'}` : 'none',
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

      {/* z4 — mode badges + edit affordance */}
      {(fill || layoutMode === 'ticker' || resizeMode === 'scale') && (
        <div style={{ position: 'absolute', top: 8, left: 8, zIndex: 4, display: 'flex', gap: 6, pointerEvents: 'none' }}>
          {fill && <span style={badgeStyle.green}>FILL</span>}
          {layoutMode === 'ticker' && <span style={badgeStyle.cyan}>TICKER</span>}
          {resizeMode === 'scale' && <span style={badgeStyle.amber}>SCALE TEXT</span>}
        </div>
      )}
      {/* Line-scale chips. Only exist while editing, because they need a caret
          to say which line they mean — and they sit at top-right, where the
          FILL/TICKER badges (left) can never collide with them. */}
      {editing && (
        <div
          style={{ position: 'absolute', top: 8, right: 8, zIndex: 6, display: 'flex', alignItems: 'center', gap: 3, background: 'rgba(5,10,20,0.94)', border: '1px solid var(--ui-border2)', borderRadius: 999, padding: '3px 4px 3px 10px', boxShadow: '0 2px 10px rgba(0,0,0,0.5)' }}
          // A mousedown here must not blur the textarea: onBlur ends edit mode,
          // which would fire before the click and swallow it.
          onMouseDown={(ev) => ev.preventDefault()}
        >
          <span title={hasSel
            ? 'Sizes the HIGHLIGHTED text. Only that phrase changes — the rest of the slide keeps its size.'
            : 'Scales the line under the caret. Put each phrase on its own line (Enter) to size lines differently.'}
          style={{ fontSize: 9, fontWeight: 800, letterSpacing: 1, color: hasSel ? '#ffffff' : '#93c5fd', whiteSpace: 'nowrap', cursor: 'help' }}>
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
                style={{ minWidth: 32, background: on ? ACCENT : 'rgba(255,255,255,0.07)', border: `1px solid ${on ? ACCENT : 'rgba(255,255,255,0.16)'}`, color: on ? '#04121f' : '#cfe9ff', borderRadius: 999, padding: '3px 7px', fontSize: 10, fontWeight: 800, cursor: 'pointer', lineHeight: 1.4, fontFamily: 'inherit' }}
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
                  color: on ? '#04121f' : '#cfe9ff',
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
              style={{ pointerEvents: 'auto', background: 'rgba(5,10,20,0.82)', border: `1px solid ${ACCENT}`, color: '#93c5fd', borderRadius: 999, padding: '2px 9px', fontSize: 10, fontWeight: 800, letterSpacing: 0.4, cursor: 'pointer', whiteSpace: 'nowrap', lineHeight: 1.5, boxShadow: '0 2px 8px rgba(0,0,0,0.5)' }}
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
  green: { fontSize: 9, fontWeight: 800, letterSpacing: 1, padding: '3px 8px', borderRadius: 999, background: 'rgba(34,197,94,0.16)', color: '#4ade80', border: '1px solid rgba(34,197,94,0.45)' },
  cyan: { fontSize: 9, fontWeight: 800, letterSpacing: 1, padding: '3px 8px', borderRadius: 999, background: 'rgba(0,170,255,0.16)', color: '#93c5fd', border: '1px solid rgba(0,170,255,0.45)' },
  amber: { fontSize: 9, fontWeight: 800, letterSpacing: 1, padding: '3px 8px', borderRadius: 999, background: 'rgba(245,158,11,0.16)', color: '#fcd34d', border: '1px solid rgba(245,158,11,0.45)' },
};
