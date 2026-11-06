import React from 'react';
import { Music, Image as ImageIcon, MonitorPlay, FileText, BookOpen, ChevronRight } from 'lucide-react';
import { C, T, R, TXT } from '../theme.js';
import { Screen, SectionLabel, Card, Row, Pill, Dot, Btn, EmptyState } from '../ui.jsx';
import SlideList from '../components/SlideList.jsx';
import Transport from '../components/Transport.jsx';
import { liveSummary } from '../live.js';

// Lyrics controller — the surface used mid-worship. Big next/prev live in a
// fixed dock, the slide grid is one tap away, and service items can be fired
// without leaving the page.
export default function LyricsScreen({ state, send }) {
  const info = liveSummary(state);
  const song = state?.song || null;
  const services = state?.service?.sections || [];
  const serviceItems = services.flatMap((s) => s.items || []);

  const goService = (item) => send(item.live ? 'serviceStop' : 'serviceGo', { id: item.id });

  return (
    <>
      <Screen style={{ paddingBottom: 196 }}>
        <Card pad={14}>
          <Row style={{ justifyContent: 'space-between', marginBottom: 2 }}>
            <Row gap={6} style={{ minWidth: 0 }}>
              <span style={{ width: 26, height: 26, borderRadius: 8, background: C.elevated2, color: T.ACCENT, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Music size={14} />
              </span>
              <span style={{ minWidth: 0 }}>
                <span style={{ display: 'block', fontSize: 15.5, fontWeight: 900, color: C.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {song?.title || 'No song loaded'}
                </span>
                <span style={{ display: 'block', fontSize: 11, fontWeight: 600, color: C.faint, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {song?.artist || (song ? 'Lyrics' : 'Load one on the computer')}
                </span>
              </span>
            </Row>
            <Pill tone={info.onAir ? 'live' : 'neutral'}>{info.onAir ? 'Live' : 'Standby'}</Pill>
          </Row>

          {song ? (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '12px 0 6px' }}>
                <span style={{ fontSize: 24, fontWeight: 900, fontVariantNumeric: 'tabular-nums', letterSpacing: -0.5, color: C.text }}>
                  {info.index || '–'}<span style={{ fontSize: 13, color: C.faint, fontWeight: 800 }}> / {info.total || '–'}</span>
                </span>
                {info.label ? <span style={{ fontSize: 10.5, fontWeight: 900, letterSpacing: 1.2, textTransform: 'uppercase', color: T.ACCENT }}>{info.label}</span> : null}
              </div>
              <div
                style={{
                  background: C.bgAlt, border: `1px solid ${info.onAir ? T.SUCCESS_LINE : C.border}`,
                  borderRadius: R.md, padding: '12px 13px', minHeight: 74,
                }}
              >
                <span style={{ display: 'block', fontSize: 9.5, fontWeight: 900, letterSpacing: 1.3, textTransform: 'uppercase', color: info.onAir ? T.SUCCESS : C.faint, marginBottom: 5 }}>
                  {info.onAir ? 'On the screen now' : 'Next to fire'}
                </span>
                <span style={{ display: 'block', fontSize: 14.5, fontWeight: 600, lineHeight: 1.5, color: C.text, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                  {(info.activeCue || info.nextCue)?.text || 'Tap a slide to put it on the screen.'}
                </span>
              </div>
            </>
          ) : (
            <EmptyState icon={Music} title="Build a setlist first" hint="Your song list and service order come from the desktop app." action={
              <Btn size="sm" variant="quiet" onClick={() => send('clearWorkspace')}>Clear canvas</Btn>
            } />
          )}
        </Card>

        {song ? (
          <>
            <SectionLabel right={<span style={{ ...TXT.meta, fontSize: 10.5 }}>{info.total} slides</span>}>Slides</SectionLabel>
            <SlideList cues={info.cues} activeId={info.activeId} onFire={(id) => send('cue', { id })} />
          </>
        ) : null}

        {info.nextCue && song ? (
          <Card pad={12} tone="warning">
            <Row gap={9}>
              <span style={{ width: 3, alignSelf: 'stretch', borderRadius: 3, background: T.ACCENT, flexShrink: 0 }} />
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: 'block', fontSize: 9.5, fontWeight: 900, letterSpacing: 1.2, textTransform: 'uppercase', color: C.faint }}>
                  Up next{info.nextCue.label ? ` · ${info.nextCue.label}` : ''}
                </span>
                <span style={{ display: 'block', fontSize: 12.5, fontWeight: 600, color: C.text2, marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {info.nextCue.text || '—'}
                </span>
              </span>
              <ChevronRight size={16} color={C.faint} />
            </Row>
          </Card>
        ) : null}

        {info.cues.length ? (
          <>
            <SectionLabel>Jump to section</SectionLabel>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
              {[...new Set(info.cues.map((c) => c.label).filter(Boolean))].map((label) => {
                const cue = info.cues.find((c) => c.label === label);
                const on = !!cue && cue.id === info.activeId;
                return (
                  <button
                    key={label}
                    type="button"
                    onClick={() => send('cue', { id: cue.id })}
                    style={{
                      minHeight: 40, padding: '0 15px', borderRadius: 999, cursor: 'pointer',
                      fontFamily: 'inherit', fontSize: 12.5, fontWeight: 800,
                      background: on ? T.ACCENT_SOFT : C.elevated,
                      border: `1px solid ${on ? T.ACCENT_LINE : C.border}`,
                      color: on ? T.ACCENT : C.text2,
                    }}
                  >{label}</button>
                );
              })}
            </div>
          </>
        ) : null}

        {serviceItems.length ? (
          <>
            <SectionLabel right={<span style={{ ...TXT.meta, fontSize: 10.5 }}>{state?.service?.name || ''}</span>}>Service order</SectionLabel>
            {services.map((section, si) => (
              <div key={`${section.title}-${si}`} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <span style={{ fontSize: 9.5, fontWeight: 900, letterSpacing: 1.4, textTransform: 'uppercase', color: C.faint2, paddingLeft: 2 }}>
                  {section.title}
                </span>
                {(section.items || []).map((item) => {
                  const Icon = item.item_type === 'song' ? Music
                    : item.bible ? BookOpen
                      : item.item_type === 'media' ? ImageIcon
                        : item.item_type === 'presentation' ? MonitorPlay : FileText;
                  return (
                    <div
                      key={item.id}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 10, minHeight: 56,
                        padding: '8px 10px 8px 12px', borderRadius: R.md,
                        background: item.live ? T.SUCCESS_SOFT : C.elevated,
                        border: `1px solid ${item.live ? T.SUCCESS_LINE : C.border}`,
                      }}
                    >
                      <span style={{ color: item.live ? T.SUCCESS : C.faint, display: 'inline-flex', flexShrink: 0 }}>
                        <Icon size={15} />
                      </span>
                      <span style={{ flex: 1, minWidth: 0 }}>
                        <span style={{ display: 'block', fontSize: 13.5, fontWeight: 800, color: C.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.title}</span>
                        <span style={{ display: 'block', fontSize: 10.5, color: C.faint, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.subtitle || ''}</span>
                      </span>
                      {item.live ? <Dot tone="success" size={7} /> : null}
                      <Btn
                        size="sm"
                        variant={item.live ? 'danger' : 'primary'}
                        onClick={() => goService(item)}
                        style={{ minWidth: 62, height: 38 }}
                      >{item.live ? 'Stop' : 'Go'}</Btn>
                    </div>
                  );
                })}
              </div>
            ))}
          </>
        ) : null}
      </Screen>

      {/* Fixed thumb dock: the two most-used buttons in the room, always in the
          same place and never scrolled away. */}
      <div
        style={{
          position: 'fixed', left: 0, right: 0, bottom: 'calc(60px + env(safe-area-inset-bottom))', zIndex: 7000,
          padding: `10px 14px 12px`,
          background: 'linear-gradient(180deg, rgba(11,12,14,0) 0%, rgba(11,12,14,0.92) 26%, #0B0C0E 100%)',
        }}
      >
        <Transport send={send} />
      </div>
    </>
  );
}
