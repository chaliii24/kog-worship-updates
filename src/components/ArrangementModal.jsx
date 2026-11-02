import React, { useEffect, useRef, useState } from 'react';
import { ListMusic, X, RotateCcw, Sparkles, Undo2, AlertTriangle } from 'lucide-react';
import { motion } from 'motion/react';
import { useApp } from '../context/AppContext';
import { toast } from '../untitledui/components/ui/toast';
import FlowEditor from './FlowEditor';
import {
  orderToFlow, summarizeFlow, splitCuesToLineChunks,
  abbrevSection, songSectionRuns, sequenceToFlow,
} from '../lib/arrangement';

// Song Arrangement modal — the SERVICE ROW's play order for one song.
//
// The body is the shared <FlowEditor>, the same editor the Song Editor's
// Sequence tab uses: one vocabulary (section runs with an explicit
// occurrence), one behaviour, whichever scope you are in.
//
// SCOPE is stated, not implied. This modal edits the row; the song editor is
// the song-level default. The banner keeps that visible the whole time (a
// banner that only greets you on open cannot answer "what am I changing?" two
// edits later) and carries the two ways out: "Use song order" (load the
// default, unsaved) and "Remove override" (forget this row's order entirely).
//
// The library song is never touched by arranging — the flow is stored on the
// service row. The optional "Tidy slides" tool DOES rewrite the song (with
// confirmation): it re-chunks long sections into N-line slides so the
// congregation gets singable 2–4-line projection.
let flowKey = 1;

