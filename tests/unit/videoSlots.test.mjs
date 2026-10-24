import test from 'node:test';
import assert from 'node:assert/strict';
import { acquireSlot, videoSlotStats, MAX_VIDEO_SLOTS } from '../../src/lib/videoSlots.js';

// The pool is a module-level singleton (one budget per app window), so every
// test hands back exactly what it took.
const drain = (handles) => handles.forEach((h) => h.release());
const noop = () => {};
const track = () => {
  const state = { granted: 0 };
  state.handle = acquireSlot(() => { state.granted += 1; });
  return state;
};

test('the budget never hands out more than MAX_VIDEO_SLOTS', () => {
  const held = [];
  for (let i = 0; i < MAX_VIDEO_SLOTS; i++) held.push(track());
  assert.equal(videoSlotStats().active, MAX_VIDEO_SLOTS);
  assert.equal(held.every((h) => h.granted === 1), true);

  // The overflow wants a slot and must wait — it is queued, not granted.
  let overflowGranted = false;
  const overflow = acquireSlot(() => { overflowGranted = true; });
  assert.equal(overflowGranted, false);
  assert.equal(videoSlotStats().waiting, 1);
  assert.equal(videoSlotStats().active, MAX_VIDEO_SLOTS, 'a queued entry holds no slot');

  drain(held.map((h) => h.handle));
  overflow.release();
  assert.deepEqual(videoSlotStats(), { active: 0, waiting: 0 });
});

test('releasing twice hands back exactly the slot that was taken', () => {
  const a = track();
  const b = track();
  a.handle.release();
  a.handle.release(); // a stale cleanup firing again must be a no-op
  assert.equal(videoSlotStats().active, 1, 'double release does not over-decrement');
  b.handle.release();
  assert.equal(videoSlotStats().active, 0);
});

test('a full budget drains back to zero as owners release', () => {
  const owners = [];
  for (let i = 0; i < MAX_VIDEO_SLOTS; i++) owners.push(track());
  // Everything the grid mounts scrolls away again.
  drain(owners.map((o) => o.handle));
  assert.deepEqual(videoSlotStats(), { active: 0, waiting: 0 });
});

test('the freed slot is transferred to the next waiter, not lost', () => {
  const owners = [];
  for (let i = 0; i < MAX_VIDEO_SLOTS; i++) owners.push(track());

  const waiters = [];
  for (let i = 0; i < 3; i++) {
    const w = { granted: 0 };
    w.handle = acquireSlot(() => { w.granted += 1; });
    waiters.push(w);
  }
  assert.equal(waiters.every((w) => w.granted === 0), true);

  owners[0].handle.release();
  assert.equal(waiters[0].granted, 1, 'first waiter inherits the slot immediately');
  assert.equal(videoSlotStats().active, MAX_VIDEO_SLOTS, 'transfer keeps the count at the cap');

  drain(owners.slice(1).map((o) => o.handle));
  drain(waiters.map((w) => w.handle));
  assert.deepEqual(videoSlotStats(), { active: 0, waiting: 0 });
});

test('an entry released while still queued owns nothing and is skipped', () => {
  const owners = [];
  for (let i = 0; i < MAX_VIDEO_SLOTS; i++) owners.push(track());

  const abandoned = acquireSlot(noop);
  const patient = { granted: 0 };
  patient.handle = acquireSlot(() => { patient.granted += 1; });

  abandoned.release();
  assert.equal(videoSlotStats().waiting, 1, 'only the patient entry is left waiting');

  owners[0].handle.release();
  assert.equal(patient.granted, 1, 'the cancelled entry never steals the hand-off');
  assert.equal(videoSlotStats().active, MAX_VIDEO_SLOTS);

  drain(owners.slice(1).map((o) => o.handle));
  patient.handle.release();
  assert.deepEqual(videoSlotStats(), { active: 0, waiting: 0 });
});

test('priority moves a waiting entry to the front of the queue', () => {
  const owners = [];
  for (let i = 0; i < MAX_VIDEO_SLOTS; i++) owners.push(track());

  const first = { granted: 0 };
  first.handle = acquireSlot(() => { first.granted += 1; });
  const live = { granted: 0 };
  live.handle = acquireSlot(() => { live.granted += 1; }, true); // the live tile

  owners[0].handle.release();
  assert.equal(live.granted, 1, 'the live slide wins the freed slot');
  assert.equal(first.granted, 0);

  owners[1].handle.release();
  assert.equal(first.granted, 1);

  drain(owners.slice(2).map((o) => o.handle));
  first.handle.release();
  live.handle.release();
  assert.deepEqual(videoSlotStats(), { active: 0, waiting: 0 });
});

test('requeue only ever moves entries that are still waiting', () => {
  const held = track();
  held.handle.requeue(true); // a held slot never re-enters the queue
  assert.deepEqual(videoSlotStats(), { active: 1, waiting: 0 });
  held.handle.release();

  const owners = [];
  for (let i = 0; i < MAX_VIDEO_SLOTS; i++) owners.push(track());
  const waiting = acquireSlot(noop);
  waiting.requeue(true);
  assert.equal(videoSlotStats().waiting, 1, 'still queued, just repositioned');
  waiting.release();
  drain(owners.map((o) => o.handle));
  assert.deepEqual(videoSlotStats(), { active: 0, waiting: 0 });
});

test('the StrictMode double-invoke pattern never leaks a slot', () => {
  // React StrictMode (dev) runs every effect twice: mount → cleanup → mount.
  // The old hook counted the runs, not the owners, and burned one slot per
  // tile: after a few song switches the budget was gone for good and every
  // card (and the Up Next face) rendered a black placeholder.
  for (let mount = 0; mount < MAX_VIDEO_SLOTS * 2; mount++) {
    const outer = track();   // effect run #1
    outer.handle.release();  // simulated cleanup
    const inner = track();   // effect run #2 — re-acquires the same slot
    // Unmount releases whatever the final run owns.
    inner.handle.release();
    assert.equal(videoSlotStats().active, 0, `mount ${mount} returned its slot`);
  }
  assert.deepEqual(videoSlotStats(), { active: 0, waiting: 0 });
});
