import test from 'node:test';
import assert from 'node:assert/strict';
import { canRunLanCommand, STAGE_COMMANDS } from '../../electron/lanCommandRules.js';

test('the drummer surface may set tempo without a PIN', () => {
  // Regression: the drummer phone authenticates as `stage`, so a blanket
  // "stage cannot send commands" rule dropped metronomeSet and the console
  // kept echoing the old BPM back to the phone.
  assert.equal(
    canRunLanCommand({ role: 'stage', authed: true, control: false, cmd: 'metronomeSet' }),
    true,
  );
  assert.deepEqual([...STAGE_COMMANDS], ['metronomeSet']);
});

test('stage sockets still cannot touch any other control command', () => {
  for (const cmd of ['clearAll', 'nextSlide', 'prevSlide', 'setTheme', 'mediaPlay', 'blackout']) {
    assert.equal(
      canRunLanCommand({ role: 'stage', authed: true, control: false, cmd }),
      false,
      `${cmd} must stay control-only`,
    );
  }
});

test('paired control sockets keep full command access', () => {
  for (const cmd of ['metronomeSet', 'clearAll', 'nextSlide', 'mediaPlay']) {
    assert.equal(canRunLanCommand({ role: 'control', authed: true, control: true, cmd }), true);
  }
});

test('unknown or unauthenticated sockets are refused', () => {
  assert.equal(canRunLanCommand({ role: 'none', authed: false, control: false, cmd: 'metronomeSet' }), false);
  assert.equal(canRunLanCommand({ role: 'stage', authed: false, control: false, cmd: 'metronomeSet' }), false);
  // A forged role without the control flag is not enough.
  assert.equal(canRunLanCommand({ role: 'control', authed: true, control: false, cmd: 'metronomeSet' }), false);
  // Missing/odd payloads must not throw.
  assert.equal(canRunLanCommand(), false);
  assert.equal(canRunLanCommand({ cmd: 'metronomeSet' }), false);
});
