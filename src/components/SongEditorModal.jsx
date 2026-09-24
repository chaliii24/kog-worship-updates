import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { Plus, Trash2, Image as ImageIcon, Video, AlignLeft, AlignCenter, AlignRight, AlignHorizontalJustifyCenter, AlignVerticalJustifyStart, AlignVerticalJustifyCenter, AlignVerticalJustifyEnd, Bold, Italic, Underline, Strikethrough, Wand2, Cpu, Timer, Clock3, Link2, Save, Copy, ChevronUp, ChevronDown, Eye, EyeOff, Lock, Unlock, GripVertical, ChevronLeft, ChevronRight, Type, PenLine, BringToFront, SendToBack } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { TRANSITIONS, TRANSITION_KEYS, SPEED_OPTIONS, FONT_OPTIONS, FALLBACK_SYSTEM_FONTS } from '../lib/constants';
import { applyCaseTransform, renderLyricsLayout, FONT_SIZE_MIN, FONT_SIZE_MAX } from '../lib/lyrics';
import { useApp } from '../context/AppContext';
import { modalOverlay, panelLg, stubTap, iconBtnTap } from '../lib/anim';
import LyricsCanvasEditor from './LyricsCanvasEditor';
import FontPicker from './FontPicker';
import { TileVideo } from '../lib/perf';

let sysFontCache = null;

const quoteFont = (family) => {
  const f = String(family || '').trim();
  if (!f) return f;
  if (f.startsWith('"') || f.startsWith("'")) return f;
  return /\s/.test(f) ? `"${f}"` : f;
};

