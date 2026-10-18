// CCLI usage reporting — pure logic, no Electron/DB/React imports, so the
// same file runs in the main process (database.js), in the renderer
// (Settings → CCLI Report, for CSV/copy), and in raw-Node tests.
//
// WHY: churches holding a CCLI Copyright License must report which songs they
// sang and how often each reporting period — that is how songwriters get
// paid. Every other presentation app ships this; ours already stores every
// input it needs (dated service plans + the song library), it just never
// closed the loop. The report is generated FROM saved plans, so it never
// relies on the operator remembering what happened four Sundays ago.
//
// WHAT CCLI ACTUALLY WANTS: song title, CCLI song number, and the number of
// times used in the period. Nothing per-use, no dates, no attendance. Songs
// licensed through oneLicense/easySong report to those agencies instead, and
// public domain songs report nowhere — hence the "needs a number" list rather
// than silently dropping songs.

// "CCLI #7116401" · "CCLI 7116401" · "ccli#: 7116401" · "CCLI Song # 7116401"
// (SongSelect printouts use the last form). Anchored to the CCLI keyword so
// lyric lines that merely contain digits can never match. 4–9 digits covers
// legacy 4-digit numbers through modern 7-digit ones.
const CCLI_RE = /\bCCLI\b(?:\s*Song)?\s*#?\s*:?\s*(\d{4,9})\b/i;

/**
 * First CCLI song number in a block of text, or null. Tolerant of the
 * keyword's casing, an optional "Song" word, optional # / colon separators.
 */
export function extractCcli(text) {
  const m = CCLI_RE.exec(String(text || ''));
  return m ? m[1] : null;
}

/**
 * Scan a song's cues in order and return the first CCLI number found, or
 * null. Covers songs whose cue text still carries the site's footer line —
 * the auto-paste parser now drops that line from slides, but libraries built
 * before the rule (or lyrics pasted into a cue by hand) still contain it.
 */
export function extractCcliFromCues(cues) {
  for (const cue of Array.isArray(cues) ? cues : []) {
    const n = extractCcli(cue && cue.text);
    if (n) return n;
  }
  return null;
}

/**
 * Song ids a service item contributes to the report.
 *
 * `service_items.content` for item_type 'song' is EITHER a plain song id
 * ("42" — stored as TEXT, sometimes the legacy float string "42.0") OR a
 * medley definition JSON ({ anchor: { songId }, links: [{ songId }] }).
 * CCLI counts EACH constituent song of a medley once, so expand it here.
 * Anything unparseable contributes nothing (never throws).
 */
export function itemSongIds(item) {
  if (!item || item.item_type !== 'song') return [];
  const raw = String(item.content == null ? '' : item.content).trim();
  if (!raw) return [];
  const out = [];
  if (!raw.startsWith('{')) {
    const n = Number(raw);
    if (Number.isFinite(n)) out.push(Math.trunc(n));
    return out;
  }
  try {
    const def = JSON.parse(raw);
    const ids = [];
    if (def && def.anchor && def.anchor.songId != null) ids.push(def.anchor.songId);
    if (def && Array.isArray(def.links)) {
      for (const l of def.links) if (l && l.songId != null) ids.push(l.songId);
    }
    for (const id of ids) {
      const n = Number(id);
      if (Number.isFinite(n)) out.push(Math.trunc(n));
    }
  } catch (_) { /* not a medley — nothing to add */ }
  return out;
}

// Shape-tolerant song lookup (numeric 42, string "42", legacy "42.0" keys all
// hit) — service rows round-trip through TEXT columns, so exact-key matching
// silently dropped whole songs from medley flows once already.
function songGetter(songsById) {
  if (songsById == null) return () => null;
  if (songsById instanceof Map) {
    return (id) => songsById.get(id) ?? songsById.get(String(id)) ?? songsById.get(Number(id)) ?? null;
  }
  return (id) => songsById[id] ?? songsById[String(id)] ?? null;
}

/**
 * Build the usage report.
 *
 * @param services  [{ id, name, date, items: [service_item rows] }] — ONLY the
 *                  services inside the requested range (the DB layer filters).
 * @param songsById Map or object of songId -> { id, title, ccli }
 * @returns {
 *   rows:    [{ key, ccli, title, times, songIds, services: [{id,date,name}] }],
 *            reportable songs sorted by times desc then title — grouped by
 *            CCLI number, so two arrangements of one song ("Way Maker" and
 *            "Way Maker (Key of D)", same number) merge into one line.
 *   missing: [{ songId, title, times, services: [...] }] — used songs with no
 *            CCLI number on file. Flagged, never silently dropped: the
 *            operator must decide (number? public domain? other agency?).
 *   undated: services in range carrying no usable date string (count only).
 * }
 *
 * COUNTING RULES (the parts that make this trustworthy):
 *  - A song counts ONCE per service even if it appears twice in the plan or
 *    was both standalone and inside a medley. Distinct services, not uses.
 *  - Medley constituents each count once for that service.
 *  - Two songs sharing one CCLI number merge, and a service that sang both
 *    still contributes 1 to the shared line (the per-service key set runs
 *    BEFORE grouping).
 */
