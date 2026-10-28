// The drummer's CLICK TRACK — a short, dry tick synthesised on the Web Audio
// clock. It lives on the drummer's phone only: the console and every other
// phone stay silent, because the audible click belongs to the person holding
// the sticks, not to the room.
//
// Nothing is loaded from disk and no audio element is created: two oscillators
// per beat with a very fast decay. One shared AudioContext is created on the
// first user gesture (the Start tap), which is also what satisfies the browser
// autoplay policy on iOS and Chrome.

const ACCENT_HZ = 1568; // beat 1 — a fifth up, so the drummer hears the bar
const BEAT_HZ = 1046;   // every other beat
const LEVEL = 0.4;      // master gain: audible under a live band, not piercing

let ctx = null;
let master = null;

function audioContext() {
  if (typeof window === 'undefined') return null;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  if (!ctx) {
    try {
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = LEVEL;
      master.connect(ctx.destination);
    } catch {
      ctx = null;
      master = null;
    }
  }
  return ctx;
}

// Call from inside a user gesture (the Start / mute tap). Creating the context
// outside one leaves it suspended, and a suspended context plays nothing.
export function unlockClick() {
  const c = audioContext();
  if (!c) return;
  if (c.state === 'suspended' && c.resume) {
    try { c.resume(); } catch { /* policy refusal: clicks stay silent */ }
  }
}

// Returns what actually happened so the screen can tell the drummer when the
// browser is holding the audio back instead of leaving a silent metronome:
//   'played'  — a tick was scheduled
//   'blocked' — the context is not running; a resume was requested, so the
//               NEXT beat may play
//   'none'    — this browser exposes no Web Audio at all
export function playClick({ accent = false } = {}) {
  const c = audioContext();
  if (!c || !master) return 'none';
  if (c.state !== 'running') {
    // Phone browsers flip a context out of "running" for more than autoplay:
    // iOS does it after a call, a silent switch flip or a backgrounded tab,
    // and it comes back the moment something asks. Ask on EVERY beat — that is
    // the difference between a click that stays dead and one that returns.
    if (c.resume) { try { c.resume(); } catch { /* policy refusal */ } }
    return 'blocked';
  }
  const at = c.currentTime;
  const len = accent ? 0.07 : 0.045;
  try {
    const osc = c.createOscillator();
    const env = c.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(accent ? ACCENT_HZ : BEAT_HZ, at);
    // Hard attack, exponential decay — a click, not a note. Gain starts at a
    // tiny positive value because exponentialRamp cannot start from 0.
    env.gain.setValueAtTime(0.0001, at);
    env.gain.exponentialRampToValueAtTime(accent ? 1 : 0.62, at + 0.002);
    env.gain.exponentialRampToValueAtTime(0.0001, at + len);
    osc.connect(env);
    env.connect(master);
    osc.start(at);
    osc.stop(at + len + 0.01);
    return 'played';
  } catch { /* a refused node must never kill the visual pulse */ return 'blocked'; }
}

// Test / teardown hook: closes the shared context so a reloaded page starts
// clean and a harness can assert it exists.
export function clickAudioState() {
  return ctx ? ctx.state : 'none';
}
