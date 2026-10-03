import React, { useEffect, useRef, useState } from 'react';
import { ListMusic, X, ChevronUp, ChevronDown, Trash2, RotateCcw, GripVertical, Sparkles } from 'lucide-react';
import { motion } from 'motion/react';
import { useApp } from '../context/AppContext';
import { toast } from '../untitledui/components/ui/toast';
import { songSections } from '../lib/medley';
import {
  orderToFlow, summarizeFlow, splitCuesToLineChunks,
  abbrevSection,
} from '../lib/arrangement';

// Song Arrangement modal v2 — MENU on the left, FLOW on the right.
//
// Left (Master Parts): exactly ONE block per section ([Verse 1], [Chorus]…).
// Drag a block (or click it) to append it to the flow; drag again for a
// repeat. Ordering happens at SECTION granularity, so a volunteer can never
// put line 4 before line 2 — every block brings all its slides along.
//
// Right (Service Flow): the play order. Entries drag to reorder (with ↑↓
// fallback buttons) and × to drop. Each entry previews its slides as chips.
//
// The library song is never touched by arranging — the flow is stored on the
// service row. The optional "Tidy slides" tool DOES rewrite the song (with
// confirmation): it re-chunks long sections into N-line slides so the
// congregation gets singable 2–4-line projection.
let flowKey = 1;

