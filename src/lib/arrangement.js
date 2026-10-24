// Song Arrangements — per-service custom play order for ONE song.
//
// A song's library order is fixed, but Sunday's flow rarely is (V1 C V2 C B
// C C). An arrangement is an ordered list of SECTION RUNS stored on the
// SERVICE ROW (item.meta.arrangement) so the library song is never touched
// and two rows can play the same song differently. Repeats are the point —
// the same run may appear several times. Pure functions only.

import { basePartLabel } from './medley.js';

// Library order: every cue once, top to bottom.
export function defaultArrangement(song) {
  return (song?.cues || []).map((c) => c.id).filter((id) => id != null);
}

const normPart = (part) => String(part || '').trim().toLowerCase();

// A song can contain the SAME section more than once (Chorus before and
// after Verse 2, a repeated Bridge, …). Matching blocks by section name alone
// made each "Chorus" block expand to EVERY chorus slide, which duplicated
// slides and moved them out of song order. A "run" is one contiguous
// occurrence of a section — the unit an arrangement actually reorders.
//
// Each run carries a stable occurrence number per part ("Chorus #2") so a
// saved flow can point at that exact occurrence without storing fragile cue
// ids (saveSong re-inserts cues and gives them new ids).
export function songSectionRuns(song) {
  const runs = [];
  for (const cue of song?.cues || []) {
    const part = basePartLabel(cue?.label) || 'Slide';
    const last = runs[runs.length - 1];
    if (last && normPart(last.part) === normPart(part)) last.cues.push(cue);
    else runs.push({ part, cues: [cue] });
  }
  const totals = new Map();
  for (const run of runs) {
    const k = normPart(run.part);
    totals.set(k, (totals.get(k) || 0) + 1);
  }
  const seen = new Map();
  for (const run of runs) {
    const k = normPart(run.part);
    const n = (seen.get(k) || 0) + 1;
    seen.set(k, n);
    run.occurrence = n;
    run.total = totals.get(k);
    run.key = `run:${k}:${n}`;
    run.cueIds = run.cues.map((c) => c.id).filter((id) => id != null);
  }
  return runs;
}

// Reconcile a saved per-slide order with the song as it exists NOW: keep
// stored ids that still exist, in stored order. Omitted and deleted slides
// stay omitted — an arrangement is exact, not a suggestion.
export function normalizeArrangement(order, song) {
  const have = new Set((song?.cues || []).map((c) => c.id).filter((id) => id != null));
  return (Array.isArray(order) ? order : []).filter((id) => have.has(id));
}

// Resolve ANY saved arrangement shape to a cue-id play order:
//   * { flow: [{part, occurrence}] } (v3, exact section occurrences);
//   * { flow: [{part}] } (v2, section blocks) → entries are matched to the
//     next occurrence of that part, so V1 · C · V2 · C resolves to the four
//     real runs instead of both choruses twice;
//   * { order: [ids] } (v1, per-slide rows) → exact legacy order;
//   * raw [ids] array → legacy (defensive).
// Empty/missing falls back to library order. Nothing omitted is re-appended:
// what the arrangement previews is exactly what plays.
export function resolveArrangementFlow(song, arr) {
  const cues = song?.cues || [];
  const ids = cues.map((c) => c.id).filter((id) => id != null);
  if (arr && Array.isArray(arr.flow)) {
    const runs = songSectionRuns(song);
    const out = [];
    const counters = new Map();
    for (const e of arr.flow) {
      const k = normPart(e?.part);
      const list = runs.filter((r) => normPart(r.part) === k);
      if (!list.length) continue;
      let idx;
      if (Number.isInteger(e?.occurrence) && e.occurrence > 0) {
        idx = e.occurrence - 1;
      } else {
        idx = counters.get(k) || 0;
        counters.set(k, idx + 1);
      }
      // If the song lost occurrences since saving, repeat the last remaining
      // one instead of dropping the block. If a part is new, it passes.
      const run = list[Math.min(idx, list.length - 1)];
      out.push(...run.cueIds);
    }
    // A section added to the song AFTER this arrangement was saved should
    // still play. Runs the arranger deliberately omitted are already covered
    // by `known` and stay omitted.
    if (Array.isArray(arr.known) && arr.known.length) {
      const knownMax = new Map();
      for (const k of arr.known) {
        const p = normPart(k?.part);
        if (!p) continue;
        knownMax.set(p, Math.max(knownMax.get(p) || 0, Number(k?.occurrence) || 0));
      }
      const used = new Set(out);
      for (const run of runs) {
        if (run.cueIds.some((id) => used.has(id))) continue;
        if (run.occurrence > (knownMax.get(normPart(run.part)) || 0)) out.push(...run.cueIds);
      }
    }
    return out.length ? out : ids;
  }
  if (arr && Array.isArray(arr.order) && arr.order.length) return normalizeArrangement(arr.order, song);
  if (Array.isArray(arr)) return normalizeArrangement(arr, song);
  return ids;
}

