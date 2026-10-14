import React, { useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { PenLine, Undo2, Trash2 } from 'lucide-react';
import { stubTap } from '../../lib/anim.js';
import { DRAW_W, DRAW_H, DRAW_COLORS, DRAW_WIDTHS, strokeToPath } from '../../lib/draw.js';
import MiniSlide from './MiniSlide.jsx';

// Draw Mode: highlight the live output from the phone. The current
// projection renders underneath (same miniature as Lyrics) and strokes draw
// on a transparent layer above it in 1280x720 design coordinates — the
// projector stretches the same space edge-to-edge, so a circle around a
// lyric lands where the finger drew it.
//
// Strokes send on finger-up only (no per-move spam); the desktop echoes
// them back in the snapshot, and a newer server stamp wins — which is also
// how a remote Clear All wipes this canvas without a special case.
const rid = () => `p${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;

export default function DrawScreen({ C, ACCENT, state, send }) {
  const live = state?.live || null;
  const deckOnAir = !!(live && live.presentation);
  const outAspect = state?.outputAspect || '16:9';
  const outCssAspect = String(outAspect).toLowerCase() === 'fill' ? '16 / 9' : String(outAspect).replace(':', ' / ');

  const [color, setColor] = useState(DRAW_COLORS[0]);
  const [width, setWidth] = useState(DRAW_WIDTHS[1]);
  const [local, setLocal] = useState([]);
  const localStampRef = useRef(0);
  const drawingRef = useRef(null);
  const boxRef = useRef(null);

  // Server echo reconciliation: newer stamp wins, never while a finger is down.
  const serverDraw = state?.draw || null;
  useEffect(() => {
    if (drawingRef.current) return;
    if (!serverDraw) {
      if (local.length) setLocal([]);
      localStampRef.current = 0;
      return;
    }
    if ((serverDraw.stamp || 0) > localStampRef.current) {
      localStampRef.current = serverDraw.stamp || 0;
      setLocal(Array.isArray(serverDraw.strokes) ? serverDraw.strokes : []);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverDraw?.stamp]);

  const toDesign = (clientX, clientY) => {
    const el = boxRef.current;
    if (!el) return null;
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) return null;
    return [
      Math.min(DRAW_W, Math.max(0, Math.round(((clientX - r.left) / r.width) * DRAW_W))),
      Math.min(DRAW_H, Math.max(0, Math.round(((clientY - r.top) / r.height) * DRAW_H))),
    ];
  };

  const onDown = (e) => {
    const p = toDesign(e.clientX ?? (e.touches && e.touches[0]?.clientX), e.clientY ?? (e.touches && e.touches[0]?.clientY));
    if (!p) return;
    try { e.preventDefault(); } catch {}
    const stroke = { id: rid(), color, width, points: [p] };
    drawingRef.current = stroke;
    setLocal((prev) => [...prev, stroke]);
  };
  const onMove = (e) => {
    const cur = drawingRef.current;
    if (!cur) return;
    const p = toDesign(e.clientX ?? (e.touches && e.touches[0]?.clientX), e.clientY ?? (e.touches && e.touches[0]?.clientY));
    if (!p) return;
    try { e.preventDefault(); } catch {}
    const last = cur.points[cur.points.length - 1];
    if (last && Math.abs(last[0] - p[0]) < 3 && Math.abs(last[1] - p[1]) < 3) return;
    cur.points.push(p);
    if (cur.points.length > 120) cur.points = cur.points.slice(-120);
    setLocal((prev) => prev.map((s) => (s.id === cur.id ? { ...s, points: [...cur.points] } : s)));
  };
  const onUp = () => {
    const cur = drawingRef.current;
    drawingRef.current = null;
    if (!cur || cur.points.length < 2) {
      // Single tap dot: keep it drawable (two identical points = round dot).
      if (cur && cur.points.length === 1) {
        const dot = { ...cur, points: [cur.points[0], cur.points[0]] };
        localStampRef.current = Date.now();
        setLocal((prev) => prev.map((s) => (s.id === cur.id ? dot : s)));
        send('drawAdd', { stroke: dot });
      } else if (cur) {
        setLocal((prev) => prev.filter((s) => s.id !== cur.id));
      }
      return;
    }
    localStampRef.current = Date.now();
    send('drawAdd', { stroke: cur });
  };

  const undo = () => {
    if (!local.length) return;
    localStampRef.current = Date.now();
    setLocal((prev) => prev.slice(0, -1));
    send('drawUndo', {});
  };
  const clear = () => {
    if (!local.length && !serverDraw) return;
    localStampRef.current = Date.now();
    setLocal([]);
    send('drawClear', {});
  };

  const onAir = local.length > 0 || !!serverDraw;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ background: C.elevated, border: `1px solid ${onAir ? 'rgba(139,92,246,0.5)' : C.border2}`, borderRadius: 16, padding: 14, position: 'relative', overflow: 'hidden' }}>
        {onAir && <span style={{ position: 'absolute', left: 0, top: 10, bottom: 10, width: 3, borderRadius: 3, background: '#8b5cf6' }} />}
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 8 }}>
          <PenLine size={13} color={onAir ? '#a78bfa' : C.faint} />
          <span style={{ fontSize: 10, fontWeight: 900, letterSpacing: 1.6, textTransform: 'uppercase', color: C.faint }}>Draw on output</span>
          {onAir && <span style={{ fontSize: 9.5, fontWeight: 900, letterSpacing: 1, color: '#a78bfa', background: 'rgba(139,92,246,0.15)', border: '1px solid rgba(139,92,246,0.4)', padding: '2px 7px', borderRadius: 6 }}>ON WALL</span>}
        </div>

        {/* Live miniature underneath (untouchable here), drawing layer above. */}
        <div ref={boxRef} style={{ position: 'relative', width: '100%', aspectRatio: outCssAspect, borderRadius: 10, overflow: 'hidden', background: '#000', touchAction: 'none' }}>
          <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
            <MiniSlide
              C={C}
              text={live?.text || ''}
              style={live?.style || null}
              timer={live?.timer || null}
              presentation={deckOnAir ? live.presentation : null}
              aspect={outCssAspect}
              aspectBadge={null}
              badge={null}
            />
          </div>
          <svg
            viewBox={`0 0 ${DRAW_W} ${DRAW_H}`}
            preserveAspectRatio="none"
            onPointerDown={onDown}
            onPointerMove={onMove}
            onPointerUp={onUp}
            onPointerCancel={onUp}
            onPointerLeave={onUp}
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', touchAction: 'none', cursor: 'crosshair' }}
          >
            {local.map((s) => (
              <path key={s.id} d={strokeToPath(s.points)} fill="none" stroke={s.color} strokeWidth={s.width} strokeLinecap="round" strokeLinejoin="round" />
            ))}
          </svg>
        </div>
        <div style={{ fontSize: 11, color: C.faint, marginTop: 8, lineHeight: 1.5 }}>
          {live ? 'Draw over what the room sees — strokes appear on the projector instantly.' : 'Nothing on air yet — strokes wait here and show when a slide fires.'}
        </div>

        {/* Pens */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 10 }}>
          {DRAW_COLORS.map((c) => (
            <button key={c} onClick={() => setColor(c)} title={c} style={{ width: 30, height: 30, borderRadius: '50%', background: c, border: color === c ? '3px solid #fff' : '2px solid rgba(255,255,255,0.25)', cursor: 'pointer', flexShrink: 0, boxShadow: color === c ? '0 0 10px rgba(255,255,255,0.35)' : 'none' }} />
          ))}
          <span style={{ width: 8 }} />
          {DRAW_WIDTHS.map((wd) => (
            <button key={wd} onClick={() => setWidth(wd)} title={`${wd}px`} style={{ width: 34, height: 34, borderRadius: 9, background: width === wd ? ACCENT : C.elevated2, border: `1px solid ${width === wd ? ACCENT : C.border2}`, color: width === wd ? '#fff' : C.muted, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'inherit' }}>
              <span style={{ width: wd, height: wd, borderRadius: '50%', background: 'currentColor' }} />
            </button>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 7, marginTop: 8 }}>
          <motion.button {...stubTap} onClick={undo} disabled={!local.length} style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, background: C.elevated2, border: `1px solid ${C.border2}`, color: local.length ? C.text : C.faint2, borderRadius: 10, padding: '11px 0', fontSize: 13, fontWeight: 800, cursor: local.length ? 'pointer' : 'default', fontFamily: 'inherit', opacity: local.length ? 1 : 0.5 }}>
            <Undo2 size={15} /> Undo
          </motion.button>
          <motion.button {...stubTap} onClick={clear} disabled={!onAir} style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, background: 'rgba(239,68,68,0.10)', border: '1px solid rgba(239,68,68,0.45)', color: '#f87171', borderRadius: 10, padding: '11px 0', fontSize: 13, fontWeight: 800, cursor: onAir ? 'pointer' : 'default', fontFamily: 'inherit', opacity: onAir ? 1 : 0.5 }}>
            <Trash2 size={15} /> Clear all
          </motion.button>
        </div>
      </div>
    </div>
  );
}
