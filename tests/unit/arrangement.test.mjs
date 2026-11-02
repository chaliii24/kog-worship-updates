import test from 'node:test';
import assert from 'node:assert/strict';
import {
  songSectionRuns,
  resolveArrangementFlow,
  orderToFlow,
  summarizeArrangement,
  songSlideTotal,
  sequenceToFlow,
  songSequenceCues,
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

test('the song sequence converts to exact section blocks', () => {
  assert.deepEqual(sequenceToFlow({ ...song, arrangement: ['Verse 1', 'Chorus', 'Chorus', 'Verse 2'] }), [
    { part: 'Verse 1', occurrence: 1 },
    { part: 'Chorus', occurrence: 1 },
    { part: 'Chorus', occurrence: 2 },
    { part: 'Verse 2', occurrence: 1 },
  ]);
  // No saved sequence: [] so the caller keeps its own fallback.
  assert.deepEqual(sequenceToFlow(song), []);
  // A label that no longer exists is skipped, never fatal.
  assert.deepEqual(sequenceToFlow({ ...song, arrangement: ['Bridge'] }), []);
});

test('a song storing a flow keeps exact occurrences and its own order', () => {
  // Phase 2: the song stores the SAME {part, occurrence} flow a service row
  // stores, so "Chorus #2" is an explicit block instead of the Nth mention of
  // a label. The stored order wins — including a chorus before verse 1.
  const stored = [
    { part: 'Chorus', occurrence: 2 },
    { part: 'Verse 1', occurrence: 1 },
    { part: 'Chorus', occurrence: 1 },
  ];
  const flowSong = { ...song, arrangement: stored };
  assert.deepEqual(sequenceToFlow(flowSong), stored);
  assert.deepEqual(songSequenceCues(flowSong).map((c) => c.id), [4, 1, 2]);
  assert.equal(songSlideTotal(flowSong), 4);

  // An occurrence the song no longer has clamps to its last run rather than
  // dropping the block; a section gone from the song is skipped.
  const stale = { ...song, arrangement: [
    { part: 'Chorus', occurrence: 9 },
    { part: 'Bridge', occurrence: 1 },
    { part: 'Verse 2', occurrence: 1 },
  ] };
  assert.deepEqual(sequenceToFlow(stale), [
    { part: 'Chorus', occurrence: 2 },
    { part: 'Verse 2', occurrence: 1 },
  ]);
  assert.deepEqual(songSequenceCues(stale).map((c) => c.id), [4, 3]);

  // The legacy label list still resolves on the Nth-mention rule.
  assert.deepEqual(songSequenceCues({ ...song, arrangement: ['Chorus', 'Chorus'] }).map((c) => c.id), [2, 4]);
});

test('slide totals follow the song sequence, not just the cue list', () => {
  // Title card + the four cues when no sequence is saved.
  assert.equal(songSlideTotal(song), 5);
  // A sequence that leaves Verse 2 out plays two slides: title + 2, not 5.
  assert.equal(songSlideTotal({ ...song, arrangement: ['Verse 1', 'Chorus'] }), 3);
  // Three chorus mentions resolve to both real runs (the third clamps): 4.
  assert.equal(songSlideTotal({ ...song, arrangement: ['Chorus', 'Chorus', 'Chorus'] }), 4);
  // A title card still counts when the song has no slides at all.
  assert.equal(songSlideTotal({ cues: [] }), 1);
  assert.equal(songSlideTotal(null), 0);
});

test('a medley anchor arrangement plays exactly the saved order', () => {
  const def = { anchor: { songId: 1, includedParts: ['ALL'] }, links: [] };
  const songs = new Map([[1, { id: 1, title: 'Test', cues: song.cues }]]);
  // Verse 2 is deliberately omitted — flattening must not append it back.
  const slides = flattenMedley(def, songs, { 1: [1, 2, 4] });
  assert.deepEqual(slides.filter((s) => s.kind === 'cue').map((s) => s.cue.id), [1, 2, 4]);
});
