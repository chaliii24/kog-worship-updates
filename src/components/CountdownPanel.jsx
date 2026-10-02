import React from 'react';
import { Play, Square, RefreshCw, Clock, Hourglass, Crosshair, Monitor } from 'lucide-react';
import { motion } from 'motion/react';
import { useApp } from '../context/AppContext';
import { stubTap } from '../lib/anim';
import { TileCanvas } from '../lib/perf';
import { GRADIENT_PACK } from '../lib/backgrounds';
import { TimerFace, DEFAULT_COUNTDOWN, ANIMATED_GRADIENTS } from './CountdownFace';

const PRESETS = [
  [60, '1m'], [180, '3m'], [300, '5m'], [600, '10m'], [900, '15m'], [1800, '30m'],
];

const fieldLabel = (C) => ({ fontSize: 10, color: C.faint, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 1.2, display: 'block', marginBottom: 6 });
const textInput = (C) => ({ width: '100%', background: C.input, color: C.text, border: '1px solid var(--ui-border2)', borderRadius: 8, padding: '9px 12px', fontSize: 13, outline: 'none', boxSizing: 'border-box' });

function Segmented({ C, ACCENT, options, value, onPick }) {
  return (
    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
      {options.map(([v, lbl, Icon]) => {
        const selected = value === v;
        return (
          <button
            key={v}
            onClick={() => onPick(v)}
            style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, background: selected ? ACCENT : C.elevated2, border: '1px solid ' + (selected ? ACCENT : 'var(--ui-border2)'), color: selected ? C.text : C.muted, borderRadius: 8, padding: '8px 6px', fontSize: 11.5, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}
          >
            {Icon ? <Icon size={13} /> : null}{lbl}
          </button>
        );
      })}
    </div>
  );
}

