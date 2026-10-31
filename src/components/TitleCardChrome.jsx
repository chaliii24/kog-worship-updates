import React from 'react';
import { titleCardChrome } from '../lib/titleCardTemplates';

// =====================================================================
// TITLE CARD CHROME — the framing around a title slide's words.
//
// One component draws it for every surface that shows the wall: the
// projector, the song editor's canvas and the picker's thumbnails all call
// this with the same `titleCardChrome()` data, so a rule cannot sit at one
// height on the canvas and another on the wall.
//
// Everything is absolute on the 1280x720 design canvas; the parent supplies
// the scale (the projector's viewport transform, the editor's zoom, the
// thumbnail's percentage box). Pointer-events stay off — this is decoration
// and must never swallow a click meant for the text underneath.
// =====================================================================

const slotBox = (s, k = 1) => {
  if (s.align === 'right') return { right: s.x * k, textAlign: 'right', alignItems: 'flex-end' };
  if (s.align === 'center') return { left: 0, right: 0, textAlign: 'center', alignItems: 'center' };
  return { left: s.x * k, textAlign: 'left', alignItems: 'flex-start' };
};

// `stretch` is the wall's widened design space (see designCanvasFilled): the
// wall fills a screen wider than 16:9 by growing the layout space, so the rules
// and corner lines have to grow with it — otherwise the chrome would stay
// bunched in the middle of the screen while the words spread out.
const TitleCardChrome = ({ card, artist = '', event = '', venue = '', stretch = 1 }) => {
  const chrome = titleCardChrome(card, { artist, event, venue });
  const k = Number(stretch) > 0 ? Number(stretch) : 1;
  if (!chrome) return null;
  return (
    <div
      aria-hidden="true"
      style={{
        position: 'absolute',
        inset: 0,
        pointerEvents: 'none',
        color: chrome.tone || '#ffffff',
        fontFamily: chrome.font || 'inherit',
      }}
    >
      {(chrome.rules || []).map((r, i) => (
        <div
          key={`rule-${i}`}
          style={{
            position: 'absolute',
            left: r.x * k,
            top: r.y,
            width: r.w * k,
            height: r.h || 2,
            background: 'currentColor',
            opacity: r.opacity != null ? r.opacity : 0.55,
          }}
        />
      ))}
      {(chrome.slots || []).map((s, i) => (
        <div
          key={`slot-${s.key}-${i}`}
          style={{
            position: 'absolute',
            top: s.y,
            ...slotBox(s, k),
            display: 'flex',
            flexDirection: 'column',
            maxWidth: s.align === 'center' ? '86%' : '58%',
            marginLeft: s.align === 'center' ? 'auto' : undefined,
            marginRight: s.align === 'center' ? 'auto' : undefined,
            lineHeight: 1.12,
            textShadow: '0 1px 8px rgba(0,0,0,0.55)',
          }}
        >
          {s.caption ? (
            <span
              style={{
                fontSize: Math.round(s.size * 0.66),
                fontWeight: 700,
                letterSpacing: `${Math.max(0.04, s.tracking || 0)}em`,
                opacity: 0.72,
                whiteSpace: 'nowrap',
              }}
            >
              {s.caption}
            </span>
          ) : null}
          <span
            style={{
              fontSize: s.size,
              fontWeight: s.caps ? 700 : 600,
              letterSpacing: `${s.tracking || 0}em`,
              textTransform: s.caps ? 'uppercase' : 'none',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              maxWidth: '100%',
            }}
          >
            {s.text}
          </span>
        </div>
      ))}
    </div>
  );
};

export default TitleCardChrome;
