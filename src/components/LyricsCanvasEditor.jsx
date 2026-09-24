import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Stage, Layer, Group, Rect, Transformer } from 'react-konva';
import { renderLyricsLayout, computeLyricsFontSize, lyricsLayoutMetrics, FONT_SIZE_MIN, FONT_SIZE_MAX } from '../lib/lyrics';
import { transitionAnimation } from '../lib/constants';

const CANVAS_W = 1280;
const CANVAS_H = 720;
const ACCENT = '#00aaff';
const MIN_W = 80;
const MIN_H = 48;
// Keep at least this many logical px of the box on-canvas while dragging, so a
// box can never be lost off-screen — but it stays effectively free-moving.
const KEEP_IN = 80;

const DEFAULT_BOX = { x: 80, y: 100, w: 1120, h: 480 };

/**
 * WYSIWYG lyric-box editor.
 *
 * Layer stack (bottom -> top):
 *   z0 background (colour / image / video)
 *   z1 the ACTUAL lyrics, rendered by renderLyricsLayout — the exact same
 *      function the projector and live monitor use, so what you see here is
 *      literally what goes to output
 *   z2 a transparent Konva stage holding an invisible hit-rect + <Transformer>
 *      (drag / 8 resize handles / rotate) — interaction only, draws nothing
 *   z3 a real <textarea> overlay, shown only while typing
 *   z4 mode badges + the "Edit text" chip
 *
 * Text entry is a native textarea, so keystrokes can never be swallowed, and
 * geometry lives in React state so the box simply stays where you drop it.
 */