export default function ArrangementModal({ songId, title, existing, onSave, onClose, forAnchor }) {
  const { C, ACCENT, appConfirm } = useApp();
  const [details, setDetails] = useState(null);
  const [flow, setFlow] = useState(null); // [{ key, part }]
  const [linesPer, setLinesPer] = useState(4);
  const [tidying, setTidying] = useState(false);
  const [dropAt, setDropAt] = useState(null); // index | 'end' | null

  // Service rows round-trip song ids through a TEXT column ("42.0" for 42) —
  // coerce numeric-likes back to integers for the details lookup.
  const idArg = (() => {
    const n = Number(songId);
    return songId != null && String(songId).trim() !== '' && Number.isFinite(n) && Number.isInteger(n) ? n : songId;
  })();

  const initFlow = (arr, song) => {
    if (arr && Array.isArray(arr.flow)) return arr.flow.map((e) => ({ key: flowKey++, part: e.part }));
    if (arr && Array.isArray(arr.order) && arr.order.length) {
      const conv = orderToFlow(arr.order, song);
      if (conv.length) return conv.map((e) => ({ key: flowKey++, part: e.part }));
    }
    if (Array.isArray(arr)) {
      const conv = orderToFlow(arr, song);
      if (conv.length) return conv.map((e) => ({ key: flowKey++, part: e.part }));
    }
    return songSections(song).map((part) => ({ key: flowKey++, part }));
  };

  useEffect(() => {
    if (!window.require) return;
    let dead = false;
    window.require('electron').ipcRenderer.invoke('db-get-song-details', idArg)
      .then((d) => {
        if (!d || dead) return;
        setDetails(d);
        setFlow(initFlow(existing, d));
      })
      .catch(() => {});
    return () => { dead = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const cues = details?.cues || [];
  const sections = songSections(details);
  const cuesOf = (part) => cues.filter((c) => String(c?.label || '').replace(/\s*\(Part\s+\d+\)\s*$/i, '').trim().toLowerCase() === String(part || '').toLowerCase());
  const expandedCount = (flow || []).reduce((n, e) => n + cuesOf(e.part).length, 0);

  // Dirty guard: X, backdrop-click and Cancel funnel through here.
  const openedSnapRef = useRef(null);
  if (openedSnapRef.current === null && flow !== null) {
    openedSnapRef.current = JSON.stringify((flow || []).map((e) => e.part));
  }
  const isDirty = () => openedSnapRef.current !== null && JSON.stringify((flow || []).map((e) => e.part)) !== openedSnapRef.current;
  const maybeClose = async () => {
    if (!isDirty()) { onClose(); return; }
    const ok = appConfirm
      ? await appConfirm('Discard arrangement changes? The row keeps the last saved order.', { confirmLabel: 'Discard' })
      : true;
    if (ok) onClose();
  };

  // --- Flow edits -------------------------------------------------------
  const appendPart = (part) => setFlow((prev) => [...(prev || []), { key: flowKey++, part }]);
  const move = (idx, dir) => {
    setFlow((prev) => {
      if (!prev) return prev;
      const j = idx + dir;
      if (idx < 0 || j < 0 || idx >= prev.length || j >= prev.length) return prev;
      const next = [...prev];
      [next[idx], next[j]] = [next[j], next[idx]];
      return next;
    });
  };
  const removeAt = (idx) => setFlow((prev) => (prev ? prev.filter((_, i) => i !== idx) : prev));
  const insertAt = (idx, part) => {
    setFlow((prev) => {
      const next = [...(prev || [])];
      next.splice(Math.max(0, Math.min(idx, next.length)), 0, { key: flowKey++, part });
      return next;
    });
  };
  const relocate = (from, to) => {
    setFlow((prev) => {
      if (!prev || from === to) return prev;
      const next = [...prev];
      const [entry] = next.splice(from, 1);
      next.splice(Math.max(0, Math.min(to, next.length)), 0, entry);
      return next;
    });
  };
  const reset = () => {
    if (details) setFlow(songSections(details).map((part) => ({ key: flowKey++, part })));
  };

  // --- HTML5 drag and drop (no new deps): left blocks COPY in, right
  // entries MOVE. Click/↑↓ remain full fallbacks (touch + precision).
  const readDrop = (e) => {
    try {
      const raw = e.dataTransfer.getData('application/x-kog-arr');
      if (raw) return JSON.parse(raw);
    } catch {}
    return null;
  };
  const startAdd = (e, part) => {
    e.dataTransfer.setData('application/x-kog-arr', JSON.stringify({ mode: 'add', part }));
    e.dataTransfer.setData('text/plain', part);
    e.dataTransfer.effectAllowed = 'copy';
  };
  const startMove = (e, index) => {
    e.dataTransfer.setData('application/x-kog-arr', JSON.stringify({ mode: 'move', index }));
    e.dataTransfer.setData('text/plain', String(index));
    e.dataTransfer.effectAllowed = 'move';
  };
  const dropOnEntry = (e, index) => {
    e.preventDefault();
    e.stopPropagation();
    const d = readDrop(e);
    setDropAt(null);
    if (!d) return;
    if (d.mode === 'move') relocate(d.index, index);
    else if (d.mode === 'add' && d.part) insertAt(index, d.part);
  };
  const dropAtEnd = (e) => {
    e.preventDefault();
    const d = readDrop(e);
    setDropAt(null);
    if (!d) return;
    if (d.mode === 'move') relocate(d.index, (flow || []).length);
    else if (d.mode === 'add' && d.part) appendPart(d.part);
  };

  // --- Tidy slides: re-chunk the LIBRARY song into N-line slides ---------
  const tidy = async () => {
    if (!details || tidying || !window.require) return;
    const chunks = splitCuesToLineChunks(details.cues, linesPer);
    if (chunks.length === details.cues.length) {
      try { toast.add({ title: 'Already tidy', description: `Every slide is ${linesPer} lines or fewer.`, duration: 3000 }); } catch {}
      return;
    }
    const ok = appConfirm
      ? await appConfirm(
          `Rebuild "${details.title || title || 'this song'}" into ${linesPer}-line slides (${details.cues.length} → ${chunks.length} slides)? This rewrites the library song — every service row plays the new slides. Section order is untouched.`,
          { confirmLabel: 'Rebuild' }
        )
      : true;
    if (!ok) return;
    setTidying(true);
    try {
      const { ipcRenderer } = window.require('electron');
      await ipcRenderer.invoke('db-save-song', { ...details, cues: chunks });
      const fresh = await ipcRenderer.invoke('db-get-song-details', idArg);
      if (fresh) setDetails(fresh);
      try { toast.add({ title: 'Slides rebuilt', description: `${details.cues.length} → ${chunks.length} slides at ${linesPer} lines each.`, type: 'success', duration: 4000 }); } catch {}
    } finally {
      setTidying(false);
    }
  };

  const save = (clear = false) => {
    if (clear) { onSave({ arr: null }); return; }
    if (!flow || !flow.length) return;
    const parts = flow.map((e) => ({ part: e.part }));
    onSave({
      arr: { version: 2, flow: parts, slideCount: expandedCount },
      summary: summarizeFlow(parts),
    });
  };

  const btn = { background: 'transparent', border: '1px solid var(--ui-border2)', color: C.muted, borderRadius: 6, cursor: 'pointer', display: 'flex', padding: 4, alignItems: 'center' };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10001 }} onClick={maybeClose}>
      <motion.div
        initial={{ opacity: 0, y: 16, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ type: 'spring', stiffness: 380, damping: 30 }}
        onClick={(e) => e.stopPropagation()}
        style={{ width: 640, maxWidth: '94vw', maxHeight: '88vh', overflowY: 'auto', background: C.panel, border: '1px solid var(--ui-border2)', borderRadius: 14, padding: 18, boxSizing: 'border-box' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          <ListMusic size={15} color={ACCENT} />
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: C.text, flex: 1 }}>Song Arrangement{forAnchor ? ' — medley anchor' : ''}</h2>
          <button onClick={maybeClose} style={{ background: 'transparent', border: 'none', color: C.muted, cursor: 'pointer', display: 'flex', padding: 4 }}><X size={16} /></button>
        </div>
        <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.55, marginBottom: 12 }}>
          Build <b style={{ color: C.text }}>{title || details?.title || 'this song'}</b> from sections — drag a part in (or click it), drag again to repeat. Each block brings all its slides, always in order. The library song stays untouched.
        </div>

        {flow === null ? (
          <div style={{ fontSize: 12, color: C.muted, padding: '18px 0', textAlign: 'center' }}>Loading sections…</div>
        ) : (
          <>
            <div style={{ display: 'flex', gap: 12, alignItems: 'stretch', marginBottom: 12 }}>
              {/* LEFT — Master Parts menu */}
              <div style={{ flex: '0 0 38%', minWidth: 0 }}>
                <div style={{ fontSize: 10, color: C.faint, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 1.2, marginBottom: 6 }}>Master parts — click or drag in</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {sections.map((part) => {
                    const list = cuesOf(part);
                    const firstLine = String(list[0]?.text || '').split('\n').find((l) => l.trim()) || '';
                    return (
                      <div
                        key={part}
                        draggable
                        onDragStart={(e) => startAdd(e, part)}
                        onDragEnd={() => setDropAt(null)}
                        onClick={() => appendPart(part)}
                        title="Click to append · drag into the flow"
                        style={{ background: C.elevated, border: '1px solid var(--ui-border2)', borderRadius: 9, padding: '8px 10px', cursor: 'grab', display: 'flex', alignItems: 'center', gap: 8 }}
                      >
                        <GripVertical size={13} color={C.faint} style={{ flexShrink: 0 }} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 12.5, fontWeight: 800, color: C.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            <span style={{ color: ACCENT }}>{abbrevSection(part)}</span> · {part}
                          </div>
                          <div style={{ fontSize: 10.5, color: C.muted, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{list.length} slide{list.length === 1 ? '' : 's'} · {firstLine}</div>
                        </div>
                      </div>
                    );
                  })}
                  {!sections.length && <div style={{ fontSize: 11.5, color: C.faint2 }}>No sections found.</div>}
                </div>
              </div>

              {/* RIGHT — Service Flow timeline */}
              <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
                <div style={{ fontSize: 10, color: C.faint, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 1.2, marginBottom: 6 }}>
                  Service flow — {flow.length} block{flow.length === 1 ? '' : 's'} · {expandedCount} slide{expandedCount === 1 ? '' : 's'}
                </div>
                <div
                  onDragOver={(e) => { e.preventDefault(); if (dropAt !== 'end') setDropAt('end'); }}
                  onDragLeave={() => setDropAt((d) => (d === 'end' ? null : d))}
                  onDrop={dropAtEnd}
                  style={{ flex: 1, minHeight: 180, background: dropAt === 'end' ? 'rgba(139,92,246,0.10)' : C.elevated, border: '1px dashed ' + (dropAt === 'end' ? ACCENT : 'var(--ui-border2)'), borderRadius: 10, padding: 8, display: 'flex', flexDirection: 'column', gap: 6, overflowY: 'auto', maxHeight: 340 }}
                >
                  {flow.map((entry, i) => {
                    const list = cuesOf(entry.part);
                    return (
                      <div key={entry.key}>
                        {dropAt === i && <div style={{ height: 3, borderRadius: 3, background: ACCENT, margin: '1px 2px' }} />}
                        <div
                          data-flow-entry={i}
                          draggable
                          onDragStart={(e) => startMove(e, i)}
                          onDragEnd={() => setDropAt(null)}
                          onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); if (dropAt !== i) setDropAt(i); }}
                          onDrop={(e) => dropOnEntry(e, i)}
                          style={{ background: C.elevated2, border: '1px solid var(--ui-border2)', borderRadius: 8, padding: '7px 8px', cursor: 'grab' }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span style={{ fontSize: 11, fontWeight: 800, color: ACCENT, width: 18, textAlign: 'right', flexShrink: 0 }}>{i + 1}.</span>
                            <div style={{ flex: 1, minWidth: 0, fontSize: 12.5, fontWeight: 800, color: C.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {abbrevSection(entry.part)} · {entry.part}
                            </div>
                            <button onClick={() => move(i, -1)} title="Move up" style={btn}><ChevronUp size={13} /></button>
                            <button onClick={() => move(i, 1)} title="Move down" style={btn}><ChevronDown size={13} /></button>
                            <button onClick={() => removeAt(i)} title="Drop from the flow" style={{ ...btn, color: '#f87171' }}><Trash2 size={13} /></button>
                          </div>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 6, paddingLeft: 24 }}>
                            {list.map((c, si) => (
                              <span key={c.id ?? `${entry.key}-${si}`} title={String(c.text || '').split('\n')[0] || ''} style={{ fontSize: 10, fontWeight: 700, color: C.muted, background: C.elevated, border: '1px solid var(--ui-border2)', borderRadius: 5, padding: '1px 7px' }}>
                                {si + 1}
                              </span>
                            ))}
                            {!list.length && <span style={{ fontSize: 10.5, color: '#f87171' }}>section gone from song — re-pick below</span>}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  {!flow.length && (
                    <div style={{ fontSize: 12, color: C.muted, padding: '26px 10px', textAlign: 'center' }}>Drag sections here — or click them on the left.</div>
                  )}
                </div>
              </div>
            </div>

            {/* Tidy slides: re-chunk the library song into singable slides */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: C.elevated, border: '1px solid var(--ui-border2)', borderRadius: 9, padding: '8px 10px', marginBottom: 12 }}>
              <Sparkles size={13} color={ACCENT} style={{ flexShrink: 0 }} />
              <span style={{ fontSize: 11.5, fontWeight: 700, color: C.text2, flexShrink: 0 }}>Tidy slides:</span>
              {[2, 3, 4].map((n) => (
                <button
                  key={n}
                  onClick={() => setLinesPer(n)}
                  title={`${n} lines per slide`}
                  style={{ background: linesPer === n ? ACCENT : C.elevated2, border: '1px solid ' + (linesPer === n ? ACCENT : 'var(--ui-border2)'), color: linesPer === n ? '#fff' : C.muted, borderRadius: 6, padding: '4px 11px', fontSize: 11.5, fontWeight: 800, cursor: 'pointer' }}
                >{n}</button>
              ))}
              <span style={{ fontSize: 10.5, color: C.muted, flex: 1, minWidth: 0 }}>lines per slide — rebuilds the song</span>
              <button onClick={tidy} disabled={tidying} style={{ background: tidying ? C.elevated2 : ACCENT, border: 'none', color: tidying ? C.muted : '#fff', borderRadius: 7, padding: '7px 14px', fontSize: 11.5, fontWeight: 800, cursor: tidying ? 'default' : 'pointer' }}>
                {tidying ? 'Rebuilding…' : 'Apply'}
              </button>
            </div>

            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={reset} title="Each section once, song order" style={{ background: 'transparent', border: '1px solid var(--ui-border2)', color: C.muted, borderRadius: 8, padding: '10px 12px', fontSize: 12, fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}><RotateCcw size={13} /> Reset</button>
              {existing != null && (
                <button onClick={() => save(true)} title="Forget the custom flow — plain song again" style={{ background: 'transparent', border: '1px solid rgba(248,113,113,0.5)', color: '#f87171', borderRadius: 8, padding: '10px 12px', fontSize: 12, fontWeight: 800, cursor: 'pointer' }}>Remove</button>
              )}
              <span style={{ flex: 1 }} />
              <button onClick={maybeClose} style={{ background: C.elevated2, border: '1px solid var(--ui-border2)', color: C.muted, borderRadius: 8, padding: '10px 18px', fontSize: 12.5, fontWeight: 800, cursor: 'pointer' }}>Cancel</button>
              <button onClick={() => save(false)} disabled={!flow.length} style={{ background: flow.length ? ACCENT : C.elevated2, border: 'none', color: flow.length ? '#fff' : C.muted, borderRadius: 8, padding: '10px 18px', fontSize: 12.5, fontWeight: 800, cursor: flow.length ? 'pointer' : 'default' }}>Save Arrangement</button>
            </div>
          </>
        )}
      </motion.div>
    </motion.div>
  );
}
