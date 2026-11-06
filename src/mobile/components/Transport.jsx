import React from 'react';
import { SkipBack, SkipForward, Type, Square, RotateCcw } from 'lucide-react';
import { C, S, R } from '../theme.js';
import { Btn } from '../ui.jsx';

// The live transport. Commands are exactly the ones the desktop Next/Prev
// buttons send, so a tap here is indistinguishable from a tap on the computer.
// Sized for a thumb: Next is the biggest target on the screen.
export default function Transport({ send, onAfter, style }) {
  const fire = (cmd) => { send(cmd); if (onAfter) onAfter(); };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: S.sm, ...style }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.55fr', gap: S.sm }}>
        <Btn variant="ghost" size="lg" icon={<SkipBack size={20} />} onClick={() => fire('prev')} title="Previous slide">Prev</Btn>
        <Btn variant="primary" size="lg" onClick={() => fire('next')} title="Next slide" style={{ justifyContent: 'space-between', paddingLeft: 20, paddingRight: 20, fontWeight: 900 }}>
          Next <SkipForward size={20} />
        </Btn>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: S.sm }}>
        <Btn variant="gold" size="sm" icon={<Type size={14} />} onClick={() => fire('clearLyrics')} title="Clear lyrics only">Lyrics</Btn>
        <Btn variant="danger" size="sm" icon={<Square size={13} />} onClick={() => fire('clearAll')} title="Clear everything">Clear all</Btn>
        <Btn variant="quiet" size="sm" icon={<RotateCcw size={14} />} onClick={() => fire('reassert')} title="Put the current slide back on air">Restore</Btn>
      </div>
    </div>
  );
}

// Shared style hook for a sticky dock (lyrics screen bottom).
export const dockStyle = {
  position: 'sticky',
  bottom: 0,
  zIndex: 30,
  marginTop: 'auto',
  padding: `${S.md}px 16px ${S.md}px`,
  background: `linear-gradient(180deg, ${C.bg}00 0%, ${C.bg} 22%)`,
  borderRadius: R.lg,
};
