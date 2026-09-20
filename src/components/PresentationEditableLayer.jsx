import React, { useRef, useState } from 'react';
import { resolveRects, visibleElements } from '../lib/backgrounds';

const ACCENT = '#3B82F6';
const LABEL = { title: 'Title', subtitle: 'Subtitle', bullets: 'Bullets', body: 'Body' };
const DESIGN_W = 1280;
const DESIGN_H = 720;

// Transparent interactive layer drawn on top of the editor canvas. Each visible
// text box can be dragged to move and its bottom-right handle dragged to resize.
// Coordinates are stored in 1280x720 design space, so projector output matches.
export default function PresentationEditableLayer({ slide, scale, onChange }) {
  const rects = resolveRects(slide);
  const keys = visibleElements(slide);
  const [active, setActive] = useState(null);
  const drag = useRef(null);

  if (!keys.length) return null;

  const onPointerDown = (e, key, mode) => {
    e.preventDefault();
    e.stopPropagation();
    const r = rects[key];
    drag.current = { key, mode, startX: e.clientX, startY: e.clientY, rect: { x: r.x, y: r.y, w: r.w, h: r.h } };
    setActive(key);

    const move = (ev) => {
      const d = drag.current;
      if (!d) return;
      const dx = (ev.clientX - d.startX) / scale;
      const dy = (ev.clientY - d.startY) / scale;
      let next;
      if (d.mode === 'move') {
        const x = Math.max(-d.rect.w + 40, Math.min(DESIGN_W - 40, d.rect.x + dx));
        const y = Math.max(0, Math.min(DESIGN_H - 20, d.rect.y + dy));
        next = { x: Math.round(x), y: Math.round(y), w: d.rect.w, h: d.rect.h };
      } else {
        const w = Math.max(120, Math.min(DESIGN_W - d.rect.x, d.rect.w + dx));
        const h = Math.max(40, Math.min(DESIGN_H - d.rect.y, d.rect.h + dy));
        next = { x: d.rect.x, y: d.rect.y, w: Math.round(w), h: Math.round(h) };
      }
      onChange(d.key, next);
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      drag.current = null;
      setActive(null);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 6 }}>
      {keys.map(key => {
        const r = rects[key];
        const isActive = active === key;
        return (
          <div
            key={key}
            onPointerDown={(e) => onPointerDown(e, key, 'move')}
            title="Drag to move"
            style={{
              position: 'absolute',
              left: r.x * scale,
              top: r.y * scale,
              width: r.w * scale,
              height: r.h * scale,
              boxSizing: 'border-box',
              border: `1.5px ${isActive ? 'solid' : 'dashed'} ${isActive ? ACCENT : 'rgba(59,130,246,0.65)'}`,
              borderRadius: 5,
              cursor: 'move',
              background: isActive ? 'rgba(59,130,246,0.08)' : 'transparent'
            }}
          >
            <span style={{ position: 'absolute', top: 1, left: 3, fontSize: 9, fontWeight: 800, letterSpacing: 0.4, color: ACCENT, background: 'rgba(5,5,9,0.75)', borderRadius: 4, padding: '0 4px', pointerEvents: 'none', textTransform: 'uppercase' }}>{LABEL[key]}</span>
            <span
              onPointerDown={(e) => onPointerDown(e, key, 'resize')}
              title="Drag to resize"
              style={{ position: 'absolute', right: -5, bottom: -5, width: 12, height: 12, borderRadius: 3, background: '#fff', border: `1.5px solid ${ACCENT}`, cursor: 'nwse-resize' }}
            />
          </div>
        );
      })}
    </div>
  );
}
