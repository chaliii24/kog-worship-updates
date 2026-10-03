// Song Arrangements — per-service custom play order for ONE song.
//
// A song's library order is fixed, but Sunday's flow rarely is (V1 C V2 C B
// C C). An arrangement is just an ordered list of cue ids, stored on the
// SERVICE ROW (item.meta.arrangement) so the library song is never touched
// and two rows can play the same song differently. Repeats are the point —
// the same cue id may appear several times. Pure functions only.

import { basePartLabel } from './medley';

// Library order: every cue once, top to bottom.
export function defaultArrangement(song) {
  return (song?.cues || []).map((c) => c.id).filter((id) => id != null);
}

// Reconcile a saved order with the song as it exists NOW: keep stored ids
// that still exist (in stored order), drop deleted slides, and append brand
// new slides at the end (so a verse added in the editor still plays instead
// of vanishing from the flow without a word).
export function normalizeArrangement(order, song) {
  const cues = song?.cues || [];
  const have = new Set(cues.map((c) => c.id));
  const kept = (Array.isArray(order) ? order : []).filter((id) => have.has(id));
  const seen = new Set(kept);
  for (const c of cues) {
    if (!seen.has(c.id)) {
      kept.push(c.id);
      seen.add(c.id);
    }
  }
  return kept;
}

// Resolve ANY saved arrangement shape to a cue-id play order:
//   * { flow: [{part}] } (v2, section blocks) → each section's cues in song
//     order, concatenated — repeats are just repeated entries;
//   * { order: [ids] } (v1, per-slide rows) → normalized legacy;
//   * raw [ids] array → legacy (defensive).
// Empty/missing falls back to library order. New slides always append.
export function resolveArrangementFlow(song, arr) {
  const cues = song?.cues || [];
  const ids = cues.map((c) => c.id).filter((id) => id != null);
  if (arr && Array.isArray(arr.flow)) {
    const out = [];
    for (const e of arr.flow) {
      const base = String(e?.part || '').toLowerCase();
      for (const c of cues) {
        if (basePartLabel(c.label).toLowerCase() === base) out.push(c.id);
      }
    }
    return out.length ? out : ids;
  }
  if (arr && Array.isArray(arr.order) && arr.order.length) return normalizeArrangement(arr.order, song);
  if (Array.isArray(arr)) return normalizeArrangement(arr, song);
  return ids;
}

// Convert a legacy cue-id order into section flow entries (for the v2
// editor): consecutive slides of one section become ONE block. A lone slide
// widens to its whole section on save — the editor preview shows the honest
// result before anything is stored.
export function orderToFlow(order, song) {
  const byId = new Map((song?.cues || []).map((c) => [c.id, c]));
  const flow = [];
  for (const id of Array.isArray(order) ? order : []) {
    const cue = byId.get(id);
    if (!cue) continue;
    const part = basePartLabel(cue.label);
    const last = flow[flow.length - 1];
    if (last && last.part.toLowerCase() === part.toLowerCase()) continue;
    flow.push({ part });
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
  const cues = arrangementCues(order, song);
  if (!cues.length) return '';
  const bits = cues.map((c) => abbrevSection(c.label));
  if (bits.length <= max) return bits.join(' · ');
  return bits.slice(0, max).join(' · ') + ` +${bits.length - max}`;
}
