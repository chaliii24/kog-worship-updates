// Booth-audio engine (singleton): ambient pad synth, BGM playlist, and
// backing-track transport. Lives OUTSIDE React so playback survives tab
// switches — panels just drive it and poll its snapshot.
//
// Surfaces:
// - Pads: WebAudio-synthesized worship drones in any key (no files needed).
//   Crossfading oscillators (root + fifth + octave + sub) through a slowly
//   breathing lowpass filter, infinite by construction.
// - BGM: walk-in/walk-out playlist queue on a plain <audio> element.
// - Track: backing-track transport with seek + split-track (L/R) routing.
// - Routing: setSinkId pushes every element at the selected hardware output.

const lsGet = (k, fb) => {
  try {
    const v = localStorage.getItem(k);
    return v == null ? fb : JSON.parse(v);
  } catch { return fb; }
};
const lsSet = (k, v) => {
  try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private mode */ }
};

// Chromatic drone roots around C3 — low enough to sit under speech.
export const PAD_KEYS = [
  { key: 'C', freq: 130.81 },
  { key: 'C#', freq: 138.59 },
  { key: 'D', freq: 146.83 },
  { key: 'D#', freq: 155.56 },
  { key: 'E', freq: 164.81 },
  { key: 'F', freq: 174.61 },
  { key: 'F#', freq: 185.0 },
  { key: 'G', freq: 196.0 },
  { key: 'G#', freq: 207.65 },
  { key: 'A', freq: 220.0 },
  { key: 'A#', freq: 233.08 },
  { key: 'B', freq: 246.94 },
];

// Which octave the C3-rooted grid is played in. C3 sits UNDER speech (muddy
// on small speakers), C4 is the airy worship register, C5 is pure shimmer —
// the sub oscillator is always one octave below, so it stays out of the way.
export const PAD_OCTAVES = [
  { id: 0, label: 'C3', mult: 1 },
  { id: 1, label: 'C4', mult: 2 },
  { id: 2, label: 'C5', mult: 4 },
];

function rampVolume(el, from, to, sec, done) {
  try { el.volume = Math.max(0, Math.min(1, from)); } catch {}
  if (sec <= 0) {
    try { el.volume = Math.max(0, Math.min(1, to)); } catch {}
    if (done) done();
    return null;
  }
  const steps = Math.max(1, Math.round(sec * 10));
  let i = 0;
  const id = setInterval(() => {
    i += 1;
    const v = from + ((to - from) * i) / steps;
    try { el.volume = Math.max(0, Math.min(1, v)); } catch {}
    if (i >= steps) {
      clearInterval(id);
      if (done) done();
    }
  }, 100);
  return id;
}

class AudioEngine {
  constructor() {
    this.listeners = new Set();
    // Pads
    this._ctx = null;
    this._padBus = null; // gain → destination, owns master pad volume
    this._padNodes = null; // live drone nodes for crossfade-out
    this.padOn = lsGet('kog-pads-on', false);
    this.padKey = lsGet('kog-pads-key', null);
    this.padVol = lsGet('kog-pads-vol', 0.7);
    this.padOctave = lsGet('kog-pads-oct', 1); // 0=C3 1=C4 2=C5
    // BGM
    this.bgmEl = null;
    this.bgmQueue = lsGet('kog-bgm-queue', []);
    this.bgmIndex = 0;
    this.bgmPlaying = false;
    this.bgmVol = lsGet('kog-bgm-vol', 0.7);
    this.bgmAutoFade = lsGet('kog-bgm-autofade', true);
    this.bgmFadeSec = lsGet('kog-bgm-fadesec', 4);
    this._bgmFadeTimer = null;
    // Backing track
    this.trackEl = null;
    this.trackUrl = null;
    this.trackPlaying = false;
    this.trackVol = lsGet('kog-track-vol', 0.9);
    this.trackLoop = lsGet('kog-track-loop', true);
    this.trackTime = 0;
    this.trackDur = 0;
    this.splitMap = lsGet('kog-split-tracks', {});
    this.houseSide = lsGet('kog-house-side', 'both'); // both | L | R
    this._splitGraph = null;
    this.splitUnsupported = false;
    // Routing
    this.sinkId = lsGet('kog-audio-sink', '');
    this._peaks = new Map();
  }

