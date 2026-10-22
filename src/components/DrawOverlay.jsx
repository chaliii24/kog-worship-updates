import React from 'react';
import { DRAW_W, DRAW_H, strokeToPath } from '../lib/draw.js';

// The on-air face: pointer-transparent SVG over the slide, stretched to any
// wall. One component for projector, monitor mini and phone echo alike.
export function DrawOverlay({ strokes, opacity = 0.95 }) {
  const list = Array.isArray(strokes) ? strokes.filter(Boolean) : [];
  if (!list.length) return null;
  return (
    <svg
      viewBox={`0 0 ${DRAW_W} ${DRAW_H}`}
      preserveAspectRatio="none"
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', opacity }}
    >
      {list.map((s, i) => (
        <path
          key={(s && s.id) || i}
          d={strokeToPath(s.points)}
          fill="none"
          stroke={(s && s.color) || '#FF4545'}
          strokeWidth={(s && s.width) || 12}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ))}
    </svg>
  );
}
