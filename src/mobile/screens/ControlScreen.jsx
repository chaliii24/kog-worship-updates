import React, { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { SkipBack, SkipForward, Type, Square, RotateCcw, Music, Image, MonitorPlay, FileText, Smartphone } from 'lucide-react';
import { stubTap } from '../../lib/anim.js';

const clampText = (s, n) => {
  const t = String(s || '');
  return t.length > n ? t.slice(0, n) + '…' : t;
};

export default function ControlScreen({ C, T, state, status, send, onSwitchRole }) {
  const ACCENT = T.ACCENT;
  const [now, setNow] = useState(Date.now());

  // Tick only while a slide timer is actually running — a phone on an idle
  // screen should not keep waking its CPU.
  const timerRunning = !!(state?.timer?.start);
  useEffect(() => {
    if (!timerRunning) return undefined;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [timerRunning]);

  const live = state?.live || null;
  const cues = state?.song?.cues || [];
  const activeIdx = cues.findIndex(c => c.id === state?.activeCueId);
  const activeCue = activeIdx >= 0 ? cues[activeIdx] : null;
  const nextCue = activeIdx >= 0 ? (cues[activeIdx + 1] || null) : (cues[0] || null);

  const onAir = !!(state?.activeCueId && state?.activeCueId !== 'clear');
  const hasPicture = !!(live && (live.text || live.presentation));
  const deckOnAir = !!(live && live.presentation);

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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100dvh', paddingBottom: 'calc(158px + env(safe-area-inset-bottom))' }}>
      {/* ── STATUS ─────────────────────────────────────────────────────── */}
      <div style={{ padding: 'calc(12px + env(safe-area-inset-top)) 14px 10px', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 11px', borderRadius: 999, fontSize: 11, fontWeight: 900, letterSpacing: 1, background: onAir ? 'rgba(34,197,94,0.15)' : C.elevated2, border: `1px solid ${onAir ? 'rgba(34,197,94,0.4)' : C.border2}`, color: onAir ? '#4ade80' : C.muted }}>
          <span style={{ width: 7, height: 7, borderRadius: '50%', background: onAir ? '#22c55e' : C.faint2, boxShadow: onAir ? '0 0 8px #22c55e' : 'none' }} />
          {onAir ? 'LIVE' : 'CLEARED'}
        </span>

        {total > 0 || timer.start ? (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 10px', borderRadius: 999, fontSize: 11.5, fontWeight: 800, background: C.elevated2, border: `1px solid ${C.border2}`, color: remaining < 15 && total > 0 ? '#f87171' : C.text2, fontVariantNumeric: 'tabular-nums' }}>
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

      <div style={{ padding: '0 14px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {/* ── ON AIR ───────────────────────────────────────────────────── */}
        <div style={{ background: C.elevated, border: `1px solid ${C.border2}`, borderRadius: 16, padding: 14, position: 'relative', overflow: 'hidden' }}>
          <div style={{ position: 'absolute', left: 0, top: 12, bottom: 12, width: 3, borderRadius: 3, background: onAir ? '#22c55e' : C.faint2 }} />
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 8, paddingLeft: 8 }}>
            <span style={{ fontSize: 10, fontWeight: 900, letterSpacing: 1.6, textTransform: 'uppercase', color: C.faint }}>On air</span>
            {deckOnAir && <span style={{ fontSize: 9.5, fontWeight: 900, letterSpacing: 1, color: '#a78bfa', background: 'rgba(139,92,246,0.16)', border: '1px solid rgba(139,92,246,0.4)', padding: '3px 7px', borderRadius: 6 }}>DECK</span>}
          </div>

          {hasPicture ? (
            <p style={{ margin: '0 0 0 8px', fontSize: 21, lineHeight: 1.35, fontWeight: 800, whiteSpace: 'pre-line', maxHeight: 168, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 6, WebkitBoxOrient: 'vertical' }}>
              {deckOnAir && !live.text ? 'Presentation slide is on air' : live.text}
            </p>
          ) : (
            <div style={{ marginLeft: 8, display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'flex-start' }}>
              <span style={{ fontSize: 15, fontWeight: 800, color: C.muted }}>{onAir ? 'Background only — no lyrics' : 'Output is cleared'}</span>
              {onAir ? (
                <button onClick={() => send('reassert')} style={{ background: ACCENT, border: 'none', color: '#fff', borderRadius: 10, padding: '11px 18px', fontSize: 14, fontWeight: 800, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 7, fontFamily: 'inherit' }}>
                  <RotateCcw size={15} /> Put the slide back
                </button>
              ) : (
                <span style={{ fontSize: 12.5, color: C.faint, lineHeight: 1.5 }}>Tap a section below, or press Next to continue.</span>
              )}
            </div>
          )}
        </div>

        {/* ── NEXT ─────────────────────────────────────────────────────── */}
        <div style={{ background: C.panel, border: `1px solid ${C.border2}`, borderRadius: 16, padding: 13 }}>
          <div style={{ fontSize: 10, fontWeight: 900, letterSpacing: 1.6, textTransform: 'uppercase', color: C.faint, marginBottom: 7 }}>Next</div>
          {nextCue ? (
            <>
              <div style={{ fontSize: 11.5, fontWeight: 900, color: ACCENT, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 5 }}>{nextCue.label}</div>
              <p style={{ margin: 0, fontSize: 15, lineHeight: 1.4, fontWeight: 600, color: C.text2, whiteSpace: 'pre-line', maxHeight: 84, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 4, WebkitBoxOrient: 'vertical' }}>{clampText(nextCue.text, 220)}</p>
            </>
          ) : (
            <span style={{ fontSize: 13.5, color: C.faint }}>{state?.song ? 'End of song — press Next for the next item.' : 'No song loaded.'}</span>
          )}
        </div>

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
                      background: active ? 'rgba(59,130,246,0.16)' : C.elevated,
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
      </div>

      {/* ── TRANSPORT (fixed, thumb zone) ───────────────────────────── */}
      <div style={{ position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 50, background: C.panel, borderTop: `1px solid ${C.border2}`, padding: '10px 12px calc(10px + env(safe-area-inset-bottom))', display: 'flex', flexDirection: 'column', gap: 8, boxShadow: '0 -12px 32px rgba(0,0,0,0.35)' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '0.8fr 1.2fr 1.2fr', gap: 8 }}>
          <motion.button {...stubTap} onClick={() => send('clearLyrics')} style={{ ...railBtn(C), color: '#60a5fa', borderColor: 'rgba(59,130,246,0.45)', background: 'rgba(59,130,246,0.10)' }}>
            <Type size={17} /> Lyrics
          </motion.button>
          <motion.button {...stubTap} onClick={() => send('clearAll')} style={{ ...railBtn(C), color: '#f87171', borderColor: 'rgba(239,68,68,0.45)', background: 'rgba(239,68,68,0.10)' }}>
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
          <motion.button {...stubTap} onClick={() => send('next')} style={{ ...bigBtn(C), background: ACCENT, color: '#fff', border: `1px solid ${ACCENT}` }}>
            Next <SkipForward size={22} />
          </motion.button>
        </div>
        <div style={{ textAlign: 'center', fontSize: 9.5, fontWeight: 700, letterSpacing: 0.6, color: status === 'online' ? C.faint2 : '#f87171', paddingTop: 1 }}>
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
  const icon = item.item_type === 'song' ? <Music size={13} /> : item.item_type === 'media' ? <Image size={13} /> : item.item_type === 'presentation' ? <MonitorPlay size={13} /> : <FileText size={13} />;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 9, background: isLive ? 'rgba(34,197,94,0.10)' : C.elevated, border: `1px solid ${isLive ? 'rgba(34,197,94,0.5)' : C.border2}`, borderRadius: 12, padding: '9px 11px', position: 'relative', overflow: 'hidden' }}>
      {isLive && <span style={{ position: 'absolute', left: 0, top: 4, bottom: 4, width: 3, borderRadius: 3, background: '#22c55e' }} />}
      <span style={{ color: isLive ? '#22c55e' : C.faint, display: 'flex', flexShrink: 0 }}>{icon}</span>
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
          background: isLive ? 'rgba(239,68,68,0.16)' : ACCENT,
          border: `1px solid ${isLive ? 'rgba(239,68,68,0.5)' : ACCENT}`,
          color: isLive ? '#f87171' : '#fff',
        }}
      >{isLive ? 'Stop' : 'Go'}</motion.button>
    </div>
  );
}

const railBtn = (C) => ({
  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
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
