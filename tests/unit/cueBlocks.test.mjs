import test from 'node:test';
import assert from 'node:assert/strict';
import { cuesInBlock } from '../../src/lib/cueBlocks.js';

// Same normalisation App's baseGroupLabel does for a plain section name.
const labelOf = (cue) => String((cue && cue.label) || '').replace(/\s*\(Part\s+\d+\)\s*$/i, '').trim();

const song = () => [
  { label: 'Verse 1' },
  { label: 'Verse 1 (Part 2)' },
  { label: 'Chorus 1' },
  { label: 'Verse 1' },
  { label: 'Chorus 1' },
  { label: 'Bridge' },
];

test('a block is every slide that shares the open slide section', () => {
  const cues = song();
  assert.deepEqual(cuesInBlock(cues, 0, labelOf), [0, 1, 3]);
  assert.deepEqual(cuesInBlock(cues, 2, labelOf), [2, 4]);
  assert.deepEqual(cuesInBlock(cues, 5, labelOf), [5]);
});

test('an unlabelled slide only matches other unlabelled slides', () => {
  const cues = [{ text: 'a' }, { label: 'Verse 1' }, { text: 'b' }];
  assert.deepEqual(cuesInBlock(cues, 0, labelOf), [0, 2]);
});

test('out-of-range, empty and malformed input returns no targets', () => {
  assert.deepEqual(cuesInBlock(song(), -1, labelOf), []);
  assert.deepEqual(cuesInBlock(song(), 9, labelOf), []);
  assert.deepEqual(cuesInBlock([], 0, labelOf), []);
  assert.deepEqual(cuesInBlock(null, 0, labelOf), []);
});

test('without a label function every slide is one block', () => {
  assert.deepEqual(cuesInBlock([{ label: 'Chorus 1' }, { label: 'Verse 1' }], 0), [0, 1]);
});
