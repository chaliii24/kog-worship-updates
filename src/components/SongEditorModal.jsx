import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { Plus, Trash2, Image as ImageIcon, Video, AlignLeft, AlignCenter, AlignRight, AlignHorizontalJustifyCenter, AlignVerticalJustifyStart, AlignVerticalJustifyCenter, AlignVerticalJustifyEnd, Bold, Italic, Underline, Strikethrough, Wand2, KeyRound, Timer, Clock3, Save, Copy, ChevronUp, ChevronDown, Eye, EyeOff, Lock, Unlock, GripVertical, ChevronLeft, ChevronRight, Type, PenLine, BringToFront, SendToBack, Undo2, Redo2, Sparkles } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { TRANSITIONS, TRANSITION_KEYS, SPEED_OPTIONS, FONT_OPTIONS, FALLBACK_SYSTEM_FONTS } from '../lib/constants';
import { renderLyricsLayout, cueLyricStyle, stripMarkup, FONT_SIZE_MIN, FONT_SIZE_MAX, DEFAULT_LYRIC_SIZE, autoPadForSize, fitBoxToText, growBoxToText, restyleLineScales } from '../lib/lyrics';
import { useApp } from '../context/AppContext';
import { stubTap, iconBtnTap } from '../lib/anim';
import { Tabs, TabList, Tab, TabPanel } from '../untitledui/components/application/tabs/tabs';
import { toast } from '../untitledui/components/ui/toast';
import LyricsCanvasEditor from './LyricsCanvasEditor';
import FontPicker from './FontPicker';
import ColorPicker from '../untitledui/components/application/color-picker/color-picker';
import { TileVideo, TileCanvas } from '../lib/perf';

let sysFontCache = null;

// One-click glow colours for a highlighted word. Plain buttons (not a colour
// dialog) so mousedown can preventDefault: focus never leaves the canvas
// textarea, the highlight stays painted, and the colour lands on the live
// selection — no blur, no latch, no popup.
const GLOW_PRESETS = ['#22d3ee', '#f472b6', '#facc15', '#4ade80', '#c084fc', '#ffffff', '#fb923c', '#f87171', '#60a5fa', '#e879f9'];

const quoteFont = (family) => {
  const f = String(family || '').trim();
  if (!f) return f;
  if (f.startsWith('"') || f.startsWith("'")) return f;
  return /\s/.test(f) ? `"${f}"` : f;
};

const aiKeyBtn = (C) => ({
  background: C.panel,
  border: '1px solid var(--ui-border2)',
  color: C.accLine,
  borderRadius: 7,
  padding: '6px 11px',
  fontSize: 10.5,
  fontWeight: 700,
  cursor: 'pointer',
  fontFamily: 'inherit',
});

// Numeric field that lets you type freely. The raw text lives in local state
// while the field is focused, so clearing it shows an empty box (not a snapped
// fallback like 24) and typing "2" never rewrites itself mid-keystroke into
// "24". min/max are still enforced — the value is clamped as it is committed,
// and re-clamped for real when you leave the field — so only an absurdly big
// number gets limited.
function NumField({ value, onCommit, min = 0, max = Number.MAX_SAFE_INTEGER, decimal = false, style }) {
  const [draft, setDraft] = useState(null); // null = not editing, show `value`
  const inputRef = useRef(null);

  const clamp = (n) => Math.min(max, Math.max(min, n));
  const sanitize = (s) => (decimal
    ? s.replace(/[^\d.]/g, '').replace(/(\..*)\./, '$1')
    : s.replace(/\D/g, ''));

  // Parse what is typed right now. Empty / "." / 0-when-disallowed means
  // "nothing to commit yet" — the previous value simply holds.
  const parse = (raw) => {
    if (raw === '' || raw === '.') return null;
    const n = Number(raw);
    if (!Number.isFinite(n)) return null;
    if (n === 0 && min > 0) return null;
    return n;
  };

  const shown = draft !== null
    ? draft
    : (value === undefined || value === null || Number.isNaN(Number(value)) ? '' : String(value));

  // While focused the draft is king (typing "2" of "220" must not snap), but
  // a value that changes UNDERNEATH a focused field (undo, Apply-to-all, a
  // slider drag) must not sit there stale either — resync whenever `value`
  // moves and this field isn't the focused one.
  useEffect(() => {
    if (inputRef.current && document.activeElement === inputRef.current) return;
    setDraft(null);
  }, [value]);

  const onChange = (e) => {
    const raw = sanitize(e.target.value);
    setDraft(raw);
    const n = parse(raw);
    if (n === null) return; // hold the last good value while the field is empty
    // A still-partial number below the floor ("2" on the way to "220") stays
    // in the field only — the canvas keeps the last real value instead of
    // snapping to the minimum. The floor/ceiling apply on blur.
    if (n < min) return;
    const c = decimal ? Math.round(clamp(n) * 100) / 100 : Math.round(clamp(n));
    onCommit(c);
  };

  const finish = () => {
    const raw = draft;
    setDraft(null);
    if (raw === null) return;
    const n = parse(raw);
    if (n === null) return; // cleared the field: keep the last committed value
    const c = decimal ? Math.round(clamp(n) * 100) / 100 : Math.round(clamp(n));
    if (c !== value) onCommit(c);
  };

  return (
    <input
      ref={inputRef}
      type="text"
      inputMode={decimal ? 'decimal' : 'numeric'}
      value={shown}
      onFocus={(e) => { setDraft(e.target.value); e.target.select(); }}
      onChange={onChange}
      onBlur={finish}
      onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
      style={style}
    />
  );
}

// Targets for the footer's APPLY TO control — a picker, not an action; the
// Apply button beside it is what actually writes. The label for "Selected"
// gets a live count appended in the footer itself.
const APPLY_SCOPES = [
  { k: 'this', label: 'This Slide', tip: 'Leave the change where it is — on the slide you are editing' },
  { k: 'selected', label: 'Selected', tip: 'Target the slides you Ctrl+click in the list — Ctrl+click again to untick' },
  { k: 'all', label: 'All Slides', tip: 'Target every slide of the song, title slide included' },
];

