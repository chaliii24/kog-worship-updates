import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import * as nodeModule from 'node:module';

// =====================================================================
// MEDIA REFERENCES — backup, restore and relink.
//
// A media:// URL is a pointer, not a file: it only resolves through the
// media_assets row that carries the operator's source path. These tests run the
// real database.js against a throwaway SQLite file (same electron stub as
// songRoundTrip.test.mjs) and pin three things that used to be silent:
//   1. a full backup carries the manifest, so a restore rebuilds the rows;
//   2. the legacy song-array backup still imports;
//   3. relinking moves the path and leaves the URL (every song's reference)
//      untouched, and clears the "source missing" flag.
// =====================================================================

const TMP = path.resolve('tests/.tmp/media-backup');
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
const skip = hasResolveHooks
  ? false
  : 'node lacks module.registerHooks (Node >= 22.15) — needed to stand in for the electron module';

const URL_A = 'media://kog-media/lib/aaaaaaaaaaaaaaaa.jpg';

test('a full backup carries the media manifest and restores the rows', { skip }, () => {
  const src = path.join(TMP, 'sunday-bg.jpg');
  fs.writeFileSync(src, 'not-a-real-jpeg');

  db.addMediaAsset(URL_A, 'image', 'sunday-bg.jpg', src);
  db.setMediaMeta(URL_A, { thumb: 'aaaaaaaaaaaaaaaa.jpg', width: 1920, height: 1080 });
  db.touchMediaAsset(URL_A);
  const before = db.getMediaAssetByUrl(URL_A);
  assert.equal(before.source_path, src, 'the source path is stored');

  const backup = JSON.parse(db.exportLibrary());
  assert.equal(backup.version, 2, 'the backup is the v2 object');
  assert.ok(Array.isArray(backup.songs), 'songs ride the object');
  const entry = backup.media.find((m) => m.url === URL_A);
  assert.ok(entry, 'the manifest lists the asset');
  assert.equal(entry.sourcePath, src);
  assert.equal(entry.thumb, 'aaaaaaaaaaaaaaaa.jpg');
  assert.equal(entry.width, 1920);
  assert.equal(entry.lastUsedAt, before.last_used_at, 'the recency stamp survives');

  // Simulate the restore: the row is gone, the backup is all that is left.
  db.deleteMediaAsset(URL_A);
  assert.equal(db.getMediaAssetByUrl(URL_A), null);

  assert.equal(db.importLibrary(JSON.stringify(backup)), true, 'the v2 backup imports');
  const after = db.getMediaAssetByUrl(URL_A);
  assert.ok(after, 'the asset row came back');
  assert.equal(after.source_path, src, 'so the background resolves again');
  assert.equal(after.thumb, 'aaaaaaaaaaaaaaaa.jpg');
  assert.equal(after.last_used_at, before.last_used_at);
});

test('the legacy song-array backup still imports', { skip }, () => {
  const legacy = JSON.stringify([{ title: 'Old Backup Song', cues: [{ label: 'Verse 1', text: 'x' }] }]);
  assert.equal(db.importLibrary(legacy), true, 'an array of songs is still accepted');
  const titles = db.getSongs('', 'All').map((s) => s.title);
  assert.ok(titles.includes('Old Backup Song'));
});

test('relinking changes the path only, and clears the missing flag', { skip }, () => {
  const moved = path.join(TMP, 'moved-bg.jpg');
  fs.writeFileSync(moved, 'not-a-real-jpeg');

  // The audit found the file gone.
  db.setMediaMissing(URL_A, true);
  const flagged = db.getMediaLibrary().find((a) => a.url === URL_A);
  assert.equal(flagged.missing, true, 'the tab can say "source missing"');

  assert.equal(db.setMediaSourcePath(URL_A, moved), true, 'the relink was stored');
  const row = db.getMediaAssetByUrl(URL_A);
  assert.equal(row.source_path, moved, 'the path moved');
  assert.equal(row.url, URL_A, 'the URL songs reference did NOT change');
  assert.equal(row.missing_at, null, 'the missing flag cleared on relink');

  // A re-pick of the same file resolves to this row, not a duplicate tile.
  const byPath = db.getMediaAssetBySourcePath(moved);
  assert.equal(byPath && byPath.url, URL_A);
  assert.deepEqual(db.getMediaAssetBySourcePath(moved.toUpperCase()), byPath, 'Windows paths compare case-insensitively');

  const library = db.getMediaLibrary().find((a) => a.url === URL_A);
  assert.equal(library.missing, false);
  assert.equal(library.sourcePath, moved, 'the tile can show where the file lives');
});

test('the audit sees legacy copies and their cached still names', { skip }, () => {
  // A pre-reference import has a row but no source_path: its bytes are the
  // app's own copy in userData/media. The audit must still be able to say the
  // file is gone, and the storage sweep needs the still name to keep it.
  const legacyUrl = 'media://kog-media/legacy-copy.jpg';
  db.addMediaAsset(legacyUrl, 'image', 'legacy-copy.jpg', null);
  db.setMediaMeta(legacyUrl, { thumb: 'legacy-copy.jpg' });

  const row = db.getMediaSourceRows().find((r) => r.url === legacyUrl);
  assert.ok(row, 'a row with no source_path is still reported');
  assert.equal(row.source_path, null);
  assert.equal(row.thumb, 'legacy-copy.jpg', 'its still name rides along for the sweep');
});

test('a manifest entry with a path separator in its thumb name is refused', { skip }, () => {
  const url = 'media://kog-media/lib/bbbbbbbbbbbbbbbb.jpg';
  db.addMediaAsset(url, 'image', 'evil.jpg', path.join(TMP, 'evil.jpg'));
  db.importLibrary(JSON.stringify({
    version: 2,
    songs: [],
    media: [{ url, kind: 'image', name: 'evil.jpg', sourcePath: path.join(TMP, 'evil.jpg'), thumb: '../../escape.jpg' }],
  }));
  assert.equal(db.getMediaAssetByUrl(url).thumb, null, 'a thumb name can never carry a path');
});