// Numeric field that lets you type freely. The raw text lives in local state
// while the field is focused, so clearing it shows an empty box (not a snapped
// fallback like 24) and typing "2" never rewrites itself mid-keystroke into
// "24". min/max are still enforced — the value is clamped as it is committed,
// and re-clamped for real when you leave the field — so only an absurdly big
// number gets limited.
function NumField({ value, onCommit, min = 0, max = Number.MAX_SAFE_INTEGER, decimal = false, style }) {
  const [draft, setDraft] = useState(null); // null = not editing, show `value`

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
    importUrl,
    setImportUrl,
    importUrlStatus,
    isParsing,
    isFetching,
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
    selectedAiModel,
    setSelectedAiModel,
    aiStatus,
    cueHasBackground,
    songHasBackground,
    processAutoPaste,
    fetchSongFromUrl,
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
    applyFontToAllCues,
    baseGroupLabel,
    splitCueAtTextareaCaret,
    applyAlignToAll,
    applyAnimToAll,
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

  return (
<motion.div {...modalOverlay} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.84)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 9999 }}>
  <motion.div {...panelLg} style={{ background: C.panel, border: '1px solid #2d2d3f', borderRadius: '14px', width: 'min(1540px, 97vw)', height: 'min(94vh, 960px)', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 24px 80px rgba(0,0,0,0.75)', position: 'relative' }}>

    {/* ===== HEADER ===== */}
    <div style={{ padding: '10px 16px', borderBottom: '1px solid #262639', display: 'flex', alignItems: 'center', gap: 14, flexShrink: 0, flexWrap: 'wrap' }}>
      <h2 style={{ margin: 0, fontSize: '15px', fontWeight: 800, whiteSpace: 'nowrap' }}>{editingSong.id ? 'Edit Song' : 'Add New Song'}</h2>
      <div style={{ display: 'flex', background: C.elevated2, padding: 3, borderRadius: 8, border: '1px solid #2d2d3f' }}>
        <button onClick={() => setEditorMode('manual')} style={{ background: editorMode === 'manual' ? ACCENT : 'transparent', border: 'none', color: C.text, padding: '6px 14px', borderRadius: 6, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>Manual Builder</button>
        <button onClick={() => setEditorMode('auto')} style={{ background: editorMode === 'auto' ? ACCENT : 'transparent', border: 'none', color: C.text, padding: '6px 14px', borderRadius: 6, fontSize: 12, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}><Wand2 size={13} /> Smart Auto-Paste</button>
      </div>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flex: 1, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
        <div style={{ flex: '0 1 220px', minWidth: 120 }}>
          <input type="text" value={editingSong.title} onChange={(e) => { const title = e.target.value; setEditingSong({ ...editingSong, title, title_cue: editingSong.title_cue ? { ...editingSong.title_cue, text: title } : editingSong.title_cue }); }} placeholder="Song title" style={{ width: '100%', background: C.elevated2, border: '1px solid #2d2d3f', borderRadius: 8, padding: '7px 10px', color: C.text, fontSize: 13, outline: 'none', boxSizing: 'border-box' }} />
        </div>
        <div style={{ flex: '0 1 150px', minWidth: 100 }}>
          <input type="text" value={editingSong.artist} onChange={(e) => setEditingSong({ ...editingSong, artist: e.target.value })} placeholder="Artist" style={{ width: '100%', background: C.elevated2, border: '1px solid #2d2d3f', borderRadius: 8, padding: '7px 10px', color: C.text, fontSize: 13, outline: 'none', boxSizing: 'border-box' }} />
        </div>
        <select value={editingSong.category} onChange={(e) => setEditingSong({ ...editingSong, category: e.target.value })} style={{ background: C.elevated2, color: C.text, border: '1px solid #2d2d3f', borderRadius: 8, padding: '7px 8px', fontSize: 12, outline: 'none' }}>
          <option value="Worship">Worship</option>
          <option value="Praise">Praise</option>
          <option value="Hymn">Hymn</option>
        </select>
      </div>
    </div>

    {/* ===== BUSY / LOADING OVERLAY ===== */}
    <AnimatePresence>
      {(isParsing || isFetching) && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }} style={{ position: 'absolute', inset: 0, zIndex: 50, background: 'rgba(5,5,9,0.82)', backdropFilter: 'blur(6px)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16 }}>
          <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 0.9, ease: 'linear' }} style={{ width: 52, height: 52, borderRadius: '50%', border: '3px solid rgba(59,130,246,0.22)', borderTopColor: ACCENT, boxSizing: 'border-box' }} />
          <div style={{ fontSize: 15, fontWeight: 800, color: C.text }}>{isParsing ? 'Parsing lyrics & building blocks…' : 'Fetching & preparing page…'}</div>
          <div style={{ fontSize: 12, color: C.faint, maxWidth: 440, textAlign: 'center', lineHeight: 1.55 }}>
            {isParsing ? 'Stripping chords and splitting your song into slides. This can take a few seconds.' : 'Downloading the page, then extracting the lyrics and sections.'}
          </div>
        </motion.div>
      )}
    </AnimatePresence>

    {/* ===== BODY ===== */}
    <div style={{ flex: 1, display: 'flex', overflow: 'hidden', minHeight: 0 }}>
      {editorMode === 'auto' ? (
        /* ---------- SMART AUTO-PASTE ---------- */
        <div style={{ flex: 1, overflowY: 'auto', padding: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, gap: 10, flexWrap: 'wrap' }}>
            <label style={{ fontSize: 13, fontWeight: 700, color: C.accLine, display: 'flex', alignItems: 'center', gap: 6 }}>
              <Wand2 size={14} /> Paste Ultimate Guitar / Chord Chart
            </label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: C.input, border: '1px solid #2d2d3f', padding: '4px 8px', borderRadius: 8 }}>
                <Cpu size={13} color={C.accLine} />
                <select value={selectedAiModel} onChange={(e) => setSelectedAiModel(e.target.value)} style={{ background: 'transparent', color: C.text, border: 'none', fontSize: 11, fontWeight: 700, outline: 'none', cursor: 'pointer' }}>
                  <option value="gemini-1.5-flash" style={{ background: C.input }}>Gemini 3.6 Flash (Online)</option>
                  <option value="gemini-1.5-pro" style={{ background: C.input }}>Gemini Pro (Online)</option>
                  <option value="ollama" style={{ background: C.input }}>Local Ollama (Offline)</option>
                </select>
              </div>
              {aiStatus && (
                <span style={{ fontSize: 10, background: aiStatus.includes('Online') ? 'rgba(34,197,94,0.2)' : 'rgba(59,130,246,0.2)', color: aiStatus.includes('Online') ? '#4ade80' : '#60a5fa', padding: '4px 8px', borderRadius: 8, fontWeight: 700, border: aiStatus.includes('Online') ? '1px solid rgba(34,197,94,0.4)' : '1px solid rgba(59,130,246,0.4)' }}>{aiStatus}</span>
              )}
            </div>
          </div>
          <p style={{ fontSize: 12, color: C.faint, margin: '0 0 12px 0' }}>Smart Paste strips chords, Google Docs styling and web formatting, then maps song sections automatically using your chosen engine.</p>
          <div style={{ display: 'flex', gap: 6, marginBottom: 10, alignItems: 'center' }}>
            <Link2 size={13} color={C.accLine} />
            <input type="text" value={importUrl} onChange={(e) => setImportUrl(e.target.value)} placeholder="Paste chord chart URL (Ultimate Guitar, etc.)…" style={{ flex: 1, background: C.input, border: '1px solid #2d2d3f', borderRadius: 8, padding: '8px 10px', color: C.text, fontSize: 12, outline: 'none' }} />
            <button onClick={fetchSongFromUrl} disabled={isParsing || isFetching} style={{ background: C.input, border: '1px solid ' + ACCENT, color: C.accLine, padding: '8px 12px', borderRadius: 8, fontSize: 11, fontWeight: 700, cursor: (isParsing || isFetching) ? 'wait' : 'pointer', whiteSpace: 'nowrap', opacity: (isParsing || isFetching) ? 0.6 : 1 }}>{isFetching && !isParsing ? 'Fetching…' : 'Fetch & Parse'}</button>
          </div>
          {importUrlStatus && (
            <div style={{ fontSize: 11, color: importUrlStatus.includes('✓') ? '#4ade80' : importUrlStatus.includes('failed') || importUrlStatus.includes('Invalid') || importUrlStatus.includes('Could') ? '#ef4444' : '#60a5fa', margin: '0 0 10px 0', fontWeight: 600, whiteSpace: 'pre-wrap' }}>{importUrlStatus}</div>
          )}
          <textarea rows={10} value={rawPasteText} onChange={(e) => setRawPasteText(e.target.value)} placeholder="[Verse 1]&#10;C#m     A     E&#10;You are here..." style={{ width: '100%', background: C.input, border: '1px solid #2d2d3f', borderRadius: 8, padding: 12, color: C.text, fontSize: 13, fontFamily: 'monospace', outline: 'none', resize: 'vertical' }} />
          <button onClick={() => processAutoPaste()} disabled={isParsing || isFetching} style={{ marginTop: 12, background: ACCENT, border: 'none', color: C.text, padding: '10px 16px', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: (isParsing || isFetching) ? 'wait' : 'pointer', display: 'flex', alignItems: 'center', gap: 6, opacity: (isParsing || isFetching) ? 0.6 : 1 }}><Wand2 size={14} /> {isParsing ? 'Parsing…' : 'Parse & Build Blocks'}</button>
          {editingSong.cues && editingSong.cues.length > 0 && (
            <div style={{ marginTop: 16, borderTop: '1px solid #2d2d3f', paddingTop: 16 }}>
              <label style={{ fontSize: 11, fontWeight: 700, color: '#4ade80', textTransform: 'uppercase', display: 'block', marginBottom: 8 }}>Generated Song Blocks ({editingSong.cues.length})</label>
              <div style={{ display: 'grid', gap: 8, maxHeight: 260, overflowY: 'auto' }}>
                {editingSong.cues.map((c, i) => (
                  <div key={i} style={{ background: C.input, border: '1px solid #2d2d3f', borderRadius: 6, padding: '8px 12px', display: 'flex', alignItems: 'center', gap: 10 }}>
                    <button onClick={() => { setEditingSong({ ...editingSong, cues: editingSong.cues.filter((_, x) => x !== i) }); }} style={{ background: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer', padding: 2 }}><Trash2 size={13} /></button>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ fontSize: 10, color: C.accLine, fontWeight: 700, textTransform: 'uppercase' }}>{c.label}</span>
                      <p style={{ margin: '2px 0 0 0', fontSize: 12, color: C.text2, whiteSpace: 'pre-line' }}>{c.text}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : (
        <>
          {/* ================== LEFT SIDEBAR ================== */}
          <div style={{ flex: '0 0 240px', minWidth: 200, borderRight: '1px solid #262639', overflowY: 'auto', padding: 12, display: 'flex', flexDirection: 'column', gap: 12 }}>

            {/* ALIGNMENT */}
            <div style={{ background: C.elevated, border: '1px solid #2d2d3f', borderRadius: 10, padding: 10 }}>
              <div style={{ fontSize: 10, fontWeight: 800, color: C.faint, textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 8 }}>Alignment</div>
              <div style={{ display: 'flex', gap: 4, marginBottom: 4 }}>
                {[['left', AlignLeft], ['center', AlignCenter], ['right', AlignRight], ['justify', AlignHorizontalJustifyCenter]].map(([a, Icon]) => (
                  <button key={a} title={`Align ${a}`} onClick={() => updateCue(editorCueIdx, { align: a })} style={{ flex: 1, background: (editorCue?.align || 'center') === a ? ACCENT : C.elevated2, border: '1px solid #2d2d3f', color: (editorCue?.align || 'center') === a ? C.text : C.muted, borderRadius: 6, padding: '6px 0', cursor: 'pointer', display: 'flex', justifyContent: 'center' }}><Icon size={14} /></button>
                ))}
              </div>
              <div style={{ display: 'flex', gap: 4, marginBottom: 8 }}>
                {[['top', AlignVerticalJustifyStart, 'Top'], ['middle', AlignVerticalJustifyCenter, 'Middle'], ['bottom', AlignVerticalJustifyEnd, 'Bottom']].map(([v, Icon, lbl]) => (
                  <button key={v} title={`Vertical: ${lbl}`} onClick={() => updateCue(editorCueIdx, { valign: v })} style={{ flex: 1, background: (editorCue?.valign || 'middle') === v ? ACCENT : C.elevated2, border: '1px solid #2d2d3f', color: (editorCue?.valign || 'middle') === v ? C.text : C.muted, borderRadius: 6, padding: '6px 0', cursor: 'pointer', display: 'flex', justifyContent: 'center' }}><Icon size={14} /></button>
                ))}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <label style={{ fontSize: 10, color: C.faint, fontWeight: 700, flex: 1 }}>Padding</label>
                <input type="range" min="0" max="80" step="2" value={editorCue?.pad ?? 10} onChange={(e) => updateCueThrottled(editorCueIdx, { pad: Number(e.target.value) })} style={{ flex: 1 }} />
                <span style={{ fontSize: 11, color: C.muted, width: 28, textAlign: 'right' }}>{editorCue?.pad ?? 10}</span>
              </div>
              <button onClick={applyAlignToAll} style={{ width: '100%', background: 'rgba(59,130,246,0.14)', border: '1px solid ' + ACCENT, color: ACCENT, borderRadius: 7, padding: '7px', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>Apply Align to All</button>
            </div>

            {/* LAYOUT */}
            <div style={{ background: C.elevated, border: '1px solid #2d2d3f', borderRadius: 10, padding: 10 }}>
              <div style={{ fontSize: 10, fontWeight: 800, color: C.faint, textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 8 }}>Layout</div>
              <div style={{ fontSize: 10, color: C.faint, fontWeight: 700, textTransform: 'uppercase', marginBottom: 4 }}>Resize</div>
              <div style={{ display: 'flex', gap: 4, marginBottom: 4 }}>
                {[['fit', 'Fit'], ['fill', 'Fill'], ['scale', 'Scale']].map(([m, lbl]) => (
                  <button key={m} onClick={() => updateCue(editorCueIdx, { resizeMode: m })} style={{ flex: 1, background: (editorCue?.resizeMode || 'fit') === m ? ACCENT : C.elevated2, border: '1px solid #2d2d3f', color: (editorCue?.resizeMode || 'fit') === m ? C.text : C.muted, borderRadius: 6, padding: '6px 0', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>{lbl}</button>
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
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, background: C.elevated2, border: '1px solid #2d2d3f', borderRadius: 7, padding: 8, marginBottom: 8 }}>
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
                  <button key={m} onClick={() => updateCue(editorCueIdx, { layoutMode: m })} style={{ flex: 1, background: (editorCue?.layoutMode || 'static') === m ? ACCENT : C.elevated2, border: '1px solid #2d2d3f', color: (editorCue?.layoutMode || 'static') === m ? C.text : C.muted, borderRadius: 6, padding: '6px 0', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>{lbl}</button>
                ))}
              </div>
              {(editorCue?.layoutMode || 'static') === 'ticker' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, background: C.elevated2, border: '1px solid #2d2d3f', borderRadius: 7, padding: 8, marginTop: 6 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <label style={{ fontSize: 10, color: C.faint, fontWeight: 700, flex: 1, whiteSpace: 'nowrap' }}>Speed (sec)</label>
                    <input type="range" min="4" max="90" step="1" value={editorCue?.tickerSpeed ?? 18} onChange={(e) => updateCueThrottled(editorCueIdx, { tickerSpeed: Number(e.target.value) })} style={{ flex: 1 }} />
                    <span style={{ fontSize: 11, color: C.muted, width: 28, textAlign: 'right' }}>{editorCue?.tickerSpeed ?? 18}</span>
                  </div>
                  <div style={{ display: 'flex', gap: 4 }}>
                    {[['ltr', 'Scroll ←'], ['rtl', 'Scroll →']].map(([d, lbl]) => (
                      <button key={d} onClick={() => updateCue(editorCueIdx, { tickerDir: d })} style={{ flex: 1, background: (editorCue?.tickerDir || 'ltr') === d ? ACCENT : C.elevated2, border: '1px solid #2d2d3f', color: (editorCue?.tickerDir || 'ltr') === d ? C.text : C.muted, borderRadius: 6, padding: '6px 0', fontSize: 10.5, fontWeight: 700, cursor: 'pointer' }}>{lbl}</button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* TYPOGRAPHY */}
            <div style={{ background: C.elevated, border: '1px solid #2d2d3f', borderRadius: 10, padding: 10 }}>
              <div style={{ fontSize: 10, fontWeight: 800, color: C.faint, textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 8 }}>Typography</div>
              <label style={{ fontSize: 10, color: C.faint, fontWeight: 700, textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>Font Family</label>
              <FontPicker value={editorCue?.font || FONT_OPTIONS[0].value} choices={fontChoices} onChange={(v) => updateCue(editorCueIdx, { font: v })} C={C} />
              <button onClick={() => applyFontToAllCues(editorCue?.font || FONT_OPTIONS[0].value)} title="Set this font on every slide of the song (including the title slide)" style={{ width: '100%', marginTop: 6, background: C.elevated2, border: '1px dashed #2d2d3f', color: C.muted, borderRadius: 6, padding: '6px', fontSize: 10.5, fontWeight: 700, cursor: 'pointer' }}>Apply font to all slides</button>
              <div style={{ display: 'flex', gap: 4, marginTop: 8 }}>
                {[
                  ['bold', Bold, 'Bold', true],
                  ['italic', Italic, 'Italic', false],
                  ['underline', Underline, 'Underline', false],
                  ['strike', Strikethrough, 'Strikethrough', false],
                ].map(([k, Icon, lbl, def]) => {
                  const active = k === 'bold' ? (editorCue?.bold !== false) : !!(editorCue?.[k]);
                  return (
                    <button key={k} title={lbl} onClick={() => updateCue(editorCueIdx, { [k]: !active })} style={{ flex: 1, background: active ? ACCENT : C.elevated2, border: '1px solid ' + (active ? ACCENT : '#2d2d3f'), color: active ? C.text : C.muted, borderRadius: 6, padding: '6px 0', cursor: 'pointer', display: 'flex', justifyContent: 'center' }}><Icon size={14} /></button>
                  );
                })}
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: 10, color: C.faint, fontWeight: 700, textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>Size</label>
                  <NumField key={`size-${editorCueIdx}`} value={editorCue?.size || 92} min={FONT_SIZE_MIN} max={FONT_SIZE_MAX} onCommit={(size) => updateCue(editorCueIdx, { size })} style={{ width: '100%', background: C.input, color: C.text, border: '1px solid #2d2d3f', borderRadius: 6, padding: '7px', fontSize: 12, textAlign: 'center', outline: 'none' }} />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: 10, color: C.faint, fontWeight: 700, textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>Line Ht</label>
                  <NumField key={`lh-${editorCueIdx}`} value={editorCue?.lineHeight || 1.05} min={0.3} max={5} decimal onCommit={(lineHeight) => updateCue(editorCueIdx, { lineHeight })} style={{ width: '100%', background: C.input, color: C.text, border: '1px solid #2d2d3f', borderRadius: 6, padding: '7px', fontSize: 12, textAlign: 'center', outline: 'none' }} />
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
                  <button key={m} onClick={() => updateCue(editorCueIdx, { case: m })} style={{ flex: 1, background: (editorCue?.case || 'none') === m ? ACCENT : C.elevated2, border: '1px solid #2d2d3f', color: (editorCue?.case || 'none') === m ? C.text : C.muted, borderRadius: 6, padding: '6px 0', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>{m === 'title' ? 'Tt' : lbl}</button>
                ))}
              </div>
            </div>

            {/* TEXT STYLE */}
            <div style={{ background: C.elevated, border: '1px solid #2d2d3f', borderRadius: 10, padding: 10 }}>
              <div style={{ fontSize: 10, fontWeight: 800, color: C.faint, textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 8 }}>Text Style</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <label style={{ fontSize: 10, color: C.faint, fontWeight: 700, flex: 1 }}>Color</label>
                <input type="color" value={editorCue?.color || '#ffffff'} onChange={(e) => updateCue(editorCueIdx, { color: e.target.value })} style={{ width: 30, height: 26, background: C.input, border: '1px solid #2d2d3f', borderRadius: 5, cursor: 'pointer', padding: 0 }} />
              </div>
              {[['shadow', `Shadow ${editorCue?.shadow ? 'ON' : 'OFF'}`], ['outline', `Outline ${editorCue?.outline ? 'ON' : 'OFF'}`], ['gradient', `Gradient ${editorCue?.gradient ? 'ON' : 'OFF'}`], ['highlight', `Highlight ${editorCue?.highlight ? 'ON' : 'OFF'}`]].map(([k, lbl]) => (
                <button key={k} onClick={() => updateCue(editorCueIdx, { [k]: !editorCue?.[k] })} style={{ width: '100%', background: editorCue?.[k] ? 'rgba(34,197,94,0.15)' : C.elevated2, border: '1px solid ' + (editorCue?.[k] ? 'rgba(34,197,94,0.5)' : '#2d2d3f'), color: editorCue?.[k] ? '#4ade80' : C.muted, borderRadius: 6, padding: '6px', fontSize: 10.5, fontWeight: 700, cursor: 'pointer', marginBottom: 4 }}>{lbl}</button>
              ))}
              {editorCue?.shadow && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, background: C.elevated2, border: '1px solid #2d2d3f', borderRadius: 7, padding: 8, marginTop: 2 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <label style={{ fontSize: 10, color: C.faint, fontWeight: 700, flex: 1 }}>Color</label>
                    <input type="color" value={editorCue?.shadowColor || '#000000'} onChange={(e) => updateCue(editorCueIdx, { shadowColor: e.target.value })} style={{ width: 30, height: 24, background: C.input, border: '1px solid #2d2d3f', borderRadius: 5, cursor: 'pointer', padding: 0 }} />
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
              {editorCue?.outline && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, background: C.elevated2, border: '1px solid #2d2d3f', borderRadius: 7, padding: 8, marginTop: 2 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <label style={{ fontSize: 10, color: C.faint, fontWeight: 700, flex: 1 }}>Stroke</label>
                    <input type="color" value={editorCue?.strokeColor || '#000000'} onChange={(e) => updateCue(editorCueIdx, { strokeColor: e.target.value })} style={{ width: 30, height: 24, background: C.input, border: '1px solid #2d2d3f', borderRadius: 5, cursor: 'pointer', padding: 0 }} />
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <label style={{ fontSize: 10, color: C.faint, fontWeight: 700, flex: 1 }}>Width</label>
                    <input type="range" min="0" max="8" step="0.5" value={editorCue?.strokeWidth ?? 1.5} onChange={(e) => updateCueThrottled(editorCueIdx, { strokeWidth: Number(e.target.value) })} style={{ flex: 1 }} />
                    <span style={{ fontSize: 11, color: C.muted, width: 28, textAlign: 'right' }}>{editorCue?.strokeWidth ?? 1.5}</span>
                  </div>
                </div>
              )}
              {editorCue?.gradient && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, background: C.elevated2, border: '1px solid #2d2d3f', borderRadius: 7, padding: 8, marginTop: 2 }}>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 6 }}>
                      <label style={{ fontSize: 10, color: C.faint, fontWeight: 700, flex: 1 }}>From</label>
                      <input type="color" value={editorCue?.gradientColor1 || '#f5f5f4'} onChange={(e) => updateCue(editorCueIdx, { gradientColor1: e.target.value })} style={{ width: 30, height: 24, background: C.input, border: '1px solid #2d2d3f', borderRadius: 5, cursor: 'pointer', padding: 0 }} />
                    </div>
                    <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 6 }}>
                      <label style={{ fontSize: 10, color: C.faint, fontWeight: 700, flex: 1 }}>To</label>
                      <input type="color" value={editorCue?.gradientColor2 || '#93c5fd'} onChange={(e) => updateCue(editorCueIdx, { gradientColor2: e.target.value })} style={{ width: 30, height: 24, background: C.input, border: '1px solid #2d2d3f', borderRadius: 5, cursor: 'pointer', padding: 0 }} />
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <label style={{ fontSize: 10, color: C.faint, fontWeight: 700, flex: 1 }}>Angle</label>
                    <input type="range" min="0" max="360" step="5" value={editorCue?.gradientAngle ?? 180} onChange={(e) => updateCueThrottled(editorCueIdx, { gradientAngle: Number(e.target.value) })} style={{ flex: 1 }} />
                    <span style={{ fontSize: 11, color: C.muted, width: 36, textAlign: 'right' }}>{editorCue?.gradientAngle ?? 180}°</span>
                  </div>
                </div>
              )}
              {editorCue?.highlight && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <label style={{ fontSize: 10, color: C.faint, fontWeight: 700, flex: 1 }}>Opacity</label>
                  <input type="range" min="10" max="90" value={editorCue?.hlOpacity ?? 40} onChange={(e) => updateCueThrottled(editorCueIdx, { hlOpacity: Number(e.target.value) })} style={{ flex: 1 }} />
                  <span style={{ fontSize: 11, color: C.muted, width: 28, textAlign: 'right' }}>{editorCue?.hlOpacity ?? 40}%</span>
                </div>
              )}
            </div>

            {/* TRANSITIONS */}
            <div style={{ background: C.elevated, border: '1px solid #2d2d3f', borderRadius: 10, padding: 10 }}>
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
                        border: '1px solid ' + (selected ? ACCENT : isHovered ? 'rgba(0,170,255,0.5)' : '#2d2d3f'),
                        color: selected ? C.text : isHovered ? '#e0e0e0' : C.muted,
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
                    <button key={s.v} onClick={() => updateCue(editorCueIdx, { speed: s.v })} title={s.label} style={{ flex: 1, background: selected ? ACCENT : C.elevated2, border: '1px solid ' + (selected ? ACCENT : '#2d2d3f'), color: selected ? C.text : C.muted, borderRadius: 5, padding: '6px 0', fontSize: 9.5, fontWeight: 700, cursor: 'pointer' }}>{s.v}s</button>
                  );
                })}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10 }}>
                <label style={{ fontSize: 10, color: C.faint, fontWeight: 700, whiteSpace: 'nowrap' }}>Auto Next (sec)</label>
                <input type="number" min="0" value={editorCue?.autoNext ?? 0} onChange={(e) => updateCue(editorCueIdx, { autoNext: Math.max(0, Math.floor(Number(e.target.value) || 0)) })} style={{ width: 60, background: C.input, color: C.text, border: '1px solid #2d2d3f', borderRadius: 6, padding: '6px', fontSize: 12, textAlign: 'center', outline: 'none' }} />
              </div>
              <button onClick={applyAnimToAll} style={{ width: '100%', marginTop: 10, background: 'rgba(59,130,246,0.14)', border: '1px solid ' + ACCENT, color: ACCENT, borderRadius: 7, padding: '7px', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>Apply Anim to All</button>
            </div>

            {/* PRESENTER NOTES */}
            <div style={{ background: C.elevated, border: '1px solid #2d2d3f', borderRadius: 10, padding: 10, flex: 1, minHeight: 120, display: 'flex', flexDirection: 'column' }}>
              <div style={{ fontSize: 10, fontWeight: 800, color: C.faint, textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 8 }}>Presenter Notes</div>
              <textarea
                value={editorCue?.notes || ''}
                onChange={(e) => updateCue(editorCueIdx, { notes: e.target.value })}
                placeholder="Stage-only: cues, chords, prompts… (never shown to the audience)"
                style={{ flex: 1, resize: 'none', background: C.input, color: C.text, border: '1px solid #2d2d3f', borderRadius: 6, padding: 8, fontSize: 12, outline: 'none' }}
              />
            </div>
          </div>

          {/* ================== CENTER CANVAS ================== */}
          <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', background: C.bg }}>
            {/* toolbar */}
            <div style={{ padding: '8px 12px', borderBottom: '1px solid #262639', display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              <ToolbarBtn onClick={() => { const cues = [...(editingSong.cues || []), { label: 'Verse 1', text: '', box: DEFAULT_BOX }]; setEditingSong({ ...editingSong, cues }); setEditorCueIdx(cues.length - 1); }} title="Add a new slide"><Plus size={14} /> <span>New Slide</span></ToolbarBtn>
              <ToolbarBtn onClick={() => { const cues = [...(editingSong.cues || [])]; if (!cues.length) { cues.push({ label: 'Verse 1', text: '', box: DEFAULT_BOX, locked: false }); setEditingSong({ ...editingSong, cues }); setEditorCueIdx(0); } else if (editorCueIdx >= 0 && cues[editorCueIdx] && !cues[editorCueIdx].box) { cues[editorCueIdx] = { ...cues[editorCueIdx], box: DEFAULT_BOX, locked: false }; setEditingSong({ ...editingSong, cues }); } }} title="Add/edit text box on this slide"><Type size={14} /> <span>Text</span></ToolbarBtn>
              <ToolbarBtn onClick={() => duplicateCue(editorCueIdx)} title="Duplicate slide"><Copy size={14} /></ToolbarBtn>
              <ToolbarBtn danger onClick={() => { if (editorCueIdx < 0) return; const cues = [...(editingSong.cues || [])]; if (!cues.length) return; cues.splice(editorCueIdx, 1); setEditingSong({ ...editingSong, cues }); setEditorCueIdx(Math.min(editorCueIdx, Math.max(0, cues.length - 1))); }} title="Delete slide"><Trash2 size={14} /></ToolbarBtn>
              <div style={{ width: 1, height: 18, background: '#2d2d3f', margin: '0 4px' }} />
              {[['left', AlignLeft], ['center', AlignCenter], ['right', AlignRight], ['justify', AlignHorizontalJustifyCenter]].map(([a, Icon]) => (
                <ToolbarBtn key={a} onClick={() => updateCue(editorCueIdx, { align: a })} title={`Align ${a}`} active={(editorCue?.align || 'center') === a}><Icon size={14} /></ToolbarBtn>
              ))}
              <div style={{ width: 1, height: 18, background: '#2d2d3f', margin: '0 4px' }} />
              {[['top', AlignVerticalJustifyStart], ['middle', AlignVerticalJustifyCenter], ['bottom', AlignVerticalJustifyEnd]].map(([v, Icon]) => (
                <ToolbarBtn key={v} onClick={() => updateCue(editorCueIdx, { valign: v })} title={`Vertical ${v}`} active={(editorCue?.valign || 'middle') === v}><Icon size={14} /></ToolbarBtn>
              ))}
              <div style={{ width: 1, height: 18, background: '#2d2d3f', margin: '0 4px' }} />
              <ToolbarBtn onClick={() => updateCue(editorCueIdx, { stack: 'front' })} title="Bring forward"><BringToFront size={14} /></ToolbarBtn>
              <ToolbarBtn onClick={() => updateCue(editorCueIdx, { stack: 'back' })} title="Send back"><SendToBack size={14} /></ToolbarBtn>
              <div style={{ width: 1, height: 18, background: '#2d2d3f', margin: '0 4px' }} />
              <div style={{ flex: 1 }} />
              <span style={{ fontSize: 10.5, fontWeight: 700, color: C.faint2, background: C.elevated, border: '1px solid #2d2d3f', borderRadius: 999, padding: '3px 9px' }}>
                <Clock3 size={11} style={{ verticalAlign: 'middle', marginRight: 4 }} />{TRANSITIONS.find(t => TRANSITION_KEYS[t] === (editorCue?.anim || 'none')) || 'None'} · {(editorCue?.speed ?? 0.5)}s
              </span>
            </div>

            {/* counter / nav */}
            <div style={{ padding: '8px 12px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
              <button onClick={() => setEditorCueIdx(i => Math.max(-1, i - 1))} style={{ background: C.elevated, border: '1px solid #2d2d3f', color: C.muted, borderRadius: 7, padding: '5px 9px', cursor: 'pointer', display: 'flex' }}><ChevronLeft size={15} /></button>
              <span style={{ fontSize: 13, fontWeight: 800, color: C.text }}>{editorCueIdx === -1 ? 'Title Slide' : `${editorCueIdx + 1} of ${(editingSong.cues || []).length}`}</span>
              <button onClick={() => setEditorCueIdx(i => Math.min((editingSong.cues || []).length - 1, i + 1))} style={{ background: C.elevated, border: '1px solid #2d2d3f', color: C.muted, borderRadius: 7, padding: '5px 9px', cursor: 'pointer', display: 'flex' }}><ChevronRight size={15} /></button>
            </div>

            {/* canvas */}
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 12, overflow: 'hidden', minHeight: 0 }}>
              {editorCue ? (
                <LyricsCanvasEditor
                  text={editorCue.text || ''}
                  fontFamily={editorCue.font || FONT_OPTIONS[0].value}
                  fontSize={Number(editorCue.size) || 110}
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
                  pad={editorCue.pad ?? 10}
                  fill={editorCue?.resizeMode === 'fill'}
                  resizeMode={editorCue?.resizeMode || 'fit'}
                  fillMax={editorCue?.fillMax ?? 165}
                  fillMin={editorCue?.fillMin ?? 18}
                  layoutMode={editorCue?.layoutMode || 'static'}
                  tickerSpeed={editorCue?.tickerSpeed ?? 18}
                  tickerDir={editorCue?.tickerDir || 'ltr'}
                  previewAnim={hoverAnim}
                  previewTick={previewTick}
                  previewSpeed={editorCue?.speed ?? 0.5}                  onTextChange={(t) => updateCue(editorCueIdx, { text: t })}
                  onBoxChange={(b) => updateCue(editorCueIdx, { box: b })}
                  onSizeChange={(s) => updateCue(editorCueIdx, { size: s })}
                />
              ) : (
                <div style={{ width: '100%', aspectRatio: '16 / 9', borderRadius: 12, boxShadow: '0 12px 44px rgba(0,0,0,0.45)', border: '1px solid #2d2d3f', background: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(255,255,255,0.55)', fontSize: 18, fontWeight: 700, fontFamily: 'system-ui, sans-serif' }}>Add a text box to begin</div>
              )}
            </div>
          </div>

          {/* ================== RIGHT SIDEBAR ================== */}
          <div style={{ flex: '0 0 300px', minWidth: 240, borderLeft: '1px solid #262639', overflowY: 'auto', padding: 12, display: 'flex', flexDirection: 'column', gap: 12 }}>
            {/* SLIDES */}
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <span style={{ fontSize: 10, fontWeight: 800, color: C.faint, textTransform: 'uppercase', letterSpacing: 1.5 }}>Slides</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  <input type="number" min="1" max="12" value={linesPerSlide} onChange={(e) => setLinesPerSlide(e.target.value)} title="Lines per slide" style={{ width: 42, background: C.input, color: C.text, border: '1px solid #2d2d3f', borderRadius: 6, padding: '4px 5px', fontSize: 11, textAlign: 'center', outline: 'none' }} />
                  <button onClick={splitCuesToLines} title="Split long sections into N-line slides" style={{ background: '#1e1b4b', border: '1px solid ' + ACCENT, color: C.accLine, borderRadius: 6, padding: '4px 7px', fontSize: 10, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 3 }}><AlignLeft size={11} /> Split</button>
                </div>
              </div>
              <div style={{ display: 'grid', gap: 8, maxHeight: 380, overflowY: 'auto' }}>
                {/* Title Slide Thumbnail */}
                <div onClick={() => setEditorCueIdx(-1)} style={{ cursor: 'pointer', position: 'relative', background: editorCueIdx === -1 ? 'rgba(59,130,246,0.16)' : C.elevated, border: editorCueIdx === -1 ? '1px solid ' + ACCENT : '1px solid #2d2d3f', borderRadius: 8, overflow: 'hidden', padding: 6 }}>
                  <div style={{ width: '100%', aspectRatio: '16 / 9', borderRadius: 5, background: songHasBackground(editingSong) && editingSong.bg_type === 'color' ? editingSong.bg_value : '#0a0a0a', position: 'relative', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {editingSong.bg_type === 'image' && editingSong.bg_value && (
                      <img src={editingSong.bg_value} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
                    )}
                    {editingSong.bg_type === 'video' && editingSong.bg_value && (
                      <TileVideo src={editingSong.bg_value} animate={editorCueIdx === -1} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
                    )}
                    <div style={{ position: 'relative', zIndex: 2, color: '#f5f5f4', fontSize: 10, fontWeight: 800, textAlign: 'center', padding: '0 6px', textShadow: '0 1px 3px rgba(0,0,0,0.8)' }}>{editingSong.title || 'Song Title'}</div>
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
                    <div key={gi}>
                      <div style={{ fontSize: 10, fontWeight: 800, color: C.accLine, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <span>{g.base}</span><span style={{ color: C.faint, fontWeight: 600, letterSpacing: 0 }}>{g.items.length} slide{g.items.length > 1 ? 's' : ''}</span>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                        {g.items.map(({ c, i, li }) => (
                          <div key={i} onClick={() => setEditorCueIdx(i)} style={{ cursor: 'pointer', position: 'relative', background: i === editorCueIdx ? 'rgba(59,130,246,0.16)' : C.elevated, border: i === editorCueIdx ? '1px solid ' + ACCENT : '1px solid #2d2d3f', borderRadius: 8, overflow: 'hidden', padding: 6 }}>
                            <div style={{ width: '100%', aspectRatio: '16 / 9', borderRadius: 5, background: (resolveBg(c, editingSong) && resolveBg(c, editingSong).type === 'color' ? resolveBg(c, editingSong).value : '#0a0a0a'), position: 'relative', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                              {resolveBg(c, editingSong) && resolveBg(c, editingSong).type === 'image' && (
                                <img key={`tb-${resolveBg(c, editingSong).value}`} src={resolveBg(c, editingSong).value} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
                              )}
                              {resolveBg(c, editingSong) && resolveBg(c, editingSong).type === 'video' && (
                                <TileVideo key={`tb-${resolveBg(c, editingSong).value}`} src={resolveBg(c, editingSong).value} animate={i === editorCueIdx} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
                              )}
                              <div style={{ position: 'relative', zIndex: 2, color: c.color || '#f5f5f4', fontFamily: c.font || 'system-ui, sans-serif', fontSize: 9.5, fontWeight: 700, textAlign: 'center', padding: '0 6px', lineHeight: 1.25, textShadow: '0 1px 3px rgba(0,0,0,0.8)', maxWidth: '100%' }}>{(applyCaseTransform(c.text || '', c.case || 'none')).split('\n').slice(0, 3).join(' ')}</div>
                              <div style={{ position: 'absolute', top: 3, left: 4, fontSize: 8, fontWeight: 800, color: 'rgba(255,255,255,0.85)', background: 'rgba(0,0,0,0.45)', borderRadius: 3, padding: '0 4px' }}>{gi + 1}.{li}</div>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 5 }}>
                              <span style={{ fontSize: 9.5, fontWeight: 700, color: C.text2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 84 }}>{c.label}</span>
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
                  <div key={i} draggable onDragStart={() => setDragFrom(i)} onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); if (dragFrom != null) reorderCues(dragFrom, i); setDragFrom(null); }} onClick={() => setEditorCueIdx(i)} style={{ display: 'flex', alignItems: 'center', gap: 8, background: i === editorCueIdx ? 'rgba(59,130,246,0.16)' : C.elevated, border: i === editorCueIdx ? '1px solid ' + ACCENT : '1px solid #2d2d3f', borderRadius: 8, padding: '6px 8px', cursor: 'grab' }}>
                    <GripVertical size={13} color={C.faint2} style={{ flexShrink: 0 }} />
                    <span style={{ fontSize: 10.5, fontWeight: 800, color: C.faint, width: 20 }}>{i + 1}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: C.text2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.label || 'Slide'}</div>
                      <div style={{ fontSize: 9.5, color: C.faint, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{(c.text || '').split('\n')[0] || 'empty'}</div>
                    </div>
                    <button onClick={(e) => { e.stopPropagation(); moveCue(i, -1); }} style={{ background: 'transparent', border: 'none', color: C.faint, cursor: 'pointer', padding: 2 }}><ChevronUp size={12} /></button>
                    <button onClick={(e) => { e.stopPropagation(); moveCue(i, 1); }} style={{ background: 'transparent', border: 'none', color: C.faint, cursor: 'pointer', padding: 2 }}><ChevronDown size={12} /></button>
                  </div>
                ))}
              </div>
            </div>

            {/* SONG BACKGROUND */}
            <div style={{ background: C.elevated, border: '1px solid #2d2d3f', borderRadius: 10, padding: 10 }}>
              <div style={{ fontSize: 10, fontWeight: 800, color: C.faint, textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 8 }}>Song Background</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: (mediaLibrary || []).some(a => a.kind === 'image' || a.kind === 'video') ? 8 : 0 }}>
                <input type="color" value={editingSong.bg_type === 'color' ? (editingSong.bg_value || '#000000') : '#000000'} onChange={(e) => setSongBackground('color', e.target.value)} style={{ width: 30, height: 26, background: C.input, border: '1px solid #2d2d3f', borderRadius: 5, cursor: 'pointer', padding: 0 }} title="Song-wide solid color background" />
                <label style={{ background: C.input, color: C.text2, border: '1px solid #2d2d3f', padding: '4px 8px', borderRadius: 5, fontSize: 10, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4 }}><ImageIcon size={10} /> Image<input type="file" accept="image/*" onChange={(e) => { songBgFileToBackground('image', e.target.files[0]); e.target.value = ''; }} style={{ display: 'none' }} /></label>
                <label style={{ background: C.input, color: C.text2, border: '1px solid #2d2d3f', padding: '4px 8px', borderRadius: 5, fontSize: 10, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4 }}><Video size={10} /> Video<input type="file" accept="video/mp4,video/webm" onChange={(e) => { songBgFileToBackground('video', e.target.files[0]); e.target.value = ''; }} style={{ display: 'none' }} /></label>
                {songHasBackground(editingSong) && (
                  <button onClick={() => setSongBackground('color', '#000000')} style={{ background: 'transparent', border: '1px solid #2d2d3f', color: C.muted, padding: '4px 7px', borderRadius: 5, fontSize: 10, cursor: 'pointer' }}>Clear</button>
                )}
              </div>
              {(mediaLibrary || []).some(a => a.kind === 'image' || a.kind === 'video') && (
                <div>
                  <div style={{ fontSize: 9, fontWeight: 800, color: C.faint, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 5 }}>From Media Library</div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 5 }}>
                    {(mediaLibrary || []).filter(a => a.kind === 'image' || a.kind === 'video').map(a => {
                      const active = editingSong.bg_type === a.kind && editingSong.bg_value === a.url;
                      return (
                        <div key={a.url} onClick={() => setSongBackground(a.kind, a.url)} title={a.url.split('/').pop() || a.url} style={{ position: 'relative', aspectRatio: '16 / 9', borderRadius: 6, overflow: 'hidden', cursor: 'pointer', border: active ? '2px solid #22c55e' : '1px solid #2d2d3f', background: '#000' }}>
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
              <div style={{ background: C.elevated, border: '1px solid #2d2d3f', borderRadius: 10, padding: 10 }}>
                <div style={{ fontSize: 10, fontWeight: 800, color: C.faint, textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 8 }}>Slide Properties</div>
                <label style={{ fontSize: 10, color: C.faint, fontWeight: 700, textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>Label</label>
                <input type="text" value={editorCue.label || ''} onChange={(e) => updateCue(editorCueIdx, { label: e.target.value })} style={{ width: '100%', background: C.input, color: C.text, border: '1px solid #2d2d3f', borderRadius: 6, padding: '7px', fontSize: 12, outline: 'none', marginBottom: 8 }} />
                <label style={{ fontSize: 10, color: C.faint, fontWeight: 700, textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>Background</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: (mediaLibrary || []).some(a => a.kind === 'image' || a.kind === 'video') ? 8 : 10 }}>
                  <input type="color" value={editorCue.bg_type === 'color' ? (editorCue.bg_value || '#000000') : '#000000'} onChange={(e) => setCueBackground(editorCueIdx, 'color', e.target.value)} style={{ width: 28, height: 24, background: C.input, border: '1px solid #2d2d3f', borderRadius: 5, cursor: 'pointer', padding: 0 }} />
                  <label style={{ background: C.input, color: C.text2, border: '1px solid #2d2d3f', padding: '4px 7px', borderRadius: 5, fontSize: 10, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 3 }}><ImageIcon size={10} /> Img<input type="file" accept="image/*" onChange={(e) => cueFileToBackground(editorCueIdx, 'image', e.target.files[0])} style={{ display: 'none' }} /></label>
                  <label style={{ background: C.input, color: C.text2, border: '1px solid #2d2d3f', padding: '4px 7px', borderRadius: 5, fontSize: 10, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 3 }}><Video size={10} /> Vid<input type="file" accept="video/mp4,video/webm" onChange={(e) => cueFileToBackground(editorCueIdx, 'video', e.target.files[0])} style={{ display: 'none' }} /></label>
                  {cueHasBackground(editorCue) && (
                    <button onClick={() => clearCueBackground(editorCueIdx)} style={{ background: 'transparent', border: '1px solid #2d2d3f', color: C.muted, padding: '4px 7px', borderRadius: 5, fontSize: 10, cursor: 'pointer' }}>Clear</button>
                  )}
                </div>
                {(mediaLibrary || []).some(a => a.kind === 'image' || a.kind === 'video') && (
                  <div style={{ marginBottom: 10 }}>
                    <div style={{ fontSize: 9, fontWeight: 800, color: C.faint, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 5 }}>From Media Library</div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 5 }}>
                      {(mediaLibrary || []).filter(a => a.kind === 'image' || a.kind === 'video').map(a => {
                        const active = editorCue.bg_type === a.kind && editorCue.bg_value === a.url;
                        return (
                          <div key={a.url} onClick={() => setCueBackground(editorCueIdx, a.kind, a.url)} title={a.url.split('/').pop() || a.url} style={{ position: 'relative', aspectRatio: '16 / 9', borderRadius: 6, overflow: 'hidden', cursor: 'pointer', border: active ? '2px solid #22c55e' : '1px solid #2d2d3f', background: '#000' }}>
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
                <input type="number" min="0" max="7200" value={editorCue.duration || 0} onChange={(e) => updateCue(editorCueIdx, { duration: Math.max(0, Math.floor(Number(e.target.value) || 0)) })} style={{ width: '100%', background: C.input, color: C.text, border: '1px solid #2d2d3f', borderRadius: 6, padding: '7px', fontSize: 12, outline: 'none' }} />
              </div>
            )}

            {/* BOTTOM CONTROLS */}
            <div style={{ display: 'flex', gap: 6, marginTop: 'auto', paddingTop: 6 }}>
              <button onClick={() => duplicateCue(editorCueIdx)} style={{ background: C.elevated, border: '1px solid #2d2d3f', color: C.text2, borderRadius: 7, padding: '7px 10px', fontSize: 11, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}><Copy size={12} /> Duplicate</button>
              <button onClick={() => setShowSlideProps(v => !v)} style={{ background: C.elevated, border: '1px solid #2d2d3f', color: C.text2, borderRadius: 7, padding: '7px 10px', fontSize: 11, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}><PenLine size={12} /> Properties</button>
              <button onClick={() => { if (editorCueIdx < 0) return; const cues = [...(editingSong.cues || [])]; if (!cues.length) return; cues.splice(editorCueIdx, 1); setEditingSong({ ...editingSong, cues }); setEditorCueIdx(Math.min(editorCueIdx, Math.max(0, cues.length - 1))); }} style={{ background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.4)', color: '#f87171', borderRadius: 7, padding: '7px 10px', fontSize: 11, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}><Trash2 size={12} /> Delete</button>
            </div>
          </div>
        </>
      )}
    </div>

    {/* ===== FOOTER ===== */}
    <div style={{ padding: '10px 16px', borderTop: '1px solid #262639', display: 'flex', justifyContent: 'flex-end', gap: 10, flexShrink: 0 }}>
      <motion.button {...stubTap} onClick={() => setIsEditorOpen(false)} style={{ background: C.border, border: 'none', color: C.text, padding: '9px 16px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Cancel</motion.button>
      <motion.button {...stubTap} onClick={handleSaveSong} style={{ background: ACCENT, border: 'none', color: C.text, padding: '9px 22px', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>Save Song</motion.button>
    </div>
  </motion.div>
</motion.div>
  );
}
