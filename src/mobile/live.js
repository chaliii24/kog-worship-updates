// Derived, read-only view of the desktop snapshot.
//
// Everything the remote shows about "what is on air" comes from here, so the
// dashboard, the lyrics controller and the outputs mirror can never disagree
// with each other — or invent a state the desktop did not send. Nothing in
// this file is stored locally: mutate the snapshot and the screens follow.

import { mediaUrl } from './link.js';

export const CLEAR_ID = 'clear';

// The desktop paints media:// URLs natively; a phone cannot. Rewrite every
// URL the live projector would load through the paired LAN endpoint before it
// reaches ProjectorDisplay, so the phone card is a true picture of the wall.
// Unresolvable URLs are left alone (ProjectorDisplay falls back to black).
const lan = (url) => (typeof url === 'string' ? (mediaUrl(url) || url) : url);

function phoneStyle(style) {
  if (!style) return style;
  const type = style.backgroundType;
  if ((type !== 'image' && type !== 'video') || typeof style.backgroundValue !== 'string') return style;
  return { ...style, backgroundValue: lan(style.backgroundValue) };
}

// Countdown media rides the same LAN endpoint: slideshow frames, the video
// kind, and the slideshow watermark all live behind media:// on the desktop.
function phoneTimer(timer) {
  if (!timer || timer.bgType !== 'media' || !timer.bgMedia) return timer;
  const m = timer.bgMedia;
  return {
    ...timer,
    bgMedia: {
      ...m,
      images: Array.isArray(m.images) ? m.images.map(lan) : m.images,
      video: lan(m.video),
      watermark: m.watermark && m.watermark.url
        ? { ...m.watermark, url: lan(m.watermark.url) }
        : m.watermark,
    },
  };
}

// A sermon deck owns its own picture: the full-bleed image and the slide's
// background can both be library media.
function phonePresentation(presentation) {
  if (!presentation || !presentation.slide) return presentation;
  const s = presentation.slide;
  const bg = s.bg && (s.bg.type === 'image' || s.bg.type === 'video') && typeof s.bg.value === 'string'
    ? { ...s.bg, value: lan(s.bg.value) }
    : s.bg;
  const image = lan(s.image);
  if (bg === s.bg && image === s.image) return presentation;
  return { ...presentation, slide: { ...s, bg, image } };
}

// One phone-safe copy of the live slide. Everything else (text, style boxes,
// timer routing, deck metadata) passes through untouched.
export function phoneSlide(live) {
  if (!live) return null;
  return {
    ...live,
    style: phoneStyle(live.style),
    timer: phoneTimer(live.timer),
    presentation: phonePresentation(live.presentation),
  };
}

export function slideInfo(state) {
  const cues = Array.isArray(state?.song?.cues) ? state.song.cues : [];
  const activeId = state?.activeCueId || null;
  const activeIdx = cues.findIndex((c) => c.id === activeId);
  const activeCue = activeIdx >= 0 ? cues[activeIdx] : null;
  const nextCue = activeIdx >= 0 ? (cues[activeIdx + 1] || null) : (cues[0] || null);
  return {
    cues,
    activeId,
    activeIdx,
    activeCue,
    nextCue,
    onAir: !!activeId && activeId !== CLEAR_ID,
    slideNumber: activeIdx >= 0 ? activeIdx + 1 : 0,
    total: cues.length,
  };
}

// What kind of thing is on the wall right now. Mirrors how the desktop builds
// the live payload: a deck replaces lyrics, a timer replaces both, a bare
// media item has no text.
export function contentKind(state) {
  const live = state?.live || null;
  if (!live) return 'nothing';
  if (live.presentation) return 'presentation';
  if (live.timer) return 'countdown';
  if (live.media) return 'media';
  if (live.text) return 'lyrics';
  return 'background';
}

export const KIND_LABEL = {
  presentation: 'Presentation',
  countdown: 'Countdown',
  media: 'Media',
  lyrics: 'Lyrics',
  background: 'Background',
  nothing: 'Nothing',
};

export function liveSummary(state) {
  const live = state?.live || null;
  const s = slideInfo(state);
  const kind = contentKind(state);
  const sm = state?.sermon || null;
  const deck = live?.presentation || null;
  const title = deck?.deckTitle || (kind === 'presentation' ? sm?.title : '') || live?.title || state?.song?.title || '';
  const label = live?.label || s.activeCue?.label || '';
  // Slide counter: lyrics use the cue grid; a deck uses its own index/total so
  // the number always describes what the projector is actually showing.
  let index = s.slideNumber;
  let total = s.total;
  if (kind === 'presentation') {
    index = Number(deck?.index) >= 0 ? Number(deck.index) + 1 : Number(sm?.index) || 0;
    total = Number(deck?.total) || Number(sm?.total) || 0;
  }
  return {
    live,
    kind,
    kindLabel: KIND_LABEL[kind] || 'Nothing',
    title,
    label,
    index,
    total,
    cues: s.cues,
    activeId: s.activeId,
    activeIdx: s.activeIdx,
    onAir: s.onAir,
    cleared: !s.onAir,
    hasPicture: !!(live && (live.text || live.presentation || live.timer)),
    nextCue: s.nextCue,
    activeCue: s.activeCue,
  };
}

// Projector aspect: a per-output override beats the global default — same
// precedence the wall uses. "Fill" has no aspect of its own, so the phone
// mirrors it with the wall's real shape.
export function outputShape(state) {
  const aspect = (state?.outputs || []).find((o) => o.id === 'projector')?.aspect
    || state?.outputAspect || '16:9';
  const fill = String(aspect).toLowerCase() === 'fill';
  const cssAspect = fill
    ? (state?.wallAspect || '16 / 9')
    : String(aspect).replace(':', ' / ');
  return { aspect, cssAspect, fill };
}

export function fmtClock(totalSeconds) {
  const s = Math.max(0, Math.floor(Number(totalSeconds) || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  return `${m}:${String(sec).padStart(2, '0')}`;
}

// Slide timer (the desktop's per-slide clock). `start` is a wall-clock stamp.
export function slideTimer(state, now) {
  const t = state?.timer || {};
  const runningSecs = t.start ? Math.max(0, Math.floor((now - t.start) / 1000)) : (t.elapsed || 0);
  const total = Number(t.duration) || 0;
  const remaining = total > 0 ? Math.max(0, total - runningSecs) : runningSecs;
  return { running: !!t.start, total, elapsed: runningSecs, remaining, label: fmtClock(remaining) };
}

// Human label for the connection, used by the header pill.
export function connectionLabel(status) {
  switch (status) {
    case 'online': return 'Connected';
    case 'reconnecting': return 'Reconnecting';
    case 'offline': return 'Disconnected';
    case 'need-pin':
    case 'wrong':
    case 'locked': return 'Pairing';
    case 'denied': return 'Not paired';
    default: return 'Connecting';
  }
}
