import React from 'react';
import { Radio, RotateCcw, MonitorOff } from 'lucide-react';
import { C, T, R } from '../theme.js';
import { Pill, Row, Dot, Btn, Card } from '../ui.jsx';
import MiniSlide from '../screens/MiniSlide.jsx';
import { liveSummary, outputShape } from '../live.js';

// The single "what is on the wall" surface: dashboard hero, outputs mirror and
// the lyrics screen all read the same snapshot through it. No local state, no
// simulated live indicator — if the desktop says clear, this says clear.
export default function LiveCard({ state, compact = false, send }) {
  const info = liveSummary(state);
  const shape = outputShape(state);
  const live = info.live;

  const counter = info.total > 0 ? `${String(info.index || 1).padStart(2, '0')} / ${String(info.total).padStart(2, '0')}` : null;

  return (
    <Card live={info.onAir} tone="live" pad={compact ? 12 : 14}>
      <Row style={{ justifyContent: 'space-between', marginBottom: 10 }}>
        <Row gap={6}>
          {info.onAir ? (
            <Pill tone="live"><Dot tone="success" size={6} pulse /> Live</Pill>
          ) : (
            <Pill tone="neutral">Standby</Pill>
          )}
          <Pill tone={info.onAir ? 'accent' : 'neutral'}>{info.onAir ? info.kindLabel : 'Output clear'}</Pill>
        </Row>
        <Row gap={8}>
          {counter ? (
            <span style={{ fontSize: 12, fontWeight: 900, fontVariantNumeric: 'tabular-nums', letterSpacing: 0.6, color: info.onAir ? C.text2 : C.faint }}>
              {counter}
            </span>
          ) : null}
          <span style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: 0.6, color: C.faint, background: C.elevated2, borderRadius: 6, padding: '3px 6px' }}>
            {shape.aspect}
          </span>
        </Row>
      </Row>

      <div style={{ marginBottom: compact ? 8 : 10 }}>
        <div style={{ fontSize: compact ? 16 : 18, fontWeight: 900, letterSpacing: -0.2, color: C.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {info.title || (info.onAir ? 'Live output' : 'Nothing on air')}
        </div>
        <Row gap={7} style={{ marginTop: 3 }}>
          {info.label ? (
            <span style={{ fontSize: 10, fontWeight: 900, letterSpacing: 1.1, textTransform: 'uppercase', color: T.ACCENT }}>{info.label}</span>
          ) : null}
          {state?.song?.artist ? (
            <span style={{ fontSize: 11, fontWeight: 600, color: C.faint, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{state.song.artist}</span>
          ) : null}
        </Row>
      </div>

      {info.hasPicture ? (
        <MiniSlide
          C={C}
          slide={live}
          aspect={shape.cssAspect}
          aspectBadge={null}
          badge={null}
          draw={state?.draw?.strokes || null}
          lift={state?.lyricLift || 0}
        />
      ) : (
        <div
          style={{
            display: 'flex', alignItems: 'center', gap: 12,
            background: C.bgAlt, border: `1px dashed ${C.border2}`, borderRadius: R.md,
            padding: '14px 14px', minHeight: 86,
          }}
        >
          <span style={{ width: 36, height: 36, borderRadius: 10, background: C.elevated2, color: C.faint, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            {info.onAir ? <Radio size={18} /> : <MonitorOff size={18} />}
          </span>
          <span style={{ flex: 1, minWidth: 0 }}>
            <span style={{ display: 'block', fontSize: 13.5, fontWeight: 800, color: C.text2 }}>
              {info.onAir ? 'Background only — no text' : 'The screen is clear'}
            </span>
            <span style={{ display: 'block', fontSize: 11.5, color: C.faint, marginTop: 2, lineHeight: 1.45 }}>
              {info.onAir ? 'The wall has no lyrics or deck on it.' : 'Pick a slide below or press Next to continue.'}
            </span>
          </span>
          {info.onAir && send ? (
            <Btn size="sm" variant="gold" icon={<RotateCcw size={13} />} onClick={() => send('reassert')}>Restore</Btn>
          ) : null}
        </div>
      )}
      {compact ? null : null}
    </Card>
  );
}
