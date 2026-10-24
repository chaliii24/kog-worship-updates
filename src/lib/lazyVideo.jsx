import { useEffect, useRef, useState } from 'react';
import { acquireSlot, MAX_VIDEO_SLOTS } from './videoSlots';

export { MAX_VIDEO_SLOTS };

// ---------------------------------------------------------------------------
// ONE BUDGET FOR EVERY THUMBNAIL VIDEO
//
// A thumbnail is a preview, not playback. Chromium still opens a real media
// pipeline for each <video> element the moment it gets a src — even with
// preload="metadata" — and a song grid can ask for dozens at once (a 70-slide
// song with a video background used to mount 70 <video> elements in one
// commit). Rapid tab switching then unmounted and remounted all of them, which
// is what made the window stop responding for seconds on a worship PC.
//
// Two rules fix that at the source:
//   1. a video is only created once its placeholder is inside the viewport;
//   2. at most MAX_VIDEO_SLOTS video elements may exist at the same time.
// Anything over the budget renders its placeholder instead and swaps in when
// a slot frees up. No panel can ever stampede the media pipeline again.
//
// The accounting itself lives in lib/videoSlots.js so it can never be skewed
// by React internals — see the note there about StrictMode's double-invoked
// effects, which used to burn one slot per mount and starve every thumbnail.
// ---------------------------------------------------------------------------

// Hook: reserve one of the global video slots. `priority` jumps the queue —
// the live slide of the grid asks first, so the tile that is actually moving
// never waits behind a row of static thumbnails.
export function useVideoSlot(enabled, priority = false) {
  const [granted, setGranted] = useState(false);
  // Our pool handle (held slot or queued entry) while we still want one. Its
  // release is idempotent, so every exit path can call it blindly.
  const slotRef = useRef(null);
  // Cancels a release that cleanup scheduled when the effect re-enters in the
  // same tick (StrictMode's mount → cleanup → mount): the slot we already own
  // simply stays ours instead of being handed away and re-fought for.
  const cancelReleaseRef = useRef(null);
  const priorityRef = useRef(priority);
  priorityRef.current = priority;

  // A tile that goes live while STILL waiting moves to the front of the queue.
  // Only the queue position moves — a slot already owned is never re-taken.
  useEffect(() => {
    if (slotRef.current) slotRef.current.requeue(priority);
  }, [priority]);

  useEffect(() => {
    if (!enabled) return undefined;
    // A release scheduled by the previous run (StrictMode's mount → cleanup →
    // mount, or `enabled` flicking off and straight back on) is cancelled: the
    // slot we already own simply stays ours instead of being handed away and
    // re-fought for.
    const cancel = cancelReleaseRef.current;
    if (cancel) { cancel(); cancelReleaseRef.current = null; }

    // Keep a slot this hook already owns rather than taking a second one —
    // but ALWAYS return the cleanup below, even on that path. React only ever
    // runs the cleanup the LAST effect run returned: returning early here
    // left a held slot with nothing to release it on unmount, so every mount
    // that went through this branch leaked one slot. After enough song
    // switches the 16-slot budget was gone and every card past the cap
    // rendered a black placeholder for the rest of the session.
    const slot = slotRef.current || acquireSlot(() => setGranted(true), priorityRef.current);
    slotRef.current = slot;
    // Re-assert the grant on the kept-slot path (StrictMode remount, or
    // `enabled` flicking back on) where `granted` may have been reset by the
    // effect below. ONLY when the slot is actually HELD — a queued entry must
    // never render its element, or the budget would gate nothing at all.
    if (slot.isHeld()) setGranted(true);

    return () => {
      // Still queued: the entry owns no slot, so just drop it.
      if (!slot.isHeld()) {
        slot.release();
        if (slotRef.current === slot) slotRef.current = null;
        return;
      }
      // Held: defer the release one tick so an immediate re-entry (StrictMode
      // remount, or enabled flipping straight back on) can cancel it. React
      // runs that re-entry synchronously, so the microtask can never beat it.
      let alive = true;
      const cancel = () => { alive = false; };
      cancelReleaseRef.current = cancel;
      Promise.resolve().then(() => {
        if (cancelReleaseRef.current === cancel) cancelReleaseRef.current = null;
        if (!alive) return;
        if (slotRef.current === slot) slotRef.current = null;
        slot.release();
      });
    };
  }, [enabled]);

  // Leaving the viewport (or the panel unmounting under us) must give the
  // slot back and tear the video down again.
  useEffect(() => {
    if (!enabled && granted) setGranted(false);
  }, [enabled, granted]);

  return enabled && granted;
}

// Fires once when the element first scrolls into view; enters are one-way so
// a grid keeps its thumbnails after a scroll instead of thrashing decoders.
export function useInView(ref, rootMargin = '250px') {
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || inView) return undefined;
    if (typeof IntersectionObserver === 'undefined') { setInView(true); return undefined; }
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        setInView(true);
        io.disconnect();
      }
    }, { rootMargin });
    io.observe(el);
    return () => io.disconnect();
  }, [ref, rootMargin, inView]);
  return inView;
}

// ---------------------------------------------------------------------------
// LAZY VIDEO — a drop-in replacement for thumbnail <video> elements.
//
// The wrapper always occupies the same box, so layout is identical before and
// after the real element appears. `fallback` is rendered while the card is off
// screen, over budget, or when the file cannot be opened — a broken reference
// can never leave a black decoder spinning.
//
// `enabled` lets a caller that can draw the frame another way (TileVideo
// captures its frozen still into an <img>) hand its slot back instead of
// keeping a paused decoder checked out.
// ---------------------------------------------------------------------------
export function LazyVideo({
  src,
  style,
  videoStyle,
  fallback = null,
  rootMargin = '250px',
  priority = false,
  videoRef,
  onError,
  enabled: wantsElement = true,
  ...rest
}) {
  const holderRef = useRef(null);
  const inView = useInView(holderRef, rootMargin);
  const [failed, setFailed] = useState(false);

  useEffect(() => { setFailed(false); }, [src]);

  // A file that cannot open must not keep holding a global slot either: the
  // fallback renders and the budget goes back to healthy clips.
  const wantElement = wantsElement && inView && !!src && !failed;
  const granted = useVideoSlot(wantElement, priority);

  const show = wantElement && granted;

  return (
    <div
      ref={holderRef}
      style={{ position: 'relative', overflow: 'hidden', background: 'transparent', ...style }}
    >
      {show ? (
        <video
          ref={videoRef}
          src={src}
          onError={(e) => { setFailed(true); if (onError) onError(e); }}
          style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', ...videoStyle }}
          {...rest}
        />
      ) : fallback}
    </div>
  );
}
