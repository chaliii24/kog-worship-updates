import React from 'react';
import { Pause, Play, RotateCcw, Sparkles, X } from 'lucide-react';
import { SlideTextLayers, cueLyricStyle } from '../lib/lyrics';
import { allTextObjects, textObjectLayers } from '../lib/songTextObjects';
import {
  KIN_ENTRANCES,
  KIN_EXITS,
  KIN_LOOPS,
  KIN_EASES,
  KIN_PRESETS,
  applyKineticPreset,
  clearKinetic,
  kinStackTotal,
  kinTiming,
  newKin,
  normalizeKin,
  summarizeKin,
} from '../lib/kinetic';
import { CASCADE_FONTS, CASCADE_SPEEDS, CASCADE_ALL, normalizeCascade } from '../lib/fontCascade';

// KINETIC TYPOGRAPHY PANEL — the timing half of the Motion tab.
//
// Editing model: one box at a time, the one selected in the Boxes strip (or on
// the canvas). Every control writes through the same patchText() the rest of
// the sidebar uses, so selecting a layer is the only mode switch and no second
// state source appears.
//
// LAYOUT: this lives in a ~200px sidebar, so every row is built to SHRINK.
// `minWidth: 0` on grid/flex items is what stops a wide <select> or a long
// preset name from pushing the panel past its column (a grid item's default
// `min-width: auto` refuses to go below its content). Nothing here has a fixed
// width that the sidebar cannot honour.

// Narrow-panel field: fills its cell, never forces the cell wider.
const fieldStyle = (C) => ({
  width: '100%',
  minWidth: 0,
  boxSizing: 'border-box',
  background: C.input,
  color: C.text,
  border: '1px solid var(--ui-border2)',
  borderRadius: 6,
  padding: '5px 4px',
  fontSize: 10,
  outline: 'none',
  textOverflow: 'ellipsis',
});

const labelStyle = (C) => ({
  fontSize: 9,
  fontWeight: 800,
  color: C.faint,
  textTransform: 'uppercase',
  letterSpacing: 1.2,
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  minWidth: 0,
});

