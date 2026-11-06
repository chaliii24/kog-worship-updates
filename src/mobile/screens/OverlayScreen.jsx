import React, { useState } from 'react';
import { Megaphone, Send, Eye } from 'lucide-react';
import { C, T, R, TXT } from '../theme.js';
import { Screen, SectionLabel, Card, Row, Pill, Dot, Btn, Field, Segmented, EmptyState } from '../ui.jsx';

// Audience message overlay: a short text bug above the live slide. Text-only
// from the phone (uploads need the desktop file dialog) — the same
// overlayShow / overlayClear commands the desktop uses.
export default function OverlayScreen({ state, send }) {
  const live = state?.overlay || null;
  const [text, setText] = useState('');
  const [style, setStyle] = useState('lower');
  const [secs, setSecs] = useState(10);
  const canShow = !!text.trim();

  const show = () => {
    if (!canShow) return;
    send('overlayShow', { text: text.trim(), style, secs });
    setText('');
  };

  return (
    <Screen>
      <Card live={!!live} tone="live" pad={16}>
        <Row style={{ justifyContent: 'space-between', marginBottom: 8 }}>
          <Row gap={7}>
            <Megaphone size={14} color={live ? T.SUCCESS : C.faint} />
            <span style={{ ...TXT.label }}>Audience message</span>
          </Row>
          {live ? <Pill tone="live"><Dot tone="success" size={6} pulse /> Live</Pill> : <Pill tone="neutral">Idle</Pill>}
        </Row>
        {live && (live.text || live.media) ? (
          <div style={{ background: C.bgAlt, border: `1px solid ${C.border}`, borderRadius: R.md, padding: '12px 13px' }}>
            <span style={{ ...TXT.label, display: 'block', marginBottom: 5 }}>{live.style || 'lower'} · on the wall</span>
            <span style={{ fontSize: 14.5, fontWeight: 700, color: C.text, lineHeight: 1.5, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
              {live.text || 'Image bug'}
            </span>
          </div>
        ) : (
          <EmptyState icon={Eye} title="Nothing on the wall" hint="Type a welcome or a cue, then show it above the slide." style={{ padding: '12px 0' }} />
        )}
        {live ? (
          <Btn full variant="danger" size="md" onClick={() => send('overlayClear')} style={{ marginTop: 10 }}>
            Clear message
          </Btn>
        ) : null}
      </Card>

      <SectionLabel>New message</SectionLabel>
      <Card pad={14}>
        <Field
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') show(); }}
          placeholder="Welcome home!"
          maxLength={140}
          style={{ fontSize: 15 }}
        />
        <div style={{ ...TXT.meta, fontSize: 10.5, marginTop: 6, textAlign: 'right' }}>{text.length}/140</div>

        <span style={{ ...TXT.label, display: 'block', margin: '10px 0 6px' }}>Position</span>
        <Segmented value={style} onChange={setStyle} options={[['lower', 'Lower'], ['center', 'Center'], ['banner', 'Banner']]} />

        <span style={{ ...TXT.label, display: 'block', margin: '12px 0 6px' }}>Duration</span>
        <Segmented
          value={secs}
          onChange={setSecs}
          options={[[10, '10s'], [30, '30s'], [0, 'Pinned']]}
        />

        <Btn full variant="primary" size="lg" icon={<Send size={16} />} onClick={show} disabled={!canShow} style={{ marginTop: 14, fontWeight: 900 }}>
          Show on screen
        </Btn>
        <div style={{ fontSize: 10.5, color: C.faint, textAlign: 'center', marginTop: 8, lineHeight: 1.5 }}>
          Sits above slides · survives “Clear lyrics” · cleared by “Clear all”.
        </div>
      </Card>
    </Screen>
  );
}
