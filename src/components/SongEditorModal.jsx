import React from 'react';
import { Plus, Trash2, Edit3, Image as ImageIcon, Video, AlignLeft, AlignCenter, AlignRight, Wand2, Cpu, Timer, Clock3, Link2, Save, Copy, ChevronUp, ChevronDown, Eye, EyeOff, Lock, Unlock, GripVertical, ChevronLeft, ChevronRight, Type, PenLine, BringToFront, SendToBack } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { TRANSITIONS, TRANSITION_KEYS, SPEED_OPTIONS, FONT_OPTIONS } from '../lib/constants';
import { applyCaseTransform, renderLyricsLayout } from '../lib/lyrics';
import { useApp } from '../context/AppContext';
import { modalOverlay, panelLg, stubTap, iconBtnTap } from '../lib/anim';

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
    canvasEdit,
    setCanvasEdit,
    boxDrag,
    canvasScale,
    dragFrom,
    setDragFrom,
    showSlideProps,
    setShowSlideProps,
    selectedAiModel,
    setSelectedAiModel,
    aiStatus,
    canvasWrapRef,
    editAreaRef,
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
    baseGroupLabel,
    splitCueAtTextareaCaret,
    applyAlignToAll,
    applyAnimToAll,
    reorderCues,
    startBoxDrag,
    onStagePointerMove,
    endBoxDrag,
    ToolbarBtn,
    fitStageFont,
    cueLyricStyle,
    handleSaveSong,
    resolveBg,
    DEFAULT_BOX
  } = app;

  return (
<motion.div {...modalOverlay} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.84)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 9999 }} onPointerUp={endBoxDrag}>
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
          <input type="text" value={editingSong.title} onChange={(e) => setEditingSong({ ...editingSong, title: e.target.value })} placeholder="Song title" style={{ width: '100%', background: C.elevated2, border: '1px solid #2d2d3f', borderRadius: 8, padding: '7px 10px', color: C.text, fontSize: 13, outline: 'none', boxSizing: 'border-box' }} />
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
                  <option value="gemini-1.5-pro" style={{ background: C.input }}>Gemini 3.6 Pro (Online)</option>
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
              <div style={{ display: 'flex', gap: 4, marginBottom: 8 }}>
                {[['left', AlignLeft], ['center', AlignCenter], ['right', AlignRight]].map(([a, Icon]) => (
                  <button key={a} onClick={() => updateCue(editorCueIdx, { align: a })} style={{ flex: 1, background: (editorCue?.align || 'center') === a ? ACCENT : C.elevated2, border: '1px solid #2d2d3f', color: (editorCue?.align || 'center') === a ? C.text : C.muted, borderRadius: 6, padding: '6px 0', cursor: 'pointer', display: 'flex', justifyContent: 'center' }}><Icon size={14} /></button>
                ))}
              </div>
              <button onClick={applyAlignToAll} style={{ width: '100%', background: 'rgba(59,130,246,0.14)', border: '1px solid ' + ACCENT, color: ACCENT, borderRadius: 7, padding: '7px', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>Apply Align to All</button>
            </div>

            {/* TYPOGRAPHY */}
            <div style={{ background: C.elevated, border: '1px solid #2d2d3f', borderRadius: 10, padding: 10 }}>
              <div style={{ fontSize: 10, fontWeight: 800, color: C.faint, textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 8 }}>Typography</div>
              <label style={{ fontSize: 10, color: C.faint, fontWeight: 700, textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>Font Family</label>
              <select value={editorCue?.font || FONT_OPTIONS[0].value} onChange={(e) => updateCue(editorCueIdx, { font: e.target.value })} style={{ width: '100%', background: C.input, color: C.text, border: '1px solid #2d2d3f', borderRadius: 6, padding: '7px', fontSize: 12, outline: 'none' }}>
                {FONT_OPTIONS.map(f => <option key={f.value} value={f.value} style={{ background: C.input }}>{f.label}</option>)}
              </select>
              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: 10, color: C.faint, fontWeight: 700, textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>Size</label>
                  <input type="number" value={editorCue?.size || 92} onChange={(e) => updateCue(editorCueIdx, { size: Math.max(24, Math.floor(Number(e.target.value) || 92)) })} style={{ width: '100%', background: C.input, color: C.text, border: '1px solid #2d2d3f', borderRadius: 6, padding: '7px', fontSize: 12, textAlign: 'center', outline: 'none' }} />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: 10, color: C.faint, fontWeight: 700, textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>Line Ht</label>
                  <input type="number" step="0.1" value={editorCue?.lineHeight || 1.05} onChange={(e) => updateCue(editorCueIdx, { lineHeight: Number(e.target.value) || 1.05 })} style={{ width: '100%', background: C.input, color: C.text, border: '1px solid #2d2d3f', borderRadius: 6, padding: '7px', fontSize: 12, textAlign: 'center', outline: 'none' }} />
                </div>
              </div>
              <label style={{ fontSize: 10, color: C.faint, fontWeight: 700, textTransform: 'uppercase', display: 'block', marginBottom: 4, marginTop: 8 }}>Letter Case</label>
              <div style={{ display: 'flex', gap: 4 }}>
                {[['none', 'Aa'], ['title', 'Aa'], ['upper', 'AA']].map(([m, lbl]) => (
                  <button key={m} onClick={() => { updateCue(editorCueIdx, { case: m, text: applyCaseTransform(editorCue?.text || '', m) }); }} style={{ flex: 1, background: (editorCue?.case || 'none') === m ? ACCENT : C.elevated2, border: '1px solid #2d2d3f', color: (editorCue?.case || 'none') === m ? C.text : C.muted, borderRadius: 6, padding: '6px 0', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>{m === 'title' ? 'Tt' : lbl}</button>
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
              {[['shadow', `Shadow ${editorCue?.shadow ? 'ON' : 'OFF'}`], ['outline', `Outline ${editorCue?.outline ? 'ON' : 'OFF'}`], ['highlight', `Highlight ${editorCue?.highlight ? 'ON' : 'OFF'}`]].map(([k, lbl]) => (
                <button key={k} onClick={() => updateCue(editorCueIdx, { [k]: !editorCue?.[k] })} style={{ width: '100%', background: editorCue?.[k] ? 'rgba(34,197,94,0.15)' : C.elevated2, border: '1px solid ' + (editorCue?.[k] ? 'rgba(34,197,94,0.5)' : '#2d2d3f'), color: editorCue?.[k] ? '#4ade80' : C.muted, borderRadius: 6, padding: '6px', fontSize: 10.5, fontWeight: 700, cursor: 'pointer', marginBottom: 4 }}>{lbl}</button>
              ))}
              {editorCue?.highlight && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <label style={{ fontSize: 10, color: C.faint, fontWeight: 700, flex: 1 }}>Opacity</label>
                  <input type="range" min="10" max="90" value={editorCue?.hlOpacity ?? 40} onChange={(e) => updateCue(editorCueIdx, { hlOpacity: Number(e.target.value) })} style={{ flex: 1 }} />
                  <span style={{ fontSize: 11, color: C.muted, width: 28, textAlign: 'right' }}>{editorCue?.hlOpacity ?? 40}%</span>
                </div>
              )}
            </div>

            {/* TRANSITIONS */}
            <div style={{ background: C.elevated, border: '1px solid #2d2d3f', borderRadius: 10, padding: 10 }}>
              <div style={{ fontSize: 10, fontWeight: 800, color: C.faint, textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 8 }}>Transition</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                {TRANSITIONS.map(t => {
                  const selected = (editorCue?.anim || 'none') === TRANSITION_KEYS[t];
                  return (
                    <button key={t} onClick={() => updateCue(editorCueIdx, { anim: TRANSITION_KEYS[t] })} style={{ background: selected ? ACCENT : C.elevated2, border: '1px solid ' + (selected ? ACCENT : '#2d2d3f'), color: selected ? C.text : C.muted, borderRadius: 999, padding: '4px 9px', fontSize: 10, fontWeight: 700, cursor: 'pointer' }}>{t}</button>
                  );
                })}
              </div>
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
              <ToolbarBtn onClick={() => { const cues = [...(editingSong.cues || []), { label: 'Verse 1', text: '', box: DEFAULT_BOX }]; setEditingSong({ ...editingSong, cues }); setEditorCueIdx(cues.length - 1); setCanvasEdit(true); }} title="Add a new slide"><Plus size={14} /> <span>New Slide</span></ToolbarBtn>
              <ToolbarBtn onClick={() => { const cues = [...(editingSong.cues || [])]; if (!cues.length) { cues.push({ label: 'Verse 1', text: '', box: DEFAULT_BOX }); setEditingSong({ ...editingSong, cues }); setEditorCueIdx(0); } setCanvasEdit(true); }} title="Add/edit text box on this slide"><Type size={14} /> <span>Text</span></ToolbarBtn>
              <ToolbarBtn onClick={() => duplicateCue(editorCueIdx)} title="Duplicate slide"><Copy size={14} /></ToolbarBtn>
              <ToolbarBtn danger onClick={() => { const cues = [...(editingSong.cues || [])]; if (!cues.length) return; cues.splice(editorCueIdx, 1); setEditingSong({ ...editingSong, cues }); setEditorCueIdx(Math.min(editorCueIdx, Math.max(0, cues.length - 1))); }} title="Delete slide"><Trash2 size={14} /></ToolbarBtn>
              <div style={{ width: 1, height: 18, background: '#2d2d3f', margin: '0 4px' }} />
              {[['left', AlignLeft], ['center', AlignCenter], ['right', AlignRight]].map(([a, Icon]) => (
                <ToolbarBtn key={a} onClick={() => updateCue(editorCueIdx, { align: a })} title={`Align ${a}`} active={(editorCue?.align || 'center') === a}><Icon size={14} /></ToolbarBtn>
              ))}
              <div style={{ width: 1, height: 18, background: '#2d2d3f', margin: '0 4px' }} />
              <ToolbarBtn onClick={() => updateCue(editorCueIdx, { stack: 'front' })} title="Bring forward"><BringToFront size={14} /></ToolbarBtn>
              <ToolbarBtn onClick={() => updateCue(editorCueIdx, { stack: 'back' })} title="Send back"><SendToBack size={14} /></ToolbarBtn>
              <div style={{ width: 1, height: 18, background: '#2d2d3f', margin: '0 4px' }} />
              <ToolbarBtn onClick={() => setCanvasEdit(v => !v)} title="Edit lyrics" active={canvasEdit}><Edit3 size={14} /></ToolbarBtn>
              <div style={{ flex: 1 }} />
              <span style={{ fontSize: 10.5, fontWeight: 700, color: C.faint2, background: C.elevated, border: '1px solid #2d2d3f', borderRadius: 999, padding: '3px 9px' }}>
                <Clock3 size={11} style={{ verticalAlign: 'middle', marginRight: 4 }} />{TRANSITIONS.find(t => TRANSITION_KEYS[t] === (editorCue?.anim || 'none')) || 'None'} · {(editorCue?.speed ?? 0.5)}s
              </span>
            </div>

            {/* counter / nav */}
            <div style={{ padding: '8px 12px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
              <button onClick={() => setEditorCueIdx(i => Math.max(0, i - 1))} style={{ background: C.elevated, border: '1px solid #2d2d3f', color: C.muted, borderRadius: 7, padding: '5px 9px', cursor: 'pointer', display: 'flex' }}><ChevronLeft size={15} /></button>
              <span style={{ fontSize: 13, fontWeight: 800, color: C.text }}>{Math.min(editorCueIdx + 1, (editingSong.cues || []).length || 1)} of {(editingSong.cues || []).length || 1}</span>
              <button onClick={() => setEditorCueIdx(i => Math.min((editingSong.cues || []).length - 1, i + 1))} style={{ background: C.elevated, border: '1px solid #2d2d3f', color: C.muted, borderRadius: 7, padding: '5px 9px', cursor: 'pointer', display: 'flex' }}><ChevronRight size={15} /></button>
            </div>

            {/* canvas */}
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 12, overflow: 'hidden', minHeight: 0 }}>
              <div ref={canvasWrapRef} onPointerMove={onStagePointerMove} onPointerUp={endBoxDrag} onPointerLeave={endBoxDrag} style={{ width: '100%', maxWidth: '100%', aspectRatio: '16 / 9', position: 'relative', overflow: 'hidden', borderRadius: 12, boxShadow: '0 12px 44px rgba(0,0,0,0.45)', border: '1px solid #2d2d3f', cursor: boxDrag ? 'grabbing' : 'default' }}>
                <div style={{ width: 1280, height: 720, transform: `scale(${canvasScale})`, transformOrigin: 'top left', position: 'relative', background: (resolveBg(editorCue, editingSong) && resolveBg(editorCue, editingSong).type === 'color' ? resolveBg(editorCue, editingSong).value : '#000000') }} onMouseDown={(e) => { if (canvasEdit && !e.target.closest('[data-textbox]')) { setCanvasEdit(false); } }}>
                  {resolveBg(editorCue, editingSong) && resolveBg(editorCue, editingSong).type === 'image' && (
                    <img key={`edbg-${resolveBg(editorCue, editingSong).value}`} src={resolveBg(editorCue, editingSong).value} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
                  )}
                  {resolveBg(editorCue, editingSong) && resolveBg(editorCue, editingSong).type === 'video' && (
                    <video key={`edbg-${resolveBg(editorCue, editingSong).value}`} src={resolveBg(editorCue, editingSong).value} autoPlay loop muted playsInline preload="metadata" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
                  )}
                  {editorCue && (
                    <div key={editorCueIdx} data-textbox="true" onDoubleClick={() => !editorCue.locked && setCanvasEdit(true)} onMouseDown={(e) => { if (!canvasEdit) startBoxDrag(e, 'move'); }} style={{ position: 'absolute', left: editorBox.x, top: editorBox.y, width: editorBox.w, height: editorBox.h, border: '1.5px solid rgba(34,197,94,0.9)', borderRadius: 8, boxSizing: 'border-box', boxShadow: 'inset 0 0 0 9999px rgba(0,0,0,0.04)', cursor: canvasEdit ? 'default' : 'move' }}>
                      {canvasEdit ? (
                        <>
                          <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 1 }}>
                            {renderLyricsLayout(editorCue.text || '', cueLyricStyle(editorCue), editorBox)}
                          </div>
                          <textarea
                            ref={editAreaRef}
                            autoFocus
                            value={editorCue.text || ''}
                            onChange={(e) => updateCue(editorCueIdx, { text: e.target.value })}
                            onKeyDown={(e) => {
                              if (e.altKey && e.key === 'Enter') { e.preventDefault(); splitCueAtTextareaCaret(e.target); }
                              else if (e.key === 'Escape') { setCanvasEdit(false); }
                            }}
                            placeholder=""
                            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', resize: 'none', background: 'transparent', color: 'transparent', caretColor: '#fff', border: 'none', outline: 'none', borderRadius: 8, fontFamily: editorCue.font || FONT_OPTIONS[0].value, fontSize: fitStageFont(editorCue.text || ''), lineHeight: editorCue.lineHeight || 1.05, padding: '10px 18px', textAlign: editorCue.align || 'center', overflowWrap: 'break-word', wordBreak: 'break-word', whiteSpace: 'pre-wrap', letterSpacing: '0.02em', fontWeight: 600, zIndex: 2, WebkitTextFillColor: 'transparent' }}
                          />
                          <style>{`[data-textbox] textarea::selection { background: rgba(59,130,246,0.3); }`}</style>
                        </>
                      ) : (
                        renderLyricsLayout(editorCue.text || '', cueLyricStyle(editorCue), editorBox)
                      )}
                      {!canvasEdit && !editorCue.locked && (
                        <>
                          {[['nw', { left: -6, top: -6 }], ['ne', { right: -6, top: -6 }], ['sw', { left: -6, bottom: -6 }], ['se', { right: -6, bottom: -6 }]].map(([corner, pos]) => (
                            <div key={corner} onMouseDown={(e) => startBoxDrag(e, corner)} style={{ position: 'absolute', width: 14, height: 14, background: '#22c55e', border: '2px solid #0b3d1d', borderRadius: 4, cursor: 'nwse-resize', zIndex: 3, ...pos }} />
                          ))}
                        </>
                      )}
                    </div>
                  )}
                  {!editorCue && (
                    <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(255,255,255,0.55)', fontSize: 18, fontWeight: 700, fontFamily: 'system-ui, sans-serif' }}>Add a text box to begin</div>
                  )}
                </div>
              </div>
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
                          <div key={i} onClick={() => { setEditorCueIdx(i); setCanvasEdit(false); }} style={{ cursor: 'pointer', position: 'relative', background: i === editorCueIdx ? 'rgba(59,130,246,0.16)' : C.elevated, border: i === editorCueIdx ? '1px solid ' + ACCENT : '1px solid #2d2d3f', borderRadius: 8, overflow: 'hidden', padding: 6 }}>
                            <div style={{ width: '100%', aspectRatio: '16 / 9', borderRadius: 5, background: (resolveBg(c, editingSong) && resolveBg(c, editingSong).type === 'color' ? resolveBg(c, editingSong).value : '#0a0a0a'), position: 'relative', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                              {resolveBg(c, editingSong) && resolveBg(c, editingSong).type === 'image' && (
                                <img key={`tb-${resolveBg(c, editingSong).value}`} src={resolveBg(c, editingSong).value} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
                              )}
                              {resolveBg(c, editingSong) && resolveBg(c, editingSong).type === 'video' && (
                                <video key={`tb-${resolveBg(c, editingSong).value}`} src={resolveBg(c, editingSong).value} autoPlay loop muted playsInline preload="metadata" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
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
                  <div key={i} draggable onDragStart={() => setDragFrom(i)} onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); if (dragFrom != null) reorderCues(dragFrom, i); setDragFrom(null); }} onClick={() => { setEditorCueIdx(i); setCanvasEdit(false); }} style={{ display: 'flex', alignItems: 'center', gap: 8, background: i === editorCueIdx ? 'rgba(59,130,246,0.16)' : C.elevated, border: i === editorCueIdx ? '1px solid ' + ACCENT : '1px solid #2d2d3f', borderRadius: 8, padding: '6px 8px', cursor: 'grab' }}>
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
                            : <video src={a.url} autoPlay loop muted playsInline preload="metadata" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />}
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
                              : <video src={a.url} autoPlay loop muted playsInline preload="metadata" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />}
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
              <button onClick={() => { const cues = [...(editingSong.cues || [])]; if (!cues.length) return; cues.splice(editorCueIdx, 1); setEditingSong({ ...editingSong, cues }); setEditorCueIdx(Math.min(editorCueIdx, Math.max(0, cues.length - 1))); }} style={{ background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.4)', color: '#f87171', borderRadius: 7, padding: '7px 10px', fontSize: 11, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}><Trash2 size={12} /> Delete</button>
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
