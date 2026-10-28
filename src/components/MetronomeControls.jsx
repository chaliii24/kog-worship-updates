import React, { useCallback, useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { Music, Timer } from 'lucide-react';
import { stubTap } from '../lib/anim';
import {
  clampBpm,
  normalizeTimeSignature,
  computeTapTempo,
  pushTap,
  meterLabel,
  TIME_SIGNATURE_OPTIONS,
} from '../lib/metronome';

const fieldLabel = (C) => ({
  fontSize: 10,
  color: C.faint,
  fontWeight: 800,
  textTransform: 'uppercase',
  letterSpacing: 1.2,
  display: 'block',
  marginBottom: 6,
});

const textInput = (C) => ({
  background: C.input,
  color: C.text,
  border: '1px solid var(--ui-border2)',
  borderRadius: 8,
  padding: '8px 11px',
  fontSize: 13,
  outline: 'none',
  boxSizing: 'border-box',
});

// Console side of the visual metronome. It publishes the two things every
// drummer phone shares — tempo (cfg.bpm) and meter (cfg.timeSignature) — plus
// tap tempo, averaged over the last 4 taps and scoped to this card's Spacebar
// so typing in the rest of the console is untouched.
//
// Transport deliberately lives on the drummer's OWN phone (?role=drummer):
// the console says what the pulse should be, the drummer decides when it runs.
// That way each drummer can start/stop without touching the operator's screen.
export default function MetronomeControls({ C, ACCENT, cfg, set }) {
  const bpm = clampBpm(cfg?.bpm);
  const timeSignature = normalizeTimeSignature(cfg?.timeSignature);

  const [tapCount, setTapCount] = useState(0);
  const tapsRef = useRef([]);
  const tapResetRef = useRef(null);

  useEffect(() => () => clearTimeout(tapResetRef.current), []);

  const tap = useCallback(() => {
    const now = performance.now();
    const taps = pushTap(tapsRef.current, now);
    tapsRef.current = taps;
    setTapCount(taps.length);
    clearTimeout(tapResetRef.current);
    tapResetRef.current = setTimeout(() => {
      tapsRef.current = [];
      setTapCount(0);
    }, 2200);

    const nextBpm = computeTapTempo(taps);
    // First tap establishes the phase; from the second tap on, every press
    // immediately pushes the newly averaged tempo to the phones.
    if (nextBpm != null) set({ bpm: nextBpm, metronome: true });
  }, [set]);

  const onKeyDown = (event) => {
    if (event.key !== ' ' && event.code !== 'Space') return;
    const tag = (event.target && event.target.tagName) || '';
    // Never steal Space from inputs, selects or buttons — those keep their
    // native keyboard behaviour. Focus the card itself to tap.
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || tag === 'BUTTON' || tag === 'A') return;
    event.preventDefault();
    if (!event.repeat) tap();
  };

  return (
    <div
      tabIndex={0}
      role="group"
      aria-label="Metronome tempo and meter"
      aria-keyshortcuts="Space"
      onKeyDown={onKeyDown}
      style={{
        background: C.panel,
        border: '1px solid var(--ui-border2)',
        borderRadius: 12,
        padding: '13px 15px',
        outline: 'none',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 11 }}>
        <Music size={14} color={ACCENT} />
        <span style={{ fontSize: 10.5, fontWeight: 800, color: C.faint, textTransform: 'uppercase', letterSpacing: 1.4 }}>
          Metronome
        </span>
        <span style={{ flex: 1 }} />
        <span style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          fontSize: 9.5, fontWeight: 900, letterSpacing: 1, textTransform: 'uppercase',
          color: C.muted,
        }}>
          <span style={{ width: 7, height: 7, borderRadius: '50%', background: C.faint2 }} />
          Drummer starts
        </span>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
        <label style={{ ...fieldLabel(C), marginBottom: 0 }}>Tempo</label>
        <input
          type="range"
          min={40}
          max={220}
          step={1}
          value={bpm}
          aria-label="Metronome tempo"
          onChange={(e) => set({ bpm: clampBpm(e.target.value), metronome: true })}
          style={{ flex: 1, minWidth: 60 }}
        />
        <input
          type="number"
          min={40}
          max={220}
          value={bpm}
          aria-label="Metronome BPM"
          onChange={(e) => set({ bpm: clampBpm(e.target.value), metronome: true })}
          style={{ ...textInput(C), width: 66, padding: '5px 8px', fontSize: 12, textAlign: 'center' }}
        />
        <span style={{ fontSize: 10, fontWeight: 800, color: C.muted }}>BPM</span>
      </div>

      <div style={{ marginTop: 11 }}>
        <label style={fieldLabel(C)}>Time signature</label>
        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
          {TIME_SIGNATURE_OPTIONS.map((n) => {
            const on = timeSignature === n;
            return (
              <button
                key={n}
                onClick={() => set({ timeSignature: n, metronome: true })}
                title={`${meterLabel(n)} — beat 1 is the downbeat`}
                style={{
                  background: on ? 'rgba(255,184,0,0.18)' : C.elevated2,
                  border: `1px solid ${on ? 'rgba(255,184,0,0.55)' : 'var(--ui-border2)'}`,
                  color: on ? '#FFC72C' : C.muted,
                  borderRadius: 999, padding: '5px 12px', fontSize: 11,
                  fontWeight: 900, cursor: 'pointer', fontVariantNumeric: 'tabular-nums',
                }}
              >
                {meterLabel(n)}
              </button>
            );
          })}
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12 }}>
        <motion.button
          {...stubTap}
          onClick={tap}
          title="Tap along to set the tempo (or focus this card and press Space)"
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            background: tapCount ? 'rgba(255,184,0,0.18)' : C.elevated2,
            border: `1px solid ${tapCount ? 'rgba(255,184,0,0.55)' : 'var(--ui-border2)'}`,
            color: tapCount ? '#FFC72C' : C.text2,
            borderRadius: 8, padding: '7px 13px', fontSize: 11.5, fontWeight: 800,
            cursor: 'pointer',
          }}
        >
          <Timer size={13} /> Tap tempo
          <span style={{ fontSize: 9.5, fontWeight: 900, letterSpacing: 0.8, color: C.faint }}>
            {tapCount ? `${tapCount} TAP${tapCount === 1 ? '' : 'S'}` : 'SPACE'}
          </span>
        </motion.button>
        <span style={{ fontSize: 10.5, color: C.faint, lineHeight: 1.4 }}>
          Focus this card, then tap Space. Averages the last 4 taps.
        </span>
      </div>

      <p style={{ margin: '10px 0 0 0', fontSize: 10.5, color: C.faint, lineHeight: 1.5 }}>
        Send the drummer to the phone provision (<b>?role=drummer</b>) or the Stage tab link. Tempo and meter sync automatically;
        the drummer taps <b>Start</b> on the phone. Beat 1 flashes red, the rest pulse white.
      </p>
    </div>
  );
}