// PLAYBACK CLOCK — the panel's timeline drives the REAL CSS animations the
// renderer created, through the Web Animations API: every animation is paused
// on mount and then seeked by our own clock. That is what makes play, pause and
// scrubbing exact rather than approximate, and it means the preview shows the
// effects the wall will run instead of a second implementation of them.
const useKineticTimeline = (hostRef, total, seed) => {
  const [playing, setPlaying] = React.useState(true);
  const [loop, setLoop] = React.useState(false);
  const timeRef = React.useRef(0);
  const animRef = React.useRef([]);
  const loopRef = React.useRef(false);
  const readoutRef = React.useRef(null);
  const barRef = React.useRef(null);
  const scrubRef = React.useRef(null);
  loopRef.current = loop;

  const paint = React.useCallback((t) => {
    const seconds = Math.max(0, Math.min(total, Number(t) || 0));
    for (const a of animRef.current) {
      try {
        // One absolute currentTime is enough: a finite effect clamps at its own
        // end (fill-mode), and an infinite loop wraps on its own duration.
        a.currentTime = seconds * 1000;
      } catch (_) { /* cancelled by a re-render; next collect replaces it */ }
    }
    if (readoutRef.current) readoutRef.current.textContent = `${seconds.toFixed(2)}s / ${total.toFixed(2)}s`;
    if (barRef.current) barRef.current.style.width = `${Math.min(100, (seconds / total) * 100)}%`;
    // Never yank the thumb out from under a drag.
    if (scrubRef.current && document.activeElement !== scrubRef.current) scrubRef.current.value = String(seconds);
    timeRef.current = seconds;
    return seconds;
  }, [total]);

  React.useLayoutEffect(() => {
    const host = hostRef.current;
    if (!host || typeof host.getAnimations !== 'function') return undefined;
    const list = host.getAnimations({ subtree: true });
    for (const a of list) { try { a.pause(); } catch (_) { /* ignore */ } }
    animRef.current = list;
    paint(0);
    setPlaying(true);
    // Deliberately does NOT cancel() the animations on cleanup. cancel() is
    // permanent for a CSS animation — the element keeps its declared
    // `animation` but the effect is gone for good, so React's strict-mode
    // mount → cleanup → mount left the preview frozen in its pre-entrance
    // (invisible) state. These animations belong to nodes that are unmounting
    // anyway; dropping the reference is all the cleanup that is needed.
    return () => { animRef.current = []; };
  }, [seed, total, hostRef, paint]);

  React.useEffect(() => {
    if (!playing) return undefined;
    let raf = 0;
    let origin = performance.now() - timeRef.current * 1000;
    const tick = (now) => {
      let t = (now - origin) / 1000;
      if (t >= total) {
        if (loopRef.current) { origin = now; t = 0; }
        else { paint(total); setPlaying(false); return; }
      }
      paint(t);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, total, seed, paint]);

  return {
    playing,
    loop,
    setLoop,
    readoutRef,
    barRef,
    scrubRef,
    toggle: () => {
      if (playing) { setPlaying(false); return; }
      // Play at the end means "again" — otherwise the clock is already past the
      // last frame and the button would appear to do nothing.
      if (timeRef.current >= total - 0.01) paint(0);
      setPlaying(true);
    },
    restart: () => { paint(0); setPlaying(true); },
    seek: (t) => { setPlaying(false); paint(t); },
  };
};

const PreviewScaler = ({ children, innerRef, overlay }) => {
  const hostRef = React.useRef(null);
  const [scale, setScale] = React.useState(0.3);
  React.useLayoutEffect(() => {
    const el = hostRef.current;
    if (!el) return undefined;
    const measure = () => {
      const w = el.clientWidth;
      if (w > 0) setScale(w / 1280);
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return (
    <div ref={hostRef} style={{ position: 'relative', width: '100%', minWidth: 0, aspectRatio: '16 / 9', overflow: 'hidden', background: '#05070b', borderRadius: 10, border: '1px solid var(--ui-border2)' }}>
      <div ref={innerRef} style={{ position: 'absolute', left: 0, top: 0, width: 1280, height: 720, transform: `scale(${scale})`, transformOrigin: 'top left' }}>
        {children}
      </div>
      {overlay}
    </div>
  );
};

const Num = ({ C, value, onChange, step = 0.05, min = 0, max = 30, title, disabled }) => (
  <input
    type="number"
    value={Number.isFinite(Number(value)) ? value : 0}
    step={step}
    min={min}
    max={max}
    disabled={disabled}
    title={title}
    onChange={(e) => onChange(Math.max(min, Math.min(max, Number(e.target.value) || 0)))}
    style={{ ...fieldStyle(C), flex: '1 1 0', width: 'auto', textAlign: 'center', opacity: disabled ? 0.45 : 1 }}
  />
);

const iconBtn = (C, extra) => ({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: C.elevated2,
  border: '1px solid var(--ui-border2)',
  color: C.text,
  borderRadius: 6,
  padding: '5px 7px',
  cursor: 'pointer',
  flexShrink: 0,
  ...extra,
});

export default function KineticPanel({ C, ACCENT, cue, layerIdx = 0, onSelectLayer, onPatch, onApplyCue }) {
  const layers = allTextObjects(cue);
  const idx = Math.min(Math.max(0, Number(layerIdx) || 0), Math.max(0, layers.length - 1));
  const target = layers[idx] || null;
  const kin = normalizeKin(target && target.kin);
  const t = kin ? kinTiming(kin) : null;

  const patchKin = (patch) => {
    if (!onPatch) return;
    onPatch({ kin: newKin({ ...(kin || {}), ...patch }) });
  };
  const enable = () => patchKin({ in: 'fade', inDur: 0.6 });
  const disable = () => onPatch && onPatch({ kin: undefined });

  // The preview is the wall's own renderer, so it needs the same payload shape
  // the projector gets: a style carrying the main lyric and the extra boxes.
  const previewStyle = React.useMemo(() => ({
    lyric: cueLyricStyle(cue || {}),
    texts: cue ? textObjectLayers(cue) : [],
  }), [cue]);

  const total = kinStackTotal(layers);
  // Re-collect the Web Animations whenever the stack itself changes — a preset
  // swap or a new box creates fresh animation objects with their own timelines.
  const seed = `${(cue && cue.id) || ''}:${layers.map((l) => (l && l.id) || '').join(',')}:${layers.length}`;
  const previewHostRef = React.useRef(null);
  const player = useKineticTimeline(previewHostRef, total, seed);

  const hasText = !!(cue && String(cue.text || '').trim());

  // FONT CASCADE is a SLIDE-level look, so it is written on the cue itself
  // (updateCue), never on whichever box happens to be selected.
  const cascade = normalizeCascade(cue && cue.fontCycle);
  const patchCascade = (patch) => {
    if (!onApplyCue) return;
    onApplyCue({ fontCycle: { on: true, ms: (cascade && cascade.ms) || 150, fonts: CASCADE_ALL, ...patch } });
  };
  const toggleCascade = () => {
    if (!onApplyCue) return;
    onApplyCue({ fontCycle: cascade ? { on: false } : { on: true, ms: 150, fonts: CASCADE_ALL } });
  };

  const track = (l) => {
    const k = normalizeKin(l && l.kin);
    if (!k) return null;
    const tt = kinTiming(k);
    return {
      in: { left: `${(tt.inStart / total) * 100}%`, width: `${Math.max(2, (k.inDur / total) * 100)}%` },
      loop: k.loop === 'none' ? null : { left: `${(tt.loopStart / total) * 100}%`, width: `${Math.max(2, 100 - (tt.loopStart / total) * 100)}%` },
      out: k.out === 'none' ? null : { left: `${(tt.outStart / total) * 100}%`, width: `${Math.max(2, (k.outDur / total) * 100)}%` },
    };
  };

  const nameOf = (i) => (i === 0 ? 'Main' : `Box ${i + 1}`);

  return (
    <div style={{ background: C.elevated, border: '1px solid var(--ui-border2)', borderRadius: 10, padding: 10, display: 'grid', gap: 9, minWidth: 0, boxSizing: 'border-box', overflow: 'hidden' }}>

      {/* header — the badge is capped so a long layer name can never push the
          title out of the sidebar. */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, minWidth: 0, overflow: 'hidden' }}>
          <Sparkles size={11} color={ACCENT} style={{ flexShrink: 0 }} />
          <span style={labelStyle(C)} title="Kinetic typography">Kinetic type</span>
        </div>
        <span
          title="Per text box · stored on this slide"
          style={{ fontSize: 9, fontWeight: 800, color: ACCENT, background: 'rgba(255,184,0,0.12)', border: '1px solid rgba(255,184,0,0.35)', borderRadius: 999, padding: '2px 7px', whiteSpace: 'nowrap', flexShrink: 0, maxWidth: '42%', overflow: 'hidden', textOverflow: 'ellipsis' }}
        >
          {nameOf(idx)}
        </span>
      </div>

      <PreviewScaler
        innerRef={previewHostRef}
        overlay={!hasText ? (
          <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', padding: 10, textAlign: 'center', color: 'rgba(255,255,255,0.4)', fontSize: 10.5, fontWeight: 600, lineHeight: 1.45, pointerEvents: 'none' }}>
            Type lyrics on this slide to preview its animation
          </div>
        ) : null}
      >
        {cue ? (
          <SlideTextLayers
            key={seed}
            style={previewStyle}
            text={cue.text || ''}
            st={previewStyle.lyric}
            animate
            animKey={seed}
          />
        ) : null}
      </PreviewScaler>

      {/* TRANSPORT — two rows so the scrubber gets the full width instead of
          being squeezed to 40px. */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 5, minWidth: 0 }}>
        <button
          onClick={player.toggle}
          title={player.playing ? 'Pause the timeline' : 'Play the timeline'}
          style={iconBtn(C, { background: ACCENT, border: '1px solid ' + ACCENT, color: '#0D1014', padding: '5px 8px' })}
        >
          {player.playing ? <Pause size={11} /> : <Play size={11} />}
        </button>
        <button onClick={player.restart} title="Restart from 0.00s" style={iconBtn(C, { color: C.muted })}>
          <RotateCcw size={11} />
        </button>
        <span ref={player.readoutRef} style={{ flex: 1, minWidth: 0, fontSize: 9.5, color: C.faint, fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          0.00s / {total.toFixed(2)}s
        </span>
        <button
          onClick={() => player.setLoop(!player.loop)}
          title="Loop the preview"
          style={{ background: player.loop ? ACCENT : C.elevated2, border: '1px solid ' + (player.loop ? ACCENT : 'var(--ui-border2)'), color: player.loop ? '#0D1014' : C.muted, borderRadius: 6, padding: '5px 6px', fontSize: 8.5, fontWeight: 800, cursor: 'pointer', flexShrink: 0 }}
        >LOOP</button>
      </div>
      <input
        ref={player.scrubRef}
        type="range"
        min="0"
        max={total}
        step="0.01"
        defaultValue="0"
        onChange={(e) => player.seek(Number(e.target.value))}
        title="Scrub the timeline — every layer seeks with it"
        style={{ width: '100%', minWidth: 0, margin: 0, accentColor: ACCENT, cursor: 'pointer' }}
      />

      {/* LAYER TRACKS — one row per box, positioned from its own timeline. */}
      <div style={{ display: 'grid', gap: 3, minWidth: 0 }}>
        {layers.map((l, i) => {
          const tr = track(l);
          const on = i === idx;
          return (
            <div
              key={(l && l.id) || i}
              onClick={() => onSelectLayer && onSelectLayer(i)}
              title={`${nameOf(i)} — ${summarizeKin(l && l.kin)}${l && l.text ? ` · "${String(l.text).slice(0, 40)}"` : ''}`}
              style={{ display: 'grid', gridTemplateColumns: '44px minmax(0, 1fr)', alignItems: 'center', gap: 6, cursor: onSelectLayer ? 'pointer' : 'default', background: on ? 'rgba(255,184,0,0.10)' : 'transparent', borderRadius: 5, padding: '2px 3px', minWidth: 0 }}
            >
              <span style={{ fontSize: 9, fontWeight: 800, color: on ? ACCENT : C.muted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{nameOf(i)}</span>
              <div style={{ position: 'relative', height: 9, background: C.input, borderRadius: 999, overflow: 'hidden', minWidth: 0 }}>
                {tr && tr.in && <span style={{ position: 'absolute', top: 0, bottom: 0, borderRadius: 999, background: ACCENT, opacity: 0.85, ...tr.in }} />}
                {tr && tr.loop && <span style={{ position: 'absolute', top: 3, bottom: 3, borderRadius: 999, background: 'var(--ui-accent, #FFC72C)', opacity: 0.28, ...tr.loop }} />}
                {tr && tr.out && <span style={{ position: 'absolute', top: 0, bottom: 0, borderRadius: 999, background: '#FF4D6D', opacity: 0.85, ...tr.out }} />}
              </div>
            </div>
          );
        })}
      </div>
      <div style={{ height: 3, background: C.input, borderRadius: 999, overflow: 'hidden', marginTop: -4, minWidth: 0 }}>
        <span ref={player.barRef} style={{ display: 'block', height: '100%', width: '0%', background: ACCENT, borderRadius: 999 }} />
      </div>

      {!kin ? (
        <button
          onClick={enable}
          style={{ width: '100%', minWidth: 0, boxSizing: 'border-box', background: C.elevated2, border: '1px dashed var(--ui-border2)', color: C.text, borderRadius: 8, padding: '8px 6px', fontSize: 10, fontWeight: 800, cursor: 'pointer', whiteSpace: 'normal', lineHeight: 1.35, textAlign: 'center' }}
        >
          Add a kinetic timeline to {nameOf(idx)}
        </button>
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 6, minWidth: 0 }}>
            <div style={{ display: 'grid', gap: 2, minWidth: 0 }}>
              <span style={labelStyle(C)}>Entrance</span>
              <select value={kin.in} onChange={(e) => {
                const def = KIN_ENTRANCES.find((x) => x.key === e.target.value);
                patchKin({ in: e.target.value, inDur: def ? def.dur : kin.inDur });
              }} style={fieldStyle(C)}>
                {KIN_ENTRANCES.map((x) => <option key={x.key} value={x.key}>{x.label}</option>)}
              </select>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, minWidth: 0 }}>
                <span style={{ fontSize: 8.5, color: C.faint, flexShrink: 0 }}>dur</span>
                <Num C={C} value={kin.inDur} min={0} max={10} onChange={(v) => patchKin({ inDur: v })} title="Entrance duration in seconds" disabled={kin.in === 'none'} />
              </div>
            </div>
            <div style={{ display: 'grid', gap: 2, minWidth: 0 }}>
              <span style={labelStyle(C)}>Exit</span>
              <select value={kin.out} onChange={(e) => {
                const def = KIN_EXITS.find((x) => x.key === e.target.value);
                patchKin({ out: e.target.value, outDur: def ? def.dur : kin.outDur });
              }} style={fieldStyle(C)}>
                {KIN_EXITS.map((x) => <option key={x.key} value={x.key}>{x.label}</option>)}
              </select>
              {kin.out !== 'none' && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, minWidth: 0 }}>
                  <span style={{ fontSize: 8.5, color: C.faint, flexShrink: 0 }}>at</span>
                  <Num C={C} value={kin.outAt} min={0} max={60} onChange={(v) => patchKin({ outAt: v })} title="Seconds after the slide fires; 0 = right after the entrance" />
                </div>
              )}
            </div>
            <div style={{ display: 'grid', gap: 2, minWidth: 0 }}>
              <span style={labelStyle(C)} title="Continuous motion">Loop</span>
              <select value={kin.loop} onChange={(e) => {
                const def = KIN_LOOPS.find((x) => x.key === e.target.value);
                patchKin({ loop: e.target.value, loopDur: def ? def.dur : kin.loopDur });
              }} style={fieldStyle(C)}>
                {KIN_LOOPS.map((x) => <option key={x.key} value={x.key}>{x.label}</option>)}
              </select>
              {kin.loop !== 'none' && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, minWidth: 0 }}>
                  <span style={{ fontSize: 8.5, color: C.faint, flexShrink: 0 }}>amp</span>
                  <Num C={C} value={kin.amp} min={0} max={2} step={0.1} onChange={(v) => patchKin({ amp: v })} title="Strength of the continuous motion (0–2)" />
                </div>
              )}
            </div>
            <div style={{ display: 'grid', gap: 2, minWidth: 0 }}>
              <span style={labelStyle(C)}>Timing</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, minWidth: 0 }}>
                <span style={{ fontSize: 8.5, color: C.faint, flexShrink: 0 }}>delay</span>
                <Num C={C} value={kin.delay} min={0} max={30} onChange={(v) => patchKin({ delay: v })} title="Seconds after the slide fires before this box enters" />
              </div>
              <select value={kin.ease} onChange={(e) => patchKin({ ease: e.target.value })} style={fieldStyle(C)} title="Easing curve">
                {KIN_EASES.map((x) => <option key={x.key} value={x.key}>{x.label}</option>)}
              </select>
            </div>
          </div>

          {t && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 8.5, color: C.faint, fontFamily: 'monospace', flexWrap: 'wrap', minWidth: 0, lineHeight: 1.4 }}>
              <span style={{ color: ACCENT, fontWeight: 800 }}>{summarizeKin(kin)}</span>
              <span style={{ whiteSpace: 'nowrap' }}>in {t.inStart.toFixed(2)}→{t.inEnd.toFixed(2)}s</span>
              {kin.out !== 'none' && <span style={{ color: '#FF4D6D', whiteSpace: 'nowrap' }}>out {t.outStart.toFixed(2)}→{t.outEnd.toFixed(2)}s</span>}
            </div>
          )}

          <button
            onClick={disable}
            title="Remove this box's timeline and return it to the normal entrance"
            style={{ width: '100%', minWidth: 0, boxSizing: 'border-box', background: 'transparent', border: '1px solid var(--ui-border2)', color: C.faint, borderRadius: 6, padding: '5px', fontSize: 9.5, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, whiteSpace: 'normal', lineHeight: 1.3 }}
          >
            <X size={10} style={{ flexShrink: 0 }} /> Remove timeline
          </button>
        </>
      )}

      {/* FONT CASCADE — the main text re-sets its face on a fast clock. Shown
          here (not in the box sidebar) because it belongs to the slide, and
          because the preview two rows up plays it immediately. */}
      <div style={{ borderTop: '1px solid var(--ui-border2)', paddingTop: 8, display: 'grid', gap: 6, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6, minWidth: 0 }}>
          <span style={labelStyle(C)} title="Cycle this slide's main text through several bold faces">Font cascade</span>
          <button
            onClick={toggleCascade}
            title={cascade ? 'Stop cycling this slide' : 'Cycle the main text through five bold faces'}
            style={{ flexShrink: 0, background: cascade ? ACCENT : C.elevated2, border: '1px solid ' + (cascade ? ACCENT : 'var(--ui-border2)'), color: cascade ? '#0D1014' : C.muted, borderRadius: 999, padding: '2px 9px', fontSize: 9, fontWeight: 800, cursor: 'pointer' }}
          >{cascade ? 'ON' : 'OFF'}</button>
        </div>
        {cascade ? (
          <>
            <div style={{ display: 'flex', gap: 3, alignItems: 'center', minWidth: 0 }}>
              <span style={{ fontSize: 8.5, color: C.faint, flexShrink: 0 }}>ms</span>
              {CASCADE_SPEEDS.map((ms) => {
                const on = Number(cascade.ms) === ms;
                return (
                  <button
                    key={ms}
                    onClick={() => patchCascade({ ms })}
                    title={`${ms}ms per face`}
                    style={{ flex: 1, minWidth: 0, background: on ? ACCENT : C.elevated2, border: '1px solid ' + (on ? ACCENT : 'var(--ui-border2)'), color: on ? '#0D1014' : C.muted, borderRadius: 5, padding: '4px 0', fontSize: 9, fontWeight: 700, cursor: 'pointer' }}
                  >{ms}</button>
                );
              })}
            </div>
            <div style={{ fontSize: 8.5, color: C.faint, lineHeight: 1.45, minWidth: 0, overflowWrap: 'anywhere' }}>
              {CASCADE_FONTS.map((f) => f.label).join(' → ')}
            </div>
            <div style={{ fontSize: 8.5, color: C.faint, lineHeight: 1.45 }}>
              Main text only, on this slide. 150ms is a strobe — 400ms is calmer.
            </div>
          </>
        ) : (
          <div style={{ fontSize: 8.5, color: C.faint, lineHeight: 1.45 }}>
            Re-sets the main text through {CASCADE_FONTS.length} bold faces while the slide is up.
          </div>
        )}
      </div>

      {/* PRESETS — a whole composition, not a font choice: each one restyles the
          slide's main text and adds overlapping boxes that spell the SAME slide
          text in other treatments. One column, because two would clip the names
          in this sidebar. */}
      <div style={{ borderTop: '1px solid var(--ui-border2)', paddingTop: 8, display: 'grid', gap: 5, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6, minWidth: 0 }}>
          <span style={labelStyle(C)} title="Motion presets">Presets</span>
          <button
            onClick={() => onApplyCue && onApplyCue(clearKinetic(cue))}
            title="Strip kinetic timelines and the preset's extra layers from this slide"
            style={{ background: 'transparent', border: 'none', color: C.faint, fontSize: 9, fontWeight: 700, cursor: 'pointer', textDecoration: 'underline', flexShrink: 0, padding: 0 }}
          >Clear</button>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 4, minWidth: 0 }}>
          {KIN_PRESETS.map((p) => (
            <button
              key={p.key}
              onClick={() => onApplyCue && onApplyCue(applyKineticPreset(cue, p.key))}
              title={`${p.label} — ${p.blurb} Applies to this slide and keeps its words.`}
              style={{ textAlign: 'left', minWidth: 0, boxSizing: 'border-box', background: C.elevated2, border: '1px solid var(--ui-border2)', color: C.text, borderRadius: 6, padding: '5px 7px', fontSize: 9.5, fontWeight: 700, cursor: 'pointer', lineHeight: 1.3, whiteSpace: 'normal', overflow: 'hidden', textOverflow: 'ellipsis' }}
            >
              {p.label}
            </button>
          ))}
        </div>
        <div style={{ fontSize: 8.5, color: C.faint, lineHeight: 1.45 }}>
          A preset replaces this slide's extra boxes with its own stack and keeps the words. Undo with Clear preset.
        </div>
      </div>
    </div>
  );
}
