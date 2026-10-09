import React, { useEffect, useState } from 'react';
import { stripMarkup } from '../lib/lyrics';
import { TimerFace } from './CountdownFace';
import { DEFAULT_STAGE_CFG, segSeconds, fmtMMSS, fmtClock, trafficState } from '../lib/stageLayout';
import { transposeChart, toNashville, keyOffset } from '../lib/chords';

// The stage / confidence monitor.
//
// Two render modes share ONE layout path:
//   * live output  — fixed to the viewport, sizes derived from the real
//     window height (the wall reads it from 2-3 m at native resolution);
//   * preview      — `frame={{w,h}}` + `preview` renders absolutely inside a
//     measured 16:9 box in the Stage tab, with every size derived from THAT
//     box instead of the window — so what the operator sees in the panel is
//     pixel-for-pixel what the monitor shows.
// All sizing is px computed from the active height (h·fraction), which is
// mathematically identical to the old vh units on the wall and correct in
// the preview box, where vh would point at the console window.
//
// cfg/flow/chord ride in over the stage-config IPC channel (see App.jsx /
// main.js): layout preset, clock, alert, traffic light, flow tracker,
// chords, contrast mode.
export default function StageDisplay({ currentSlide, C = {}, cfg = null, flow = null, chord = null, frame = null, preview = false }) {
  const stage = currentSlide && typeof currentSlide === 'object' && currentSlide.current ? currentSlide : { current: { title: 'KOG Worship', label: 'Waiting…', text: '' }, next: null };
  const current = stage.current || {};
  const nextSlide = stage.next || null;
  const m = { ...DEFAULT_STAGE_CFG, ...(cfg || {}) };

  // The stage monitor is read from 2-3 m away AND runs at the display's own
  // native resolution. Fixed px sizes therefore looked half-size on a 4K panel
  // and cramped on anything above laptop resolution — which is why singers
  // could barely make the words out. Every size below is a fraction of the
  // active height instead, so the apparent size is the same whatever
  // resolution the output window opens at (80 px of text at 1080p).
  const [view, setView] = useState(() => ({ w: window.innerWidth, h: window.innerHeight }));
  useEffect(() => {
    if (frame) return undefined;
    // rAF-collapsed like the projector: a windowed stage output dragged
    // across screens fires resize ~60x/s, and every one re-rendered the wall.
    let raf = 0;
    const onResize = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        setView((prev) => {
          const w = window.innerWidth;
          const h = window.innerHeight;
          return prev.w === w && prev.h === h ? prev : { w, h };
        });
      });
    };
    window.addEventListener('resize', onResize);
    return () => { window.removeEventListener('resize', onResize); if (raf) cancelAnimationFrame(raf); };
  }, [!!frame]);

  const w = Math.max(1, (frame && frame.w) || view.w || 1920);
  const h = Math.max(1, (frame && frame.h) || view.h || 1080);
  const px = (frac) => h * frac;   // height-fraction (was vh)
  const pxf = (frac) => w * frac;  // width-fraction (was vw)

  // 1s tick — the clock, the alert expiry, the segment timer and the traffic
  // border all derive from this one Date.now(), so the panel preview and the
  // wall can never drift apart.
  const [now, setNow] = useState(() => Date.now());
  const alertRaw = m.showAlert && m.alert && m.alert.text ? m.alert : null;
  const alertActive = !!(alertRaw && (!alertRaw.until || now < alertRaw.until));
  const seg = m.segment;
  const traffic = m.traffic ? trafficState(now, current.timer, seg, m.trafficWarn) : null;
  const needTick = !!(m.clock || alertActive || traffic || (seg && (seg.running || seg.remain != null)));
  useEffect(() => {
    if (!needTick) return undefined;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [needTick]);

  // --- contrast modes -----------------------------------------------------
  // 'high-yellow' / 'high-white': yellow or white on PURE black — the
  // ProPresenter confidence-monitor look, legible across the room.
  const high = m.contrast !== 'standard';
  const bg = high ? '#000000' : (C.panel || '#13151e');
  const curColor = m.contrast === 'high-white' ? '#ffffff' : m.contrast === 'high-yellow' ? '#fde047' : (C.text || '#f4f4f5');
  const nextColor = m.contrast === 'high-white' ? '#fde047' : m.contrast === 'high-yellow' ? '#ffffff' : '#a1a1aa';
  const labelColor = high ? (m.contrast === 'high-white' ? '#ffffff' : '#fde047') : '#6366f1';
  const faint = high ? 'rgba(255,255,255,0.62)' : (C.faint || '#71717a');
  const accLine = high ? (m.contrast === 'high-white' ? '#ffffff' : '#fde047') : (C.accLine || '#8b5cf6');
  const divider = high ? '#26262b' : '#24243a';

  // --- chord chart (transposed / Nashville) -------------------------------
  let chordText = '';
  if (m.showChords && chord && chord.text) {
    const semis = keyOffset(chord.key || 'C', m.playKey || 'C');
    const t = transposeChart(chord.text, semis, { preferFlats: /b$/.test(m.playKey || '') });
    chordText = m.nashville ? toNashville(t, m.playKey || 'C') : t;
  }

  // --- flow tracker -------------------------------------------------------
  const flowShown = !!(m.showFlow && flow && flow.labels && flow.labels.length);

  // --- sizing budget ------------------------------------------------------
  // Fixed overheads, as a share of the active height: padding, the
  // LIVE/header row, the current slide's section label, and (when present)
  // the alert banner + flow strip. Everything left over belongs to the lyric
  // — so a long NEXT block (which grows past its 14vh minimum) eats into it
  // before the current slide ever starts clipping off the bottom edge.
  const fitSize = (base, floor, budget, lines) =>
    Math.max(h * floor, Math.min(h * base, (h * budget) / (Math.max(1, lines) * 1.3)));

  const nextLines = Math.max(1, String(nextSlide?.text || '').split('\n').length);
  const nextSize = fitSize(0.041, 0.022, 0.20, nextLines) * (Number(m.textScale) || 1);
  const nextRatio = m.showNext ? Math.min(0.40, 0.14 + 0.075 + (nextLines * nextSize * 1.3) / h) : 0;
  const overhead = 0.09 + 0.07 + 0.025 + (alertActive ? 0.085 : 0) + (flowShown ? 0.055 : 0);
  const curBudget = Math.max(0.18, 1 - overhead - nextRatio);
  const curSize = fitSize(0.074, 0.030, curBudget, String(current.text || '').split('\n').length) * (Number(m.textScale) || 1);

  // Segment readouts. A segment that exists only because its label was typed
  // (never started, never paused) is NOT active — no red 0:00 chip, no big
  // timer: it appears the moment Start or Pause gives it a real value.
  const segSecs = segSeconds(seg, now);
  const segActive = !!(seg && (seg.running || seg.remain != null));
  const segColor = !segActive ? '#ffffff' : (!seg.countUp && segSecs <= 0 ? '#ef4444' : (high ? '#fde047' : (C.text || '#fff')));

  return (
    <div style={{ position: preview ? 'absolute' : 'fixed', inset: 0, background: bg, color: curColor, fontFamily: 'system-ui, sans-serif', display: 'flex', flexDirection: 'column', padding: `${px(0.045)}px ${pxf(0.035)}px`, boxSizing: 'border-box', overflow: 'hidden', cursor: preview ? 'default' : 'none', boxShadow: traffic ? `inset 0 0 0 ${Math.max(6, px(0.016))}px ${traffic}` : 'none' }}>
      <style>{`
        ${preview ? '' : `
        html, body, #root {
          margin: 0 !important; padding: 0 !important;
          width: 100vw !important; height: 100vh !important;
          overflow: hidden !important; background: ${bg} !important;
        }`}
        @keyframes stageAlertBlink { 0%, 100% { opacity: 1; } 50% { opacity: 0.45; } }
        @keyframes stageBeat { 0% { transform: scale(1); } 12% { transform: scale(1.3); } 100% { transform: scale(1); } }
      `}</style>

      {/* HEADER: LIVE badge · title · right cluster (metronome · segment · clock) */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: px(0.02), marginBottom: px(0.02), flexShrink: 0, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: px(0.014) }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: px(0.008), background: 'rgba(34,197,94,0.15)', border: '1px solid rgba(34,197,94,0.4)', color: '#4ade80', padding: `${px(0.006)}px ${px(0.013)}px`, borderRadius: 999, fontSize: px(0.012), fontWeight: 800, letterSpacing: '1px' }}>
            <span style={{ width: px(0.008), height: px(0.008), borderRadius: '50%', background: '#22c55e', boxShadow: '0 0 10px #22c55e' }}></span>LIVE
          </span>
          <h1 style={{ margin: 0, fontSize: px(0.024), fontWeight: 900, letterSpacing: '1px', color: curColor }}>Stage Display</h1>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: px(0.014) }}>
          {m.metronome && (
            <div style={{ display: 'flex', alignItems: 'center', gap: px(0.008) }}>
              <div style={{ width: px(0.03), height: px(0.03), borderRadius: px(0.005), background: '#fde047', animation: `stageBeat ${60 / (Number(m.bpm) || 96)}s linear infinite` }} />
              <span style={{ fontSize: px(0.014), fontWeight: 800, color: faint, fontVariantNumeric: 'tabular-nums' }}>{Number(m.bpm) || 96} BPM</span>
            </div>
          )}
          {segActive && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: px(0.006), background: high ? 'rgba(255,255,255,0.08)' : (C.elevated2 || 'rgba(255,255,255,0.06)'), border: `1px solid ${divider}`, borderRadius: 999, padding: `${px(0.006)}px ${px(0.013)}px`, fontSize: px(0.015), fontWeight: 800, color: segColor, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
              <span style={{ color: faint, letterSpacing: 1, textTransform: 'uppercase', fontSize: px(0.012) }}>{seg.label || 'Segment'}</span>
              {!seg.countUp && segSecs != null ? fmtMMSS(segSecs) : (seg.countUp ? `+${fmtMMSS(segSecs)}` : '')}
            </span>
          )}
          {m.clock && (
            <span style={{ fontSize: px(0.026), fontWeight: 900, color: curColor, fontVariantNumeric: 'tabular-nums', letterSpacing: '0.5px' }}>
              {fmtClock(now, m.clockFormat)}
            </span>
          )}
        </div>
      </div>

      {/* STAGE ALERT: stage-only message overlay (info = amber, urgent = red + blink) */}
      {alertActive && (
        <div style={{ marginBottom: px(0.02), borderRadius: px(0.01), padding: `${px(0.012)}px ${px(0.02)}`, background: alertRaw.level === 'urgent' ? '#dc2626' : '#b45309', color: '#ffffff', fontSize: px(0.03), fontWeight: 900, textAlign: 'center', letterSpacing: '0.5px', flexShrink: 0, animation: alertRaw.level === 'urgent' ? 'stageAlertBlink 1s ease-in-out infinite' : 'none', whiteSpace: 'pre-wrap', overflow: 'hidden' }}>
          {String(alertRaw.text)}
        </div>
      )}

      {/* SONG FLOW: Intro › V1 › Chorus … current section highlighted */}
      {flowShown && (
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: px(0.006), marginBottom: px(0.02), flexShrink: 0 }}>
          {flow.labels.map((label, i) => (
            <React.Fragment key={`${label}-${i}`}>
              {i > 0 && <span style={{ color: faint, fontSize: px(0.016), fontWeight: 800 }}>›</span>}
              <span style={{ fontSize: px(0.015), fontWeight: 800, letterSpacing: '1px', textTransform: 'uppercase', padding: `${px(0.006)}px ${px(0.013)}px`, borderRadius: 999, background: i === flow.index ? (high ? '#fde047' : 'rgba(139,92,246,0.35)') : 'rgba(255,255,255,0.07)', color: i === flow.index ? '#000000' : faint, border: `1px solid ${i === flow.index ? 'transparent' : divider}`, whiteSpace: 'nowrap' }}>
                {label}
              </span>
            </React.Fragment>
          ))}
        </div>
      )}

      {/* MAIN: lyric (or countdown) + optional chord chart column */}
      <div style={{ flex: 1, display: 'flex', flexDirection: chordText ? 'row' : 'column', gap: px(0.03), minHeight: 0 }}>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', minWidth: 0, minHeight: 0 }}>
          {current.timer ? (
            // Countdown on stage: the same face as the wall, scaled to the
            // panel height, ticking off the same endsAt — no drift.
            <div style={{ position: 'relative', flex: 1, minHeight: 0, borderRadius: px(0.01), overflow: 'hidden' }}>
              <TimerFace timer={current.timer} scale={h / 720} />
            </div>
          ) : (
            <>
              {m.showTimer && segActive && (
                <div style={{ fontSize: px(0.10), lineHeight: 1, fontWeight: 900, color: segColor, fontVariantNumeric: 'tabular-nums', marginBottom: px(0.02) }}>
                  {!seg.countUp ? fmtMMSS(segSecs) : `+${fmtMMSS(segSecs)}`}
                </div>
              )}
              <div style={{ fontSize: px(0.016), fontWeight: 800, color: labelColor, textTransform: 'uppercase', letterSpacing: '2px', marginBottom: px(0.009), flexShrink: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{current.title ? `${current.title}  ·  ` : ''}{current.label || 'Current'}</div>
              <p style={{ margin: 0, fontSize: `${curSize}px`, lineHeight: 1.3, fontWeight: 800, whiteSpace: 'pre-line', color: curColor, textShadow: high ? 'none' : '0 2px 20px rgba(99,102,241,0.25)', overflow: 'hidden' }}>{stripMarkup(current.text) || 'Blackout'}</p>
            </>
          )}
        </div>
        {chordText && (
          <div style={{ width: '32%', minWidth: 0, overflow: 'hidden', borderLeft: `1px solid ${divider}`, paddingLeft: px(0.02), alignSelf: 'stretch' }}>
            <div style={{ fontSize: px(0.014), fontWeight: 800, color: labelColor, textTransform: 'uppercase', letterSpacing: '1.5px', marginBottom: px(0.01) }}>
              Chords{m.nashville ? ' · Nashville' : ` · ${m.playKey || 'C'}`}
            </div>
            <pre style={{ margin: 0, fontFamily: 'ui-monospace, Consolas, monospace', fontSize: px(0.021), lineHeight: 1.55, whiteSpace: 'pre-wrap', color: curColor, overflow: 'hidden', height: '100%' }}>{chordText}</pre>
          </div>
        )}
      </div>

      {/* NEXT block */}
      {m.showNext && (
        <div style={{ borderTop: `1px solid ${divider}`, paddingTop: px(0.02), minHeight: px(0.14), flexShrink: 0 }}>
          <div style={{ fontSize: px(0.016), fontWeight: 800, color: faint, textTransform: 'uppercase', letterSpacing: '2px', marginBottom: px(0.009) }}>Next</div>
          {nextSlide ? (
            <>
              <div style={{ fontSize: px(0.014), fontWeight: 800, color: accLine, textTransform: 'uppercase', letterSpacing: '1px', marginBottom: px(0.007) }}>{nextSlide.title ? `${nextSlide.title}  ·  ` : ''}{nextSlide.label}</div>
              <p style={{ margin: 0, fontSize: `${nextSize}px`, lineHeight: 1.3, fontWeight: 700, whiteSpace: 'pre-line', color: nextColor, overflow: 'hidden' }}>{stripMarkup(nextSlide.text)}</p>
            </>
          ) : (
            <p style={{ margin: 0, fontSize: px(0.019), color: faint }}>— Nothing queued —</p>
          )}
        </div>
      )}
    </div>
  );
}
