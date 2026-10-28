import React, { useEffect, useRef, useState } from 'react';
import { Play, Square, RefreshCw, Clock, Hourglass, Crosshair, Monitor, Images, Film, X, PanelRight, Pause, Volume2 } from 'lucide-react';
import { motion } from 'motion/react';
import { useApp } from '../context/AppContext';
import { stubTap } from '../lib/anim';
import { GRADIENT_PACK } from '../lib/backgrounds';
import { DEFAULT_COUNTDOWN, ANIMATED_GRADIENTS, probeVideoAudio } from './CountdownFace';
import CountdownPreview from './CountdownPreview';

const PRESETS = [
  [60, '1m'], [180, '3m'], [300, '5m'], [600, '10m'], [900, '15m'], [1800, '30m'],
];
// Video countdown's OWN preset strip (spec: 1/3/5/10/15/20/30/60). The shared
// PRESETS above stay exactly as they were for normal and slideshow modes.
const VIDEO_PRESETS = [
  [60, '1m'], [180, '3m'], [300, '5m'], [600, '10m'], [900, '15m'], [1200, '20m'], [1800, '30m'], [3600, '60m'],
];

const DEFAULT_BG_MEDIA = { kind: 'slideshow', images: [], slideSec: 5, video: null, loop: true, videoAudio: { enabled: true, volume: 0.9, muted: false, fadeSec: 0 } };

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
            style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, background: selected ? ACCENT : C.elevated2, border: '1px solid ' + (selected ? ACCENT : 'var(--ui-border2)'), color: selected ? '#1C1C1E' : C.muted, borderRadius: 8, padding: '8px 6px', fontSize: 11.5, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}
          >
            {Icon ? <Icon size={13} /> : null}{lbl}
          </button>
        );
      })}
    </div>
  );
}

