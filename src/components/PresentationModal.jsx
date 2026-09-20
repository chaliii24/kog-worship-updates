import React, { useEffect, useRef, useState } from 'react';
import {
  Plus, Trash2, Copy, ChevronUp, ChevronDown, Save, X, MonitorPlay, Download,
  Wand2, Layers, Loader2, ListPlus
} from 'lucide-react';
import { motion } from 'motion/react';
import { useApp } from '../context/AppContext';
import PresentationSlide from './PresentationSlide';
import PresentationEditableLayer from './PresentationEditableLayer';
import PresentationInspector from './PresentationInspector';
import { defaultSlide, parseOutline, resolveRects } from '../lib/backgrounds';

function useContainerScale() {
  const ref = useRef(null);
  const [scale, setScale] = useState(0.5);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => setScale(Math.max(0.1, el.clientWidth / 1280));
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, scale];
}

function SlideThumb({ slide, w = 154, h = 87, active }) {
  return (
    <div style={{ width: w, height: h, overflow: 'hidden', position: 'relative', background: '#000', borderRadius: 6, outline: active ? '2px solid #3B82F6' : '1px solid #2d2d3f', outlineOffset: active ? 1 : 0 }}>
      <div style={{ width: 1280, height: 720, transform: 'scale(' + (w / 1280) + ')', transformOrigin: 'top left' }}>
        <PresentationSlide slide={slide} />
      </div>
    </div>
  );
}

