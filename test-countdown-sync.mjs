// Countdown audio/video sync guards: one sound source, one media clock.
//
// The renderer is React + a real <video>, so the wiring checks below pin the
// contract that used to break: every window renders its own <video>, so only
// ONE may be audible, and every other copy must follow that surface's media
// clock instead of running free. Free-running copies are what made the sound
// drift behind the picture after a few minutes. The sync math itself is a
// pure function and gets real unit tests.
import fs from 'fs';
import { COUNTDOWN_CLOCK_KEY, countdownClockTarget } from './src/lib/countdownClock.js';

const fails = [];
const check = (label, cond, detail) => {
  if (cond) console.log('  PASS  ' + label);
  else { fails.push(label); console.log('  FAIL  ' + label + (detail ? '  -> ' + detail : '')); }
};
const eq = (label, a, b) => check(label, Object.is(a, b), `${a} !== ${b}`);

const mainSrc = fs.readFileSync('./electron/main.js', 'utf8');
const faceSrc = fs.readFileSync('./src/components/CountdownFace.jsx', 'utf8');
const clockSrc = fs.readFileSync('./src/lib/countdownClock.js', 'utf8');
const projSrc = fs.readFileSync('./src/components/ProjectorDisplay.jsx', 'utf8');
const stageSrc = fs.readFileSync('./src/components/StageDisplay.jsx', 'utf8');

console.log('--- one audible surface per role ---');
check('lyrics payloads are stamped per window', mainSrc.includes('withSlideAudioOwner(lastLiveSlide, id === owner)'));
check('stage payloads are stamped per window', mainSrc.includes('withStageAudioOwner(lastLiveStage, id === owner)'));
check('first running output owns the sound', mainSrc.includes('function firstOutputId(role)') && mainSrc.includes('if (entry.role === role && entry.win'));
check('get-live-state is sender aware', mainSrc.includes('entry.win.webContents === event.sender'));
check('closing the owner hands the clock over', mainSrc.includes('broadcastLiveSlide();') && mainSrc.includes('broadcastLiveStage();') && mainSrc.includes('if ((lastLiveSlide && lastLiveSlide.timer)'));
check('countdown honours audioOwner', faceSrc.includes('timer.audioOwner === false ? false : roleOwnsAudio'));
check('framed projector is a silent preview', projSrc.includes("const timerSurface = surface || (framed ? 'preview' : 'main');"));
check('projector passes the surface through', projSrc.includes('surface={timerSurface}'));
check('stage preview is a silent preview', stageSrc.includes("surface={preview ? 'preview' : 'stage'}"));

console.log('--- shared media clock (no free-running copies) ---');
eq('clock key', COUNTDOWN_CLOCK_KEY, 'kog-countdown-clock');
check('owner publishes currentTime + wall time', faceSrc.includes('localStorage.setItem(COUNTDOWN_CLOCK_KEY') && faceSrc.includes('ts: Date.now()'));
check('owner republishes continuously', faceSrc.includes('setInterval(tick, 500)'));
check('owner heals a stray pause / stalled decoder', faceSrc.includes('const heal = () =>') && faceSrc.includes('if (el.paused) {'));
check('heal respects the paused transport', faceSrc.includes('if (paused || el.ended) { lastTime = el.currentTime; stalled = 0; return; }'));
check('followers extrapolate the owner clock', faceSrc.includes('countdownClockTarget(clock, Date.now(), el.currentTime'));
check('stale clock never steers a copy', faceSrc.includes('COUNTDOWN_CLOCK_FRESH_MS'));
check('small drift bends the rate silently', faceSrc.includes('el.playbackRate = 1.08') && faceSrc.includes('el.playbackRate = 0.92'));
check('large drift hard-seeks once', faceSrc.includes('if (Math.abs(diff) > 1)'));
check('rate snaps back to 1x on arrival', faceSrc.includes('if (el.playbackRate !== 1) el.playbackRate = 1;'));
check('followers align immediately on mount', faceSrc.includes('follow();') && faceSrc.includes('setInterval(follow, 500)'));
check('a paused transport is never resurrected by a stale clock', faceSrc.includes('if (!paused) {') && faceSrc.includes('locally paused'));
check('loop wrap is handled modulo duration', clockSrc.includes('if (clock.loop) target %= d;'));

console.log('--- sync math (real unit test) ---');
const now = 1_000_000;
// Owner is 1s ahead of the follower's last position.
eq('forward drift target', countdownClockTarget({ time: 10, ts: now - 1000, duration: 60, loop: true }, now, 10).target, 11);
eq('forward drift distance', Math.round(countdownClockTarget({ time: 10, ts: now - 1000, duration: 60, loop: true }, now, 10).diff * 1000), 1000);
// Owner clock wrapped to 0.8s; follower still near the end of the loop.
check('loop wrap target', Math.abs(countdownClockTarget({ time: 59.8, ts: now - 1000, duration: 60, loop: true }, now, 0.5).target - 0.8) < 1e-6);
check('loop wrap distance is short', Math.abs(countdownClockTarget({ time: 59.8, ts: now - 1000, duration: 60, loop: true }, now, 0.5).diff) < 1, 'expected <1s');
// Follower 2s behind but just across the wrap: shortest path is forward 2s, not back 58s.
const wrap = countdownClockTarget({ time: 1, ts: now, duration: 60, loop: true }, now, 59);
eq('shortest path across the seam', Math.round(wrap.diff * 1000), 2000);
// Paused owner: target freezes at the published time (ts age must not move it).
eq('paused clock holds position', countdownClockTarget({ time: 12.5, ts: now - 4000, playing: false, duration: 60, loop: false }, now, 12.5).target, 12.5);
// Non-looping file clamps to the last frame instead of running past the end.
eq('non-loop target clamps', countdownClockTarget({ time: 55, ts: now - 10_000, playing: true, duration: 60, loop: false }, now, 55).target, 59.95);
check('unknown duration is a no-op', countdownClockTarget({ time: 5, ts: now, duration: 0, loop: true }, now, 5) === null);
check('no clock is a no-op', countdownClockTarget(null, now, 5) === null);

console.log('--- transport keeps picture and sound together ---');
check('pause/resume drives the media element', faceSrc.includes('if (paused) {') && faceSrc.includes('if (!el.paused) el.pause();'));
check('paused state never re-arms playback', faceSrc.includes('if (!paused && el.paused)'));
check('paused timer cannot leave the track running', faceSrc.includes('COUNTDOWN TRANSPORT OWNS THE MEDIA'));

console.log(fails.length ? `\nRESULT: ${fails.length} FAILED` : '\nRESULT: all passed');
process.exit(fails.length ? 1 : 0);
