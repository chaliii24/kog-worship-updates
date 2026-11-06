import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CASCADE_ALL,
  CASCADE_FONTS,
  CASCADE_SPEEDS,
  DEFAULT_CASCADE_MS,
  cascadeFontAt,
  cascadeOn,
  normalizeCascade,
} from '../../src/lib/fontCascade.js';

// The cascade is stored on the cue and read by the projector, so its contract
// (off means off, unknown faces never reach a font stack) is worth pinning.

test('a slide with no cascade keeps its single face', () => {
  assert.equal(normalizeCascade(null), null);
  assert.equal(normalizeCascade(undefined), null);
  // A bare config has no `on: false`, so it reads as switched on.
  assert.ok(normalizeCascade({}));
  assert.equal(cascadeOn(null), false);
  assert.equal(cascadeFontAt(null, 3), null);
});

test('switching it off means off, whatever else was saved', () => {
  assert.equal(normalizeCascade({ on: false, ms: 150, fonts: CASCADE_ALL }), null);
  assert.equal(cascadeOn({ on: false }), false);
});

test('the tick default is 150ms and is clamped to a visible range', () => {
  assert.equal(normalizeCascade({ on: true }).ms, DEFAULT_CASCADE_MS);
  assert.equal(normalizeCascade({ on: true, ms: 5 }).ms, 60);
  assert.equal(normalizeCascade({ on: true, ms: 9000 }).ms, 2000);
  assert.equal(normalizeCascade({ on: true, ms: 250 }).ms, 250);
  // Every offered speed survives normalisation unchanged.
  for (const ms of CASCADE_SPEEDS) assert.equal(normalizeCascade({ on: true, ms }).ms, ms);
});

test('unknown faces are dropped and a too-short list falls back to the palette', () => {
  const one = normalizeCascade({ on: true, fonts: ['nope'] });
  assert.deepEqual(one.ids, CASCADE_ALL);
  const some = normalizeCascade({ on: true, fonts: ['anton', 'bogus', 'impact'] });
  assert.deepEqual(some.ids, ['anton', 'impact']);
  assert.equal(some.fonts.length, 2);
  assert.deepEqual(some.labels, ['Anton', 'Impact']);
});

test('the tick wraps in both directions and returns a real stack', () => {
  const cascade = { on: true, fonts: ['anton', 'bebas'] };
  assert.match(cascadeFontAt(cascade, 0), /Anton/);
  assert.match(cascadeFontAt(cascade, 1), /Bebas Neue/);
  assert.match(cascadeFontAt(cascade, 2), /Anton/);
  assert.match(cascadeFontAt(cascade, -1), /Bebas Neue/);
  assert.match(cascadeFontAt(cascade, 101), /Bebas Neue/);
});

test('every palette entry has a label and a stack ending in a generic family', () => {
  for (const f of CASCADE_FONTS) {
    assert.ok(f.id && f.label);
    assert.match(f.stack, /(sans-serif|serif|cursive|monospace|fantasy)$/);
  }
});

test('Reenie Beanie is part of the palette and cycles with the rest', () => {
  const ids = CASCADE_FONTS.map((f) => f.id);
  assert.ok(ids.includes('reenie'));
  const cascade = normalizeCascade({ on: true });
  assert.ok(cascade.ids.includes('reenie'));
  assert.ok(cascade.labels.includes('Reenie Beanie'));
  assert.match(cascadeFontAt(cascade, cascade.fonts.length - 1), /Reenie Beanie/);
});
