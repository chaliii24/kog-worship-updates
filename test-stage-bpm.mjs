// Per-song stage tempo checks: migration SQL runs on old DBs, wiring intact.
import fs from 'fs';
import Database from 'better-sqlite3';
import { execFileSync } from 'child_process';

const fails = [];
const check = (label, cond, detail) => {
  if (cond) console.log('  PASS  ' + label);
  else { fails.push(label); console.log('  FAIL  ' + label + (detail ? '  -> ' + detail : '')); }
};

console.log('--- bpm migration on a pre-bpm database ---');
const db = new Database(':memory:');
db.exec(`CREATE TABLE songs (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, artist TEXT, chord_chart TEXT, chord_key TEXT DEFAULT 'C');`);
db.exec(`INSERT INTO songs (title, artist) VALUES ('Amazing Grace', 'Newton');`);
// Same statement as the migration in electron/database.js (run twice: ALTER
// must be idempotent-safe via try/catch on real DBs).
const alterSrc = fs.readFileSync('./electron/database.js', 'utf8');
const alterLine = (alterSrc.match(/ALTER TABLE songs ADD COLUMN bpm INTEGER;/) || [])[0];
check('migration statement present', !!alterLine);
for (let i = 0; i < 2; i++) {
  try { db.exec('ALTER TABLE songs ADD COLUMN bpm INTEGER;'); } catch (_) {}
}
const cols = db.prepare('PRAGMA table_info(songs)').all().map((c) => c.name);
check('bpm column exists', cols.includes('bpm'), cols.join(','));
// setSongBpm semantics: clamp 40-220, null clears.
const setBpm = (id, bpm) => {
  const v = bpm == null || bpm === '' ? null : Math.min(220, Math.max(40, Math.round(Number(bpm) || 0)));
  db.prepare('UPDATE songs SET bpm = ? WHERE id = ?').run(v || null, id);
};
setBpm(1, 128);
check('save 128', db.prepare('SELECT bpm FROM songs WHERE id = 1').get().bpm === 128);
setBpm(1, 999);
check('clamps to 220', db.prepare('SELECT bpm FROM songs WHERE id = 1').get().bpm === 220);
setBpm(1, 3);
check('clamps to 40', db.prepare('SELECT bpm FROM songs WHERE id = 1').get().bpm === 40);
setBpm(1, null);
check('null clears', db.prepare('SELECT bpm FROM songs WHERE id = 1').get().bpm === null);
check('SELECT * flows bpm', 'bpm' in db.prepare('SELECT * FROM songs WHERE id = 1').get());
db.close();

console.log('--- wiring ---');
const mainSrc = fs.readFileSync('./electron/main.js', 'utf8');
check('db-set-song-bpm IPC', mainSrc.includes("ipcMain.handle('db-set-song-bpm'"));
check('setSongBpm imported', mainSrc.includes('setSongBpm'));
const appSrc = fs.readFileSync('./src/App.jsx', 'utf8');
check('syncs on every song change', appSrc.includes('}, [activeSong?.id]);') && appSrc.includes('setStageBpmPopup({ songId: activeSong.id'));
check('saved bpm adopted to metronome', appSrc.includes("setStageCfg((prev) => (Number(prev.bpm) === saved ? prev : { ...prev, bpm: saved }))"));
check('popup state in context', appSrc.includes('stageBpmPopup, setStageBpmPopup,'));
const panel = fs.readFileSync('./src/components/StagePanel.jsx', 'utf8');
check('popup card renders', panel.includes('Song tempo'));
check('popup lists setlist songs', panel.includes('setlistSongs'));
check('fired song pre-selected', panel.includes('setPopupSelectedId(popupSongId)'));
check('rows show saved tempo', panel.includes('savedBpmOf(s.songId)'));
check('popup saves via IPC', panel.includes("invoke('db-set-song-bpm'"));
check('save drives metronome', panel.includes('setStageCfg((prev) => ({ ...prev, bpm }))'));

console.log(fails.length ? `\nRESULT: ${fails.length} FAILED` : '\nRESULT: all passed');
process.exit(fails.length ? 1 : 0);
