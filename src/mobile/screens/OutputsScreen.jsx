import React from 'react';
import { Monitor, Type, Square, RotateCcw } from 'lucide-react';
import { C, T, S, R } from '../theme.js';
import { Screen, SectionLabel, Card, Pill, Dot, Btn, EmptyState } from '../ui.jsx';
import LiveCard from '../components/LiveCard.jsx';

// Live outputs mirror. Read-only list (binding displays and aspects stay
// desktop-side); the transport underneath is the real thing.
export default function OutputsScreen({ state, send }) {
  const outputs = state?.outputs || [];
  const onAir = !!(state?.activeCueId && state.activeCueId !== 'clear');

  return (
    <Screen>
      <LiveCard state={state} send={send} />

      <SectionLabel right={<Pill tone="neutral" style={{ fontSize: 9 }}>{outputs.length} display{outputs.length === 1 ? '' : 's'}</Pill>}>Displays</SectionLabel>
      <Card pad={12}>
        {outputs.length === 0 ? (
          <EmptyState icon={Monitor} title="No outputs configured" hint="Add displays under Outputs on the computer." style={{ padding: '12px 0' }} />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
            {outputs.map((o) => (
              <div
                key={o.id}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10, minHeight: 52, padding: '8px 10px',
                  borderRadius: R.md,
                  background: o.enabled ? T.SUCCESS_SOFT : C.elevated2,
                  border: `1px solid ${o.enabled ? T.SUCCESS_LINE : C.border}`,
                }}
              >
                <Dot tone={o.enabled ? 'success' : 'muted'} size={8} />
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: 'block', fontSize: 13.5, fontWeight: 800, color: C.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {o.name || 'Output'}
                  </span>
                  <span style={{ display: 'block', fontSize: 10.5, color: C.faint, textTransform: 'capitalize' }}>
                    {o.role || 'lyrics'} · {o.aspect || '16:9'}{o.resolution && o.resolution !== 'native' ? ` · ${o.resolution}` : ''}{o.bound ? '' : ' · unassigned'}
                  </span>
                </span>
                <span style={{ fontSize: 9.5, fontWeight: 900, letterSpacing: 1, color: o.enabled ? T.SUCCESS : C.faint }}>
                  {o.enabled ? 'LIVE' : 'OFF'}
                </span>
              </div>
            ))}
          </div>
        )}
      </Card>

      <SectionLabel>Transport</SectionLabel>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: S.sm }}>
        <Btn variant="gold" size="lg" icon={<Type size={16} />} onClick={() => send('clearLyrics')}>Clear lyrics</Btn>
        <Btn variant="danger" size="lg" icon={<Square size={15} />} onClick={() => send('clearAll')}>Clear all</Btn>
      </div>
      <Btn full variant="ghost" size="md" icon={<RotateCcw size={15} />} onClick={() => send('reassert')} disabled={!onAir}>
        Put the current slide back
      </Btn>
    </Screen>
  );
}