  sub(fn) {
    this.listeners.add(fn);
    return () => { this.listeners.delete(fn); };
  }
  emit() {
    this.listeners.forEach((fn) => { try { fn(); } catch {} });
  }

  snapshot() {
    return {
      padOn: this.padOn, padKey: this.padKey, padVol: this.padVol, padOctave: this.padOctave,
      bgmQueue: this.bgmQueue, bgmIndex: this.bgmIndex, bgmPlaying: this.bgmPlaying,
      bgmVol: this.bgmVol, bgmAutoFade: this.bgmAutoFade, bgmFadeSec: this.bgmFadeSec,
      trackUrl: this.trackUrl, trackPlaying: this.trackPlaying, trackVol: this.trackVol,
      trackLoop: this.trackLoop, trackTime: this.trackTime, trackDur: this.trackDur,
      houseSide: this.houseSide, splitUnsupported: this.splitUnsupported,
      sinkId: this.sinkId,
    };
  }

  // ---- shared -----------------------------------------------------------
  _ensureBgmEl() {
    if (!this.bgmEl) {
      this.bgmEl = new Audio();
      this.bgmEl.preload = 'auto';
      try { this.bgmEl.volume = this.bgmVol; } catch {}
      this._applySink(this.bgmEl);
      this.bgmEl.addEventListener('ended', () => { this.bgmNext(true); });
      this.bgmEl.addEventListener('play', () => { this.bgmPlaying = true; this.emit(); });
      this.bgmEl.addEventListener('pause', () => { this.bgmPlaying = false; this.emit(); });
    }
    return this.bgmEl;
  }

  _ensureTrackEl() {
    if (!this.trackEl) {
      this.trackEl = new Audio();
      this.trackEl.preload = 'auto';
      try { this.trackEl.volume = this.trackVol; } catch {}
      try { this.trackEl.loop = !!this.trackLoop; } catch {}
      this._applySink(this.trackEl);
      this.trackEl.addEventListener('play', () => { this.trackPlaying = true; this.emit(); });
      this.trackEl.addEventListener('pause', () => { this.trackPlaying = false; this.emit(); });
      this.trackEl.addEventListener('timeupdate', () => {
        this.trackTime = this.trackEl.currentTime || 0;
        this.trackDur = this.trackEl.duration || 0;
        this.emit();
      });
      this.trackEl.addEventListener('loadedmetadata', () => {
        this.trackDur = this.trackEl.duration || 0;
        this.emit();
      });
    }
    return this.trackEl;
  }

  _ctxEnsure() {
    if (!this._ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      this._ctx = new AC();
      this._padBus = this._ctx.createGain();
      this._padBus.gain.value = this.padOn ? this.padVol * 0.5 : 0;
      this._padBus.connect(this._ctx.destination);
      try {
        if (this.sinkId && this._ctx.setSinkId) this._ctx.setSinkId(this.sinkId).catch(() => {});
      } catch {}
    }
    if (this._ctx && this._ctx.state === 'suspended') this._ctx.resume().catch(() => {});
    return this._ctx;
  }

  _applySink(el) {
    if (!el || !this.sinkId) return;
    try {
      if (typeof el.setSinkId === 'function') el.setSinkId(this.sinkId).catch(() => {});
    } catch {}
  }

  async listOutputs() {
    try {
      const devs = await navigator.mediaDevices.enumerateDevices();
      return (devs || []).filter((d) => d.kind === 'audiooutput');
    } catch { return []; }
  }

  setSink(id) {
    this.sinkId = id || '';
    lsSet('kog-audio-sink', this.sinkId);
    [this.bgmEl, this.trackEl].forEach((el) => this._applySink(el));
    try {
      if (this._ctx && this._ctx.setSinkId && this.sinkId) this._ctx.setSinkId(this.sinkId).catch(() => {});
    } catch {}
    this.emit();
  }

  // ---- pads ---------------------------------------------------------------
  setPadEnabled(on) {
    this.padOn = !!on;
    lsSet('kog-pads-on', this.padOn);
    if (!on) {
      this._padStop(2.2); // dry release as slow as the swell; verb rings on
      this.padKey = null;
      lsSet('kog-pads-key', null);
    } else if (!this.padKey) {
      this.padStart('C');
    } else {
      const ctx = this._ctxEnsure();
      if (ctx && this._padBus) {
        this._padBus.gain.cancelScheduledValues(ctx.currentTime);
        this._padBus.gain.setTargetAtTime(this.padVol * 0.5, ctx.currentTime, 0.4);
      }
    }
    this.emit();
  }

