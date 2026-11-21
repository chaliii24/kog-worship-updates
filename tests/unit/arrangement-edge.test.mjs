import test from 'node:test';
import assert from 'node:assert/strict';
import {
  songSectionRuns,
  sequenceToFlow,
  songSequenceCues,
  resolveArrangementFlow,
  summarizeArrangement,
  splitCuesToLineChunks,
  abbrevSection,
} from '../../src/lib/arrangement.js';
import { flattenMedley, parseMedleyDef, medleyIndexOf, medleyTitleId } from '../../src/lib/medley.js';

// A song whose sections use the "Verse 1a" trailing-letter style the editor's
// normalizer folds onto "Verse 1".
const letterSong = {
  cues: [
    { id: 11, label: 'Verse 1a', text: 'a' },
    { id: 12, label: 'Chorus', text: 'c' },
    { id: 13, label: 'Verse 1b', text: 'b' },
  ],
};

test('a label sequence in the "Verse 1a" style survives sequenceToFlow', () => {
  const song = { ...letterSong, arrangement: ['Verse 1a', 'Chorus', 'Verse 1b'] };
  // Playback resolves it (songSequenceCues folds the suffix)...
  assert.deepEqual(songSequenceCues(song).map((c) => c.id), [11, 12, 13]);
  // ...so the editor must show the same three blocks.
  const flow = sequenceToFlow(song);
  assert.equal(flow.length, 3, 'sequenceToFlow dropped suffixed sections');
  // "Verse 1a" is run 1 of the section, "Verse 1b" run 2 — the occurrence
  // numbers the stored blocks so the two real verses stay distinct.
  assert.deepEqual(flow.map((f) => f.occurrence), [1, 1, 2]);
});

test('sequenceToFlow and songSequenceCues always describe the same flow', () => {
  const cases = [
    { ...letterSong, arrangement: ['Chorus', 'Verse 1a'] },
    { cues: [{ id: 1, label: 'Verse 1 (Part 1)' }, { id: 2, label: 'Chorus' }, { id: 3, label: 'Verse 1 (Part 2)' }], arrangement: ['Verse 1', 'Chorus'] },
    { cues: [{ id: 1, label: 'Intro' }, { id: 2, label: 'Verse 1' }, { id: 3, label: 'Chorus' }], arrangement: [{ part: 'Chorus', occurrence: 1 }, { part: 'Intro', occurrence: 1 }] },
  ];
  for (const song of cases) {
    const flow = sequenceToFlow(song);
    const runs = songSectionRuns(song);
    const flowSlides = flow.reduce((n, e) => {
      const list = runs.filter((r) => String(r.part).trim().toLowerCase() === String(e.part).trim().toLowerCase());
      return n + (list[Math.min(e.occurrence - 1, list.length - 1)]?.cues.length || 0);
    }, 0);
    assert.equal(flowSlides, songSequenceCues(song).length, `flow/playback disagree for ${JSON.stringify(song.arrangement)}`);
  }
});

test('a stored flow survives a label rename that only changes the part suffix', () => {
  const song = { ...letterSong, arrangement: [{ part: 'Verse 1', occurrence: 1 }, { part: 'Chorus', occurrence: 1 }] };
  // The stored block says "Verse 1" while the run is "Verse 1a": the same
  // section, so it must still play rather than silently vanish.
  assert.deepEqual(songSequenceCues(song).map((c) => c.id), [11, 12]);
});

test('resolveArrangementFlow plays exactly the stored flow, repeats included', () => {
  const song = {
    cues: [
      { id: 1, label: 'Verse 1' },
      { id: 2, label: 'Chorus' },
      { id: 3, label: 'Bridge' },
    ],
  };
  const flow = [
    { part: 'Chorus', occurrence: 1 },
    { part: 'Verse 1', occurrence: 1 },
    { part: 'Chorus', occurrence: 1 },
  ];
  assert.deepEqual(resolveArrangementFlow(song, { flow }), [2, 1, 2]);
  // Documented fallback: a flow whose sections are ALL gone resolves to the
  // library order (App then prefers the song's own sequence). It must never
  // resolve to an empty screen mid-service.
  assert.deepEqual(resolveArrangementFlow(song, { flow: [{ part: 'Gone', occurrence: 1 }], known: [] }), [1, 2, 3]);
});

test('medley: a missing includedParts must not throw', () => {
  const songs = new Map([[1, { id: 1, title: 'A', cues: [{ id: 1, label: 'Verse 1' }] }]]);
  const slides = flattenMedley({ anchor: { songId: 1 }, links: [] }, songs);
  assert.deepEqual(slides.map((s) => s.kind), ['title', 'cue']);
});

test('medley: link parts play in pick order, song order inside each part', () => {
  const song = {
    id: 2,
    title: 'B',
    cues: [
      { id: 21, label: 'Verse 1' },
      { id: 22, label: 'Chorus' },
      { id: 23, label: 'Verse 2' },
      { id: 24, label: 'Chorus (Part 2)' },
    ],
  };
  const songs = new Map([[1, { id: 1, title: 'A', cues: [{ id: 1, label: 'Verse 1' }] }], [2, song]]);
  const def = {
    anchor: { songId: 1, includedParts: ['ALL'] },
    links: [{ songId: 2, includedParts: ['Chorus', 'Verse 1'], skipTitleSlide: true }],
  };
  const cues = flattenMedley(def, songs).filter((s) => s.kind === 'cue').map((s) => s.cue.id);
  assert.deepEqual(cues, [1, 22, 24, 21]);
});

