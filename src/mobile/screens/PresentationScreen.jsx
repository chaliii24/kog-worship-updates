import React, { useState } from 'react';
import { MonitorPlay, SkipBack, SkipForward, ChevronRight, X } from 'lucide-react';
import { C, T, S, TXT } from '../theme.js';
import { Screen, SectionLabel, Card, Row, Pill, Dot, Btn, Field, EmptyState, Segmented } from '../ui.jsx';

// Presentation (sermon slides). Loading a deck stays desktop-side — it needs
// the file dialog — so this screen only drives whatever is already loaded,
// through the same sermon* commands the desktop panel uses.
export default function PresentationScreen({ state, send }) {
  const sm = state?.sermon || null;
  const engine = sm?.provider === 'wps' ? 'WPS' : sm?.provider === 'libreoffice' ? 'LibreOffice' : 'Slides';
  const [jump, setJump] = useState('');
  const loaded = !!sm?.loaded;
  const total = Number(sm?.total) || 0;
  const index = Number(sm?.index) || 0;
  const pct = total > 1 ? Math.max(0, Math.min(100, ((index + 1) / total) * 100)) : 0;
  const layer = sm?.passthrough ? 'passthrough' : 'kog';

  const goJump = () => {
    const n = Number(jump);
    if (!n) return;
    send('sermonGoto', { index: n });
    setJump('');
  };

  return (
    <Screen>
      <Card live={loaded && sm.passthrough} tone="accent" pad={16}>
        <Row style={{ justifyContent: 'space-between', marginBottom: 8 }}>
          <Row gap={7}>
            <MonitorPlay size={14} color={loaded ? T.ACCENT : C.faint} />
            <span style={{ ...TXT.label }}>Sermon</span>
          </Row>
          {loaded ? (
            <Pill tone={sm.passthrough ? 'accent' : 'live'}>
              <Dot tone={sm.passthrough ? 'accent' : 'success'} size={6} />
              {sm.passthrough ? engine : 'Lyrics layer'}
            </Pill>
          ) : <Pill tone="neutral">Not loaded</Pill>}
        </Row>

        {!loaded ? (
          <EmptyState
            icon={MonitorPlay}
            title="No presentation open"
            hint="Open the deck on the computer first — then it can be driven from here."
          />
        ) : (
          <>
            <div style={{ fontSize: 16.5, fontWeight: 900, color: C.text, letterSpacing: -0.2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {sm.title || 'Presentation'}
            </div>
            <Row gap={8} style={{ alignItems: 'baseline', margin: '6px 0 10px' }}>
              <span style={{ fontSize: 46, fontWeight: 900, lineHeight: 1, letterSpacing: -1.5, fontVariantNumeric: 'tabular-nums', color: C.text }}>
                {index + 1}
              </span>
              <span style={{ fontSize: 16, fontWeight: 800, color: C.faint, fontVariantNumeric: 'tabular-nums' }}>/ {total || '–'}</span>
              <span style={{ marginLeft: 'auto', fontSize: 10.5, fontWeight: 800, letterSpacing: 1, textTransform: 'uppercase', color: C.faint }}>
                {sm.displayLabel || 'slides'}
              </span>
            </Row>
            <div style={{ height: 4, borderRadius: 2, background: C.elevated2, overflow: 'hidden', marginBottom: 14 }}>
              <div style={{ height: '100%', width: `${pct}%`, background: T.ACCENT_GRAD, borderRadius: 2, transition: 'width 180ms ease' }} />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.6fr', gap: S.sm }}>
              <Btn variant="ghost" size="lg" icon={<SkipBack size={20} />} onClick={() => send('sermonPrev')}>Prev</Btn>
              <Btn variant="primary" size="lg" onClick={() => send('sermonNext')} style={{ justifyContent: 'space-between', paddingLeft: 20, paddingRight: 20, fontWeight: 900 }}>
                Next <SkipForward size={20} />
              </Btn>
            </div>
          </>
        )}
      </Card>

      {loaded ? (
        <>
          <SectionLabel>Output layer</SectionLabel>
          <Segmented
            value={layer}
            onChange={(v) => send('sermonLayer', { layer: v })}
            options={[['kog', 'Lyrics layer'], ['passthrough', engine]]}
          />
          <div style={{ fontSize: 11, color: C.faint, lineHeight: 1.5, marginTop: -6 }}>
            “Lyrics layer” keeps KOG text above the deck; “{engine}” hands the screen to the presentation.
          </div>

          <SectionLabel>Jump to slide</SectionLabel>
          <Card pad={12}>
            <Row gap={8}>
              <Field
                value={jump}
                onChange={(e) => setJump(e.target.value.replace(/\D/g, '').slice(0, 4))}
                onKeyDown={(e) => { if (e.key === 'Enter') goJump(); }}
                placeholder="Slide number"
                inputMode="numeric"
                style={{ textAlign: 'center', flex: 1, fontSize: 17, fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}
              />
              <Btn variant="gold" size="md" icon={<ChevronRight size={16} />} onClick={goJump} disabled={!jump}>Go</Btn>
            </Row>
          </Card>

          <SectionLabel>Close</SectionLabel>
          <Btn full variant="danger" icon={<X size={16} />} onClick={() => send('sermonClose')} style={{ height: 50 }}>
            Close presentation on the computer
          </Btn>
        </>
      ) : null}
    </Screen>
  );
}
