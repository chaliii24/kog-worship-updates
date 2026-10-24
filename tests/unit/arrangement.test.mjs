import test from 'node:test';
import assert from 'node:assert/strict';
import {
  songSectionRuns,
  resolveArrangementFlow,
  orderToFlow,
  summarizeArrangement,
} from '../../src/lib/arrangement.js';
import { flattenMedley } from '../../src/lib/medley.js';

// A tiny song with a repeated section: Chorus before and after Verse 2.
const song = {
  cues: [
    { id: 1, label: 'Verse 1 (Part 1)', text: 'v1' },
    { id: 2, label: 'Chorus (Part 1)', text: 'c1' },
    { id: 3, label: 'Verse 2 (Part 1)', text: 'v2' },
    { id: 4, label: 'Chorus (Part 1)', text: 'c2' },
  ],
};

test('section runs keep each repeated section separate', () => {
  const runs = songSectionRuns(song);
  assert.deepEqual(runs.map((r) => [r.part, r.occurrence, r.cueIds]), [
    ['Verse 1', 1, [1]],
    ['Chorus', 1, [2]],
    ['Verse 2', 1, [3]],
    ['Chorus', 2, [4]],
  ]);
});

test('section flow resolves in exact library order without doubling', () => {
  const flow = songSectionRuns(song).map((r) => ({ part: r.part, occurrence: r.occurrence }));
  assert.deepEqual(resolveArrangementFlow(song, { flow }), [1, 2, 3, 4]);
});

test('legacy name-only flow maps each repeat to the next occurrence', () => {
  const legacy = { flow: [{ part: 'Verse 1' }, { part: 'Chorus' }, { part: 'Verse 2' }, { part: 'Chorus' }] };
  assert.deepEqual(resolveArrangementFlow(song, legacy), [1, 2, 3, 4]);
});

test('an explicit occurrence repeats that exact run', () => {
  const flow = [
    { part: 'Chorus', occurrence: 1 },
    { part: 'Verse 1', occurrence: 1 },
    { part: 'Chorus', occurrence: 1 },
  ];
  assert.deepEqual(resolveArrangementFlow(song, { flow }), [2, 1, 2]);
});

test('legacy cue-id order converts to exact section occurrences', () => {
  assert.deepEqual(orderToFlow([1, 2, 3, 4], song), [
    { part: 'Verse 1', occurrence: 1 },
    { part: 'Chorus', occurrence: 1 },
    { part: 'Verse 2', occurrence: 1 },
    { part: 'Chorus', occurrence: 2 },
  ]);
});

test('a section added after save appends once; omitted known sections stay omitted', () => {
  const later = {
    cues: [
      ...song.cues,
      { id: 5, label: 'Bridge (Part 1)', text: 'new' },
    ],
  };
  const known = songSectionRuns(song).map((r) => ({ part: r.part, occurrence: r.occurrence }));
  const flow = [{ part: 'Verse 1', occurrence: 1 }, { part: 'Chorus', occurrence: 1 }, { part: 'Verse 2', occurrence: 1 }, { part: 'Chorus', occurrence: 2 }];
  assert.deepEqual(resolveArrangementFlow(later, { flow, known }), [1, 2, 3, 4, 5]);

  // Verse 2 existed at save time but the arranger left it out: it must stay out.
  const withoutV2 = { cues: [...song.cues] };
  const knownAll = songSectionRuns(song).map((r) => ({ part: r.part, occurrence: r.occurrence }));
  const onlyV1C = [{ part: 'Verse 1', occurrence: 1 }, { part: 'Chorus', occurrence: 1 }, { part: 'Chorus', occurrence: 2 }];
  assert.deepEqual(resolveArrangementFlow(withoutV2, { flow: onlyV1C, known: knownAll }), [1, 2, 4]);
});

test('summarizeArrangement resolves a legacy per-slide order safely', () => {
  assert.equal(summarizeArrangement([1, 2], song), 'V1 · C1');
});

test('a medley anchor arrangement plays exactly the saved order', () => {
  const def = { anchor: { songId: 1, includedParts: ['ALL'] }, links: [] };
  const songs = new Map([[1, { id: 1, title: 'Test', cues: song.cues }]]);
  // Verse 2 is deliberately omitted — flattening must not append it back.
  const slides = flattenMedley(def, songs, { 1: [1, 2, 4] });
  assert.deepEqual(slides.filter((s) => s.kind === 'cue').map((s) => s.cue.id), [1, 2, 4]);
});