test('medley: a song-level sequence rides through ordersBySong', () => {
  const song = { id: 2, title: 'B', cues: [{ id: 21, label: 'Verse 1' }, { id: 22, label: 'Chorus' }] };
  const songs = new Map([[1, { id: 1, title: 'A', cues: [{ id: 1, label: 'Verse 1' }] }], [2, song]]);
  const def = { anchor: { songId: 1, includedParts: ['ALL'] }, links: [{ songId: 2, includedParts: ['ALL'], skipTitleSlide: true }] };
  const cues = flattenMedley(def, songs, { 2: [22, 21] }).filter((s) => s.kind === 'cue').map((s) => s.cue.id);
  assert.deepEqual(cues, [1, 22, 21]);
});

test('medley: numeric, string and numeric-string ids all resolve', () => {
  const songs = new Map([[42, { id: 42, title: 'X', cues: [{ id: 1, label: 'Verse 1' }] }]]);
  for (const id of [42, '42', 42.0]) {
    const slides = flattenMedley({ anchor: { songId: id, includedParts: ['ALL'] }, links: [] }, songs);
    assert.equal(slides.length, 2, `id ${JSON.stringify(id)} failed`);
  }
});

test('medley: a ticked part also catches suffixed slides of that section', () => {
  const songs = new Map([
    [1, { id: 1, title: 'A', cues: [{ id: 1, label: 'Verse 1' }] }],
    [2, { id: 2, title: 'B', cues: [{ id: 21, label: 'Verse 1a' }, { id: 22, label: 'Chorus' }] }],
  ]);
  const def = { anchor: { songId: 1, includedParts: ['ALL'] }, links: [{ songId: 2, includedParts: ['Verse 1'], skipTitleSlide: true }] };
  assert.deepEqual(flattenMedley(def, songs).filter((s) => s.kind === 'cue').map((s) => s.cue.id), [1, 21]);
});

test('medley navigation uses the session index for repeated slides', () => {
  const slides = [
    { kind: 'title', songId: 1, cue: { id: medleyTitleId(1) } },
    { kind: 'cue', songId: 1, cue: { id: 7, label: 'Verse 1' } },
    { kind: 'cue', songId: 1, cue: { id: 8, label: 'Chorus' } },
    { kind: 'cue', songId: 1, cue: { id: 7, label: 'Verse 1' } },
    { kind: 'cue', songId: 1, cue: { id: 8, label: 'Chorus' } },
  ];
  // Cue 7 repeated at index 3: with the session index the flow continues
  // forwards; a bare findIndex would answer 1 and walk backwards forever.
  assert.equal(medleyIndexOf(slides, 7, 3), 3);
  assert.equal(medleyIndexOf(slides, 8, 4), 4);
  // Stale index (the operator fired something else): identity wins.
  assert.equal(medleyIndexOf(slides, 8, 0), 2);
  assert.equal(medleyIndexOf(slides, medleyTitleId(1), null), 0);
  assert.equal(medleyIndexOf(slides, 999, 2), -1);
});

test('medley: content parsing normalizes parts and rejects junk', () => {
  const def = parseMedleyDef({ content: JSON.stringify({ anchor: { songId: 5, includedParts: [] }, links: [{ songId: 6 }] }) });
  assert.deepEqual(def.anchor.includedParts, ['ALL']);
  assert.equal(def.links[0].skipTitleSlide, true);
  assert.equal(parseMedleyDef({ content: '{oops' }), null);
  assert.equal(parseMedleyDef({ content: '' }), null);
});

test('tidy chunks keep section identity and line counts', () => {
  const cues = [
    { id: 1, label: 'Verse 1', text: 'a\nb\nc\nd\ne\nf' },
    { id: 2, label: 'Chorus (Part 2)', text: 'x\ny' },
  ];
  const chunks = splitCuesToLineChunks(cues, 3);
  assert.deepEqual(chunks.map((c) => c.label), ['Verse 1 (Part 1)', 'Verse 1 (Part 2)', 'Chorus']);
  assert.deepEqual(chunks.map((c) => c.text.split('\n').length), [3, 3, 2]);
  assert.ok(chunks.every((c) => c.id === undefined));
});

test('abbrevSection keeps part numbers and survives odd labels', () => {
  assert.equal(abbrevSection('Chorus (Part 2)'), 'C2');
  assert.equal(abbrevSection('Verse 12'), 'V12');
  assert.equal(abbrevSection(''), '•');
  assert.equal(abbrevSection(null), '•');
});

test('summarizeArrangement ignores deleted cue ids', () => {
  const song = { cues: [{ id: 1, label: 'Verse 1' }, { id: 2, label: 'Chorus' }] };
  assert.equal(summarizeArrangement([2, 99, 1], song), 'C · V1');
});
