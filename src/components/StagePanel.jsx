import React, { useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { MonitorPlay, Timer, Megaphone, QrCode, Palette, Music, PanelRight, Play, Pause, Square, RotateCcw, Power, Radio } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { stubTap } from '../lib/anim';
import StageDisplay from './StageDisplay';
import { LAYOUT_PRESETS, segSeconds, fmtMMSS, trafficState } from '../lib/stageLayout';
import { KEYS } from '../lib/chords';

// The Stage dock tab: a full-width workspace (left tools column closes itself)
// with the role presets, clocks/timers, alerts, formatting, traffic light,
// chord chart editor, flow tracker and the BYOD phone prompter — plus a live
// 16:9 preview that renders the REAL StageDisplay scaled into the box, so the
// panel always shows exactly what the monitor shows.
//
// All config lives in App state (stageCfg) and is pushed to the stage window
// over the stage-config IPC channel; this panel only edits it.

const fieldLabel = (C) => ({ fontSize: 10, color: C.faint, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 1.2, display: 'block', marginBottom: 6 });
const textInput = (C) => ({ width: '100%', background: C.input, color: C.text, border: '1px solid var(--ui-border2)', borderRadius: 8, padding: '8px 11px', fontSize: 13, outline: 'none', boxSizing: 'border-box' });

function Card({ C, ACCENT, title, icon: Icon, children, right }) {
  return (
    <div style={{ background: C.panel, border: '1px solid var(--ui-border2)', borderRadius: 12, padding: '13px 15px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 11 }}>
        {Icon && <Icon size={14} color={ACCENT} />}
        <span style={{ fontSize: 10.5, fontWeight: 800, color: C.faint, textTransform: 'uppercase', letterSpacing: 1.4 }}>{title}</span>
        <span style={{ flex: 1 }} />
        {right}
      </div>
      {children}
    </div>
  );
}

function Chip({ C, ACCENT, on, onClick, children, title }) {
  return (
    <button
      onClick={onClick}
      title={title}
      style={{ background: on ? 'rgba(139,92,246,0.18)' : C.elevated2, border: '1px solid ' + (on ? 'rgba(139,92,246,0.55)' : 'var(--ui-border2)'), color: on ? '#C4B5FD' : C.muted, borderRadius: 999, padding: '5px 11px', fontSize: 11, fontWeight: 800, cursor: 'pointer', whiteSpace: 'nowrap' }}
    >
      {children}
    </button>
  );
}

function Segmented({ C, ACCENT, options, value, onPick }) {
  return (
    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
      {options.map(([v, lbl, Icon]) => {
        const selected = value === v;
        return (
          <button
            key={v}
            onClick={() => onPick(v)}
            style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, background: selected ? ACCENT : C.elevated2, border: '1px solid ' + (selected ? ACCENT : 'var(--ui-border2)'), color: selected ? '#fff' : C.muted, borderRadius: 8, padding: '7px 6px', fontSize: 11.5, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}
          >
            {Icon ? <Icon size={13} /> : null}{lbl}
          </button>
        );
      })}
    </div>
  );
}

export default function StagePanel() {
  const {
    C, ACCENT, activeSong, songs, setSongs, setActiveSong,
    stageCfg, setStageCfg, stageFlow, stageSnap,
    countdown, fireCountdownLive, stopCountdownLive,
    outputs, toggleStageWindow, rightOpen, setRightOpen, setDockTab,
  } = useApp();

  const cfg = stageCfg;
  const set = (patch) => setStageCfg((prev) => ({ ...prev, ...patch }));
  const stageOut = outputs.find((o) => o.id === 'stage');
  const stageOn = !!stageOut?.enabled;

  // 1s tick for the panel readouts (segment timer, alert countdown, clock).
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  // --- layout presets + module toggles ------------------------------------
  const applyPreset = (name) => {
    const { label, ...flags } = LAYOUT_PRESETS[name] || {};
    setStageCfg((prev) => ({ ...prev, layout: name, ...flags }));
  };
  const toggleFlag = (key) => setStageCfg((prev) => ({ ...prev, [key]: !prev[key], layout: 'custom' }));

  // --- segment timer -------------------------------------------------------
  const seg = cfg.segment;
  const segSecs = segSeconds(seg);
  // Typed-but-never-started label ≠ a running segment (no 0:00, no Resume).
  const segActive = !!(seg && (seg.running || seg.remain != null));
  const startSeg = (durationSec, countUp) => {
    const t = Date.now();
    setStageCfg((prev) => ({
      ...prev,
      segment: countUp
        ? { label: (prev.segment && prev.segment.label) || 'Segment', countUp: true, startedAt: t, running: true, remain: null }
        : { label: (prev.segment && prev.segment.label) || 'Segment', durationSec, startedAt: t, endsAt: t + durationSec * 1000, running: true, remain: null },
    }));
  };
  const pauseSeg = () => {
    if (!seg || !seg.running) return;
    const remain = segSeconds(seg);
    setStageCfg((prev) => ({ ...prev, segment: { ...prev.segment, running: false, remain, endsAt: null } }));
  };
  const resumeSeg = () => {
    if (!seg || seg.running || seg.remain == null) return;
    const t = Date.now();
    const remain = Math.max(0, seg.remain || 0);
    setStageCfg((prev) => ({
      ...prev,
      segment: seg.countUp
        ? { ...prev.segment, startedAt: t - remain * 1000, running: true, remain: null }
        : { ...prev.segment, endsAt: t + remain * 1000, running: true, remain: null },
    }));
  };

  // --- alert composer ------------------------------------------------------
  const [alertText, setAlertText] = useState('');
  const [alertLevel, setAlertLevel] = useState('info');
  const [alertDur, setAlertDur] = useState(10);
  const flashAlert = () => {
    const text = alertText.trim();
    if (!text) return;
    set({ alert: { text, level: alertLevel, until: alertDur ? Date.now() + alertDur * 1000 : 0 } });
  };
  const alertActive = !!(cfg.alert && cfg.alert.text && (!cfg.alert.until || Date.now() < cfg.alert.until));

  // --- chord chart (per active song, persisted in the DB) ------------------
  const [chart, setChart] = useState('');
  const [chartKey, setChartKey] = useState('C');
  const [chartSaved, setChartSaved] = useState(false);
  useEffect(() => {
    setChart(activeSong?.chord_chart || '');
    setChartKey(activeSong?.chord_key || 'C');
    setChartSaved(false);
  }, [activeSong?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const saveChart = async () => {
    if (!activeSong || !window.require) return;
    try {
      const { ipcRenderer } = window.require('electron');
      await ipcRenderer.invoke('db-set-song-chords', activeSong.id, chart, chartKey);
      setSongs((prev) => (prev || []).map((s) => (s.id === activeSong.id ? { ...s, chord_chart: chart, chord_key: chartKey } : s)));
      setActiveSong((prev) => (prev && prev.id === activeSong.id ? { ...prev, chord_chart: chart, chord_key: chartKey } : prev));
      setChartSaved(true);
      setTimeout(() => setChartSaved(false), 1600);
    } catch { /* main not ready */ }
  };

  // --- BYOD prompter: stage QR + URL (polled like RemoteMenu) -------------
  const [lan, setLan] = useState(null);
  const [copied, setCopied] = useState('');
  useEffect(() => {
    if (!window.require) return undefined;
    const { ipcRenderer } = window.require('electron');
    let live = true;
    const poll = async () => {
      try { const info = await ipcRenderer.invoke('lan-info'); if (live) setLan(info); } catch { /* main not ready */ }
    };
    poll();
    const id = setInterval(poll, 5000);
    return () => { live = false; clearInterval(id); };
  }, []);
  const copyUrl = () => {
    if (!lan?.stageUrl) return;
    navigator.clipboard?.writeText(lan.stageUrl).then(() => {
      setCopied('url');
      setTimeout(() => setCopied(''), 1600);
    }).catch(() => {});
  };
  const act = async (channel) => {
    if (!window.require) return;
    try {
      const { ipcRenderer } = window.require('electron');
      setLan(await ipcRenderer.invoke(channel));
    } catch { /* noop */ }
  };

  // --- live preview: measure the 16:9 box, hand the frame to StageDisplay --
  const prevRef = useRef(null);
  const [frame, setFrame] = useState({ w: 560, h: 315 });
  useEffect(() => {
    const el = prevRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver((entries) => {
      const cr = entries[0].contentRect;
      const fw = Math.max(80, Math.round(cr.width));
      const fh = Math.round((fw * 9) / 16);
      setFrame((prev) => (prev.w === fw && prev.h === fh ? prev : { w: fw, h: fh }));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const now = Date.now();
  const cdLive = !!countdown?.live;
  const cdRemain = cdLive && countdown.live.endsAt ? Math.max(0, (countdown.live.endsAt - now) / 1000) : null;
  const trafficNow = cfg.traffic ? trafficState(now, countdown, seg, cfg.trafficWarn) : null;
  const offset = ((KEYS.indexOf(cfg.playKey) - KEYS.indexOf(chartKey) + 12) % 12);

  const toggleRow = [
    ['clock', 'Clock'],
    ['showNext', 'Next'],
    ['showFlow', 'Flow'],
    ['showChords', 'Chords'],
    ['showAlert', 'Alerts'],
    ['showTimer', 'Timer'],
    ['metronome', 'Metronome'],
    ['traffic', 'Traffic'],
  ];

  return (
    <motion.div key="stage" initial={{ opacity: 0, x: 26 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -26 }} transition={{ type: 'spring', stiffness: 300, damping: 30 }} style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: 'var(--ui-stage)' }}>
      {/* HEADER */}
      <div style={{ padding: '12px 18px 8px 18px', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
        <MonitorPlay size={16} color={stageOn ? '#4ade80' : C.faint} />
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>Stage Display</h2>
        {stageOn && (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'rgba(34,197,94,0.15)', border: '1px solid rgba(34,197,94,0.5)', color: '#4ade80', borderRadius: 999, padding: '3px 10px', fontSize: 10, fontWeight: 800, letterSpacing: 1 }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#22c55e', boxShadow: '0 0 8px #22c55e' }} /> OPEN
          </span>
        )}
        <span style={{ flex: 1 }} />
        <button
          onClick={() => setRightOpen((v) => !v)}
          title={rightOpen ? 'Hide the Live Output sidebar' : 'Show the Live Output sidebar'}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: rightOpen ? 'rgba(139,92,246,0.16)' : 'transparent', border: '1px solid ' + (rightOpen ? 'rgba(139,92,246,0.5)' : 'var(--ui-border2)'), color: rightOpen ? '#C4B5FD' : C.muted, borderRadius: 8, padding: '6px 11px', fontSize: 11, fontWeight: 800, cursor: 'pointer', whiteSpace: 'nowrap' }}
        >
          <PanelRight size={13} /> Live Output
        </button>
        <motion.button
          {...stubTap}
          onClick={toggleStageWindow}
          title={stageOn ? 'Close the stage window' : 'Open the stage window on the configured display'}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: stageOn ? 'rgba(239,68,68,0.14)' : ACCENT, border: '1px solid ' + (stageOn ? 'rgba(239,68,68,0.5)' : ACCENT), color: stageOn ? '#f87171' : '#fff', borderRadius: 8, padding: '6px 13px', fontSize: 11.5, fontWeight: 800, cursor: 'pointer', whiteSpace: 'nowrap' }}
        >
          <Power size={13} /> {stageOn ? 'Close Stage Window' : 'Open Stage Window'}
        </motion.button>
      </div>

      {/* BODY: controls (left, scroll) + preview/QR column (right) */}
      <div style={{ flex: 1, display: 'flex', gap: 14, padding: '0 18px 16px 18px', overflow: 'hidden', minHeight: 0 }}>
        <div style={{ flex: 1, minWidth: 0, overflowY: 'auto', display: 'grid', gap: 12, alignContent: 'start', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', paddingRight: 4 }}>
          {/* ROLE LAYOUTS */}
          <Card C={C} ACCENT={ACCENT} title="Layout (role presets)" icon={MonitorPlay}>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 11 }}>
              {['standard', 'pastor', 'worship', 'drummer'].map((name) => (
                <Chip key={name} C={C} ACCENT={ACCENT} on={cfg.layout === name} onClick={() => applyPreset(name)}>
                  {LAYOUT_PRESETS[name].label}
                </Chip>
              ))}
              {cfg.layout === 'custom' && <Chip C={C} ACCENT on>Custom</Chip>}
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {toggleRow.map(([key, label]) => (
                <Chip key={key} C={C} ACCENT={ACCENT} on={!!cfg[key]} onClick={() => toggleFlag(key)} title={`Toggle ${label}`}>
                  {label}
                </Chip>
              ))}
            </div>
            {/* Metronome tempo — the beat pulse on the stage runs at this
                rate (60/bpm seconds per beat), so the drummer preset gets a
                real tempo control instead of a hardcoded default. */}
            {cfg.metronome && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginTop: 11, paddingTop: 10, borderTop: '1px solid var(--ui-border2)' }}>
                <label style={{ fontSize: 10, color: C.faint, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 1.2 }}>Tempo</label>
                <input type="range" min={40} max={220} step={1} value={cfg.bpm} onChange={(e) => set({ bpm: Number(e.target.value) })} style={{ flex: 1, minWidth: 60 }} />
                <input
                  type="number"
                  min={40}
                  max={220}
                  value={cfg.bpm}
                  onChange={(e) => set({ bpm: Math.min(220, Math.max(40, Number(e.target.value) || 96)) })}
                  style={{ ...textInput(C), width: 66, padding: '5px 8px', fontSize: 12, textAlign: 'center' }}
                />
                <span style={{ fontSize: 10, fontWeight: 800, color: C.muted }}>BPM</span>
              </div>
            )}
            <p style={{ margin: '10px 0 0 0', fontSize: 10.5, color: C.faint, lineHeight: 1.5 }}>
              These presets dress <b>the stage monitor</b> (and phones on <b>Follow</b>). Each prompter phone can also pick its own role — Pastor, Worship or Drummer — right on its screen; alerts, clock, traffic and the play key stay shared across all of them.
            </p>
          </Card>

          {/* CLOCKS + TIMERS */}
          <Card C={C} ACCENT={ACCENT} title="Clocks & timers" icon={Timer}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <Chip C={C} ACCENT={ACCENT} on={cfg.clock} onClick={() => toggleFlag('clock')}>Real-time clock</Chip>
              <Segmented C={C} ACCENT={ACCENT} options={[['24', '24h'], ['12', '12h']]} value={cfg.clockFormat} onPick={(v) => set({ clockFormat: v })} />
            </div>

            <label style={fieldLabel(C)}>Pre-service countdown</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <span style={{ fontSize: 15, fontWeight: 900, fontVariantNumeric: 'tabular-nums', color: cdLive ? (cdRemain != null && cdRemain <= 0 ? '#ef4444' : '#4ade80') : C.muted, minWidth: 66 }}>
                {cdLive ? (cdRemain != null ? fmtMMSS(cdRemain) : 'Wall clock') : '—'}
              </span>
              <button
                onClick={() => (cdLive ? stopCountdownLive() : fireCountdownLive())}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: cdLive ? 'rgba(239,68,68,0.14)' : 'rgba(34,197,94,0.14)', border: '1px solid ' + (cdLive ? 'rgba(239,68,68,0.5)' : 'rgba(34,197,94,0.5)'), color: cdLive ? '#f87171' : '#4ade80', borderRadius: 8, padding: '6px 12px', fontSize: 11.5, fontWeight: 800, cursor: 'pointer' }}
              >
                {cdLive ? <Square size={12} /> : <Play size={12} />} {cdLive ? 'Stop' : 'Go Live'}
              </button>
              <button onClick={() => setDockTab('countdown')} style={{ background: 'transparent', border: 'none', color: C.accLine, fontSize: 11, fontWeight: 800, cursor: 'pointer', padding: '4px 6px' }}>Edit…</button>
            </div>

            <label style={fieldLabel(C)}>Segment timer</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8, flexWrap: 'wrap' }}>
              <input
                value={(seg && seg.label) || ''}
                placeholder="Segment label"
                onChange={(e) => setStageCfg((prev) => ({ ...prev, segment: { ...(prev.segment || {}), label: e.target.value } }))}
                style={{ ...textInput(C), width: 150, padding: '6px 10px', fontSize: 12 }}
              />
              <span style={{ fontSize: 17, fontWeight: 900, fontVariantNumeric: 'tabular-nums', color: !segActive ? C.muted : (segSecs <= 0 && !seg.countUp ? '#ef4444' : C.text), minWidth: 62 }}>
                {!segActive ? '—' : (seg.countUp ? `+${fmtMMSS(segSecs)}` : fmtMMSS(segSecs))}
              </span>
              {seg && seg.running && <button onClick={pauseSeg} title="Pause" style={{ background: C.elevated2, border: '1px solid var(--ui-border2)', color: C.muted, borderRadius: 7, padding: '5px 8px', cursor: 'pointer', display: 'flex' }}><Pause size={13} /></button>}
              {seg && !seg.running && seg.remain != null && <button onClick={resumeSeg} title="Resume" style={{ background: C.elevated2, border: '1px solid var(--ui-border2)', color: '#4ade80', borderRadius: 7, padding: '5px 8px', cursor: 'pointer', display: 'flex' }}><Play size={13} /></button>}
              {seg && <button onClick={() => set({ segment: null })} title="Reset" style={{ background: C.elevated2, border: '1px solid var(--ui-border2)', color: C.muted, borderRadius: 7, padding: '5px 8px', cursor: 'pointer', display: 'flex' }}><RotateCcw size={13} /></button>}
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {[5, 10, 15, 20, 30].map((min) => (
                <Chip key={min} C={C} ACCENT={ACCENT} on={false} onClick={() => startSeg(min * 60, false)} title={`Start a ${min}-minute countdown`}>{min}m</Chip>
              ))}
              <Chip C={C} ACCENT={ACCENT} on={false} onClick={() => startSeg(0, true)} title="Count up from zero">Count up</Chip>
            </div>
          </Card>

          {/* STAGE ALERTS */}
          <Card C={C} ACCENT={ACCENT} title="Stage alerts & messaging" icon={Megaphone} right={alertActive ? <span style={{ fontSize: 10, fontWeight: 800, color: cfg.alert.level === 'urgent' ? '#f87171' : '#fbbf24' }}>{cfg.alert.level === 'urgent' ? 'URGENT LIVE' : 'INFO LIVE'}</span> : null}>
            <input
              value={alertText}
              onChange={(e) => setAlertText(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') flashAlert(); }}
              placeholder="e.g. Pastor needs water on stage"
              style={textInput(C)}
            />
            <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <Segmented C={C} ACCENT={ACCENT} options={[['info', 'Info'], ['urgent', 'Urgent']]} value={alertLevel} onPick={setAlertLevel} />
              <span style={{ flex: 1, minWidth: 8 }} />
              <Segmented C={C} ACCENT={ACCENT} options={[[5, '5s'], [10, '10s'], [30, '30s'], [0, 'Hold']]} value={alertDur} onPick={setAlertDur} />
            </div>
            <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
              <motion.button {...stubTap} onClick={flashAlert} style={{ background: ACCENT, border: 'none', color: '#fff', borderRadius: 8, padding: '7px 14px', fontSize: 11.5, fontWeight: 800, cursor: 'pointer' }}>Flash to stage</motion.button>
              <motion.button {...stubTap} onClick={() => set({ alert: null })} style={{ background: C.elevated2, border: '1px solid var(--ui-border2)', color: C.muted, borderRadius: 8, padding: '7px 14px', fontSize: 11.5, fontWeight: 800, cursor: 'pointer' }}>Clear</motion.button>
            </div>
          </Card>

          {/* FORMATTING */}
          <Card C={C} ACCENT={ACCENT} title="High-contrast formatting" icon={Palette}>
            <Segmented
              C={C}
              ACCENT={ACCENT}
              options={[['standard', 'Theme'], ['high-yellow', 'Yellow / black'], ['high-white', 'White / black']]}
              value={cfg.contrast}
              onPick={(v) => set({ contrast: v })}
            />
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 11 }}>
              <label style={{ fontSize: 10, color: C.faint, fontWeight: 700, width: 62, flexShrink: 0 }}>Text size</label>
              <input type="range" min={0.8} max={1.4} step={0.05} value={cfg.textScale} onChange={(e) => set({ textScale: Number(e.target.value) })} style={{ flex: 1 }} />
              <span style={{ fontSize: 11, color: C.muted, width: 44, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{Math.round(cfg.textScale * 100)}%</span>
            </div>
            <p style={{ margin: '9px 0 0 0', fontSize: 10.5, color: C.faint, lineHeight: 1.5 }}>
              Sizes auto-scale to the output resolution. Yellow/white on pure black stays readable from 20+ ft — the confidence-monitor standard.
            </p>
          </Card>

          {/* TRAFFIC LIGHT */}
          <Card C={C} ACCENT={ACCENT} title="Traffic light cues" icon={Radio} right={trafficNow ? <span style={{ width: 14, height: 14, borderRadius: 4, background: trafficNow, display: 'inline-block', boxShadow: `0 0 8px ${trafficNow}` }} /> : null}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 9 }}>
              <Chip C={C} ACCENT={ACCENT} on={cfg.traffic} onClick={() => toggleFlag('traffic')}>Border on</Chip>
              <span style={{ fontSize: 11, color: C.muted }}>{trafficNow ? (trafficNow === '#22c55e' ? 'Green — plenty of time' : trafficNow === '#eab308' ? 'Yellow — wrap up' : 'Red — overtime') : 'No timer running'}</span>
            </div>
            <label style={fieldLabel(C)}>Yellow warning at</label>
            <Segmented
              C={C}
              ACCENT={ACCENT}
              options={[[15, '0:15'], [30, '0:30'], [60, '1:00'], [120, '2:00'], [300, '5:00']]}
              value={cfg.trafficWarn}
              onPick={(v) => set({ trafficWarn: v })}
            />
          </Card>

          {/* SONG FLOW */}
          <Card C={C} ACCENT={ACCENT} title="Song flow tracker" icon={Music} right={stageFlow ? <span style={{ fontSize: 10, fontWeight: 800, color: C.muted }}>{stageFlow.labels.length} parts</span> : null}>
            <div style={{ marginBottom: 9 }}>
              <Chip C={C} ACCENT={ACCENT} on={cfg.showFlow} onClick={() => toggleFlag('showFlow')}>Show on stage</Chip>
            </div>
            {stageFlow && stageFlow.labels.length ? (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, alignItems: 'center' }}>
                {stageFlow.labels.map((l, i) => (
                  <React.Fragment key={`${l}-${i}`}>
                    {i > 0 && <span style={{ color: C.faint2, fontSize: 11, fontWeight: 800 }}>›</span>}
                    <span style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: 0.6, textTransform: 'uppercase', padding: '3px 9px', borderRadius: 999, background: i === stageFlow.index ? ACCENT : C.elevated2, color: i === stageFlow.index ? '#fff' : C.muted, border: '1px solid ' + (i === stageFlow.index ? 'transparent' : 'var(--ui-border2)') }}>{l}</span>
                  </React.Fragment>
                ))}
              </div>
            ) : (
              <p style={{ margin: 0, fontSize: 11, color: C.faint, lineHeight: 1.5 }}>Open a song (or a medley / arrangement) and its parts appear here — the current section highlights live as you fire slides.</p>
            )}
          </Card>

          {/* CHORDS */}
          <Card C={C} ACCENT={ACCENT} title="Chord chart & Nashville" icon={Music} right={activeSong ? <span style={{ fontSize: 10, fontWeight: 800, color: C.muted, maxWidth: 170, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{activeSong.title}</span> : null}>
            {activeSong ? (
              <>
                <textarea
                  value={chart}
                  onChange={(e) => setChart(e.target.value)}
                  placeholder={'Paste the chord chart…\n\nC        G        Am       F\nVerse 1 — Amazing grace…'}
                  rows={7}
                  style={{ ...textInput(C), fontFamily: 'ui-monospace, Consolas, monospace', fontSize: 12, lineHeight: 1.6, resize: 'vertical' }}
                />
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                  <label style={{ fontSize: 10, color: C.faint, fontWeight: 700 }}>Chart key</label>
                  <select value={chartKey} onChange={(e) => setChartKey(e.target.value)} style={{ ...textInput(C), width: 74, padding: '6px 8px', fontSize: 12 }}>
                    {KEYS.map((k) => <option key={k} value={k}>{k}</option>)}
                  </select>
                  <span style={{ flex: 1, minWidth: 8 }} />
                  <motion.button {...stubTap} onClick={saveChart} style={{ background: chartSaved ? 'rgba(34,197,94,0.16)' : ACCENT, border: '1px solid ' + (chartSaved ? 'rgba(34,197,94,0.5)' : ACCENT), color: chartSaved ? '#4ade80' : '#fff', borderRadius: 8, padding: '7px 14px', fontSize: 11.5, fontWeight: 800, cursor: 'pointer' }}>
                    {chartSaved ? 'Saved ✓' : 'Save chart'}
                  </motion.button>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                  <Chip C={C} ACCENT={ACCENT} on={cfg.showChords} onClick={() => toggleFlag('showChords')}>Show on stage</Chip>
                  <label style={{ fontSize: 10, color: C.faint, fontWeight: 700 }}>Play key</label>
                  <select value={cfg.playKey} onChange={(e) => set({ playKey: e.target.value })} style={{ ...textInput(C), width: 74, padding: '6px 8px', fontSize: 12 }}>
                    {KEYS.map((k) => <option key={k} value={k}>{k}</option>)}
                  </select>
                  <Chip C={C} ACCENT={ACCENT} on={cfg.nashville} onClick={() => toggleFlag('nashville')}>Nashville</Chip>
                </div>
                <p style={{ margin: '8px 0 0 0', fontSize: 10.5, color: C.faint, lineHeight: 1.5 }}>
                  {offset ? `Transposing +${offset} semitone${offset === 1 ? '' : 's'} for stage (${chartKey} → ${cfg.playKey}).` : `Stage plays in ${cfg.playKey} — same as the chart.`}
                </p>
              </>
            ) : (
              <p style={{ margin: 0, fontSize: 11, color: C.faint, lineHeight: 1.5 }}>Open a song to attach its chord chart. Charts are stored with the song and transposed live on the stage output.</p>
            )}
          </Card>
        </div>

        {/* RIGHT COLUMN: live preview + BYOD prompter */}
        <div style={{ width: 400, flexShrink: 0, overflowY: 'auto', display: 'grid', gap: 12, alignContent: 'start', paddingRight: 4 }}>
          <div style={{ background: C.panel, border: '1px solid var(--ui-border2)', borderRadius: 12, padding: '13px 15px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <MonitorPlay size={14} color={ACCENT} />
              <span style={{ fontSize: 10.5, fontWeight: 800, color: C.faint, textTransform: 'uppercase', letterSpacing: 1.4 }}>Live preview</span>
              <span style={{ flex: 1 }} />
              <span style={{ fontSize: 10, fontWeight: 800, color: C.muted }}>{stageOn ? 'monitor open' : 'mirror'}</span>
            </div>
            <div ref={prevRef} style={{ position: 'relative', width: '100%', aspectRatio: '16 / 9', overflow: 'hidden', borderRadius: 10, border: '1px solid var(--ui-border2)', background: '#000' }}>
              <StageDisplay
                currentSlide={stageSnap}
                C={C}
                cfg={stageCfg}
                flow={stageFlow}
                chord={activeSong ? { text: activeSong.chord_chart, key: activeSong.chord_key || 'C' } : null}
                frame={frame}
                preview
              />
            </div>
          </div>

          {/* BYOD prompter */}
          <Card C={C} ACCENT={ACCENT} title="Phone prompter (BYOD)" icon={QrCode}>
            <div style={{ display: 'flex', gap: 13 }}>
              <div style={{ flexShrink: 0 }}>
                {lan?.stageQr
                  ? <img src={lan.stageQr} alt="Scan to open the stage view on a phone" style={{ width: 122, height: 122, borderRadius: 8, background: '#13151e' }} />
                  : <div style={{ width: 122, height: 122, borderRadius: 8, background: C.elevated2, display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.faint2, fontSize: 10.5, fontWeight: 800, textAlign: 'center', padding: 8 }}>{lan?.running ? 'QR…' : 'Start remote'}</div>}
              </div>
              <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 7 }}>
                <div style={{ fontSize: 11, color: C.muted, lineHeight: 1.5 }}>
                  Phones join as synced confidence monitors — same current/next lyrics, no app to install.
                </div>
                <div onClick={copyUrl} title="Click to copy" style={{ background: C.input, border: '1px solid var(--ui-border2)', borderRadius: 7, padding: '7px 9px', fontSize: 10.5, fontFamily: 'ui-monospace, Consolas, monospace', color: copied === 'url' ? '#4ade80' : C.text2, wordBreak: 'break-all', cursor: 'pointer' }}>
                  {copied === 'url' ? 'Copied ✓' : (lan?.stageUrl || '—')}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                  <motion.button {...stubTap} onClick={() => act(lan?.running ? 'lan-stop' : 'lan-start')} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: lan?.running ? 'rgba(239,68,68,0.14)' : 'rgba(34,197,94,0.14)', border: '1px solid ' + (lan?.running ? 'rgba(239,68,68,0.5)' : 'rgba(34,197,94,0.5)'), color: lan?.running ? '#f87171' : '#4ade80', borderRadius: 7, padding: '5px 10px', fontSize: 10.5, fontWeight: 800, cursor: 'pointer' }}>
                    <Power size={11} /> {lan?.running ? 'Stop' : 'Start'}
                  </motion.button>
                  <span style={{ fontSize: 10, fontWeight: 700, color: C.faint }}>
                    {lan?.running ? (lan.clients > 0 ? `${lan.clients} phone${lan.clients === 1 ? '' : 's'}` : 'waiting for phones') : 'remote off'}
                  </span>
                </div>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </motion.div>
  );
}
