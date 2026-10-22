import React, { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { SkipBack, SkipForward, Type, Square, RotateCcw, Music, Image, MonitorPlay, Monitor, FileText, Smartphone, BookOpen, Clock, Play, Eraser, Megaphone, PenLine } from 'lucide-react';
import { stubTap } from '../../lib/anim.js';
import { computeCountdown, DEFAULT_COUNTDOWN } from '../../components/CountdownFace.jsx';
import MiniSlide from './MiniSlide.jsx';
import BibleScreen from './BibleScreen.jsx';
import DrawScreen from './DrawScreen.jsx';

export default function ControlScreen({ C, T, state, status, send, onSwitchRole }) {
  const ACCENT = T.ACCENT;
  const [now, setNow] = useState(Date.now());
  // Top-level view switch: lyrics control vs countdown control.
  const [tab, setTab] = useState('lyrics');
  const [sermonJump, setSermonJump] = useState('');
  // Audience message overlay: text-only from here (uploads stay desktop-side).
  const [msgText, setMsgText] = useState('');
  const [msgStyle, setMsgStyle] = useState('lower');
  const [msgSecs, setMsgSecs] = useState(10);
  const ovLive = state?.overlay || null;

  // STAGE ROLE: same device-local choice as the Stage screen (one shared
  // key), so a singer can switch roles here without swiping over — the
  // Stage view reads it on next render.
  const [stageRole, setStageRole] = useState(() => {
    try { return localStorage.getItem('kog_stage_role') || 'follow'; } catch { return 'follow'; }
  });
  const pickStageRole = (id) => {
    setStageRole(id);
    try { localStorage.setItem('kog_stage_role', id); } catch { /* private mode */ }
  };

  // Tick only while something visibly moves — a phone on an idle screen
  // should not keep waking its CPU.
  const cd = { ...DEFAULT_COUNTDOWN, ...(state?.countdown || {}) };
  const cdLive = !!cd.live;
  // Fresh clock on Go Live: `now` goes stale while idle (nothing ticks), so
  // the first paint after firing would compute against a minutes-old stamp
  // and flash a garbage number before the interval catches up.
  useEffect(() => { if (cdLive) setNow(Date.now()); }, [cdLive]);
  // Wall-clock preview ticks even idle (it IS the content); countdowns tick
  // only while on air.
  const cdTicking = cdLive || cd.mode === 'clock';
  const timerRunning = !!(state?.timer?.start) || cdTicking;
  // Clock skew: the phone's clock can sit seconds off the computer's, which
  // reads as permanent countdown lag. Every snapshot carries the desktop's
  // stamp (state.at), so measure the offset on arrival and apply it — both
  // screens then derive the same remaining time from the same endsAt.
  const skewRef = React.useRef(0);
  React.useEffect(() => {
    if (state?.at) skewRef.current = state.at - Date.now();
  }, [state?.at]);
  useEffect(() => {
    if (!timerRunning) return undefined;
    // 500ms while the countdown moves (matches the desktop face) so both
    // flip seconds together; the slide timer is fine at 1s.
    const id = setInterval(() => setNow(Date.now()), cdTicking ? 500 : 1000);
    return () => clearInterval(id);
  }, [timerRunning, cdTicking]);

  const live = state?.live || null;
  const cues = state?.song?.cues || [];
  const activeIdx = cues.findIndex(c => c.id === state?.activeCueId);
  const activeCue = activeIdx >= 0 ? cues[activeIdx] : null;
  const nextCue = activeIdx >= 0 ? (cues[activeIdx + 1] || null) : (cues[0] || null);

  const onAir = !!(state?.activeCueId && state?.activeCueId !== 'clear');
  const hasPicture = !!(live && (live.text || live.presentation));
  const deckOnAir = !!(live && live.presentation);
  // Live-output shape mirrors the desktop panel 1:1: the PROJECTOR's own
  // aspect drives the miniature (a per-output override beats the global
  // default — same as the wall), the same badge value rides on it, and the
  // same transport commands (clear / clear-all / put-back) run underneath.
  const projAspect = (state?.outputs || []).find((o) => o.id === 'projector')?.aspect || state?.outputAspect || '16:9';
  const outAspect = projAspect;
  // Fill means "the whole wall": the phone mirrors it with the wall's real
  // shape, so the mini and the screen are the same picture.
  const outCssAspect = String(outAspect).toLowerCase() === 'fill'
    ? (state?.wallAspect || '16 / 9')
    : String(outAspect).replace(':', ' / ');

  const uniqueLabels = [];
  cues.forEach(c => { if (c.label && !uniqueLabels.includes(c.label)) uniqueLabels.push(c.label); });

  const serviceItems = (state?.service?.sections || []).flatMap(s => s.items || []);

  // Timer: `start` is a wall-clock stamp, duration is seconds (0 = count up).
  const timer = state?.timer || {};
  const runningSecs = timer.start ? Math.floor((now - timer.start) / 1000) : (timer.elapsed || 0);
  const total = timer.duration || 0;
  const remaining = total > 0 ? Math.max(0, total - runningSecs) : runningSecs;
  const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

  const goLive = (id) => send('cue', { id });
  const goServiceItem = (id, liveNow) => send(liveNow ? 'serviceStop' : 'serviceGo', { id });

  // Countdown control: same handlers as the desktop dock tab.
  const cdSet = (patch) => send('countdownSet', patch);
  const cdShown = computeCountdown(cd, now + skewRef.current);
  const cdOver = !!cdShown.over;
  const cdMins = Math.floor((Number(cd.durationSec) || 0) / 60);
  const cdSecs = (Number(cd.durationSec) || 0) % 60;
  const cdCommitDuration = (m, s) => {
    const mm = Math.max(0, Math.min(999, Math.floor(Number(m) || 0)));
    const ss = Math.max(0, Math.min(59, Math.floor(Number(s) || 0)));
    cdSet({ durationSec: mm * 60 + ss });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100dvh', paddingBottom: 'calc(158px + env(safe-area-inset-bottom))' }}>
      {/* ── STATUS ─────────────────────────────────────────────────────── */}
      <div style={{ padding: 'calc(12px + env(safe-area-inset-top)) 14px 10px', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 11px', borderRadius: 999, fontSize: 11, fontWeight: 900, letterSpacing: 1, background: onAir ? 'rgba(54,201,130,0.15)' : C.elevated2, border: `1px solid ${onAir ? 'rgba(54,201,130,0.4)' : C.border2}`, color: onAir ? '#36C982' : C.muted }}>
          <span style={{ width: 7, height: 7, borderRadius: '50%', background: onAir ? '#36C982' : C.faint2, boxShadow: onAir ? '0 0 8px #36C982' : 'none' }} />
          {onAir ? 'LIVE' : 'CLEARED'}
        </span>

        {total > 0 || timer.start ? (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 10px', borderRadius: 999, fontSize: 11.5, fontWeight: 800, background: C.elevated2, border: `1px solid ${C.border2}`, color: remaining < 15 && total > 0 ? '#FF4545' : C.text2, fontVariantNumeric: 'tabular-nums' }}>
            {total > 0 ? `${fmt(remaining)} left` : fmt(runningSecs)}
          </span>
        ) : null}

        <span style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 800, color: C.accLine, background: 'transparent', border: 'none', cursor: 'pointer', padding: 6 }} onClick={() => onSwitchRole('stage')}>
          <Smartphone size={14} /> Singer view
        </span>
      </div>

      {/* Song / section context */}
      <div style={{ padding: '0 14px 10px', display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <span style={{ fontSize: 16, fontWeight: 900, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '62%' }}>{live?.title || state?.song?.title || 'Nothing loaded'}</span>
        <span style={{ fontSize: 12, fontWeight: 800, color: ACCENT, textTransform: 'uppercase', letterSpacing: 1 }}>{activeCue?.label || live?.label || ''}</span>
      </div>

      {/* Top tabs in service flow: Lyrics → Bible → Countdown → Presentation
          → Message → Draw → Outputs. Transport stays fixed below. */}
      <div style={{ padding: '0 14px 10px', display: 'flex', gap: 6, overflowX: 'auto' }}>
        {[['lyrics', 'Lyrics', Music], ['bible', 'Bible', BookOpen], ['countdown', 'Countdown', Clock], ['presentation', 'Presentation', MonitorPlay], ['message', 'Message', Megaphone], ['draw', 'Draw', PenLine], ['outputs', 'Outputs', Monitor]].map(([v, lbl, Icon]) => (
          <button
            key={v}
            onClick={() => setTab(v)}
            style={{ flex: '1 0 76px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, borderRadius: 10, padding: '10px 0', fontSize: 11.5, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit', background: tab === v ? ACCENT : C.elevated2, border: `1px solid ${tab === v ? ACCENT : C.border2}`, color: tab === v ? '#0D1014' : C.muted, minWidth: 0, whiteSpace: 'nowrap' }}
          ><Icon size={13} /> {lbl}{v === 'countdown' && cdLive ? <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#36C982', boxShadow: '0 0 6px #36C982' }} /> : null}{v === 'presentation' && state?.sermon?.loaded ? <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#36C982', boxShadow: '0 0 6px #36C982' }} /> : null}{v === 'message' && state?.overlay ? <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#36C982', boxShadow: '0 0 6px #36C982' }} /> : null}{v === 'draw' && state?.draw ? <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#FFC72C', boxShadow: '0 0 6px #FFC72C' }} /> : null}{v === 'outputs' && onAir ? <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#36C982', boxShadow: '0 0 6px #36C982' }} /> : null}</button>
        ))}
        {state?.song ? (
          <button
            onClick={() => send('clearWorkspace')}
            title="Clear canvas — unload this song (live output untouched)"
            style={{ flex: '0 0 68px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: 10, padding: '10px 0', fontSize: 12, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit', background: C.elevated2, border: `1px solid ${C.border2}`, color: C.muted }}
          ><Eraser size={14} /> Clear</button>
        ) : null}
      </div>

      {/* STAGE ROLE ROW: mirrors the chip row on the Stage screen (shared
          localStorage key). Handy on shared Control phones — switch role
          here, then hop to Singer view already set. */}
      <div style={{ padding: '0 14px 10px', display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ fontSize: 10, fontWeight: 900, letterSpacing: 1, textTransform: 'uppercase', color: C.muted, flexShrink: 0 }}>Stage role</span>
        <div style={{ display: 'flex', gap: 5, flex: 1, minWidth: 0 }}>
          {[['follow', 'Follow'], ['pastor', 'Pastor'], ['worship', 'Worship'], ['drummer', 'Drummer']].map(([id, lbl]) => {
            const on = stageRole === id;
            return (
              <button
                key={id}
                onClick={() => pickStageRole(id)}
                style={{ flex: 1, minWidth: 0, background: on ? ACCENT : C.elevated2, border: `1px solid ${on ? ACCENT : C.border2}`, color: on ? '#0D1014' : C.muted, borderRadius: 999, padding: '5px 0', fontSize: 9.5, fontWeight: 900, letterSpacing: 0.5, textTransform: 'uppercase', cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap', overflow: 'hidden' }}
              >
                {lbl}
              </button>
            );
          })}
        </div>
      </div>

      <div style={{ padding: '0 14px', display: 'flex', flexDirection: 'column', gap: 12 }}>
      {tab === 'lyrics' ? (<>
        {/* ── ON AIR : actual miniature of the projection ─────────────── */}
        <div style={{ background: C.elevated, border: `1px solid ${onAir ? 'rgba(54,201,130,0.4)' : C.border2}`, borderRadius: 16, padding: 14, position: 'relative', overflow: 'hidden' }}>
          {onAir && <div style={{ position: 'absolute', left: 0, top: 12, bottom: 12, width: 3, borderRadius: 3, background: '#36C982' }} />}
          {hasPicture || live?.timer ? (
            <MiniSlide
              C={C}
              text={live?.text || ''}
              style={live?.style || null}
              timer={live?.timer || null}
              presentation={deckOnAir ? live.presentation : null}
              aspect={outCssAspect}
              aspectBadge={outAspect}
              badge={`Current${live?.label ? ` · ${live.label}` : ''}`}
              draw={state?.draw?.strokes || null}
            />
          ) : (
            <div style={{ marginLeft: 8, display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'flex-start' }}>
              <span style={{ fontSize: 15, fontWeight: 800, color: C.muted }}>{onAir ? 'Background only — no lyrics' : 'Output is cleared'}</span>
              {onAir ? (
                <button onClick={() => send('reassert')} style={{ background: ACCENT, border: 'none', color: '#0D1014', borderRadius: 10, padding: '11px 18px', fontSize: 14, fontWeight: 800, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 7, fontFamily: 'inherit' }}>
                  <RotateCcw size={15} /> Put the slide back
                </button>
              ) : (
                <span style={{ fontSize: 12.5, color: C.faint, lineHeight: 1.5 }}>Tap a section below, or press Next to continue.</span>
              )}
            </div>
          )}
        </div>

        {/* ── NEXT : miniature of the coming slide ─────────────────────── */}
        <div style={{ background: C.panel, border: `1px solid ${C.border2}`, borderRadius: 16, padding: 13 }}>
          {nextCue ? (
            <>
              <MiniSlide
                C={C}
                text={nextCue.text || ''}
                style={live?.style || null}
                timer={null}
                presentation={null}
                aspect={outCssAspect}
                aspectBadge={outAspect}
                badge={`Next · ${nextCue.label || ''}`}
              />
              <div style={{ display: 'flex', justifyContent: 'center', marginTop: 9 }}>
                <button
                  onClick={() => send('next')}
                  title="Fire the next slide"
                  style={{ width: 38, height: 38, borderRadius: '50%', background: C.elevated2, border: `1px solid ${C.border2}`, color: C.text2, fontSize: 17, fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'inherit' }}
                >↓</button>
              </div>
            </>
          ) : (
            <span style={{ fontSize: 13.5, color: C.faint }}>{state?.song ? 'End of song — press Next for the next item.' : 'No song loaded.'}</span>
          )}
        </div>

      </>) : null}
      {tab === 'bible' ? (<>
        <BibleScreen C={C} ACCENT={ACCENT} state={state} send={send} />
      </>) : null}
      {tab === 'draw' ? (<>
        <DrawScreen C={C} ACCENT={ACCENT} state={state} send={send} />
      </>) : null}
      {tab === 'countdown' ? (<>
        {/* ── COUNTDOWN ──────────────────────────────────────────────── */}
        <div style={{ background: C.elevated, border: `1px solid ${cdLive ? 'rgba(54,201,130,0.5)' : C.border2}`, borderRadius: 16, padding: 14, position: 'relative', overflow: 'hidden' }}>
          {cdLive && <span style={{ position: 'absolute', left: 0, top: 10, bottom: 10, width: 3, borderRadius: 3, background: '#36C982' }} />}
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 8 }}>
            <Clock size={13} color={cdLive ? '#36C982' : C.faint} />
            <span style={{ fontSize: 10, fontWeight: 900, letterSpacing: 1.6, textTransform: 'uppercase', color: C.faint }}>Countdown</span>
            {cdLive && <span style={{ fontSize: 9.5, fontWeight: 900, letterSpacing: 1, color: '#36C982', background: 'rgba(54,201,130,0.15)', border: '1px solid rgba(54,201,130,0.4)', padding: '2px 7px', borderRadius: 6 }}>LIVE</span>}
          </div>

          <div style={{ fontSize: 12.5, fontWeight: 800, color: C.text2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{cd.title || 'Countdown'}</div>
          <div style={{ fontSize: 44, fontWeight: 900, color: cdOver && cd.overtime ? '#FF4545' : C.text, fontVariantNumeric: 'tabular-nums', lineHeight: 1.15 }}>
            {cdShown.display}{cdShown.suffix ? <span style={{ fontSize: 13, color: C.muted }}> {cdShown.suffix}</span> : null}
          </div>
          {cd.subtext ? <div style={{ fontSize: 12, color: C.muted, marginBottom: 2 }}>{cd.subtext}</div> : null}

          <motion.button
            {...stubTap}
            onClick={() => send(cdLive ? 'countdownStop' : 'countdownGo')}
            style={{
              width: '100%', marginTop: 8, borderRadius: 11, padding: '12px 0', fontSize: 15, fontWeight: 900, cursor: 'pointer',
              fontFamily: 'inherit', touchAction: 'manipulation', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
              background: cdLive ? 'rgba(255,69,69,0.16)' : '#36C982',
              border: `1px solid ${cdLive ? 'rgba(255,69,69,0.5)' : '#36C982'}`,
              color: cdLive ? '#FF4545' : '#fff',
            }}
          >{cdLive ? <Square size={15} /> : <Play size={15} />} {cdLive ? 'Stop Timer' : 'Go Live'}</motion.button>

          {/* Full config — mirrors the desktop tab (fonts/background stay desktop-side). */}
          <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
            {[['duration', 'Duration'], ['target', 'Target'], ['clock', 'Clock']].map(([v, lbl]) => (
              <button
                key={v}
                onClick={() => cdSet({ mode: v })}
                style={{ flex: 1, borderRadius: 8, padding: '8px 0', fontSize: 11.5, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit', background: cd.mode === v ? ACCENT : C.elevated2, border: `1px solid ${cd.mode === v ? ACCENT : C.border2}`, color: cd.mode === v ? '#0D1014' : C.muted }}
              >{lbl}</button>
            ))}
          </div>

          {cd.mode === 'duration' && (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8 }}>
                <input key={`m-${cd.durationSec}`} type="number" min={0} max={999} defaultValue={cdMins} onBlur={(e) => cdCommitDuration(e.target.value, cdSecs)} onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }} inputMode="numeric" style={{ ...cdNum(C), textAlign: 'center' }} />
                <span style={cdUnit(C)}>min</span>
                <input key={`s-${cd.durationSec}`} type="number" min={0} max={59} defaultValue={cdSecs} onBlur={(e) => cdCommitDuration(cdMins, e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }} inputMode="numeric" style={{ ...cdNum(C), textAlign: 'center' }} />
                <span style={cdUnit(C)}>sec</span>
              </div>
              <div style={{ display: 'flex', gap: 5, marginTop: 7 }}>
                {[[60, '1m'], [180, '3m'], [300, '5m'], [600, '10m'], [900, '15m'], [1800, '30m']].map(([v, lbl]) => (
                  <button key={v} onClick={() => cdSet({ durationSec: v })} style={{ flex: 1, borderRadius: 6, padding: '7px 0', fontSize: 11, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit', background: Number(cd.durationSec) === v ? ACCENT : C.elevated2, border: `1px solid ${Number(cd.durationSec) === v ? ACCENT : C.border2}`, color: Number(cd.durationSec) === v ? '#0D1014' : C.muted }}>{lbl}</button>
                ))}
              </div>
            </>
          )}

          {cd.mode === 'target' && (
            <input type="time" value={cd.targetTime || ''} onChange={(e) => cdSet({ targetTime: e.target.value })} style={{ ...cdNum(C), width: '100%', marginTop: 8, textAlign: 'center' }} />
          )}

          <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
            {[['both', 'Both'], ['main', 'Main'], ['stage', 'Stage']].map(([v, lbl]) => (
              <button
                key={v}
                onClick={() => cdSet({ showOn: v })}
                style={{ flex: 1, borderRadius: 8, padding: '8px 0', fontSize: 11.5, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit', background: cd.showOn === v ? ACCENT : C.elevated2, border: `1px solid ${cd.showOn === v ? ACCENT : C.border2}`, color: cd.showOn === v ? '#0D1014' : C.muted }}
              >{lbl}</button>
            ))}
          </div>

          {(state?.countdown?.templates || []).length > 0 && (
            <div style={{ marginTop: 8 }}>
              <div style={{ fontSize: 10, fontWeight: 900, letterSpacing: 1.4, textTransform: 'uppercase', color: C.faint, marginBottom: 6 }}>Slideshow setups</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                {(state.countdown.templates || []).map((t) => (
                  <button
                    key={t.name}
                    onClick={() => cdSet({ bgType: 'media', bgMedia: t.bgMedia })}
                    style={{ textAlign: 'left', borderRadius: 8, padding: '9px 11px', fontSize: 12.5, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit', background: C.elevated2, border: `1px solid ${C.border2}`, color: C.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
                  >{t.name}
                    <span style={{ color: C.muted, fontWeight: 600 }}> · {t.kind === 'video' ? 'video' : `${t.slides || 0} slides`}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
            <input key={`cdt-${cd.title || ''}`} defaultValue={cd.title || ''} onBlur={(e) => { if (e.target.value !== (cd.title || '')) cdSet({ title: e.target.value }); }} placeholder="Title" style={{ ...cdNum(C), flex: 1, minWidth: 0 }} />
            <input key={`cds-${cd.subtext || ''}`} defaultValue={cd.subtext || ''} onBlur={(e) => { if (e.target.value !== (cd.subtext || '')) cdSet({ subtext: e.target.value }); }} placeholder="Subtext" style={{ ...cdNum(C), flex: 1, minWidth: 0 }} />
          </div>

          {cd.mode !== 'clock' && (
            <label style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 9, fontSize: 12, fontWeight: 700, color: C.text2, cursor: 'pointer' }}>
              <input type="checkbox" checked={!!cd.overtime} onChange={(e) => cdSet({ overtime: e.target.checked })} />
              Overtime past 0:00
            </label>
          )}
        </div>
      </>) : null}
      {tab === 'message' ? (<>
        {/* ── MESSAGE OVERLAY (audience text above the slide) ─────────────── */}
        <div style={{ background: C.elevated, border: `1px solid ${ovLive ? 'rgba(54,201,130,0.5)' : C.border2}`, borderRadius: 16, padding: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 8 }}>
            <Megaphone size={13} color={ovLive ? '#36C982' : C.faint} />
            <span style={{ fontSize: 10, fontWeight: 900, letterSpacing: 1.6, textTransform: 'uppercase', color: C.faint }}>Message</span>
            {ovLive && <span style={{ fontSize: 9.5, fontWeight: 900, letterSpacing: 1, color: '#36C982', background: 'rgba(54,201,130,0.15)', border: '1px solid rgba(54,201,130,0.4)', padding: '2px 7px', borderRadius: 6 }}>LIVE</span>}
          </div>
          {ovLive && (ovLive.text || ovLive.media) ? (
            <div style={{ fontSize: 13, fontWeight: 700, color: C.text2, marginBottom: 8, lineHeight: 1.5 }}>
              “{ovLive.text || 'Image bug on the wall'}”
            </div>
          ) : null}
          <input
            value={msgText}
            onChange={(e) => setMsgText(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && msgText.trim()) { send('overlayShow', { text: msgText.trim(), style: msgStyle, secs: msgSecs }); setMsgText(''); } }}
            placeholder="Welcome home! …"
            style={{ width: '100%', boxSizing: 'border-box', background: C.elevated2, border: `1px solid ${C.border2}`, borderRadius: 9, color: C.text, fontSize: 14, fontWeight: 600, padding: '11px 12px', outline: 'none', fontFamily: 'inherit' }}
          />
          <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
            {[['lower', 'Lower'], ['center', 'Center'], ['banner', 'Banner']].map(([v, lbl]) => (
              <button key={v} onClick={() => setMsgStyle(v)} style={{ flex: 1, borderRadius: 8, padding: '8px 0', fontSize: 11.5, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit', background: msgStyle === v ? ACCENT : C.elevated2, border: `1px solid ${msgStyle === v ? ACCENT : C.border2}`, color: msgStyle === v ? '#0D1014' : C.muted }}>{lbl}</button>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
            {[[10, '10s'], [30, '30s'], [0, 'Pinned']].map(([v, lbl]) => (
              <button key={lbl} onClick={() => setMsgSecs(v)} style={{ flex: 1, borderRadius: 8, padding: '8px 0', fontSize: 11.5, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit', background: msgSecs === v ? ACCENT : C.elevated2, border: `1px solid ${msgSecs === v ? ACCENT : C.border2}`, color: msgSecs === v ? '#0D1014' : C.muted }}>{lbl}</button>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
            <motion.button {...stubTap} onClick={() => { if (msgText.trim()) { send('overlayShow', { text: msgText.trim(), style: msgStyle, secs: msgSecs }); setMsgText(''); } }} style={{ flex: 1.4, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, background: msgText.trim() ? ACCENT : C.elevated2, border: `1px solid ${msgText.trim() ? ACCENT : C.border2}`, color: msgText.trim() ? '#0D1014' : C.muted, borderRadius: 10, padding: '12px 0', fontSize: 14, fontWeight: 900, cursor: 'pointer', fontFamily: 'inherit' }}>
              <Megaphone size={15} /> Show
            </motion.button>
            {ovLive && (
              <motion.button {...stubTap} onClick={() => send('overlayClear')} style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, background: 'rgba(255,69,69,0.12)', border: '1px solid rgba(255,69,69,0.4)', color: '#FF4545', borderRadius: 10, padding: '12px 0', fontSize: 14, fontWeight: 900, cursor: 'pointer', fontFamily: 'inherit' }}>
                Clear
              </motion.button>
            )}
          </div>
          <div style={{ fontSize: 11, color: C.faint, marginTop: 8, lineHeight: 1.5 }}>Sits above slides · survives Clear Lyrics · dies on Clear All.</div>
        </div>
      </>) : null}
      {tab === 'presentation' ? (<>
        {/* ── PRESENTATION (sermon slides) ─────────────────────────── */}
        {(() => {
          const sm = state?.sermon || null;
          const smEngine = sm?.provider === 'wps' ? 'WPS' : sm?.provider === 'libreoffice' ? 'LIBREOFFICE' : 'SLIDESHOW';
          return (
            <div style={{ background: C.elevated, border: `1px solid ${sm?.loaded && sm?.passthrough ? 'rgba(255,184,0,0.5)' : C.border2}`, borderRadius: 16, padding: 14, position: 'relative', overflow: 'hidden' }}>
              {sm?.loaded && sm?.passthrough && <span style={{ position: 'absolute', left: 0, top: 10, bottom: 10, width: 3, borderRadius: 3, background: '#FFB800' }} />}
              <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 8 }}>
                <MonitorPlay size={13} color={sm?.loaded ? '#36C982' : C.faint} />
                <span style={{ fontSize: 10, fontWeight: 900, letterSpacing: 1.6, textTransform: 'uppercase', color: C.faint }}>Sermon slides</span>
                {sm?.loaded && <span style={{ fontSize: 9.5, fontWeight: 900, letterSpacing: 1, color: sm.passthrough ? '#FFC72C' : '#36C982', background: sm.passthrough ? 'rgba(255,184,0,0.15)' : 'rgba(54,201,130,0.15)', border: `1px solid ${sm.passthrough ? 'rgba(255,184,0,0.4)' : 'rgba(54,201,130,0.4)'}`, padding: '2px 7px', borderRadius: 6 }}>{sm.passthrough ? smEngine : 'LYRICS'}</span>}
              </div>
              {!sm?.loaded ? (
                <span style={{ fontSize: 13.5, color: C.faint, lineHeight: 1.6 }}>No sermon loaded — open a presentation on the computer first, then drive it from here.</span>
              ) : (
                <>
                  <div style={{ fontSize: 14, fontWeight: 800, color: C.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{sm.title || 'Sermon'}</div>
                  <div style={{ fontSize: 26, fontWeight: 900, color: C.text, fontVariantNumeric: 'tabular-nums', margin: '2px 0 8px' }}>
                    {sm.total ? `${sm.index || 1} / ${sm.total}` : `Slide ${sm.index || 1}`}
                  </div>
                  <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
                    {[['kog', 'Lyrics'], ['passthrough', sm?.provider === 'wps' ? 'WPS' : sm?.provider === 'libreoffice' ? 'LibreOffice' : 'Slides']].map(([v, lbl]) => {
                      const on = (sm.passthrough ? 'passthrough' : 'kog') === v;
                      return (
                        <button key={v} onClick={() => send('sermonLayer', { layer: v })} style={{ flex: 1, borderRadius: 8, padding: '9px 0', fontSize: 12, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit', background: on ? ACCENT : C.elevated2, border: `1px solid ${on ? ACCENT : C.border2}`, color: on ? '#0D1014' : C.muted }}>{lbl}</button>
                      );
                    })}
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <motion.button {...stubTap} onClick={() => send('sermonPrev')} style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, background: C.elevated2, border: `1px solid ${C.border2}`, color: C.text, borderRadius: 10, padding: '12px 0', fontSize: 14, fontWeight: 900, cursor: 'pointer', fontFamily: 'inherit' }}>
                      <SkipBack size={18} /> Prev
                    </motion.button>
                    <motion.button {...stubTap} onClick={() => send('sermonNext')} style={{ flex: 1.4, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, background: ACCENT, border: 'none', color: '#0D1014', borderRadius: 10, padding: '12px 0', fontSize: 14, fontWeight: 900, cursor: 'pointer', fontFamily: 'inherit' }}>
                      Next <SkipForward size={18} />
                    </motion.button>
                  </div>
                  <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                    <input value={sermonJump} onChange={(e) => setSermonJump(e.target.value.replace(/\D/g, '').slice(0, 4))} onKeyDown={(e) => { if (e.key === 'Enter' && sermonJump) { send('sermonGoto', { index: Number(sermonJump) }); setSermonJump(''); } }} placeholder="Slide #" inputMode="numeric" style={{ flex: 1, minWidth: 0, background: C.elevated2, border: `1px solid ${C.border2}`, borderRadius: 8, color: C.text, fontSize: 13, fontWeight: 800, padding: '9px 8px', outline: 'none', textAlign: 'center', fontFamily: 'inherit' }} />
                    <button onClick={() => { if (sermonJump) { send('sermonGoto', { index: Number(sermonJump) }); setSermonJump(''); } }} style={{ background: C.elevated2, border: `1px solid ${C.border2}`, color: C.text2, borderRadius: 8, padding: '0 16px', fontSize: 12, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }}>Jump</button>
                  </div>
                  <button onClick={() => send('sermonClose')} style={{ width: '100%', marginTop: 8, background: 'rgba(255,69,69,0.12)', border: '1px solid rgba(255,69,69,0.4)', color: '#FF4545', borderRadius: 9, padding: '10px 0', fontSize: 12.5, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }}>Close presentation</button>
                </>
              )}
            </div>
          );
        })()}
      </>) : null}
      {tab === 'outputs' ? (<>
        {/* ── LIVE OUTPUTS: 1:1 mirror of the desktop Live Output panel ── */}
        <div style={{ background: C.elevated, border: `1px solid ${onAir ? 'rgba(54,201,130,0.4)' : C.border2}`, borderRadius: 16, padding: 14, position: 'relative', overflow: 'hidden' }}>
          {onAir && <div style={{ position: 'absolute', left: 0, top: 12, bottom: 12, width: 3, borderRadius: 3, background: '#36C982' }} />}
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 8 }}>
            <Monitor size={13} color={onAir ? '#36C982' : C.faint} />
            <span style={{ fontSize: 10, fontWeight: 900, letterSpacing: 1.6, textTransform: 'uppercase', color: C.faint }}>Live outputs</span>
            {onAir && <span style={{ fontSize: 9.5, fontWeight: 900, letterSpacing: 1, color: '#36C982', background: 'rgba(54,201,130,0.15)', border: '1px solid rgba(54,201,130,0.4)', padding: '2px 7px', borderRadius: 6 }}>LIVE</span>}
            <span style={{ marginLeft: 'auto', fontSize: 10, fontWeight: 800, color: C.muted, background: C.elevated2, border: `1px solid ${C.border2}`, borderRadius: 6, padding: '3px 8px' }}>{outAspect}</span>
          </div>
          {hasPicture || live?.timer ? (
            <MiniSlide
              C={C}
              text={live?.text || ''}
              style={live?.style || null}
              timer={live?.timer || null}
              presentation={deckOnAir ? live.presentation : null}
              aspect={outCssAspect}
              aspectBadge={outAspect}
              badge={`Current${live?.label ? ` · ${live.label}` : ''}`}
              draw={state?.draw?.strokes || null}
            />
          ) : (
            <div style={{ marginLeft: 8, display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'flex-start' }}>
              <span style={{ fontSize: 15, fontWeight: 800, color: C.muted }}>{onAir ? 'Background only — no lyrics' : 'Output is cleared'}</span>
              {onAir ? (
                <button onClick={() => send('reassert')} style={{ background: ACCENT, border: 'none', color: '#0D1014', borderRadius: 10, padding: '11px 18px', fontSize: 14, fontWeight: 800, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 7, fontFamily: 'inherit' }}>
                  <RotateCcw size={15} /> Put the slide back
                </button>
              ) : (
                <span style={{ fontSize: 12.5, color: C.faint, lineHeight: 1.5 }}>Tap a section below, or press Next to continue.</span>
              )}
            </div>
          )}
          {/* Outputs list mirrors the desktop Outputs modal (read-only here —
              binding displays and editing aspects stays desktop-side). */}
          <div style={{ fontSize: 10, fontWeight: 900, letterSpacing: 1.4, textTransform: 'uppercase', color: C.faint, margin: '12px 0 7px' }}>Outputs</div>
          {(state?.outputs || []).length === 0 ? (
            <div style={{ fontSize: 12.5, color: C.faint, lineHeight: 1.5 }}>No outputs yet — add them under Outputs on the computer.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
              {(state.outputs || []).map((o) => (
                <div key={o.id} style={{ display: 'flex', alignItems: 'center', gap: 9, background: o.enabled ? 'rgba(54,201,130,0.08)' : C.elevated2, border: `1px solid ${o.enabled ? 'rgba(54,201,130,0.4)' : C.border2}`, borderRadius: 11, padding: '9px 11px' }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: o.enabled ? '#36C982' : C.faint2, boxShadow: o.enabled ? '0 0 8px #36C982' : 'none', flexShrink: 0 }} />
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: 'block', fontSize: 13, fontWeight: 800, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{o.name || 'Output'}</span>
                    <span style={{ display: 'block', fontSize: 11, color: C.faint, textTransform: 'capitalize' }}>{o.role || 'lyrics'} · {o.aspect || '16:9'}{o.resolution && o.resolution !== 'native' ? ` · ${o.resolution}` : ''}{o.bound ? '' : ' · unassigned'}</span>
                  </span>
                  <span style={{ fontSize: 9.5, fontWeight: 900, letterSpacing: 1, color: o.enabled ? '#36C982' : C.faint }}>{o.enabled ? 'LIVE' : 'OFF'}</span>
                </div>
              ))}
            </div>
          )}
          {/* Same transport as the desktop panel + fixed rail below. */}
          <div style={{ display: 'flex', gap: 7, marginTop: 10 }}>
            <button onClick={() => send('clearLyrics')} style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, background: 'rgba(255,184,0,0.10)', border: '1px solid rgba(255,184,0,0.45)', color: '#FFC72C', borderRadius: 10, padding: '11px 0', fontSize: 13, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }}>
              <Type size={15} /> Lyrics
            </button>
            <button onClick={() => send('clearAll')} style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, background: 'rgba(255,69,69,0.10)', border: '1px solid rgba(255,69,69,0.45)', color: '#FF4545', borderRadius: 10, padding: '11px 0', fontSize: 13, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }}>
              <Square size={14} /> Clear all
            </button>
          </div>
        </div>
      </>) : null}

      {tab === 'lyrics' ? (<>
        {/* ── SECTION JUMP ─────────────────────────────────────────────── */}
        {uniqueLabels.length > 0 && (
          <div>
            <SectionTitle C={C}>Jump to section</SectionTitle>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
              {uniqueLabels.map(label => {
                const cue = cues.find(c => c.label === label);
                const active = activeCue && cue && activeCue.id === cue.id;
                return (
                  <motion.button
                    key={label}
                    {...stubTap}
                    onClick={() => goLive(cue.id)}
                    style={{
                      background: active ? 'rgba(255,184,0,0.16)' : C.elevated,
                      border: `1px solid ${active ? ACCENT : C.border2}`,
                      color: active ? ACCENT : C.text2,
                      borderRadius: 999, padding: '9px 15px', fontSize: 13, fontWeight: 800,
                      cursor: 'pointer', fontFamily: 'inherit', touchAction: 'manipulation',
                    }}
                  >{label}</motion.button>
                );
              })}
            </div>
          </div>
        )}

        {/* ── SERVICE ORDER ────────────────────────────────────────────── */}
        {serviceItems.length > 0 && (
          <div>
            <SectionTitle C={C}>Service order{state?.service?.name ? ` · ${state.service.name}` : ''}</SectionTitle>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {(state?.service?.sections || []).map((section, si) => (
                <div key={`s-${si}`} style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                  <div style={{ fontSize: 10.5, fontWeight: 900, letterSpacing: 1.5, textTransform: 'uppercase', color: C.faint, marginTop: 4 }}>{section.title}</div>
                  {section.items.map(item => (
                    <ServiceRow key={item.id} item={item} C={C} ACCENT={ACCENT} onGo={goServiceItem} />
                  ))}
                </div>
              ))}
            </div>
          </div>
        )}

        {serviceItems.length === 0 && uniqueLabels.length === 0 && (
          <div style={{ textAlign: 'center', padding: '26px 16px', color: C.faint, fontSize: 13.5, lineHeight: 1.6 }}>
            Nothing to control yet.<br />Load a song or build a service order on the computer.
          </div>
        )}
      </>) : null}
      </div>

      {/* ── TRANSPORT (fixed, thumb zone) ───────────────────────────── */}
      <div style={{ position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 50, background: C.panel, borderTop: `1px solid ${C.border2}`, padding: '10px 12px calc(10px + env(safe-area-inset-bottom))', display: 'flex', flexDirection: 'column', gap: 8, boxShadow: '0 -12px 32px rgba(0,0,0,0.35)' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '0.8fr 1.2fr 1.2fr', gap: 8 }}>
          <motion.button {...stubTap} onClick={() => send('clearLyrics')} style={{ ...railBtn(C), color: '#FFC72C', borderColor: 'rgba(255,184,0,0.45)', background: 'rgba(255,184,0,0.10)' }}>
            <Type size={17} /> Lyrics
          </motion.button>
          <motion.button {...stubTap} onClick={() => send('clearAll')} style={{ ...railBtn(C), color: '#FF4545', borderColor: 'rgba(255,69,69,0.45)', background: 'rgba(255,69,69,0.10)' }}>
            <Square size={16} /> Clear all
          </motion.button>
          <motion.button {...stubTap} onClick={() => send('reassert')} style={{ ...railBtn(C), color: C.text2 }} title="Put the current slide back on air">
            <RotateCcw size={16} /> Back
          </motion.button>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.35fr', gap: 8 }}>
          <motion.button {...stubTap} onClick={() => send('prev')} style={{ ...bigBtn(C), background: C.elevated2, color: C.text, border: `1px solid ${C.border2}` }}>
            <SkipBack size={22} /> Prev
          </motion.button>
          <motion.button {...stubTap} onClick={() => send('next')} style={{ ...bigBtn(C), background: ACCENT, color: '#0D1014', border: `1px solid ${ACCENT}` }}>
            Next <SkipForward size={22} />
          </motion.button>
        </div>
        <div style={{ textAlign: 'center', fontSize: 9.5, fontWeight: 700, letterSpacing: 0.6, color: status === 'online' ? C.faint2 : '#FF4545', paddingTop: 1 }}>
          {status === 'online' ? 'Connected to the computer' : 'Connection unstable'}
        </div>
      </div>
    </div>
  );
}

function SectionTitle({ children, C }) {
  return <div style={{ fontSize: 10, fontWeight: 900, letterSpacing: 1.6, textTransform: 'uppercase', color: C.faint, margin: '4px 0 9px' }}>{children}</div>;
}

function ServiceRow({ item, C, ACCENT, onGo }) {
  const isLive = !!item.live;
  const icon = item.item_type === 'song' ? <Music size={13} /> : item.bible ? <BookOpen size={13} /> : item.item_type === 'media' ? <Image size={13} /> : item.item_type === 'presentation' ? <MonitorPlay size={13} /> : <FileText size={13} />;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 9, background: isLive ? 'rgba(54,201,130,0.10)' : C.elevated, border: `1px solid ${isLive ? 'rgba(54,201,130,0.5)' : C.border2}`, borderRadius: 12, padding: '9px 11px', position: 'relative', overflow: 'hidden' }}>
      {isLive && <span style={{ position: 'absolute', left: 0, top: 4, bottom: 4, width: 3, borderRadius: 3, background: '#36C982' }} />}
      <span style={{ color: isLive ? '#36C982' : C.faint, display: 'flex', flexShrink: 0 }}>{icon}</span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: 'block', fontSize: 13.5, fontWeight: 800, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.title}</span>
        <span style={{ display: 'block', fontSize: 11, color: C.faint, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.subtitle || ''}</span>
      </span>
      <motion.button
        {...stubTap}
        onClick={() => onGo(item.id, isLive)}
        style={{
          flexShrink: 0, borderRadius: 9, padding: '9px 15px', fontSize: 12.5, fontWeight: 900, cursor: 'pointer',
          fontFamily: 'inherit', touchAction: 'manipulation',
          background: isLive ? 'rgba(255,69,69,0.16)' : ACCENT,
          border: `1px solid ${isLive ? 'rgba(255,69,69,0.5)' : ACCENT}`,
          color: isLive ? '#FF4545' : '#fff',
        }}
      >{isLive ? 'Stop' : 'Go'}</motion.button>
    </div>
  );
}

const cdNum = (C) => ({
  background: C.elevated2, border: `1px solid ${C.border2}`, borderRadius: 8,
  color: C.text, fontSize: 13, fontWeight: 800, padding: '9px 8px', outline: 'none',
  fontFamily: 'inherit', minWidth: 0,
});
const cdUnit = (C) => ({ fontSize: 11, color: C.faint, fontWeight: 700 });

const railBtn = (C) => ({  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
  height: 46, borderRadius: 11, cursor: 'pointer', fontFamily: 'inherit',
  fontSize: 13, fontWeight: 800, touchAction: 'manipulation',
  border: `1px solid ${C.border2}`, background: C.elevated2, color: C.text2,
});

const bigBtn = (C) => ({
  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
  height: 58, borderRadius: 14, cursor: 'pointer', fontFamily: 'inherit',
  fontSize: 17, fontWeight: 900, letterSpacing: 0.3, touchAction: 'manipulation',
  boxShadow: '0 6px 18px rgba(0,0,0,0.28)',
});
