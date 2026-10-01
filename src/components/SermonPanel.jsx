import React, { useState } from 'react';
import { Play, Square, ChevronLeft, ChevronRight, MonitorPlay, FolderOpen, X } from 'lucide-react';
import { motion } from 'motion/react';
import { useApp } from '../context/AppContext';
import { stubTap } from '../lib/anim';

// Sermon (PowerPoint) tab: load a .pptx onto the projector behind our output
// window, then flip layers — Lyrics covers it, PowerPoint shows through —
// with F1/F2 working globally even when this tab is closed.
export default function SermonPanel() {
  const { C, ACCENT, sermon, sermonLoad, sermonSetLayer, sermonNav, sermonGoto, sermonClose } = useApp();
  const [jump, setJump] = useState('');
  const s = sermon || {};
  const label = { fontSize: 10, color: C.faint, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 1.2, display: 'block', marginBottom: 6 };

  const doJump = () => {
    const n = Math.floor(Number(jump));
    if (Number.isFinite(n) && n >= 1) sermonGoto(n);
    setJump('');
  };

  return (
    <motion.div key="sermon" initial={{ opacity: 0, x: 26 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -26 }} transition={{ type: 'spring', stiffness: 300, damping: 30 }} style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: 'var(--ui-stage)' }}>
      <div style={{ padding: '12px 18px 8px 18px', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
        <MonitorPlay size={16} color={s.loaded ? '#4ade80' : C.faint} />
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>Sermon</h2>
        {s.loaded && (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: s.passthrough ? 'rgba(139,92,246,0.15)' : 'rgba(34,197,94,0.15)', border: '1px solid ' + (s.passthrough ? 'rgba(139,92,246,0.5)' : 'rgba(34,197,94,0.5)'), color: s.passthrough ? '#a78bfa' : '#4ade80', borderRadius: 999, padding: '3px 10px', fontSize: 10, fontWeight: 800, letterSpacing: 1 }}>
            {s.passthrough ? 'POWERPOINT' : 'LYRICS'}
          </span>
        )}
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '4px 18px 16px 18px' }}>
        <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <div style={{ width: 380, maxWidth: '100%', flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <label style={label}>Presentation</label>
              {s.loaded ? (
                <div style={{ background: C.elevated, border: '1px solid var(--ui-border2)', borderRadius: 8, padding: '9px 12px' }}>
                  <div style={{ fontSize: 13, fontWeight: 800, color: C.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.title || s.file || 'Sermon'}</div>
                  <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>{s.displayLabel || ''}{s.total ? ` · ${s.total} slides` : ''}</div>
                </div>
              ) : (
                <motion.button
                  {...stubTap}
                  onClick={() => sermonLoad()}
                  disabled={!!s.busy}
                  style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, background: ACCENT, border: 'none', color: '#fff', borderRadius: 8, padding: '11px 0', fontSize: 13, fontWeight: 800, cursor: s.busy ? 'wait' : 'pointer', opacity: s.busy ? 0.7 : 1 }}
                >
                  <FolderOpen size={14} /> {s.busy ? 'Opening…' : 'Open PowerPoint…'}
                </motion.button>
              )}
              {s.error && <div style={{ fontSize: 12, color: '#f87171', marginTop: 6, lineHeight: 1.5 }}>{s.error}</div>}
            </div>

            {s.loaded && (
              <>
                <div>
                  <label style={label}>Output layer (F1 / F2 anywhere)</label>
                  <div style={{ display: 'flex', gap: 4 }}>
                    {[
                      ['kog', 'Lyrics'],
                      ['passthrough', 'PowerPoint'],
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
                  <X size={14} /> Close sermon
                </motion.button>
                <div style={{ fontSize: 11.5, color: C.muted, lineHeight: 1.6 }}>
                  Lyrics, arrows and Space follow the visible layer: while PowerPoint shows, they drive its slides. F1 pulls lyrics back over at any time.
                </div>
              </>
            )}
            {!s.loaded && !s.error && (
              <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.6 }}>
                The sermon opens as a real PowerPoint slideshow on the projector, behind the lyrics output — no ALT+TAB. Flip layers here or with F1/F2.
              </div>
            )}
          </div>

          <div style={{ flex: 1, minWidth: 300 }}>
            <div style={{ background: '#000', border: '1px solid var(--ui-border2)', borderRadius: 12, aspectRatio: '16 / 9', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 20, boxSizing: 'border-box' }}>
              <MonitorPlay size={30} color={s.loaded ? '#4ade80' : C.faint2} />
              <div style={{ fontSize: 14, fontWeight: 800, color: C.text, textAlign: 'center' }}>
                {s.loaded ? (s.passthrough ? 'PowerPoint is showing' : 'Lyrics over PowerPoint') : 'No sermon loaded'}
              </div>
              <div style={{ fontSize: 12, color: C.muted, textAlign: 'center' }}>
                {s.loaded && s.total ? `Slide ${s.index || 1} of ${s.total}${s.displayLabel ? ` · ${s.displayLabel}` : ''}` : s.loaded ? 'Slideshow running' : 'Open a .pptx to project it behind the lyrics.'}
              </div>
            </div>
            {s.loaded && (
              <motion.button
                {...stubTap}
                onClick={() => sermonSetLayer(s.passthrough ? 'kog' : 'passthrough')}
                style={{ width: '100%', marginTop: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, background: s.passthrough ? '#10b981' : C.elevated2, border: s.passthrough ? 'none' : '1px solid var(--ui-border2)', color: '#fff', borderRadius: 10, padding: '12px 0', fontSize: 13.5, fontWeight: 800, cursor: 'pointer' }}
              >
                {s.passthrough ? (<><Play size={14} /> Show Lyrics (F1)</>) : (<><Square size={14} /> Reveal PowerPoint (F2)</>)}
              </motion.button>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
}
