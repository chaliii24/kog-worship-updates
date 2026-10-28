import test from 'node:test';
import assert from 'node:assert/strict';
import {
  FIRST_RUN_MARKER,
  SERVICE_DRAFT_KEY,
  SONG_DRAFT_KEY,
  detectFirstRunBoot,
} from '../../src/lib/firstRun.js';

// Minimal localStorage stand-in: values are strings, missing key -> null.
const makeStorage = (initial = {}) => {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => { map.set(key, String(value)); },
    removeItem: (key) => { map.delete(key); },
    has: (key) => map.has(key),
  };
};

test('an empty profile opens as first run exactly once', () => {
  const storage = makeStorage();
  assert.equal(detectFirstRunBoot(storage), true);
  // The marker is written, so the next launch is a normal boot.
  assert.equal(storage.getItem(FIRST_RUN_MARKER), '1');
  assert.equal(detectFirstRunBoot(storage), false);
});

test('a used profile is never treated as first run and keeps its data', () => {
  for (const key of ['kog-theme', 'kog_countdown', 'kog_output_aspect', 'kog_grid_density', 'kog_countdown_templates']) {
    const storage = makeStorage({ [key]: 'something' });
    assert.equal(detectFirstRunBoot(storage), false, `${key} means this install has been used`);
    assert.equal(storage.getItem(key), 'something', `${key} must be preserved`);
    assert.equal(storage.getItem(FIRST_RUN_MARKER), '1');
  }
});

test('leftover drafts or a stage config mean the install already ran', () => {
  for (const key of [SERVICE_DRAFT_KEY, SONG_DRAFT_KEY, 'kog_stage_cfg']) {
    const storage = makeStorage({ [key]: '{"bpm":128}' });
    assert.equal(detectFirstRunBoot(storage), false);
    assert.equal(storage.getItem(key), '{"bpm":128}', `${key} must not be wiped`);
  }
});

test('an already-marked profile stays normal even with no settings left', () => {
  const storage = makeStorage({ [FIRST_RUN_MARKER]: '1' });
  assert.equal(detectFirstRunBoot(storage), false);
  assert.equal(storage.getItem(FIRST_RUN_MARKER), '1');
});

test('a broken storage never throws and falls back to a normal boot', () => {
  const throwing = {
    getItem: () => { throw new Error('denied'); },
    setItem: () => { throw new Error('denied'); },
    removeItem: () => { throw new Error('denied'); },
  };
  assert.equal(detectFirstRunBoot(throwing), false);
  assert.equal(detectFirstRunBoot(null), false);
  assert.equal(detectFirstRunBoot(undefined), false);
});
