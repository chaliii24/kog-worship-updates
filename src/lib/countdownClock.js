// Shared media clock for the countdown video.
//
// Every window renders its own <video> (wall, console preview, monitor, stage
// mirror, extra walls), and independent media elements each run on their own
// decoder clock. Over a long countdown those clocks drift apart by a frame
// here and there, and after a few minutes the picture the operator watches is
// visibly ahead of / behind the sound coming out of the wall. The surface that
// owns the countdown publishes its exact position + wall time; every silent
// copy chases it with invisible playback-rate nudges, so picture and sound
// stay locked for the whole run. Same pattern as LiveVideo's booth clock.
export const COUNTDOWN_CLOCK_KEY = 'kog-countdown-clock';
export const COUNTDOWN_CLOCK_FRESH_MS = 3000;

// Pure drift solve for the clock follower. `clock` is the owner's last
// published { time, ts, duration, loop }. Returns the extrapolated target
// position and the shortest signed distance from `currentTime` — across the
// loop boundary when the file loops, so a wrap never reads as a ~60s drift.
export function countdownClockTarget(clock, now, currentTime, fallbackDuration = 0) {
  if (!clock) return null;
  const d = Number(clock.duration) || Number(fallbackDuration) || 0;
  if (!(d > 0)) return null;
  // A paused owner republishes a frozen position. Freeze with it instead of
  // extrapolating a stale timestamp forward, so a long pause can never nudge a
  // follower ahead of the room.
  const elapsed = clock.playing === false ? 0 : (now - (Number(clock.ts) || 0)) / 1000;
  let target = (Number(clock.time) || 0) + elapsed;
  if (clock.loop) target %= d;
  else target = Math.max(0, Math.min(target, d - 0.05));
  let diff = target - (Number(currentTime) || 0);
  if (clock.loop) {
    if (diff > d / 2) diff -= d;
    else if (diff < -d / 2) diff += d;
  }
  return { target, diff };
}
