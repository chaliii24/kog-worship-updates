import React, { useRef, useState } from 'react';
import { ChevronUp, ChevronDown, Trash2, GripVertical } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { abbrevSection, songSectionRuns } from '../lib/arrangement';

// ONE section-flow editor, two homes.
//
// The Song Editor's Sequence tab and the per-row Arrangement modal used to be
// two different editors over two different shapes: a list of section LABELS on
// the song, and {part, occurrence} blocks on the service row. They meant the
// same thing, disagreed about repeats, and each needed its own resolver. This
// component is that editor: the song and the row now speak the same flow.
//
// Controlled: the owner keeps `flow` ([{ key, part, occurrence }]) and history.
// `layout` is about space, not behaviour — "split" is the wide two-column
// dialog, "stacked" is the narrow 240px sidebar rail.
//
// Nothing here touches cues: an arrangement is a running order, never a
// reorder of the slides themselves.
let flowKey = 1;
const samePart = (a, b) => String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase();
const occOf = (entry) => (Number.isInteger(entry?.occurrence) && entry.occurrence > 0 ? entry.occurrence : 1);

export default function FlowEditor({ song, flow, onChange, layout = 'split', headerExtra, emptyText }) {
  const { C, ACCENT } = useApp();
  const list = Array.isArray(flow) ? flow : [];
  const runs = songSectionRuns(song);
  const split = layout === 'split';
  const [dropAt, setDropAt] = useState(null);
  const lastDragAtRef = useRef(0);

  const emit = (next) => { if (Array.isArray(next)) onChange(next); };
  const append = (run) => { if (run) emit([...list, { key: flowKey++, part: run.part, occurrence: run.occurrence }]); };
  const insert = (idx, part, occurrence) => {
    const next = [...list];
    next.splice(Math.max(0, Math.min(idx, next.length)), 0, { key: flowKey++, part, occurrence });
    emit(next);
  };
  const move = (idx, dir) => {
    const j = idx + dir;
    if (idx < 0 || j < 0 || idx >= list.length || j >= list.length) return;
    const next = [...list];
    [next[idx], next[j]] = [next[j], next[idx]];
    emit(next);
  };
  const removeAt = (idx) => { if (idx >= 0 && idx < list.length) emit(list.filter((_, i) => i !== idx)); };
  const relocate = (from, to) => {
    if (from < 0 || from >= list.length || from === to) return;
    const next = [...list];
    const [entry] = next.splice(from, 1);
    next.splice(Math.max(0, Math.min(to, next.length)), 0, entry);
    emit(next);
  };

  const uses = (run) => list.filter((e) => samePart(e.part, run.part) && occOf(e) === run.occurrence).length;
  const countFor = (entry) => {
    const run = runs.filter((r) => samePart(r.part, entry.part));
    return (run[Math.min(occOf(entry) - 1, Math.max(0, run.length - 1))]?.cues || []).length;
  };

  // Drag and drop is the fast path; click-to-append and ↑↓ stay the reliable
  // one on touch and with a trackpad.
  const readDrop = (e) => {
    try {
      const raw = e.dataTransfer.getData('application/x-kog-arr');
      if (raw) return JSON.parse(raw);
    } catch {}
    return null;
  };
  const startAdd = (e, run) => {
    lastDragAtRef.current = Date.now();
    e.dataTransfer.setData('application/x-kog-arr', JSON.stringify({ mode: 'add', part: run.part, occurrence: run.occurrence }));
    e.dataTransfer.setData('text/plain', run.part);
    e.dataTransfer.effectAllowed = 'copy';
  };
  const startMove = (e, index) => {
    lastDragAtRef.current = Date.now();
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
    else if (d.mode === 'add' && d.part) insert(index, d.part, d.occurrence);
  };
  const dropAtEnd = (e) => {
    e.preventDefault();
    const d = readDrop(e);
    setDropAt(null);
    if (!d) return;
    if (d.mode === 'move') relocate(d.index, list.length);
    else if (d.mode === 'add' && d.part) insert(list.length, d.part, d.occurrence);
  };

  const btn = { background: 'transparent', border: '1px solid var(--ui-border2)', color: C.muted, borderRadius: 6, cursor: 'pointer', display: 'flex', padding: 3, alignItems: 'center' };

  // ---- MASTER PARTS -----------------------------------------------------
  const partsSplit = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {runs.map((run, runIdx) => {
        const firstLine = String(run.cues[0]?.text || '').split('\n').find((l) => l.trim()) || '';
        const prevRun = runIdx > 0 ? runs[runIdx - 1] : null;
        const used = uses(run);
        return (
          <div
            key={run.key}
            draggable
            onDragStart={(e) => startAdd(e, run)}
            onDragEnd={() => setDropAt(null)}
            onClick={() => { if (Date.now() - lastDragAtRef.current > 350) append(run); }}
            title={`Click to append · drag into the flow${run.total > 1 ? ` · occurrence #${run.occurrence} of ${run.total}` : ''}`}
            style={{ background: C.elevated, border: '1px solid var(--ui-border2)', borderRadius: 9, padding: '8px 10px', cursor: 'grab', display: 'flex', alignItems: 'center', gap: 8 }}
          >
            <GripVertical size={13} color={C.faint} style={{ flexShrink: 0 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12.5, fontWeight: 800, color: C.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                <span style={{ color: ACCENT }}>{abbrevSection(run.part)}{run.total > 1 ? ` #${run.occurrence}` : ''}</span> · {run.part}
              </div>
              <div style={{ fontSize: 10.5, color: C.muted, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{run.cues.length} slide{run.cues.length === 1 ? '' : 's'} · {firstLine}</div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2, flexShrink: 0 }}>
              {run.total > 1 && (
                <span title={prevRun ? `This run comes after "${prevRun.part}" in the song` : 'This run opens the song'} style={{ fontSize: 9, fontWeight: 800, color: C.faint, background: C.elevated2, border: '1px solid var(--ui-border2)', borderRadius: 4, padding: '1px 4px', whiteSpace: 'nowrap' }}>
                  {prevRun ? `after ${abbrevSection(prevRun.part)}` : 'opens'}
                </span>
              )}
              <span title={used ? `Already in the flow ${used}×` : 'Not in the flow yet'} style={{ fontSize: 9.5, fontWeight: 800, color: used ? ACCENT : C.faint, background: used ? 'rgba(255,184,0,0.14)' : 'transparent', border: '1px solid ' + (used ? 'rgba(255,184,0,0.4)' : 'var(--ui-border2)'), borderRadius: 4, padding: '1px 5px', whiteSpace: 'nowrap' }}>
                ×{used}
              </span>
            </div>
          </div>
        );
      })}
      {!runs.length && <div style={{ fontSize: 11.5, color: C.faint2 }}>No sections found.</div>}
    </div>
  );

  const partsStacked = (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
      {runs.map((run) => {
        const used = uses(run);
        return (
          <button
            key={run.key}
            draggable
            onDragStart={(e) => startAdd(e, run)}
            onDragEnd={() => setDropAt(null)}
            onClick={() => { if (Date.now() - lastDragAtRef.current > 350) append(run); }}
            title={`Append ${run.part}${run.total > 1 ? ` #${run.occurrence}` : ''} — ${run.cues.length} slide${run.cues.length === 1 ? '' : 's'}`}
            style={{
              display: 'flex', alignItems: 'center', gap: 4, cursor: 'grab',
              background: used ? 'rgba(255,184,0,0.12)' : C.input,
              border: '1px solid ' + (used ? 'rgba(255,184,0,0.45)' : 'var(--ui-border2)'),
              color: used ? ACCENT : C.text2,
              borderRadius: 999, padding: '4px 9px', fontSize: 10.5, fontWeight: 800, whiteSpace: 'nowrap',
            }}
          >
            + {run.part}{run.total > 1 ? ` #${run.occurrence}` : ''}
            {used ? <span style={{ fontSize: 9, color: ACCENT, opacity: 0.85 }}>×{used}</span> : null}
          </button>
        );
      })}
      {!runs.length && <div style={{ fontSize: 10.5, color: C.faint2 }}>No sections found.</div>}
    </div>
  );

  // ---- FLOW ROWS --------------------------------------------------------
  const flowRows = (
    <div
      onDragOver={(e) => { e.preventDefault(); if (dropAt !== 'end') setDropAt('end'); }}
      onDragLeave={() => setDropAt((d) => (d === 'end' ? null : d))}
      onDrop={dropAtEnd}
      style={{
        flex: split ? 1 : undefined,
        minHeight: split ? 180 : 64,
        background: dropAt === 'end' ? 'rgba(255,184,0,0.10)' : C.elevated,
        border: '1px dashed ' + (dropAt === 'end' ? ACCENT : 'var(--ui-border2)'),
        borderRadius: 10, padding: 8, display: 'flex', flexDirection: 'column', gap: 6,
        overflowY: 'auto', maxHeight: split ? 340 : undefined,
      }}
    >
      {list.map((entry, i) => (
        <div key={entry.key ?? `f-${i}`}>
          {dropAt === i && <div style={{ height: 3, borderRadius: 3, background: ACCENT, margin: '1px 2px' }} />}
          <div
            data-flow-entry={i}
            draggable
            onDragStart={(e) => startMove(e, i)}
            onDragEnd={() => setDropAt(null)}
            onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); if (dropAt !== i) setDropAt(i); }}
            onDrop={(e) => dropOnEntry(e, i)}
            style={{ background: C.elevated2, border: '1px solid var(--ui-border2)', borderRadius: 8, padding: split ? '7px 8px' : '5px 6px', cursor: 'grab' }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: split ? 6 : 4 }}>
              <span style={{ fontSize: split ? 11 : 10, fontWeight: 800, color: ACCENT, width: split ? 18 : 14, textAlign: 'right', flexShrink: 0 }}>{i + 1}.</span>
              <div style={{ flex: 1, minWidth: 0, fontSize: split ? 12.5 : 11, fontWeight: 800, color: C.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {split ? abbrevSection(entry.part) : entry.part}
                {runs.filter((r) => samePart(r.part, entry.part)).length > 1 ? ` #${occOf(entry)}` : ''}
                {split ? ` · ${entry.part}` : ''}
              </div>
              {!split && <span style={{ fontSize: 9, color: C.faint, flexShrink: 0 }}>{countFor(entry)}s</span>}
              <button onClick={() => move(i, -1)} disabled={i === 0} title="Move up" style={{ ...btn, opacity: i === 0 ? 0.35 : 1, padding: split ? 3 : 1 }}><ChevronUp size={split ? 13 : 11} /></button>
              <button onClick={() => move(i, 1)} disabled={i === list.length - 1} title="Move down" style={{ ...btn, opacity: i === list.length - 1 ? 0.35 : 1, padding: split ? 3 : 1 }}><ChevronDown size={split ? 13 : 11} /></button>
              <button onClick={() => removeAt(i)} title="Drop from the flow" style={{ ...btn, color: '#FF4545', padding: split ? 3 : 1, border: 'none' }}><Trash2 size={split ? 13 : 11} /></button>
            </div>
            {split && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 6, paddingLeft: 24 }}>
                {Array.from({ length: countFor(entry) }).map((_, si) => (
                  <span key={`${entry.key ?? i}-${si}`} style={{ fontSize: 10, fontWeight: 700, color: C.muted, background: C.elevated, border: '1px solid var(--ui-border2)', borderRadius: 5, padding: '1px 7px' }}>{si + 1}</span>
                ))}
                {countFor(entry) === 0 && <span style={{ fontSize: 10.5, color: '#FF4545' }}>section gone from song — re-pick on the left</span>}
              </div>
            )}
          </div>
        </div>
      ))}
      {!list.length && (
        <div style={{ fontSize: split ? 12 : 10.5, color: C.muted, padding: split ? '26px 10px' : '14px 6px', textAlign: 'center' }}>
          {emptyText || (split ? 'Drag sections here — or click them on the left.' : 'No sections yet — tap one above.')}
        </div>
      )}
    </div>
  );

  const header = (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6, minWidth: 0 }}>
      <span style={{ fontSize: 10, color: C.faint, fontWeight: 800, textTransform: 'uppercase', letterSpacing: split ? 1.2 : 1, flex: 1, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        Sequence — {list.length} block{list.length === 1 ? '' : 's'}
      </span>
      {headerExtra}
    </div>
  );

  if (!split) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 }}>
        <div style={{ background: C.elevated, border: '1px solid var(--ui-border2)', borderRadius: 10, padding: 9, display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ fontSize: 10, fontWeight: 800, color: C.faint, textTransform: 'uppercase', letterSpacing: 1.2 }}>Add a section</div>
          {partsStacked}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          {header}
          {flowRows}
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', gap: 12, alignItems: 'stretch' }}>
      <div style={{ flex: '0 0 38%', minWidth: 0 }}>
        <div style={{ fontSize: 10, color: C.faint, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 1.2, marginBottom: 6 }}>Master parts — click or drag in</div>
        {partsSplit}
      </div>
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        {header}
        {flowRows}
      </div>
    </div>
  );
}
