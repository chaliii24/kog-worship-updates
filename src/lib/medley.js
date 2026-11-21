// Medley Builder (Continuous Flow Mode) — slide flattener utility.
//
// A medley links stanzas of secondary songs to the end of an anchor song so
// slides flow continuously (anchor → link 1 → link 2 …) with no secondary
// title slides in between. Pure functions only: no React, no IPC, no DB —
// the caller loads song records (see getSongDetailsMany in database.js) and
// hands them in.
//
// Medley definition (stored as JSON in a service item's `content`):
//   {
//     anchor: { songId, includedParts: ['ALL'] },
//     links: [{ songId, includedParts: ['Chorus', 'Bridge'], skipTitleSlide: true }]
//   }
//
// A "slide" here is { kind: 'title'|'cue', songId, cue } — the caller fires
// titles through its title path and cues through its lyric path. Title cues
// get synthetic ids (`medley-title-<songId>`) so back-to-back songs never
// collide on the shared 'title-card' id.

export const medleyTitleId = (songId) => `medley-title-${songId}`;

// Base section name: "Chorus (Part 2)" → "Chorus". Part matching is by base
// name, so includedParts: ["Chorus"] takes every part of the chorus.
export const basePartLabel = (label) =>
  String(label || '').replace(/\s*\(Part\s+\d+\)\s*$/i, '').trim();

// THE one section identity in the app. It folds the "(Part N)" chunk suffix
// (basePartLabel) AND the trailing letter the editor's own grouping already
// treats as part of the same section ("Verse 1a" ≡ "Verse 1"), then lowercases.
//
// Playback, the arrangement editor and the medley part filters must all match
// on this key. They used to fold different things: a song labelled "Verse 1a"
// played correctly but vanished from sequenceToFlow, and a stored block saying
// "Verse 1" silently disappeared once the operator renamed the slide "Verse 1a".
export const sectionKey = (label) =>
  basePartLabel(label)
    .replace(/(?<=[\s0-9])[A-Za-z]$/, '')
    .trim()
    .toLowerCase();

// Parse + validate a medley definition from a service item. Returns null for
// anything that is not a usable medley (bad JSON, no anchor, no links).
export function parseMedleyDef(item) {
  let def = null;
  try {
    const raw = typeof item?.content === 'string' ? item.content : '';
    if (!raw) return null;
    def = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!def || typeof def !== 'object') return null;
  const anchorSongId = def?.anchor?.songId;
  if (anchorSongId == null) return null;
  const links = Array.isArray(def.links) ? def.links.filter((l) => l && l.songId != null) : [];
  return {
    anchor: { songId: anchorSongId, includedParts: normalizeParts(def?.anchor?.includedParts) },
    links: links.map((l) => ({
      songId: l.songId,
      includedParts: normalizeParts(l.includedParts),
      skipTitleSlide: l.skipTitleSlide !== false,
    })),
  };
}

function normalizeParts(parts) {
  if (!Array.isArray(parts) || parts.length === 0) return ['ALL'];
  const cleaned = parts.map((p) => String(p || '').trim()).filter(Boolean);
  return cleaned.length ? cleaned : ['ALL'];
}

// Every song id referenced by the medley (anchor first). Used for batch
// loading and for live-row matching.
export function medleySongIds(def) {
  if (!def) return [];
  return [def.anchor.songId, ...def.links.map((l) => l.songId)];
}

// Distinct section (base) labels of a song, in first-appearance order —
// what the Link Song modal offers as checkboxes.
export function songSections(song) {
  const seen = [];
  for (const cue of song?.cues || []) {
    const base = basePartLabel(cue?.label);
    if (base && !seen.includes(base)) seen.push(base);
  }
  return seen;
}

// Does this cue belong to one of the included parts? 'ALL' takes everything;
// otherwise the cue's BASE label must equal one of the parts (case-insensitive).
function cueIncluded(cue, includedParts) {
  if (!cue) return false;
  const parts = Array.isArray(includedParts) ? includedParts : ['ALL'];
  if (parts.some((p) => String(p || '').trim().toUpperCase() === 'ALL')) return true;
  const key = sectionKey(cue.label);
  return parts.some((p) => sectionKey(p) === key);
}

function titleSlide(songId, song) {
  const titleCue = song?.title_cue || {
    id: 'title-card',
    label: 'Song Title',
    text: song?.title || '',
  };
  return { kind: 'title', songId, cue: { ...titleCue, id: medleyTitleId(songId) } };
}

