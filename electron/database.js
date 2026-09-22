import Database from 'better-sqlite3';
import path from 'path';
import { app } from 'electron';
import fs from 'fs';

const dbPath = path.join(app.getPath('userData'), 'kog-worship.db');
const db = new Database(dbPath);

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
// Editable title slide (box, font, size, color, ...) stored on the song.
try { db.exec(`ALTER TABLE songs ADD COLUMN title_cue_json TEXT;`); } catch (_) {}

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
  let query = 'SELECT * FROM songs WHERE (title LIKE ? OR artist LIKE ?)';
  let params = [`%${searchQuery}%`, `%${searchQuery}%`];

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

export function getSongDetails(songId) {
  const song = db.prepare('SELECT * FROM songs WHERE id = ?').get(songId);
  if (!song) return null;
  const cues = db.prepare('SELECT * FROM cues WHERE song_id = ? ORDER BY sequence_order ASC').all(songId);
  const { title_cue_json, ...songRest } = song;
  const parsedCues = cues.map((row) => {
    const { style_json, ...rest } = row;
    return { ...(safeParse(style_json) || {}), ...rest };
  });
  return { ...songRest, title_cue: safeParse(title_cue_json) || undefined, cues: parsedCues };
}

export function saveSong(songData) {
  const { id, title, artist, category, cues, bg_type, bg_value, audio_url, title_cue } = songData;
  const titleCueJson = title_cue ? JSON.stringify(title_cue) : null;
  const insertCue = db.prepare('INSERT INTO cues (song_id, label, text, sequence_order, bg_type, bg_value, duration, style_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
  if (id) {
    db.prepare('UPDATE songs SET title = ?, artist = ?, category = ?, bg_type = ?, bg_value = ?, audio_url = ?, title_cue_json = ? WHERE id = ?').run(title, artist, category, bg_type || 'color', bg_value || '#000000', audio_url || null, titleCueJson, id);
    db.prepare('DELETE FROM cues WHERE song_id = ?').run(id);
    cues.forEach((cue, index) => {
      insertCue.run(id, cue.label, cue.text, index + 1, cue.bg_type || 'color', cue.bg_value || '#000000', cue.duration || 0, cueStyleJson(cue));
    });
    return id;
  } else {
    const result = db.prepare('INSERT INTO songs (title, artist, category, bg_type, bg_value, audio_url, title_cue_json) VALUES (?, ?, ?, ?, ?, ?, ?)').run(title, artist, category || 'Worship', bg_type || 'color', bg_value || '#000000', audio_url || null, titleCueJson);
    const songId = result.lastInsertRowid;
    cues.forEach((cue, index) => {
      insertCue.run(songId, cue.label, cue.text, index + 1, cue.bg_type || 'color', cue.bg_value || '#000000', cue.duration || 0, cueStyleJson(cue));
    });
    return songId;
  }
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

export function getMediaLibrary() {
  const rows = db.prepare(
    `SELECT url, kind FROM media_assets
     UNION
     SELECT bg_value AS url, bg_type AS kind FROM cues WHERE bg_value LIKE 'media://%'
     UNION SELECT bg_value AS url, bg_type AS kind FROM songs WHERE bg_value LIKE 'media://%'
     UNION SELECT audio_url AS url, 'audio' AS kind FROM songs WHERE audio_url LIKE 'media://%'`
  ).all();
  const seen = new Set();
  const list = [];
  for (const r of rows) {
    if (!r.url || seen.has(r.url)) continue;
    seen.add(r.url);
    list.push({ url: r.url, kind: r.kind || 'image' });
  }
  // Bundled video + photo backgrounds ship with the installer so they exist on
  // every machine, with or without the original folders on disk.
  for (const b of [...getBuiltinVideoAssets(), ...getBuiltinPhotoAssets()]) {
    if (seen.has(b.url)) continue;
    seen.add(b.url);
    list.push(b);
  }
  return list;
}

// Bundled video backgrounds: packaged builds read <resources>/builtin-videos,
// dev/unpackaged builds read ./VideBackground at the project root.
export function getBuiltinVideosDir() {
  const candidates = [];
  if (process.resourcesPath) candidates.push(path.join(process.resourcesPath, 'builtin-videos'));
  candidates.push(path.join(process.cwd(), 'VideBackground'));
  for (const dir of candidates) {
    try { if (fs.existsSync(dir) && fs.statSync(dir).isDirectory()) return dir; } catch (_) {}
  }
  return candidates[0];
}

export function getBuiltinVideoAssets() {
  const dir = getBuiltinVideosDir();
  let names = [];
  try { names = fs.readdirSync(dir).filter(n => /\.(mp4|webm|mov)$/i.test(n)); } catch (_) { return []; }
  return names.sort().map((fileName) => {
    const base = fileName.replace(/\.[^.]+$/, '');
    const title = base.replace(/[\-_]+/g, ' ').replace(/\s+/g, ' ').trim() || 'Video Background';
    return { url: `media://kog-media/builtin/${encodeURIComponent(fileName)}`, kind: 'video', builtin: true, name: title };
  });
}

// Bundled photo backgrounds: packaged builds read <resources>/builtin-photos,
// dev/unpackaged builds read ./Photos at the project root. Same contract as
// the videos above, served under media://kog-media/builtin-photos/...
export function getBuiltinPhotosDir() {
  const candidates = [];
  if (process.resourcesPath) candidates.push(path.join(process.resourcesPath, 'builtin-photos'));
  candidates.push(path.join(process.cwd(), 'Photos'));
  for (const dir of candidates) {
    try { if (fs.existsSync(dir) && fs.statSync(dir).isDirectory()) return dir; } catch (_) {}
  }
  return candidates[0];
}

export function getBuiltinPhotoAssets() {
  const dir = getBuiltinPhotosDir();
  let names = [];
  try { names = fs.readdirSync(dir).filter(n => /\.(png|jpe?g|gif|webp|avif|bmp)$/i.test(n)); } catch (_) { return []; }
  return names.sort().map((fileName) => {
    const base = fileName.replace(/\.[^.]+$/, '');
    const title = base.replace(/[\-_]+/g, ' ').replace(/\s+/g, ' ').trim() || 'Photo Background';
    return { url: `media://kog-media/builtin-photos/${encodeURIComponent(fileName)}`, kind: 'image', builtin: true, name: title };
  });
}

export function addMediaAsset(url, kind = 'image', name = '') {
  if (!url) return;
  try {
    db.prepare('INSERT OR IGNORE INTO media_assets (url, kind, name) VALUES (?, ?, ?)').run(url, kind, name);
  } catch (_) {}
}

export function deleteMediaAsset(url) {
  if (!url) return;
  try {
    db.prepare('DELETE FROM media_assets WHERE url = ?').run(url);
    db.prepare('UPDATE songs SET bg_type = ?, bg_value = ? WHERE bg_value = ?').run('color', '#000000', url);
    db.prepare('UPDATE songs SET audio_url = NULL WHERE audio_url = ?').run(url);
    db.prepare('UPDATE cues SET bg_type = ?, bg_value = ? WHERE bg_value = ?').run('color', '#000000', url);
  } catch (_) {}
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
  return db.prepare('SELECT * FROM services ORDER BY id DESC').all();
}

export function getServiceDetails(serviceId) {
  const service = db.prepare('SELECT * FROM services WHERE id = ?').get(serviceId);
  if (!service) return null;
  const items = db.prepare('SELECT * FROM service_items WHERE service_id = ? ORDER BY sort_order ASC').all(serviceId);
  // Hydrate media items: older saves only kept title/subtitle; recover URL/type from content JSON if present.
  const hydrated = items.map((item) => {
    if (item.item_type !== 'media') return item;
    if (item.media_url) return item;
    if (item.content && item.content.trim().startsWith('{')) {
      try {
        const meta = JSON.parse(item.content);
        if (meta && meta.media_url) {
          return { ...item, media_url: meta.media_url, media_type: meta.media_type || item.media_type || 'image', content: '' };
        }
      } catch (_) {}
    }
    return item;
  });
  return { ...service, items: hydrated };
}

export function saveServicePlan(serviceData) {
  const { id, name, date, items } = serviceData;
  const category = serviceData.category || 'Worship';
  const ratio = serviceData.ratio || '16:9';
  const resolution = serviceData.resolution || '1920x1080';
  const insertItem = db.prepare('INSERT INTO service_items (service_id, item_type, title, subtitle, content, sort_order, duration, media_url, media_type) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');
  const runInsert = (serviceId, item, idx) => insertItem.run(
    serviceId,
    item.item_type,
    item.title,
    item.subtitle || '',
    item.item_type === 'media'
      ? JSON.stringify({ media_url: item.media_url || null, media_type: item.media_type || 'image' })
      : (item.content || ''),
    idx + 1,
    item.duration || 0,
    item.media_url || null,
    item.media_type || null
  );
  if (id) {
    db.prepare('UPDATE services SET name = ?, date = ?, category = ?, ratio = ?, resolution = ? WHERE id = ?').run(name, date, category, ratio, resolution, id);
    db.prepare('DELETE FROM service_items WHERE service_id = ?').run(id);
    items.forEach((item, idx) => { runInsert(id, item, idx); });
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

export function exportLibrary() {
  const songs = db.prepare('SELECT * FROM songs').all();
  const fullLibrary = songs.map(song => {
    const { title_cue_json, ...songRest } = song;
    return {
      ...songRest,
      title_cue: safeParse(title_cue_json) || undefined,
      cues: db.prepare('SELECT label, text, sequence_order, bg_type, bg_value, duration, style_json FROM cues WHERE song_id = ? ORDER BY sequence_order ASC').all(song.id).map((row) => {
        const { style_json, ...rest } = row;
        return { ...(safeParse(style_json) || {}), ...rest };
      })
    };
  });
  return JSON.stringify(fullLibrary, null, 2);
}

export function importLibrary(jsonData) {
  try {
    const library = JSON.parse(jsonData);
    const insertSong = db.prepare('INSERT INTO songs (title, artist, category, is_favorite, bg_type, bg_value, audio_url, title_cue_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
    const insertCue = db.prepare('INSERT INTO cues (song_id, label, text, sequence_order, bg_type, bg_value, duration, style_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');

    db.transaction(() => {
      for (const song of library) {
        const res = insertSong.run(song.title, song.artist || 'Unknown', song.category || 'Worship', song.is_favorite || 0, song.bg_type || 'color', song.bg_value || '#000000', song.audio_url || null, song.title_cue ? JSON.stringify(song.title_cue) : null);
        const songId = res.lastInsertRowid;
        if (song.cues) {
          song.cues.forEach((cue, idx) => {
            insertCue.run(songId, cue.label, cue.text, cue.sequence_order || idx + 1, cue.bg_type || 'color', cue.bg_value || '#000000', cue.duration || 0, cueStyleJson(cue));
          });
        }
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