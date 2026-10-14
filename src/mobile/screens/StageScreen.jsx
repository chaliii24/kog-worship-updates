import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { Smartphone } from 'lucide-react';
import { stripMarkup } from '../../lib/lyrics';
import { fmtClock, LAYOUT_PRESETS } from '../../lib/stageLayout';
import { transposeChart, toNashville, keyOffset } from '../../lib/chords';

// A phone-sized mirror of the physical stage display: same content, same
// visual language (black stage, status strip, hero lyric, next card), sized
// in vh so it scales correctly on any phone resolution. When the console
// pushes the stage feed (cfg + flow), the phone mirrors the monitor's clock,
// alert banner, flow tracker and high-contrast mode too.
export default function StageScreen({ C, state, status, onSwitchRole }) {
  const [view, setView] = useState(() => ({ w: window.innerWidth, h: window.innerHeight }));
  useEffect(() => {
    const onResize = () => setView({ w: window.innerWidth, h: window.innerHeight });
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
  const bg = '#000000';
  const curColor = cfg?.contrast === 'high-white' ? '#ffffff' : cfg?.contrast === 'high-yellow' ? '#fde047' : C.text;
  const nextColor = cfg?.contrast === 'high-white' ? '#e9e9ec' : cfg?.contrast === 'high-yellow' ? '#fff7d6' : C.muted;
  const eyebrowColor = high ? (cfg?.contrast === 'high-white' ? '#ffffff' : '#fde047') : C.accLine;
  const faint = high ? 'rgba(255,255,255,0.55)' : C.faint;
  const hairline = high ? '#232327' : '#1e1e2a';

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
  const w = view.w || 400;
  // Landscape phones/tablets lose most of their viewport height, so sizing
  // off h alone renders at half size (and vh-set microcopy unreadably
  // small). Borrow from the abundant width instead: portrait is untouched
  // (u === h), landscape sizes up ~30-45% while budgets below still account
  // against real height, so nothing can overflow.
  const landscape = w > h;
  const u = landscape ? Math.max(h, Math.min(w * 0.62, h * 1.5)) : h;
  // Small-caps labels set in vh would drop to ~6px in landscape — floor them
  // off the same unit the lyric uses.
  const fz = (frac, min) => Math.max(min, u * frac);
  const fitSize = (base, floor, budget, lines) =>
    Math.max(u * floor, Math.min(u * base, (u * budget) / (Math.max(1, lines) * 1.3)));

  // Chord chart (Worship Leader role or operator toggle): transposed exactly
  // the way the monitor does it — same lib, same play key, Nashville switch.
  let chordText = '';
  if (cfg?.showChords && stage?.chord?.text) {
    const semis = keyOffset(stage.chord.key || 'C', cfg.playKey || 'C');
    const t = transposeChart(stage.chord.text, semis, { preferFlats: /b$/.test(cfg.playKey || '') });
    chordText = cfg.nashville ? toNashville(t, cfg.playKey || 'C') : t;
  }

  const nextLines = Math.max(1, String(next?.text || '').split('\n').length);
  const nextSize = fitSize(0.036, 0.019, 0.20, nextLines);
  const nextRatio = Math.min(0.40, 0.12 + 0.06 + (nextLines * nextSize * 1.3) / h);
  // Chords take their own slice (~16vh) — give the lyric that budget up
  // front so it never clips behind the chart.
  const curBudget = Math.max(0.26, 1 - 0.14 - 0.05 - nextRatio - (chordText ? 0.20 : 0));
  const curSize = fitSize(0.076, 0.030, curBudget, String(current?.text || '').split('\n').length) * (landscape ? 1.18 : 1);
  const heroText = cleared ? '' : stripMarkup(current?.text);

  // Measure-and-fit: bigger type must never clip. After every slide, text or
  // orientation change the hero restarts full-size; while its box overflows,
  // each pass steps down 8% (bounded at ~half, so at most a handful of
  // passes). Short lyrics stay big, long ones trim themselves to fit.
  const heroRef = useRef(null);
  const [fitScale, setFitScale] = useState(1);
  useEffect(() => { setFitScale(1); }, [current?.text, curSize]);
  useLayoutEffect(() => {
    const el = heroRef.current;
    if (!el || !heroText || fitScale <= 0.55) return;
    if (el.scrollHeight > el.clientHeight + 2) {
      setFitScale((s) => Math.max(0.55, s - 0.08));
    }
  });
  const eyebrow = [current?.title, current?.label].filter(Boolean).join('  ·  ');

  // Drummer role: BPM number only + a big beat-synced blinking light. The
  // beat period comes from the shared stage config (operator sets it in the
  // Stage tab); 96 matches the desktop metronome fallback.
  const isDrummer = role === 'drummer';
  const bpm = Math.min(220, Math.max(40, Math.round(Number(cfg?.bpm) || 96)));
  const beatSec = 60 / bpm;
  // Title: the live song while on air, else the song loaded in the operator,
  // else the service-order row still marked live (Go was pressed even if the
  // output has since been cleared). Nothing anywhere → no title, correctly.
  const liveServiceTitle = ((state?.service?.sections || []).flatMap((s) => s.items || []).find((i) => i && i.live)?.title) || '';
  const drumTitle = (current && current.title) || (state?.song && state.song.title) || liveServiceTitle || '';

  const offline = status !== 'online';

  return (
    <div style={{ minHeight: '100dvh', maxWidth: 880, width: '100%', margin: '0 auto', background: bg, color: curColor, display: 'flex', flexDirection: 'column', padding: 'calc(14px + env(safe-area-inset-top)) 18px calc(14px + env(safe-area-inset-bottom))' }}>
      {/* STATUS STRIP: live dot · clock · control */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, paddingBottom: landscape ? '1vh' : '1.4vh', marginBottom: landscape ? '1vh' : '1.4vh', borderBottom: `1px solid ${hairline}`, flexShrink: 0 }}>
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: cleared ? '#3f3f46' : '#22c55e', boxShadow: cleared ? 'none' : '0 0 10px #22c55e', flexShrink: 0 }} />
        <span style={{ fontSize: 11, fontWeight: 900, letterSpacing: 2, color: faint }}>{cleared ? 'CLEARED' : 'LIVE'}</span>
        <span style={{ flex: 1 }} />
        {cfg?.clock && (
          <span style={{ fontSize: 14, fontWeight: 800, fontVariantNumeric: 'tabular-nums', color: curColor, letterSpacing: 1 }}>
            {fmtClock(now, cfg.clockFormat)}
          </span>
        )}
        <button onClick={() => onSwitchRole('control')} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: 'transparent', border: 'none', color: C.accLine, fontSize: 12, fontWeight: 800, cursor: 'pointer', padding: 6, fontFamily: 'inherit' }}>
          <Smartphone size={14} /> Control
        </button>
      </div>

      {/* ROLE PICKER: every phone chooses its own view (or Follow = mirror
          the stage monitor). Device-local — tapping it can't disturb the
          console or anyone else's screen. */}
      <div style={{ display: 'flex', gap: 5, marginBottom: landscape ? '1vh' : '1.4vh', flexShrink: 0 }}>
        {[['follow', 'Follow'], ['pastor', 'Pastor'], ['worship', 'Worship'], ['drummer', 'Drummer']].map(([id, lbl]) => {
          const on = role === id;
          return (
            <button
              key={id}
              onClick={() => pickRole(id)}
              style={{ flex: 1, background: on ? eyebrowColor : 'transparent', border: `1px solid ${on ? eyebrowColor : hairline}`, color: on ? '#000000' : faint, borderRadius: 999, padding: '5px 0', fontSize: 9.5, fontWeight: 900, letterSpacing: 0.8, textTransform: 'uppercase', cursor: 'pointer', fontFamily: 'inherit' }}
            >
              {lbl}
            </button>
          );
        })}
      </div>

      {/* Stage alert: same message the monitor shows (stage-only). */}
      {alertActive && (
        <div style={{ marginBottom: landscape ? '1vh' : '1.4vh', borderRadius: 10, padding: '10px 12px', background: alertRaw.level === 'urgent' ? '#dc2626' : '#b45309', color: '#ffffff', fontSize: 15, fontWeight: 900, textAlign: 'center', flexShrink: 0 }}>
          {String(alertRaw.text)}
        </div>
      )}

      {/* Song flow tracker: current part filled (same as the monitor).
          Hidden for the drummer — that view is BPM only. */}
      {!isDrummer && cfg?.showFlow !== false && flow?.labels?.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'nowrap', overflow: 'hidden', alignItems: 'center', gap: 5, marginBottom: landscape ? '1vh' : '1.4vh', flexShrink: 0 }}>
          {flow.labels.map((label, i) => (
            <React.Fragment key={`${label}-${i}`}>
              {i > 0 && <span style={{ color: faint, fontSize: 10, fontWeight: 900, flexShrink: 0 }}>›</span>}
              <span style={{ fontSize: 9, fontWeight: 900, letterSpacing: 0.8, textTransform: 'uppercase', padding: '3px 8px', borderRadius: 999, background: i === flow.index ? eyebrowColor : 'transparent', color: i === flow.index ? '#000000' : faint, border: `1px solid ${i === flow.index ? eyebrowColor : hairline}`, whiteSpace: 'nowrap', flexShrink: 0 }}>
                {label}
              </span>
            </React.Fragment>
          ))}
        </div>
      )}

      {/* DRUMMER: BPM number only + big beat light. No lyrics, chords or
          next card — just the tempo, flashing at 60/bpm. */}
      {isDrummer ? (
        <>
          <style>{`@keyframes drumBeat { 0% { opacity: 1; } 10% { opacity: 0; } 100% { opacity: 0; } }`}</style>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '2.4vh', minHeight: 0 }}>
            {drumTitle && (
              <div style={{ fontSize: fz(0.024, 13), fontWeight: 800, color: eyebrowColor, textTransform: 'uppercase', letterSpacing: 2.5, maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textAlign: 'center' }}>
                {drumTitle}
              </div>
            )}
            <div style={{ position: 'relative', width: '34vh', height: '34vh', maxWidth: '78vw', maxHeight: '78vw' }}>
              {/* Outline ring: this is all that shows while the beat is off. */}
              <div
                data-testid="drum-ring"
                style={{
                  position: 'absolute', inset: 0, borderRadius: '50%',
                  border: '6px solid rgba(253,224,71,0.9)', background: 'transparent',
                  boxShadow: '0 0 24px rgba(253,224,71,0.28)',
                }}
              />
              <div
                data-testid="drum-light"
                style={{
                  position: 'absolute', inset: 0,
                  borderRadius: '50%', background: '#fde047',
                  boxShadow: '0 0 60px rgba(253,224,71,0.55), 0 0 140px rgba(253,224,71,0.25)',
                  animation: `drumBeat ${beatSec}s linear infinite`,
                }}
              />
            </div>
            <div style={{ textAlign: 'center', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>
              <div data-testid="drum-bpm" style={{ fontSize: '20vh', fontWeight: 900, color: '#ffffff', letterSpacing: 2 }}>{bpm}</div>
              <div style={{ fontSize: fz(0.022, 12), fontWeight: 900, color: faint, letterSpacing: 6, marginTop: '1vh' }}>BPM</div>
            </div>
          </div>
        </>
      ) : (
      <>
      {/* HERO: eyebrow + current lyric */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', textAlign: 'center', minHeight: 0 }}>
        {cleared ? (
          <p style={{ margin: 0, fontSize: 15, fontWeight: 700, color: faint, letterSpacing: 0.5 }}>
            {status === 'online' ? 'Nothing on air' : 'Waiting for the computer…'}
          </p>
        ) : (
          <>
            {eyebrow && (
              <div style={{ fontSize: fz(0.019, 10.5), fontWeight: 800, color: eyebrowColor, textTransform: 'uppercase', letterSpacing: 2.5, marginBottom: stage?.wall ? '0.5vh' : (landscape ? '0.8vh' : '1.2vh'), maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {eyebrow}
              </div>
            )}
            {stage?.wall ? (
              <div title={stage.wall} style={{ fontSize: fz(0.015, 9.5), fontWeight: 700, color: faint, letterSpacing: 1.5, marginBottom: landscape ? '0.8vh' : '1.2vh', maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>ON WALL · {stage.wall}</div>
            ) : null}
            {heroText ? (
              <div ref={heroRef} style={{ flex: 1, minHeight: 0, width: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center', overflow: 'hidden' }}>
                <p style={{ margin: 0, fontSize: `${curSize * fitScale}px`, lineHeight: 1.28, fontWeight: 800, whiteSpace: 'pre-line', overflow: 'hidden', color: curColor, maxWidth: '100%' }}>
                  {heroText}
                </p>
              </div>
            ) : null}
          </>
        )}
      </div>

      {/* Chord chart: portrait-friendly slice under the lyric — what the
          Worship Leader role actually asks for. */}
      {chordText && (
        <div style={{ flexShrink: 0, maxHeight: '16vh', overflow: 'hidden', borderTop: `1px solid ${hairline}`, paddingTop: landscape ? '0.9vh' : '1.2vh', marginTop: landscape ? '0.9vh' : '1.2vh', textAlign: 'center' }}>
          <div style={{ fontSize: fz(0.016, 9.5), fontWeight: 800, color: eyebrowColor, textTransform: 'uppercase', letterSpacing: 2, marginBottom: '0.7vh' }}>
            {cfg.nashville ? 'Nashville' : `Key of ${cfg.playKey || 'C'}`}
          </div>
          <pre style={{ margin: 0, display: 'inline-block', textAlign: 'left', fontFamily: 'ui-monospace, Consolas, monospace', fontSize: 13, lineHeight: 1.55, whiteSpace: 'pre-wrap', color: curColor, overflow: 'hidden' }}>{chordText}</pre>
        </div>
      )}

      {/* NEXT card */}
      <div style={{ borderTop: `1px solid ${hairline}`, marginTop: landscape ? '1.1vh' : '1.6vh', paddingTop: landscape ? '1vh' : '1.4vh', minHeight: landscape ? '10vh' : '12vh', flexShrink: 0 }}>
        {next && (next.text || next.label) ? (
          <>
            <div style={{ fontSize: fz(0.017, 10), fontWeight: 800, color: faint, textTransform: 'uppercase', letterSpacing: 2, marginBottom: '0.7vh', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              Next&nbsp;&nbsp;▸&nbsp;&nbsp;<span style={{ color: nextColor }}>{next.title ? `${next.title}  ·  ` : ''}{next.label}</span>
            </div>
            {next.text ? (
              <p style={{ margin: 0, fontSize: `${nextSize}px`, lineHeight: 1.32, fontWeight: 700, whiteSpace: 'pre-line', color: nextColor, overflow: 'hidden' }}>{stripMarkup(next.text)}</p>
            ) : null}
          </>
        ) : (
          <div style={{ fontSize: fz(0.017, 10), fontWeight: 800, color: faint, textTransform: 'uppercase', letterSpacing: 2 }}>Next&nbsp;&nbsp;▸&nbsp;&nbsp;—</div>
        )}
      </div>
      </>
      )}

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