export default function CountdownPanel() {
  const { C, ACCENT, countdown, setCountdown, fireCountdownLive, stopCountdownLive } = useApp();
  const cfg = { ...DEFAULT_COUNTDOWN, ...(countdown || {}) };
  const live = !!(cfg.live);
  const set = (patch) => setCountdown((prev) => ({ ...DEFAULT_COUNTDOWN, ...(prev || {}), ...patch }));

  const mins = Math.floor((Number(cfg.durationSec) || 0) / 60);
  const secs = (Number(cfg.durationSec) || 0) % 60;
  const setDuration = (m, s) => {
    const mm = Math.max(0, Math.min(999, Math.floor(Number(m) || 0)));
    const ss = Math.max(0, Math.min(59, Math.floor(Number(s) || 0)));
    set({ durationSec: mm * 60 + ss });
  };

  const sliderRow = (label, value, min, max, step, onChange) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <label style={{ fontSize: 10, color: C.faint, fontWeight: 700, width: 52, flexShrink: 0 }}>{label}</label>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} style={{ flex: 1 }} />
      <span style={{ fontSize: 11, color: C.muted, width: 44, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{value}px</span>
    </div>
  );

  return (
    <motion.div key="countdown" initial={{ opacity: 0, x: 26 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -26 }} transition={{ type: 'spring', stiffness: 300, damping: 30 }} style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: 'var(--ui-stage)' }}>
      <div style={{ padding: '12px 18px 8px 18px', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
        <Clock size={16} color={live ? '#4ade80' : C.faint} />
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>Countdown Timer</h2>
        {live && (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'rgba(34,197,94,0.15)', border: '1px solid rgba(34,197,94,0.5)', color: '#4ade80', borderRadius: 999, padding: '3px 10px', fontSize: 10, fontWeight: 800, letterSpacing: 1 }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#22c55e', boxShadow: '0 0 8px #22c55e' }} /> LIVE
          </span>
        )}
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '4px 18px 16px 18px' }}>
        <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap' }}>
          {/* LEFT — form */}
          <div style={{ width: 380, maxWidth: '100%', flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <label style={fieldLabel(C)}>Title</label>
              <input value={cfg.title} onChange={(e) => set({ title: e.target.value })} placeholder="The service is about to start" style={textInput(C)} />
            </div>
            <div>
              <label style={fieldLabel(C)}>Subtext optional</label>
              <input value={cfg.subtext} onChange={(e) => set({ subtext: e.target.value })} placeholder="Please take your seats" style={textInput(C)} />
            </div>
            <div>
              <label style={fieldLabel(C)}>Timer mode</label>
              <Segmented C={C} ACCENT={ACCENT} value={cfg.mode} onPick={(mode) => set({ mode })} options={[
                ['duration', 'Duration', Hourglass],
                ['target', 'Target Time', Crosshair],
                ['clock', 'Current Time', Clock],
              ]} />
            </div>
            <div>
              <label style={fieldLabel(C)}>Show on</label>
              <Segmented C={C} ACCENT={ACCENT} value={cfg.showOn} onPick={(showOn) => set({ showOn })} options={[
                ['both', 'Both', Monitor],
                ['main', 'Main Output', Monitor],
                ['stage', 'Stage Display', Monitor],
              ]} />
            </div>
            {cfg.mode === 'duration' && (
              <div>
                <label style={fieldLabel(C)}>Duration</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  {/* Commit on blur/Enter, not per keystroke: clearing "5" to
                      type "10" momentarily reads "" → 0 and used to snap the
                      timer to 0 mid-type. */}
                  <input key={`cdm-${cfg.durationSec}`} type="number" min={0} max={999} defaultValue={mins} onBlur={(e) => setDuration(e.target.value, secs)} onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }} style={{ ...textInput(C), textAlign: 'center', fontWeight: 800 }} />
                  <span style={{ fontSize: 11, color: C.faint, fontWeight: 700 }}>min</span>
                  <span style={{ fontSize: 13, color: C.faint, fontWeight: 800 }}>:</span>
                  <input key={`cds-${cfg.durationSec}`} type="number" min={0} max={59} defaultValue={secs} onBlur={(e) => setDuration(mins, e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }} style={{ ...textInput(C), textAlign: 'center', fontWeight: 800 }} />
                  <span style={{ fontSize: 11, color: C.faint, fontWeight: 700 }}>sec</span>
                </div>
                <div style={{ display: 'flex', gap: 4, marginTop: 8 }}>
                  {PRESETS.map(([v, lbl]) => (
                    <button key={v} onClick={() => set({ durationSec: v })} style={{ flex: 1, background: cfg.durationSec === v ? ACCENT : C.elevated2, border: '1px solid ' + (cfg.durationSec === v ? ACCENT : 'var(--ui-border2)'), color: cfg.durationSec === v ? C.text : C.muted, borderRadius: 6, padding: '6px 0', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>{lbl}</button>
                  ))}
                </div>
              </div>
            )}
            {cfg.mode === 'target' && (
              <div>
                <label style={fieldLabel(C)}>Target time (today)</label>
                <input type="time" value={cfg.targetTime} onChange={(e) => set({ targetTime: e.target.value })} style={textInput(C)} />
              </div>
            )}
            {cfg.mode === 'clock' && (
              <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.5 }}>Shows the current time on the outputs — it never ends until you stop it.</div>
            )}
            {cfg.mode !== 'clock' && (
              <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', background: C.elevated, border: '1px solid var(--ui-border2)', borderRadius: 8, padding: '9px 10px', cursor: 'pointer' }}>
                <input type="checkbox" checked={!!cfg.overtime} onChange={(e) => set({ overtime: e.target.checked })} style={{ marginTop: 2 }} />
                <span>
                  <span style={{ display: 'block', fontSize: 12, fontWeight: 700, color: C.text }}>Continue past 0:00 (overtime)</span>
                  <span style={{ display: 'block', fontSize: 11, color: C.muted, marginTop: 2, lineHeight: 1.45 }}>When the timer reaches zero, keep counting up in red so the speaker can see how far they've gone over.</span>
                </span>
              </label>
            )}
            <div>
              <label style={fieldLabel(C)}>Font sizes</label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {sliderRow('Title', cfg.titleSize, 24, 160, 2, (v) => set({ titleSize: v }))}
                {sliderRow('Time', cfg.timeSize, 120, 500, 4, (v) => set({ timeSize: v }))}
                {sliderRow('Subtext', cfg.subtextSize, 20, 120, 2, (v) => set({ subtextSize: v }))}
              </div>
            </div>
            <div>
              <label style={fieldLabel(C)}>Background</label>
              <div style={{ display: 'flex', gap: 4, marginBottom: 8 }}>
                {[['color', 'Color'], ['gradient', 'Gradient'], ['animated', 'Animated']].map(([v, lbl]) => (
                  <button key={v} onClick={() => set({ bgType: v, bgValue: v === 'color' ? '#052e16' : v === 'animated' ? 'anim:aurora' : GRADIENT_PACK[4].css })} style={{ flex: 1, background: cfg.bgType === v ? ACCENT : C.elevated2, border: '1px solid ' + (cfg.bgType === v ? ACCENT : 'var(--ui-border2)'), color: cfg.bgType === v ? C.text : C.muted, borderRadius: 6, padding: '7px 0', fontSize: 11.5, fontWeight: 700, cursor: 'pointer' }}>{lbl}</button>
                ))}
              </div>
              {cfg.bgType === 'color' ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <input type="color" value={/^#[0-9a-fA-F]{6}$/.test(cfg.bgValue) ? cfg.bgValue : '#052e16'} onChange={(e) => set({ bgValue: e.target.value })} style={{ width: 44, height: 30, background: C.input, border: '1px solid var(--ui-border2)', borderRadius: 6, cursor: 'pointer', padding: 2 }} />
                  <span style={{ fontSize: 11, color: C.muted }}>Solid background colour</span>
                </div>
              ) : cfg.bgType === 'animated' ? (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
                  {ANIMATED_GRADIENTS.map((g) => (
                    <button key={g.id} title={`${g.name} (animated loop)`} onClick={() => set({ bgValue: `anim:${g.id}` })} style={{ height: 52, borderRadius: 7, cursor: 'pointer', border: cfg.bgValue === `anim:${g.id}` ? '2px solid ' + ACCENT : '1px solid var(--ui-border2)', background: g.base, color: '#fff', fontSize: 10, fontWeight: 800, padding: 0 }}>{g.name}</button>
                  ))}
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 6 }}>
                  {GRADIENT_PACK.map((g) => (
                    <button key={g.id} title={g.name} onClick={() => set({ bgValue: g.css })} style={{ aspectRatio: '1 / 1', borderRadius: 7, background: g.css, border: '2px solid ' + (cfg.bgValue === g.css ? ACCENT : 'var(--ui-border2)'), cursor: 'pointer', padding: 0 }} />
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* RIGHT — preview + go live */}
          <div style={{ flex: 1, minWidth: 300, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ position: 'relative', width: '100%', aspectRatio: '16 / 9', borderRadius: 12, overflow: 'hidden', background: '#000', border: '1px solid var(--ui-border2)' }}>
              <TileCanvas>
                <TimerFace timer={cfg} scale={1} />
              </TileCanvas>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <motion.button
                {...stubTap}
                onClick={() => (live ? stopCountdownLive() : fireCountdownLive())}
                style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, background: live ? 'rgba(239,68,68,0.9)' : '#10b981', border: 'none', color: '#fff', borderRadius: 10, padding: '12px 0', fontSize: 13.5, fontWeight: 800, cursor: 'pointer' }}
              >
                {live ? <Square size={14} /> : <Play size={14} />} {live ? 'Stop Timer' : 'Go Live'}
              </motion.button>
              <motion.button {...stubTap} title="Stop and reset" onClick={() => stopCountdownLive()} style={{ width: 46, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: C.elevated2, border: '1px solid var(--ui-border2)', color: C.muted, borderRadius: 10, cursor: 'pointer' }}>
                <RefreshCw size={15} />
              </motion.button>
            </div>
            {live && (
              <div style={{ fontSize: 11, color: C.muted, textAlign: 'center' }}>
                Live on {cfg.showOn === 'both' ? 'Main Output + Stage Display' : cfg.showOn === 'main' ? 'Main Output' : 'Stage Display'} — Stop clears {cfg.showOn === 'stage' ? 'the stage' : 'the output to black'}.
              </div>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
}