// Where the live slide sits in a flattened flow. `sessionIndex` is
// AUTHORITATIVE for repeated slides: one cue id can appear more than once in a
// flow (an arranged repeat, the same section linked twice), and a bare
// findIndex would send Next back to the FIRST occurrence — the flow appeared
// to jump backwards and then loop. The index is trusted only while the slide
// it points at is still the live one; otherwise identity wins (the operator
// jumped elsewhere and the session is over).
export function medleyIndexOf(slides, cueId, sessionIndex) {
  const list = Array.isArray(slides) ? slides : [];
  if (cueId == null) return -1;
  const isLive = (s) => !!s && (s.cue ? s.cue.id : medleyTitleId(s.songId)) === cueId;
  if (Number.isInteger(sessionIndex) && list[sessionIndex] && isLive(list[sessionIndex])) return sessionIndex;
  return list.findIndex(isLive);
}

// Flatten a medley into ONE array of slides, in performance order:
// anchor title + anchor parts, then per link (title unless skipped + parts).
// Missing songs, empty lyrics and fully-filtered songs contribute nothing —
// a link that yields zero slides vanishes instead of breaking the flow.
//
// UNIFIED with arrangements (see lib/arrangement.js): each participant can
// carry its own play order, applied BEFORE the part filter —
//   * ordersBySong[songId] (a cue-id list, from the row's arrangement)
//     reorders that song's cues, new slides appended (never dropped);
//   * otherwise a link's picked parts play in PICK order (the modal's tick
//     sequence), each part in song order within itself — the ProPresenter
//     "groups in sequence" semantic. ['ALL'] keeps library order.
// Song lookup is shape-tolerant (numeric 42, "42", even legacy "42.0" refs
// all hit): service rows round-trip through a TEXT column, so exact-key
// matching silently dropped whole songs from the flow.
export function flattenMedley(def, songsById, ordersBySong) {
  if (!def || !def.anchor) return [];
  const get = (id) => {
    if (songsById == null || id == null) return null;
    if (songsById instanceof Map) {
      return songsById.get(id) ?? songsById.get(String(id)) ?? songsById.get(Number(id)) ?? null;
    }
    return songsById[id] ?? songsById[String(id)] ?? null;
  };
  const orderOf = (songId) => {
    if (!ordersBySong) return null;
    const o = ordersBySong instanceof Map
      ? (ordersBySong.get(songId) ?? ordersBySong.get(String(songId)) ?? null)
      : (ordersBySong[songId] ?? ordersBySong[String(songId)] ?? null);
    return Array.isArray(o) && o.length ? o : null;
  };
  const slides = [];
  const pushSong = (songId, includedPartsRaw, skipTitle, partOrderRaw) => {
    const song = get(songId);
    if (!song) return;
    // Defensive: a def built by hand (or stored before includedParts existed)
    // must behave as ALL rather than crash the whole flow on .includes().
    const includedParts = Array.isArray(includedPartsRaw) && includedPartsRaw.length ? includedPartsRaw : ['ALL'];
    const partOrder = Array.isArray(partOrderRaw) && partOrderRaw.length ? partOrderRaw : includedParts;
    let cues = (song.cues || []).filter((c) => cueIncluded(c, includedParts));
    const ord = orderOf(songId);
    if (ord) {
      // Row arrangement wins: exact custom cue order, then the part filter.
      // resolveArrangementFlow has already reconciled new/removed sections, so
      // deliberately omitted slides must not be appended back here.
      const byId = new Map(cues.map((c) => [c.id, c]));
      cues = ord.map((id) => byId.get(id)).filter(Boolean);
    } else if (!includedParts.some((p) => String(p || '').trim().toUpperCase() === 'ALL')) {
      // Link part order: picked parts play in tick sequence, song order
      // inside each part. Renamed-since-linking slides still play (appended).
      // Keys go through sectionKey so a part ticked "Verse 1" still catches
      // slides labelled "Verse 1a".
      const want = partOrder.map((p) => sectionKey(p));
      const grouped = [];
      for (const p of want) {
        for (const c of cues) {
          if (sectionKey(c.label) === p && !grouped.includes(c)) grouped.push(c);
        }
      }
      for (const c of cues) if (!grouped.includes(c)) grouped.push(c);
      cues = grouped;
    }
    if (!skipTitle) slides.push(titleSlide(songId, song));
    else if (cues.length === 0) return; // nothing to show, drop the song
    for (const cue of cues) slides.push({ kind: 'cue', songId, cue });
  };
  const anchorParts = Array.isArray(def.anchor.includedParts) && def.anchor.includedParts.length ? def.anchor.includedParts : ['ALL'];
  pushSong(def.anchor.songId, anchorParts, false, anchorParts);
  for (const link of Array.isArray(def.links) ? def.links : []) {
    if (!link || link.songId == null) continue;
    pushSong(link.songId, link.includedParts, link.skipTitleSlide, link.includedParts);
  }
  return slides;
}
