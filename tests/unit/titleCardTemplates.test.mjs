import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_TITLE_CARD,
  TITLE_CARD_BOX,
  TITLE_CARD_TEMPLATES,
  titleCardOf,
  titleCardIsClassic,
  titleCardChrome,
  titleCardCue,
} from '../../src/lib/titleCardTemplates.js';

// The card templates are plain data plus two pure helpers, so the rules the
// wall relies on are checkable without Electron: which framing is drawn, when
// a caption is suppressed, and what a pick leaves on title_cue.

test('every template has a unique id and a cue box on the design canvas', () => {
  const ids = TITLE_CARD_TEMPLATES.map((t) => t.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(ids.includes(DEFAULT_TITLE_CARD));
  for (const t of TITLE_CARD_TEMPLATES) {
    assert.equal(typeof t.label, 'string');
    assert.ok(t.cue && t.cue.box, `${t.id} has no cue box`);
    for (const k of ['x', 'y', 'w', 'h']) assert.equal(typeof t.cue.box[k], 'number', `${t.id}.box.${k}`);
  }
});

test('unknown or missing card ids fall back to Classic', () => {
  assert.equal(titleCardOf('nope').id, 'classic');
  assert.equal(titleCardOf(undefined).id, 'classic');
  assert.equal(titleCardOf({}).id, 'classic');
  assert.equal(titleCardOf({ card: 'editorial' }).id, 'editorial');
});

test('Classic is the only template without chrome', () => {
  assert.equal(titleCardIsClassic('classic'), true);
  assert.equal(titleCardIsClassic({ card: 'classic' }), true);
  assert.equal(titleCardIsClassic('editorial'), false);
  assert.equal(titleCardChrome('classic', { artist: 'KOG Worship', venue: 'Main' }), null);
});

test('chrome resolves the operator words into the template slots', () => {
  const chrome = titleCardChrome('editorial', {
    artist: 'KOG Worship',
    event: 'PASSION 2025',
    venue: 'Main Auditorium',
  });
  assert.ok(chrome);
  const byKey = Object.fromEntries(chrome.slots.map((s) => [s.key, s]));
  assert.equal(byKey.artist.text, 'KOG Worship');
  assert.equal(byKey.event.text, 'PASSION 2025');
  assert.equal(byKey.event.caption, 'LIVE FROM');
  assert.equal(byKey.venue.text, 'Main Auditorium');
  assert.ok(chrome.rules.length > 0);
});

test('empty slots and their captions are dropped, never drawn blank', () => {
  const chrome = titleCardChrome('editorial', { artist: '  ', event: '', venue: '' });
  assert.ok(chrome, 'the rules still draw for an empty card');
  assert.deepEqual(chrome.slots, []);
});

test('a caption is suppressed when the line already starts with it', () => {
  for (const event of ['LIVE FROM PASSION 2025', 'live from passion 2025', '  Live From Passion 2025']) {
    const chrome = titleCardChrome('lower-third', { event });
    const slot = chrome.slots.find((s) => s.key === 'event');
    assert.equal(slot.text, event.trim());
    assert.equal(slot.caption, '', `caption repeated for ${JSON.stringify(event)}`);
  }
  // A different word keeps the caption, because it is adding information.
  const other = titleCardChrome('lower-third', { event: 'PASSION 2025' });
  assert.equal(other.slots.find((s) => s.key === 'event').caption, 'LIVE FROM');
});

test('a pick keeps the words and the operator event/venue lines', () => {
  const base = { card: 'classic', text: 'Who Else', cardEvent: 'PASSION 2025', cardVenue: 'Main' };
  const next = titleCardCue(base, 'editorial');
  assert.equal(next.text, 'Who Else');
  assert.equal(next.card, 'editorial');
  assert.equal(next.cardEvent, 'PASSION 2025');
  assert.equal(next.cardVenue, 'Main');
  assert.deepEqual(next.box, titleCardOf('editorial').cue.box);
  // A pick must not share the template's box, or a later drag would edit the
  // template itself for every song after it.
  assert.notEqual(next.box, titleCardOf('editorial').cue.box);
  assert.equal(base.text, 'Who Else');
  assert.equal(base.card, 'classic', 'the source cue is not mutated');
});

test('switching Editorial back to Classic resets the look, including Fill mode', () => {
  const editorial = titleCardCue({ text: 'Who Else', resizeMode: 'fill' }, 'editorial');
  assert.equal(editorial.resizeMode, 'fit', 'the card decides its own mode');
  const classic = titleCardCue(editorial, 'classic');
  assert.equal(classic.card, 'classic');
  assert.equal(classic.resizeMode, 'fit');
  assert.deepEqual(classic.box, TITLE_CARD_BOX);
  assert.equal(classic.size, titleCardOf('classic').cue.size);
  assert.equal(classic.text, 'Who Else');
});

test('a legacy cue with no card picks Classic without losing its words', () => {
  const legacy = { text: 'Amazing Grace', box: { x: 10, y: 20, w: 300, h: 100 } };
  const next = titleCardCue(legacy, 'classic');
  assert.equal(next.card, 'classic');
  assert.equal(next.text, 'Amazing Grace');
  assert.deepEqual(legacy.box, { x: 10, y: 20, w: 300, h: 100 });
});
