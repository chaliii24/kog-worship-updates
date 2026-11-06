import React from 'react';
import { Music } from 'lucide-react';
import { C, T, R } from '../theme.js';
import { Pill, EmptyState } from '../ui.jsx';

// Every slide of the loaded song, numbered, tappable, with the projected one
// marked in the accent colour. Cue text comes straight from the desktop
// snapshot, so the list is the real set of slides.
export default function SlideList({ cues, activeId, onFire, maxHeight = '46dvh' }) {
  if (!cues.length) {
    return <EmptyState icon={Music} title="No song loaded" hint="Load a song on the computer and its slides appear here." />;
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight, overflowY: 'auto', paddingRight: 2, WebkitOverflowScrolling: 'touch' }}>
      {cues.map((cue, i) => {
        const on = cue.id === activeId;
        return (
          <button
            key={cue.id}
            type="button"
            onClick={() => onFire(cue.id)}
            style={{
              position: 'relative', display: 'flex', alignItems: 'center', gap: 10,
              textAlign: 'left', minHeight: 54, padding: '8px 11px',
              borderRadius: R.md, cursor: 'pointer', fontFamily: 'inherit',
              background: on ? T.ACCENT_SOFT : C.elevated,
              border: `1px solid ${on ? T.ACCENT_LINE : C.border}`,
              color: C.text, touchAction: 'manipulation', flexShrink: 0,
            }}
          >
            {on ? <span style={{ position: 'absolute', left: 0, top: 9, bottom: 9, width: 3, borderRadius: 3, background: T.ACCENT }} /> : null}
            <span
              style={{
                width: 26, height: 26, borderRadius: 8, flexShrink: 0,
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 11.5, fontWeight: 900, fontVariantNumeric: 'tabular-nums',
                background: on ? T.ACCENT : C.elevated2, color: on ? T.ON_ACCENT : C.muted,
              }}
            >{i + 1}</span>
            <span style={{ flex: 1, minWidth: 0 }}>
              {cue.label ? (
                <span style={{ display: 'block', fontSize: 9.5, fontWeight: 900, letterSpacing: 1.2, textTransform: 'uppercase', color: on ? T.ACCENT : C.faint }}>
                  {cue.label}
                </span>
              ) : null}
              <span
                style={{
                  display: 'block', fontSize: 13, fontWeight: 600, lineHeight: 1.35,
                  color: on ? C.text : C.text2,
                  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                }}
              >{cue.text || '—'}</span>
            </span>
            {on ? <Pill tone="accent" style={{ padding: '3px 7px', fontSize: 9 }}>Live</Pill> : null}
          </button>
        );
      })}
    </div>
  );
}
