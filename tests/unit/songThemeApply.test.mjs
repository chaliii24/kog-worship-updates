import test from 'node:test';
import assert from 'node:assert/strict';
import { applySongThemeToSong, SONG_THEMES } from '../../src/lib/songThemes.js';

const theme = SONG_THEMES[0];

const songDoc = () => ({
  id: 7,
  title: 'Song',
  bg_type: 'color',
  bg_value: '#111111',
  title_cue: { text: 'Song', font: 'Old' },
  cues: [{ text: 'one' }, { text: 'two', font: 'Other' }],
});

test('apply to all styles every slide and never rewrites words', () => {
  const before = songDoc();
  const out = applySongThemeToSong(before, theme, { scope: 'all', includeBg: true });

  assert.notEqual(out, before);
  for (const c of out.cues) {
    assert.equal(c.font, theme.style.font);
    assert.ok(Number.isFinite(c.box.w) && Number.isFinite(c.box.h));
  }
  assert.equal(out.cues[0].text, 'one');
  assert.equal(out.title_cue.text, 'Song');
  assert.equal(out.title_cue.font, theme.style.font);
  assert.equal(before.cues[1].font, 'Other', 'the draft it read is untouched');
});

test('the theme background goes on the song, never as an override on every slide', () => {
  const out = applySongThemeToSong(songDoc(), theme, { scope: 'all', includeBg: true });
  assert.equal(out.bg_type, theme.style.bgType || 'color');
  assert.equal(out.bg_value, theme.style.bgValue || '#000000');
  // Regression: writing bg onto each cue turned every slide into an override,
  // so the song background (and every later pick in Slide Setup) changed
  // nothing on screen.
  for (const c of out.cues) {
    assert.equal(c.bg_type, undefined);
    assert.equal(c.bg_value, undefined);
  }
});

test('includeBg off touches neither the song nor the slides background', () => {
  const out = applySongThemeToSong(songDoc(), theme, { scope: 'all', includeBg: false });
  assert.equal(out.bg_type, 'color');
  assert.equal(out.bg_value, '#111111');
  assert.equal(out.cues[0].font, theme.style.font, 'the look still travels');
});

test('this-slide scope writes one cue, as its own background override', () => {
  const out = applySongThemeToSong(songDoc(), theme, { scope: 'this', cueIdx: 1, includeBg: true });
  assert.equal(out.cues[0].font, undefined);
  assert.equal(out.cues[1].font, theme.style.font);
  assert.equal(out.cues[1].bg_type, theme.style.bgType || 'color');
  assert.equal(out.bg_type, 'color', 'the song background is left alone');
  assert.equal(out.title_cue.font, 'Old');
});

test('missing theme or song is a no-op', () => {
  const doc = songDoc();
  assert.equal(applySongThemeToSong(doc, null, {}), doc);
  assert.equal(applySongThemeToSong(null, theme, {}), null);
  assert.equal(applySongThemeToSong(doc, { id: 'x' }, {}), doc);
});
