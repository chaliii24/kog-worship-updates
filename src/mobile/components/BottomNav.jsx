import React from 'react';
import { Home, Music, BookOpen, Clock, MessageCircle } from 'lucide-react';
import { C, T, R, FONT } from '../theme.js';
import { Badge } from '../ui.jsx';

// Five destinations, no more: the live controls plus messages. Everything else
// (presentation, draw, audience overlay, outputs, settings) lives behind the
// header menu so the bar never becomes a wall of 24px icons.
export const NAV_ITEMS = [
  { id: 'home', label: 'Home', Icon: Home },
  { id: 'lyrics', label: 'Lyrics', Icon: Music },
  { id: 'bible', label: 'Bible', Icon: BookOpen },
  { id: 'countdown', label: 'Timer', Icon: Clock },
  { id: 'messages', label: 'Messages', Icon: MessageCircle },
];

export default function BottomNav({ value, onChange, unread = 0 }) {
  return (
    <nav
      aria-label="Primary"
      style={{
        // In normal flow at the end of the app shell's flex column, NOT
        // position:fixed. The shell is already exactly 100dvh and never
        // scrolls, so this pins the bar to the bottom of the viewport while
        // also taking 60px + the home-indicator inset OUT of the content
        // area. As a fixed overlay it sat on top of the last row of every
        // screen — which is where the message composer lives.
        flexShrink: 0,
        paddingBottom: 'env(safe-area-inset-bottom)',
        background: 'rgba(17,19,24,0.94)',
        borderTop: `1px solid ${C.border}`,
        fontFamily: FONT,
      }}
    >
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${NAV_ITEMS.length}, 1fr)`, height: 60 }}>
        {NAV_ITEMS.map(({ id, label, Icon }) => {
          const on = value === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => onChange(id)}
              aria-current={on ? 'page' : undefined}
              style={{
                position: 'relative', display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center', gap: 3,
                background: 'transparent', border: 'none', cursor: 'pointer',
                fontFamily: 'inherit', padding: 0, touchAction: 'manipulation',
                WebkitTapHighlightColor: 'transparent',
              }}
            >
              <span
                style={{
                  position: 'relative', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  width: 42, height: 28, borderRadius: R.sm,
                  background: on ? T.ACCENT_SOFT : 'transparent',
                  color: on ? T.ACCENT : C.muted,
                  transition: 'background 140ms ease, color 140ms ease',
                }}
              >
                <Icon size={19} strokeWidth={on ? 2.4 : 2} />
                {id === 'messages' && unread ? (
                  <Badge count={unread} style={{ position: 'absolute', top: -4, right: -3, minWidth: 16, height: 16, fontSize: 9.5 }} />
                ) : null}
              </span>
              <span style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: 0.3, color: on ? T.ACCENT : C.faint }}>
                {label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
