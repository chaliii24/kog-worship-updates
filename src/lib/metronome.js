// Shared metronome math. The operator console (tempo, tap tempo, meter) and
// the drummer phones (rAF beat engine) must agree on the numbers, so clamping
// and tap averaging live here instead of being re-implemented on each surface.

export const MIN_BPM = 40;
export const MAX_BPM = 220;
export const DEFAULT_BPM = 96;
export const DEFAULT_TIME_SIGNATURE = 4;

// Meters offered by the console. The payload only carries the numerator
// (`timeSignature: 4` == 4/4); the pulse engine treats every beat as one
// quarter-note beat at the configured BPM.
export const TIME_SIGNATURE_OPTIONS = [2, 3, 4, 5, 6, 7];

export function clampBpm(value, fallback = DEFAULT_BPM) {
  const raw = value === null || value === undefined || value === '' ? NaN : Math.round(Number(value));
  const fb = fallback === null || fallback === undefined || fallback === '' ? NaN : Math.round(Number(fallback));
  const base = Number.isFinite(raw) ? raw : (Number.isFinite(fb) ? fb : DEFAULT_BPM);
  return Math.min(MAX_BPM, Math.max(MIN_BPM, base));
}

export function normalizeTimeSignature(value, fallback = DEFAULT_TIME_SIGNATURE) {
  const raw = value === null || value === undefined || value === '' ? NaN : Math.round(Number(value));
  const fb = fallback === null || fallback === undefined || fallback === '' ? NaN : Math.round(Number(fallback));
  const base = Number.isFinite(raw) ? raw : (Number.isFinite(fb) ? fb : DEFAULT_TIME_SIGNATURE);
  return Math.min(12, Math.max(1, base));
}

// Exact milliseconds between beats. 120 BPM -> 500ms.
export function beatDurationMs(bpm) {
  return 60000 / clampBpm(bpm);
}

export function meterLabel(timeSignature) {
  return `${normalizeTimeSignature(timeSignature)}/4`;
}

// Average the intervals of the most recent taps (up to `maxTaps`, which means
// up to maxTaps-1 intervals). Returns null until there are two taps.
export function computeTapTempo(timestamps, { maxTaps = 4 } = {}) {
  if (!Array.isArray(timestamps) || timestamps.length < 2) return null;
  const recent = timestamps.slice(-Math.max(2, maxTaps));
  let total = 0;
  let count = 0;
  for (let i = 1; i < recent.length; i += 1) {
    const delta = Number(recent[i]) - Number(recent[i - 1]);
    if (Number.isFinite(delta) && delta > 0) {
      total += delta;
      count += 1;
    }
  }
  if (!count || total <= 0) return null;
  return clampBpm(60000 / (total / count));
}

// Append a tap, dropping the history when the player paused between taps.
// Keeping 4 stamps gives the "average of the last 3-4 taps" feel while still
// responding to a tempo change after a couple of taps.
export function pushTap(taps, now = Date.now(), { resetAfterMs = 2200, maxTaps = 4 } = {}) {
  const prev = Array.isArray(taps) ? taps : [];
  const last = prev.length ? Number(prev[prev.length - 1]) : NaN;
  const base = (!Number.isFinite(last) || now - last > resetAfterMs) ? [] : prev;
  return [...base, now].slice(-Math.max(2, maxTaps));
}
