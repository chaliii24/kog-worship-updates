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
const occurrenceOf = (entry) => (Number.isInteger(entry?.occurrence) && entry.occurrence > 0 ? entry.occurrence : 1);

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

// SONG-LEVEL SEQUENCE — the song editor's Sequence tab stores an ordered list
// of SECTION LABELS on the song itself (songs.arrangement_json). Unlike a
// service-row arrangement it belongs to the song, so it has to resolve here
// too or the wall would keep playing library order.
//
// Same run rule as songSectionRuns, and the same label normalization the editor
// uses ("Chorus (Part 2)" and "Verse 1a" fold onto their section): the Nth
// mention of a section plays the Nth RUN of it, so V1 · C · V1 repeats the two
// real verse runs instead of expanding every verse twice. A label that no
// longer exists is skipped, never fatal. No sequence → [] so callers fall back
// to the song's own cue order.
const normSection = (label) => String(label == null ? '' : label)
  .replace(/\s*\(Part\s+\d+\)\s*$/i, '')
  .replace(/(?<=[\s0-9])[A-Za-z]$/, '')
  .trim()
  .toLowerCase();

export function songSequenceCues(song) {
  const raw = Array.isArray(song?.arrangement) ? song.arrangement : [];
  if (!raw.length) return [];
  // New shape: the song stores the SAME {part, occurrence} flow the row
  // arrangements store, so "Chorus #2" is an explicit block instead of the
  // Nth mention of a label. Resolve it through the real section runs.
  if (raw.some((e) => e && typeof e === 'object')) {
    // Walk in FLOW order, not run order: a sequence that plays the chorus
    // before the first verse must not come back sorted by the library.
    const byRun = new Map();
    for (const run of songSectionRuns(song)) {
      const k = normPart(run.part);
      if (!byRun.has(k)) byRun.set(k, []);
      byRun.get(k).push(run);
    }
    const ordered = [];
    for (const e of raw) {
      const list = byRun.get(normPart(e?.part));
      if (!list || !list.length) continue;
      const idx = Math.max(0, Math.min(occurrenceOf(e) - 1, list.length - 1));
      ordered.push(...list[idx].cues);
    }
    return ordered;
  }
  const labels = raw;
  const runs = [];
  for (const cue of song?.cues || []) {
    const k = normSection(cue?.label);
    const last = runs[runs.length - 1];
    if (last && last.k === k) last.cues.push(cue);
    else runs.push({ k, cues: [cue] });
  }
  if (!runs.length) return [];
  const byPart = new Map();
  for (const run of runs) {
    if (!byPart.has(run.k)) byPart.set(run.k, []);
    byPart.get(run.k).push(run);
  }
  const used = new Map();
  const out = [];
  for (const label of labels) {
    const k = normSection(label);
    const list = byPart.get(k);
    if (!list || !list.length) continue;
    const n = used.get(k) || 0;
    used.set(k, n + 1);
    out.push(...list[Math.min(n, list.length - 1)].cues);
  }
  return out;
}

// The slides a song plays, sequence first, library cue order as the fallback.
// Every surface that lists or counts a song's slides goes through this so the
// tiles, the totals and the wall can never disagree.
export function songFlowCues(song) {
  const own = songSequenceCues(song);
  return own.length ? own : (song?.cues || []);
}

// The song editor's Sequence tab as a section flow — the same shape the
// arrangement modal edits and saves ("starting from the song's own order").
// Nth mention of a section resolves to the Nth run of it, exactly like
// songSequenceCues, so a label list becomes occurrence-exact blocks.
export function sequenceToFlow(song) {
  const raw = Array.isArray(song?.arrangement) ? song.arrangement : [];
  if (!raw.length) return [];
  // Already a flow (the shape the editor writes now): validate it against the
  // song as it is today and keep the stored order + occurrence.
  if (raw.some((e) => e && typeof e === 'object')) {
    const runs = songSectionRuns(song);
    const byPart = new Map();
    for (const run of runs) {
      const k = normPart(run.part);
      if (!byPart.has(k)) byPart.set(k, []);
      byPart.get(k).push(run);
    }
    const out = [];
    for (const e of raw) {
      const part = String(e?.part || '').trim();
      if (!part) continue;
      const list = byPart.get(normPart(part));
      if (!list || !list.length) continue; // section gone from the song
      const run = list[Math.max(0, Math.min(occurrenceOf(e) - 1, list.length - 1))];
      out.push({ part: run.part, occurrence: run.occurrence });
    }
    return out;
  }
  const labels = raw;
  const runs = songSectionRuns(song);
  if (!runs.length) return [];
  const byPart = new Map();
  for (const run of runs) {
    const k = normPart(run.part);
    if (!byPart.has(k)) byPart.set(k, []);
    byPart.get(k).push(run);
  }
  const used = new Map();
  const out = [];
  for (const label of labels) {
    const k = normSection(label);
    const list = byPart.get(k);
    if (!list || !list.length) continue;
    const n = used.get(k) || 0;
    used.set(k, n + 1);
    const run = list[Math.min(n, list.length - 1)];
    out.push({ part: run.part, occurrence: run.occurrence });
  }
  return out;
}