export default function ArrangementModal({ songId, title, existing, onSave, onClose, forAnchor, forBuilder }) {
  const { C, ACCENT, appConfirm } = useApp();
  const [details, setDetails] = useState(null);
  const [flow, setFlow] = useState(null); // [{ key, part, occurrence }]
  const [linesPer, setLinesPer] = useState(4);
  const [tidying, setTidying] = useState(false);
  const [loadError, setLoadError] = useState(null);
  const [loadTick, setLoadTick] = useState(0);
  // WHICH order the button below saves. 'row' is this service item (the
  // override); 'song' is the song's own default, i.e. every service that
  // follows it. Same editor, same flow — only the destination changes.
  const [saveScope, setSaveScope] = useState('row');

  // Undo: every mutation pushes the PREVIOUS flow. flowRef mirrors the state
  // so edits compute from the current list without impure setState updaters
  // (StrictMode double-invokes those, which would double history).
  const flowRef = useRef(null);
  flowRef.current = flow;
  const historyRef = useRef([]);
  const applyFlow = (next) => {
    if (!Array.isArray(next)) return;
    historyRef.current = [...historyRef.current.slice(-49), flowRef.current || []];
    flowRef.current = next;
    setFlow(next);
  };
  const resetFlow = (next) => {
    historyRef.current = [];
    flowRef.current = next;
    setFlow(next);
  };
  const undo = () => {
    const stack = historyRef.current;
    if (!stack.length) return;
    const prev = stack[stack.length - 1];
    historyRef.current = stack.slice(0, -1);
    flowRef.current = prev;
    setFlow(prev);
  };

  // Service rows round-trip song ids through a TEXT column ("42.0" for 42) —
  // coerce numeric-likes back to integers for the details lookup.
  const idArg = (() => {
    const n = Number(songId);
    return songId != null && String(songId).trim() !== '' && Number.isFinite(n) && Number.isInteger(n) ? n : songId;
  })();

  const initFlow = (arr, song) => {
    const runs = songSectionRuns(song);
    if (!runs.length) return [];
    const samePart = (a, b) => String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase();
    const pick = (part, occurrence) => {
      const list = runs.filter((r) => samePart(r.part, part));
      if (!list.length) return null;
      const n = Number.isInteger(occurrence) && occurrence > 0 ? occurrence : 1;
      return list[Math.min(n - 1, list.length - 1)];
    };
    // v3/v2 section flows: occurrence wins; older flows use the next
    // occurrence of the named part, so repeated sections stop doubling.
    if (arr && Array.isArray(arr.flow) && arr.flow.length) {
      const counters = new Map();
      const out = [];
      for (const entry of arr.flow) {
        const key = String(entry?.part || '').trim().toLowerCase();
        if (!key) continue;
        let occurrence = Number.isInteger(entry?.occurrence) && entry.occurrence > 0 ? entry.occurrence : null;
        if (!occurrence) {
          occurrence = (counters.get(key) || 0) + 1;
          counters.set(key, occurrence);
        }
        const run = pick(entry.part, occurrence);
        if (run) out.push({ key: flowKey++, part: run.part, occurrence: run.occurrence });
      }
      if (out.length) return out;
    }
    // Legacy per-slide order: exact cue ids → their section runs.
    const legacy = arr && Array.isArray(arr.order) && arr.order.length ? arr.order
      : Array.isArray(arr) ? arr : null;
    if (legacy) {
      const conv = orderToFlow(legacy, song);
      if (conv.length) return conv.map((entry) => ({ key: flowKey++, ...entry }));
    }
    // No service-row arrangement: START FROM THE SONG'S OWN SEQUENCE (Song
    // editor → Sequence). The row is the override, not the baseline — opening
    // the arrangement on a sequenced song used to show plain library order, so
    // the two panels disagreed about the same song. Every run once remains the
    // fallback for a song with no sequence saved.
    const own = sequenceToFlow(song);
    if (own.length) return own.map((entry) => ({ key: flowKey++, ...entry }));
    return runs.map((run) => ({ key: flowKey++, part: run.part, occurrence: run.occurrence }));
  };

  useEffect(() => {
    if (!window.require) {
      setLoadError('Section order needs the desktop app.');
      return;
    }
    let dead = false;
    setLoadError(null);
    setFlow(null);
    window.require('electron').ipcRenderer.invoke('db-get-song-details', idArg)
      .then((d) => {
        if (dead) return;
        if (!d) { setLoadError('This song is no longer in the library.'); setFlow([]); return; }
        setDetails(d);
        // resetFlow, not setFlow: a fresh load is not an undoable edit.
        resetFlow(initFlow(existing, d));
      })
      .catch((err) => {
        if (dead) return;
        setFlow([]);
        setLoadError(String(err?.message || 'Could not load this song.'));
      });
    return () => { dead = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadTick]);

  const runs = songSectionRuns(details);
  const runOf = (entry) => {
    const list = runs.filter((r) => String(r.part || '').trim().toLowerCase() === String(entry?.part || '').trim().toLowerCase());
    if (!list.length) return null;
    const n = Number.isInteger(entry?.occurrence) && entry.occurrence > 0 ? entry.occurrence : 1;
    return list[Math.min(n - 1, list.length - 1)];
  };
  const expandedCount = (flow || []).reduce((n, entry) => n + (runOf(entry)?.cues || []).length, 0);

  // Dirty guard: X, backdrop-click and Cancel funnel through here.
  const openedSnapRef = useRef(null);
  if (openedSnapRef.current === null && flow !== null) {
    openedSnapRef.current = JSON.stringify((flow || []).map((e) => `${e.part}|${e.occurrence}`));
  }
  const snap = () => JSON.stringify((flow || []).map((e) => `${e.part}|${e.occurrence}`));
  const isDirty = () => openedSnapRef.current !== null && snap() !== openedSnapRef.current;
  const dirty = flow !== null && isDirty();
  const maybeClose = async () => {
    if (!isDirty()) { onClose(); return; }
    const ok = appConfirm
      ? await appConfirm('Discard arrangement changes? The row keeps the last saved order.', { confirmLabel: 'Discard' })
      : true;
    if (ok) onClose();
  };

  // Ctrl/Cmd+Z walks back through this session's edits. Scoped to the modal
  // (it is mounted only while open) and skipped while typing, so it cannot
  // fight a text field inside the dialog.
  useEffect(() => {
    const onKey = (e) => {
      if (!(e.ctrlKey || e.metaKey) || e.shiftKey || String(e.key).toLowerCase() !== 'z') return;
      const el = e.target;
      const tag = String(el?.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select' || el?.isContentEditable) return;
      if (!historyRef.current.length) return;
      e.preventDefault();
      undo();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The two defaults this modal can offer, kept distinct:
  //   Library order — every section once, top to bottom (the song as stored).
  //   Song order    — the Song Editor's sequence (the song-level default).
  const toLibraryOrder = () => songSectionRuns(details).map((run) => ({ key: flowKey++, part: run.part, occurrence: run.occurrence }));
  const reset = () => { if (details) applyFlow(toLibraryOrder()); };
  const useSongOrder = () => {
    const own = sequenceToFlow(details);
    if (own.length) applyFlow(own.map((entry) => ({ key: flowKey++, ...entry })));
  };
  // Switching scope LOADS that scope's order, so what you see is what you are
  // about to overwrite. It is navigation, not an edit: the undo stack and the
  // dirty snapshot reset with it, otherwise merely peeking at the song default
  // would make Cancel ask you to discard nothing.
  const switchScope = (next) => {
    if (next === saveScope || !details) { setSaveScope(next); return; }
    const own = sequenceToFlow(details);
    const base = next === 'song'
      ? (own.length ? own.map((entry) => ({ key: flowKey++, ...entry })) : toLibraryOrder())
      : initFlow(existing, details);
    resetFlow(base);
    openedSnapRef.current = JSON.stringify(base.map((e) => `${e.part}|${e.occurrence}`));
    setSaveScope(next);
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
    const parts = (flow || []).map((e) => ({ part: e.part, occurrence: e.occurrence }));
    if (saveScope === 'song') {
      // "This song": the flow becomes the song's default order. Clearing is
      // explicit ([]), never an accidental empty edit.
      if (!clear && !parts.length) return;
      onSave({ scope: 'song', flow: clear ? [] : parts, summary: summarizeFlow(parts) });
      return;
    }
    if (clear) { onSave({ arr: null }); return; }
    if (!parts.length) return;
    // `known` records every run the song had at save time: an omitted run
    // stays omitted, while a section added later still appends on playback.
    const known = runs.map((run) => ({ part: run.part, occurrence: run.occurrence }));
    onSave({
      arr: { version: 3, flow: parts, known, slideCount: expandedCount },
      summary: summarizeFlow(parts),
    });
  };

  const scopeBtn = { background: 'transparent', border: '1px solid var(--ui-border2)', color: C.text2, borderRadius: 6, padding: '4px 8px', fontSize: 10.5, fontWeight: 800, cursor: 'pointer', whiteSpace: 'nowrap' };

  // SCOPE. The row's own order wins over the song's sequence, which wins over
  // library order. Which of those three you are looking at — and what saving
  // here will change — is the banner's whole job.
  const songFlow = sequenceToFlow(details);
  const rowHasArr = !!(existing && ((existing.flow || []).length || (existing.order || []).length));
  const songOrderSummary = songFlow.map((e) => abbrevSection(e.part)).join(' · ');
  const scopeText = saveScope === 'song'
    ? 'Saving writes the song’s default order. Every service row that has no override of its own plays this — in this service and every future one.'
    : rowHasArr
      ? (forBuilder
        ? 'This show item has its own order. Saving changes it here only — the song and every other item keep theirs. Create Show carries it into the service.'
        : 'This row has its own order. Saving changes this service row only — the song and every other row keep theirs.')
      : songFlow.length
        ? `Starting from the Song Editor's sequence (${songFlow.length} section${songFlow.length === 1 ? '' : 's'}). Saving here overrides it for this ${forBuilder ? 'show item' : 'row'} only.`
        : `This song has no saved sequence, so saving here becomes this ${forBuilder ? 'show item’s' : 'row’s'} own order.`;
  const segBtn = (on) => ({
    background: on ? ACCENT : 'transparent',
    border: 'none',
    color: on ? '#1C1C1E' : C.muted,
    padding: '4px 9px',
    fontSize: 10.5,
    fontWeight: 800,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  });

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
          Build <b style={{ color: C.text }}>{title || details?.title || 'this song'}</b> from sections — drag a part in (or click it), drag again to repeat. Each block is one exact section occurrence, so repeated choruses stay in the right place. The library song stays untouched.
        </div>

        {/* SCOPE BANNER — persistent, because "which order am I editing?" is
            still the question at edit five, not just when the dialog opens. */}
        <div style={{ padding: '8px 10px', borderRadius: 9, marginBottom: 12, background: rowHasArr ? 'rgba(255,184,0,0.10)' : 'rgba(255,255,255,0.035)', border: '1px solid ' + (rowHasArr ? 'rgba(255,184,0,0.35)' : 'var(--ui-border2)') }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: 1, textTransform: 'uppercase', color: saveScope === 'song' ? '#8AB4F8' : (rowHasArr ? ACCENT : C.faint), flexShrink: 0 }}>
              {saveScope === 'song' ? 'Song default' : (rowHasArr ? (forBuilder ? 'Item override' : 'Row override') : (forBuilder ? 'Item only' : 'Row only'))}
            </span>
            <span style={{ flex: 1, minWidth: 0 }} />
            {/* THE SCOPE SWITCH — the whole point of the merged editor. */}
            <div style={{ display: 'flex', border: '1px solid var(--ui-border2)', borderRadius: 7, overflow: 'hidden', flexShrink: 0 }}>
              <button onClick={() => switchScope('song')} title="Edit the song's own order — every service follows it" style={segBtn(saveScope === 'song')}>This song</button>
              <button onClick={() => switchScope('row')} title="Edit this service row only" style={segBtn(saveScope === 'row')}>This row</button>
            </div>
          </div>
          <div style={{ fontSize: 11.5, color: C.text2, lineHeight: 1.5, marginTop: 4 }}>{scopeText}</div>
          <div style={{ fontSize: 10.5, color: C.faint, marginTop: 3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={songOrderSummary}>
            Song order: {songOrderSummary || 'none saved'}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
            {saveScope === 'row' && songFlow.length > 0 && (
              <button onClick={useSongOrder} title="Load the song's order into the flow (nothing is saved until Save)" style={scopeBtn}>Use song order</button>
            )}
            {saveScope === 'row' && rowHasArr && (
              <button onClick={() => save(true)} title="Forget this row's custom order — it follows the song again" style={{ ...scopeBtn, border: '1px solid rgba(255,69,69,0.5)', color: '#FF4545' }}>Remove override</button>
            )}
            {saveScope === 'song' && songFlow.length > 0 && (
              <button onClick={() => save(true)} title="Forget the song's custom order — it follows its slides again, everywhere" style={{ ...scopeBtn, border: '1px solid rgba(255,69,69,0.5)', color: '#FF4545' }}>Clear song order</button>
            )}
          </div>
        </div>

        {loadError ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#FF4545', background: 'rgba(255,69,69,0.08)', border: '1px solid rgba(255,69,69,0.35)', borderRadius: 9, padding: '12px 12px', marginBottom: 12 }}>
            <AlertTriangle size={15} style={{ flexShrink: 0 }} />
            <span style={{ flex: 1, minWidth: 0, lineHeight: 1.5 }}>{loadError}</span>
            <button onClick={() => setLoadTick((n) => n + 1)} style={{ ...scopeBtn, border: '1px solid rgba(255,69,69,0.5)', color: '#FF4545' }}>Retry</button>
            <button onClick={onClose} style={{ ...scopeBtn, color: C.muted }}>Close</button>
          </div>
        ) : flow === null ? (
          <div style={{ fontSize: 12, color: C.muted, padding: '18px 0', textAlign: 'center' }}>Loading sections…</div>
        ) : (
          <>
            <FlowEditor
              song={details}
              flow={flow}
              onChange={applyFlow}
              layout="split"
              emptyText="Drag sections here — or click them on the left."
              headerExtra={(
                <>
                  {dirty && <span style={{ fontSize: 9, fontWeight: 800, color: ACCENT, background: 'rgba(255,184,0,0.14)', border: '1px solid rgba(255,184,0,0.4)', borderRadius: 4, padding: '1px 5px', flexShrink: 0 }}>UNSAVED</span>}
                  <button
                    onClick={undo}
                    disabled={!historyRef.current.length}
                    title="Undo the last change (Ctrl/Cmd+Z)"
                    style={{ background: 'transparent', border: '1px solid var(--ui-border2)', color: historyRef.current.length ? C.text2 : C.faint, borderRadius: 6, padding: '2px 6px', fontSize: 10, fontWeight: 800, display: 'flex', alignItems: 'center', gap: 3, opacity: historyRef.current.length ? 1 : 0.5, cursor: historyRef.current.length ? 'pointer' : 'default', flexShrink: 0 }}
                  >
                    <Undo2 size={11} /> Undo
                  </button>
                </>
              )}
            />
            <div style={{ fontSize: 10.5, color: C.muted, margin: '8px 0 12px', display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <span>{flow.length} block{flow.length === 1 ? '' : 's'}</span>
              <span>·</span>
              <span>{expandedCount} slide{expandedCount === 1 ? '' : 's'} on screen</span>
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
                  style={{ background: linesPer === n ? ACCENT : C.elevated2, border: '1px solid ' + (linesPer === n ? ACCENT : 'var(--ui-border2)'), color: linesPer === n ? '#1C1C1E' : C.muted, borderRadius: 6, padding: '4px 11px', fontSize: 11.5, fontWeight: 800, cursor: 'pointer' }}
                >{n}</button>
              ))}
              <span style={{ fontSize: 10.5, color: C.muted, flex: 1, minWidth: 0 }}>lines per slide — rebuilds the library song, not this arrangement</span>
              <button onClick={tidy} disabled={tidying} style={{ background: tidying ? C.elevated2 : ACCENT, border: 'none', color: tidying ? C.muted: '#1C1C1E', borderRadius: 7, padding: '7px 14px', fontSize: 11.5, fontWeight: 800, cursor: tidying ? 'default' : 'pointer' }}>
                {tidying ? 'Rebuilding…' : 'Apply'}
              </button>
            </div>

            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={reset} title="Library order — every section once, top to bottom. Not the Song Editor's sequence." style={{ background: 'transparent', border: '1px solid var(--ui-border2)', color: C.muted, borderRadius: 8, padding: '10px 12px', fontSize: 12, fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}><RotateCcw size={13} /> Library order</button>
              <span style={{ flex: 1 }} />
              <button onClick={maybeClose} style={{ background: C.elevated2, border: '1px solid var(--ui-border2)', color: C.muted, borderRadius: 8, padding: '10px 18px', fontSize: 12.5, fontWeight: 800, cursor: 'pointer' }}>Cancel</button>
              <button onClick={() => save(false)} disabled={!flow.length} style={{ background: flow.length ? ACCENT : C.elevated2, border: 'none', color: flow.length ? '#1C1C1E' : C.muted, borderRadius: 8, padding: '10px 18px', fontSize: 12.5, fontWeight: 800, cursor: flow.length ? 'pointer' : 'default' }}>
                {saveScope === 'song' ? 'Save Song Order' : 'Save Arrangement'}
              </button>
            </div>
          </>
        )}
      </motion.div>
    </motion.div>
  );
}
