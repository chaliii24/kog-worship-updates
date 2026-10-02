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
  if (includedParts.includes('ALL')) return true;
  const base = basePartLabel(cue.label).toLowerCase();
  return includedParts.some((p) => String(p).toLowerCase() === base);
}

function titleSlide(songId, song) {
  const titleCue = song?.title_cue || {
    id: 'title-card',
    label: 'Song Title',
    text: song?.title || '',
  };
  return { kind: 'title', songId, cue: { ...titleCue, id: medleyTitleId(songId) } };
}

// Flatten a medley into ONE array of slides, in performance order:
// anchor title + anchor parts, then per link (title unless skipped + parts).
// Missing songs, empty lyrics and fully-filtered songs contribute nothing —
// a link that yields zero slides vanishes instead of breaking the flow.
//
// Song lookup is shape-tolerant (numeric 42, "42", even legacy "42.0" refs
// all hit): service rows round-trip through a TEXT column, so exact-key
// matching silently dropped whole songs from the flow.
export function flattenMedley(def, songsById) {
  if (!def) return [];
  const get = (id) => {
    if (songsById == null || id == null) return null;
    if (songsById instanceof Map) {
      return songsById.get(id) ?? songsById.get(String(id)) ?? songsById.get(Number(id)) ?? null;
    }
    return songsById[id] ?? songsById[String(id)] ?? null;
  };
  const slides = [];
  const pushSong = (songId, includedParts, skipTitle) => {
    const song = get(songId);
    if (!song) return;
    const cues = (song.cues || []).filter((c) => cueIncluded(c, includedParts));
    if (!skipTitle) slides.push(titleSlide(songId, song));
    else if (cues.length === 0) return; // nothing to show, drop the song
    for (const cue of cues) slides.push({ kind: 'cue', songId, cue });
  };
  pushSong(def.anchor.songId, def.anchor.includedParts, false);
  for (const link of def.links) pushSong(link.songId, link.includedParts, link.skipTitleSlide);
  return slides;
}
