import Database from 'better-sqlite3';
import path from 'path';
import { app } from 'electron';
import fs from 'fs';
import { extractCcliFromCues, buildUsageReport, itemSongIds } from './ccliReport.js';

const dbPath = path.join(app.getPath('userData'), 'kog-worship.db');
let db;
try {
  db = new Database(dbPath);
} catch (firstErr) {
  // A torn write (power loss mid-save) leaves SQLITE_CORRUPT / SQLITE_NOTADB,
  // which used to kill the whole app at import time before any window exists.
  // Quarantine the corpse for manual recovery and start a fresh library.
  try {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    fs.renameSync(dbPath, `${dbPath}.corrupt-${stamp}`);
  } catch {}
  db = new Database(dbPath);
}
// WAL + busy timeout: readers (thumbnail sweeps, monitor) never block the
// writer for long, and concurrent opens wait instead of SQLITE_BUSY-failing.
try { db.pragma('journal_mode = WAL'); } catch (_) {}
try { db.pragma('busy_timeout = 5000'); } catch (_) {}

// Initialize Database Tables
db.exec(`
  CREATE TABLE IF NOT EXISTS songs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    artist TEXT,
    category TEXT DEFAULT 'Worship',
    is_favorite INTEGER DEFAULT 0,
    last_used DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS cues (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    song_id INTEGER,
    label TEXT NOT NULL, -- Verse, Chorus, Bridge, Intro, Ending
    text TEXT NOT NULL,
    sequence_order INTEGER,
    bg_type TEXT DEFAULT 'color',
    bg_value TEXT DEFAULT '#000000',
    duration INTEGER DEFAULT 0,
    FOREIGN KEY(song_id) REFERENCES songs(id) ON DELETE CASCADE
  );

  -- song_id lookups: the lyric search runs this per candidate song, and every
  -- load/save path already queries cues by song. Without it each of those is a
  -- full scan of the table.
  CREATE INDEX IF NOT EXISTS idx_cues_song_id ON cues(song_id);

  CREATE TABLE IF NOT EXISTS services (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    date TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS service_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    service_id INTEGER,
    item_type TEXT NOT NULL, -- 'song', 'section_header', 'custom_slide', 'media'
    title TEXT NOT NULL,
    subtitle TEXT,
    content TEXT, -- JSON payload or text blocks / song_id reference
    sort_order INTEGER,
    duration INTEGER DEFAULT 0,
    media_url TEXT,
    media_type TEXT DEFAULT 'image',
    extra_json TEXT, -- { style, meta }: scripture layout + Bible passage reference
    FOREIGN KEY(service_id) REFERENCES services(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS templates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    items_json TEXT
  );

  CREATE TABLE IF NOT EXISTS media_assets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    url TEXT NOT NULL UNIQUE,
    kind TEXT NOT NULL DEFAULT 'image',
    name TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS presentations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    data_json TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

// Safe migration for existing databases that predate cue backgrounds
try { db.exec(`ALTER TABLE cues ADD COLUMN bg_type TEXT DEFAULT 'color';`); } catch (_) {}
try { db.exec(`ALTER TABLE cues ADD COLUMN bg_value TEXT DEFAULT '#000000';`); } catch (_) {}
try { db.exec(`ALTER TABLE cues ADD COLUMN duration INTEGER DEFAULT 0;`); } catch (_) {}
try { db.exec(`ALTER TABLE service_items ADD COLUMN duration INTEGER DEFAULT 0;`); } catch (_) {}
try { db.exec(`ALTER TABLE service_items ADD COLUMN media_url TEXT;`); } catch (_) {}
try { db.exec(`ALTER TABLE service_items ADD COLUMN media_type TEXT DEFAULT 'image';`); } catch (_) {}
try { db.exec(`ALTER TABLE service_items ADD COLUMN extra_json TEXT;`); } catch (_) {}
// Song-level background so a background set on one song applies to ALL of its slides
try { db.exec(`ALTER TABLE songs ADD COLUMN bg_type TEXT DEFAULT 'color';`); } catch (_) {}
try { db.exec(`ALTER TABLE songs ADD COLUMN bg_value TEXT DEFAULT '#000000';`); } catch (_) {}
// Per-song background audio (media:// or remote URL)
try { db.exec(`ALTER TABLE songs ADD COLUMN audio_url TEXT;`); } catch (_) {}
// Show-level metadata (FreeShow-style): category, output aspect ratio, resolution
try { db.exec(`ALTER TABLE services ADD COLUMN category TEXT DEFAULT 'Worship';`); } catch (_) {}
try { db.exec(`ALTER TABLE services ADD COLUMN ratio TEXT DEFAULT '16:9';`); } catch (_) {}
try { db.exec(`ALTER TABLE services ADD COLUMN resolution TEXT DEFAULT '1920x1080';`); } catch (_) {}
// Per-cue style (box position/scale, font, size, color, align, animation, ...)
// stored as JSON so editor adjustments survive save/reload.
try { db.exec(`ALTER TABLE cues ADD COLUMN style_json TEXT;`); } catch (_) {}
// MEDIA METADATA CACHE. A media tile must never have to open the file to know
// what it is: the background pipeline (electron/main.js) writes the poster it
// extracted and the dimensions/duration it probed here, so a grid of 300 clips
// is one SELECT and 300 small JPEGs. Columns are added with swallowed errors so
// an existing library needs no migration step — NULL simply means "not probed".
try { db.exec(`ALTER TABLE media_assets ADD COLUMN thumb TEXT;`); } catch (_) {}
try { db.exec(`ALTER TABLE media_assets ADD COLUMN width INTEGER;`); } catch (_) {}
try { db.exec(`ALTER TABLE media_assets ADD COLUMN height INTEGER;`); } catch (_) {}
try { db.exec(`ALTER TABLE media_assets ADD COLUMN duration REAL;`); } catch (_) {}
try { db.exec(`CREATE INDEX IF NOT EXISTS idx_media_assets_created ON media_assets (created_at DESC);`); } catch (_) {}
// EXTERNAL SOURCE + RECENCY. Library entries no longer copy bytes into
// userData: source_path is the operator's own file on their disk, and
// last_used_at is what the Media tab and every picker sort by, so the list
// answers "what did I just use?" instead of "what did I upload?" Both are
// added with swallowed errors so an existing library needs no migration.
try { db.exec(`ALTER TABLE media_assets ADD COLUMN source_path TEXT;`); } catch (_) {}
try { db.exec(`ALTER TABLE media_assets ADD COLUMN last_used_at DATETIME;`); } catch (_) {}
try { db.exec(`CREATE INDEX IF NOT EXISTS idx_media_assets_used ON media_assets (last_used_at DESC);`); } catch (_) {}
// SOURCE HEALTH. An external reference can move, be renamed, or sit on a drive
// that is not plugged in, and the tile used to render black with no clue why.
// `missing_at` records the last audit that could NOT find the file, so every
// surface can say "source missing" and offer a relink; it clears itself the
// moment an audit finds the file again.
try { db.exec(`ALTER TABLE media_assets ADD COLUMN missing_at DATETIME;`); } catch (_) {}
// A file picked twice must resolve to the one row that already references it,
// whatever its URL happens to look like (relinked paths keep their old URL).
try { db.exec(`CREATE INDEX IF NOT EXISTS idx_media_assets_source ON media_assets (source_path);`); } catch (_) {}
// Editable title slide (box, font, size, color, ...) stored on the song.
try { db.exec(`ALTER TABLE songs ADD COLUMN title_cue_json TEXT;`); } catch (_) {}
// Stage chord chart: raw chart text + the key it is WRITTEN in. The Stage tab
// transposes it live to the band's play key (or Nashville numbers) without
// touching the stored chart. `SELECT *` flows both columns through everywhere.
try { db.exec(`ALTER TABLE songs ADD COLUMN chord_chart TEXT;`); } catch (_) {}
try { db.exec(`ALTER TABLE songs ADD COLUMN chord_key TEXT DEFAULT 'C';`); } catch (_) {}
// CCLI song number — drives the usage report (Settings → CCLI Report). NULL
// means "not on file": the report flags the song rather than guessing.
try { db.exec(`ALTER TABLE songs ADD COLUMN ccli TEXT;`); } catch (_) {}
// Per-song custom sequence: an ordered list of SECTION LABELS
// (["Verse 1","Chorus","Verse 1"]). The song editor's Sequence tab writes
// here and never reorders `cues`, so a configured flow survives save/reopen
// while the slides keep their own order in the filmstrip.
try { db.exec(`ALTER TABLE songs ADD COLUMN arrangement_json TEXT;`); } catch (_) {}
// Per-song tempo for the stage metronome + phone drummer view. NULL = unset
// (falls back to the stage config tempo). Saved only through the narrow
// setSongBpm IPC — song-editor saves never touch it.
try { db.exec(`ALTER TABLE songs ADD COLUMN bpm INTEGER;`); } catch (_) {}
// Heal float-string song refs ("42.0" for song 42) left by older writes.
// Readers tolerate them now (sameSongId), but clean rows keep every fast path
// working; non-numeric refs (future UUIDs) are never touched.
try {
  const rows = db.prepare("SELECT id, content FROM service_items WHERE item_type = 'song'").all();
  const fix = db.prepare('UPDATE service_items SET content = ? WHERE id = ?');
  const heal = db.transaction(() => {
    for (const r of rows) {
      if (r.content == null || String(r.content).trim() === '') continue;
      const n = Number(r.content);
      if (!Number.isInteger(n)) continue;
      if (String(r.content) !== String(n)) fix.run(String(n), r.id);
    }
  });
  heal();
} catch (_) {}

// One-time CCLI backfill: libraries built before the number had a home still
// carry "CCLI #7116401" inside cue text (lyrics pasted from SongSelect and
// friends keep the footer). Lift the number onto songs.ccli ONCE, and only
// where it is still NULL — the moment an operator edits the field by hand
// their value is authoritative and is never re-scanned over. Songs parsed by
// the current auto-paste drop the footer line from slides, so saveSong
// extracts at save time; this migration covers everything that predates it.
try {
  const need = db.prepare('SELECT id FROM songs WHERE ccli IS NULL OR ccli = \'\'').all();
  if (need.length) {
    const cuesOf = db.prepare('SELECT text FROM cues WHERE song_id = ? ORDER BY sequence_order ASC');
    const stamp = db.prepare('UPDATE songs SET ccli = ? WHERE id = ?');
    const backfill = db.transaction(() => {
      for (const s of need) {
        const n = extractCcliFromCues(cuesOf.all(s.id));
        if (n) stamp.run(n, s.id);
      }
    });
    backfill();
  }
} catch (_) {}

const safeParse = (raw) => { try { return raw ? JSON.parse(raw) : null; } catch (_) { return null; } };
// Cue columns that live in their own columns; everything else belongs in style_json.
const CUE_COLUMN_KEYS = ['id', 'song_id', 'label', 'text', 'sequence_order', 'bg_type', 'bg_value', 'duration'];
const cueStyleJson = (cue) => {
  if (!cue) return null;
  const style = {};
  for (const k of Object.keys(cue)) {
    if (!CUE_COLUMN_KEYS.includes(k) && cue[k] !== undefined) style[k] = cue[k];
  }
  return Object.keys(style).length ? JSON.stringify(style) : null;
};

// Seed default data if table is empty
const songCount = db.prepare('SELECT COUNT(*) as count FROM songs').get().count;
if (songCount === 0) {
  const insertSong = db.prepare('INSERT INTO songs (title, artist, category, is_favorite) VALUES (?, ?, ?, ?)');
  const insertCue = db.prepare('INSERT INTO cues (song_id, label, text, sequence_order) VALUES (?, ?, ?, ?)');

  const s1 = insertSong.run('Great Is Thy Faithfulness', 'Thomas Chisholm', 'Hymn', 1).lastInsertRowid;
  insertCue.run(s1, 'Verse 1', "Great is Thy faithfulness,\nO God my Father,\nThere is no shadow\nof turning with Thee;", 1);
  insertCue.run(s1, 'Chorus', "Great is Thy faithfulness!\nGreat is Thy faithfulness!\nMorning by morning\nnew mercies I see.", 2);

  const s2 = insertSong.run('Way Maker', 'Sinach', 'Praise', 1).lastInsertRowid;
  insertCue.run(s2, 'Verse 1', "You are here, moving in our midst\nI worship You, I worship You", 1);
  insertCue.run(s2, 'Chorus', "Way Maker, Miracle Worker,\nPromise Keeper\nLight in the darkness,\nmy God, that is who You are.", 2);
}

export function getSongs(searchQuery = '', category = 'All') {
  // A literal % or _ in the query used to act as a wildcard (over-matching);
  // escape it so search means what the operator typed.
  const q = String(searchQuery || '').replace(/[\\%_]/g, (c) => `\\${c}`);
  const esc = `%${q}%`;
  // LYRIC SEARCH: the operator far more often remembers "that chorus" than the
  // title, so the match also runs over every cue's text. Skipped when the box
  // is empty — `%%` would match every song and force a cues scan for nothing.
  let query = 'SELECT * FROM songs WHERE (title LIKE ? ESCAPE \'\\\' OR artist LIKE ? ESCAPE \'\\\'';
  let params = [esc, esc];
  if (q) {
    query += ' OR EXISTS (SELECT 1 FROM cues WHERE song_id = songs.id AND text LIKE ? ESCAPE \'\\\')';
    params.push(esc);
  }
  query += ')';

  if (category === 'Favorites') {
    query += ' AND is_favorite = 1';
  } else if (category === 'Recent') {
    query += ' ORDER BY last_used DESC LIMIT 10';
    return db.prepare(query).all(params);
  } else if (category !== 'All') {
    query += ' AND category = ?';
    params.push(category);
  }

  query += ' ORDER BY title ASC';
  return db.prepare(query).all(params);
}

// The library's chip row: every category actually present in the table. Its own
// IPC, because getSongs can only ever return the one category it filtered to —
// which is exactly what made the chips impossible to build before.
export function getCategories() {
  return db.prepare('SELECT DISTINCT category FROM songs WHERE category IS NOT NULL AND category != \'\' ORDER BY category ASC')
    .all()
    .map((r) => r.category);
}

export function getSongDetails(songId) {
  const song = db.prepare('SELECT * FROM songs WHERE id = ?').get(songId);
  if (!song) return null;
  const cues = db.prepare('SELECT * FROM cues WHERE song_id = ? ORDER BY sequence_order ASC').all(songId);
  const { title_cue_json, arrangement_json, ...songRest } = song;
  const parsedCues = cues.map((row) => {
    const { style_json, ...rest } = row;
    return { ...(safeParse(style_json) || {}), ...rest };
  });
  const arrangement = safeParse(arrangement_json);
  return {
    ...songRest,
    title_cue: safeParse(title_cue_json) || undefined,
    arrangement: Array.isArray(arrangement) ? arrangement : undefined,
    cues: parsedCues,
  };
}

// Batch twin of getSongDetails for medleys: ONE songs query + ONE cues query
// for the whole id set (same parse, same shape), instead of N round trips.
export function getSongDetailsMany(ids) {
  const list = [...new Set((Array.isArray(ids) ? ids : []).filter((id) => id != null))];
  if (!list.length) return [];
  const ph = list.map(() => '?').join(',');
  const songs = db.prepare(`SELECT * FROM songs WHERE id IN (${ph})`).all(...list);
  const cueRows = db.prepare(`SELECT * FROM cues WHERE song_id IN (${ph}) ORDER BY song_id ASC, sequence_order ASC`).all(...list);
  const bySong = new Map();
  for (const row of cueRows) {
    const { style_json, ...rest } = row;
    const cue = { ...(safeParse(style_json) || {}), ...rest };
    if (!bySong.has(row.song_id)) bySong.set(row.song_id, []);
    bySong.get(row.song_id).push(cue);
  }
  return songs.map((song) => {
    const { title_cue_json, arrangement_json, ...songRest } = song;
    const arrangement = safeParse(arrangement_json);
    return {
      ...songRest,
      title_cue: safeParse(title_cue_json) || undefined,
      arrangement: Array.isArray(arrangement) ? arrangement : undefined,
      cues: bySong.get(song.id) || [],
    };
  });
}

export function saveSong(songData) {
  const { id, title, artist, category, cues, bg_type, bg_value, audio_url, title_cue, ccli, arrangement } = songData;
  const titleCueJson = title_cue ? JSON.stringify(title_cue) : null;
  // Sequence tab output. Stored verbatim; null when the song has no custom
  // sequence, which is what the editor treats as "follow the slides". Cue
  // order is written from `cues` alone — this never reorders it.
  const arrangementJson = arrangementToJson(arrangement);
  // CCLI number: the editor field wins. `undefined` (a caller that predates
  // the field) falls back to scanning the cues for a "CCLI #…" footer line —
  // hand-pasted lyrics keep it. An explicit '' means the operator cleared the
  // field on purpose ("this one has no number") and stays cleared.
  const ccliValue = ccli == null ? (extractCcliFromCues(cues) || null) : (String(ccli).trim() || null);
  const insertCue = db.prepare('INSERT INTO cues (song_id, label, text, sequence_order, bg_type, bg_value, duration, style_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
  const runCues = (songId) => {
    (cues || []).forEach((cue, index) => {
      insertCue.run(songId, cue.label, cue.text, index + 1, cue.bg_type || 'color', cue.bg_value || '#000000', cue.duration || 0, cueStyleJson(cue));
    });
  };
  // Atomic: the old code deleted every cue BEFORE inserting, so one bad cue
  // (NULL label/text → NOT NULL violation, full disk, corrupt page) left the
  // song saved with zero slides. A transaction rolls everything back instead.
  const tx = db.transaction((songId) => {
    if (songId) {
      db.prepare('UPDATE songs SET title = ?, artist = ?, category = ?, bg_type = ?, bg_value = ?, audio_url = ?, title_cue_json = ?, ccli = ?, arrangement_json = ? WHERE id = ?').run(title, artist, category, bg_type || 'color', bg_value || '#000000', audio_url || null, titleCueJson, ccliValue, arrangementJson, songId);
      db.prepare('DELETE FROM cues WHERE song_id = ?').run(songId);
      runCues(songId);
      return songId;
    }
    const result = db.prepare('INSERT INTO songs (title, artist, category, bg_type, bg_value, audio_url, title_cue_json, ccli, arrangement_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').run(title, artist, category || 'Worship', bg_type || 'color', bg_value || '#000000', audio_url || null, titleCueJson, ccliValue, arrangementJson);
    runCues(result.lastInsertRowid);
    return result.lastInsertRowid;
  });
  return tx(id || null);
}

export function deleteSong(songId) {
  db.prepare('DELETE FROM songs WHERE id = ?').run(songId);
  db.prepare('DELETE FROM cues WHERE song_id = ?').run(songId);
}

export function toggleFavorite(songId) {
  db.prepare('UPDATE songs SET is_favorite = CASE WHEN is_favorite = 1 THEN 0 ELSE 1 END WHERE id = ?').run(songId);
}

export function updateLastUsed(songId) {
  db.prepare('UPDATE songs SET last_used = CURRENT_TIMESTAMP WHERE id = ?').run(songId);
}

export function setSongBackground(songId, bgType, bgValue) {
  db.prepare('UPDATE songs SET bg_type = ?, bg_value = ? WHERE id = ?').run(bgType || 'color', bgValue || '#000000', songId);
}

export function setSongAudio(songId, audioUrl) {
  db.prepare('UPDATE songs SET audio_url = ? WHERE id = ?').run(audioUrl || null, songId);
}

// Shape a saved sequence for arrangement_json: the current FLOW
// ([{part, occurrence}]) or a legacy label list, dropping blanks. Coercing
// objects through String() — what this used to do — wrote "[object Object]"
// and erased the order on the next save.
function arrangementToJson(arrangement) {
  if (!Array.isArray(arrangement) || !arrangement.length) return null;
  return JSON.stringify(
    arrangement
      .map((s) => (
        s && typeof s === 'object'
          ? { part: String(s.part == null ? '' : s.part).trim(), occurrence: Math.max(1, Math.floor(Number(s.occurrence) || 1)) }
          : String(s).trim()
      ))
      .filter((s) => (typeof s === 'string' ? s !== '' : s.part !== ''))
  );
}

// Song-level default order (own IPC: db-set-song-arrangement). Deliberately
// NOT saveSong: rewriting cues to change a running order would re-issue every
// cue id, and every live arrangement session points at those ids. This is one
// narrow UPDATE that touches arrangement_json and nothing else.
export function setSongArrangement(songId, arrangement) {
  db.prepare('UPDATE songs SET arrangement_json = ? WHERE id = ?').run(arrangementToJson(arrangement), songId);
}

// Stage chord chart (own IPC: db-set-song-chords). Deliberately NOT part of
// saveSong — saving cues must never rewrite the chart, and this narrow UPDATE
// never touches anything else.
export function setSongChords(songId, chart, key) {
  db.prepare('UPDATE songs SET chord_chart = ?, chord_key = ? WHERE id = ?')
    .run(chart ? String(chart) : null, key || 'C', songId);
  return true;
}

// One clamp for the tempo, shared by the narrow setter and the importer: a
// restored song must come back at the tempo the band learned it at, and an
// out-of-range number pasted into a backup must not become a 300 BPM click.
const normalizeBpm = (bpm) => {
  if (bpm == null || bpm === '') return null;
  return Math.min(220, Math.max(40, Math.round(Number(bpm) || 0)));
};

// Per-song stage tempo (own IPC: db-set-song-bpm). Same discipline as the
// chord chart: narrow UPDATE only. NULL clears it back to "unset".
export function setSongBpm(songId, bpm) {
  db.prepare('UPDATE songs SET bpm = ? WHERE id = ?').run(normalizeBpm(bpm), songId);
  return true;
}

// Posters are stored as a bare file name (/thumbs/<name>.jpg); the renderer
// gets a servable media:// URL so a tile never has to build one itself.
const mediaThumbUrl = (name) => (name ? `media://kog-media/thumbs/${encodeURIComponent(name)}` : null);

export function getMediaLibrary() {
  const rows = db.prepare(
    `SELECT url, kind, name, created_at, last_used_at, source_path, missing_at, id AS asset_id, thumb, width, height, duration FROM media_assets
     UNION
     SELECT bg_value AS url, bg_type AS kind, NULL AS name, NULL AS created_at, NULL AS last_used_at, NULL AS source_path, NULL AS missing_at, NULL AS asset_id, NULL AS thumb, NULL AS width, NULL AS height, NULL AS duration FROM cues WHERE bg_value LIKE 'media://%'
     UNION SELECT bg_value AS url, bg_type AS kind, NULL AS name, NULL AS created_at, NULL AS last_used_at, NULL AS source_path, NULL AS missing_at, NULL AS asset_id, NULL AS thumb, NULL AS width, NULL AS height, NULL AS duration FROM songs WHERE bg_value LIKE 'media://%'
     UNION SELECT audio_url AS url, 'audio' AS kind, NULL AS name, NULL AS created_at, NULL AS last_used_at, NULL AS source_path, NULL AS missing_at, NULL AS asset_id, NULL AS thumb, NULL AS width, NULL AS height, NULL AS duration FROM songs WHERE audio_url LIKE 'media://%'`
  ).all();
  // UNION can surface the same URL twice (a registered asset plus a cue/song
  // reference to it) with different NULL-ness. Merge instead of "first wins",
  // or the row that knows the thumbnail/last-used stamp could be dropped.
  const byUrl = new Map();
  for (const r of rows) {
    if (!r.url) continue;
    const row = {
      url: r.url,
      kind: r.kind || 'image',
      name: r.name || null,
      createdAt: r.created_at || null,
      lastUsedAt: r.last_used_at || null,
      sourcePath: r.source_path || null,
      missing: !!r.missing_at,
      assetId: r.asset_id ?? null,
      thumb: mediaThumbUrl(r.thumb),
      width: r.width ?? null,
      height: r.height ?? null,
      duration: r.duration ?? null,
    };
    const prev = byUrl.get(r.url);
    if (!prev) { byUrl.set(r.url, row); continue; }
    byUrl.set(r.url, {
      ...prev,
      kind: row.kind || prev.kind,
      name: prev.name || row.name,
      createdAt: prev.createdAt || row.createdAt,
      lastUsedAt: prev.lastUsedAt || row.lastUsedAt,
      sourcePath: prev.sourcePath || row.sourcePath,
      missing: !!(prev.missing || row.missing),
      assetId: prev.assetId ?? row.assetId,
      thumb: prev.thumb || row.thumb,
      width: prev.width ?? row.width,
      height: prev.height ?? row.height,
      duration: prev.duration ?? row.duration,
    });
  }
  const list = [...byUrl.values()];
  // RECENTLY USED FIRST, everywhere. The Media tab, the song-editor gallery,
  // the service-plan picker and the video/audio panels all read this list, so
  // ordering it once here is what makes every surface agree. An item that has
  // never been applied falls back to its upload time.
  const stampOf = (r) => {
    const t = Date.parse(r.lastUsedAt || r.createdAt || '');
    return Number.isFinite(t) ? t : 0;
  };
  list.sort((a, b) => stampOf(b) - stampOf(a));
  // House gradients need no registration (pure CSS, zero bytes); user media
  // arrives via media_assets plus any media:// refs already on songs/cues.
  for (const b of [...getBuiltinVideoAssets(), ...getBuiltinPhotoAssets()]) {
    if (!b || !b.url || byUrl.has(b.url)) continue;
    byUrl.set(b.url, b);
    list.push(b);
  }
  return list;
}

// Built-in media REMOVED (v1.1.26+): the house backgrounds are the 7 vector
// gradients + 7 animated gradients (zero installer bytes), so these bundled
// file packs no longer exist. Stubs stay so old callers keep working — they
// just find nothing.
export function getBuiltinVideosDir() {
  return null;
}

export function getBuiltinVideoAssets() {
  return [];
}

// Bundled photo backgrounds: same removal as above — stubs return nothing.
export function getBuiltinPhotosDir() {
  return null;
}

export function getBuiltinPhotoAssets() {
  return [];
}

// One page of the library, newest first — the SQL side of the virtualized
// grids. `db-get-media` still returns everything (three other panels index the
// whole list), but a surface that only renders a viewport can ask for pages and
// never materialize 300+ rows.
export function getMediaLibraryPage({ limit = 60, offset = 0, kind = null } = {}) {
  const lim = Math.min(500, Math.max(1, Math.floor(Number(limit) || 60)));
  const off = Math.max(0, Math.floor(Number(offset) || 0));
  const hasKind = !!kind && kind !== 'all';
  const order = 'ORDER BY COALESCE(last_used_at, created_at) DESC, created_at DESC';
  const rows = hasKind
    ? db.prepare(`SELECT url, kind, name, created_at, last_used_at, source_path, missing_at, id AS asset_id, thumb, width, height, duration FROM media_assets WHERE kind = ? ${order} LIMIT ? OFFSET ?`).all(kind, lim, off)
    : db.prepare(`SELECT url, kind, name, created_at, last_used_at, source_path, missing_at, id AS asset_id, thumb, width, height, duration FROM media_assets ${order} LIMIT ? OFFSET ?`).all(lim, off);
  const total = hasKind
    ? db.prepare('SELECT COUNT(*) AS c FROM media_assets WHERE kind = ?').get(kind).c
    : db.prepare('SELECT COUNT(*) AS c FROM media_assets').get().c;
  return {
    total,
    offset: off,
    items: rows.map((r) => ({
      url: r.url,
      kind: r.kind || 'image',
      name: r.name || null,
      createdAt: r.created_at || null,
      lastUsedAt: r.last_used_at || null,
      sourcePath: r.source_path || null,
      missing: !!r.missing_at,
      assetId: r.asset_id ?? null,
      thumb: mediaThumbUrl(r.thumb),
      width: r.width ?? null,
      height: r.height ?? null,
      duration: r.duration ?? null,
    })),
  };
}

// What the background pipeline learned about a file (poster file name, probed
// dimensions, duration). Narrow UPDATE, called from main.js only.
export function setMediaMeta(url, meta = {}) {
  if (!url) return;
  try {
    db.prepare('UPDATE media_assets SET thumb = ?, width = ?, height = ?, duration = ? WHERE url = ?')
      .run(meta.thumb || null, meta.width ?? null, meta.height ?? null, meta.duration ?? null, url);
  } catch (_) {}
}

// Library headroom for the upload caps. Counts only the operator's own rows —
// the built-in gradients/loops never enter media_assets.
export function countMediaAssets(kind = null) {
  try {
    return kind
      ? db.prepare('SELECT COUNT(*) AS c FROM media_assets WHERE kind = ?').get(kind).c
      : db.prepare('SELECT COUNT(*) AS c FROM media_assets').get().c;
  } catch (_) { return 0; }
}

export function addMediaAsset(url, kind = 'image', name = '', sourcePath = null) {
  if (!url) return null;
  try {
    const res = db.prepare('INSERT OR IGNORE INTO media_assets (url, kind, name, source_path) VALUES (?, ?, ?, ?)')
      .run(url, kind, name, sourcePath || null);
    // A row that predates external sources (or was healed from a song ref)
    // gains its path the first time the file is registered again.
    if (sourcePath) {
      try { db.prepare('UPDATE media_assets SET source_path = ? WHERE url = ? AND (source_path IS NULL OR source_path = \'\')').run(sourcePath, url); } catch (_) {}
    }
    return res.lastInsertRowid || null;
  } catch (_) { return null; }
}

/** One library row by its media:// URL (the protocol handler's resolver). */
export function getMediaAssetByUrl(url) {
  if (!url) return null;
  try { return db.prepare('SELECT * FROM media_assets WHERE url = ?').get(url) || null; } catch (_) { return null; }
}

// "Recently used": every apply/attach stamps the asset, and the Media tab plus
// every picker sorts on it. Unknown URLs (built-in gradients, Bible-folder art)
// are a no-op.
export function touchMediaAsset(url) {
  if (!url) return false;
  try { db.prepare('UPDATE media_assets SET last_used_at = CURRENT_TIMESTAMP WHERE url = ?').run(url); return true; } catch (_) { return false; }
}

/** The row that already references this file on disk (Windows paths are
 *  case-insensitive, so the compare is too). This is what keeps one file from
 *  becoming two tiles when it is picked again after a relink. */
export function getMediaAssetBySourcePath(absPath) {
  if (!absPath) return null;
  try {
    return db.prepare('SELECT * FROM media_assets WHERE source_path IS NOT NULL AND source_path != \'\' AND source_path = ? COLLATE NOCASE').get(String(absPath)) || null;
  } catch (_) { return null; }
}

/** RELINK: point an existing entry at wherever the file lives now. The URL is
 *  deliberately untouched — songs, cues and service items reference it, and
 *  identity here is the row, not the path. */
export function setMediaSourcePath(url, absPath) {
  if (!url || !absPath) return false;
  try {
    db.prepare('UPDATE media_assets SET source_path = ?, missing_at = NULL WHERE url = ?').run(String(absPath), url);
    return true;
  } catch (_) { return false; }
}

/** Every library row, for the source audit and the storage sweep. Legacy
 *  entries have no source_path but still resolve to a copy inside userData, so
 *  they must be included: their file can go missing exactly like an external
 *  one, and the sweep needs their cached still names to avoid deleting them. */
export function getMediaSourceRows() {
  try {
    return db.prepare('SELECT url, kind, source_path, thumb FROM media_assets').all();
  } catch (_) { return []; }
}

/** Record (or clear) "the file this entry points at is not there". Narrow
 *  updates only when the state actually changes, so a repeated audit writes
 *  nothing. */
export function setMediaMissing(url, missing) {
  if (!url) return;
  try {
    if (missing) db.prepare('UPDATE media_assets SET missing_at = CURRENT_TIMESTAMP WHERE url = ? AND missing_at IS NULL').run(url);
    else db.prepare('UPDATE media_assets SET missing_at = NULL WHERE url = ? AND missing_at IS NOT NULL').run(url);
  } catch (_) {}
}

export function deleteMediaAsset(url) {
  if (!url) return;
  // One statement per try: a failure (e.g. a pre-migration DB missing
  // audio_url — migrations swallow their own errors) must not skip the
  // remaining cleanups and leave dangling media:// references behind.
  try { db.prepare('DELETE FROM media_assets WHERE url = ?').run(url); } catch (_) {}
  try { db.prepare('UPDATE songs SET bg_type = ?, bg_value = ? WHERE bg_value = ?').run('color', '#000000', url); } catch (_) {}
  try { db.prepare('UPDATE songs SET audio_url = NULL WHERE audio_url = ?').run(url); } catch (_) {}
  try { db.prepare('UPDATE cues SET bg_type = ?, bg_value = ? WHERE bg_value = ?').run('color', '#000000', url); } catch (_) {}
}

export function getLibraryStats() {
  return {
    songs: db.prepare('SELECT COUNT(*) AS c FROM songs').get().c,
    cues: db.prepare('SELECT COUNT(*) AS c FROM cues').get().c,
    slides: db.prepare("SELECT COUNT(*) AS c FROM cues WHERE label != 'Title'").get().c,
    services: db.prepare('SELECT COUNT(*) AS c FROM services').get().c,
    templates: db.prepare('SELECT COUNT(*) AS c FROM templates').get().c,
    mediaAssets: getMediaLibrary().length
  };
}

// SERVICE PLAN DATABASE FUNCTIONS
export function getServices() {
  // A `services` row holds no items of its own — they live in `service_items`
  // — so the Shows card reading `svc.items?.length` always resolved to
  // undefined and printed "0 items" no matter what was in the plan. Count them
  // here instead. Section headers are excluded so this number matches the
  // "N total items" readout above the Service Order.
  return db.prepare(`
    SELECT s.*,
           (SELECT COUNT(*) FROM service_items si
             WHERE si.service_id = s.id AND si.item_type != 'section_header') AS item_count
    FROM services s
    ORDER BY s.id DESC
  `).all();
}

export function getServiceDetails(serviceId) {
  const service = db.prepare('SELECT * FROM services WHERE id = ?').get(serviceId);
  if (!service) return null;
  const items = db.prepare('SELECT * FROM service_items WHERE service_id = ? ORDER BY sort_order ASC').all(serviceId);
  // Hydrate media items: older saves only kept title/subtitle; recover URL/type from content JSON if present.
  const hydrated = items.map((item) => {
    // Restore the fields with no column of their own: scripture styling and
    // the passage reference (book/chapter/verses/translation) travel as one
    // JSON blob, saved by saveServicePlan.
    const extra = item.extra_json ? (safeParse(item.extra_json) || {}) : {};
    const out = { ...item, ...(extra.style ? { style: extra.style } : {}), ...(extra.meta ? { meta: extra.meta } : {}) };
    delete out.extra_json;
    if (out.item_type !== 'media') return out;
    if (out.media_url) return out;
    if (out.content && out.content.trim().startsWith('{')) {
      try {
        const meta = JSON.parse(out.content);
        if (meta && meta.media_url) {
          return { ...out, media_url: meta.media_url, media_type: meta.media_type || out.media_type || 'image', content: '' };
        }
      } catch (_) {}
    }
    return out;
  });
  return { ...service, items: hydrated };
}

export function saveServicePlan(serviceData) {
  const { id, name, date, items } = serviceData;
  const category = serviceData.category || 'Worship';
  const ratio = serviceData.ratio || '16:9';
  const resolution = serviceData.resolution || '1920x1080';
  const insertItem = db.prepare('INSERT INTO service_items (service_id, item_type, title, subtitle, content, sort_order, duration, media_url, media_type, extra_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
  // Song refs must be clean integers: old plans carry float strings like
  // "42.0" (which no === or String() compare matches), so normalize here —
  // once — instead of in every reader. Non-numeric ids (future UUIDs) pass
  // through untouched.
  const songRef = (item) => {
    if (item.item_type !== 'song' || item.content == null || String(item.content).trim() === '') return item.content || '';
    const n = Number(item.content);
    return Number.isFinite(n) ? Math.trunc(n) : item.content;
  };
  const runInsert = (serviceId, item, idx) => insertItem.run(
    serviceId,
    item.item_type,
    item.title,
    item.subtitle || '',
    item.item_type === 'media'
      ? JSON.stringify({ media_url: item.media_url || null, media_type: item.media_type || 'image' })
      : (item.item_type === 'song' ? String(songRef(item)) : (item.content || '')),
    idx + 1,
    item.duration || 0,
    item.media_url || null,
    item.media_type || null,
    // `style` and `meta` carry the scripture layout and the passage itself
    // (book/chapter/verses/translation). Without them a saved scripture fires
    // as an ordinary slide on reload, with no Bible data behind it.
    (item.style || item.meta)
      ? JSON.stringify({
          ...(item.style ? { style: item.style } : {}),
          ...(item.meta ? { meta: item.meta } : {}),
        })
      : null
  );
  if (id) {
    // Atomic, same as saveSong: a failed item insert must not leave the plan
    // saved with half its rows. Also guards a missing items array.
    const tx = db.transaction(() => {
      db.prepare('UPDATE services SET name = ?, date = ?, category = ?, ratio = ?, resolution = ? WHERE id = ?').run(name, date, category, ratio, resolution, id);
      db.prepare('DELETE FROM service_items WHERE service_id = ?').run(id);
      (items || []).forEach((item, idx) => { runInsert(id, item, idx); });
    });
    tx();
    return id;
  } else {
    const res = db.prepare('INSERT INTO services (name, date, category, ratio, resolution) VALUES (?, ?, ?, ?, ?)').run(name, date || new Date().toISOString().split('T')[0], category, ratio, resolution);
    const serviceId = res.lastInsertRowid;
    items.forEach((item, idx) => { runInsert(serviceId, item, idx); });
    return serviceId;
  }
}

export function deleteService(serviceId) {
  db.prepare('DELETE FROM services WHERE id = ?').run(serviceId);
  db.prepare('DELETE FROM service_items WHERE service_id = ?').run(serviceId);
}

// CCLI USAGE REPORT — the whole point of storing dated plans. Walks the
// services in [from, to] (inclusive; dates are 'YYYY-MM-DD' TEXT, so string
// comparison IS the range query), collects every song id each plan used
// (expanding medleys — see itemSongIds), and hands the raw rows to
// buildUsageReport in ccliReport.js for the counting/grouping rules.
// Returns { rows, missing, undated, from, to }.
export function getUsageReport(from, to) {
  const fromStr = String(from || '').trim();
  const toStr = String(to || '').trim();
  // Guard the lexicographic compare against junk input: a malformed date
  // must never match everything (or nothing) silently.
  const okDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s);
  let query = 'SELECT * FROM services';
  const params = [];
  const where = [];
  if (okDate(fromStr)) { where.push('date >= ?'); params.push(fromStr); }
  if (okDate(toStr)) { where.push('date <= ?'); params.push(toStr); }
  if (where.length) query += ' WHERE ' + where.join(' AND ');
  query += ' ORDER BY date ASC';
  const services = db.prepare(query).all(...params);
  if (!services.length) return { rows: [], missing: [], undated: 0, from: fromStr, to: toStr };

  const itemRows = db.prepare(
    `SELECT * FROM service_items WHERE service_id IN (${services.map(() => '?').join(',')}) AND item_type = 'song'`
  ).all(...services.map((s) => s.id));
  const itemsByService = new Map();
  for (const row of itemRows) {
    if (!itemsByService.has(row.service_id)) itemsByService.set(row.service_id, []);
    itemsByService.get(row.service_id).push(row);
  }
  const withItems = services.map((s) => ({ ...s, items: itemsByService.get(s.id) || [] }));

  // Batch song lookup for every id the plans touch (distinct, numeric).
  const ids = new Set();
  for (const s of withItems) for (const item of s.items) for (const id of itemSongIds(item)) ids.add(id);
  const songsById = new Map();
  if (ids.size) {
    const list = [...ids];
    const rows = db.prepare(`SELECT id, title, ccli FROM songs WHERE id IN (${list.map(() => '?').join(',')})`).all(...list);
    for (const r of rows) songsById.set(r.id, r);
  }

  const report = buildUsageReport(withItems, songsById);
  return { ...report, from: fromStr, to: toStr };
}

// FULL BACKUP: songs plus the media rows their URLs resolve through. The song
// rows alone were the whole file back when every import copied its bytes into
// userData; now a media:// URL is a POINTER, and a backup without its manifest
// restores songs whose backgrounds resolve to nothing (silently black on the
// wall). v2 is an object; the legacy array shape is still accepted on import.
export function exportLibrary() {
  const songs = db.prepare('SELECT * FROM songs').all();
  let media = [];
  try {
    media = db.prepare('SELECT url, kind, name, source_path, last_used_at, thumb, width, height, duration FROM media_assets').all().map((m) => ({
      url: m.url,
      kind: m.kind || 'image',
      name: m.name || null,
      sourcePath: m.source_path || null,
      lastUsedAt: m.last_used_at || null,
      thumb: m.thumb || null,
      width: m.width ?? null,
      height: m.height ?? null,
      duration: m.duration ?? null,
    }));
  } catch (_) {}
  return JSON.stringify({
    app: 'kog-worship',
    kind: 'library-backup',
    version: 2,
    exportedAt: new Date().toISOString(),
    songs: songs.map(songToExport).filter(Boolean),
    media,
  }, null, 2);
}

// One song (or many) in EXACTLY the library shape above, so the existing
// import path accepts full and partial backups interchangeably. Returns the
// JSON plus every local media:// URL referenced (backgrounds + audio), so
// the exporter can tell the operator which files must also be copied —
// media bytes are not embedded (a 44MB video has no business in JSON).
function songToExport(song) {
  if (!song) return null;
  const { title_cue_json, arrangement_json, ...songRest } = song;
  const arrangement = safeParse(arrangement_json);
  return {
    ...songRest,
    title_cue: safeParse(title_cue_json) || undefined,
    arrangement: Array.isArray(arrangement) ? arrangement : undefined,
    cues: db.prepare('SELECT label, text, sequence_order, bg_type, bg_value, duration, style_json FROM cues WHERE song_id = ? ORDER BY sequence_order ASC').all(song.id).map((row) => {
      const { style_json, ...rest } = row;
      return { ...(safeParse(style_json) || {}), ...rest };
    })
  };
}

export function exportSongs(ids) {
  const list = [];
  const media = new Set();
  const grab = (u) => { if (typeof u === 'string' && u.startsWith('media://')) media.add(u); };
  for (const id of Array.isArray(ids) ? ids : []) {
    const song = db.prepare('SELECT * FROM songs WHERE id = ?').get(id);
    const ex = songToExport(song);
    if (!ex) continue;
    grab(ex.bg_value);
    grab(ex.audio_url);
    for (const c of ex.cues || []) grab(c.bg_value);
    list.push(ex);
  }
  return { json: JSON.stringify(list, null, 2), count: list.length, media: [...media] };
}

export function importLibrary(jsonData) {
  try {
    const parsed = JSON.parse(jsonData);
    // Two shapes: the v2 backup object, and the legacy bare array of songs
    // (which is also what a per-song "Back up selected" file is).
    const library = Array.isArray(parsed) ? parsed : (Array.isArray(parsed && parsed.songs) ? parsed.songs : []);
    const media = Array.isArray(parsed && parsed.media) ? parsed.media : [];
    // EVERY column that carries how the song looks, sounds or plays has to be
    // in this list — an import that drops one is silent data loss, because the
    // operator only finds out when the wall reopens without it. `bpm` and
    // `last_used` were the two that used to go missing (tempo reverted to
    // unset, the song fell out of Recently Used); created_at/updated_at are
    // left to the new row on purpose, they describe THIS copy.
    const insertSong = db.prepare('INSERT INTO songs (title, artist, category, is_favorite, bg_type, bg_value, audio_url, title_cue_json, chord_chart, chord_key, ccli, arrangement_json, bpm, last_used) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
    const insertCue = db.prepare('INSERT INTO cues (song_id, label, text, sequence_order, bg_type, bg_value, duration, style_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');

    db.transaction(() => {
      for (const song of library) {
        // ccli rides the export (SELECT * spread) and must survive import or
        // every restore silently empties the usage report's numbers. Older
        // backup JSON has no field — extract from cues as a fallback, same
        // rule as saveSong.
        const ccliValue = song.ccli == null ? (extractCcliFromCues(song.cues) || null) : (String(song.ccli).trim() || null);
        const res = insertSong.run(song.title, song.artist || 'Unknown', song.category || 'Worship', song.is_favorite || 0, song.bg_type || 'color', song.bg_value || '#000000', song.audio_url || null, song.title_cue ? JSON.stringify(song.title_cue) : null, song.chord_chart || null, song.chord_key || 'C', ccliValue, arrangementToJson(song.arrangement), normalizeBpm(song.bpm), song.last_used || null);
        const songId = res.lastInsertRowid;
        if (song.cues) {
          song.cues.forEach((cue, idx) => {
            insertCue.run(songId, cue.label, cue.text, cue.sequence_order || idx + 1, cue.bg_type || 'color', cue.bg_value || '#000000', cue.duration || 0, cueStyleJson(cue));
          });
        }
      }
    })();

    // MEDIA MANIFEST. Keep the operator's absolute source path so a backup
    // taken on THIS machine comes back working. A path that no longer exists
    // is kept anyway: the audit flags it as missing and the Media tab offers a
    // relink, which beats a slide that renders black for no stated reason.
    const findMedia = db.prepare('SELECT id FROM media_assets WHERE url = ?');
    const insertMedia = db.prepare('INSERT INTO media_assets (url, kind, name, source_path, last_used_at, thumb) VALUES (?, ?, ?, ?, ?, ?)');
    const updateMedia = db.prepare('UPDATE media_assets SET name = COALESCE(?, name), source_path = COALESCE(?, source_path), last_used_at = COALESCE(?, last_used_at), thumb = COALESCE(?, thumb) WHERE url = ?');
    const kinds = new Set(['image', 'video', 'audio']);
    db.transaction(() => {
      for (const m of media) {
        if (!m || typeof m.url !== 'string' || !m.url.startsWith('media://')) continue;
        const kind = kinds.has(m.kind) ? m.kind : 'image';
        const name = typeof m.name === 'string' ? m.name : null;
        const sourcePath = typeof m.sourcePath === 'string' && m.sourcePath ? m.sourcePath : null;
        const lastUsed = typeof m.lastUsedAt === 'string' && m.lastUsedAt ? m.lastUsedAt : null;
        // Bare file name only: this string is later joined onto the thumbs
        // folder, so a value carrying a path separator is refused.
        const thumb = typeof m.thumb === 'string' && m.thumb && !/[\\/]/.test(m.thumb) ? m.thumb : null;
        if (findMedia.get(m.url)) updateMedia.run(name, sourcePath, lastUsed, thumb, m.url);
        else insertMedia.run(m.url, kind, name, sourcePath, lastUsed, thumb);
      }
    })();
    return true;
  } catch (err) {
    console.error("Import failed:", err);
    return false;
  }
}

// SERVICE TEMPLATES
export function getTemplates() {
  return db.prepare('SELECT * FROM templates ORDER BY id DESC').all();
}

export function saveTemplate(name, items) {
  const existing = db.prepare('SELECT id FROM templates WHERE name = ?').get(name);
  if (existing) {
    db.prepare('UPDATE templates SET items_json = ? WHERE id = ?').run(JSON.stringify(items || []), existing.id);
    return existing.id;
  }
  const res = db.prepare('INSERT INTO templates (name, items_json) VALUES (?, ?)').run(name, JSON.stringify(items || []));
  return res.lastInsertRowid;
}

export function deleteTemplate(templateId) {
  db.prepare('DELETE FROM templates WHERE id = ?').run(templateId);
}

// PRESENTATION DECKS (Sermon / sermon slides)
export function getPresentations() {
  const rows = db.prepare('SELECT id, title, updated_at FROM presentations ORDER BY updated_at DESC, id DESC').all();
  return rows.map(r => {
    let slideCount = 0;
    try { const parsed = JSON.parse(db.prepare('SELECT data_json FROM presentations WHERE id = ?').get(r.id)?.data_json || '{}'); slideCount = Array.isArray(parsed.slides) ? parsed.slides.length : 0; } catch (_) {}
    return { ...r, slideCount };
  });
}

export function getPresentationDetails(id) {
  const row = db.prepare('SELECT * FROM presentations WHERE id = ?').get(id);
  if (!row) return null;
  let data = {};
  try { data = JSON.parse(row.data_json || '{}'); } catch (_) { data = {}; }
  return { id: row.id, title: row.title, updated_at: row.updated_at, slides: Array.isArray(data.slides) ? data.slides : [] };
}

export function savePresentation(deck) {
  const title = (deck && deck.title) || 'Untitled Presentation';
  const dataJson = JSON.stringify({ slides: (deck && deck.slides) || [] });
  if (deck && deck.id) {
    db.prepare('UPDATE presentations SET title = ?, data_json = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(title, dataJson, deck.id);
    return deck.id;
  }
  const res = db.prepare('INSERT INTO presentations (title, data_json) VALUES (?, ?)').run(title, dataJson);
  return res.lastInsertRowid;
}

export function deletePresentation(id) {
  db.prepare('DELETE FROM presentations WHERE id = ?').run(id);
}

// ---------------------------------------------------------------------------
// REMOTE MESSAGING (two-way chat between phone remotes and the operator)
// ---------------------------------------------------------------------------
try { db.exec(`
  CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    conversation_id TEXT NOT NULL,
    sender_id TEXT NOT NULL,
    sender_name TEXT,
    recipient_id TEXT NOT NULL,
    content TEXT NOT NULL,
    priority TEXT NOT NULL DEFAULT 'normal',
    status TEXT NOT NULL DEFAULT 'sent',
    timestamp INTEGER NOT NULL,
    delivered_at INTEGER,
    read_at INTEGER,
    ack_at INTEGER
  );
  CREATE INDEX IF NOT EXISTS idx_messages_conv ON messages(conversation_id);
  CREATE INDEX IF NOT EXISTS idx_messages_ts ON messages(timestamp);

  CREATE TABLE IF NOT EXISTS quick_replies (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    owner TEXT NOT NULL,
    label TEXT NOT NULL,
    text TEXT NOT NULL,
    sort_order INTEGER DEFAULT 0
  );

  -- Per-device delivery receipts. A booth message has one row per member, so
  -- "read" is never a single column that the last phone overwrites.
  CREATE TABLE IF NOT EXISTS message_receipts (
    message_id TEXT NOT NULL,
    device_id TEXT NOT NULL,
    delivered_at INTEGER,
    read_at INTEGER,
    ack_at INTEGER,
    PRIMARY KEY (message_id, device_id)
  );
  CREATE INDEX IF NOT EXISTS idx_receipts_device ON message_receipts(device_id);

  -- Operator preferences about a remote. Mute silences banners/notifications
  -- without stopping history, and the display name survives re-pairing.
  CREATE TABLE IF NOT EXISTS device_prefs (
    device_id TEXT PRIMARY KEY,
    display_name TEXT,
    muted INTEGER NOT NULL DEFAULT 0
  );
`); } catch (e) { /* noop */ }

// Messages gained a context line (what was live when it was sent). Older
// databases created the table without it, so add it in place once.
try {
  const cols = db.prepare("PRAGMA table_info(messages)").all().map((c) => c.name);
  if (!cols.includes('context')) db.exec('ALTER TABLE messages ADD COLUMN context TEXT');
} catch (e) { /* noop */ }

try {
  const c = db.prepare('SELECT COUNT(*) AS n FROM quick_replies').get().n;
  if (!c) {
    const ins = db.prepare('INSERT INTO quick_replies (owner, label, text, sort_order) VALUES (?,?,?,?)');
    const op = [
      ['Received.', 'Received.'],
      ['Preparing now.', 'Preparing now.'],
      ['Done.', 'Done.'],
      ['Please standby.', 'Please standby.'],
      ['Please clarify.', 'Please clarify.'],
      ['Projector checked.', 'Projector checked.'],
    ];
    op.forEach((r, i) => ins.run('operator', r[0], r[1], i));
    const rm = [
      ['Thank you.', 'Thank you.'],
      ['Go ahead.', 'Go ahead.'],
      ['Standby.', 'Standby.'],
      ['Please repeat.', 'Please repeat.'],
      ['Understood.', 'Understood.'],
    ];
    rm.forEach((r, i) => ins.run('remote', r[0], r[1], i));
  }
  // One catalogue both ends read: the booth sees exactly the phrases the
  // phones offer, so a reply label never means two different things.
  const shared = db.prepare("SELECT COUNT(*) AS n FROM quick_replies WHERE owner = 'shared'").get().n;
  if (!shared) {
    const ins = db.prepare('INSERT INTO quick_replies (owner, label, text, sort_order) VALUES (?,?,?,?)');
    const rows = [
      ['Received.', 'Received.'],
      ['Go ahead.', 'Go ahead.'],
      ['Standby.', 'Standby.'],
      ['Hold — 1 minute.', 'Hold — 1 minute.'],
      ['Please repeat.', 'Please repeat.'],
      ['Understood.', 'Understood.'],
      ['Song is wrong.', 'Wrong song — check the live item.'],
      ['Slide is wrong.', 'Wrong slide — please check the live slide.'],
      ['Mic is live.', 'Mic is live.'],
      ['Thank you.', 'Thank you.'],
    ];
    rows.forEach((r, i) => ins.run('shared', r[0], r[1], i));
  }
} catch (e) { /* noop */ }

export function getMessages(conversationId) {
  if (conversationId) {
    return db.prepare('SELECT * FROM messages WHERE conversation_id = ? ORDER BY timestamp ASC').all(conversationId);
  }
  return db.prepare('SELECT * FROM messages ORDER BY timestamp ASC').all();
}

export function getAllConversations() {
  const rows = db.prepare(`
    SELECT conversation_id, MAX(timestamp) AS last_ts
    FROM messages GROUP BY conversation_id ORDER BY last_ts DESC
  `).all();
  return rows.map((r) => {
    const last = db.prepare('SELECT * FROM messages WHERE conversation_id = ? ORDER BY timestamp DESC LIMIT 1').get(r.conversation_id);
    // Unread means "not from the operator and not yet seen" — works for a DM
    // (recipient is the operator) and for the booth (recipient is the room).
    const unread = db.prepare("SELECT COUNT(*) AS n FROM messages WHERE conversation_id = ? AND sender_id != 'operator' AND status IN ('sent','delivered')").get(r.conversation_id).n;
    return {
      conversationId: r.conversation_id,
      kind: r.conversation_id === 'booth' ? 'booth' : 'dm',
      lastMessage: last,
      unread,
    };
  });
}

// Everything a phone should hold: its own DM thread plus the shared booth.
export function getMessagesForDevice(deviceId) {
  if (!deviceId) return db.prepare("SELECT * FROM messages WHERE conversation_id = 'booth' ORDER BY timestamp ASC").all();
  return db.prepare("SELECT * FROM messages WHERE conversation_id = 'booth' OR conversation_id = ? ORDER BY timestamp ASC").all(deviceId);
}

export function getMessageReceipts(messageId) {
  if (!messageId) return [];
  return db.prepare('SELECT * FROM message_receipts WHERE message_id = ?').all(messageId);
}

export function getReceiptsForConversation(conversationId) {
  return db.prepare(`
    SELECT r.* FROM message_receipts r
    JOIN messages m ON m.id = r.message_id
    WHERE m.conversation_id = ?
    ORDER BY r.message_id ASC, r.device_id ASC
  `).all(conversationId);
}

// One receipt per recipient device. Later events only ever move a receipt
// forward (delivered → read → acknowledged), never backwards.
export function recordReceipt(messageId, deviceId, status, at = Date.now()) {
  if (!messageId || !deviceId) return;
  db.prepare('INSERT OR IGNORE INTO message_receipts (message_id, device_id) VALUES (?, ?)').run(messageId, deviceId);
  if (status === 'delivered') {
    db.prepare('UPDATE message_receipts SET delivered_at = COALESCE(delivered_at, ?) WHERE message_id = ? AND device_id = ?').run(at, messageId, deviceId);
  } else if (status === 'read') {
    db.prepare('UPDATE message_receipts SET delivered_at = COALESCE(delivered_at, ?), read_at = COALESCE(read_at, ?) WHERE message_id = ? AND device_id = ?').run(at, at, messageId, deviceId);
  } else if (status === 'acknowledged') {
    db.prepare('UPDATE message_receipts SET delivered_at = COALESCE(delivered_at, ?), read_at = COALESCE(read_at, ?), ack_at = COALESCE(ack_at, ?) WHERE message_id = ? AND device_id = ?').run(at, at, at, messageId, deviceId);
  }
}

// Aggregate a booth message from its receipts: it is only "read" once every
// member has read it, otherwise the slowest device decides the badge.
export function recomputeMessageStatus(messageId) {
  const receipts = getMessageReceipts(messageId);
  if (!receipts.length) return null;
  let status = 'acknowledged';
  for (const r of receipts) {
    if (!r.ack_at) { status = 'read'; break; }
  }
  if (status !== 'acknowledged') {
    for (const r of receipts) {
      if (!r.read_at) { status = 'delivered'; break; }
    }
  }
  if (status !== 'acknowledged' && status !== 'read') {
    for (const r of receipts) {
      if (!r.delivered_at) { status = 'sent'; break; }
    }
  }
  db.prepare('UPDATE messages SET status = ? WHERE id = ?').run(status, messageId);
  return status;
}

export function getDevicePrefs(deviceId) {
  if (!deviceId) return db.prepare('SELECT * FROM device_prefs').all();
  return db.prepare('SELECT * FROM device_prefs WHERE device_id = ?').get(deviceId) || null;
}

export function setDeviceMuted(deviceId, muted) {
  db.prepare('INSERT INTO device_prefs (device_id, muted) VALUES (?, ?) ON CONFLICT(device_id) DO UPDATE SET muted = excluded.muted').run(deviceId, muted ? 1 : 0);
}

export function setDeviceName(deviceId, displayName) {
  const name = String(displayName || '').slice(0, 64);
  db.prepare('INSERT INTO device_prefs (device_id, display_name) VALUES (?, ?) ON CONFLICT(device_id) DO UPDATE SET display_name = excluded.display_name').run(deviceId, name);
}

export function searchMessages(query, limit = 80) {
  const q = String(query || '').trim();
  if (!q) return [];
  return db.prepare('SELECT * FROM messages WHERE content LIKE ? ORDER BY timestamp DESC LIMIT ?').all(`%${q}%`, limit);
}

export function saveMessage(m) {
  const existing = db.prepare('SELECT id FROM messages WHERE id = ?').get(m.id);
  if (existing) {
    db.prepare(`UPDATE messages SET status=?, delivered_at=?, read_at=?, ack_at=?, content=?, context=? WHERE id=?`)
      .run(m.status || 'sent', m.deliveredAt || null, m.readAt || null, m.ackAt || null, m.content, m.context || null, m.id);
    return m.id;
  }
  // A phone stamps its own messages with its own clock. If that clock is a
  // little behind, or a queued message flushes late, the row would be filed
  // above messages that were already on screen and the thread would read out
  // of order. Keep each conversation's inserts monotonic so the chat is
  // sequenced by who spoke first, never by a drifting device clock.
  const prev = db.prepare('SELECT MAX(timestamp) AS ts FROM messages WHERE conversation_id = ?').get(m.conversationId);
  const timestamp = Math.max(Number(m.timestamp) || Date.now(), (Number(prev && prev.ts) || 0) + 1);
  db.prepare(`INSERT INTO messages (id, conversation_id, sender_id, sender_name, recipient_id, content, priority, status, timestamp, delivered_at, read_at, ack_at, context)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(m.id, m.conversationId, m.senderId, m.senderName || null, m.recipientId, m.content, m.priority || 'normal', m.status || 'sent', timestamp, m.deliveredAt || null, m.readAt || null, m.ackAt || null, m.context || null);
  m.timestamp = timestamp;
  return m.id;
}

export function updateMessageStatus(id, status, extra = {}) {
  const sets = ['status = ?'];
  const params = [status];
  if (extra.deliveredAt !== undefined) { sets.push('delivered_at = ?'); params.push(extra.deliveredAt); }
  if (extra.readAt !== undefined) { sets.push('read_at = ?'); params.push(extra.readAt); }
  if (extra.ackAt !== undefined) { sets.push('ack_at = ?'); params.push(extra.ackAt); }
  params.push(id);
  db.prepare(`UPDATE messages SET ${sets.join(', ')} WHERE id = ?`).run(...params);
}

export function getQuickReplies(owner) {
  if (owner) return db.prepare('SELECT * FROM quick_replies WHERE owner = ? ORDER BY sort_order ASC, id ASC').all(owner);
  return db.prepare('SELECT * FROM quick_replies ORDER BY owner ASC, sort_order ASC, id ASC').all();
}

export function saveQuickReply(owner, label, text) {
  const res = db.prepare('INSERT INTO quick_replies (owner, label, text, sort_order) VALUES (?,?,?, (SELECT COALESCE(MAX(sort_order),0)+1 FROM quick_replies WHERE owner=?))').run(owner, label, text, owner);
  return res.lastInsertRowid;
}

export function deleteQuickReply(id) {
  db.prepare('DELETE FROM quick_replies WHERE id = ?').run(id);
}

// Auto-cleanup: remove messages older than maxAgeMs (default 3 hours).
export function cleanupOldMessages(maxAgeMs = 3 * 60 * 60 * 1000) {
  const cutoff = Date.now() - maxAgeMs;
  try { db.prepare('DELETE FROM messages WHERE timestamp < ?').run(cutoff); } catch (e) { /* noop */ }
  // Receipts follow their message out; a booth thread can otherwise leave
  // thousands of orphan rows behind after a long service.
  try { db.prepare('DELETE FROM message_receipts WHERE message_id NOT IN (SELECT id FROM messages)').run(); } catch (e) { /* noop */ }
}

// Delete every message (used on app close/restart per operator preference).
export function deleteAllMessages() {
  try { db.prepare('DELETE FROM messages').run(); } catch (e) { /* noop */ }
}
