import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Pipette } from 'lucide-react';

// Untitled UI color picker (untitledui.com/react/components/color-pickers),
// adapted to the song editor's inline-styled theme. A swatch trigger opens a
// portal popover with a Solid | Gradient segmented control — the gradient
// (two stops + angle) lives INSIDE the picker instead of as its own block.
//
//   onChange(patch)      — discrete commits (tab switch, swatch, hex, eyedropper)
//   onLiveChange(patch)  — drags (SV area, hue, angle); caller throttles

// ---------- color math (hex <-> hsv) ----------
const norm = (h) => {
  let s = String(h || '').trim();
  if (!s) return null;
  if (s[0] !== '#') s = `#${s}`;
  if (/^#[0-9a-fA-F]{3}$/.test(s)) s = `#${s.slice(1).split('').map((c) => c + c).join('')}`;
  return /^#[0-9a-fA-F]{6}$/.test(s) ? s.toLowerCase() : null;
};

const hexToRgb = (hex) => {
  const h = hex.slice(1);
  return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16) };
};

const rgbToHex = ({ r, g, b }) =>
  `#${[r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('')}`;

const rgbToHsv = ({ r, g, b }) => {
  const rr = r / 255; const gg = g / 255; const bb = b / 255;
  const max = Math.max(rr, gg, bb); const min = Math.min(rr, gg, bb); const d = max - min;
  let h = 0;
  if (d > 0) {
    if (max === rr) h = ((gg - bb) / d) % 6;
    else if (max === gg) h = (bb - rr) / d + 2;
    else h = (rr - gg) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return { h, s: max > 0 ? d / max : 0, v: max };
};

const hsvToRgb = ({ h, s, v }) => {
  const c = v * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v - c;
  let r = 0; let g = 0; let b = 0;
  if (h < 60) { r = c; g = x; } else if (h < 120) { r = x; g = c; }
  else if (h < 180) { g = c; b = x; } else if (h < 240) { g = x; b = c; }
  else if (h < 300) { r = x; b = c; } else { r = c; b = x; }
  return { r: (r + m) * 255, g: (g + m) * 255, b: (b + m) * 255 };
};

// Neutral / brand-violet / accent rows — quick picks in the UUI swatch style.
const SWATCHES = [
  ['#ffffff', '#f5f5f4', '#d6d3d1', '#a8a29e', '#78716c', '#57534e', '#292524', '#000000'],
  ['#ede9fe', '#ddd6fe', '#c4b5fd', '#a78bfa', '#8b5cf6', '#7c3aed', '#6d28d9', '#4c1d95'],
  ['#fecaca', '#fdba74', '#fde047', '#bef264', '#86efac', '#67e8f9', '#93c5fd', '#f0abfc'],
];

const clamp01 = (n) => (n < 0 ? 0 : n > 1 ? 1 : n);

export default function ColorPicker({
  C,
  ACCENT,
  value = '#ffffff',
  gradient = false,
  color1 = '#f5f5f4',
  color2 = '#93c5fd',
  angle = 180,
  onChange,
  onLiveChange,
  label = 'Color',
}) {
  const [open, setOpen] = useState(false);
  const [stop, setStop] = useState(1); // which gradient stop the area/hex edits
  const [draft, setDraft] = useState('');
  const wrapRef = useRef(null);
  const areaRef = useRef(null);
  const hueRef = useRef(null);
  const [pos, setPos] = useState(null);

  const c1 = norm(color1) || '#f5f5f4';
  const c2 = norm(color2) || '#93c5fd';
  const active = norm(gradient ? (stop === 1 ? c1 : c2) : value) || '#ffffff';
  const hsv = useMemo(() => rgbToHsv(hexToRgb(active)), [active]);
  const hueHex = useMemo(() => rgbToHex(hsvToRgb({ h: hsv.h, s: 1, v: 1 })), [hsv.h]);

  const emit = (patch, live) => {
    const fn = live ? onLiveChange : onChange;
    if (typeof fn === 'function') fn(patch);
  };

  const setColor = (hex, live) => {
    if (gradient) emit(stop === 1 ? { gradientColor1: hex } : { gradientColor2: hex }, live);
    else emit({ color: hex }, live);
  };

  // Hex field mirrors the color the area is editing.
  useEffect(() => {
    if (open) setDraft(active.slice(1).toUpperCase());
  }, [active, open]);

  // Portal popover: position under the trigger, clamped to the viewport;
  // close on outside press, Esc, resize, or any scroll (the anchor moves).
  const openPicker = () => {
    const r = wrapRef.current?.getBoundingClientRect();
    if (!r) return;
    const W = 276;
    const H = gradient ? 458 : 344;
    const left = Math.max(8, Math.min(r.left, window.innerWidth - W - 8));
    const top = Math.max(8, Math.min(r.bottom + 6, window.innerHeight - H - 8));
    setPos({ left, top });
    setOpen(true);
  };

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => {
      if (wrapRef.current?.contains(e.target)) return;
      const pop = document.getElementById('uui-color-popover');
      if (pop?.contains(e.target)) return;
      setOpen(false);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        setOpen(false);
      }
    };
    const close = () => setOpen(false);
    document.addEventListener('pointerdown', onDown, true);
    document.addEventListener('keydown', onKey, true);
    window.addEventListener('resize', close);
    window.addEventListener('scroll', close, true);
    return () => {
      document.removeEventListener('pointerdown', onDown, true);
      document.removeEventListener('keydown', onKey, true);
      window.removeEventListener('resize', close);
      window.removeEventListener('scroll', close, true);
    };
  }, [open]);

  // --- SV area + hue drags (pointer capture, live/ throttled emission) ---
  const areaPick = (clientX, clientY) => {
    const el = areaRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) return;
    const s = clamp01((clientX - r.left) / r.width);
    const v = 1 - clamp01((clientY - r.top) / r.height);
    setColor(rgbToHex(hsvToRgb({ h: hsv.h, s, v })), true);
  };
  const huePick = (clientX) => {
    const el = hueRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    if (!r.width) return;
    const h = clamp01((clientX - r.left) / r.width) * 360;
    setColor(rgbToHex(hsvToRgb({ h, s: hsv.s || 1, v: hsv.v || 1 })), true);
  };
  const dragHandlers = (pick) => ({
    onPointerDown: (e) => {
      e.preventDefault();
      e.currentTarget.setPointerCapture(e.pointerId);
      pick(e.clientX, e.clientY);
    },
    onPointerMove: (e) => {
      if (e.buttons & 1) pick(e.clientX, e.clientY);
    },
  });

  const commitHex = () => {
    const n = norm(draft);
    if (n) setColor(n, false);
    setDraft((norm(draft) || active).slice(1).toUpperCase());
  };

  const pickScreen = async () => {
    try {
      if (!window.EyeDropper) return;
      const res = await new window.EyeDropper().open();
      const n = norm(res?.sRGBHex);
      if (n) setColor(n, false);
    } catch { /* user cancelled */ }
  };

  const triggerBg = gradient ? `linear-gradient(${angle}deg, ${c1}, ${c2})` : active;

  return (
    <div ref={wrapRef} style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 8 }}>
      <label style={{ fontSize: 10, color: C.faint, fontWeight: 700, flex: 1 }}>{label}</label>
      <button
        type="button"
        title={gradient ? 'Lyric color — gradient (click to edit)' : 'Lyric color — click for the color picker'}
        onClick={() => (open ? setOpen(false) : openPicker())}
        style={{
          width: 58,
          height: 26,
          padding: 0,
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          background: C.input,
          border: `1px solid ${open ? ACCENT : 'var(--ui-border2)'}`,
          borderRadius: 6,
          boxSizing: 'border-box',
        }}
      >
        <span
          style={{
            flex: 1,
            height: 18,
            marginLeft: 3,
            borderRadius: 4,
            background: triggerBg,
            border: '1px solid rgba(255,255,255,0.16)',
          }}
        />
        <ChevronDown size={12} color={C.muted} style={{ marginRight: 4, flexShrink: 0 }} />
      </button>

      {open && pos && createPortal(
        <div
          id="uui-color-popover"
          style={{
            position: 'fixed',
            left: pos.left,
            top: pos.top,
            width: 276,
            zIndex: 7000,
            background: C.panel,
            border: '1px solid var(--ui-border2)',
            borderRadius: 14,
            boxShadow: '0 18px 50px rgba(0,0,0,0.55)',
            padding: 12,
            fontFamily: 'var(--font-sans)',
          }}
        >
          {/* Solid | Gradient — the segmented control IS the gradient toggle */}
          <div style={{ display: 'flex', gap: 3, background: C.elevated2, border: '1px solid var(--ui-border2)', borderRadius: 9, padding: 3, marginBottom: 10 }}>
            {[['solid', 'Solid'], ['gradient', 'Gradient']].map(([k, lbl]) => {
              const on = (k === 'gradient') === !!gradient;
              return (
                <button
                  key={k}
                  type="button"
                  onClick={() => { if (on) return; emit({ gradient: k === 'gradient' }, false); }}
                  style={{ flex: 1, background: on ? ACCENT : 'transparent', color: on ? '#ffffff' : C.muted, border: 'none', borderRadius: 7, padding: '5px 0', fontSize: 11, fontWeight: 700, cursor: on ? 'default' : 'pointer' }}
                >
                  {lbl}
                </button>
              );
            })}
          </div>

          {gradient && (
            <>
              <div style={{ height: 30, borderRadius: 8, border: '1px solid var(--ui-border2)', background: `linear-gradient(${angle}deg, ${c1}, ${c2})`, marginBottom: 8 }} />
              <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
                {[[1, c1], [2, c2]].map(([n, c]) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setStop(n)}
                    title={`Edit stop ${n}`}
                    style={{
                      flex: 1,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      background: stop === n ? 'rgba(139,92,246,0.16)' : C.elevated2,
                      border: `1px solid ${stop === n ? ACCENT : 'var(--ui-border2)'}`,
                      borderRadius: 8,
                      padding: '5px 7px',
                      cursor: 'pointer',
                      color: C.text,
                      fontSize: 10.5,
                      fontWeight: 700,
                    }}
                  >
                    <span style={{ width: 14, height: 14, borderRadius: '50%', background: c, border: '1px solid rgba(255,255,255,0.35)', flexShrink: 0 }} />
                    {`Stop ${n}`}
                  </button>
                ))}
              </div>
            </>
          )}

          {/* saturation / value area */}
          <div
            ref={areaRef}
            {...dragHandlers(areaPick)}
            title="Drag to pick saturation & brightness"
            style={{
              position: 'relative',
              height: 132,
              borderRadius: 10,
              cursor: 'crosshair',
              touchAction: 'none',
              border: '1px solid rgba(255,255,255,0.08)',
              background: `linear-gradient(to top, #000, rgba(0,0,0,0)), linear-gradient(to right, #fff, ${hueHex})`,
            }}
          >
            <div style={{ position: 'absolute', left: `${hsv.s * 100}%`, top: `${(1 - hsv.v) * 100}%`, width: 14, height: 14, marginLeft: -7, marginTop: -7, borderRadius: '50%', background: active, border: '2px solid #ffffff', boxShadow: '0 1px 4px rgba(0,0,0,0.6)', pointerEvents: 'none' }} />
          </div>

          {/* hue slider */}
          <div
            ref={hueRef}
            {...dragHandlers((x) => huePick(x))}
            title="Hue"
            style={{
              position: 'relative',
              height: 14,
              marginTop: 10,
              borderRadius: 999,
              cursor: 'pointer',
              touchAction: 'none',
              border: '1px solid rgba(255,255,255,0.10)',
              background: 'linear-gradient(to right, #ff0000, #ffff00, #00ff00, #00ffff, #0000ff, #ff00ff, #ff0000)',
            }}
          >
            <div style={{ position: 'absolute', left: `${(hsv.h / 360) * 100}%`, top: -1, width: 16, height: 16, marginLeft: -8, borderRadius: '50%', background: hueHex, border: '2px solid #ffffff', boxShadow: '0 1px 4px rgba(0,0,0,0.6)', pointerEvents: 'none' }} />
          </div>

          {/* hex value + format + eyedropper */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 10 }}>
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', background: C.input, border: '1px solid var(--ui-border2)', borderRadius: 8, padding: '0 8px', height: 30 }}>
              <span style={{ color: C.faint, fontSize: 12, fontWeight: 700, marginRight: 2 }}>#</span>
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value.replace(/[^0-9a-fA-F]/g, '').slice(0, 6).toUpperCase())}
                onBlur={commitHex}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); commitHex(); } }}
                spellCheck={false}
                style={{ flex: 1, minWidth: 0, background: 'transparent', border: 'none', outline: 'none', color: C.text, fontSize: 12.5, fontWeight: 700, letterSpacing: 0.6, fontFamily: 'inherit' }}
              />
              <span style={{ color: C.faint, fontSize: 9, fontWeight: 800, letterSpacing: 0.8 }}>HEX</span>
            </div>
            {typeof window !== 'undefined' && window.EyeDropper && (
              <button type="button" title="Pick a color from the screen" onClick={pickScreen} style={{ width: 30, height: 30, background: C.input, border: '1px solid var(--ui-border2)', borderRadius: 8, color: C.muted, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Pipette size={14} />
              </button>
            )}
          </div>

          {gradient && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10 }}>
              <label style={{ fontSize: 10, color: C.faint, fontWeight: 700 }}>Angle</label>
              <input type="range" min="0" max="360" step="5" value={angle} onChange={(e) => emit({ gradientAngle: Number(e.target.value) }, true)} style={{ flex: 1 }} />
              <span style={{ fontSize: 11, color: C.muted, width: 34, textAlign: 'right' }}>{angle}°</span>
            </div>
          )}

          {/* swatch grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(8, 1fr)', gap: 5, marginTop: 10 }}>
            {SWATCHES.flat().map((s) => (
              <button
                key={s}
                type="button"
                title={s}
                onClick={() => setColor(s, false)}
                style={{
                  height: 20,
                  padding: 0,
                  cursor: 'pointer',
                  borderRadius: 5,
                  background: s,
                  border: '1px solid rgba(148,163,184,0.35)',
                  boxShadow: active === s ? `0 0 0 2px ${ACCENT}` : 'none',
                  boxSizing: 'border-box',
                }}
              />
            ))}
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