// Convert a legacy cue-id order into exact section-run entries: consecutive
// slides of one run become ONE block, while a genuine repeat (Verse 1 after
// the chorus) stays a separate block pointing at its own occurrence.
export function orderToFlow(order, song) {
  const runs = songSectionRuns(song);
  const byCueId = new Map();
  for (const run of runs) {
    for (const cue of run.cues) if (cue.id != null) byCueId.set(cue.id, run);
  }
  const flow = [];
  let lastKey = null;
  for (const id of Array.isArray(order) ? order : []) {
    const run = byCueId.get(id);
    if (!run) continue;
    if (run.key === lastKey) continue; // still inside the same section run
    flow.push({ part: run.part, occurrence: run.occurrence });
    lastKey = run.key;
  }
  return flow;
}

// Row subtitle from flow entries alone (no song needed): "V1 · C · V1 · C".
export function summarizeFlow(flow, max = 7) {
  const bits = (Array.isArray(flow) ? flow : []).map((e) => abbrevSection(e?.part));
  if (!bits.length) return '';
  if (bits.length <= max) return bits.join(' · ');
  return bits.slice(0, max).join(' · ') + ` +${bits.length - max}`;
}

// Split long section slides into N-line slides (2–4 for singable projection).
// Pure twin of the editor's Split button MINUS the canvas box refit (that
// needs the live measurer): chunks keep the source slide's box, which always
// renders correctly, just less tightly packed. New chunks carry NO id —
// saveSong re-inserts cues wholesale, so ids are reborn on save.
export function splitCuesToLineChunks(cues, n) {
  const per = Math.max(1, Math.floor(Number(n) || 4));
  const baseOf = (label) => (label || '').replace(/\s*\(Part\s+\d+\)\s*$/i, '').trim() || 'Verse 1';
  const out = [];
  for (const cue of cues || []) {
    const baseLabel = baseOf(cue?.label);
    const lines = String(cue?.text || '').split('\n').filter((l) => l.trim() !== '');
    if (lines.length <= per) {
      const { id: _drop, ...rest } = cue || {};
      out.push({ ...rest, label: baseLabel });
      continue;
    }
    for (let i = 0; i < lines.length; i += per) {
      const part = Math.floor(i / per) + 1;
      const { id: _drop, ...rest } = cue;
      out.push({ ...rest, label: `${baseLabel} (Part ${part})`, text: lines.slice(i, i + per).join('\n') });
    }
  }
  return out;
}

// Short badge label for a section: "Verse 1" -> "V1", "Chorus" -> "C",
// "Chorus (Part 2)" -> "C2", "Bridge" -> "B", "Pre-Chorus" -> "Pre".
// Unknown headers fall back to the base label itself (truncated).
export function abbrevSection(label) {
  // Note: basePartLabel strips " (Part N)", so grab the part number from the
  // RAW label first — otherwise Part 1 vs Part 2 both read "C".
  const p = (String(label || '').match(/\(Part\s+(\d+)\)\s*$/i) || [])[1] || '';
  const base = basePartLabel(label);
  const m = base.match(/^(verse|chorus|bridge|pre[-\s]?chorus|intro|outro|ending|instrumental|interlude|tag|refrain|turn|vamp)\s*(\d*)/i);
  if (!m) return base.length > 8 ? base.slice(0, 8) + '…' : base || '•';
  const word = m[1].toLowerCase().replace(/[-\s]/g, '');
  const n = m[2] || '';
  switch (word) {
    case 'verse': return 'V' + (n || p || '');
    case 'chorus': return 'C' + (n || p);
    case 'bridge': return 'B' + (n || p || '');
    case 'prechorus': return 'Pre' + (n || '');
    case 'intro': return 'Intro';
    case 'outro': return 'Outro';
    case 'ending': return 'End';
    case 'instrumental': return 'Inst';
    case 'interlude': return 'Inter';
    case 'tag': return 'Tag';
    case 'refrain': return 'R' + (n || '');
    case 'turn': return 'Turn';
    case 'vamp': return 'Vamp';
    default: return base;
  }
}

// Row subtitle: "V1 · C · V2 · C · B · C +2" — capped so a 40-slide flow
// doesn't blow out the service row.
export function summarizeArrangement(order, song, max = 7) {
  const byId = new Map((song?.cues || []).map((c) => [c.id, c]));
  const cues = normalizeArrangement(order, song).map((id) => byId.get(id)).filter(Boolean);
  if (!cues.length) return '';
  const bits = cues.map((c) => abbrevSection(c.label));
  if (bits.length <= max) return bits.join(' · ');
  return bits.slice(0, max).join(' · ') + ` +${bits.length - max}`;
}
