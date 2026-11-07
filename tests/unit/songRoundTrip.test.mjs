import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import * as nodeModule from 'node:module';

// =====================================================================
// SONG ROUND TRIP — export then import must give the song back unchanged.
//
// This runs the REAL database.js, not a copy of its SQL: 'electron' is
// resolved to a stub whose app.getPath('userData') points at a throwaway
// folder, so the production exportSongs()/importLibrary() pair works on a
// real SQLite file with no Electron, no renderer and no display.
//
// The assertion is deliberately total: the exported song and the imported
// song must be deep-equal apart from the three identity/timestamp columns a
// new row owns. Adding a column, or a cue field that the importer forgets,
// fails here instead of quietly changing the look of a song on the wall.
// =====================================================================

const TMP = path.resolve('tests/.tmp/song-round-trip');
// Deleted BEFORE the database opens: Windows keeps a handle on the file, so a
// teardown delete at the end of the test would fail on EPERM. Recreating at
// the start keeps exactly one throwaway folder around and never accumulates.
fs.rmSync(TMP, { recursive: true, force: true });
fs.mkdirSync(TMP, { recursive: true });
process.env.KOG_TEST_USERDATA = TMP;

const STUB = path.join(TMP, 'electron-stub.mjs');
fs.writeFileSync(
  STUB,
  `export const app = { getPath: () => ${JSON.stringify(TMP)} };\nexport default { app };\n`
);

const hasResolveHooks = typeof nodeModule.registerHooks === 'function';
if (hasResolveHooks) {
  nodeModule.registerHooks({
    resolve(specifier, context, nextResolve) {
      if (specifier === 'electron') return { url: pathToFileURL(STUB).href, shortCircuit: true };
      return nextResolve(specifier, context);
    },
  });
}

const db = hasResolveHooks ? await import('../../electron/database.js') : null;

// Every visual field a cue can carry, so a dropped one is visible here rather
// than on the projector. Kept deliberately wide: typography, colour, box,
// motion (slide/kinetic), cinematic fx, background treatment and the filmstrip
// flags.
const cueStyle = (n) => ({
  font: 'Bebas Neue',
  size: 96 + n,
  lineHeight: 1.1,
  letterSpacing: -1.5,
  align: 'left',
  valign: 'middle',
  color: '#ffe9c7',
  case: 'upper',
  bold: true,
  italic: false,
  underline: false,
  shadow: true,
  shadowColor: '#000000',
  shadowBlur: 22,
  shadowOffsetX: 3,
  shadowOffsetY: 5,
  gradient: true,
  gradientColor1: '#fff2cc',
  gradientColor2: '#ff5c00',
  gradientAngle: 135,
  outline: true,
  strokeColor: '#101010',
  strokeWidth: 2.5,
  glow: true,
  glowColor: '#ffb800',
  glowBlur: 24,
  highlight: true,
  hlColor: '#ffb800',
  hlOpacity: 55,
  box: { x: 90, y: 120, w: 1100, h: 420, angle: -2 },
  resizeMode: 'scale',
  fillMax: 180,
  layoutMode: 'ticker',
  tickerSpeed: 26,
  tickerDir: 'rtl',
  slideAnim: 'slide-up',
  slideSpeed: 0.8,
  autoNext: true,
  notes: 'watch the bridge',
  locked: true,
  hidden: false,
  kinetic: { preset: 'rise', stagger: 0.12, tracks: [{ text: 'Who Else', at: 0 }] },
  fx: { preset: 'glitch', intensity: 40, glow: '#00e5ff' },
  bg_fx: { preset: 'vignette', dim: 30, grade: 'teal' },
  ghost: { on: true, text: 'WHO ELSE', size: 380, strokeOnly: true },
  texts: [{ text: 'Part 2', box: { x: 800, y: 40, w: 400, h: 60 }, size: 34 }],
  bg_type: 'video',
  bg_value: 'media://bg-loop.mp4',
  bg_fit: 'cover',
  bg_dim: 25,
  bg_loop: true,
  bg_muted: true,
  bg_rate: 0.75,
  duration: 45,
});