export default function SongEditorModal() {
  const app = useApp();
  const {
    ACCENT,
    C,
    mediaLibrary,
    setIsEditorOpen,
    editorMode,
    setEditorMode,
    rawPasteText,
    setRawPasteText,
    isParsing,
    editingSong,
    setEditingSong,
    linesPerSlide,
    setLinesPerSlide,
    editorCueIdx,
    setEditorCueIdx,
    boxDrag,
    canvasScale,
    dragFrom,
    setDragFrom,
    showSlideProps,
    setShowSlideProps,
    aiStatus,
    processAiAutofix,
    cueHasBackground,
    songHasBackground,
    processAutoPaste,
    moveCue,
    duplicateCue,
    setCueBackground,
    cueFileToBackground,
    setSongBackground,
    songBgFileToBackground,
    clearCueBackground,
    splitCuesToLines,
    editorCue,
    editorBox,
    updateCue,
    updateCueThrottled,
    applyPatchToAllCues,
    baseGroupLabel,
    splitCueAtTextareaCaret,
    reorderCues,
    ToolbarBtn,
    cueLyricStyle,
    handleSaveSong,
    resolveBg,
    DEFAULT_BOX
  } = app;

  const [hoverAnim, setHoverAnim] = useState(null);
  const [previewTick, setPreviewTick] = useState(0);
  const hoverTimeoutRef = useRef(null);
  // Live view of what the canvas textarea has highlighted. With a highlight,
  // the Typography toggles below style THAT text instead of the whole slide —
  // the same buttons, scoped to what the user actually selected.
  const canvasApiRef = useRef(null);
  const [canvasSel, setCanvasSel] = useState(null);
  const selMode = !!canvasSel?.active;
  // Sticky highlight for the glow colour swatch: opening the native colour
  // dialog blurs the canvas textarea, onBlur ends edit mode and wipes the live
  // selection — so the offsets are latched here while the highlight is alive
  // and the colour is painted onto them (live, per onInput) no matter what has
  // focus when the dialog closes. `glowPicking` keeps the panel — and its
  // swatch — statically on screen while the dialog is open instead of
  // unmounting the moment the highlight collapses.
  const selLatchRef = useRef(null);
  const [glowPicking, setGlowPicking] = useState(false);
  const glowColorRef = useRef(null);
  useEffect(() => {
    if (canvasSel?.active) selLatchRef.current = canvasSel;
  }, [canvasSel]);
  const glowSel = selMode ? canvasSel : (glowPicking ? selLatchRef.current : null);
  const glowSelActive = !!(glowSel && glowSel.active);
  const paintGlowSelection = (color) => {
    // Live highlight wins; the latch covers the dialog session, during which
    // the textarea is blurred and the live selection is already gone.
    const r = (canvasSel?.active ? canvasSel : null) || selLatchRef.current;
    if (!r || !(r.to > r.from)) return false;
    canvasApiRef.current?.applyStyleToRange?.({ glow: color }, r.from, r.to);
    return true;
  };
  const finishGlowPick = () => {
    // A finished pick consumes the latch: later swatch visits with no live
    // highlight must mean the whole slide, never a word from last time.
    selLatchRef.current = null;
    setGlowPicking(false);
  };
  // A different slide must never inherit the previous slide's highlight.
  useEffect(() => { selLatchRef.current = null; setGlowPicking(false); }, [editorCueIdx]);
  // The slide-level glow swatch is uncontrolled while the dialog is open, so
  // React never resets its value mid-drag (that reset is what made the picker
  // stutter). This syncs it back for outside changes — undo, apply-to-all,
  // slide switch — but never while a pick is in flight.
  useEffect(() => {
    if (glowPicking || !glowColorRef.current || !editorCue) return;
    const want = (editorCue.glowColor || '#22d3ee').toLowerCase();
    if (glowColorRef.current.value.toLowerCase() !== want) glowColorRef.current.value = editorCue.glowColor || '#22d3ee';
  }, [editorCue?.glowColor, glowPicking, editorCueIdx]);

  // --- inline slide rename -------------------------------------------------
  // The Label field lives inside Slide Properties, which is collapsed by
  // default, so a slide you had just added had no obvious place to be named.
  // Double-click a slide's name to edit it in place; "New Slide" opens the
  // field straight away so it can be typed before doing anything else.
  // `renameFrom` keeps the field in the list it was opened from — both lists
  // show every slide, so two inputs for one slide would fight over focus.
  // --- split prompt (ask BEFORE parsing) -----------------------------------
  // Parse & Build Blocks asks first how many lyric lines each slide keeps —
  // that count is exactly what splitCuesByLines turns into "(Part n)" groups,
  // so the generated blocks come out accurate instead of inheriting whatever
  // number the sidebar last held. Confirmed value also becomes the
  // sidebar/Split default (setLinesPerSlide).
  const [splitPrompt, setSplitPrompt] = useState(null); // null | 'parse'
  const [splitN, setSplitN] = useState('');

  const openSplitPrompt = (kind) => {
    // Nothing to parse yet? Let the action raise its own alert instead of
    // asking for a split count nobody can use.
    if (kind === 'parse' && !rawPasteText.trim()) { processAutoPaste(); return; }
    setSplitN(String(Math.max(1, Math.min(12, Math.floor(Number(linesPerSlide) || 4)))));
    setSplitPrompt(kind);
  };

  const runSplitPrompt = () => {
    const parsed = Math.floor(Number(splitN));
    const n = Math.max(1, Math.min(12, Number.isFinite(parsed) && parsed > 0 ? parsed : 4));
    const kind = splitPrompt;
    setSplitPrompt(null);
    setLinesPerSlide(n);
    // Passed explicitly: setState is async, the parse closure would still see
    // the OLD linesPerSlide if we relied on the state update landing first.
    if (kind === 'parse') processAutoPaste(undefined, { linesPerSlide: n });
  };

  const [renameIdx, setRenameIdx] = useState(null);
  const [renameFrom, setRenameFrom] = useState('strip');
  // Identity anchor: renameIdx is positional, so a reorder/delete/split
  // between double-click and Enter must resolve by id, not by stale index.
  const [renameId, setRenameId] = useState(null);
  const [renameVal, setRenameVal] = useState('');
  // { i, side } insertion marker for drag-and-drop.
  const [dropHint, setDropHint] = useState(null);
  const renameRef = useRef(null);
  const renameAbortedRef = useRef(false);

  // --- "applied to every slide" confirmation -------------------------------
  // These buttons rewrite every slide at once and the result looks identical
  // to doing nothing, so a click gave no sign it had landed. The Untitled UI
  // toast stack (mounted once in App) names what was just applied; real
  // writes also carry Undo — Apply lands in the editor history, so one click
  // takes it back.
  const confirmApplied = (message, { type = 'success', title = 'Applied', undoable = false } = {}) => {
    toast.add({
      title,
      description: message,
      type,
      duration: undoable ? 5600 : 4200,
      ...(undoable ? { actionProps: { children: 'Undo', onClick: () => undo() } } : {}),
    });
  };

  // --- APPLY TO scope (footer) --------------------------------------------
  // The footer's three-way control says WHERE this slide's look is pushed:
  // 'this' is the resting state (the change is already here), 'selected' is
  // the set ticked with Ctrl/⌘-click in the slide lists (−1 = title slide),
  // 'all' rewrites the whole song. Session-only — it dies with the modal.
  const [applyScope, setApplyScope] = useState('this');
  const [applySel, setApplySel] = useState([]);
  const [applyHover, setApplyHover] = useState(null);
  const toggleApplySel = (i) => setApplySel(s => (s.includes(i) ? s.filter(x => x !== i) : [...s, i]));
  // Plain click opens the slide; Ctrl/⌘-click ticks it for "Selected".
  const slideClick = (e, i) => {
    if (e.ctrlKey || e.metaKey) { toggleApplySel(i); return; }
    setEditorCueIdx(i);
  };
  // Adding, deleting, splitting or duplicating slides shifts every index in
  // applySel, so a stale tick would rewrite the WRONG slide. Any change to the
  // count throws the set away rather than guessing; reorders clear it in
  // dropCue / moveCue below for the same reason.
  useEffect(() => { setApplySel([]); }, [(editingSong.cues || []).length]);

  // --- one apply-to-all ----------------------------------------------------
  // There used to be five separate buttons (align, font, case, style, anim),
  // one per panel, so nothing — not even a font-size change — could reach the
  // rest of the song from a single place. One button now copies every visual
  // setting the sidebar controls onto the title slide and every cue.
  // Layout/resize mode, padding, timing and notes are deliberately left out:
  // those vary slide to slide instead of being a look.
  // The style fields the box fitter measures with: wrap points depend on the
  // face, weight, italic and tracking, so fitting without them guessed at the
  // wrong font and the box came out short (top line clipped on the canvas).
  const fitStFor = (c, size) => ({
    font: c.font,
    size: size ?? c.size,
    lineHeight: c.lineHeight,
    caseMode: c.case,
    pad: c.pad,
    bold: c.bold,
    italic: c.italic,
    letterSpacing: c.letterSpacing,
    highlight: c.highlight,
    fill: c.resizeMode === 'fill',
  });

  const visualPatchFrom = (c) => ({
    font: c.font || FONT_OPTIONS[0].value,
    size: c.size || DEFAULT_LYRIC_SIZE,
    lineHeight: c.lineHeight || 1.05,
    letterSpacing: c.letterSpacing || 0,
    bold: c.bold !== false,
    italic: !!c.italic,
    underline: !!c.underline,
    strike: !!c.strike,
    case: c.case || 'none',
    align: c.align || 'center',
    valign: c.valign || 'middle',
    color: c.color || '#ffffff',
    shadow: !!c.shadow,
    shadowColor: c.shadowColor || '#000000',
    shadowBlur: c.shadowBlur ?? 14,
    shadowOffsetX: c.shadowOffsetX ?? 0,
    shadowOffsetY: c.shadowOffsetY ?? 4,
    glow: !!c.glow,
    glowColor: c.glowColor || '#22d3ee',
    glowBlur: c.glowBlur ?? 18,
    outline: !!c.outline,
    strokeColor: c.strokeColor || '#000000',
    strokeWidth: c.strokeWidth ?? 1.5,
    gradient: !!c.gradient,
    gradientColor1: c.gradientColor1 || '#f5f5f4',
    gradientColor2: c.gradientColor2 || '#93c5fd',
    gradientAngle: c.gradientAngle ?? 180,
    highlight: !!c.highlight,
    hlOpacity: c.hlOpacity ?? 40,
    anim: c.anim || 'none',
    speed: c.speed ?? 0.5,
  });

  // --- undo / redo ----------------------------------------------------------
  // The draft IS editingSong, so a snapshot is just the previous object and
  // React's immutability means every snapshot SHARES the cues it did not
  // touch — a whole song's history costs almost nothing. Changes are recorded
  // as BURSTS, closed by 1.2s of silence: typing and dragging the box fire
  // dozens of updates a second and one undo step per keystroke helps nobody.
  // A bulk write (Apply) calls breakHist() first so it lands in a step of its
  // own and a single Ctrl+Z takes back exactly that and nothing else.
  const HIST_GAP = 1200;
  const HIST_MAX = 150;
  const histRef = useRef({ past: [], future: [], last: null, at: 0, locked: false });
  const [hist, setHist] = useState({ undo: false, redo: false });
  const syncHist = () => {
    const h = histRef.current;
    const canUndo = h.past.length > 0;
    const canRedo = h.future.length > 0;
    setHist((p) => (p.undo === canUndo && p.redo === canRedo ? p : { undo: canUndo, redo: canRedo }));
  };
  const breakHist = () => { histRef.current.at = 0; };

  useEffect(() => {
    const h = histRef.current;
    // An undo/redo step is not an edit — record nothing and leave the redo
    // stack alone, or redo would clear itself the moment it is used.
    if (h.locked) { h.locked = false; h.last = editingSong; return; }
    if (h.last === editingSong) return;
    const now = Date.now();
    if (h.last && now - h.at > HIST_GAP) {
      h.past.push(h.last);
      if (h.past.length > HIST_MAX) h.past.shift();
      h.at = now;
    }
    h.last = editingSong;
    h.future = [];
    syncHist();
  }, [editingSong]);

  const jumpTo = (next) => {
    const h = histRef.current;
    if (!h.last || !next) return;
    h.locked = true;
    h.at = 0;
    setEditingSong(next);
    // Undo can take away the very slide that is open.
    setEditorCueIdx((i) => Math.max(-1, Math.min(i, (next.cues || []).length - 1)));
    syncHist();
  };

  const undo = () => {
    const h = histRef.current;
    if (!h.past.length || !h.last) return;
    const prev = h.past.pop();
    if (!prev) return;
    h.future.push(h.last);
    jumpTo(prev);
  };

  const redo = () => {
    const h = histRef.current;
    if (!h.future.length || !h.last) return;
    const next = h.future.pop();
    if (!next) return;
    h.past.push(h.last);
    jumpTo(next);
  };

  // Ctrl+Z — plus the two redo spellings every other app accepts. Wired here
  // instead of left to the textarea, whose native undo only ever steps back
  // over TEXT: a wrong size or a deleted slide would sit there grinning.
  // preventDefault() is what hands the key to us.
  //
  // Plain text fields keep NATIVE undo: the canvas textarea carries
  // data-kog-canvas (its spans ride outside the string, so only song-history
  // undo is coherent there), but Song Title / Artist / Label / notes / rename
  // / search inputs are ordinary text — hijacking their Ctrl+Z rewound the
  // whole song instead of the last word typed.
  useEffect(() => {
    const onKey = (e) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      const k = (e.key || '').toLowerCase();
      if (k !== 'z' && k !== 'y') return;
      const t = e.target;
      const tag = t && t.tagName;
      const plainText = (tag === 'INPUT' || tag === 'TEXTAREA' || (t && t.isContentEditable))
        && !(t && t.dataset && t.dataset.kogCanvas);
      if (plainText) return; // let the field undo itself
      if (k === 'z' && !e.shiftKey) { e.preventDefault(); undo(); }
      else if (k === 'z' || k === 'y') { e.preventDefault(); redo(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const applyTypographyToAll = () => {
    breakHist();
    const c = editorCue;
    if (!c) return;
    applyPatchToAllCues(visualPatchFrom(c));
    confirmApplied('Typography applied to every slide', { undoable: true });
  };

  // Footer APPLY TO: the three segments only CHOOSE the target — they never
  // rewrite anything by themselves. The Apply button beside them does the
  // work, and it only exists when there is work to do (scope = "Selected"
  // with nothing ticked shows it greyed out instead). Cancel still throws the
  // whole edit away, so a mis-apply is never permanent.
  //
  // What travels is the whole LOOK, not just the type: geometry too, because
  // in Fit mode the box decides how big the words render — copying the font
  // without the box can never be "the same". The per-line sizes travel line
  // by line over each target's own words (the lyrics differ, the sizes don't).
  // What is being copied, by NAME: the source slide's first line. Without it
  // a toast that only counts slides cannot tell a real copy apart from ticking
  // the very slide you are already standing on — which changes nothing.
  const srcName = () => {
    const first = stripMarkup(editorCue ? editorCue.text || '' : '').split('\n').map((s) => s.trim()).filter(Boolean)[0] || '';
    const short = first.length > 38 ? `${first.slice(0, 37)}…` : first;
    return short ? `\u201c${short}\u201d` : 'this slide';
  };

  const applyToScope = (scope) => {
    setApplyScope(scope);
    const c = editorCue;
    if (!c) return;
    if (scope === 'this') { confirmApplied('Changes stay on this slide'); return; }
    const patch = { ...visualPatchFrom(c) };
    if (c.box) patch.box = c.box;
    patch.resizeMode = c.resizeMode || 'fit';
    patch.fillMin = c.fillMin ?? 18;
    patch.fillMax = c.fillMax ?? 165;
    // Only an explicit pad travels — a cue on auto padding stays on auto and
    // re-derives its gutter from the applied size.
    if (c.pad != null) patch.pad = c.pad;

    const cues = editingSong.cues || [];
    const sel = scope === 'all' ? cues.map((_, i) => i) : applySel.filter(i => i >= 0 && i < cues.length);
    const hasTitle = !!editingSong.title_cue && (scope === 'all' || applySel.includes(-1));
    if (!sel.length && !hasTitle) {
      confirmApplied(applySel.length ? 'Nothing to apply to — tick a slide below' : 'Ctrl+click slides in the list to select them', { type: 'info', title: 'Pick slides first' });
      return;
    }
    const hit = new Set(sel);
    const srcText = c.text || '';
    const restyle = (t) => restyleLineScales(srcText, t || '');
    // Typography travels with a refitted box: the applied size is only honoured
    // if each target's OWN text fits its box at that size — measured with the
    // target's own face, since patch.font travels with it. Fill mode exempt —
    // there the box sets the size, so moving it would change fill's answer.
    const refit = (next) => ({ ...next, box: fitBoxToText(next.text || '', fitStFor(next), next.box) });
    breakHist(); // one Ctrl+Z takes back the whole Apply, not 1.2s of it
    // Functional: the canvas 150ms trailing write may still hold the latest
    // keystroke/slider value — committing against this closure's stale draft
    // would drop it. The title keeps its own words: lyric line-scales mean
    // nothing on a one-line title and only injected junk markers into it.
    setEditingSong((prev) => ({
      ...prev,
      title_cue: hasTitle ? refit({ ...(prev.title_cue || {}), ...patch }) : prev.title_cue,
      cues: (prev.cues || []).map((cu, i) => (hit.has(i) ? refit({ ...cu, ...patch, text: restyle(cu.text) }) : cu)),
    }));
    // The ticks have done their job. Leave every slide unchecked so the next
    // Apply has to be aimed again — otherwise the last selection is still lit
    // and a second press silently re-applies to it.
    setApplySel([]);
    const n = hit.size + (hasTitle ? 1 : 0);
    const from = srcName();
    const selfOnly = scope !== 'all' && hit.size === 1 && hit.has(editorCueIdx) && !hasTitle;
    confirmApplied(
      selfOnly
        ? `Nothing changed — ${from} is the slide you\u2019re on`
        : scope === 'all'
          ? `Copied ${from} to every slide (${n})`
          : `Copied ${from} to ${n} slide${n === 1 ? '' : 's'}`,
      selfOnly
        ? { type: 'info', title: 'No change' }
        : { undoable: true },
    );
  };

  // --- bring-your-own Gemini key -------------------------------------------
  // The installer ships no key (a secret packed into a public release asset is
  // public), so the operator supplies their own. With no key, Smart Paste
  // falls back to the local parser — that is the intended default, not an
  // error, so this panel explains it instead of leaving a silent surprise.
  const geminiIpc = (typeof window !== 'undefined' && window.require)
    ? window.require('electron').ipcRenderer
    : null;
  const [aiKey, setAiKey] = useState(null);        // { hasKey, masked } | null = loading
  const [aiKeyInput, setAiKeyInput] = useState('');
  const [aiKeyMsg, setAiKeyMsg] = useState(null);  // { ok, text }
  const [aiKeyBusy, setAiKeyBusy] = useState(false);
  const aiKeyMsgRef = useRef(null);

  // Errors stay put so they can be read; success fades like the apply toast.
  const setAiKeyNote = (msg) => {
    setAiKeyMsg(msg);
    clearTimeout(aiKeyMsgRef.current);
    if (msg && msg.ok) aiKeyMsgRef.current = setTimeout(() => setAiKeyMsg(null), 3200);
  };
  useEffect(() => () => clearTimeout(aiKeyMsgRef.current), []);

  const refreshAiKey = async () => {
    if (!geminiIpc) return;
    try { setAiKey(await geminiIpc.invoke('gemini-status')); } catch { /* main not ready */ }
  };
  useEffect(() => { refreshAiKey(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const saveAiKey = async () => {
    if (!geminiIpc || aiKeyBusy) return;
    const value = aiKeyInput.trim();
    if (!value) return;
    setAiKeyBusy(true);
    setAiKeyMsg(null);
    try {
      const res = await geminiIpc.invoke('gemini-set-key', value);
      setAiKey(res);
      if (res.error) setAiKeyNote({ ok: false, text: res.error });
      else { setAiKeyInput(''); setAiKeyNote({ ok: true, text: 'Key saved on this computer.' }); }
    } catch { setAiKeyNote({ ok: false, text: 'Could not reach the app.' }); }
    setAiKeyBusy(false);
  };

  const clearAiKey = async () => {
    if (!geminiIpc || aiKeyBusy) return;
    setAiKeyBusy(true);
    setAiKeyMsg(null);
    try {
      const res = await geminiIpc.invoke('gemini-clear-key');
      setAiKey(res);
      setAiKeyNote({ ok: true, text: 'Key removed — Smart Paste now uses the local parser.' });
    } catch { setAiKeyNote({ ok: false, text: 'Could not reach the app.' }); }
    setAiKeyBusy(false);
  };

  const testAiKey = async () => {
    if (!geminiIpc || aiKeyBusy) return;
    setAiKeyBusy(true);
    setAiKeyMsg(null);
    try {
      const res = await geminiIpc.invoke('gemini-test-key');
      setAiKeyNote(res.ok
        ? { ok: true, text: 'Key works — Gemini answered.' }
        : { ok: false, text: res.error || 'Gemini did not accept that key.' });
    } catch { setAiKeyNote({ ok: false, text: 'Could not reach the app.' }); }
    setAiKeyBusy(false);
  };

  const openKeyPage = () => {
    try { window.require('electron').shell.openExternal('https://aistudio.google.com/apikey'); } catch { /* noop */ }
  };

  useEffect(() => {
    if (renameIdx == null) return;
    const el = renameRef.current;
    if (!el) return;
    el.focus();
    el.select();
    // The filmstrip scrolls — bring the field you just opened into view.
    try { el.scrollIntoView({ block: 'nearest' }); } catch (_) { /* older engines */ }
  }, [renameIdx]);

  const startRename = (i, cue, from) => {
    if (i == null || i < 0 || !cue) return;
    renameAbortedRef.current = false;
    setRenameIdx(i);
    setRenameId(cue.id ?? null);
    setRenameVal(cue.label || '');
    setRenameFrom(from || 'strip');
    // Renaming is not navigating: opening the field no longer yanks the
    // canvas to that slide as a side effect.
  };

  const commitRename = () => {
    if (renameIdx == null) return;
    // Escape unmounts the field, which fires blur afterwards — that blur must
    // not resurrect the edit Escape just threw away.
    if (renameAbortedRef.current) { renameAbortedRef.current = false; return; }
    const label = renameVal.trim();
    const cues = editingSong.cues || [];
    // Resolve by id first: the row may have moved since double-click. A cue
    // with no id (fresh duplicate) falls back to the index; a cue that no
    // longer exists aborts instead of renaming whoever sits there now.
    let at = renameIdx;
    if (renameId != null) {
      const found = cues.findIndex(c => c && c.id === renameId);
      if (found === -1) { setRenameIdx(null); return; }
      at = found;
    }
    const prev = cues[at];
    setRenameIdx(null);
    if (label && prev && label !== (prev.label || '')) updateCue(at, { label });
  };

  const cancelRename = () => {
    renameAbortedRef.current = true;
    setRenameIdx(null);
  };

  // --- drag to reorder -----------------------------------------------------
  // Remove-then-insert shifts every index after the source, so "before/after
  // the target" has to be resolved against the ORIGINAL indices: dragging down
  // lands after the target, dragging up lands before it. Either way the result
  // is stable, which a bare `reorderCues(from, i)` was not.
  const dropIndexFor = (from, i, side) => {
    if (from == null || i == null || from === i) return null;
    return side === 'after' ? (from < i ? i : i + 1) : (from < i ? i - 1 : i);
  };

  const sectionOf = (label) => String(label || '').replace(/\s*\(Part\s+\d+\)\s*$/i, '').trim();

  // "(Part N)" numbers the chunks of ONE section. When a slide joins another
  // section it gets the next free number there, so it reads as part of it.
  const nextPartLabel = (cues, targetLabel) => {
    const section = sectionOf(targetLabel);
    if (!section) return targetLabel;
    let max = 0;
    let anyPart = false;
    cues.forEach(c => {
      if (sectionOf(c.label) !== section) return;
      const m = /\(Part\s+(\d+)\)\s*$/i.exec(String(c.label || ''));
      if (m) { anyPart = true; max = Math.max(max, Number(m[1]) || 0); }
    });
    return anyPart ? `${section} (Part ${max + 1})` : section;
  };

  // The filmstrip is grouped by label, so a slide that changes position but
  // keeps its old section label would visually go nowhere. Dropping into a
  // different group therefore moves it into that section too.
  const dropCue = (from, i, side, joinSection = true) => {
    const cues = [...(editingSong.cues || [])];
    const to = dropIndexFor(from, i, side);
    setDragFrom(null);
    setDropHint(null);
    if (to == null || !cues[from] || !cues[i]) return;
    const moved = cues[from];
    const target = cues[i];
    cues.splice(from, 1);
    cues.splice(Math.max(0, Math.min(cues.length, to)), 0, moved);
    const landed = cues.indexOf(moved);
    if (joinSection && baseGroupLabel(moved.label) !== baseGroupLabel(target.label)) {
      cues[landed] = { ...cues[landed], label: nextPartLabel(cues, target.label) };
    }
    setEditingSong({ ...editingSong, cues });
    setEditorCueIdx(landed);
    // Indices in the "Selected" set just moved; start over rather than apply
    // this slide's look to whichever cue now sits at the old index.
    setApplySel([]);
  };

  const dragStart = (e, i) => {
    try {
      e.dataTransfer.setData('text/plain', String(i));
      e.dataTransfer.effectAllowed = 'move';
    } catch (_) { /* dataTransfer can be absent in tests */ }
    setDragFrom(i);
  };

  // Which half of the tile the pointer is over decides insert-before vs
  // insert-after, so the last slide in a list can still be dropped behind.
  // dragover BUBBLES — without stopPropagation the group container underneath
  // would immediately null out the marker this just set.
  const dragOverTile = (e, i) => {
    e.preventDefault();
    e.stopPropagation();
    try { e.dataTransfer.dropEffect = 'move'; } catch (_) { /* noop */ }
    const r = e.currentTarget.getBoundingClientRect();
    const side = e.clientX < r.left + r.width / 2 ? 'before' : 'after';
    if (!dropHint || dropHint.i !== i || dropHint.side !== side) setDropHint({ i, side });
  };

  const dropOnTile = (e, i, joinSection = true) => {
    e.preventDefault();
    e.stopPropagation();
    dropCue(dragFrom, i, dropHint && dropHint.i === i ? dropHint.side : 'before', joinSection);
  };

  const dragEnded = () => { setDragFrom(null); setDropHint(null); };

  // System fonts via Local Font Access API (falls back to a curated Windows list).
  const [sysFonts, setSysFonts] = useState(() => sysFontCache || FALLBACK_SYSTEM_FONTS);
  useEffect(() => {
    if (sysFontCache) return;
    let alive = true;
    (async () => {
      try {
        if (typeof window !== 'undefined' && window.queryLocalFonts) {
          const fonts = await window.queryLocalFonts();
          const fams = [...new Set(fonts.map(f => f.family).filter(Boolean))].sort((a, b) => a.localeCompare(b));
          if (alive && fams.length) {
            sysFontCache = fams;
            setSysFonts(fams);
            return;
          }
        }
      } catch (_) { /* fall through to fallback list */ }
      if (alive) sysFontCache = FALLBACK_SYSTEM_FONTS;
    })();
    return () => { alive = false; };
  }, []);

  const fontChoices = useMemo(() => {
    const current = editorCue?.font || FONT_OPTIONS[0].value;
    const opts = [];
    opts.push(...FONT_OPTIONS);
    for (const fam of sysFonts) {
      const value = quoteFont(fam);
      opts.push({ label: fam, value });
    }
    if (current && !opts.some(o => o.value === current)) {
      opts.unshift({ label: current, value: current });
    }
    return opts;
  }, [sysFonts, editorCue?.font]);

  // A PAGE, not a modal: App mounts this in the MAIN WORKSPACE slot (under
  // TopHeader) while the console subtree is unmounted. Full-bleed flex child —
  // no backdrop layer, no entrance animation, so a keystroke renders only the
  // editor instead of the whole console behind a translucent overlay.
  return (
    <div style={{ position: 'relative', flex: 1, minHeight: 0, background: C.bg, display: 'flex' }}>
      <div style={{ background: C.panel, flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden', position: 'relative' }}>

    {/* ===== TABS SHELL — Untitled UI (migration phase 3, song editor):
 Manual/Auto switch the body panels below. RAC unmounts the inactive
 TabPanel, so behaviour matches the old ternary exactly. */}
    <Tabs selectedKey={editorMode} onSelectionChange={setEditorMode} className="box-border flex-1 min-h-0">

    {/* ===== HEADER ===== */}
    <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--ui-border2)', display: 'flex', alignItems: 'center', gap: 14, flexShrink: 0, flexWrap: 'wrap' }}>
      <h2 style={{ margin: 0, fontSize: '15px', fontWeight: 800, whiteSpace: 'nowrap' }}>{editingSong.id ? 'Edit Song' : 'Add New Song'}</h2>
      <TabList type="button-brand" size="sm">
        <Tab id="manual">Manual Builder</Tab>
        <Tab id="auto" icon={Wand2}>Smart Auto-Paste</Tab>
      </TabList>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flex: 1, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
        <div style={{ flex: '0 1 220px', minWidth: 120 }}>
          <input type="text" value={editingSong.title} onChange={(e) => { const title = e.target.value; setEditingSong({ ...editingSong, title, title_cue: editingSong.title_cue ? { ...editingSong.title_cue, text: title } : editingSong.title_cue }); }} placeholder="Song title" style={{ width: '100%', background: C.elevated2, border: '1px solid var(--ui-border2)', borderRadius: 8, padding: '7px 10px', color: C.text, fontSize: 13, outline: 'none', boxSizing: 'border-box' }} />
        </div>
        <div style={{ flex: '0 1 150px', minWidth: 100 }}>
          <input type="text" value={editingSong.artist} onChange={(e) => setEditingSong({ ...editingSong, artist: e.target.value })} placeholder="Artist" style={{ width: '100%', background: C.elevated2, border: '1px solid var(--ui-border2)', borderRadius: 8, padding: '7px 10px', color: C.text, fontSize: 13, outline: 'none', boxSizing: 'border-box' }} />
        </div>
        <select value={editingSong.category} onChange={(e) => setEditingSong({ ...editingSong, category: e.target.value })} style={{ background: C.elevated2, color: C.text, border: '1px solid var(--ui-border2)', borderRadius: 8, padding: '7px 8px', fontSize: 12, outline: 'none' }}>
          <option value="Worship">Worship</option>
          <option value="Praise">Praise</option>
          <option value="Hymn">Hymn</option>
        </select>
      </div>
    </div>

    {/* ===== BUSY / LOADING OVERLAY ===== */}
    <AnimatePresence>
      {isParsing && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }} style={{ position: 'absolute', inset: 0, zIndex: 50, background: 'rgba(5,5,9,0.82)', backdropFilter: 'blur(6px)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16 }}>
          <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 0.9, ease: 'linear' }} style={{ width: 52, height: 52, borderRadius: '50%', border: '3px solid rgba(139,92,246,0.22)', borderTopColor: ACCENT, boxSizing: 'border-box' }} />
          <div style={{ fontSize: 15, fontWeight: 800, color: C.text }}>Parsing lyrics & building blocks…</div>
          <div style={{ fontSize: 12, color: C.faint, maxWidth: 440, textAlign: 'center', lineHeight: 1.55 }}>
            Detecting sections and splitting your song into slides. This can take a few seconds.
          </div>
        </motion.div>
      )}
    </AnimatePresence>

    {/* ===== SPLIT PROMPT — how many lyric lines per slide, asked BEFORE the
        parse runs. Number → splitCuesByLines → accurate "(Part n)" groups. */}
    <AnimatePresence>
      {splitPrompt && (
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.16 }}
          onClick={(e) => { if (e.target === e.currentTarget) setSplitPrompt(null); }}
          style={{ position: 'absolute', inset: 0, zIndex: 60, background: 'rgba(5,5,9,0.72)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
        >
          <motion.div
            initial={{ scale: 0.96, y: 10 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.97, opacity: 0 }} transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
            onKeyDown={(e) => {
              if (e.key === 'Escape') { e.preventDefault(); setSplitPrompt(null); }
              else if (e.key === 'Enter' && e.target.tagName !== 'BUTTON') { e.preventDefault(); runSplitPrompt(); }
            }}
            role="dialog" aria-modal="true" aria-label="Lyric lines per slide"
            style={{ width: 'min(420px, 100%)', background: C.panel, border: '1px solid var(--ui-border2)', borderRadius: 14, boxShadow: '0 24px 70px rgba(0,0,0,0.55)', padding: '20px 22px' }}
          >
            <div style={{ fontSize: 15, fontWeight: 800, color: C.text, marginBottom: 6 }}>How many lyric lines per slide?</div>
            <div style={{ fontSize: 12, color: C.faint, lineHeight: 1.6, marginBottom: 14 }}>
              Each slide keeps up to this many lines — longer sections continue as <b style={{ color: C.accLine, fontWeight: 700 }}>(Part 2, Part 3…)</b>. This decides how the {splitPrompt === 'fetch' ? 'fetched page' : 'pasted lyrics'} split into blocks.
            </div>
            <div style={{ display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' }}>
              {[1, 2, 3, 4, 6, 8].map((n) => {
                const active = String(n) === String(splitN);
                return (
                  <button key={n} onClick={() => setSplitN(String(n))} style={{ minWidth: 38, padding: '6px 0', borderRadius: 8, fontSize: 12, fontWeight: 800, cursor: 'pointer', background: active ? ACCENT : C.input, color: active ? '#fff' : C.text2, border: active ? '1px solid ' + ACCENT : '1px solid var(--ui-border2)' }}>{n}</button>
                );
              })}
              <span style={{ fontSize: 10.5, color: C.faint, marginLeft: 2, fontWeight: 700 }}>lines / slide</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input
                autoFocus
                type="number" min={1} max={12} value={splitN}
                onChange={(e) => setSplitN(e.target.value)}
                onFocus={(e) => e.target.select()}
                aria-label="Lines per slide"
                style={{ width: 76, background: C.input, color: C.text, border: '1px solid var(--ui-border2)', borderRadius: 8, padding: '9px 10px', fontSize: 15, fontWeight: 800, textAlign: 'center', outline: 'none' }}
              />
              <button onClick={() => setSplitPrompt(null)} style={{ marginLeft: 'auto', background: 'transparent', border: '1px solid var(--ui-border2)', color: C.text2, padding: '9px 14px', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>Cancel</button>
              <button onClick={runSplitPrompt} style={{ background: ACCENT, border: 'none', color: '#fff', padding: '9px 16px', borderRadius: 8, fontSize: 12, fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}><Wand2 size={14} /> {splitPrompt === 'fetch' ? 'Fetch & Parse' : 'Parse & Build'}</button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>

    {/* ===== BODY — each mode is a TabPanel (auto first, like the old ternary) ===== */}
      <TabPanel id="auto" className="box-border flex flex-1 min-h-0 overflow-hidden">
        <div style={{ flex: 1, overflowY: 'auto', padding: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, gap: 10, flexWrap: 'wrap' }}>
            <label style={{ fontSize: 13, fontWeight: 700, color: C.accLine, display: 'flex', alignItems: 'center', gap: 6 }}>
              <Wand2 size={14} /> Paste lyrics or a chord chart
            </label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              {aiStatus && (
                <span style={{ fontSize: 10, background: aiStatus.includes('Online') ? 'rgba(34,197,94,0.2)' : 'rgba(139,92,246,0.2)', color: aiStatus.includes('Online') ? '#4ade80' : '#a78bfa', padding: '4px 8px', borderRadius: 8, fontWeight: 700, border: aiStatus.includes('Online') ? '1px solid rgba(34,197,94,0.4)' : '1px solid rgba(139,92,246,0.4)' }}>{aiStatus}</span>
              )}
            </div>
          </div>
          <div style={{ background: C.input, border: `1px solid ${aiKey && aiKey.hasKey ? 'rgba(34,197,94,0.35)' : 'var(--ui-border2)'}`, borderRadius: 8, padding: '10px 12px', marginBottom: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <KeyRound size={13} color={aiKey && aiKey.hasKey ? '#4ade80' : C.accLine} />
                <span style={{ fontSize: 11.5, fontWeight: 700, color: C.text }}>
                  {aiKey === null ? 'Checking for a saved key…' : aiKey.hasKey ? `Gemini key saved · ${aiKey.masked}` : 'Online parsing needs your own Gemini key'}
                </span>
                {aiKey && aiKey.hasKey && (
                  <span style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
                    <button onClick={testAiKey} disabled={aiKeyBusy} style={aiKeyBtn(C)}>{aiKeyBusy ? '…' : 'Test'}</button>
                    <button onClick={clearAiKey} disabled={aiKeyBusy} style={{ ...aiKeyBtn(C), color: '#f87171', borderColor: 'rgba(239,68,68,0.45)' }}>Remove</button>
                  </span>
                )}
              </div>
              {aiKey && !aiKey.hasKey && (
                <div style={{ display: 'flex', gap: 6, marginTop: 9 }}>
                  <input
                    type="password"
                    value={aiKeyInput}
                    onChange={(e) => setAiKeyInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') saveAiKey(); }}
                    placeholder="Paste your Gemini API key"
                    spellCheck={false}
                    autoComplete="off"
                    style={{ flex: 1, minWidth: 0, background: C.panel, border: '1px solid var(--ui-border2)', borderRadius: 7, padding: '8px 10px', color: C.text, fontSize: 12, outline: 'none', fontFamily: 'monospace' }}
                  />
                  <button onClick={saveAiKey} disabled={aiKeyBusy || !aiKeyInput.trim()} style={{ ...aiKeyBtn(C), color: '#fff', background: (aiKeyBusy || !aiKeyInput.trim()) ? C.faint : ACCENT, borderColor: 'transparent' }}>Save</button>
                </div>
              )}
              <div style={{ fontSize: 10.5, color: C.faint, marginTop: 8, lineHeight: 1.55 }}>
                Saved only in this computer's app data — never bundled into the app, and sent to no one but Google.{' '}
                <span onClick={openKeyPage} style={{ color: C.accLine, cursor: 'pointer', fontWeight: 700 }}>Get a free key →</span>
              </div>
              {aiKeyMsg && (
                <div style={{ fontSize: 11, marginTop: 6, fontWeight: 700, color: aiKeyMsg.ok ? '#4ade80' : '#f87171' }}>{aiKeyMsg.text}</div>
              )}
            </div>
          <p style={{ fontSize: 12, color: C.faint, margin: '0 0 12px 0' }}>Parsing is local and instant: the offline engine strips chords only when the text is a chart, cleans up Google Docs and web formatting, and maps sections into blocks (unlabeled lyrics split into Verse/Chorus automatically). If the blocks come out wrong, AI Auto-Fix re-parses with Gemini using your key above — nothing else ever leaves this computer for parsing.</p>
          <textarea rows={10} value={rawPasteText} onChange={(e) => setRawPasteText(e.target.value)} placeholder="[Verse 1] or plain lyrics&#10;Paste chords (auto-stripped) or copy/paste from a lyrics site — sections are detected for you." style={{ width: '100%', background: C.input, border: '1px solid var(--ui-border2)', borderRadius: 8, padding: 12, color: C.text, fontSize: 13, fontFamily: 'monospace', outline: 'none', resize: 'vertical' }} />
          <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
            <button onClick={() => openSplitPrompt('parse')} disabled={isParsing} style={{ background: ACCENT, border: 'none', color: C.text, padding: '10px 16px', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: isParsing ? 'wait' : 'pointer', display: 'flex', alignItems: 'center', gap: 6, opacity: isParsing ? 0.6 : 1 }}><Wand2 size={14} /> {isParsing ? 'Parsing…' : 'Parse & Build Blocks'}</button>
            {editingSong.cues && editingSong.cues.length > 0 && (
              <button onClick={() => processAiAutofix(undefined, { linesPerSlide: Number(linesPerSlide) || 4 })} disabled={isParsing} title="Blocks look wrong? Re-parse with Gemini using your saved key. Only runs when you click it." style={{ background: 'transparent', border: '1px solid var(--ui-border2)', color: C.text2, padding: '10px 16px', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: isParsing ? 'wait' : 'pointer', display: 'flex', alignItems: 'center', gap: 6, opacity: isParsing ? 0.6 : 1 }}><Sparkles size={14} /> {isParsing ? 'Working…' : 'AI Auto-Fix'}</button>
            )}
          </div>
          {editingSong.cues && editingSong.cues.length > 0 && (
            <div style={{ marginTop: 16, borderTop: '1px solid var(--ui-border2)', paddingTop: 16 }}>
              <label style={{ fontSize: 11, fontWeight: 700, color: '#4ade80', textTransform: 'uppercase', display: 'block', marginBottom: 8 }}>Generated Song Blocks ({editingSong.cues.length})</label>
              <div style={{ display: 'grid', gap: 8, maxHeight: 260, overflowY: 'auto' }}>
                {editingSong.cues.map((c, i) => (
                  <div key={i} style={{ background: C.input, border: '1px solid var(--ui-border2)', borderRadius: 6, padding: '8px 12px', display: 'flex', alignItems: 'center', gap: 10 }}>
                    <button onClick={() => { setEditingSong({ ...editingSong, cues: editingSong.cues.filter((_, x) => x !== i) }); }} style={{ background: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer', padding: 2 }}><Trash2 size={13} /></button>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ fontSize: 10, color: C.accLine, fontWeight: 700, textTransform: 'uppercase' }}>{c.label}</span>
                      <p style={{ margin: '2px 0 0 0', fontSize: 12, color: C.text2, whiteSpace: 'pre-line' }}>{stripMarkup(c.text)}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </TabPanel>
      <TabPanel id="manual" className="box-border flex flex-1 min-h-0 overflow-hidden">
        <>
          {/* ================== LEFT SIDEBAR ================== */}
          <div style={{ flex: '0 0 240px', minWidth: 200, borderRight: '1px solid var(--ui-border2)', overflowY: 'auto', padding: 12, display: 'flex', flexDirection: 'column', gap: 12 }}>

            {/* ALIGNMENT */}
            <div style={{ background: C.elevated, border: '1px solid var(--ui-border2)', borderRadius: 10, padding: 10 }}>
              <div style={{ fontSize: 10, fontWeight: 800, color: C.faint, textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 8 }}>Alignment</div>
              <div style={{ display: 'flex', gap: 4, marginBottom: 4 }}>
                {[['left', AlignLeft], ['center', AlignCenter], ['right', AlignRight], ['justify', AlignHorizontalJustifyCenter]].map(([a, Icon]) => (
                  <button key={a} title={`Align ${a}`} onClick={() => updateCue(editorCueIdx, { align: a })} style={{ flex: 1, background: (editorCue?.align || 'center') === a ? ACCENT : C.elevated2, border: '1px solid var(--ui-border2)', color: (editorCue?.align || 'center') === a ? C.text : C.muted, borderRadius: 6, padding: '6px 0', cursor: 'pointer', display: 'flex', justifyContent: 'center' }}><Icon size={14} /></button>
                ))}
              </div>
              <div style={{ display: 'flex', gap: 4, marginBottom: 8 }}>
                {[['top', AlignVerticalJustifyStart, 'Top'], ['middle', AlignVerticalJustifyCenter, 'Middle'], ['bottom', AlignVerticalJustifyEnd, 'Bottom']].map(([v, Icon, lbl]) => (
                  <button key={v} title={`Vertical: ${lbl}`} onClick={() => updateCue(editorCueIdx, { valign: v })} style={{ flex: 1, background: (editorCue?.valign || 'middle') === v ? ACCENT : C.elevated2, border: '1px solid var(--ui-border2)', color: (editorCue?.valign || 'middle') === v ? C.text : C.muted, borderRadius: 6, padding: '6px 0', cursor: 'pointer', display: 'flex', justifyContent: 'center' }}><Icon size={14} /></button>
                ))}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <label style={{ fontSize: 10, color: C.faint, fontWeight: 700, flex: 1 }} title={editorCue?.pad != null ? 'Padding' : `Auto — ${autoPadForSize(editorCue?.size)}px at this font size`}>Padding{editorCue?.pad == null && <span style={{ color: C.muted, fontWeight: 600 }}> · auto</span>}</label>
                <input type="range" min="0" max="80" step="2" value={editorCue?.pad ?? autoPadForSize(editorCue?.size)} onChange={(e) => updateCueThrottled(editorCueIdx, { pad: Number(e.target.value) })} style={{ flex: 1 }} />
                <span style={{ fontSize: 11, color: C.muted, width: 28, textAlign: 'right' }}>{editorCue?.pad ?? autoPadForSize(editorCue?.size)}</span>
              </div>
            </div>

            {/* LAYOUT */}
            <div style={{ background: C.elevated, border: '1px solid var(--ui-border2)', borderRadius: 10, padding: 10 }}>
              <div style={{ fontSize: 10, fontWeight: 800, color: C.faint, textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 8 }}>Layout</div>
              <div style={{ fontSize: 10, color: C.faint, fontWeight: 700, textTransform: 'uppercase', marginBottom: 4 }}>Resize</div>
              <div style={{ display: 'flex', gap: 4, marginBottom: 4 }}>
                {[['fit', 'Fit'], ['fill', 'Fill'], ['scale', 'Scale']].map(([m, lbl]) => (
                  <button key={m} onClick={() => updateCue(editorCueIdx, { resizeMode: m })} style={{ flex: 1, background: (editorCue?.resizeMode || 'fit') === m ? ACCENT : C.elevated2, border: '1px solid var(--ui-border2)', color: (editorCue?.resizeMode || 'fit') === m ? C.text : C.muted, borderRadius: 6, padding: '6px 0', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>{lbl}</button>
                ))}
              </div>
              <div style={{ fontSize: 9.5, color: C.faint, lineHeight: 1.45, marginBottom: 8 }}>
                {(editorCue?.resizeMode || 'fit') === 'scale'
                  ? 'Drag the handles to grow or shrink the text itself.'
                  : (editorCue?.resizeMode || 'fit') === 'fill'
                    ? 'Text auto-scales to fill the box height.'
                    : 'Box resizes freely; text reflows to fit.'}
              </div>
              {(editorCue?.resizeMode || 'fit') === 'fill' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, background: C.elevated2, border: '1px solid var(--ui-border2)', borderRadius: 7, padding: 8, marginBottom: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <label style={{ fontSize: 10, color: C.faint, fontWeight: 700, flex: 1 }}>Min</label>
                    <input type="range" min="14" max="100" step="1" value={editorCue?.fillMin ?? 18} onChange={(e) => updateCueThrottled(editorCueIdx, { fillMin: Number(e.target.value) })} style={{ flex: 1 }} />
                    <span style={{ fontSize: 11, color: C.muted, width: 28, textAlign: 'right' }}>{editorCue?.fillMin ?? 18}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <label style={{ fontSize: 10, color: C.faint, fontWeight: 700, flex: 1 }}>Max</label>
                    <input type="range" min="40" max={FONT_SIZE_MAX} step="5" value={editorCue?.fillMax ?? 165} onChange={(e) => updateCueThrottled(editorCueIdx, { fillMax: Number(e.target.value) })} style={{ flex: 1 }} />
                    <span style={{ fontSize: 11, color: C.muted, width: 28, textAlign: 'right' }}>{editorCue?.fillMax ?? 165}</span>
                  </div>
                </div>
              )}
              <div style={{ fontSize: 10, color: C.faint, fontWeight: 700, textTransform: 'uppercase', marginBottom: 4 }}>Display</div>
              <div style={{ display: 'flex', gap: 4 }}>
                {[['static', 'Static'], ['ticker', 'Ticker']].map(([m, lbl]) => (
                  <button key={m} onClick={() => updateCue(editorCueIdx, { layoutMode: m })} style={{ flex: 1, background: (editorCue?.layoutMode || 'static') === m ? ACCENT : C.elevated2, border: '1px solid var(--ui-border2)', color: (editorCue?.layoutMode || 'static') === m ? C.text : C.muted, borderRadius: 6, padding: '6px 0', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>{lbl}</button>
                ))}
              </div>
              {(editorCue?.layoutMode || 'static') === 'ticker' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, background: C.elevated2, border: '1px solid var(--ui-border2)', borderRadius: 7, padding: 8, marginTop: 6 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <label style={{ fontSize: 10, color: C.faint, fontWeight: 700, flex: 1, whiteSpace: 'nowrap' }}>Speed (sec)</label>
                    <input type="range" min="4" max="90" step="1" value={editorCue?.tickerSpeed ?? 18} onChange={(e) => updateCueThrottled(editorCueIdx, { tickerSpeed: Number(e.target.value) })} style={{ flex: 1 }} />
                    <span style={{ fontSize: 11, color: C.muted, width: 28, textAlign: 'right' }}>{editorCue?.tickerSpeed ?? 18}</span>
                  </div>
                  <div style={{ display: 'flex', gap: 4 }}>
                    {[['ltr', 'Scroll ←'], ['rtl', 'Scroll →']].map(([d, lbl]) => (
                      <button key={d} onClick={() => updateCue(editorCueIdx, { tickerDir: d })} style={{ flex: 1, background: (editorCue?.tickerDir || 'ltr') === d ? ACCENT : C.elevated2, border: '1px solid var(--ui-border2)', color: (editorCue?.tickerDir || 'ltr') === d ? C.text : C.muted, borderRadius: 6, padding: '6px 0', fontSize: 10.5, fontWeight: 700, cursor: 'pointer' }}>{lbl}</button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* TYPOGRAPHY */}
            <div style={{ background: C.elevated, border: '1px solid var(--ui-border2)', borderRadius: 10, padding: 10 }}>
              <div style={{ fontSize: 10, fontWeight: 800, color: C.faint, textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 8 }}>Typography</div>
              <label style={{ fontSize: 10, color: C.faint, fontWeight: 700, textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>Font Family</label>
              <FontPicker value={editorCue?.font || FONT_OPTIONS[0].value} choices={fontChoices} onChange={(v) => updateCue(editorCueIdx, { font: v })} C={C} />
              <div style={{ display: 'flex', gap: 4, marginTop: 8 }}>
                {[
                  ['bold', Bold, 'Bold', true],
                  ['italic', Italic, 'Italic', false],
                  ['underline', Underline, 'Underline', false],
                  ['strike', Strikethrough, 'Strikethrough', false],
                ].map(([k, Icon, lbl, def]) => {
                  // With text highlighted in the canvas these style exactly
                  // that highlight; with nothing selected they style the whole
                  // slide, exactly as they always have.
                  const active = selMode
                    ? !!canvasSel.attrs[k]
                    : (k === 'bold' ? (editorCue?.bold !== false) : !!(editorCue?.[k]));
                  const toggle = () => {
                    if (selMode) { canvasApiRef.current?.applyStyle({ [k]: !active }); return; }
                    updateCue(editorCueIdx, { [k]: !active });
                  };
                  return (
                    // preventDefault on mousedown: the highlight only exists
                    // while the textarea holds focus, and a button taking that
                    // focus would end edit mode before the click lands.
                    <button
                      key={k}
                      title={selMode ? `${lbl} the selected text` : `${lbl} this slide`}
                      onMouseDown={(ev) => ev.preventDefault()}
                      onClick={toggle}
                      style={{ flex: 1, background: active ? ACCENT : C.elevated2, border: '1px solid ' + (active ? ACCENT : 'var(--ui-border2)'), color: active ? C.text : C.muted, borderRadius: 6, padding: '6px 0', cursor: 'pointer', display: 'flex', justifyContent: 'center' }}><Icon size={14} /></button>
                  );
                })}
              </div>
              {selMode && (
                <div style={{ fontSize: 9.5, fontWeight: 700, color: '#c4b5fd', marginTop: 5, letterSpacing: 0.2 }}>
                  Highlighted text — B / I / U / S style only that; Size and the rest still set the whole slide
                </div>
              )}
              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: 10, color: C.faint, fontWeight: 700, textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>Size</label>
                  <NumField key={`size-${editorCueIdx}`} value={editorCue?.size || DEFAULT_LYRIC_SIZE} min={FONT_SIZE_MIN} max={FONT_SIZE_MAX} onCommit={(size) => {
                    // The box follows the font: a bigger size grows the box so
                    // the text draws at full size, a smaller one tightens it —
                    // either way every line stays visible, never clipped.
                    // Fill mode exempt (box drives size there, not vice versa).
                    const st = fitStFor(editorCue || {}, size);
                    updateCue(editorCueIdx, { size, box: fitBoxToText(editorCue?.text || '', st, editorBox) });
                  }} style={{ width: '100%', background: C.input, color: C.text, border: '1px solid var(--ui-border2)', borderRadius: 6, padding: '7px', fontSize: 12, textAlign: 'center', outline: 'none' }} />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: 10, color: C.faint, fontWeight: 700, textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>Line Ht</label>
                  <NumField key={`lh-${editorCueIdx}`} value={editorCue?.lineHeight || 1.05} min={0.3} max={5} decimal onCommit={(lineHeight) => updateCue(editorCueIdx, { lineHeight })} style={{ width: '100%', background: C.input, color: C.text, border: '1px solid var(--ui-border2)', borderRadius: 6, padding: '7px', fontSize: 12, textAlign: 'center', outline: 'none' }} />
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
                <label style={{ fontSize: 10, color: C.faint, fontWeight: 700, flex: 1, whiteSpace: 'nowrap' }}>Tracking</label>
                <input type="range" min="-2" max="20" step="0.5" value={editorCue?.letterSpacing || 0} onChange={(e) => updateCueThrottled(editorCueIdx, { letterSpacing: Number(e.target.value) })} style={{ flex: 1 }} />
                <span style={{ fontSize: 11, color: C.muted, width: 32, textAlign: 'right' }}>{editorCue?.letterSpacing || 0}</span>
              </div>
              <label style={{ fontSize: 10, color: C.faint, fontWeight: 700, textTransform: 'uppercase', display: 'block', marginBottom: 4, marginTop: 8 }}>Letter Case</label>
              <div style={{ display: 'flex', gap: 4 }}>
                {[['none', 'Aa'], ['title', 'Aa'], ['upper', 'AA']].map(([m, lbl]) => (
                  <button key={m} onClick={() => updateCue(editorCueIdx, { case: m })} style={{ flex: 1, background: (editorCue?.case || 'none') === m ? ACCENT : C.elevated2, border: '1px solid var(--ui-border2)', color: (editorCue?.case || 'none') === m ? C.text : C.muted, borderRadius: 6, padding: '6px 0', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>{m === 'title' ? 'Tt' : lbl}</button>
                ))}
              </div>
            </div>

            {/* TEXT STYLE */}
            <div style={{ background: C.elevated, border: '1px solid var(--ui-border2)', borderRadius: 10, padding: 10 }}>
              <div style={{ fontSize: 10, fontWeight: 800, color: C.faint, textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 8 }}>Text Style</div>
              {/* UUI color picker — Solid | Gradient merged into one control */}
              <div style={{ marginBottom: 8 }}>
                <ColorPicker
                  C={C}
                  ACCENT={ACCENT}
                  value={editorCue?.color || '#ffffff'}
                  gradient={!!editorCue?.gradient}
                  color1={editorCue?.gradientColor1 || '#f5f5f4'}
                  color2={editorCue?.gradientColor2 || '#93c5fd'}
                  angle={editorCue?.gradientAngle ?? 180}
                  onChange={(p) => updateCue(editorCueIdx, p)}
                  onLiveChange={(p) => updateCueThrottled(editorCueIdx, p)}
                />
              </div>
              {[['shadow', `Shadow ${editorCue?.shadow ? 'ON' : 'OFF'}`], ['glow', `Glow ${(glowSelActive ? glowSel.attrs.glow : editorCue?.glow) ? 'ON' : 'OFF'}`], ['outline', `Outline ${editorCue?.outline ? 'ON' : 'OFF'}`], ['highlight', `Highlight ${editorCue?.highlight ? 'ON' : 'OFF'}`]].map(([k, lbl]) => (
                <button key={k} onMouseDown={(ev) => { if (k === 'glow' && (selMode || glowPicking)) ev.preventDefault(); }} onClick={() => {
                  // With text highlighted, Glow styles exactly that
                  // highlight; otherwise it styles the whole slide.
                  if (k === 'glow' && (selMode || glowPicking)) {
                    // Live highlight only — the button advertises slide state
                    // whenever nothing is highlighted, so it must never act on
                    // a word from an earlier pick.
                    const r = canvasSel?.active ? canvasSel : null;
                    if (r && r.to > r.from) {
                      canvasApiRef.current?.applyStyleToRange?.({ glow: !r.attrs?.glow }, r.from, r.to);
                      return;
                    }
                  }
                  updateCue(editorCueIdx, { [k]: !editorCue?.[k] });
                }} style={{ width: '100%', background: (k === 'glow' && glowSelActive ? glowSel.attrs.glow : editorCue?.[k]) ? 'rgba(34,197,94,0.15)' : C.elevated2, border: '1px solid ' + ((k === 'glow' && glowSelActive ? glowSel.attrs.glow : editorCue?.[k]) ? 'rgba(34,197,94,0.5)' : 'var(--ui-border2)'), color: (k === 'glow' && glowSelActive ? glowSel.attrs.glow : editorCue?.[k]) ? '#4ade80' : C.muted, borderRadius: 6, padding: '6px', fontSize: 10.5, fontWeight: 700, cursor: 'pointer', marginBottom: 4 }}>{lbl}</button>
              ))}
              {editorCue?.shadow && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, background: C.elevated2, border: '1px solid var(--ui-border2)', borderRadius: 7, padding: 8, marginTop: 2 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <label style={{ fontSize: 10, color: C.faint, fontWeight: 700, flex: 1 }}>Color</label>
                    <input type="color" value={editorCue?.shadowColor || '#000000'} onChange={(e) => updateCue(editorCueIdx, { shadowColor: e.target.value })} style={{ width: 30, height: 24, background: C.input, border: '1px solid var(--ui-border2)', borderRadius: 5, cursor: 'pointer', padding: 0 }} />
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <label style={{ fontSize: 10, color: C.faint, fontWeight: 700, flex: 1 }}>Blur</label>
                    <input type="range" min="0" max="40" step="1" value={editorCue?.shadowBlur ?? 14} onChange={(e) => updateCueThrottled(editorCueIdx, { shadowBlur: Number(e.target.value) })} style={{ flex: 1 }} />
                    <span style={{ fontSize: 11, color: C.muted, width: 28, textAlign: 'right' }}>{editorCue?.shadowBlur ?? 14}</span>
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 6 }}>
                      <label style={{ fontSize: 10, color: C.faint, fontWeight: 700 }}>X</label>
                      <input type="range" min="-30" max="30" step="1" value={editorCue?.shadowOffsetX ?? 0} onChange={(e) => updateCueThrottled(editorCueIdx, { shadowOffsetX: Number(e.target.value) })} style={{ flex: 1 }} />
                      <span style={{ fontSize: 11, color: C.muted, width: 24, textAlign: 'right' }}>{editorCue?.shadowOffsetX ?? 0}</span>
                    </div>
                    <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 6 }}>
                      <label style={{ fontSize: 10, color: C.faint, fontWeight: 700 }}>Y</label>
                      <input type="range" min="-30" max="30" step="1" value={editorCue?.shadowOffsetY ?? 4} onChange={(e) => updateCueThrottled(editorCueIdx, { shadowOffsetY: Number(e.target.value) })} style={{ flex: 1 }} />
                      <span style={{ fontSize: 11, color: C.muted, width: 24, textAlign: 'right' }}>{editorCue?.shadowOffsetY ?? 4}</span>
                    </div>
                  </div>
                </div>
              )}
              {(selMode || glowSelActive || editorCue?.glow) && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, background: C.elevated2, border: '1px solid var(--ui-border2)', borderRadius: 7, padding: 8, marginTop: 2 }}>
                  {selMode && (
                    <div style={{ fontSize: 9.5, fontWeight: 700, color: '#c4b5fd', letterSpacing: 0.2 }}>
                      Highlighted text — tap a colour and only that glows; the highlight stays until it is painted
                    </div>
                  )}
                  {selMode && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {GLOW_PRESETS.map((c) => {
                        const selColor = typeof canvasSel?.attrs?.glowColor === 'string' ? canvasSel.attrs.glowColor : (canvasSel?.attrs?.glow ? (editorCue?.glowColor || '#22d3ee') : null);
                        const on = selColor && selColor.toLowerCase() === c.toLowerCase();
                        return (
                          <button
                            key={c}
                            title={`Glow the highlighted text ${c}`}
                            onMouseDown={(ev) => ev.preventDefault()}
                            onClick={() => canvasApiRef.current?.applyStyle({ glow: c })}
                            style={{ width: 26, height: 26, borderRadius: 7, background: c, border: '1px solid ' + (on ? ACCENT : 'var(--ui-border2)'), boxShadow: on ? `0 0 0 2px ${ACCENT}` : 'none', cursor: 'pointer', padding: 0 }}
                          />
                        );
                      })}
                    </div>
                  )}
                  {!selMode && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <label style={{ fontSize: 10, color: C.faint, fontWeight: 700, flex: 1 }}>Glow color</label>
                    <input ref={glowColorRef} key={`glowc-${editorCueIdx}`} type="color" defaultValue={editorCue?.glowColor || '#22d3ee'} onMouseDown={() => {
                      setGlowPicking(true);
                      // Fresh intent: with no live highlight the latch (if any)
                      // is a word from an earlier pick, not this visit.
                      if (!canvasSel?.active) selLatchRef.current = null;
                    }} onInput={(e) => {
                      if (!paintGlowSelection(e.target.value)) canvasApiRef.current?.previewGlow?.(e.target.value);
                    }} onChange={(e) => {
                      if (!paintGlowSelection(e.target.value)) updateCue(editorCueIdx, { glowColor: e.target.value });
                      canvasApiRef.current?.clearGlowPreview?.();
                      finishGlowPick();
                    }} onBlur={() => {
                      // Dialog cancelled (Esc): no onChange arrives, so drop a
                      // stale drag-preview a beat after focus settles. After a
                      // real pick this is a no-op (preview already cleared).
                      setTimeout(() => canvasApiRef.current?.clearGlowPreview?.(), 300);
                    }} style={{ width: 30, height: 24, background: C.input, border: '1px solid var(--ui-border2)', borderRadius: 5, cursor: 'pointer', padding: 0 }} />
                  </div>
                  )}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <label style={{ fontSize: 10, color: C.faint, fontWeight: 700, flex: 1 }}>Strength</label>
                    <input type="range" min="0" max="60" step="1" value={editorCue?.glowBlur ?? 18} onChange={(e) => updateCueThrottled(editorCueIdx, { glowBlur: Number(e.target.value) })} style={{ flex: 1 }} />
                    <span style={{ fontSize: 11, color: C.muted, width: 28, textAlign: 'right' }}>{editorCue?.glowBlur ?? 18}</span>
                  </div>
                </div>
              )}
              {editorCue?.outline && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, background: C.elevated2, border: '1px solid var(--ui-border2)', borderRadius: 7, padding: 8, marginTop: 2 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <label style={{ fontSize: 10, color: C.faint, fontWeight: 700, flex: 1 }}>Stroke</label>
                    <input type="color" value={editorCue?.strokeColor || '#000000'} onChange={(e) => updateCue(editorCueIdx, { strokeColor: e.target.value })} style={{ width: 30, height: 24, background: C.input, border: '1px solid var(--ui-border2)', borderRadius: 5, cursor: 'pointer', padding: 0 }} />
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <label style={{ fontSize: 10, color: C.faint, fontWeight: 700, flex: 1 }}>Width</label>
                    <input type="range" min="0" max="8" step="0.5" value={editorCue?.strokeWidth ?? 1.5} onChange={(e) => updateCueThrottled(editorCueIdx, { strokeWidth: Number(e.target.value) })} style={{ flex: 1 }} />
                    <span style={{ fontSize: 11, color: C.muted, width: 28, textAlign: 'right' }}>{editorCue?.strokeWidth ?? 1.5}</span>
                  </div>
                </div>
              )}
              {/* Gradient moved into the color picker: the Solid | Gradient
                  segmented control in the popover owns gradient on/off, both
                  stops and the angle. */}
              {editorCue?.highlight && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <label style={{ fontSize: 10, color: C.faint, fontWeight: 700, flex: 1 }}>Opacity</label>
                  <input type="range" min="10" max="90" value={editorCue?.hlOpacity ?? 40} onChange={(e) => updateCueThrottled(editorCueIdx, { hlOpacity: Number(e.target.value) })} style={{ flex: 1 }} />
                  <span style={{ fontSize: 11, color: C.muted, width: 28, textAlign: 'right' }}>{editorCue?.hlOpacity ?? 40}%</span>
                </div>
              )}
            </div>

            {/* TRANSITIONS */}
            <div style={{ background: C.elevated, border: '1px solid var(--ui-border2)', borderRadius: 10, padding: 10 }}>
              <div style={{ fontSize: 10, fontWeight: 800, color: C.faint, textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 8 }}>Transition</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                {TRANSITIONS.map(t => {
                  const key = TRANSITION_KEYS[t];
                  const selected = (editorCue?.anim || 'none') === key;
                  const isHovered = hoverAnim === key;
                  return (
                    <button
                      key={t}
                      onClick={() => {
                        setHoverAnim(null);
                        updateCue(editorCueIdx, { anim: key });
                      }}
                      onMouseEnter={() => {
                        if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
                        setHoverAnim(key);
                        setPreviewTick(t => t + 1);
                      }}
                      onMouseLeave={() => {
                        hoverTimeoutRef.current = setTimeout(() => {
                          setHoverAnim(null);
                        }, 80);
                      }}
                      style={{
                        background: selected ? ACCENT : isHovered ? 'rgba(0,170,255,0.2)' : C.elevated2,
                        border: '1px solid ' + (selected ? ACCENT : isHovered ? 'rgba(0,170,255,0.5)' : 'var(--ui-border2)'),
                        color: selected ? C.text : isHovered ? 'var(--ui-text)' : C.muted,
                        borderRadius: 999,
                        padding: '4px 9px',
                        fontSize: 10,
                        fontWeight: 700,
                        cursor: 'pointer',
                        transition: 'all 0.12s ease',
                        transform: isHovered && !selected ? 'scale(1.04)' : 'none',
                      }}
                    >{t}</button>
                  );
                })}
              </div>
              {hoverAnim && hoverAnim !== (editorCue?.anim || 'none') && (
                <div style={{ marginTop: 6, fontSize: 9, color: ACCENT, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: ACCENT, display: 'inline-block', animation: 'pulse 0.8s infinite' }} />
                  Previewing: {TRANSITIONS.find(t => TRANSITION_KEYS[t] === hoverAnim) || hoverAnim}
                </div>
              )}
              <div style={{ fontSize: 10, fontWeight: 800, color: C.faint, textTransform: 'uppercase', letterSpacing: 1.5, margin: '10px 0 6px 0' }}>Speed</div>
              <div style={{ display: 'flex', gap: 3 }}>
                {SPEED_OPTIONS.map(s => {
                  const selected = (editorCue?.speed ?? 0.5) === s.v;
                  return (
                    <button key={s.v} onClick={() => updateCue(editorCueIdx, { speed: s.v })} title={s.label} style={{ flex: 1, background: selected ? ACCENT : C.elevated2, border: '1px solid ' + (selected ? ACCENT : 'var(--ui-border2)'), color: selected ? C.text : C.muted, borderRadius: 5, padding: '6px 0', fontSize: 9.5, fontWeight: 700, cursor: 'pointer' }}>{s.v}s</button>
                  );
                })}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10 }}>
                <label style={{ fontSize: 10, color: C.faint, fontWeight: 700, whiteSpace: 'nowrap' }}>Auto Next (sec)</label>
                <input type="number" min="0" value={editorCue?.autoNext ?? 0} onChange={(e) => updateCue(editorCueIdx, { autoNext: Math.max(0, Math.floor(Number(e.target.value) || 0)) })} style={{ width: 60, background: C.input, color: C.text, border: '1px solid var(--ui-border2)', borderRadius: 6, padding: '6px', fontSize: 12, textAlign: 'center', outline: 'none' }} />
              </div>
            </div>

            {/* ONE apply-to-all. Sticky so it stays reachable however far the
                sidebar has been scrolled. */}
            <div style={{ position: 'sticky', bottom: 0, zIndex: 3, background: C.elevated, border: '1px solid var(--ui-border2)', borderRadius: 10, padding: 10, boxShadow: '0 -10px 22px rgba(0,0,0,0.35)' }}>
              <button onClick={applyTypographyToAll} title="Copy this slide's font, size, alignment, colour, effects and transition onto every slide of the song, title slide included" style={{ width: '100%', background: ACCENT, border: 'none', color: C.text, borderRadius: 8, padding: '9px 8px', fontSize: 11.5, fontWeight: 800, cursor: 'pointer', lineHeight: 1.3 }}>Apply typography changes to all slides</button>
              <div style={{ fontSize: 9, color: C.faint, marginTop: 5, textAlign: 'center', lineHeight: 1.45 }}>Uses this slide as the source. Layout, padding, timing and notes stay as they are.</div>
            </div>

            {/* PRESENTER NOTES */}
            <div style={{ background: C.elevated, border: '1px solid var(--ui-border2)', borderRadius: 10, padding: 10, flex: 1, minHeight: 120, display: 'flex', flexDirection: 'column' }}>
              <div style={{ fontSize: 10, fontWeight: 800, color: C.faint, textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 8 }}>Presenter Notes</div>
              <textarea
                value={editorCue?.notes || ''}
                onChange={(e) => updateCue(editorCueIdx, { notes: e.target.value })}
                placeholder="Stage-only: cues, chords, prompts… (never shown to the audience)"
                style={{ flex: 1, resize: 'none', background: C.input, color: C.text, border: '1px solid var(--ui-border2)', borderRadius: 6, padding: 8, fontSize: 12, outline: 'none' }}
              />
            </div>
          </div>

          {/* ================== CENTER CANVAS ================== */}
          <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', background: C.bg }}>
            {/* counter / nav */}
            <div style={{ padding: '8px 12px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
              <button onClick={() => setEditorCueIdx(i => Math.max(-1, i - 1))} style={{ background: C.elevated, border: '1px solid var(--ui-border2)', color: C.muted, borderRadius: 7, padding: '5px 9px', cursor: 'pointer', display: 'flex' }}><ChevronLeft size={15} /></button>
              <span style={{ fontSize: 13, fontWeight: 800, color: C.text }}>{editorCueIdx === -1 ? 'Title Slide' : `${editorCueIdx + 1} of ${(editingSong.cues || []).length}`}</span>
              <button onClick={() => setEditorCueIdx(i => Math.min((editingSong.cues || []).length - 1, i + 1))} style={{ background: C.elevated, border: '1px solid var(--ui-border2)', color: C.muted, borderRadius: 7, padding: '5px 9px', cursor: 'pointer', display: 'flex' }}><ChevronRight size={15} /></button>
            </div>

            {/* canvas — contain-fit stage: the padding sits on the OUTER box so
                the inner one is padding-free; LyricsCanvasEditor measures that
                box and sizes itself to the largest 16:9 that fits, keeping the
                stage centered and clear of the footer. */}
            <div style={{ flex: 1, minHeight: 0, padding: 12, overflow: 'hidden' }}>
              <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {editorCue ? (
                <LyricsCanvasEditor
                  text={editorCue.text || ''}
                  fontFamily={editorCue.font || FONT_OPTIONS[0].value}
                  fontSize={Number(editorCue.size) || DEFAULT_LYRIC_SIZE}
                  fontColor={editorCue.color || '#ffffff'}
                  textAlign={editorCue.align || 'center'}
                  lineHeight={editorCue.lineHeight || 1.05}
                  letterSpacing={editorCue.letterSpacing || 0}
                  strokeColor={editorCue.outline ? (editorCue.strokeColor || '#000000') : 'transparent'}
                  strokeWidth={editorCue.outline ? (editorCue.strokeWidth || 1.5) : 0}
                  shadowColor={editorCue.shadow ? (editorCue.shadowColor || '#000000') : 'transparent'}
                  shadowBlur={editorCue.shadow ? (editorCue.shadowBlur ?? 14) : 0}
                  shadowOffsetX={editorCue.shadowOffsetX ?? 0}
                  shadowOffsetY={editorCue.shadowOffsetY ?? 4}
                  glow={!!editorCue.glow}
                  glowColor={editorCue.glowColor || '#22d3ee'}
                  glowBlur={editorCue.glowBlur ?? 18}
                  gradient={!!editorCue.gradient}
                  gradientColor1={editorCue.gradientColor1 || '#f5f5f4'}
                  gradientColor2={editorCue.gradientColor2 || '#93c5fd'}
                  gradientAngle={editorCue.gradientAngle ?? 180}
                  box={editorBox}
                  bgType={resolveBg(editorCue, editingSong)?.type || 'color'}
                  bgValue={resolveBg(editorCue, editingSong)?.value || '#000000'}
                  cueLocked={!!editorCue.locked}
                  highlight={!!editorCue.highlight}
                  hlOpacity={editorCue.hlOpacity ?? 40}
                  caseMode={editorCue.case || 'none'}
                  bold={editorCue.bold !== false}
                  italic={!!editorCue.italic}
                  underline={!!editorCue.underline}
                  strike={!!editorCue.strike}
                  valign={editorCue.valign || 'middle'}
                  pad={editorCue.pad}
                  fill={editorCue?.resizeMode === 'fill'}
                  resizeMode={editorCue?.resizeMode || 'fit'}
                  fillMax={editorCue?.fillMax ?? 165}
                  fillMin={editorCue?.fillMin ?? 18}
                  layoutMode={editorCue?.layoutMode || 'static'}
                  tickerSpeed={editorCue?.tickerSpeed ?? 18}
                  tickerDir={editorCue?.tickerDir || 'ltr'}
                  previewAnim={hoverAnim}
                  previewTick={previewTick}
                  previewSpeed={editorCue?.speed ?? 0.5}                  onTextChange={(t) => {
                    // Grow-only refit: text typed in the manual builder can
                    // grow its box so every line stays visible at the full
                    // font size — but it never SHRINKS a box here (parse,
                    // size and Apply own the exact fit), so a compact or
                    // hand-dragged box survives a typo fix. Locked = untouched.
                    const patch = { text: t };
                    if (!editorCue?.locked) {
                      patch.box = growBoxToText(t, fitStFor(editorCue || {}), editorBox);
                    }
                    updateCue(editorCueIdx, patch);
                  }}
                  onBoxChange={(b) => updateCue(editorCueIdx, { box: b })}
                  onSizeChange={(s) => updateCue(editorCueIdx, { size: s })}
                  apiRef={canvasApiRef}
                  onSelectionChange={setCanvasSel}
                />
              ) : (
                <div style={{ boxSizing: 'border-box', height: '100%', width: 'auto', maxWidth: '100%', aspectRatio: '16 / 9', borderRadius: 12, boxShadow: '0 12px 44px rgba(0,0,0,0.45)', border: '1px solid var(--ui-border2)', background: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(255,255,255,0.55)', fontSize: 18, fontWeight: 700, fontFamily: 'var(--font-sans)' }}>Add a text box to begin</div>
              )}
              </div>
            </div>

            {/* toolbar — sits UNDER the canvas so the stage starts higher in
                the column; buttons and behaviour are unchanged. The divider
                moved from bottom to top for the same reason. */}
            <div style={{ padding: '8px 12px', borderTop: '1px solid var(--ui-border2)', display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              <ToolbarBtn onClick={() => { const cues = [...(editingSong.cues || []), { label: 'Verse 1', text: '', box: DEFAULT_BOX }]; setEditingSong({ ...editingSong, cues }); setEditorCueIdx(cues.length - 1); startRename(cues.length - 1, cues[cues.length - 1], 'strip'); }} title="Add a new slide"><Plus size={14} /> <span>New Slide</span></ToolbarBtn>
              <ToolbarBtn onClick={() => { const cues = [...(editingSong.cues || [])]; if (!cues.length) { cues.push({ label: 'Verse 1', text: '', box: DEFAULT_BOX, locked: false }); setEditingSong({ ...editingSong, cues }); setEditorCueIdx(0); } else if (editorCueIdx >= 0 && cues[editorCueIdx] && !cues[editorCueIdx].box) { cues[editorCueIdx] = { ...cues[editorCueIdx], box: DEFAULT_BOX, locked: false }; setEditingSong({ ...editingSong, cues }); } }} title="Add/edit text box on this slide"><Type size={14} /> <span>Text</span></ToolbarBtn>
              <div style={{ width: 1, height: 18, background: 'var(--ui-border2)', margin: '0 4px' }} />
              <ToolbarBtn onClick={undo} disabled={!hist.undo} title="Undo — Ctrl+Z. Takes back the last change (typing, sizes, a deleted slide, an Apply)"><Undo2 size={14} /></ToolbarBtn>
              <ToolbarBtn onClick={redo} disabled={!hist.redo} title="Redo — Ctrl+Shift+Z or Ctrl+Y"><Redo2 size={14} /></ToolbarBtn>
              <div style={{ width: 1, height: 18, background: 'var(--ui-border2)', margin: '0 4px' }} />
              <ToolbarBtn onClick={() => duplicateCue(editorCueIdx)} title="Duplicate slide"><Copy size={14} /></ToolbarBtn>
              <ToolbarBtn danger onClick={() => { if (editorCueIdx < 0) return; const cues = [...(editingSong.cues || [])]; if (!cues.length) return; cues.splice(editorCueIdx, 1); setEditingSong({ ...editingSong, cues }); setEditorCueIdx(Math.min(editorCueIdx, Math.max(0, cues.length - 1))); }} title="Delete slide"><Trash2 size={14} /></ToolbarBtn>
              <div style={{ width: 1, height: 18, background: 'var(--ui-border2)', margin: '0 4px' }} />
              {[['left', AlignLeft], ['center', AlignCenter], ['right', AlignRight], ['justify', AlignHorizontalJustifyCenter]].map(([a, Icon]) => (
                <ToolbarBtn key={a} onClick={() => updateCue(editorCueIdx, { align: a })} title={`Align ${a}`} active={(editorCue?.align || 'center') === a}><Icon size={14} /></ToolbarBtn>
              ))}
              <div style={{ width: 1, height: 18, background: 'var(--ui-border2)', margin: '0 4px' }} />
              {[['top', AlignVerticalJustifyStart], ['middle', AlignVerticalJustifyCenter], ['bottom', AlignVerticalJustifyEnd]].map(([v, Icon]) => (
                <ToolbarBtn key={v} onClick={() => updateCue(editorCueIdx, { valign: v })} title={`Vertical ${v}`} active={(editorCue?.valign || 'middle') === v}><Icon size={14} /></ToolbarBtn>
              ))}
              <div style={{ width: 1, height: 18, background: 'var(--ui-border2)', margin: '0 4px' }} />
              <ToolbarBtn onClick={() => updateCue(editorCueIdx, { stack: 'front' })} title="Bring forward"><BringToFront size={14} /></ToolbarBtn>
              <ToolbarBtn onClick={() => updateCue(editorCueIdx, { stack: 'back' })} title="Send back"><SendToBack size={14} /></ToolbarBtn>
              <div style={{ width: 1, height: 18, background: 'var(--ui-border2)', margin: '0 4px' }} />
              <div style={{ flex: 1 }} />
              <span style={{ fontSize: 10.5, fontWeight: 700, color: C.faint2, background: C.elevated, border: '1px solid var(--ui-border2)', borderRadius: 999, padding: '3px 9px' }}>
                <Clock3 size={11} style={{ verticalAlign: 'middle', marginRight: 4 }} />{TRANSITIONS.find(t => TRANSITION_KEYS[t] === (editorCue?.anim || 'none')) || 'None'} · {(editorCue?.speed ?? 0.5)}s
              </span>
            </div>
          </div>

          {/* ================== RIGHT SIDEBAR ================== */}
          <div style={{ flex: '0 0 300px', minWidth: 240, borderLeft: '1px solid var(--ui-border2)', overflowY: 'auto', padding: 12, display: 'flex', flexDirection: 'column', gap: 12 }}>
            {/* SLIDES */}
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <span style={{ fontSize: 10, fontWeight: 800, color: C.faint, textTransform: 'uppercase', letterSpacing: 1.5 }}>Slides</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  <input type="number" min="1" max="12" value={linesPerSlide} onChange={(e) => setLinesPerSlide(e.target.value)} title="Lines per slide" style={{ width: 42, background: C.input, color: C.text, border: '1px solid var(--ui-border2)', borderRadius: 6, padding: '4px 5px', fontSize: 11, textAlign: 'center', outline: 'none' }} />
                  <button onClick={splitCuesToLines} title="Split long sections into N-line slides" style={{ background: '#1e1b4b', border: '1px solid ' + ACCENT, color: C.accLine, borderRadius: 6, padding: '4px 7px', fontSize: 10, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 3 }}><AlignLeft size={11} /> Split</button>
                </div>
              </div>
              <div style={{ display: 'grid', gap: 8, maxHeight: 380, overflowY: 'auto' }}>
                {/* Title Slide Thumbnail */}
                <div onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setDropHint(h => (h ? null : h)); }} onDrop={(e) => { e.preventDefault(); dropCue(dragFrom, 0, 'before', false); }} onClick={(e) => slideClick(e, -1)} title="Ctrl+click to tick it for Apply to ▸ Selected" style={{ cursor: 'pointer', position: 'relative', background: editorCueIdx === -1 ? 'rgba(139,92,246,0.16)' : C.elevated, border: dragFrom != null ? '1px dashed ' + ACCENT : (editorCueIdx === -1 ? '1px solid ' + ACCENT : '1px solid var(--ui-border2)'), boxShadow: applySel.includes(-1) ? '0 0 0 2px ' + ACCENT : 'none', borderRadius: 8, overflow: 'hidden', padding: 6 }}>
                  <div style={{ width: '100%', aspectRatio: '16 / 9', borderRadius: 5, background: songHasBackground(editingSong) && editingSong.bg_type === 'color' ? editingSong.bg_value : '#0a0a0a', position: 'relative', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {editingSong.bg_type === 'image' && editingSong.bg_value && (
                      <img draggable={false} src={editingSong.bg_value} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
                    )}
                    {editingSong.bg_type === 'video' && editingSong.bg_value && (
                      <TileVideo src={editingSong.bg_value} animate={editorCueIdx === -1} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
                    )}
                    <div style={{ position: 'relative', zIndex: 2, color: '#f5f5f4', fontSize: 10, fontWeight: 800, textAlign: 'center', padding: '0 6px', textShadow: '0 1px 3px rgba(0,0,0,0.8)' }}>{editingSong.title || 'Song Title'}</div>
                    {applySel.includes(-1) && (
                      <span style={{ position: 'absolute', top: 4, right: 4, zIndex: 4, width: 14, height: 14, borderRadius: '50%', background: ACCENT, color: '#fff', fontSize: 9, fontWeight: 900, display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1 }}>✓</span>
                    )}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 5 }}>
                    <span style={{ fontSize: 9.5, fontWeight: 800, color: '#38bdf8' }}>Title Slide</span>
                  </div>
                </div>

                {(() => {
                  const groups = [];
                  (editingSong.cues || []).forEach((c, i) => {
                    const base = baseGroupLabel(c.label);
                    let g = groups.find(x => x.base === base);
                    if (!g) { g = { base, items: [] }; groups.push(g); }
                    g.items.push({ c, i, li: g.items.length + 1 });
                  });
                  return groups.map((g, gi) => (
                    <div key={gi} onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setDropHint(h => (h ? null : h)); }} onDrop={(e) => { e.preventDefault(); e.stopPropagation(); const first = g.items[0]; if (first) dropCue(dragFrom, first.i, 'before'); }}>
                      <div style={{ fontSize: 10, fontWeight: 800, color: C.accLine, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <span>{g.base}</span><span style={{ color: C.faint, fontWeight: 600, letterSpacing: 0 }}>{g.items.length} slide{g.items.length > 1 ? 's' : ''}</span>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                        {g.items.map(({ c, i, li }) => (
                          <div key={i} draggable onDragStart={(e) => dragStart(e, i)} onDragOver={(e) => dragOverTile(e, i)} onDrop={(e) => dropOnTile(e, i)} onDragEnd={dragEnded} onClick={(e) => slideClick(e, i)} title="Ctrl+click to tick it for Apply to ▸ Selected" style={{ cursor: 'pointer', position: 'relative', background: i === editorCueIdx ? 'rgba(139,92,246,0.16)' : C.elevated, border: dropHint && dropHint.i === i ? '1px dashed ' + ACCENT : (i === editorCueIdx ? '1px solid ' + ACCENT : '1px solid var(--ui-border2)'), boxShadow: applySel.includes(i) ? '0 0 0 2px ' + ACCENT : 'none', borderRadius: 8, overflow: 'hidden', padding: 6 }}>
                            {dropHint && dropHint.i === i && (
                              <span style={{ position: 'absolute', top: 0, bottom: 0, [dropHint.side === 'before' ? 'left' : 'right']: 0, width: 3, background: ACCENT, borderRadius: 3, zIndex: 6 }} />
                            )}
                            <div style={{ width: '100%', aspectRatio: '16 / 9', borderRadius: 5, background: (resolveBg(c, editingSong) && resolveBg(c, editingSong).type === 'color' ? resolveBg(c, editingSong).value : '#0a0a0a'), position: 'relative', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                              {resolveBg(c, editingSong) && resolveBg(c, editingSong).type === 'image' && (
                                <img key={`tb-${resolveBg(c, editingSong).value}`} draggable={false} src={resolveBg(c, editingSong).value} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
                              )}
                              {resolveBg(c, editingSong) && resolveBg(c, editingSong).type === 'video' && (
                                <TileVideo key={`tb-${resolveBg(c, editingSong).value}`} src={resolveBg(c, editingSong).value} animate={i === editorCueIdx} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
                              )}
                              {(() => {
                                // 1:1 with the canvas and the projector: the
                                // SAME renderer on the SAME 1280×720 design
                                // canvas, contain-fitted to the thumb (the
                                // live slide grid does exactly this). Box,
                                // size, wrapping and position therefore
                                // always match the editor — split a line and
                                // the thumb and the canvas move together.
                                const st = { ...cueLyricStyle(c), layoutMode: 'static' };
                                const box = st.box;
                                return (
                                  <TileCanvas>
                                    <div style={{ position: 'absolute', left: box.x, top: box.y, width: box.w, height: box.h, transform: box.angle ? `rotate(${box.angle}deg)` : undefined, transformOrigin: 'center center' }}>
                                      {renderLyricsLayout(c.text || '', st, box)}
                                    </div>
                                  </TileCanvas>
                                );
                              })()}
                              <div style={{ position: 'absolute', top: 3, left: 4, zIndex: 5, fontSize: 8, fontWeight: 800, color: 'rgba(255,255,255,0.85)', background: 'rgba(0,0,0,0.45)', borderRadius: 3, padding: '0 4px' }}>{gi + 1}.{li}</div>
                              {applySel.includes(i) && (
                                <span style={{ position: 'absolute', top: 3, right: 4, zIndex: 5, width: 14, height: 14, borderRadius: '50%', background: ACCENT, color: '#fff', fontSize: 9, fontWeight: 900, display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1 }}>✓</span>
                              )}
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 5 }}>
                              {(renameIdx === i && renameFrom === 'strip') ? (
                                <input ref={renameRef} value={renameVal} onChange={(e) => setRenameVal(e.target.value)} onClick={(e) => e.stopPropagation()} onBlur={commitRename} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); commitRename(); } else if (e.key === 'Escape') { e.preventDefault(); cancelRename(); } }} style={{ flex: 1, minWidth: 0, background: C.input, color: C.text, border: '1px solid ' + ACCENT, borderRadius: 4, padding: '1px 4px', fontSize: 9.5, fontWeight: 700, outline: 'none' }} />
                              ) : (
                                <span onDoubleClick={(e) => { e.stopPropagation(); startRename(i, c, 'strip'); }} title="Double-click to rename" style={{ fontSize: 9.5, fontWeight: 700, color: C.text2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 84, cursor: 'text' }}>{c.label}</span>
                              )}
                              <div style={{ display: 'flex', gap: 2 }}>
                                <button onClick={(e) => { e.stopPropagation(); updateCue(i, { hidden: !c.hidden }); }} title={c.hidden ? 'Show' : 'Hide from projection'} style={{ background: 'transparent', border: 'none', color: c.hidden ? '#f87171' : C.faint, cursor: 'pointer', padding: 1 }}>{c.hidden ? <EyeOff size={11} /> : <Eye size={11} />}</button>
                                <button onClick={(e) => { e.stopPropagation(); updateCue(i, { locked: !c.locked }); }} title={c.locked ? 'Unlock' : 'Lock'} style={{ background: 'transparent', border: 'none', color: c.locked ? '#fbbf24' : C.faint, cursor: 'pointer', padding: 1 }}>{c.locked ? <Lock size={11} /> : <Unlock size={11} />}</button>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ));
                })()}
              </div>
            </div>

            {/* CUSTOM SLIDE ORDER */}
            <div>
              <div style={{ fontSize: 10, fontWeight: 800, color: C.faint, textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 8 }}>Custom Slide Order</div>
              <div style={{ display: 'grid', gap: 5 }}>
                {(editingSong.cues || []).map((c, i) => (
                  <div key={i} draggable onDragStart={(e) => dragStart(e, i)} onDragOver={(e) => dragOverTile(e, i)} onDrop={(e) => dropOnTile(e, i)} onDragEnd={dragEnded} onClick={(e) => slideClick(e, i)} title="Ctrl+click to tick it for Apply to ▸ Selected" style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 8, background: i === editorCueIdx ? 'rgba(139,92,246,0.16)' : C.elevated, border: dropHint && dropHint.i === i ? '1px dashed ' + ACCENT : (i === editorCueIdx ? '1px solid ' + ACCENT : '1px solid var(--ui-border2)'), boxShadow: applySel.includes(i) ? '0 0 0 2px ' + ACCENT : 'none', borderRadius: 8, padding: '6px 8px', cursor: 'grab' }}>
                    {dropHint && dropHint.i === i && (
                      <span style={{ position: 'absolute', top: 0, bottom: 0, [dropHint.side === 'before' ? 'left' : 'right']: 0, width: 3, background: ACCENT, borderRadius: 3 }} />
                    )}
                    <GripVertical size={13} color={C.faint2} style={{ flexShrink: 0 }} />
                    <span style={{ fontSize: 10.5, fontWeight: 800, color: C.faint, width: 20 }}>{i + 1}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      {(renameIdx === i && renameFrom === 'order') ? (
                        <input ref={renameRef} value={renameVal} onChange={(e) => setRenameVal(e.target.value)} onClick={(e) => e.stopPropagation()} onBlur={commitRename} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); commitRename(); } else if (e.key === 'Escape') { e.preventDefault(); cancelRename(); } }} style={{ width: '100%', background: C.input, color: C.text, border: '1px solid ' + ACCENT, borderRadius: 4, padding: '2px 4px', fontSize: 11, fontWeight: 700, outline: 'none' }} />
                      ) : (
                        <div onDoubleClick={(e) => { e.stopPropagation(); startRename(i, c, 'order'); }} title="Double-click to rename" style={{ fontSize: 11, fontWeight: 700, color: C.text2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', cursor: 'text' }}>{c.label || 'Slide'}</div>
                      )}
                      <div style={{ fontSize: 9.5, color: C.faint, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{stripMarkup(c.text || '').split('\n')[0] || 'empty'}</div>
                    </div>
                    <button onClick={(e) => { e.stopPropagation(); moveCue(i, -1); setApplySel([]); }} style={{ background: 'transparent', border: 'none', color: C.faint, cursor: 'pointer', padding: 2 }}><ChevronUp size={12} /></button>
                    <button onClick={(e) => { e.stopPropagation(); moveCue(i, 1); setApplySel([]); }} style={{ background: 'transparent', border: 'none', color: C.faint, cursor: 'pointer', padding: 2 }}><ChevronDown size={12} /></button>
                  </div>
                ))}
              </div>
            </div>

            {/* SONG BACKGROUND */}
            <div style={{ background: C.elevated, border: '1px solid var(--ui-border2)', borderRadius: 10, padding: 10 }}>
              <div style={{ fontSize: 10, fontWeight: 800, color: C.faint, textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 8 }}>Song Background</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: (mediaLibrary || []).some(a => a.kind === 'image' || a.kind === 'video') ? 8 : 0 }}>
                <input type="color" value={editingSong.bg_type === 'color' ? (editingSong.bg_value || '#000000') : '#000000'} onChange={(e) => setSongBackground('color', e.target.value)} style={{ width: 30, height: 26, background: C.input, border: '1px solid var(--ui-border2)', borderRadius: 5, cursor: 'pointer', padding: 0 }} title="Song-wide solid color background" />
                <label style={{ background: C.input, color: C.text2, border: '1px solid var(--ui-border2)', padding: '4px 8px', borderRadius: 5, fontSize: 10, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4 }}><ImageIcon size={10} /> Image<input type="file" accept="image/*" onChange={(e) => { songBgFileToBackground('image', e.target.files[0]); e.target.value = ''; }} style={{ display: 'none' }} /></label>
                <label style={{ background: C.input, color: C.text2, border: '1px solid var(--ui-border2)', padding: '4px 8px', borderRadius: 5, fontSize: 10, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4 }}><Video size={10} /> Video<input type="file" accept="video/mp4,video/webm" onChange={(e) => { songBgFileToBackground('video', e.target.files[0]); e.target.value = ''; }} style={{ display: 'none' }} /></label>
                {songHasBackground(editingSong) && (
                  <button onClick={() => setSongBackground('color', '#000000')} style={{ background: 'transparent', border: '1px solid var(--ui-border2)', color: C.muted, padding: '4px 7px', borderRadius: 5, fontSize: 10, cursor: 'pointer' }}>Clear</button>
                )}
              </div>
              {(mediaLibrary || []).some(a => a.kind === 'image' || a.kind === 'video') && (
                <div>
                  <div style={{ fontSize: 9, fontWeight: 800, color: C.faint, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 5 }}>From Media Library</div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 5 }}>
                    {(mediaLibrary || []).filter(a => a.kind === 'image' || a.kind === 'video').map(a => {
                      const active = editingSong.bg_type === a.kind && editingSong.bg_value === a.url;
                      return (
                        <div key={a.url} onClick={() => setSongBackground(a.kind, a.url)} title={a.url.split('/').pop() || a.url} style={{ position: 'relative', aspectRatio: '16 / 9', borderRadius: 6, overflow: 'hidden', cursor: 'pointer', border: active ? '2px solid #22c55e' : '1px solid var(--ui-border2)', background: '#000' }}>
                          {a.kind === 'image'
                            ? <img src={a.url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                            : <TileVideo src={a.url} animate={active} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />}
                          <span style={{ position: 'absolute', bottom: 2, right: 3, fontSize: 7, fontWeight: 800, color: '#fff', background: 'rgba(0,0,0,0.55)', borderRadius: 3, padding: '0 3px' }}>{a.kind}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* SLIDE PROPERTIES */}
            {showSlideProps && editorCue && (
              <div style={{ background: C.elevated, border: '1px solid var(--ui-border2)', borderRadius: 10, padding: 10 }}>
                <div style={{ fontSize: 10, fontWeight: 800, color: C.faint, textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 8 }}>Slide Properties</div>
                <label style={{ fontSize: 10, color: C.faint, fontWeight: 700, textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>Label</label>
                <input type="text" value={editorCue.label || ''} onChange={(e) => updateCue(editorCueIdx, { label: e.target.value })} style={{ width: '100%', background: C.input, color: C.text, border: '1px solid var(--ui-border2)', borderRadius: 6, padding: '7px', fontSize: 12, outline: 'none', marginBottom: 8 }} />
                <label style={{ fontSize: 10, color: C.faint, fontWeight: 700, textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>Background</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: (mediaLibrary || []).some(a => a.kind === 'image' || a.kind === 'video') ? 8 : 10 }}>
                  <input type="color" value={editorCue.bg_type === 'color' ? (editorCue.bg_value || '#000000') : '#000000'} onChange={(e) => setCueBackground(editorCueIdx, 'color', e.target.value)} style={{ width: 28, height: 24, background: C.input, border: '1px solid var(--ui-border2)', borderRadius: 5, cursor: 'pointer', padding: 0 }} />
                  <label style={{ background: C.input, color: C.text2, border: '1px solid var(--ui-border2)', padding: '4px 7px', borderRadius: 5, fontSize: 10, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 3 }}><ImageIcon size={10} /> Img<input type="file" accept="image/*" onChange={(e) => cueFileToBackground(editorCueIdx, 'image', e.target.files[0])} style={{ display: 'none' }} /></label>
                  <label style={{ background: C.input, color: C.text2, border: '1px solid var(--ui-border2)', padding: '4px 7px', borderRadius: 5, fontSize: 10, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 3 }}><Video size={10} /> Vid<input type="file" accept="video/mp4,video/webm" onChange={(e) => cueFileToBackground(editorCueIdx, 'video', e.target.files[0])} style={{ display: 'none' }} /></label>
                  {cueHasBackground(editorCue) && (
                    <button onClick={() => clearCueBackground(editorCueIdx)} style={{ background: 'transparent', border: '1px solid var(--ui-border2)', color: C.muted, padding: '4px 7px', borderRadius: 5, fontSize: 10, cursor: 'pointer' }}>Clear</button>
                  )}
                </div>
                {(mediaLibrary || []).some(a => a.kind === 'image' || a.kind === 'video') && (
                  <div style={{ marginBottom: 10 }}>
                    <div style={{ fontSize: 9, fontWeight: 800, color: C.faint, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 5 }}>From Media Library</div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 5 }}>
                      {(mediaLibrary || []).filter(a => a.kind === 'image' || a.kind === 'video').map(a => {
                        const active = editorCue.bg_type === a.kind && editorCue.bg_value === a.url;
                        return (
                          <div key={a.url} onClick={() => setCueBackground(editorCueIdx, a.kind, a.url)} title={a.url.split('/').pop() || a.url} style={{ position: 'relative', aspectRatio: '16 / 9', borderRadius: 6, overflow: 'hidden', cursor: 'pointer', border: active ? '2px solid #22c55e' : '1px solid var(--ui-border2)', background: '#000' }}>
                            {a.kind === 'image'
                              ? <img src={a.url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                              : <TileVideo src={a.url} animate={active} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />}
                            <span style={{ position: 'absolute', bottom: 2, right: 3, fontSize: 7, fontWeight: 800, color: '#fff', background: 'rgba(0,0,0,0.55)', borderRadius: 3, padding: '0 3px' }}>{a.kind}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
                <label style={{ fontSize: 10, color: C.faint, fontWeight: 700, textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>Slide Timer (sec)</label>
                <input type="number" min="0" max="7200" value={editorCue.duration || 0} onChange={(e) => updateCue(editorCueIdx, { duration: Math.max(0, Math.floor(Number(e.target.value) || 0)) })} style={{ width: '100%', background: C.input, color: C.text, border: '1px solid var(--ui-border2)', borderRadius: 6, padding: '7px', fontSize: 12, outline: 'none' }} />
              </div>
            )}

            {/* BOTTOM CONTROLS */}
            <div style={{ display: 'flex', gap: 6, marginTop: 'auto', paddingTop: 6 }}>
              <button onClick={() => duplicateCue(editorCueIdx)} style={{ background: C.elevated, border: '1px solid var(--ui-border2)', color: C.text2, borderRadius: 7, padding: '7px 10px', fontSize: 11, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}><Copy size={12} /> Duplicate</button>
              <button onClick={() => setShowSlideProps(v => !v)} style={{ background: C.elevated, border: '1px solid var(--ui-border2)', color: C.text2, borderRadius: 7, padding: '7px 10px', fontSize: 11, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}><PenLine size={12} /> Properties</button>
              <button onClick={() => { if (editorCueIdx < 0) return; const cues = [...(editingSong.cues || [])]; if (!cues.length) return; cues.splice(editorCueIdx, 1); setEditingSong({ ...editingSong, cues }); setEditorCueIdx(Math.min(editorCueIdx, Math.max(0, cues.length - 1))); }} style={{ background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.4)', color: '#f87171', borderRadius: 7, padding: '7px 10px', fontSize: 11, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}><Trash2 size={12} /> Delete</button>
            </div>
          </div>
        </>
      </TabPanel>
    </Tabs>

    {/* ===== FOOTER ===== */}
    <div style={{ position: 'relative', padding: '10px 16px', borderTop: '1px solid var(--ui-border2)', display: 'flex', justifyContent: 'flex-end', gap: 10, flexShrink: 0 }}>
      {/* APPLY TO — centred at the bottom of the modal, themed like every
          other segmented control here: the pill picks the target, the Apply
          button beside it is what actually writes. Hidden while smart-parsing
          a NEW song (nothing exists to copy between yet) — it belongs to the
          Manual Builder and to editing existing songs. */}
      {(editorMode === 'manual' || editingSong?.id != null) && (
      <div style={{ position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%,-50%)', display: 'flex', alignItems: 'center', gap: 9 }}>
        <span style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: 1.4, textTransform: 'uppercase', color: C.faint, whiteSpace: 'nowrap' }}>Apply to</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 2, background: C.elevated2, border: '1px solid var(--ui-border2)', borderRadius: 999, padding: 3 }}>
          {APPLY_SCOPES.map(({ k, label, tip }) => {
            const on = applyScope === k;
            const hot = applyHover === k;
            return (
              <button
                key={k}
                type="button"
                onClick={() => setApplyScope(k)}
                onMouseEnter={() => setApplyHover(k)}
                onMouseLeave={() => setApplyHover(h => (h === k ? null : h))}
                title={tip}
                style={{
                  background: on ? ACCENT : hot ? 'rgba(255,255,255,0.07)' : 'transparent',
                  border: 'none',
                  color: on ? '#fff' : hot ? C.text : C.muted,
                  borderRadius: 999,
                  padding: '6px 14px',
                  fontSize: 11.5,
                  fontWeight: 700,
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                  transition: 'background 120ms ease, color 120ms ease',
                }}
              >
                {k === 'selected' && applySel.length ? `Selected ${applySel.length}` : label}
              </button>
            );
          })}
        </div>
        {/* The button this control exists for. Hidden on "This Slide" (there
            is nothing to push — the change is already here); on "Selected" it
            stays on screen greyed out until at least one slide is ticked, so
            it lights up instead of appearing from nowhere. */}
        {applyScope !== 'this' && (() => {
          const ready = applyScope !== 'selected' || applySel.length > 0;
          const from = srcName();
          const tip = !ready
            ? 'Tick slides first — Ctrl+click them in the list'
            : applyScope === 'all'
              ? `Copy ${from} (type, box and line sizes) onto every slide`
              : `Copy ${from} (type, box and line sizes) onto ${applySel.length} ticked slide${applySel.length === 1 ? '' : 's'}`;
          return (
            <button
              type="button"
              onClick={() => { if (ready) applyToScope(applyScope); }}
              aria-disabled={!ready}
              title={tip}
              style={{
                background: ready ? ACCENT : C.elevated2,
                border: '1px solid ' + (ready ? 'transparent' : 'var(--ui-border2)'),
                color: ready ? '#fff' : C.faint,
                borderRadius: 999,
                padding: '6px 17px',
                fontSize: 11.5,
                fontWeight: 800,
                letterSpacing: 0.2,
                cursor: ready ? 'pointer' : 'not-allowed',
                whiteSpace: 'nowrap',
                transition: 'background 140ms ease, color 140ms ease, border-color 140ms ease',
              }}
            >Apply</button>
          );
        })()}
        <span style={{ width: 1, height: 22, background: 'var(--ui-border2)' }} />
      </div>
      )}
      <motion.button {...stubTap} onClick={() => setIsEditorOpen(false)} style={{ background: C.border, border: 'none', color: C.text, padding: '9px 16px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Cancel</motion.button>
      <motion.button {...stubTap} onClick={handleSaveSong} style={{ background: ACCENT, border: 'none', color: C.text, padding: '9px 22px', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>Save Song</motion.button>
    </div>

    {/* Apply confirmations go through the shared Untitled UI toast stack
        (mounted once in App.jsx): bottom-right, above this page, with an
        Undo action on real writes. */}
      </div>
    </div>
  );
}