// Cue ids of the song's own sequence — what flattenMedley wants for a song
// that carries a custom order into a medley.
export function songSequenceIds(song) {
  return songSequenceCues(song).map((c) => c.id).filter((id) => id != null);
}

// How many slides this song puts on the wall: its title card plus every slide
// in its own sequence, or the plain cue list when no sequence is saved. Every
// counter (service row, builder totals, plan readouts) must go through this —
// counting `cues.length` made a sequenced song read short by the repeats the
// operator added, and the two numbers then disagreed about the same song.
export function songSlideTotal(song) {
  if (!song) return 0;
  return songFlowCues(song).length + 1;
}

// The slides a song plays under a SPECIFIC saved arrangement (a service row's,
// or a Shows-builder item's), title card excluded. Without one it is the
// song's own order. Tiles, counters and Go all go through these two so the
// builder can never preview one order and play another.
const hasArrangement = (arr) => !!(arr && ((Array.isArray(arr.flow) && arr.flow.length) || (Array.isArray(arr.order) && arr.order.length)));

export function arrangedSongCues(song, arr) {
  if (!song) return [];
  if (!hasArrangement(arr)) return songFlowCues(song);
  const byId = new Map((song.cues || []).map((c) => [c.id, c]));
  return resolveArrangementFlow(song, arr).map((id) => byId.get(id)).filter(Boolean);
}

export function arrangedSongSlideTotal(song, arr) {
  if (!song) return 0;
  return arrangedSongCues(song, arr).length + 1;
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

// CANONICAL SECTION ORDER — Intro → Verse → Pre-Chorus → Chorus → …
//
// The filmstrip's section groups and the Quick Jump chips read sections in
// FIRST-APPEARANCE order, so a song whose slides were built out of sequence
// (the New Slide button used to splice at position 0 when the title slide was
// selected) listed Pre-Chorus ABOVE Verse 1 — wrong in both lists even though
// the cues themselves were fine. These two lists now sort by sectionRank;
// this NEVER reorders cues — playback order stays exactly what the operator
// sees in the slide list.
//
// Ranks are spaced by 100 per family so a numbered section ("Verse 10") can't
// cross into the next family, and Pre-Chorus (4xx) sits strictly between Verse
// (1xx) and Chorus (5xx). Anything unrecognised ranks last and keeps its
// first-appearance order (the sorts below are stable).
const SECTION_RANKS = {
  intro: 0,
  verse: 1,
  prechorus: 4,
  chorus: 5,
  refrain: 5, // a refrain is the chorus by another name
  hook: 5,
  postchorus: 6,
  interlude: 6,   // glue sections share the 6xx band with post-chorus:
  instrumental: 6, // they sit between chorus and bridge in a real chart,
  solo: 6,        // and ties fall back to first-appearance order.
  breakdown: 6,
  vamp: 6,
  turnaround: 6,
  link: 6,
  build: 6,
  bridge: 7,
  tag: 8,
  outro: 9,
  end: 9,
  ending: 9,
  coda: 9,
};

export function sectionRank(label) {
  // "Chorus (Part 2)" and "Verse 1a" fold onto their section — the same
  // normalization songSectionRuns and the sequence resolver use.
  const base = basePartLabel(label)
    .replace(/(?<=[\s0-9])[A-Za-z]$/, '')
    .trim()
    .toLowerCase();
  const m = /^(intro|verse|pre[-\s]?chorus|post[-\s]?chorus|chorus|refrain|hook|interlude|instrumental|solo|breakdown|vamp|turnaround|link|build|bridge|tag|outro|end(?:ing)?|coda)\b\s*(\d+)?/.exec(base);
  if (!m) return 1000;
  const fam = SECTION_RANKS[m[1].replace(/[-\s]/g, '')];
  if (fam == null) return 1000;
  const n = m[2] ? parseInt(m[2], 10) : 1;
  return fam * 100 + n;
}

// Sort a list of section labels into canonical song order. Stable: labels
// with the same rank (two "Chorus" chips, or two unknown labels) keep the
// order they were handed in.
export function sortSectionLabels(labels) {
  return labels
    .map((label, i) => ({ label, i }))
    .sort((a, b) => sectionRank(a.label) - sectionRank(b.label) || a.i - b.i)
    .map((x) => x.label);
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