const SONG = {
  title: 'Who Else',
  artist: 'Gateway Worship',
  category: 'Praise',
  bg_type: 'image',
  bg_value: 'media://who-else.jpg',
  audio_url: 'media://who-else.mp3',
  ccli: '7194821',
  arrangement: [
    { part: 'Verse 1', occurrence: 1 },
    { part: 'Chorus', occurrence: 1 },
    { part: 'Verse 1', occurrence: 2 },
  ],
  title_cue: {
    text: 'Who Else',
    font: 'CMG Sans Wide (Default)',
    size: 150,
    card: 'editorial',
    cardEvent: 'PASSION 2025',
    cardVenue: 'Atlanta, Georgia',
    cardColors: { venue: '#ffb800', rules: '#3b82f6' },
    box: { x: 34, y: 196, w: 600, h: 390 },
    fx: { preset: 'soft-glow' },
  },
  cues: [
    { label: 'Verse 1', text: 'Line one\nLine two', sequence_order: 1, ...cueStyle(1) },
    { label: 'Chorus', text: 'Chorus text', sequence_order: 2, ...cueStyle(2) },
  ],
};

const skip = hasResolveHooks
  ? false
  : 'node lacks module.registerHooks (Node >= 22.15) — needed to stand in for the electron module';

test('export → import gives the song back field for field', { skip }, () => {
  const id = db.saveSong(SONG);
  db.setSongBpm(id, 74);
  db.setSongChords(id, 'Verse: G C Em D', 'G');
  db.toggleFavorite(id);
  db.updateLastUsed(id);

  const exported = JSON.parse(db.exportSongs([id]).json);
  assert.equal(exported.length, 1);
  const original = exported[0];

  assert.equal(db.importLibrary(JSON.stringify(exported)), true, 'importLibrary accepted its own export');

  const importedId = Math.max(...db.getSongs('', 'All').map((s) => s.id));
  assert.notEqual(importedId, id, 'the import is a new song, not an update');

  const imported = JSON.parse(db.exportSongs([importedId]).json)[0];

  // A new row owns its identity and timestamps; everything else is the song.
  const strip = (s) => {
    const { id: _id, created_at: _c, updated_at: _u, ...rest } = s;
    return rest;
  };
  const a = strip(original);
  const b = strip(imported);
  for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) {
    assert.deepEqual(b[key], a[key], `song.${key} changed on import`);
  }

  // Spelled out, because these are the ones an operator notices first.
  assert.equal(imported.bpm, 74, 'the tempo came back');
  assert.equal(imported.last_used, original.last_used, 'the last-used stamp came back');
  assert.equal(imported.chord_chart, 'Verse: G C Em D');
  assert.equal(imported.chord_key, 'G');
  assert.equal(imported.is_favorite, 1);
  assert.deepEqual(imported.arrangement, SONG.arrangement);
  assert.equal(imported.title_cue.card, 'editorial');
  assert.deepEqual(imported.title_cue.cardColors, { venue: '#ffb800', rules: '#3b82f6' });
  assert.equal(imported.cues.length, 2);

  // Cue-level look: every key the editor wrote must still be there, with the
  // same values (this is what "the design came across" means).
  const byLabel = Object.fromEntries(imported.cues.map((c) => [c.label, c]));
  for (const source of SONG.cues) {
    const back = byLabel[source.label];
    assert.ok(back, `cue ${source.label} survived`);
    const carry = (cue) => {
      const { id: _id, song_id: _sid, ...rest } = cue;
      return rest;
    };
    assert.deepEqual(carry(back), carry(source), `cue ${source.label} changed on import`);
  }
});

test('a tempo pasted from an old backup is clamped, never trusted blindly', { skip }, () => {
  const id = db.saveSong({ title: 'Tempo Check', cues: [{ label: 'Verse 1', text: 'x' }] });
  db.setSongBpm(id, 500);
  const exported = JSON.parse(db.exportSongs([id]).json);
  assert.equal(exported[0].bpm, 220, 'the stored tempo is already clamped');

  // A hand-edited file can say anything; the importer must clamp it too, and
  // an empty value must come back as "unset", not as 40 BPM.
  exported[0].title = 'Tempo Check (edited)';
  exported[0].bpm = 9999;
  db.importLibrary(JSON.stringify(exported));
  let importedId = Math.max(...db.getSongs('', 'All').map((s) => s.id));
  assert.equal(JSON.parse(db.exportSongs([importedId]).json)[0].bpm, 220);

  exported[0].title = 'Tempo Check (blank)';
  exported[0].bpm = '';
  db.importLibrary(JSON.stringify(exported));
  importedId = Math.max(...db.getSongs('', 'All').map((s) => s.id));
  assert.equal(JSON.parse(db.exportSongs([importedId]).json)[0].bpm, null);
});
