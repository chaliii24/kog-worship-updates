import test from 'node:test';
import assert from 'node:assert/strict';
import { applyLookToSong } from '../../src/lib/lookApply.js';

// The footer's APPLY TO. `refit` and `restyle` are the renderer's text fitter
// and per-line scale copier; stubbed here so the test asserts the mapping,
// scoping and immutability that the bug reports were about.
const refit = (c) => ({ ...c, box: { ...(c.box || { x: 0, y: 0, w: 1280, h: 720 }) } });
const restyle = (_src, target) => target;

const songDoc = () => ({
  id: 7,
  title: 'Amazing Grace',
  title_cue: { text: 'Amazing Grace', font: 'Old', size: 60, box: { x: 0, y: 0, w: 10, h: 10 } },
  cues: [
    { text: 'Amazing grace', box: { x: 1, y: 1, w: 100, h: 100 } },
    { text: 'how sweet', font: 'Other', size: 44, box: { x: 2, y: 2, w: 90, h: 90 } },
    { text: 'the sound' },
  ],
});

const source = {
  text: 'AMAZING GRACE',
  font: 'Big Face',
  size: 96,
  lineHeight: 1.2,
  color: '#f5f5f4',
  box: { x: 80, y: 100, w: 1120, h: 480 },
  resizeMode: 'fit',
};

test('apply to all copies type and box onto every slide, title keeps its own words', () => {
  const before = songDoc();
  const out = applyLookToSong(before, { sourceCue: source, scope: 'all', refit, restyle });

  assert.notEqual(out, before, 'a new song object, so React re-renders');
  assert.equal(out.cues.length, 3);
  for (const c of out.cues) {
    assert.equal(c.font, 'Big Face');
    assert.equal(c.size, 96);
    assert.equal(c.lineHeight, 1.2);
    assert.equal(c.resizeMode, 'fit');
    assert.deepEqual(c.box, { x: 80, y: 100, w: 1120, h: 480 });
  }
  assert.equal(out.title_cue.font, 'Big Face');
  assert.equal(out.title_cue.text, 'Amazing Grace', 'lyric line-scales must never touch the title');
  // The draft it read from is untouched (functional updates depend on this).
  assert.equal(before.cues[1].font, 'Other');
  assert.deepEqual(before.cues[1].box, { x: 2, y: 2, w: 90, h: 90 });
});

test('selected scope writes only the ticked slides', () => {
  const out = applyLookToSong(songDoc(), { sourceCue: source, scope: 'selected', hit: [1], refit, restyle });
  assert.equal(out.cues[0].font, undefined);
  assert.equal(out.cues[1].font, 'Big Face');
  assert.equal(out.cues[2].font, undefined);
  assert.equal(out.title_cue.font, 'Old', 'the title is untouched when it is not ticked');
});

test('the title is only restyled when it is part of the target', () => {
  const out = applyLookToSong(songDoc(), { sourceCue: source, scope: 'selected', hit: [-1], refit, restyle });
  assert.equal(out.title_cue.font, 'Big Face');
  assert.equal(out.cues[0].font, undefined);
  assert.equal(out.cues[1].font, 'Other');
});

test('a source with no box never wipes the target box or writes NaN', () => {
  // No refit at all: the mapping itself must not invent a box or write
  // `box: undefined` over a target that already had one.
  const plain = applyLookToSong(songDoc(), { sourceCue: { text: 'x', font: 'F' }, scope: 'all' });
  assert.ok(!('box' in plain.cues[2]), 'a slide with no box keeps having none');
  assert.deepEqual(plain.cues[1].box, { x: 2, y: 2, w: 90, h: 90 }, 'an existing box is kept');
  const fitted = applyLookToSong(songDoc(), { sourceCue: { text: 'x', font: 'F' }, scope: 'all', refit });
  for (const c of fitted.cues) {
    assert.ok(Number.isFinite(c.box.w) && Number.isFinite(c.box.h), 'finite geometry');
  }
});

test('nothing to read from is a no-op, not a crash', () => {
  const doc = songDoc();
  assert.equal(applyLookToSong(doc, { sourceCue: null, scope: 'all' }), doc);
  assert.equal(applyLookToSong(null, { sourceCue: source, scope: 'all' }), null);
});

test('a song with no slides only restyles the title', () => {
  const doc = { title_cue: { text: 'Intro' }, cues: [] };
  const out = applyLookToSong(doc, { sourceCue: source, scope: 'all', refit, restyle });
  assert.equal(out.title_cue.font, 'Big Face');
  assert.deepEqual(out.cues, []);
});
