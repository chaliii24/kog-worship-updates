import { useEffect, useRef, useState } from 'react';
import {
  clampBpm,
  normalizeTimeSignature,
  beatDurationMs,
  DEFAULT_BPM,
  DEFAULT_TIME_SIGNATURE,
} from './metronome.js';

// requestAnimationFrame metronome.
//
// Timing is driven by an absolute grid in `performance.now()` milliseconds,
// not by setInterval / animation-duration. Each tick asks "which beat boundary
// have we reached?" and advances the phase to that boundary — so a dropped
// frame (or a slow React commit) changes WHEN a beat is painted, never the
// mathematical tempo grid. If the tab was backgrounded for a while we skip the
// un-paintable beats in one step and continue on the same grid, which keeps the
// downbeat in the right place instead of firing a burst of catch-up flashes.
//
// The hook drives the drummer's phone transport; the console only publishes
// tempo/meter, so this is the single timing authority for the pulse.

export function useMetronomeEngine({
  enabled = false,
  bpm = DEFAULT_BPM,
  timeSignature = DEFAULT_TIME_SIGNATURE,
  onBeat,
} = {}) {
  const tempo = clampBpm(bpm);
  const beats = normalizeTimeSignature(timeSignature);

  // `beat` is 1..beats (or 0 while stopped); `pulse` increments on every beat
  // and is the trigger a component uses to restart its flash.
  const [beat, setBeat] = useState(0);
  const [pulse, setPulse] = useState(0);

  const enabledRef = useRef(false);
  const periodRef = useRef(beatDurationMs(tempo));
  const beatsRef = useRef(beats);
  const beatIndexRef = useRef(-1);
  const nextBeatAtRef = useRef(0);
  const rafRef = useRef(0);
  const onBeatRef = useRef(onBeat);
  onBeatRef.current = onBeat;

  // Tempo change while running: keep the current phase instead of snapping
  // back to beat 1. The time already elapsed in the old beat is translated
  // into the equivalent fraction of the new beat.
  useEffect(() => {
    const nextPeriod = beatDurationMs(tempo);
    const prevPeriod = periodRef.current;
    periodRef.current = nextPeriod;
    if (!enabledRef.current || prevPeriod === nextPeriod) return;
    const now = performance.now();
    const lastBeatAt = nextBeatAtRef.current - prevPeriod;
    const elapsed = Math.max(0, now - lastBeatAt);
    const progress = prevPeriod > 0 ? Math.min(1, elapsed / prevPeriod) : 1;
    nextBeatAtRef.current = now + Math.max(16, (1 - progress) * nextPeriod);
  }, [tempo]);

  // Meter change restarts on a downbeat (beat 1), which is what a drummer
  // expects when switching 4/4 -> 3/4.
  useEffect(() => {
    beatsRef.current = beats;
    if (!enabledRef.current) return;
    beatIndexRef.current = -1;
    nextBeatAtRef.current = performance.now();
    setBeat(0);
  }, [beats]);

  useEffect(() => {
    enabledRef.current = !!enabled;

    if (!enabled) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = 0;
      beatIndexRef.current = -1;
      setBeat(0);
      setPulse(0);
      return undefined;
    }

    // Start cleanly on beat 1 the moment transport starts.
    beatIndexRef.current = -1;
    nextBeatAtRef.current = performance.now();
    setBeat(0);
    setPulse(0);

    const tick = (now) => {
      if (!enabledRef.current) return;
      const period = periodRef.current;
      let due = 0;
      if (now >= nextBeatAtRef.current) {
        // Number of beat boundaries reached since the last paint. Normally 1;
        // a stall yields 2+, which we consume in ONE flash and still land on
        // the original grid.
        due = Math.floor((now - nextBeatAtRef.current) / period) + 1;
        nextBeatAtRef.current += due * period;
      }
      if (due > 0) {
        const total = beatsRef.current;
        beatIndexRef.current = (beatIndexRef.current + due) % total;
        const nextBeat = beatIndexRef.current + 1;
        setBeat(nextBeat);
        setPulse((p) => p + 1);
        if (onBeatRef.current) {
          try { onBeatRef.current(nextBeat, now); } catch { /* consumer error */ }
        }
      }
      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = 0;
    };
  }, [enabled]);

  return {
    beat,
    pulse,
    running: !!enabled,
    beats,
    bpm: tempo,
    beatDurationMs: beatDurationMs(tempo),
  };
}

export default useMetronomeEngine;
