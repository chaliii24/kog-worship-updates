import { useEffect, useRef, useState } from 'react';

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
// ---------------------------------------------------------------------------

export const MAX_VIDEO_SLOTS = 16;

let activeSlots = 0;
const waiters = [];

function releaseSlot() {
  const next = waiters.shift();
  if (!next) {
    activeSlots = Math.max(0, activeSlots - 1);
    return;
  }
  if (next.cancelled) { releaseSlot(); return; }
  // Transfer the slot: the count stays where it is.
  next.grant();
}

// Hook: reserve one of the global video slots. `priority` jumps the queue —
// the live slide of the grid asks first, so the tile that is actually moving
// never waits behind a row of static thumbnails.
export function useVideoSlot(enabled, priority = false) {
  const [granted, setGranted] = useState(false);

  useEffect(() => {
    if (!enabled) return undefined;
    let cancelled = false;
    const entry = { cancelled: false, grant: null };

    const take = () => {
      if (cancelled) { releaseSlot(); return; }
      setGranted(true);
    };

    if (activeSlots < MAX_VIDEO_SLOTS) {
      activeSlots += 1;
      take();
    } else {
      entry.grant = take;
      if (priority) waiters.unshift(entry);
      else waiters.push(entry);
    }

    return () => {
      cancelled = true;
      entry.cancelled = true;
      const i = waiters.indexOf(entry);
      if (i >= 0) waiters.splice(i, 1);
    };
  }, [enabled, priority]);

  // Leaving the viewport (or the panel unmounting under us) must give the
  // slot back and tear the video down again.
  useEffect(() => {
    if (!enabled && granted) setGranted(false);
  }, [enabled, granted]);

  useEffect(() => {
    if (!granted) return undefined;
    return () => releaseSlot();
  }, [granted]);

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
  ...rest
}) {
  const holderRef = useRef(null);
  const inView = useInView(holderRef, rootMargin);
  const granted = useVideoSlot(inView && !!src, priority);
  const [failed, setFailed] = useState(false);

  useEffect(() => { setFailed(false); }, [src]);

  const show = inView && granted && !!src && !failed;

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
