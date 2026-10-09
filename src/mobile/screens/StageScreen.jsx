import React, { useEffect, useMemo, useState } from 'react';
import { motion } from 'motion/react';
import { Smartphone } from 'lucide-react';
import { stripMarkup } from '../../lib/lyrics';
import { fmtClock, LAYOUT_PRESETS } from '../../lib/stageLayout';
import { transposeChart, toNashville, keyOffset } from '../../lib/chords';

// A phone-sized mirror of the physical stage display: same content, same
// viewport-relative sizing, so a singer reads it from 2-3 m just like they
// would the stage monitor — and it scales correctly on any phone resolution.
// When the console pushes the stage feed (cfg + flow), the phone mirrors the
// monitor's clock, alert banner, flow tracker and high-contrast mode too.
export default function StageScreen({ C, state, status, onSwitchRole }) {
  const [view, setView] = useState(() => ({ h: window.innerHeight }));
  useEffect(() => {
    const onResize = () => setView({ h: window.innerHeight });
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const stage = state?.stage || null;
  const live = state?.live || null;
  const current = stage?.current || (live ? { title: live.title, label: live.label, text: live.text } : null);
  const next = stage?.next || null;
  const cleared = !(current && (current.text || current.title));

  // Stage config mirror (older consoles push nothing → legacy behavior).
  // ROLE: each phone picks its own view — 'follow' mirrors the monitor's
  // config exactly; a role preset overlays THAT role's module flags while
  // keeping everything shared (alert, clock format, traffic, play key, BPM).
  // Stored on the device, so every singer keeps their own choice.
  const baseCfg = stage?.cfg || null;
  const [role, setRole] = useState(() => {
    try { return localStorage.getItem('kog_stage_role') || 'follow'; } catch { return 'follow'; }
  });
  const pickRole = (id) => {
    setRole(id);
    try { localStorage.setItem('kog_stage_role', id); } catch { /* private mode */ }
  };
  const cfg = useMemo(() => {
    if (!baseCfg) return null;
    if (role === 'follow') return baseCfg;
    const preset = LAYOUT_PRESETS[role];
    if (!preset) return baseCfg;
    const { label, ...flags } = preset;
    return { ...baseCfg, ...flags, layout: role };
  }, [baseCfg, role]);
  const flow = stage?.flow || null;
  const high = !!cfg && cfg.contrast !== 'standard';
  const bg = high ? '#000000' : C.panel;
  const curColor = cfg?.contrast === 'high-white' ? '#ffffff' : cfg?.contrast === 'high-yellow' ? '#fde047' : C.text;
  const nextColor = cfg?.contrast === 'high-white' ? '#fde047' : cfg?.contrast === 'high-yellow' ? '#ffffff' : C.muted;
  const labelColor = high ? (cfg?.contrast === 'high-white' ? '#ffffff' : '#fde047') : C.accLine;
  const faint = high ? 'rgba(255,255,255,0.62)' : C.faint;

  // 1s tick for the mirrored clock + alert expiry.
  const [now, setNow] = useState(() => Date.now());
  const alertRaw = cfg && cfg.showAlert !== false && cfg.alert && cfg.alert.text ? cfg.alert : null;
  const alertActive = !!(alertRaw && (!alertRaw.until || now < alertRaw.until));
  useEffect(() => {
    if (!cfg?.clock && !alertActive) return undefined;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [cfg?.clock, alertActive]);

  const h = view.h || 800;
  const fitSize = (base, floor, budget, lines) =>
    Math.max(h * floor, Math.min(h * base, (h * budget) / (Math.max(1, lines) * 1.3)));

  // Chord chart (Worship Leader role or operator toggle): transposed exactly
  // the way the monitor does it — same lib, same play key, Nashville switch.
  let chordText = '';
  if (cfg?.showChords && stage?.chord?.text) {
    const semis = keyOffset(stage.chord.key || 'C', cfg.playKey || 'C');
    const t = transposeChart(stage.chord.text, semis, { preferFlats: /b$/.test(cfg.playKey || '') });
    chordText = cfg.nashville ? toNashville(t, cfg.playKey || 'C') : t;
  }

  const nextLines = Math.max(1, String(next?.text || '').split('\n').length);
  const nextSize = fitSize(0.038, 0.020, 0.22, nextLines);
  const nextRatio = Math.min(0.42, 0.14 + 0.07 + (nextLines * nextSize * 1.3) / h);
  // Chords take their own vertical slice (~17vh) — give the lyric that
  // budget up front so it never clips behind the chart.
  const curBudget = Math.max(0.24, 1 - 0.16 - 0.06 - nextRatio - (chordText ? 0.21 : 0));
  const curSize = fitSize(0.070, 0.028, curBudget, String(current?.text || '').split('\n').length);

  const offline = status !== 'online';

  return (
    <div style={{ minHeight: '100dvh', background: bg, color: curColor, display: 'flex', flexDirection: 'column', padding: 'calc(16px + env(safe-area-inset-top)) 20px calc(16px + env(safe-area-inset-bottom))' }}>
      {/* Header: kept quiet — this screen is for reading, not tapping. */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: '1.6vh' }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, background: 'rgba(34,197,94,0.14)', border: '1px solid rgba(34,197,94,0.4)', color: '#4ade80', padding: '5px 12px', borderRadius: 999, fontSize: 11, fontWeight: 900, letterSpacing: 1.2 }}>
          <span style={{ width: 7, height: 7, borderRadius: '50%', background: cleared ? (high ? '#666' : C.faint2) : '#22c55e', boxShadow: cleared ? 'none' : '0 0 8px #22c55e' }} />
          {cleared ? 'CLEARED' : 'LIVE'}
        </span>
        {cfg?.clock && (
          <span style={{ fontSize: 15, fontWeight: 900, fontVariantNumeric: 'tabular-nums', color: curColor, letterSpacing: 0.5 }}>
            {fmtClock(now, cfg.clockFormat)}
          </span>
        )}
        <button onClick={() => onSwitchRole('control')} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'transparent', border: 'none', color: C.accLine, fontSize: 12.5, fontWeight: 800, cursor: 'pointer', padding: 6, fontFamily: 'inherit' }}>
          <Smartphone size={14} /> Control
        </button>
      </div>

      {/* ROLE PICKER: every phone chooses its own view (or Follow = mirror
          the stage monitor). Device-local — tapping it can't disturb the
          console or anyone else's screen. */}
      <div style={{ display: 'flex', gap: 5, marginBottom: '1.4vh', flexShrink: 0 }}>
        {[['follow', 'Follow'], ['pastor', 'Pastor'], ['worship', 'Worship'], ['drummer', 'Drummer']].map(([id, lbl]) => {
          const on = role === id;
          return (
            <button
              key={id}
              onClick={() => pickRole(id)}
              style={{ flex: 1, background: on ? (high ? '#fde047' : 'rgba(139,92,246,0.35)') : (high ? 'rgba(255,255,255,0.08)' : C.elevated2), border: `1px solid ${on ? 'transparent' : C.border2}`, color: on ? '#000000' : (high ? 'rgba(255,255,255,0.62)' : C.muted), borderRadius: 999, padding: '4px 0', fontSize: 9.5, fontWeight: 900, letterSpacing: 0.5, textTransform: 'uppercase', cursor: 'pointer', fontFamily: 'inherit' }}
            >
              {lbl}
            </button>
          );
        })}
      </div>

      {/* Stage alert: same message the monitor shows (stage-only). */}
      {alertActive && (
        <div style={{ marginBottom: '1.6vh', borderRadius: 8, padding: '9px 12px', background: alertRaw.level === 'urgent' ? '#dc2626' : '#b45309', color: '#ffffff', fontSize: 15, fontWeight: 900, textAlign: 'center', flexShrink: 0 }}>
          {String(alertRaw.text)}
        </div>
      )}

      {/* Song flow tracker: current part highlighted (same as the monitor). */}
      {cfg?.showFlow !== false && flow?.labels?.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 4, marginBottom: '1.6vh', flexShrink: 0 }}>
          {flow.labels.map((label, i) => (
            <React.Fragment key={`${label}-${i}`}>
              {i > 0 && <span style={{ color: faint, fontSize: 10, fontWeight: 900 }}>›</span>}
              <span style={{ fontSize: 9.5, fontWeight: 900, letterSpacing: 0.6, textTransform: 'uppercase', padding: '2px 7px', borderRadius: 999, background: i === flow.index ? (high ? '#fde047' : 'rgba(139,92,246,0.35)') : (high ? 'rgba(255,255,255,0.08)' : C.elevated2), color: i === flow.index ? '#000000' : faint, border: `1px solid ${i === flow.index ? 'transparent' : C.border2}` }}>
                {label}
              </span>
            </React.Fragment>
          ))}
        </div>
      )}

      {/* Current lyric */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', minHeight: 0 }}>
        <div style={{ fontSize: '1.7vh', fontWeight: 900, color: labelColor, textTransform: 'uppercase', letterSpacing: 1.6, marginBottom: '1vh' }}>
          {current?.title ? `${current.title} · ` : ''}{current?.label || ''}
        </div>
        {cleared ? (
          <p style={{ margin: 0, fontSize: `${Math.max(20, h * 0.034)}px`, fontWeight: 800, color: faint }}>
            {status === 'online' ? 'Nothing on air' : 'Waiting for the computer…'}
          </p>
        ) : (
          <p style={{ margin: 0, fontSize: `${curSize}px`, lineHeight: 1.3, fontWeight: 800, whiteSpace: 'pre-line', overflow: 'hidden', color: curColor, textShadow: high ? 'none' : '0 2px 18px rgba(99,102,241,0.22)' }}>
            {stripMarkup(current?.text)}
          </p>
        )}
      </div>

      {/* Chord chart: portrait-friendly slice under the lyric — what the
          Worship Leader role actually asks for. */}
      {chordText && (
        <div style={{ flexShrink: 0, maxHeight: '17vh', overflow: 'hidden', borderTop: `1px solid ${high ? '#26262b' : C.border2}`, paddingTop: '1.3vh', marginTop: '1.3vh' }}>
          <div style={{ fontSize: '1.3vh', fontWeight: 900, color: labelColor, textTransform: 'uppercase', letterSpacing: 1.4, marginBottom: '0.7vh' }}>
            Chords{cfg.nashville ? ' · Nashville' : ` · ${cfg.playKey || 'C'}`}
          </div>
          <pre style={{ margin: 0, fontFamily: 'ui-monospace, Consolas, monospace', fontSize: 13, lineHeight: 1.5, whiteSpace: 'pre-wrap', color: curColor, overflow: 'hidden' }}>{chordText}</pre>
        </div>
      )}

      {/* Next block */}
      <div style={{ borderTop: `1px solid ${high ? '#26262b' : C.border2}`, paddingTop: '2vh', minHeight: '14vh', flexShrink: 0 }}>
        <div style={{ fontSize: '1.6vh', fontWeight: 900, color: faint, textTransform: 'uppercase', letterSpacing: 1.8, marginBottom: '0.9vh' }}>Next</div>
        {next ? (
          <>
            <div style={{ fontSize: '1.4vh', fontWeight: 900, color: labelColor, textTransform: 'uppercase', letterSpacing: 1.2, marginBottom: '0.7vh' }}>
              {next.title ? `${next.title} · ` : ''}{next.label}
            </div>
            <p style={{ margin: 0, fontSize: `${nextSize}px`, lineHeight: 1.3, fontWeight: 700, whiteSpace: 'pre-line', color: nextColor, overflow: 'hidden' }}>{stripMarkup(next.text)}</p>
          </>
        ) : (
          <p style={{ margin: 0, fontSize: '1.7vh', color: faint }}>— Nothing queued —</p>
        )}
      </div>

      {offline && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          style={{ position: 'fixed', left: 0, right: 0, bottom: 'calc(10px + env(safe-area-inset-bottom))', textAlign: 'center', fontSize: 12, fontWeight: 800, color: '#f87171' }}
        >
          Connection lost — reconnecting…
        </motion.div>
      )}
    </div>
  );
}
