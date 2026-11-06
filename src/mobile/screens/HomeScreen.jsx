import React, { useEffect, useState } from 'react';
import {
  Music, BookOpen, Clock, MonitorPlay, PenLine, MessageCircle,
  ChevronRight, Radio, Timer, Server,
} from 'lucide-react';
import { C, T, S, R, TOUCH } from '../theme.js';
import { Screen, SectionLabel, Card, Row, Pill, Dot, Badge, EmptyState } from '../ui.jsx';
import LiveCard from '../components/LiveCard.jsx';
import Transport from '../components/Transport.jsx';
import { liveSummary, slideTimer, fmtClock } from '../live.js';

// Dashboard. Reads the desktop snapshot and offers the five things an operator
// reaches for during a service: what is live, next/prev, jump to a section,
// open a tool, and read the projectionist's reply.
export default function HomeScreen({ state, send, unread, messages, onNavigate, onOpenScreen, onOpenMessages }) {
  const info = liveSummary(state);
  const timer = state?.timer || {};
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!timer.start) return undefined;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [timer.start]);
  const st = slideTimer(state, now);

  const serviceLive = (state?.service?.sections || [])
    .flatMap((s) => (s.items || []).map((i) => ({ ...i, section: s.title })))
    .find((i) => i.live) || null;

  const chats = Array.isArray(messages) ? messages : [];
  const lastMsg = chats.length ? chats[chats.length - 1] : null;

  const tiles = [
    { id: 'lyrics', label: 'Lyrics', Icon: Music, hint: info.total ? `${info.total} slides` : 'No song', on: !!state?.song },
    { id: 'bible', label: 'Bible', Icon: BookOpen, hint: state?.bible?.abbrev ? state.bible.abbrev.toUpperCase() : 'Scripture' },
    { id: 'countdown', label: 'Countdown', Icon: Clock, hint: state?.countdown?.live ? 'Running' : 'Timer', dot: !!state?.countdown?.live },
    { id: 'presentation', label: 'Presentation', Icon: MonitorPlay, hint: state?.sermon?.loaded ? `${state.sermon.total || 0} slides` : 'No deck', dot: !!state?.sermon?.loaded },
    { id: 'draw', label: 'Draw', Icon: PenLine, hint: state?.draw?.strokes?.length ? `${state.draw.strokes.length} strokes` : 'Annotate', dot: !!state?.draw?.strokes?.length },
    { id: 'messages', label: 'Messages', Icon: MessageCircle, hint: 'Projectionist', badge: unread },
  ];

  const NAV_VIEWS = new Set(['lyrics', 'bible', 'countdown', 'messages']);

  return (
    <Screen>
      <SectionLabel right={
        <span style={{ fontSize: 10.5, fontWeight: 800, color: C.faint, letterSpacing: 0.4 }}>
          {state?.service?.name || 'No service open'}
        </span>
      }>Live now</SectionLabel>

      <LiveCard state={state} send={send} />

      <Row gap={8} style={{ marginTop: -6 }}>
        <Pill tone={info.onAir ? 'live' : 'neutral'} style={{ letterSpacing: 0.6 }}>
          <Radio size={11} /> {info.onAir ? 'On air' : 'Standby'}
        </Pill>
        {st.running || st.total ? (
          <Pill tone={st.total > 0 && st.remaining < 15 ? 'error' : 'neutral'} style={{ fontVariantNumeric: 'tabular-nums' }}>
            <Timer size={11} /> {fmtClock(st.remaining)}
          </Pill>
        ) : null}
        {serviceLive ? (
          <Pill tone="accent" style={{ minWidth: 0, overflow: 'hidden' }}>
            <Dot tone="accent" size={6} /> <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{serviceLive.title}</span>
          </Pill>
        ) : null}
      </Row>

      <SectionLabel>Transport</SectionLabel>
      <Transport send={send} />

      <SectionLabel>Go to</SectionLabel>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: S.sm }}>
        {tiles.map(({ id, label, Icon, hint, dot, badge }) => (
          <button
            key={id}
            type="button"
            onClick={() => (NAV_VIEWS.has(id) ? onNavigate(id) : onOpenScreen(id))}
            style={{
              position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'flex-start',
              gap: 8, minHeight: 88, padding: '11px 11px', borderRadius: R.md,
              background: C.elevated, border: `1px solid ${C.border}`, cursor: 'pointer',
              fontFamily: 'inherit', textAlign: 'left', touchAction: 'manipulation',
            }}
          >
            <span style={{ display: 'flex', width: '100%', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ width: 30, height: 30, borderRadius: 9, background: C.elevated2, color: T.ACCENT, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                <Icon size={16} />
              </span>
              <Row gap={4}>
                {badge ? <Badge count={badge} /> : null}
                {dot ? <Dot tone="success" size={7} /> : null}
              </Row>
            </span>
            <span style={{ display: 'flex', flexDirection: 'column', gap: 1, minWidth: 0, width: '100%' }}>
              <span style={{ fontSize: 12.5, fontWeight: 800, color: C.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</span>
              <span style={{ fontSize: 10.5, fontWeight: 600, color: C.faint, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{hint}</span>
            </span>
          </button>
        ))}
      </div>

      <SectionLabel right={info.nextCue ? <Pill tone="neutral" style={{ fontSize: 9 }}>Up next</Pill> : null}>Following</SectionLabel>
      {info.nextCue ? (
        <button
          type="button"
          onClick={() => send('next')}
          style={{
            display: 'flex', alignItems: 'center', gap: 10, width: '100%', minHeight: TOUCH + 8,
            padding: '10px 12px', borderRadius: R.md, background: C.elevated,
            border: `1px solid ${C.border}`, color: C.text, fontFamily: 'inherit', textAlign: 'left', cursor: 'pointer',
          }}
        >
          <span style={{ width: 3, alignSelf: 'stretch', borderRadius: 3, background: C.elevated2, flexShrink: 0 }} />
          <span style={{ flex: 1, minWidth: 0 }}>
            <span style={{ display: 'block', fontSize: 10, fontWeight: 900, letterSpacing: 1.1, textTransform: 'uppercase', color: C.faint }}>
              {info.nextCue.label || 'Next slide'}
            </span>
            <span style={{ display: 'block', fontSize: 13, fontWeight: 600, color: C.text2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginTop: 2 }}>
              {info.nextCue.text || '—'}
            </span>
          </span>
          <ChevronRight size={17} color={C.faint} />
        </button>
      ) : (
        <Card pad={14}>
          <EmptyState
            icon={Radio}
            title={state?.song ? 'End of the song' : 'Nothing queued'}
            hint={state?.song ? 'Press Next on the transport to move to the next service item.' : 'Load a song or build a service order on the computer.'}
            style={{ padding: '10px 4px' }}
          />
        </Card>
      )}

      <SectionLabel>Messages</SectionLabel>
      <button
        type="button"
        onClick={onOpenMessages}
        style={{
          display: 'flex', alignItems: 'center', gap: 11, width: '100%', minHeight: 62,
          padding: '10px 12px', borderRadius: R.md, cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left',
          background: C.elevated, border: `1px solid ${unread ? T.ACCENT_LINE : C.border}`, color: C.text,
        }}
      >
        <span style={{ position: 'relative', width: 34, height: 34, borderRadius: 10, background: unread ? T.ACCENT_SOFT : C.elevated2, color: unread ? T.ACCENT : C.muted, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <MessageCircle size={17} />
          {unread ? <span style={{ position: 'absolute', top: -3, right: -3, width: 8, height: 8, borderRadius: 4, background: T.ERROR }} /> : null}
        </span>
        <span style={{ flex: 1, minWidth: 0 }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 13.5, fontWeight: 800 }}>Projectionist</span>
            {unread ? <Pill tone="accent" style={{ fontSize: 9, padding: '2px 6px' }}>{unread} new</Pill> : null}
          </span>
          <span style={{ display: 'block', fontSize: 12, color: C.faint, marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {lastMsg ? `${lastMsg.senderId === 'operator' ? 'Desktop' : 'You'}: ${lastMsg.content}` : 'No messages yet — coordinate with the booth.'}
          </span>
        </span>
        <ChevronRight size={17} color={C.faint} />
      </button>

      <Row gap={7} style={{ justifyContent: 'center', paddingTop: 2, paddingBottom: 4 }}>
        <Server size={11} color={C.faint2} />
        <span style={{ fontSize: 10.5, fontWeight: 700, color: C.faint2, letterSpacing: 0.3 }}>
          {state ? `Desktop ${window.location.hostname}:8787` : 'Waiting for the desktop'}
        </span>
      </Row>
    </Screen>
  );
}
