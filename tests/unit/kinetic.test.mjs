import test from 'node:test';
import assert from 'node:assert/strict';
import {
  KIN_PRESETS,
  applyKineticPreset,
  clearKinetic,
  kinAnimations,
  kinStackTotal,
  kinTiming,
  newKin,
  normalizeKin,
  summarizeKin,
} from '../../src/lib/kinetic.js';

// The kinetic timeline is the contract between the editor and the projector:
// both read the same object, so normalization, ordering and the animation
// shorthands are worth pinning down.

test('a box with no kinetic config keeps the legacy appearance', () => {
  assert.equal(normalizeKin(null), null);
  assert.equal(normalizeKin(undefined), null);
  assert.equal(normalizeKin('fade'), null);
  assert.deepEqual(kinAnimations(null), { enter: '', exit: '', loop: '' });
  assert.equal(kinTiming(null), null);
});

test('unknown values are repaired instead of dropped', () => {
  const k = normalizeKin({ in: 'nope', out: 'nope', loop: 'nope', ease: 'nope' });
  assert.equal(k.in, 'fade');
  assert.equal(k.out, 'none');
  assert.equal(k.loop, 'none');
  assert.equal(k.ease, 'ease-out');
});

test('durations and delays are clamped to usable ranges', () => {
  assert.equal(normalizeKin({ inDur: -4 }).inDur, 0.05);
  assert.equal(normalizeKin({ inDur: 900 }).inDur, 10);
  assert.equal(normalizeKin({ delay: -3 }).delay, 0);
  assert.equal(normalizeKin({ delay: 999 }).delay, 30);
  assert.equal(normalizeKin({ amp: 9 }).amp, 2);
  // 'none' has no duration at all — a 0s animation is not a flicker.
  assert.equal(normalizeKin({ in: 'none', inDur: 4 }).inDur, 0);
});

test('the exit cannot start before the entrance finishes', () => {
  const t = kinTiming({ in: 'fade', inDur: 0.6, delay: 0.2, out: 'fade', outDur: 0.5, outAt: 0.1 });
  assert.equal(t.inStart, 0.2);
  assert.equal(t.inEnd, 0.8);
  assert.equal(t.outStart, 0.8);
  assert.equal(t.outEnd, 1.3);
  assert.equal(t.total, 1.3);
});

test('a late exit is honoured and extends the layer timeline', () => {
  const t = kinTiming({ in: 'fade', inDur: 0.5, out: 'blur', outDur: 0.4, outAt: 4 });
  assert.equal(t.outStart, 4);
  assert.equal(t.total, 4.4);
});

test('no exit means no exit animation and no extra timeline', () => {
  const t = kinTiming({ in: 'scale', inDur: 0.4, delay: 1 });
  assert.equal(t.outStart, 0);
  assert.equal(t.total, 1.4);
  assert.equal(kinAnimations({ in: 'scale', inDur: 0.4 }).exit, '');
});

test('animations carry delay, duration and fill so pre-delay state is hidden', () => {
  const a = kinAnimations({ in: 'slide-up', inDur: 0.8, delay: 0.3, out: 'fade', outDur: 0.4, outAt: 0, loop: 'float', loopDur: 6 });
  assert.match(a.enter, /^kogKinInSlideUp 800ms /);
  assert.match(a.enter, / 300ms both$/);
  assert.match(a.exit, /^kogKinOutFade 400ms /);
  assert.match(a.exit, / 1100ms forwards$/);
  assert.match(a.loop, /^kogKinLoopFloat 6000ms /);
  assert.match(a.loop, / infinite normal$/);
  // Slow zoom needs the ping-pong direction; the others do not.
  assert.match(kinAnimations({ loop: 'slow-zoom', loopDur: 8 }).loop, /alternate$/);
});

test('a new config is normalised and summarised in one line', () => {
  assert.equal(summarizeKin(null), 'No animation');
  const k = newKin({ in: 'zoom', loop: 'breathe' });
  assert.equal(k.in, 'zoom');
  assert.equal(summarizeKin(k), 'Zoom In · Breathing');
});

test('every preset stacks the slide text in several treatments', () => {
  const cue = { id: 'c1', text: 'PRAISE!', font: 'x', size: 64, box: { x: 100, y: 200, w: 900, h: 240 } };
  for (const preset of KIN_PRESETS) {
    const next = applyKineticPreset(cue, preset.key);
    assert.equal(next.text, 'PRAISE!', `${preset.key} must keep the slide's words`);
    assert.ok(next.texts.length >= 1, `${preset.key} must add at least one overlapping layer`);
    assert.equal(next.kinPreset, preset.key);
    assert.ok(normalizeKin(next.kin), `${preset.key} must animate the main text`);
    for (const layer of next.texts) {
      assert.equal(layer.text, 'PRAISE!', 'every layer spells the same word');
      assert.ok(normalizeKin(layer.kin));
      // Layers must actually differ, otherwise the stack is invisible.
    }
    const sizes = new Set([next.size, ...next.texts.map((l) => l.size)]);
    assert.ok(sizes.size > 1, `${preset.key} must vary the size between layers`);
  }
});

test('presets keep the layer boxes on the design canvas', () => {
  const cue = { text: 'AMEN', box: { x: 80, y: 100, w: 1120, h: 480 } };
  for (const preset of KIN_PRESETS) {
    for (const layer of applyKineticPreset(cue, preset.key).texts) {
      assert.ok(layer.box.x >= 0 && layer.box.y >= 0, `${preset.key} layer starts off-canvas`);
      assert.ok(layer.box.x + layer.box.w <= 1280, `${preset.key} layer overflows horizontally`);
      assert.ok(layer.box.y + layer.box.h <= 720, `${preset.key} layer overflows vertically`);
    }
  }
});

test('the preview timeline is as long as the last layer needs, with a floor', () => {
  assert.equal(kinStackTotal([], 4), 4);
  assert.equal(kinStackTotal(null), 4);
  // Short stack: the floor keeps a usable scrub range.
  assert.equal(kinStackTotal([{ kin: { in: 'fade', inDur: 0.6 } }]), 4);
  // A late exit on any layer extends the whole timeline.
  assert.equal(kinStackTotal([{ kin: { in: 'fade', inDur: 0.5 } }, { kin: { in: 'fade', inDur: 0.5, out: 'fade', outDur: 0.5, outAt: 7 } }]), 7.5);
  // Layers without a timeline contribute nothing.
  assert.equal(kinStackTotal([{}, { kin: null }, { kin: { loop: 'float', loopDur: 9 } }]), 4);
});

test('clearing kinetic restores a legacy slide', () => {
  const cue = { text: 'HOLY', kin: { in: 'scale' }, kinPreset: 'bold-praise', texts: [{ text: 'HOLY', kin: { in: 'fade' } }] };
  const out = clearKinetic(cue);
  assert.equal(out.kin, undefined);
  assert.equal(out.kinPreset, undefined);
  assert.equal(out.texts[0].kin, undefined);
  assert.equal(out.text, 'HOLY');
});