export function buildUsageReport(services, songsById) {
  const getSong = songGetter(songsById);
  // ccli key -> { ccli, songIds:Set, songTitles:Set, services:Map(id -> {id,date,name}) }
  const groups = new Map();
  // songId -> { songId, title, services:Map(id -> service) } (no-number songs)
  const orphans = new Map();
  let undated = 0;

  for (const svc of Array.isArray(services) ? services : []) {
    if (!svc) continue;
    const date = String(svc.date || '').trim();
    if (!date) undated += 1;
    // Per-service key set: the same song twice in one plan = one use.
    const keys = new Set();
    const orphanIds = new Set();
    for (const item of Array.isArray(svc.items) ? svc.items : []) {
      for (const songId of itemSongIds(item)) {
        const song = getSong(songId);
        const ccli = song && song.ccli ? String(song.ccli).trim() : '';
        if (ccli) {
          const key = `c:${ccli}`;
          if (keys.has(key)) continue;
          keys.add(key);
          let g = groups.get(key);
          if (!g) { g = { ccli, songIds: new Set(), songTitles: new Set(), services: new Map() }; groups.set(key, g); }
          g.songIds.add(songId);
          g.songTitles.add(String((song && song.title) || '').trim() || '(untitled)');
          g.services.set(String(svc.id), { id: svc.id, date, name: svc.name || '' });
        } else if (!orphanIds.has(songId)) {
          orphanIds.add(songId);
          let o = orphans.get(songId);
          if (!o) { o = { songId, title: String((song && song.title) || '').trim() || '(song deleted from library)', services: new Map() }; orphans.set(songId, o); }
          o.services.set(String(svc.id), { id: svc.id, date, name: svc.name || '' });
        }
      }
    }
  }

  const rows = [...groups.values()].map((g) => ({
    key: `c:${g.ccli}`,
    ccli: g.ccli,
    // Several library rows under one number: show them joined, so "Way Maker ·
    // Way Maker (Key of D)" reads as one reported song, not a mystery merge.
    title: [...g.songTitles].join(' · '),
    times: g.services.size,
    songIds: [...g.songIds],
    services: [...g.services.values()].sort((a, b) => String(b.date).localeCompare(String(a.date))),
  }));
  rows.sort((a, b) => (b.times - a.times) || a.title.localeCompare(b.title));

  const missing = [...orphans.values()].map((o) => ({
    songId: o.songId,
    title: o.title,
    times: o.services.size,
    services: [...o.services.values()].sort((a, b) => String(b.date).localeCompare(String(a.date))),
  }));
  missing.sort((a, b) => (b.times - a.times) || a.title.localeCompare(b.title));

  return { rows, missing, undated };
}

// RFC-4180 quoting: titles contain commas and quotes often enough ("How Great
// Is Our God", 'Shout to the Lord') that a naive join corrupts the file the
// church pastes into CCLI's form.
function csvCell(v) {
  const s = String(v == null ? '' : v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/**
 * The paste-ready CSV: exactly CCLI's three columns, reportable rows first,
 * then manual extras (songs sung outside the saved plan) as `extraRows`.
 * Manual rows keep a "(manual)" marker in the title so a re-count against
 * the plans stays auditable.
 */
export function reportToCsv(report, extraRows = []) {
  const lines = ['Song,CCLI Song #,Times Used'];
  for (const r of (report && report.rows) || []) {
    lines.push([csvCell(r.title), csvCell(r.ccli), csvCell(r.times)].join(','));
  }
  for (const m of (report && report.missing) || []) {
    lines.push([csvCell(m.title), '', csvCell(m.times)].join(','));
  }
  for (const e of Array.isArray(extraRows) ? extraRows : []) {
    if (!e) continue;
    const title = String(e.title || '').trim();
    if (!title) continue;
    const times = Math.max(1, Math.floor(Number(e.times) || 1));
    lines.push([csvCell(`${title} (manual)`), csvCell(String(e.ccli || '').trim()), csvCell(times)].join(','));
  }
  return lines.join('\n');
}