  setPadVolume(v) {
    this.padVol = Math.max(0, Math.min(1, Number(v) || 0));
    lsSet('kog-pads-vol', this.padVol);
    const ctx = this._ctx;
    if (ctx && this._padBus && this.padOn) {
      this._padBus.gain.setTargetAtTime(this.padVol * 0.5, ctx.currentTime, 0.2);
    }
    this.emit();
  }

  // Shared ambient FX, built once per AudioContext: a generated hall impulse.
  // EVERY pad feeds it, so a key change leaves the old tail ringing under the
  // new swell instead of opening a hole in the room — that overlap is most of
  // what makes a drone read as "ambient" rather than "a synth note being held".
  _padFx() {
    if (this._padFxNodes) return this._padFxNodes;
    const ctx = this._ctx;
    if (!ctx) return null;
    const dry = ctx.createGain();
    dry.gain.value = 0.62;
    const verb = ctx.createConvolver();
    try { verb.buffer = this._padImpulse(3.0, 2.4); } catch { /* fall back to dry */ }
    const wet = ctx.createGain();
    wet.gain.value = 1.4;
    const send = ctx.createGain(); // shared input — every pad taps in here
    // No auto-pan. The drone sits dead centre and STAYS there: a slow pan
    // made it wander between the speakers like something buzzing round your
    // head. All the sense of space comes from the reverb instead.
    send.connect(verb);
    verb.connect(wet);
    wet.connect(this._padBus);
    dry.connect(this._padBus);
    this._padFxNodes = { dry, wet, verb, send };
    return this._padFxNodes;
  }

  // Hall tail built from damped noise — no audio file to ship, no download,
  // and the one-pole smoothing keeps it dark and warm instead of fizzy.
  _padImpulse(seconds = 3.0, decay = 2.4) {
    const ctx = this._ctx;
    const rate = ctx.sampleRate;
    const len = Math.max(1, Math.floor(rate * seconds));
    const buf = ctx.createBuffer(2, len, rate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      let prev = 0;
      for (let i = 0; i < len; i++) {
        const env = Math.pow(1 - i / len, decay);
        prev += 0.32 * ((Math.random() * 2 - 1) * env - prev);
        d[i] = prev;
      }
    }
    return buf;
  }

  // Register. Re-voices the live drone through padStart so it crossfades to
  // the new octave instead of jumping — same 2.6s blend as a key change.
  setPadOctave(id) {
    const hit = PAD_OCTAVES.find((o) => o.id === Number(id));
    if (!hit || hit.id === this.padOctave) return;
    this.padOctave = hit.id;
    lsSet('kog-pads-oct', this.padOctave);
    if (this.padOn && this.padKey) this.padStart(this.padKey);
    this.emit();
  }