export default function PresentationModal() {
  const {
    C, ACCENT,
    editingDeck, closePresentationEditor,
    savePresentationDeck, presentDeck, addPresentationToService,
    mediaLibrary, fetchMediaLibrary, persistMediaFile
  } = useApp();

  const [deck, setDeck] = useState({ id: null, title: 'Untitled Presentation', slides: [] });
  const [idx, setIdx] = useState(0);
  const [tab, setTab] = useState('content');
  const [busy, setBusy] = useState(null);
  const [status, setStatus] = useState(null);
  const [searchQ, setSearchQ] = useState('worship background');
  const [searchResults, setSearchResults] = useState([]);
  const [showOutline, setShowOutline] = useState(false);
  const [outline, setOutline] = useState('');
  const [canvasRef, canvasScale] = useContainerScale();
  const statusTimer = useRef(null);

  useEffect(() => {
    if (!editingDeck) return;
    const slides = (editingDeck.slides && editingDeck.slides.length) ? editingDeck.slides : [defaultSlide()];
    setDeck({ id: editingDeck.id || null, title: editingDeck.title || 'Untitled Presentation', slides });
    setIdx(0); setTab('content'); setStatus(null); setSearchResults([]); setShowOutline(false);
  }, [editingDeck]);

  const slide = deck.slides[idx];

  const flash = (msg, ms = 2600) => {
    setStatus(msg);
    clearTimeout(statusTimer.current);
    statusTimer.current = setTimeout(() => setStatus(null), ms);
  };

  const patchDeck = (patch) => setDeck(d => ({ ...d, ...patch }));
  const setSlides = (slides) => setDeck(d => ({ ...d, slides }));
  const patchSlide = (patch) => setDeck(d => ({ ...d, slides: d.slides.map((s, i) => (i === idx ? { ...s, ...patch } : s)) }));

  const setRect = (key, rect) => setDeck(d => ({
    ...d,
    slides: d.slides.map((s, i) => (i === idx ? { ...s, pos: { ...(s.pos || {}), [key]: { ...((s.pos || {})[key] || {}), ...rect } } } : s))
  }));
  const resetPositions = () => patchSlide({ pos: {} });

  const addSlide = () => { const s = defaultSlide({ layout: 'title-bullets' }); setSlides([...deck.slides, s]); setIdx(deck.slides.length); };
  const duplicateSlide = () => { const c = { ...deck.slides[idx], id: undefined }; const s = defaultSlide(c); const next = [...deck.slides]; next.splice(idx + 1, 0, s); setSlides(next); setIdx(idx + 1); };
  const deleteSlide = (i) => {
    if (deck.slides.length <= 1) return;
    const next = deck.slides.filter((_, x) => x !== i);
    setSlides(next);
    setIdx(Math.max(0, Math.min(idx, next.length - 1)));
  };
  const moveSlide = (i, dir) => {
    const t = i + dir;
    if (t < 0 || t >= deck.slides.length) return;
    const next = [...deck.slides];
    const tmp = next[i]; next[i] = next[t]; next[t] = tmp;
    setSlides(next); setIdx(t);
  };

  const doSave = async () => {
    setBusy('save');
    try {
      const id = await savePresentationDeck(deck);
      if (id && !deck.id) patchDeck({ id });
      flash('Saved \u2713');
    } catch (e) { flash('Save failed: ' + e.message); }
    setBusy(null);
  };

  const doExport = async () => {
    setBusy('export'); setStatus('Building PowerPoint\u2026');
    try {
      const { ipcRenderer } = window.require('electron');
      const exportDeck = { ...deck, slides: (deck.slides || []).map(sl => ({ ...sl, __rects: resolveRects(sl) })) };
      const res = await ipcRenderer.invoke('export-presentation-pptx', exportDeck);
      if (res && res.ok) flash('Exported \u2713 ' + res.filePath, 7000);
      else if (res && res.canceled) setStatus(null);
      else flash('Export failed: ' + ((res && res.error) || 'unknown error'), 6000);
    } catch (e) { flash('Export failed: ' + e.message, 6000); }
    setBusy(null);
  };

  const runSearch = async () => {
    setBusy('search'); setStatus('Searching backgrounds\u2026'); setSearchResults([]);
    try {
      const { ipcRenderer } = window.require('electron');
      const res = await ipcRenderer.invoke('search-backgrounds', searchQ);
      if (res && res.results) { setSearchResults(res.results); if (!res.results.length) flash('No results.'); else setStatus(null); }
      else flash((res && res.error) || 'Search failed.');
    } catch (e) { flash('Search failed: ' + e.message); }
    setBusy(null);
  };

  const downloadBg = async (r) => {
    setBusy('dl-' + r.id); setStatus('Downloading\u2026');
    try {
      const { ipcRenderer } = window.require('electron');
      const res = await ipcRenderer.invoke('download-background', { url: r.url, name: r.title });
      if (res && res.url) {
        if (fetchMediaLibrary) await fetchMediaLibrary();
        patchSlide(tab === 'image' ? { image: res.url } : { bg: { type: 'image', value: res.url } });
        flash('Downloaded & applied \u2713');
      } else flash((res && res.error) || 'Download failed.');
    } catch (e) { flash('Download failed: ' + e.message); }
    setBusy(null);
  };

  const genFromOutline = () => {
    const slides = parseOutline(outline);
    setSlides(slides); setIdx(0); setShowOutline(false); setOutline('');
    flash('Generated ' + slides.length + ' slide' + (slides.length === 1 ? '' : 's') + ' \u2713');
  };

  const headerBtn = (onClick, Icon, label, opts = {}) => (
    <button onClick={onClick} disabled={opts.disabled} style={{ background: opts.bg || '#161B22', border: '1px solid ' + (opts.border || '#2d2d3f'), color: opts.color || C.text, padding: '7px 12px', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, opacity: opts.disabled ? 0.5 : 1 }}>
      {opts.busy ? <Loader2 size={13} /> : <Icon size={13} />} {label}
    </button>
  );

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.86)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 9999 }}>
      <motion.div initial={{ opacity: 0, scale: 0.97, y: 10 }} animate={{ opacity: 1, scale: 1, y: 0 }} transition={{ duration: 0.18 }} style={{ background: C.panel, border: '1px solid #2d2d3f', borderRadius: 14, width: 'min(1600px, 98vw)', height: 'min(95vh, 980px)', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 24px 80px rgba(0,0,0,0.75)', position: 'relative' }}>

        <div style={{ padding: '10px 16px', borderBottom: '1px solid #262639', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0, flexWrap: 'wrap' }}>
          <Layers size={17} color={ACCENT} />
          <input value={deck.title} onChange={(e) => patchDeck({ title: e.target.value })} placeholder="Presentation title" style={{ width: 300, background: '#0d1117', border: '1px solid #2d2d3f', borderRadius: 8, padding: '7px 10px', color: C.text, fontSize: 13, fontWeight: 700, outline: 'none' }} />
          <div style={{ flex: 1, minWidth: 20 }} />
          {status && <div style={{ fontSize: 11.5, color: ACCENT, fontWeight: 700, maxWidth: 340, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={status}>{status}</div>}
          {headerBtn(() => setShowOutline(s => !s), Wand2, 'Import Outline')}
          {headerBtn(doExport, Download, busy === 'export' ? 'Exporting\u2026' : 'Export .pptx', { busy: busy === 'export' })}
          {headerBtn(doSave, Save, busy === 'save' ? 'Saving\u2026' : 'Save', { busy: busy === 'save' })}
          {headerBtn(() => addPresentationToService(deck), ListPlus, 'To Service')}
          {headerBtn(() => { presentDeck(deck); flash('Live on projector \u25B6'); }, MonitorPlay, 'Present', { bg: ACCENT, border: ACCENT, color: '#fff' })}
          <button onClick={closePresentationEditor} style={{ background: 'transparent', border: 'none', color: C.muted, cursor: 'pointer', padding: 4 }}><X size={18} /></button>
        </div>

        {showOutline && (
          <div style={{ padding: 12, borderBottom: '1px solid #262639', background: '#0d1117', display: 'flex', gap: 10 }}>
            <textarea value={outline} onChange={(e) => setOutline(e.target.value)} rows={4} placeholder={'Paste your sermon outline or script.\n\nBlank line = new slide.\nFirst line = slide title, following lines = bullets.'} style={{ flex: 1, background: '#050509', border: '1px solid #2d2d3f', borderRadius: 8, padding: 10, color: C.text, fontSize: 12.5, resize: 'vertical', fontFamily: 'inherit' }} />
            <button onClick={genFromOutline} style={{ background: ACCENT, border: 'none', color: '#fff', padding: '0 18px', borderRadius: 8, fontWeight: 700, fontSize: 12, cursor: 'pointer' }}>Generate Slides</button>
          </div>
        )}

        <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
          <div style={{ width: 200, minWidth: 200, borderRight: '1px solid #262639', overflowY: 'auto', padding: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <button onClick={addSlide} style={{ background: 'rgba(59,130,246,0.14)', border: '1px dashed ' + ACCENT, color: ACCENT, borderRadius: 8, padding: '8px', fontSize: 11.5, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}><Plus size={13} /> New Slide</button>
            {deck.slides.map((s, i) => (
              <div key={s.id || i} onClick={() => setIdx(i)} style={{ cursor: 'pointer', display: 'grid', gap: 4 }}>
                <SlideThumb slide={s} active={i === idx} />
                <div style={{ display: 'flex', alignItems: 'center', gap: 2, justifyContent: 'space-between', padding: '0 2px' }}>
                  <span style={{ fontSize: 10.5, color: i === idx ? C.heading : C.muted, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 90 }}>{i + 1}. {s.title || 'Untitled'}</span>
                  <span style={{ display: 'flex', gap: 1 }}>
                    <button onClick={(e) => { e.stopPropagation(); moveSlide(i, -1); }} title="Up" style={{ background: 'transparent', border: 'none', color: C.muted, cursor: 'pointer', padding: 2 }}><ChevronUp size={12} /></button>
                    <button onClick={(e) => { e.stopPropagation(); moveSlide(i, 1); }} title="Down" style={{ background: 'transparent', border: 'none', color: C.muted, cursor: 'pointer', padding: 2 }}><ChevronDown size={12} /></button>
                    <button onClick={(e) => { e.stopPropagation(); duplicateSlide(); }} title="Duplicate" style={{ background: 'transparent', border: 'none', color: C.muted, cursor: 'pointer', padding: 2 }}><Copy size={12} /></button>
                    <button onClick={(e) => { e.stopPropagation(); deleteSlide(i); }} title="Delete" style={{ background: 'transparent', border: 'none', color: '#F87171', cursor: 'pointer', padding: 2 }}><Trash2 size={12} /></button>
                  </span>
                </div>
              </div>
            ))}
          </div>

          <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', background: '#050509', padding: 18 }}>
            <div ref={canvasRef} style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center' }}>
              <div style={{ position: 'relative', width: 1280 * canvasScale, height: 720 * canvasScale, overflow: 'hidden', borderRadius: 10, boxShadow: '0 12px 40px rgba(0,0,0,0.6)', outline: '1px solid #2d2d3f' }}>
                <div style={{ width: 1280, height: 720, transform: 'scale(' + canvasScale + ')', transformOrigin: 'top left' }}>
                  <PresentationSlide slide={slide} />
                </div>
                <PresentationEditableLayer slide={slide} scale={canvasScale} onChange={setRect} />
              </div>
            </div>
            <div style={{ textAlign: 'center', fontSize: 10.5, color: C.muted, paddingTop: 8, opacity: 0.8 }}>Drag any text box on the slide to move it • drag its corner handle to resize • use “Reset Positions” to restore defaults</div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, paddingTop: 8, fontSize: 11.5, color: C.muted, fontWeight: 700 }}>
              <button onClick={() => setIdx(i => Math.max(0, i - 1))} disabled={idx === 0} style={{ background: '#161B22', border: '1px solid #2d2d3f', color: C.text, borderRadius: 6, padding: '4px 10px', cursor: 'pointer' }}>Prev</button>
              Slide {idx + 1} / {deck.slides.length}
              <button onClick={() => setIdx(i => Math.min(deck.slides.length - 1, i + 1))} disabled={idx === deck.slides.length - 1} style={{ background: '#161B22', border: '1px solid #2d2d3f', color: C.text, borderRadius: 6, padding: '4px 10px', cursor: 'pointer' }}>Next</button>
              <button onClick={resetPositions} title="Restore default text positions for this slide" style={{ background: 'rgba(59,130,246,0.12)', border: '1px solid rgba(59,130,246,0.5)', color: '#93C5FD', borderRadius: 6, padding: '4px 10px', cursor: 'pointer' }}>Reset Positions</button>
            </div>
          </div>

          <PresentationInspector
            C={C} ACCENT={ACCENT} slide={slide} patchSlide={patchSlide}
            mediaLibrary={mediaLibrary} persistMediaFile={persistMediaFile} fetchMediaLibrary={fetchMediaLibrary} setStatus={flash}
            searchQ={searchQ} setSearchQ={setSearchQ} searchResults={searchResults} setSearchResults={setSearchResults}
            runSearch={runSearch} downloadBg={downloadBg} busy={busy} tab={tab} setTab={setTab}
          />
        </div>
      </motion.div>
    </motion.div>
  );
}
