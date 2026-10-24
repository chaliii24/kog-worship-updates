// ---------------------------------------------------------------------------
// ONE GLOBAL BUDGET FOR THUMBNAIL VIDEO ELEMENTS
//
// Chromium opens a real media pipeline for every <video> it mounts, so a grid
// of video thumbnails can open dozens of decoders and media:// requests in a
// single frame. Every thumbnail asks this pool for permission to exist; the
// pool hands out at most MAX_VIDEO_SLOTS at a time and queues the rest until
// something releases.
//
// The accounting deliberately lives OUTSIDE React. It must be identical for
// every caller and must never depend on how many times a component's effects
// happen to run: React StrictMode mounts effects twice in development, and a
// pool that counted effect invocations instead of real owners lost one slot
// per mount — after a few song switches the budget was gone for good and every
// later thumbnail (slide cards, the Up Next face, media grids) rendered an
// empty black placeholder forever.
// ---------------------------------------------------------------------------

export const MAX_VIDEO_SLOTS = 16;

let activeSlots = 0;
const waiters = [];

// Hand a released slot straight to the next waiter so the total stays at the
// cap; only drop the count when nobody is queued. Entries released while they
// were still queued own nothing, so they are skipped on the way past.
function handOff() {
  const next = waiters.shift();
  if (!next) {
    activeSlots = Math.max(0, activeSlots - 1);
    return;
  }
  if (next.state !== 'waiting') { handOff(); return; }
  next.state = 'held';
  next.onGranted();
}

/**
 * Ask for one of the global slots.
 *
 * `onGranted` fires the moment the slot is ours — synchronously when the pool
 * has room, later if it was full. The returned handle gives back exactly the
 * slot this call took: releasing twice is a no-op, so a component that
 * double-fires a cleanup can never corrupt the budget, and a component that
 * never gets granted releases nothing.
 */
export function acquireSlot(onGranted, priority = false) {
  const waiter = { state: 'waiting', onGranted };

  const release = () => {
    if (waiter.state === 'released') return;
    const held = waiter.state === 'held';
    waiter.state = 'released';
    const i = waiters.indexOf(waiter);
    if (i >= 0) waiters.splice(i, 1);
    // A queued entry owns no slot; only a held one hands anything back.
    if (held) handOff();
  };

  // Move a still-waiting entry to the front (or back) of the queue — the live
  // slide asks first, so the tile that is actually moving never waits behind a
  // row of static thumbnails. A slot already held never re-enters the queue.
  const requeue = (nextPriority) => {
    if (waiter.state !== 'waiting') return;
    const i = waiters.indexOf(waiter);
    if (i >= 0) waiters.splice(i, 1);
    if (nextPriority) waiters.unshift(waiter);
    else waiters.push(waiter);
  };

  if (activeSlots < MAX_VIDEO_SLOTS) {
    activeSlots += 1;
    waiter.state = 'held';
    onGranted();
  } else if (priority) {
    waiters.unshift(waiter);
  } else {
    waiters.push(waiter);
  }

  return { release, requeue, isHeld: () => waiter.state === 'held' };
}

// Diagnostics (and tests): how many slots are checked out, how many want one.
export function videoSlotStats() {
  return {
    active: activeSlots,
    waiting: waiters.filter((w) => w.state === 'waiting').length,
  };
}