  padStart(key) {
    const ctx = this._ctxEnsure();
    if (!ctx) return;
    const def = PAD_KEYS.find((k) => k.key === key);
    if (!def) return;
    const oct = PAD_OCTAVES.find((o) => o.id === this.padOctave) || PAD_OCTAVES[1];
    const root = def.freq * oct.mult;
    const fx = this._padFx();
    this.padOn = true;
    lsSet('kog-pads-on', true);
    this.padKey = key;
    lsSet('kog-pads-key', key);
    const t = ctx.currentTime;
    // Fade the previous drone out instead of cutting it.
    const old = this._padNodes;
    if (old) {
      try {
        old.gain.gain.cancelScheduledValues(t);
        old.gain.gain.setValueAtTime(old.gain.gain.value, t);
        old.gain.gain.linearRampToValueAtTime(0, t + 2.6);
        setTimeout(() => { try { old.nodes.forEach((n) => { try { n.stop(); } catch {} }); } catch {} try { old.gain.disconnect(); } catch {} }, 2900);
      } catch {}
    }
    // The voice: a plain open-fifth stack — sub · root · fifth · octave · a
    // whisper of fifth-up. Everything is a SINE and everything is STATIC once
    // it has bloomed. The previous version modulated four ways at once (pan
    // drifting between speakers, a filter breathing ±430Hz, level swelling,
    // and detuned highs beating at several Hz) and the combination read as a
    // mosquito circling your ear. Now it just sits there and glows.
    const swell = ctx.createGain();
    swell.gain.setValueAtTime(0, t);
    swell.gain.linearRampToValueAtTime(1, t + 3.0);

    // Opens once during the attack, then never moves again.
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(520, t);
    filter.frequency.linearRampToValueAtTime(1150, t + 5);
    filter.Q.value = 0.6;

    // Detune only on the root, and only ±4 cents: at C3 that is a 0.6Hz
    // swell — warmth, not buzz. The high partials get NONE, because beat
    // rate scales with pitch and wide detune up there is exactly the whine
    // we are trying to get rid of.
    const PARTIALS = [
      { r: 0.5, type: 'sine', g: 0.26, ds: [0] },   // sub
      { r: 1, type: 'sine', g: 0.38, ds: [-4, 4] },   // root
      { r: 1.5, type: 'sine', g: 0.24, ds: [0] },     // fifth
      { r: 2, type: 'sine', g: 0.22, ds: [0] },       // octave
      { r: 3, type: 'sine', g: 0.07, ds: [0] },       // fifth up (air)
    ];
    const nodes = [];
    PARTIALS.forEach((p) => {
      p.ds.forEach((det) => {
        const o = ctx.createOscillator();
        o.type = p.type;
        o.frequency.value = root * p.r;
        o.detune.value = det;
        const og = ctx.createGain();
        og.gain.value = (p.g * 0.4) / p.ds.length;
        o.connect(og);
        og.connect(filter);
        o.start(t + 0.05);
        nodes.push(o);
      });
    });

    filter.connect(swell);
    if (fx) {
      swell.connect(fx.dry);
      swell.connect(fx.send); // the wet tail outlives this drone
    } else {
      swell.connect(this._padBus);
    }
    this._padBus.gain.cancelScheduledValues(t);
    this._padBus.gain.setTargetAtTime(this.padVol * 0.5, t, 0.4);
    this._padNodes = { gain: swell, nodes: [...nodes, filter] };
    this.emit();
  }

  _padStop(fadeSec = 1.2) {
    const ctx = this._ctx;
    const live = this._padNodes;
    this._padNodes = null;
    if (!ctx || !live) return;
    const t = ctx.currentTime;
    try {
      live.gain.gain.cancelScheduledValues(t);
      live.gain.gain.setValueAtTime(live.gain.gain.value, t);
      live.gain.gain.linearRampToValueAtTime(0, t + fadeSec);
      setTimeout(() => {
        try { live.nodes.forEach((n) => { try { n.stop(); } catch {} }); } catch {}
        try { live.gain.disconnect(); } catch {}
      }, fadeSec * 1000 + 200);
    } catch {}
  }

  padFadeOut() {
    this._padStop(2.5);
    this.padOn = false;
    this.padKey = null;
    lsSet('kog-pads-on', false);
    lsSet('kog-pads-key', null);
    this.emit();
  }

  // ---- BGM playlist ---------------------------------------------------------
  setBgmQueue(list) {
    this.bgmQueue = (list || []).filter(Boolean);
    lsSet('kog-bgm-queue', this.bgmQueue);
    if (this.bgmIndex >= this.bgmQueue.length) this.bgmIndex = 0;
    this.emit();
  }

  bgmAdd(urls) {
    const fresh = (urls || []).filter((u) => u && !this.bgmQueue.includes(u));
    if (!fresh.length) return;
    this.setBgmQueue([...this.bgmQueue, ...fresh]);
  }

  bgmRemove(i) {
    const next = this.bgmQueue.filter((_, x) => x !== i);
    const wasCurrent = i === this.bgmIndex;
    if (wasCurrent && this.bgmPlaying) {
      this.bgmPause();
      this.setBgmQueue(next);
      if (next.length) {
        this.bgmIndex = Math.min(i, next.length - 1);
        this.bgmPlay(this.bgmIndex);
      }
      return;
    }
    this.setBgmQueue(next);
    if (i < this.bgmIndex) this.bgmIndex = Math.max(0, this.bgmIndex - 1);
    this.emit();
  }

  bgmClear() {
    this.bgmPause();
    this.setBgmQueue([]);
    this.bgmIndex = 0;
  }

  setBgmVolume(v) {
    this.bgmVol = Math.max(0, Math.min(1, Number(v) || 0));
    lsSet('kog-bgm-vol', this.bgmVol);
    if (this._bgmFadeTimer) return; // a fade owns the fader right now
    const el = this._ensureBgmEl();
    try { el.volume = this.bgmVol; } catch {}
    this.emit();
  }

