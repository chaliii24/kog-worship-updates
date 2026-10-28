import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MIN_BPM,
  MAX_BPM,
  DEFAULT_BPM,
  DEFAULT_TIME_SIGNATURE,
  clampBpm,
  normalizeTimeSignature,
  beatDurationMs,
  meterLabel,
  computeTapTempo,
  pushTap,
} from '../../src/lib/metronome.js';

test('clampBpm keeps the supported range and recovers from junk input', () => {
  assert.equal(clampBpm(120), 120);
  assert.equal(clampBpm(12), MIN_BPM);
  assert.equal(clampBpm(999), MAX_BPM);
  assert.equal(clampBpm('128'), 128);
  assert.equal(clampBpm('nope'), DEFAULT_BPM);
  assert.equal(clampBpm(null, 72), 72);
  assert.equal(clampBpm(120.6), 121);
});

test('beatDurationMs is exactly 60000 / BPM', () => {
  assert.equal(beatDurationMs(120), 500);
  assert.equal(beatDurationMs(60), 1000);
  assert.equal(beatDurationMs(90), 60000 / 90);
  // 40 BPM (slowest) still gives a dark gap after the 180ms flash cap.
  assert.equal(beatDurationMs(40), 1500);
});

test('time signature is a positive numerator, defaulting to 4/4', () => {
  assert.equal(normalizeTimeSignature(4), 4);
  assert.equal(normalizeTimeSignature('3'), 3);
  assert.equal(normalizeTimeSignature(0), 1);
  assert.equal(normalizeTimeSignature(99), 12);
  assert.equal(normalizeTimeSignature(undefined), DEFAULT_TIME_SIGNATURE);
  assert.equal(meterLabel(4), '4/4');
  assert.equal(meterLabel(3), '3/4');
});

test('tap tempo averages the intervals of the last four taps', () => {
  assert.equal(computeTapTempo([]), null);
  assert.equal(computeTapTempo([1000]), null);

  // Perfect 120 BPM taps.
  assert.equal(computeTapTempo([0, 500, 1000, 1500]), 120);

  // Last four taps are used: a slow first tap falls out of the average.
  assert.equal(computeTapTempo([0, 2000, 2500, 3000, 3500, 4000]), 120);

  // Average of uneven intervals still produces a sane clamped tempo.
  const uneven = computeTapTempo([0, 400, 900, 1300]);
  assert.ok(uneven >= MIN_BPM && uneven <= MAX_BPM);
  assert.equal(uneven, 138); // 60000 / ((400+500+400)/3) -> 138.46 -> 138
});

test('pushTap keeps at most four stamps and resets after a pause', () => {
  assert.deepEqual(pushTap([], 1000), [1000]);
  assert.deepEqual(pushTap([1000], 1500), [1000, 1500]);
  assert.deepEqual(pushTap([1000, 1500, 2000, 2500], 3000), [1500, 2000, 2500, 3000]);
  // More than 2.2s since the last tap: the old phrase is dropped.
  assert.deepEqual(pushTap([1000, 1500], 4000), [4000]);
});
