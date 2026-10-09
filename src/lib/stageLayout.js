// Stage display: shared defaults, role-based layout presets, and the timer /
// traffic-light math that BOTH the Stage tab panel and the stage output
// window need. Keeping it here means the preview and the physical output
// derive the same numbers from the same code — a preview that disagrees with
// the wall is worse than no preview.

export const DEFAULT_STAGE_CFG = {
  // Role preset id: 'standard' | 'pastor' | 'worship' | 'drummer' | 'custom'.
  layout: 'standard',
  // Module flags — presets set them, the panel can override (custom layout).
  clock: true,
  clockFormat: '24', // '24' | '12'
  showNext: true,
  showFlow: true,
  showAlert: true,
  showChords: false,
  showTimer: false, // big segment timer in the main area
  metronome: false,
  bpm: 96,
  // 'standard' (theme colors) | 'high-yellow' | 'high-white' — the last two
  // are the ProPresenter-style confidence look: yellow/white on pure black,
  // readable from 20+ ft.
  contrast: 'high-yellow',
  textScale: 1, // multiplier on the auto-fit lyric sizes
  // Traffic-light border: green > warn > yellow > 0 > red (overtime).
  traffic: true,
  trafficWarn: 120, // seconds remaining where green flips to yellow
  playKey: 'C', // key the band is playing in (chord transposition target)
  nashville: false,
  // Flashable stage-only alert: { text, level: 'info'|'urgent', until }
  // until = timestamp, or 0 to hold until cleared.
  alert: null,
  // Segment timer: countdown { durationSec, endsAt, running, remain } or
  // count-up { countUp: true, startedAt, running, remain }.
  segment: null,
};

// Role-based presets ("build & trigger"): each one flips the module set a
// role actually reads. Manual toggles set layout to 'custom'.
export const LAYOUT_PRESETS = {
  standard: { label: 'Standard', clock: true, showNext: true, showFlow: true, showAlert: true, showChords: false, showTimer: false, metronome: false },
  pastor: { label: 'Pastor', clock: true, showNext: false, showFlow: false, showAlert: true, showChords: false, showTimer: true, metronome: false },
  worship: { label: 'Worship Leader', clock: true, showNext: true, showFlow: true, showAlert: true, showChords: true, showTimer: false, metronome: false },
  drummer: { label: 'Drummer', clock: true, showNext: false, showFlow: true, showAlert: true, showChords: false, showTimer: true, metronome: true },
  custom: { label: 'Custom' },
};

// --- segment timer math ---------------------------------------------------

// Seconds on the clock for a segment state (countdown may go negative =
// overtime). Null when there is no segment.
export function segSeconds(seg, now = Date.now()) {
  if (!seg) return null;
  if (seg.countUp) return seg.running ? (now - (seg.startedAt || now)) / 1000 : (seg.remain != null ? seg.remain : 0);
  if (seg.running && seg.endsAt) return (seg.endsAt - now) / 1000;
  return seg.remain != null ? seg.remain : 0;
}

export function fmtMMSS(total) {
  const n = Math.max(0, Math.floor(Math.abs(Number(total) || 0)));
  return `${Math.floor(n / 60)}:${String(n % 60).padStart(2, '0')}`;
}

export function fmtClock(now, format = '24') {
  const d = new Date(now);
  const mm = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');
  const hh = d.getHours();
  if (format === '12') {
    const ap = hh >= 12 ? 'PM' : 'AM';
    return `${String(hh % 12 || 12).padStart(2, '0')}:${mm}:${ss} ${ap}`;
  }
  return `${String(hh).padStart(2, '0')}:${mm}:${ss}`;
}

// --- traffic light --------------------------------------------------------
// Green while healthy, yellow inside the warn window, red at/below zero.
// Source priority: the live pre-service countdown first (it is the thing the
// room is actually watching), then the segment timer. Returns null (no
// border) when nothing is running.
export function trafficState(now, timer, seg, warnSec) {
  let remainMs = null;
  if (timer && timer.live && timer.live.endsAt) {
    remainMs = timer.live.endsAt - now;
  } else if (seg && !seg.countUp && seg.running && seg.endsAt) {
    remainMs = seg.endsAt - now;
  }
  if (remainMs == null) return null;
  if (remainMs <= 0) return '#ef4444';
  if (remainMs <= (Number(warnSec) || 0) * 1000) return '#eab308';
  return '#22c55e';
}