export default function LyricsCanvasEditor({
  text = '',
  fontFamily = '"CMG Sans", system-ui, sans-serif',
  fontSize = 110,
  fontColor = '#ffffff',
  textAlign = 'center',
  lineHeight = 1.05,
  letterSpacing = 0,
  strokeColor = '#000000',
  strokeWidth = 1.5,
  shadowColor = '#000000',
  shadowBlur = 14,
  shadowOffsetX = 0,
  shadowOffsetY = 4,
  gradient = false,
  gradientColor1 = '#f5f5f4',
  gradientColor2 = '#93c5fd',
  gradientAngle = 180,
  box: boxProp = DEFAULT_BOX,
  bgType = 'color',
  bgValue = '#000000',
  onTextChange,
  onBoxChange,
  onSizeChange,
  cueLocked = false,
  highlight = false,
  hlOpacity = 40,
  caseMode = 'none',
  bold = true,
  italic = false,
  underline = false,
  strike = false,
  valign = 'middle',
  pad = 10,
  fill = false,
  fillMax = 165,
  fillMin = 18,
  layoutMode = 'static',
  tickerSpeed = 18,
  tickerDir = 'ltr',
  resizeMode = 'fit',
  previewAnim = null,
  previewTick = 0,
  previewSpeed = 0.5,
}) {
  const box = boxProp || DEFAULT_BOX;
  const angle = box.angle || 0;

  const wrapRef = useRef(null);
  const displayBoxRef = useRef(null);
  const editBoxRef = useRef(null);
  const taRef = useRef(null);
  const groupRef = useRef(null);
  const trRef = useRef(null);
  const committedRef = useRef(box);
  const startBoxRef = useRef(box);
  // Latched while a drag/transform is running: mid-gesture React re-renders
  // must not write stale box geometry back over the live gesture.
  const gestureRef = useRef(false);

  const [scale, setScale] = useState(1);
  const [editing, setEditing] = useState(false);
  const [trNode, setTrNode] = useState(null);

  committedRef.current = box;

  const previewing = !!previewAnim && previewAnim !== 'none';

  const lyricSt = {
    font: fontFamily,
    size: fontSize,
    lineHeight,
    align: textAlign,
    color: fontColor,
    caseMode,
    bold: bold !== false,
    italic,
    underline,
    strike,
    letterSpacing,
    valign,
    pad,
    shadow: shadowBlur > 0,
    shadowColor,
    shadowBlur,
    shadowOffsetX,
    shadowOffsetY,
    outline: strokeWidth > 0,
    strokeColor,
    strokeWidth,
    gradient,
    gradientColor1,
    gradientColor2,
    gradientAngle,
    highlight,
    hlOpacity,
    fill,
    fillMax,
    fillMin,
    layoutMode,
    tickerSpeed,
    tickerDir,
  };

  // ---- canvas <-> viewport scale -----------------------------------------
  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return undefined;
    const apply = () => {
      const w = el.clientWidth;
      if (!w) return;
      const s = w / CANVAS_W;
      setScale((prev) => (Math.abs(prev - s) < 0.0002 ? prev : s));
    };
    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // ---- geometry: React is the source of truth ----------------------------
  const applyBoxToDom = useCallback((b) => {
    const next = {
      left: `${b.x}px`,
      top: `${b.y}px`,
      width: `${b.w}px`,
      height: `${b.h}px`,
      transform: b.angle ? `rotate(${b.angle}deg)` : 'none',
    };
    if (displayBoxRef.current) Object.assign(displayBoxRef.current.style, next);
    if (editBoxRef.current) Object.assign(editBoxRef.current.style, next);
  }, []);

  // Runs after every commit so imperative gesture writes can never go stale
  // against the props (React skips a style write when its own diff sees no
  // change, which would otherwise leave the DOM parked at a dropped position).
  useLayoutEffect(() => {
    if (!gestureRef.current) applyBoxToDom(box);
  });

  const trNodes = useMemo(() => (trNode ? [trNode] : []), [trNode]);

  // Callback ref so the Transformer gets the Group node however react-konva
  // schedules child mounting (its children mount inside a layout effect).
  const attachGroup = useCallback((node) => {
    groupRef.current = node;
    setTrNode((prev) => (prev === node ? prev : node));
  }, []);

  // Handles render at a constant size on screen no matter the canvas zoom.
  const uiScale = Math.max(scale, 0.05);
  const anchorSize = Math.max(6, Math.round(11 / uiScale));
  const borderWidth = Math.max(1, 2 / uiScale);

  const boundBox = useCallback((oldBox, newBox) => {
    if (newBox.width < MIN_W || newBox.height < MIN_H) return oldBox;
    if (newBox.x + newBox.width < MIN_W) return oldBox;
    if (newBox.y + newBox.height < MIN_H) return oldBox;
    if (newBox.x > CANVAS_W - MIN_W) return oldBox;
    if (newBox.y > CANVAS_H - MIN_H) return oldBox;
    return newBox;
  }, []);

  const dragBound = useCallback((pos) => {
    const s = startBoxRef.current;
    const halfW = s.w / 2;
    const halfH = s.h / 2;
    const minX = KEEP_IN - halfW;
    const maxX = CANVAS_W - KEEP_IN + halfW;
    const minY = KEEP_IN - halfH;
    const maxY = CANVAS_H - KEEP_IN + halfH;
    return {
      x: Math.min(maxX, Math.max(minX, pos.x)),
      y: Math.min(maxY, Math.max(minY, pos.y)),
    };
  }, []);

  // Reconstructs the logical box from the node's current transform. Used live
  // during a gesture (to move the DOM lyrics under the cursor) and on end (to
  // commit). Does NOT mutate the node — scaling stays intact until commit.
  const boxFromNode = useCallback(() => {
    const g = groupRef.current;
    const s = startBoxRef.current;
    if (!g) return s;
    const w = Math.max(MIN_W, Math.round(s.w * g.scaleX()));
    const h = Math.max(MIN_H, Math.round(s.h * g.scaleY()));
    const cx = g.x();
    const cy = g.y();
    return {
      x: Math.round(cx - w / 2),
      y: Math.round(cy - h / 2),
      w,
      h,
      angle: Math.round((g.rotation() || 0) * 10) / 10,
    };
  }, []);

  const emitBox = useCallback((b) => {
    applyBoxToDom(b);
    onBoxChange?.(b);
  }, [applyBoxToDom, onBoxChange]);

  const handleDragStart = () => {
    startBoxRef.current = committedRef.current;
    gestureRef.current = true;
  };

  const handleDragMove = () => {
    const g = groupRef.current;
    const s = startBoxRef.current;
    if (!g) return;
    applyBoxToDom({
      x: Math.round(g.x() - s.w / 2),
      y: Math.round(g.y() - s.h / 2),
      w: s.w,
      h: s.h,
      angle: Math.round((g.rotation() || 0) * 10) / 10,
    });
  };

  const handleDragEnd = () => {
    gestureRef.current = false;
    const g = groupRef.current;
    const s = startBoxRef.current;
    if (!g) return;
    emitBox({
      x: Math.round(g.x() - s.w / 2),
      y: Math.round(g.y() - s.h / 2),
      w: s.w,
      h: s.h,
      angle: Math.round((g.rotation() || 0) * 10) / 10,
    });
  };

  const handleTransformStart = () => {
    startBoxRef.current = committedRef.current;
    gestureRef.current = true;
  };

  const handleTransform = () => {
    applyBoxToDom(boxFromNode());
  };

  const handleTransformEnd = () => {
    gestureRef.current = false;
    const g = groupRef.current;
    if (!g) return;
    const next = boxFromNode();
    const sy = g.scaleY();

    // Collapse the scale back into the box/font before React re-renders, so
    // the node and the incoming props describe the same geometry (no jump).
    g.scaleX(1);
    g.scaleY(1);
    g.offset({ x: next.w / 2, y: next.h / 2 });
    g.position({ x: next.x + next.w / 2, y: next.y + next.h / 2 });

    emitBox(next);

    // "Scale text" mode: dragging a handle writes the font size directly.
    // Fit/Fill leave the size alone — the shared auto-fit recomputes it.
    if (resizeMode === 'scale') {
      const nextSize = Math.round(Math.max(FONT_SIZE_MIN, Math.min(FONT_SIZE_MAX, fontSize * sy)));
      if (nextSize !== fontSize) onSizeChange?.(nextSize);
    }
  };

  // ---- text editing -------------------------------------------------------
  const startEdit = useCallback(() => setEditing(true), []);
  const endEdit = useCallback(() => setEditing(false), []);

  const syncTaHeight = useCallback(() => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = `${ta.scrollHeight}px`;
  }, []);

  useEffect(() => {
    if (!editing) return;
    const ta = taRef.current;
    if (!ta) return;
    try { ta.focus({ preventScroll: true }); } catch (_) { ta.focus(); }
    const n = ta.value.length;
    try { ta.setSelectionRange(n, n); } catch (_) { /* noop */ }
  }, [editing]);

  useLayoutEffect(() => {
    if (editing) syncTaHeight();
  });

  // ---- shared sizing ------------------------------------------------------
  const { pad: layoutPad } = useMemo(() => lyricsLayoutMetrics(lyricSt, box), [lyricSt, box]);
  const taSize = useMemo(() => computeLyricsFontSize(text, lyricSt, box), [text, lyricSt, box]);

  const deco = [underline ? 'underline' : null, strike ? 'line-through' : null].filter(Boolean).join(' ') || 'none';
  // Mirror renderLyricsLayout's own gate: shadow is only real when it is
  // switched on (shadowBlur > 0) AND actually displaces or blurs something.
  const shadowOn = !!lyricSt.shadow && ((Number(shadowBlur) || 0) > 0 || (Number(shadowOffsetX) || 0) !== 0 || (Number(shadowOffsetY) || 0) !== 0);
  const animCSS = previewing ? transitionAnimation(previewAnim, previewSpeed) : '';

  const boxTransform = angle ? `rotate(${angle}deg)` : 'none';

  const pillTop = box.y >= 34 ? box.y - 26 : box.y + box.h + 4;

  return (
    <div ref={wrapRef} style={{ width: '100%', aspectRatio: '16 / 9', position: 'relative', overflow: 'hidden', borderRadius: 12, boxShadow: '0 12px 44px rgba(0,0,0,0.45)', border: '1px solid #2d2d3f' }}>
      {/* z0 — background layer */}
      {bgType === 'color' && (
        <div style={{ position: 'absolute', inset: 0, backgroundColor: bgValue || '#000000', zIndex: 0 }} />
      )}
      {bgType === 'image' && bgValue && (
        <img src={bgValue} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', zIndex: 0 }} draggable={false} />
      )}
      {bgType === 'video' && bgValue && (
        <video key={`bg-${bgValue}`} src={bgValue} autoPlay loop muted playsInline preload="metadata" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', zIndex: 0 }} />
      )}

      {/* z1 — the real lyrics, same renderer as the projector */}
      <div style={{ position: 'absolute', left: 0, top: 0, width: CANVAS_W, height: CANVAS_H, zIndex: 1, pointerEvents: 'none', transformOrigin: 'top left', transform: `scale(${scale})` }}>
        <div key={previewing ? `${previewAnim}-${previewTick}` : 'lyrics'} style={{ width: '100%', height: '100%', position: 'relative', animation: previewing ? animCSS : undefined }}>
          <div
            ref={displayBoxRef}
            style={{ position: 'absolute', left: box.x, top: box.y, width: box.w, height: box.h, transform: boxTransform, transformOrigin: 'center center', overflow: 'hidden' }}
          >
            {editing ? null : renderLyricsLayout(text, lyricSt, box)}
          </div>
        </div>
      </div>

      {/* z2 — Konva interaction layer (transparent) */}
      <Stage
        width={CANVAS_W}
        height={CANVAS_H}
        style={{ position: 'absolute', left: 0, top: 0, width: CANVAS_W, height: CANVAS_H, zIndex: 2, transformOrigin: 'top left', transform: `scale(${scale})` }}
      >
        <Layer>
          <Group
            ref={attachGroup}
            x={box.x + box.w / 2}
            y={box.y + box.h / 2}
            offsetX={box.w / 2}
            offsetY={box.h / 2}
            rotation={angle}
            draggable={!cueLocked}
            dragBoundFunc={dragBound}
            onDragStart={handleDragStart}
            onDragMove={handleDragMove}
            onDragEnd={handleDragEnd}
            onTransformStart={handleTransformStart}
            onTransform={handleTransform}
            onTransformEnd={handleTransformEnd}
            onDblClick={startEdit}
            onDblTap={startEdit}
          >
            {/* Invisible on the scene canvas, opaque colourKey on the hit
                canvas — this is what makes the whole box grabbable. */}
            <Rect width={box.w} height={box.h} fill="rgba(0,0,0,0.001)" />
          </Group>
          <Transformer
            ref={trRef}
            nodes={trNodes}
            visible={!cueLocked && !editing}
            rotateEnabled
            flipEnabled={false}
            keepRatio={false}
            borderEnabled
            borderStroke={ACCENT}
            borderWidth={borderWidth}
            anchorSize={anchorSize}
            anchorCornerRadius={0}
            anchorStroke="#0b3d5c"
            anchorFillColor={ACCENT}
            rotateAnchorOffset={Math.max(14, Math.round(26 / uiScale))}
            padding={4 / uiScale}
            boundBoxFunc={boundBox}
          />
        </Layer>
      </Stage>

      {/* z3 — native textarea, only while typing */}
      {editing && (
        <div style={{ position: 'absolute', left: 0, top: 0, width: CANVAS_W, height: CANVAS_H, zIndex: 3, pointerEvents: 'none', transformOrigin: 'top left', transform: `scale(${scale})` }}>
          <div
            ref={editBoxRef}
            style={{ position: 'absolute', left: box.x, top: box.y, width: box.w, height: box.h, transform: boxTransform, transformOrigin: 'center center', pointerEvents: 'auto' }}
          >
            <div style={{
              width: '100%',
              height: '100%',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: valign === 'top' ? 'flex-start' : valign === 'bottom' ? 'flex-end' : 'center',
              textAlign: textAlign || 'center',
              padding: layoutPad,
              boxSizing: 'border-box',
              overflow: 'hidden',
            }}>
              <textarea
                ref={taRef}
                value={text}
                onChange={(e) => onTextChange?.(e.target.value)}
                onBlur={endEdit}
                onInput={syncTaHeight}
                onKeyDown={(e) => {
                  // Only Escape is swallowed locally: leaving the modal open is
                  // the whole point of "click away to commit".
                  if (e.key === 'Escape') {
                    e.preventDefault();
                    e.stopPropagation();
                    endEdit();
                  }
                }}
                placeholder="Type your lyrics…"
                spellCheck={false}
                rows={1}
                style={{
                  display: 'block',
                  width: '100%',
                  flexShrink: 0,
                  margin: 0,
                  border: 'none',
                  outline: 'none',
                  resize: 'none',
                  overflow: 'hidden',
                  boxSizing: 'border-box',
                  padding: highlight ? '3px 12px' : 0,
                  borderRadius: 8,
                  background: highlight ? `rgba(70,45,15,${(hlOpacity ?? 40) / 100})` : 'transparent',
                  boxShadow: '0 0 0 1px rgba(0,170,255,0.55)',
                  fontFamily: fontFamily,
                  fontSize: taSize,
                  fontWeight: bold !== false ? 700 : 400,
                  fontStyle: italic ? 'italic' : 'normal',
                  textDecoration: deco,
                  // Display-only transform so the textbox shows the same case
                  // as the canvas preview; the stored text stays as typed.
                  textTransform: caseMode === 'upper' ? 'uppercase' : caseMode === 'title' ? 'capitalize' : 'none',
                  letterSpacing: letterSpacing ? `${letterSpacing}px` : undefined,
                  lineHeight: lineHeight || 1.05,
                  textAlign: textAlign || 'center',
                  color: gradient ? (gradientColor1 || '#f5f5f4') : (fontColor || '#f5f5f4'),
                  caretColor: fontColor || '#ffffff',
                  WebkitTextStroke: strokeWidth > 0 ? `${strokeWidth}px ${strokeColor || '#000000'}` : undefined,
                  textShadow: shadowOn ? `${Number(shadowOffsetX) || 0}px ${Number(shadowOffsetY) || 0}px ${Number(shadowBlur) || 0}px ${shadowColor || '#000000'}` : 'none',
                  whiteSpace: 'pre-wrap',
                  overflowWrap: 'break-word',
                  wordBreak: 'break-word',
                  cursor: 'text',
                }}
              />
            </div>
          </div>
        </div>
      )}

      {/* z4 — mode badges + edit affordance */}
      {(fill || layoutMode === 'ticker' || resizeMode === 'scale') && (
        <div style={{ position: 'absolute', top: 8, left: 8, zIndex: 4, display: 'flex', gap: 6, pointerEvents: 'none' }}>
          {fill && <span style={badgeStyle.green}>FILL</span>}
          {layoutMode === 'ticker' && <span style={badgeStyle.cyan}>TICKER</span>}
          {resizeMode === 'scale' && <span style={badgeStyle.amber}>SCALE TEXT</span>}
        </div>
      )}
      {!editing && (
        // Own scaled layer: box.x/box.y are logical 1280x720 units, so the chip
        // has to live under the same transform as the box it labels. It sits
        // above the Konva layer so the click reaches the button, not the drag.
        <div style={{ position: 'absolute', left: 0, top: 0, width: CANVAS_W, height: CANVAS_H, zIndex: 5, pointerEvents: 'none', transformOrigin: 'top left', transform: `scale(${scale})` }}>
          <div style={{ position: 'absolute', left: box.x, top: Math.max(2, pillTop) }}>
            <button
              onClick={startEdit}
              style={{ pointerEvents: 'auto', background: 'rgba(5,10,20,0.82)', border: `1px solid ${ACCENT}`, color: '#93c5fd', borderRadius: 999, padding: '2px 9px', fontSize: 10, fontWeight: 800, letterSpacing: 0.4, cursor: 'pointer', whiteSpace: 'nowrap', lineHeight: 1.5, boxShadow: '0 2px 8px rgba(0,0,0,0.5)' }}
            >
              &#9998; Edit text
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

const badgeStyle = {
  green: { fontSize: 9, fontWeight: 800, letterSpacing: 1, padding: '3px 8px', borderRadius: 999, background: 'rgba(34,197,94,0.16)', color: '#4ade80', border: '1px solid rgba(34,197,94,0.45)' },
  cyan: { fontSize: 9, fontWeight: 800, letterSpacing: 1, padding: '3px 8px', borderRadius: 999, background: 'rgba(0,170,255,0.16)', color: '#93c5fd', border: '1px solid rgba(0,170,255,0.45)' },
  amber: { fontSize: 9, fontWeight: 800, letterSpacing: 1, padding: '3px 8px', borderRadius: 999, background: 'rgba(245,158,11,0.16)', color: '#fcd34d', border: '1px solid rgba(245,158,11,0.45)' },
};