  setBgmAutoFade(on) {
    this.bgmAutoFade = !!on;
    lsSet('kog-bgm-autofade', this.bgmAutoFade);
    this.emit();
  }

  setBgmFadeSec(s) {
    this.bgmFadeSec = Math.max(1, Math.min(10, Math.round(Number(s) || 4)));
    lsSet('kog-bgm-fadesec', this.bgmFadeSec);
    this.emit();
  }

  bgmPlay(i) {
    if (!this.bgmQueue.length) return;
    const el = this._ensureBgmEl();
    if (this._bgmFadeTimer) { clearInterval(this._bgmFadeTimer); this._bgmFadeTimer = null; }
    if (typeof i === 'number') this.bgmIndex = Math.max(0, Math.min(this.bgmQueue.length - 1, i));
    const url = this.bgmQueue[this.bgmIndex];
    if (!url) return;
    try { el.volume = this.bgmVol; } catch {}
    if (el.src !== url) {
      try { el.src = url; } catch {}
    }
    el.play().catch(() => {});
    this.emit();
  }

  bgmPause() {
    if (this._bgmFadeTimer) { clearInterval(this._bgmFadeTimer); this._bgmFadeTimer = null; }
    try { this.bgmEl && this.bgmEl.pause(); } catch {}
    this.bgmPlaying = false;
    this.emit();
  }

  bgmNext(auto = false) {
    if (!this.bgmQueue.length) return;
    this.bgmIndex = (this.bgmIndex + 1) % this.bgmQueue.length;
    if (auto && !this.bgmPlaying && this.bgmEl && this.bgmEl.paused) {
      // Queue advanced while paused (removal path) — stay paused.
      this.emit();
      return;
    }
    this.bgmPlay(this.bgmIndex);
  }

  bgmPrev() {
    if (!this.bgmQueue.length) return;
    this.bgmIndex = (this.bgmIndex - 1 + this.bgmQueue.length) % this.bgmQueue.length;
    this.bgmPlay(this.bgmIndex);
  }

  fadeOutBgm(sec) {
    const el = this._ensureBgmEl();
    if (!this.bgmPlaying && el.paused) return;
    if (this._bgmFadeTimer) clearInterval(this._bgmFadeTimer);
    const from = (() => { try { return el.volume; } catch { return this.bgmVol; } })();
    this._bgmFadeTimer = rampVolume(el, from, 0, sec || this.bgmFadeSec, () => {
      this._bgmFadeTimer = null;
      try { el.pause(); } catch {}
      try { el.volume = this.bgmVol; } catch {}
      this.bgmPlaying = false;
      this.emit();
    });
    this.emit();
  }

  // Fired when the service takes over the room: first lyric slide or Go Live
  // on the countdown. BGM gets out of the way over the configured seconds.
  autoTake() {
    if (this.bgmAutoFade) this.fadeOutBgm(this.bgmFadeSec);
  }

  // Countdown hit zero: the room belongs to the service now — the whole
  // pre-service soundbed (BGM playlist + ambient pads) fades out together.
  // Same opt-in toggle as autoTake; backing tracks are song-bound and untouched.
  countdownFinished() {
    if (!this.bgmAutoFade) return;
    this.fadeOutBgm(this.bgmFadeSec);
    if (this.padOn) this.padFadeOut();
  }

  // ---- backing track ----------------------------------------------------------
  isSplit(url) {
    if (!url) return false;
    return !!this.splitMap[url];
  }

  setSplit(url, on) {
    if (!url) return;
    const next = { ...(this.splitMap || {}) };
    if (on) next[url] = true;
    else delete next[url];
    this.splitMap = next;
    lsSet('kog-split-tracks', next);
    if (url === this.trackUrl) this._applySplit();
    this.emit();
  }

  setHouseSide(side) {
    this.houseSide = side === 'L' || side === 'R' ? side : 'both';
    lsSet('kog-house-side', this.houseSide);
    this._applySplit();
    this.emit();
  }

