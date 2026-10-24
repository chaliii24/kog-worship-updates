import React, { useEffect, useState } from 'react';
import { stripMarkup } from '../lib/lyrics';
import { TimerFace } from './CountdownFace';
import { DEFAULT_STAGE_CFG, segSeconds, fmtMMSS, fmtClock, trafficState } from '../lib/stageLayout';
import { transposeChart, toNashville, keyOffset } from '../lib/chords';

// The stage / confidence monitor — ProPresenter-style wall look.
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
//
// Visual system: pure-black stage, one slim status strip, a centered hero
// lyric under a small-caps eyebrow, and a subordinate NEXT card. Everything
// decorative from the old layout (the big "Stage Display" heading, scattered
// chips) is gone — from across the room only three things should compete
// for attention: what we sing NOW, what comes NEXT, and red/amber urgency.
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
    const read = () => {
      const de = typeof document !== 'undefined' ? document.documentElement : null;
      const iw = Math.round(Number(window.innerWidth) || 0);
      const ih = Math.round(Number(window.innerHeight) || 0);
      const cw = de ? Math.round(Number(de.clientWidth) || 0) : 0;
      const ch = de ? Math.round(Number(de.clientHeight) || 0) : 0;
      const w = iw > 0 ? iw : (cw > 0 ? cw : 1920);
      const h = ih > 0 ? ih : (ch > 0 ? ch : 1080);
      setView((prev) => (prev.w === w && prev.h === h ? prev : { w, h }));
    };
    const onResize = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        read();
      });
    };
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', onResize);
    const vv = window.visualViewport;
    if (vv) vv.addEventListener('resize', onResize);
    // Display handshake / DPI / taskbar can settle after the first paint.
    const timers = [0, 150, 600].map((ms) => setTimeout(read, ms));
    const poll = setInterval(read, 2500);
    read();
    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('orientationchange', onResize);
      if (vv) vv.removeEventListener('resize', onResize);
      timers.forEach((t) => clearTimeout(t));
      clearInterval(poll);
      if (raf) cancelAnimationFrame(raf);
    };
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

  // --- palette --------------------------------------------------------------
  // 'high-yellow' / 'high-white': yellow or white on PURE black — the
  // ProPresenter confidence-monitor look, legible across the room. Standard
  // is near-black rather than panel grey: a stage wall should disappear.
  const high = m.contrast !== 'standard';
  const bg = high ? '#000000' : '#0b0b10';
  const curColor = m.contrast === 'high-white' ? '#ffffff' : m.contrast === 'high-yellow' ? '#fde047' : (C.text || '#f4f4f5');
  const nextColor = m.contrast === 'high-white' ? '#e9e9ec' : m.contrast === 'high-yellow' ? '#fff7d6' : '#a1a1aa';
  const eyebrowColor = high ? (m.contrast === 'high-white' ? '#ffffff' : '#fde047') : (C.accLine || '#FFB800');
  const faint = high ? 'rgba(255,255,255,0.55)' : (C.faint || '#71717a');
  const hairline = high ? '#232327' : '#1e1e2a';

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
  // The status strip is the only fixed chrome (~5% of height); alert and
  // flow strips take their rows only when present. Everything left over
  // belongs to the hero lyric — a long NEXT block (which grows past its
  // minimum) eats into it before the current slide ever clips.
  const fitSize = (base, floor, budget, lines) =>
    Math.max(h * floor, Math.min(h * base, (h * budget) / (Math.max(1, lines) * 1.3)));

  const nextLines = Math.max(1, String(nextSlide?.text || '').split('\n').length);
  const nextSize = fitSize(0.038, 0.020, 0.20, nextLines) * (Number(m.textScale) || 1);
  const nextRatio = m.showNext ? Math.min(0.38, 0.13 + 0.07 + (nextLines * nextSize * 1.3) / h) : 0;
  const overhead = 0.052 + 0.018 + (alertActive ? 0.085 : 0) + (flowShown ? 0.048 : 0);
  const curBudget = Math.max(0.20, 1 - overhead - nextRatio);
  const curSize = fitSize(0.080, 0.032, curBudget, String(current.text || '').split('\n').length) * (Number(m.textScale) || 1);

  // Segment readouts. A segment that exists only because its label was typed
  // (never started, never paused) is NOT active — no red 0:00 chip, no big
  // timer: it appears the moment Start or Pause gives it a real value.
  const segSecs = segSeconds(seg, now);
  const segActive = !!(seg && (seg.running || seg.remain != null));
  const segColor = !segActive ? '#ffffff' : (!seg.countUp && segSecs <= 0 ? '#FF4545' : (high ? '#fde047' : (C.text || '#fff')));

  const heroText = stripMarkup(current.text);
  const eyebrow = [current.title, current.label || (heroText ? '' : 'Current')].filter(Boolean).join('  ·  ');

  return (
    <div style={{ position: preview ? 'absolute' : 'fixed', inset: 0, background: bg, color: curColor, fontFamily: 'system-ui, sans-serif', display: 'flex', flexDirection: 'column', padding: `${px(0.032)}px ${pxf(0.04)}px ${px(0.028)}px`, boxSizing: 'border-box', overflow: 'hidden', cursor: preview ? 'default' : 'none', boxShadow: traffic ? `inset 0 0 0 ${Math.max(6, px(0.014))}px ${traffic}` : 'none' }}>
      <style>{`
        ${preview ? '' : `
        html, body, #root {
          margin: 0 !important; padding: 0 !important;
          width: 100vw !important; height: 100vh !important;
          overflow: hidden !important; background: ${bg} !important;
        }`}
        @keyframes stageAlertBlink { 0%, 100% { opacity: 1; } 50% { opacity: 0.45; } }
        @keyframes stageBeat { 0% { transform: scale(1); } 12% { transform: scale(1.35); } 100% { transform: scale(1); } }
        @keyframes stageLivePulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.35; } }
      `}</style>

      {/* STATUS STRIP: live dot + song · metronome · segment · clock */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: px(0.02), paddingBottom: px(0.016), marginBottom: px(0.016), borderBottom: `1px solid ${hairline}`, flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: px(0.012), minWidth: 0 }}>
          <span style={{ width: px(0.011), height: px(0.011), borderRadius: '50%', background: '#36C982', boxShadow: '0 0 12px #36C982', animation: 'stageLivePulse 2.2s ease-in-out infinite', flexShrink: 0 }} />
          <span style={{ fontSize: px(0.0135), fontWeight: 800, letterSpacing: '2.5px', color: faint, whiteSpace: 'nowrap' }}>LIVE</span>
          {current.title && (
            <span style={{ fontSize: px(0.0145), fontWeight: 700, color: faint, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{current.title}</span>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: px(0.016), flexShrink: 0 }}>
          {m.metronome && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: px(0.008) }}>
              <span style={{ width: px(0.013), height: px(0.013), borderRadius: '50%', background: '#fde047', animation: `stageBeat ${60 / (Number(m.bpm) || 96)}s linear infinite` }} />
              <span style={{ fontSize: px(0.0135), fontWeight: 800, color: faint, fontVariantNumeric: 'tabular-nums', letterSpacing: '1px' }}>{Number(m.bpm) || 96}</span>
            </span>
          )}
          {segActive && (
            <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: px(0.008), fontSize: px(0.0145), fontWeight: 800, color: segColor, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
              <span style={{ color: faint, letterSpacing: '1.5px', fontSize: px(0.011), textTransform: 'uppercase' }}>{seg.label || 'Segment'}</span>
              {!seg.countUp && segSecs != null ? fmtMMSS(segSecs) : (seg.countUp ? `+${fmtMMSS(segSecs)}` : '')}
            </span>
          )}
          {m.clock && (
            <span style={{ fontSize: px(0.020), fontWeight: 800, color: curColor, fontVariantNumeric: 'tabular-nums', letterSpacing: '1px' }}>
              {fmtClock(now, m.clockFormat)}
            </span>
          )}
        </div>
      </div>

      {/* STAGE ALERT: stage-only message (info = amber, urgent = red + blink) */}
      {alertActive && (
        <div style={{ marginBottom: px(0.018), borderRadius: px(0.012), padding: `${px(0.014)}px ${px(0.02)}`, background: alertRaw.level === 'urgent' ? '#FF4545' : '#b45309', color: '#ffffff', fontSize: px(0.030), fontWeight: 900, textAlign: 'center', letterSpacing: '0.5px', flexShrink: 0, animation: alertRaw.level === 'urgent' ? 'stageAlertBlink 1s ease-in-out infinite' : 'none', whiteSpace: 'pre-wrap', overflow: 'hidden' }}>
          {String(alertRaw.text)}
        </div>
      )}

      {/* SONG FLOW: one quiet strip, current section filled */}
      {flowShown && (
        <div style={{ display: 'flex', flexWrap: 'nowrap', overflow: 'hidden', alignItems: 'center', gap: px(0.007), marginBottom: px(0.016), flexShrink: 0 }}>
          {flow.labels.map((label, i) => (
            <React.Fragment key={`${label}-${i}`}>
              {i > 0 && <span style={{ color: faint, fontSize: px(0.014), fontWeight: 800, flexShrink: 0 }}>›</span>}
              <span style={{ fontSize: px(0.0135), fontWeight: 800, letterSpacing: '1.5px', textTransform: 'uppercase', padding: `${px(0.006)}px ${px(0.013)}px`, borderRadius: 999, background: i === flow.index ? eyebrowColor : 'transparent', color: i === flow.index ? '#000000' : faint, border: `1px solid ${i === flow.index ? eyebrowColor : hairline}`, whiteSpace: 'nowrap', flexShrink: 0 }}>
                {label}
              </span>
            </React.Fragment>
          ))}
        </div>
      )}

      {/* HERO: eyebrow + current lyric (or countdown), optional chord column */}
      <div style={{ flex: 1, display: 'flex', flexDirection: chordText ? 'row' : 'column', gap: px(0.03), minHeight: 0 }}>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', textAlign: 'center', minWidth: 0, minHeight: 0 }}>
          {current.timer ? (
            // Countdown on stage: the same face as the wall, scaled to the
            // panel height, ticking off the same endsAt — no drift. The stage
            // window owns the original video audio ONLY when the countdown
            // routes stage-only (otherwise the main output plays it, never both).
            <div style={{ position: 'relative', flex: 1, alignSelf: 'stretch', minHeight: 0, borderRadius: px(0.01), overflow: 'hidden' }}>
              <TimerFace timer={current.timer} scale={h / 720} surface={preview ? 'preview' : 'stage'} />
            </div>
          ) : (
            <>
              {m.showTimer && segActive && (
                <div style={{ fontSize: px(0.10), lineHeight: 1, fontWeight: 900, color: segColor, fontVariantNumeric: 'tabular-nums', marginBottom: px(0.018) }}>
                  {!seg.countUp ? fmtMMSS(segSecs) : `+${fmtMMSS(segSecs)}`}
                </div>
              )}
              {eyebrow && (
                <div style={{ fontSize: px(0.0155), fontWeight: 800, color: eyebrowColor, textTransform: 'uppercase', letterSpacing: '3px', marginBottom: stage.wall ? px(0.006) : px(0.012), flexShrink: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '100%' }}>{eyebrow}</div>
              )}
              {/* Wall mirror: what the audience message overlay says, so the
                  team can confirm it without turning around. Stage-only
                  alert stays separate (that one never reaches the wall). */}
              {stage.wall ? (
                <div title={stage.wall} style={{ fontSize: px(0.0135), fontWeight: 700, color: faint, letterSpacing: '1.5px', marginBottom: px(0.012), flexShrink: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '100%' }}>ON WALL · {stage.wall}</div>
              ) : null}
              {heroText ? (
                <p style={{ margin: 0, fontSize: `${curSize}px`, lineHeight: 1.28, fontWeight: 800, whiteSpace: 'pre-line', color: curColor, textShadow: high ? 'none' : '0 2px 26px rgba(0,0,0,0.6)', overflow: 'hidden', maxWidth: '100%' }}>{heroText}</p>
              ) : null}
            </>
          )}
        </div>
        {chordText && (
          <div style={{ width: '30%', minWidth: 0, overflow: 'hidden', borderLeft: `1px solid ${hairline}`, paddingLeft: px(0.022), alignSelf: 'center', maxHeight: '100%' }}>
            <div style={{ fontSize: px(0.0135), fontWeight: 800, color: eyebrowColor, textTransform: 'uppercase', letterSpacing: '2px', marginBottom: px(0.01) }}>
              {m.nashville ? 'Nashville' : `Key of ${m.playKey || 'C'}`}
            </div>
            <pre style={{ margin: 0, fontFamily: 'ui-monospace, Consolas, monospace', fontSize: px(0.020), lineHeight: 1.6, whiteSpace: 'pre-wrap', color: curColor, overflow: 'hidden' }}>{chordText}</pre>
          </div>
        )}
      </div>

      {/* NEXT: subordinate card — eyebrow first, then dimmed text */}
      {m.showNext && (
        <div style={{ borderTop: `1px solid ${hairline}`, marginTop: px(0.016), paddingTop: px(0.014), minHeight: px(0.12), flexShrink: 0, overflow: 'hidden' }}>
          {nextSlide && (nextSlide.text || nextSlide.label) ? (
            <>
              <div style={{ fontSize: px(0.0135), fontWeight: 800, color: faint, textTransform: 'uppercase', letterSpacing: '2.5px', marginBottom: px(0.007), whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                Next&nbsp;&nbsp;▸&nbsp;&nbsp;<span style={{ color: nextColor }}>{nextSlide.title ? `${nextSlide.title}  ·  ` : ''}{nextSlide.label}</span>
              </div>
              {nextSlide.text ? (
                <p style={{ margin: 0, fontSize: `${nextSize}px`, lineHeight: 1.32, fontWeight: 700, whiteSpace: 'pre-line', color: nextColor, overflow: 'hidden' }}>{stripMarkup(nextSlide.text)}</p>
              ) : null}
            </>
          ) : (
            <div style={{ fontSize: px(0.0135), fontWeight: 800, color: faint, textTransform: 'uppercase', letterSpacing: '2.5px' }}>Next&nbsp;&nbsp;▸&nbsp;&nbsp;—</div>
          )}
        </div>
      )}
    </div>
  );
}
