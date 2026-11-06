import test from 'node:test';
import assert from 'node:assert/strict';
import {
  liveSummary, contentKind, outputShape, connectionLabel, slideInfo, fmtClock, phoneSlide,
} from '../../src/mobile/live.js';

const song = {
  title: 'Amazing Grace',
  cues: [
    { id: 'a', label: 'Verse 1', text: 'one' },
    { id: 'b', label: 'Chorus', text: 'two' },
    { id: 'c', label: 'Chorus', text: 'three' },
  ],
};

test('slideInfo numbers the projected cue and finds the next one', () => {
  const s = slideInfo({ song, activeCueId: 'b' });
  assert.equal(s.onAir, true);
  assert.equal(s.slideNumber, 2);
  assert.equal(s.total, 3);
  assert.equal(s.nextCue.id, 'c');
});

test('a cleared output is not on air and has no active cue', () => {
  const s = slideInfo({ song, activeCueId: 'clear' });
  assert.equal(s.onAir, false);
  assert.equal(s.activeCue, null);
  assert.equal(s.slideNumber, 0);
});

test('contentKind follows the desktop live payload priority', () => {
  assert.equal(contentKind({ live: { text: 'x' } }), 'lyrics');
  assert.equal(contentKind({ live: { text: 'x', presentation: { index: 0 } } }), 'presentation');
  assert.equal(contentKind({ live: { text: 'x', timer: { mode: 'duration' } } }), 'countdown');
  assert.equal(contentKind({ live: { media: true } }), 'media');
  assert.equal(contentKind({ live: {} }), 'background');
  assert.equal(contentKind({}), 'nothing');
});

test('deck index drives the counter while a deck is on air', () => {
  const sm = liveSummary({
    song,
    activeCueId: 'a',
    live: { text: '', presentation: { deckTitle: 'Sermon', index: 4, total: 20 } },
    sermon: { loaded: true, title: 'Sermon', index: 5, total: 20 },
  });
  assert.equal(sm.kind, 'presentation');
  assert.equal(sm.index, 5);
  assert.equal(sm.total, 20);
  assert.equal(sm.title, 'Sermon');
});

test('a loaded sermon does not retitle a lyrics slide', () => {
  const sm = liveSummary({
    song,
    activeCueId: 'b',
    live: { title: 'Amazing Grace', text: 'two' },
    sermon: { loaded: true, title: 'The Prodigal Son', index: 6, total: 24 },
  });
  assert.equal(sm.kind, 'lyrics');
  assert.equal(sm.title, 'Amazing Grace');
  assert.equal(sm.index, 2);
  assert.equal(sm.total, 3);
});

test('outputShape mirrors the projector override and Fill wall', () => {
  const def = outputShape({ outputAspect: '4:3' });
  assert.equal(def.aspect, '4:3');
  assert.equal(def.cssAspect, '4 / 3');

  const fill = outputShape({
    outputAspect: '16:9',
    wallAspect: '21 / 9',
    outputs: [{ id: 'projector', aspect: 'fill' }],
  });
  assert.equal(fill.fill, true);
  assert.equal(fill.cssAspect, '21 / 9');
});

test('connection labels cover every socket status', () => {
  assert.equal(connectionLabel('online'), 'Connected');
  assert.equal(connectionLabel('offline'), 'Disconnected');
  assert.equal(connectionLabel('reconnecting'), 'Reconnecting');
  assert.equal(connectionLabel('need-pin'), 'Pairing');
  assert.equal(connectionLabel(undefined), 'Connecting');
});

test('fmtClock switches to hours past 60 minutes', () => {
  assert.equal(fmtClock(59), '0:59');
  assert.equal(fmtClock(600), '10:00');
  assert.equal(fmtClock(3661), '1:01:01');
});

test('phoneSlide rewrites every media:// URL the wall paints', () => {
  const had = Object.prototype.hasOwnProperty.call(globalThis, 'localStorage');
  const prev = globalThis.localStorage;
  Object.defineProperty(globalThis, 'localStorage', {
    value: { getItem: (k) => (k === 'kog-remote-token' ? 'tok' : null) },
    configurable: true,
  });
  try {
    const live = {
      text: 'holy',
      style: { backgroundType: 'image', backgroundValue: 'media://kog-media/bg.jpg' },
      presentation: {
        slide: {
          image: 'media://kog-media/slide.jpg',
          bg: { type: 'image', value: 'media://kog-media/deck.jpg' },
        },
      },
      timer: {
        bgType: 'media',
        bgMedia: {
          images: ['media://kog-media/one.jpg', 'https://cdn.example/two.jpg'],
          video: 'media://kog-media/cd/clip.mp4',
          watermark: { url: 'media://kog-media/logo.png' },
        },
      },
    };
    const phone = phoneSlide(live);
    const lan = (f) => `http://127.0.0.1:8787/media/${f}?token=tok`;

    assert.equal(phone.style.backgroundValue, lan('bg.jpg'));
    assert.equal(phone.presentation.slide.image, lan('slide.jpg'));
    assert.equal(phone.presentation.slide.bg.value, lan('deck.jpg'));
    assert.deepEqual(phone.timer.bgMedia.images, [lan('one.jpg'), 'https://cdn.example/two.jpg']);
    assert.equal(phone.timer.bgMedia.video, lan('cd/clip.mp4'));
    assert.equal(phone.timer.bgMedia.watermark.url, lan('logo.png'));

    // The snapshot itself is never mutated — every screen derives from it.
    assert.equal(live.style.backgroundValue, 'media://kog-media/bg.jpg');
    assert.equal(live.presentation.slide.image, 'media://kog-media/slide.jpg');
    assert.equal(live.timer.bgMedia.images[0], 'media://kog-media/one.jpg');
  } finally {
    if (had) globalThis.localStorage = prev;
    else delete globalThis.localStorage;
  }
});

test('phoneSlide leaves CSS backgrounds and remote URLs untouched', () => {
  const live = {
    style: { backgroundType: 'gradient', backgroundValue: 'linear-gradient(#000, #111)' },
    timer: { bgType: 'media', bgMedia: { images: ['https://cdn.example/a.jpg'], video: null } },
  };
  const phone = phoneSlide(live);
  assert.equal(phone.style, live.style);
  assert.equal(phone.timer.bgMedia.images[0], 'https://cdn.example/a.jpg');
  assert.equal(phone.timer.bgMedia.video, null);
});