  _buildSplitGraph() {
    const ctx = this._ctxEnsure();
    const el = this._ensureTrackEl();
    if (!ctx || this._splitGraph) return;
    try {
      const src = ctx.createMediaElementSource(el);
      const splitter = ctx.createChannelSplitter(2);
      const gL = ctx.createGain();
      const gR = ctx.createGain();
      const merger = ctx.createChannelMerger(2);
      src.connect(splitter);
      splitter.connect(gL, 0);
      splitter.connect(gR, 1);
      gL.connect(merger, 0, 0);
      gR.connect(merger, 0, 1);
      merger.connect(ctx.destination);
      this._splitGraph = { gL, gR };
    } catch {
      this.splitUnsupported = true;
    }
    this._applySplit();
  }

  _applySplit() {
    if (!this._splitGraph) return;
    const split = this.isSplit(this.trackUrl);
    const t = this._ctx ? this._ctx.currentTime : 0;
    const g = this._splitGraph;
    try {
      if (!split || this.houseSide === 'both') {
        g.gL.gain.setTargetAtTime(1, t, 0.05);
        g.gR.gain.setTargetAtTime(1, t, 0.05);
      } else if (this.houseSide === 'L') {
        g.gL.gain.setTargetAtTime(1, t, 0.05);
        g.gR.gain.setTargetAtTime(0, t, 0.05);
      } else {
        g.gL.gain.setTargetAtTime(0, t, 0.05);
        g.gR.gain.setTargetAtTime(1, t, 0.05);
      }
    } catch {}
  }

  trackLoad(url) {
    const el = this._ensureTrackEl();
    if (this.trackUrl !== url) {
      const wasPlaying = this.trackPlaying;
      try { el.pause(); } catch {}
      this.trackUrl = url || null;
      this.trackTime = 0;
      this.trackDur = 0;
      if (url) {
        try { el.src = url; } catch {}
        if (this.isSplit(url) && !this.splitUnsupported) this._buildSplitGraph();
        this._applySplit();
        if (wasPlaying && url) el.play().catch(() => {});
      }
    } else if (this.isSplit(url) && !this.splitUnsupported) {
      this._buildSplitGraph();
    }
    this.emit();
  }

  trackPlay() {
    const el = this._ensureTrackEl();
    if (!this.trackUrl) return;
    if (this.isSplit(this.trackUrl) && !this.splitUnsupported) this._buildSplitGraph();
    el.play().catch(() => {});
  }

  trackPause() {
    try { this.trackEl && this.trackEl.pause(); } catch {}
    this.trackPlaying = false;
    this.emit();
  }

  trackStop() {
    try {
      if (this.trackEl) {
        this.trackEl.pause();
        this.trackEl.currentTime = 0;
      }
    } catch {}
    this.trackPlaying = false;
    this.trackTime = 0;
    this.emit();
  }

  trackSeek(sec) {
    const el = this._ensureTrackEl();
    try { el.currentTime = Math.max(0, Math.min(this.trackDur || 0, Number(sec) || 0)); } catch {}
    this.trackTime = el.currentTime || 0;
    this.emit();
  }

  setTrackVolume(v) {
    this.trackVol = Math.max(0, Math.min(1, Number(v) || 0));
    lsSet('kog-track-vol', this.trackVol);
    try { if (this.trackEl) this.trackEl.volume = this.trackVol; } catch {}
    this.emit();
  }

  setTrackLoop(on) {
    this.trackLoop = !!on;
    lsSet('kog-track-loop', this.trackLoop);
    try { if (this.trackEl) this.trackEl.loop = this.trackLoop; } catch {}
    this.emit();
  }

  // Decoded peaks for the waveform strip (cached per URL; silent fallback).
  async getPeaks(url, bars = 96) {
    if (!url) return null;
    if (this._peaks.has(url)) return this._peaks.get(url);
    try {
      const res = await fetch(url);
      if (!res.ok) return null;
      const buf = await res.arrayBuffer();
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      const tmp = new AC();
      const audio = await tmp.decodeAudioData(buf);
      try { tmp.close(); } catch {}
      const ch = audio.getChannelData(0);
      const step = Math.max(1, Math.floor(ch.length / bars));
      const peaks = [];
      for (let i = 0; i < bars; i++) {
        let m = 0;
        const start = i * step;
        for (let j = start; j < Math.min(start + step, ch.length); j += 7) {
          const a = Math.abs(ch[j]);
          if (a > m) m = a;
        }
        peaks.push(Math.max(0.04, Math.min(1, m)));
      }
      this._peaks.set(url, peaks);
      return peaks;
    } catch { return null; }
  }
}

export const audioEngine = new AudioEngine();