export default function CountdownPanel() {
  const { C, ACCENT, countdown, setCountdown, fireCountdownLive, stopCountdownLive, pauseCountdownLive, resumeCountdownLive, persistCountdownFile, cdTemplates, setCdTemplates, outputAspect, wallAspect, rightOpen, setRightOpen } = useApp();
  const cfg = { ...DEFAULT_COUNTDOWN, ...(countdown || {}) };
  const live = !!(cfg.live);
  const paused = !!(cfg.live && cfg.live.pausedAt != null);
  const set = (patch) => setCountdown((prev) => ({ ...DEFAULT_COUNTDOWN, ...(prev || {}), ...patch }));
  const media = { ...DEFAULT_BG_MEDIA, ...(cfg.bgMedia || {}) };
  const setMedia = (patch) => set({ bgType: 'media', bgMedia: { ...media, ...patch } });
  // Video-upload mode: the ONLY surface that gets its own transport buttons,
  // preset strip and original-audio controls. Slideshow/normal paths below
  // are untouched.
  const isVideoMode = cfg.bgType === 'media' && media.kind === 'video';
  const setVideoAudio = (patch) => setMedia({ videoAudio: { ...(media.videoAudio || {}), ...patch } });
  const [mediaBusy, setMediaBusy] = useState(false);
  // One-shot audio test: a PRIVATE element, only while idle (never while the
  // countdown is on air — the main output owns the sound there, so a test
  // during playback would double the room's audio).
  const [audioTesting, setAudioTesting] = useState(false);
  const testElRef = useRef(null);
  const testTimerRef = useRef(null);
  const stopAudioTest = React.useCallback(() => {
    if (testTimerRef.current) { clearTimeout(testTimerRef.current); testTimerRef.current = null; }
    const el = testElRef.current;
    testElRef.current = null;
    if (el) { try { el.pause(); el.removeAttribute('src'); el.load(); } catch {} }
    setAudioTesting(false);
  }, []);
  const toggleAudioTest = () => {
    if (audioTesting) { stopAudioTest(); return; }
    if (!media.video || live) return;
    try {
      const el = document.createElement('video');
      el.src = media.video;
      el.preload = 'auto';
      const av = media.videoAudio || {};
      el.muted = av.enabled === false || !!av.muted;
      el.volume = Math.min(1, Math.max(0, Number.isFinite(Number(av.volume)) ? Number(av.volume) : 0.9));
      const p = el.play();
      if (p && p.catch) p.catch(() => {});
      testElRef.current = el;
      setAudioTesting(true);
      testTimerRef.current = setTimeout(() => stopAudioTest(), 5000);
    } catch {}
  };
  // A changed file (or a closed tab) must release the test element — nothing
  // plays from a stale URL.
  useEffect(() => { stopAudioTest(); }, [media.video, stopAudioTest]);
  // Go Live hands the sound to the wall immediately. A test clip still playing
  // from this panel would be a second copy of the same track (echo), so kill
  // it the moment the countdown becomes live. Unmount releases it too.
  useEffect(() => { if (live) stopAudioTest(); }, [live, stopAudioTest]);
  useEffect(() => () => stopAudioTest(), [stopAudioTest]);
  const imgPickRef = useRef(null);
  const vidPickRef = useRef(null);
  const wmPickRef = useRef(null);

  // Files are COPIED into countdown-media/ (media://kog-media/cd/…) with NO
  // library registration — the Media tab and song backgrounds never see
  // them. Same projector resolution as library files, zero cross-talk.
  const addImages = async (files) => {
    const list = Array.from(files || []).filter((f) => f && f.type.startsWith('image/'));
    if (!list.length || mediaBusy) return;
    setMediaBusy(true);
    try {
      const urls = [];
      for (const f of list) {
        const u = await persistCountdownFile(f);
        if (u) urls.push(u);
      }
      if (urls.length) set({ bgType: 'media', bgMedia: { ...media, kind: 'slideshow', images: [...(media.images || []), ...urls] } });
    } finally {
      setMediaBusy(false);
    }
  };
  const setVideo = async (file) => {
    if (!file || mediaBusy) return;
    setMediaBusy(true);
    try {
      const u = await persistCountdownFile(file);
      if (u) {
        // Persisted into countdown-media/ (media://…) like before — offline
        // after import, alive across restarts. Audio prefs carry over; track
        // detection resets for the new file.
        set({ bgType: 'media', bgMedia: { ...media, kind: 'video', video: u, videoAudio: { enabled: true, volume: 0.9, muted: false, fadeSec: 0, ...(media.videoAudio || {}), hasTrack: null, unsupported: false, probed: false } } });
        probeVideoAudio(u).then((r) => {
          if (!r) return;
          setCountdown((prev) => {
            const cur = { ...DEFAULT_COUNTDOWN, ...(prev || {}) };
            const m = { ...DEFAULT_BG_MEDIA, ...(cur.bgMedia || {}) };
            if (m.video !== u) return prev; // another file was picked meanwhile
            return { ...cur, bgType: 'media', bgMedia: { ...m, videoAudio: { ...(m.videoAudio || {}), hasTrack: r.hasAudio ?? null, unsupported: !!r.unsupported, probed: true } } };
          });
        }).catch(() => {});
      }
    } finally {
      setMediaBusy(false);
    }
  };
  // Slideshow watermark (logo badge): persisted like any other image.
  const setWatermark = async (file) => {
    if (!file || mediaBusy) return;
    setMediaBusy(true);
    try {
      const u = await persistCountdownFile(file);
      if (u) set({ bgType: 'media', bgMedia: { ...media, watermark: { ...((media.watermark) || {}), url: u } } });
    } finally {
      setMediaBusy(false);
    }
  };
  const setWatermarkOpts = (patch) => set({ bgType: 'media', bgMedia: { ...media, watermark: { ...((media.watermark) || {}), ...patch } } });

  // One-click Sunday setups live in App state (shared with the phone): named
  // snapshots of the MEDIA setup only — titles/durations stay weekly.
  const [tplName, setTplName] = useState('');
  const saveCdTemplate = () => {
    const name = tplName.trim().slice(0, 60);
    if (!name) return;
    setCdTemplates((prev) => [...(prev || []).filter((t) => t.name !== name), { name, bgMedia: { ...media } }]);
    setTplName('');
  };
  const applyCdTemplate = (t) => {
    if (!t || !t.bgMedia) return;
    set({ bgType: 'media', bgMedia: { ...DEFAULT_BG_MEDIA, ...(t.bgMedia || {}) } });
  };

  const mins = Math.floor((Number(cfg.durationSec) || 0) / 60);
  const secs = (Number(cfg.durationSec) || 0) % 60;
  const setDuration = (m, s) => {
    const mm = Math.max(0, Math.min(999, Math.floor(Number(m) || 0)));
    const ss = Math.max(0, Math.min(59, Math.floor(Number(s) || 0)));
    set({ durationSec: mm * 60 + ss });
  };
  // Preset strip: video mode gets its 8-button set (incl. 20m/60m); normal
  // and slideshow countdowns keep the original 6 — unchanged.
  const durationPresets = isVideoMode ? VIDEO_PRESETS : PRESETS;

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
        <Clock size={16} color={live ? '#36C982' : C.faint} />
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>Countdown Timer</h2>
        {live && (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: paused ? 'rgba(251,191,36,0.15)' : 'rgba(54,201,130,0.15)', border: '1px solid ' + (paused ? 'rgba(251,191,36,0.5)' : 'rgba(54,201,130,0.5)'), color: paused ? '#fbbf24' : '#36C982', borderRadius: 999, padding: '3px 10px', fontSize: 10, fontWeight: 800, letterSpacing: 1 }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: paused ? '#f59e0b' : '#36C982', boxShadow: '0 0 8px ' + (paused ? '#f59e0b' : '#36C982') }} /> {paused ? 'PAUSED' : 'LIVE'}
          </span>
        )}
        <span style={{ flex: 1 }} />
        <button
          onClick={() => setRightOpen((v) => !v)}
          title={rightOpen ? 'Hide the Live Output sidebar' : 'Show the Live Output sidebar'}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: rightOpen ? 'rgba(255,184,0,0.16)' : 'transparent', border: '1px solid ' + (rightOpen ? 'rgba(255,184,0,0.5)' : 'var(--ui-border2)'), color: rightOpen ? '#FFC72C' : C.muted, borderRadius: 8, padding: '6px 11px', fontSize: 11, fontWeight: 800, cursor: 'pointer', whiteSpace: 'nowrap' }}
        >
          <PanelRight size={13} /> Live Output
        </button>
      </div>

      <div style={{ flex: 1, display: 'flex', justifyContent: 'center', overflowY: 'auto', padding: '4px 18px 16px 18px', minHeight: 0 }}>
        <div style={{ display: 'flex', gap: 20, width: '100%', alignItems: 'flex-start' }}>
          {/* LEFT — form (page scrolls as one; no locked inner scroll) */}
          <div style={{ flex: '1 1 380px', maxWidth: 480, minWidth: 260, display: 'flex', flexDirection: 'column', gap: 14, paddingBottom: 4 }}>
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
                  {durationPresets.map(([v, lbl]) => (
                    <button key={v} onClick={() => set({ durationSec: v })} style={{ flex: 1, background: cfg.durationSec === v ? ACCENT : C.elevated2, border: '1px solid ' + (cfg.durationSec === v ? ACCENT : 'var(--ui-border2)'), color: cfg.durationSec === v ? '#1C1C1E' : C.muted, borderRadius: 6, padding: '6px 0', fontSize: isVideoMode ? 10.5 : 11, fontWeight: 700, cursor: 'pointer' }}>{lbl}</button>
                  ))}
                </div>
                {isVideoMode && (
                  <div style={{ fontSize: 11, color: C.faint2, marginTop: 6, lineHeight: 1.45 }}>
                    The timer runs independently of the video — a 3-minute video loops until the timer ends.
                  </div>
                )}
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
                {[['color', 'Color'], ['gradient', 'Gradient'], ['animated', 'Animated'], ['media', 'Media']].map(([v, lbl]) => (
                  <button key={v} onClick={() => v === 'media' ? setMedia({}) : set({ bgType: v, bgValue: v === 'color' ? '#1C1C1E' : v === 'animated' ? 'anim:aurora' : GRADIENT_PACK[4].css })} style={{ flex: 1, background: cfg.bgType === v ? ACCENT : C.elevated2, border: '1px solid ' + (cfg.bgType === v ? ACCENT : 'var(--ui-border2)'), color: cfg.bgType === v ? '#1C1C1E' : C.muted, borderRadius: 6, padding: '7px 0', fontSize: 11.5, fontWeight: 700, cursor: 'pointer' }}>{lbl}</button>
                ))}
              </div>
              {cfg.bgType === 'color' ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <input type="color" value={/^#[0-9a-fA-F]{6}$/.test(cfg.bgValue) ? cfg.bgValue : '#1C1C1E'} onChange={(e) => set({ bgValue: e.target.value })} style={{ width: 44, height: 30, background: C.input, border: '1px solid var(--ui-border2)', borderRadius: 6, cursor: 'pointer', padding: 2 }} />
                  <span style={{ fontSize: 11, color: C.muted }}>Solid background colour</span>
                </div>
              ) : cfg.bgType === 'animated' ? (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
                  {ANIMATED_GRADIENTS.map((g) => (
                    <button key={g.id} title={`${g.name} (animated loop)`} onClick={() => set({ bgValue: `anim:${g.id}` })} style={{ height: 52, borderRadius: 7, cursor: 'pointer', border: cfg.bgValue === `anim:${g.id}` ? '2px solid ' + ACCENT : '1px solid var(--ui-border2)', background: g.base, color: '#fff', fontSize: 10, fontWeight: 800, padding: 0 }}>{g.name}</button>
                  ))}
                </div>
              ) : cfg.bgType === 'media' ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <Segmented C={C} ACCENT={ACCENT} value={media.kind} onPick={(kind) => setMedia({ kind })} options={[
                    ['slideshow', 'Slideshow', Images],
                    ['video', 'Video', Film],
                  ]} />
                  {media.kind === 'slideshow' ? (
                    <>
                      <div
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={(e) => { e.preventDefault(); addImages(e.dataTransfer?.files); }}
                        onClick={() => imgPickRef.current?.click()}
                        title="Click to pick images, or drop them here"
                        style={{ border: '1px dashed var(--ui-border2)', borderRadius: 8, padding: '12px', textAlign: 'center', fontSize: 11.5, color: C.muted, cursor: 'pointer', lineHeight: 1.5 }}
                      >
                        {mediaBusy ? 'Copying into library…' : `Drop images here or click to pick${(media.images || []).length ? ` (${media.images.length} loaded)` : ''}`}
                      </div>
                      <input ref={imgPickRef} type="file" accept="image/*" multiple style={{ display: 'none' }} onChange={(e) => { addImages(e.target.files); e.target.value = ''; }} />
                      {(media.images || []).length > 0 && (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                          {media.images.map((src, i) => (
                            <div key={`${src}|${i}`} style={{ position: 'relative', width: 56, height: 32, borderRadius: 6, overflow: 'hidden', border: '1px solid var(--ui-border2)', background: '#000' }}>
                              <img src={src} alt="" draggable={false} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                              <button onClick={() => setMedia({ images: media.images.filter((_, x) => x !== i) })} title="Remove" style={{ position: 'absolute', top: 1, right: 1, width: 16, height: 16, borderRadius: 999, background: 'rgba(0,0,0,0.7)', border: 'none', color: '#FF4545', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}><X size={10} /></button>
                            </div>
                          ))}
                        </div>
                      )}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <label style={{ fontSize: 10, color: C.faint, fontWeight: 700, width: 52, flexShrink: 0 }}>Each slide</label>
                        <input type="range" min={2} max={30} step={1} value={media.slideSec} onChange={(e) => setMedia({ slideSec: Number(e.target.value) })} style={{ flex: 1 }} />
                        <span style={{ fontSize: 11, color: C.muted, width: 44, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{media.slideSec}s</span>
                      </div>
                      <div style={{ display: 'flex', gap: 4 }}>
                        {[5, 10, 15].map((s) => (
                          <button key={s} onClick={() => setMedia({ slideSec: s })} style={{ flex: 1, background: media.slideSec === s ? ACCENT : C.elevated2, border: '1px solid ' + (media.slideSec === s ? ACCENT : 'var(--ui-border2)'), color: media.slideSec === s ? '#1C1C1E' : C.muted, borderRadius: 6, padding: '6px 0', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>{s}s</button>
                        ))}
                      </div>
                      {/* Watermark badge (slideshow only): logo pinned to a
                          corner of the picture, like a broadcast bug. */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, background: C.elevated, border: '1px solid var(--ui-border2)', borderRadius: 8, padding: '9px 10px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ fontSize: 10, color: C.faint, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 1, flex: 1 }}>Watermark</span>
                          {media.watermark?.url ? (
                            <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <img src={media.watermark.url} alt="" draggable={false} style={{ width: 30, height: 30, borderRadius: 999, objectFit: 'cover', border: '1px solid var(--ui-border2)', background: '#000' }} />
                              <button onClick={() => setWatermarkOpts({ url: null })} title="Remove watermark" style={{ background: 'transparent', border: '1px solid var(--ui-border2)', color: '#FF4545', borderRadius: 6, padding: '4px 10px', fontSize: 10.5, fontWeight: 800, cursor: 'pointer' }}>Remove</button>
                            </span>
                          ) : (
                            <button onClick={() => wmPickRef.current?.click()} disabled={mediaBusy} title="Pick a logo image" style={{ background: ACCENT, border: 'none', color: '#1C1C1E', borderRadius: 6, padding: '6px 12px', fontSize: 11, fontWeight: 800, cursor: mediaBusy ? 'default' : 'pointer', opacity: mediaBusy ? 0.6 : 1 }}>{mediaBusy ? 'Copying…' : 'Pick logo'}</button>
                          )}
                        </div>
                        <input ref={wmPickRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={(e) => { setWatermark(e.target.files?.[0]); e.target.value = ''; }} />
                        {media.watermark?.url && (
                          <>
                            <div style={{ display: 'flex', gap: 4 }}>
                              {[['tl', 'Top Left'], ['tr', 'Top Right'], ['bl', 'Bottom Left'], ['br', 'Bottom Right']].map(([v, lbl]) => {
                                const cur = media.watermark?.pos || 'tl';
                                return (
                                  <button key={v} onClick={() => setWatermarkOpts({ pos: v })} style={{ flex: 1, background: cur === v ? ACCENT : C.elevated2, border: '1px solid ' + (cur === v ? ACCENT : 'var(--ui-border2)'), color: cur === v ? '#1C1C1E' : C.muted, borderRadius: 6, padding: '6px 0', fontSize: 10, fontWeight: 700, cursor: 'pointer' }}>{lbl}</button>
                                );
                              })}
                            </div>
                            {[
                              ['Size', media.watermark?.size ?? 160, 32, 400, 4, (v) => setWatermarkOpts({ size: v }), 'px'],
                              ['Opacity', media.watermark?.opacity ?? 100, 10, 100, 5, (v) => setWatermarkOpts({ opacity: v }), '%'],
                            ].map(([lbl, val, min, max, step, fn, unit]) => (
                              <div key={lbl} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <label style={{ fontSize: 10, color: C.faint, fontWeight: 700, width: 52, flexShrink: 0 }}>{lbl}</label>
                                <input type="range" min={min} max={max} step={step} value={val} onChange={(e) => fn(Number(e.target.value))} style={{ flex: 1 }} />
                                <span style={{ fontSize: 11, color: C.muted, width: 44, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{val}{unit}</span>
                              </div>
                            ))}
                          </>
                        )}
                      </div>
                    </>
                  ) : (
                    <>
                      <div
                        onClick={() => vidPickRef.current?.click()}
                        title="Pick a video file"
                        style={{ border: '1px dashed var(--ui-border2)', borderRadius: 8, padding: '12px', textAlign: 'center', fontSize: 11.5, color: C.muted, cursor: 'pointer', lineHeight: 1.5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
                      >
                        {mediaBusy ? 'Copying into library…' : (media.video ? String(media.video).split('/').pop() : 'Click to pick an .mp4 / .webm / .mov')}
                      </div>
                      <input ref={vidPickRef} type="file" accept="video/mp4,video/webm,video/quicktime,video/*" style={{ display: 'none' }} onChange={(e) => { setVideo(e.target.files?.[0]); e.target.value = ''; }} />
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12, fontWeight: 700, color: C.text2, cursor: 'pointer' }}>
                          <input type="checkbox" checked={media.loop !== false} onChange={(e) => setMedia({ loop: e.target.checked })} />
                          Loop video
                        </label>
                        {media.video && (
                          <button onClick={() => setMedia({ video: null })} style={{ marginLeft: 'auto', background: 'transparent', border: '1px solid var(--ui-border2)', color: '#FF4545', borderRadius: 6, padding: '5px 10px', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>Remove</button>
                        )}
                      </div>
                      {/* ORIGINAL AUDIO (video mode only): enable/mute, volume,
                          optional fade into 00:00, 5-second test, and the
                          detected-track status. Persisted with the countdown
                          config (localStorage) like every other setting. */}
                      {media.video && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, background: C.elevated, border: '1px solid var(--ui-border2)', borderRadius: 8, padding: '9px 10px' }}>
                          <span style={{ fontSize: 10, color: C.faint, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 1 }}>Original video audio</span>
                          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
                            <label style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12, fontWeight: 700, color: C.text2, cursor: 'pointer' }}>
                              <input type="checkbox" checked={(media.videoAudio?.enabled ?? true) !== false} onChange={(e) => setVideoAudio({ enabled: e.target.checked })} />
                              Play original audio
                            </label>
                            <label style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12, fontWeight: 700, color: C.text2, cursor: 'pointer' }}>
                              <input type="checkbox" checked={!!media.videoAudio?.muted} onChange={(e) => setVideoAudio({ muted: e.target.checked })} />
                              Mute
                            </label>
                          </div>
                          {[
                            ['Volume', Math.round((Number.isFinite(Number(media.videoAudio?.volume)) ? Number(media.videoAudio.volume) : 0.9) * 100), 0, 100, 5, (v) => setVideoAudio({ volume: v / 100 }), '%'],
                            ['End fade', Number(media.videoAudio?.fadeSec) || 0, 0, 10, 0.5, (v) => setVideoAudio({ fadeSec: v }), 's'],
                          ].map(([lbl, val, min, max, step, fn, unit]) => (
                            <div key={lbl} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <label style={{ fontSize: 10, color: C.faint, fontWeight: 700, width: 52, flexShrink: 0 }}>{lbl}</label>
                              <input type="range" min={min} max={max} step={step} value={val} onChange={(e) => fn(Number(e.target.value))} style={{ flex: 1 }} />
                              <span style={{ fontSize: 11, color: C.muted, width: 44, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{val}{unit}</span>
                            </div>
                          ))}
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                            <button onClick={toggleAudioTest} disabled={live || !media.video} title={live ? 'Stop the countdown first — the live output owns the sound' : "Play this video's audio for 5 seconds"} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: audioTesting ? 'rgba(255,69,69,0.18)' : ACCENT, border: '1px solid ' + (audioTesting ? '#FF4545' : 'transparent'), color: audioTesting ? '#FF4545' : '#1C1C1E', borderRadius: 6, padding: '6px 12px', fontSize: 11, fontWeight: 800, cursor: live || !media.video ? 'default' : 'pointer', opacity: live ? 0.55 : 1 }}>
                              {audioTesting ? <><Square size={12} /> Stop test</> : <><Volume2 size={12} /> Test audio</>}
                            </button>
                            <span style={{ fontSize: 10.5, color: media.videoAudio?.unsupported ? '#FF4545' : media.videoAudio?.hasTrack === false ? '#fbbf24' : C.faint2, lineHeight: 1.4 }}>
                              {media.videoAudio?.unsupported
                                ? 'This format may not play here — MP4 (H.264/AAC) or WebM recommended.'
                                : media.videoAudio?.probed === false
                                  ? 'Checking audio track…'
                                  : media.videoAudio?.hasTrack === false
                                    ? 'No audio track detected — the video plays silently.'
                                    : media.videoAudio?.hasTrack === true
                                      ? 'Audio track detected.'
                                      : 'Track unknown — use Test audio to verify.'}
                            </span>
                          </div>
                        </div>
                      )}
                    </>
                  )}
                  <div style={{ fontSize: 11, color: C.faint2, lineHeight: 1.5 }}>
                    {media.kind === 'video'
                      ? 'Video fills the screen; the timer floats over it — centered for the first 3 seconds, top-right after, back to center for the final five.'
                      : 'Timer rides a black banner at the bottom; media fills the top — preview shows exactly what the room sees.'}
                  </div>
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6 }}>
                  {GRADIENT_PACK.map((g) => (
                    <button key={g.id} title={g.name} onClick={() => set({ bgValue: g.css })} style={{ aspectRatio: '1 / 1', borderRadius: 7, background: g.css, border: '2px solid ' + (cfg.bgValue === g.css ? ACCENT : 'var(--ui-border2)'), cursor: 'pointer', padding: 0 }} />
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* RIGHT — preview + go live (no inner scroll lock; the page
              scrolls as one so the preview can be tall). */}
          <div style={{ flex: '2 1 560px', minWidth: 280, display: 'flex', flexDirection: 'column', gap: 8, paddingBottom: 4 }}>
            {/* Same wall shape as the monitor mini: what you stage here is what
                the projector fills — no 16:9-look-then-wide-wall surprise. */}
            <CountdownPreview timer={cfg} aspect={wallAspect} badge={outputAspect || '16:9'} where="tab" />
            <div style={{ display: 'flex', gap: 8 }}>
              <motion.button
                {...stubTap}
                onClick={() => (live ? stopCountdownLive() : fireCountdownLive())}
                style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, background: live ? 'rgba(255,69,69,0.9)' : '#36C982', border: 'none', color: '#fff', borderRadius: 10, padding: '10px 0', fontSize: 13, fontWeight: 800, cursor: 'pointer' }}
              >
                {live ? <Square size={14} /> : <Play size={14} />} {live ? 'Stop Timer' : 'Go Live'}
              </motion.button>
              <motion.button {...stubTap} title="Stop and reset" onClick={() => stopCountdownLive()} style={{ width: 46, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: C.elevated2, border: '1px solid var(--ui-border2)', color: C.muted, borderRadius: 10, cursor: 'pointer' }}>
                <RefreshCw size={15} />
              </motion.button>
            </div>
            {/* VIDEO-COUNTDOWN TRANSPORT (video mode only): pause freezes the
                absolute clock AND the animation phases; resume re-anchors the
                end timestamp from the frozen remainder; restart re-fires from
                zero so the center-splash sequence plays again. */}
            {live && isVideoMode && (
              <div style={{ display: 'flex', gap: 8 }}>
                <motion.button
                  {...stubTap}
                  onClick={() => (paused ? resumeCountdownLive() : pauseCountdownLive())}
                  style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, background: paused ? '#36C982' : C.elevated2, border: '1px solid ' + (paused ? 'transparent' : 'var(--ui-border2)'), color: paused ? '#fff' : C.text, borderRadius: 10, padding: '9px 0', fontSize: 12.5, fontWeight: 800, cursor: 'pointer' }}
                >
                  {paused ? <Play size={13} /> : <Pause size={13} />} {paused ? 'Resume' : 'Pause'}
                </motion.button>
                <motion.button
                  {...stubTap}
                  onClick={() => fireCountdownLive()}
                  title="Restart from the beginning (replays the opening splash)"
                  style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, background: C.elevated2, border: '1px solid var(--ui-border2)', color: C.text, borderRadius: 10, padding: '9px 0', fontSize: 12.5, fontWeight: 800, cursor: 'pointer' }}
                >
                  <RefreshCw size={13} /> Restart
                </motion.button>
              </div>
            )}
            {live && (
              <div style={{ fontSize: 11, color: C.muted, textAlign: 'center' }}>
                Live on {cfg.showOn === 'both' ? 'Main Output + Stage Display' : cfg.showOn === 'main' ? 'Main Output' : 'Stage Display'} — Stop clears {cfg.showOn === 'stage' ? 'the stage' : 'the output to black'}.
              </div>
            )}
            {/* Frame-the-picture lives HERE (not in the form column) so the
                sliders sit beside the preview they change — no scrolling. */}
            {cfg.bgType === 'media' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, background: C.elevated, border: '1px solid var(--ui-border2)', borderRadius: 10, padding: '8px 10px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 10, color: C.faint, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 1, flex: 1 }}>Frame the picture</span>
                  {(media.posX !== undefined || media.posY !== undefined || media.scale !== undefined) && (
                    <button onClick={() => setMedia({ posX: 50, posY: 50, scale: 100 })} title="Back to centered full-frame" style={{ background: 'transparent', border: '1px solid var(--ui-border2)', color: C.muted, borderRadius: 6, padding: '3px 9px', fontSize: 10, fontWeight: 800, cursor: 'pointer' }}>Reset</button>
                  )}
                </div>
                {[
                  ['Left ↔ Right', media.posX ?? 50, 0, 100, 1, (v) => setMedia({ posX: v }), '%'],
                  ['Top ↕ Bottom', media.posY ?? 50, 0, 100, 1, (v) => setMedia({ posY: v }), '%'],
                  ['Zoom', media.scale ?? 100, 100, 300, 5, (v) => setMedia({ scale: v }), '%'],
                ].map(([lbl, val, min, max, step, fn, unit]) => (
                  <div key={lbl} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <label style={{ fontSize: 10, color: C.faint, fontWeight: 700, width: 72, flexShrink: 0 }}>{lbl}</label>
                    <input type="range" min={min} max={max} step={step} value={val} onChange={(e) => fn(Number(e.target.value))} style={{ flex: 1 }} />
                    <span style={{ fontSize: 11, color: C.muted, width: 40, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{val}{unit}</span>
                  </div>
                ))}
              </div>
            )}
            {/* One-click Sunday setups under framing: name the current media
                setup once, reload it in one tap — desktop or phone. */}
            {cfg.bgType === 'media' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, background: C.elevated, border: '1px solid var(--ui-border2)', borderRadius: 10, padding: '8px 10px' }}>
                <span style={{ fontSize: 10, color: C.faint, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 1 }}>Slideshow templates</span>
                <div style={{ display: 'flex', gap: 6 }}>
                  <input
                    value={tplName}
                    onChange={(e) => setTplName(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') saveCdTemplate(); }}
                    placeholder="Name this setup…"
                    style={{ flex: 1, minWidth: 0, background: C.input, color: C.text, border: '1px solid var(--ui-border2)', borderRadius: 7, padding: '7px 10px', fontSize: 12, outline: 'none' }}
                  />
                  <button onClick={saveCdTemplate} disabled={!tplName.trim()} title="Save the current media setup" style={{ background: tplName.trim() ? ACCENT : C.elevated2, border: 'none', color: tplName.trim() ? '#1C1C1E' : C.muted, borderRadius: 7, padding: '7px 14px', fontSize: 11.5, fontWeight: 800, cursor: tplName.trim() ? 'pointer' : 'default', opacity: tplName.trim() ? 1 : 0.5 }}>Save</button>
                </div>
                {(cdTemplates || []).length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {cdTemplates.map((t) => (
                      <div key={t.name} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <button onClick={() => applyCdTemplate(t)} title="Load this media setup" style={{ flex: 1, minWidth: 0, textAlign: 'left', background: C.elevated2, border: '1px solid var(--ui-border2)', color: C.text, borderRadius: 7, padding: '7px 10px', fontSize: 12, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {t.name}
                          <span style={{ color: C.muted, fontWeight: 600 }}> · {(t.bgMedia || {}).kind === 'video' ? 'video' : `${((t.bgMedia || {}).images || []).length} slides`}</span>
                        </button>
                        <button onClick={() => setCdTemplates((prev) => (prev || []).filter((x) => x.name !== t.name))} title="Delete template" style={{ background: 'transparent', border: 'none', color: '#FF4545', cursor: 'pointer', display: 'flex', padding: 4 }}><X size={13} /></button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
}
