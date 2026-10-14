import React, { useState, useEffect } from 'react';
import { Play, Square, ChevronLeft, ChevronRight, MonitorPlay, FolderOpen, X, Clock, Upload, Eye, Image as ImageIcon } from 'lucide-react';
import { motion } from 'motion/react';
import { useApp } from '../context/AppContext';
import { stubTap } from '../lib/anim';

// Sermon (Presentation) tab: load a slide file onto the projector behind our
// output window, then flip layers — Lyrics covers it, the slideshow shows
// through — with F1/F2 working globally even when this tab is closed.
//
// Engine-agnostic: main.js picks Microsoft PowerPoint, WPS Presentation or
// LibreOffice Impress for THIS machine; this panel only reports the picked
// `provider` and drives the same next/prev/goto contract.
const PROVIDER_NAMES = { powerpoint: 'PowerPoint', wps: 'WPS Presentation', libreoffice: 'LibreOffice' };
const providerName = (s) => PROVIDER_NAMES[s && s.provider] || 'Slideshow';
// Anything the loader accepts (matches PRESENTATION_EXTENSIONS in main).
const PRESENTATION_RE = /\.(pptx?|ppsx?|potx?|pptm|odp|otp|dps)$/i;
export default function SermonPanel() {
  const { C, ACCENT, PINK, sermon, sermonShots, sermonLoad, sermonSetLayer, sermonNav, sermonGoto, sermonClose, setShowOutputMonitor } = useApp();
  const [jump, setJump] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const [showRecent, setShowRecent] = useState(false);
  // Recently opened decks (paths only — the slideshow app itself reads the file).
  const [recent, setRecent] = useState(() => {
    try {
      const raw = JSON.parse(localStorage.getItem('kog-ppt-recent') || '[]');
      return Array.isArray(raw) ? raw.filter((r) => r && r.file).slice(0, 5) : [];
    } catch { return []; }
  });
  useEffect(() => {
    if (!sermon || !sermon.loaded || !sermon.file) return;
    setRecent((prev) => {
      const next = [{ file: sermon.file, title: sermon.title || String(sermon.file).split(/[/\\]/).pop() }, ...prev.filter((r) => r.file !== sermon.file)].slice(0, 5);
      try { localStorage.setItem('kog-ppt-recent', JSON.stringify(next)); } catch {}
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sermon && sermon.loaded, sermon && sermon.file]);

  const onDropFile = (e) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer?.files?.[0];
    if (!f || !window.require) return;
    const { webUtils } = window.require('electron');
    const p = (webUtils && webUtils.getPathForFile) ? webUtils.getPathForFile(f) : f.path;
    if (!p || !PRESENTATION_RE.test(p)) return;
    sermonLoad(p);
  };
  // Filmstrip density (columns). Persists like the song grid's setting.
  const [sermonDensity, setSermonDensity] = useState(() => {
    try {
      const n = Number(localStorage.getItem('kog-sermon-density'));
      return Number.isFinite(n) && n >= 2 && n <= 5 ? Math.round(n) : 3;
    } catch { return 3; }
  });
  useEffect(() => { try { localStorage.setItem('kog-sermon-density', String(sermonDensity)); } catch {} }, [sermonDensity]);
  const s = sermon || {};
  const label = { fontSize: 10, color: C.faint, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 1.2, display: 'block', marginBottom: 6 };
  const shownBy = providerName(s);
  // Which slideshow apps this machine can actually run. Fetched once per
  // mount while nothing is loaded — the empty state names what's missing
  // instead of failing the open with a COM-branded error.
  const [providers, setProviders] = useState(null);
  useEffect(() => {
    if ((s && s.loaded) || !window.require) return;
    let dead = false;
    window.require('electron').ipcRenderer.invoke('office-providers')
      .then((r) => { if (!dead && r) setProviders(r); })
      .catch(() => {});
    return () => { dead = true; };
  }, [s && s.loaded]);

  const doJump = () => {
    const n = Math.floor(Number(jump));
    if (Number.isFinite(n) && n >= 1) sermonGoto(n);
    setJump('');
  };

  // Exported PNGs, keyed by slide number: string = ready, null = export
  // failed, missing = still rendering. The live sidebar owns the Up Next
  // preview; this tab is the full filmstrip.
  const curIdx = s.loaded ? (s.index || 1) : 0;

  return (
    <motion.div key="sermon" initial={{ opacity: 0, x: 26 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -26 }} transition={{ type: 'spring', stiffness: 300, damping: 30 }} style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: 'var(--ui-stage)' }}>
      <div style={{ padding: '12px 18px 8px 18px', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
        <MonitorPlay size={16} color={s.loaded ? '#4ade80' : C.faint} />
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>Presentation</h2>
        {s.loaded && (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: s.passthrough ? 'rgba(139,92,246,0.15)' : 'rgba(34,197,94,0.15)', border: '1px solid ' + (s.passthrough ? 'rgba(139,92,246,0.5)' : 'rgba(34,197,94,0.5)'), color: s.passthrough ? '#a78bfa' : '#4ade80', borderRadius: 999, padding: '3px 10px', fontSize: 10, fontWeight: 800, letterSpacing: 1 }}>
            {s.passthrough ? shownBy.toUpperCase() : 'LYRICS'}
          </span>
        )}
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '4px 18px 16px 18px' }}>
        {/* Previews on top (order:1), controls in a centered stack below
            (order:2): nothing to scroll for either half on normal screens.
            The column fills the viewport height so the empty-state card
            reaches the bottom instead of floating in dead space. */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, alignItems: 'center', minHeight: '100%' }}>
          <div style={{ width: '100%', maxWidth: 720, order: 2, display: 'flex', flexDirection: 'column', gap: 14 }}>
            {s.loaded && (
            <div>
              <label style={label}>Presentation</label>
              <div style={{ background: C.elevated, border: '1px solid var(--ui-border2)', borderRadius: 8, padding: '9px 12px' }}>
                <div style={{ fontSize: 13, fontWeight: 800, color: C.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.title || s.file || 'Sermon'}</div>
                <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>{s.displayLabel || ''}{s.total ? ` · ${s.total} slides` : ''}</div>
              </div>
              {s.error && <div style={{ fontSize: 12, color: '#f87171', marginTop: 6, lineHeight: 1.5 }}>{s.error}</div>}
            </div>
            )}

            {s.loaded && (
              <>
                <div>
                  <label style={label}>Output layer (F1 / F2 anywhere)</label>
                  <div style={{ display: 'flex', gap: 4 }}>
                    {[
                      ['kog', 'Lyrics'],
                      ['passthrough', shownBy],
                    ].map(([v, lbl]) => {
                      const selected = (s.passthrough ? 'passthrough' : 'kog') === v;
                      return (
                        <button
                          key={v}
                          onClick={() => sermonSetLayer(v)}
                          style={{ flex: 1, background: selected ? ACCENT : C.elevated2, border: '1px solid ' + (selected ? ACCENT : 'var(--ui-border2)'), color: selected ? C.text : C.muted, borderRadius: 8, padding: '9px 0', fontSize: 12, fontWeight: 800, cursor: 'pointer' }}
                        >{lbl}</button>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <label style={label}>Slides{ s.total ? ` — ${s.index || 1} of ${s.total}` : ''}</label>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <motion.button {...stubTap} onClick={() => sermonNav(-1)} title="Previous slide" style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, background: C.elevated2, border: '1px solid var(--ui-border2)', color: C.text, borderRadius: 8, padding: '10px 0', fontSize: 12.5, fontWeight: 800, cursor: 'pointer' }}>
                      <ChevronLeft size={15} /> Prev
                    </motion.button>
                    <motion.button {...stubTap} onClick={() => sermonNav(1)} title="Next slide" style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, background: ACCENT, border: 'none', color: '#fff', borderRadius: 8, padding: '10px 0', fontSize: 12.5, fontWeight: 800, cursor: 'pointer' }}>
                      Next <ChevronRight size={15} />
                    </motion.button>
                  </div>
                  <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                    <input
                      value={jump}
                      onChange={(e) => setJump(e.target.value.replace(/\D/g, '').slice(0, 4))}
                      onKeyDown={(e) => { if (e.key === 'Enter') doJump(); }}
                      placeholder="Slide #"
                      inputMode="numeric"
                      style={{ flex: 1, minWidth: 0, background: C.input, color: C.text, border: '1px solid var(--ui-border2)', borderRadius: 8, padding: '9px 10px', fontSize: 12.5, outline: 'none', textAlign: 'center' }}
                    />
                    <button onClick={doJump} style={{ background: C.elevated2, border: '1px solid var(--ui-border2)', color: C.text2, borderRadius: 8, padding: '0 16px', fontSize: 12, fontWeight: 800, cursor: 'pointer' }}>Jump</button>
                  </div>
                </div>

                <motion.button
                  {...stubTap}
                  onClick={() => sermonClose()}
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.4)', color: '#f87171', borderRadius: 8, padding: '10px 0', fontSize: 12.5, fontWeight: 800, cursor: 'pointer' }}
                >
                  <X size={14} /> Close presentation
                </motion.button>
                <div style={{ fontSize: 11.5, color: C.muted, lineHeight: 1.6 }}>
                  Lyrics, arrows and Space follow the visible layer: while {shownBy} shows, they drive its slides. F1 pulls lyrics back over at any time.
                </div>
              </>
            )}
          </div>

          <div style={{ width: '100%', order: 1, flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
            {s.loaded && !!s.total && (
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                  <div style={{ fontSize: 10, color: C.faint, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 1.2, flex: 1 }}>
                    All slides — {s.total}
                  </div>
                  <span style={{ fontSize: 10, fontWeight: 800, color: C.faint, textTransform: 'uppercase', letterSpacing: 1 }}>Grid Density</span>
                  {[2, 3, 4, 5].map(d => (
                    <button key={d} onClick={() => setSermonDensity(d)} style={{ width: 26, height: 22, borderRadius: 4, background: sermonDensity === d ? ACCENT : C.elevated2, color: sermonDensity === d ? '#fff' : C.muted, border: '1px solid var(--ui-border2)', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>{d}</button>
                  ))}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: `repeat(${sermonDensity}, 1fr)`, gap: 8, maxHeight: 380, overflowY: 'auto', padding: 2 }}>
                  {Array.from({ length: s.total }, (_, k) => k + 1).map((n) => {
                    const shot = sermonShots?.[n];
                    const isCur = n === curIdx;
                    return (
                      <button
                        key={n}
                        onClick={() => { if (!isCur) sermonGoto(n); }}
                        title={isCur ? `Slide ${n} (showing)` : `Go to slide ${n}`}
                        style={{ position: 'relative', aspectRatio: '16 / 9', borderRadius: 8, overflow: 'hidden', background: '#000', border: isCur ? `2px solid ${PINK}` : '1px solid var(--ui-border2)', cursor: isCur ? 'default' : 'pointer', padding: 0, display: 'block' }}
                      >
                        {shot ? (
                          <img src={shot} alt={`Slide ${n}`} draggable={false} style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }} />
                        ) : (
                          <span style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, color: C.muted }}>
                            {shot === null ? 'Unavailable' : '…'}
                          </span>
                        )}
                        <span style={{ position: 'absolute', left: 5, top: 5, fontSize: 10, fontWeight: 800, color: '#fff', background: isCur ? PINK : 'rgba(0,0,0,0.6)', borderRadius: 5, padding: '1px 7px' }}>{n}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
            {!s.loaded && (
              <div
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={onDropFile}
                style={{ background: C.elevated, border: (dragOver ? `2px dashed ${ACCENT}` : '1px solid var(--ui-border2)'), borderRadius: 12, padding: '36px 24px 24px', display: 'flex', flex: '1 0 auto', flexDirection: 'column', alignItems: 'center', gap: 7, boxSizing: 'border-box' }}
              >
                <div style={{ flex: 1, width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 7, minHeight: 0 }}>
                <div style={{ position: 'relative', marginBottom: 6 }}>
                  <ImageIcon size={44} color={ACCENT} strokeWidth={1.6} />
                  <span style={{ position: 'absolute', right: -12, bottom: -4, width: 26, height: 26, borderRadius: '50%', background: ACCENT, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 14px rgba(0,0,0,0.5)' }}>
                    <Play size={12} color="#fff" style={{ marginLeft: 2 }} />
                  </span>
                </div>
                <div style={{ fontSize: 17, fontWeight: 800, color: C.text, textAlign: 'center' }}>No Sermon Loaded</div>
                <div style={{ fontSize: 12.5, color: C.muted, textAlign: 'center' }}>
                  {dragOver ? 'Drop the file to open it.' : 'Open a presentation to project it behind the lyrics.'}
                </div>
                <div style={{ fontSize: 11, color: C.faint, textAlign: 'center' }}>
                  .pptx .ppt .ppsx .pps .odp .otp .dps — shown with {providers ? (
                    [providers.powerpoint && 'PowerPoint', providers.wps && 'WPS', providers.libreoffice && 'LibreOffice'].filter(Boolean).join(' · ') || 'none installed'
                  ) : '…'}
                </div>
                {s.error && (
                  <div style={{ fontSize: 12, color: '#f87171', textAlign: 'center', lineHeight: 1.5 }}>{s.error}</div>
                )}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 10, width: '100%', marginTop: 'auto', paddingTop: 14 }}>
                  {[
                    { icon: <FolderOpen size={17} />, t: 'Open File', s: 'Load a presentation file', fn: () => sermonLoad(), dis: !!s.busy },
                    { icon: <Clock size={17} />, t: 'Recent Files', s: 'Access your last files', fn: () => setShowRecent((v) => !v) },
                    { icon: <Upload size={17} />, t: 'Drag & Drop', s: 'Drop a slide file here', fn: () => sermonLoad(), dis: !!s.busy },
                    { icon: <Eye size={17} />, t: 'Live Preview', s: 'See it on your output', fn: () => setShowOutputMonitor(true) },
                  ].map((a) => (
                    <button
                      key={a.t}
                      onClick={a.fn}
                      disabled={a.dis}
                      style={{ background: C.elevated2, border: '1px solid var(--ui-border2)', borderRadius: 10, padding: '16px 8px 14px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, cursor: a.dis ? 'wait' : 'pointer', color: C.text2, opacity: a.dis ? 0.6 : 1 }}
                    >
                      <span style={{ display: 'flex' }}>{a.icon}</span>
                      <span style={{ fontSize: 12.5, fontWeight: 800, color: C.text }}>{a.t}</span>
                      <span style={{ fontSize: 10.5, color: C.muted, textAlign: 'center', lineHeight: 1.4 }}>{a.s}</span>
                    </button>
                  ))}
                </div>
                {showRecent && (
                  <div style={{ width: '100%', marginTop: 4, background: C.elevated2, border: '1px solid var(--ui-border2)', borderRadius: 10, padding: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span style={{ fontSize: 10, color: C.faint, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 1.2 }}>Recent files</span>
                      {recent.length > 0 && (
                        <button onClick={() => { setRecent([]); try { localStorage.removeItem('kog-ppt-recent'); } catch {} }} style={{ background: 'transparent', border: 'none', color: C.muted, fontSize: 10.5, fontWeight: 700, cursor: 'pointer' }}>Clear</button>
                      )}
                    </div>
                    {recent.length === 0 && (
                      <div style={{ fontSize: 11.5, color: C.muted }}>No recent files yet — opened decks land here.</div>
                    )}
                    {recent.map((r) => (
                      <button
                        key={r.file}
                        onClick={() => { setShowRecent(false); sermonLoad(r.file); }}
                        title={r.file}
                        style={{ textAlign: 'left', background: 'transparent', border: '1px solid var(--ui-border2)', color: C.text2, borderRadius: 7, padding: '7px 10px', fontSize: 12, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
                      >
                        {r.title || r.file}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
            {s.loaded && (
              <motion.button
                {...stubTap}
                onClick={() => sermonSetLayer(s.passthrough ? 'kog' : 'passthrough')}
                style={{ width: '100%', marginTop: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, background: s.passthrough ? '#10b981' : C.elevated2, border: s.passthrough ? 'none' : '1px solid var(--ui-border2)', color: '#fff', borderRadius: 10, padding: '12px 0', fontSize: 13.5, fontWeight: 800, cursor: 'pointer' }}
              >
                {s.passthrough ? (<><Play size={14} /> Show Lyrics (F1)</>) : (<><Square size={14} /> Reveal {shownBy} (F2)</>)}
              </motion.button>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
}
