import React, { useEffect, useRef, useState } from 'react';
import { Clock, Play, Square, Image as ImageIcon } from 'lucide-react';
import { C, T, TXT } from '../theme.js';
import { Screen, SectionLabel, Card, Row, Pill, Dot, Btn, Segmented, Field, CheckRow, EmptyState } from '../ui.jsx';
import { computeCountdown, DEFAULT_COUNTDOWN } from '../../components/CountdownFace.jsx';

// Countdown controller. Calculations, events and desktop sync are untouched:
// the same `countdownGo` / `countdownStop` / `countdownSet` commands, the same
// computeCountdown() face, the same durationSec/targetTime/showOn fields.
export default function CountdownScreen({ state, send }) {
  const cd = { ...DEFAULT_COUNTDOWN, ...(state?.countdown || {}) };
  const cdLive = !!cd.live;
  const [now, setNow] = useState(() => Date.now());

  // Fresh clock on Go Live: `now` goes stale while idle, so the first paint
  // after firing would compute against a minutes-old stamp.
  useEffect(() => { if (cdLive) setNow(Date.now()); }, [cdLive]);
  const ticking = cdLive || cd.mode === 'clock';
  useEffect(() => {
    if (!ticking) return undefined;
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, [ticking]);

  // Clock skew: every snapshot carries the desktop's stamp (state.at), so both
  // screens derive the same remaining time from the same endsAt.
  const skewRef = useRef(0);
  useEffect(() => { if (state?.at) skewRef.current = state.at - Date.now(); }, [state?.at]);

  const cdSet = (patch) => send('countdownSet', patch);
  const shown = computeCountdown(cd, now + skewRef.current);
  const over = !!shown.over && !!cd.overtime;
  const mins = Math.floor((Number(cd.durationSec) || 0) / 60);
  const secs = (Number(cd.durationSec) || 0) % 60;
  const commit = (m, s) => {
    const mm = Math.max(0, Math.min(999, Math.floor(Number(m) || 0)));
    const ss = Math.max(0, Math.min(59, Math.floor(Number(s) || 0)));
    cdSet({ durationSec: mm * 60 + ss });
  };
  const presets = [[60, '1m'], [180, '3m'], [300, '5m'], [600, '10m'], [900, '15m'], [1800, '30m']];
  const templates = state?.countdown?.templates || [];

  return (
    <Screen>
      <Card live={cdLive} tone="live" pad={16}>
        <Row style={{ justifyContent: 'space-between', marginBottom: 10 }}>
          <Row gap={6}>
            <Clock size={14} color={cdLive ? T.SUCCESS : C.faint} />
            <span style={{ ...TXT.label }}>Countdown</span>
            {cdLive ? <Pill tone="live"><Dot tone="success" size={6} pulse /> Live</Pill> : null}
            {cd.live?.pausedAt != null ? <Pill tone="warning">Paused</Pill> : null}
          </Row>
          <Pill tone="neutral">{cd.mode === 'clock' ? 'Clock' : cd.mode === 'target' ? 'Target' : 'Duration'}</Pill>
        </Row>

        <div style={{ textAlign: 'center', padding: '6px 0 10px' }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: C.text2, marginBottom: 2 }}>
            {cd.title || 'Countdown'}
          </div>
          <div
            style={{
              fontSize: 64, lineHeight: 1.02, fontWeight: 900, letterSpacing: -2,
              fontVariantNumeric: 'tabular-nums',
              color: over ? T.ERROR : cdLive ? C.text : C.text2,
            }}
          >
            {shown.display}
          </div>
          {shown.suffix ? <div style={{ fontSize: 13, fontWeight: 800, color: C.faint, marginTop: 2 }}>{shown.suffix}</div> : null}
          {cd.subtext ? <div style={{ fontSize: 12.5, color: C.muted, marginTop: 4 }}>{cd.subtext}</div> : null}
        </div>

        <Btn
          full
          size="lg"
          variant={cdLive ? 'danger' : 'success'}
          icon={cdLive ? <Square size={16} /> : <Play size={17} />}
          onClick={() => send(cdLive ? 'countdownStop' : 'countdownGo')}
          style={{ fontSize: 16, fontWeight: 900 }}
        >
          {cdLive ? 'Stop timer' : 'Go live'}
        </Btn>
        <div style={{ fontSize: 10.5, color: C.faint, textAlign: 'center', marginTop: 8, lineHeight: 1.5 }}>
          Drives the projector and the stage monitors exactly like the desktop tab.
        </div>
      </Card>

      <SectionLabel>Mode</SectionLabel>
      <Segmented
        value={cd.mode}
        onChange={(v) => cdSet({ mode: v })}
        options={[['duration', 'Duration'], ['target', 'Target time'], ['clock', 'Clock']]}
      />

      {cd.mode === 'duration' ? (
        <Card pad={14}>
          <Row gap={8}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <span style={{ ...TXT.label, display: 'block', marginBottom: 5 }}>Minutes</span>
              <Field
                key={`m-${cd.durationSec}`}
                type="number" inputMode="numeric" min={0} max={999}
                defaultValue={mins}
                onBlur={(e) => commit(e.target.value, secs)}
                onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
                style={{ textAlign: 'center', fontSize: 18, fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}
              />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <span style={{ ...TXT.label, display: 'block', marginBottom: 5 }}>Seconds</span>
              <Field
                key={`s-${cd.durationSec}`}
                type="number" inputMode="numeric" min={0} max={59}
                defaultValue={secs}
                onBlur={(e) => commit(mins, e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
                style={{ textAlign: 'center', fontSize: 18, fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}
              />
            </div>
          </Row>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 12 }}>
            {presets.map(([v, label]) => {
              const on = Number(cd.durationSec) === v;
              return (
                <Btn
                  key={v}
                  size="sm"
                  variant={on ? 'primary' : 'quiet'}
                  onClick={() => cdSet({ durationSec: v })}
                  style={{ minWidth: 52, flex: '1 1 52px' }}
                >{label}</Btn>
              );
            })}
          </div>
        </Card>
      ) : null}

      {cd.mode === 'target' ? (
        <Card pad={14}>
          <span style={{ ...TXT.label, display: 'block', marginBottom: 6 }}>Finish at</span>
          <Field
            type="time"
            value={cd.targetTime || ''}
            onChange={(e) => cdSet({ targetTime: e.target.value })}
            style={{ textAlign: 'center', fontSize: 20, fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}
          />
          <div style={{ fontSize: 11, color: C.faint, marginTop: 8, lineHeight: 1.5 }}>
            Counts down to that wall-clock time on the computer.
          </div>
        </Card>
      ) : null}

      {cd.mode !== 'clock' ? (
        <Card pad={10}>
          <CheckRow checked={!!cd.overtime} onChange={(v) => cdSet({ overtime: v })}>
            Keep counting past 0:00 (overtime)
          </CheckRow>
        </Card>
      ) : null}

      <SectionLabel>Show on</SectionLabel>
      <Segmented
        value={cd.showOn}
        onChange={(v) => cdSet({ showOn: v })}
        options={[['both', 'Both'], ['main', 'Main'], ['stage', 'Stage']]}
      />

      <SectionLabel right={templates.length ? <span style={{ ...TXT.meta, fontSize: 10.5 }}>{templates.length}</span> : null}>Look</SectionLabel>
      <Card pad={14}>
        <Row gap={7} style={{ marginBottom: 10 }}>
          <ImageIcon size={13} color={C.faint} />
          <span style={{ fontSize: 12, fontWeight: 700, color: C.text2 }}>
            {cd.bgType === 'media' ? 'Slideshow / video background' : `${cd.bgType || 'gradient'} background`}
          </span>
          <span style={{ marginLeft: 'auto', fontSize: 10.5, color: C.faint, fontWeight: 700 }}>Set on desktop</span>
        </Row>
        {templates.length ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {templates.map((t) => (
              <button
                key={t.name}
                type="button"
                onClick={() => cdSet({ bgType: 'media', bgMedia: t.bgMedia })}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8, minHeight: 44, padding: '0 11px',
                  borderRadius: 10, cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left',
                  background: C.elevated2, border: `1px solid ${C.border}`, color: C.text,
                }}
              >
                <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, fontWeight: 800, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.name}</span>
                <span style={{ fontSize: 10.5, color: C.faint, fontWeight: 700 }}>{t.kind === 'video' ? 'video' : `${t.slides || 0} slides`}</span>
              </button>
            ))}
          </div>
        ) : (
          <EmptyState title="No saved setups" hint="Countdown backdrops and slideshows are created on the computer." style={{ padding: '8px 0' }} />
        )}
      </Card>

      <SectionLabel>Labels</SectionLabel>
      <Card pad={14}>
        <Row gap={8}>
          <Field
            key={`cdt-${cd.title || ''}`}
            defaultValue={cd.title || ''}
            placeholder="Title"
            onBlur={(e) => { if (e.target.value !== (cd.title || '')) cdSet({ title: e.target.value }); }}
          />
          <Field
            key={`cds-${cd.subtext || ''}`}
            defaultValue={cd.subtext || ''}
            placeholder="Subtext"
            onBlur={(e) => { if (e.target.value !== (cd.subtext || '')) cdSet({ subtext: e.target.value }); }}
          />
        </Row>
      </Card>
    </Screen>
  );
}
